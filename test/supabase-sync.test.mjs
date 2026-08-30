import assert from "node:assert/strict";
import test from "node:test";
import {
  normalizeSupabaseConfig,
  pullSupabaseWorkspace,
  pushSupabaseWorkspace,
  SUPABASE_SETUP_SQL,
} from "../src/supabase-sync.js";

const config = {
  url: "https://example.supabase.co",
  key: "sb_publishable_example",
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
});

test("pulls and upserts one workspace through Supabase REST", async () => {
  const payload = { version: 1, updatedAt: 123 };
  const calls = [];
  const fetcher = async (url, options) => {
    calls.push({ url, options });
    return calls.length === 1
      ? new Response(JSON.stringify([{ payload }]), { status: 200 })
      : new Response(null, { status: 201 });
  };
  assert.deepEqual(await pullSupabaseWorkspace(config, fetcher), payload);
  await pushSupabaseWorkspace(config, payload, fetcher);
  assert.match(calls[0].url, /select=payload/);
  assert.equal(calls[0].options.headers.apikey, config.key);
  assert.equal(calls[1].options.method, "POST");
  assert.equal(JSON.parse(calls[1].options.body).id, "default");
});
