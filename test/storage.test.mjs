import assert from "node:assert/strict";
import test from "node:test";
import {
  ACTIVE_WORK_STORAGE_KEY,
  createWorkspaceSnapshot,
  decodeScene,
  encodeScene,
  initializeWorkStorage,
  initializeSceneStorage,
  mergeWorkspaceSnapshots,
  isEncodedScene,
  isSceneEditKey,
  isSceneId,
  parseUnfoldScene,
  parseWorkspaceSnapshot,
  publicationKeyForWork,
  readPublication,
  readScene,
  sceneIdFromPath,
  sceneKeyForWork,
  serializeUnfoldScene,
  writePublication,
  writeScene,
  writeWorkspaceSnapshot,
  writeWorks,
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

  const largeScene = { ...scene, elements: [{ id: "large", text: "想法".repeat(30_000) }] };
  assert.equal(writeScene(storage, "large", largeScene), true);
  assert.deepEqual(readScene(storage, "large"), largeScene);
});

test("keeps local storage working when IndexedDB is unavailable", async () => {
  const values = new Map();
  const storage = {
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, value),
  };
  assert.equal(await initializeSceneStorage(storage, null), false);
  assert.equal(writeScene(storage, "scene", { elements: [] }), true);
  assert.deepEqual(readScene(storage, "scene"), { elements: [] });
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

test("imports legacy Excalidraw files as editable UNFOLD scenes", () => {
  const scene = parseUnfoldScene(JSON.stringify({
    type: "excalidraw",
    version: 2,
    elements: [],
    appState: { viewBackgroundColor: "#fff" },
  }));
  assert.deepEqual(scene.files, {});
  assert.deepEqual(scene.storyPath, []);
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
  assert.equal(isSceneId("12345678-1234-4123-8123-123456789abc"), true);
  assert.equal(isSceneId("my-idea"), true);
  assert.equal(isSceneId("My Idea"), false);
  assert.equal(isSceneId("ab"), false);
  assert.equal(sceneIdFromPath("/s/-not-an-id"), null);
  assert.equal(isEncodedScene("H4sIA_test-123"), true);
  assert.equal(isEncodedScene("not valid!"), false);
});

test("publication credentials survive local storage and reject malformed data", () => {
  const values = new Map();
  const storage = {
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, value),
  };
  const publication = { id: "Abc_123-xYz9", editKey: "Abc_123-xYz9Abc_123-xYz9" };

  assert.equal(isSceneEditKey(publication.editKey), true);
  assert.equal(writePublication(storage, "publication", publication), true);
  assert.deepEqual(readPublication(storage, "publication"), publication);
  values.set("publication", '{"id":"12345678-1234-4123-8123-123456789abc"}');
  assert.deepEqual(readPublication(storage, "publication"), {
    id: "12345678-1234-4123-8123-123456789abc",
  });
  values.set("publication", '{"id":"-not-an-id","editKey":"bad"}');
  assert.equal(readPublication(storage, "publication"), null);
});

test("migrates the existing scene and publication into the first local work", () => {
  const values = new Map([
    ["story-canvas.scene.v1", JSON.stringify({ elements: [{ id: "hello" }] })],
    ["story-canvas.publication.v1", JSON.stringify({
      id: "Abc_123-xYz9",
      editKey: "Abc_123-xYz9Abc_123-xYz9",
    })],
  ]);
  const storage = {
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, value),
  };
  const id = "12345678-1234-4123-8123-123456789abc";
  const workspace = initializeWorkStorage(storage, () => id, 123);

  assert.deepEqual(workspace, {
    activeWorkId: id,
    works: [{ id, name: "未命名作品", updatedAt: 123 }],
  });
  assert.deepEqual(readScene(storage, sceneKeyForWork(id)), { elements: [{ id: "hello" }] });
  assert.deepEqual(readPublication(storage, publicationKeyForWork(id)), {
    id: "Abc_123-xYz9",
    editKey: "Abc_123-xYz9Abc_123-xYz9",
  });
  assert.equal(storage.getItem(ACTIVE_WORK_STORAGE_KEY), id);
  assert.deepEqual(initializeWorkStorage(storage, () => "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa"), workspace);
});

test("round-trips a complete cloud workspace snapshot", async () => {
  const values = new Map();
  const storage = {
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, value),
  };
  const id = "12345678-1234-4123-8123-123456789abc";
  const works = [{ id, name: "Cloud", updatedAt: 42 }];
  const scene = { elements: [], appState: {}, files: {}, storyPath: [] };
  writeScene(storage, sceneKeyForWork(id), scene);
  writeWorks(storage, works, 42);
  const snapshot = createWorkspaceSnapshot(storage, works, id);
  assert.deepEqual(parseWorkspaceSnapshot(snapshot), snapshot);
  values.clear();
  assert.equal(await writeWorkspaceSnapshot(storage, snapshot), true);
  assert.deepEqual(readScene(storage, sceneKeyForWork(id)), scene);
  assert.equal(storage.getItem(ACTIVE_WORK_STORAGE_KEY), id);
});

test("merges cloud works without replacing the current local canvas", () => {
  const current = { id: "11111111-1111-4111-8111-111111111111", name: "Current", updatedAt: 1 };
  const other = { id: "22222222-2222-4222-8222-222222222222", name: "Other", updatedAt: 1 };
  const cloudOnly = { id: "33333333-3333-4333-8333-333333333333", name: "Cloud", updatedAt: 2 };
  const localScene = { elements: [{ id: "local" }], appState: {}, files: {} };
  const cloudScene = { elements: [{ id: "cloud" }], appState: {}, files: {} };
  const merged = mergeWorkspaceSnapshots(
    { version: 1, updatedAt: 1, activeWorkId: current.id, works: [current, other], scenes: {} },
    {
      version: 1,
      updatedAt: 2,
      activeWorkId: other.id,
      works: [{ ...current, updatedAt: 2 }, { ...other, updatedAt: 2 }, cloudOnly],
      scenes: { [current.id]: cloudScene, [other.id]: cloudScene, [cloudOnly.id]: cloudScene },
    },
    localScene,
  );
  assert.equal(merged.activeWorkId, current.id);
  assert.deepEqual(merged.works.map(({ id }) => id), [current.id, other.id, cloudOnly.id]);
  assert.equal(merged.scenes[current.id], localScene);
  assert.equal(merged.scenes[other.id], cloudScene);
});

test("restores an arrowhead only for the arrow tool", () => {
  assert.equal(missingArrowhead({ activeTool: { type: "arrow" }, currentItemEndArrowhead: null }), true);
  assert.equal(missingArrowhead({ activeTool: { type: "line" }, currentItemEndArrowhead: null }), false);
  assert.equal(missingArrowhead({ activeTool: { type: "arrow" }, currentItemEndArrowhead: "arrow" }), false);
});
