---
name: ds-build
description: Build screens and components with the MD3 kit installed in this project. The rules for styling with it (role utilities and their pairing, the type primitives, state layers), where to read the project's real values, and what a project may change (tokens, style modules) against what is forked at its own cost. Use before writing or reviewing any UI that uses the kit, and before editing a kit file.
---

# ds-build: building with the kit

The kit is Material Design 3 components on React Aria and Tailwind v4, copied
into this project. Its files are the project's to read, and mostly not to
edit: what may change, and how, is the last section.

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

A component the kit does not have is written beside the kit, not inside it, on
`react-aria-components`, following the rules below.

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

Three layers. The project's identity lives in the first two.

| Layer             | Files                                                                                         | The project may                                              | A kit update                                                  |
| :---------------- | :-------------------------------------------------------------------------------------------- | :----------------------------------------------------------- | :------------------------------------------------------------ |
| **Tokens**        | the project's `DESIGN.md` and its generated `theme/`                                          | change anything, through `DESIGN.md` (the `ds-theme` skill) | never touches them                                            |
| **Style modules** | `<kit>/components/field-styles.ts`, the field container behind every text-like field          | fork the file                                                | keeps slot and variant names; the fork is put back by hand    |
| **Behaviour**     | every other kit file: the components, `<kit>/utils.ts`, `<kit>/render-props.ts`, `<kit>/icons.tsx` | nothing: compose, wrap, pass `className`                     | replaces them, with Material's and accessibility's fixes      |

- **A token change is free.** Colours, type, corners, elevation, motion,
  state opacities and dark mode all come from `DESIGN.md`. If a look can be
  reached there, reach it there.
- **A style-module fork costs one merge per update.** Edit
  `<kit>/components/field-styles.ts` when the field anatomy itself must change
  (stacked labels instead of floating ones). Its slot and variant names are
  kept across updates; what a slot contains may change. An update replaces
  the file, and the project's edit is put back by hand from the diff.
- **Anything else edited in `<kit>/` is a fork at the project's cost.** An
  update replaces every kit file that differs, forked or not: the CLI cannot
  tell the two apart. So each fork is one more edit to put back by hand at
  every update, from the diff, and a fork nobody remembers is lost there.
  First try, in order: a `className` on the component, a wrapper component in
  the project, a new component beside the kit. Fork last, and write it down
  where the project keeps its notes for agents, with the file's path.
- **Never edit to change a look**: `<kit>/tokens/theme.css`,
  `<kit>/tokens/theme.v4.css`, `<kit>/tokens/DESIGN.resolved.md`,
  `<kit>/DESIGN.md`. They are the kit's default and an update rewrites them.
  The project's look is its own `DESIGN.md`.
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
`-y`; with no one to answer it writes nothing, or waits for ever. Update from
a clean working tree with

```bash
npx shadcn add @ds/ds --overwrite -y
```

then read `git diff`, put back the project's forks, and regenerate the
project's theme where it has one. The steps are in the `ds-theme` skill, "Taking a kit
update": steps 1 to 3 for every project, steps 4 and 5 (regenerate, lint)
only when the project generated a theme of its own.
