import assert from "node:assert/strict";
import test from "node:test";
import { getContextMenuPosition, splitContextMenuActions } from "../src/context-menu.js";

test("keeps common canvas actions visible and sends the rest to More", () => {
  assert.deepEqual(
    splitContextMenuActions(["copyAsPng", "paste", "gridMode", "objectsSnapMode", "selectAll"]),
    {
      primary: ["paste", "selectAll", "gridMode", "objectsSnapMode"],
      more: ["copyAsPng"],
    },
  );
  assert.deepEqual(
    splitContextMenuActions([
      "cut",
      "copy",
      "wrapSelectionInFrame",
      "bringToFront",
      "deleteSelectedElements",
    ]),
    {
      primary: ["cut", "copy", "bringToFront", "deleteSelectedElements"],
      more: ["wrapSelectionInFrame"],
    },
  );
});

test("keeps an element menu beside its selection and inside the canvas", () => {
  assert.deepEqual(
    getContextMenuPosition(
      { left: 400, fallbackLeft: 300, top: 100, viewport: { width: 800, height: 600 } },
      { width: 240, height: 300 },
      { width: 800, height: 600 },
    ),
    { left: 410, top: 100 },
  );
  assert.deepEqual(
    getContextMenuPosition(
      { left: 760, fallbackLeft: 600, top: 500, viewport: { width: 800, height: 600 } },
      { width: 240, height: 300 },
      { width: 800, height: 600 },
    ),
    { left: 350, top: 292 },
  );
});
