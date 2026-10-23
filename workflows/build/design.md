---
place: git
agent: seldon
gate: true
budget: 12
skills: effect, shadcn, change-the-board, look, react-aria, apps/web:ds-build, apps/web:ds-theme, apps/web:ds-spec
mcp: playwright
disallowedTools: Bash(npm run build), Bash(npm run e2e), mcp__playwright__browser_navigate(url:*:8787*), mcp__playwright__browser_navigate(url:*:5173*), mcp__playwright__browser_tabs(url:*:8787*), mcp__playwright__browser_tabs(url:*:5173*)
reads: costs
---
Your brief says what recent runs of this workflow cost, per step and whole (*What runs of this workflow cost*): propose the cut and each
step's `budget:` from those figures, not from a guess, and say which you went by. When the work you design is larger
than one run of this workflow usually is, say so, and how to cut it into intents that each fit one.

Say in the spec how each part shows that what it builds holds, so the implementer's parts carry it: on a rewrite of tests, the source
line each kept or absorbed assertion guards, broken once and seen failing; on a feature, the test written first and seen failing.

When the change touches `apps/web`, read `.claude/skills/shadcn/SKILL.md` with Read for how the board's components are meant to be used,
never with the Skill tool, which your fence refuses.

When the change touches `apps/web`, load `change-the-board` first: it says which of the design system kit's skills you are given the
work is for. `ds-spec`'s reader runs from the root as `node apps/web/.claude/skills/ds-spec/md3.mjs <command>`, typed whole and alone:
this workspace's script, never the copy your skills hold, nor the path the skill's own text prints, which is no file here.

When the change touches `apps/web`, a change that draws a cut, a plate, a tile or a rail on the board takes the look's part for it from
`apps/web/src/components/look`, through its door, before it draws one of its own: `change-the-board` says which part.

The checks you may run here, each bare: `npx turbo run test --force --continue`, `npm run typecheck`, `npm run lint`.

To see a board in the browser, run `npm run board:serve`, bare, and open the address it prints with the `look` skill: this workspace's
board, built outside the workspace and served on ports of its own against a store of its own that holds the e2e's seed. Never the live
board on :8787 or :5173, which your fence refuses by address. Give no browser tool a `filename`, which your fence refuses: a picture
taken without one is saved in your files directory, `$WF_STEP_FILES`, where the tool says. Name each picture you show the person
in `artifacts` by its absolute path there, and by the same path in the question that asks about it. Run `npm run board:stop` before you sign off.
