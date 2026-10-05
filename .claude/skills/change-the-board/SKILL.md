---
name: change-the-board
description: "Any change under apps/web/ — a route in apps/web/src/routes, a component in apps/web/src/components, a hook or helper in apps/web/src/lib, a style, an e2e page — and the design or review of one: load it before reading, writing or judging a file there. It sends you to the board's components (shadcn) and its traps (apps/web/CLAUDE.md)."
applies: ["apps/web/**"]
---

# Change the board

1. **Load `shadcn` with the Skill tool now**, before you read or write a component: the board is shadcn's components on React Aria.
2. **Its CLI runs from `apps/web`**, where `components.json` is. Its rules know radix and base, not React Aria: on the board the
   reference is what `npx shadcn@latest add <component> --view <file>` prints, never what you remember.
3. **Read `apps/web/CLAUDE.md`** before you change a page: it holds the board's traps, and how its e2e runs.
