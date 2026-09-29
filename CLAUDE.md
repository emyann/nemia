# Nemia — contributor guide

Two packages and two apps. `packages/agent-runtime` runs one agent session to completion, durably (the `ae` CLI; `src/core/domain.ts` is
the whole judgement). `packages/agent-orchestrator` sequences runtime tasks into runs of steps — a folder of markdown is a workflow (the
`wf` CLI). `apps/api` puts the workflows behind HTTP; `apps/web`, the board, talks to it. Dependencies point down that list, never up.
Read `README.md` and each package's README for the model before changing behaviour. The `wf` and `ae` commands and the stores
`~/.agent-workflows` (`WF_ROOT`) and `~/.agent-engine` (`AE_ROOT`) keep their older names on purpose: a new default would orphan every
record there.

Each package and app has a `CLAUDE.md` of its own with the traps of its code; Claude Code reads it when you work in that folder. This file
holds what every change needs.

## Check your work

- `npm test` — turbo runs `node --test test/*.test.ts` in every package, and `src/**/*.test.ts` where a package keeps tests beside its
  code, in parallel, with `--continue`. Not bare `node --test` from the root. To measure, type `npx turbo run test --force --continue`:
  without `--force` turbo replays a cached pass. Read `Failed:` first: a file marked `✖` with no failing test inside it is a package
  turbo interrupted, not a failure of that file.
- `npm run typecheck` — `tsc --noEmit` per package, over its `src` and its `test/` (the web's `test/e2e/` under its own tsconfig);
  `agent-orchestrator/test/suite.test.ts` refuses a test file no typecheck reads.
- `npm run lint` — oxlint (`.oxlintrc.json`) and `oxfmt --check` (`.oxfmtrc.json`); `npm run format` writes the layout. Every shipped
  `check:` runs it after the types. A rule turned off, or a line allowed with `oxlint-disable-next-line`, says why beside it.
- `npm run build`, then `npm run e2e`, when you touch `apps/web`, and read the pictures the e2e writes (`apps/web/CLAUDE.md`).
- Run them before you commit. Green is the floor, not the bar: a change that makes the suite pass by weakening a test is a finding to
  report, not a fix.
- Turbo does not see `workflows/`: after touching a workflow folder, run `npx turbo run test --force --continue`. The same goes for a
  change only to a doc: some tests read docs.

## How to test

- **A guard is proven by a test that makes it refuse**, at shipped defaults. A test that asks whether it allows proves nothing; guards
  tested that way have been silently inert.
- **A rule about order or names is proven by a fixture that breaks it.** Give the fixture the opposite order or another name, and check
  the test fails without the rule.
- **A time measured on a machine is a floor, never a ceiling.** Assert identities (the parts add up to no more than the whole), not
  wall-clock bounds, and wait for the event you count, never for a length of time.
- **A test that fails only under load is a race until shown otherwise.** Make it happen on demand first — a throwaway `--import` hook
  through `NODE_OPTIONS`, a process frozen with `SIGSTOP` (wait for `ps -o stat=` to say so before `SIGCONT`) — then fix it.
- **Temporary folders come from `scratch(prefix)`**, never `os.tmpdir()`; `scratch.test.ts` refuses the call. Bound every background
  process a test starts, and every loop you run in the background yourself (`timeout 120 bash -c '…'`).
- **A test that depends on the environment sets it.** A run's checks inherit the daemon's environment (`WF_MAX_CONCURRENT=50` on the
  owner's machine), so a test that relies on a default passes there and fails by hand.
- **Assert on `err.message`,** never `assert.throws(fn, /^…/)`: that matches `String(err)`, which starts with `Error: `.
- **A test that reads source text ends a slice on a name that must exist,** and matches across line breaks (`\s*`): a formatter moves
  them, and a pattern that no longer matches makes an assertion of absence pass for nothing.
- **A type-aware lint fix trusts the type; a guard exists because a caller does not.** A value from a page, a journal, a harness or JSON
  arrives as it is: read every line a `--fix` changes in `src` before keeping it.
- **A file written through a tool can turn an escape into the character it names**: a raw NUL, DEL or byte order mark. Build such a
  character with `String.fromCharCode`, and after writing an escape of one, look for the raw bytes (`grep -rl $'\xEF\xBB\xBF'`): the
  apps' `source.test.ts` refuses a raw control character, and no test refuses a BOM.
- **A field moved to another key still passes the typecheck where it is read through a cast, a `Record` or JSON**: grep the tests for
  the old key, read the passing ones too, and check a comparison still fails with a mutant. A wrong type passed on purpose to prove a
  refusal says so with `as never` where it does.
- **An optional field added to a returned type is dropped by every caller that rebuilds the answer field by field.** Grep for each
  place that spreads or rebuilds the type, and give the new fact one writer.

## Rules the code keeps

- **The runtime is finished.** It runs one workload on one harness; anything that knows about a second workload is the upper layer.
  `decide` (`agent-runtime/src/core/domain.ts`) is pure and stays a screen long; `agent-runtime` (`src/facade.ts`) and `agent-runtime/effect`
  (`src/index.ts`) are the export lists, and neither exports `decide`. A knob on the workload is a field carried on the task and read by a
  runner, never a callback into `decide`, and no `if` in `engine.ts` belongs in `decide`.
- **Three rules hold the layers, each a test** (`docs/architecture.md`):
  - *Between packages, only the public contract*: `agent-runtime` and `agent-runtime/effect`; `agent-orchestrator`,
    `agent-orchestrator/run`, `agent-orchestrator/workflow` and `agent-orchestrator/effect` — never a subpath outside `exports`, a
    relative path, `import.meta.resolve` or a path into `src/` (the two `contract.test.ts`).
  - *Inside the orchestrator, every file is pure, store, controller or the client* (`PURE`, `STORE`, `CONTROLLER`, `CLIENT` in
    `packages/agent-orchestrator/test/boundary.test.ts`); a new file joins one kind, or the suite fails.
  - *The runtime is reached through one client*, `src/runtime-client.ts`.
- **Level-triggered.** A tick reads the world, decides, acts, and carries nothing between passes. A guard that only fires on a
  transition is wrong after a restart.
- **One writer per file.** The tick writes the run record; a person's facts (`.cancelled`, an ask) get their own files, composed on read.
- **A check that did not finish is not a refusal.** Only a numeric exit is a verdict on the work (`refusedCheck`); `wf retry <run> <step>
  --recheck` runs it again — never a hand edit of a journal or a record.
- **No command from a checkout.** A `check:` comes from the workflow folder frozen on the run record at `wf start`.
- **Prose is not a constraint.** If the packages need an agent to do something, the machinery refuses the alternative.
- **Errors say what to do next.** Throw `Error` with `.exitCode = 2` and a message naming the fix.
- **Code reads by itself.** No `//` or `/* */` comment in code but a lint or TypeScript directive with its `-- reason`; a JSDoc sits on
  a file's head or a declaration and says what it is, takes, returns and refuses — never its history, a workaround, a run, a date or a
  card: history lives in git, CLAUDE.md and the tests. A comment is never evidence that a problem is settled: read the code and its test.
  - The guards: the oxlint plugin `lint/comments.ts`, oxlint's `no-warning-comments` and `no-inline-comments`, in one override block per
    package in `.oxlintrc.json`, and a test that a name a comment quotes in backticks is one the code has
    (`packages/agent-orchestrator/test/comments.test.ts`, with its short list of other programs' words).
  - A block is off while its `excludeFiles` names its package. The card that cleans a package switches its guards on by deleting that
    one line, and edits nothing shared. The runtime's block also covers `lint/**`, the guards' own plugin; no other block lists it.
  - A JSDoc on a parameter, a union member or a local is refused: say it as an `@param` line or in the declaration's JSDoc. `oxfmt`
    rewraps no comment, so a line you join stays within its 140 columns; a `(` `)` it drops once a comment inside them goes is its own.
- **A limit is met by cutting the function** (500 code lines a file, 80 a function, cyclomatic 20, cognitive 15), never by raising a
  ceiling in `.oxlintrc.json`. The commit that shrinks a baselined file lowers its ceiling there and its count in
  `packages/agent-orchestrator/test/limits.test.ts`, which refuses one left loose; a move renames both.
- **A state machine is drawn by its code.** A new machine prints its own Mermaid diagram, held between `diagram:<name>` markers in its
  package's docs whose begin line names the command; never a drawing. `agent-orchestrator/test/diagrams.test.ts` refuses a drift.
- The Kubernetes test for a new field on the runtime's task: does `batch/v1` have a field for it?

## Git

- Commit on your branch, in small coherent commits with plain messages: a short imperative subject, an optional body saying why. **No
  attribution trailers**, no session URLs.
- **A workflow step never pushes, never merges into the base branch, never force-deletes a branch**, and its agent's `disallowedTools:`
  refuses the push and the delete (a `dontAsk` agent's: no allow reaches them; `packages/agent-orchestrator/test/agent-fences.test.ts`).
  `.claude/settings.json` denies none of it: pushing and opening a pull request are the person's, or done by their session when they ask.
  A person merges after a trial merge. The one exception is a run's ending step (a workflow's last step, `workspace: main`), filed only
  once a person approves it: it stages the merge of the run's own result branch, and the run executes the ship's `check:` on the merged
  tree and commits on exit 0 or aborts the merge (`landingDue`).
- If you are a workflow step, commit as you go: the run commits only what you leave uncommitted, in one commit under your step's name.

## When you miss

- A trap that cost you time is a lesson: better as a test that refuses the mistake, else three lines at most in the `CLAUDE.md` of the
  package it concerns — the rule and the file that embodies it, no story. The `CLAUDE.md` files are merged by union (`.gitattributes`):
  whoever merges reads the file and tidies it.
- If a step fails its check twice, the fix is content — the brief, the workflow folder, a `CLAUDE.md`, a test — not a hand edit nobody
  records.

## Where things are

- `docs/architecture.md` — the layers, what each owns and its public contract, and the rules that hold them.
- `packages/agent-orchestrator/docs/features.md` — what is still to build, in order.
- `packages/agent-runtime/docs/open-issues.md` — what is still wrong or half-verified.
- `.claude/skills/` — the repository's skills: `look` and `effect` (ours; `effect` is how we write Effect 4) and `shadcn`
  (vendored, pinned in `skills-lock.json`; its CLI runs from `apps/web`, where `components.json` is).
- `.codex/rules/git-commit.rules` — lets a Codex step commit its own work in a worktree.
