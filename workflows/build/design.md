---
place: git
agent: seldon
gate: true
budget: 10
skills: effect, shadcn, change-the-board, look
mcp: playwright
disallowedTools: Bash(cd:*), mcp__playwright__browser_run_code_unsafe, mcp__playwright__browser_console_messages(filename:*), mcp__playwright__browser_evaluate(filename:*), mcp__playwright__browser_network_request(filename:*), mcp__playwright__browser_network_requests(filename:*), mcp__playwright__browser_snapshot(filename:*), mcp__playwright__browser_take_screenshot(filename:*), Bash(npm run build), Bash(npm run e2e), mcp__playwright__browser_navigate(url:*:8787*), mcp__playwright__browser_navigate(url:*:5173*), mcp__playwright__browser_tabs(url:*:8787*), mcp__playwright__browser_tabs(url:*:5173*)
reads: costs
---
Your brief says what recent runs of this workflow cost, per step and whole (*What runs of this workflow cost*): propose the cut and each
step's `budget:` from those figures, not from a guess, and say which you went by. When the work you design would cost more than the
owner's line for a run, which this factory's rules give, say so, and how to cut it into intents that each fit it.

When the change touches `apps/web`, read `.claude/skills/shadcn/SKILL.md` with Read for how the board's components are meant to be used,
never with the Skill tool, which your fence refuses.

When the change touches `apps/web`, load `change-the-board`, then the design system kit's skills where the work is theirs, each loaded
as `change-the-board` says: `ds-build` before you design, write or judge anything drawn with the kit's parts or its roles, `ds-theme`
before a change to `apps/web/DESIGN.md` or the theme, `ds-spec` when a decision cites Material.

The checks you may run here, each bare: `npx turbo run test --force --continue`, `npm run typecheck`, `npm run lint`.

To see a board in the browser, run `npm run board:serve`, bare, and open the address it prints with the `look` skill: this workspace's
board, built outside the workspace and served on ports of its own against a store of its own that holds the e2e's seed. Never the live
board on :8787 or :5173, which your fence refuses by address. Give no browser tool a `filename`, which your fence refuses: a picture
taken without one is saved outside the workspace, where the tool says. Run `npm run board:stop` before you sign off.
