---
colors:
  paper: "#ffffff"
  ink: "#25231f"
  muted: "#77736b"
  accent: "#5f6f52"
  focus: "#2563eb"
typography:
  interface: "Inter, ui-sans-serif, system-ui, sans-serif"
layout:
  control_size: "40px"
  canvas_padding: "16px"
shapes:
  control_radius: "8px"
---

# Overview

InkPath is a quiet white paper surface for hand-drawn stories, explanations, and résumés. Interface chrome should recede until the user needs it.

# Colors

Use white paper and near-black ink. Authored accents use restrained blue, green, and amber. Avoid gradients, saturated panels, and decorative color blocks.

# Typography

Use the system sans-serif for controls and Excalidraw's hand-drawn fonts for authored content. Keep interface labels compact and calm.

# Layout

The canvas fills the viewport. Controls float at the edges and must not create a permanent application frame. Desktop controls are at least 40px tall. Preview and published scenes use 24px edge padding and 32 canvas units of export padding.

# Elevation & Depth

Use a subtle structural border for floating actions. Avoid shadows that can read as a second control underneath.

# Shapes

Controls use 8px corners. Keep the control group itself visually transparent so it cannot read as another button underneath.

# Components

The editor owns drawing tools, menus, zoom, export, and the selected-element link input. Its main menu is branded as InkPath and excludes upstream social and documentation links. The product shell owns save status, publishing, preview mode, a compact doodle-settings popover, and a marker inside the main toolbar. Native links are converted into InkPath story links after entry; clicking their doodle opens a nearby popover with six visual icon choices and live left/right placement. The marker reuses an Excalidraw line with a fixed 8px width, 22% opacity, and no roughness, so users can drag a clean band over any phrase. Published scenes remove all application chrome and add accessible animated link overlays: a small doodle icon and a hand-drawn underline on hover or keyboard focus.

# Do's and Don'ts

- Do keep authored content visually dominant.
- Do preserve keyboard focus and reduced-motion behavior.
- Don't fork or restyle Excalidraw internals without a demonstrated need.
- Don't add accounts, cloud sync, templates, or collaboration to the first version.
