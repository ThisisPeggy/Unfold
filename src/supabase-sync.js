export const SUPABASE_CONFIG_STORAGE_KEY = "unfold.supabase.v1";

export const SUPABASE_SETUP_SQL = `create table if not exists public.unfold_workspace (
  id text primary key,
  payload jsonb not null,
  updated_at timestamptz not null default now()
);

alter table public.unfold_workspace enable row level security;
grant select, insert, update on public.unfold_workspace to anon;

drop policy if exists "Unfold workspace access" on public.unfold_workspace;
create policy "Unfold workspace access"
on public.unfold_workspace
for all
to anon
using (id = 'default')
with check (id = 'default');`;

export function normalizeSupabaseConfig({ url = "", key = "" }) {
  const parsed = new URL(url.trim());
  if (parsed.protocol !== "https:") throw new Error("Project URL 必须使用 HTTPS。");
  const normalizedKey = key.trim();
  if (!normalizedKey.startsWith("sb_publishable_")) {
    throw new Error("请使用 sb_publishable_ 开头的 Publishable Key。");
  }
  return { url: parsed.origin, key: normalizedKey };
}

export function readSupabaseConfig(storage) {
  try {
    return normalizeSupabaseConfig(JSON.parse(storage.getItem(SUPABASE_CONFIG_STORAGE_KEY)));
  } catch {
    return null;
  }
}

export function writeSupabaseConfig(storage, config) {
  try {
    storage.setItem(SUPABASE_CONFIG_STORAGE_KEY, JSON.stringify(config));
    return true;
  } catch {
    return false;
  }
}

const headers = (config, json = false) => ({
  apikey: config.key,
  ...(json ? { "Content-Type": "application/json" } : {}),
});

async function requireSuccess(response) {
  if (response.ok) return response;
  const details = await response.text();
  throw new Error(response.status === 404
    ? "找不到 unfold_workspace 表，请先复制并运行建表 SQL。"
    : `Supabase 连接失败（${response.status}）${details ? `：${details}` : ""}`);
}

export async function pullSupabaseWorkspace(config, fetcher = fetch) {
  const response = await requireSuccess(await fetcher(
    `${config.url}/rest/v1/unfold_workspace?id=eq.default&select=payload`,
    { headers: headers(config) },
  ));
  const rows = await response.json();
  return rows[0]?.payload ?? null;
}

export async function pushSupabaseWorkspace(config, payload, fetcher = fetch) {
  await requireSuccess(await fetcher(`${config.url}/rest/v1/unfold_workspace`, {
    method: "POST",
    headers: {
      ...headers(config, true),
      Prefer: "resolution=merge-duplicates,return=minimal",
    },
    body: JSON.stringify({
      id: "default",
      payload,
      updated_at: new Date(payload.updatedAt).toISOString(),
    }),
  }));
}
