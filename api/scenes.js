import { get, put } from "@vercel/blob";
import {
  isEncodedScene,
  isSceneEditKey,
  isSceneId,
  MAX_ENCODED_SCENE_LENGTH,
} from "../src/storage.js";

const blobPath = (id) => `scenes/${id}.txt`;
const keyPath = (id) => `scene-keys/${id}.txt`;

function randomToken(byteLength) {
  const bytes = crypto.getRandomValues(new Uint8Array(byteLength));
  return btoa(String.fromCharCode(...bytes))
    .replaceAll("+", "-")
    .replaceAll("/", "_")
    .replaceAll("=", "");
}

async function keysMatch(left, right) {
  const bytes = new TextEncoder();
  const [leftHash, rightHash] = await Promise.all([
    crypto.subtle.digest("SHA-256", bytes.encode(left)),
    crypto.subtle.digest("SHA-256", bytes.encode(right)),
  ]);
  const leftBytes = new Uint8Array(leftHash);
  const rightBytes = new Uint8Array(rightHash);
  let difference = 0;
  for (let index = 0; index < leftBytes.length; index += 1) {
    difference |= leftBytes[index] ^ rightBytes[index];
  }
  return difference === 0;
}

async function readPayload(request) {
  if (Number(request.headers.get("content-length")) > MAX_ENCODED_SCENE_LENGTH) {
    return new Response("Scene is too large", { status: 413 });
  }
  const payload = await request.text();
  return isEncodedScene(payload)
    ? payload
    : new Response("Invalid scene", { status: 400 });
}

export default {
  async fetch(request) {
    if (request.method === "POST") {
      const payload = await readPayload(request);
      if (payload instanceof Response) return payload;
      const id = randomToken(9);
      const editKey = randomToken(18);
      await put(blobPath(id), payload, {
        access: "private",
        contentType: "text/plain; charset=utf-8",
        cacheControlMaxAge: 60,
      });
      await put(keyPath(id), editKey, {
        access: "private",
        contentType: "text/plain; charset=utf-8",
      });
      return Response.json({ id, editKey }, { status: 201 });
    }

    if (request.method === "PUT") {
      const id = new URL(request.url).searchParams.get("id");
      const editKey = request.headers.get("authorization")?.match(/^Bearer ([\w-]{24})$/)?.[1];
      if (!isSceneId(id) || !isSceneEditKey(editKey)) {
        return new Response("Unauthorized", { status: 401 });
      }
      const storedKey = await get(keyPath(id), { access: "private", useCache: false });
      if (
        !storedKey || storedKey.statusCode !== 200 ||
        !await keysMatch(editKey, await new Response(storedKey.stream).text())
      ) {
        return new Response("Unauthorized", { status: 401 });
      }
      const payload = await readPayload(request);
      if (payload instanceof Response) return payload;
      await put(blobPath(id), payload, {
        access: "private",
        contentType: "text/plain; charset=utf-8",
        cacheControlMaxAge: 60,
        allowOverwrite: true,
      });
      return new Response(null, { status: 204 });
    }

    if (request.method === "GET") {
      const id = new URL(request.url).searchParams.get("id");
      if (!isSceneId(id)) {
        return new Response("Invalid scene id", { status: 400 });
      }

      const result = await get(blobPath(id), {
        access: "private",
        useCache: false,
        ifNoneMatch: request.headers.get("if-none-match") || undefined,
      });
      if (!result || result.statusCode !== 200) {
        if (result?.statusCode === 304) {
          return new Response(null, {
            status: 304,
            headers: { "Cache-Control": "no-store", ETag: result.blob.etag },
          });
        }
        return new Response("Scene not found", { status: 404 });
      }

      return new Response(result.stream, {
        headers: {
          "Content-Type": "text/plain; charset=utf-8",
          "Cache-Control": "no-store",
          ETag: result.blob.etag,
        },
      });
    }

    return new Response("Method not allowed", {
      status: 405,
      headers: { Allow: "GET, POST, PUT" },
    });
  },
};
