---
version: alpha
name: MD3 kit
description: The kit's default theme — Material Design 3 in a neutral slate, a quiet blue-grey primary with a grey secondary and a warm grey tertiary, set in Inter.
scheme: light
colors:
  seed: "#64748b"
  primary-key: "#64748b"
  secondary-key: "#6b7280"
  tertiary-key: "#78716c"
typography:
  display-large:
    fontFamily: Inter
  display-medium:
    fontFamily: Inter
  display-small:
    fontFamily: Inter
  headline-large:
    fontFamily: Inter
  headline-medium:
    fontFamily: Inter
  headline-small:
    fontFamily: Inter
  title-large:
    fontFamily: Inter
  title-medium:
    fontFamily: Inter
  title-small:
    fontFamily: Inter
  body-large:
    fontFamily: Inter
  body-medium:
    fontFamily: Inter
  body-small:
    fontFamily: Inter
  label-large:
    fontFamily: Inter
  label-medium:
    fontFamily: Inter
  label-small:
    fontFamily: Inter
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
