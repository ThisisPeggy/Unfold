import React, { useEffect, useRef, useState } from "react";
import { exportToSvg } from "@excalidraw/excalidraw";
import { interpolateStoryCameraShot, transformStoryCamera } from "./story.js";

function formatViewBox({ x, y, width, height }) {
  return `${x} ${y} ${width} ${height}`;
}

function sameViewBox(left, right) {
  return ["x", "y", "width", "height"].every((key) => left?.[key] === right?.[key]);
}

function liveViewBox(svg, fallback) {
  const viewBox = svg?.viewBox?.baseVal;
  return viewBox?.width > 0
    ? { x: viewBox.x, y: viewBox.y, width: viewBox.width, height: viewBox.height }
    : fallback;
}

export default function StoryCameraPreview({
  className = "",
  duration = 3000,
  end,
  frame,
  interactive = false,
  interactiveView,
  onAnimationEnd,
  onInteractionStart,
  onViewChange,
  replayKey = 0,
  scene,
  start,
}) {
  const [artwork, setArtwork] = useState(null);
  const [dragging, setDragging] = useState(false);
  const svgRef = useRef(null);
  const animationFrameRef = useRef(null);
  const currentViewRef = useRef(interactiveView ?? start);
  const gestureRef = useRef({ pointers: new Map(), base: null });
  const wheelCommitRef = useRef(null);
  const animationEndRef = useRef(onAnimationEnd);
  const wheelHandlerRef = useRef(null);
  animationEndRef.current = onAnimationEnd;

  useEffect(() => {
    let disposed = false;
    const elements = scene?.elements?.filter((element) => !element.isDeleted) ?? [];
    if (!elements.length) return undefined;
    exportToSvg({
      elements,
      appState: { ...scene.appState, exportBackground: false },
      files: scene.files,
      exportPadding: 32,
    }).then((svg) => {
      if (disposed) return;
      const { x, y, width, height } = svg.viewBox.baseVal;
      setArtwork({
        markup: svg.innerHTML,
        viewBox: `${x} ${y} ${width} ${height}`,
      });
    }).catch(() => {
      if (!disposed) setArtwork(null);
    });
    return () => {
      disposed = true;
    };
  }, [scene?.appState, scene?.elements, scene?.files]);

  useEffect(() => {
    const svg = svgRef.current;
    if (!svg || !start || !end) return undefined;
    cancelAnimationFrame(animationFrameRef.current);
    const setViewBox = (value) => {
      svg.setAttribute("viewBox", formatViewBox(value));
      currentViewRef.current = value;
    };
    if (interactive && interactiveView) {
      setViewBox(interactiveView);
      return undefined;
    }
    setViewBox(start);
    if (
      sameViewBox(start, end) ||
      window.matchMedia("(prefers-reduced-motion: reduce)").matches
    ) {
      setViewBox(end);
      animationEndRef.current?.();
      return undefined;
    }
    let startedAt;
    const animate = (time) => {
      startedAt ??= time;
      const progress = Math.min(1, (time - startedAt) / duration);
      setViewBox(interpolateStoryCameraShot(start, end, progress));
      if (progress < 1) animationFrameRef.current = requestAnimationFrame(animate);
      else animationEndRef.current?.();
    };
    animationFrameRef.current = requestAnimationFrame(animate);
    return () => cancelAnimationFrame(animationFrameRef.current);
  }, [duration, end, interactive, interactiveView, replayKey, start]);

  const applyView = (view) => {
    svgRef.current?.setAttribute("viewBox", formatViewBox(view));
    currentViewRef.current = view;
  };

  const interruptPreview = () => {
    cancelAnimationFrame(animationFrameRef.current);
    const view = liveViewBox(svgRef.current, interactiveView ?? end ?? start);
    currentViewRef.current = view;
    if (!interactive) onInteractionStart?.(view);
    return view;
  };

  const restartGesture = (view = currentViewRef.current) => {
    const points = [...gestureRef.current.pointers.values()];
    if (points.length === 1) {
      gestureRef.current.base = { mode: "pan", point: points[0], view };
      return;
    }
    if (points.length >= 2) {
      const [left, right] = points;
      gestureRef.current.base = {
        mode: "pinch",
        center: { x: (left.x + right.x) / 2, y: (left.y + right.y) / 2 },
        distance: Math.hypot(right.x - left.x, right.y - left.y),
        view,
      };
    }
  };

  const clampZoom = (view, zoom) => {
    const minWidth = Math.max(16, frame.width * 0.08);
    const maxWidth = Math.max(minWidth, frame.width * 4);
    return Math.min(maxWidth, Math.max(minWidth, view.width * zoom)) / view.width;
  };

  const handlePointerDown = (event) => {
    if (!onViewChange) return;
    event.preventDefault();
    event.currentTarget.setPointerCapture(event.pointerId);
    const view = gestureRef.current.pointers.size ? currentViewRef.current : interruptPreview();
    gestureRef.current.pointers.set(event.pointerId, { x: event.clientX, y: event.clientY });
    restartGesture(view);
    setDragging(true);
  };

  const handlePointerMove = (event) => {
    if (!gestureRef.current.pointers.has(event.pointerId)) return;
    gestureRef.current.pointers.set(event.pointerId, { x: event.clientX, y: event.clientY });
    const rect = svgRef.current.getBoundingClientRect();
    const base = gestureRef.current.base;
    if (!base || !rect.width || !rect.height) return;
    if (base.mode === "pan") {
      applyView(transformStoryCamera(base.view, {
        panX: (base.point.x - event.clientX) / rect.width,
        panY: (base.point.y - event.clientY) / rect.height,
      }));
      return;
    }
    const [left, right] = [...gestureRef.current.pointers.values()];
    if (!right) return;
    const center = { x: (left.x + right.x) / 2, y: (left.y + right.y) / 2 };
    const distance = Math.max(1, Math.hypot(right.x - left.x, right.y - left.y));
    applyView(transformStoryCamera(base.view, {
      panX: (base.center.x - center.x) / rect.width,
      panY: (base.center.y - center.y) / rect.height,
      zoom: clampZoom(base.view, base.distance / distance),
      anchorX: (base.center.x - rect.left) / rect.width,
      anchorY: (base.center.y - rect.top) / rect.height,
    }));
  };

  const handlePointerEnd = (event) => {
    gestureRef.current.pointers.delete(event.pointerId);
    onViewChange?.(currentViewRef.current);
    restartGesture();
    setDragging(Boolean(gestureRef.current.pointers.size));
  };

  const handleWheel = (event) => {
    if (!onViewChange) return;
    event.preventDefault();
    const view = interruptPreview();
    const rect = svgRef.current.getBoundingClientRect();
    applyView(transformStoryCamera(view, {
      zoom: clampZoom(view, Math.exp(event.deltaY * 0.0015)),
      anchorX: (event.clientX - rect.left) / rect.width,
      anchorY: (event.clientY - rect.top) / rect.height,
    }));
    window.clearTimeout(wheelCommitRef.current);
    wheelCommitRef.current = window.setTimeout(
      () => onViewChange?.(currentViewRef.current),
      120,
    );
  };
  wheelHandlerRef.current = handleWheel;

  useEffect(() => {
    const svg = svgRef.current;
    if (!svg || !artwork) return undefined;
    const handleNativeWheel = (event) => wheelHandlerRef.current?.(event);
    svg.addEventListener("wheel", handleNativeWheel, { passive: false });
    return () => svg.removeEventListener("wheel", handleNativeWheel);
  }, [artwork]);

  const handleKeyDown = (event) => {
    if (!onViewChange) return;
    const direction = {
      ArrowLeft: [-0.05, 0],
      ArrowRight: [0.05, 0],
      ArrowUp: [0, -0.05],
      ArrowDown: [0, 0.05],
    }[event.key];
    if (!direction && !["+", "=", "-", "_"].includes(event.key)) return;
    event.preventDefault();
    const view = interruptPreview();
    const nextView = transformStoryCamera(view, direction
      ? { panX: direction[0], panY: direction[1] }
      : { zoom: clampZoom(view, ["+", "="].includes(event.key) ? 0.9 : 1.1) });
    applyView(nextView);
    onViewChange(nextView);
  };

  useEffect(() => () => window.clearTimeout(wheelCommitRef.current), []);

  if (!artwork || !frame || !start || !end) {
    return <div className={`story-camera-preview story-camera-preview--loading ${className}`} role="status">正在准备预览…</div>;
  }

  return (
    <svg
      ref={svgRef}
      className={`story-camera-preview${onViewChange ? " story-camera-preview--interactive" : ""}${dragging ? " is-dragging" : ""} ${className}`}
      viewBox={formatViewBox(interactive && interactiveView ? interactiveView : start)}
      aria-label={onViewChange ? "镜头取景器。拖动平移，滚轮或双指缩放，方向键微调。" : "镜头预览"}
      onKeyDown={handleKeyDown}
      onPointerCancel={handlePointerEnd}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerEnd}
      tabIndex={onViewChange ? 0 : undefined}
    >
      <svg
        x={frame.x}
        y={frame.y}
        width={frame.width}
        height={frame.height}
        viewBox={artwork.viewBox}
        aria-hidden="true"
        dangerouslySetInnerHTML={{ __html: artwork.markup }}
      />
    </svg>
  );
}
