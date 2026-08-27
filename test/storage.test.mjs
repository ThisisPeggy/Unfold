import assert from "node:assert/strict";
import test from "node:test";
import {
  decodeScene,
  encodeScene,
  isEncodedScene,
  isSceneId,
  parseUnfoldScene,
  readScene,
  sceneIdFromPath,
  serializeUnfoldScene,
  writeScene,
} from "../src/storage.js";
import { missingArrowhead } from "../src/tool-state.js";

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

test("UNFOLD files preserve the complete scene and reject other JSON", () => {
  const scene = {
    elements: [{ id: "hello" }],
    appState: {},
    files: {},
    storyPath: [{ id: "step", elementIds: ["hello"] }],
  };
  assert.deepEqual(parseUnfoldScene(serializeUnfoldScene(scene)), {
    ...scene,
    type: "unfold",
    version: 1,
  });
  assert.throws(() => parseUnfoldScene('{"type":"excalidraw"}'));
});

test("shared scene links round-trip and reject malformed data", async () => {
  const scene = { elements: [{ id: "hello" }], appState: {}, files: {} };
  assert.deepEqual(await decodeScene(await encodeScene(scene)), scene);
  await assert.rejects(() => decodeScene("not_valid!"));
});

test("published scene ids are strict and parse from share paths", () => {
  const id = "Abc_123-xYz9";
  assert.equal(isSceneId(id), true);
  assert.equal(sceneIdFromPath(`/s/${id}`), id);
  assert.equal(sceneIdFromPath(`/s/${id}/`), id);
  assert.equal(isSceneId("0123456789abcdef0123456789abcdef"), true);
  assert.equal(isSceneId("too-short"), false);
  assert.equal(sceneIdFromPath("/s/not-an-id"), null);
  assert.equal(isEncodedScene("H4sIA_test-123"), true);
  assert.equal(isEncodedScene("not valid!"), false);
});

test("restores an arrowhead only for the arrow tool", () => {
  assert.equal(missingArrowhead({ activeTool: { type: "arrow" }, currentItemEndArrowhead: null }), true);
  assert.equal(missingArrowhead({ activeTool: { type: "line" }, currentItemEndArrowhead: null }), false);
  assert.equal(missingArrowhead({ activeTool: { type: "arrow" }, currentItemEndArrowhead: "arrow" }), false);
});
