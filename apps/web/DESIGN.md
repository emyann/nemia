---
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
  secondary: "#00e5ff"
  on-secondary: "#001f24"
  tertiary: "#fcee0a"
  on-tertiary: "#1f1d00"
  background: "#07060d"
  on-background: "#e9e6ff"
  surface: "#0b0a14"
  on-surface: "#e9e6ff"
typography:
  display-large:
    fontFamily: Orbitron Variable
  display-medium:
    fontFamily: Orbitron Variable
  display-small:
    fontFamily: Orbitron Variable
  headline-large:
    fontFamily: Orbitron Variable
  headline-medium:
    fontFamily: Orbitron Variable
  headline-small:
    fontFamily: Orbitron Variable
  title-large:
    fontFamily: Orbitron Variable
  title-medium:
    fontFamily: Orbitron Variable
  title-small:
    fontFamily: Orbitron Variable
  body-large:
    fontFamily: Geist Variable
  body-medium:
    fontFamily: Geist Variable
  body-small:
    fontFamily: Geist Variable
  label-large:
    fontFamily: Geist Variable
  label-medium:
    fontFamily: Geist Variable
  label-small:
    fontFamily: Geist Variable
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
  --md-sys-motion-easing-emphasized: cubic-bezier(0.05, 0.7, 0.1, 1);
  --md3-duration-short-1: 40ms;
  --md3-duration-short-2: 70ms;
  --md3-duration-short-3: 100ms;
  --md3-duration-short-4: 130ms;
  --md3-duration-medium-1: 160ms;
  --md3-duration-medium-2: 200ms;
  --md3-duration-medium-3: 240ms;
  --md3-duration-medium-4: 280ms;
}
```
