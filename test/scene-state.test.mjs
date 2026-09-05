import test from "node:test";
import assert from "node:assert/strict";
import { documentAppState, documentSignature } from "../src/scene-state.js";

test("restoring a document does not restore another window's canvas dimensions or marker width", () => {
  assert.deepEqual(documentAppState({ width: 1117, height: 800, offsetLeft: 240,
    zoom: { value: 2 }, currentItemStrokeWidth: 20, selectedElementIds: { a: true },
    viewBackgroundColor: "#ffffff" }), { viewBackgroundColor: "#ffffff" });
});

test("selection and viewport changes do not save a new document revision", () => {
  const scene = { elements: [{ id: "a", version: 1 }], files: {}, storyPath: [], appState: {} };
  assert.equal(documentSignature(scene), documentSignature({ ...scene,
    appState: { width: 1920, scrollX: 30, selectedElementIds: { a: true } } }));
  assert.notEqual(documentSignature(scene), documentSignature({ ...scene,
    elements: [{ id: "a", version: 2 }] }));
});
