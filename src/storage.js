export function readScene(storage, key) {
  try {
    const scene = JSON.parse(storage.getItem(key));
    return scene && Array.isArray(scene.elements) ? scene : null;
  } catch {
    return null;
  }
}

export function writeScene(storage, key, scene) {
  try {
    storage.setItem(key, JSON.stringify(scene));
    return true;
  } catch {
    return false;
  }
}

export function serializeUnfoldScene(scene) {
  return JSON.stringify({ ...scene, type: "unfold", version: 1 });
}

export function parseUnfoldScene(value) {
  const scene = JSON.parse(value);
  if (
    scene?.type !== "unfold" ||
    !Array.isArray(scene.elements) ||
    !scene.appState || typeof scene.appState !== "object" ||
    !scene.files || typeof scene.files !== "object"
  ) {
    throw new Error("Invalid UNFOLD file");
  }
  return scene;
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
  return typeof value === "string" && /^(?:[\w-]{12}|[a-f0-9]{32})$/.test(value);
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
