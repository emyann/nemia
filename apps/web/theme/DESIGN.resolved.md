---
# Generated from the project's DESIGN.md by the MD3 kit (tokens/generate-theme.mjs).
# Never edit this file: edit the project's DESIGN.md and regenerate.
version: alpha
name: Nemia
description: Nemia's board in a cyberpunk look — near-black violet surfaces, neon magenta for what acts, cyan for what informs, acid yellow for what warns, hairlines and glows instead of shadows, sharp corners.
scheme: dark
colors:
  seed: "#7b2cff"
  primary-key: "#ff2bd6"
  secondary-key: "#00e5ff"
  tertiary-key: "#fcee0a"
  neutral-key: "#2b2545"
  neutral-variant-key: "#3a2f66"
  error-key: "#ff3355"
  primary: "#ff2bd6"
  on-primary: "#1a0016"
  primary-container: "#86006f"
  on-primary-container: "#ffd8ee"
  secondary: "#00e5ff"
  on-secondary: "#001f24"
  secondary-container: "#004f58"
  on-secondary-container: "#9cf0ff"
  tertiary: "#fcee0a"
  on-tertiary: "#1f1d00"
  tertiary-container: "#4d4800"
  on-tertiary-container: "#f4e700"
  error: "#ffb3b5"
  on-error: "#680018"
  error-container: "#920025"
  on-error-container: "#ffdada"
  background: "#07060d"
  on-background: "#e9e6ff"
  surface: "#0b0a14"
  on-surface: "#e9e6ff"
  surface-variant: "#493e76"
  on-surface-variant: "#cbbeff"
  surface-dim: "#140e2d"
  surface-bright: "#3b3556"
  surface-container-lowest: "#0f0928"
  surface-container-low: "#1d1736"
  surface-container: "#211b3a"
  surface-container-high: "#2b2545"
  surface-container-highest: "#363051"
  surface-tint: "#ffade2"
  outline: "#9588c6"
  outline-variant: "#493e76"
  shadow: "#000000"
  scrim: "#000000"
  inverse-surface: "#e6deff"
  inverse-on-surface: "#322c4c"
  inverse-primary: "#af0092"
  primary-fixed: "#ffd8ee"
  on-primary-fixed: "#3b002f"
  primary-fixed-dim: "#ffade2"
  on-primary-fixed-variant: "#86006f"
  secondary-fixed: "#9cf0ff"
  on-secondary-fixed: "#001f24"
  secondary-fixed-dim: "#00daf3"
  on-secondary-fixed-variant: "#004f58"
  tertiary-fixed: "#f4e700"
  on-tertiary-fixed: "#1f1c00"
  tertiary-fixed-dim: "#d6ca00"
  on-tertiary-fixed-variant: "#4d4800"
typography:
  display-large:
    fontFamily: Orbitron Variable
    fontSize: 57px
    fontWeight: 400
    lineHeight: 64px
    letterSpacing: -0.25px
  display-medium:
    fontFamily: Orbitron Variable
    fontSize: 45px
    fontWeight: 400
    lineHeight: 52px
    letterSpacing: 0px
  display-small:
    fontFamily: Orbitron Variable
    fontSize: 36px
    fontWeight: 400
    lineHeight: 44px
    letterSpacing: 0px
  headline-large:
    fontFamily: Orbitron Variable
    fontSize: 32px
    fontWeight: 400
    lineHeight: 40px
    letterSpacing: 0px
  headline-medium:
    fontFamily: Orbitron Variable
    fontSize: 28px
    fontWeight: 400
    lineHeight: 36px
    letterSpacing: 0px
  headline-small:
    fontFamily: Orbitron Variable
    fontSize: 24px
    fontWeight: 400
    lineHeight: 32px
    letterSpacing: 0px
  title-large:
    fontFamily: Orbitron Variable
    fontSize: 22px
    fontWeight: 400
    lineHeight: 28px
    letterSpacing: 0px
  title-medium:
    fontFamily: Orbitron Variable
    fontSize: 16px
    fontWeight: 500
    lineHeight: 24px
    letterSpacing: 0.15px
  title-small:
    fontFamily: Orbitron Variable
    fontSize: 14px
    fontWeight: 500
    lineHeight: 20px
    letterSpacing: 0.1px
  body-large:
    fontFamily: Geist Variable
    fontSize: 16px
    fontWeight: 400
    lineHeight: 24px
    letterSpacing: 0.5px
  body-medium:
    fontFamily: Geist Variable
    fontSize: 14px
    fontWeight: 400
    lineHeight: 20px
    letterSpacing: 0.25px
  body-small:
    fontFamily: Geist Variable
    fontSize: 12px
    fontWeight: 400
    lineHeight: 16px
    letterSpacing: 0.4px
  label-large:
    fontFamily: Geist Variable
    fontSize: 14px
    fontWeight: 500
    lineHeight: 20px
    letterSpacing: 0.1px
  label-medium:
    fontFamily: Geist Variable
    fontSize: 12px
    fontWeight: 500
    lineHeight: 16px
    letterSpacing: 0.5px
  label-small:
    fontFamily: Geist Variable
    fontSize: 11px
    fontWeight: 500
    lineHeight: 16px
    letterSpacing: 0.5px
rounded:
  extra-small: 0
  small: 2px
  medium: 2px
  large: 4px
  extra-large: 4px
  full: 2px
---

## Overview

Nemia is a board for running teams of agents: runs, steps, gates, costs. The
look is cyberpunk, a control room at night. The page is nearly black with a
violet cast, and colour is kept for meaning: magenta is what a person can act
on, cyan is what the machine reports, yellow is what needs a look.

The board is dark by nature. The dark scheme is the one written here; the
light scheme is derived from the same keys for a person whose system asks for
it, and is checked by eye, not designed.

## Colors

- **Seed (`seed`):** an electric violet. The neutrals lean towards it.
- **Primary (`primary-key`, `primary`):** neon magenta, `#ff2bd6`, written as
  a role so a filled button is exactly that colour, with near-black text on it.
- **Secondary (`secondary-key`, `secondary`):** cyan, `#00e5ff`, for what
  informs: the focus ring, a selected tab, a running step.
- **Tertiary (`tertiary-key`, `tertiary`):** acid yellow, `#fcee0a`, for what
  needs a look.
- **Neutrals (`neutral-key`, `neutral-variant-key`):** a dark violet, so every
  surface and outline carries the cast, in both schemes.
- **Surfaces (`background`, `surface`):** written, because the derived dark
  surface is a grey and the board wants a near-black.
- **Error (`error-key`):** a hot red, kept apart from the magenta by its hue.

## Typography

Two faces. Orbitron for the brand face (display, headline, title): wide,
geometric, a machine's lettering. Geist for the plain face (body, label), the
face the board already reads in. Sizes, weights and tracking are Material's.

## Shape

Sharp. Nothing is a pill: `full` is 2px, so a button, a chip and a switch are
cut like the panels around them.

## Elevation and motion

No shadow: a surface is lifted by a hairline in the primary colour, then by a
glow that grows with the level. Motion is short and decisive.

## Reference CSS

```css
:root {
  --md3-dark-mode: system;
  --md-sys-elevation-1: 0 0 0 1px --alpha(var(--md-sys-color-primary) / 30%);
  --md-sys-elevation-2:
    0 0 0 1px --alpha(var(--md-sys-color-primary) / 45%),
    0 0 12px 0 --alpha(var(--md-sys-color-primary) / 22%);
  --md-sys-elevation-3:
    0 0 0 1px --alpha(var(--md-sys-color-secondary) / 55%),
    0 0 18px 0 --alpha(var(--md-sys-color-secondary) / 28%);
  --md-sys-elevation-4:
    0 0 0 1px --alpha(var(--md-sys-color-secondary) / 65%),
    0 0 26px 2px --alpha(var(--md-sys-color-secondary) / 32%);
  --md-sys-elevation-5:
    0 0 0 1px --alpha(var(--md-sys-color-tertiary) / 70%),
    0 0 34px 4px --alpha(var(--md-sys-color-tertiary) / 30%);
  --md-sys-state-hover-state-layer-opacity: 10%;
  --md-sys-state-focus-state-layer-opacity: 14%;
  --md-sys-state-pressed-state-layer-opacity: 18%;
  --md-sys-state-dragged-state-layer-opacity: 22%;
  --md-sys-motion-easing-standard: cubic-bezier(0.2, 0, 0, 1);
  --md-sys-motion-easing-standard-accelerate: cubic-bezier(0.3, 0, 1, 1);
  --md-sys-motion-easing-standard-decelerate: cubic-bezier(0, 0, 0, 1);
  --md-sys-motion-easing-emphasized: cubic-bezier(0.05, 0.7, 0.1, 1);
  --md-sys-motion-easing-emphasized-accelerate: cubic-bezier(0.3, 0, 0.8, 0.15);
  --md-sys-motion-easing-emphasized-decelerate: cubic-bezier(0.05, 0.7, 0.1, 1);
  --md3-duration-short-1: 40ms;
  --md3-duration-short-2: 70ms;
  --md3-duration-short-3: 100ms;
  --md3-duration-short-4: 130ms;
  --md3-duration-medium-1: 160ms;
  --md3-duration-medium-2: 200ms;
  --md3-duration-medium-3: 240ms;
  --md3-duration-medium-4: 280ms;
  --md3-duration-long-1: 450ms;
  --md3-duration-long-2: 500ms;
  --md3-duration-long-3: 550ms;
  --md3-duration-long-4: 600ms;
}
```

## Resolved schemes

Generated by the MD3 kit. The front matter above carries the complete
dark scheme; the light scheme is derived from the key colours. Both are
below, each role as the hex the kit derived and the `hsl()` string the
theme's `--md-sys-color-<role>` variable carries. Dark applies when
the system asks for it (`prefers-color-scheme: dark`); no class switches it.

| Role | Light | Dark |
| :--- | :--- | :--- |
| `primary` | `#af0092` `hsl(310 100% 34%)` | `#ff2bd6` `hsl(312 100% 58%)` |
| `on-primary` | `#ffffff` `hsl(0 0% 100%)` | `#1a0016` `hsl(309 100% 5%)` |
| `primary-container` | `#ffd8ee` `hsl(326 100% 92%)` | `#86006f` `hsl(310 100% 26%)` |
| `on-primary-container` | `#86006f` `hsl(310 100% 26%)` | `#ffd8ee` `hsl(326 100% 92%)` |
| `secondary` | `#006875` `hsl(187 100% 23%)` | `#00e5ff` `hsl(186 100% 50%)` |
| `on-secondary` | `#ffffff` `hsl(0 0% 100%)` | `#001f24` `hsl(188 100% 7%)` |
| `secondary-container` | `#9cf0ff` `hsl(189 100% 81%)` | `#004f58` `hsl(186 100% 17%)` |
| `on-secondary-container` | `#004f58` `hsl(186 100% 17%)` | `#9cf0ff` `hsl(189 100% 81%)` |
| `tertiary` | `#666000` `hsl(56 100% 20%)` | `#fcee0a` `hsl(57 98% 51%)` |
| `on-tertiary` | `#ffffff` `hsl(0 0% 100%)` | `#1f1d00` `hsl(56 100% 6%)` |
| `tertiary-container` | `#f4e700` `hsl(57 100% 48%)` | `#4d4800` `hsl(56 100% 15%)` |
| `on-tertiary-container` | `#4d4800` `hsl(56 100% 15%)` | `#f4e700` `hsl(57 100% 48%)` |
| `error` | `#be0034` `hsl(344 100% 37%)` | `#ffb3b5` `hsl(358 100% 85%)` |
| `on-error` | `#ffffff` `hsl(0 0% 100%)` | `#680018` `hsl(346 100% 20%)` |
| `error-container` | `#ffdada` `hsl(0 100% 93%)` | `#920025` `hsl(345 100% 29%)` |
| `on-error-container` | `#920025` `hsl(345 100% 29%)` | `#ffdada` `hsl(0 100% 93%)` |
| `background` | `#fdf8ff` `hsl(283 100% 99%)` | `#07060d` `hsl(249 37% 4%)` |
| `on-background` | `#1d1736` `hsl(252 40% 15%)` | `#e9e6ff` `hsl(247 100% 95%)` |
| `surface` | `#fdf8ff` `hsl(283 100% 99%)` | `#0b0a14` `hsl(246 33% 6%)` |
| `on-surface` | `#1d1736` `hsl(252 40% 15%)` | `#e9e6ff` `hsl(247 100% 95%)` |
| `surface-variant` | `#e7deff` `hsl(256 100% 94%)` | `#493e76` `hsl(252 31% 35%)` |
| `on-surface-variant` | `#493e76` `hsl(252 31% 35%)` | `#cbbeff` `hsl(252 100% 87%)` |
| `surface-dim` | `#ded4fe` `hsl(254 95% 91%)` | `#140e2d` `hsl(252 53% 12%)` |
| `surface-bright` | `#fdf8ff` `hsl(283 100% 99%)` | `#3b3556` `hsl(251 24% 27%)` |
| `surface-container-lowest` | `#ffffff` `hsl(0 0% 100%)` | `#0f0928` `hsl(252 63% 10%)` |
| `surface-container-low` | `#f7f1ff` `hsl(266 100% 97%)` | `#1d1736` `hsl(252 40% 15%)` |
| `surface-container` | `#f2ebff` `hsl(261 100% 96%)` | `#211b3a` `hsl(252 36% 17%)` |
| `surface-container-high` | `#ece4ff` `hsl(258 100% 95%)` | `#2b2545` `hsl(251 30% 21%)` |
| `surface-container-highest` | `#e6deff` `hsl(255 100% 94%)` | `#363051` `hsl(251 26% 25%)` |
| `surface-tint` | `#af0092` `hsl(310 100% 34%)` | `#ffade2` `hsl(321 100% 84%)` |
| `outline` | `#7b6faa` `hsl(252 26% 55%)` | `#9588c6` `hsl(253 35% 65%)` |
| `outline-variant` | `#cbbeff` `hsl(252 100% 87%)` | `#493e76` `hsl(252 31% 35%)` |
| `shadow` | `#000000` `hsl(0 0% 0%)` | `#000000` `hsl(0 0% 0%)` |
| `scrim` | `#000000` `hsl(0 0% 0%)` | `#000000` `hsl(0 0% 0%)` |
| `inverse-surface` | `#322c4c` `hsl(251 27% 24%)` | `#e6deff` `hsl(255 100% 94%)` |
| `inverse-on-surface` | `#f4eeff` `hsl(261 100% 97%)` | `#322c4c` `hsl(251 27% 24%)` |
| `inverse-primary` | `#ffade2` `hsl(321 100% 84%)` | `#af0092` `hsl(310 100% 34%)` |
| `primary-fixed` | `#ffd8ee` `hsl(326 100% 92%)` | `#ffd8ee` `hsl(326 100% 92%)` |
| `on-primary-fixed` | `#3b002f` `hsl(312 100% 12%)` | `#3b002f` `hsl(312 100% 12%)` |
| `primary-fixed-dim` | `#ffade2` `hsl(321 100% 84%)` | `#ffade2` `hsl(321 100% 84%)` |
| `on-primary-fixed-variant` | `#86006f` `hsl(310 100% 26%)` | `#86006f` `hsl(310 100% 26%)` |
| `secondary-fixed` | `#9cf0ff` `hsl(189 100% 81%)` | `#9cf0ff` `hsl(189 100% 81%)` |
| `on-secondary-fixed` | `#001f24` `hsl(188 100% 7%)` | `#001f24` `hsl(188 100% 7%)` |
| `secondary-fixed-dim` | `#00daf3` `hsl(186 100% 48%)` | `#00daf3` `hsl(186 100% 48%)` |
| `on-secondary-fixed-variant` | `#004f58` `hsl(186 100% 17%)` | `#004f58` `hsl(186 100% 17%)` |
| `tertiary-fixed` | `#f4e700` `hsl(57 100% 48%)` | `#f4e700` `hsl(57 100% 48%)` |
| `on-tertiary-fixed` | `#1f1c00` `hsl(54 100% 6%)` | `#1f1c00` `hsl(54 100% 6%)` |
| `tertiary-fixed-dim` | `#d6ca00` `hsl(57 100% 42%)` | `#d6ca00` `hsl(57 100% 42%)` |
| `on-tertiary-fixed-variant` | `#4d4800` `hsl(56 100% 15%)` | `#4d4800` `hsl(56 100% 15%)` |
