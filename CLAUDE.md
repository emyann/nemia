# Nemia — contributor guide

Two packages and two apps, each a layer that owns one thing. `packages/agent-runtime` runs agent sessions on a harness, durably: a job
that runs to its end, and a long-lived session that runs until stopped (`restartPolicy: 'Always'`); the `ae` CLI, and
`src/core/domain.ts` is the whole judgement. `packages/agent-orchestrator` owns workflows and the runs of their steps — a folder of
markdown is a workflow (the `wf` CLI). `apps/api` puts the workflows behind HTTP; `apps/web`, the board, shows them to a person.

Each layer reaches exactly the one below it, and nothing reaches up or skips one: the web reaches the api over HTTP alone
(`apps/web/test/structure.test.ts`); the api reaches the orchestrator's public entries alone (the entries:
`packages/agent-orchestrator/test/contract.test.ts`; that its source imports no runtime: its lint block, which
`packages/agent-orchestrator/test/imports.test.ts` proves); the orchestrator reaches the runtime's behaviour through its one client,
`src/runtime-client.ts` (`CLIENT` in `packages/agent-orchestrator/test/boundary.test.ts`), and its vocabulary through its pure door,
`agent-runtime/vocabulary`, from any file. Read `README.md` and each package's
README for the model before changing behaviour. `wf` becomes `nemia` (the Nemia intent); `ae` stays the runtime's CLI. The stores
`~/.agent-workflows` (`WF_ROOT`) and `~/.agent-engine` (`AE_ROOT`) keep their names on purpose: a new default would orphan every
record there.

Each package and app has a `CLAUDE.md` of its own with the traps of its code; Claude Code reads it when you work in that folder. This file
holds what every change needs.

## Check your work

- `npm test` — turbo runs `node --test test/*.test.ts` in every package, and `src/**/*.test.ts` where a package keeps tests beside its
  code, in parallel, with `--continue`; each package runs two test files at a time (`--test-concurrency=2` in its `test` script,
  chosen to keep a suite near 2 GB; `suite.test.ts` holds them equal). Not bare `node --test` from the root, nor a higher bound by
  hand. To measure, type `npx turbo run test --force --continue`: without `--force` turbo replays a cached pass. Read `Failed:`
  first: a file marked `✖` with no failing test inside it is a package turbo interrupted, not a failure of that file.
- **A step's session runs the tests of what it changed; the run's checks run the whole suite.** The test files about each file it
  changed (beside it, or under its package's `test/` naming it), and for a doc, a skill or a workflow file the tests that read it (grep
  the tests for its path), each from its package's folder as its `test` script loads it: `node --import ./test/ambient.ts --test <file>`
  in `packages/agent-orchestrator`, `node --import ./test/harness.ts --test <file>` in `apps/api`, `node --test <file>` in
  `packages/agent-runtime` and `apps/web`. Where a file alone does not say enough (a shared helper, a type many files read, a package's
  test setup), the packages it touched: `npx turbo run test --force --continue --filter=<package>`, the package by its `name`
  (`agent-orchestrator`, `agent-runtime`, `api`, `web`). Typecheck and lint run whole: they are cheap. Implement's round check runs the
  whole suite forced (`workflows/build/implement.md`), and the landing's again on the merged tree; a session runs it only to measure
  it, as the e2e's rule says. A failing test it did not run is the check's refusal, answered in the next try. Outside a run no check
  follows you: run the whole suite before you commit.
- `npm run typecheck` — `tsc --noEmit` per package, over its `src` and its `test/` (the web's `test/e2e/` under its own tsconfig);
  `agent-orchestrator/test/suite.test.ts` refuses a test file no typecheck reads.
- `npm run lint` — oxlint (`.oxlintrc.json`) and `oxfmt --check` (`.oxfmtrc.json`); `npm run format` writes the layout. Every shipped
  `check:` runs it after the types. A rule turned off, or a line allowed with `oxlint-disable-next-line`, says why beside it.
- `npm run build`, then `npm run e2e -- --pages <the pages the change touches>` (and `--photos` when pictures are due), when you touch
  `apps/web`: its assertions, in the dark theme, by workers in parallel, each with its own store, api and app (`apps/web/CLAUDE.md`).
  A session never runs it whole but to measure it: implement's round check and the landing's run every page.
- Run them before you commit, a step's session scoped as above. Green is the floor, not the bar: a change that makes the suite pass by
  weakening a test is a finding to report, not a fix.
- Turbo does not see `workflows/`, nor a doc, though some tests read docs: a step's session runs the tests that read the doc or workflow
  file it touched, and the round's check runs them all forced; outside a run, type `npx turbo run test --force --continue` after
  touching one.
- A run's check leaves what its tests cost in `WF_ARTIFACTS`, a `test-costs-<package>-<stamp>.json` per package and try; `node
  tools/test-costs/report.ts <dir>...` ranks them. A package's peak is its largest process, not the sum of the files running at once.

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

- **The runtime owns how a session runs; the layers above own what it means.** `decide` (`agent-runtime/src/core/domain.ts`) is pure
  (`agent-runtime/test/engine.test.ts` refuses a carried field read in it) and stays a screen long `(no test yet)`; `agent-runtime`
  (`src/index.ts`) and `agent-runtime/vocabulary` (`src/vocabulary.ts`) are the export lists, and neither exports `decide`
  (`agent-runtime/test/contract.test.ts`). A knob on a workload is a field carried on the task and read by a runner, never a callback
  into `decide`, and no `if` in `engine.ts` belongs in `decide` `(no test yet)`. What sits in which layer today, and what is a
  candidate to move, is in `docs/architecture.md`, *Who owns what*.
- **Four rules hold the layers, each a test** (`docs/architecture.md`):
  - *Between packages, only the public contract*: `agent-runtime` and `agent-runtime/vocabulary`; `agent-orchestrator`,
    `agent-orchestrator/run` and `agent-orchestrator/workflow` — never a subpath outside `exports`, a relative path,
    `import.meta.resolve` or a path into `src/` (the two `contract.test.ts`). The packages' entries are Effect, and the api is the
    system's public interface.
  - *Inside the orchestrator, every file is pure, store, controller or the client* (`PURE`, `STORE`, `CONTROLLER`, `CLIENT` in
    `packages/agent-orchestrator/test/boundary.test.ts`); a new file joins one kind, or the suite fails.
  - *The runtime is reached through one client*, `src/runtime-client.ts` (`CLIENT` in the same test): its behaviour through the client,
    its vocabulary through its pure door, `agent-runtime/vocabulary`, which any file may import (`VOCABULARY` in the same test;
    `packages/agent-runtime/test/vocabulary-door.test.ts` holds it pure).
  - *Each layer says its own words*: no harness word outside the runtime, no workflow word in it, no team name in a package's `src`
    (`HARNESS_WORDS`, `WORKFLOW_WORDS`, `TEAM_NAMES` in `packages/agent-orchestrator/test/words.test.ts`, which only shrink).
- **A spec here reads `docs/architecture.md` first.** A change's `where` names its layer (`agent-runtime`, `agent-orchestrator`,
  `apps/api`, `apps/web`), and in the orchestrator its feature folder and kind (pure, store, controller, client), in the api its folder;
  its `why`, and a placement finding's `rule`, cite the rule above or the *Who owns what* line, with the test that holds it.
- **Level-triggered.** A tick reads the world, decides, acts, and carries nothing between passes. A guard that only fires on a
  transition is wrong after a restart `(no test yet)`.
- **One writer per file.** The tick writes the run record; a person's facts (`.cancelled`, an ask) get their own files, composed on read
  (`packages/agent-orchestrator/test/run-store.test.ts` holds the run record's).
- **A check that did not finish is not a refusal.** Only a numeric exit is a verdict on the work (`refusedCheck`); `wf retry <run> <step>
  --recheck` runs it again — never a hand edit of a journal or a record (`agent-orchestrator/test/run.test.ts`, *a check that did not
  finish is no refusal*).
- **No command from a checkout.** A `check:` comes from the workflow folder frozen on the run record at `wf start`
  (`agent-orchestrator/test/store.test.ts`, *the frozen command*).
- **Prose is not a constraint.** If the packages need an agent to do something, the machinery refuses the alternative
  `(no test yet)`.
- **Errors say what to do next.** Throw `Error` with `.exitCode = 2` and a message naming the fix; in the orchestrator, a refusal by
  kind (`Missing`, `Conflict`, `Invalid`), and `agent-orchestrator/test/refusal.test.ts` refuses an `exitCode: 2` set by hand.
- **Code reads by itself.** No `//` or `/* */` comment in code but a lint or TypeScript directive with its `-- reason`; a JSDoc sits on
  a file's head or a declaration and says what it is, takes, returns and refuses — never its history, a workaround, a run, a date or a
  card: history lives in git, CLAUDE.md and the tests. A comment is never evidence that a problem is settled: read the code and its test.
  - The guards: the oxlint plugin `lint/comments.ts`, oxlint's `no-warning-comments` and `no-inline-comments`, in one override block per
    package in `.oxlintrc.json`, and a test that a name a comment quotes in backticks is one the code has
    (`packages/agent-orchestrator/test/comments.test.ts`, with its short list of other programs' words).
  - Every package's guards are on: no block has an `excludeFiles` (`comments.test.ts`, *no guard block has an excludeFiles*). A new
    package gets a block of its own, and the runtime's block also covers `lint/**`, the guards' own plugin; no other block lists it
    (`comments.test.ts`, *one guard block per workspace package*).
  - A JSDoc on a parameter, a union member or a local is refused: say it as an `@param` line or in the declaration's JSDoc.
    `comments.test.ts` refuses a comment line over 140 columns, since `oxfmt` rewraps none; a `(` `)` it drops once a comment inside
    them goes is its own.
- **A limit is met by cutting the function** (500 code lines a file, 80 a function, cyclomatic 20, cognitive 15), never by raising a
  ceiling in `.oxlintrc.json`. The commit that shrinks a baselined file lowers its ceiling there and its count in
  `packages/agent-orchestrator/test/limits.test.ts`, which refuses one left loose; a move renames both.
- **A state machine is drawn by its code.** A new machine prints its own Mermaid diagram, held between `diagram:<name>` markers in its
  package's docs whose begin line names the command; never a drawing. `agent-orchestrator/test/diagrams.test.ts` refuses a drift.
- **A state machine declares the verbs written from outside it**: each with the states it is taken from, the state the next pass reads
  and its guard, which the verb's refusal asks first; its diagram draws them. The lifecycle's are `VERBS`, held to their refusals by
  `agent-runtime/src/core/verbs.test.ts`; `LifecycleGraph.verbs` is required of every machine the board serves, `[]` when it has none.
- **The Kubernetes test for a new field on the runtime's task: does the Pod spec (`core/v1`) have one?** A container's command, args,
  env, volumes, restart policy, resources and priority are the runtime's; what a workflow means — a step, a gate, a check's verdict, a
  budget across tries — is not `(no test yet)`.

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

## Agents in this repository

What the `create-an-agent` skill, being generic, does not say here:

- Read `packages/agent-orchestrator/README.md`, *An agent is a node's attachment*, for the format and the four layers.
- A test that loads a shipped folder passes its place (`placesOf` in `packages/agent-orchestrator/test/team.ts`), or the repository's
  `.claude/skills/` is not found.
- A checking agent given `Bash` denies `Bash(npm run build)` and `Bash(npm run e2e)`, which `.claude/settings.json` allows other roles,
  allows by exact name the checks it runs (`npm run lint`, `npx turbo run typecheck --force`), and joins `CHECKERS` with its skill in
  `packages/agent-orchestrator/test/agent-fences.test.ts`, which holds every shipped step's fence.
- An agent's questions are an output field `{ "x-shape": "questions" }`, expanded by `packages/agent-orchestrator/src/question/question.ts`.
- Its checks are *Check your work*, forced for `workflows/`; a new agent is named in *Where things are*.

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
- `.claude/skills/` — the repository's skills. Ours: `look`, `effect` (how we write Effect 4), `create-an-agent` (how an agent is
  made here) and `change-the-board` (shadcn's trigger, for a change under apps/web). Vendored unchanged, pinned in `skills-lock.json`
  and credited in `THIRD_PARTY_NOTICES.md`: `shadcn` (it is loaded, and its CLI runs, from `apps/web`, where `components.json` is:
  loaded from the root it refuses with `monorepo_root`), and `grilling` and `grill-me` (Iris's interview).
- `workflows/` — this repository's own team, `agents/`: Iris (product engineer), Seldon (software architect), Ada (software engineer),
  Agora (code reviewer), Otto (release engineer), Argus (janitor); and three workflows: `intake` (an idea to an intent), `build` (an
  intent to main, started `--after` the intake run) and `janitor` (on demand: the stats to inbox cards, none started). What Nemia ships:
  the place skill `place/git` (`packages/agent-orchestrator/place/git`, run through `runPlaceVerb`), the skills the api lists as shipped
  (`SHIPPED_SKILLS`, the checkout's `workflows/skills/`, none today), and Nemia's own agent once the Nemia slices build it. A person's
  factories get no workflow or agent from the package.
- `apps/docs/` — the documentation site (Astro Starlight) for a person who will use Nemia: landed material only, the state diagrams read
  from their markers at build; it imports no package (`apps/docs/CLAUDE.md`).
- `tools/test-costs/` — the repository's test-cost recorder, on every package's `test` script: a probe in each test file's process, a
  reporter beside spec, and `report.ts`; held by `agent-orchestrator/test/test-costs.test.ts` and `suite.test.ts`.
- `tools/journal-bytes/` — what a copy of a runtime store's journals cost, by event kind, the share that is a copy, and the heap a
  full read holds, before and after a refile through bodies (`node --expose-gc tools/journal-bytes/report.ts <root> [--refile <dir>]`).
- `tools/observe/` — the side Grafana for building Nemia, never shipped: `docker compose -f tools/observe/compose.yaml up -d`, the daemon
  started with `OTEL_EXPORTER_OTLP_ENDPOINT=http://localhost:4318`, and its five dashboards held to the code's names by
  `agent-orchestrator/test/observe.test.ts`, and its timing of a step (the collector's command head and test scope, Tempo's span metrics and
  retention) by `observe-time.test.ts`. Its profiler preload, `tools/observe/profile/` (installed there alone), is off unless
  `PYROSCOPE_SERVER_ADDRESS` is set, held by `agent-orchestrator/test/profile.test.ts`.
- `.codex/rules/git-commit.rules` — lets a Codex step commit its own work in a worktree.
