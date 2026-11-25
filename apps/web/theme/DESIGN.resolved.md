---
# Generated from the project's DESIGN.md by the MD3 kit (tokens/generate-theme.mjs).
# Never edit this file: edit the project's DESIGN.md and regenerate.
version: alpha
name: Nemia, Graphite and Yellow
description: Nemia's board between two cyberpunks — a graphite night, nearly black and nine tenths neutral, where acid yellow is your move (what waits on a person, and the one filled action of a view), selection and state are plain ink, and three more meanings carry the only other hues (violet for what is alive, red for what failed, grey for what is at rest), data such as a cost being plain ink until it becomes a state, and on it the printed labels of a retro spec sheet with black ink, every card and label under a fine grain.
scheme: dark
colors:
  seed: "#f5e61a"
  primary-key: "#f5e61a"
  secondary-key: "#85878b"
  tertiary-key: "#8a8b8f"
  neutral-key: "#2a2b2c"
  neutral-variant-key: "#34363a"
  error-key: "#e5484d"
  primary: "#f5e61a"
  on-primary: "#141300"
  primary-container: "#4d4800"
  on-primary-container: "#f5e61b"
  secondary: "#c6c7c9"
  on-secondary: "#0e0f10"
  secondary-container: "#2e3033"
  on-secondary-container: "#e4e5e2"
  tertiary: "#c6c7c9"
  on-tertiary: "#0e0f10"
  tertiary-container: "#2e3033"
  on-tertiary-container: "#e4e5e2"
  error: "#ff7676"
  on-error: "#2a0506"
  error-container: "#92011a"
  on-error-container: "#ffdad8"
  background: "#0a0a0b"
  on-background: "#e4e5e2"
  surface: "#0e0f10"
  on-surface: "#e4e5e2"
  surface-variant: "#45474b"
  on-surface-variant: "#c5c6cb"
  surface-dim: "#121314"
  surface-bright: "#38393a"
  surface-container-lowest: "#0d0e0f"
  surface-container-low: "#1b1c1d"
  surface-container: "#1f2021"
  surface-container-high: "#292a2b"
  surface-container-highest: "#343536"
  surface-tint: "#d7ca00"
  outline: "#8f9095"
  outline-variant: "#45474b"
  shadow: "#000000"
  scrim: "#000000"
  inverse-surface: "#a9aaa8"
  inverse-on-surface: "#0d0d0d"
  inverse-primary: "#3a3600"
  primary-fixed: "#f5e61b"
  on-primary-fixed: "#1f1c00"
  primary-fixed-dim: "#d7ca00"
  on-primary-fixed-variant: "#4d4800"
  secondary-fixed: "#e1e2e7"
  on-secondary-fixed: "#191c1f"
  secondary-fixed-dim: "#c5c6cb"
  on-secondary-fixed-variant: "#44474b"
  tertiary-fixed: "#e2e2e6"
  on-tertiary-fixed: "#1a1c1f"
  tertiary-fixed-dim: "#c6c6ca"
  on-tertiary-fixed-variant: "#45474a"
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
    fontFamily: Barlow
    fontSize: 16px
    fontWeight: 500
    lineHeight: 24px
    letterSpacing: 0px
  title-small:
    fontFamily: Barlow
    fontSize: 14px
    fontWeight: 500
    lineHeight: 20px
    letterSpacing: 0px
  body-large:
    fontFamily: Barlow
    fontSize: 16px
    fontWeight: 400
    lineHeight: 24px
    letterSpacing: 0px
  body-medium:
    fontFamily: Barlow
    fontSize: 15px
    fontWeight: 400
    lineHeight: 22px
    letterSpacing: 0px
  body-small:
    fontFamily: Barlow
    fontSize: 13px
    fontWeight: 400
    lineHeight: 18px
    letterSpacing: 0px
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
    fontFamily: JetBrains Mono
rounded:
  extra-small: 0
  small: 0
  medium: 0
  large: 0
  large-increased: 0
  extra-large: 0
  full: 0
---

## Overview

Two cyberpunks, blended. From the night-city one: a ground that is nearly
black, a graphite with no cast, frames with a cut corner and a hairline,
acid yellow on your move and on nothing else, a violet on whatever is
alive, and plain ink for everything a person only selects or reads. From the retro
one: the printed label. An instrument is a flat matte tile, grey,
or red or yellow when it says so, with black ink, a wide machine lettering and a boxed readout, as
stuck on the equipment by whoever built it. Cards and labels carry a fine
grain, as a surface that was printed.

The rule that holds the blend together: hardware is cut, labels are stuck on.
A frame, a button and a tag have hard corners or a cut one. A tile that
carries a number is a sticker, and only a sticker is rounded.

The dark scheme is the one written here. The light scheme is derived from the
same keys and is checked by eye, not designed.

## Where we differ from Material

Material's defaults, as the kit holds them (`src/components/ui/ds/tokens/design-md.mjs`:
`TYPE_DEFAULTS`, `CORNER_DEFAULTS`, the state layers and durations), are the
spec. Each departure below is named with its reason; what is not listed
follows the spec.

- **Corners:** all six radii are 0, where Material has 4 to 28 pixels and a
  pill. The hardware is square or cut, and a cut or a sticker is drawn
  around the kit.
- **Elevation:** a hairline where Material has a two-layer shadow. On a
  ground nearly black a shadow is not seen, and height says no meaning.
- **Secondary and tertiary** are written as neutral ink, not derived from
  accent keys. So selection, state and the kit's tonal parts are ink, and
  colour is kept for the four meanings.
- **Background and surface** are written darker than the derived ones, for
  a ground nearly black.
- **Read sizes:** `body-medium` 15/22 and `body-small` 13/18, where Material
  has 14/20 and 12/16. Barlow is read small, and nothing read is under 13.
- **Tracking:** the body roles, `title-medium` and `title-small` are
  untracked, where Material tracks them by 0.5, 0.25 and 0.4 pixels and by
  0.15 and 0.1 pixels. Running text is set as its face was drawn.
- **Labels:** weight 600, tracked 0.06em and 0.1em, in capitals, where
  Material has 500 and 0.1 or 0.5 pixels. They are the look's small caps.
- **State layers:** 10, 14, 18 and 22%, where Material has 8, 10, 10 and
  16%. On graphite, 8% is not seen.
- **Motion:** `short-4` 110 ms and `medium-2` 180 ms, where Material has 200
  and 300. Motion is short and decisive.
- **Faces:** Michroma, Barlow, Chakra Petch for labels and JetBrains Mono
  for mono, where Material has a brand face and a plain one.
- **What the board adds beside the kit,** none of it Material's: the four
  meanings, the cut corner, the sticker, the grain, the scan lines and the
  scroll bar.

## Colors

A colour says one thing, on every page. The board has three kinds of colour,
and a part takes its colour from exactly one of them.

1. **Neutrals** draw the page: its surfaces, its text, its lines. Nine
   tenths of any view, and often more.
2. **Ink** draws what a person selects, sets and reads the state of.
3. **The four meanings** are the only hues. A part is coloured only when it
   says one of them.

### Neutrals: the surface ladder

Two graphite keys (`neutral-key`, `neutral-variant-key`) give every surface
and outline, so none carries a cast. `background` and `surface` are written,
because the board wants a ground that is nearly black, darker than the
derived one.

A surface is chosen by what the part is, never by taste, and a part nested
in another takes the next rung, so two surfaces that touch are never the
same role. In the dark scheme each rung in is lighter. A view is two boxes
deep at most: a frame, and one inset or well inside it. Text never sits in
a box in a box in a box; what would be a third box is a rule or a gap.

| Rung | Role | What takes it |
| :--- | :--- | :--- |
| Ground | `background` | the page, under its scan lines |
| Well | `surface-container-lowest` | what is sunk into a frame: a block of code, a log, a transcript |
| Frame | `surface-container-low` | a cut frame: a card, a framed table, a pane |
| Inset | `surface-container` | a group inside a frame |
| Raised | `surface-container-high` | what floats over the page: a menu, a popover, a sheet, a hovered row |
| Control | `surface-container-highest` | the resting fill of a control: a quiet button, a field, a chip, a tag, a switch that is off |

`surface`, `surface-dim`, `surface-bright` and `surface-variant` are the
kit's: the board's own parts write none of them.

Lines are neutral too. `outline-variant` is a hairline: a frame's edge, a
divider, a row's rule. `outline` is a line that must be seen: a field's
edge, a control's.

### Neutrals: the two inks of text

- **`on-surface`** is what a person reads: a title, a value, a sentence, a
  card's line, a list's item. It is the default, at 7:1 or more on every
  rung.
- **`on-surface-variant`** is only what stands beside text: a label, a
  unit, a caption, a time, an identifier, a hint. At 4.5:1 or more. A
  sentence is never set in it to make it quieter.

Emphasis is made by contrast, weight and place, never by a hue: no word is
coloured to be noticed. There is no third ink: what is disabled is
`on-surface` at 38%, on a fill of `on-surface` at 12%, as Material draws it.

An `on-` role is written only on the fill it is named for: `on-yours` on
`yours`, `on-failure-container` on `failure-container`. Text of a meaning's
colour on a neutral surface is the meaning itself (`failure`, `yours`),
never its `on-` role, and a container role is never an ink.

### Ink and the one action

There is one button pair, and no third style.

- **The filled button** is the one main action of a view, and it is
  yellow with black on it (`primary`, `on-primary`), in the look's cut:
  File, Start a run that is opened, Approve, Try again. At most one to a
  view; a page of equal forms, such as a factory's Settings, has none. A
  view is the page, and each thing that opens over it: a dialog, a
  popover's form, a side sheet. It is yellow because pressing it is your
  move, which is what yellow says.
- **The outlined button** is every other action, in plain ink on an
  `outline` edge: Queue, Remove, Cancel, Send back, and an action repeated
  down a list, such as Start on each card of the inbox, Add in the skill
  picker, Confirm on each policy rule. A list never repeats a filled
  button, and the rail and the machine bar hold none: Pause is outlined.
- **A text action** is a link: plain ink, underlined. It is not a third
  button.

Everything a person selects or sets is ink, never yellow and never violet:

- **Selection** is a neutral fill (`secondary-container`) under plain ink:
  a selected tab, a chosen tile, a picked filter.
- **State** is ink: a switch that is on, a ticked box, a chosen radio, a
  slider's track, an icon a person can press.
- **Focus** is the kit's ring: 3 pixels of `secondary`, which is ink here,
  2 pixels off the control, drawn at once with no transition, the same on
  every control. The look's own parts draw the same ring in the same ink.
- **A row that is pressed answers the pointer.** A table's row, a list's
  item and a tab that lead somewhere take the state layer under the
  pointer, as the kit's interactive row does; a row that leads nowhere
  takes none.
- **States** are a layer of the content's own colour over the part: 10%
  under the pointer, 14% focused, 18% pressed, 22% dragged (the reference
  block below). No part mixes an opacity of its own to draw a state.

Yellow outside a part that waits on a person is under three hundredths of
a view: one filled button, and nothing else.

The theme says this as far as the kit lets it. `primary` is the yellow, so
the kit's filled button is right as it comes. `secondary` and `tertiary`
are ink, so the kit's selected and tonal parts are neutral as they come.
The kit also draws its primary on a switch, a checkbox, a radio, a slider,
a tab's indicator and a text button: those take ink through the kit's
component colours, which the kit must offer a theme (asked of the kit; see
*What the kit owes this look*). The board draws no text button meanwhile:
a text action is the look's link.

### The four meanings

A meaning is a colour of the board's own, outside the theme: the kit reads
the seed, the six keys and Material's 49 roles and no other name, so the
board defines these beside the theme (`src/styles.css`, `--meaning-*`) and
writes them here. Each has the four roles Material gives a static colour:
the colour, the ink on it, a container, and the ink on that.

| Meaning | Says | Dark | Light |
| :--- | :--- | :--- | :--- |
| `yours` | it waits on a person | `#f5e61a`, ink `#141300`; container `#4d4800`, ink `#f5e61b` | `#676000`, ink `#ffffff`; container `#f5e61b`, ink `#4d4800` |
| `alive` | a session is at work | `#c4a8ff`, ink `#0c1416`; container `#45218a`, ink `#e9ddff` | `#7732d9`, ink `#ffffff`; container `#ecdcff`, ink `#5e00c1` |
| `failure` | it failed | `#ff7676`, ink `#2a0506`; container `#92011a`, ink `#ffdad8` | `#b5242f`, ink `#ffffff`; container `#ffdad8`, ink `#92011a` |
| `rest` | it is over, or only counted | `#a9aaa8`, ink `#0d0d0d` | `#2f3031`, ink `#f2f0f1` |

`failure` is Material's `error` (`error-key`, `error`), the one static
colour the theme carries, so a kit part that reports an error draws the
board's failure with no mapping. The other three are the board's alone.

Every meaning is a state: what something is doing, or what it asks of a
person. **Data never takes a hue; only what the data means for a person
does.** A cost, a clock, a count and a try's number are data, drawn in
ink. So money is no meaning: a cost's sticker keeps its shape, rounded
and mono, on the Control rung with plain ink, and takes a colour only
when the cost becomes a state: over its budget it is `failure`, and a
spend that needs a person's word is `yours`.

- **Yours** is the acid yellow, the seed, and it says your move: what
  waits on a person (the tag "waits on you", a count of what waits, a
  gate, the edge of a card that waits) and the one filled action of a
  view. A waiting part is told from an action by its form: a tag, a count
  or an edge is never pressed, and a button always is.
- **Alive** is violet, and says alive and nothing else: a session at work,
  the live step on a rail, a wire carrying live work. A link between runs
  is plain ink. Selection and focus are ink, never violet. The line under
  a page's name, lit in violet on every page today, says nothing and is
  ink: the name's own colour under the name, a hairline beyond it.
- **Pink, on a live link (`#ff2e97`):** the colour of what moves along a
  live link, a packet on a wire, only while it moves: never text, never a
  fill, about 30° from the failure red. It is the board's own variable,
  defined by the first change that draws a moving link (the Floor's or a
  run graph's live wires), and not before.
- **Failure** is kept for what failed, readable on every rung. A board
  where nothing failed does not show it.
- **Rest** is the label's grey, with black ink, for what is at rest: a
  count, a clock, a finished run. A step that is done, a check that runs
  and a wait on another run are a filled `outline`, a cool grey.

### The names the board writes

One name for one colour. The board's own parts write the meanings
(`yours`, `alive`, `failure`, `rest`, each with its `on-` and
`-container` roles) and Material's neutral roles (the ladder, the two inks,
the two outlines). They write no accent role (`primary`, `secondary`,
`tertiary`): those are the kit's, for its own parts; the board's filled
button is the kit's, or the look's cut one. The names another
library brought (`muted`, `muted-foreground`, `card`, `accent`,
`destructive`, `border`, `foreground`) each repeat one of the above and are
not written in new code.

## Typography

Three jobs, three faces, and a fourth for a label's numerals.

- **Michroma lettering** (display, headline, title-large): wide, thin,
  square, the face of a head-up display, set in capitals on the hardware:
  a page's name, a section's plate.
- **Chakra Petch for what is short** (the three label roles): a button's
  word, a tag's, a rail's name, a table's heading. Squared, with cut
  terminals, at home in capitals.
- **Barlow for what is read** (the three body roles, `title-medium` and
  `title-small`, and so the tabs' words): a sentence, a card's line, a
  value, a list's item. It keeps the squared, instrument cut of the look
  and is drawn for small sizes, which Chakra Petch is not: a display face
  set small and dim is why the board was hard to read.
- **JetBrains Mono for what is typed or copied** (`mono`): an identifier,
  a command, a path, a log. It has a medium weight and tells `&&` from
  `66`, which the face before it did not.

The board sets the fourth beside the kit: a printed label's numerals in
Archivo at its widest and heavy (width 125, weight 800), black ink on the
label's stock.

### Sizes

Text a person reads is never under 13 pixels, and a sentence is 15.

| Role | Size and line | What takes it |
| :--- | :--- | :--- |
| `body-large` | 16 / 24 | a paragraph that is the page's subject: a closeout, an intent |
| `body-medium` | 15 / 22 | the default: a sentence, a card's line, a value |
| `body-small` | 13 / 18 | what stands beside text: a meta line, a caption, a table's cell |
| `label-large` | 14 / 20 | a button's word |
| `label-medium` | 12 / 16 | a tag's word |
| `label-small` | 11 / 16 | a rail's name, a table's heading, a tile's label |

Only a label is under 13 pixels, and a label is a word or two in
capitals, never a sentence. Mono text takes the body role it stands in,
one pixel under it where it runs beside a sentence.

The three label roles are the look's small caps, as printed on a label:
heavier than Material's (weight 600), tracked wide, and set in capitals
where they are written. Each is tracked for what it mostly draws: the
large and the medium by six hundredths of an em; the small by a tenth.
The three body roles and the medium and small titles are not tracked:
running text is set as its face was drawn. Every other size, weight and
tracking of the kit's roles is Material's.

### How text is written

The board's own parts set text through the kit's five type primitives
(`Display`, `Headline`, `Title`, `Body`, `Label`), never through a raw
type class (`text-body-small`). A primitive carries its role's size,
line, weight, tracking and face together, and takes its ink from the
surface it stands on, so the pairing of an `on-` ink with its fill holds
without anyone writing it. The one ink a part states is the quiet one:
`colorRole="on-surface-variant"`, on a label, a unit, a time, a hint,
and never on a sentence.

## Shape

Every corner of the kit is square: all six radii are 0. A cut corner and a
rounded sticker are not radii; the board draws them around the kit's
components.

One shape for one kind of thing, on every page. A cut is always the top
right corner, on a button, a frame and a tag alike:

- what is pressed to act, the filled button, has a cut corner;
- what holds content, a frame, has a cut corner and a hairline;
- what is stuck on, a tag, has a cut corner; a sticker that carries a
  number is rounded, and only a sticker is;
- what is set or typed into (a field, a switch, a box, a tab, an outlined
  button) is square.

A view of square controls alone reads as a form, not as Nemia: the cut on
its one action and on its frames is what carries the look once colour is
spent sparingly.

## What the kit owes this look

Two things the theme cannot say today, asked of the kit (the design system
repository), since a theme change alone cannot split them:

1. **Component colours a theme can point elsewhere**, as Material's own
   component tokens do: the selected colour of the switch, checkbox, radio
   and slider, the tab's indicator, the text button's and the icon
   button's ink. This look points each at `on-surface`.
2. **Static colours**, as Material's theme builder gives them: a named
   colour of the project's own that the generator turns into its four
   roles in both schemes. The four meanings are written by hand beside the
   theme until then.

**Debt, until the kit's release.** The kit's switch, checkbox, radio,
slider and primary tabs stay `primary`, yellow, when selected: the theme
cannot point them elsewhere until the kit offers their component colours
(1. above). It is the one place yellow is not your move, and it goes when
the board takes that release.

## Elevation and motion

No shadow, and no colour: height says no meaning. What is raised takes the
ladder's Raised rung and a hairline that grows plainer as it rises, from
`outline-variant` to `outline` to the text's ink. Motion is short and
decisive.

## Scroll bars

A scroll bar is the look's wherever something scrolls: the page, the
sidebar, a panel, a table, a block of code. It is an 8-pixel square lane
with no arrows, and the ground shows through it. At rest no thumb is seen.
While the thing scrolls its thumb is drawn 4 pixels wide in `outline`, and
fades once it stops. Under the pointer the thumb takes the lane's whole
width in `on-surface-variant`, and `on-surface` while it is held. The inks
are neutral roles: a scroll bar says none of the four meanings.

The lane keeps its room wherever something overflows, so nothing moves when
a thumb comes or goes; beside the page it shows the plain ground, not the
scan lines. A table in a cut frame scrolls sideways alone, its thumb
starting past the frame's cut.

The rule is the board's (`src/styles.css`), not the theme's: the kit's
generator gives a scroll bar no token. What stays the system's: the list a
native select opens, drawn in the page's scheme, and the bar of a browser
that knows neither the parts nor `scrollbar-color`.

## Grain

A grain says one thing: this was printed. It is the stock of a label, and
the matte of a frame. It is never decoration, so its weight follows what
the surface is for, in three settings and no other.

| Setting | Weight | What wears it |
| :--- | :--- | :--- |
| `label` | full, ink specks in both schemes | what is stuck on: a sticker, a stat tile, a plate |
| `quiet` | a third of the frame's former weight | a cut frame that holds something to read: a card, a framed table, a pane |
| none | no grain | everything else: the ground (it has its scan lines), a well, an inset, what is raised, a control, a tag, a button |

- **A frame is quiet by default.** Its grain is felt as a matte surface
  and is not seen as specks at reading distance: the far end of the grain
  (the speck at its strongest 2%) moves a frame's ground by less than a
  twentieth of the contrast its text has on it.
- **Grain never doubles.** A frame inside a frame takes none, and nothing
  on the Inset, Well, Raised or Control rungs takes any, so the ladder is
  told by tone alone and the grain marks only its first rung.
- **The full grain is a label's.** A label is small, carries a number or a
  word in heavy ink, and is where the look wants the printed stock to
  show.

No image carries it. A grain is a tile of noise the browser draws, 220
pixels wide and repeated, in one colour whose specks come and go. The
grain follows the cut: nothing of it shows in a cut corner, and the ring
and the glow that follow the cut stay over it.

The rule is the board's (`src/components/look/grain.css`), not the theme's:
the kit's generator gives a grain no token. A part of the look wears one by
naming it (`data-grain="label"`, `data-grain="quiet"`). Text on a grain is
measured against its far end, the speck at its strongest 2%.

## Reference CSS

```css
:root {
  --md3-dark-mode: system;
  --md-sys-elevation-1: 0 0 0 1px --alpha(var(--md-sys-color-outline-variant) / 100%);
  --md-sys-elevation-2: 0 0 0 1px --alpha(var(--md-sys-color-outline) / 70%);
  --md-sys-elevation-3: 0 0 0 1px --alpha(var(--md-sys-color-outline) / 100%);
  --md-sys-elevation-4: 0 0 0 1px --alpha(var(--md-sys-color-on-surface-variant) / 70%);
  --md-sys-elevation-5: 0 0 0 1px --alpha(var(--md-sys-color-on-surface) / 85%);
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
| `secondary` | `#5c5e62` `hsl(220 3% 37%)` | `#c6c7c9` `hsl(220 3% 78%)` |
| `on-secondary` | `#ffffff` `hsl(0 0% 100%)` | `#0e0f10` `hsl(210 7% 6%)` |
| `secondary-container` | `#e1e2e7` `hsl(230 11% 89%)` | `#2e3033` `hsl(216 5% 19%)` |
| `on-secondary-container` | `#44474b` `hsl(214 5% 28%)` | `#e4e5e2` `hsl(80 5% 89%)` |
| `tertiary` | `#5d5e62` `hsl(228 3% 37%)` | `#c6c7c9` `hsl(220 3% 78%)` |
| `on-tertiary` | `#ffffff` `hsl(0 0% 100%)` | `#0e0f10` `hsl(210 7% 6%)` |
| `tertiary-container` | `#e2e2e6` `hsl(240 7% 89%)` | `#2e3033` `hsl(216 5% 19%)` |
| `on-tertiary-container` | `#45474a` `hsl(216 3% 28%)` | `#e4e5e2` `hsl(80 5% 89%)` |
| `error` | `#b5242f` `hsl(355 67% 43%)` | `#ff7676` `hsl(0 100% 73%)` |
| `on-error` | `#ffffff` `hsl(0 0% 100%)` | `#2a0506` `hsl(358 79% 9%)` |
| `error-container` | `#ffdad8` `hsl(3 100% 92%)` | `#92011a` `hsl(350 99% 29%)` |
| `on-error-container` | `#92011a` `hsl(350 99% 29%)` | `#ffdad8` `hsl(3 100% 92%)` |
| `background` | `#faf9fa` `hsl(300 9% 98%)` | `#0a0a0b` `hsl(240 5% 4%)` |
| `on-background` | `#1b1c1d` `hsl(210 4% 11%)` | `#e4e5e2` `hsl(80 5% 89%)` |
| `surface` | `#faf9fa` `hsl(300 9% 98%)` | `#0e0f10` `hsl(210 7% 6%)` |
| `on-surface` | `#1b1c1d` `hsl(210 4% 11%)` | `#e4e5e2` `hsl(80 5% 89%)` |
| `surface-variant` | `#e2e2e7` `hsl(240 9% 90%)` | `#45474b` `hsl(220 4% 28%)` |
| `on-surface-variant` | `#45474b` `hsl(220 4% 28%)` | `#c5c6cb` `hsl(230 5% 78%)` |
| `surface-dim` | `#dbdadb` `hsl(300 1% 86%)` | `#121314` `hsl(210 5% 7%)` |
| `surface-bright` | `#faf9fa` `hsl(300 9% 98%)` | `#38393a` `hsl(210 2% 22%)` |
| `surface-container-lowest` | `#ffffff` `hsl(0 0% 100%)` | `#0d0e0f` `hsl(210 7% 5%)` |
| `surface-container-low` | `#f4f3f4` `hsl(300 4% 95%)` | `#1b1c1d` `hsl(210 4% 11%)` |
| `surface-container` | `#efedee` `hsl(330 6% 93%)` | `#1f2021` `hsl(210 3% 13%)` |
| `surface-container-high` | `#e9e8e9` `hsl(300 2% 91%)` | `#292a2b` `hsl(210 2% 16%)` |
| `surface-container-highest` | `#e3e2e3` `hsl(300 2% 89%)` | `#343536` `hsl(210 2% 21%)` |
| `surface-tint` | `#676000` `hsl(56 100% 20%)` | `#d7ca00` `hsl(56 100% 42%)` |
| `outline` | `#75777b` `hsl(220 3% 47%)` | `#8f9095` `hsl(230 3% 57%)` |
| `outline-variant` | `#c5c6cb` `hsl(230 5% 78%)` | `#45474b` `hsl(220 4% 28%)` |
| `shadow` | `#000000` `hsl(0 0% 0%)` | `#000000` `hsl(0 0% 0%)` |
| `scrim` | `#000000` `hsl(0 0% 0%)` | `#000000` `hsl(0 0% 0%)` |
| `inverse-surface` | `#2f3031` `hsl(210 2% 19%)` | `#a9aaa8` `hsl(90 1% 66%)` |
| `inverse-on-surface` | `#f2f0f1` `hsl(330 7% 95%)` | `#0d0d0d` `hsl(0 0% 5%)` |
| `inverse-primary` | `#d7ca00` `hsl(56 100% 42%)` | `#3a3600` `hsl(56 100% 11%)` |
| `primary-fixed` | `#f5e61b` `hsl(56 92% 53%)` | `#f5e61b` `hsl(56 92% 53%)` |
| `on-primary-fixed` | `#1f1c00` `hsl(54 100% 6%)` | `#1f1c00` `hsl(54 100% 6%)` |
| `primary-fixed-dim` | `#d7ca00` `hsl(56 100% 42%)` | `#d7ca00` `hsl(56 100% 42%)` |
| `on-primary-fixed-variant` | `#4d4800` `hsl(56 100% 15%)` | `#4d4800` `hsl(56 100% 15%)` |
| `secondary-fixed` | `#e1e2e7` `hsl(230 11% 89%)` | `#e1e2e7` `hsl(230 11% 89%)` |
| `on-secondary-fixed` | `#191c1f` `hsl(210 11% 11%)` | `#191c1f` `hsl(210 11% 11%)` |
| `secondary-fixed-dim` | `#c5c6cb` `hsl(230 5% 78%)` | `#c5c6cb` `hsl(230 5% 78%)` |
| `on-secondary-fixed-variant` | `#44474b` `hsl(214 5% 28%)` | `#44474b` `hsl(214 5% 28%)` |
| `tertiary-fixed` | `#e2e2e6` `hsl(240 7% 89%)` | `#e2e2e6` `hsl(240 7% 89%)` |
| `on-tertiary-fixed` | `#1a1c1f` `hsl(216 9% 11%)` | `#1a1c1f` `hsl(216 9% 11%)` |
| `tertiary-fixed-dim` | `#c6c6ca` `hsl(240 4% 78%)` | `#c6c6ca` `hsl(240 4% 78%)` |
| `on-tertiary-fixed-variant` | `#45474a` `hsl(216 3% 28%)` | `#45474a` `hsl(216 3% 28%)` |
