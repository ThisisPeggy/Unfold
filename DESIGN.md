---
colors:
  paper: "#ffffff"
  ink: "#37352f"
  muted: "#787774"
  accent: "#2383e2"
  focus: "#2383e2"
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

Use Google Fonts Inter and Noto Sans SC for controls, with system fallbacks. Keep Excalidraw's hand-drawn fonts for authored content and interface labels compact and calm.

# Layout

The canvas fills the viewport. Controls float at the edges and must not create a permanent application frame. Desktop controls are at least 40px tall. Preview and published scenes use 24px edge padding and 32 canvas units of export padding.

# Elevation & Depth

Use a subtle structural border for floating actions. Avoid shadows that can read as a second control underneath.

# Shapes

Controls use 6px corners. Keep the control group itself visually transparent so it cannot read as another button underneath.

# Components

The editor owns drawing tools, menus, zoom, export, and the selected-element link input. Its main menu is branded as Unfold（迹·叙）and excludes upstream social and documentation links. The product shell owns save status, publishing, preview mode, a compact link-settings popover, and a marker inside the main toolbar. Native links are converted into Unfold story links after entry; clicking their icon opens a nearby popover with familiar social icons and live left/right placement. The marker uses Excalidraw free draw with three widths, 30% opacity, and no roughness, so users can drag a natural translucent stroke over any phrase. Hermes composes freely from safe canvas primitives; named layouts are inspiration and fallback, not templates it must follow. Published scenes remove all application chrome and add accessible animated link overlays: a small icon and a hand-drawn underline on hover or keyboard focus.

# Do's and Don'ts

- Do keep authored content visually dominant.
- Do preserve keyboard focus and reduced-motion behavior.
- Don't fork or restyle Excalidraw internals without a demonstrated need.
- Don't add accounts, cloud sync, templates, or collaboration to the first version.
