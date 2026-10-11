---
# Generated from the project's DESIGN.md by the MD3 kit (tokens/generate-theme.mjs).
# Never edit this file: edit the project's DESIGN.md and regenerate.
version: alpha
name: MD3 kit
description: The kit's default theme — Material Design 3 in a neutral slate, a quiet blue-grey primary with a grey secondary and a warm grey tertiary, set in Inter.
scheme: light
colors:
  seed: "#64748b"
  primary-key: "#64748b"
  secondary-key: "#6b7280"
  tertiary-key: "#78716c"
  primary: "#505f76"
  on-primary: "#ffffff"
  primary-container: "#d3e4fe"
  on-primary-container: "#38485d"
  secondary: "#585f6c"
  on-secondary: "#ffffff"
  secondary-container: "#dce2f3"
  on-secondary-container: "#404754"
  tertiary: "#645d58"
  on-tertiary: "#ffffff"
  tertiary-container: "#eae1da"
  on-tertiary-container: "#4b4641"
  error: "#ba1a1a"
  on-error: "#ffffff"
  error-container: "#ffdad6"
  on-error-container: "#93000a"
  background: "#f8f9ff"
  on-background: "#191c20"
  surface: "#f8f9ff"
  on-surface: "#191c20"
  surface-variant: "#dfe2eb"
  on-surface-variant: "#43474e"
  surface-dim: "#d8dae0"
  surface-bright: "#f8f9ff"
  surface-container-lowest: "#ffffff"
  surface-container-low: "#f2f3fa"
  surface-container: "#ecedf4"
  surface-container-high: "#e7e8ee"
  surface-container-highest: "#e1e2e8"
  surface-tint: "#505f76"
  outline: "#73777f"
  outline-variant: "#c3c6cf"
  shadow: "#000000"
  scrim: "#000000"
  inverse-surface: "#2e3035"
  inverse-on-surface: "#eff0f7"
  inverse-primary: "#b7c8e1"
  primary-fixed: "#d3e4fe"
  on-primary-fixed: "#0b1c30"
  primary-fixed-dim: "#b7c8e1"
  on-primary-fixed-variant: "#38485d"
  secondary-fixed: "#dce2f3"
  on-secondary-fixed: "#151c27"
  secondary-fixed-dim: "#c0c7d6"
  on-secondary-fixed-variant: "#404754"
  tertiary-fixed: "#eae1da"
  on-tertiary-fixed: "#1f1b17"
  tertiary-fixed-dim: "#cec5bf"
  on-tertiary-fixed-variant: "#4b4641"
typography:
  display-large:
    fontFamily: Inter
    fontSize: 57px
    fontWeight: 400
    lineHeight: 64px
    letterSpacing: -0.25px
  display-medium:
    fontFamily: Inter
    fontSize: 45px
    fontWeight: 400
    lineHeight: 52px
    letterSpacing: 0px
  display-small:
    fontFamily: Inter
    fontSize: 36px
    fontWeight: 400
    lineHeight: 44px
    letterSpacing: 0px
  headline-large:
    fontFamily: Inter
    fontSize: 32px
    fontWeight: 400
    lineHeight: 40px
    letterSpacing: 0px
  headline-medium:
    fontFamily: Inter
    fontSize: 28px
    fontWeight: 400
    lineHeight: 36px
    letterSpacing: 0px
  headline-small:
    fontFamily: Inter
    fontSize: 24px
    fontWeight: 400
    lineHeight: 32px
    letterSpacing: 0px
  title-large:
    fontFamily: Inter
    fontSize: 22px
    fontWeight: 400
    lineHeight: 28px
    letterSpacing: 0px
  title-medium:
    fontFamily: Inter
    fontSize: 16px
    fontWeight: 500
    lineHeight: 24px
    letterSpacing: 0.15px
  title-small:
    fontFamily: Inter
    fontSize: 14px
    fontWeight: 500
    lineHeight: 20px
    letterSpacing: 0.1px
  body-large:
    fontFamily: Inter
    fontSize: 16px
    fontWeight: 400
    lineHeight: 24px
    letterSpacing: 0.5px
  body-medium:
    fontFamily: Inter
    fontSize: 14px
    fontWeight: 400
    lineHeight: 20px
    letterSpacing: 0.25px
  body-small:
    fontFamily: Inter
    fontSize: 12px
    fontWeight: 400
    lineHeight: 16px
    letterSpacing: 0.4px
  label-large:
    fontFamily: Inter
    fontSize: 14px
    fontWeight: 500
    lineHeight: 20px
    letterSpacing: 0.1px
  label-medium:
    fontFamily: Inter
    fontSize: 12px
    fontWeight: 500
    lineHeight: 16px
    letterSpacing: 0.5px
  label-small:
    fontFamily: Inter
    fontSize: 11px
    fontWeight: 500
    lineHeight: 16px
    letterSpacing: 0.5px
rounded:
  extra-small: 4px
  small: 8px
  medium: 12px
  large: 16px
  extra-large: 28px
  full: 9999px
---

## Overview

This is the kit's own DESIGN.md: the source of the theme the kit ships, the
one a project gets before it writes a file of its own. It is neutral on
purpose, so that the components can be judged without a brand on them. Run
`npm run theme:generate` after editing it; the kit writes `tokens/theme.css`,
`tokens/theme.v4.css` and the complete result, `tokens/DESIGN.resolved.md`.
Edit this file, never those.

A project does not edit this file. It copies it to its root when it has no
DESIGN.md of its own, writes its look there and generates its own theme with
`--out` (the `ds-theme` skill, which the install brings).

## Colors

Neutral here means a quiet hue, not the absence of one: a slate, grey with a
little blue in it, derived with Material's tonal-spot scheme in light and
dark.

- **Seed (`seed`):** slate. It gives the neutral surfaces and the outlines
  their faint blue cast.
- **Primary key (`primary-key`):** the same slate. Without it the primary
  palette would take the seed's hue at Material's full chroma and read as a
  plain blue.
- **Secondary key (`secondary-key`):** a cooler grey, for the secondary roles
  and the focus ring.
- **Tertiary key (`tertiary-key`):** a warm stone grey, for the tertiary
  accents.

No role is written by hand: every one of them is derived from the keys, in
both schemes.

## Typography

One family, Inter, on Material's 15-role scale at Material's own sizes,
weights and tracking. The file writes only the family; a DESIGN.md that
writes no type at all gets Roboto from the generator.

## Reference CSS

Generated by the MD3 kit: this file writes no reference block, so these are
the kit's own elevation, state layer opacities, easings and durations.

```css
:root {
  --md3-dark-mode: class;
  --md-sys-elevation-1:
    0 1px 2px 0 --alpha(var(--md-sys-color-shadow) / 30%),
    0 1px 3px 1px --alpha(var(--md-sys-color-shadow) / 15%);
  --md-sys-elevation-2:
    0 1px 2px 0 --alpha(var(--md-sys-color-shadow) / 30%),
    0 2px 6px 2px --alpha(var(--md-sys-color-shadow) / 15%);
  --md-sys-elevation-3:
    0 1px 3px 0 --alpha(var(--md-sys-color-shadow) / 30%),
    0 4px 8px 3px --alpha(var(--md-sys-color-shadow) / 15%);
  --md-sys-elevation-4:
    0 2px 3px 0 --alpha(var(--md-sys-color-shadow) / 30%),
    0 6px 10px 4px --alpha(var(--md-sys-color-shadow) / 15%);
  --md-sys-elevation-5:
    0 4px 4px 0 --alpha(var(--md-sys-color-shadow) / 30%),
    0 8px 12px 6px --alpha(var(--md-sys-color-shadow) / 15%);
  --md-sys-state-hover-state-layer-opacity: 8%;
  --md-sys-state-focus-state-layer-opacity: 10%;
  --md-sys-state-pressed-state-layer-opacity: 10%;
  --md-sys-state-dragged-state-layer-opacity: 16%;
  --md-sys-motion-easing-standard: cubic-bezier(0.2, 0, 0, 1);
  --md-sys-motion-easing-standard-accelerate: cubic-bezier(0.3, 0, 1, 1);
  --md-sys-motion-easing-standard-decelerate: cubic-bezier(0, 0, 0, 1);
  --md-sys-motion-easing-emphasized: cubic-bezier(0.2, 0, 0, 1);
  --md-sys-motion-easing-emphasized-accelerate: cubic-bezier(0.3, 0, 0.8, 0.15);
  --md-sys-motion-easing-emphasized-decelerate: cubic-bezier(0.05, 0.7, 0.1, 1);
  --md3-duration-short-1: 50ms;
  --md3-duration-short-2: 100ms;
  --md3-duration-short-3: 150ms;
  --md3-duration-short-4: 200ms;
  --md3-duration-medium-1: 250ms;
  --md3-duration-medium-2: 300ms;
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
light scheme; the dark scheme is derived from the key colours. Both are
below, each role as the hex the kit derived and the `hsl()` string the
theme's `--md-sys-color-<role>` variable carries. Dark applies under a
`.dark` class.

| Role | Light | Dark |
| :--- | :--- | :--- |
| `primary` | `#505f76` `hsl(216 19% 39%)` | `#b7c8e1` `hsl(216 41% 80%)` |
| `on-primary` | `#ffffff` `hsl(0 0% 100%)` | `#213145` `hsl(213 35% 20%)` |
| `primary-container` | `#d3e4fe` `hsl(216 96% 91%)` | `#38485d` `hsl(214 25% 29%)` |
| `on-primary-container` | `#38485d` `hsl(214 25% 29%)` | `#d3e4fe` `hsl(216 96% 91%)` |
| `secondary` | `#585f6c` `hsl(219 10% 38%)` | `#c0c7d6` `hsl(221 21% 80%)` |
| `on-secondary` | `#ffffff` `hsl(0 0% 100%)` | `#2a313d` `hsl(218 18% 20%)` |
| `secondary-container` | `#dce2f3` `hsl(224 49% 91%)` | `#404754` `hsl(219 14% 29%)` |
| `on-secondary-container` | `#404754` `hsl(219 14% 29%)` | `#dce2f3` `hsl(224 49% 91%)` |
| `tertiary` | `#645d58` `hsl(25 6% 37%)` | `#cec5bf` `hsl(24 13% 78%)` |
| `on-tertiary` | `#ffffff` `hsl(0 0% 100%)` | `#342f2b` `hsl(27 9% 19%)` |
| `tertiary-container` | `#eae1da` `hsl(26 28% 89%)` | `#4b4641` `hsl(30 7% 27%)` |
| `on-tertiary-container` | `#4b4641` `hsl(30 7% 27%)` | `#eae1da` `hsl(26 28% 89%)` |
| `error` | `#ba1a1a` `hsl(0 75% 42%)` | `#ffb4ab` `hsl(6 100% 84%)` |
| `on-error` | `#ffffff` `hsl(0 0% 100%)` | `#690005` `hsl(357 100% 21%)` |
| `error-container` | `#ffdad6` `hsl(6 100% 92%)` | `#93000a` `hsl(356 100% 29%)` |
| `on-error-container` | `#93000a` `hsl(356 100% 29%)` | `#ffdad6` `hsl(6 100% 92%)` |
| `background` | `#f8f9ff` `hsl(231 100% 99%)` | `#111418` `hsl(214 17% 8%)` |
| `on-background` | `#191c20` `hsl(214 12% 11%)` | `#e1e2e8` `hsl(231 13% 90%)` |
| `surface` | `#f8f9ff` `hsl(231 100% 99%)` | `#111418` `hsl(214 17% 8%)` |
| `on-surface` | `#191c20` `hsl(214 12% 11%)` | `#e1e2e8` `hsl(231 13% 90%)` |
| `surface-variant` | `#dfe2eb` `hsl(225 23% 90%)` | `#43474e` `hsl(218 8% 28%)` |
| `on-surface-variant` | `#43474e` `hsl(218 8% 28%)` | `#c3c6cf` `hsl(225 11% 79%)` |
| `surface-dim` | `#d8dae0` `hsl(225 11% 86%)` | `#111418` `hsl(214 17% 8%)` |
| `surface-bright` | `#f8f9ff` `hsl(231 100% 99%)` | `#37393e` `hsl(223 6% 23%)` |
| `surface-container-lowest` | `#ffffff` `hsl(0 0% 100%)` | `#0b0e13` `hsl(218 27% 6%)` |
| `surface-container-low` | `#f2f3fa` `hsl(233 44% 96%)` | `#191c20` `hsl(214 12% 11%)` |
| `surface-container` | `#ecedf4` `hsl(233 27% 94%)` | `#1d2024` `hsl(214 11% 13%)` |
| `surface-container-high` | `#e7e8ee` `hsl(231 17% 92%)` | `#272a2f` `hsl(218 9% 17%)` |
| `surface-container-highest` | `#e1e2e8` `hsl(231 13% 90%)` | `#32353a` `hsl(218 7% 21%)` |
| `surface-tint` | `#505f76` `hsl(216 19% 39%)` | `#b7c8e1` `hsl(216 41% 80%)` |
| `outline` | `#73777f` `hsl(220 5% 47%)` | `#8d9199` `hsl(220 6% 58%)` |
| `outline-variant` | `#c3c6cf` `hsl(225 11% 79%)` | `#43474e` `hsl(218 8% 28%)` |
| `shadow` | `#000000` `hsl(0 0% 0%)` | `#000000` `hsl(0 0% 0%)` |
| `scrim` | `#000000` `hsl(0 0% 0%)` | `#000000` `hsl(0 0% 0%)` |
| `inverse-surface` | `#2e3035` `hsl(223 7% 19%)` | `#e1e2e8` `hsl(231 13% 90%)` |
| `inverse-on-surface` | `#eff0f7` `hsl(233 33% 95%)` | `#2e3035` `hsl(223 7% 19%)` |
| `inverse-primary` | `#b7c8e1` `hsl(216 41% 80%)` | `#505f76` `hsl(216 19% 39%)` |
| `primary-fixed` | `#d3e4fe` `hsl(216 96% 91%)` | `#d3e4fe` `hsl(216 96% 91%)` |
| `on-primary-fixed` | `#0b1c30` `hsl(212 63% 12%)` | `#0b1c30` `hsl(212 63% 12%)` |
| `primary-fixed-dim` | `#b7c8e1` `hsl(216 41% 80%)` | `#b7c8e1` `hsl(216 41% 80%)` |
| `on-primary-fixed-variant` | `#38485d` `hsl(214 25% 29%)` | `#38485d` `hsl(214 25% 29%)` |
| `secondary-fixed` | `#dce2f3` `hsl(224 49% 91%)` | `#dce2f3` `hsl(224 49% 91%)` |
| `on-secondary-fixed` | `#151c27` `hsl(217 30% 12%)` | `#151c27` `hsl(217 30% 12%)` |
| `secondary-fixed-dim` | `#c0c7d6` `hsl(221 21% 80%)` | `#c0c7d6` `hsl(221 21% 80%)` |
| `on-secondary-fixed-variant` | `#404754` `hsl(219 14% 29%)` | `#404754` `hsl(219 14% 29%)` |
| `tertiary-fixed` | `#eae1da` `hsl(26 28% 89%)` | `#eae1da` `hsl(26 28% 89%)` |
| `on-tertiary-fixed` | `#1f1b17` `hsl(30 15% 11%)` | `#1f1b17` `hsl(30 15% 11%)` |
| `tertiary-fixed-dim` | `#cec5bf` `hsl(24 13% 78%)` | `#cec5bf` `hsl(24 13% 78%)` |
| `on-tertiary-fixed-variant` | `#4b4641` `hsl(30 7% 27%)` | `#4b4641` `hsl(30 7% 27%)` |
