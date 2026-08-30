export const SUPABASE_CONFIG_STORAGE_KEY = "unfold.supabase.v1";
export const SUPABASE_SESSION_STORAGE_KEY = "unfold.supabase.session.v1";

export const SUPABASE_SETUP_SQL = `create table if not exists public.unfold_user_workspace (
  user_id uuid primary key references auth.users(id) on delete cascade default auth.uid(),
  payload jsonb not null,
  updated_at timestamptz not null default now()
);

alter table public.unfold_user_workspace enable row level security;
revoke all on table public.unfold_user_workspace from anon, authenticated;
grant select, insert, update on table public.unfold_user_workspace to authenticated;

drop policy if exists "Users read their own Unfold workspace" on public.unfold_user_workspace;
create policy "Users read their own Unfold workspace"
on public.unfold_user_workspace for select to authenticated
using ((select auth.uid()) = user_id);

drop policy if exists "Users create their own Unfold workspace" on public.unfold_user_workspace;
create policy "Users create their own Unfold workspace"
on public.unfold_user_workspace for insert to authenticated
with check ((select auth.uid()) = user_id);

drop policy if exists "Users update their own Unfold workspace" on public.unfold_user_workspace;
create policy "Users update their own Unfold workspace"
on public.unfold_user_workspace for update to authenticated
using ((select auth.uid()) = user_id)
with check ((select auth.uid()) = user_id);`;

export function normalizeSupabaseConfig({ url = "", key = "" }) {
  const parsed = new URL(url.trim());
  if (parsed.protocol !== "https:") throw new Error("Project URL 必须使用 HTTPS。");
  const normalizedKey = key.trim();
  if (!normalizedKey.startsWith("sb_publishable_")) {
    throw new Error("请使用 sb_publishable_ 开头的 Publishable Key。");
  }
  return { url: parsed.origin, key: normalizedKey };
}

function normalizeSession(value) {
  if (
    typeof value?.accessToken !== "string" ||
    typeof value?.refreshToken !== "string" ||
    !Number.isFinite(value?.expiresAt) ||
    typeof value?.user?.id !== "string"
  ) return null;
  return value;
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

export function readSupabaseSession(storage) {
  try {
    return normalizeSession(JSON.parse(storage.getItem(SUPABASE_SESSION_STORAGE_KEY)));
  } catch {
    return null;
  }
}

export function writeSupabaseSession(storage, session) {
  try {
    storage.setItem(SUPABASE_SESSION_STORAGE_KEY, JSON.stringify(session));
    return true;
  } catch {
    return false;
  }
}

const headers = (config, session, json = false) => ({
  apikey: config.key,
  ...(session ? { Authorization: `Bearer ${session.accessToken}` } : {}),
  ...(json ? { "Content-Type": "application/json" } : {}),
});

async function responseError(response, fallback) {
  const body = await response.json().catch(() => ({}));
  return new Error(body.msg || body.message || body.error_description || fallback);
}

function sessionFromResponse(data) {
  if (!data?.access_token || !data?.refresh_token || !data?.user?.id) return null;
  return {
    accessToken: data.access_token,
    refreshToken: data.refresh_token,
    expiresAt: (data.expires_at ?? Math.floor(Date.now() / 1000) + data.expires_in) * 1000,
    user: { id: data.user.id, email: data.user.email ?? "" },
  };
}

async function authRequest(config, path, body, fetcher) {
  const response = await fetcher(`${config.url}/auth/v1/${path}`, {
    method: "POST",
    headers: headers(config, null, true),
    body: JSON.stringify(body),
  });
  if (!response.ok) throw await responseError(response, `认证失败（${response.status}）`);
  return response.json();
}

export async function signInSupabase(config, email, password, fetcher = fetch) {
  const data = await authRequest(
    config,
    "token?grant_type=password",
    { email: email.trim(), password },
    fetcher,
  );
  const session = sessionFromResponse(data);
  if (!session) throw new Error("登录成功，但没有收到有效会话。");
  return session;
}

export async function signUpSupabase(config, email, password, fetcher = fetch) {
  const data = await authRequest(config, "signup", { email: email.trim(), password }, fetcher);
  return { session: sessionFromResponse(data), email: data.user?.email ?? email.trim() };
}

export async function refreshSupabaseSession(config, session, fetcher = fetch) {
  const data = await authRequest(
    config,
    "token?grant_type=refresh_token",
    { refresh_token: session.refreshToken },
    fetcher,
  );
  const refreshed = sessionFromResponse(data);
  if (!refreshed) throw new Error("登录已过期，请重新登录。");
  return refreshed;
}

async function requireSuccess(response) {
  if (response.ok) return response;
  const details = await response.text();
  throw new Error(response.status === 404
    ? "找不到 unfold_user_workspace 表，请先复制并运行最新建表 SQL。"
    : `Supabase 同步失败（${response.status}）${details ? `：${details}` : ""}`);
}

export async function pullSupabaseWorkspace(config, session, fetcher = fetch) {
  const response = await requireSuccess(await fetcher(
    `${config.url}/rest/v1/unfold_user_workspace?select=payload`,
    { headers: headers(config, session) },
  ));
  const rows = await response.json();
  return rows[0]?.payload ?? null;
}

export async function pushSupabaseWorkspace(config, session, payload, fetcher = fetch) {
  await requireSuccess(await fetcher(`${config.url}/rest/v1/unfold_user_workspace`, {
    method: "POST",
    headers: {
      ...headers(config, session, true),
      Prefer: "resolution=merge-duplicates,return=minimal",
    },
    body: JSON.stringify({
      user_id: session.user.id,
      payload,
      updated_at: new Date(payload.updatedAt).toISOString(),
    }),
  }));
}
