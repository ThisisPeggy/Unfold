import assert from "node:assert/strict";
import test from "node:test";
import {
  STORY_ICON_KINDS,
  createGeneratedLecture,
  editorLinkSignature,
  getStoryFrame,
  getStoryIconImage,
  getStoryIconKind,
  getStoryHref,
  getStorySteps,
  getStoryViewBox,
  interpolateStoryViewBox,
  makeStoryPath,
  mergeHermesStoryPath,
  polishStarterElement,
  safeStoryHref,
  stashStoryLinks,
  storyIconKind,
  storyLinkGeometry,
  textHighlightColor,
  textHighlightRects,
  transformStoryCamera,
} from "../src/story.js";

test("frames story steps as a sharp SVG viewBox", () => {
  const frame = getStoryFrame([300, -100, 1300, 400], 32);
  assert.deepEqual(frame, { x: 268, y: -132, width: 1064, height: 564 });
  assert.equal(getStoryViewBox(frame, null), frame);
  assert.deepEqual(
    getStoryViewBox(frame, { x: 700, y: 100, width: 100, height: 50 }, 2),
    { x: 484, y: -16, width: 532, height: 282 },
  );
  const customCamera = { x: 600, y: 0, width: 266, height: 141 };
  assert.deepEqual(getStoryViewBox(frame, customCamera, 4), customCamera);
  assert.deepEqual(interpolateStoryViewBox(frame, { x: 0, y: 0, width: 1, height: 1 }, 0), frame);
  assert.deepEqual(
    interpolateStoryViewBox(frame, { x: 0, y: 0, width: 1, height: 1 }, 1),
    { x: 0, y: 0, width: 1, height: 1 },
  );
});

test("pans and zooms a saved story camera", () => {
  const camera = { x: 100, y: 50, width: 400, height: 200 };
  assert.deepEqual(
    transformStoryCamera(camera, { zoom: 0.8 }),
    { x: 140, y: 70, width: 320, height: 160 },
  );
  assert.deepEqual(
    transformStoryCamera(camera, { panX: 0.125 }),
    { x: 150, y: 50, width: 400, height: 200 },
  );
});

test("chooses a doodle and places it beside linked elements", () => {
  assert.deepEqual(STORY_ICON_KINDS.slice(0, 3), ["camera", "page", "link"]);
  assert.ok(STORY_ICON_KINDS.includes("none"));
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
  linked.customData.storyIcon = "none";
  assert.equal(getStoryIconKind(linked), "none");
  linked.customData.storyIcon = "camera";
  linked.customData.storyIconImage = "data:image/webp;base64,AAAA";
  assert.equal(getStoryIconImage(linked), "data:image/webp;base64,AAAA");
  linked.customData.storyIconImage = "data:image/svg+xml,<svg onload=alert(1)>";
  assert.equal(getStoryIconImage(linked), "");
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

test("merges selected Hermes steps without losing untouched steps or cameras", () => {
  const sceneElements = [
    { id: "a", type: "text", x: 0, y: 0, width: 20, height: 20 },
    { id: "b", type: "text", x: 40, y: 0, width: 20, height: 20 },
  ];
  const camera = { x: 0, y: 0, width: 100, height: 100 };
  const merged = mergeHermesStoryPath(
    sceneElements,
    [
      { id: "first", elementIds: ["a"], title: "旧标题", camera },
      { id: "second", elementIds: ["b"], title: "保留" },
    ],
    [{ elementIds: ["a"], title: "新标题", note: "新讲解" }],
    ["a"],
    () => "new-id",
  );
  assert.deepEqual(merged, [
    { id: "first", elementIds: ["a"], title: "新标题", note: "新讲解", camera },
    { id: "second", elementIds: ["b"], title: "保留" },
  ]);
});

test("grows generated cards for long canvas copy", () => {
  const generated = createGeneratedLecture({
    title: "长内容",
    subtitle: "",
    opening: "开场",
    sections: [
      { title: "一", body: "长".repeat(300), narration: "讲解一" },
      { title: "二", body: "短内容", narration: "讲解二" },
      { title: "三", body: "短内容", narration: "讲解三" },
    ],
    closing: { title: "结尾", body: "结束", narration: "结束讲解" },
  }, (() => { let id = 0; return () => `long-${++id}`; })());
  const sectionCard = generated.elements.find((element) =>
    element.type === "rectangle" && element.width === 480,
  );
  assert.ok(sectionCard.height > 220);
});

test("renders genuinely different radial and layered lecture layouts", () => {
  const document = {
    title: "系统",
    subtitle: "",
    opening: "结构说明",
    sections: [
      { title: "一", body: "内容一", narration: "讲解一" },
      { title: "二", body: "内容二", narration: "讲解二" },
      { title: "三", body: "内容三", narration: "讲解三" },
    ],
    closing: { title: "核心", body: "共同目标", narration: "总结" },
  };
  const ids = () => { let id = 0; return () => `layout-${++id}`; };
  const radial = createGeneratedLecture({ ...document, layout: "radial" }, ids());
  const layers = createGeneratedLecture({ ...document, layout: "layers" }, ids());

  assert.ok(radial.elements.filter((element) => element.type === "ellipse").length >= 4);
  assert.ok(layers.elements.some((element) => element.type === "rectangle" && element.width === 1040));
  assert.equal(radial.steps.length, layers.steps.length);
});

test("snaps a highlighter stroke to the crossed text characters", () => {
  const text = {
    type: "text",
    x: 100,
    y: 50,
    width: 80,
    height: 20,
    angle: 0,
    fontSize: 20,
    lineHeight: 1,
    textAlign: "left",
    text: "ABCD",
  };
  const measureText = (value) => value.length * 20;
  const rects = textHighlightRects(
    text,
    [{ x: 123, y: 60 }, { x: 157, y: 60 }],
    4,
    measureText,
  );

  assert.equal(rects.length, 1);
  assert.deepEqual(rects[0], { x: 118, y: 54, width: 44, height: 15.600000000000001, angle: 0 });
  assert.deepEqual(
    textHighlightRects(text, [{ x: 120, y: 100 }], 4, measureText),
    [],
  );
  assert.equal(textHighlightColor("#37352f"), "#f7e0ca");
  assert.equal(textHighlightColor("#448361"), "#d6e4dc");
});
