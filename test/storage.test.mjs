import assert from "node:assert/strict";
import test from "node:test";
import {
  decodeScene,
  encodeScene,
  readScene,
  writeScene,
} from "../src/storage.js";

test("scene storage survives invalid and valid local data", () => {
  const values = new Map([["scene", "not json"]]);
  const storage = {
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, value),
  };

  assert.equal(readScene(storage, "scene"), null);
  const scene = { elements: [{ id: "hello" }], appState: {}, files: {} };
  assert.equal(writeScene(storage, "scene", scene), true);
  assert.deepEqual(readScene(storage, "scene"), scene);
});

test("shared scene links round-trip and reject malformed data", async () => {
  const scene = { elements: [{ id: "hello" }], appState: {}, files: {} };
  assert.deepEqual(await decodeScene(await encodeScene(scene)), scene);
  await assert.rejects(() => decodeScene("not_valid!"));
});
