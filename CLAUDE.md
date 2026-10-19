# Nemia — contributor guide

Two packages and two apps, each a layer that owns one thing. `packages/agent-runtime` runs agent sessions on a harness, durably: a job
that runs to its end, and a long-lived session that runs until stopped (`restartPolicy: 'Always'`); the `ae` CLI, and
`src/core/domain.ts` is the whole judgement. `packages/agent-orchestrator` owns workflows and the runs of their steps — a folder of
markdown is a workflow (the `wf` CLI). `apps/api` puts the workflows behind HTTP; `apps/web`, the board, shows them to a person.

Each layer reaches exactly the one below it, and nothing reaches up or skips one. Which layer owns what, the public contract of each and
the four rules and the tests that hold them are in `docs/architecture.md`: read it before you place a change. Read `README.md` and each
package's README for the model before changing behaviour. `wf` becomes `nemia` (the Nemia intent); `ae` stays the runtime's CLI. The stores
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
- `node tools/observe/render/render.ts --out <dir>` when you touch `tools/observe`: it renders the checkout's dashboards on a throwaway
  stack with fake data, never the live one, and a step hands over the `dashboard-<name>.png` and `.txt` it writes (`see-a-dashboard`).
  It needs `docker`, takes a minute and a half, and is never run by the suite.
- Run them before you commit, a step's session scoped as above. Green is the floor, not the bar: a change that makes the suite pass by
  weakening a test is a finding to report, not a fix.
- Turbo does not see `workflows/`, nor a doc, though some tests read docs: a step's session runs the tests that read the doc or workflow
  file it touched, and the round's check runs them all forced; outside a run, type `npx turbo run test --force --continue` after
  touching one.
- A run's check leaves what its tests cost in `WF_ARTIFACTS`, a `test-costs-<package>-<stamp>.json` per package and try; `node
  tools/test-costs/report.ts <dir>...` ranks them. A package's peak is its largest process, not the sum of the files running at once.
- **A run's checks inherit the daemon's environment** (`WF_MAX_CONCURRENT=50` on the owner's machine): a test that relies on a default
  passes there and fails by hand. All of it but the telemetry, which the runtime takes out of every child that is no session and the
  three test seats drop.
- **No test refuses a byte order mark.** A file written through a tool can turn an escape into the character it names, so after writing
  an escape of a NUL, DEL or byte order mark, look for the raw bytes (`grep -rl $'\xEF\xBB\xBF'`).

## Rules the code keeps

- **The runtime owns how a session runs; the layers above own what it means.** `decide` (`agent-runtime/src/core/domain.ts`) is pure and
  stays a screen long `(no test yet)`. A knob on a workload is a field carried on the task and read by a runner, never a callback into
  `decide`, and no `if` in `engine.ts` belongs in `decide` `(no test yet)`. What sits in which layer today, and what is a candidate to
  move, is in `docs/architecture.md`, *Who owns what*.
- **Level-triggered.** A tick reads the world, decides, acts, and carries nothing between passes. A guard that only fires on a
  transition is wrong after a restart `(no test yet)`.
- **Prose is not a constraint.** If the packages need an agent to do something, the machinery refuses the alternative
  `(no test yet)`.
- **Errors say what to do next.** A message names the fix — the command to type, the field to set — and not only what went wrong
  `(no test yet)`: what a refusal is thrown as and the exit code it carries are refused when they are wrong, its words are nobody's
  to check.
- **A state machine is drawn by its code.** A new machine prints its own Mermaid diagram, held between `diagram:<name>` markers in its
  package's docs whose begin line names the command; never a drawing `(no test yet)`. A diagram that has drifted from what its
  command prints is another matter, and refused.
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

- Read `packages/agent-orchestrator/README.md`, *An agent is a node's attachment*, for the format, the five layers numbered by
  precedence, and the routing rule that says which layer owns a new instruction (*Where a new instruction goes*).
- An agent's questions are an output field `{ "x-shape": "questions" }`, expanded by `packages/agent-orchestrator/src/question/question.ts`.
- Its checks are *Check your work*, forced for `workflows/`; a new agent is named in *Where things are*.

## Where things are

- `docs/architecture.md` — the layers, what each owns and its public contract, and the rules that hold them.
- `packages/agent-orchestrator/docs/features.md` — what is still to build, in order.
- `packages/agent-runtime/docs/open-issues.md` — what is still wrong or half-verified.
- `.claude/skills/` — the repository's skills. Ours: `look`, `see-a-dashboard` (a dashboard of the side Grafana, rendered and read),
  `effect` (how we write Effect 4), `create-an-agent` (how an agent is made here) and `change-the-board` (the trigger of shadcn and of the
  kit's skills, and the board's own traps, for a change under apps/web). Vendored unchanged, pinned in `skills-lock.json`
  and credited in `THIRD_PARTY_NOTICES.md`: `shadcn` (it is loaded, and its CLI runs, from `apps/web`, where `components.json` is:
  loaded from the root it refuses with `monorepo_root`), `grilling` and `grill-me` (Iris's interview), and `react-aria` (Adobe's
  documentation of React Aria, for the board's own parts: taken from the root by `npx skills add https://react-aria.adobe.com -a
  claude-code --copy -y`, refreshed by `npx skills update`, and it describes the library's latest release, which may be ahead of the
  board's pin).
- `apps/web/src/components/ui/ds` — the design system kit (french-tech-homies/design-system, the `@ds` registry), vendored as shipped
  and credited in `THIRD_PARTY_NOTICES.md`, with its skills `ds-theme`, `ds-build` and `ds-spec` in `apps/web/.claude/skills/`: a nested
  folder, given to the build's design, implement and review steps by their `skills:` lines as `apps/web:<name>`, and said to a session
  outside a run by `change-the-board`; a kit update that adds or renames one names it on the three lines and in the skill
  (`packages/agent-orchestrator/test/build-told.test.ts`); the
  board's look is `apps/web/DESIGN.md`, its generated theme `apps/web/theme/` (`apps/web/CLAUDE.md`, *The design system kit*).
- `apps/web/src/components/look` — the look's own parts (the cut frame, tag and button, the plate, the sticker and stat tile, the rail,
  the scan lines, the pager, the text link, the copy id) behind one door, each with its stories beside it; Nemia's Storybook
  (`npm run storybook`, from `apps/web`) shows them to a person, and `change-the-board` says which to take (`apps/web/CLAUDE.md`).
- `workflows/` — this repository's own team, `agents/`: Iris (product engineer), Seldon (software architect), Ada (software engineer),
  Agora (code reviewer), Otto (release engineer), Argus (janitor); and four workflows: `intake` (an idea to an intent), `build` (an
  intent to main, started `--after` the intake run), `quick` (a small card that settles its change to main: implement, then a gated
  land, within the bound `workflows/quick/README.md` says) and `janitor` (on demand: the stats to inbox cards, none started). What Nemia ships:
  the git place `place/git` (`packages/agent-orchestrator/place/git`: its skill, and its code, given as `gitPlaceLayer`), the skills the api lists as shipped
  (`SHIPPED_SKILLS`, the checkout's `workflows/skills/`, none today), and Nemia's own agent once the Nemia slices build it. A person's
  factories get no workflow or agent from the package.
- `apps/docs/` — the documentation site (Astro Starlight) for a person who will use Nemia: landed material only, the state diagrams read
  from their markers at build; it imports no package (`apps/docs/CLAUDE.md`).
- `tools/test-costs/` — the repository's test-cost recorder, on every package's `test` script: a probe in each test file's process, a
  reporter beside spec, and `report.ts`; held by `agent-orchestrator/test/test-costs.test.ts` and `suite.test.ts`.
- `tools/journal-bytes/` — what a copy of a runtime store's journals cost, by event kind, the share that is a copy, and the heap a
  full read holds, before and after a refile through bodies (`node --expose-gc tools/journal-bytes/report.ts <root> [--refile <dir>]`).
- `tools/observe/` — the side Grafana for building Nemia, never shipped: `docker compose -f tools/observe/compose.yaml up -d`, the daemon
  started with `OTEL_EXPORTER_OTLP_ENDPOINT=http://localhost:4318` (the live daemon alone: a probe goes to a held throwaway,
  `node tools/observe/render/render.ts --hold`, at the collector address it prints), and its six dashboards held to the code's names by
  `agent-orchestrator/test/observe.test.ts`, and its timing of a step (the collector's command head and test scope, Tempo's span metrics and
  retention) by `observe-time.test.ts`. Its profiler preload, `tools/observe/profile/` (installed there alone), is off unless
  `PYROSCOPE_SERVER_ADDRESS` is set, held by `agent-orchestrator/test/profile.test.ts`.
  `tools/observe/render/` draws a checkout's dashboards before they land: a throwaway stack under a name of its own, fake data, a
  picture and the text of every panel (`tools/observe/README.md`, *See a change rendered*), held by
  `agent-orchestrator/test/observe-render.boundary.test.ts` on a stub `docker`, its seed by `observe.test.ts`.
- `.codex/rules/git-commit.rules` — lets a Codex step commit its own work in a worktree.
