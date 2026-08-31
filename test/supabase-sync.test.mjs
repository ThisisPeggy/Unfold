import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import {
  normalizeSupabaseConfig,
  pullPublicScene,
  pullSupabaseWorkspace,
  pushPublicScene,
  pushSupabaseWorkspace,
  refreshSupabaseSession,
  signInSupabase,
  signUpSupabase,
  supabaseConfigFromEnv,
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
  assert.deepEqual(supabaseConfigFromEnv({
    VITE_SUPABASE_URL: config.url,
    VITE_SUPABASE_PUBLISHABLE_KEY: config.key,
  }), config);
  assert.equal(supabaseConfigFromEnv({}), null);
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
  const payload = {
    version: 1,
    updatedAt: 123,
    scenes: {
      work: {
        files: {
          image: { mimeType: "text/plain", dataURL: "data:text/plain;base64,aGk=" },
        },
      },
    },
  };
  let cloudPayload;
  const uploadFetcher = async (url, options) => {
    if (url.startsWith("data:")) return fetch(url);
    if (url.includes("/storage/v1/object/")) return new Response(null, { status: 200 });
    cloudPayload = JSON.parse(options.body).payload;
    return new Response(null, { status: 201 });
  };
  await pushSupabaseWorkspace(config, session, payload, uploadFetcher);
  assert.equal(cloudPayload.scenes.work.files.image.dataURL, undefined);
  assert.equal(
    cloudPayload.scenes.work.files.image.storagePath,
    `${session.user.id}/image`,
  );

  const downloadFetcher = async (url) => url.includes("/rest/v1/")
    ? new Response(JSON.stringify([{ payload: cloudPayload }]), { status: 200 })
    : new Response("hi", { status: 200, headers: { "Content-Type": "text/plain" } });
  const restored = await pullSupabaseWorkspace(config, session, downloadFetcher);
  assert.equal(restored.scenes.work.files.image.dataURL, "data:text/plain;base64,aGk=");
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

test("pulls and upserts the signed-in user's workspace", async () => {
  const payload = { version: 1, updatedAt: 123, scenes: {} };
  const calls = [];
  const fetcher = async (url, options) => {
    calls.push({ url, options });
    return calls.length === 1
      ? new Response(JSON.stringify([{ payload }]), { status: 200 })
      : new Response(null, { status: 201 });
  };
  assert.deepEqual(await pullSupabaseWorkspace(config, session, fetcher), payload);
  await pushSupabaseWorkspace(config, session, payload, fetcher);
  assert.match(calls[0].url, /select=payload/);
  assert.equal(calls[0].options.headers.apikey, config.key);
  assert.equal(calls[0].options.headers.Authorization, "Bearer access");
  assert.equal(calls[1].options.method, "POST");
  assert.equal(JSON.parse(calls[1].options.body).user_id, session.user.id);
});
