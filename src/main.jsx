import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { createRoot } from "react-dom/client";
import {
  CaptureUpdateAction,
  convertToExcalidrawElements,
  Excalidraw,
  exportToBlob,
  exportToSvg,
  FONT_FAMILY,
  getCommonBounds,
  loadFromBlob,
  MainMenu,
  newElementWith,
  viewportCoordsToSceneCoords,
  WelcomeScreen,
} from "@excalidraw/excalidraw";
import "@excalidraw/excalidraw/index.css";
import "./styles.css";
import AssistantMascot from "./AssistantMascot.jsx";
import StoryCameraPreview from "./StoryCameraPreview.jsx";
import StoryPathPanel from "./StoryPathEditor.jsx";
import { installContextMenuOrganizer } from "./context-menu.js";
import {
  ACTIVE_WORK_STORAGE_KEY,
  createWorkspaceSnapshot,
  decodeScene,
  initializeWorkStorage,
  initializeSceneStorage,
  mergeWorkspaceSnapshots,
  parseUnfoldScene,
  parseWorkspaceSnapshot,
  pruneStaleWorkStorage,
  publicationKeyForWork,
  removeScene,
  readPublication,
  readScene,
  sceneIdFromPath,
  sceneKeyForWork,
  serializeUnfoldScene,
  writePublication,
  writeScene,
  writeWorkspaceSnapshot,
  writeWorks,
} from "./storage.js";
import {
  pullPublicScene,
  pullSupabaseWorkspace,
  pushPublicScene,
  pushSupabaseWorkspace,
  readSupabaseSession,
  refreshSupabaseSession,
  signInSupabase,
  signUpSupabase,
  SUPABASE_SESSION_STORAGE_KEY,
  SUPABASE_WORK_LIMIT,
  supabaseConfigFromEnv,
  writeSupabaseSession,
} from "./supabase-sync.js";
import { missingArrowhead } from "./tool-state.js";
import {
  clearHermesConnection,
  createHermesConnection,
  hermesConnectorSetupCommand,
  readHermesConnection,
  requestHermesAgent,
  requestHermesLecturePlan,
  saveHermesConnection,
  testHermesConnection,
} from "./hermes.js";
import {
  STORY_ICON_KINDS,
  createStoryCameraShot,
  createGeneratedLecture,
  editorLinkSignature,
  getStoryFrame,
  getStoryIconImage,
  getStoryIconKind,
  getStoryHref,
  getStoryStepMarkerOffsets,
  getStorySteps,
  getStoryViewBox,
  interpolateStoryCameraShot,
  interpolateStoryViewBox,
  makeStoryPath,
  mergeHermesStoryPath,
  polishStarterElement,
  safeStoryHref,
  selectedTextElements,
  stashStoryLinks,
  storyIconKind,
  storyLinkGeometry,
  textHighlightColor,
  textHighlightRects,
} from "./story.js";

const PAPER = "#ffffff";
const DEFAULT_STROKE_COLOR = "#37352f";
const STORY_PADDING = 32;
const STORY_CAMERA_DURATION = 280;
const CLEAR_CANVAS_SHORTCUT = /Mac|iPhone|iPad/.test(navigator.platform)
  ? "⌘⌫"
  : "Ctrl+Del";

function validateEmbeddedWebsite(link) {
  try {
    return new URL(link).protocol === "https:";
  } catch {
    return false;
  }
}

function storyPaddingForElements(elements) {
  return Math.max(
    STORY_PADDING,
    ...elements
      .filter((element) => getStoryHref(element) && getStoryIconKind(element) !== "none")
      .map((element) => storyLinkGeometry(element).size * 1.5),
  );
}

function storyFrameForElements(elements) {
  const visible = elements.filter((element) => !element.isDeleted);
  const bounds = visible.length ? getCommonBounds(visible) : [0, 0, 1, 1];
  return getStoryFrame(bounds, storyPaddingForElements(visible));
}

function hermesSceneRevision(scene) {
  return JSON.stringify([
    scene.elements.filter((element) => !element.isDeleted).map((element) => [element.id, element.version]),
    scene.storyPath ?? [],
  ]);
}

function hermesConnectionMessage(error) {
  const message = String(error?.message || error || "");
  if (/口令格式/.test(message)) return "本地配对口令已损坏，请重新生成口令。";
  if (/WebSocket/.test(message)) return "当前浏览器无法连接本机 Connector。";
  return "";
}

function AssistantMessageText({ text }) {
  const normalized = String(text).replaceAll("\\n", "\n");
  return (
    <p className="assistant-message-text">
      {normalized.split(/(\*\*[^*]+\*\*|https?:\/\/[^\s]+)/g).map((part, index) => {
        if (/^https?:\/\//.test(part)) {
          return <a key={`${index}-${part}`} href={part} target="_blank" rel="noreferrer">{part}</a>;
        }
        if (part.startsWith("**") && part.endsWith("**")) {
          return <strong key={`${index}-${part}`}>{part.slice(2, -2)}</strong>;
        }
        return part;
      })}
    </p>
  );
}

const ASSISTANT_IMAGE_TYPES = new Set(["image/png", "image/jpeg", "image/webp", "image/gif", "image/bmp"]);
const MAX_ASSISTANT_IMAGE_BYTES = 10 * 1024 * 1024;
const BUILTIN_AGENT_COMMANDS = [
  { command: "/生成画布", description: "根据主题和要求生成一张新画布" },
  { command: "/整理画布", description: "整理并美化当前画布的内容与布局" },
];

function AttachmentIcon() {
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24">
      <path d="m8.5 12.5 6.8-6.8a3 3 0 0 1 4.2 4.2l-8.8 8.8a5 5 0 0 1-7.1-7.1l8.5-8.5" />
    </svg>
  );
}

function loadImageSize(src) {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve({ width: image.naturalWidth, height: image.naturalHeight });
    image.onerror = () => reject(new Error("无法打开 Hermes 生成的图片。"));
    image.src = src;
  });
}

async function imageSourceDataUrl(src) {
  if (src.startsWith("data:image/")) return src;
  const response = await fetch(src);
  if (!response.ok) throw new Error("无法下载 Hermes 生成的图片。");
  const blob = await response.blob();
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error("无法读取 Hermes 生成的图片。"));
    reader.onload = () => resolve(String(reader.result || ""));
    reader.readAsDataURL(blob);
  });
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
  none: "无图标",
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
    appState: {
      ...scene.appState,
      activeTool: {
        type: "selection",
        customType: null,
        locked: false,
        lastActiveTool: null,
      },
      viewBackgroundColor: PAPER,
      currentItemStrokeColor: DEFAULT_STROKE_COLOR,
      currentItemOpacity: 100,
    },
  };
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

function StopIcon() {
  return (
    <svg className="assistant-stop-icon" aria-hidden="true" viewBox="0 0 24 24">
      <rect x="7" y="7" width="10" height="10" rx="2" />
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

function HighlighterTool({ active, onToggle, target }) {
  if (!target) return null;
  return createPortal(
    <div className="highlighter-control">
      <button
        className="highlighter-tool"
        type="button"
        aria-label={active ? "关闭高亮笔" : "使用高亮笔"}
        aria-pressed={active}
        onClick={onToggle}
      >
        <svg aria-hidden="true" viewBox="0 0 24 24">
          <path d="m14.8 3.8 5.4 5.4-8.7 8.7H6.1v-5.4Z" />
          <path d="m7.4 11.2 5.4 5.4M4 21h16" />
        </svg>
      </button>
    </div>,
    target,
  );
}

function LinkDoodle({ kind, x, y, size }) {
  if (kind === "none") return null;
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

function StoryLinkIcon({ element, x, y, size }) {
  if (getStoryIconKind(element) === "none") return null;
  const image = getStoryIconImage(element);
  if (!image) return <LinkDoodle kind={getStoryIconKind(element)} x={x} y={y} size={size} />;
  const clipId = `story-link-image-${element.id}`;
  const radius = size * 0.2;
  return (
    <g className="story-link-icon">
      <defs><clipPath id={clipId}><rect x={x} y={y} width={size} height={size} rx={radius} /></clipPath></defs>
      <image
        className="story-link-custom-image"
        href={image}
        x={x}
        y={y}
        width={size}
        height={size}
        preserveAspectRatio="xMidYMid slice"
        clipPath={`url(#${clipId})`}
      />
    </g>
  );
}

function makeStoryIconImage(file) {
  if (!file || !["image/jpeg", "image/png", "image/webp"].includes(file.type)) {
    return Promise.reject(new Error("请选择 PNG、JPEG 或 WebP 图片。"));
  }
  if (file.size > 5 * 1024 * 1024) {
    return Promise.reject(new Error("图片不能超过 5 MB。"));
  }
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error("无法读取这张图片。"));
    reader.onload = () => {
      const image = new Image();
      image.onerror = () => reject(new Error("无法打开这张图片。"));
      image.onload = () => {
        const size = 128;
        const scale = Math.max(size / image.naturalWidth, size / image.naturalHeight);
        const width = image.naturalWidth * scale;
        const height = image.naturalHeight * scale;
        const canvas = document.createElement("canvas");
        canvas.width = size;
        canvas.height = size;
        const context = canvas.getContext("2d");
        if (!context) {
          reject(new Error("当前浏览器无法处理这张图片。"));
          return;
        }
        context.drawImage(image, (size - width) / 2, (size - height) / 2, width, height);
        resolve(canvas.toDataURL("image/webp", 0.86));
      };
      image.src = String(reader.result);
    };
    reader.readAsDataURL(file);
  });
}

function EditorLinkIcons({ elements, appState, activeLinkId, onEditLink, showSteps, storyPath }) {
  const zoom = appState?.zoom?.value ?? 1;
  const transform = `translate(${appState?.offsetLeft ?? 0} ${appState?.offsetTop ?? 0}) scale(${zoom}) translate(${appState?.scrollX ?? 0} ${appState?.scrollY ?? 0})`;
  const linkedElements = elements.filter(
    (element) => !element.isDeleted && getStoryHref(element),
  );
  const storySteps = getStorySteps(elements, storyPath);
  const stepMarkerOffsets = getStoryStepMarkerOffsets(storySteps);

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
                <StoryLinkIcon
                  element={element}
                  x={iconX}
                  y={iconY}
                  size={size}
                />
              </g>
            );
          })}
          {showSteps && storySteps.map((element, index) => {
            const x = element.x + element.width / 2 + stepMarkerOffsets[index];
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
  onInsertImage,
  onRunAgent,
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
  const [attachments, setAttachments] = useState([]);
  const [attachmentError, setAttachmentError] = useState("");
  const [slashIndex, setSlashIndex] = useState(0);
  const [slashDismissed, setSlashDismissed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [compact, setCompact] = useState(() => window.matchMedia("(max-width: 640px)").matches);
  const composerRef = useRef(null);
  const fileInputRef = useRef(null);
  const conversationRef = useRef(null);
  const slashOptionRefs = useRef([]);
  const firstActionRef = useRef(null);
  const generationRef = useRef(null);
  const agentSessionRef = useRef(crypto.randomUUID());
  const panelRef = useRef(null);
  const command = useMemo(() => hermesConnectorSetupCommand(), []);
  const slashSuggestions = useMemo(() => {
    if (slashDismissed) return [];
    const match = input.match(/^\/([^\s]*)$/);
    if (!match) return [];
    const query = match[1].toLowerCase();
    return BUILTIN_AGENT_COMMANDS
      .filter((item) => item.command.slice(1).toLowerCase().includes(query))
  }, [input, slashDismissed]);

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

  useEffect(() => {
    setSlashIndex((index) => Math.min(index, Math.max(0, slashSuggestions.length - 1)));
  }, [slashSuggestions.length]);

  useEffect(() => {
    slashOptionRefs.current[slashIndex]?.scrollIntoView({ block: "nearest" });
  }, [slashIndex, slashSuggestions.length]);

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

  const reconnect = () => {
    setConnectionState("checking");
    onConnectionChange(false);
    setCheckVersion((value) => value + 1);
  };

  const clearAttachments = () => {
    attachments.forEach((item) => URL.revokeObjectURL(item.preview));
    setAttachments([]);
    setAttachmentError("");
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  const addAttachments = (files) => {
    const incoming = [...files];
    const invalid = incoming.find((file) =>
      !ASSISTANT_IMAGE_TYPES.has(file.type) || !file.size || file.size > MAX_ASSISTANT_IMAGE_BYTES,
    );
    if (invalid) {
      setAttachmentError("仅支持 PNG、JPEG、WebP、GIF、BMP，单张不超过 10 MB。");
      return;
    }
    if (attachments.length + incoming.length > 4) {
      setAttachmentError("一次最多上传 4 张图片。");
      return;
    }
    setAttachmentError("");
    setAttachments((value) => [...value, ...incoming.map((file) => ({
      id: crypto.randomUUID(),
      file,
      preview: URL.createObjectURL(file),
    }))]);
  };

  const selectSlashSuggestion = (item) => {
    setInput(`${item.command} `);
    setSlashDismissed(true);
    requestAnimationFrame(() => composerRef.current?.focus());
  };

  const submitPrompt = async (prompt, appendUser = true) => {
    const pendingAttachments = attachments;
    const displayPrompt = prompt || (pendingAttachments.length ? "请根据这些图片继续创作。" : "");
    if (!displayPrompt || busy || connectionState !== "connected") return;
    const id = crypto.randomUUID();
    const conversation = messages
      .filter((message) => !message.error)
      .slice(-8)
      .map(({ role, text }) => ({ role, text }));
    if (appendUser) setMessages((value) => [...value, {
      id,
      role: "user",
      text: displayPrompt,
      attachmentNames: pendingAttachments.map((item) => item.file.name),
    }]);
    setInput("");
    setBusy(true);
    const controller = new AbortController();
    generationRef.current = controller;
    try {
      const agentMode = pendingAttachments.length > 0;
      if (agentMode) {
        const result = await onRunAgent(
          displayPrompt,
          pendingAttachments.map((item) => item.file),
          agentSessionRef.current,
          controller.signal,
        );
        agentSessionRef.current = result.sessionId || agentSessionRef.current;
        setMessages((value) => [...value, {
          id: crypto.randomUUID(),
          role: "assistant",
          text: result.message || (result.images.length ? "图片已生成。" : "Hermes 已完成。"),
          images: result.images,
        }]);
        clearAttachments();
        return;
      }
      const command = displayPrompt.match(/^\/(生成画布|整理画布)(?:\s+([\s\S]*))?$/);
      const goal = command?.[1] === "生成画布"
        ? `请从零生成一张新画布。${command[2]?.trim() || "请先询问我要生成什么主题的画布。"}`
        : command?.[1] === "整理画布"
          ? `请保留当前画布的核心内容，重新整理信息层级并美化视觉布局。${command[2]?.trim() || ""}`
          : displayPrompt;
      const draftPlan = [...messages].reverse().find((message) => message.plan)?.plan;
      const plan = await onGeneratePlan(goal, draftPlan, conversation, controller.signal);
      setMessages((value) => [...value, {
        id: crypto.randomUUID(),
        role: "assistant",
        text: plan.mode === "chat"
          ? plan.message
          : plan.mode === "create"
            ? `内容、大纲和画布已经设计好，共 ${plan.steps.length} 个讲解步骤。`
            : `我整理了 ${plan.steps.length} 个讲解步骤。`,
        ...(plan.mode === "chat" ? {} : { plan, requestPrompt: displayPrompt }),
      }]);
    } catch (error) {
      setMessages((value) => [...value, {
        id: crypto.randomUUID(),
        role: "assistant",
        text: error?.name === "AbortError"
          ? "已停止生成。"
          : error?.message || "Hermes 暂时无法完成这次请求。",
        error: error?.name !== "AbortError",
        ...(error?.name === "AbortError" ? {} : { retryPrompt: displayPrompt }),
      }]);
      if (error?.name !== "AbortError") setInput(displayPrompt);
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

  const clearConversation = () => {
    setMessages([]);
    setInput("");
    clearAttachments();
    agentSessionRef.current = crypto.randomUUID();
    requestAnimationFrame(() => composerRef.current?.focus());
  };
  const retryMessage = [...messages].reverse().find((message) => message.retryPrompt);
  const retry = () => {
    if (!retryMessage) return;
    setMessages((value) => value.map((item) =>
      item.id === retryMessage.id ? { ...item, retryPrompt: null } : item,
    ));
    submitPrompt(retryMessage.retryPrompt, false);
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
        <div className="assistant-header-actions">
          <button
            type="button"
            className="assistant-icon-button"
            aria-label="清空对话"
            disabled={busy || !messages.length}
            onClick={clearConversation}
          >
            <svg aria-hidden="true" viewBox="0 0 24 24">
              <path d="M4.9 8.5A8 8 0 1 1 4 14M4.9 8.5V4m0 4.5H9.4" />
            </svg>
          </button>
          <button type="button" className="assistant-icon-button" aria-label="关闭 Hermes" onClick={closePanel}>−</button>
        </div>
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
              <button type="button" onClick={() => copyValue("command", command)}>
                {copied === "command" ? "已复制更新命令" : "重新安装 Connector"}
              </button>
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
                <p>输入 /，可以生成新画布或整理当前画布。</p>
              </div>
            ) : messages.map((message) => (
              <div
                key={message.id}
                className={`assistant-message assistant-message--${message.role}${message.error ? " assistant-message--error" : ""}`}
                role={message.error ? "alert" : undefined}
              >
                <AssistantMessageText text={message.text} />
                {message.attachmentNames?.length > 0 && (
                  <ul className="assistant-message-attachments" aria-label="已上传图片">
                    {message.attachmentNames.map((name) => <li key={name}>{name}</li>)}
                  </ul>
                )}
                {message.images?.length > 0 && (
                  <div className="assistant-generated-images">
                    {message.images.map((image) => (
                      <figure key={image.id}>
                        <img src={image.src} alt={image.caption || image.name || "Hermes 生成的图片"} />
                        <figcaption>
                          <span>{image.caption || image.name}</span>
                          <button type="button" onClick={() => onInsertImage(image)}>放到画布</button>
                        </figcaption>
                      </figure>
                    ))}
                  </div>
                )}
                {message.error && message.retryPrompt && (
                  <button type="button" className="assistant-retry assistant-retry--message" disabled={busy} onClick={() => {
                    setMessages((value) => value.map((item) => item.id === message.id ? { ...item, retryPrompt: null } : item));
                    submitPrompt(message.retryPrompt, false);
                  }}>重试</button>
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
              </div>
            )}
          </div>
          {selectionCount > 0 && (
            <div className="assistant-scope" role="status">
              <span>仅处理已选中的 {selectionCount} 个元素</span>
              <button type="button" onClick={onClearSelection}>清除选区</button>
            </div>
          )}
          <div className="assistant-composer-shell">
            {slashSuggestions.length > 0 && (
              <ul id="hermes-slash-options" className="assistant-slash-options" role="listbox" aria-label="Hermes 画布命令">
                {slashSuggestions.map((item, index) => (
                  <li key={item.command} role="none">
                    <button
                      id={`hermes-slash-option-${index}`}
                      type="button"
                      role="option"
                      aria-selected={index === slashIndex}
                      data-active={index === slashIndex}
                      ref={(node) => { slashOptionRefs.current[index] = node; }}
                      onMouseDown={(event) => event.preventDefault()}
                      onClick={() => selectSlashSuggestion(item)}
                    >
                      <span>{item.command}</span>
                      <small>{item.description}</small>
                    </button>
                  </li>
                ))}
              </ul>
            )}
            <form className="assistant-composer" aria-busy={busy} onSubmit={send}>
              <input
                ref={fileInputRef}
                type="file"
                hidden
                multiple
                accept="image/png,image/jpeg,image/webp,image/gif,image/bmp"
                onChange={(event) => addAttachments(event.target.files)}
              />
              {attachments.length > 0 && (
                <ul className="assistant-attachment-list" aria-label="待发送图片">
                  {attachments.map((item) => (
                    <li key={item.id}>
                      <img src={item.preview} alt="" />
                      <span>{item.file.name}</span>
                      <button
                        type="button"
                        aria-label={`移除 ${item.file.name}`}
                        onClick={() => {
                          URL.revokeObjectURL(item.preview);
                          setAttachments((value) => value.filter((entry) => entry.id !== item.id));
                        }}
                      >×</button>
                    </li>
                  ))}
                </ul>
              )}
              {attachmentError && <p id="assistant-attachment-error" className="assistant-attachment-error" role="alert">{attachmentError}</p>}
              <textarea
                ref={composerRef}
                rows="1"
                value={input}
                placeholder="问问题；输入 / 使用画布命令…"
                aria-label="发送给 Hermes 的消息"
                aria-autocomplete="list"
                aria-expanded={slashSuggestions.length > 0}
                aria-controls={slashSuggestions.length ? "hermes-slash-options" : undefined}
                aria-activedescendant={slashSuggestions.length ? `hermes-slash-option-${slashIndex}` : undefined}
                aria-describedby={attachmentError ? "assistant-attachment-error" : undefined}
                aria-invalid={Boolean(attachmentError)}
                onChange={(event) => {
                  setInput(event.target.value);
                  setSlashDismissed(false);
                  setSlashIndex(0);
                }}
                onKeyDown={(event) => {
                  if (slashSuggestions.length && ["ArrowDown", "ArrowUp"].includes(event.key)) {
                    event.preventDefault();
                    setSlashIndex((index) => (
                      event.key === "ArrowDown"
                        ? (index + 1) % slashSuggestions.length
                        : (index - 1 + slashSuggestions.length) % slashSuggestions.length
                    ));
                    return;
                  }
                  if (slashSuggestions.length && event.key === "Escape") {
                    event.preventDefault();
                    event.stopPropagation();
                    setSlashDismissed(true);
                    return;
                  }
                  if (slashSuggestions.length && event.key === "Enter" && !event.shiftKey) {
                    event.preventDefault();
                    selectSlashSuggestion(slashSuggestions[slashIndex]);
                    return;
                  }
                  if (event.key === "Enter" && !event.shiftKey) {
                    event.preventDefault();
                    if (!busy) event.currentTarget.form?.requestSubmit();
                  }
                }}
              />
              <button
                type="button"
                className="assistant-attach-button"
                aria-label="上传图片"
                title="上传图片"
                disabled={busy || attachments.length >= 4}
                onClick={() => fileInputRef.current?.click()}
              >
                <AttachmentIcon />
              </button>
              <button
                className="assistant-send-button"
                type={busy ? "button" : "submit"}
                disabled={!busy && !input.trim() && !attachments.length}
                aria-label={busy ? "停止生成" : "发送消息"}
                onClick={busy ? () => generationRef.current?.abort() : undefined}
              >
                {busy ? <StopIcon /> : <SendIcon />}
              </button>
            </form>
          </div>
          {false && retryMessage && (
            <button
              type="button"
              className="assistant-retry assistant-retry--composer"
              disabled={busy}
              onClick={retry}
            >
              重试
            </button>
          )}
        </>
      )}
    </aside>
  );
}

function LinkPopover({ element, appState, anchor, onClose, onSave, onPreview, onRemove }) {
  const [url, setUrl] = useState(getStoryHref(element) ?? "");
  const [customIcon, setCustomIcon] = useState(getStoryIconImage(element));
  const [icon, setIcon] = useState(customIcon ? "custom" : getStoryIconKind(element));
  const [side, setSide] = useState(
    element.customData?.storyIconSide === "right" ? "right" : "left",
  );
  const [invalid, setInvalid] = useState(false);
  const [uploadError, setUploadError] = useState("");
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
    onSave({ href, icon, side, customIcon });
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
                  setCustomIcon("");
                  setUploadError("");
                  onPreview({ icon: value, side, customIcon: "" });
                }}
              />
              <span>
                {value === "none"
                  ? <b className="no-icon-option" aria-hidden="true">无</b>
                  : <svg aria-hidden="true" viewBox="0 0 24 24">
                    <LinkDoodle kind={value} x={0} y={0} size={24} />
                  </svg>}
              </span>
            </label>
          ))}
          <label className="custom-icon-option" data-selected={icon === "custom"}>
            <input
              type="file"
              accept="image/png,image/jpeg,image/webp"
              aria-label="上传自定义链接图标"
              aria-describedby={uploadError ? "link-icon-error" : undefined}
              aria-invalid={Boolean(uploadError)}
              onChange={async (event) => {
                const file = event.target.files?.[0];
                event.target.value = "";
                if (!file) return;
                try {
                  const image = await makeStoryIconImage(file);
                  setCustomIcon(image);
                  setIcon("custom");
                  setUploadError("");
                  onPreview({ icon: "custom", side, customIcon: image });
                } catch (error) {
                  setUploadError(error.message);
                }
              }}
            />
            <span>
              {customIcon
                ? <img src={customIcon} alt="" />
                : <svg aria-hidden="true" viewBox="0 0 24 24"><path d="M12 4v11m-4-7 4-4 4 4M5 14v5h14v-5" /></svg>}
              <b>{customIcon ? "更换图片" : "上传图片"}</b>
            </span>
          </label>
        </div>
        {uploadError && <p id="link-icon-error" className="field-error" role="alert">{uploadError}</p>}
      </fieldset>

      {icon !== "none" && <fieldset className="link-options">
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
                  onPreview({ icon, side: value, customIcon });
                }}
              />
              <span>{label}</span>
            </label>
          ))}
        </div>
      </fieldset>}

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
  const hasIcon = getStoryIconKind(element) !== "none";
  const centerX = element.x + element.width / 2;
  const centerY = element.y + element.height / 2;
  const rotation = `rotate(${(element.angle * 180) / Math.PI} ${centerX} ${centerY})`;
  const underline = `M ${element.x} ${underlineY} C ${element.x + element.width * 0.28} ${underlineY + size * 0.08}, ${element.x + element.width * 0.68} ${underlineY - size * 0.08}, ${element.x + element.width} ${underlineY}`;
  const hitX = (hasIcon ? Math.min(element.x, iconX) : element.x) - size * 0.2;
  const hitRight = (hasIcon ? Math.max(element.x + element.width, iconX + size) : element.x + element.width) + size * 0.2;

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
      <StoryLinkIcon
        element={element}
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

function formatStoryViewBox({ x, y, width, height }) {
  return `${x} ${y} ${width} ${height}`;
}

function syncBoldButton(elements, appState) {
  const button = document.querySelector('[data-testid="font-family-bold"]');
  if (!button) return;
  const texts = selectedTextElements(elements, appState);
  const active = texts.length > 0 && texts.every((text) => text.customData?.unfoldBold);
  button.classList.toggle("unfold-bold-active", active);
  button.setAttribute("aria-pressed", String(active));
}

function readStoryArtwork(svg) {
  const { x, y, width, height } = svg.viewBox.baseVal;
  if (![x, y, width, height].every(Number.isFinite) || width <= 0 || height <= 0) {
    throw new Error("Invalid exported SVG viewBox");
  }
  return {
    markup: svg.innerHTML,
    viewBox: `${x} ${y} ${width} ${height}`,
    width,
    height,
  };
}

function StoryScene({ activeStep, artwork, frame, linkedElements, targetViewBox }) {
  const svgRef = useRef(null);
  const currentViewBox = useRef(frame);

  useEffect(() => {
    const svg = svgRef.current;
    if (!svg) return undefined;
    const setViewBox = (value) => {
      svg.setAttribute("viewBox", formatStoryViewBox(value));
      currentViewBox.current = value;
    };
    const shotStart = activeStep?.storyCameraStart;
    const from = shotStart ?? currentViewBox.current;
    if (shotStart) setViewBox(shotStart);
    const unchanged = ["x", "y", "width", "height"]
      .every((key) => from[key] === targetViewBox[key]);
    if (unchanged || window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      setViewBox(targetViewBox);
      return undefined;
    }
    let animationFrame;
    let startedAt;
    const animate = (time) => {
      startedAt ??= time;
      const progress = (time - startedAt) /
        (shotStart ? activeStep.storyCameraDuration : STORY_CAMERA_DURATION);
      setViewBox(shotStart
        ? interpolateStoryCameraShot(from, targetViewBox, progress)
        : interpolateStoryViewBox(from, targetViewBox, progress));
      if (progress < 1) animationFrame = requestAnimationFrame(animate);
    };
    animationFrame = requestAnimationFrame(animate);
    return () => cancelAnimationFrame(animationFrame);
  }, [activeStep, targetViewBox]);

  return (
    <svg
      ref={svgRef}
      className="story-scene"
      viewBox={formatStoryViewBox(frame)}
      aria-label="讲解画面"
    >
      <svg
        className="story-art"
        x={frame.x}
        y={frame.y}
        width={frame.width}
        height={frame.height}
        viewBox={artwork.viewBox}
        aria-hidden="true"
        dangerouslySetInnerHTML={{ __html: artwork.markup }}
      />
      {linkedElements.map((element) => (
        <StoryLink
          key={element.id}
          active={activeStep?.storyElementIds?.includes(element.id) ?? element.id === activeStep?.id}
          element={element}
        />
      ))}
    </svg>
  );
}

function StoryView({ scene, onExit }) {
  const [artwork, setArtwork] = useState(null);
  const [stepIndex, setStepIndex] = useState(0);
  const embedded = window.self !== window.top;
  const visibleElements = useMemo(
    () => scene?.elements?.filter((element) => !element.isDeleted) ?? [],
    [scene],
  );
  const linkedElements = useMemo(
    () => visibleElements.filter(getStoryHref),
    [visibleElements],
  );
  const storyPadding = useMemo(
    () => storyPaddingForElements(visibleElements),
    [visibleElements],
  );
  const baseFrame = useMemo(
    () => storyFrameForElements(visibleElements),
    [visibleElements],
  );
  const frame = useMemo(
    () => artwork
      ? { ...baseFrame, width: artwork.width, height: artwork.height }
      : baseFrame,
    [artwork, baseFrame],
  );
  const steps = useMemo(
    () => getStorySteps(visibleElements, scene?.storyPath),
    [scene?.storyPath, visibleElements],
  );
  const lastStepIndex = steps.length ? steps.length + 1 : 0;
  const finished = stepIndex > steps.length;
  const activeStep = steps[stepIndex - 1] ?? null;
  const focusBounds = activeStep?.storyCamera ?? activeStep;
  const targetViewBox = useMemo(
    () => getStoryViewBox(
      frame,
      focusBounds,
      activeStep?.storyCamera ? Number.POSITIVE_INFINITY : 2.2,
      activeStep?.storyCamera ? 0 : 96,
    ),
    [activeStep?.storyCamera, focusBounds, frame],
  );

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
      setStepIndex((value) => Math.max(0, Math.min(lastStepIndex, value + direction)));
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [lastStepIndex, onExit]);

  useEffect(() => {
    if (!scene || !visibleElements.length) return undefined;
    let disposed = false;
    setArtwork(null);
    exportToSvg({
      elements: visibleElements,
      appState: { ...scene.appState, exportBackground: false },
      files: scene.files,
      exportPadding: storyPadding,
    })
      .then((svg) => {
        if (!disposed) setArtwork(readStoryArtwork(svg));
      })
      .catch(() => {
        if (!disposed) setArtwork(null);
      });
    return () => {
      disposed = true;
    };
  }, [scene, storyPadding, visibleElements]);

  if (!scene || !visibleElements.length || !artwork) {
    return <p className="story-loading" role="status">正在整理画面…</p>;
  }

  const storyText = visibleElements
    .filter((element) => element.type === "text")
    .map((element) => element.text)
    .join(" ");

  return (
    <section className="story-view" aria-label="作品讲解">
      {storyText && <p className="story-transcript">{storyText}</p>}
      <StoryScene
        activeStep={activeStep}
        artwork={artwork}
        frame={frame}
        linkedElements={linkedElements}
        targetViewBox={targetViewBox}
      />
      {!embedded && <nav className="story-steps" aria-label="讲解步骤">
        <button
          type="button"
          aria-label="上一步"
          disabled={stepIndex === 0}
          onClick={() => setStepIndex(stepIndex - 1)}
        >
          <ChevronIcon direction="left" />
        </button>
        <div className="story-step-status" aria-live="polite">
          <span className="story-step-meta">
            {activeStep ? `步骤 ${stepIndex} / ${steps.length}` : finished ? "讲解结束" : `${steps.length} 个步骤`}
          </span>
          <strong>{activeStep ? storyStepLabel(activeStep) : finished ? "全部内容" : "全景"}</strong>
          {activeStep?.storyNote?.trim() && (
            <span className="story-step-note">{activeStep.storyNote.trim()}</span>
          )}
        </div>
        <button
          type="button"
          aria-label="下一步"
          disabled={stepIndex === lastStepIndex}
          onClick={() => setStepIndex(stepIndex + 1)}
        >
          <ChevronIcon direction="right" />
        </button>
      </nav>}
    </section>
  );
}

function UnfoldDialog({ children, className = "", onClose, showClose = true, title }) {
  const dialogRef = useRef(null);

  useEffect(() => {
    dialogRef.current?.showModal();
    dialogRef.current?.focus({ preventScroll: true });
  }, []);

  return (
    <dialog
      aria-labelledby="unfold-dialog-title"
      className={`unfold-dialog ${className}`}
      onCancel={(event) => {
        event.preventDefault();
        onClose();
      }}
      ref={dialogRef}
      tabIndex="-1"
    >
      <header>
        <h2 id="unfold-dialog-title">{title}</h2>
        {showClose && (
          <button className="unfold-dialog__close" aria-label="关闭" onClick={onClose} type="button">×</button>
        )}
      </header>
      {children}
    </dialog>
  );
}

function ExportDialog({ error, onClose, onExport }) {
  return (
    <UnfoldDialog className="unfold-export-dialog" onClose={onClose} title="导出">
      <p>选择导出类型</p>
      <div className="unfold-export-options">
        <button autoFocus onClick={() => onExport("unfold")} type="button">
          <strong>UNFOLD</strong>
          <span>可再次打开和编辑</span>
        </button>
        <button onClick={() => onExport("png")} type="button">
          <strong>PNG</strong>
          <span>导出为图片</span>
        </button>
        <button onClick={() => onExport("svg")} type="button">
          <strong>SVG</strong>
          <span>导出为矢量图片</span>
        </button>
      </div>
      {error && <p className="unfold-export-error" role="alert">{error}</p>}
    </UnfoldDialog>
  );
}

function SupabaseSyncDialog({ available, session, onClose, onConnect, onDisconnect, status }) {
  const [email, setEmail] = useState(session?.user?.email ?? "");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [mode, setMode] = useState("signin");
  const emailValid = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
  const passwordValid = password.length >= 6;

  const connect = async (event) => {
    event.preventDefault();
    setBusy(true);
    setError("");
    setNotice("");
    try {
      const result = await onConnect({ email, password, mode });
      if (result?.pending) {
        setMode("signin");
        setNotice("注册成功。请先查收验证邮件，然后回来登录。");
      }
    } catch (connectionError) {
      setError(connectionError.message || "连接失败，请检查配置。");
    } finally {
      setBusy(false);
    }
  };

  return (
    <UnfoldDialog className="supabase-sync-dialog" onClose={onClose} title="云同步">
      <div className="supabase-sync-dialog__hero">
        <span className="supabase-sync-dialog__icon" aria-hidden="true">
          <svg fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.5" viewBox="0 0 24 24">
            <path d="M7.5 18.5h9a4 4 0 0 0 .6-7.95A5.5 5.5 0 0 0 6.5 9a4.75 4.75 0 0 0 1 9.5Z" />
            <path d="m9.5 14 2.5 2.5 3.5-4" />
          </svg>
        </span>
        <div>
          <h3>{session
            ? status === "syncing" ? "正在同步" : status === "error" ? "连接异常" : "已连接"
            : mode === "signup" ? "创建账号" : "登录后同步作品"}</h3>
          <p>{session
            ? session.user.email
            : mode === "signup"
              ? "使用邮箱创建账号，在不同设备间同步作品。"
              : "换一台设备登录，也能继续编辑。无需同步时可直接使用画布。"}</p>
        </div>
      </div>

      {!session && !available && (
        <p className="supabase-sync-dialog__unavailable" role="alert">云同步尚未完成配置。</p>
      )}

      {!session && available && <form onSubmit={connect}>
        <label className="supabase-sync-dialog__field" htmlFor="supabase-email">
          <span>邮箱</span>
          <div className={`supabase-sync-dialog__input ${error ? "is-error" : ""}`}>
            <svg className="supabase-sync-dialog__input-icon" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="1.5" viewBox="0 0 24 24">
              <rect x="3.5" y="5.5" width="17" height="13" rx="2.5" />
              <path d="m5 7 7 5 7-5" />
            </svg>
            <input
              aria-describedby="supabase-auth-message"
              aria-invalid={Boolean(error)}
              autoComplete="email"
              id="supabase-email"
              onChange={(event) => setEmail(event.target.value)}
              placeholder="name@example.com"
              required
              type="email"
              value={email}
            />
            {emailValid && !error && (
              <svg className="supabase-sync-dialog__success" aria-hidden="true" fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.25" viewBox="0 0 24 24">
                <path d="m5.5 12.5 4 4 9-9" />
              </svg>
            )}
          </div>
        </label>
        <label className="supabase-sync-dialog__field" htmlFor="supabase-password">
          <span>密码</span>
          <div className={`supabase-sync-dialog__input ${error ? "is-error" : ""}`}>
            <svg className="supabase-sync-dialog__input-icon" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="1.5" viewBox="0 0 24 24">
              <rect x="5" y="10" width="14" height="10" rx="2.5" />
              <path d="M8.5 10V7.5a3.5 3.5 0 0 1 7 0V10" />
            </svg>
            <input
              aria-describedby="supabase-auth-message"
              aria-invalid={Boolean(error)}
              autoComplete={mode === "signup" ? "new-password" : "current-password"}
              id="supabase-password"
              minLength="6"
              onChange={(event) => setPassword(event.target.value)}
              placeholder="至少 6 位"
              required
              type={showPassword ? "text" : "password"}
              value={password}
            />
            <button
              aria-label={showPassword ? "隐藏密码" : "显示密码"}
              className="supabase-sync-dialog__reveal"
              onClick={() => setShowPassword((value) => !value)}
              type="button"
            >
              <svg aria-hidden="true" fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.5" viewBox="0 0 24 24">
                {showPassword
                  ? <><path d="M4 4 20 20" /><path d="M10.6 10.7a2 2 0 0 0 2.7 2.7M9.9 5.2A10.7 10.7 0 0 1 12 5c5.5 0 9 7 9 7a16.6 16.6 0 0 1-2.1 3M6.6 6.6C4.3 8.2 3 12 3 12s3.5 7 9 7a9.8 9.8 0 0 0 4-.9" /></>
                  : <><path d="M3 12s3.5-7 9-7 9 7 9 7-3.5 7-9 7-9-7-9-7Z" /><circle cx="12" cy="12" r="2.5" /></>}
              </svg>
            </button>
          </div>
        </label>
        <div className="supabase-sync-dialog__message" id="supabase-auth-message">
          {notice && <p className="supabase-sync-dialog__notice" role="status">{notice}</p>}
          {error && <p className="supabase-sync-dialog__error" role="alert">{error}</p>}
          {!notice && !error && password && !passwordValid && <p>密码至少需要 6 位。</p>}
        </div>
        <div className="supabase-sync-dialog__auth-actions">
          <button className="unfold-dialog__primary" disabled={busy} type="submit">
            {busy ? (mode === "signup" ? "正在创建…" : "正在验证…") : mode === "signup" ? "创建账号" : "登录并开始同步"}
          </button>
        </div>
        <p className="supabase-sync-dialog__switch">
          {mode === "signup" ? "已有账号？" : "还没有账号？"}
          <button
            disabled={busy}
            onClick={() => {
              setMode((value) => value === "signup" ? "signin" : "signup");
              setError("");
              setNotice("");
            }}
            type="button"
          >
            {mode === "signup" ? "登录" : "创建账号"}
          </button>
        </p>
        <small className="supabase-sync-dialog__privacy">登录仅用于云同步，本地画布始终可以直接使用。</small>
      </form>}

      {session && (
        <button className="supabase-sync-dialog__disconnect" onClick={onDisconnect} type="button">
          退出并断开同步
        </button>
      )}
    </UnfoldDialog>
  );
}

function WorkThumbnail({ scene }) {
  const [artwork, setArtwork] = useState(null);

  useEffect(() => {
    const elements = scene?.elements?.filter((element) => !element.isDeleted) ?? [];
    if (!elements.length) {
      setArtwork(null);
      return undefined;
    }
    let disposed = false;
    exportToSvg({
      elements,
      appState: { ...scene.appState, exportBackground: true },
      files: scene.files ?? {},
      exportPadding: 24,
      renderEmbeddables: true,
    }).then((svg) => {
      if (!disposed) setArtwork(readStoryArtwork(svg));
    }).catch(() => {
      if (!disposed) setArtwork(null);
    });
    return () => {
      disposed = true;
    };
  }, [scene]);

  if (!scene?.elements?.some((element) => !element.isDeleted)) {
    return <em>空白作品</em>;
  }
  if (!artwork) return <em>正在生成预览…</em>;
  return (
    <svg
      viewBox={artwork.viewBox}
      preserveAspectRatio="xMidYMid meet"
      aria-hidden="true"
      dangerouslySetInnerHTML={{ __html: artwork.markup }}
    />
  );
}

function WorksLibrary({ activeWorkId, cloudSync, onBack, onDelete, onOpen, onRename, onShare, works }) {
  return (
    <section className="works-library" aria-labelledby="works-library-title">
      <header className="works-library__header">
        <div className="works-library__heading">
          <span className="works-library__brand">UNFOLD</span>
          <h1 id="works-library-title">我的作品</h1>
        </div>
        <div className="works-library__actions">
          <button className="works-library__close" aria-label="返回画布" onClick={onBack} type="button">
            <svg aria-hidden="true" fill="none" stroke="currentColor" strokeLinecap="round" strokeWidth="2" viewBox="0 0 24 24">
              <path d="m7 7 10 10M17 7 7 17" />
            </svg>
          </button>
        </div>
      </header>
      <div className="works-library__grid">
        {works.map((work) => (
          <article
            className={`work-card${work.id === activeWorkId ? " work-card--active" : ""}`}
            key={work.id}
          >
            <button className="work-card__preview" onClick={() => onOpen(work.id)} type="button">
              <span className="work-card__paper">
                <WorkThumbnail scene={work.scene} />
              </span>
            </button>
            <div className="work-card__meta">
              <button className="work-card__title" onClick={() => onOpen(work.id)} type="button">
                <strong>{work.name}</strong>
                <span>
                {new Date(work.updatedAt).toLocaleString("zh-CN", {
                  month: "numeric",
                  day: "numeric",
                  hour: "2-digit",
                  minute: "2-digit",
                })}
                {cloudSync ? " · 云同步" : " · 仅本地"}
                {work.id === activeWorkId ? " · 当前" : ""}
                </span>
              </button>
              <div className="work-card__tools">
                <button aria-label={`分享 ${work.name}`} onClick={() => onShare(work.id)} type="button">分享</button>
                <button aria-label={`重命名 ${work.name}`} onClick={() => onRename(work.id)} type="button">重命名</button>
                <button aria-label={`删除 ${work.name}`} onClick={() => onDelete(work.id)} type="button">删除</button>
              </div>
            </div>
          </article>
        ))}
      </div>
    </section>
  );
}

function ShareWorkDialog({ onClose, onShare, work }) {
  const [slug, setSlug] = useState("");
  const valid = /^[a-z0-9](?:[a-z0-9-]{1,46}[a-z0-9])?$/.test(slug);
  return (
    <UnfoldDialog className="share-work-dialog" onClose={onClose} title={`分享“${work.name}”`}>
      <p>设置一个容易记住的只读链接。</p>
      <label>
        <span>{location.origin}/s/</span>
        <input
          autoFocus
          maxLength="48"
          onChange={(event) => setSlug(event.target.value.toLowerCase().replace(/[^a-z0-9-]/g, ""))}
          placeholder="my-idea"
          value={slug}
        />
      </label>
      <div className="unfold-dialog__actions">
        <button onClick={onClose} type="button">取消</button>
        <button className="unfold-dialog__primary" disabled={!valid} onClick={() => onShare(slug)} type="button">复制链接</button>
      </div>
    </UnfoldDialog>
  );
}

function ClearCanvasDialog({ onCancel, onConfirm }) {
  return (
    <UnfoldDialog
      className="unfold-confirm-dialog"
      onClose={onCancel}
      showClose={false}
      title="清空画布"
    >
      <p>这会清空整个画布。确定要继续吗？</p>
      <div className="unfold-dialog__actions">
        <button autoFocus onClick={onCancel} type="button">取消</button>
        <button className="unfold-dialog__danger" onClick={onConfirm} type="button">清空</button>
      </div>
    </UnfoldDialog>
  );
}

function CameraPreviewOverlay({ frame, onClose, scene, step }) {
  const [replayKey, setReplayKey] = useState(0);
  const end = step.storyCamera ?? getStoryViewBox(frame, step, 2.2, 96);
  const start = step.storyCameraStart ?? end;

  useEffect(() => {
    const closeOnEscape = (event) => {
      if (event.key === "Escape") onClose();
    };
    document.addEventListener("keydown", closeOnEscape);
    return () => document.removeEventListener("keydown", closeOnEscape);
  }, [onClose]);

  return (
    <section className="story-camera-fullscreen" aria-label={`预览镜头：${storyStepLabel(step)}`}>
      <StoryCameraPreview
        className="story-camera-preview--full"
        duration={step.storyCameraDuration}
        end={end}
        frame={frame}
        replayKey={replayKey}
        scene={scene}
        start={start}
      />
      <button type="button" className="story-camera-preview-close" onClick={onClose}>返回镜头设置</button>
      <div className="story-camera-preview-controls">
        <span>{storyStepLabel(step)}</span>
        <button type="button" onClick={() => setReplayKey((value) => value + 1)}>↻ 重播</button>
      </div>
    </section>
  );
}

function App() {
  const sharedPayload = useMemo(
    () => new URLSearchParams(location.hash.slice(1)).get("scene"),
    [],
  );
  const sharedSceneId = useMemo(() => sceneIdFromPath(location.pathname), []);
  const isShared = Boolean(sharedPayload || sharedSceneId);
  const workspace = useMemo(
    () => initializeWorkStorage(localStorage, () => crypto.randomUUID()),
    [],
  );
  const localScene = useMemo(
    () => withoutNativeLinks(
      readScene(localStorage, sceneKeyForWork(workspace.activeWorkId)) ?? starterScene(),
    ),
    [workspace.activeWorkId],
  );
  const [works, setWorks] = useState(workspace.works);
  const [preview, setPreview] = useState(isShared);
  const [saveError, setSaveError] = useState(false);
  const [publishState, setPublishState] = useState("idle");
  const [shareError, setShareError] = useState(false);
  const [notionNotice, setNotionNotice] = useState("");
  const [shareWorkId, setShareWorkId] = useState(null);
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
  const [pathEditorOpen, setPathEditorOpen] = useState(false);
  const [cameraPreviewStepId, setCameraPreviewStepId] = useState(null);
  const [assistantOpen, setAssistantOpen] = useState(false);
  const [assistantVisited, setAssistantVisited] = useState(false);
  const [agentUndoAvailable, setAgentUndoAvailable] = useState(false);
  const [hermesConnected, setHermesConnected] = useState(false);
  const [clearOpen, setClearOpen] = useState(false);
  const [exportOpen, setExportOpen] = useState(false);
  const [supabaseOpen, setSupabaseOpen] = useState(false);
  const supabaseConfig = useMemo(() => supabaseConfigFromEnv(import.meta.env), []);
  const [supabaseSession, setSupabaseSession] = useState(
    () => isShared ? null : readSupabaseSession(localStorage),
  );
  const [supabaseState, setSupabaseState] = useState("idle");
  const [worksOpen, setWorksOpen] = useState(false);
  const [exportError, setExportError] = useState("");
  const [storyPath, setStoryPath] = useState(localScene.storyPath);
  const linkEditorTrigger = useRef(null);
  const pathButtonRef = useRef(null);
  const assistantButtonRef = useRef(null);
  const fileInputRef = useRef(null);
  const saveTimer = useRef();
  const publishTimer = useRef();
  const notionNoticeTimer = useRef();
  const supabaseTimer = useRef();
  const supabaseQueue = useRef(Promise.resolve());
  const supabaseReady = useRef(false);
  const supabaseSessionRef = useRef(supabaseSession);
  const saveRevision = useRef(0);
  const activeWorkId = useRef(workspace.activeWorkId);
  const publication = useRef(
    readPublication(localStorage, publicationKeyForWork(workspace.activeWorkId)),
  );
  const highlighterPointerUp = useRef(null);
  const agentUndoScene = useRef(null);
  const agentUndoRevision = useRef("");
  const latestScene = useRef(localScene);
  const worksRef = useRef(works);
  worksRef.current = works;
  const linkEditorElement = editorView.elements.find(
    (element) => element.id === linkEditorId && !element.isDeleted,
  );
  const editorStorySteps = useMemo(
    () => getStorySteps(editorView.elements, storyPath),
    [editorView.elements, storyPath],
  );
  const editorStoryFrame = useMemo(
    () => storyFrameForElements(editorView.elements),
    [editorView.elements],
  );
  const cameraPreviewStep = editorStorySteps.find((step) => step.id === cameraPreviewStepId) ?? null;

  const selectedStoryElementIds = useMemo(
    () => Object.keys(editorView.appState.selectedElementIds ?? {}).filter((id) =>
      editorView.elements.some((element) => element.id === id && !element.isDeleted),
    ),
    [editorView.appState.selectedElementIds, editorView.elements],
  );

  const persistScene = useCallback((nextScene) => {
    window.clearTimeout(saveTimer.current);
    const revision = ++saveRevision.current;
    const workId = activeWorkId.current;
    saveTimer.current = window.setTimeout(async () => {
      if (!await writeScene(localStorage, sceneKeyForWork(workId), nextScene)) {
        if (revision === saveRevision.current) setSaveError(true);
        return;
      }
      setWorks((currentWorks) => {
        const nextWorks = currentWorks.map((work) => work.id === workId
          ? { ...work, updatedAt: Date.now() }
          : work);
        writeWorks(localStorage, nextWorks);
        return nextWorks;
      });
      if (revision === saveRevision.current) setSaveError(false);
    }, 400);
  }, []);

  const openWork = useCallback(async (workId, restoringCloud = false) => {
    setWorksOpen(false);
    if (workId === activeWorkId.current && !restoringCloud) {
      setPreview(false);
      return;
    }
    window.clearTimeout(saveTimer.current);
    saveRevision.current += 1;
    if (!restoringCloud) {
      await writeScene(localStorage, sceneKeyForWork(activeWorkId.current), latestScene.current);
    }
    localStorage.setItem(ACTIVE_WORK_STORAGE_KEY, workId);
    activeWorkId.current = workId;
    publication.current = readPublication(localStorage, publicationKeyForWork(workId));
    const nextScene = withoutNativeLinks(
      readScene(localStorage, sceneKeyForWork(workId)) ?? starterScene(),
    );
    latestScene.current = nextScene;
    editorViewSignature.current = editorLinkSignature(nextScene.elements, nextScene.appState);
    setScene(nextScene);
    setEditorView({ elements: nextScene.elements, appState: nextScene.appState });
    setStoryPath(nextScene.storyPath ?? []);
    setLinkEditorId(null);
    setPathEditorOpen(false);
    setAssistantOpen(false);
    setHighlighterActive(false);
    setPreview(false);
    setSaveError(false);
    if (!preview) {
      excalidrawAPI?.resetScene();
      excalidrawAPI?.addFiles(Object.values(nextScene.files ?? {}));
      excalidrawAPI?.updateScene({ elements: nextScene.elements, appState: nextScene.appState });
    }
  }, [excalidrawAPI, preview]);

  const applyCloudWorkspace = useCallback(async (value) => {
    const snapshot = parseWorkspaceSnapshot(value);
    if (!snapshot) throw new Error("云端作品数据格式无效。");
    if (!await writeWorkspaceSnapshot(localStorage, snapshot)) {
      throw new Error("浏览器存储空间不足，无法下载云端作品。");
    }
    setWorks(snapshot.works);
    await openWork(snapshot.activeWorkId, true);
  }, [openWork]);

  const ensureSupabaseSession = useCallback(async (config) => {
    const current = supabaseSessionRef.current;
    if (!current) throw new Error("请先登录 Supabase。");
    if (current.expiresAt > Date.now() + 60_000) return current;
    const refreshed = await refreshSupabaseSession(config, current);
    if (!writeSupabaseSession(localStorage, refreshed)) {
      throw new Error("无法在浏览器中保存登录状态。");
    }
    supabaseSessionRef.current = refreshed;
    setSupabaseSession(refreshed);
    return refreshed;
  }, []);

  const mergeSupabaseWorkspace = useCallback(async (config, auth) => {
    const cloud = await pullSupabaseWorkspace(config, auth);
    const cloudSnapshot = cloud && parseWorkspaceSnapshot(cloud);
    if (cloud && !cloudSnapshot) throw new Error("云端作品数据格式无效。");
    const local = createWorkspaceSnapshot(
      localStorage,
      worksRef.current,
      activeWorkId.current,
    );
    const merged = cloud
      ? mergeWorkspaceSnapshots(local, cloudSnapshot, latestScene.current)
      : { ...local, scenes: { ...local.scenes, [local.activeWorkId]: latestScene.current } };
    if (cloud) await applyCloudWorkspace(merged);
    await pushSupabaseWorkspace(config, auth, merged);
  }, [applyCloudWorkspace]);

  const syncExistingSupabase = useCallback(async (config) => {
    setSupabaseState("syncing");
    try {
      const auth = await ensureSupabaseSession(config);
      await mergeSupabaseWorkspace(config, auth);
      supabaseReady.current = true;
      setSupabaseState("connected");
    } catch (error) {
      supabaseReady.current = false;
      setSupabaseState("error");
      throw error;
    }
  }, [ensureSupabaseSession, mergeSupabaseWorkspace]);

  const connectSupabase = useCallback(async (settings) => {
    const config = supabaseConfig;
    if (!config) throw new Error("云同步尚未完成配置。");
    setSupabaseState("syncing");
    try {
      const authResult = settings.mode === "signup"
        ? await signUpSupabase(config, settings.email, settings.password)
        : { session: await signInSupabase(config, settings.email, settings.password) };
      if (!authResult.session) {
        setSupabaseState("idle");
        return { pending: true };
      }
      const auth = authResult.session;
      await mergeSupabaseWorkspace(config, auth);
      if (!writeSupabaseSession(localStorage, auth)) {
        throw new Error("无法在浏览器中保存 Supabase 登录信息。");
      }
      supabaseSessionRef.current = auth;
      supabaseReady.current = true;
      setSupabaseSession(auth);
      setSupabaseState("connected");
      return { pending: false };
    } catch (error) {
      supabaseReady.current = false;
      setSupabaseState("error");
      throw error;
    }
  }, [mergeSupabaseWorkspace, supabaseConfig]);

  const disconnectSupabase = useCallback(() => {
    window.clearTimeout(supabaseTimer.current);
    localStorage.removeItem(SUPABASE_SESSION_STORAGE_KEY);
    supabaseReady.current = false;
    supabaseSessionRef.current = null;
    setSupabaseSession(null);
    setSupabaseState("idle");
  }, []);

  useEffect(() => {
    if (isShared || !supabaseConfig || !supabaseSession || supabaseReady.current) return;
    syncExistingSupabase(supabaseConfig).catch(() => {});
  }, [isShared, supabaseConfig, supabaseSession, syncExistingSupabase]);

  useEffect(() => {
    if (!supabaseConfig || !supabaseSession || !supabaseReady.current) return undefined;
    window.clearTimeout(supabaseTimer.current);
    supabaseTimer.current = window.setTimeout(() => {
      const snapshot = createWorkspaceSnapshot(
        localStorage,
        worksRef.current,
        activeWorkId.current,
      );
      setSupabaseState("syncing");
      supabaseQueue.current = supabaseQueue.current
        .catch(() => {})
        .then(async () => pushSupabaseWorkspace(
          supabaseConfig,
          await ensureSupabaseSession(supabaseConfig),
          snapshot,
        ));
      supabaseQueue.current.then(
        () => setSupabaseState("connected"),
        () => setSupabaseState("error"),
      );
    }, 1200);
    return () => window.clearTimeout(supabaseTimer.current);
  }, [ensureSupabaseSession, supabaseConfig, supabaseSession, works]);

  const createWork = useCallback(async () => {
    if (!supabaseSessionRef.current) {
      if (!window.confirm("尚未登录。新建会清空当前画布，且无法恢复。确定继续吗？")) return;
      const appState = {
        ...latestScene.current.appState,
        scrollX: 0,
        scrollY: 0,
        zoom: { value: 1 },
        selectedElementIds: {},
        selectedGroupIds: {},
      };
      const nextScene = { elements: [], appState, files: {}, storyPath: [] };
      latestScene.current = nextScene;
      setWorksOpen(false);
      setLinkEditorId(null);
      setPathEditorOpen(false);
      setAssistantOpen(false);
      setScene(nextScene);
      setEditorView({ elements: [], appState });
      setStoryPath([]);
      excalidrawAPI?.resetScene();
      excalidrawAPI?.updateScene({ elements: [], appState });
      persistScene(nextScene);
      return;
    }
    if (works.length >= SUPABASE_WORK_LIMIT) {
      window.alert(`云同步最多保存 ${SUPABASE_WORK_LIMIT} 个作品。请先删除一个作品再新建。`);
      return;
    }
    if (!await writeScene(localStorage, sceneKeyForWork(activeWorkId.current), latestScene.current)) {
      window.alert("当前作品保存失败，已停止新建。");
      return;
    }
    const suggestedName = `作品 ${works.length + 1}`;
    const name = window.prompt("作品名称", suggestedName)?.trim().slice(0, 80);
    if (!name) return;
    const id = crypto.randomUUID();
    const appState = {
      ...latestScene.current.appState,
      scrollX: 0,
      scrollY: 0,
      zoom: { value: 1 },
      selectedElementIds: {},
      selectedGroupIds: {},
    };
    const nextScene = {
      elements: [],
      appState,
      files: {},
      storyPath: [],
    };
    if (!await writeScene(localStorage, sceneKeyForWork(id), nextScene)) {
      window.alert("无法保存新作品，请检查浏览器存储空间。");
      return;
    }
    const nextWorks = [...works, { id, name, updatedAt: Date.now() }];
    if (!writeWorks(localStorage, nextWorks)) {
      await removeScene(localStorage, sceneKeyForWork(id));
      window.alert("无法保存新作品，请检查浏览器存储空间。");
      return;
    }
    setWorks(nextWorks);
    await openWork(id);
  }, [excalidrawAPI, openWork, persistScene, works]);

  const renameWork = useCallback((workId) => {
    const work = works.find(({ id }) => id === workId);
    if (!work) return;
    const name = window.prompt("作品名称", work.name)?.trim().slice(0, 80);
    if (!name || name === work.name) return;
    const nextWorks = works.map((item) => item.id === workId
      ? { ...item, name, updatedAt: Date.now() }
      : item);
    if (!writeWorks(localStorage, nextWorks)) {
      window.alert("重命名失败，请检查浏览器存储空间。");
      return;
    }
    setWorks(nextWorks);
  }, [works]);

  const deleteWork = useCallback(async (workId) => {
    if (works.length === 1) {
      window.alert("至少保留一个作品。");
      return;
    }
    const work = works.find(({ id }) => id === workId);
    const published = readPublication(localStorage, publicationKeyForWork(workId));
    if (!work || !window.confirm(
      `删除“${work.name}”？${published ? "Notion 中已嵌入的内容仍可查看，但无法再从这里更新。" : ""}`,
    )) return;
    const nextWorks = works.filter(({ id }) => id !== workId);
    if (!writeWorks(localStorage, nextWorks)) {
      window.alert("删除失败，请检查浏览器存储空间。");
      return;
    }
    if (workId === activeWorkId.current) {
      await openWork(nextWorks[0].id);
      setWorksOpen(true);
    }
    await removeScene(localStorage, sceneKeyForWork(workId));
    localStorage.removeItem(publicationKeyForWork(workId));
    setWorks(nextWorks);
  }, [openWork, works]);

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

  const activateHighlighter = useCallback(() => {
    setHighlighterActive(true);
    setLinkEditorId(null);
    setPathEditorOpen(false);
    setAssistantOpen(false);
    excalidrawAPI?.updateScene({
      appState: {
        currentItemStrokeColor: DEFAULT_STROKE_COLOR,
        currentItemStrokeWidth: 20,
        currentItemStrokeStyle: "solid",
        currentItemRoughness: 0,
        currentItemOpacity: 30,
      },
    });
    excalidrawAPI?.setActiveTool({ type: "freedraw", locked: true });
  }, [excalidrawAPI]);

  const toggleHighlighter = useCallback(() => {
    if (highlighterActive) {
      setHighlighterActive(false);
      excalidrawAPI?.setActiveTool({ type: "selection" });
    } else {
      activateHighlighter();
    }
  }, [activateHighlighter, excalidrawAPI, highlighterActive]);

  const captureHighlighterPointerUp = useCallback((activeTool) => {
    highlighterPointerUp.current = null;
    if (!highlighterActive || activeTool.type !== "freedraw") return;
    window.addEventListener("pointerup", (event) => {
      highlighterPointerUp.current = viewportCoordsToSceneCoords(event, excalidrawAPI.getAppState());
    }, { once: true });
  }, [excalidrawAPI, highlighterActive]);

  const snapHighlighterToText = useCallback((activeTool, pointerDownState) => {
    if (!highlighterActive || activeTool.type !== "freedraw") return;
    // Excalidraw finalizes immediately after onPointerUp, so keep the replacement in the same undo step.
    const elements = excalidrawAPI?.getSceneElements() ?? [];
    const strokes = elements.filter((element) =>
      element.type === "freedraw" &&
      !element.isDeleted &&
      !pointerDownState.originalElements.has(element.id),
    );
    if (!strokes.length) return;
    const texts = elements.filter((element) => element.type === "text" && !element.isDeleted);

    const context = document.createElement("canvas").getContext("2d");
    if (!context) return;
    const highlightsByText = new Map();
    const replacedStrokeIds = new Set(strokes.map((stroke) => stroke.id));

    for (const stroke of strokes) {
      const path = [
        ...stroke.points.map(([x, y]) => ({ x: stroke.x + x, y: stroke.y + y })),
        ...(highlighterPointerUp.current ? [highlighterPointerUp.current] : []),
      ];
      for (const text of texts) {
        const fontFamily = Object.entries(FONT_FAMILY).find(([, value]) => value === text.fontFamily)?.[0]
          ?? "Helvetica";
        context.font = `${text.fontSize ?? 20}px "${fontFamily}"`;
        const rects = textHighlightRects(
          text,
          path,
          stroke.strokeWidth,
          (value) => context.measureText(value).width,
        );
        if (!rects.length) continue;
        const existing = highlightsByText.get(text.id) ?? [];
        existing.push(...rects.map((rect) => ({
          ...rect,
          color: textHighlightColor(text.strokeColor),
        })));
        highlightsByText.set(text.id, existing);
      }
    }
    const updatedTexts = new Map();
    const highlights = new Map();
    for (const text of texts) {
      const rects = highlightsByText.get(text.id);
      if (!rects) continue;
      const groupId = text.customData?.textHighlightGroup ?? crypto.randomUUID();
      const groupIds = text.groupIds?.includes(groupId)
        ? text.groupIds
        : [groupId, ...(text.groupIds ?? [])];
      updatedTexts.set(text.id, newElementWith(text, {
        groupIds,
        customData: { ...text.customData, textHighlightGroup: groupId },
      }));
      highlights.set(text.id, convertToExcalidrawElements(
        rects.map((rect) => ({
          id: crypto.randomUUID(),
          type: "rectangle",
          ...rect,
          strokeColor: "transparent",
          backgroundColor: rect.color,
          fillStyle: "solid",
          strokeWidth: 1,
          roughness: 0,
          roundness: { type: 3 },
          opacity: 100,
          groupIds,
          customData: { textHighlightFor: text.id },
        })),
        { regenerateIds: false },
      ));
    }

    const nextElements = [];
    for (const element of elements) {
      if (highlights.has(element.id)) nextElements.push(...highlights.get(element.id));
      if (replacedStrokeIds.has(element.id)) {
        nextElements.push(newElementWith(element, { isDeleted: true }));
      } else {
        nextElements.push(updatedTexts.get(element.id) ?? element);
      }
    }
    excalidrawAPI.updateScene({ elements: nextElements });
  }, [excalidrawAPI, highlighterActive]);

  useEffect(
    () => () => {
      window.clearTimeout(saveTimer.current);
      window.clearTimeout(publishTimer.current);
      window.clearTimeout(notionNoticeTimer.current);
      window.clearTimeout(supabaseTimer.current);
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
    if (!isShared) return;
    let active = true;
    const applyScene = (decodedScene) => {
      if (!active) return;
      setShareError(false);
      const nextScene = withoutNativeLinks(decodedScene);
      latestScene.current = nextScene;
      setScene(nextScene);
    };
    if (sharedPayload) {
      decodeScene(sharedPayload).then(applyScene).catch(() => {
        if (!active) return;
        setShareError(true);
        setScene(starterScene());
      });
      return () => {
        active = false;
      };
    }
    pullPublicScene(supabaseConfig, sharedSceneId).then((sharedScene) => {
      if (!sharedScene) throw new Error("Shared scene not found");
      applyScene(sharedScene);
    }).catch(() => {
      if (!active) return;
      setShareError(true);
      setScene(starterScene());
    });
    return () => {
      active = false;
    };
  }, [isShared, sharedPayload, sharedSceneId, supabaseConfig]);

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

  useEffect(() => {
    if (!highlighterActive) {
      excalidrawAPI?.updateScene({
        appState: {
          currentItemStrokeColor: DEFAULT_STROKE_COLOR,
          currentItemOpacity: 100,
        },
      });
    }
  }, [excalidrawAPI, highlighterActive]);

  useEffect(() => {
    if (!excalidrawAPI) return undefined;
    const keepTextEditing = (event) => {
      if (event.target.closest?.('[data-testid="font-family-bold"]')) {
        event.preventDefault();
      }
    };
    const toggleBold = (event) => {
      const button = event.target.closest?.('[data-testid="font-family-bold"]');
      if (!button) return;
      event.preventDefault();
      event.stopImmediatePropagation();
      const elements = excalidrawAPI.getSceneElements();
      const appState = excalidrawAPI.getAppState();
      const selected = selectedTextElements(elements, appState);
      if (!selected.length) return;
      const selectedIds = new Set(selected.map((element) => element.id));
      const bold = !selected.every((element) => element.customData?.unfoldBold);
      excalidrawAPI.updateScene({
        elements: elements.map((element) => selectedIds.has(element.id)
          ? newElementWith(element, {
              customData: { ...element.customData, unfoldBold: bold || undefined },
            })
          : element),
      });
      button.classList.toggle("unfold-bold-active", bold);
      button.setAttribute("aria-pressed", String(bold));
    };
    document.addEventListener("pointerdown", keepTextEditing, true);
    document.addEventListener("click", toggleBold, true);
    return () => {
      document.removeEventListener("pointerdown", keepTextEditing, true);
      document.removeEventListener("click", toggleBold, true);
    };
  }, [excalidrawAPI]);

  const save = useCallback((elements, appState, files) => {
    if (
      appState.showHyperlinkPopup === "info" &&
      elements.some((element) =>
        appState.selectedElementIds[element.id] && ["embeddable", "iframe"].includes(element.type),
      )
    ) {
      requestAnimationFrame(() => excalidrawAPI?.updateScene({
        appState: { showHyperlinkPopup: false },
      }));
    }
    if (missingArrowhead(appState)) {
      excalidrawAPI?.updateScene({ appState: { currentItemEndArrowhead: "arrow" } });
    }
    if (highlighterActive && appState.activeTool?.type !== "freedraw") {
      setHighlighterActive(false);
    }
    const savedElements = stashStoryLinks(elements);
    syncBoldButton(savedElements, appState);
    const nextEditorViewSignature = editorLinkSignature(savedElements, appState);
    if (nextEditorViewSignature !== editorViewSignature.current) {
      editorViewSignature.current = nextEditorViewSignature;
      setEditorView({ elements: savedElements, appState });
    }
    const {
      collaborators: _collaborators,
      viewModeEnabled: _viewModeEnabled,
      zenModeEnabled: _zenModeEnabled,
      activeTool: _activeTool,
      ...savedAppState
    } = appState;
    latestScene.current = {
      ...latestScene.current,
      elements: savedElements,
      appState: {
        ...savedAppState,
        activeTool: {
          type: "selection",
          customType: null,
          locked: false,
          lastActiveTool: null,
        },
      },
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
      requestAnimationFrame(() => excalidrawAPI?.updateScene({
        elements: savedElements,
        appState: { showHyperlinkPopup: false },
      }));
    }
    persistScene(latestScene.current);
  }, [excalidrawAPI, highlighterActive, persistScene]);

  const clearCanvas = useCallback(() => {
    if (!excalidrawAPI) return;
    setClearOpen(false);
    setLinkEditorId(null);
    setPathEditorOpen(false);
    setAssistantOpen(false);
    setHighlighterActive(false);
    excalidrawAPI.setActiveTool({ type: "selection" });
    excalidrawAPI.updateScene({
      elements: excalidrawAPI
        .getSceneElementsIncludingDeleted()
        .map((element) => newElementWith(element, { isDeleted: true })),
      appState: { selectedElementIds: {}, selectedGroupIds: {} },
      captureUpdate: CaptureUpdateAction.IMMEDIATELY,
    });
  }, [excalidrawAPI]);

  const publish = useCallback(async (workId = activeWorkId.current, customSlug) => {
    if (publishState === "working") return null;
    const auth = supabaseSessionRef.current;
    if (!supabaseConfig || !auth) return null;
    setPublishState("working");
    try {
      const publishedScene = workId === activeWorkId.current && excalidrawAPI
        ? {
            ...latestScene.current,
            elements: stashStoryLinks(excalidrawAPI.getSceneElementsIncludingDeleted()),
            files: excalidrawAPI.getFiles(),
          }
        : readScene(localStorage, sceneKeyForWork(workId));
      if (!publishedScene) throw new Error("作品不存在");
      const publicationKey = publicationKeyForWork(workId);
      let current = readPublication(localStorage, publicationKey);
      const isNew = !current;
      if (!current) {
        const slug = customSlug ?? window.prompt("自定义分享链接（3–48 位小写字母、数字或连字符）", "")
          ?.trim().toLowerCase();
        if (slug == null) return null;
        if (!/^[a-z0-9](?:[a-z0-9-]{1,46}[a-z0-9])?$/.test(slug)) {
          window.alert("链接名称格式不正确，请输入 3–48 位小写字母、数字或连字符。");
          return null;
        }
        current = { id: slug };
      }
      await pushPublicScene(supabaseConfig, auth, current.id, publishedScene);
      if (isNew && !writePublication(localStorage, publicationKey, current)) {
        throw new Error("Publishing credentials could not be saved");
      }
      if (workId === activeWorkId.current) publication.current = current;
      const url = new URL(`/s/${current.id}`, location.origin);
      try {
        await navigator.clipboard.writeText(url.href);
        setPublishState("copied");
      } catch {
        window.prompt("复制这个只读链接", url.href);
        setPublishState("ready");
      }
      return url.href;
    } catch {
      setPublishState("error");
      return false;
    } finally {
      window.clearTimeout(publishTimer.current);
      publishTimer.current = window.setTimeout(() => setPublishState("idle"), 2400);
    }
  }, [excalidrawAPI, publishState, supabaseConfig]);

  const shareWork = useCallback(async (workId) => {
    if (!supabaseSessionRef.current) {
      setSupabaseOpen(true);
      window.alert("请先登录云同步，再分享作品。");
      return;
    }
    if (!readPublication(localStorage, publicationKeyForWork(workId))) {
      setShareWorkId(workId);
      return;
    }
    const url = await publish(workId);
    if (url) window.alert("分享链接已复制。");
    else if (url === false) window.alert("分享失败，链接名称可能已被使用，请更换后重试。");
  }, [publish]);

  const publishSharedWork = useCallback(async (slug) => {
    const workId = shareWorkId;
    setShareWorkId(null);
    const url = await publish(workId, slug);
    if (url) window.alert("分享链接已复制。");
    else if (url === false) window.alert("分享失败，链接名称可能已被使用，请更换后重试。");
  }, [publish, shareWorkId]);

  const addToNotion = useCallback(() => {
    if (!supabaseSessionRef.current) {
      setNotionNotice("请先登录云同步，再添加到 Notion。");
      setSupabaseOpen(true);
      return;
    }
    const notion = window.open("", "_blank");
    if (notion) {
      notion.document.title = "添加到 Notion";
      notion.document.body.textContent = "正在准备作品链接…";
      notion.document.body.style.cssText = "margin:0;display:grid;place-items:center;height:100vh;font:16px system-ui;color:#37352f";
      notion.opener = null;
    }
    window.clearTimeout(notionNoticeTimer.current);
    setNotionNotice("正在生成 Notion 链接…");
    publish().then((url) => {
      if (!url) {
        setNotionNotice("添加失败，请检查网络后重试。");
        if (notion) notion.document.body.textContent = "发布失败，请返回 Unfold 重试。";
        return;
      }
      setNotionNotice("链接已复制，请在 Notion 粘贴并选择“创建嵌入”。");
      notion?.location.replace("https://www.notion.so");
      notionNoticeTimer.current = window.setTimeout(() => setNotionNotice(""), 6000);
    });
  }, [publish]);

  const saveUnfoldFile = useCallback(() => {
    const url = URL.createObjectURL(new Blob(
      [serializeUnfoldScene(latestScene.current)],
      { type: "application/json" },
    ));
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = "UNFOLD.unfold";
    anchor.click();
    window.setTimeout(() => URL.revokeObjectURL(url));
  }, []);

  const exportScene = useCallback(async (format) => {
    setExportError("");
    try {
      if (format === "unfold") {
        saveUnfoldFile();
      } else {
        const current = latestScene.current;
        const options = {
          elements: current.elements.filter((element) => !element.isDeleted),
          appState: current.appState,
          files: current.files,
          exportPadding: 32,
        };
        const blob = format === "png"
          ? await exportToBlob({ ...options, mimeType: "image/png" })
          : new Blob(
              [new XMLSerializer().serializeToString(await exportToSvg(options))],
              { type: "image/svg+xml" },
            );
        const url = URL.createObjectURL(blob);
        const anchor = document.createElement("a");
        anchor.href = url;
        anchor.download = `UNFOLD.${format}`;
        anchor.click();
        window.setTimeout(() => URL.revokeObjectURL(url));
      }
      setExportOpen(false);
    } catch {
      setExportError("导出失败，请稍后重试。");
    }
  }, [saveUnfoldFile]);

  useEffect(() => installContextMenuOrganizer(document.querySelector(".canvas-app"), () => {
    const appState = excalidrawAPI?.getAppState();
    const selected = excalidrawAPI?.getSceneElements().filter((element) =>
      !element.isDeleted && appState?.selectedElementIds?.[element.id],
    );
    if (!appState || !selected?.length) return null;
    const [x1, y1, x2] = getCommonBounds(selected);
    const zoom = appState.zoom.value;
    return {
      left: (x2 + appState.scrollX) * zoom,
      fallbackLeft: (x1 + appState.scrollX) * zoom,
      top: (y1 + appState.scrollY) * zoom,
      viewport: { width: appState.width, height: appState.height },
    };
  }, [
    { label: "新建", shortcut: "Ctrl+N", onSelect: createWork },
    { label: "保存", shortcut: "Ctrl+S", onSelect: saveUnfoldFile },
    { label: "导出", shortcut: "Ctrl+Shift+E", onSelect: () => setExportOpen(true) },
    { label: "清空", shortcut: "Ctrl+Del", onSelect: () => setClearOpen(true) },
  ]), [createWork, excalidrawAPI, saveUnfoldFile]);

  const handleCanvasShortcut = useCallback((event) => {
    const target = event.target instanceof Element ? event.target : null;
    if (
      preview || exportOpen || clearOpen || event.altKey ||
      target?.closest("input, textarea, select, [contenteditable]") ||
      (!event.metaKey && !event.ctrlKey)
    ) return;
    const key = event.key.toLowerCase();
    let action;
    if (!event.shiftKey && key === "n") action = createWork;
    else if (!event.shiftKey && key === "s") action = saveUnfoldFile;
    else if (event.shiftKey && key === "e") action = () => setExportOpen(true);
    else if (!event.shiftKey && ["backspace", "delete"].includes(key)) action = () => setClearOpen(true);
    if (!action) return;
    event.preventDefault();
    event.stopPropagation();
    action();
  }, [clearOpen, createWork, exportOpen, preview, saveUnfoldFile]);

  const openUnfoldFile = useCallback(async (event) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    if (supabaseSessionRef.current && works.length >= SUPABASE_WORK_LIMIT) {
      window.alert(`云同步最多保存 ${SUPABASE_WORK_LIMIT} 个作品。请先删除一个作品再导入。`);
      return;
    }
    let imported;
    try {
      const contents = await file.text();
      imported = file.name.toLowerCase().endsWith(".unfold")
        ? parseUnfoldScene(contents)
        : await loadFromBlob(
            file,
            latestScene.current.appState,
            latestScene.current.elements,
          ).catch(() => parseUnfoldScene(contents));
    } catch {
      window.alert("这个文件格式无效或已经损坏。");
      return;
    }
    const nextScene = withoutNativeLinks({
        elements: imported.elements ?? [],
        appState: imported.appState ?? {},
        files: imported.files ?? {},
        storyPath: Array.isArray(imported.storyPath) ? imported.storyPath : [],
    });
    const id = crypto.randomUUID();
    const name = file.name.replace(/\.(?:unfold|excalidraw)$/i, "").trim() || `作品 ${works.length + 1}`;
    const nextWorks = [...works, { id, name: name.slice(0, 80), updatedAt: Date.now() }];
    await pruneStaleWorkStorage(localStorage, new Set(works.map((work) => work.id)));
    if (!await writeScene(localStorage, sceneKeyForWork(id), nextScene) ||
      !writeWorks(localStorage, nextWorks)) {
      await removeScene(localStorage, sceneKeyForWork(id));
      window.alert("文件已读取，但浏览器存储空间不足。请先删除不需要的作品后重试。");
      return;
    }
    setWorks(nextWorks);
    await openWork(id);
  }, [openWork, works]);

  const previewLinkAppearance = useCallback(({ icon, side, customIcon }) => {
    if (!linkEditorId) return;
    const nextElements = latestScene.current.elements.map((element) => {
      if (element.id !== linkEditorId) return element;
      const customData = {
        ...element.customData,
        storyIcon: icon === "custom" ? "link" : icon,
        storyIconSide: side,
      };
      if (customIcon) customData.storyIconImage = customIcon;
      else delete customData.storyIconImage;
      return newElementWith(element, { customData });
    });
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
        customData.storyIcon = settings.icon === "custom" ? "link" : settings.icon;
        customData.storyIconSide = settings.side;
        if (settings.customIcon) customData.storyIconImage = settings.customIcon;
        else delete customData.storyIconImage;
      } else {
        delete customData.storyLink;
        delete customData.storyIcon;
        delete customData.storyIconSide;
        delete customData.storyIconImage;
      }
      return newElementWith(element, { link: null, customData });
    });
    const appState = excalidrawAPI?.getAppState() ?? editorView.appState;
    const nextScene = { ...latestScene.current, elements: nextElements };
    latestScene.current = nextScene;
    editorViewSignature.current = editorLinkSignature(nextElements, appState);
    setEditorView({ elements: nextElements, appState });
    excalidrawAPI?.updateScene({ elements: nextElements });
    persistScene(nextScene);
    closeLinkEditor();
  }, [closeLinkEditor, editorView.appState, excalidrawAPI, linkEditorId, persistScene]);

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
    persistScene(nextScene);
  }, [persistScene]);

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

  const setStoryCameraPreset = useCallback((stepId, preset) => {
    const elements = latestScene.current.elements;
    const frame = storyFrameForElements(elements);
    const step = getStorySteps(elements, latestScene.current.storyPath)
      .find((entry) => entry.id === stepId);
    if (!step) return;
    const camera = getStoryViewBox(
      frame,
      { x: step.x, y: step.y, width: step.width, height: step.height },
      3.2,
      64,
    );
    const shot = createStoryCameraShot(camera, preset);
    updateStoryStep(stepId, {
      camera: shot.end,
      cameraStart: shot.start,
      cameraDuration: shot.duration,
      cameraPreset: preset,
    });
  }, [updateStoryStep]);

  const runAgent = useCallback((prompt, files, sessionId, signal) =>
    requestHermesAgent(prompt, files, { sessionId, signal }), []);

  const insertAgentImage = useCallback(async (image) => {
    try {
      const dataURL = await imageSourceDataUrl(image.src);
      const size = await loadImageSize(dataURL);
      const scale = Math.min(1, 640 / size.width, 480 / size.height);
      const width = Math.max(40, Math.round(size.width * scale));
      const height = Math.max(40, Math.round(size.height * scale));
      const appState = excalidrawAPI?.getAppState() ?? latestScene.current.appState;
      const center = viewportCoordsToSceneCoords({
        clientX: (appState.offsetLeft ?? 0) + (appState.width ?? window.innerWidth) / 2,
        clientY: (appState.offsetTop ?? 0) + (appState.height ?? window.innerHeight) / 2,
      }, appState);
      const fileId = crypto.randomUUID().replaceAll("-", "");
      const file = {
        id: fileId,
        dataURL,
        mimeType: String(dataURL.match(/^data:([^;,]+)/)?.[1] || image.mimeType || "image/png"),
        created: Date.now(),
      };
      const [element] = convertToExcalidrawElements([{
        type: "image",
        x: center.x - width / 2,
        y: center.y - height / 2,
        width,
        height,
        fileId,
        status: "saved",
        scale: [1, 1],
      }]);
      const elements = [...latestScene.current.elements, element];
      const files = { ...(latestScene.current.files || {}), [fileId]: file };
      const nextScene = { ...latestScene.current, elements, files };
      latestScene.current = nextScene;
      setScene(nextScene);
      excalidrawAPI?.addFiles([file]);
      excalidrawAPI?.updateScene({
        elements,
        appState: { selectedElementIds: { [element.id]: true } },
      });
      persistScene(nextScene);
      excalidrawAPI?.setToast({ message: "图片已放到画布。", duration: 1800 });
    } catch (error) {
      excalidrawAPI?.setToast({ message: error?.message || "无法把图片放到画布。", duration: 3000 });
    }
  }, [excalidrawAPI, persistScene]);

  const generateAgentPlan = useCallback(async (goal, draftPlan, conversation, signal) => {
    const sourceRevision = hermesSceneRevision(latestScene.current);
    const scopeElementIds = /^请(?:从零生成一张新画布|保留当前画布)/.test(goal)
      ? []
      : selectedStoryElementIds;
    const plan = await requestHermesLecturePlan(
      latestScene.current.elements,
      latestScene.current.storyPath,
      goal,
      { selectedElementIds: scopeElementIds, draftPlan, conversation, signal },
    );
    if (plan.mode === "chat") return plan;
    if (plan.mode !== "create") return { ...plan, sourceRevision, scopeElementIds };
    const generated = plan.visual
      ? (() => {
          const ids = new Map(plan.visual.elements.map(({ key }) => [key, crypto.randomUUID()]));
          return {
            elements: plan.visual.elements.map(({ key, startKey, endKey, ...element }) => ({
              id: ids.get(key),
              ...element,
              ...(element.type === "text" ? { fontFamily: FONT_FAMILY.Helvetica } : {}),
              ...(element.label ? { label: { ...element.label, fontFamily: FONT_FAMILY.Helvetica } } : {}),
              ...(startKey && ids.has(startKey) ? { start: { id: ids.get(startKey) } } : {}),
              ...(endKey && ids.has(endKey) ? { end: { id: ids.get(endKey) } } : {}),
            })),
            steps: plan.visual.steps.map(({ elementKeys, ...step }) => ({
              ...step,
              elementIds: elementKeys.map((key) => ids.get(key)),
            })),
          };
        })()
      : createGeneratedLecture(
          plan.document,
          () => crypto.randomUUID(),
          FONT_FAMILY.Helvetica,
        );
    const convertedElements = convertToExcalidrawElements(generated.elements, { regenerateIds: false });
    const convertedById = new Map(convertedElements.map((element) => [element.id, element]));
    const generatedSteps = generated.steps.map((step) => ({
      ...step,
      elementIds: [...new Set(step.elementIds.flatMap((id) => [
        id,
        ...(convertedById.get(id)?.boundElements ?? [])
          .filter((bound) => bound.type === "text")
          .map((bound) => bound.id),
      ]))],
    }));
    return {
      ...plan,
      ...generated,
      steps: generatedSteps,
      sourceRevision,
      scopeElementIds,
      elements: convertedElements,
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
    persistScene(nextScene);
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
  }, [commitStoryPath, excalidrawAPI, persistScene]);

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
    persistScene(previous);
    return "";
  }, [excalidrawAPI, persistScene]);

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
      {!preview && (saveError || supabaseSession) && (
        <span
          className={`save-state${saveError || supabaseState === "error" ? " save-state--error" : ""}`}
          role={saveError || supabaseState === "error" ? "alert" : "status"}
        >
          <span className="save-state__dot" aria-hidden="true" />
          <span className="save-state__label">
            {saveError
              ? "本地保存失败"
              : supabaseState === "syncing"
                ? "正在保存到云端…"
                : supabaseState === "error" ? "云端保存失败" : "已保存到云端"}
          </span>
        </span>
      )}
      {!preview && (
        <button
          className="control-button"
          type="button"
          title="新建作品"
          aria-label="新建作品"
          onClick={createWork}
        >
          <span aria-hidden="true">＋</span>
          <span className="control-button__label">新建</span>
        </button>
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
        className="control-button control-button--preview"
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
        <span className="control-button__label">{preview ? "返回编辑" : "讲解模式"}</span>
      </button>
    </div>
  );

  return (
    <main
      className={`canvas-app${isShared ? " canvas-app--shared" : ""}${highlighterActive ? " canvas-app--highlighting" : ""}`}
      onKeyDownCapture={handleCanvasShortcut}
    >
      <input
        ref={fileInputRef}
        type="file"
        hidden
        accept=".unfold,.excalidraw,application/vnd.excalidraw+json"
        onChange={openUnfoldFile}
      />
      {!isShared && !preview && excalidrawAPI && (
        <HighlighterTool
          active={highlighterActive}
          onToggle={toggleHighlighter}
          target={toolbarTarget}
        />
      )}
      {!isShared && preview && renderCanvasControls()}

      {!preview && pathEditorOpen && !cameraPreviewStep && (
        <StoryPathPanel
          frame={editorStoryFrame}
          getElementLabel={storyElementLabel}
          getStepLabel={storyStepLabel}
          steps={editorStorySteps}
          scene={latestScene.current}
          selectedCount={selectedStoryElementIds.length}
          onAdd={addStoryStep}
          onClose={closePathEditor}
          onMove={moveStoryStep}
          onPreviewCamera={setCameraPreviewStepId}
          onRemove={removeStoryStep}
          onSetCameraPreset={setStoryCameraPreset}
          onUpdate={updateStoryStep}
        />
      )}

      {!preview && cameraPreviewStep && (
        <CameraPreviewOverlay
          frame={editorStoryFrame}
          onClose={() => setCameraPreviewStepId(null)}
          scene={latestScene.current}
          step={cameraPreviewStep}
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
          onInsertImage={insertAgentImage}
          onRunAgent={runAgent}
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

      {notionNotice && (
        <p className="notion-notice" role="status">
          {notionNotice}
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
          onPointerDown={captureHighlighterPointerUp}
          onPointerUp={snapHighlighterToText}
          validateEmbeddable={validateEmbeddedWebsite}
          renderTopRightUI={() => renderCanvasControls(true)}
          UIOptions={{
            canvasActions: {
              clearCanvas: false,
              loadScene: false,
              export: { saveFileToDisk: false },
              searchMenu: false,
              addToLibrary: false,
            },
          }}
        >
        <MainMenu>
          <MainMenu.Group>
            <MainMenu.Item
              icon={(
                <svg
                  aria-hidden="true"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.5"
                  viewBox="0 0 24 24"
                >
                  <rect x="4" y="4" width="6" height="6" rx="1" />
                  <rect x="14" y="4" width="6" height="6" rx="1" />
                  <rect x="4" y="14" width="6" height="6" rx="1" />
                  <rect x="14" y="14" width="6" height="6" rx="1" />
                </svg>
              )}
              onSelect={() => {
                setLinkEditorId(null);
                setPathEditorOpen(false);
                setAssistantOpen(false);
                setWorksOpen(true);
              }}
            >
              我的作品
            </MainMenu.Item>
            <MainMenu.Item
              icon={(
                <svg
                  aria-hidden="true"
                  fill="none"
                  stroke="currentColor"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth="1.5"
                  viewBox="0 0 24 24"
                >
                  <path d="M7.5 18.5h9a4 4 0 0 0 .6-7.95A5.5 5.5 0 0 0 6.5 9a4.75 4.75 0 0 0 1 9.5Z" />
                  <path d="m9.5 14 2.5 2.5 3.5-4" />
                </svg>
              )}
              onSelect={() => setSupabaseOpen(true)}
            >
              {supabaseConfig && supabaseSession
                ? `云同步 · ${supabaseState === "syncing" ? "保存中" : supabaseState === "error" ? "失败" : "已保存"}`
                : "云同步"}
            </MainMenu.Item>
            <MainMenu.Item
              icon={(
                <svg
                  aria-hidden="true"
                  fill="none"
                  stroke="currentColor"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth="1.5"
                  viewBox="0 0 24 24"
                >
                  <path d="M3.5 6.5h6l2 2h9v9a2 2 0 0 1-2 2h-13a2 2 0 0 1-2-2Z" />
                </svg>
              )}
              onSelect={() => fileInputRef.current?.click()}
            >
              导入
            </MainMenu.Item>
            <MainMenu.Item
              icon={(
                <svg
                  aria-hidden="true"
                  fill="none"
                  stroke="currentColor"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth="1.5"
                  viewBox="0 0 24 24"
                >
                  <path d="M12 3.5v11m-4-4 4 4 4-4M5 18.5h14" />
                </svg>
              )}
              onSelect={() => setExportOpen(true)}
            >
              导出
            </MainMenu.Item>
            <MainMenu.Item
              icon={(
                <svg
                  aria-hidden="true"
                  fill="none"
                  stroke="currentColor"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth="1.5"
                  viewBox="0 0 24 24"
                >
                  <path d="M5 4.5h11l3 3v12H5Zm4 11v-7l6 7v-7" />
                </svg>
              )}
              onSelect={addToNotion}
            >
              添加到 Notion
            </MainMenu.Item>
          </MainMenu.Group>
          <MainMenu.Separator />
          <MainMenu.Group>
            <MainMenu.DefaultItems.Help />
            <MainMenu.Item
              data-testid="clear-canvas-button"
              icon={(
                <svg
                  aria-hidden="true"
                  fill="none"
                  stroke="currentColor"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth="1.5"
                  viewBox="0 0 24 24"
                >
                  <path d="M4 7h16M9 7V4h6v3m3 0-1 13H7L6 7m4 4v5m4-5v5" />
                </svg>
              )}
              onSelect={() => setClearOpen(true)}
              shortcut={CLEAR_CANVAS_SHORTCUT}
            >
              清空画布
            </MainMenu.Item>
          </MainMenu.Group>
          <MainMenu.Separator />
          <MainMenu.Group>
            <MainMenu.DefaultItems.ChangeCanvasBackground />
          </MainMenu.Group>
        </MainMenu>
        <WelcomeScreen>
          <WelcomeScreen.Center>
            <WelcomeScreen.Center.Heading>
              把经历、想法和故事画出来。
            </WelcomeScreen.Center.Heading>
            <WelcomeScreen.Center.Menu>
              <WelcomeScreen.Center.MenuItem onSelect={() => fileInputRef.current?.click()}>
                打开一张画板
              </WelcomeScreen.Center.MenuItem>
              <WelcomeScreen.Center.MenuItemHelp />
            </WelcomeScreen.Center.Menu>
          </WelcomeScreen.Center>
          <WelcomeScreen.Hints.ToolbarHint>
            文字、箭头和图片都在这里
          </WelcomeScreen.Hints.ToolbarHint>
          <WelcomeScreen.Hints.MenuHint>
            打开与导出
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
      {!preview && exportOpen && (
        <ExportDialog
          error={exportError}
          onClose={() => setExportOpen(false)}
          onExport={exportScene}
        />
      )}
      {!preview && supabaseOpen && (
        <SupabaseSyncDialog
          available={Boolean(supabaseConfig)}
          session={supabaseSession}
          onClose={() => setSupabaseOpen(false)}
          onConnect={connectSupabase}
          onDisconnect={disconnectSupabase}
          status={supabaseState}
        />
      )}
      {!isShared && worksOpen && (
        <WorksLibrary
          activeWorkId={activeWorkId.current}
          onBack={() => setWorksOpen(false)}
          onDelete={deleteWork}
          onOpen={openWork}
          onRename={renameWork}
          onShare={shareWork}
          cloudSync={Boolean(supabaseSession)}
          works={works.map((work) => ({
            ...work,
            scene: readScene(localStorage, sceneKeyForWork(work.id)),
          }))}
        />
      )}
      {!preview && shareWorkId && (
        <ShareWorkDialog
          onClose={() => setShareWorkId(null)}
          onShare={publishSharedWork}
          work={works.find(({ id }) => id === shareWorkId)}
        />
      )}
      {!preview && clearOpen && (
        <ClearCanvasDialog
          onCancel={() => setClearOpen(false)}
          onConfirm={clearCanvas}
        />
      )}
    </main>
  );
}

initializeSceneStorage(localStorage).finally(() => {
  createRoot(document.getElementById("root")).render(<App />);
});
