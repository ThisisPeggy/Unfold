import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import {
  addSupabaseConfigToUrl,
  fetchSupabaseWithTimeout,
  normalizeSupabaseConfig,
  pullPublicScene,
  pullSupabaseWorkspace,
  pullSupabaseWorkspaceUpdatedAt,
  pushPublicScene,
  readSupabaseConfig,
  readSupabaseSession,
  refreshSupabaseSession,
  signInSupabase,
  signUpSupabase,
  syncSupabaseWorkspace,
  supabaseConfigFromHash,
  writeSupabaseConfig,
  writeSupabaseSession,
} from "../src/supabase-sync.js";

const SUPABASE_SETUP_SQL = await readFile(
  new URL("../supabase/setup.sql", import.meta.url),
  "utf8",
);

const config = {
  url: "https://example.supabase.co",
  key: "sb_publishable_example",
};
const authResponse = {
  access_token: "access",
  refresh_token: "refresh",
  expires_at: 2000000000,
  user: { id: "12345678-1234-4123-8123-123456789abc", email: "me@example.com" },
};
const session = {
  accessToken: "access",
  refreshToken: "refresh",
  expiresAt: 2000000000000,
  user: { id: authResponse.user.id, email: authResponse.user.email },
};

const memoryStorage = () => {
  const values = new Map();
  return {
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, value),
  };
};

test("accepts browser-safe Supabase settings and rejects secret keys", () => {
  assert.deepEqual(normalizeSupabaseConfig({
    url: " https://example.supabase.co/path ",
    key: " sb_publishable_example ",
  }), config);
  assert.throws(() => normalizeSupabaseConfig({
    url: config.url,
    key: "sb_secret_example",
  }), /Publishable Key/);
  assert.match(SUPABASE_SETUP_SQL, /enable row level security/);
  assert.match(SUPABASE_SETUP_SQL, /auth\.uid\(\)/);
  assert.match(SUPABASE_SETUP_SQL, /to authenticated/);
  assert.match(SUPABASE_SETUP_SQL, /storage\.buckets/);
  assert.match(SUPABASE_SETUP_SQL, /unfold_public_scene/);
  assert.match(SUPABASE_SETUP_SQL, /to anon/);
  assert.match(SUPABASE_SETUP_SQL, /alter role authenticated set statement_timeout = '30s'/);
  assert.match(SUPABASE_SETUP_SQL, /notify pgrst, 'reload config'/);
});

test("stores a personal Supabase config and binds its session to that project", () => {
  const storage = memoryStorage();
  assert.equal(writeSupabaseConfig(storage, config), true);
  assert.deepEqual(readSupabaseConfig(storage), config);
  assert.equal(writeSupabaseSession(storage, session, config), true);
  assert.deepEqual(readSupabaseSession(storage, config), {
    ...session,
    projectUrl: config.url,
  });
  assert.equal(readSupabaseSession(storage, {
    ...config,
    url: "https://another.supabase.co",
  }), null);
});

test("puts the personal Supabase config in public share links", () => {
  const url = addSupabaseConfigToUrl(new URL("https://unfold.example/s/my-work"), config);
  assert.deepEqual(supabaseConfigFromHash(url.hash), config);
  assert.equal(url.pathname, "/s/my-work");
});

test("times out a stalled Supabase request and aborts it", async () => {
  let signal;
  await assert.rejects(
    fetchSupabaseWithTimeout((_url, options) => {
      signal = options.signal;
      return new Promise(() => {});
    }, `${config.url}/auth/v1/token`, {}, 5),
    /连接 Supabase 超时/,
  );
  assert.equal(signal.aborted, true);
});

test("publishes a scene for anonymous one-time reads", async () => {
  const scene = {
    elements: [{ id: "hello" }],
    appState: {},
    files: { image: { mimeType: "text/plain", dataURL: "data:text/plain;base64,aGk=" } },
  };
  const calls = [];
  let cloudPayload;
  const fetcher = async (url, options) => {
    calls.push({ url, options });
    if (url.startsWith("data:")) return fetch(url);
    if (url.includes("/storage/v1/object/public/")) {
      return new Response("hi", { status: 200, headers: { "Content-Type": "text/plain" } });
    }
    if (url.includes("/storage/v1/object/")) return new Response(null, { status: 200 });
    if (options.method === "POST") {
      cloudPayload = JSON.parse(options.body).payload;
      return new Response(null, { status: 201 });
    }
    return new Response(JSON.stringify([{ payload: cloudPayload }]), { status: 200 });
  };
  await pushPublicScene(config, session, authResponse.user.id, scene, fetcher);
  const restored = await pullPublicScene(config, authResponse.user.id, fetcher);
  assert.deepEqual(restored.elements, scene.elements);
  assert.equal(restored.files.image.dataURL, scene.files.image.dataURL);
  assert.equal(cloudPayload.files.image.dataURL, undefined);
  assert.match(cloudPayload.files.image.storagePath, /123456789abc\/.*\/image$/);
  assert.match(calls.find(({ url }) => url.includes("/object/public/")).url, /unfold-public-images/);
  const databaseWrite = calls.find(({ url, options }) => url.includes("/rest/v1/") && options.method === "POST");
  assert.equal(databaseWrite.options.headers.Authorization, "Bearer access");
});

test("stores images in a private bucket instead of workspace JSON", async () => {
  const workId = "11111111-1111-4111-8111-111111111111";
  const payload = {
    version: 1,
    updatedAt: 123,
    activeWorkId: workId,
    works: [{ id: workId, name: "Image", updatedAt: 123 }],
    scenes: {
      [workId]: {
        elements: [],
        appState: {},
        files: {
          image: { mimeType: "text/plain", dataURL: "data:text/plain;base64,aGk=" },
        },
      },
    },
    deletedWorks: {},
  };
  let cloudPayload;
  const uploadFetcher = async (url, options = {}) => {
    if (url.startsWith("data:")) return fetch(url);
    if (url.includes("/storage/v1/object/")) return new Response(null, { status: 200 });
    if (!options.method) return new Response("[]", { status: 200 });
    cloudPayload = JSON.parse(options.body).payload;
    return new Response("[{}]", { status: 201 });
  };
  await syncSupabaseWorkspace(config, session, payload, { fetcher: uploadFetcher });
  assert.equal(cloudPayload.scenes[workId].files.image.dataURL, undefined);
  assert.equal(
    cloudPayload.scenes[workId].files.image.storagePath,
    `${session.user.id}/image`,
  );

  const downloadFetcher = async (url) => url.includes("/rest/v1/")
    ? new Response(JSON.stringify([{ payload: cloudPayload, updated_at: new Date().toISOString() }]), { status: 200 })
    : new Response("hi", { status: 200, headers: { "Content-Type": "text/plain" } });
  const restored = await pullSupabaseWorkspace(config, session, downloadFetcher);
  assert.equal(restored.scenes[workId].files.image.dataURL, "data:text/plain;base64,aGk=");
});

test("syncs the work library even when private image storage is unavailable", async () => {
  const workId = "22222222-2222-4222-8222-222222222222";
  const payload = {
    version: 1,
    updatedAt: 123,
    activeWorkId: workId,
    works: [{ id: workId, name: "Still synced", updatedAt: 123 }],
    scenes: {
      [workId]: {
        elements: [{ id: "fallback-image" }],
        appState: {},
        files: { fallbackImage: { mimeType: "text/plain", dataURL: "data:text/plain;base64,aGk=" } },
      },
    },
    deletedWorks: {},
  };
  let cloudPayload;
  const uploadFetcher = async (url, options = {}) => {
    if (url.startsWith("data:")) return fetch(url);
    if (url.includes("/storage/v1/object/")) return new Response(null, { status: 403 });
    if (!options.method) return new Response("[]", { status: 200 });
    cloudPayload = JSON.parse(options.body).payload;
    return new Response("[{}]", { status: 201 });
  };
  await syncSupabaseWorkspace(config, session, payload, { fetcher: uploadFetcher });
  assert.equal(cloudPayload.works.length, 1);
  assert.equal(cloudPayload.scenes[workId].files.fallbackImage.dataURL, "data:text/plain;base64,aGk=");

  cloudPayload.scenes[workId].files.fallbackImage = { mimeType: "text/plain", storagePath: "missing" };
  const restored = await pullSupabaseWorkspace(config, session, async (url) =>
    url.includes("/rest/v1/")
      ? new Response(JSON.stringify([{ payload: cloudPayload, updated_at: new Date().toISOString() }]), { status: 200 })
      : new Response(null, { status: 404 }));
  assert.equal(restored.works[0].name, "Still synced");
  assert.equal(restored.scenes[workId].files.fallbackImage.storagePath, "missing");
});

test("signs in, signs up, and refreshes through Supabase Auth", async () => {
  const calls = [];
  const fetcher = async (url, options) => {
    calls.push({ url, options });
    return new Response(JSON.stringify(authResponse), { status: 200 });
  };
  assert.deepEqual(await signInSupabase(config, " me@example.com ", "password", fetcher), session);
  assert.deepEqual(await signUpSupabase(config, "me@example.com", "password", fetcher), {
    session,
    email: "me@example.com",
  });
  assert.deepEqual(await refreshSupabaseSession(config, session, fetcher), session);
  assert.match(calls[0].url, /token\?grant_type=password/);
  assert.match(calls[1].url, /signup/);
  assert.match(calls[2].url, /token\?grant_type=refresh_token/);
});

test("pulls the signed-in user's workspace", async () => {
  const payload = { version: 1, updatedAt: 123, scenes: {} };
  let call;
  const fetcher = async (url, options) => {
    call = { url, options };
    return new Response(JSON.stringify([{ payload }]), { status: 200 });
  };
  assert.deepEqual(await pullSupabaseWorkspace(config, session, fetcher), payload);
  assert.match(call.url, /select=payload/);
  assert.match(call.url, new RegExp(`user_id=eq\\.${session.user.id}`));
  assert.match(call.url, /limit=1/);
  assert.equal(call.options.headers.apikey, config.key);
  assert.equal(call.options.headers.Authorization, "Bearer access");
});

test("turns a Postgres statement timeout into setup guidance", async () => {
  await assert.rejects(
    pullSupabaseWorkspace(config, session, async () => new Response(JSON.stringify({
      code: "57014",
      message: "canceling statement due to statement timeout",
    }), { status: 500 })),
    /重新运行最新版初始化 SQL/,
  );
});

test("syncs more than ten works to a personal Supabase project", async () => {
  const payload = {
    version: 1,
    updatedAt: 123,
    works: Array.from({ length: 25 }, (_, index) => ({ id: `${index}` })),
    scenes: {},
  };
  let uploaded = false;
  await syncSupabaseWorkspace(config, session, payload, { fetcher: async (_url, options = {}) => {
    if (!options.method) return new Response("[]", { status: 200 });
    uploaded = true;
    return new Response("[{}]", { status: 201 });
  } });
  assert.equal(uploaded, true);
});

test("retries a concurrent browser write and preserves both browsers' latest works", async () => {
  const firstId = "11111111-1111-4111-8111-111111111111";
  const secondId = "22222222-2222-4222-8222-222222222222";
  const scene = (id) => ({ elements: [{ id }], appState: {}, files: {} });
  const snapshot = (works, scenes, updatedAt) => ({
    version: 1,
    updatedAt,
    activeWorkId: works[0].id,
    works,
    scenes,
    deletedWorks: {},
  });
  const local = snapshot(
    [
      { id: firstId, name: "Local", updatedAt: 2 },
      { id: secondId, name: "Local only", updatedAt: 2 },
    ],
    { [firstId]: scene("local"), [secondId]: scene("local-only") },
    2,
  );
  let record = {
    payload: snapshot(
      [{ id: firstId, name: "Old", updatedAt: 1 }],
      { [firstId]: scene("old") },
      1,
    ),
    updated_at: "2026-01-01T00:00:00.000Z",
  };
  let writes = 0;
  const fetcher = async (_url, options = {}) => {
    if (options.method !== "PATCH") return new Response(JSON.stringify([record]), { status: 200 });
    writes += 1;
    if (writes === 1) {
      record = {
        payload: snapshot(
          [{ id: firstId, name: "Remote", updatedAt: 3 }],
          { [firstId]: scene("remote") },
          3,
        ),
        updated_at: "2026-01-01T00:00:01.000Z",
      };
      return new Response("[]", { status: 200 });
    }
    const body = JSON.parse(options.body);
    record = { payload: body.payload, updated_at: body.updated_at };
    return new Response(JSON.stringify([record]), { status: 200 });
  };

  const result = await syncSupabaseWorkspace(config, session, local, { fetcher });
  assert.equal(writes, 2);
  assert.deepEqual(result.workspace.works.map(({ name }) => name), ["Remote", "Local only"]);
  assert.equal(result.workspace.scenes[firstId].elements[0].id, "remote");
  assert.equal(await pullSupabaseWorkspaceUpdatedAt(config, session, fetcher), result.cloudUpdatedAt);
});

test("keeps the active work device-local instead of making browsers overwrite each other", async () => {
  const firstId = "11111111-1111-4111-8111-111111111111";
  const secondId = "22222222-2222-4222-8222-222222222222";
  const works = [
    { id: firstId, name: "First", updatedAt: 1 },
    { id: secondId, name: "Second", updatedAt: 1 },
  ];
  const scenes = Object.fromEntries(works.map(({ id }) => [
    id,
    { elements: [], appState: {}, files: {} },
  ]));
  const cloud = {
    version: 1,
    updatedAt: 1,
    activeWorkId: firstId,
    works,
    scenes,
    deletedWorks: {},
  };
  let writes = 0;
  const result = await syncSupabaseWorkspace(
    config,
    session,
    { ...cloud, activeWorkId: secondId },
    { fetcher: async (_url, options = {}) => {
      if (options.method) writes += 1;
      return new Response(JSON.stringify([{ payload: cloud, updated_at: "2026-01-01T00:00:00Z" }]), {
        status: 200,
      });
    } },
  );
  assert.equal(writes, 0);
  assert.equal(result.workspace.activeWorkId, firstId);
});
