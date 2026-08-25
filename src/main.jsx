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
import { decodeScene, encodeScene, readScene, writeScene } from "./storage.js";
import {
  STORY_ICON_KINDS,
  editorLinkSignature,
  getStoryHighlight,
  getStoryIconKind,
  getStoryHref,
  safeStoryHref,
  stashStoryLinks,
  storyIconKind,
  storyLinkGeometry,
} from "./story.js";

const STORAGE_KEY = "story-canvas.scene.v1";
const PAPER = "#ffffff";
const STORY_PADDING = 32;
const HIGHLIGHTS = ["#3b72c4", "#2f8f5b", "#b8751a"];
const STORY_ICON_LABELS = {
  camera: "照片",
  page: "页面",
  spark: "灵感",
  globe: "网站",
  mail: "邮件",
  code: "代码",
};
const LEGACY_COLORS = {
  "#4f7fd8": "#3b72c4",
  "#4f9a73": "#2f8f5b",
  "#c47a2c": "#b8751a",
};

function starterScene() {
  return withoutNativeLinks({
    elements: convertToExcalidrawElements([
      {
        type: "text",
        x: 410,
        y: 300,
        text: "你好，我是你的名字。",
        fontFamily: FONT_FAMILY.Helvetica,
        fontSize: 24,
        strokeColor: "#25231f",
      },
      {
        type: "text",
        x: 360,
        y: 344,
        text: "我做产品，也把故事画出来。",
        fontFamily: FONT_FAMILY.Helvetica,
        fontSize: 20,
        strokeColor: "#25231f",
      },
      {
        type: "text",
        x: 420,
        y: 160,
        text: "作品与想法",
        fontFamily: FONT_FAMILY.Excalifont,
        fontSize: 22,
        strokeColor: "#3b72c4",
        link: "https://example.com/work",
      },
      {
        type: "arrow",
        x: 485,
        y: 215,
        points: [[0, 0], [0, 54]],
        strokeColor: "#3b72c4",
        endArrowhead: "arrow",
        roughness: 1,
      },
      {
        type: "text",
        x: 700,
        y: 330,
        text: "照片与生活",
        fontFamily: FONT_FAMILY.Excalifont,
        fontSize: 22,
        strokeColor: "#2f8f5b",
        link: "https://example.com/photos",
      },
      {
        type: "arrow",
        x: 680,
        y: 344,
        points: [[0, 0], [-72, 0]],
        strokeColor: "#2f8f5b",
        endArrowhead: "arrow",
        roughness: 1,
      },
      {
        type: "text",
        x: 260,
        y: 450,
        text: "经历与简历",
        fontFamily: FONT_FAMILY.Excalifont,
        fontSize: 22,
        strokeColor: "#b8751a",
        link: "https://example.com/resume",
      },
      {
        type: "arrow",
        x: 365,
        y: 438,
        points: [[0, 0], [38, -52]],
        strokeColor: "#b8751a",
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
      LEGACY_COLORS[element.strokeColor]
        ? { ...element, strokeColor: LEGACY_COLORS[element.strokeColor] }
        : element,
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

function HighlighterTool({ active, color, onToggle, onColor, target }) {
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
        aria-controls="highlighter-colors"
        onClick={onToggle}
      >
        <svg aria-hidden="true" viewBox="0 0 24 24">
          <path d="m14.8 3.8 5.4 5.4-8.7 8.7H6.1v-5.4Z" />
          <path d="m7.4 11.2 5.4 5.4M4 21h16" />
        </svg>
        <span className="highlighter-tool__ink" aria-hidden="true" />
      </button>
      {active && (
        <div id="highlighter-colors" className="highlighter-colors" role="radiogroup" aria-label="高亮颜色">
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
      )}
    </div>,
    target,
  );
}

function LinkDoodle({ kind, x, y, size }) {
  const common = {
    className: "story-link-icon",
    fill: "none",
    stroke: "currentColor",
    strokeLinecap: "round",
    strokeLinejoin: "round",
    strokeWidth: Math.max(1.4, size * 0.075),
  };

  if (kind === "camera") {
    return (
      <g transform={`translate(${x} ${y})`}>
        <g {...common}>
          <path d={`M ${size * 0.14} ${size * 0.32} h ${size * 0.2} l ${size * 0.1} -${size * 0.13} h ${size * 0.28} l ${size * 0.1} ${size * 0.13} h ${size * 0.12} v ${size * 0.5} h -${size * 0.8} z`} />
          <circle cx={size * 0.54} cy={size * 0.57} r={size * 0.16} />
          <g className="story-camera-flash">
            <path d={`M ${size * 0.84} ${size * 0.06} v ${size * 0.13}`} />
            <path d={`M ${size * 0.94} ${size * 0.15} l ${size * 0.08} -${size * 0.08}`} />
          </g>
        </g>
      </g>
    );
  }

  if (kind === "page") {
    return (
      <g transform={`translate(${x} ${y})`}>
        <g {...common}>
          <path d={`M ${size * 0.25} ${size * 0.1} h ${size * 0.42} l ${size * 0.18} ${size * 0.18} v ${size * 0.62} h -${size * 0.6} z`} />
          <path d={`M ${size * 0.67} ${size * 0.1} v ${size * 0.2} h ${size * 0.18}`} />
          <path d={`M ${size * 0.38} ${size * 0.48} h ${size * 0.32} M ${size * 0.38} ${size * 0.65} h ${size * 0.24}`} />
        </g>
      </g>
    );
  }

  if (kind === "globe") {
    return (
      <g transform={`translate(${x} ${y})`}>
        <g {...common}>
          <circle cx={size * 0.5} cy={size * 0.5} r={size * 0.36} />
          <path d={`M ${size * 0.14} ${size * 0.5} h ${size * 0.72}`} />
          <path d={`M ${size * 0.5} ${size * 0.14} C ${size * 0.7} ${size * 0.3}, ${size * 0.7} ${size * 0.7}, ${size * 0.5} ${size * 0.86} C ${size * 0.3} ${size * 0.7}, ${size * 0.3} ${size * 0.3}, ${size * 0.5} ${size * 0.14}`} />
        </g>
      </g>
    );
  }

  if (kind === "mail") {
    return (
      <g transform={`translate(${x} ${y})`}>
        <g {...common}>
          <path d={`M ${size * 0.14} ${size * 0.26} h ${size * 0.72} v ${size * 0.5} h -${size * 0.72} z`} />
          <path d={`M ${size * 0.16} ${size * 0.3} l ${size * 0.34} ${size * 0.28} l ${size * 0.34} -${size * 0.28}`} />
        </g>
      </g>
    );
  }

  if (kind === "code") {
    return (
      <g transform={`translate(${x} ${y})`}>
        <g {...common}>
          <path d={`M ${size * 0.38} ${size * 0.25} l -${size * 0.22} ${size * 0.25} l ${size * 0.22} ${size * 0.25}`} />
          <path d={`M ${size * 0.62} ${size * 0.25} l ${size * 0.22} ${size * 0.25} l -${size * 0.22} ${size * 0.25}`} />
          <path d={`M ${size * 0.57} ${size * 0.18} l -${size * 0.14} ${size * 0.64}`} />
        </g>
      </g>
    );
  }

  return (
    <g transform={`translate(${x} ${y})`}>
      <g {...common}>
        <path d={`M ${size * 0.16} ${size * 0.7} C ${size * 0.28} ${size * 0.15}, ${size * 0.72} ${size * 0.12}, ${size * 0.84} ${size * 0.48} C ${size * 0.92} ${size * 0.75}, ${size * 0.48} ${size * 0.92}, ${size * 0.16} ${size * 0.7} Z`} />
        <path d={`M ${size * 0.5} ${size * 0.08} v ${size * 0.18} M ${size * 0.84} ${size * 0.18} l -${size * 0.12} ${size * 0.13}`} />
      </g>
    </g>
  );
}

function TextHighlight({ element }) {
  const color = getStoryHighlight(element);
  if (!color) return null;
  const y = element.y + element.height * 0.74;
  return (
    <path
      className="story-text-highlight"
      d={`M ${element.x} ${y} C ${element.x + element.width * 0.28} ${y + 1}, ${element.x + element.width * 0.72} ${y - 1}, ${element.x + element.width} ${y}`}
      stroke={color}
      strokeWidth={Math.max(7, element.height * 0.42)}
    />
  );
}

function EditorLinkIcons({ elements, appState, activeLinkId, onEditLink }) {
  const zoom = appState?.zoom?.value ?? 1;
  const transform = `translate(${appState?.offsetLeft ?? 0} ${appState?.offsetTop ?? 0}) scale(${zoom}) translate(${appState?.scrollX ?? 0} ${appState?.scrollY ?? 0})`;
  const textElements = elements.filter(
    (element) => !element.isDeleted && element.type === "text",
  );
  const linkedElements = textElements.filter(getStoryHref);

  return (
    <>
      <svg className="editor-story-icons" aria-hidden="true">
        <g transform={transform}>
          {textElements.map((element) => {
            const centerX = element.x + element.width / 2;
            const centerY = element.y + element.height / 2;
            return (
              <g
                key={`${element.id}-highlight`}
                transform={`rotate(${(element.angle * 180) / Math.PI} ${centerX} ${centerY})`}
              >
                <TextHighlight element={element} />
              </g>
            );
          })}
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
              aria-label={`设置链接：${element.text}`}
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

function StoryLink({ element }) {
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
      className="story-link"
      href={href}
      target="_blank"
      rel="noreferrer"
      aria-label={`打开链接：${element.text}`}
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

function StoryView({ scene }) {
  const [svgUrl, setSvgUrl] = useState("");
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

  const linkedText = visibleElements.filter(
    (element) => element.type === "text" && getStoryHref(element),
  );
  const highlightedText = visibleElements.filter(
    (element) => element.type === "text" && getStoryHighlight(element),
  );

  return (
    <section className="story-view" aria-label="故事预览">
      <div
        className="story-scene"
        style={{ "--story-ratio": frame.width / frame.height }}
      >
        <img src={svgUrl} alt="" />
        <svg
          className="story-links"
          viewBox={`${frame.x} ${frame.y} ${frame.width} ${frame.height}`}
          aria-label="画面中的链接"
        >
          {highlightedText.map((element) => {
            const centerX = element.x + element.width / 2;
            const centerY = element.y + element.height / 2;
            return (
              <g
                key={`${element.id}-highlight`}
                transform={`rotate(${(element.angle * 180) / Math.PI} ${centerX} ${centerY})`}
              >
                <TextHighlight element={element} />
              </g>
            );
          })}
          {linkedText.map((element) => (
            <StoryLink key={element.id} element={element} />
          ))}
        </svg>
      </div>
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
  const [highlighterColor, setHighlighterColor] = useState("#b8751a");
  const linkEditorTrigger = useRef(null);
  const saveTimer = useRef();
  const publishTimer = useRef();
  const latestScene = useRef(localScene);
  const linkEditorElement = editorView.elements.find(
    (element) => element.id === linkEditorId && !element.isDeleted,
  );

  const closeLinkEditor = useCallback((restoreFocus = true) => {
    setLinkEditorId(null);
    if (restoreFocus) {
      requestAnimationFrame(() => linkEditorTrigger.current?.focus?.());
    }
  }, []);

  const openLinkEditor = useCallback((elementId, trigger) => {
    linkEditorTrigger.current = trigger ?? document.activeElement;
    excalidrawAPI?.updateScene({ appState: { showHyperlinkPopup: false } });
    setLinkEditorId(elementId);
  }, [excalidrawAPI]);

  const activateHighlighter = useCallback((color) => {
    setHighlighterColor(color);
    setHighlighterActive(true);
    setLinkEditorId(null);
    excalidrawAPI?.updateScene({
      appState: {
        currentItemStrokeColor: color,
        currentItemStrokeWidth: 8,
        currentItemStrokeStyle: "solid",
        currentItemRoughness: 0,
        currentItemOpacity: 22,
        currentItemStartArrowhead: null,
        currentItemEndArrowhead: null,
      },
    });
    excalidrawAPI?.setActiveTool({ type: "line", locked: true });
  }, [excalidrawAPI]);

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
    if (highlighterActive && appState.activeTool?.type !== "line") {
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
    latestScene.current = { elements: savedElements, appState: savedAppState, files };
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

  return (
    <main className={`canvas-app${isShared ? " canvas-app--shared" : ""}${highlighterActive ? " canvas-app--highlighting" : ""}`}>
      {!isShared && !preview && excalidrawAPI && (
        <HighlighterTool
          active={highlighterActive}
          color={highlighterColor}
          onToggle={toggleHighlighter}
          onColor={activateHighlighter}
          target={toolbarTarget}
        />
      )}
      {!isShared && (
        <div className="canvas-controls" role="group" aria-label="画板操作">
          {!preview && (
            <span className={`save-state save-state--${saveState}`} role="status">
              <span className="save-state__dot" aria-hidden="true" />
              {saveState === "saving"
                ? "保存中"
                : saveState === "error"
                  ? "保存失败"
                  : "已保存"}
            </span>
          )}
          <button
            className="control-button"
            type="button"
            aria-pressed={preview}
            onClick={() => {
              setLinkEditorId(null);
              setHighlighterActive(false);
              excalidrawAPI?.setActiveTool({ type: "selection" });
              if (!preview) setScene(latestScene.current);
              setPreview((value) => !value);
            }}
          >
            <EyeIcon crossed={preview} />
            {preview ? "编辑" : "预览"}
          </button>
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
        </div>
      )}

      {shareError && (
        <p className="share-error" role="alert">
          这个分享链接无效或内容过大。
        </p>
      )}

      {preview ? (
        <StoryView scene={scene} />
      ) : (
        <Excalidraw
          initialData={scene}
          excalidrawAPI={setExcalidrawAPI}
          langCode="zh-CN"
          name="InkPath"
          theme="light"
          onChange={save}
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
          <MainMenu.ItemCustom className="inkpath-menu-brand">
            <strong>InkPath</strong>
            <span>Draw your story.</span>
          </MainMenu.ItemCustom>
        </MainMenu>
        <WelcomeScreen>
          <WelcomeScreen.Center>
            <WelcomeScreen.Center.Logo>
              <span className="welcome-mark">InkPath</span>
            </WelcomeScreen.Center.Logo>
            <WelcomeScreen.Center.Heading>
              把经历、想法和故事画成一条路。
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
