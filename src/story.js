export const STORY_ICON_KINDS = ["camera", "page", "spark", "globe", "mail", "code"];

export function storyIconKind(href = "") {
  const link = href.toLowerCase();
  if (link.startsWith("mailto:")) return "mail";
  if (/photos|unsplash|instagram/.test(link)) return "camera";
  if (/resume|cv|about/.test(link)) return "page";
  if (/github|gitlab|code|project|\.dev/.test(link)) return "code";
  if (/twitter|x\.com|linkedin|mastodon/.test(link)) return "globe";
  return "spark";
}

export function getStoryIconKind(element) {
  const saved = element?.customData?.storyIcon;
  return STORY_ICON_KINDS.includes(saved)
    ? saved
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

export function getStoryHref(element) {
  return safeStoryHref(element?.customData?.storyLink ?? element?.link);
}

export function getStoryHighlight(element) {
  const color = element?.customData?.storyHighlight;
  return ["#3b72c4", "#2f8f5b", "#b8751a"].includes(color) ? color : null;
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

export function editorLinkSignature(elements, appState = {}) {
  const viewport = [
    appState.scrollX ?? 0,
    appState.scrollY ?? 0,
    appState.zoom?.value ?? 1,
    appState.offsetLeft ?? 0,
    appState.offsetTop ?? 0,
    Object.keys(appState.selectedElementIds ?? {}).sort(),
  ];
  const links = elements
    .filter((element) => !element.isDeleted && getStoryHref(element))
    .map((element) => [
      element.id,
      element.version,
      element.x,
      element.y,
      element.width,
      element.height,
      element.angle,
      element.strokeColor,
    ]);
  return JSON.stringify([viewport, links]);
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
