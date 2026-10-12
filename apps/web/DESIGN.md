---
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
  secondary: "#39ff5a"
  on-secondary: "#00210a"
  tertiary: "#e0a15e"
  on-tertiary: "#1c1105"
  error: "#e8695b"
  on-error: "#210503"
  background: "#050b07"
  on-background: "#e6efe2"
  surface: "#08110b"
  on-surface: "#e6efe2"
  inverse-surface: "#a9aca6"
  inverse-on-surface: "#0c0f0c"
  inverse-primary: "#3a3600"
typography:
  display-large:
    fontFamily: Michroma
  display-medium:
    fontFamily: Michroma
  display-small:
    fontFamily: Michroma
  headline-large:
    fontFamily: Michroma
  headline-medium:
    fontFamily: Michroma
  headline-small:
    fontFamily: Michroma
  title-large:
    fontFamily: Michroma
  title-medium:
    fontFamily: Michroma
  title-small:
    fontFamily: Michroma
  body-large:
    fontFamily: Chakra Petch
  body-medium:
    fontFamily: Chakra Petch
  body-small:
    fontFamily: Chakra Petch
  label-large:
    fontFamily: Chakra Petch
    fontWeight: 600
    letterSpacing: 0.06em
  label-medium:
    fontFamily: Chakra Petch
    fontWeight: 600
    letterSpacing: 0.06em
  label-small:
    fontFamily: Chakra Petch
    fontWeight: 600
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

## Scroll bars

A scroll bar is the look's wherever something scrolls: the page, the
sidebar, a panel, a table, a block of code. It is an 8-pixel square lane
with no arrows, and the ground shows through it. At rest no thumb is seen.
While the thing scrolls its thumb is drawn 4 pixels wide in `outline`, and
fades once it stops. Under the pointer the thumb takes the lane's whole
width in `on-surface-variant`, and `on-surface` while it is held. The inks
are neutral roles: a scroll bar says none of the five meanings.

The lane keeps its room wherever something overflows, so nothing moves when
a thumb comes or goes; beside the page it shows the plain ground, not the
scan lines. A table in a cut frame scrolls sideways alone, its thumb
starting past the frame's cut.

The rule is the board's (`src/styles.css`), not the theme's: the kit's
generator gives a scroll bar no token. What stays the system's: the list a
native select opens, drawn in the page's scheme, and the bar of a browser
that knows neither the parts nor `scrollbar-color`.

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
  --md3-duration-short-4: 110ms;
  --md3-duration-medium-2: 180ms;
}
```
