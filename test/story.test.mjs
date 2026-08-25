import assert from "node:assert/strict";
import test from "node:test";
import {
  STORY_ICON_KINDS,
  createGeneratedLecture,
  editorLinkSignature,
  getStoryIconKind,
  getStoryHref,
  getStorySteps,
  makeStoryPath,
  polishStarterElement,
  safeStoryHref,
  stashStoryLinks,
  storyIconKind,
  storyLinkGeometry,
} from "../src/story.js";

test("chooses a doodle and places it beside linked elements", () => {
  assert.deepEqual(STORY_ICON_KINDS.slice(0, 3), ["camera", "page", "link"]);
  assert.equal(storyIconKind("https://instagram.com/example"), "instagram");
  assert.equal(storyIconKind("https://linkedin.com/in/example"), "linkedin");
  assert.equal(storyIconKind("https://youtube.com/@example"), "youtube");
  assert.equal(storyIconKind("https://github.com/example/project"), "github");
  assert.equal(storyIconKind("https://x.com/example"), "x");
  assert.equal(storyIconKind("https://wa.me/123"), "whatsapp");
  assert.equal(storyIconKind("https://example.com/photos"), "camera");
  assert.equal(storyIconKind("https://example.com/resume"), "page");
  assert.equal(storyIconKind("https://example.com/work"), "link");
  assert.equal(safeStoryHref("javascript:alert(1)"), null);
  assert.equal(safeStoryHref("https://example.com/work"), "https://example.com/work");
  const [linked] = stashStoryLinks([{ id: "a", type: "rectangle", link: "https://example.com/work" }]);
  assert.equal(linked.link, null);
  assert.equal(getStoryHref(linked), "https://example.com/work");
  linked.customData.storyIcon = "camera";
  linked.customData.storyIconSide = "right";
  assert.equal(getStoryIconKind(linked), "camera");
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
  assert.deepEqual(
    polishStarterElement({ type: "text", text: "照片与生活", x: 700, y: 330 }),
    { type: "text", text: "照片与生活", x: 724, y: 330 },
  );
  assert.deepEqual(
    getStorySteps([
      { id: "plain", type: "text" },
      { id: "second", type: "text", customData: { storyLink: "https://example.com/2", storyStep: 2 } },
      { id: "first", type: "text", customData: { storyLink: "https://example.com/1", storyStep: 1 } },
    ]).map((element) => element.id),
    ["first", "second"],
  );
  assert.deepEqual(
    getStorySteps(
      [
        { id: "label", type: "text", x: 10, y: 20, width: 30, height: 10, text: "组合" },
        { id: "arrow", type: "arrow", x: 0, y: 10, width: 70, height: 50 },
      ],
      [{ id: "group", elementIds: ["label", "arrow"] }],
    ).map(({ id, x, y, width, height, storyElementIds }) => ({ id, x, y, width, height, storyElementIds })),
    [{ id: "group", x: 0, y: 10, width: 70, height: 50, storyElementIds: ["label", "arrow"] }],
  );
  assert.deepEqual(makeStoryPath([{ id: "a", type: "text" }], []), []);
  assert.deepEqual(getStorySteps([{ id: "a", type: "text" }], [{ elementIds: 1 }]), []);
  const customerMapPath = [{
    id: "market",
    elementIds: ["a"],
    title: "从全球市场开始",
    note: "地图把客户分布、可联系时间与市场数据放在同一个工作台里。",
    camera: { x: 10, y: 20, width: 640, height: 360 },
  }];
  const customerMapElements = [
    { id: "a", type: "rectangle", x: 0, y: 0, width: 20, height: 20 },
  ];
  const [customerMapStep] = getStorySteps(customerMapElements, customerMapPath);
  assert.equal(customerMapStep.storyTitle, "从全球市场开始");
  assert.match(customerMapStep.storyNote, /可联系时间/);
  assert.deepEqual(makeStoryPath(customerMapElements, customerMapPath), customerMapPath);
});

test("creates a complete canvas and lecture path from structured content", () => {
  let id = 0;
  const generated = createGeneratedLecture({
    title: "Customer Map",
    subtitle: "从线索到行动",
    opening: "先理解客户，再选择动作。",
    sections: [
      { title: "发现", body: "找到值得关注的市场", narration: "从市场信号开始。" },
      { title: "理解", body: "整理客户任务与阻力", narration: "再理解真实需求。" },
      { title: "行动", body: "把洞察变成下一步", narration: "最后推动行动。" },
    ],
    closing: { title: "持续更新", body: "地图随着证据演进", narration: "它不是一次性报告。" },
  }, () => `generated-${++id}`);
  const covered = generated.steps.flatMap((step) => step.elementIds);
  assert.equal(generated.steps.length, 5);
  assert.equal(new Set(covered).size, generated.elements.length);
  assert.deepEqual(new Set(generated.elements.map((element) => element.type)), new Set(["text", "arrow", "rectangle", "ellipse"]));
});
