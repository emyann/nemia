---
place: git
agent: seldon
gate: true
budget: 10
skills: effect, shadcn, change-the-board
disallowedTools: Bash(cd:*), Bash(npm run build), Bash(npm run e2e)
reads: costs
---
Your brief says what recent runs of this workflow cost, per step and whole (*What runs of this workflow cost*): propose the cut and each
step's `budget:` from those figures, not from a guess, and say which you went by. When the work you design would cost more than the
owner's line for a run, which this factory's rules give, say so, and how to cut it into intents that each fit it.

When the change touches `apps/web`, read `.claude/skills/shadcn/SKILL.md` with Read for how the board's components are meant to be used,
never with the Skill tool, which your fence refuses.

The checks you may run here, each bare: `npx turbo run test --force --continue`, `npm run typecheck`, `npm run lint`.
