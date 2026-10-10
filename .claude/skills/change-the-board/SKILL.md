---
name: change-the-board
description: "Any change under apps/web/ — a route in apps/web/src/routes, a component in apps/web/src/components, a hook or helper in apps/web/src/lib, a style, an e2e page — and the design or review of one: load it before reading, writing or judging a file there. It sends you to the board's components (shadcn) and its traps (apps/web/CLAUDE.md)."
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
