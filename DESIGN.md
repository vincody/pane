---
version: beta
name: Pane (Cloudflare palette, clean glass)
description: A calm desktop workspace for coding agents. Cloudflare-style neutral canvas with one blue for actions and a sparing orange brand signal, one sans family (Inter) plus JetBrains Mono for code, and translucent glass panels floating over a soft blue/orange backdrop. Light and dark themes share the same semantic tokens.

colors:
  canvas: "#f4f6fa"
  surface: "#ffffff"
  surface-2: "#eceff5"
  hairline: "#e3e6ec"
  ink: "#202124"
  body: "#2f3237"
  muted: "#636872"
  primary: "#0a5cff"
  primary-hover: "#0848c9"
  primary-soft: "#eaf1ff"
  on-primary: "#ffffff"
  brand-orange: "#f6821f"
  success: "#0a7d33"
  warning: "#946200"
  error: "#c9341e"

colors-dark:
  canvas: "#111214"
  surface: "#1a1c20"
  surface-2: "#262a31"
  hairline: "#2e3238"
  ink: "#ededed"
  body: "#d6d9de"
  muted: "#a3a8b1"
  primary: "#4d8dff"
  primary-hover: "#7aa8ff"
  primary-soft: "#142340"
  on-primary: "#0b0b0b"
  success: "#3fb868"
  warning: "#e8b76c"
  error: "#ff6b57"

glass:
  fill: "rgba(255,255,255,.62)"
  fill-strong: "rgba(255,255,255,.82)"
  fill-dark: "rgba(26,28,32,.58)"
  blur: "blur(22px) saturate(160%)"
  edge: "1px solid rgba(255,255,255,.7)"
  shadow: "0 8px 28px rgba(20,30,60,.08), 0 1px 2px rgba(20,30,60,.05)"
  backdrop: "blue radial top-left (16%), orange radial bottom-right (12%), over canvas"

typography:
  ui: { fontFamily: Inter, fontWeight: 400, 500 for labels, 600 for headings }
  code: { fontFamily: "JetBrains Mono, Consolas, monospace" }

rounded: { xs: 2px, sm: 4px, md: 6px, lg: 10px }
spacing: { unit: 4px }
---

## Overview

Pane is a desktop app (Electron), not a website. The interface is quiet and tool-like: the left sidebar (workspaces and agent sessions), the main column (topbar, file tabs, editor or preview, terminal) and the right sidebar (files) form a flat three-column shell divided by 1px hairlines, with no floating panels, outer radius or gaps (layout follows PandaCode). Blue marks actions and selection. Orange is only the brand signal.

## Glass rules

- Glass is for the **sidebars** (translucent over the backdrop), the **topbar/tab strip** (84% canvas + 16px blur), and floating **menus, dialogs, toasts**. The editor, preview and terminal sit on `fill-strong` (near opaque) so code stays legible.
- One recipe everywhere: `fill` + `blur` + 1px light edge + `shadow`. Do not stack glass on glass; a panel inside a glass panel uses `surface` or a hairline, not another blur.
- Keep a hairline or edge on every glass panel: depth comes from the edge and a soft offset shadow, not from heavy shadows or hard offsets.
- Text on glass uses `ink`, `body` or `muted` only (≥4.5:1 over the backdrop). Check contrast on the translucent fill, not the token alone.
- Fallback: without `backdrop-filter`, glass becomes `surface`. Under 700px the panels go edge to edge with no radius or gap.

## Colour

- **Primary** is the only action colour: primary buttons, the active tab underline, the selected row (`primary-soft` fill, `primary-hover` text), focus ring.
- **Brand orange** appears only in the logo mark and progress. Never for buttons, text or large fills.
- **Success / warning / error** are always paired with an icon or word, never colour alone.
- Components use semantic tokens (`--canvas`, `--surface-card`, `--hairline`, `--ink`, `--muted`, `--primary`…). Do not hard-code hex in component CSS; white/black overlays use `color-mix` on `--ink`.

## Components

- **Shell**: flat columns separated by hairlines. Radii stay small (2/4/6px, 10px max for menus and dialogs); never round the window panels.
- **Rows** (workspace, session, file): 30-40px, `rounded.md`, icon + label; hover is a 4% `ink` tint; selected is `primary-soft`.
- **Buttons**: primary = `primary` fill with `on-primary` label; secondary = hairline border; ghost = hover tint only.
- **Tabs**: transparent over the glass strip, active tab has a 2px `primary` underline.
- **Dialogs and toasts**: `fill-strong` glass, `rounded.lg`; the dialog backdrop is a 4px blur with a cool dark scrim.
- **Focus**: 2px `primary-hover` ring with offset on every interactive element.

## Do

- Keep views quiet: one primary action, everything else secondary or ghost.
- Prefer rows and hairlines over cards; no nested cards.
- Let the backdrop show through the chrome, never through text-heavy content.

## Don't

- Don't use blur as decoration on content areas, or glass inside glass.
- Don't use gradient text, hard-offset shadows or a border plus wide shadow on the same card.
- Don't use orange for actions or body text.
- Don't introduce a second UI typeface.
