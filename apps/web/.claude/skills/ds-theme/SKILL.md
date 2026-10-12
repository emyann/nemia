---
name: ds-theme
description: Give this project a look of its own on the MD3 kit. Write the project's DESIGN.md from a brief ("make it look like cyberpunk", a brand, a DESIGN.md written elsewhere), generate the theme from it with the kit's generator, read the warnings, wire the entry CSS, and take a kit update without losing the theme. Use whenever colours, type, corners, elevation, motion or dark mode are to change.
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
  `scheme: dark`; the light scheme is then derived from the keys.
- **`colors`**: `seed` is required. Add `primary-key`, `secondary-key`,
  `tertiary-key` for the brief's main colours, `neutral-key` to tint the
  surfaces. Then write a role (`primary`, `surface`, `on-surface`, …) only
  where an exact colour matters: a written role holds in the written scheme
  only, a key holds in both.
- **`typography`**: at least `fontFamily` on the 15 roles. The family of
  `display-large` is the brand face (display, headline, title), the family of
  `body-large` the plain face (body, label). No `typography` at all means
  Roboto.
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
the file. They are ignored and listed as warnings.

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

- **an unknown name** (`colors.brand-pink`, `typography.h1`, `rounded.sm`):
  map it to a name the kit reads, or leave it and say it is ignored;
- **a value with no variable** (a weight or tracking on a role that has none):
  not applied; drop it or accept it;
- **poor contrast**: a written role under 4.5:1 against its pair. Fix the
  role or write its partner. Do not leave it;
- **the reference block was not read**: fix the heading, the `css` fence or
  the `:root` selector.

Exit code 1 with nothing written means the file was refused: no front matter,
no `scheme`, no `seed`, a colour that is not a hex, or a type value, a
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

The install writes no colour into the entry CSS: the theme is whatever that
file imports. Replace the kit's two theme imports with the project's (paths
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
- The `:root` and `.dark` blocks the install wrote hold only references such
  as `--background: var(--md-sys-color-background)`. Leave them. If either
  holds a `--md-sys-color-*` value, or the file has an `@theme inline` block
  setting `--color-primary` and the like, it is from an older install of the
  kit and overrides the imports: delete those declarations.
- Load the font the theme names (see "Fonts go through a hook" in
  `design-md.md`). The theme does not fetch it.
- Tailwind scans markdown: if junk utilities appear, exclude the theme
  folder's `.md` with `@source not "../theme/DESIGN.resolved.md";`.

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
nothing. Its exit code says which answer it gave:

- **0**: no recorded file differs. Step 3 has nothing to put back.
- **1**: it lists files in two groups. `changed`: the text differs, and step
  2 loses that edit: these are the files to put back in step 3. `whitespace`:
  the same text laid out differently, which is a formatter or an indent, and
  also a change of spaces inside a string or a class list; step 2 puts the
  kit's layout back. Keep the list.
- **2**: it cannot tell, and says why. There is no `<kit>/RELEASE.json`: the
  kit was installed before 0.3.0, and the update that follows brings the
  record. Or `components.json` makes the CLI rewrite the files as it installs
  them (`tsx: false`, a Tailwind prefix, `cssVariables: false`). Then the
  update is as below, and `git diff` alone says what moved.

What it cannot know: a recorded file that is not there is counted, not
listed (4 after a whole install: the adapters and the preset it does not
bring); a file the project wrote beside the kit is not looked at; and a
formatter that moves more than whitespace (quotes, commas, parentheses)
makes every file it touched `changed`, so keep `<kit>` out of the project's
formatter. Nothing is set aside: a comment put at the top of a kit file
(`// @ts-nocheck`) is listed like any edit. A project that has no `<kit>/changed.mjs` gets it alone, with no
other file touched, by `npx shadcn add @ds/changed`.

1. Commit, or stash, everything first. The working tree must be clean: the
   next step's diff is the update.
2. Take the kit's files whole:

   ```bash
   npx shadcn add @ds/ds --overwrite -y
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

## What this skill does not change

A look that tokens cannot reach (a field's label position, a component's
anatomy) is an edit of a kit file, allowed and priced: see the `ds-build`
skill, "What a project may change".
