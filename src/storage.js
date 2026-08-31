import { deflate, inflate } from "pako";

export const SCENE_STORAGE_KEY = "story-canvas.scene.v1";
export const PUBLICATION_STORAGE_KEY = "story-canvas.publication.v1";
export const WORKS_STORAGE_KEY = "story-canvas.works.v1";
export const ACTIVE_WORK_STORAGE_KEY = "story-canvas.active-work.v1";
export const WORKSPACE_UPDATED_STORAGE_KEY = "story-canvas.workspace-updated.v1";

export const sceneKeyForWork = (id) => `${SCENE_STORAGE_KEY}:${id}`;
export const publicationKeyForWork = (id) => `${PUBLICATION_STORAGE_KEY}:${id}`;
const COMPRESSED_SCENE_PREFIX = "gzip:";

function encodeStoredScene(scene) {
  const json = JSON.stringify(scene);
  if (json.length < 50_000) return json;
  const bytes = deflate(new TextEncoder().encode(json), { level: 1 });
  let binary = "";
  for (let index = 0; index < bytes.length; index += 32768) {
    binary += String.fromCharCode(...bytes.subarray(index, index + 32768));
  }
  const compressed = `${COMPRESSED_SCENE_PREFIX}${btoa(binary)}`;
  return compressed.length < json.length ? compressed : json;
}

function decodeStoredScene(value) {
  if (!value?.startsWith(COMPRESSED_SCENE_PREFIX)) return JSON.parse(value);
  const binary = atob(value.slice(COMPRESSED_SCENE_PREFIX.length));
  const bytes = Uint8Array.from(binary, (character) => character.charCodeAt(0));
  return JSON.parse(new TextDecoder().decode(inflate(bytes)));
}

export function readScene(storage, key) {
  try {
    const scene = decodeStoredScene(storage.getItem(key));
    return scene && Array.isArray(scene.elements) ? scene : null;
  } catch {
    return null;
  }
}

export function writeScene(storage, key, scene) {
  try {
    storage.setItem(key, encodeStoredScene(scene));
    return true;
  } catch {
    return false;
  }
}

export function readPublication(storage, key) {
  try {
    const publication = JSON.parse(storage.getItem(key));
    if (!isSceneId(publication?.id)) return null;
    return {
      id: publication.id,
      ...(isSceneEditKey(publication.editKey) ? { editKey: publication.editKey } : {}),
    };
  } catch {
    return null;
  }
}

export function writePublication(storage, key, publication) {
  try {
    storage.setItem(key, JSON.stringify(publication));
    return true;
  } catch {
    return false;
  }
}

export function readWorks(storage) {
  try {
    const works = JSON.parse(storage.getItem(WORKS_STORAGE_KEY));
    if (!Array.isArray(works)) return [];
    const ids = new Set();
    return works.filter((work) => {
      const valid = isWorkId(work?.id) &&
        typeof work.name === "string" && Boolean(work.name.trim()) &&
        Number.isFinite(work.updatedAt) && !ids.has(work.id);
      if (valid) ids.add(work.id);
      return valid;
    });
  } catch {
    return [];
  }
}

export function writeWorks(storage, works, updatedAt = Date.now()) {
  try {
    storage.setItem(WORKS_STORAGE_KEY, JSON.stringify(works));
    storage.setItem(WORKSPACE_UPDATED_STORAGE_KEY, String(updatedAt));
    return true;
  } catch {
    return false;
  }
}

export function createWorkspaceSnapshot(storage, works, activeWorkId) {
  const saved = storage.getItem(WORKSPACE_UPDATED_STORAGE_KEY);
  const savedUpdatedAt = saved == null ? NaN : Number(saved);
  return {
    version: 1,
    updatedAt: Number.isFinite(savedUpdatedAt)
      ? savedUpdatedAt
      : Math.max(...works.map((work) => work.updatedAt), 0),
    activeWorkId,
    works,
    scenes: Object.fromEntries(works.map(({ id }) => [
      id,
      readScene(storage, sceneKeyForWork(id)),
    ])),
  };
}

export function parseWorkspaceSnapshot(value) {
  if (!value || value.version !== 1 || !Number.isFinite(value.updatedAt)) return null;
  const memory = { getItem: () => JSON.stringify(value.works) };
  const works = readWorks(memory);
  if (!works.length || works.length !== value.works?.length) return null;
  if (!works.some(({ id }) => id === value.activeWorkId)) return null;
  if (!value.scenes || typeof value.scenes !== "object") return null;
  if (works.some(({ id }) => {
    const scene = value.scenes[id];
    return !Array.isArray(scene?.elements) ||
      !scene.appState || typeof scene.appState !== "object" ||
      !scene.files || typeof scene.files !== "object";
  })) return null;
  return { ...value, works };
}

export function writeWorkspaceSnapshot(storage, value) {
  const snapshot = parseWorkspaceSnapshot(value);
  if (!snapshot) return false;
  for (const work of snapshot.works) {
    if (!writeScene(storage, sceneKeyForWork(work.id), snapshot.scenes[work.id])) return false;
  }
  if (!writeWorks(storage, snapshot.works, snapshot.updatedAt)) return false;
  try {
    storage.setItem(ACTIVE_WORK_STORAGE_KEY, snapshot.activeWorkId);
    return true;
  } catch {
    return false;
  }
}

export function initializeWorkStorage(storage, createId, now = Date.now()) {
  const existing = readWorks(storage);
  if (existing.length) {
    pruneStaleWorkStorage(storage, new Set(existing.map(({ id }) => id)));
    const savedActiveId = storage.getItem(ACTIVE_WORK_STORAGE_KEY);
    const activeWorkId = existing.some(({ id }) => id === savedActiveId)
      ? savedActiveId
      : existing[0].id;
    try {
      storage.setItem(ACTIVE_WORK_STORAGE_KEY, activeWorkId);
    } catch {}
    return { works: existing, activeWorkId };
  }

  const activeWorkId = createId();
  const works = [{ id: activeWorkId, name: "未命名作品", updatedAt: now }];
  const legacyScene = readScene(storage, SCENE_STORAGE_KEY);
  const legacyPublication = readPublication(storage, PUBLICATION_STORAGE_KEY);
  if (legacyScene && writeScene(storage, sceneKeyForWork(activeWorkId), legacyScene)) {
    storage.removeItem?.(SCENE_STORAGE_KEY);
  }
  if (legacyPublication && writePublication(
    storage,
    publicationKeyForWork(activeWorkId),
    legacyPublication,
  )) storage.removeItem?.(PUBLICATION_STORAGE_KEY);
  writeWorks(storage, works);
  try {
    storage.setItem(ACTIVE_WORK_STORAGE_KEY, activeWorkId);
  } catch {}
  return { works, activeWorkId };
}

export function pruneStaleWorkStorage(storage, workIds) {
  if (typeof storage.length !== "number" || typeof storage.key !== "function") return;
  const stale = [];
  for (let index = 0; index < storage.length; index += 1) {
    const key = storage.key(index);
    if (!key) continue;
    const sceneId = key.startsWith(`${SCENE_STORAGE_KEY}:`)
      ? key.slice(`${SCENE_STORAGE_KEY}:`.length)
      : null;
    const publicationId = key.startsWith(`${PUBLICATION_STORAGE_KEY}:`)
      ? key.slice(`${PUBLICATION_STORAGE_KEY}:`.length)
      : null;
    if ((sceneId || publicationId) && !workIds.has(sceneId || publicationId)) stale.push(key);
  }
  stale.forEach((key) => storage.removeItem(key));
  storage.removeItem?.(SCENE_STORAGE_KEY);
  storage.removeItem?.(PUBLICATION_STORAGE_KEY);
}

export function serializeUnfoldScene(scene) {
  return JSON.stringify({ ...scene, type: "unfold", version: 1 });
}

export function parseUnfoldScene(value) {
  const scene = JSON.parse(value);
  if (
    !["unfold", "excalidraw"].includes(scene?.type) ||
    !Array.isArray(scene.elements) ||
    !scene.appState || typeof scene.appState !== "object" ||
    (scene.files != null && typeof scene.files !== "object")
  ) {
    throw new Error("Invalid UNFOLD file");
  }
  return { ...scene, files: scene.files ?? {}, storyPath: scene.storyPath ?? [] };
}

export const MAX_SHARED_SCENE_BYTES = 1_500_000;
export const MAX_ENCODED_SCENE_LENGTH = MAX_SHARED_SCENE_BYTES * 2;

export function isEncodedScene(value) {
  return typeof value === "string" &&
    value.length > 0 &&
    value.length <= MAX_ENCODED_SCENE_LENGTH &&
    /^[\w-]+$/.test(value);
}

export function isSceneId(value) {
  return typeof value === "string" && /^(?:[\w-]{12}|[a-z0-9](?:[a-z0-9-]{1,46}[a-z0-9])?|[a-f0-9]{32}|[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12})$/.test(value);
}

export function isSceneEditKey(value) {
  return typeof value === "string" && /^[\w-]{24}$/.test(value);
}

export function isWorkId(value) {
  return typeof value === "string" &&
    /^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/.test(value);
}

export function sceneIdFromPath(pathname) {
  const id = /^\/s\/([^/]+)\/?$/.exec(pathname)?.[1];
  return isSceneId(id) ? id : null;
}

function toBase64Url(bytes) {
  let binary = "";
  for (let index = 0; index < bytes.length; index += 32768) {
    binary += String.fromCharCode(...bytes.subarray(index, index + 32768));
  }
  return btoa(binary).replaceAll("+", "-").replaceAll("/", "_").replace(/=+$/, "");
}

function fromBase64Url(value) {
  if (!isEncodedScene(value)) {
    throw new Error("Invalid shared scene");
  }
  const binary = atob(value.replaceAll("-", "+").replaceAll("_", "/"));
  return Uint8Array.from(binary, (character) => character.charCodeAt(0));
}

async function gzip(bytes) {
  const stream = new Blob([bytes]).stream().pipeThrough(new CompressionStream("gzip"));
  return new Uint8Array(await new Response(stream).arrayBuffer());
}

async function gunzip(bytes) {
  const reader = new Blob([bytes])
    .stream()
    .pipeThrough(new DecompressionStream("gzip"))
    .getReader();
  const chunks = [];
  let size = 0;

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > MAX_SHARED_SCENE_BYTES) {
      await reader.cancel();
      throw new Error("Shared scene is too large");
    }
    chunks.push(value);
  }

  const result = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) {
    result.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return result;
}

export async function encodeScene(scene) {
  const bytes = new TextEncoder().encode(JSON.stringify(scene));
  if (bytes.byteLength > MAX_SHARED_SCENE_BYTES) {
    throw new Error("Scene is too large to share as a link");
  }
  return toBase64Url(await gzip(bytes));
}

export async function decodeScene(value) {
  const scene = JSON.parse(new TextDecoder().decode(await gunzip(fromBase64Url(value))));
  if (
    !scene ||
    !Array.isArray(scene.elements) ||
    typeof scene.appState !== "object" ||
    typeof scene.files !== "object"
  ) {
    throw new Error("Invalid shared scene");
  }
  return scene;
}
