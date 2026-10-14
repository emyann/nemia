---
name: ds-theme
description: "Use when the look of this project's design system is to change: a colour, a font, a weight, corners, elevation, motion or dark mode, anything in DESIGN.md or the theme folder, and when the Material 3 (MD3) kit in the ds folder is updated. Writes the project's DESIGN.md from a brief, generates the theme from it, reads the warnings, wires the entry CSS, and takes a kit update without losing the theme."
---

# ds-theme: the project's look comes from its DESIGN.md

The project decides its look in one file, `DESIGN.md` at its root. The kit's
generator turns that file into the theme the components read. Nobody edits a
generated file: the next generation writes it again. And a look is not what
a kit file is edited for: that edit is allowed but priced (the `ds-build`
skill, "What a project may change"), and `DESIGN.md` reaches the look for
free.

`<kit>` below is the kit's folder in this project: the `ds` folder under the
`ui` alias of `components.json` (`src/components/ui/ds` in most projects).
Find it once, then read every `<kit>/…` path with it.

| File                              | Whose   | What it is                                                                 |
| :-------------------------------- | :------ | :------------------------------------------------------------------------- |
| `DESIGN.md`                       | project | The look, as decided. The only file edited                                 |
| `theme/theme.css`                 | project | Generated: the 49 colour roles in both schemes, the font hooks             |
| `theme/theme.v4.css`              | project | Generated: the Tailwind mapping with the project's type, corners, motion   |
| `theme/DESIGN.resolved.md`        | project | Generated: the complete DESIGN.md, every value filled in. Read it, never edit it |
| `<kit>/DESIGN.md`                 | kit     | The kit's neutral default, the starting file. Copied, not changed: an update rewrites it |
| `<kit>/tokens/theme.css`          | kit     | The default theme, what the project shows until it generates its own       |
| `<kit>/tokens/theme.v4.css`       | kit     | The default mapping, and the template the generator writes the project's from |
| `<kit>/tokens/generate-theme.mjs` | kit     | The generator's command                                                    |
| `<kit>/tokens/design-md.mjs`      | kit     | The derivation it runs                                                     |

What every name in a DESIGN.md means to the kit, what is ignored and what is
refused is in `design-md.md`, beside this file
(`.claude/skills/ds-theme/design-md.md`). Read it before writing a role, a
type value or the reference block.

If `<kit>/tokens/generate-theme.mjs` is missing, the whole kit was not
installed: run `npx shadcn add @ds/ds` first.

## 1. Start from a file

If the project has no `DESIGN.md` at its root, copy the kit's:

```bash
cp <kit>/DESIGN.md DESIGN.md
```

If it has one, keep it: it is the project's decision. Never overwrite it with
the kit's, and never write the project's look into `<kit>/DESIGN.md`, which an
update replaces.

## 2. Write the brief into it

Turn the brief into tokens in the front matter, and say why in the prose. The
prose is for people and for the next agent; the generator reads only the front
matter and one CSS block.

- **`name`, `description`**: the project's, not the kit's.
- **`scheme`**: `light` or `dark`, the scheme the written colours belong to. A
  brief that is dark by nature (cyberpunk, a terminal, a cinema) writes
  `scheme: dark`; the light scheme is then derived from the keys. Always
  write it: with none, the generator reads it from the file's ground and
  lists that as assumed.
- **`colors`**: write `seed`: with none, the generator reads it from
  `primary` and lists that as assumed. Add `primary-key`, `secondary-key`,
  `tertiary-key` for the brief's main colours, `neutral-key` to tint the
  surfaces. Then write a role (`primary`, `surface`, `on-surface`, …) only
  where an exact colour matters: a written role holds in the written scheme
  only, a key holds in both.
- **`typography`**: at least `fontFamily` on `display-large` and
  `body-large`. The first is the brand face (display, headline, title), the
  second the plain face (body, label), and a role that writes no family keeps
  its face's. A role that writes another family takes it (labels in a squared
  face under running text in a reading face): each family is one more font
  the project loads. No `typography` at all means Roboto.
- **`rounded`**: the six corners. Sharp looks lower them all; `full` stays a
  pill unless the brief wants square buttons.
- **`## Reference CSS`** in the body: elevation (a glow instead of a shadow, a
  hairline, `none`), state layer opacities, easings, durations, and
  `--md3-dark-mode: class` or `system`.
- **The prose**: replace the kit's sections with the project's own (Overview,
  Colors, Typography, and whatever the brief needs). Remove what speaks of the
  kit's default.

A DESIGN.md that arrives from elsewhere, or a brief with colour names of its
own, is mapped by you onto `seed`, the keys and the 49 roles: see "Colour
names that are not the kit's" in `design-md.md`. The other names may stay in
the file. They are ignored and listed as warnings. A file in the format's own
words (no `scheme`, no `seed`, sizes written `title-md` and `rounded.sm`)
generates as it is, with what was assumed listed: take that as a first
drawing, then write `scheme` and `seed` into the file.

## 3. Generate

```bash
npx tsx <kit>/tokens/generate-theme.mjs DESIGN.md --out theme
```

It writes `theme/theme.css`, `theme/theme.v4.css` and
`theme/DESIGN.resolved.md`, and prints one line naming them with the number of
warnings. Record the command once in the project's `package.json`, with the
real path in place of `<kit>`:

```json
{ "scripts": { "theme:generate": "tsx <kit>/tokens/generate-theme.mjs DESIGN.md --out theme" } }
```

Never pass `--out <kit>/tokens`: those are the kit's files and an update
writes over them.

## 4. Read the warnings

Each `warning:` line on stderr is something the file says that is not in the
theme, or a pair that reads badly. They are also in `## Generator warnings`
at the end of `theme/DESIGN.resolved.md`. For each one, decide:

- **an unknown name** (`colors.brand-pink`, `typography.h1`, `rounded.pill`):
  map it to a name the kit reads, or leave it and say it is ignored;
- **assumed** (`scheme`, `colors.seed`): the file wrote none and the kit read
  it from the token the line names. Write the key into DESIGN.md, the value
  the line gives or the one the brief means;
- **a value with no variable** (a tracking on a role Material gives none):
  not applied; drop it or accept it. A weight is applied on every role;
- **poor contrast**: a written role under 4.5:1 against its pair. Fix the
  role or write its partner. Do not leave it;
- **the reference block was not read**: fix the heading, the `css` fence or
  the `:root` selector.

Exit code 1 with nothing written means the file was refused: no front matter,
no `scheme` and no `background` or `surface` to read one from, no `seed` and
no `primary`, a colour that is not a hex, or a type value, a
corner, a family or a reference value that is not one value of its kind (a
size with no unit, an easing written as a `var()`). The message names the
token and says what to write.

Then lint both files with the format's own linter:

```bash
npx designmd lint DESIGN.md
npx designmd lint theme/DESIGN.resolved.md
```

Both must end with `"errors": 0`. The linter's `missing-primary` warning on
`DESIGN.md` only says the file writes keys and no `primary` role: the kit
derives it, and the resolved file has it.

## 5. Point the entry CSS at the theme

The whole install writes nothing into the entry CSS, at a first install or
at an update: the theme is whatever that file imports. Replace the kit's two theme imports with the project's (paths
are relative to the entry CSS; here it is `src/index.css`):

```css
@import "tailwindcss";
@import "../theme/theme.css";
@import "../theme/theme.v4.css";
@import "tw-animate-css";

@custom-variant dark (&:where(.dark, .dark *));
```

- Before a theme of its own, the same two lines import
  `<kit>/tokens/theme.css` and `<kit>/tokens/theme.v4.css`. Import one pair,
  never both.
- Every `@import` stays above any other at-rule. Vite drops an `@import` that
  comes after `@custom-variant` or `@source`, silently.
- With `--md3-dark-mode: class` hold one `@custom-variant dark` line, exactly
  as above, and switch by putting `dark` on `<html>`. A project initialised
  by shadcn has `@custom-variant dark (&:is(.dark *));`, which misses the
  element that carries the class: replace it. With `system`, remove the line
  altogether: Tailwind's `dark:` then follows the system setting, as the
  theme does.
- If the project has stock shadcn components (`bg-background`, `bg-card`,
  `border-border`), they read the theme through the bridge, a file imported
  right after `theme.css`: `@import "<kit>/tokens/bridge-shadcn.css";`, with
  the real path. A project with none leaves it out.
- A `:root` or `.dark` block in the entry CSS itself comes after every import
  and wins over it. An install of 0.3.0 or earlier wrote the bridge there
  (references such as `--background: var(--md-sys-color-background)`, lines
  such as `--ring: var(--ring);` inside `@theme`, four `--radius-*` lines):
  delete them and import the bridge file instead. If either block holds a
  `--md-sys-color-*` value, or the file has an `@theme inline` block setting
  `--color-primary` and the like, it is from an older install still and
  overrides the theme: delete those declarations too. The same goes for the
  bridged names under a `@media (prefers-color-scheme: dark)` rule of the
  project's own: the theme owns both schemes.
- Load the font the theme names (see "Fonts go through a hook" in
  `design-md.md`). The theme does not fetch it.
- Tailwind scans markdown: if junk utilities appear, exclude the theme
  folder's `.md` with `@source not "../theme/DESIGN.resolved.md";`.
- If the entry CSS scans the source folder the kit is in, exclude the kit's
  files that are not components, each with `@source not` and the real path
  in place of `<kit>`: `<kit>/tokens`, `<kit>/DESIGN.md`,
  `<kit>/RELEASE.json`, `<kit>/changed.mjs`, `<kit>/LICENSE`, and the
  `releases` folder beside them where an adapter or the preset brought one.
  The theme files still reach the build through the imports. Leave
  `<kit>/utils.ts` scanned: it holds the focus ring's classes.

Build the project, then look at it in both schemes.

### See every component under the theme

The project's own pages show the components it uses. The kit's catalog shows
all of them, and it can draw them under this project's theme without the
theme leaving the browser:

1. Open the catalog. It is served at the root of the address the kit was
   installed from: take the `@ds` entry of `registries` in the project's
   `components.json` and cut it before `r/{name}.json`. Add
   `?path=/story/md3-your-theme--page` to land on the page
   **MD3 / Your theme**. If nothing is served there yet, or to work offline,
   run `npm run storybook` in a checkout of the kit's own repository and open
   the same page.
2. Hand it, by the picker or by dropping the files on the page, either
   `theme/theme.css` and `theme/theme.v4.css` together (from the project's
   `theme/` folder), or the project's `DESIGN.md` alone. One of the two
   stylesheets alone is refused: the theme is both.
3. Open any story. Switch light and dark with the toolbar's **Theme**; the
   toolbar's **Preset** reads "Your theme (handed)" while the theme draws,
   and Preset → Material shows the kit's default again for comparison.

Tell the person what the page says it does not do: it loads no font (a family
the theme names draws only if the machine has it, else the stack behind it),
and it obeys the toolbar for dark whatever `--md3-dark-mode` says. Handed a
`DESIGN.md`, the page lists the generator's warnings, contrast included; read
them as in step 4. Nothing is uploaded: the files are read in the browser and
kept in its storage until "Forget this theme".

## 6. Keep it true

Commit `DESIGN.md` and the three files in `theme/` together. In the project's
CI, run `theme:generate` and fail on a diff of `theme/`, so the theme is
always its DESIGN.md's.

## Taking a kit update

The project's theme is in `theme/`, where no item of the kit writes, so an
update cannot touch it. The kit's own files are another matter: the CLI keeps
no record of what it installed, so it cannot tell a file the kit changed from
a file the project edited. A plain `npx shadcn add @ds/ds` asks about the
first kit file that differs, defaulting to No, even under `-y`; with no one to
answer, it writes nothing at all, or waits for ever. So an update takes the
kit's files whole and lets git show what moved. **Before it, ask the kit which
of its files the project changed:**

```bash
node <kit>/changed.mjs
```

It compares each kit file, and each skill, with the release it was installed
from, which `<kit>/RELEASE.json` records. It writes nothing and merges
nothing. **Its last line is the update command for what this project holds:
keep it for step 2.** Its exit code says which answer it gave:

- **0**: no recorded file of what the project holds differs or is missing.
  Step 3 has nothing to put back.
- **1**: it lists files in three groups. `changed`: the text differs, and
  step 2 loses that edit: these are the files to put back in step 3.
  `whitespace`: the same text laid out differently, which is a formatter or
  an indent, and also a change of spaces inside a string or a class list;
  step 2 puts the kit's layout back. `missing`: a file of the whole install,
  or of an adapter or preset the project holds, is not there; step 2 brings
  it back, so delete it again if the project removed it on purpose. Keep the
  list.
- **2**: it cannot tell, and says why. There is no `<kit>/RELEASE.json`: the
  kit was installed before 0.3.0, and the update that follows brings the
  record. Or `components.json` makes the CLI rewrite the files as it installs
  them (`tsx: false`, a Tailwind prefix, `cssVariables: false`). Then the
  update is as below, and `git diff` alone says what moved.

The whole install does not bring the three adapters (`@ds/next-adapter`,
`@ds/react-router-adapter`, `@ds/react-hook-form-adapter`) or the Editorial
preset (`@ds/preset-editorial`): a project asks for each by name. The check
knows which of them the project holds, and says two more things that do not
change the exit code:

- `Not installed, and no finding`: those of which nothing is here, in one
  line. `node <kit>/changed.mjs --missing` names every recorded file that is
  not here, with its item and whether the project holds it.
- `behind`: one the project holds at an earlier release than the kit's
  other files, because an update named only `@ds/ds`. The command on the
  check's last line takes it.

What it cannot know: a file the project wrote beside the kit is not looked
at; an adapter or preset installed at 0.3.0 has no record of its own, so if
its file differs it is listed as `changed` and the check says it may be
behind instead; and a formatter that moves more than whitespace (quotes,
commas, parentheses) makes every file it touched `changed`, so keep `<kit>`
and `.claude/skills/` out of the project's formatter and linter (one
`ignores` entry in an ESLint flat config, one line each in
`.prettierignore`). Nothing is set aside: a comment put at the top of a kit file
(`// @ts-nocheck`) is listed like any edit. A project that has no `<kit>/changed.mjs` gets it alone, with no
other file touched, by `npx shadcn add @ds/changed`.

1. Commit, or stash, everything first. The working tree must be clean: the
   next step's diff is the update.
2. Take the kit's files whole, with the command the check printed. For a
   project that holds no adapter and no preset it is

   ```bash
   npx shadcn add @ds/ds --overwrite -y
   ```

   and for one that holds some, each is named in it, or it stays at the old
   release:

   ```bash
   npx shadcn add @ds/ds @ds/next-adapter @ds/react-hook-form-adapter --overwrite -y
   ```

   Every kit file that differs is replaced. The project's `DESIGN.md`,
   `theme/` and the entry CSS's imports are no item's target and stay as they
   are.
3. Read `git status` and `git diff`: it is what the update changed. A kit
   file the project had edited (the ones the check listed under `changed`;
   see the `ds-build` skill) shows the project's own edit removed, mixed with
   the kit's changes: put the project's edit back by hand, keeping the kit's
   changes. A file the project never edited needs nothing.

Steps 4 and 5 are for a project that generated a theme of its own (it has a
`DESIGN.md`, a `theme/` folder and the `theme:generate` script). A project
still on the kit's default theme has none of the three and stops at step 3:
build, then commit.

4. `npm run theme:generate`. The kit's `theme.v4.css` is the template, so a
   new scale or utility in the kit reaches the project's copy here.
5. Lint both files again and read the diff of `theme/`: it is what the update
   changed in the project's look. Build, then commit.

## The project's design system in Claude

Claude can hold a design system for a project, and apply it when it designs.
When the person asks for one, or asks why a design does not look like the
project:

- **It is the project's own, built from this project**: the components in
  `<kit>/`, the theme folder and `DESIGN.md`. The kit publishes none, so
  there is none to look for or to install. One shared by the kit would wear
  the kit's neutral look and change with the kit's releases.
- **The look goes one way**: `DESIGN.md`, then the generator (step 3), then
  the design system. A look found while designing is written into
  `DESIGN.md` first (step 2) and generated; the design system is then
  updated from the project. Never copy values from a design back into the
  theme folder.
- **Update it when the project's look or its kit changes**: after step 6,
  and after "Taking a kit update". It does not follow the project by itself,
  and the person chooses when.
- **How it is created and updated is Anthropic's to say, and it moves.**
  Read [Set up your design system](https://support.claude.com/en/articles/14604397) on Anthropic's help centre and
  follow the route it gives for a design system that lives in code. The
  same page says which plans have one.

## What this skill does not change

A look that tokens cannot reach (a field's label position, a component's
anatomy) is an edit of a kit file, allowed and priced: see the `ds-build`
skill, "What a project may change".
