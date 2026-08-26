import assert from "node:assert/strict";
import test from "node:test";
import {
  buildHermesLectureRequest,
  createHermesConnection,
  hermesConnectorSetupCommand,
  makeHermesConnection,
  normalizeHermesLecturePlan,
  requestHermesLecturePlan,
} from "../src/hermes.js";

const elements = [
  { id: "a", type: "text", text: "开始", x: 0, y: 0, width: 40, height: 20 },
  { id: "b", type: "arrow", x: 40, y: 0, width: 60, height: 20 },
];

test("connects directly to the local Hermes Connector and validates the plan", async () => {
  const generated = createHermesConnection({ getRandomValues: (bytes) => bytes.fill(10) });
  assert.equal(generated.token, "0a".repeat(32));
  assert.match(hermesConnectorSetupCommand("MacIntel"), /install\.sh/);
  assert.match(hermesConnectorSetupCommand("Win32"), /install\.ps1/);
  assert.match(hermesConnectorSetupCommand("MacIntel"), /-Tale-Hermes-Connector/);
  assert.deepEqual(buildHermesLectureRequest(elements, [], "介绍流程").elements[0], {
    id: "a",
    type: "text",
    text: "开始",
    x: 0,
    y: 0,
    width: 40,
    height: 20,
    hasLink: false,
  });
  const scoped = buildHermesLectureRequest(elements, [], "只讲箭头", {
    selectedElementIds: ["b"],
    draftPlan: { mode: "organize", steps: [{ elementIds: ["b"], title: "旧方案" }], extra: "ignored" },
    conversation: [
      { role: "user", text: "你好" },
      { role: "assistant", text: "你好，需要什么帮助？" },
    ],
  });
  assert.equal(scoped.scope, "selection");
  assert.deepEqual(scoped.elements.map((element) => element.id), ["b"]);
  assert.deepEqual(scoped.previousDraft, {
    mode: "organize",
    steps: [{ elementIds: ["b"], title: "旧方案", note: "" }],
  });
  assert.deepEqual(scoped.conversation, [
    { role: "user", text: "你好" },
    { role: "assistant", text: "你好，需要什么帮助？" },
  ]);
  assert.deepEqual(
    normalizeHermesLecturePlan({ mode: "chat", message: "当然可以。" }, elements),
    { mode: "chat", message: "当然可以。" },
  );
  assert.deepEqual(
    normalizeHermesLecturePlan({ steps: [
      { elementIds: ["a", "missing"], title: "开场", note: "先介绍。" },
      { elementIds: ["a", "b"], title: "流程" },
    ] }, elements),
    { mode: "organize", steps: [
      { elementIds: ["a"], title: "开场", note: "先介绍。" },
      { elementIds: ["b"], title: "流程" },
    ] },
  );
  assert.deepEqual(
    normalizeHermesLecturePlan({ mode: "create", document: {
      title: "客户地图",
      subtitle: "把客户放回真实语境",
      opening: "从问题开始。",
      sections: [
        { title: "对象", body: "谁是客户", narration: "先说明对象。" },
        { title: "任务", body: "客户要完成什么", narration: "再说明任务。" },
        { title: "证据", body: "用事实验证", narration: "最后回到证据。" },
      ],
      closing: { title: "形成地图", body: "持续更新", narration: "让地图成为共同语言。" },
    } }, elements),
    { mode: "create", document: {
      title: "客户地图",
      subtitle: "把客户放回真实语境",
      opening: "从问题开始。",
      sections: [
        { title: "对象", body: "谁是客户", narration: "先说明对象。" },
        { title: "任务", body: "客户要完成什么", narration: "再说明任务。" },
        { title: "证据", body: "用事实验证", narration: "最后回到证据。" },
      ],
      closing: { title: "形成地图", body: "持续更新", narration: "让地图成为共同语言。" },
    } },
  );

  class FakeSocket {
    constructor(url, protocol) {
      assert.equal(url, "ws://127.0.0.1:8765/ws");
      assert.match(protocol, /^hermes-browser-token\./);
      this.readyState = 1;
      this.listeners = new Map();
      queueMicrotask(() => this.emit("message", {
        data: JSON.stringify({ method: "event", params: { type: "gateway.ready", payload: {} } }),
      }));
    }
    addEventListener(type, listener) {
      if (!this.listeners.has(type)) this.listeners.set(type, new Set());
      this.listeners.get(type).add(listener);
    }
    emit(type, event = {}) {
      for (const listener of this.listeners.get(type) || []) listener(event);
    }
    send(raw) {
      const frame = JSON.parse(raw);
      if (frame.method === "session.create") {
        this.emit("message", { data: JSON.stringify({ id: frame.id, result: { session_id: "inkpath-test" } }) });
      }
      if (frame.method === "prompt.submit") {
        assert.match(frame.params.text, /Human goal: "介绍流程"/);
        this.emit("message", { data: JSON.stringify({ id: frame.id, result: { status: "streaming" } }) });
        this.emit("message", { data: JSON.stringify({
          method: "event",
          params: {
            type: "message.complete",
            session_id: "inkpath-test",
            payload: { text: '{"mode":"organize","steps":[{"elementIds":["a","b"],"title":"完整流程"}]}' },
          },
        }) });
      }
    }
    close() {
      this.readyState = 3;
    }
  }
  const connection = makeHermesConnection("a".repeat(64));
  const plan = await requestHermesLecturePlan(elements, [], "介绍流程", {
    connection,
    WebSocketImpl: FakeSocket,
  });
  assert.equal(plan.mode, "organize");
  assert.deepEqual(plan.steps[0].elementIds, ["a", "b"]);
});
