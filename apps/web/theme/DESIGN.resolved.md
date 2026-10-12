---
# Generated from the project's DESIGN.md by the MD3 kit (tokens/generate-theme.mjs).
# Never edit this file: edit the project's DESIGN.md and regenerate.
version: alpha
name: Nemia, Cyberpunk Blend
description: Nemia's board between two cyberpunks — a green-black night with acid yellow for what a person does and neon green for what runs, and on it the printed labels of a retro spec sheet in amber, terracotta and grey with black ink.
scheme: dark
colors:
  seed: "#1f7a36"
  primary-key: "#f5e61a"
  secondary-key: "#2bff4f"
  tertiary-key: "#e0a15e"
  neutral-key: "#25332a"
  neutral-variant-key: "#2e4335"
  error-key: "#e0584b"
  primary: "#f5e61a"
  on-primary: "#141300"
  primary-container: "#4d4800"
  on-primary-container: "#f5e61b"
  secondary: "#39ff5a"
  on-secondary: "#00210a"
  secondary-container: "#005310"
  on-secondary-container: "#71ff73"
  tertiary: "#e0a15e"
  on-tertiary: "#1c1105"
  tertiary-container: "#683c00"
  on-tertiary-container: "#ffdcbd"
  error: "#e8695b"
  on-error: "#210503"
  error-container: "#8b1a15"
  on-error-container: "#ffdad5"
  background: "#050b07"
  on-background: "#e6efe2"
  surface: "#08110b"
  on-surface: "#e6efe2"
  surface-variant: "#364c3d"
  on-surface-variant: "#b4ccba"
  surface-dim: "#09160e"
  surface-bright: "#2e3c33"
  surface-container-lowest: "#041109"
  surface-container-low: "#111e16"
  surface-container: "#15231a"
  surface-container-high: "#1f2d24"
  surface-container-highest: "#2a382f"
  surface-tint: "#d7ca00"
  outline: "#7f9685"
  outline-variant: "#364c3d"
  shadow: "#000000"
  scrim: "#000000"
  inverse-surface: "#a9aca6"
  inverse-on-surface: "#0c0f0c"
  inverse-primary: "#3a3600"
  primary-fixed: "#f5e61b"
  on-primary-fixed: "#1f1c00"
  primary-fixed-dim: "#d7ca00"
  on-primary-fixed-variant: "#4d4800"
  secondary-fixed: "#71ff73"
  on-secondary-fixed: "#002203"
  secondary-fixed-dim: "#00e63f"
  on-secondary-fixed-variant: "#005310"
  tertiary-fixed: "#ffdcbd"
  on-tertiary-fixed: "#2c1600"
  tertiary-fixed-dim: "#fcb974"
  on-tertiary-fixed-variant: "#683c00"
typography:
  display-large:
    fontFamily: Michroma
    fontSize: 57px
    fontWeight: 400
    lineHeight: 64px
    letterSpacing: -0.25px
  display-medium:
    fontFamily: Michroma
    fontSize: 45px
    fontWeight: 400
    lineHeight: 52px
    letterSpacing: 0px
  display-small:
    fontFamily: Michroma
    fontSize: 36px
    fontWeight: 400
    lineHeight: 44px
    letterSpacing: 0px
  headline-large:
    fontFamily: Michroma
    fontSize: 32px
    fontWeight: 400
    lineHeight: 40px
    letterSpacing: 0px
  headline-medium:
    fontFamily: Michroma
    fontSize: 28px
    fontWeight: 400
    lineHeight: 36px
    letterSpacing: 0px
  headline-small:
    fontFamily: Michroma
    fontSize: 24px
    fontWeight: 400
    lineHeight: 32px
    letterSpacing: 0px
  title-large:
    fontFamily: Michroma
    fontSize: 22px
    fontWeight: 400
    lineHeight: 28px
    letterSpacing: 0px
  title-medium:
    fontFamily: Michroma
    fontSize: 16px
    fontWeight: 500
    lineHeight: 24px
    letterSpacing: 0.15px
  title-small:
    fontFamily: Michroma
    fontSize: 14px
    fontWeight: 500
    lineHeight: 20px
    letterSpacing: 0.1px
  body-large:
    fontFamily: Chakra Petch
    fontSize: 16px
    fontWeight: 400
    lineHeight: 24px
    letterSpacing: 0.5px
  body-medium:
    fontFamily: Chakra Petch
    fontSize: 14px
    fontWeight: 400
    lineHeight: 20px
    letterSpacing: 0.25px
  body-small:
    fontFamily: Chakra Petch
    fontSize: 12px
    fontWeight: 400
    lineHeight: 16px
    letterSpacing: 0.4px
  label-large:
    fontFamily: Chakra Petch
    fontSize: 14px
    fontWeight: 600
    lineHeight: 20px
    letterSpacing: 0.06em
  label-medium:
    fontFamily: Chakra Petch
    fontSize: 12px
    fontWeight: 600
    lineHeight: 16px
    letterSpacing: 0.06em
  label-small:
    fontFamily: Chakra Petch
    fontSize: 11px
    fontWeight: 600
    lineHeight: 16px
    letterSpacing: 0.1em
  mono:
    fontFamily: Share Tech Mono
rounded:
  extra-small: 0
  small: 0
  medium: 0
  large: 0
  extra-large: 0
  full: 0
---

## Overview

Two cyberpunks, blended. From the night-city one: a ground that is nearly
black with a green cast, frames with a cut corner and a hairline, acid yellow
on whatever a person can press, neon green on whatever is alive. From the
retro one: the printed label. An instrument is a flat matte tile, amber,
terracotta or grey, with black ink, a wide machine lettering and a boxed
readout, as stuck on the equipment by whoever built it.

The rule that holds the blend together: hardware is cut, labels are stuck on.
A frame, a button and a tag have hard corners or a cut one. A tile that
carries a number is a sticker, and only a sticker is rounded.

The dark scheme is the one written here. The light scheme is derived from the
same keys and is checked by eye, not designed.

## Colors

A colour says one thing, on every page.

- **Seed (`seed`):** a deep green. The neutrals lean towards it, so every
  surface and outline carries the cast.
- **Primary (`primary-key`, `primary`):** acid yellow, `#f5e61a`, with black
  on it. It is yours: a gate that waits on a person, and the one filled
  button.
- **Secondary (`secondary-key`, `secondary`):** neon green, `#39ff5a`, for
  what is alive: a session at work, a selected filter.
- **Tertiary (`tertiary-key`, `tertiary`):** the amber of a printed label,
  `#e0a15e`, with black ink on it. It is money: what a run cost.
- **Inverse (`inverse-surface`, `inverse-on-surface`):** the label's grey,
  with black ink, for what is at rest: a count, a clock, a finished run.
- **Outline (`outline`):** a sage grey. Filled, it is a step that is done, a
  check that runs, a wait on another run.
- **Error (`error-key`, `error`):** the label's terracotta, kept for what
  failed. A board where nothing failed does not show it.
- **Surfaces (`background`, `surface`):** written, because the derived dark
  surface is a grey and the board wants a green-black.

## Typography

Michroma for the brand face (display, headline, title): wide, thin, square
lettering, the face of a head-up display, set in capitals on the hardware.
Chakra Petch for the plain face (body, label): squared, with cut terminals,
readable small and at home in capitals.

The kit carries three faces and this look wants four. The third is the mono
face: identifiers, commands and readouts in Share Tech Mono, wherever the
board writes mono text. The board sets the fourth beside the kit: a printed
label's numerals in Archivo at its widest and heavy (width 125, weight 800),
black ink on the label's stock. The three label roles are the look's small
caps, as printed on a label: heavier than Material's (weight 600), tracked
wide, and set in capitals where they are written. Each role is tracked for
what it mostly draws: the large and the medium, a button's word and a
tag's, by six hundredths of an em; the small, a rail's name, a table's
heading and a tile's label, by a tenth. Every other size, weight and
tracking of the kit's roles is Material's.

## Shape

Every corner of the kit is square: all six radii are 0. A cut corner and a
rounded sticker are not radii; the board draws them around the kit's
components.

## Elevation and motion

No shadow. A raised surface is a hairline in yellow, then in green as it
rises. Motion is short and decisive.

## Reference CSS

```css
:root {
  --md3-dark-mode: system;
  --md-sys-elevation-1: 0 0 0 1px --alpha(var(--md-sys-color-outline-variant) / 100%);
  --md-sys-elevation-2: 0 0 0 1px --alpha(var(--md-sys-color-primary) / 45%);
  --md-sys-elevation-3: 0 0 0 1px --alpha(var(--md-sys-color-primary) / 70%);
  --md-sys-elevation-4: 0 0 0 1px --alpha(var(--md-sys-color-secondary) / 60%);
  --md-sys-elevation-5: 0 0 0 1px --alpha(var(--md-sys-color-secondary) / 85%);
  --md-sys-state-hover-state-layer-opacity: 10%;
  --md-sys-state-focus-state-layer-opacity: 14%;
  --md-sys-state-pressed-state-layer-opacity: 18%;
  --md-sys-state-dragged-state-layer-opacity: 22%;
  --md-sys-motion-easing-standard: cubic-bezier(0.2, 0, 0, 1);
  --md-sys-motion-easing-standard-accelerate: cubic-bezier(0.3, 0, 1, 1);
  --md-sys-motion-easing-standard-decelerate: cubic-bezier(0, 0, 0, 1);
  --md-sys-motion-easing-emphasized: cubic-bezier(0.2, 0, 0, 1);
  --md-sys-motion-easing-emphasized-accelerate: cubic-bezier(0.3, 0, 0.8, 0.15);
  --md-sys-motion-easing-emphasized-decelerate: cubic-bezier(0.05, 0.7, 0.1, 1);
  --md3-duration-short-1: 50ms;
  --md3-duration-short-2: 100ms;
  --md3-duration-short-3: 150ms;
  --md3-duration-short-4: 110ms;
  --md3-duration-medium-1: 250ms;
  --md3-duration-medium-2: 180ms;
  --md3-duration-medium-3: 350ms;
  --md3-duration-medium-4: 400ms;
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
| `primary` | `#676000` `hsl(56 100% 20%)` | `#f5e61a` `hsl(56 92% 53%)` |
| `on-primary` | `#ffffff` `hsl(0 0% 100%)` | `#141300` `hsl(57 100% 4%)` |
| `primary-container` | `#f5e61b` `hsl(56 92% 53%)` | `#4d4800` `hsl(56 100% 15%)` |
| `on-primary-container` | `#4d4800` `hsl(56 100% 15%)` | `#f5e61b` `hsl(56 92% 53%)` |
| `secondary` | `#006e19` `hsl(134 100% 22%)` | `#39ff5a` `hsl(130 100% 61%)` |
| `on-secondary` | `#ffffff` `hsl(0 0% 100%)` | `#00210a` `hsl(138 100% 6%)` |
| `secondary-container` | `#71ff73` `hsl(121 100% 72%)` | `#005310` `hsl(132 100% 16%)` |
| `on-secondary-container` | `#005310` `hsl(132 100% 16%)` | `#71ff73` `hsl(121 100% 72%)` |
| `tertiary` | `#855317` `hsl(33 71% 31%)` | `#e0a15e` `hsl(31 68% 62%)` |
| `on-tertiary` | `#ffffff` `hsl(0 0% 100%)` | `#1c1105` `hsl(31 70% 6%)` |
| `tertiary-container` | `#ffdcbd` `hsl(28 100% 87%)` | `#683c00` `hsl(35 100% 20%)` |
| `on-tertiary-container` | `#683c00` `hsl(35 100% 20%)` | `#ffdcbd` `hsl(28 100% 87%)` |
| `error` | `#ac3229` `hsl(4 62% 42%)` | `#e8695b` `hsl(6 75% 63%)` |
| `on-error` | `#ffffff` `hsl(0 0% 100%)` | `#210503` `hsl(4 83% 7%)` |
| `error-container` | `#ffdad5` `hsl(7 100% 92%)` | `#8b1a15` `hsl(3 74% 31%)` |
| `on-error-container` | `#8b1a15` `hsl(3 74% 31%)` | `#ffdad5` `hsl(7 100% 92%)` |
| `background` | `#edfef0` `hsl(131 89% 96%)` | `#050b07` `hsl(140 38% 3%)` |
| `on-background` | `#111e16` `hsl(143 28% 9%)` | `#e6efe2` `hsl(102 29% 91%)` |
| `surface` | `#edfef0` `hsl(131 89% 96%)` | `#08110b` `hsl(140 36% 5%)` |
| `on-surface` | `#111e16` `hsl(143 28% 9%)` | `#e6efe2` `hsl(102 29% 91%)` |
| `surface-variant` | `#d0e9d5` `hsl(132 36% 86%)` | `#364c3d` `hsl(139 17% 25%)` |
| `on-surface-variant` | `#364c3d` `hsl(139 17% 25%)` | `#b4ccba` `hsl(135 19% 75%)` |
| `surface-dim` | `#ceded1` `hsl(131 20% 84%)` | `#09160e` `hsl(143 42% 6%)` |
| `surface-bright` | `#edfef0` `hsl(131 89% 96%)` | `#2e3c33` `hsl(141 13% 21%)` |
| `surface-container-lowest` | `#ffffff` `hsl(0 0% 100%)` | `#041109` `hsl(143 62% 4%)` |
| `surface-container-low` | `#e7f8ea` `hsl(131 55% 94%)` | `#111e16` `hsl(143 28% 9%)` |
| `surface-container` | `#e2f2e4` `hsl(128 38% 92%)` | `#15231a` `hsl(141 25% 11%)` |
| `surface-container-high` | `#dcecdf` `hsl(131 30% 89%)` | `#1f2d24` `hsl(141 18% 15%)` |
| `surface-container-highest` | `#d6e7d9` `hsl(131 26% 87%)` | `#2a382f` `hsl(141 14% 19%)` |
| `surface-tint` | `#676000` `hsl(56 100% 20%)` | `#d7ca00` `hsl(56 100% 42%)` |
| `outline` | `#667c6c` `hsl(136 10% 44%)` | `#7f9685` `hsl(136 10% 54%)` |
| `outline-variant` | `#b4ccba` `hsl(135 19% 75%)` | `#364c3d` `hsl(139 17% 25%)` |
| `shadow` | `#000000` `hsl(0 0% 0%)` | `#000000` `hsl(0 0% 0%)` |
| `scrim` | `#000000` `hsl(0 0% 0%)` | `#000000` `hsl(0 0% 0%)` |
| `inverse-surface` | `#26342b` `hsl(141 16% 18%)` | `#a9aca6` `hsl(90 3% 66%)` |
| `inverse-on-surface` | `#e4f5e7` `hsl(131 46% 93%)` | `#0c0f0c` `hsl(120 11% 5%)` |
| `inverse-primary` | `#d7ca00` `hsl(56 100% 42%)` | `#3a3600` `hsl(56 100% 11%)` |
| `primary-fixed` | `#f5e61b` `hsl(56 92% 53%)` | `#f5e61b` `hsl(56 92% 53%)` |
| `on-primary-fixed` | `#1f1c00` `hsl(54 100% 6%)` | `#1f1c00` `hsl(54 100% 6%)` |
| `primary-fixed-dim` | `#d7ca00` `hsl(56 100% 42%)` | `#d7ca00` `hsl(56 100% 42%)` |
| `on-primary-fixed-variant` | `#4d4800` `hsl(56 100% 15%)` | `#4d4800` `hsl(56 100% 15%)` |
| `secondary-fixed` | `#71ff73` `hsl(121 100% 72%)` | `#71ff73` `hsl(121 100% 72%)` |
| `on-secondary-fixed` | `#002203` `hsl(125 100% 7%)` | `#002203` `hsl(125 100% 7%)` |
| `secondary-fixed-dim` | `#00e63f` `hsl(136 100% 45%)` | `#00e63f` `hsl(136 100% 45%)` |
| `on-secondary-fixed-variant` | `#005310` `hsl(132 100% 16%)` | `#005310` `hsl(132 100% 16%)` |
| `tertiary-fixed` | `#ffdcbd` `hsl(28 100% 87%)` | `#ffdcbd` `hsl(28 100% 87%)` |
| `on-tertiary-fixed` | `#2c1600` `hsl(30 100% 9%)` | `#2c1600` `hsl(30 100% 9%)` |
| `tertiary-fixed-dim` | `#fcb974` `hsl(30 96% 72%)` | `#fcb974` `hsl(30 96% 72%)` |
| `on-tertiary-fixed-variant` | `#683c00` `hsl(35 100% 20%)` | `#683c00` `hsl(35 100% 20%)` |
