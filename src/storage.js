export const SCENE_STORAGE_KEY = "story-canvas.scene.v1";
export const PUBLICATION_STORAGE_KEY = "story-canvas.publication.v1";
export const WORKS_STORAGE_KEY = "story-canvas.works.v1";
export const ACTIVE_WORK_STORAGE_KEY = "story-canvas.active-work.v1";
export const WORKSPACE_UPDATED_STORAGE_KEY = "story-canvas.workspace-updated.v1";
export const DELETED_WORKS_STORAGE_KEY = "story-canvas.deleted-works.v1";
export const SYNC_CONFLICTS_KEY = "unfold.sync-conflicts.v1";

export function readSyncConflicts(storage) {
  try { return JSON.parse(storage.getItem(SYNC_CONFLICTS_KEY)) ?? {}; } catch { return {}; }
}

export const sceneKeyForWork = (id) => `${SCENE_STORAGE_KEY}:${id}`;
export const publicationKeyForWork = (id) => `${PUBLICATION_STORAGE_KEY}:${id}`;
const COMPRESSED_SCENE_PREFIX = "gzip:";
const SCENE_DATABASE_NAME = "unfold";
const SCENE_STORE_NAME = "scenes";
let sceneDatabase = null;
let sceneCache = null;
let sceneWriteQueue = Promise.resolve();

function requestResult(request) {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

function decodeStoredScene(value) {
  if (!value?.startsWith(COMPRESSED_SCENE_PREFIX)) return JSON.parse(value);
  const binary = atob(value.slice(COMPRESSED_SCENE_PREFIX.length));
  const bytes = Uint8Array.from(binary, (character) => character.charCodeAt(0));
  const stream = new Blob([bytes]).stream().pipeThrough(new DecompressionStream("deflate"));
  return new Response(stream).text().then(JSON.parse);
}

function transactionDone(transaction) {
  return new Promise((resolve, reject) => {
    transaction.oncomplete = resolve;
    transaction.onabort = transaction.onerror = () => reject(transaction.error);
  });
}

function blobToDataUrl(blob) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(blob);
  });
}

async function sceneForDatabase(scene) {
  const files = await Promise.all(Object.entries(scene.files ?? {}).map(async ([id, file]) => {
    if (!file.dataURL) return [id, file];
    const { dataURL, ...metadata } = file;
    return [id, { ...metadata, blob: await (await fetch(dataURL)).blob() }];
  }));
  return { ...scene, files: Object.fromEntries(files) };
}

async function sceneFromDatabase(scene) {
  const files = await Promise.all(Object.entries(scene.files ?? {}).map(async ([id, file]) => {
    if (!file.blob || file.dataURL) return [id, file];
    const { blob, ...metadata } = file;
    return [id, { ...metadata, dataURL: await blobToDataUrl(blob) }];
  }));
  return { ...scene, files: Object.fromEntries(files) };
}

async function putScene(key, scene) {
  const storedScene = await sceneForDatabase(scene);
  const transaction = sceneDatabase.transaction(SCENE_STORE_NAME, "readwrite");
  const done = transactionDone(transaction);
  transaction.objectStore(SCENE_STORE_NAME).put(storedScene, key);
  await done;
}

function queueSceneWrite(action) {
  const result = sceneWriteQueue.then(action, action);
  sceneWriteQueue = result.catch(() => {});
  return result;
}

export async function initializeSceneStorage(storage, indexedDb = globalThis.indexedDB) {
  if (!indexedDb) return false;
  try {
    const request = indexedDb.open(SCENE_DATABASE_NAME, 1);
    request.onupgradeneeded = () => request.result.createObjectStore(SCENE_STORE_NAME);
    sceneDatabase = await requestResult(request);
    sceneDatabase.onversionchange = () => {
      sceneDatabase?.close();
      sceneDatabase = null;
    };

    const localKeys = Array.from({ length: storage.length }, (_, index) => storage.key(index))
      .filter((key) => key === SCENE_STORAGE_KEY || key?.startsWith(`${SCENE_STORAGE_KEY}:`));
    for (const key of localKeys) {
      try {
        const scene = await decodeStoredScene(storage.getItem(key));
        if (scene && Array.isArray(scene.elements)) {
          await putScene(key, scene);
          storage.removeItem(key);
        }
      } catch {}
    }

    const transaction = sceneDatabase.transaction(SCENE_STORE_NAME);
    const store = transaction.objectStore(SCENE_STORE_NAME);
    const [keys, scenes] = await Promise.all([
      requestResult(store.getAllKeys()),
      requestResult(store.getAll()),
      transactionDone(transaction),
    ]);
    sceneCache = new Map(await Promise.all(keys.map(async (key, index) => [
      key,
      await sceneFromDatabase(scenes[index]),
    ])));
    return true;
  } catch {
    sceneDatabase?.close();
    sceneDatabase = sceneCache = null;
    return false;
  }
}

export function readScene(storage, key) {
  try {
    const scene = sceneCache?.get(key) ?? decodeStoredScene(storage.getItem(key));
    if (scene instanceof Promise) return null;
    return scene && Array.isArray(scene.elements) ? scene : null;
  } catch {
    return null;
  }
}

export function writeScene(storage, key, scene) {
  if (sceneDatabase) {
    const previous = sceneCache.get(key);
    sceneCache.set(key, scene);
    return queueSceneWrite(async () => {
      try {
        await putScene(key, scene);
        // Clear only a recovery copy of this exact revision.
        if (storage.getItem(key) === JSON.stringify(scene)) storage.removeItem?.(key);
        return true;
      } catch {
        if (sceneCache.get(key) === scene) {
          if (previous) sceneCache.set(key, previous);
          else sceneCache.delete(key);
        }
        return false;
      }
    });
  }
  try {
    storage.setItem(key, JSON.stringify(scene));
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

export function readDeletedWorks(storage) {
  try {
    const deletedWorks = JSON.parse(storage.getItem(DELETED_WORKS_STORAGE_KEY));
    if (!deletedWorks || typeof deletedWorks !== "object" || Array.isArray(deletedWorks)) return {};
    return Object.fromEntries(Object.entries(deletedWorks).filter(
      ([id, deletedAt]) => isWorkId(id) && Number.isFinite(deletedAt),
    ));
  } catch {
    return {};
  }
}

export function writeDeletedWorks(storage, deletedWorks) {
  try {
    storage.setItem(DELETED_WORKS_STORAGE_KEY, JSON.stringify(deletedWorks));
    return true;
  } catch {
    return false;
  }
}

export function createWorkspaceSnapshot(storage, works, activeWorkId, activeScene) {
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
      id === activeWorkId && activeScene ? activeScene : readScene(storage, sceneKeyForWork(id)),
    ])),
    deletedWorks: readDeletedWorks(storage),
    conflicts: readSyncConflicts(storage),
  };
}

export function mergeWorkspaceSnapshots(local, cloud, base = null) {
  const conflicts = { ...cloud.conflicts, ...local.conflicts };
  const localWorks = new Map(local.works.map((work) => [work.id, work]));
  const cloudWorks = new Map(cloud.works.map((work) => [work.id, work]));
  const deletedWorks = {};
  for (const id of [...new Set([
    ...Object.keys(local.deletedWorks ?? {}),
    ...Object.keys(cloud.deletedWorks ?? {}),
  ])].sort()) {
    deletedWorks[id] = Math.max(local.deletedWorks?.[id] ?? 0, cloud.deletedWorks?.[id] ?? 0);
  }

  const works = [];
  const scenes = {};
  const candidates = [];
  for (const id of new Set([...localWorks.keys(), ...cloudWorks.keys()])) {
    const localWork = localWorks.get(id);
    const cloudWork = cloudWorks.get(id);
    let source;
    if (!localWork) source = cloud;
    else if (!cloudWork) source = local;
    else if (localWork.updatedAt !== cloudWork.updatedAt) {
      source = localWork.updatedAt > cloudWork.updatedAt ? local : cloud;
    } else {
      const localValue = JSON.stringify([localWork, local.scenes[id]]);
      const cloudValue = JSON.stringify([cloudWork, cloud.scenes[id]]);
      source = localValue >= cloudValue ? local : cloud;
    }
    const work = source === local ? localWork : cloudWork;
    const localScene = local.scenes[id];
    const cloudScene = cloud.scenes[id];
    const changed = (scene, previous) => JSON.stringify(scene) !== JSON.stringify(previous);
    if (localWork && cloudWork && changed(localScene, cloudScene) &&
        (!base || (changed(localScene, base.scenes[id]) && changed(cloudScene, base.scenes[id])))) {
      const other = source === local ? cloud : local;
      const otherWork = source === local ? cloudWork : localWork;
      const key = `${id}:${otherWork.updatedAt}:${JSON.stringify(other.scenes[id].elements.map((e) => [e.id, e.version]))}`;
      conflicts[key] = { work: otherWork, scene: other.scenes[id] };
    }
    candidates.push({ work, scene: source.scenes[id] });
    if ((deletedWorks[id] ?? 0) >= work.updatedAt) continue;
    works.push(work);
    scenes[id] = source.scenes[id];
  }

  if (!works.length && candidates.length) {
    const { work, scene } = candidates.sort((left, right) =>
      right.work.updatedAt - left.work.updatedAt || right.work.id.localeCompare(left.work.id))[0];
    delete deletedWorks[work.id];
    works.push(work);
    scenes[work.id] = scene;
  }

  const orderedBy = local.updatedAt !== cloud.updatedAt
    ? (local.updatedAt > cloud.updatedAt ? local.works : cloud.works)
    : (JSON.stringify(local.works) >= JSON.stringify(cloud.works) ? local.works : cloud.works);
  const order = new Map(orderedBy.map(({ id }, index) => [id, index]));
  works.sort((left, right) => (order.get(left.id) ?? Infinity) - (order.get(right.id) ?? Infinity) ||
    left.updatedAt - right.updatedAt || left.id.localeCompare(right.id));
  const activeWorkId = [local.activeWorkId, cloud.activeWorkId, works[0]?.id]
    .find((id) => works.some((work) => work.id === id));
  return {
    version: 1,
    updatedAt: Math.max(local.updatedAt, cloud.updatedAt),
    activeWorkId,
    works,
    scenes: Object.fromEntries(works.map(({ id }) => [id, scenes[id]])),
    deletedWorks,
    ...(Object.keys(conflicts).length ? { conflicts } : {}),
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
  const deletedWorks = Object.fromEntries(Object.entries(value.deletedWorks ?? {}).filter(
    ([id, deletedAt]) => isWorkId(id) && Number.isFinite(deletedAt),
  ));
  return { ...value, works, deletedWorks };
}

export async function writeWorkspaceSnapshot(storage, value, isCurrent = () => true) {
  const snapshot = parseWorkspaceSnapshot(value);
  if (!snapshot) return false;
  return queueSceneWrite(async () => {
    try {
      const prepared = sceneDatabase ? await Promise.all(snapshot.works.map(async ({ id }) =>
        [sceneKeyForWork(id), await sceneForDatabase(snapshot.scenes[id])])) : null;
      if (!isCurrent()) return false;
      if (prepared) {
        const transaction = sceneDatabase.transaction(SCENE_STORE_NAME, "readwrite");
        const done = transactionDone(transaction);
        prepared.forEach(([key, scene]) => transaction.objectStore(SCENE_STORE_NAME).put(scene, key));
        await done;
        if (!isCurrent()) return false;
        snapshot.works.forEach(({ id }) => sceneCache.set(sceneKeyForWork(id), snapshot.scenes[id]));
      } else {
        for (const { id } of snapshot.works) {
          storage.setItem(sceneKeyForWork(id), JSON.stringify(snapshot.scenes[id]));
        }
      }
      if (!writeWorks(storage, snapshot.works, snapshot.updatedAt)) return false;
      if (!writeDeletedWorks(storage, snapshot.deletedWorks)) return false;
      storage.setItem(SYNC_CONFLICTS_KEY, JSON.stringify(snapshot.conflicts ?? {}));
      storage.setItem(ACTIVE_WORK_STORAGE_KEY, snapshot.activeWorkId);
      return true;
    } catch {
      return false;
    }
  });
}

export function initializeWorkStorage(storage, createId, now = Date.now()) {
  const existing = readWorks(storage);
  if (existing.length) {
    void pruneStaleWorkStorage(storage, new Set(existing.map(({ id }) => id)));
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
  if (legacyScene) {
    const saved = writeScene(storage, sceneKeyForWork(activeWorkId), legacyScene);
    if (saved instanceof Promise) {
      saved.then((ok) => { if (ok) storage.removeItem?.(SCENE_STORAGE_KEY); });
    } else if (saved) storage.removeItem?.(SCENE_STORAGE_KEY);
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

export async function removeScene(storage, key) {
  sceneCache?.delete(key);
  if (!sceneDatabase) {
    storage.removeItem?.(key);
    return true;
  }
  return queueSceneWrite(async () => {
    try {
      const transaction = sceneDatabase.transaction(SCENE_STORE_NAME, "readwrite");
      const done = transactionDone(transaction);
      transaction.objectStore(SCENE_STORE_NAME).delete(key);
      await done;
      return true;
    } catch {
      return false;
    }
  });
}

export async function pruneStaleWorkStorage(storage, workIds) {
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
  for (const key of sceneCache?.keys() ?? []) {
    const sceneId = key.startsWith(`${SCENE_STORAGE_KEY}:`)
      ? key.slice(`${SCENE_STORAGE_KEY}:`.length)
      : null;
    if (sceneId && !workIds.has(sceneId) && !stale.includes(key)) stale.push(key);
  }
  await Promise.all(stale.map((key) => key.startsWith(`${SCENE_STORAGE_KEY}:`)
    ? removeScene(storage, key)
    : storage.removeItem(key)));
  // Legacy data is removed only by successful migration, never by pruning.
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
