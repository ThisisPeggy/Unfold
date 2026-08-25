export const STORY_ICON_KINDS = [
  "camera", "page", "link",
  "instagram", "linkedin", "youtube",
  "x", "github", "whatsapp",
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

  const cardWidth = 480;
  const cardHeight = 220;
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
      type: "text", x: x + 32, y: y + 96, text: wrapCanvasText(section.body, 34),
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
  add(closingIds, {
    type: "rectangle", x: 80, y: closingY, width: 1040, height: 170,
    backgroundColor: "#f3f7f5", fillStyle: "solid", strokeColor: "#cad8d1",
    strokeWidth: 1, roughness: 1, roundness: { type: 3 },
  });
  add(closingIds, {
    type: "text", x: 120, y: closingY + 34, text: wrapCanvasText(document.closing.title, 36),
    fontFamily, fontSize: 30, strokeColor: "#356a50",
  });
  if (document.closing.body) add(closingIds, {
    type: "text", x: 120, y: closingY + 92, text: wrapCanvasText(document.closing.body, 62),
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
