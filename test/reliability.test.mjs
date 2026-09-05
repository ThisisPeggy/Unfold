import test from "node:test";
import assert from "node:assert/strict";
import { IDBFactory } from "fake-indexeddb";
import { createId } from "../src/id.js";
import { isWorkId } from "../src/storage.js";

function memory() {
  const values = new Map();
  return { get length() { return values.size; }, key: (i) => [...values.keys()][i],
    getItem: (key) => values.get(key) ?? null, setItem: (key, value) => values.set(key, String(value)),
    removeItem: (key) => values.delete(key) };
}

test("fallback IDs survive the work-library validator", () => {
  const ids = new Set(Array.from({ length: 1000 }, () => createId(null)));
  assert.equal(ids.size, 1000);
  ids.forEach((id) => assert.ok(isWorkId(id)));
});

test("failed IndexedDB migration retains the original scene", async () => {
  const store = await import(`../src/storage.js?migration=${Date.now()}`);
  const storage = memory();
  const scene = { elements: [], appState: {}, files: { bad: { dataURL: "invalid-data" } } };
  storage.setItem(store.SCENE_STORAGE_KEY, JSON.stringify(scene));
  await store.initializeSceneStorage(storage, new IDBFactory());
  assert.equal(storage.getItem(store.SCENE_STORAGE_KEY), JSON.stringify(scene));
  assert.deepEqual(store.readScene(storage, store.SCENE_STORAGE_KEY), scene);
});

test("a stale cloud snapshot cannot overwrite local data", async () => {
  const store = await import(`../src/storage.js?guard=${Date.now()}`);
  const storage = memory();
  await store.initializeSceneStorage(storage, new IDBFactory());
  const id = createId(null);
  const local = { elements: [{ id: "new" }], appState: {}, files: {} };
  await store.writeScene(storage, store.sceneKeyForWork(id), local);
  const cloud = { version: 1, updatedAt: 1, activeWorkId: id, works: [{ id, name: "A", updatedAt: 1 }],
    scenes: { [id]: { ...local, elements: [{ id: "old" }] } }, deletedWorks: {} };
  assert.equal(await store.writeWorkspaceSnapshot(storage, cloud, () => false), false);
  assert.deepEqual(store.readScene(storage, store.sceneKeyForWork(id)), local);
});

test("both scene revisions survive a conflicting sync", async () => {
  const { mergeWorkspaceSnapshots } = await import("../src/storage.js");
  const id = createId(null);
  const make = (version) => ({ version: 1, updatedAt: version, activeWorkId: id,
    works: [{ id, name: "A", updatedAt: version }],
    scenes: { [id]: { elements: [{ id: "shape", version }], appState: {}, files: {} } }, deletedWorks: {} });
  const merged = mergeWorkspaceSnapshots(make(1), make(2));
  assert.equal(merged.scenes[id].elements[0].version, 2);
  assert.equal(Object.values(merged.conflicts)[0].scene.elements[0].version, 1);
});
