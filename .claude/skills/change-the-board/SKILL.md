---
name: change-the-board
description: "Any change under apps/web/ — a route in apps/web/src/routes, a component in apps/web/src/components, a hook or helper in apps/web/src/lib, a style, an e2e page — and the design or review of one: load it before reading, writing or judging a file there. It sends you to the board's components (shadcn), to the design system kit's own skills (ds-build, ds-theme, ds-spec) and to the board's traps (apps/web/CLAUDE.md)."
applies: ["apps/web/**"]
---

# Change the board

1. **Move your shell into `apps/web` first**: `cd apps/web` from the repository's root, where a step's session starts. The board's
   components are shadcn's on React Aria, and shadcn's skill reads the project as it loads, by a command that answers only where
   `components.json` is: from the root it refuses with `monorepo_root`, and the skill is not loaded.
2. **Then load `shadcn` with the Skill tool**, before you read or write a component, and go back to the root (`cd ../..`) once it has
   answered: the checks run from there.
3. **Where your fence refuses `cd` and that skill** (a step that designs or reviews), move nowhere: read
   `.claude/skills/shadcn/SKILL.md` with Read, and, for the facts its command would have printed, `apps/web/components.json` and the
   files of `apps/web/src/components/ui`.
4. **Its CLI runs from `apps/web`**, or from the root with `-c apps/web`. Its rules know radix and base, not React Aria: on the board
   the reference is what `npx shadcn@latest add <component> --view <file>` prints, never what you remember.
5. **Read `apps/web/CLAUDE.md`** before you change a page: it holds the board's traps, and how its e2e runs.
6. **Then load the design system kit's skills, where the work is theirs.** They are in `apps/web/.claude/skills`, not at the root, and
   the first list of skills you were shown holds none of them: the list gains a nested folder's skills once you have read a file under
   it. So read `apps/web/CLAUDE.md` with Read first (item 5), then load each with the Skill tool by its bare name, from the root, with
   no `cd`, in a fenced step too: `ds-build` before you design, write or judge anything drawn with the kit's parts or its roles,
   `ds-theme` before a change to `apps/web/DESIGN.md` or the theme, `ds-spec` when a decision cites Material. Where the Skill tool
   does not know the name, read `apps/web/.claude/skills/<name>/SKILL.md` with Read: the text is the same.
7. **The project they speak of is `apps/web`**, not the repository's root: their `DESIGN.md`, `theme/` and `components.json` are the
   ones there, and their `<kit>` is `apps/web/src/components/ui/ds`. From the root, `ds-spec`'s command is
   `node apps/web/.claude/skills/ds-spec/md3.mjs <command>`, typed whole and alone, which a fenced step may run too. A fenced step
   runs none of the commands `ds-theme` and `ds-build` name: it reads what they say and the files they point at.
8. **For a part the kit ships, the reference is `ds-build` and the part's own file** under `apps/web/src/components/ui/ds/components`,
   its doc comment first. `shadcn` stays the reference for the board's shadcn components (`apps/web/src/components/ui/*.tsx`) and for
   the CLI that installs either family.
9. **For a cut, a plate, a tile or a rail, take the look's own part** before you draw one: they are in
   `apps/web/src/components/look`, taken through its door (`@/components/look`), never from a part's own file. `CutFrame` for a card
   or a table in a cut frame (with `FRAMED_BOX`, `FRAMED_END`, `FRAMED_TABLE` and `FRAMED_ROW` around a table), `CutTag` for a tag
   with a cut corner, `CutButton` for the filled cut button that is a link to a route and `CutPress` for the one that is pressed,
   and `cutShape`, `cutRing` and `cutPoints` for a new part that takes the cut; `Plate` for a section's heading and `PageName` for
   a page's name; `Sticker` for a tile that carries a number and `StatTile` for one over its breakdown; `RunSteps` for a run's rail;
   `ScanLines` for the ground of a page; `Pager`, `TextLink` and `CopyId`. Each is shown in its stories beside it
   (`<Part>.stories.tsx`): `npm run storybook`, from `apps/web`, serves them to a person on port 6007, and `npm run board:serve`
   prints a third line, `stories on <address>`, where a step given a browser opens them. A new part of the look gets its stories in
   the same change, and its name here.
