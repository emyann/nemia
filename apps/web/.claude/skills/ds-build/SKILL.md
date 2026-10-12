---
name: ds-build
description: Build screens and components with the MD3 kit installed in this project. The rules for styling with it (role utilities and their pairing, the type primitives, state layers), where to read the project's real values, and what a project may change (tokens freely, and a kit file by an edit that is allowed, priced and rarely needed). Use before writing or reviewing any UI that uses the kit, and before editing a kit file.
---

# ds-build: building with the kit

The kit is Material Design 3 components on React Aria and Tailwind v4, copied
into this project. Its files are in the project's tree: an edit of one is
allowed, has a price at every update, and is rarely needed. The rule is the
last section.

`<kit>` below is the kit's folder in this project: the `ds` folder under the
`ui` alias of `components.json` (`src/components/ui/ds` in most projects).

| To know                                   | Read                                                                 |
| :---------------------------------------- | :------------------------------------------------------------------- |
| What exists and what it exports           | `<kit>/index.ts`                                                     |
| A component's props, variants and slots   | its file in `<kit>/components/`, doc comment first                   |
| The project's real values                 | `theme/DESIGN.resolved.md` if the project generated a theme, else `<kit>/tokens/DESIGN.resolved.md` |
| Which utilities exist                     | `<kit>/tokens/theme.v4.css`                                          |
| What Material says a component should do  | the `ds-spec` skill (`.claude/skills/ds-spec/SKILL.md`)            |
| How to change the look                    | the `ds-theme` skill (`.claude/skills/ds-theme/SKILL.md`)          |

## Read values from the resolved file, never guess them

`DESIGN.resolved.md` is the complete design, generated: every colour role of
both schemes as hex and `hsl()`, the whole type scale, the six corners, the
elevation, motion and state values, how dark is switched, and the generator's
warnings. It is the reference for "what colour is `primary-container` in
dark" or "how big is `title-medium`". Never edit it, and never copy a value
out of it into a class: name the role.

## Use what exists

Import from the barrel, or deep-import one file:

```tsx
import { Button, Card, CardContent, Title } from "@/components/ui/ds";
import Button from "@/components/ui/ds/components/Button";
```

Look in `<kit>/index.ts` before writing a control. The router adapters and the
react-hook-form adapter are not part of the whole-kit install: add
`@ds/next-adapter`, `@ds/react-router-adapter` or
`@ds/react-hook-form-adapter` when the project needs one. Without a router
adapter, `href` on a `Button`, `Chip` or menu item does a full page load.

The kit holds what Material 3's specification describes, and a closed group
of components of its own: each of those says "Material 3 does not describe
this component." in its doc comment. A component the kit does not have is the
project's: it is written beside the kit, not inside it, on
`react-aria-components`, following the rules below.

What the project's own component follows:

- **Its measures and its look are Material's**, where Material describes the
  component: its sizes, its states, its colour roles and its Do and Don't are
  read on Material's pages with the `ds-spec` skill
  (`.claude/skills/ds-spec/SKILL.md`), which the install brought. Where
  Material describes nothing like it, it follows the rules below and the
  nearest kit component.
- **Its behaviour is React Aria's**: keyboard, focus, selection, overlays and
  the names assistive technology reads. Adobe publishes a skill that holds
  the library's whole documentation; the kit does not ship it. Install it
  with

  ```bash
  npx skills add https://react-aria.adobe.com
  ```

  and refresh it with `npx skills update`. Without it, every page of React
  Aria's documentation is served as markdown at its own address with `.md`
  added (`https://react-aria.adobe.com/Button.md`).

## Colour: role utilities, in pairs

Write colours as the role's utility. Never a hex, never a palette class
(`bg-blue-600`), never an arbitrary value.

    bg-primary text-on-primary                            filled
    bg-secondary-container text-on-secondary-container    tonal
    bg-surface-container-low                              a raised surface
    border-outline-variant                                hairlines
    text-on-surface-variant                               supporting text

- **Pairing.** A `bg-<role>` carries its `text-on-<role>`. The pair on the
  container colours everything inside it, so children do not restate it.
- **Content colour is inherited.** The theme sets `on-surface` as the ambient
  colour in both schemes. `Display`, `Headline`, `Title`, `Body` and `Label`
  assert no colour: pass `colorRole="on-surface-variant"` (or another role)
  only where inheritance is not what is wanted.
- **Surfaces come in tiers**: `surface-container-lowest`, `-low`,
  `surface-container`, `-high`, `-highest`. Pick a tier for depth; do not add
  a border to fake it.
- **Dark is free.** A role has a value in each scheme. Do not write `dark:`
  variants for colour.

If the project also has stock shadcn components, their `bg-background`,
`bg-card`, `bg-muted`, `border-border` read the same roles through the bridge
the install wrote. `bg-primary` and `bg-secondary` are the Material roles.

## Type, shape, elevation, motion

- **Type**: prefer the primitives, `<Title size="medium">`,
  `<Body size="small">`. They carry the face and the weight. A raw
  `text-title-medium` sets size, line height and tracking only; the faces are
  `font-brand` (display, headline, title) and `font-plain` (body, label).
  `font-mono` is the project's mono face, the one its `DESIGN.md` names or
  else the system's: write it where the project wants one (an identifier, a
  time, an amount). No kit component uses it.
- **Shape**: `rounded-shape-extra-small`, `-small`, `-medium`, `-large`,
  `-extra-large`, `-full`. Never `rounded-lg`: it does not follow the theme.
- **Elevation**: `shadow-elevation-1` to `shadow-elevation-5`.
- **Motion**: `duration-short-1` to `duration-long-4`, `ease-standard`,
  `ease-emphasized` and their `-accelerate` / `-decelerate` forms. Enter with
  `ease-emphasized-decelerate`, exit with `ease-emphasized-accelerate`.

## Interaction states

Every pressable shows a state layer: an overlay in the content colour whose
opacity follows the state.

- Use `StateLayer` from the kit with React Aria's render props (`isHovered`,
  `isFocusVisible`, `isPressed`), or the utilities
  `state-opacity-hover`, `state-opacity-focus`, `state-opacity-pressed`,
  `state-opacity-dragged`.
- Never Tailwind's numeric `opacity-8` for a state: it compiles to a literal
  and the theme cannot move it.
- Focus is `focus-visible`, never plain focus. The ring is `focusRing` from
  `<kit>/utils.ts`; extend it, do not invent another.
- Disabled content is `on-surface` at 38 %, disabled containers at 12 %.
- Variants are Tailwind's own (`hover:`, `focus-visible:`, `disabled:`) and
  the data attributes React Aria emits (`data-pressed:`, `data-selected:`,
  `data-entering:`, `data-exiting:`). No Tailwind plugin.

## Classes and parts

- Merge classes with `cn` from `<kit>/utils.ts`, and build styles with its
  `tv`. They know the kit's scales, so a `className` passed by a caller wins
  over the kit's own utility. A second merge function in the project must be
  built from the kit's `twMergeConfig`, or overrides produce two competing
  classes.
- Every kit root carries `data-slot="<component>"`. Target a part by its slot,
  never by a class name.
- Anything backed by React Aria is a client component. `Card`, `ListItem`,
  `MenuItem`, `Tag`, `Divider`, `TopAppBar`, `EmptyState`, `DialogContent` and
  the type primitives render on the server.
- Icons are any component taking `{ size, className }`. The kit ships no icon
  library.

## What a project may change

One rule: **an edit of a kit file is allowed, priced and rarely needed.**

- **Allowed.** The kit's files are in the project's tree, and the project may
  edit any of them.
- **Priced.** An update replaces every kit file that differs, edited or not:
  the CLI cannot tell the two apart. So each edit is put back by hand, from
  the diff, at every update, and an edit nobody wrote down is lost there.
  `node <kit>/changed.mjs`, run before the update, lists the kit files the
  project changed; it puts nothing back.
- **Rarely needed.** First try, in order: a token in `DESIGN.md` (the
  `ds-theme` skill), a `className` on the component, a class on one of its
  named parts through `classNames` (on a component whose doc comment lists
  its parts: `Tooltip`, `Card`, `Table`'s `Column` and `Cell`, `IconButton`;
  a part's name is a prop, and a release that renames one lists it as a
  break), a wrapper component in the project, a new component beside the
  kit. Edit a kit file last, and write
  the edit down where the project keeps its notes for agents, with the file's
  path.

What an update promises depends on the layer a file is in. There are three,
and the project's identity lives in the first two.

| Layer             | Files                                                                                         | The project may                                              | A kit update                                                  |
| :---------------- | :-------------------------------------------------------------------------------------------- | :----------------------------------------------------------- | :------------------------------------------------------------ |
| **Tokens**        | the project's `DESIGN.md` and its generated `theme/`                                          | change anything, through `DESIGN.md` (the `ds-theme` skill) | never touches them                                            |
| **Style modules** | `<kit>/components/field-styles.ts`, the field container behind every text-like field          | edit the file                                                | replaces it, keeping slot and variant names; the edit is put back by hand |
| **Behaviour**     | every other kit file: the components, `<kit>/utils.ts`, `<kit>/render-props.ts`, `<kit>/icons.tsx` | edit a file, at the price above                              | replaces them, with Material's and accessibility's fixes, keeping no name; the edit is put back by hand |

- **A token change is free.** Colours, type, corners, elevation, motion,
  state opacities and dark mode all come from `DESIGN.md`. If a look can be
  reached there, reach it there.
- **A style-module edit costs one merge per update.** Edit
  `<kit>/components/field-styles.ts` when the field anatomy itself must change
  (stacked labels instead of floating ones). Its slot and variant names are
  kept across updates; what a slot contains may change. An update replaces
  the file, and the project's edit is put back by hand from the diff.
- **An edit of any other kit file costs one merge per file per update**, and
  an update promises nothing about what is inside it.
- **The kit's own theme files are the wrong place for a look**:
  `<kit>/tokens/theme.css`, `<kit>/tokens/theme.v4.css`,
  `<kit>/tokens/DESIGN.resolved.md`, `<kit>/DESIGN.md`. They are the kit's
  default, an update rewrites them, and a token reaches the same look for
  free: the project's look is its own `DESIGN.md`.
- What tokens cannot reach today: the disabled alphas (38 % and 12 % are
  written into the components) and each component's own anatomy.

## Adding and updating

```bash
npx shadcn add @ds/ds       # the whole kit, the first time
npx shadcn add @ds/button    # one component and what it needs
```

No `add` writes a colour into the project's CSS or touches `DESIGN.md` or
`theme/`.

**Updating is not the same command.** Over an existing install, a plain `add`
asks about the first kit file that differs, defaulting to No, even under
`-y`; with no one to answer it writes nothing, or waits for ever. First ask
the kit which of its files the project changed, since the update replaces
them:

```bash
node <kit>/changed.mjs
```

It lists them and writes nothing (exit 0: none; 1: the files listed; 2: it
cannot tell, as for a kit installed before 0.3.0). Then update from a clean
working tree with

```bash
npx shadcn add @ds/ds --overwrite -y
```

then read `git diff`, put back the project's edits, and regenerate the
project's theme where it has one. The steps are in the `ds-theme` skill, "Taking a kit
update": steps 1 to 3 for every project, steps 4 and 5 (regenerate, lint)
only when the project generated a theme of its own.
