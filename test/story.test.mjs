import assert from "node:assert/strict";
import test from "node:test";
import {
  STORY_ICON_KINDS,
  editorLinkSignature,
  getStoryIconKind,
  getStoryHighlight,
  getStoryHref,
  safeStoryHref,
  stashStoryLinks,
  storyIconKind,
  storyLinkGeometry,
} from "../src/story.js";

test("chooses a doodle and places it beside linked text", () => {
  assert.equal(STORY_ICON_KINDS.length, 6);
  assert.equal(storyIconKind("https://unsplash.com/me"), "camera");
  assert.equal(storyIconKind("https://example.com/resume"), "page");
  assert.equal(storyIconKind("mailto:hello@example.com"), "mail");
  assert.equal(storyIconKind("https://github.com/example/project"), "code");
  assert.equal(storyIconKind("https://x.com/example"), "globe");
  assert.equal(storyIconKind("https://example.com/work"), "spark");
  assert.equal(safeStoryHref("javascript:alert(1)"), null);
  assert.equal(safeStoryHref("https://example.com/work"), "https://example.com/work");
  const [linked] = stashStoryLinks([{ id: "a", link: "https://example.com/work" }]);
  assert.equal(linked.link, null);
  assert.equal(getStoryHref(linked), "https://example.com/work");
  linked.customData.storyIcon = "camera";
  linked.customData.storyIconSide = "right";
  assert.equal(getStoryIconKind(linked), "camera");
  linked.customData.storyHighlight = "#2f8f5b";
  assert.equal(getStoryHighlight(linked), "#2f8f5b");
  assert.equal(storyLinkGeometry({ ...linked, x: 100, width: 80, height: 24, fontSize: 20 }).iconX, 185);
  assert.notEqual(
    editorLinkSignature([linked], { zoom: { value: 1 } }),
    editorLinkSignature([linked], { zoom: { value: 2 } }),
  );
  assert.deepEqual(storyLinkGeometry({ x: 100, y: 20, height: 24, fontSize: 20 }), {
    size: 20,
    side: "left",
    iconX: 75,
    iconY: 22,
    underlineY: 47.2,
  });
});
