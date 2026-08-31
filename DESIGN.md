---
colors:
  paper: "#ffffff"
  ink: "#37352f"
  muted: "#787774"
  accent: "#2383e2"
  focus: "#2383e2"
  authored_red: "#d44c47"
  authored_green: "#448361"
  authored_blue: "#337ea9"
  authored_brown: "#a56a3a"
  fill_red: "#fdebec"
  fill_green: "#edf3ec"
  fill_blue: "#e7f3f8"
  fill_yellow: "#fbf3db"
typography:
  interface: "Inter, Noto Sans SC, ui-sans-serif, system-ui, sans-serif"
layout:
  control_size: "40px"
  canvas_padding: "16px"
shapes:
  control_radius: "8px"
---

# Overview

Unfold（迹·叙）is a quiet white paper surface for hand-drawn stories, explanations, and résumés. Interface chrome should recede until the user needs it.

# Colors

Use white paper and Notion-like near-black ink; new authored marks default to that ink at full opacity. Interface states use restrained blue; other authored accents use muted blue, green, and brown. Avoid gradients, saturated panels, and decorative color blocks.

# Typography

Use Google Fonts Inter and Noto Sans SC for controls, with system fallbacks. The second authored-text control toggles a bold weight without changing the selected font family; keep the remaining Excalidraw hand-drawn and code fonts available and interface labels compact and calm.

# Layout

The canvas fills the viewport. Controls float at the edges and must not create a permanent application frame. Desktop controls are at least 40px tall. Preview and published scenes use 24px edge padding and 32 canvas units of export padding.

# Elevation & Depth

Use a subtle structural border for floating actions. Avoid shadows that can read as a second control underneath.

# Shapes

Controls use 6px corners. Keep the control group itself visually transparent so it cannot read as another button underneath.

# Components

The editor owns drawing tools, menus, zoom, export, and the selected-element link input. Ordinary shape tools are one-shot by default so a newly drawn element remains ready for immediate styling; tool lock is an explicit session-only choice for batch drawing and is not restored with a scene. The highlighter remains continuous while its dedicated mode is active. The main menu contains actions only, ordered as file, support/destructive operations, then canvas background; Excalidraw's built-in canvas search and public library are disabled, and product branding stays outside the menu. Selected-element panels share a 224px surface, compact neutral labels, consistent control geometry, and plain Chinese property names across element types. The product shell owns save status, publishing, preview mode, a compact link-settings popover, and a marker inside the main toolbar. Story paths identify steps independently from their elements, so the same element can appear more than once with separate copy and camera settings. Native links are converted into Unfold story links after entry; clicking their icon opens a nearby popover with familiar social icons, an icon-free option, and live left/right placement. The marker automatically sizes its soft borderless highlight from the crossed text: colored text produces a same-hue pastel, while neutral text uses pale amber; empty strokes leave no canvas marks. Hermes composes freely from safe canvas primitives; named layouts are inspiration and fallback, not templates it must follow. Its compact composer exposes only the generate-canvas and organize-canvas commands through `/`, keeps explicit update/reconnect actions visible while connected, stages user-approved image attachments, and keeps generated images inside the conversation until the user explicitly places one on the canvas. Published scenes remove all application chrome and add accessible animated link overlays: an optional small icon and a hand-drawn underline on hover or keyboard focus.

# Do's and Don'ts

- Do keep authored content visually dominant.
- Do preserve keyboard focus and reduced-motion behavior.
- Don't fork or restyle Excalidraw internals without a demonstrated need.
- Don't add accounts, cloud sync, templates, or collaboration to the first version.
