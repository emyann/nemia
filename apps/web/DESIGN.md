---
version: alpha
name: Nemia, Graphite and Yellow
description: Nemia's board between two cyberpunks — a graphite night, nearly black and neutral, with acid yellow for what waits on a person and a pale ice for what is alive, and on it the printed labels of a retro spec sheet in amber, red and grey with black ink, every card and label under a fine grain.
scheme: dark
colors:
  seed: "#f5e61a"
  primary-key: "#f5e61a"
  secondary-key: "#5fa8b8"
  tertiary-key: "#e0a15e"
  neutral-key: "#2a2b2c"
  neutral-variant-key: "#34363a"
  error-key: "#e5484d"
  primary: "#f5e61a"
  on-primary: "#141300"
  secondary: "#eaf6f8"
  on-secondary: "#0c1416"
  tertiary: "#e0a15e"
  on-tertiary: "#1c1105"
  error: "#ff7676"
  on-error: "#2a0506"
  background: "#0a0a0b"
  on-background: "#e4e5e2"
  surface: "#0e0f10"
  on-surface: "#e4e5e2"
  inverse-surface: "#a9aaa8"
  inverse-on-surface: "#0d0d0d"
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
    letterSpacing: 0px
  title-small:
    fontFamily: Michroma
    letterSpacing: 0px
  body-large:
    fontFamily: Chakra Petch
    letterSpacing: 0px
  body-medium:
    fontFamily: Chakra Petch
    letterSpacing: 0px
  body-small:
    fontFamily: Chakra Petch
    letterSpacing: 0px
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
black, a graphite with no cast, frames with a cut corner and a hairline, acid
yellow on whatever a person can press, a pale ice on whatever is alive. From
the retro one: the printed label. An instrument is a flat matte tile, amber,
red or grey, with black ink, a wide machine lettering and a boxed readout, as
stuck on the equipment by whoever built it. Cards and labels carry a fine
grain, as a surface that was printed.

The rule that holds the blend together: hardware is cut, labels are stuck on.
A frame, a button and a tag have hard corners or a cut one. A tile that
carries a number is a sticker, and only a sticker is rounded.

The dark scheme is the one written here. The light scheme is derived from the
same keys and is checked by eye, not designed.

## Colors

A colour says one thing, on every page.

- **Seed (`seed`):** the acid yellow. The neutrals have keys of their own
  (`neutral-key`, `neutral-variant-key`), two graphite greys, so no surface
  and no outline carries a cast.
- **Primary (`primary-key`, `primary`):** acid yellow, `#f5e61a`, with black
  on it. It is yours: a gate that waits on a person, and the one filled
  button.
- **Secondary (`secondary-key`, `secondary`):** a near white that carries an
  ice hue, `#eaf6f8`, for what is alive: a session at work, a selected
  filter. Its key is a teal, `#5fa8b8`, so the light scheme, derived, says
  alive in teal, and a filled tag at work is a dark teal.
- **Tertiary (`tertiary-key`, `tertiary`):** the amber of a printed label,
  `#e0a15e`, with black ink on it. It is money: what a run cost.
- **Inverse (`inverse-surface`, `inverse-on-surface`):** the label's grey,
  with black ink, for what is at rest: a count, a clock, a finished run.
- **Outline (`outline`):** a cool grey. Filled, it is a step that is done, a
  check that runs, a wait on another run.
- **Error (`error-key`, `error`):** a red, `#ff7676`, kept for what failed,
  readable on every surface tier. A board where nothing failed does not show
  it.
- **Surfaces (`background`, `surface`):** written, because the board wants a
  graphite that is nearly black, darker than the derived dark surface.

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
heading and a tile's label, by a tenth. Five roles are not tracked at all:
the three body roles, and the medium and small titles, which the board
draws in the plain face and in mixed case. Chakra Petch joins `fl`, `fi`
and `tt`, and any tracking parts them ("Workf lows"), so running text is
set as the face was drawn. Mono text takes a body role and so is untracked
too. Every other size, weight and tracking of the kit's roles is
Material's.

## Shape

Every corner of the kit is square: all six radii are 0. A cut corner and a
rounded sticker are not radii; the board draws them around the kit's
components.

## Elevation and motion

No shadow. A raised surface is a hairline in yellow, then in pale ice as it
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

## Grain

The look's surfaces carry a grain: the ground of a cut frame (a card, a
framed table) and the labels (a sticker, a stat tile, a plate). The page's
ground keeps its scan lines and takes none; a tag and a button take none.

No image carries it. A grain is a tile of noise the browser draws, 220
pixels wide and repeated, in one colour whose specks come and go. On a card
or a framed table the specks are light in the dark scheme and ink in the
light one, at the same weight. On a label they are ink in both schemes,
heavier, as a label printed on rough stock. The grain follows the cut:
nothing of it shows in a cut corner, and the ring and the glow that follow
the cut stay over it.

The rule is the board's (`src/components/look/grain.css`), not the theme's:
the kit's generator gives a grain no token. A part of the look wears one by
naming it (`data-grain`). Text on a grain is measured against its far end,
the speck at its strongest 2%.

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
