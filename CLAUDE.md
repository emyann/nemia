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
  hand. `agent-orchestrator`'s script takes one knob besides: `WF_TEST_SHARD=<i>/<n>` runs the `<i>`th of `<n>` shards of its suite,
  which `ci` sets per shard leg of that package (`.github/workflows/ci.yml`); unset — a person's run, a run's check — it runs every
  file. To measure, type `npx turbo run test --force --continue`: without `--force` turbo replays a cached pass. Read `Failed:`
  first: a file marked `✖` with no failing test inside it is a package turbo interrupted, not a failure of that file.
- **A step's session runs the tests of what it changed; the run's checks run the whole suite.** The test files about each file it
  changed (beside it, or under its package's `test/` naming it), and for a doc, a skill or a workflow file the tests that read it (grep
  the tests for its path), each from its package's folder as its `test` script loads it: `node --import ./test/ambient.ts --test <file>`
  in `packages/agent-orchestrator`, `node --import ./test/harness.ts --test <file>` in `apps/api`, `node --test <file>` in
  `packages/agent-runtime`, `apps/web` and `tools/guards`. Where a file alone does not say enough (a shared helper, a type many files read, a package's
  test setup), the packages it touched: `npx turbo run test --force --continue --filter=<package>`, the package by its `name`
  (`agent-orchestrator`, `agent-runtime`, `api`, `web`, `guards`). Typecheck and lint run whole: they are cheap. Implement's round check runs the
  declarations, the typecheck and the lint, and pushes the round's commit and waits on GitHub's `ci` context, which runs the whole
  suite on it (`workflows/build/implement.md`); the landing's check runs no suite at all — it is the receipt that the pull request `ci`
  judged was merged (`workflows/build/landing.ts`) — so the commit `ci` passed on is the last thing any suite reads; a session runs the
  whole suite only to measure it, as the e2e's rule says. A failing test it did not run is the check's refusal, answered in the next try. Outside a
  run no check follows you: run the whole suite before you commit.
- `npm run typecheck` — `tsc --noEmit` per package, over its `src` and its `test/` (the web's `test/e2e/` under its own tsconfig, and the
  tests of the runtime, the orchestrator and the api each under their package's `test/tsconfig.json`, which leaves the source's
  `noUncheckedIndexedAccess` off);
  `tools/guards/test/suite.test.ts` refuses a test file no typecheck reads.
- `npm run lint` — oxlint (`.oxlintrc.json`) and `oxfmt --check` (`.oxfmtrc.json`); `npm run format` writes the layout. Every shipped
  `check:` runs it after the types. A rule turned off, or a line allowed with `oxlint-disable-next-line`, says why beside it.
- `npm run build`, then `npm run e2e -- --pages <the pages the change touches>` (and `--photos` when pictures are due), when you touch
  `apps/web`: its assertions, in the dark theme, by workers in parallel, each with its own store, api and app (`apps/web/CLAUDE.md`).
  A session never runs it whole but to measure it: `ci`'s `e2e` job runs every page on the commit implement's round check pushed, which
  is the commit the landing merges; the landing's check runs no page.
- `node tools/observe/render/render.ts --out <dir>` when you touch `tools/observe`: it renders the checkout's dashboards on a throwaway
  stack with fake data, never the live one, and a step hands over the `dashboard-<name>.png` and `.txt` it writes (`see-a-dashboard`).
  It needs `docker`, takes a minute and a half, and is never run by the suite.
- Run them before you commit, a step's session scoped as above. Green is the floor, not the bar: a change that makes the suite pass by
  weakening a test is a finding to report, not a fix.
- Turbo sees `workflows/` and the docs only through `guards#test`'s inputs, though tests elsewhere read them too: a step's session runs the tests that read the doc or workflow
  file it touched, and `ci` runs them all, on clean runners with no cache of this machine's, on the commit the round's check pushed;
  outside a run, type `npx turbo run test --force --continue` after touching one. The tests that read files of every package —
  `tools/guards`' `claude-md-cites.test.ts` over every `CLAUDE.md` and `test-rules.test.ts` over every test file, and
  `agent-orchestrator`'s `comments.test.ts` — are re-run the same way after a test, a doc or a name moves anywhere.
- A run's check leaves what its tests cost in `WF_ARTIFACTS`, a `test-costs-<package>-<stamp>.json` per package and try; `node
  tools/test-costs/report.ts <dir>...` ranks them. A package's peak is its largest process, not the sum of the files running at once.
- A change to tests alone shows that no source file's coverage dropped: `node tools/coverage/record.ts <package-dir> --out
  before.json` before it and `after.json` after, then `node tools/coverage/compare.ts before.json after.json`, which exits 1 naming
  each file whose hit lines or branches fell; records on each side of a `--` say apart, as varying, a line they disagree on. A session's measure, never run by the suite or CI: it runs the package's whole suite.
- **A run's checks inherit the daemon's environment** (`WF_MAX_CONCURRENT=50` on the owner's machine): a test that relies on a default
  passes there and fails by hand. All of it but the telemetry, which the runtime takes out of every child that is no session and the
  three test seats drop.
- **No test refuses a byte order mark.** A file written through a tool can turn an escape into the character it names, so after writing
  an escape of a NUL, DEL or byte order mark, look for the raw bytes (`grep -rl $'\xEF\xBB\xBF'`).

## Rules the code keeps

- **The runtime owns how a session runs; the layers above own what it means.** `decide` (`agent-runtime/src/core/domain.ts`) is pure
  and stays a screen long. A knob on a workload is a field carried on the task and read by a runner, never a callback into `decide`,
  and no `if` in `engine.ts` belongs in `decide`. What sits in which layer today, and what is a candidate to move, is in
  `docs/architecture.md`, *Who owns what*.
- **Each context says its words in its glossary table**: a `glossary.json` at its door (a term, its meaning, the closed type that
  holds it, the spellings it retired, each with its card), which the docs' Glossary page draws one section per context
  (`apps/docs/src/glossary.ts`). Read the table of the context you change before you name something there. A renamed word keeps its
  old spelling as `retired` on its row, and `tools/guards/test/glossary.test.ts` counts that spelling in each file under the table's
  paths, a count that only shrinks (`tools/guards/test/glossary.baseline.ts`).
- **A field that says a state or a kind at a door is a closed union of its words, never `string`**: a `phase`, `status`, `state`,
  `kind`, `type` or `reason` an entry of a package's `exports` or a type of the api reaches. A sentence a person reads is a `message`.
  Held by `tools/guards/test/closed-state.test.ts`, through the TypeScript checker, whose baseline only shrinks.
- **Level-triggered.** A tick reads the world, decides, acts, and carries nothing between passes. A guard that only fires on a
  transition is wrong after a restart.
- **Prose is not a constraint.** If the packages need an agent to do something, the machinery refuses the alternative.
- **Errors say what to do next.** A message names the fix — the command to type, the field to set — and not only what went wrong: what
  a refusal is thrown as and the exit code it carries are refused when they are wrong, its words are nobody's to check, and a test
  that asserts a whole sentence of them is refused (`tools/guards/test/test-rules.test.ts`), what still does being a
  debt that only shrinks (`tools/guards/test/test-rules.baseline.ts`).
- **A state machine is drawn by its code.** A new machine prints its own Mermaid diagram, held between `diagram:<name>` markers in its
  package's docs whose begin line names the command; never a drawing. A diagram that has drifted from what its command prints is
  another matter, and refused.
- **The Kubernetes test for a new field on the runtime's task: does the Pod spec (`core/v1`) have one?** A container's command, args,
  env, volumes, restart policy, resources and priority are the runtime's; what a workflow means — a step, a gate, a check's verdict, a
  budget across tries — is not.

## Git

- Commit on your branch, in small coherent commits with plain messages: a short imperative subject, an optional body saying why. **No
  attribution trailers**, no session URLs.
- **A workflow step never pushes, never merges into the base branch, never force-deletes a branch**, and its agent's `disallowedTools:`
  refuses the push and the delete (a `dontAsk` agent's: no allow reaches them; `packages/agent-orchestrator/test/agent-fences.test.ts`).
  `.claude/settings.json` denies none of it: pushing and opening a pull request are the person's, or done by their session when they ask.
  What a step may not type, the run does in its place, as two frozen scripts read out of git and run with `node`, never as a tool a fence
  could not tell apart: `workflows/build/pull-request.ts` pushes a run's own branch and opens or updates its pull request, and
  `workflows/build/landing.ts` merges that pull request and fast-forwards the checkout. The one exception to the rule is a run's ending
  step (a workflow's last step, `workspace: base`), filed once a person approves it — or, where its workflow puts before it a step that
  can send the work back (`loop:`), once that step passes, which is how `quick` lands with no gate at all; an ending with a `check:` and
  neither of the two is refused at load (`validateBaseWorkspace`, `src/workflow/validate.ts`). It runs `landing.ts merge`, which refuses
  anything but this run's own green pull request — `mergeable`, `ci` green at the head the review read, no result branch left out — then
  merges it with a merge commit whose message the step wrote and fast-forwards the base branch here; the run then executes the step's
  `check:`, which is `landing.ts receipt`, and records the commit that landed on its exit 0 (`landingDue`).
- If you are a workflow step, commit as you go: the run commits only what you leave uncommitted, in one commit under your step's name.

## Agents in this repository

What the `create-an-agent` skill, being generic, does not say here:

- Read `packages/agent-orchestrator/README.md`, *An agent is a node's attachment*, for the format, the five layers numbered by
  precedence, and the routing rule that says which layer owns a new instruction (*Where a new instruction goes*).
- An agent's questions are an output field `{ "x-shape": "questions" }`, expanded by `packages/agent-orchestrator/src/question/question.ts`.
- Its checks are *Check your work*, forced for `workflows/`; a new agent is named in *Where things are*.
- **Every agent of the team reads the repository through git.** The four read-only ones (Seldon, Agora, Iris, Argus, each `dontAsk`, which
  no allow from a step reaches) carry the same read-only git set on their own `allowedTools:` in `workflows/agents/`, a list of their
  `claude:` block's fence (`claude: { fence: … }`) as is each `disallowedTools:` below, and each holds the place's `git` skill on its
  `skills:`; the three writers (Ada, Grace, Otto) run `auto` and need no allow. Nothing in the set writes
  the repository's history, its refs or its configuration — `git merge-tree` writes a loose object and no ref, and `git status` and
  `git describe --dirty` refresh the worktree's index and rewrite it when they can take its lock — and `git push` stays refused by the
  writers' `disallowedTools:`, Grace's held equal to Ada's. The set holds `cat`, `head`, `tail`, `wc`, `cut` and `ls` too, each kept
  inside the working tree by Claude Code's own check of a path and `wc --files0-from` by `Bash(wc *--f*)`; `sed`, `awk`, `find`, `sort`,
  `uniq` and `tee` stay out, each able to write a file or run a program. **What the set would let git write a file or run a program by is denied
  beside it**, on each of the four, and so on every step of theirs, whose `disallowedTools:` adds to its agent's, since no allow rule
  can exclude an option and an allow is matched with a leading assignment stripped: `Bash(git grep *O*)` and `Bash(git grep *--op*)`
  for the pager option, which runs a
  command on the files that matched (every short spelling carries a capital `O`, git bundling it after other short options; every long
  one carries `--op`, since git takes any unambiguous abbreviation and `--o` alone it refuses), and `Bash(*GIT_*)` for every assignment
  of git's environment — `GIT_EXTERNAL_DIFF`, and `diff.external` through `GIT_CONFIG_COUNT` — which is the fence under the "never
  `VAR=`" these roles' skills already say. The leading `*` is the point of that last one, as it is for the collector's `Bash(*:4318*)`:
  a deny is matched against the part as typed, and without it the rule reaches only a part that *opens* `GIT_`, so a first assignment
  naming something else, or a `nohup` or `timeout` before it, would carry the whole of git's environment through. `Bash(git
  *--output*)` refuses `--output=<file>`, which `diff`, `diff-tree`, `log`, `show`, `rev-list`, `blame` and `shortlog` take and which
  creates or truncates the file it names, written anywhere after `git`: a deny that names it right after the verb misses it later in
  the line. **What the set would let git read outside the repository by is denied too**, by name: `Bash(git *--no-ind*)` for
  `--no-index` on `diff` and `grep` (`grep` takes it down to `--no-ind`), `Bash(git blame *--con*)` for `blame --contents <file>` (taken
  down to `--con`), and `Bash(git grep -f*)` and `Bash(git grep * -f*)` for `grep -f <file>`, a word that opens `-f` (2.43's `grep` has
  no `--file`). A path outside the working tree no deny can tell apart: `git diff ../outside f` or `git diff /etc/hostname f` compares
  the two files with no option typed, and a bundled `git grep -nf <file>` is a word no glob tells from a pattern. These denies hold
  the forms as typed and no other: a Bash rule matches the text, so a spelling the shell rejoins — quoted (`--out''put`), escaped
  (`--out\put`), brace-split or put together from a `$` — passes each of them, and what the set writes or runs by such a spelling is open until something reads the line as the shell does. Adding a verb to the set means asking
  what file it can be made to write and what program it can be made to run. The set is on the agents rather than in `.claude/settings.json` so
  that the team travels to a factory that is not this checkout; `packages/agent-orchestrator/test/agent-fences.test.ts` holds every read
  open to each of the four, every write refused, every spelling of `--output` and of a read outside it can read refused, and the four
  lines equal. Each step of the four denies too, on its own file's line (an agent's names no command of this repository), what the
  settings and shadcn's skill allow that writes the workspace or runs the suite: shadcn's CLI in each spelling an allow reaches (`npx shadcn@latest`, `pnpm dlx`, `bunx --bun`), its one read being the
  board's pinned `npx shadcn view` the settings allow, and `npm test`; intake and the janitor, which run no test, `node --test` and `npx
  turbo run test` besides, while design and review keep the checks their notes name and are refused a build on that line
  (`npx turbo run test *build*`). Design and review measure by the compiler and the linter, which the settings allow
  (`npx tsc --noEmit`, `npx oxlint`), and deny on that line what would write or watch, `tsc`'s options by their first letters in each
  case, since it reads an option's name in any case and after one dash or two; intake and the janitor deny both whole. Each of the
  four is told, in one paragraph they hold equal, to put a refused call its work needs at the top of its sign-off, never only in a risk.

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
  board's pin), and `tsverify` (the verifier's, for a contract under a package's `contracts/` and the function it proves: taken by `npx
  skills add emyann/tsverify -a claude-code --copy -y`, given to build's and quick's steps by their `skills:` lines).
- `apps/web/src/components/ui/ds` — the design system kit (french-tech-homies/design-system, the `@ds` registry), vendored as shipped
  and credited in `THIRD_PARTY_NOTICES.md`, with its skills `ds-theme`, `ds-build` and `ds-spec` in `apps/web/.claude/skills/`: a nested
  folder, given to the build's design, implement and review steps by their `skills:` lines as `apps/web:<name>`, and said to a session
  outside a run by `change-the-board`; a kit update that adds or renames one names it on the three lines and in the skill
  (`packages/agent-orchestrator/test/build-told.test.ts`); the
  board's look is `apps/web/DESIGN.md`, its generated theme `apps/web/theme/` (`apps/web/CLAUDE.md`, *The design system kit*).
- `apps/web/src/components/look` — the look's own parts (the cut frame, tag and button, the plate, the sticker and stat tile, the
  breakdown and its preview, the rail, the scan lines, the pager, the text link, the copy id) behind one door, each with its stories beside it; Nemia's Storybook
  (`npm run storybook`, from `apps/web`) shows them to a person, and `change-the-board` says which to take (`apps/web/CLAUDE.md`).
- `workflows/` — this repository's own team, `agents/`: Iris (product engineer), Seldon (software architect), Ada (software engineer),
  Grace (lead software engineer, who builds a wide card through subagents), Agora (code reviewer), Otto (release engineer), Argus
  (janitor). Grace fills implement in `build` and `quick`; Ada's file stays, for a factory that hires her. And four workflows:
  `intake` (an idea to an intent), `build` (an intent to main, started `--after` the intake run), `quick` (a card that settles its change, whatever its size, to main: implement, then a review
  whose pass files an ungated land, as `workflows/quick/README.md` says) and `janitor` (on demand: the stats to inbox cards, none started). What Nemia has built in:
  the git place `place/git` (`packages/agent-orchestrator/place/git`: its skill, and its code, given as `gitPlaceLayer`), the skills the api lists as builtin
  (`BUILTIN_SKILLS`, the package's own `skills/`, none today), the MCP servers it offers a factory (`BUILTIN_SERVERS`,
  `packages/agent-orchestrator/servers/`), and Nemia's own agent once the Nemia slices build it. A person's
  factories get no workflow or agent from the package.
- `apps/docs/` — the documentation site (Astro Starlight) for a person who will use Nemia: landed material only, the state diagrams read
  from their markers at build; it imports no package (`apps/docs/CLAUDE.md`).
- `tools/guards/` — the repository's own guards, never shipped: the tests that hold its CI, docs, workflows and test infrastructure
  rather than a layer's code, a workspace of their own (`guards`) whose `ci` job runs them only when `tools/guards/due.ts` says a push
  touched what they read (`tools/guards/CLAUDE.md`). A config guard that imports the orchestrator past its three entries stays in it.
- `tools/test-costs/` — the repository's test-cost recorder, on every package's `test` script: a probe in each test file's process, a
  reporter beside spec, and `report.ts`; held by `tools/guards/test/test-costs.test.ts` and `suite.test.ts`.
- `tools/coverage/` — a package's line and branch coverage per source file (`record.ts`) and the comparison of two records
  (`compare.ts`), a session's measure; held by `tools/guards/test/coverage.test.ts` and its boundary.
- `tools/journal-bytes/` — what a copy of a runtime store's journals cost, by event kind, the share that is a copy, and the heap a
  full read holds, before and after a refile through bodies (`node --expose-gc tools/journal-bytes/report.ts <root> [--refile <dir>]`).
- `tools/store-measure/` — what the store's reads cost, cold and warm: a tick pass, the run list, the stats, a run's page and the feed from
  a cursor, on a copy of both stores in a temp folder with the run count beside them, never the live store
  (`node --expose-gc tools/store-measure/report.ts [--repeat N] [--json <file>] [--compare <baseline.json>]`); the baseline before the
  Run door is `tools/store-measure/baselines/s1.json`, the measure after it `s2.json`, and their comparison `s2-vs-s1.txt`. A
  session's measure, held by `tools/guards/test/store-measure.test.ts`.
- `tools/observe/` — the side Grafana for building Nemia, never shipped: `docker compose -f tools/observe/compose.yaml up -d`, the daemon
  started with `OTEL_EXPORTER_OTLP_ENDPOINT=http://localhost:4318` (the live daemon alone: a probe goes to a held throwaway,
  `node tools/observe/render/render.ts --hold`, at the collector address it prints), and its six dashboards held to the code's names by
  `agent-orchestrator/test/observe.test.ts`, and its timing of a step (the collector's command head and test scope, Tempo's span metrics and
  retention) by `tools/guards/test/observe-time.test.ts`. Its profiler preload, `tools/observe/profile/` (installed there alone), is off unless
  `PYROSCOPE_SERVER_ADDRESS` is set, held by `agent-orchestrator/test/profile.test.ts`.
  `tools/observe/render/` draws a checkout's dashboards before they land: a throwaway stack under a name of its own, fake data, a
  picture and the text of every panel (`tools/observe/README.md`, *See a change rendered*), held by
  `agent-orchestrator/test/observe-render.boundary.test.ts` on a stub `docker`, its seed by `observe.test.ts`.
- `.codex/rules/git-commit.rules` — lets a Codex step commit its own work in a worktree.
