export const STORY_ICON_KINDS = [
  "camera", "page", "link",
  "instagram", "linkedin", "youtube",
  "x", "github", "whatsapp",
  "none",
];

export function storyIconKind(href = "") {
  const link = href.toLowerCase();
  if (/instagram\.com/.test(link)) return "instagram";
  if (/photos|unsplash/.test(link)) return "camera";
  if (/resume|curriculum-vitae|(^|\/)cv(?:[/.?#]|$)/.test(link)) return "page";
  if (/linkedin\.com/.test(link)) return "linkedin";
  if (/youtube\.com|youtu\.be/.test(link)) return "youtube";
  if (/twitter\.com|(^|\/)x\.com/.test(link)) return "x";
  if (/github\.com|gitlab\.com/.test(link)) return "github";
  if (/whatsapp\.com|wa\.me/.test(link)) return "whatsapp";
  return "link";
}

export function getStoryIconKind(element) {
  const saved = element?.customData?.storyIcon;
  const migrated = {
    globe: "link", code: "github", spark: "link", mail: "link",
  }[saved] ?? saved;
  return STORY_ICON_KINDS.includes(migrated)
    ? migrated
    : storyIconKind(getStoryHref(element));
}

export function safeStoryHref(href = "") {
  try {
    const url = new URL(href);
    return ["http:", "https:", "mailto:"].includes(url.protocol) ? url.href : null;
  } catch {
    return null;
  }
}

function wrapCanvasText(value, maxUnits) {
  const clean = String(value ?? "").trim().replace(/\s+/g, " ");
  if (!clean) return "";
  const spaced = /\s/.test(clean);
  const tokens = spaced ? clean.split(" ") : [...clean];
  const lines = [];
  let line = "";
  const units = (text) => [...text].reduce(
    (total, character) => total + (/^[\x00-\xff]$/.test(character) ? 0.55 : 1),
    0,
  );
  for (const token of tokens) {
    const next = line ? `${line}${spaced ? " " : ""}${token}` : token;
    if (line && units(next) > maxUnits) {
      lines.push(line);
      line = token;
    } else {
      line = next;
    }
  }
  if (line) lines.push(line);
  return lines.join("\n");
}

export function createGeneratedLecture(document, createId = () => globalThis.crypto.randomUUID(), fontFamily = 2) {
  const elements = [];
  const steps = [];
  const colors = ["#337ea9", "#448361", "#9f6b53", "#7c6f9f", "#b7791f", "#39766c"];
  const add = (ids, element) => {
    const id = createId();
    ids.push(id);
    elements.push({ id, ...element });
    return element;
  };
  const introIds = [];
  add(introIds, {
    type: "text", x: 80, y: 60, text: wrapCanvasText(document.title, 32),
    fontFamily, fontSize: 42, strokeColor: "#37352f",
  });
  if (document.subtitle) add(introIds, {
    type: "text", x: 84, y: 132, text: wrapCanvasText(document.subtitle, 52),
    fontFamily, fontSize: 23, strokeColor: "#787774",
  });
  if (document.opening) add(introIds, {
    type: "text", x: 84, y: 188, text: wrapCanvasText(document.opening, 54),
    fontFamily, fontSize: 20, strokeColor: "#4a4843",
  });
  steps.push({ elementIds: introIds, title: document.title, note: document.opening || document.subtitle });

  if (document.layout === "radial") {
    const centerX = 600;
    const centerY = 650;
    const nodeWidth = 300;
    const nodeHeight = 150;
    document.sections.forEach((section, index) => {
      const ids = [];
      const angle = -Math.PI / 2 + index * 2 * Math.PI / document.sections.length;
      const x = centerX + Math.cos(angle) * 450 - nodeWidth / 2;
      const y = centerY + Math.sin(angle) * 300 - nodeHeight / 2;
      const color = colors[index % colors.length];
      add(ids, {
        type: "arrow", x: centerX, y: centerY,
        points: [[0, 0], [x + nodeWidth / 2 - centerX, y + nodeHeight / 2 - centerY]],
        strokeColor: color, strokeWidth: 2, endArrowhead: "arrow", roughness: 1,
      });
      add(ids, {
        type: "ellipse", x, y, width: nodeWidth, height: nodeHeight,
        backgroundColor: `${color}18`, fillStyle: "solid", strokeColor: color,
        strokeWidth: 2, roughness: 1,
      });
      add(ids, {
        type: "text", x: x + 34, y: y + 34, text: wrapCanvasText(section.title, 18),
        fontFamily, fontSize: 25, strokeColor: "#37352f",
      });
      add(ids, {
        type: "text", x: x + 34, y: y + 80, text: wrapCanvasText(section.body, 28),
        fontFamily, fontSize: 17, strokeColor: "#56534e",
      });
      steps.push({ elementIds: ids, title: section.title, note: section.narration });
    });
    const closingIds = [];
    add(closingIds, {
      type: "ellipse", x: centerX - 190, y: centerY - 95, width: 380, height: 190,
      backgroundColor: "#f3f7f5", fillStyle: "solid", strokeColor: "#448361",
      strokeWidth: 2, roughness: 1,
    });
    add(closingIds, {
      type: "text", x: centerX - 145, y: centerY - 48,
      text: wrapCanvasText(document.closing.title, 22),
      fontFamily, fontSize: 28, strokeColor: "#356a50",
    });
    if (document.closing.body) add(closingIds, {
      type: "text", x: centerX - 145, y: centerY + 8,
      text: wrapCanvasText(document.closing.body, 34),
      fontFamily, fontSize: 17, strokeColor: "#4d6257",
    });
    steps.push({
      elementIds: closingIds,
      title: document.closing.title,
      note: document.closing.narration || document.closing.body,
    });
    return { elements, steps };
  }

  if (document.layout === "layers") {
    let y = 300;
    let previousBottom = null;
    document.sections.forEach((section, index) => {
      const ids = [];
      const x = 80 + index * 50;
      const width = 1040 - index * 100;
      const body = wrapCanvasText(section.body, Math.max(28, 58 - index * 5));
      const height = Math.max(160, 104 + body.split("\n").length * 23);
      const color = colors[index % colors.length];
      if (previousBottom) add(ids, {
        type: "arrow", x: 600, y: previousBottom,
        points: [[0, 0], [0, y - previousBottom]],
        strokeColor: "#b8b6b1", strokeWidth: 2, endArrowhead: "arrow", roughness: 1,
      });
      add(ids, {
        type: "rectangle", x, y, width, height,
        backgroundColor: `${color}12`, fillStyle: "solid", strokeColor: color,
        strokeWidth: 2, roughness: 1, roundness: { type: 3 },
      });
      add(ids, {
        type: "text", x: x + 30, y: y + 28, text: `${index + 1}  ${wrapCanvasText(section.title, 30)}`,
        fontFamily, fontSize: 26, strokeColor: "#37352f",
      });
      add(ids, {
        type: "text", x: x + 30, y: y + 82, text: body,
        fontFamily, fontSize: 18, strokeColor: "#56534e",
      });
      steps.push({ elementIds: ids, title: section.title, note: section.narration });
      previousBottom = y + height;
      y = previousBottom + 48;
    });
    const closingIds = [];
    if (previousBottom) add(closingIds, {
      type: "arrow", x: 600, y: previousBottom,
      points: [[0, 0], [0, y - previousBottom]],
      strokeColor: "#b8b6b1", strokeWidth: 2, endArrowhead: "arrow", roughness: 1,
    });
    add(closingIds, {
      type: "rectangle", x: 260, y, width: 680, height: 170,
      backgroundColor: "#f3f7f5", fillStyle: "solid", strokeColor: "#448361",
      strokeWidth: 2, roughness: 1, roundness: { type: 3 },
    });
    add(closingIds, {
      type: "text", x: 300, y: y + 32, text: wrapCanvasText(document.closing.title, 30),
      fontFamily, fontSize: 29, strokeColor: "#356a50",
    });
    if (document.closing.body) add(closingIds, {
      type: "text", x: 300, y: y + 90, text: wrapCanvasText(document.closing.body, 48),
      fontFamily, fontSize: 18, strokeColor: "#4d6257",
    });
    steps.push({
      elementIds: closingIds,
      title: document.closing.title,
      note: document.closing.narration || document.closing.body,
    });
    return { elements, steps };
  }

  const cardWidth = 480;
  const sectionBodies = document.sections.map((section) => wrapCanvasText(section.body, 34));
  const cardHeight = Math.max(
    220,
    ...sectionBodies.map((body) => 120 + body.split("\n").length * 25),
  );
  const cardGap = 80;
  const rowGap = 72;
  const sectionTop = 300;
  let previous = null;
  document.sections.forEach((section, index) => {
    const ids = [];
    const row = Math.floor(index / 2);
    const slot = index % 2;
    const column = row % 2 ? 1 - slot : slot;
    const x = 80 + column * (cardWidth + cardGap);
    const y = sectionTop + row * (cardHeight + rowGap);
    if (previous) {
      const sameRow = previous.y === y;
      const startX = sameRow ? previous.x + (x > previous.x ? cardWidth : 0) : previous.x + cardWidth / 2;
      const startY = sameRow ? previous.y + cardHeight / 2 : previous.y + cardHeight;
      const endX = sameRow ? x + (x > previous.x ? 0 : cardWidth) : x + cardWidth / 2;
      const endY = sameRow ? y + cardHeight / 2 : y;
      add(ids, {
        type: "arrow", x: startX, y: startY,
        points: [[0, 0], [endX - startX, endY - startY]],
        strokeColor: "#b8b6b1", strokeWidth: 2, endArrowhead: "arrow", roughness: 1,
      });
    }
    const color = colors[index % colors.length];
    add(ids, {
      type: "rectangle", x, y, width: cardWidth, height: cardHeight,
      backgroundColor: "#fffdfa", fillStyle: "solid", strokeColor: "#d8d6d1",
      strokeWidth: 1, roughness: 1, roundness: { type: 3 },
    });
    add(ids, {
      type: "ellipse", x: x + 30, y: y + 28, width: 44, height: 44,
      backgroundColor: `${color}22`, fillStyle: "solid", strokeColor: color,
      strokeWidth: 1, roughness: 0,
    });
    add(ids, {
      type: "text", x: x + 45, y: y + 38, text: String(index + 1),
      fontFamily, fontSize: 20, strokeColor: color,
    });
    add(ids, {
      type: "text", x: x + 94, y: y + 31, text: wrapCanvasText(section.title, 18),
      fontFamily, fontSize: 27, strokeColor: "#37352f",
    });
    add(ids, {
      type: "text", x: x + 32, y: y + 96, text: sectionBodies[index],
      fontFamily, fontSize: 19, strokeColor: "#56534e",
    });
    steps.push({ elementIds: ids, title: section.title, note: section.narration });
    previous = { x, y };
  });

  const rows = Math.ceil(document.sections.length / 2);
  const closingY = sectionTop + rows * (cardHeight + rowGap) + 8;
  const closingIds = [];
  if (previous) add(closingIds, {
    type: "arrow", x: previous.x + cardWidth / 2, y: previous.y + cardHeight,
    points: [[0, 0], [600 - (previous.x + cardWidth / 2), closingY - previous.y - cardHeight]],
    strokeColor: "#b8b6b1", strokeWidth: 2, endArrowhead: "arrow", roughness: 1,
  });
  const closingBody = wrapCanvasText(document.closing.body, 62);
  const closingHeight = Math.max(170, 118 + closingBody.split("\n").length * 25);
  add(closingIds, {
    type: "rectangle", x: 80, y: closingY, width: 1040, height: closingHeight,
    backgroundColor: "#f3f7f5", fillStyle: "solid", strokeColor: "#cad8d1",
    strokeWidth: 1, roughness: 1, roundness: { type: 3 },
  });
  add(closingIds, {
    type: "text", x: 120, y: closingY + 34, text: wrapCanvasText(document.closing.title, 36),
    fontFamily, fontSize: 30, strokeColor: "#356a50",
  });
  if (document.closing.body) add(closingIds, {
    type: "text", x: 120, y: closingY + 92, text: closingBody,
    fontFamily, fontSize: 19, strokeColor: "#4d6257",
  });
  steps.push({
    elementIds: closingIds,
    title: document.closing.title,
    note: document.closing.narration || document.closing.body,
  });
  return { elements, steps };
}

export function getStoryHref(element) {
  return safeStoryHref(element?.customData?.storyLink ?? element?.link);
}

function resolveStoryStep(entry, elementsById) {
  const members = [...new Set(Array.isArray(entry?.elementIds) ? entry.elementIds : [])]
    .map((id) => elementsById.get(id))
    .filter(Boolean);
  if (!members.length) return null;
  const representative = members.find((element) => element.type === "text") ?? members[0];
  const left = Math.min(...members.map((element) => element.x));
  const top = Math.min(...members.map((element) => element.y));
  const right = Math.max(...members.map((element) => element.x + element.width));
  const bottom = Math.max(...members.map((element) => element.y + element.height));
  const camera = entry?.camera;
  const storyCamera = camera &&
    [camera.x, camera.y, camera.width, camera.height].every(Number.isFinite) &&
    camera.width > 0 && camera.height > 0
    ? camera
    : null;
  return {
    ...representative,
    id: typeof entry.id === "string" ? entry.id : representative.id,
    angle: 0,
    x: left,
    y: top,
    width: right - left,
    height: bottom - top,
    text: members
      .filter((element) => element.type === "text" && element.text?.trim())
      .map((element) => element.text.trim())
      .join(" · "),
    storyTitle: typeof entry.title === "string" ? entry.title : "",
    storyNote: typeof entry.note === "string" ? entry.note : "",
    storyCamera,
    storyElementIds: members.map((element) => element.id),
  };
}

export function getStorySteps(elements, storyPath) {
  const visible = elements.filter((element) => !element.isDeleted);
  if (Array.isArray(storyPath)) {
    const elementsById = new Map(visible.map((element) => [element.id, element]));
    return storyPath
      .map((entry) => resolveStoryStep(entry, elementsById))
      .filter(Boolean);
  }
  const linked = visible.filter(getStoryHref);
  const candidates = linked.length
    ? linked
    : visible.filter((element) => element.type === "text");
  // ponytail: unnumbered steps keep creation order until the author reorders them.
  return candidates
    .map((element, index) => ({
      element,
      index,
      step: Number.isInteger(element.customData?.storyStep)
        ? element.customData.storyStep
        : Number.POSITIVE_INFINITY,
    }))
    .sort((a, b) => a.step - b.step || a.index - b.index)
    .map(({ element }) => element);
}

export function getStoryFrame(bounds, padding) {
  return {
    x: bounds[0] - padding,
    y: bounds[1] - padding,
    width: Math.max(1, bounds[2] - bounds[0] + padding * 2),
    height: Math.max(1, bounds[3] - bounds[1] + padding * 2),
  };
}

export function getStoryViewBox(frame, focus, maxScale = 1, padding = 0) {
  if (!focus) return frame;
  const scale = Math.max(1, Math.min(
    maxScale,
    frame.width / Math.max(1, focus.width + padding),
    frame.height / Math.max(1, focus.height + padding),
  ));
  const width = frame.width / scale;
  const height = frame.height / scale;
  return {
    x: focus.x + focus.width / 2 - width / 2,
    y: focus.y + focus.height / 2 - height / 2,
    width,
    height,
  };
}

export function interpolateStoryViewBox(from, to, progress) {
  const clamped = Math.max(0, Math.min(1, progress));
  const amount = 1 - (1 - clamped) ** 4;
  return {
    x: from.x + (to.x - from.x) * amount,
    y: from.y + (to.y - from.y) * amount,
    width: from.width + (to.width - from.width) * amount,
    height: from.height + (to.height - from.height) * amount,
  };
}

export function transformStoryCamera(camera, { panX = 0, panY = 0, zoom = 1 }) {
  const width = Math.max(1, camera.width * zoom);
  const height = Math.max(1, camera.height * zoom);
  return {
    x: camera.x + camera.width * panX + (camera.width - width) / 2,
    y: camera.y + camera.height * panY + (camera.height - height) / 2,
    width,
    height,
  };
}

export function makeStoryPath(elements, storyPath) {
  return getStorySteps(elements, storyPath).map((step) => {
    const entry = {
      id: step.id,
      elementIds: step.storyElementIds ?? [step.id],
    };
    if (step.storyTitle) entry.title = step.storyTitle;
    if (step.storyNote) entry.note = step.storyNote;
    if (step.storyCamera) entry.camera = step.storyCamera;
    return entry;
  });
}

export function getStoryIconImage(element) {
  const image = String(element?.customData?.storyIconImage ?? "");
  return image.length <= 200_000 && /^data:image\/(?:png|jpeg|webp);base64,[A-Za-z0-9+/=]+$/.test(image)
    ? image
    : "";
}

export function mergeHermesStoryPath(
  elements,
  storyPath,
  steps,
  scopeElementIds = [],
  createId = () => globalThis.crypto.randomUUID(),
) {
  const current = makeStoryPath(elements, storyPath);
  const key = (ids) => [...ids].sort().join("\0");
  const existing = new Map(current.map((step) => [key(step.elementIds), step]));
  const generated = steps.map((step) => {
    const previous = existing.get(key(step.elementIds));
    return {
      id: previous?.id ?? createId(),
      elementIds: step.elementIds,
      title: step.title,
      ...(step.note ? { note: step.note } : {}),
      ...(previous?.camera ? { camera: previous.camera } : {}),
    };
  });
  if (!scopeElementIds.length) return generated;
  const scope = new Set(scopeElementIds);
  const firstAffected = current.findIndex((step) => step.elementIds.some((id) => scope.has(id)));
  const insertAt = current
    .slice(0, firstAffected < 0 ? current.length : firstAffected)
    .filter((step) => !step.elementIds.some((id) => scope.has(id))).length;
  const untouched = current.filter((step) => !step.elementIds.some((id) => scope.has(id)));
  untouched.splice(insertAt, 0, ...generated);
  return untouched;
}

export function stashStoryLinks(elements) {
  let changed = false;
  const nextElements = elements.map((element) => {
    if (!element.link) return element;
    changed = true;
    const href = safeStoryHref(element.link);
    const customData = { ...element.customData };
    if (href) customData.storyLink = href;
    else delete customData.storyLink;
    return { ...element, link: null, customData };
  });
  return changed ? nextElements : elements;
}

const STARTER_ELEMENT_UPDATES = {
  "text|你好，我是你的名字。|410|300": { strokeColor: "#4a4843" },
  "text|我做产品，也把故事画出来。|360|344": { strokeColor: "#4a4843" },
  "text|照片与生活|700|330": { x: 724 },
  "arrow|#448361|680|344": { x: 704 },
  "text|经历与简历|260|450": { x: 275 },
  "arrow|#9f6b53|365|438": { x: 375, y: 430, points: [[0, 0], [38, -44]] },
};

export function polishStarterElement(element) {
  const label = element.type === "text" ? element.text : element.strokeColor;
  const updates = STARTER_ELEMENT_UPDATES[
    `${element.type}|${label}|${element.x}|${element.y}`
  ];
  return updates ? { ...element, ...updates } : element;
}

export function editorLinkSignature(elements, appState = {}) {
  const viewport = [
    appState.scrollX ?? 0,
    appState.scrollY ?? 0,
    appState.zoom?.value ?? 1,
    appState.offsetLeft ?? 0,
    appState.offsetTop ?? 0,
    Object.keys(appState.selectedElementIds ?? {}).sort(),
  ];
  const sceneElements = elements
    .filter((element) => !element.isDeleted)
    .map((element) => [
      element.id,
      element.version,
      element.x,
      element.y,
      element.width,
      element.height,
      element.angle,
      element.strokeColor,
      getStoryHref(element),
    ]);
  return JSON.stringify([viewport, sceneElements]);
}

export function storyLinkGeometry(element) {
  const size = Math.max(16, element.fontSize ?? 20);
  const side = element.customData?.storyIconSide === "right" ? "right" : "left";
  return {
    size,
    side,
    iconX:
      side === "right"
        ? element.x + element.width + size * 0.25
        : element.x - size * 1.25,
    iconY: element.y + (element.height - size) / 2,
    underlineY: element.y + element.height + size * 0.16,
  };
}

function distanceToSegment(point, start, end) {
  const dx = end.x - start.x;
  const dy = end.y - start.y;
  const lengthSquared = dx * dx + dy * dy;
  const ratio = lengthSquared
    ? Math.max(0, Math.min(1, ((point.x - start.x) * dx + (point.y - start.y) * dy) / lengthSquared))
    : 0;
  return Math.hypot(point.x - start.x - dx * ratio, point.y - start.y - dy * ratio);
}

export function textHighlightRects(element, path, brushWidth, measureText) {
  if (element?.type !== "text" || !path?.length || !element.text || typeof measureText !== "function") {
    return [];
  }

  const angle = element.angle ?? 0;
  const center = { x: element.x + element.width / 2, y: element.y + element.height / 2 };
  const cos = Math.cos(-angle);
  const sin = Math.sin(-angle);
  const localPath = path.map((point) => {
    const dx = point.x - center.x;
    const dy = point.y - center.y;
    return {
      x: center.x + dx * cos - dy * sin - element.x,
      y: center.y + dx * sin + dy * cos - element.y,
    };
  });
  const segments = localPath.length === 1
    ? [[localPath[0], localPath[0]]]
    : localPath.slice(1).map((point, index) => [localPath[index], point]);
  const fontSize = element.fontSize ?? 20;
  const lineHeight = fontSize * (element.lineHeight ?? 1.25);
  const highlightHeight = fontSize * 0.78;
  const radius = Math.max(1, brushWidth / 2);
  const rects = [];

  element.text.split("\n").forEach((line, lineIndex) => {
    if (!line) return;
    const lineWidth = measureText(line);
    const lineX = element.textAlign === "center"
      ? (element.width - lineWidth) / 2
      : element.textAlign === "right"
        ? element.width - lineWidth
        : 0;
    const widths = [0];
    for (let index = 1; index <= line.length; index += 1) {
      widths.push(measureText(line.slice(0, index)));
    }
    const selected = line.split("").map((character, index) => {
      if (!character.trim()) return false;
      const left = lineX + widths[index];
      const width = widths[index + 1] - widths[index];
      const point = {
        x: left + width / 2,
        y: lineIndex * lineHeight + fontSize / 2,
      };
      return segments.some(([start, end]) =>
        distanceToSegment(point, start, end) <= radius + Math.max(width / 2, fontSize * 0.18),
      );
    });

    for (let start = 0; start < selected.length;) {
      if (!selected[start]) {
        start += 1;
        continue;
      }
      let end = start + 1;
      while (end < selected.length && (selected[end] || !line[end].trim())) end += 1;
      while (end > start && !line[end - 1].trim()) end -= 1;
      const localX = lineX + widths[start] - 2;
      const localY = lineIndex * lineHeight + fontSize * 0.2;
      const width = widths[end] - widths[start] + 4;
      const localCenter = { x: localX + width / 2, y: localY + highlightHeight / 2 };
      const dx = localCenter.x + element.x - center.x;
      const dy = localCenter.y + element.y - center.y;
      const worldCenter = {
        x: center.x + dx * Math.cos(angle) - dy * Math.sin(angle),
        y: center.y + dx * Math.sin(angle) + dy * Math.cos(angle),
      };
      rects.push({
        x: worldCenter.x - width / 2,
        y: worldCenter.y - highlightHeight / 2,
        width,
        height: highlightHeight,
        angle,
      });
      start = Math.max(end, start + 1);
    }
  });

  return rects;
}

export function textHighlightColor(strokeColor) {
  const match = /^#([0-9a-f]{6})$/i.exec(strokeColor ?? "");
  const channels = match
    ? match[1].match(/../g).map((value) => Number.parseInt(value, 16))
    : [55, 53, 47];
  const base = Math.max(...channels) - Math.min(...channels) < 24
    ? [217, 115, 13]
    : channels;
  return `#${base.map((value) =>
    Math.round(value * 0.22 + 255 * 0.78).toString(16).padStart(2, "0")
  ).join("")}`;
}
