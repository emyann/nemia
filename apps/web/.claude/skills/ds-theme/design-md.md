# What the kit reads in a DESIGN.md

The contract between a project's `DESIGN.md` and the kit's generator. The
steps are in `SKILL.md`, beside this file; this is the reference for what a
name means, what is ignored and what is refused.

`<kit>` is the kit's folder in the project: the `ds` folder under the `ui`
alias of `components.json` (`src/components/ui/ds` in most projects).

A project keeps one `DESIGN.md` at its root, in
[Google Labs' format](https://github.com/google-labs-code/design.md)
(`@google/design.md` 0.4.0, spec `alpha`): YAML front matter for the tokens,
prose for the reasons. It is the only file anyone edits. The generator turns
it into the theme: both colour schemes, the type scale and the corners from
the front matter; elevation, motion, state layer opacities and how dark is
switched from one CSS block in the body.

```bash
npx tsx <kit>/tokens/generate-theme.mjs DESIGN.md --out theme
```

That writes `theme.css`, `theme.v4.css` and `DESIGN.resolved.md` into the
folder `--out` names, creating it when it is missing. The entry CSS imports
the two stylesheets from there. `<kit>/tokens/theme.v4.css` is the template
the project's copy is written from, so regenerate after a kit update.

## The front matter

```yaml
---
version: alpha
name: Acme
scheme: light # which scheme the roles below write: light or dark
colors:
  seed: "#4d518a" # required: the key colour everything is derived from
  secondary-key: "#3d6c3d" # optional: replaces one palette
  on-primary-container: "#11144b" # optional: a written role wins
typography:
  title-medium:
    fontFamily: Inter
    fontSize: 16px
    fontWeight: 500
    lineHeight: 24px
    letterSpacing: 0.15px
  mono: # optional: the face `font-mono` gives
    fontFamily: JetBrains Mono
rounded:
  small: 8px
---
```

What the kit reads there, and nothing else:

- **`scheme`**: `light` or `dark`. The format's front matter holds one
  scheme; this top-level key, the kit's own, says which one the file writes.
  The other is derived. Write it. A file that writes none (the format has no
  such key, so a file its own tools wrote has none) has its scheme read from
  its ground: `colors.background`, else `colors.surface`, light when that
  colour's tone is 50 or more, dark under. That is listed as **assumed**,
  with the token it was read from. With neither colour the file is refused.
- **`colors`**: hex only.
  - `seed` builds Material's tonal-spot scheme
    (`@material/material-color-utilities`, 2021 spec, standard contrast).
    Write it. A file that writes none has it read from `colors.primary`,
    listed as **assumed**; with no `primary` either the file is refused.
  - `primary-key`, `secondary-key`, `tertiary-key`, `neutral-key`,
    `neutral-variant-key`, `error-key` each replace one tonal palette with the
    key's own hue and chroma, in both schemes. Without `primary-key` the
    primary palette is the seed's hue at Material's fixed chroma, so a muted
    primary needs the key.
  - Any of the 49 role names below **wins** over the derived role, in the
    written scheme. The other scheme comes from the key colours alone, so a
    colour that must hold in both schemes is a key, not a role. The
    `*-fixed*` roles are the same in both schemes, so a written one applies to
    both.
- **`typography`**: the 15 Material roles, `display-large` to `label-small`
  (`display`, `headline`, `title`, `body` and `label`, each in `-large`,
  `-medium` and `-small`), with `fontSize`, `lineHeight`, `letterSpacing`,
  `fontWeight` and `fontFamily`. Each is one value of its kind, written to
  `--md-sys-typescale-*` as given: `fontSize` a length (`16px`, `1.125rem`),
  `lineHeight` a length or a number (`24px`, `1.5`), `letterSpacing` a length
  of either sign or `0` (`0.5px`, `-0.02em`), `fontWeight` a number from 1 to
  1000, `normal` or `bold`. No `var()`, `calc()` or `clamp()` there.
  - `mono`, beside the 15, is not a Material role: it names the **mono
    face**, with a `fontFamily` and nothing else (see **The mono face**).
- **`rounded`**: `extra-small`, `small`, `medium`, `large`,
  `large-increased`, `extra-large`, `full`, each a length or `0` (`8px`,
  `0.5rem`). `large-increased` (Material's 20px, drawn by connected button
  groups and split buttons) has no short name. A file that writes `large` and
  not `large-increased` gets its `large` value for it, so a square theme stays
  square; a file that writes neither gets Material's 20px.

A DESIGN.md that writes no `typography` at all gets Material's baseline, which
is Roboto: write `fontFamily` on the roles to choose a family.

### The 49 role names

Each is `--md-sys-color-<name>` in the theme and `bg-<name>` / `text-<name>` /
`border-<name>` as a utility.

| Group                   | Names                                                                                                                                                                                                                                                                                                                 |
| :---------------------- | :-------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Accent roles            | `primary`, `on-primary`, `primary-container`, `on-primary-container`, and the same four for `secondary`, `tertiary` and `error`                                                                                                                                                                                       |
| Surfaces                | `background`, `on-background`, `surface`, `on-surface`, `surface-variant`, `on-surface-variant`, `surface-dim`, `surface-bright`, `surface-container-lowest`, `surface-container-low`, `surface-container`, `surface-container-high`, `surface-container-highest`, `surface-tint`                                      |
| Outlines, shadow, scrim | `outline`, `outline-variant`, `shadow`, `scrim`                                                                                                                                                                                                                                                                       |
| Inverse                 | `inverse-surface`, `inverse-on-surface`, `inverse-primary`                                                                                                                                                                                                                                                            |
| Fixed roles             | `primary-fixed`, `on-primary-fixed`, `primary-fixed-dim`, `on-primary-fixed-variant`, and the same four for `secondary` and `tertiary`                                                                                                                                                                                |

### Colour names that are not the kit's

The kit reads `seed`, the six `*-key` names and the 49 roles, and no other
colour name. A DESIGN.md written elsewhere, or a project's own vocabulary
(`brand-pink`, `ink`, `paper`, `accent`, `neon`), is **mapped by you**, the
agent: the generator never guesses a name. It reads two tables of short names
as Material's, because the format's own examples and tools write them, and
nothing outside them:

| Written                                                 | Read as                                               |
| :------------------------------------------------------ | :---------------------------------------------------- |
| `typography.<display, headline, title, body, label>-lg` | `-large`                                              |
| `…-md`, `…-sm`                                          | `-medium`, `-small`                                   |
| `rounded.xs`, `sm`, `md`, `lg`, `xl`                    | `extra-small`, `small`, `medium`, `large`, `extra-large` |

A short name is read with no warning. Where a file writes both `title-md` and
`title-medium`, Material's name is read and the short one is listed as not
applied. Any other name (`headline-display`, `h1`, `rounded.pill`) is ignored
and listed.

A file with no `scheme` and no `seed` still generates, as said above, with
each assumption listed. That is a first drawing, not a mapping: read the
**assumed** lines, then write `scheme` and `seed` (and the keys) yourself, so
the file says what it means.

- A brand colour that should run through the whole scheme is a key:
  `primary-key` for the main one, `secondary-key` and `tertiary-key` for the
  next two, `seed` for the one the neutrals should lean towards.
- A background or paper colour is `neutral-key` when it should tint every
  surface in both schemes, or `surface` / `background` when it is one exact
  colour in the written scheme.
- An exact colour that must appear as written (the button fill, the text on
  it) is a role: `primary`, `on-primary`, and so on. Write its partner too
  when the derived one does not read on it; the generator checks the pair.
- The foreign names may stay in the file beside the mapped ones. They are
  ignored, and listed as warnings on every run, which is expected: say so
  rather than deleting what the project wrote.

## The body: one reference block

Elevation, motion and state have no place in the format's front matter, so
they are written in the body, under a heading the kit knows:

````markdown
## Reference CSS

```css
:root {
  --md3-dark-mode: class; /* or system */
  --md-sys-elevation-1:
    0 1px 2px 0 --alpha(var(--md-sys-color-shadow) / 30%),
    0 1px 3px 1px --alpha(var(--md-sys-color-shadow) / 15%);
  --md-sys-state-hover-state-layer-opacity: 8%;
  --md-sys-motion-easing-standard: cubic-bezier(0.2, 0, 0, 1);
  --md3-duration-short-4: 200ms;
}
```
````

The kit reads the first `css` fence under `## Reference CSS`, and in it the
first top-level `:root` rule. The names are the theme's own, 27 of them:

- **`--md-sys-elevation-1`** to **`-5`**: a `box-shadow` value (several
  layers, a ring, `none`): lengths, colours and keywords, with `var()`,
  `calc()`, `min()`, `max()`, `clamp()`, `--alpha()` and the colour functions
  (`rgb()`, `hsl()`, `oklch()`, `color-mix()`, `light-dark()`, …).
- **`--md-sys-state-{hover,focus,pressed,dragged}-state-layer-opacity`**: a
  percentage (`8%`, never `0.08`: it is also the alpha of a `color-mix()`).
- **`--md-sys-motion-easing-{standard,emphasized}`** and their `-accelerate`
  and `-decelerate` forms: one easing function, written out: a keyword
  (`ease-out`, `linear`), `cubic-bezier()`, `steps()` or `linear()`.
- **`--md3-duration-{short,medium,long}-{1,2,3,4}`**: milliseconds (`200ms`).

A name the rule leaves out gets the kit's own value (Material's: the table
`REFERENCE_DEFAULTS` in `<kit>/tokens/design-md.mjs`), never what a previous
run left in `theme.v4.css`. Any other declaration in the rule (`--shadow`,
`--md-sys-color-primary`) is ignored and listed as a warning; so is a second
`css` fence under the heading. Beside a `:root` rule the kit read, the other
rules of the block, `css` fences under other headings and all prose
(`## Elevation & Depth`, `## Motion`, …) are for readers: never read, never
listed. A `## Reference CSS` heading with no rule the kit can read under it (a
fence without the `css` info string, a selector that is not exactly `:root`
such as `:root, :host` or `html`, a `:root` nested in an at-rule, or no block)
is listed as a warning: nothing of the section is in the theme, which gets the
kit's own values and dark on the `.dark` class. An empty `:root {}` is a rule,
and lists nothing. A reference value holds one value of its kind and nothing
after it: no `;`, brace, quote, comment or `url()`, and `var()` or `calc()`
only in an elevation. One that is not (a state opacity that is not a
percentage, a duration that is not in `ms`, an easing written as a `var()`, an
elevation with a quote in it) is refused. Disabled opacities and reduced
motion are handled inside the components; the theme has no variable for them.

## Dark: by class or by the system setting

The same rule says how the dark scheme is switched, with `--md3-dark-mode` (it
is read by the generator and never written into the theme):

| `--md3-dark-mode`   | `theme.css` writes dark under         | The entry CSS needs                                                    |
| :------------------ | :------------------------------------ | :--------------------------------------------------------------------- |
| `class` (or absent) | `.dark { … }`                         | `@custom-variant dark (&:where(.dark, .dark *));`, `.dark` on `<html>` |
| `system`            | `:root` in `prefers-color-scheme` (¹) | nothing: Tailwind v4's own `dark:` already follows the system setting  |

(¹) `@media (prefers-color-scheme: dark) { :root { … } }`.

Any other value is refused. `theme.v4.css` is the same for both.

In a system-mode project a `.dark` on a subtree does nothing, and a preset
that keys its dark palette on `.dark` (`preset-editorial`) has no dark scheme.

## Warnings

Whatever the file leaves out gets Material's baseline (the baseline type scale
in Roboto, corners 4/8/12/16/28px and a pill, the 27 values above), never what
a previous run left behind. The kit lists a warning, and still writes the
theme, for:

- a name it does not know inside `colors`, `typography` or `rounded`
  (`colors.brand-pink`, `typography.h1`, `rounded.pill`), or inside the
  reference rule;
- what it **assumed**: a `scheme` read from the ground, a `seed` read from
  `primary`, each with the token it was read from and the line to write to
  say it;
- a short name written beside Material's own (`title-md` with `title-medium`):
  not applied;
- a top-level key outside the format's own and `scheme`: a misspelt
  `typographie:` is listed, not silently taken as no typography. The format's
  `spacing` and `components` are not read by the kit and are not listed;
- a value it has no variable for (see **Limits**);
- **poor contrast**: a written colour role whose text pair falls under 4.5:1.
  The 40 pairs are text on its background: each `on-X` on `X` and on its
  container, `on-surface` and `on-surface-variant` on every surface, the
  inverse pairs and the fixed pairs (`CONTRAST_PAIRS` in
  `<kit>/tokens/design-md.mjs`). A pair is checked when at least one side is
  written, in the written scheme, against its written or derived partner; a
  pair the kit derived whole is Material's own and is not checked.

Warnings are printed on stderr, and written to a `## Generator warnings`
section at the end of `DESIGN.resolved.md`, which is absent when there are
none. The command exits 1, and writes nothing, only for a file it cannot read:
no front matter, no `scheme` and no ground to read one from, no `seed` and no
`primary` to read one from, a `scheme` that is neither `light` nor `dark`, a
colour under a name it knows that
is not a hex, a type size, line height, tracking, weight or corner that is not
one value of its kind, a family that cannot be a name (the mono face's
included), or a reference value in a form it refuses. The message names the token and says what the kit reads
there.

## Fonts go through a hook

`fontFamily: Inter` becomes
`--font-inter: "Inter", ui-sans-serif, system-ui, sans-serif` in `theme.css`
and `var(--font-inter)` on the face. The theme names the family; it does not
load it. Load the font the way the project loads fonts (a `<link>`, an
`@font-face`, a font package), or let a host that sets the variable itself win
(Next: `Inter({ variable: "--font-inter" })`). Fallbacks written after a comma
(`Space Grotesk, Georgia, serif`) replace the default stack. A family name
may hold anything a font is called (spaces, digits, accents, an apostrophe)
on one line: it is written as one CSS string, so nothing in it is read as CSS,
and a fallback that is not plain words (`Source Sans 3`) is quoted the same
way. A name with no Latin letter or digit, an empty name between two commas
and a list are refused.

**A family per role.** Material gives each of the 15 roles a font of its own,
which reads one of two faces unless told otherwise, and so does the kit:

- The family of `display-large` is the brand face (display, headline, title);
  the family of `body-large` is the plain face (body, label). They are
  `--md-sys-typescale-brand-font` and `--md-sys-typescale-plain-font`.
- A role that writes no `fontFamily` keeps its face's. So a file that writes
  one family on `display-large` and one on `body-large` sets all 15 roles.
- A role that writes a family that is not its face's takes it:
  `--md-sys-typescale-<role>-font` reads that family's hook, and the kit's
  primitives and components draw the role in it (`font-<role>`, written
  beside `text-<role>`). Running text in one family and the labels in
  another is `body-large` with the first and `label-large`, `label-medium`
  and `label-small` with the second.
- Each family is one hook and one font to load, whatever number of roles
  write it. The kit does not count them: four families is four fonts the
  project loads.
- A hook holds one stack: the first written for it, the faces before the
  roles. The same family written later with other fallbacks is applied, and
  its fallbacks are listed as not applied.
- A family whose hook would be a role's or a face's own utility (`Label Large`
  gives `--font-label-large`, `Brand` gives `--font-brand`) is refused.

## The mono face

A project that wants a monospace face for some of its text (an identifier, a
time, an amount) names it as a typography token of its own:

```yaml
typography:
  mono:
    fontFamily: JetBrains Mono
```

- It becomes a hook in `theme.css`, as any family does
  (`--font-jetbrains-mono: "JetBrains Mono", ui-monospace, SFMono-Regular,
  Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace`), the
  token `--md-sys-typescale-mono-font: var(--font-jetbrains-mono)` in
  `theme.v4.css`, and through it Tailwind's own utility, **`font-mono`**.
  Fallbacks written after a comma replace the monospace stack. The project
  loads the face, as for the other two.
- **The project writes `font-mono` where it wants the face.** No kit component
  uses it, and naming one changes no kit component.
- **With none named**, the token is the system's monospace stack, the one
  Tailwind gives `font-mono` by default: nothing on any screen moves.
- **`code`, `kbd`, `samp` and `pre` follow a named face** without a class:
  Tailwind's base styles draw those four elements with the same variable.
- It is a family only. The text keeps the size, weight and tracking of the
  type role it is written in; any other property on `mono` (`fontSize`) is not
  applied, and listed.
- A family called just `Mono` is refused: its hook would be `--font-mono`,
  the variable the utility reads. Write the family's full name.
- A mono face that is also the brand or the plain face shares that face's
  hook, with the stack written there.

## Limits

`theme.v4.css` has a weight variable for every one of the 15 roles, so a
`fontWeight` on any role is applied, and every `text-<role>` utility sets its
role's weight: the type primitives write none of their own. It has a tracking
variable only where Material's baseline has tracking: a tracking other than 0
on any other role is not applied, and listed. A property outside the five on
a known role (`fontFeature`) is not applied, and listed.

A seeded palette is a Material-flavoured one: the tonal ramps are the Material
look. A look that departs from it writes more roles by hand, in the written
scheme, and checks the other scheme by eye.

## The complete file: `DESIGN.resolved.md`

Written back beside the generated theme, for agents: the project's front
matter with every role of the written scheme, the whole type scale and the
corners filled in; its prose verbatim, with the reference block's `:root` rule
written complete (the dark choice, the 27 values the theme was written with,
then the declarations the kit does not read) and added when the project wrote
none; a table of both schemes that says how dark is switched; and the
warnings, when there are any. Where the kit read no rule under the project's
`## Reference CSS`, that section is left as written and the complete rule goes
in a generated `## Resolved reference CSS` section, which says the project's
section is not in the theme. Comments inside the project's `:root` rule are
not carried over. Every role shows the family applied to it: its own, or
its face's where the project wrote none. A short name the kit read (`title-md`, `rounded.sm`) is
written under Material's. A `scheme` or a `seed` the kit assumed is not
written into it: the resolved file says what the project's file says, and the
assumption is listed again. It passes the same linter, and generating from it
gives the same theme and the same warnings. `## Resolved reference CSS`,
`## Resolved schemes` and `## Generator warnings` are the kit's headings: a
section of either name in a DESIGN.md is replaced. Never edit the resolved
file: edit `DESIGN.md` and regenerate.

## The two files of the generator

`<kit>/tokens/design-md.mjs` is the derivation, with no file access;
`<kit>/tokens/generate-theme.mjs` is the command
(`npx tsx <kit>/tokens/generate-theme.mjs <DESIGN.md> [--out <dir>]`). Run
them through `tsx`, not bare `node`: `@material/material-color-utilities`
0.4.x ships extension-less relative imports in its ESM build, which Node's own
resolver rejects. The colour library, `yaml`, `tsx` and the linter
(`@google/design.md`, the `designmd` command) are dev dependencies the install
added to the project.
