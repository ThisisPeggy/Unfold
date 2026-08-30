const PRIMARY_ACTIONS = [
  "cut",
  "copy",
  "paste",
  "selectAll",
  "unlockAllElements",
  "gridMode",
  "objectsSnapMode",
  "duplicateSelection",
  "bringToFront",
  "sendToBack",
  "toggleElementLock",
  "deleteSelectedElements",
];

const ACTION_LABELS = {
  gridMode: "显示网格",
  objectsSnapMode: "吸附到对象",
  unlockAllElements: "全部解锁",
};

export function splitContextMenuActions(actionNames) {
  const names = new Set(actionNames);
  return {
    primary: PRIMARY_ACTIONS.filter((name) => names.has(name)),
    more: actionNames.filter((name) => !PRIMARY_ACTIONS.includes(name)),
  };
}

export function getContextMenuPosition(anchor, menuSize, viewport) {
  const right = anchor.left + 10;
  const left = right + menuSize.width <= viewport.width - 8
    ? right
    : Math.max(8, anchor.fallbackLeft - menuSize.width - 10);
  return {
    left,
    top: Math.max(8, Math.min(anchor.top, viewport.height - menuSize.height - 8)),
  };
}

function separator() {
  const element = document.createElement("hr");
  element.className = "context-menu-item-separator";
  return element;
}

function organizeContextMenu(menu, getAnchor) {
  if (menu.dataset.unfoldOrganized) return;
  menu.dataset.unfoldOrganized = "true";

  const actions = [...menu.children].filter((item) => item.dataset?.testid);
  const actionNames = actions.map((item) => item.dataset.testid);
  const { primary, more } = splitContextMenuActions(actionNames);
  if (!more.length) return;

  const actionsByName = new Map(actions.map((item) => [item.dataset.testid, item]));
  actionsByName.forEach((item, name) => {
    if (ACTION_LABELS[name]) {
      item.querySelector(".context-menu-item__label").textContent = ACTION_LABELS[name];
    }
  });
  const moreMenu = document.createElement("ul");
  moreMenu.className = "context-menu context-menu-more";
  moreMenu.dataset.unfoldOrganized = "true";
  moreMenu.hidden = true;
  more.forEach((name) => moreMenu.append(actionsByName.get(name)));

  const moreRow = document.createElement("li");
  moreRow.className = "context-menu-more-row";
  const moreButton = document.createElement("button");
  moreButton.type = "button";
  moreButton.className = "context-menu-item";
  moreButton.setAttribute("aria-expanded", "false");
  moreButton.setAttribute("aria-haspopup", "menu");
  moreButton.innerHTML = '<span class="context-menu-item__label">更多</span><kbd class="context-menu-item__shortcut">›</kbd>';
  moreButton.addEventListener("click", (event) => {
    event.stopPropagation();
    const open = moreMenu.hidden;
    moreMenu.hidden = !open;
    moreButton.setAttribute("aria-expanded", String(open));
    if (open) {
      moreRow.classList.toggle(
        "context-menu-more-row--left",
        moreRow.getBoundingClientRect().right + 244 > window.innerWidth,
      );
    }
  });
  moreRow.append(moreButton, moreMenu);

  menu.replaceChildren(...primary.map((name) => actionsByName.get(name)));
  if (primary.includes("deleteSelectedElements")) {
    const deleteItem = actionsByName.get("deleteSelectedElements");
    menu.insertBefore(separator(), deleteItem);
  }
  menu.append(separator(), moreRow);

  requestAnimationFrame(() => {
    const anchor = getAnchor?.();
    const popover = menu.closest(".popover");
    if (!anchor || !popover) return;
    const position = getContextMenuPosition(anchor, popover.getBoundingClientRect(), anchor.viewport);
    popover.style.left = `${position.left}px`;
    popover.style.top = `${position.top}px`;
  });
}

export function installContextMenuOrganizer(root, getAnchor) {
  const organize = (node) => {
    if (!(node instanceof Element)) return;
    if (node.matches(".context-menu")) organizeContextMenu(node, getAnchor);
    node.querySelectorAll(".context-menu").forEach((menu) => organizeContextMenu(menu, getAnchor));
  };
  const observer = new MutationObserver((records) => {
    records.forEach((record) => record.addedNodes.forEach(organize));
  });
  observer.observe(root, { childList: true, subtree: true });
  root.querySelectorAll(".context-menu").forEach((menu) => organizeContextMenu(menu, getAnchor));
  // ponytail: reuse Excalidraw's menu actions until it exposes a custom context-menu API.
  return () => observer.disconnect();
}
