import { MAX_SHARED_SCENE_BYTES } from "./storage.js";

export const SUPABASE_SESSION_STORAGE_KEY = "unfold.supabase.session.v1";
const IMAGE_BUCKET = "unfold-images";
// ponytail: cache uploads for this tab; add persisted hashes if refresh-time reuploads become costly.
const uploadedImages = new Set();

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
with check ((select auth.uid()) = user_id);

create table if not exists public.unfold_public_scene (
  id text primary key,
  user_id uuid not null references auth.users(id) on delete cascade default auth.uid(),
  payload jsonb not null,
  updated_at timestamptz not null default now()
);

alter table public.unfold_public_scene enable row level security;
revoke all on table public.unfold_public_scene from anon, authenticated;
grant select on table public.unfold_public_scene to anon;
grant select, insert, update, delete on table public.unfold_public_scene to authenticated;

drop policy if exists "Anyone reads shared Unfold scenes" on public.unfold_public_scene;
create policy "Anyone reads shared Unfold scenes"
on public.unfold_public_scene for select to anon, authenticated
using (true);

drop policy if exists "Users create their own shared Unfold scenes" on public.unfold_public_scene;
create policy "Users create their own shared Unfold scenes"
on public.unfold_public_scene for insert to authenticated
with check ((select auth.uid()) = user_id);

drop policy if exists "Users update their own shared Unfold scenes" on public.unfold_public_scene;
create policy "Users update their own shared Unfold scenes"
on public.unfold_public_scene for update to authenticated
using ((select auth.uid()) = user_id)
with check ((select auth.uid()) = user_id);

drop policy if exists "Users delete their own shared Unfold scenes" on public.unfold_public_scene;
create policy "Users delete their own shared Unfold scenes"
on public.unfold_public_scene for delete to authenticated
using ((select auth.uid()) = user_id);

insert into storage.buckets (id, name, public, file_size_limit)
values ('unfold-images', 'unfold-images', false, 52428800)
on conflict (id) do update set public = false;

drop policy if exists "Users read their own Unfold images" on storage.objects;
create policy "Users read their own Unfold images"
on storage.objects for select to authenticated
using (bucket_id = 'unfold-images' and owner_id = (select auth.uid()::text));

drop policy if exists "Users upload their own Unfold images" on storage.objects;
create policy "Users upload their own Unfold images"
on storage.objects for insert to authenticated
with check (
  bucket_id = 'unfold-images' and
  (storage.foldername(name))[1] = (select auth.uid()::text)
);

drop policy if exists "Users update their own Unfold images" on storage.objects;
create policy "Users update their own Unfold images"
on storage.objects for update to authenticated
using (bucket_id = 'unfold-images' and owner_id = (select auth.uid()::text))
with check (
  bucket_id = 'unfold-images' and
  (storage.foldername(name))[1] = (select auth.uid()::text)
);`;

export function normalizeSupabaseConfig({ url = "", key = "" }) {
  const parsed = new URL(url.trim());
  if (parsed.protocol !== "https:") throw new Error("Project URL 必须使用 HTTPS。");
  const normalizedKey = key.trim();
  if (!normalizedKey.startsWith("sb_publishable_")) {
    throw new Error("请使用 sb_publishable_ 开头的 Publishable Key。");
  }
  return { url: parsed.origin, key: normalizedKey };
}

export function supabaseConfigFromEnv(env = {}) {
  try {
    return normalizeSupabaseConfig({
      url: env.VITE_SUPABASE_URL,
      key: env.VITE_SUPABASE_PUBLISHABLE_KEY,
    });
  } catch {
    return null;
  }
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
  const payload = rows[0]?.payload ?? null;
  return payload ? downloadWorkspaceImages(config, session, payload, fetcher) : null;
}

export async function pushSupabaseWorkspace(config, session, payload, fetcher = fetch) {
  const cloudPayload = await uploadWorkspaceImages(config, session, payload, fetcher);
  await requireSuccess(await fetcher(`${config.url}/rest/v1/unfold_user_workspace`, {
    method: "POST",
    headers: {
      ...headers(config, session, true),
      Prefer: "resolution=merge-duplicates,return=minimal",
    },
    body: JSON.stringify({
      user_id: session.user.id,
      payload: cloudPayload,
      updated_at: new Date(payload.updatedAt).toISOString(),
    }),
  }));
}

async function requirePublicSceneSuccess(response) {
  if (response.ok) return response;
  if (response.status === 404) {
    throw new Error("找不到 unfold_public_scene 表，请先复制并运行最新建表 SQL。");
  }
  throw await responseError(response, `Supabase 分享失败（${response.status}）`);
}

export async function pullPublicScene(config, id, fetcher = fetch) {
  const response = await requirePublicSceneSuccess(await fetcher(
    `${config.url}/rest/v1/unfold_public_scene?id=eq.${encodeURIComponent(id)}&select=payload`,
    { headers: headers(config, null) },
  ));
  return (await response.json())[0]?.payload ?? null;
}

export async function pushPublicScene(config, session, id, payload, fetcher = fetch) {
  if (new TextEncoder().encode(JSON.stringify(payload)).byteLength > MAX_SHARED_SCENE_BYTES) {
    throw new Error("画布超过 1.5 MB，暂时无法分享。");
  }
  await requirePublicSceneSuccess(await fetcher(`${config.url}/rest/v1/unfold_public_scene`, {
    method: "POST",
    headers: {
      ...headers(config, session, true),
      Prefer: "resolution=merge-duplicates,return=minimal",
    },
    body: JSON.stringify({
      id,
      user_id: session.user.id,
      payload,
      updated_at: new Date().toISOString(),
    }),
  }));
}

async function uploadWorkspaceImages(config, session, payload, fetcher) {
  const scenes = {};
  for (const [workId, scene] of Object.entries(payload.scenes ?? {})) {
    const files = {};
    for (const [fileId, file] of Object.entries(scene.files ?? {})) {
      const storagePath = `${session.user.id}/${fileId}`;
      if (file.dataURL && !uploadedImages.has(storagePath)) {
        const blob = await (await fetcher(file.dataURL)).blob();
        const response = await fetcher(
          `${config.url}/storage/v1/object/${IMAGE_BUCKET}/${storagePath}`,
          {
            method: "POST",
            headers: {
              ...headers(config, session),
              "Content-Type": blob.type || file.mimeType || "application/octet-stream",
              "x-upsert": "true",
            },
            body: blob,
          },
        );
        if (!response.ok) throw new Error(`图片上传失败（${response.status}）`);
        uploadedImages.add(storagePath);
      }
      const { dataURL: _dataURL, ...metadata } = file;
      files[fileId] = { ...metadata, storagePath };
    }
    scenes[workId] = { ...scene, files };
  }
  return { ...payload, scenes };
}

async function downloadWorkspaceImages(config, session, payload, fetcher) {
  const scenes = {};
  for (const [workId, scene] of Object.entries(payload.scenes ?? {})) {
    const files = {};
    for (const [fileId, file] of Object.entries(scene.files ?? {})) {
      if (!file.storagePath || file.dataURL) {
        files[fileId] = file;
        continue;
      }
      const response = await fetcher(
        `${config.url}/storage/v1/object/authenticated/${IMAGE_BUCKET}/${file.storagePath}`,
        { headers: headers(config, session) },
      );
      if (!response.ok) throw new Error(`图片下载失败（${response.status}）`);
      const blob = await response.blob();
      const bytes = new Uint8Array(await blob.arrayBuffer());
      let binary = "";
      for (const byte of bytes) binary += String.fromCharCode(byte);
      files[fileId] = {
        ...file,
        dataURL: `data:${blob.type || file.mimeType};base64,${btoa(binary)}`,
      };
      uploadedImages.add(file.storagePath);
    }
    scenes[workId] = { ...scene, files };
  }
  return { ...payload, scenes };
}
