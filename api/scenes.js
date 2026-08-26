import { get, put } from "@vercel/blob";
import {
  isEncodedScene,
  isSceneId,
  MAX_ENCODED_SCENE_LENGTH,
} from "../src/storage.js";

const blobPath = (id) => `scenes/${id}.txt`;

export default {
  async fetch(request) {
    if (request.method === "POST") {
      if (Number(request.headers.get("content-length")) > MAX_ENCODED_SCENE_LENGTH) {
        return new Response("Scene is too large", { status: 413 });
      }

      const payload = await request.text();
      if (!isEncodedScene(payload)) {
        return new Response("Invalid scene", { status: 400 });
      }

      const bytes = crypto.getRandomValues(new Uint8Array(9));
      const id = btoa(String.fromCharCode(...bytes))
        .replaceAll("+", "-")
        .replaceAll("/", "_")
        .replaceAll("=", "");
      await put(blobPath(id), payload, {
        access: "private",
        contentType: "text/plain; charset=utf-8",
        cacheControlMaxAge: 31_536_000,
      });
      return Response.json({ id }, { status: 201 });
    }

    if (request.method === "GET") {
      const id = new URL(request.url).searchParams.get("id");
      if (!isSceneId(id)) {
        return new Response("Invalid scene id", { status: 400 });
      }

      const result = await get(blobPath(id), { access: "private" });
      if (!result || result.statusCode !== 200) {
        return new Response("Scene not found", { status: 404 });
      }

      return new Response(result.stream, {
        headers: {
          "Content-Type": "text/plain; charset=utf-8",
          "Cache-Control": "public, max-age=31536000, immutable",
        },
      });
    }

    return new Response("Method not allowed", {
      status: 405,
      headers: { Allow: "GET, POST" },
    });
  },
};
