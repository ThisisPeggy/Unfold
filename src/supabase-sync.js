import {
  MAX_SHARED_SCENE_BYTES,
  mergeWorkspaceSnapshots,
  parseWorkspaceSnapshot,
} from "./storage.js";

export const SUPABASE_SESSION_STORAGE_KEY = "unfold.supabase.session.v1";
export const SUPABASE_WORK_LIMIT = 10;
const IMAGE_BUCKET = "unfold-images";
const PUBLIC_IMAGE_BUCKET = "unfold-public-images";
// ponytail: cache uploads for this tab; add persisted hashes if refresh-time reuploads become costly.
const uploadedImages = new Set();

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
  const record = await pullSupabaseWorkspaceRecord(config, session, fetcher);
  return record?.workspace ?? null;
}

export async function pullSupabaseWorkspaceRecord(config, session, fetcher = fetch) {
  const response = await requireSuccess(await fetcher(
    `${config.url}/rest/v1/unfold_user_workspace?select=payload,updated_at`,
    { headers: headers(config, session) },
  ));
  const row = (await response.json())[0];
  if (!row?.payload) return null;
  return {
    workspace: await downloadWorkspaceImages(config, session, row.payload, fetcher),
    updatedAt: row.updated_at,
  };
}

export async function pullSupabaseWorkspaceUpdatedAt(config, session, fetcher = fetch) {
  const response = await requireSuccess(await fetcher(
    `${config.url}/rest/v1/unfold_user_workspace?select=updated_at`,
    { headers: headers(config, session) },
  ));
  return (await response.json())[0]?.updated_at ?? null;
}

function workspaceEqual(left, right) {
  return JSON.stringify(left) === JSON.stringify(right);
}

async function compareAndSwapSupabaseWorkspace(
  config,
  session,
  payload,
  expectedUpdatedAt,
  fetcher,
) {
  if ((payload.works?.length ?? Object.keys(payload.scenes ?? {}).length) > SUPABASE_WORK_LIMIT) {
    throw new Error(`云同步最多保存 ${SUPABASE_WORK_LIMIT} 个作品。请先删除不需要的作品。`);
  }
  const cloudPayload = await uploadWorkspaceImages(config, session, payload, fetcher);
  const updatedAt = new Date(payload.updatedAt).toISOString();
  const existing = expectedUpdatedAt != null;
  const response = await requireSuccess(await fetcher(
    existing
      ? `${config.url}/rest/v1/unfold_user_workspace?user_id=eq.${encodeURIComponent(session.user.id)}&updated_at=eq.${encodeURIComponent(expectedUpdatedAt)}`
      : `${config.url}/rest/v1/unfold_user_workspace`,
    {
      method: existing ? "PATCH" : "POST",
      headers: {
        ...headers(config, session, true),
        Prefer: existing ? "return=representation" : "resolution=ignore-duplicates,return=representation",
      },
      body: JSON.stringify({
        user_id: session.user.id,
        payload: cloudPayload,
        updated_at: updatedAt,
      }),
    },
  ));
  return (await response.json()).length ? updatedAt : null;
}

export async function syncSupabaseWorkspace(
  config,
  session,
  local,
  { adoptCloud = false, fetcher = fetch } = {},
) {
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const record = await pullSupabaseWorkspaceRecord(config, session, fetcher);
    const cloud = record && parseWorkspaceSnapshot(record.workspace);
    if (record && !cloud) throw new Error("云端作品数据格式无效。");
    const combined = !record
      ? local
      : adoptCloud ? cloud : mergeWorkspaceSnapshots(local, cloud);
    const merged = record && !adoptCloud && combined.works.some(
      ({ id }) => id === cloud.activeWorkId,
    ) ? { ...combined, activeWorkId: cloud.activeWorkId } : combined;
    if (record && workspaceEqual(merged, cloud)) {
      return { workspace: merged, cloudUpdatedAt: record.updatedAt };
    }

    const cloudUpdatedAt = record ? Date.parse(record.updatedAt) : 0;
    if (record && !Number.isFinite(cloudUpdatedAt)) {
      throw new Error("云端同步版本无效。");
    }
    const updatedAt = Math.max(
      Date.now(),
      merged.updatedAt,
      cloudUpdatedAt + 1,
    );
    const workspace = { ...merged, updatedAt };
    const savedAt = await compareAndSwapSupabaseWorkspace(
      config,
      session,
      workspace,
      record?.updatedAt ?? null,
      fetcher,
    );
    if (savedAt) return { workspace, cloudUpdatedAt: savedAt };
  }
  throw new Error("云端作品正在被其他设备修改，请稍后重试。");
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
  const payload = (await response.json())[0]?.payload ?? null;
  return payload ? downloadPublicSceneImages(config, payload, fetcher) : null;
}

export async function pushPublicScene(config, session, id, payload, fetcher = fetch) {
  const cloudPayload = await uploadPublicSceneImages(config, session, id, payload, fetcher);
  if (new TextEncoder().encode(JSON.stringify(cloudPayload)).byteLength > MAX_SHARED_SCENE_BYTES) {
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
      payload: cloudPayload,
      updated_at: new Date().toISOString(),
    }),
  }));
}

async function uploadPublicSceneImages(config, session, sceneId, payload, fetcher) {
  const files = {};
  for (const [fileId, file] of Object.entries(payload.files ?? {})) {
    const storagePath = `${session.user.id}/${sceneId}/${fileId}`;
    const uploadKey = `${PUBLIC_IMAGE_BUCKET}/${storagePath}`;
    if (file.dataURL && !uploadedImages.has(uploadKey)) {
      const blob = await (await fetcher(file.dataURL)).blob();
      const response = await fetcher(
        `${config.url}/storage/v1/object/${PUBLIC_IMAGE_BUCKET}/${storagePath}`,
        {
          method: "POST",
          headers: {
            ...headers(config, session),
            "Content-Type": blob.type || file.mimeType || "application/octet-stream",
            "cache-control": "31536000",
            "x-upsert": "true",
          },
          body: blob,
        },
      );
      if (!response.ok) throw new Error(`图片上传失败（${response.status}）`);
      uploadedImages.add(uploadKey);
    }
    const { dataURL: _dataURL, ...metadata } = file;
    files[fileId] = { ...metadata, storagePath };
  }
  return { ...payload, files };
}

async function downloadPublicSceneImages(config, payload, fetcher) {
  const files = {};
  for (const [fileId, file] of Object.entries(payload.files ?? {})) {
    if (!file.storagePath || file.dataURL) {
      files[fileId] = file;
      continue;
    }
    const response = await fetcher(
      `${config.url}/storage/v1/object/public/${PUBLIC_IMAGE_BUCKET}/${file.storagePath}`,
      { headers: headers(config, null) },
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
  }
  return { ...payload, files };
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
