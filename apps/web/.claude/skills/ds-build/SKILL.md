---
name: ds-build
description: "Use when writing, changing or reviewing any UI in this project, which has a design system: the Material 3 (MD3) components copied into the ds folder under its ui folder (src/components/ui/ds). Load it before adding a screen, a table, a form or a button, before choosing a colour, type or shape class, and before editing a file in ds/. Gives the rules for the role utilities, the type primitives and state layers, where the project's real values are, and what a project may change."
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

The kit holds what Material 3's specification describes, and a named group
of components of its own: each of those says "Material 3 does not describe
this component." in its doc comment and cites, beside it, the Material page
of each thing it borrows. A React Aria component that Material 3 does not
describe joins that group when one of the screens the kit measures itself
on needs it, or when a project asks the kit for it: it is built there, from
Material's foundations and the nearest Material component.
Until then, and for anything neither Material nor React Aria describes, a
component the kit does not have is the project's: it is written beside the
kit, not inside it, on `react-aria-components`, following the rules below.

For some of those the kit has a block to start from: a pager, a stepper, a
radio drawn as a tile, a carousel of content that is read, a public page's
header, an application's frame whose navigation follows its width
(`pager-block`, `stepper-block`, `radio-tile-block`,
`reading-carousel-block`, `site-header-block`, `app-shell-block`). `npx shadcn add @ds/pager-block`
copies one into the project's components, outside `<kit>`. It is the
project's from then on: edit it freely, an update of the kit never replaces
it. It imports the kit's components from `<kit>`'s barrel, so it needs the
kit at a release that has them: if it does not type-check, update the kit
first.

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

### What comes straight from React Aria

The kit wraps React Aria's components and leaves its hooks and utilities
where they are. Import these from `react-aria-components`, beside the kit's
components: using them is not leaving the kit.

| For                                              | Import                                         | With the kit                                                                                              |
| :----------------------------------------------- | :--------------------------------------------- | :-------------------------------------------------------------------------------------------------------- |
| Moving items by drag and drop, by pointer and by keyboard | `useDragAndDrop`, `isFileDropItem`             | Pass its `dragAndDropHooks` to the kit's `GridList` or `Table`: both hand React Aria's props down.          |
| A list of hundreds of rows                       | `Virtualizer`, `ListLayout`, `GridLayout`      | Around the kit's `GridList`. The layout takes sizes in pixels: a row's height is the kit row's.            |
| A list that is edited, or loaded as it is scrolled | `useListData`, `useAsyncList`, `useTreeData` | Their `items` go to the kit's `GridList`, `Table`, `Select` or `ComboBox`.                                 |
| Filtering what a field suggests                  | `useFilter`                                    | The kit's `ComboBox` filters by itself: only for a rule of your own.                                       |
| Text only a screen reader gets                   | `VisuallyHidden`                               | For a status, or a name with no visible text.                                                             |
| A page in another language, or right to left     | `I18nProvider`, `useLocale`                    | Once, around the app: the kit's dates, numbers and directions follow.                                      |

**With react-hook-form**, the kit's adapter (`@ds/react-hook-form-adapter`,
added beside the kit) binds each field, and passes the
form's errors to it. A field you bind yourself with `Controller` takes
`isInvalid` and `errorMessage` from the form's state, and
`validationBehavior="aria"` where the form decides what is valid: the field
is then marked invalid for assistive technology and the browser's own
validation does not stop the submit before the form has run. The adapter's
`FormComboBox` holds the chosen option; for a field whose value is the typed
text, the comment above it shows the binding.

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
file, `<kit>/tokens/bridge-shadcn.css`, where the entry CSS imports it. `bg-primary` and `bg-secondary` are the Material roles.

## Type, shape, elevation, motion

- **Type**: prefer the primitives, `<Title size="medium">`,
  `<Body size="small">`. A role sets how text looks and `component` says
  what it is: any of them draws a heading, `p`, `span`, `div`, `label`, `li`,
  `dt`, `dd`, `legend` or `figcaption` (`<Body component="dd">`,
  `<Title component="p">`). They carry the role's family and follow the theme's
  roles, weight included: a role's weight or family set in `DESIGN.md` is
  the one they draw. A raw `text-title-medium` sets size, line height,
  tracking and weight, and no family: write `font-title-medium` beside it,
  as the kit's own components do, and the text is in the role's family (the
  one `DESIGN.md` writes on it, else its face). The faces themselves remain,
  `font-brand` (display, headline, title) and `font-plain` (body, label). Write no weight class beside a role: it
  would win over the theme's.
  `font-mono` is the project's mono face, the one its `DESIGN.md` names or
  else the system's: write it where the project wants one (an identifier, a
  time, an amount). No kit component uses it.
- **Shape**: `rounded-shape-extra-small`, `-small`, `-medium`, `-large`,
  `-large-increased`, `-extra-large`, `-full`. Never `rounded-lg`: it does not follow the theme.
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
  `<kit>/utils.ts`; extend it, do not invent another. It is an outline with
  an unpainted 2px gap: never paint the gap, it shows the ground under it.
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
  `MenuItem`, `Tag`, `Badge`, `Divider`, `TopAppBar`, `EmptyState`,
  `Skeleton`, `DialogContent` and the type primitives render on the server.
- Content that is loading and whose shape is known: `Skeleton`, in a
  `SkeletonGroup` that says "Loading" once. Its size is a `className`, and
  so is another corner (`rounded-shape-full` for what stands for a button).
  An action in progress: `LoadingIndicator` or `ProgressIndicator`.
- A button whose action runs takes `isLoading`: it takes no second press
  and says "Loading" to a screen reader, or its `loadingLabel` ("Saving").
  What comes of the action is the page's to say: a snackbar, or a
  `role="status"` line.
- A dialog that holds a form or a list is still a `ModalDialog` with
  `actions`: give it `children` too, and they sit between the headline and
  the two buttons. `type: "submit"` and `form: "<the form's id>"` on the
  confirm make it submit the form; while it `isLoading` the dialog is not
  dismissed.

## Where the focus goes

React Aria returns the focus to what opened an overlay. The rest is the
page's, and a page that leaves it out drops the focus on the document's
body, where the next Tab starts from the top:

- **What was pressed is gone or disabled** (a row deleted, a filter chip
  removed, "Clear" that empties the list it sat in, Next at the last page):
  give the focus to what follows it, to the list, or to the heading of what
  took its place (`tabIndex={-1}`, a ref, `focusRing`).
- **The page changed** (a route, a step, a tab of the app): give the focus
  to the new page's heading, and say its name in a `role="status"` line.
- **A sticky bar** hides what takes the focus beneath it: give the scrolling
  box `scroll-pt-*` of the bar's height.
- **A snackbar** is drawn over the window's bottom edge: place its region
  above a bottom bar, a FAB or a sheet's actions with `className`.
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
  its parts: `Tooltip`, `Card`, `Carousel` and `CarouselItem`, `Table`'s
  `Column` and `Cell`, `IconButton`;
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

`@ds/ds` writes nothing into the project's CSS, and no `add` writes a colour
there or touches `DESIGN.md` or `theme/`.

**Updating is three commands**, from a clean working tree, with each adapter
or preset the project added by name written after `@ds/ds` on all three
(`@ds/ds` alone leaves it at the old release):

```bash
npx shadcn add @ds/ds --dry-run          # what the release would change, file by file; writes nothing
npx shadcn add @ds/ds --diff <path>      # the change itself, in one file the dry run marked ~ overwrite
npx shadcn add @ds/ds --overwrite -y     # take it
```

then read `git diff`. A plain `add` over an existing install is not an
update: it asks about each kit file that differs, defaulting to No, even
under `-y`, and with no one to answer it writes nothing, or waits for ever.
`--diff` with no path shows the first five files, not the changed ones:
name the file.

**A project that edits kit files** runs `node <kit>/changed.mjs` before the
dry run. The dry run marks a file the project edited `~ overwrite` exactly as
a file the kit changed, and the overwrite removes the edit; the check
compares with the release the project installed and names its edits alone,
to put back from `git diff` (exit 0: none; 1: the files listed, changed or
missing; 2: it cannot tell, as for a kit installed before 0.3.0). Its last
line is the update command for what the project holds.

The steps are in the `ds-theme` skill, "Taking a kit update": steps 1 to 4
for every project,
steps 5 and 6 (regenerate, lint) only when the project generated a theme of
its own.
