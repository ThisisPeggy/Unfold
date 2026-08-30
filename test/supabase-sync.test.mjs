import assert from "node:assert/strict";
import test from "node:test";
import {
  normalizeSupabaseConfig,
  pullSupabaseWorkspace,
  pushSupabaseWorkspace,
  refreshSupabaseSession,
  signInSupabase,
  signUpSupabase,
  SUPABASE_SETUP_SQL,
} from "../src/supabase-sync.js";

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
  const payload = { version: 1, updatedAt: 123 };
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
