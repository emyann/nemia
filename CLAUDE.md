# hkb-v2 — contributor guide

Two packages and two apps. `packages/agent-engine` runs one agent session to completion, durably
(the `ae` CLI; `src/domain.ts` is the whole judgement). `packages/agent-workflows` sequences engine
tasks into runs of steps — a folder of markdown is a workflow (the `wf` CLI). `apps/api` puts the
workflows behind HTTP; `apps/web` talks to it. Dependencies point down that list, never up. Read
`README.md` and each package's README for the model before changing behaviour.

## Check your work

- `npm test` — from the root, turbo runs `node --test test/*.test.ts` in every package
  (181 engine · 135 workflows · 16 api · 17 web at 2026-09-13). Runs from a package directory
  too. Not bare `node --test` from the root: `agent-engine/test/facade.test.ts` is cwd-relative.
  To verify a merge, run it serially — `npx turbo run test --concurrency=1` — until the api
  tests stop depending on the machine's live `claude agents` registry (plan §4b).
- `npm run typecheck` — `tsc --noEmit` per package. **This is the lint.** There is no eslint or
  biome, on purpose, until one replaces more code than it adds.
- Run both before you commit. Green is the floor, not the bar: a change that makes the suite
  pass by weakening a test is a finding to report, not a fix.
- `npm run build` too when you touch `apps/web`: the router plugin regenerates
  `src/routeTree.gen.ts` only in a vite build, so a new route file fails `typecheck` until
  `build` has run once (learned by the run that added `/runs/$runId`).
- **A guard is not proven by a test that asks whether it allows.** Every new refusal — a parser
  key, a value, a tool, a check — gets a test that makes it *refuse*, at shipped defaults. Guards
  that were only ever tested for the allowing case have been silently inert before (hkb's
  admission gate, worktree base and lease each were).

## Rules the code keeps

- **The engine is finished.** It runs one workload on one harness; anything that knows about a
  second workload is the upper layer. `decide` (`agent-engine/src/domain.ts`) is pure and stays a
  screen long; `agent-engine/src/index.ts` is the export list and the boundary — `decide` is
  not exported, on purpose. A knob on the workload is a field carried on the task and read by a
  runner, never a callback into `decide`.
- **No `if` in `engine.ts` that belongs in `decide`.** Effectful code applies one decision; the
  judgement lives in the pure function.
- **In agent-workflows, `assess` is pure and `runner.ts` is the only file that imports the
  engine.** `run.ts` reads no disk and calls no engine. `cli.ts` parses, calls, prints.
- **Level-triggered.** A tick reads the world, decides, acts, and carries nothing between passes.
  A guard that only fires on a transition is wrong after a restart.
- **One writer per file.** The tick writes the run record; a person's facts (`.cancelled`, an ask)
  get their own files, composed on read. Two writers doing read-modify-write lose updates — and did.
- **No command from a checkout.** A `check:` comes from the workflow folder frozen on the run
  record at `wf start`, never from a worktree the step can edit.
- **Prose is not a constraint.** If the packages need an agent to do something, the machinery
  refuses the alternative; a sentence in a brief is a courtesy, not a guarantee.
- **Errors say what to do next.** Throw `Error` with `.exitCode = 2` and a message naming the fix.
- The Kubernetes test for a new field on the engine's task: does `batch/v1` have a field for it?

## Git

- Commit on your branch, in small coherent commits with plain, human messages: a short
  imperative subject, an optional body saying why. **No attribution trailers**, no session URLs.
- **Never push, never merge, never `git branch -D`.** `.claude/settings.json` refuses the first
  and the last; a person merges after a trial merge runs the suite. If you are a workflow step,
  the run commits what you leave and a person decides what ships.

## When you miss

- If you find a rule the code keeps only in a comment, or a trap that cost you time, it belongs
  here. Add it in the same commit — unless a concurrent session owns this file
  (`docs/plan-hold-the-bar.md` §1), then put it in your closeout and the merger adds it.
- If a step fails its check twice, the fix is content — the brief, the workflow folder, this
  file, a test — or a stricter folder. Not a hand edit that nobody records.

## Where things are

- `docs/eval-2026-09-12/REPORT.md` — the evaluation against the four points of *how to hold the
  bar on production agent code*: gaps with `file:line`, the shape agent-workflows should take.
- `docs/plan-hold-the-bar.md` — the handoff plan: packages, owners, definitions of done.
- `packages/agent-engine/docs/open-issues.md` — what is still wrong or half-verified.
- `packages/agent-workflows/docs/features.md` — what is still to build, in order.
- `.codex/rules/git-commit.rules` — lets a Codex step commit its own work in a worktree.
