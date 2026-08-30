import React, { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { getStoryViewBox } from "./story.js";
import StoryCameraPreview from "./StoryCameraPreview.jsx";

function ChevronIcon({ direction }) {
  const paths = {
    left: "m15 18-6-6 6-6",
    right: "m9 6 6 6-6 6",
  };
  return <svg aria-hidden="true" viewBox="0 0 24 24"><path d={paths[direction]} /></svg>;
}

const CAMERA_PRESETS = [
  ["still", "静止"],
  ["zoom-in", "推近"],
  ["zoom-out", "拉远"],
  ["pan-right", "左 → 右"],
  ["pan-left", "右 → 左"],
];

export default function StoryPathEditor({
  frame,
  getElementLabel,
  getStepLabel,
  onAdd,
  onClose,
  onMove,
  onPreviewCamera,
  onRemove,
  onSetCameraPreset,
  onUpdate,
  scene,
  selectedCount,
  steps,
}) {
  const [draggedStepId, setDraggedStepId] = useState(null);
  const [dropTargetId, setDropTargetId] = useState(null);
  const [editingStepId, setEditingStepId] = useState(null);
  const [tab, setTab] = useState("content");
  const [replayKey, setReplayKey] = useState(0);
  const [cameraEndpoint, setCameraEndpoint] = useState("start");
  const [cameraPreviewing, setCameraPreviewing] = useState(false);
  const [menu, setMenu] = useState(null);
  const listRef = useRef(null);
  const previousStepCount = useRef(steps.length);
  const editingStep = steps.find((step) => step.id === editingStepId) ?? null;
  const editingIndex = editingStep ? steps.findIndex((step) => step.id === editingStep.id) : -1;
  const automaticCamera = useMemo(
    () => editingStep && frame
      ? getStoryViewBox(frame, editingStep, 2.2, 96)
      : null,
    [editingStep, frame],
  );
  const cameraEnd = editingStep?.storyCamera ?? automaticCamera;
  const cameraStart = editingStep?.storyCameraStart ?? cameraEnd;
  const menuIndex = menu ? steps.findIndex((step) => step.id === menu.stepId) : -1;

  useEffect(() => {
    if (steps.length > previousStepCount.current) {
      listRef.current?.scrollTo({ top: listRef.current.scrollHeight });
    }
    previousStepCount.current = steps.length;
  }, [steps.length]);

  useEffect(() => {
    if (editingStepId && !editingStep) setEditingStepId(null);
  }, [editingStep, editingStepId]);

  useEffect(() => {
    const closeOnEscape = (event) => {
      if (event.key !== "Escape") return;
      if (menu) setMenu(null);
      else if (editingStepId) setEditingStepId(null);
      else onClose();
    };
    document.addEventListener("keydown", closeOnEscape);
    return () => document.removeEventListener("keydown", closeOnEscape);
  }, [editingStepId, menu, onClose]);

  useEffect(() => {
    if (!menu) return undefined;
    const closeMenu = (event) => {
      const target = event.target instanceof Element ? event.target : null;
      if (!target?.closest(".story-path-menu-popover, .story-path-menu-trigger")) setMenu(null);
    };
    const closeOnLayoutChange = () => setMenu(null);
    document.addEventListener("pointerdown", closeMenu);
    window.addEventListener("resize", closeOnLayoutChange);
    listRef.current?.addEventListener("scroll", closeOnLayoutChange);
    return () => {
      document.removeEventListener("pointerdown", closeMenu);
      window.removeEventListener("resize", closeOnLayoutChange);
      listRef.current?.removeEventListener("scroll", closeOnLayoutChange);
    };
  }, [menu]);

  const openStep = (stepId) => {
    setEditingStepId(stepId);
    setTab("camera");
    setCameraEndpoint("start");
    setCameraPreviewing(false);
  };

  const openStepMenu = (event, stepId) => {
    const rect = event.currentTarget.getBoundingClientRect();
    const width = 108;
    const height = 104;
    const gap = 4;
    const top = rect.bottom + height + gap <= window.innerHeight - 8
      ? rect.bottom + gap
      : rect.top - height - gap;
    setMenu({
      stepId,
      left: Math.min(window.innerWidth - width - 8, Math.max(8, rect.right - width)),
      top: Math.max(8, top),
    });
  };

  const updateCameraView = (view) => {
    if (!editingStep) return;
    onUpdate(editingStep.id, cameraEndpoint === "start"
      ? {
          cameraStart: view,
          camera: editingStep.storyCamera ?? cameraEnd,
          cameraDuration: editingStep.storyCameraDuration,
          cameraPreset: "custom",
        }
      : {
          camera: view,
          cameraStart: editingStep.storyCameraStart ?? cameraStart,
          cameraDuration: editingStep.storyCameraDuration,
          cameraPreset: "custom",
        });
  };

  const previewCamera = () => {
    setCameraPreviewing(true);
    setReplayKey((value) => value + 1);
  };

  if (editingStep) {
    return (
      <section
        id="story-path-editor"
        className="story-path-editor story-path-editor--detail"
        role="dialog"
        aria-modal="false"
        aria-labelledby="story-path-title"
      >
        <header className="story-path-detail-header">
          <button type="button" className="path-icon-button" aria-label="返回讲解路径" onClick={() => setEditingStepId(null)}>
            <ChevronIcon direction="left" />
          </button>
          <div>
            <span>步骤 {editingIndex + 1} / {steps.length}</span>
            <h2 id="story-path-title">{getStepLabel(editingStep)}</h2>
          </div>
          <button type="button" className="path-icon-button" aria-label="关闭讲解路径" onClick={onClose}>×</button>
        </header>

        <div className="story-path-tabs" role="tablist" aria-label="步骤设置">
          <button type="button" role="tab" aria-selected={tab === "camera"} onClick={() => setTab("camera")}>镜头</button>
          <button type="button" role="tab" aria-selected={tab === "content"} onClick={() => setTab("content")}>内容</button>
        </div>

        <div className="story-path-detail-body">
          {tab === "content" ? (
            <div className="story-copy-editor">
              <label>
                <span>步骤标题</span>
                <input
                  type="text"
                  maxLength="80"
                  value={editingStep.storyTitle ?? ""}
                  placeholder={getElementLabel(editingStep)}
                  onChange={(event) => onUpdate(editingStep.id, { title: event.target.value })}
                />
              </label>
              <label>
                <span>讲解文字</span>
                <textarea
                  rows="5"
                  maxLength="500"
                  value={editingStep.storyNote ?? ""}
                  placeholder="解释这一部分是什么，以及为什么重要。"
                  onChange={(event) => onUpdate(editingStep.id, { note: event.target.value })}
                />
              </label>
            </div>
          ) : (
            <div className="story-camera-editor">
              <div className="story-camera-preview-wrap">
                <StoryCameraPreview
                  duration={editingStep.storyCameraDuration}
                  end={cameraEnd}
                  frame={frame}
                  interactive={!cameraPreviewing}
                  interactiveView={cameraEndpoint === "start" ? cameraStart : cameraEnd}
                  onAnimationEnd={() => setCameraPreviewing(false)}
                  onInteractionStart={(view) => {
                    setCameraPreviewing(false);
                    updateCameraView(view);
                  }}
                  onViewChange={updateCameraView}
                  replayKey={replayKey}
                  scene={scene}
                  start={cameraStart}
                />
                <span className="story-camera-editing-badge">
                  {cameraPreviewing
                    ? "正在预览 A → B"
                    : `正在编辑 · ${cameraEndpoint === "start" ? "起点 A" : "终点 B"}`}
                </span>
              </div>

              <section className="story-camera-section story-camera-workflow">
                <div className="story-camera-section__heading">
                  <strong>选择要编辑的画面</strong>
                  <span>选中后拖动或缩放上方画面</span>
                </div>
                <div className="story-camera-capture" role="group" aria-label="镜头设置步骤">
                  <button
                    type="button"
                    className={cameraEndpoint === "start" ? "is-active" : ""}
                    aria-pressed={cameraEndpoint === "start"}
                    onClick={() => {
                      setCameraEndpoint("start");
                      setCameraPreviewing(false);
                    }}
                  >
                    起点 A
                  </button>
                  <button
                    type="button"
                    className={cameraEndpoint === "end" ? "is-active" : ""}
                    aria-pressed={cameraEndpoint === "end"}
                    onClick={() => {
                      setCameraEndpoint("end");
                      setCameraPreviewing(false);
                    }}
                  >
                    终点 B
                  </button>
                </div>
                <button
                  type="button"
                  className="story-camera-play"
                  onClick={previewCamera}
                >
                  ▶ 预览 A → B
                </button>
              </section>

              <details className="story-camera-quick">
                <summary>快速效果（可选）</summary>
                <div className="story-camera-presets">
                  <button
                    type="button"
                    className={!editingStep.storyCamera ? "is-active" : ""}
                    aria-pressed={!editingStep.storyCamera}
                    onClick={() => {
                      onUpdate(editingStep.id, {
                        camera: null,
                        cameraStart: null,
                        cameraDuration: null,
                        cameraPreset: null,
                      });
                      setCameraPreviewing(false);
                    }}
                  >
                    自动
                  </button>
                  {CAMERA_PRESETS.map(([preset, label]) => (
                    <button
                      key={preset}
                      type="button"
                      className={editingStep.storyCameraPreset === preset ? "is-active" : ""}
                      aria-pressed={editingStep.storyCameraPreset === preset}
                      onClick={() => {
                        onSetCameraPreset(editingStep.id, preset);
                        setCameraEndpoint("end");
                        previewCamera();
                      }}
                    >
                      {label}
                    </button>
                  ))}
                </div>
              </details>

              {editingStep.storyCameraStart && (
                <section className="story-camera-section">
                  <strong>时长</strong>
                  <div className="story-camera-duration" role="group" aria-label="镜头时长">
                    {[[1500, "快速 1.5s"], [3000, "标准 3s"], [5000, "缓慢 5s"]].map(([duration, label]) => (
                      <button
                        key={duration}
                        type="button"
                        className={editingStep.storyCameraDuration === duration ? "is-active" : ""}
                        aria-pressed={editingStep.storyCameraDuration === duration}
                        onClick={() => onUpdate(editingStep.id, { cameraDuration: duration })}
                      >
                        {label}
                      </button>
                    ))}
                  </div>
                </section>
              )}
            </div>
          )}
        </div>

        <footer className="story-path-detail-footer">
          {tab === "camera" && (
            <button type="button" className="story-camera-full-preview" onClick={() => onPreviewCamera(editingStep.id)}>全屏预览</button>
          )}
          <button type="button" onClick={() => setEditingStepId(null)}>完成</button>
        </footer>
      </section>
    );
  }

  return (
    <>
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
          <p>拖动步骤调整讲解顺序。</p>
        </div>
        <button type="button" className="path-icon-button" aria-label="关闭讲解路径" onClick={onClose}>×</button>
      </header>

      {steps.length ? (
        <ol ref={listRef} className="story-path-list">
          {steps.map((step, index) => (
            <li
              key={step.id}
              className={`${draggedStepId === step.id ? "story-path-item--dragging" : ""}${dropTargetId === step.id && draggedStepId !== step.id ? " story-path-item--drop-target" : ""}`}
              draggable
              onDragStart={(event) => {
                if (event.target.closest("button, summary")) {
                  event.preventDefault();
                  return;
                }
                event.dataTransfer.effectAllowed = "move";
                event.dataTransfer.setData("text/plain", step.id);
                setDraggedStepId(step.id);
              }}
              onDragOver={(event) => {
                event.preventDefault();
                event.dataTransfer.dropEffect = "move";
                setDropTargetId(step.id);
              }}
              onDrop={(event) => {
                event.preventDefault();
                const sourceId = event.dataTransfer.getData("text/plain") || draggedStepId;
                const sourceIndex = steps.findIndex((item) => item.id === sourceId);
                if (sourceIndex >= 0 && sourceIndex !== index) onMove(sourceIndex, index - sourceIndex);
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
                  <circle cx="3" cy="4" r="1" /><circle cx="9" cy="4" r="1" />
                  <circle cx="3" cy="9" r="1" /><circle cx="9" cy="9" r="1" />
                  <circle cx="3" cy="14" r="1" /><circle cx="9" cy="14" r="1" />
                </svg>
              </span>
              <span className="story-path-number">{index + 1}</span>
              <button type="button" className="story-path-label" onClick={() => openStep(step.id)}>
                <span>{getStepLabel(step)}</span>
                {step.storyNote && <i aria-hidden="true" />}
              </button>
              <button
                type="button"
                className="story-path-menu-trigger"
                aria-expanded={menu?.stepId === step.id}
                aria-haspopup="menu"
                aria-label={`更多操作：${getStepLabel(step)}`}
                onClick={(event) => openStepMenu(event, step.id)}
              >
                •••
              </button>
            </li>
          ))}
        </ol>
      ) : (
        <p className="story-path-empty">还没有讲解步骤。</p>
      )}

      <button
        type="button"
        className="story-path-add"
        disabled={!selectedCount}
        onClick={() => {
          const stepId = onAdd();
          if (stepId) openStep(stepId);
        }}
      >
        {selectedCount ? `＋ 添加选中的 ${selectedCount} 个元素` : "在画布中选择元素"}
      </button>
      </section>
      {menu && menuIndex >= 0 && createPortal(
        <div
          className="story-path-menu-popover"
          role="menu"
          style={{ left: menu.left, top: menu.top }}
          onPointerDown={(event) => event.stopPropagation()}
        >
          <button
            type="button"
            role="menuitem"
            disabled={menuIndex === 0}
            onClick={() => {
              onMove(menuIndex, -1);
              setMenu(null);
            }}
          >
            上移
          </button>
          <button
            type="button"
            role="menuitem"
            disabled={menuIndex === steps.length - 1}
            onClick={() => {
              onMove(menuIndex, 1);
              setMenu(null);
            }}
          >
            下移
          </button>
          <button
            type="button"
            role="menuitem"
            className="is-danger"
            onClick={() => {
              onRemove(menu.stepId);
              setMenu(null);
            }}
          >
            删除步骤
          </button>
        </div>,
        document.body,
      )}
    </>
  );
}
