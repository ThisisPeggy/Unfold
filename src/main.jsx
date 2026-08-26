import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { createRoot } from "react-dom/client";
import {
  convertToExcalidrawElements,
  Excalidraw,
  exportToSvg,
  FONT_FAMILY,
  getCommonBounds,
  MainMenu,
  newElementWith,
  WelcomeScreen,
} from "@excalidraw/excalidraw";
import "@excalidraw/excalidraw/index.css";
import "./styles.css";
import AssistantMascot from "./AssistantMascot.jsx";
import { decodeScene, encodeScene, readScene, writeScene } from "./storage.js";
import {
  clearHermesConnection,
  createHermesConnection,
  hermesConnectorSetupCommand,
  readHermesConnection,
  requestHermesLecturePlan,
  saveHermesConnection,
  testHermesConnection,
} from "./hermes.js";
import {
  STORY_ICON_KINDS,
  createGeneratedLecture,
  editorLinkSignature,
  getStoryIconKind,
  getStoryHref,
  getStorySteps,
  makeStoryPath,
  mergeHermesStoryPath,
  polishStarterElement,
  safeStoryHref,
  stashStoryLinks,
  storyIconKind,
  storyLinkGeometry,
} from "./story.js";

const STORAGE_KEY = "story-canvas.scene.v1";
const PAPER = "#ffffff";
const STORY_PADDING = 32;
const HIGHLIGHTS = ["#337ea9", "#448361", "#9f6b53"];
const HIGHLIGHT_WIDTHS = [12, 20, 32];

function hermesSceneRevision(scene) {
  return JSON.stringify([
    scene.elements.filter((element) => !element.isDeleted).map((element) => [element.id, element.version]),
    scene.storyPath ?? [],
  ]);
}

function hermesConnectionMessage(error) {
  const message = String(error?.message || error || "");
  if (/口令|拒绝/.test(message)) return "配对口令不匹配。请重新复制口令，或重新生成后再次配对。";
  if (/WebSocket/.test(message)) return "当前浏览器无法连接本机 Connector。";
  return "尚未连接到本机 Connector。请确认安装命令已成功运行。";
}

function AssistantMessageText({ text }) {
  return (
    <p className="assistant-message-text">
      {String(text).split(/(https?:\/\/[^\s]+)/g).map((part, index) =>
        /^https?:\/\//.test(part)
          ? <a key={`${index}-${part}`} href={part} target="_blank" rel="noreferrer">{part}</a>
          : part,
      )}
    </p>
  );
}
const STORY_ICON_LABELS = {
  camera: "照片",
  page: "页面",
  link: "通用链接",
  instagram: "Instagram",
  linkedin: "LinkedIn",
  youtube: "YouTube",
  x: "X",
  github: "GitHub",
  whatsapp: "WhatsApp",
};
const LEGACY_COLORS = {
  "#4f7fd8": "#337ea9",
  "#3b72c4": "#337ea9",
  "#4f9a73": "#448361",
  "#2f8f5b": "#448361",
  "#c47a2c": "#9f6b53",
  "#b8751a": "#9f6b53",
};

function starterScene() {
  return withoutNativeLinks({
    elements: convertToExcalidrawElements([
      {
        type: "text",
        x: 418,
        y: 300,
        text: "你好，我是 Peggy。",
        fontFamily: FONT_FAMILY.Helvetica,
        fontSize: 22,
        strokeColor: "#4a4843",
      },
      {
        type: "text",
        x: 370,
        y: 344,
        text: "我做产品，也把想法变成作品。",
        fontFamily: FONT_FAMILY.Helvetica,
        fontSize: 18,
        strokeColor: "#4a4843",
      },
      {
        type: "text",
        x: 420,
        y: 160,
        text: "Customer Map",
        fontFamily: FONT_FAMILY.Excalifont,
        fontSize: 22,
        strokeColor: "#337ea9",
        link: "https://www.customer-map.com/",
      },
      {
        type: "arrow",
        x: 485,
        y: 215,
        points: [[0, 0], [0, 54]],
        strokeColor: "#337ea9",
        endArrowhead: "arrow",
        roughness: 1,
      },
      {
        type: "text",
        x: 724,
        y: 330,
        text: "产品与生活",
        fontFamily: FONT_FAMILY.Excalifont,
        fontSize: 22,
        strokeColor: "#448361",
      },
      {
        type: "arrow",
        x: 704,
        y: 344,
        points: [[0, 0], [-72, 0]],
        strokeColor: "#448361",
        endArrowhead: "arrow",
        roughness: 1,
      },
      {
        type: "text",
        x: 275,
        y: 450,
        text: "关于 Peggy",
        fontFamily: FONT_FAMILY.Excalifont,
        fontSize: 22,
        strokeColor: "#9f6b53",
      },
      {
        type: "arrow",
        x: 375,
        y: 430,
        points: [[0, 0], [38, -44]],
        strokeColor: "#9f6b53",
        endArrowhead: "arrow",
        roughness: 1,
      },
    ]),
    files: {},
    appState: { viewBackgroundColor: PAPER },
    scrollToContent: true,
  });
}

function withoutNativeLinks(scene) {
  return {
    ...scene,
    elements: stashStoryLinks(scene.elements).map((element) =>
      polishStarterElement(
        LEGACY_COLORS[element.strokeColor]
          ? { ...element, strokeColor: LEGACY_COLORS[element.strokeColor] }
          : element,
      ),
    ),
    appState: { ...scene.appState, viewBackgroundColor: PAPER },
  };
}

function EyeIcon({ crossed = false }) {
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24">
      <path d="M2.5 12s3.4-6 9.5-6 9.5 6 9.5 6-3.4 6-9.5 6-9.5-6-9.5-6Z" />
      <circle cx="12" cy="12" r="2.5" />
      {crossed && <path d="m4 4 16 16" />}
    </svg>
  );
}

function ChevronIcon({ direction }) {
  const paths = {
    left: "m15 18-6-6 6-6",
    right: "m9 6 6 6-6 6",
    up: "m6 15 6-6 6 6",
    down: "m6 9 6 6 6-6",
  };
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24">
      <path d={paths[direction]} />
    </svg>
  );
}

function PathIcon() {
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24">
      <circle cx="5" cy="6" r="1" />
      <circle cx="5" cy="12" r="1" />
      <circle cx="5" cy="18" r="1" />
      <path d="M9 6h10M9 12h10M9 18h10" />
    </svg>
  );
}

function SendIcon() {
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24">
      <path d="m5 12 14-7-4 14-3-5-7-2Z" />
      <path d="m12 14 3-3" />
    </svg>
  );
}

function storyElementLabel(element) {
  const text = element?.text?.trim().replace(/\s+/g, " ");
  if (text) return text;
  if ((element?.storyElementIds?.length ?? 0) > 1) {
    return `${element.storyElementIds.length} 个元素`;
  }
  return {
    image: "图片",
    rectangle: "矩形",
    ellipse: "椭圆",
    diamond: "菱形",
    arrow: "箭头",
    line: "线条",
    freedraw: "手绘",
    frame: "画框",
    embeddable: "嵌入内容",
  }[element?.type] ?? "画面";
}

function storyStepLabel(element) {
  return element?.storyTitle?.trim() || storyElementLabel(element);
}

function HighlighterTool({ active, color, onToggle, onColor, onWidth, target, width }) {
  if (!target) return null;
  return createPortal(
    <div className="highlighter-control">
      <button
        className="highlighter-tool"
        type="button"
        style={{ "--marker-color": color }}
        aria-label={active ? "关闭高亮笔" : "使用高亮笔"}
        aria-pressed={active}
        aria-expanded={active}
        aria-controls="highlighter-options"
        onClick={onToggle}
      >
        <svg aria-hidden="true" viewBox="0 0 24 24">
          <path d="m14.8 3.8 5.4 5.4-8.7 8.7H6.1v-5.4Z" />
          <path d="m7.4 11.2 5.4 5.4M4 21h16" />
        </svg>
        <span className="highlighter-tool__ink" aria-hidden="true" />
      </button>
      {active && (
        <div id="highlighter-options" className="highlighter-colors">
          <div className="highlighter-options-row" role="radiogroup" aria-label="高亮颜色">
            {HIGHLIGHTS.map((value, index) => (
              <button
                key={value}
                className="highlighter-color"
                type="button"
                role="radio"
                aria-checked={color === value}
                aria-label={["蓝色", "绿色", "琥珀色"][index]}
                onClick={() => onColor(value)}
              >
                <span style={{ background: value }} />
              </button>
            ))}
          </div>
          <div className="highlighter-options-row" role="radiogroup" aria-label="高亮粗细">
            {HIGHLIGHT_WIDTHS.map((value, index) => (
              <button
                key={value}
                className="highlighter-width"
                type="button"
                role="radio"
                aria-checked={width === value}
                aria-label={["细", "中", "粗"][index]}
                onClick={() => onWidth(value)}
              >
                <span style={{ height: Math.max(3, value / 3) }} />
              </button>
            ))}
          </div>
        </div>
      )}
    </div>,
    target,
  );
}

function LinkDoodle({ kind, x, y, size }) {
  const common = {
    className: "story-link-icon",
    x,
    y,
    width: size,
    height: size,
    viewBox: "0 0 24 24",
    fill: "none",
    stroke: "currentColor",
    strokeLinecap: "round",
    strokeLinejoin: "round",
    strokeWidth: 1.8,
  };
  const paths = {
    camera: <><path d="M14.5 4 16 7h3a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V9a2 2 0 0 1 2-2h3l1.5-3Z" /><circle cx="12" cy="13" r="4" /></>,
    page: <><path d="M6 2h8l4 4v16H6Z" /><path d="M14 2v5h5M9 12h6M9 16h6" /></>,
    instagram: <path fill="currentColor" stroke="none" d="M7.0301.084c-1.2768.0602-2.1487.264-2.911.5634-.7888.3075-1.4575.72-2.1228 1.3877-.6652.6677-1.075 1.3368-1.3802 2.127-.2954.7638-.4956 1.6365-.552 2.914-.0564 1.2775-.0689 1.6882-.0626 4.947.0062 3.2586.0206 3.6671.0825 4.9473.061 1.2765.264 2.1482.5635 2.9107.308.7889.72 1.4573 1.388 2.1228.6679.6655 1.3365 1.0743 2.1285 1.38.7632.295 1.6361.4961 2.9134.552 1.2773.056 1.6884.069 4.9462.0627 3.2578-.0062 3.668-.0207 4.9478-.0814 1.28-.0607 2.147-.2652 2.9098-.5633.7889-.3086 1.4578-.72 2.1228-1.3881.665-.6682 1.0745-1.3378 1.3795-2.1284.2957-.7632.4966-1.636.552-2.9124.056-1.2809.0692-1.6898.063-4.948-.0063-3.2583-.021-3.6668-.0817-4.9465-.0607-1.2797-.264-2.1487-.5633-2.9117-.3084-.7889-.72-1.4568-1.3876-2.1228C21.2982 1.33 20.628.9208 19.8378.6165 19.074.321 18.2017.1197 16.9244.0645 15.6471.0093 15.236-.005 11.977.0014 8.718.0076 8.31.0215 7.0301.0839m.1402 21.6932c-1.17-.0509-1.8053-.2453-2.2287-.408-.5606-.216-.96-.4771-1.3819-.895-.422-.4178-.6811-.8186-.9-1.378-.1644-.4234-.3624-1.058-.4171-2.228-.0595-1.2645-.072-1.6442-.079-4.848-.007-3.2037.0053-3.583.0607-4.848.05-1.169.2456-1.805.408-2.2282.216-.5613.4762-.96.895-1.3816.4188-.4217.8184-.6814 1.3783-.9003.423-.1651 1.0575-.3614 2.227-.4171 1.2655-.06 1.6447-.072 4.848-.079 3.2033-.007 3.5835.005 4.8495.0608 1.169.0508 1.8053.2445 2.228.408.5608.216.96.4754 1.3816.895.4217.4194.6816.8176.9005 1.3787.1653.4217.3617 1.056.4169 2.2263.0602 1.2655.0739 1.645.0796 4.848.0058 3.203-.0055 3.5834-.061 4.848-.051 1.17-.245 1.8055-.408 2.2294-.216.5604-.4763.96-.8954 1.3814-.419.4215-.8181.6811-1.3783.9-.4224.1649-1.0577.3617-2.2262.4174-1.2656.0595-1.6448.072-4.8493.079-3.2045.007-3.5825-.006-4.848-.0608M16.953 5.5864A1.44 1.44 0 1 0 18.39 4.144a1.44 1.44 0 0 0-1.437 1.4424M5.8385 12.012c.0067 3.4032 2.7706 6.1557 6.173 6.1493 3.4026-.0065 6.157-2.7701 6.1506-6.1733-.0065-3.4032-2.771-6.1565-6.174-6.1498-3.403.0067-6.156 2.771-6.1496 6.1738M8 12.0077a4 4 0 1 1 4.008 3.9921A3.9996 3.9996 0 0 1 8 12.0077" />,
    linkedin: <><rect x="3" y="3" width="18" height="18" rx="2" /><path d="M8 10v7M8 7v.01M12 17v-7m0 3.2c.7-2.7 5-2.9 5 1V17" /></>,
    youtube: <><path d="M21 12c0 3.8-.5 5.4-1.2 6.1-.8.8-2.8 1-7.8 1s-7-.2-7.8-1C3.5 17.4 3 15.8 3 12s.5-5.4 1.2-6.1c.8-.8 2.8-1 7.8-1s7 .2 7.8 1c.7.7 1.2 2.3 1.2 6.1Z" /><path d="m10 9 5 3-5 3Z" /></>,
    x: <><path d="m5 4 14 16M19 4 5 20" /></>,
    github: <path d="M15 22v-4a4.8 4.8 0 0 0-1-3.5c3.3-.4 6.7-1.6 6.7-7A5.4 5.4 0 0 0 19.3 4 5 5 0 0 0 19.2.5S18.1.1 15 1.8a13.4 13.4 0 0 0-7 0C4.9.1 3.8.5 3.8.5A5 5 0 0 0 3.7 4a5.4 5.4 0 0 0-1.4 3.7c0 5.4 3.4 6.6 6.7 7A4.8 4.8 0 0 0 8 18v4M8 19c-3 .9-3-1.5-4.2-2" />,
    whatsapp: <path fill="currentColor" stroke="none" d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 0 1-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 0 1-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 0 1 2.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0 0 12.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 0 0 5.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 0 0-3.48-8.413Z" />,
    link: <><path d="M10 13a5 5 0 0 0 7.5.5l2-2a5 5 0 0 0-7-7l-1.1 1.1" /><path d="M14 11a5 5 0 0 0-7.5-.5l-2 2a5 5 0 0 0 7 7l1.1-1.1" /></>,
  };
  return <svg {...common}>{paths[kind] ?? paths.link}</svg>;
}

function EditorLinkIcons({ elements, appState, activeLinkId, onEditLink, showSteps, storyPath }) {
  const zoom = appState?.zoom?.value ?? 1;
  const transform = `translate(${appState?.offsetLeft ?? 0} ${appState?.offsetTop ?? 0}) scale(${zoom}) translate(${appState?.scrollX ?? 0} ${appState?.scrollY ?? 0})`;
  const linkedElements = elements.filter(
    (element) => !element.isDeleted && getStoryHref(element),
  );
  const storySteps = getStorySteps(elements, storyPath);

  return (
    <>
      <svg className="editor-story-icons" aria-hidden="true">
        <g transform={transform}>
          {linkedElements.map((element) => {
            const { size, iconX, iconY } = storyLinkGeometry(element);
            const centerX = element.x + element.width / 2;
            const centerY = element.y + element.height / 2;
            return (
              <g
                key={`${element.id}-icon`}
                style={{ color: element.strokeColor }}
                transform={`rotate(${(element.angle * 180) / Math.PI} ${centerX} ${centerY})`}
              >
                <LinkDoodle
                  kind={getStoryIconKind(element)}
                  x={iconX}
                  y={iconY}
                  size={size}
                />
              </g>
            );
          })}
          {showSteps && storySteps.map((element, index) => {
            const x = element.x + element.width / 2;
            const y = element.y - 14;
            const centerX = element.x + element.width / 2;
            const centerY = element.y + element.height / 2;
            return (
              <g
                key={`${element.id}-step`}
                className="editor-story-step"
                transform={`rotate(${(element.angle * 180) / Math.PI} ${centerX} ${centerY})`}
              >
                <circle cx={x} cy={y} r="10" />
                <text x={x} y={y}>{index + 1}</text>
              </g>
            );
          })}
        </g>
      </svg>
      <div className="editor-link-buttons">
        {linkedElements.map((element) => {
          const { size, iconX, iconY } = storyLinkGeometry(element);
          const left =
            (appState?.offsetLeft ?? 0) +
            (iconX + size / 2 + (appState?.scrollX ?? 0)) * zoom;
          const top =
            (appState?.offsetTop ?? 0) +
            (iconY + size / 2 + (appState?.scrollY ?? 0)) * zoom;
          const active = activeLinkId === element.id;
          return (
            <button
              key={element.id}
              className="editor-link-button"
              type="button"
              style={{ left, top }}
              aria-label={`设置链接：${element.text || "图形"}`}
              aria-haspopup="dialog"
              aria-expanded={active}
              aria-controls={active ? "story-link-popover" : undefined}
              onClick={(event) => onEditLink(element.id, event.currentTarget)}
            />
          );
        })}
      </div>
    </>
  );
}

function HermesAssistantPanel({
  canUndo,
  canvasHasContent,
  onApplyPlan,
  onClearSelection,
  onClose,
  onConnectionChange,
  onGeneratePlan,
  onUndoPlan,
  open,
  selectionCount,
}) {
  const [connection, setConnection] = useState(() => {
    const saved = readHermesConnection();
    return saved ?? saveHermesConnection(createHermesConnection());
  });
  const [connectionState, setConnectionState] = useState("checking");
  const [connectionError, setConnectionError] = useState("");
  const [checkVersion, setCheckVersion] = useState(0);
  const [copied, setCopied] = useState("");
  const [input, setInput] = useState("");
  const [messages, setMessages] = useState([]);
  const [busy, setBusy] = useState(false);
  const [compact, setCompact] = useState(() => window.matchMedia("(max-width: 640px)").matches);
  const composerRef = useRef(null);
  const conversationRef = useRef(null);
  const firstActionRef = useRef(null);
  const generationRef = useRef(null);
  const panelRef = useRef(null);
  const command = useMemo(() => hermesConnectorSetupCommand(), []);

  useEffect(() => {
    if (!open) return undefined;
    let active = true;
    let timer;
    const check = async () => {
      setConnectionState((state) => state === "connected" ? state : "checking");
      try {
        await testHermesConnection(connection);
        if (!active) return;
        setConnectionError("");
        setConnectionState("connected");
        onConnectionChange(true);
        timer = window.setTimeout(check, 10_000);
      } catch (error) {
        if (!active) return;
        setConnectionError(hermesConnectionMessage(error));
        setConnectionState("waiting");
        onConnectionChange(false);
        timer = window.setTimeout(check, 5_000);
      }
    };
    check();
    return () => {
      active = false;
      window.clearTimeout(timer);
    };
  }, [checkVersion, connection, onConnectionChange, open]);

  useEffect(() => {
    const media = window.matchMedia("(max-width: 640px)");
    const update = () => setCompact(media.matches);
    media.addEventListener("change", update);
    return () => media.removeEventListener("change", update);
  }, []);

  useEffect(() => {
    if (!open) return undefined;
    const handleKeys = (event) => {
      if (event.key === "Escape") {
        generationRef.current?.abort();
        onClose();
        return;
      }
      if (event.key !== "Tab" || !compact) return;
      const focusable = [...panelRef.current.querySelectorAll(
        'button:not(:disabled), textarea:not(:disabled), a[href], [tabindex]:not([tabindex="-1"])',
      )];
      if (!focusable.length) return;
      const first = focusable[0];
      const last = focusable.at(-1);
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };
    document.addEventListener("keydown", handleKeys);
    return () => document.removeEventListener("keydown", handleKeys);
  }, [compact, onClose, open]);

  useEffect(() => {
    if (!open) return;
    requestAnimationFrame(() =>
      (connectionState === "connected" ? composerRef : firstActionRef).current?.focus(),
    );
  }, [open]);

  useEffect(() => {
    if (open && connectionState === "connected") composerRef.current?.focus();
  }, [connectionState, open]);

  useEffect(() => {
    conversationRef.current?.scrollTo({ top: conversationRef.current.scrollHeight });
  }, [busy, messages]);

  const copyValue = async (kind, value) => {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(kind);
      window.setTimeout(() => setCopied(""), 1600);
    } catch {
      window.prompt("请复制", value);
    }
  };

  const resetPairing = () => {
    if (!window.confirm("重新生成口令会使当前 Connector 失效，确定继续吗？")) return;
    clearHermesConnection();
    const next = saveHermesConnection(createHermesConnection());
    setConnection(next);
    setConnectionState("checking");
    onConnectionChange(false);
  };

  const submitPrompt = async (prompt, appendUser = true) => {
    if (!prompt || busy || connectionState !== "connected") return;
    const id = crypto.randomUUID();
    const conversation = messages
      .filter((message) => !message.error)
      .slice(-8)
      .map(({ role, text }) => ({ role, text }));
    if (appendUser) setMessages((value) => [...value, { id, role: "user", text: prompt }]);
    setInput("");
    setBusy(true);
    const controller = new AbortController();
    generationRef.current = controller;
    try {
      const draftPlan = [...messages].reverse().find((message) => message.plan)?.plan;
      const plan = await onGeneratePlan(prompt, draftPlan, conversation, controller.signal);
      setMessages((value) => [...value, {
        id: crypto.randomUUID(),
        role: "assistant",
        text: plan.mode === "chat"
          ? plan.message
          : plan.mode === "create"
            ? `内容、大纲和画布已经设计好，共 ${plan.steps.length} 个讲解步骤。`
            : `我整理了 ${plan.steps.length} 个讲解步骤。`,
        ...(plan.mode === "chat" ? {} : { plan, requestPrompt: prompt }),
      }]);
    } catch (error) {
      setMessages((value) => [...value, {
        id: crypto.randomUUID(),
        role: "assistant",
        text: error?.name === "AbortError"
          ? "已停止生成。"
          : error?.message || "Hermes 暂时无法完成这次请求。",
        error: error?.name !== "AbortError",
        ...(error?.name === "AbortError" ? {} : { retryPrompt: prompt }),
      }]);
      if (error?.name !== "AbortError") setInput(prompt);
    } finally {
      generationRef.current = null;
      setBusy(false);
    }
  };

  const send = (event) => {
    event.preventDefault();
    submitPrompt(input.trim());
  };

  const closePanel = () => {
    generationRef.current?.abort();
    onClose();
  };

  return (
    <aside
      ref={panelRef}
      id="hermes-assistant-panel"
      className="hermes-assistant-panel"
      hidden={!open}
      role="dialog"
      aria-modal={compact}
      aria-labelledby="hermes-assistant-title"
    >
      <header>
        <h2 id="hermes-assistant-title">助手 <span>· Hermes</span></h2>
        <button type="button" className="assistant-icon-button" aria-label="关闭 Hermes" onClick={closePanel}>−</button>
      </header>
      <span className="visually-hidden" role="status" aria-live="polite">
        {copied === "command" ? "安装命令已复制" : copied === "token" ? "配对口令已复制" : ""}
      </span>

      {connectionState !== "connected" ? (
        <div className="hermes-connect-view">
          <div className="hermes-connect-intro">
            <div>
              <span className="hermes-connect-eyebrow">本机连接</span>
              <h3>连接 Hermes</h3>
              <p>在这台电脑完成一次配对，之后会自动连接。</p>
            </div>
            <span className="hermes-connect-status">
              <i data-state={connectionState} aria-hidden="true" />
              {connectionState === "checking" ? "正在检查" : "等待连接"}
            </span>
          </div>
          <ol className="hermes-connect-steps">
            <li>
              <span>1</span>
              <div>
                <strong>安装 Connector</strong>
                <p>复制命令，在终端中运行。</p>
                <button ref={firstActionRef} type="button" onClick={() => copyValue("command", command)}>
                  {copied === "command" ? "已复制安装命令" : "复制安装命令"}
                </button>
              </div>
            </li>
            <li>
              <span>2</span>
              <div>
                <strong>完成配对</strong>
                <p>终端询问配对口令时，粘贴下面的口令。</p>
                <button type="button" onClick={() => copyValue("token", connection.token)}>
                  {copied === "token" ? "已复制配对口令" : "复制配对口令"}
                </button>
              </div>
            </li>
          </ol>
          {connectionError && (
            <div className="hermes-connect-error" role="alert">
              <p>{connectionError}</p>
              <button type="button" onClick={() => setCheckVersion((value) => value + 1)}>再次检查</button>
            </div>
          )}
          <div className="hermes-connect-footer">
            <p><strong>仅本机</strong> Connector 只监听 127.0.0.1，不对公网开放。</p>
            <button type="button" className="hermes-reset-pairing" onClick={resetPairing}>重新生成口令</button>
          </div>
        </div>
      ) : (
        <>
          <div ref={conversationRef} className="assistant-conversation" role="log" aria-live="polite">
            {!messages.length ? (
              <div className="assistant-empty-state">
                <AssistantMascot working={busy} />
                <h3><span>问问题，也可以整理画布。</span><span>今天想做什么？</span></h3>
                <p>Hermes 可以聊天、写作和设计讲解路径，但不会联网查询实时信息。</p>
              </div>
            ) : messages.map((message) => (
              <div
                key={message.id}
                className={`assistant-message assistant-message--${message.role}${message.error ? " assistant-message--error" : ""}`}
                role={message.error ? "alert" : undefined}
              >
                <AssistantMessageText text={message.text} />
                {message.retryPrompt && (
                  <button
                    type="button"
                    className="assistant-retry"
                    disabled={busy}
                    onClick={() => {
                      setMessages((value) => value.map((item) =>
                        item.id === message.id ? { ...item, retryPrompt: null } : item,
                      ));
                      submitPrompt(message.retryPrompt, false);
                    }}
                  >
                    重试
                  </button>
                )}
                {message.plan && (
                  <section className="assistant-plan">
                    {message.plan.mode === "create" && (
                      <>
                        <p className="assistant-plan-warning">将替换当前画布；应用后可以立即撤销。</p>
                        <details className="assistant-document-preview">
                          <summary>查看将写入画布的内容</summary>
                          <h4>{message.plan.document.title}</h4>
                          {message.plan.document.subtitle && <p>{message.plan.document.subtitle}</p>}
                          {message.plan.document.sections.map((section) => (
                            <div key={section.title}>
                              <strong>{section.title}</strong>
                              <p>{section.body}</p>
                            </div>
                          ))}
                          <div>
                            <strong>{message.plan.document.closing.title}</strong>
                            <p>{message.plan.document.closing.body}</p>
                          </div>
                        </details>
                      </>
                    )}
                    <ol>
                      {message.plan.steps.map((step, index) => (
                        <li key={`${index}-${step.title}`}>
                          <span>{index + 1}</span>
                          <div><strong>{step.title}</strong>{step.note && <small>{step.note}</small>}</div>
                        </li>
                      ))}
                    </ol>
                    <button
                      type="button"
                      disabled={message.applied && (!message.undoable || !canUndo)}
                      onClick={() => {
                        if (message.applied) {
                          const undoError = onUndoPlan();
                          setMessages((value) => value.map((item) =>
                            item.id === message.id
                              ? undoError
                                ? { ...item, undoable: false, text: undoError, error: true }
                                : { ...item, applied: false, undoable: false, text: "已撤销这次 Hermes 更改。", error: false }
                              : item,
                          ));
                          return;
                        }
                        if (message.plan.mode === "create" && canvasHasContent && !window.confirm(
                          "这会替换当前画布。应用后可在继续编辑前撤销，确定继续吗？",
                        )) return;
                        const error = onApplyPlan(message.plan);
                        setMessages((value) => value.map((item) =>
                          item.id === message.id
                            ? error
                              ? {
                                  ...item,
                                  plan: undefined,
                                  text: error,
                                  error: true,
                                  retryPrompt: item.requestPrompt,
                                }
                              : { ...item, applied: true, undoable: true, error: false }
                            : { ...item, undoable: false },
                        ));
                      }}
                    >
                      {message.applied
                        ? (message.undoable && canUndo ? "撤销 Hermes 更改" : "已应用（撤销已过期）")
                        : (message.plan.mode === "create" ? "替换当前画布" : "应用讲解方案")}
                    </button>
                  </section>
                )}
              </div>
            ))}
            {busy && (
              <div className="assistant-typing">
                <span role="status"><i /><i /><i />Hermes 正在思考…</span>
                <button type="button" onClick={() => generationRef.current?.abort()}>停止</button>
              </div>
            )}
          </div>
          {selectionCount > 0 && (
            <div className="assistant-scope" role="status">
              <span>仅处理已选中的 {selectionCount} 个元素</span>
              <button type="button" onClick={onClearSelection}>清除选区</button>
            </div>
          )}
          <form className="assistant-composer" onSubmit={send}>
            <textarea
              ref={composerRef}
              rows="1"
              maxLength="600"
              value={input}
              placeholder="问问题或调整画布…"
              aria-label="发送给 Hermes 的消息"
              onChange={(event) => setInput(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter" && !event.shiftKey) {
                  event.preventDefault();
                  event.currentTarget.form?.requestSubmit();
                }
              }}
            />
            <span className="assistant-input-meta" aria-hidden="true">{input.length}/600</span>
            <button type="submit" disabled={!input.trim() || busy} aria-label="发送消息"><SendIcon /></button>
          </form>
        </>
      )}
    </aside>
  );
}

function StoryPathEditor({
  steps,
  selectedCount,
  onAdd,
  onCaptureCamera,
  onClose,
  onMove,
  onRemove,
  onUpdate,
}) {
  const [draggedStepId, setDraggedStepId] = useState(null);
  const [dropTargetId, setDropTargetId] = useState(null);
  const [editingStepId, setEditingStepId] = useState(null);
  const editingStep = steps.find((step) => step.id === editingStepId) ?? null;

  useEffect(() => {
    const closeOnEscape = (event) => {
      if (event.key === "Escape") onClose();
    };
    document.addEventListener("keydown", closeOnEscape);
    return () => document.removeEventListener("keydown", closeOnEscape);
  }, [onClose]);

  return (
    <section
      id="story-path-editor"
      className="story-path-editor"
      role="dialog"
      aria-modal="false"
      aria-labelledby="story-path-title"
    >
      <header>
        <div>
          <h2 id="story-path-title">讲解路径</h2>
          <p>选择元素添加步骤，再写下要讲的内容。</p>
        </div>
        <button type="button" className="path-icon-button" aria-label="关闭讲解路径" onClick={onClose}>×</button>
      </header>
      {steps.length ? (
        <ol className="story-path-list">
          {steps.map((element, index) => (
            <li
              key={element.id}
              className={`${editingStepId === element.id ? "story-path-item--editing " : ""}${draggedStepId === element.id ? "story-path-item--dragging" : ""}${dropTargetId === element.id && draggedStepId !== element.id ? " story-path-item--drop-target" : ""}`}
              draggable
              title="拖动排序"
              onDragStart={(event) => {
                if (event.target.closest("button")) {
                  event.preventDefault();
                  return;
                }
                event.dataTransfer.effectAllowed = "move";
                event.dataTransfer.setData("text/plain", element.id);
                setDraggedStepId(element.id);
              }}
              onDragOver={(event) => {
                event.preventDefault();
                event.dataTransfer.dropEffect = "move";
                setDropTargetId(element.id);
              }}
              onDrop={(event) => {
                event.preventDefault();
                const sourceId = event.dataTransfer.getData("text/plain") || draggedStepId;
                const sourceIndex = steps.findIndex((step) => step.id === sourceId);
                if (sourceIndex >= 0 && sourceIndex !== index) {
                  onMove(sourceIndex, index - sourceIndex);
                }
                setDraggedStepId(null);
                setDropTargetId(null);
              }}
              onDragEnd={() => {
                setDraggedStepId(null);
                setDropTargetId(null);
              }}
            >
              <span className="story-path-drag-handle" aria-hidden="true">
                <svg viewBox="0 0 12 18">
                  <circle cx="3" cy="4" r="1" />
                  <circle cx="9" cy="4" r="1" />
                  <circle cx="3" cy="9" r="1" />
                  <circle cx="9" cy="9" r="1" />
                  <circle cx="3" cy="14" r="1" />
                  <circle cx="9" cy="14" r="1" />
                </svg>
              </span>
              <span className="story-path-number">{index + 1}</span>
              <button
                type="button"
                className="story-path-label"
                aria-label={`编辑讲解：${storyStepLabel(element)}`}
                aria-expanded={editingStepId === element.id}
                onClick={() => setEditingStepId((value) =>
                  value === element.id ? null : element.id)}
              >
                <span>{storyStepLabel(element)}</span>
                {element.storyNote && <i aria-hidden="true" />}
              </button>
              <button
                type="button"
                className="path-icon-button"
                aria-label={`上移：${storyStepLabel(element)}`}
                disabled={index === 0}
                onClick={() => onMove(index, -1)}
              >
                <ChevronIcon direction="up" />
              </button>
              <button
                type="button"
                className="path-icon-button"
                aria-label={`下移：${storyStepLabel(element)}`}
                disabled={index === steps.length - 1}
                onClick={() => onMove(index, 1)}
              >
                <ChevronIcon direction="down" />
              </button>
              <button
                type="button"
                className="path-icon-button"
                aria-label={`移除：${storyStepLabel(element)}`}
                onClick={() => {
                  if (editingStepId === element.id) setEditingStepId(null);
                  onRemove(element.id);
                }}
              >
                ×
              </button>
            </li>
          ))}
        </ol>
      ) : (
        <p className="story-path-empty">还没有讲解步骤。</p>
      )}
      {editingStep && (
        <div className="story-copy-editor">
          <label>
            <span>步骤标题</span>
            <input
              type="text"
              maxLength="80"
              value={editingStep.storyTitle ?? ""}
              placeholder={storyElementLabel(editingStep)}
              onChange={(event) => onUpdate(editingStep.id, { title: event.target.value })}
            />
          </label>
          <label>
            <span>讲解文字</span>
            <textarea
              rows="3"
              maxLength="500"
              value={editingStep.storyNote ?? ""}
              placeholder="解释这一部分是什么，以及为什么重要。"
              onChange={(event) => onUpdate(editingStep.id, { note: event.target.value })}
            />
          </label>
          <div className="story-camera-setting">
            <span>
              <strong>镜头</strong>
              <small>{editingStep.storyCamera ? "使用自定义画面" : "自动聚焦所选元素"}</small>
            </span>
            <div>
              {editingStep.storyCamera && (
                <button type="button" onClick={() => onUpdate(editingStep.id, { camera: null })}>
                  重置
                </button>
              )}
              <button type="button" onClick={() => onCaptureCamera(editingStep.id)}>
                {editingStep.storyCamera ? "更新画面" : "使用当前画面"}
              </button>
            </div>
          </div>
        </div>
      )}
      <button
        type="button"
        className="story-path-add"
        disabled={!selectedCount}
        onClick={() => {
          const stepId = onAdd();
          if (stepId) setEditingStepId(stepId);
        }}
      >
        {selectedCount ? `添加选中的 ${selectedCount} 个元素` : "在画布中选择元素"}
      </button>
    </section>
  );
}

function LinkPopover({ element, appState, anchor, onClose, onSave, onPreview, onRemove }) {
  const [url, setUrl] = useState(getStoryHref(element) ?? "");
  const [icon, setIcon] = useState(getStoryIconKind(element));
  const [side, setSide] = useState(
    element.customData?.storyIconSide === "right" ? "right" : "left",
  );
  const [invalid, setInvalid] = useState(false);
  const popoverRef = useRef(null);
  const inputRef = useRef(null);
  const zoom = appState?.zoom?.value ?? 1;
  const anchorRect = anchor?.getBoundingClientRect();
  const anchorX = anchorRect?.left ??
    (appState?.offsetLeft ?? 0) + (element.x + (appState?.scrollX ?? 0)) * zoom;
  const anchorY = anchorRect?.top ??
    (appState?.offsetTop ?? 0) + (element.y + (appState?.scrollY ?? 0)) * zoom;
  const anchorBottom = anchorRect?.bottom ?? anchorY + element.height * zoom;
  const below = anchorBottom + 360 < window.innerHeight;
  const left = Math.max(16, Math.min(anchorX - 12, window.innerWidth - 316));

  useEffect(() => {
    inputRef.current?.focus();
    inputRef.current?.select();
  }, []);

  useEffect(() => {
    const dismiss = (event) => {
      if (event.key === "Escape") onClose();
      if (
        event.type === "pointerdown" &&
        !popoverRef.current?.contains(event.target)
      ) {
        onClose(false);
      }
    };
    document.addEventListener("keydown", dismiss);
    document.addEventListener("pointerdown", dismiss);
    return () => {
      document.removeEventListener("keydown", dismiss);
      document.removeEventListener("pointerdown", dismiss);
    };
  }, [onClose]);

  const submit = (event) => {
    event.preventDefault();
    const href = safeStoryHref(url.trim());
    if (!href) {
      setInvalid(true);
      return;
    }
    onSave({ href, icon, side });
  };

  return (
    <form
      id="story-link-popover"
      ref={popoverRef}
      className={`link-popover link-popover--${below ? "below" : "above"}`}
      style={{ left, top: below ? anchorBottom + 8 : anchorY - 8 }}
      role="dialog"
      aria-modal="false"
      aria-labelledby="link-popover-title"
      onSubmit={submit}
      onPointerDown={(event) => event.stopPropagation()}
    >
      <div className="link-popover__header">
        <h2 id="link-popover-title">链接设置</h2>
        <button type="button" className="icon-button" aria-label="关闭" onClick={onClose}>×</button>
      </div>

      <label className="link-field">
        <span>网址</span>
        <input
          ref={inputRef}
          type="text"
          inputMode="url"
          value={url}
          placeholder="https://example.com"
          aria-invalid={invalid}
          aria-describedby={invalid ? "link-error" : undefined}
          onChange={(event) => {
            setUrl(event.target.value);
            setInvalid(false);
          }}
        />
      </label>
      {invalid && <p id="link-error" className="field-error" role="alert">请输入 http、https 或 mailto 链接。</p>}

      <fieldset className="link-options">
        <legend>图标</legend>
        <div className="icon-options">
          {STORY_ICON_KINDS.map((value) => (
            <label key={value} title={STORY_ICON_LABELS[value]}>
              <input
                type="radio"
                name="story-icon"
                value={value}
                checked={icon === value}
                aria-label={STORY_ICON_LABELS[value]}
                onChange={() => {
                  setIcon(value);
                  onPreview({ icon: value, side });
                }}
              />
              <span>
                <svg aria-hidden="true" viewBox="0 0 24 24">
                  <LinkDoodle kind={value} x={0} y={0} size={24} />
                </svg>
              </span>
            </label>
          ))}
        </div>
      </fieldset>

      <fieldset className="link-options">
        <legend>图标位置</legend>
        <div className="segmented-options segmented-options--two">
          {[['left', '左侧'], ['right', '右侧']].map(([value, label]) => (
            <label key={value}>
              <input
                type="radio"
                name="story-side"
                value={value}
                checked={side === value}
                onChange={() => {
                  setSide(value);
                  onPreview({ icon, side: value });
                }}
              />
              <span>{label}</span>
            </label>
          ))}
        </div>
      </fieldset>

      <div className="link-popover__footer">
        {getStoryHref(element) && <button type="button" className="text-button text-button--danger" onClick={onRemove}>移除链接</button>}
        <button type="submit" className="text-button text-button--primary">完成</button>
      </div>
    </form>
  );
}

function StoryLink({ active = false, element }) {
  const href = getStoryHref(element);
  const { size, iconX, iconY, underlineY } = storyLinkGeometry(element);
  const centerX = element.x + element.width / 2;
  const centerY = element.y + element.height / 2;
  const rotation = `rotate(${(element.angle * 180) / Math.PI} ${centerX} ${centerY})`;
  const underline = `M ${element.x} ${underlineY} C ${element.x + element.width * 0.28} ${underlineY + size * 0.08}, ${element.x + element.width * 0.68} ${underlineY - size * 0.08}, ${element.x + element.width} ${underlineY}`;
  const hitX = Math.min(element.x, iconX) - size * 0.2;
  const hitRight = Math.max(element.x + element.width, iconX + size) + size * 0.2;

  return (
    <a
      className={`story-link${active ? " story-link--active" : ""}`}
      href={href}
      target="_blank"
      rel="noreferrer"
      aria-label={`打开链接：${element.text || "图形"}`}
      style={{ color: element.strokeColor }}
      transform={rotation}
    >
      <rect
        className="story-link-hit"
        x={hitX}
        y={element.y - size * 0.2}
        width={hitRight - hitX}
        height={element.height + size * 0.5}
        rx={size * 0.18}
      />
      <LinkDoodle
        kind={getStoryIconKind(element)}
        x={iconX}
        y={iconY}
        size={size}
      />
      <path
        className="story-link-underline"
        d={underline}
        pathLength="1"
      />
    </a>
  );
}

function StoryView({ scene, onExit }) {
  const [svgUrl, setSvgUrl] = useState("");
  const [stepIndex, setStepIndex] = useState(0);
  const visibleElements = useMemo(
    () => scene?.elements?.filter((element) => !element.isDeleted) ?? [],
    [scene],
  );
  const bounds = useMemo(
    () => (visibleElements.length ? getCommonBounds(visibleElements) : [0, 0, 1, 1]),
    [visibleElements],
  );
  const frame = {
    x: bounds[0] - STORY_PADDING,
    y: bounds[1] - STORY_PADDING,
    width: Math.max(1, bounds[2] - bounds[0] + STORY_PADDING * 2),
    height: Math.max(1, bounds[3] - bounds[1] + STORY_PADDING * 2),
  };
  const steps = useMemo(
    () => getStorySteps(visibleElements, scene?.storyPath),
    [scene?.storyPath, visibleElements],
  );
  const currentStep = Math.min(stepIndex, steps.length);
  const activeStep = steps[currentStep - 1] ?? null;
  const focusBounds = activeStep?.storyCamera ?? activeStep;
  const focusScale = activeStep
    ? Math.max(
        1,
        Math.min(
          activeStep.storyCamera ? 4 : 2.2,
          frame.width / Math.max(1, focusBounds.width + (activeStep.storyCamera ? 0 : 96)),
          frame.height / Math.max(1, focusBounds.height + (activeStep.storyCamera ? 0 : 96)),
        ),
      )
    : 1;
  const focusX = activeStep
    ? (focusBounds.x + focusBounds.width / 2 - frame.x) / frame.width
    : 0.5;
  const focusY = activeStep
    ? (focusBounds.y + focusBounds.height / 2 - frame.y) / frame.height
    : 0.5;

  useEffect(() => setStepIndex(0), [scene]);

  useEffect(() => {
    const handleKeyDown = (event) => {
      if (event.key === "Escape" && onExit) {
        onExit();
        return;
      }
      const target = event.target instanceof Element ? event.target : null;
      if (target?.closest("input, textarea, select, [contenteditable='true']")) return;
      if (event.key === " " && target?.closest("a, button")) return;
      const direction = ["ArrowRight", "PageDown", " "].includes(event.key)
        ? 1
        : ["ArrowLeft", "PageUp"].includes(event.key)
          ? -1
          : 0;
      if (!direction) return;
      event.preventDefault();
      setStepIndex((value) => Math.max(0, Math.min(steps.length, value + direction)));
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [onExit, steps.length]);

  useEffect(() => {
    if (!scene || !visibleElements.length) return undefined;
    let disposed = false;
    let objectUrl = "";
    exportToSvg({
      elements: visibleElements,
      appState: { ...scene.appState, exportBackground: false },
      files: scene.files,
      exportPadding: STORY_PADDING,
    })
      .then((svg) => {
        objectUrl = URL.createObjectURL(
          new Blob([svg.outerHTML], { type: "image/svg+xml" }),
        );
        if (!disposed) setSvgUrl(objectUrl);
      })
      .catch(() => {
        if (!disposed) setSvgUrl("");
      });
    return () => {
      disposed = true;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [scene, visibleElements]);

  if (!scene || !visibleElements.length || !svgUrl) {
    return <p className="story-loading" role="status">正在整理画面…</p>;
  }

  const linkedElements = visibleElements.filter(getStoryHref);
  const storyText = visibleElements
    .filter((element) => element.type === "text")
    .map((element) => element.text)
    .join(" ");

  return (
    <section className="story-view" aria-label="作品讲解">
      <div
        className="story-scene"
        style={{
          "--story-ratio": frame.width / frame.height,
          transform: activeStep
            ? `translate(${(0.5 - focusX * focusScale) * 100}%, ${(0.5 - focusY * focusScale) * 100}%) scale(${focusScale})`
            : "translate(0, 0) scale(1)",
        }}
      >
        {storyText && <p className="story-transcript">{storyText}</p>}
        <img src={svgUrl} alt="" />
        <svg
          className="story-links"
          viewBox={`${frame.x} ${frame.y} ${frame.width} ${frame.height}`}
          aria-label="画面中的链接"
        >
          {linkedElements.map((element) => (
            <StoryLink
              key={element.id}
              active={activeStep?.storyElementIds?.includes(element.id) ?? element.id === activeStep?.id}
              element={element}
            />
          ))}
        </svg>
      </div>
      <nav className="story-steps" aria-label="讲解步骤">
        <button
          type="button"
          aria-label="上一步"
          disabled={currentStep === 0}
          onClick={() => setStepIndex(currentStep - 1)}
        >
          <ChevronIcon direction="left" />
        </button>
        <div className="story-step-status" aria-live="polite">
          <span className="story-step-meta">
            {activeStep ? `步骤 ${currentStep} / ${steps.length}` : `${steps.length} 个步骤`}
          </span>
          <strong>{activeStep ? storyStepLabel(activeStep) : "全景"}</strong>
          {activeStep?.storyNote?.trim() && (
            <span className="story-step-note">{activeStep.storyNote.trim()}</span>
          )}
        </div>
        <button
          type="button"
          aria-label="下一步"
          disabled={currentStep === steps.length}
          onClick={() => setStepIndex(currentStep + 1)}
        >
          <ChevronIcon direction="right" />
        </button>
      </nav>
    </section>
  );
}

function App() {
  const sharedPayload = useMemo(
    () => new URLSearchParams(location.hash.slice(1)).get("scene"),
    [],
  );
  const isShared = Boolean(sharedPayload);
  const localScene = useMemo(
    () => withoutNativeLinks(readScene(localStorage, STORAGE_KEY) ?? starterScene()),
    [],
  );
  const [preview, setPreview] = useState(isShared);
  const [saveState, setSaveState] = useState("saved");
  const [publishState, setPublishState] = useState("idle");
  const [shareError, setShareError] = useState(false);
  const [scene, setScene] = useState(isShared ? null : localScene);
  const [editorView, setEditorView] = useState({
    elements: localScene.elements,
    appState: localScene.appState,
  });
  const editorViewSignature = useRef(
    editorLinkSignature(localScene.elements, localScene.appState),
  );
  const [excalidrawAPI, setExcalidrawAPI] = useState(null);
  const [toolbarTarget, setToolbarTarget] = useState(null);
  const [linkEditorId, setLinkEditorId] = useState(null);
  const [highlighterActive, setHighlighterActive] = useState(false);
  const [highlighterColor, setHighlighterColor] = useState("#9f6b53");
  const [highlighterWidth, setHighlighterWidth] = useState(20);
  const [pathEditorOpen, setPathEditorOpen] = useState(false);
  const [assistantOpen, setAssistantOpen] = useState(false);
  const [assistantVisited, setAssistantVisited] = useState(false);
  const [agentUndoAvailable, setAgentUndoAvailable] = useState(false);
  const [hermesConnected, setHermesConnected] = useState(false);
  const [storyPath, setStoryPath] = useState(localScene.storyPath);
  const linkEditorTrigger = useRef(null);
  const pathButtonRef = useRef(null);
  const assistantButtonRef = useRef(null);
  const saveTimer = useRef();
  const publishTimer = useRef();
  const agentUndoScene = useRef(null);
  const agentUndoRevision = useRef("");
  const latestScene = useRef(localScene);
  const linkEditorElement = editorView.elements.find(
    (element) => element.id === linkEditorId && !element.isDeleted,
  );
  const editorStorySteps = useMemo(
    () => getStorySteps(editorView.elements, storyPath),
    [editorView.elements, storyPath],
  );
  const selectedStoryElementIds = useMemo(
    () => Object.keys(editorView.appState.selectedElementIds ?? {}).filter((id) =>
      editorView.elements.some((element) => element.id === id && !element.isDeleted),
    ),
    [editorView.appState.selectedElementIds, editorView.elements],
  );

  const closePathEditor = useCallback(() => {
    setPathEditorOpen(false);
    requestAnimationFrame(() => pathButtonRef.current?.focus());
  }, []);

  const closeAssistant = useCallback(() => {
    setAssistantOpen(false);
    requestAnimationFrame(() => assistantButtonRef.current?.focus());
  }, []);

  const closeLinkEditor = useCallback((restoreFocus = true) => {
    setLinkEditorId(null);
    if (restoreFocus) {
      requestAnimationFrame(() => linkEditorTrigger.current?.focus?.());
    }
  }, []);

  const openLinkEditor = useCallback((elementId, trigger) => {
    linkEditorTrigger.current = trigger ?? document.activeElement;
    excalidrawAPI?.updateScene({ appState: { showHyperlinkPopup: false } });
    setPathEditorOpen(false);
    setAssistantOpen(false);
    setLinkEditorId(elementId);
  }, [excalidrawAPI]);

  const activateHighlighter = useCallback((color, width = highlighterWidth) => {
    setHighlighterColor(color);
    setHighlighterWidth(width);
    setHighlighterActive(true);
    setLinkEditorId(null);
    setPathEditorOpen(false);
    setAssistantOpen(false);
    excalidrawAPI?.updateScene({
      appState: {
        currentItemStrokeColor: color,
        currentItemStrokeWidth: width,
        currentItemStrokeStyle: "solid",
        currentItemRoughness: 0,
        currentItemOpacity: 30,
        currentItemStartArrowhead: null,
        currentItemEndArrowhead: null,
      },
    });
    excalidrawAPI?.setActiveTool({ type: "freedraw", locked: true });
  }, [excalidrawAPI, highlighterWidth]);

  const toggleHighlighter = useCallback(() => {
    if (highlighterActive) {
      setHighlighterActive(false);
      excalidrawAPI?.setActiveTool({ type: "selection" });
    } else {
      activateHighlighter(highlighterColor);
    }
  }, [activateHighlighter, excalidrawAPI, highlighterActive, highlighterColor]);

  useEffect(
    () => () => {
      window.clearTimeout(saveTimer.current);
      window.clearTimeout(publishTimer.current);
    },
    [],
  );

  useEffect(() => {
    const connection = readHermesConnection();
    if (!connection) return undefined;
    let active = true;
    testHermesConnection(connection)
      .then(() => {
        if (active) setHermesConnected(true);
      })
      .catch(() => {
        if (active) setHermesConnected(false);
      });
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    if (!sharedPayload) return;
    decodeScene(sharedPayload)
      .then((decodedScene) => {
        const nextScene = withoutNativeLinks(decodedScene);
        latestScene.current = nextScene;
        setScene(nextScene);
      })
      .catch(() => {
        setShareError(true);
        setScene(starterScene());
      });
  }, [sharedPayload]);

  useEffect(() => {
    if (preview || !excalidrawAPI) {
      setToolbarTarget(null);
      return undefined;
    }
    let frame;
    const findToolbar = () => {
      const target = document.querySelector(
        ".canvas-app > .excalidraw .App-toolbar-container .App-toolbar .Stack_horizontal",
      );
      if (target) setToolbarTarget(target);
      else frame = requestAnimationFrame(findToolbar);
    };
    findToolbar();
    return () => {
      cancelAnimationFrame(frame);
    };
  }, [excalidrawAPI, preview]);

  const save = useCallback((elements, appState, files) => {
    window.clearTimeout(saveTimer.current);
    setSaveState("saving");
    if (highlighterActive && appState.activeTool?.type !== "freedraw") {
      setHighlighterActive(false);
    }
    const savedElements = stashStoryLinks(elements);
    const nextEditorViewSignature = editorLinkSignature(savedElements, appState);
    if (nextEditorViewSignature !== editorViewSignature.current) {
      editorViewSignature.current = nextEditorViewSignature;
      setEditorView({ elements: savedElements, appState });
    }
    const {
      collaborators: _collaborators,
      viewModeEnabled: _viewModeEnabled,
      zenModeEnabled: _zenModeEnabled,
      ...savedAppState
    } = appState;
    latestScene.current = {
      ...latestScene.current,
      elements: savedElements,
      appState: savedAppState,
      files,
    };
    if (
      agentUndoRevision.current &&
      agentUndoRevision.current !== hermesSceneRevision(latestScene.current)
    ) {
      agentUndoScene.current = null;
      agentUndoRevision.current = "";
      setAgentUndoAvailable(false);
    }
    if (savedElements !== elements) {
      requestAnimationFrame(() => excalidrawAPI?.updateScene({ elements: savedElements }));
    }
    saveTimer.current = window.setTimeout(() => {
      setSaveState(
        writeScene(localStorage, STORAGE_KEY, latestScene.current)
          ? "saved"
          : "error",
      );
    }, 400);
  }, [excalidrawAPI, highlighterActive]);

  const publish = useCallback(async () => {
    if (publishState === "working") return;
    setPublishState("working");
    try {
      const url = new URL(location.href);
      url.hash = `scene=${await encodeScene(latestScene.current)}`;
      try {
        await navigator.clipboard.writeText(url.href);
        setPublishState("copied");
      } catch {
        window.prompt("复制这个只读链接", url.href);
        setPublishState("ready");
      }
    } catch {
      setPublishState("error");
    }
    publishTimer.current = window.setTimeout(() => setPublishState("idle"), 2400);
  }, [publishState]);

  const previewLinkAppearance = useCallback(({ icon, side }) => {
    if (!linkEditorId) return;
    const nextElements = latestScene.current.elements.map((element) =>
      element.id === linkEditorId
        ? newElementWith(element, {
            customData: { ...element.customData, storyIcon: icon, storyIconSide: side },
          })
        : element,
    );
    const appState = excalidrawAPI?.getAppState() ?? editorView.appState;
    latestScene.current = { ...latestScene.current, elements: nextElements };
    editorViewSignature.current = editorLinkSignature(nextElements, appState);
    setEditorView({ elements: nextElements, appState });
    excalidrawAPI?.updateScene({ elements: nextElements });
  }, [editorView.appState, excalidrawAPI, linkEditorId]);

  const applyLinkSettings = useCallback((settings) => {
    if (!linkEditorId) return;
    const nextElements = latestScene.current.elements.map((element) => {
      if (element.id !== linkEditorId) return element;
      const customData = { ...element.customData };
      if (settings) {
        customData.storyLink = settings.href;
        customData.storyIcon = settings.icon;
        customData.storyIconSide = settings.side;
      } else {
        delete customData.storyLink;
        delete customData.storyIcon;
        delete customData.storyIconSide;
      }
      return newElementWith(element, { link: null, customData });
    });
    const appState = excalidrawAPI?.getAppState() ?? editorView.appState;
    const nextScene = { ...latestScene.current, elements: nextElements };
    latestScene.current = nextScene;
    editorViewSignature.current = editorLinkSignature(nextElements, appState);
    setEditorView({ elements: nextElements, appState });
    excalidrawAPI?.updateScene({ elements: nextElements });
    setSaveState(writeScene(localStorage, STORAGE_KEY, nextScene) ? "saved" : "error");
    closeLinkEditor();
  }, [closeLinkEditor, editorView.appState, excalidrawAPI, linkEditorId]);

  const commitStoryPath = useCallback((nextPath) => {
    const nextScene = { ...latestScene.current, storyPath: nextPath };
    latestScene.current = nextScene;
    if (
      agentUndoRevision.current &&
      agentUndoRevision.current !== hermesSceneRevision(nextScene)
    ) {
      agentUndoScene.current = null;
      agentUndoRevision.current = "";
      setAgentUndoAvailable(false);
    }
    setStoryPath(nextPath);
    setSaveState(writeScene(localStorage, STORAGE_KEY, nextScene) ? "saved" : "error");
  }, []);

  const moveStoryStep = useCallback((index, direction) => {
    const path = makeStoryPath(
      latestScene.current.elements,
      latestScene.current.storyPath,
    );
    const target = index + direction;
    if (!path[index] || target < 0 || target >= path.length) return;
    const [moved] = path.splice(index, 1);
    path.splice(target, 0, moved);
    commitStoryPath(path);
  }, [commitStoryPath]);

  const addStoryStep = useCallback(() => {
    if (!selectedStoryElementIds.length) return;
    const path = makeStoryPath(
      latestScene.current.elements,
      latestScene.current.storyPath,
    );
    const stepId = crypto.randomUUID();
    path.push({ id: stepId, elementIds: selectedStoryElementIds });
    commitStoryPath(path);
    return stepId;
  }, [commitStoryPath, selectedStoryElementIds]);

  const removeStoryStep = useCallback((stepId) => {
    commitStoryPath(
      makeStoryPath(
        latestScene.current.elements,
        latestScene.current.storyPath,
      ).filter((step) => step.id !== stepId),
    );
  }, [commitStoryPath]);

  const updateStoryStep = useCallback((stepId, changes) => {
    const path = makeStoryPath(
      latestScene.current.elements,
      latestScene.current.storyPath,
    );
    const step = path.find((entry) => entry.id === stepId);
    if (!step) return;
    for (const [key, value] of Object.entries(changes)) {
      if (value == null || value === "") delete step[key];
      else step[key] = value;
    }
    commitStoryPath(path);
  }, [commitStoryPath]);

  const captureStoryCamera = useCallback((stepId) => {
    const appState = excalidrawAPI?.getAppState() ?? editorView.appState;
    const zoom = appState.zoom?.value ?? 1;
    const offsetLeft = appState.offsetLeft ?? 0;
    const offsetTop = appState.offsetTop ?? 0;
    updateStoryStep(stepId, {
      camera: {
        x: -(appState.scrollX ?? 0),
        y: -(appState.scrollY ?? 0),
        width: Math.max(1, ((appState.width ?? window.innerWidth) - offsetLeft) / zoom),
        height: Math.max(1, ((appState.height ?? window.innerHeight) - offsetTop) / zoom),
      },
    });
  }, [editorView.appState, excalidrawAPI, updateStoryStep]);

  const generateAgentPlan = useCallback(async (goal, draftPlan, conversation, signal) => {
    const sourceRevision = hermesSceneRevision(latestScene.current);
    const scopeElementIds = selectedStoryElementIds;
    const plan = await requestHermesLecturePlan(
      latestScene.current.elements,
      latestScene.current.storyPath,
      goal,
      { selectedElementIds: scopeElementIds, draftPlan, conversation, signal },
    );
    if (plan.mode === "chat") return plan;
    if (plan.mode !== "create") return { ...plan, sourceRevision, scopeElementIds };
    const generated = createGeneratedLecture(
      plan.document,
      () => crypto.randomUUID(),
      FONT_FAMILY.Helvetica,
    );
    return {
      ...plan,
      ...generated,
      sourceRevision,
      scopeElementIds,
      elements: convertToExcalidrawElements(generated.elements, { regenerateIds: false }),
    };
  }, [selectedStoryElementIds]);

  const applyAgentPlan = useCallback((plan) => {
    if (plan.sourceRevision !== hermesSceneRevision(latestScene.current)) {
      return "画布在方案生成后发生了变化，请让 Hermes 重新生成后再应用。";
    }
    agentUndoRevision.current = "";
    agentUndoScene.current = structuredClone(latestScene.current);
    setAgentUndoAvailable(true);
    const nextPath = plan.mode === "create"
      ? plan.steps.map((step) => ({
          id: crypto.randomUUID(),
          elementIds: step.elementIds,
          title: step.title,
          ...(step.note ? { note: step.note } : {}),
        }))
      : mergeHermesStoryPath(
          latestScene.current.elements,
          latestScene.current.storyPath,
          plan.steps,
          plan.scopeElementIds,
        );
    if (plan.mode !== "create") {
      commitStoryPath(nextPath);
      agentUndoRevision.current = hermesSceneRevision(latestScene.current);
      return "";
    }
    const appState = {
      ...latestScene.current.appState,
      viewBackgroundColor: PAPER,
      selectedElementIds: {},
    };
    const nextScene = { elements: plan.elements, appState, files: {}, storyPath: nextPath };
    latestScene.current = nextScene;
    agentUndoRevision.current = hermesSceneRevision(nextScene);
    editorViewSignature.current = editorLinkSignature(plan.elements, appState);
    setScene(nextScene);
    setEditorView({ elements: plan.elements, appState });
    setStoryPath(nextPath);
    setSaveState(writeScene(localStorage, STORAGE_KEY, nextScene) ? "saved" : "error");
    excalidrawAPI?.updateScene({
      elements: plan.elements,
      appState: { viewBackgroundColor: PAPER, selectedElementIds: {} },
    });
    requestAnimationFrame(() => excalidrawAPI?.scrollToContent(plan.elements, {
      fitToViewport: true,
      viewportZoomFactor: 0.82,
      animate: !window.matchMedia("(prefers-reduced-motion: reduce)").matches,
    }));
    return "";
  }, [commitStoryPath, excalidrawAPI]);

  const undoAgentPlan = useCallback(() => {
    const previous = agentUndoScene.current;
    if (!previous) return "没有可撤销的 Hermes 更改。";
    if (agentUndoRevision.current !== hermesSceneRevision(latestScene.current)) {
      agentUndoScene.current = null;
      agentUndoRevision.current = "";
      setAgentUndoAvailable(false);
      return "画布在应用后又有修改，已停止撤销以免覆盖这些修改。";
    }
    agentUndoScene.current = null;
    agentUndoRevision.current = "";
    setAgentUndoAvailable(false);
    latestScene.current = previous;
    editorViewSignature.current = editorLinkSignature(previous.elements, previous.appState);
    setScene(previous);
    setEditorView({ elements: previous.elements, appState: previous.appState });
    setStoryPath(previous.storyPath);
    excalidrawAPI?.addFiles(Object.values(previous.files ?? {}));
    excalidrawAPI?.updateScene({ elements: previous.elements, appState: previous.appState });
    setSaveState(writeScene(localStorage, STORAGE_KEY, previous) ? "saved" : "error");
    return "";
  }, [excalidrawAPI]);

  const openHermes = useCallback(() => {
    setLinkEditorId(null);
    setPathEditorOpen(false);
    setAssistantVisited(true);
    setAssistantOpen(true);
  }, []);

  const clearAssistantSelection = useCallback(() => {
    excalidrawAPI?.updateScene({ appState: { selectedElementIds: {} } });
  }, [excalidrawAPI]);

  const renderCanvasControls = (embedded = false) => (
    <div
      className={`canvas-controls${embedded ? " canvas-controls--embedded" : ""}`}
      role="group"
      aria-label={preview ? "讲解操作" : "画板操作"}
    >
      {!preview && (
        <span className={`save-state save-state--${saveState}`} role="status">
          <span className="save-state__dot" aria-hidden="true" />
          <span className="save-state__label">
            {saveState === "saving"
              ? "保存中"
              : saveState === "error"
                ? "保存失败"
                : "已保存"}
          </span>
        </span>
      )}
      {!preview && (
        <button
          ref={assistantButtonRef}
          className="control-button control-button--hermes"
          type="button"
          data-connected={hermesConnected}
          aria-label={`Hermes：${hermesConnected ? "已连接" : "未连接，点击连接"}`}
          aria-pressed={assistantOpen}
          aria-expanded={assistantOpen}
          aria-controls="hermes-assistant-panel"
          title={`Hermes：${hermesConnected ? "已连接" : "点击连接"}`}
          onClick={openHermes}
        >
          <span className="hermes-status-dot" aria-hidden="true" />
          <span className="control-button__label control-button__label--keep">助手</span>
        </button>
      )}
      {!preview && (
        <button
          ref={pathButtonRef}
          className="control-button"
          type="button"
          title="讲解路径"
          aria-label="讲解路径"
          aria-pressed={pathEditorOpen}
          aria-expanded={pathEditorOpen}
          aria-controls="story-path-editor"
          onClick={() => {
            setLinkEditorId(null);
            setAssistantOpen(false);
            setPathEditorOpen((value) => !value);
          }}
        >
          <PathIcon />
          <span className="control-button__label">路径</span>
        </button>
      )}
      <button
        className="control-button"
        type="button"
        title={preview ? "返回编辑" : "讲解模式"}
        aria-pressed={preview}
        onClick={() => {
          setLinkEditorId(null);
          setPathEditorOpen(false);
          setAssistantOpen(false);
          setHighlighterActive(false);
          excalidrawAPI?.setActiveTool({ type: "selection" });
          if (!preview) setScene(latestScene.current);
          setPreview((value) => !value);
        }}
      >
        <EyeIcon crossed={preview} />
        <span className="control-button__label">{preview ? "返回编辑" : "讲解模式"}</span>
      </button>
      {!preview && (
        <button
          className="control-button control-button--publish"
          type="button"
          disabled={publishState === "working"}
          aria-busy={publishState === "working"}
          onClick={publish}
        >
          {publishState === "working"
            ? "生成中"
            : publishState === "copied"
              ? "已复制"
              : publishState === "ready"
                ? "已生成"
                : publishState === "error"
                  ? "内容过大"
                  : "发布"}
        </button>
      )}
    </div>
  );

  return (
    <main className={`canvas-app${isShared ? " canvas-app--shared" : ""}${highlighterActive ? " canvas-app--highlighting" : ""}`}>
      {!isShared && !preview && excalidrawAPI && (
        <HighlighterTool
          active={highlighterActive}
          color={highlighterColor}
          onToggle={toggleHighlighter}
          onColor={activateHighlighter}
          onWidth={(width) => activateHighlighter(highlighterColor, width)}
          target={toolbarTarget}
          width={highlighterWidth}
        />
      )}
      {!isShared && preview && renderCanvasControls()}

      {!preview && pathEditorOpen && (
        <StoryPathEditor
          steps={editorStorySteps}
          selectedCount={selectedStoryElementIds.length}
          onAdd={addStoryStep}
          onCaptureCamera={captureStoryCamera}
          onClose={closePathEditor}
          onMove={moveStoryStep}
          onRemove={removeStoryStep}
          onUpdate={updateStoryStep}
        />
      )}

      {assistantVisited && (
        <HermesAssistantPanel
          canUndo={agentUndoAvailable}
          canvasHasContent={latestScene.current.elements.some((element) => !element.isDeleted)}
          onApplyPlan={applyAgentPlan}
          onClearSelection={clearAssistantSelection}
          onClose={closeAssistant}
          onConnectionChange={setHermesConnected}
          onGeneratePlan={generateAgentPlan}
          onUndoPlan={undoAgentPlan}
          open={!preview && assistantOpen}
          selectionCount={selectedStoryElementIds.length}
        />
      )}

      {shareError && (
        <p className="share-error" role="alert">
          这个分享链接无效或内容过大。
        </p>
      )}

      {preview ? (
        <StoryView scene={scene} onExit={isShared ? null : () => setPreview(false)} />
      ) : (
        <Excalidraw
          initialData={scene}
          excalidrawAPI={setExcalidrawAPI}
          langCode="zh-CN"
          name="Unfold"
          theme="light"
          onChange={save}
          renderTopRightUI={() => renderCanvasControls(true)}
          UIOptions={{
            canvasActions: {
              loadScene: true,
              saveToActiveFile: true,
              export: { saveFileToDisk: true },
            },
          }}
        >
        <MainMenu>
          <MainMenu.Group>
            <MainMenu.DefaultItems.LoadScene />
            <MainMenu.DefaultItems.SaveToActiveFile />
            <MainMenu.DefaultItems.Export />
            <MainMenu.DefaultItems.SearchMenu />
            <MainMenu.DefaultItems.Help />
            <MainMenu.DefaultItems.ClearCanvas />
          </MainMenu.Group>
          <MainMenu.Separator />
          <MainMenu.Group>
            <MainMenu.DefaultItems.ChangeCanvasBackground />
          </MainMenu.Group>
          <MainMenu.Separator />
          <MainMenu.ItemCustom className="tale-menu-brand">
            <strong>迹·叙</strong>
            <span>Unfold your story.</span>
          </MainMenu.ItemCustom>
        </MainMenu>
        <WelcomeScreen>
          <WelcomeScreen.Center>
            <WelcomeScreen.Center.Logo>
              <span className="welcome-mark">迹·叙</span>
            </WelcomeScreen.Center.Logo>
            <WelcomeScreen.Center.Heading>
              把经历、想法和故事画出来。
            </WelcomeScreen.Center.Heading>
            <WelcomeScreen.Center.Menu>
              <WelcomeScreen.Center.MenuItemLoadScene>
                打开一张画板
              </WelcomeScreen.Center.MenuItemLoadScene>
              <WelcomeScreen.Center.MenuItemHelp />
            </WelcomeScreen.Center.Menu>
          </WelcomeScreen.Center>
          <WelcomeScreen.Hints.ToolbarHint>
            文字、箭头和图片都在这里
          </WelcomeScreen.Hints.ToolbarHint>
          <WelcomeScreen.Hints.MenuHint>
            打开、保存与导出
          </WelcomeScreen.Hints.MenuHint>
          <WelcomeScreen.Hints.HelpHint>
            快捷键
          </WelcomeScreen.Hints.HelpHint>
        </WelcomeScreen>
        </Excalidraw>
      )}
      {!preview && (
        <EditorLinkIcons
          elements={editorView.elements}
          appState={editorView.appState}
          activeLinkId={linkEditorId}
          onEditLink={openLinkEditor}
          showSteps={pathEditorOpen}
          storyPath={storyPath}
        />
      )}
      {!preview && linkEditorElement && (
        <LinkPopover
          key={linkEditorElement.id}
          element={linkEditorElement}
          appState={editorView.appState}
          anchor={linkEditorTrigger.current}
          onClose={closeLinkEditor}
          onSave={applyLinkSettings}
          onPreview={previewLinkAppearance}
          onRemove={() => applyLinkSettings(null)}
        />
      )}
    </main>
  );
}

createRoot(document.getElementById("root")).render(<App />);
