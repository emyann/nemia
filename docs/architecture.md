# Architecture

Two packages and two apps, in layers. Each layer owns one thing and is reached through a
short list of entries, its public contract. Four rules keep it that way, and each is a test that fails the suite when
broken. This page says what the tests hold; the tests are the rules.

## The layers

| Layer | Owns | Public contract |
|---|---|---|
| `packages/agent-runtime` | Agent sessions on a harness, durably: a job that runs to its end, and a long-lived session that runs until stopped (`restartPolicy: 'Always'` with `background: true`, the runtime's README, *A long-lived session*). How a session runs: its command, mounts, restart and spend, the journal, the attempts, the harnesses' vocabulary. The `ae` command. | `agent-runtime` → `src/index.ts`, the runtime in Effect. `agent-runtime/testing` → `src/testing.ts`, the engine's stand-in, for test files alone. `agent-runtime/vocabulary` → `src/vocabulary.ts`, the harnesses' words, what their fence words reach (`fenceReach`), the first character of a path a harness's permission rule cannot carry (`unruledIn`) and the folders a harness reads as its own configuration in a mounted folder (`configFolderIn`), pure. `decide` is exported by none. |
| `packages/agent-orchestrator` | A folder of markdown as a workflow, and a run of its steps: which task to file next, what a person must decide, what the run's record says. The `wf` command, to become `nemia`. | `agent-orchestrator` → `src/runner.ts`: the controllers, everything that reads or writes the disk, and the refusals by kind, `Missing`, `Conflict` and `Invalid`, re-exported by name. `agent-orchestrator/run` → `src/run.ts`: `assess` (`src/tick/assess.ts`), and the words a run is described in, re-exported by name. `agent-orchestrator/workflow` → `src/workflow.ts`: the format, pure. |
| `apps/api` | The workflows behind HTTP, and the feed as a stream, read through the orchestrator's live reader (`followFeed`) on the hub its daemon publishes to. | Its routes. |
| `apps/web` | The board people look at. It talks to the api over HTTP, decodes each answer it reads with a schema of its own (`effect`), imports none of our packages, names no store path, and builds no command of its own: a command or a store folder it shows is text the api answered (`STORE_PATHS` and `COMMAND_TEXT` in `apps/web/test/structure.test.ts`, both empty). | Its pages. |

`apps/docs`, the documentation site, sits beside the layers and is none of them: it imports no workspace package and depends on
none (`apps/docs/test/structure.test.ts`), and reads the repository's text at build, by path from its root. Its pages draw each state
machine from between its `diagram:<name>` markers in the package docs, never from a copy (`apps/docs/src/mermaid.ts`).

Each layer reaches exactly the one below it, and nothing reaches up or skips one:

- the web reaches the api over HTTP alone (`apps/web/test/structure.test.ts`, and the web's lint block);
- the api reaches the orchestrator's public entries alone (the entries: `packages/agent-orchestrator/test/contract.test.ts` and the
  api's lint block; that its source imports no runtime: the api's lint block, proven by
  `packages/agent-orchestrator/test/imports.test.ts`). The api's source reaches only the orchestrator; its tests may import the
  runtime's public entries to build fakes;
- the orchestrator reaches the runtime's behaviour through its one client, `src/runtime-client.ts` (`CLIENT` in
  `packages/agent-orchestrator/test/boundary.test.ts`), and its vocabulary through its pure door, `agent-runtime/vocabulary`, from
  any file.

Spawning a package's `bin/` — `wf feed` in the web app's e2e test, say — is using its CLI, not importing it.

## Who owns what

The runtime owns how a session runs; the layers above own what it means. The Kubernetes test settles a new field on the runtime's
task: if the Pod spec (`core/v1`) has one — a container's command, args, env, volumes, restart policy, resources, priority — it is the
runtime's.

**Above the runtime by design**: run slots, checkout holds, worktrees and landing, what a check means, budgets across tries, gates, the
inbox, factories, stats, agent definitions.

**Where a run's work lives is the place's**, an interface the orchestrator owns and asks (`PlaceService`, `src/place/place.store.ts`:
`ask(verb, request)` and `askNow`, over the contract of `src/place/place.ts`), required by every program that asks it and with no
default: the daemon, a CLI command, the api's layer and each test give one by name, and a program given none does not compile
(`src/place/place.store.test.ts`). Git is one place, in code outside `src` (`packages/agent-orchestrator/place/git`), one object for
every factory and repository of its process, a question a call that runs git and no process between
(`test/git-ask.boundary.test.ts`); it is given as `gitPlaceLayer` by `src/place/shipped.store.ts`, the one file of `src` that imports it (`placeBreaks` in `test/boundary.test.ts`),
so no `src` names git (`test/git-calls.test.ts`). The test place is a second one, beside it (`packages/agent-orchestrator/place/memory`,
`testPlace()`): it answers the same verbs from memory, in real directories and with no process, new for each test, and no file of `src`
or `bin` imports it: the door gives git alone (`placeBreaks`). One table of walks holds it to git (`test/place-walks.ts`): each walk
has the one answer both places must give,
`test/git-place.boundary.test.ts` asks them of git and `test/place-contract.test.ts` of the test place, where a lie about any verb
fails a walk and a verb with no walk is named. A test is given the stand-in, and one that reaches the real thing says so by its name,
`<what>.boundary.test.ts`: `test/stand-ins.test.ts` reads the runtime's, the orchestrator's and the api's test files and refuses git,
a process, the real place, the real engine and a hand-made engine in any other, against a baseline that only shrinks
(`test/stand-ins.baseline.ts`), and refuses a stand-in whose contract no boundary test walks whole. The engine's stand-in is the
runtime's, `testEngine()` behind `agent-runtime/testing`: it keeps `file`, `view`, `stop`, `logs`, `feed`, `output`, `say` and
`forget` by hand, and one table of walks (`packages/agent-runtime/test/engine-walks.ts`) holds it to the real engine, asked of
`Engine.layer` in `engine-contract.boundary.test.ts` and of the stand-in in `engine-contract.test.ts`; what it cannot say is declared
there (`APART`), and a runtime test builds the real engine, never the stand-in (`takenBreaks`). Two things are given up on purpose. *A team's own place as a folder of scripts*: a
place is no longer a skill's `scripts/<verb>.ts` declared by a `place.json` and run as a process a question, so a team cannot bring
one as files; another place is code that implements `PlaceService`, given as a layer where the program is composed. *A place frozen
per run*: a run copies no place and its record names none (`test/start-place.boundary.test.ts`), so a run in flight is answered by the place
of the process that asks, the release installed, and a change to the place reaches it at the next restart.

**A loop's rounds** are the orchestrator's, counted off the looping step's tries that went `then: 'round'` (`roundIn`,
`src/status/status.ts`): a reviewer's `again: true`, and a person's `nemia round`. A merge of the base (`nemia merge`, `src/merge/`) is
no round: the loop's target is filed again to merge the base at the commit a trial merge read, its try `then: 'merge'`, the run's
`baseRef` moves to that commit, and the reviewer after it reads the merge; a finding of it with `again: true` is a round, counted as any
(`test/ship.test.ts`, *a merge send-back leaves the round count unchanged*). A merge of work that merges cleanly is refused, pointed to
the landing's approval; one of a run whose result step closes no loop, to `nemia retry`. Unless the ending's last landing check refused
the merge staged on the base as it is now (`Landed`'s `refusedOn`): the conflict is semantic, and the merge is asked, its target handed
what the check said (`refusedLanding`, `src/merge/merge.ts`; `test/ship.test.ts`, *the conflict is semantic*, and the refusals for a
base moved since and a check that did not finish). While a merge is asked, `nemia round` and
`nemia accept` of its loop are refused, since either would drop it; `nemia decide` offers the merge wherever the verb would take it.

**In the runtime since platform slice 3**: session admission and pools. The runtime admits a queued task under the engine's ceiling
and its harness's pool, the highest priority first (`agent-runtime/src/core/admission.ts`); the orchestrator hands it the ceiling
(`WF_MAX_CONCURRENT`) and files each step's momentum as its task's priority, and keeps its run slots (`src/cap/cap.ts`, `WF_MAX_RUNS`).

**A call's admission** is split: running a command before a session's call and rendering it per harness is the runtime's
(`config.callAdmission`, `agent-runtime/src/harness/admission.ts`; Claude Code's hook, `ae admission`), as a probe's `exec` is the
kubelet's; what a call of the table means at a run's state is the orchestrator's, pure (`admissionOf`, `src/admission/admission.ts`),
served by `nemia admit`. Given a floor (`nemia admit --at-least <level>`), it denies a call naming a run or a factory whose level is
below it and asks one it cannot read (`Scope`), naming no agent. The static rules of an agent that runs `nemia` are derived from each
command's class (`nemiaFence`).

**Levels** are the person's and the orchestrator's (`src/level/`): each factory's default, `manual`, `semi-auto` or `auto`, in its own
file (`factories/<name>/level.json`, written by `nemia level --factory` alone), the store's level (`nemia/level.json`) under it and for
the default factory, and a raise for a stretch that ends by itself, read as it passes with no write (`levelOf`).

**The rules for auto** are the person's and the orchestrator's (`src/auto/`): an agent's proposal (`auto/<agent>.proposed.json`, written
by `nemia auto propose` alone) and the person's confirmed list (`auto/<agent>.json`, written by `nemia auto confirm` and `nemia auto
drop` alone, classed `prompts` and asked every time, `asksAlways`; a confirm carries the words the person read, refused once the rule
reads otherwise), the rule that ships in force while none is confirmed
(`DEFAULT_AUTO`). Whether a rule allows an answer is pure (`allowedBy` over `Facts`, `src/auto/auto.ts` and `facts.ts`); the facts are
read off the run by a controller (`seenOf`, `src/admission/seen.verb.ts`), and admission gives unasked what the list allows in a run at
`auto` (`nemia admit --auto <agent>`), naming no agent of its own.

**The daemon and its lease** are the orchestrator's (`src/daemon/`, `up` in `src/daemon/up.verb.ts`): one store takes one daemon, which
holds `daemon.json` (its pid, `by` and the `url` an api serves at) and ticks. The api's process is that daemon unless started with
`--no-tick` (`apps/api/src/main.ts`), and `wf up` is it on a machine that serves no board; each refuses the other while it ticks. A board
served by the daemon keeps its store ticking; a board served with `--no-tick` ticks nothing, and a run filed on it moves on the daemon's
next pass. Beside its passes it frees the worktrees of finished runs (`free` in `src/prune/free.verb.ts`, forked by `up`), asking
`nemia prune`'s own judgement of each, a few runs a sweep. A person may run it as a login service (`nemia service install`, `src/service/`), which runs the same daemon and hands the
lease over only when told: from the checkout, or, run from an install, from `releases/current`. `nemia service restart`
(`src/service/restart.verb.ts`) restarts the service's daemon as a take-over does (`takeOver`, `src/service/takeover.verb.ts`, shared with
`nemia service install --take-over` and `nemia upgrade`): the store paused unless a person's pause stands, each landing check let
finish, SIGTERM, the unit started, and the store resumed once the new daemon has completed its first pass — refused, naming its log,
when it does not; a daemon started by hand is named with the take-over that hands it to the service. A release is a tag built and
checked under the store (`src/release/`): `nemia upgrade <tag>` exports it clean, builds it into `$WF_ROOT/releases/<tag>` on a trial store, switches the pointer `releases/current` by a rename
and restarts the service onto it; `nemia version` says what runs and what the pointer names, and the lease keeps its daemon's `release`.
A checkout is refused a store whose pointer names an install, but for `version` and a help, unless `NEMIA_ON_INSTALLED=1`
(`trialRefusal`, in the CLI's `main` and the api's). Where nothing ticks the store, a command whose work waits on the next pass (`ticks`
in the command table) starts the daemon before it runs (`ensureDaemon`, `src/demand/demand.verb.ts`): the store's login service where
one is installed, else the daemon that service would run, detached, into `$WF_ROOT/daemon.log`; the CLI's `main` alone does, since the
api is the daemon, and Nemia's session turns it off (`NEMIA_DAEMON_START=off`).

**A journal's bodies** are the runtime's storage: each long text of a line kept once, under the sha256 of its text, resolved on every
read and removed only by `sweep` (`agent-runtime/src/core/engine/bodies.ts`, `ae sweep`). Where a brief is cut is the orchestrator's
(`briefParts`, `src/brief/parts.ts`), filed beside the whole brief as a hint the runtime refuses unless the parts join into it.
A task's journal, its session files and its feed lines are removed only by `forget` (`agent-runtime/src/service/forget.ts`,
`ae forget`), and only of a settled task; a body still only by `sweep`. Which tasks a run removed had is the orchestrator's: `nemia rm`
asks `forget` of every task its record names, and the tick asks again for one that had not settled (`src/forgetting/forgetting.verb.ts`).

**Logs and traces**: each layer logs and spans in its own words — the runtime its task, kind and attempt (`appendFields` in
`agent-runtime/src/core/engine/journal.ts`), the orchestrator its run and step (`advancePass`, `forStep`); each spans the work it does, never an item it looks at and skips, which it
counts as attributes on the span that skipped them (`rested` on `pass`, `kept` on the runtime's `tick`) — and the process chooses the
exporter: the daemon's provides `telemetryLayer` (`src/telemetry/telemetry.store.ts`), its lines always, OTLP only when
`OTEL_EXPORTER_OTLP_ENDPOINT` is set — its traces, its logs and every metric in its registry, the pass's and the steps' (`STEP_METRICS`,
recorded by the tick off what it already read, by factory, workflow, step, agent and outcome alone). A session exports to the same
collector: the orchestrator hands the runtime the endpoint (`engine()`), with `toolDetails` when the daemon's `NEMIA_TOOL_DETAILS` is
`1`, which the runtime says to a harness that can export its tools' inputs, and files a step's task with its run and step as labels
(`stepLabels`); the runtime, which alone knows how a harness is told, hands each session it starts the collector, those labels and its
`task`, and the filing's trace context, and a command none (`agent-runtime/src/harness/telemetry.ts`, `test/telemetry.test.ts`).

**The feed** is the orchestrator's, written once, by the daemon alone: `emitFeed` (`src/feed/feed.verb.ts`) appends a run's line to
`feed.jsonl`, and `up`, once it holds the store, a daemon's (`emitDaemonStarted`: `{at, daemon, word: 'daemon started', note}`, the note
saying how the one before it ended); each is the record,
logs it at Info with its run, step and word, and publishes it to the process's hub (`FeedHub`, a sliding `PubSub` its layer builds,
`feedHubLayer`). A live reader in that process, `followFeed`, takes the hub's items and reads from the file what none brought — a line
the hub dropped, or one another process wrote — on a beat that stats the file: the api's `GET /api/feed/stream`, on the hub its daemon
publishes to. A reader in another process, `nemia watch`, watches the file (`watchFeed`), and reads the lease at a pace beside it,
printing `daemon down` and `daemon up` as the store's liveness changes (`livenessLines`, `src/cli/main.ts`): its own output, never a
line of the feed. `--json` prints each line whole with its cursor; `--wake` and `--wake-word` keep the lines a wake word finds.

**Subscriptions** are the feed said to a long-lived task: `nemia subscribe <name> <task>` (`src/subscription/subscription.verb.ts`, also
`POST /api/subscriptions/:name`) puts a file under `$WF_ROOT/subscriptions/`, the person's, and the daemon's deliverer (`deliver` in
`src/subscription/deliver.verb.ts`, forked by `up`) follows the feed for each, writing where it is beside it (`<name>.state.json`, its
one writer, stamped with the subscription it is for). The lines holding a wake word that one read of the feed finds are said to the task
at once, in one message through the runtime's `say`, the routine lines riding them as a digest; with no wake, the digest is said after
`digestEvery` minutes. A read is what the feed's reader handed on since the deliverer last took, a pass's lines together, and no window
waits for more. The cursor moves only once that `say` resolved, so a message is told at least once, to the harness's inbox, and said
again whole by a deliverer stopped before its cursor was written: whether the session reads it is the runtime's
(`agent-runtime/docs/open-issues.md`, #12, #14–#16). A subscription given a floor (`--at-least`, its `scope`) is told only of the runs
whose factory is at it or above, read as each line comes.

**Nemia**, the store's own agent, is the orchestrator's: a long-lived task the daemon's keeper (`keep` in `src/nemia/keep.verb.ts`,
forked by `up`) files while any factory is above `manual` and stops once none is, level-triggered off the levels (`nemia level`) and
her task's view, and subscribes to the feed under the name `nemia`, which no person gives or takes away; her subscription and her
admission carry her floor, `semi-auto`, so a factory at `manual` is left alone. What she is
— her instruction, her fence and her skills — ships in the package's `nemia/` folder, outside `src`, and holds no word of this
repository's team (`test/nemia-shipped.test.ts`); how her session runs is the runtime's (`restartPolicy: 'Always'`, Remote Control).

**The library's writers** are the orchestrator's: an agent, a skill or a workflow of yours written, or removed, against the version it
was read at, and an agent of yours tried on a short brief, each one entry of the command table served on both sides
(`src/agents/library.verb.ts`, `src/skills/skills.verb.ts`, `src/folder/workflows.verb.ts`), its handler refusing a place but yours. The
command line reads a person's file or draft folder into the form the board sends (`src/cli/writers.ts`); the api guards the write and
words the board's answer. Both sides hand a handler only what its one spec gives it (`test/writers-cli.test.ts`,
`apps/api/src/commands/writers.test.ts`).

**In the orchestrator today, a candidate for the runtime**:

- rendering agents and skills for Claude Code (`src/agents/agents.ts`, `src/agents/agents.store.ts`, `toldOf` in
  `src/tick/file.verb.ts`);
- the rules about a harness's knobs the runtime cannot refuse (`tools:` on codex, `skills:` and `harnessPrompt:` on codex or a remote
  agent, `sandbox:` on Claude Code: `src/keys/`). The words each harness takes are the runtime's, asked at `wf start` (`configRefused`
  in `src/start/start.verb.ts`), and what they reach — how two fence words compare, the mode a session is held to its directory in,
  the modes a background session runs in unasked, the models that drop `auto` — is the runtime's answer, read at load through its
  pure door (`fenceReach` from `agent-runtime/vocabulary`, in `src/workflow/fence.ts`, `src/workflow/validate.ts` and
  `src/workflow/step-file.ts`); the refusals' words stay the orchestrator's. The board's form offers the runtime's own words per key
  and harness, `HARNESS_CHOICES` from the same door, which the root entry re-exports for the api;

**In the api today, below its layer**: `runsInOf` in `src/detail/detail.ts` reading a
harness's argv for a mode, and `src/capabilities/reach.ts` re-implementing permission matching. Its readers that touch the machine
are counted against a baseline that only shrinks (`MOVES` in `apps/api/test/kinds.test.ts`), each entry naming the card that moves it,
else the move and where it goes.

**Words of another layer, in every layer today**: a harness's words outside the runtime, a workflow's inside it, and this repository's
team in the packages, each file counted against a baseline that only shrinks (`HARNESS_WORDS`, `WORKFLOW_WORDS` and `TEAM_NAMES` in
`packages/agent-orchestrator/test/words.test.ts`), each entry naming its card, else the move and where it goes.

Nothing here moves until its own card; a change elsewhere does not move it on the side.

## Pure core, effectful shell

Each package keeps its judgement in a pure function and applies it in a shell that does the I/O. In the runtime, the
core is `decide` (`packages/agent-runtime/src/core/domain.ts`) and the shell is `src/core/engine/engine.ts`. Since thin runtime stage 5,
`decide` reads a state off the journal and an event off the pass's observation, and asks a statechart
(`src/core/lifecycle.ts`, XState used as a pure transition function, never run) for the edge: an event with no edge is
refused and reported on the pass, never guessed at. In the orchestrator, the
core is `assess` (`packages/agent-orchestrator/src/tick/assess.ts`) and the shell is the controllers `src/runner.ts` re-exports. The core is tested as
data. The shell reads the world, asks the core, and applies one decision; an `if` that judges belongs in the core.

Both shells are level-triggered: a pass reads the world, decides and acts, and carries nothing between passes that the
next could not read again. The one thing the orchestrator's tick keeps in memory is a cache under that rule, not beside
it: a finished run judged at rest on a full pass is answered from its memo while none of its inputs changed — its record,
its files in the store, its tasks on the runtime's feed, its result branches' tips (`src/rest/rest.ts`, `restMemo` in
`src/tick/tick.verb.ts`). It is keyed by what it read, emptied by a feed that went back, and rebuilt by one full pass on a
restart, so it never decides what a full pass would not; the tests that tick judge every answer from it in full as well
(`WF_VERIFY_REST`). Beside it, on the same memo, the pass's `standing` keeps what it last read of each result branch against
its run's `baseRef`, keyed by two commit ids — the commit judged and the `baseRef` — so a fact that never goes stale; the place believes it
only while the branch's commit is still the one judged, and a restart asks every `baseRef` once (`StandingMemo` in
`src/standing/standing.verb.ts`). The stats keep one more, on the same key, in the process that serves them: each finished run's facts,
while its files in the store stamp the same and nothing of its tasks is on the feed (`StatsMemo` in
`src/stats/stats.verb.ts`), and the board's list of runs one more: each finished run's summary, while its record, its files in the
store, its tasks on the feed and its branches' tips stand (`RestingMemo` in `src/rest/resting.verb.ts`, read by the list's `runs` entry
through `runsSummarized` in `src/summary/summary.verb.ts`), every memo brought up to the feed by `src/rest/rest.verb.ts`. The api holds
both for an app; `wf stats` and `wf ls` keep none, and the api's tests read every answer from them afresh as well (`WF_VERIFY_REST`).

## The rules

**1. Between packages, only the public contract.** Code outside packages/agent-runtime reaches it through
`agent-runtime`, and its vocabulary through `agent-runtime/vocabulary`, alone; a test file, and no file of a `src` or a `bin`, may also
import `agent-runtime/testing`, the engine's stand-in (`testingBreaches` in the runtime's `contract.test.ts`). That rules out its src/ by
any route: a subpath not in its `exports`, a relative path, `import.meta.resolve`, or a path built with path.join. `decide` is exported
by no entry, and the stand-in by the testing entry alone. The apps
reach packages/agent-orchestrator through `agent-orchestrator`, `agent-orchestrator/run`,
and `agent-orchestrator/workflow` alone. `./workflow` is the pure format, and what reads a folder from disk, and the
refusals by kind, are exported from `agent-orchestrator`. XState is a dependency
of the runtime alone: `src/core/lifecycle.ts` is the one file of any workspace that imports it, and neither entry exports it,
the machine, or the readings `decide` moves by. `agent-runtime` exports the lifecycle's graph as plain data (`lifecycleGraph`: its states, edges and a person's verbs),
which the board draws. The packages' entries are Effect, and the api is the system's public interface: a controller is a program its
caller runs over the engine with `runWith`, and `ae` runs each verb of `Engine.layer(…)` as an Effect. No entry of the runtime exports
a function that answers a Promise (`packages/agent-runtime/test/plain-faces.test.ts`).

Lint holds the layers' imports as they are typed: `.oxlintrc.json` sets `no-restricted-imports` in one block per layer, over its
source. The web's imports no workspace package, no harness SDK and no path into `packages/`; the api's imports the orchestrator
through its three entries alone, and no runtime or harness SDK; the orchestrator's imports no harness SDK; the runtime's imports no
layer above it. A harness SDK (`@anthropic-ai/claude-agent-sdk`, `@a2a-js/sdk`) is the runtime's alone.

Tests: `packages/agent-runtime/test/contract.test.ts`, `packages/agent-orchestrator/test/contract.test.ts`,
`packages/agent-runtime/test/xstate-boundary.test.ts`, and `packages/agent-orchestrator/test/imports.test.ts`, which runs oxlint
with the layers' blocks on planted files.

**2. Inside the orchestrator, every file is of one of four kinds**, held by
`packages/agent-orchestrator/test/boundary.test.ts`. A file in a feature folder (`src/<feature>/`) says its kind by its
name: `x.store.ts` is a store, `x.verb.ts` a controller, any other name pure, and every file of `src/cli/` is the CLI's.
A file at the top of `src/` is named in `PURE`, `STORE`, `CONTROLLER` or `CLIENT`.

- **pure** imports no agent-runtime, no node:fs (nor fs/promises), no node:child_process, no node:http, node:https,
  node:net or node:os, reads neither `process.env` nor `fetch`, and imports no file of the other kinds: radius, rendering,
  retry, run and workflow at the top, and the folders' own — agents, artifacts, branches, cap,
  check, closeout, daemon, ending, feed, folder, former, gate, harness, inbox, keys, level, merge, meter, plan, prune, record, refusal,
  rest, say, series, skills, status, step, subscription, timeline, views, wait, workflow, workspace.
- **store** is the I/O beneath the controllers. It imports no agent-runtime, never a controller and not the client:
  branches and artifacts at the top, and record.store, folder.store, write.store, worktree.store, agents.store,
  custom.store, read.store (in agents and in skills), skills.store, plan.store, daemon.store, feed.store, inbox.store, tally.store,
  places.store, config.store, series.store, subscription.store, level.store and a2a.store in the folders. They load as a tree. At
  the bottom are record/places.store.ts, skills/read.store.ts (where agents and skills are looked for, and the skills read there),
  meter/tally.store.ts (the pass's meter) and config/config.store.ts, which import no store file. agents/read.store.ts (the
  agents read, and a person's custom instructions) imports only skills/read.store.ts; folder/folder.store.ts imports only
  agents/read.store.ts and skills/read.store.ts; record/record.store.ts imports only the bottom four, folder.store.ts and
  record/steps.store.ts; workspace/worktree.store.ts imports only record.store.ts, places.store.ts, tally.store.ts and place/place.store.ts; folder/write.store.ts
  imports only record.store.ts, the two reads and factory/factory.store.ts. Any other store file imports only these, and none imports it.
  Outside the store, only the client and the controllers beneath the CLI import a store file, and one of them imports
  each.
- **controller** uses the runtime through the client: runner.ts, the package's root, which re-exports by name; the tick
  (tick.verb, advance.verb) and the verbs beneath it, one feature each (views.verb, file.verb, ending.verb, cap.verb,
  meter.verb, start.verb, plan.verb, inbox.verb, cancel.verb, retry.verb, gate.verb, say.verb, wait.verb, round.verb,
  merge.verb, list.verb, decide.verb, forget.verb, prune.verb, free.verb); and src/cli/ and the bins,
  bin/nemia.ts and its alias bin/wf.ts, above it. A verb reaches the client itself or through a controller it imports.
  src/cli/ reaches the package only through runner.ts, workflow.ts and its own files, and each bin only through cli/main.ts
  and cli/exit.ts. The client and
  the controllers import one another with no cycle.
- **client** is `src/runtime-client.ts`, the subject of the third rule.

A place's code (`place/<name>/`, the git place's `place.ts`, `git.ts` and `verbs/`) is none of the four, and stands beside `src`: it
imports node's built-ins, `effect`, its own files, and what a place is (`src/place/place.ts`, `src/place/place.store.ts`), and one file
of `src` alone imports it, `src/place/shipped.store.ts`, which gives it as a layer (`gitPlaceLayer`); every other file asks the place it
is given (`PlaceService`). `placeBreaks` in the same test holds both. The CLI's `main` is handed its place as it is handed its engine,
the git place where it is handed none, and each command gives its program that one: `test/cli-place.test.ts` refuses a file of
`src/cli` that names the git place.

A file in src or bin that no kind names fails the suite. `packages/agent-orchestrator/test/layout.test.ts` holds the
folders: at most six source files in one, no folder named `utils`, `helpers`, `common`, `shared` or `misc`, no two
source files that need each other's values, no source file that imports a test, and a folder's pure code imported from
outside through its face — its `index.ts`, or its one pure file.

**3. The runtime is reached through one client.** Of the orchestrator's files, `src/runtime-client.ts` alone imports
agent-runtime, a type included (`CLIENT` in test/boundary.test.ts). It creates the runtime (`engine()`, `HARNESSES`): the
runtime's `Engine` service from `agent-runtime`, built once, each verb an Effect a controller's program reads with `asked`
(`engineOf`, which a test hands a layer of its own); a caller runs a program over it with `runWith`. It passes the runtime's surface through rather than wrapping it. Every controller beneath the CLI reaches it, itself or
through a controller it imports, and it imports no controller. The runtime's behaviour comes through the client; its vocabulary through
its pure door, `agent-runtime/vocabulary` (`src/vocabulary.ts`: the words each harness takes, per key (`HARNESS_CHOICES`), `fenceReach`, `unruledIn`, and the folders a
harness reads as its own configuration in a mounted folder (`configFolderIn`), with no Effect and no I/O, held by `packages/agent-runtime/test/vocabulary-door.test.ts`), which any file of the orchestrator imports, a pure one included
(`VOCABULARY` in test/boundary.test.ts).

**Inside the runtime, folders by feature**, held by path in `packages/agent-runtime/test/layout.test.ts`. The entries,
`src/index.ts`, the vocabulary door `src/vocabulary.ts` and the testing entry `src/testing.ts`, are the only files flat in `src/`; each
re-exports by name. The testing entry gives `testEngine()` (`src/service/test-engine.ts`, beside `Engine`), which no file of `src` or
`bin` takes, and whose own files import Effect and the engine service alone (`test/testing-door.test.ts`). `core/` is the judgement
(`domain.ts`, `session.ts`, `lifecycle.ts`) and `core/engine/` its shell (the engine, filing, the journal, the memo, the tally);
`harness/` is the seam (`seam.ts`, `args.ts`) and each harness's driver beneath it (`claude/`, `codex/`, `detached/`); `a2a/` is
the one place the A2A SDK is imported; `service/` is the engine as an Effect service, and `cli/` the `ae`
command. The core imports of the harnesses only `seam.ts`, `args.ts` and the harness face;
neither the core nor a harness imports `a2a/`, `service/` or `cli/`; `cli/` reaches the runtime through `src/index.ts` alone; and no two files import each other's values,
directly or around a loop. A folder another folder reads has a face, `index.ts`.

**The api's kinds and folders.** The api is routes over readers, and has two kinds of file, held by `apps/api/test/kinds.test.ts`:
the entry files, `main.ts`, `app.ts` and `layer.ts`, which may read the environment and serve HTTP; and the readers, every other file,
which import no node:fs (nor fs/promises), node:child_process, node:http, node:https, node:net or node:os, nor `@hono/node-server`,
and read neither `process.env` nor `fetch`. A reader that does today is listed with what it reaches (`MOVES`), and the list only
shrinks. Its `src/` is a folder per page or verb a
person uses — `runs/`, `detail/`, `steps/`, `decide/`, `asks/`, `inbox/`, `factory/`, `capabilities/`, `workflows/`,
`agents/`. The root holds `main.ts`, `app.ts`, `port.ts`, `guard.ts`, `store.ts`, `layer.ts` (the services a handler reads, and
`served`, which runs it on the app's `ManagedRuntime`) and `body.ts` (the request-body reader every folder uses) and nothing else.
A folder holds at most six source files; one of two or more has a face, `index.ts`, which holds only re-exports by name, and one of
one file has none. `app.ts` mounts each folder through its face. An
import between two folders names the file it needs wherever the face would close a cycle — `detail/` reads a step's artifacts
and `steps/` a run's try — since a cycle of values passes the typecheck and fails only as the modules load. No two api
files need each other's values, and no file or folder is named `utils`, `helpers`, `common`, `shared` or `misc`. Test:
`apps/api/test/layout.test.ts`.

**4. Each layer says its own words**, held by `packages/agent-orchestrator/test/words.test.ts`. A harness's words — Claude Code's,
Codex's and Anthropic's names, and the runtime's own permission modes and sandboxes but the plain English ones — stay in
packages/agent-runtime: not in the orchestrator's `src` and `bin`, `apps/api/src` or `apps/web/src`. A workflow's words — a workflow,
a step, a gate, a factory, a closeout, the orchestrator, `wf` and Nemia — stay out of the runtime's `src` and `bin`. This repository's
team, the agents of `workflows/agents/`, stays out of every package's `src`. A word is matched whole and in any case, comments
included. Each file that says one today is counted, and the count only shrinks.

Each rule's test first refuses planted source that breaks it, so none can pass by reading nothing. The contract tests
read every file git lists outside their package; `turbo.json` makes the apps' `src` and `test`, for the runtime the apps' root
`.ts` files and the orchestrator's source and tests, and for the orchestrator `workflows/agents/`, inputs of their package's test (`packages/agent-orchestrator/test/turbo-inputs.test.ts`),
so a breach there cannot replay a pass from turbo's cache. A change to any other file outside a package is not in its
cache key: run `npx turbo run test --force` after one.
