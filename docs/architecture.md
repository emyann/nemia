# Architecture

Two packages and two apps, in layers. Each layer owns one thing and is reached through a
short list of entries, its public contract. Four rules keep it that way, and each is a test that fails the suite when
broken. This page says what the tests hold; the tests are the rules.

## The layers

| Layer | Owns | Public contract |
|---|---|---|
| `packages/agent-runtime` | Agent sessions on a harness, durably: a job that runs to its end, and (not built yet) a long-lived session that runs until stopped. How a session runs: its command, mounts, restart and spend, the journal, the attempts, the harnesses' vocabulary. The `ae` command. | `agent-runtime` → `src/facade.ts`, the runtime in Promises. `agent-runtime/effect` → `src/index.ts`, the same in Effect. `agent-runtime/vocabulary` → `src/vocabulary.ts`, the harnesses' words and what their fence words reach (`fenceReach`), pure. `decide` is exported by none. |
| `packages/agent-orchestrator` | A folder of markdown as a workflow, and a run of its steps: which task to file next, what a person must decide, what the run's record says. The `wf` command, to become `nemia`. | `agent-orchestrator` → `src/runner.ts`: the controllers, and everything that reads or writes the disk, re-exported by name. `agent-orchestrator/run` → `src/run.ts`: `assess` (`src/tick/assess.ts`), and the words a run is described in, re-exported by name. `agent-orchestrator/workflow` → `src/workflow.ts`: the format, pure. `agent-orchestrator/effect` → `src/effect.ts`: the refusals by kind, `Missing`, `Conflict` and `Invalid`, as `agent-runtime/effect` is the runtime's face in Effect. |
| `apps/api` | The workflows behind HTTP, and the feed as a stream. | Its routes. |
| `apps/web` | The board people look at. It talks to the api over HTTP, decodes each answer it reads with a schema of its own (`effect`), imports none of our packages, names no store path, and builds no command of its own: a command it shows is text the api answered. | Its pages. |

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

**In the orchestrator today, a candidate for the runtime**:

- session admission and pools (`src/cap/cap.ts`, `WF_MAX_CONCURRENT`);
- the daemon and its lease (`src/daemon/`, `upVerb` in `src/cli/main.ts`);
- rendering agents and skills for Claude Code (`src/agents/agents.ts`, `src/agents/agents.store.ts`, `toldOf` in
  `src/tick/file.verb.ts`);
- the rules about a harness's knobs the runtime cannot refuse (`tools:` on codex, `skills:` and `harnessPrompt:` on codex or a remote
  agent, `sandbox:` on Claude Code: `src/keys/`), and the fence's ranking of codex's sandboxes (`SANDBOX_RANK` in
  `src/workflow/fence.ts`), held equal to the runtime's by `test/fence.test.ts`. The words each harness takes are the runtime's,
  asked at `wf start` (`configRefused` in `src/start/start.verb.ts`);
- what the orchestrator still knows of Claude Code's modes and models, candidates for the runtime: the fence's ranking of the modes and
  the mode it holds a session to its directory in (`MODE_RANK`, `HELD_MODE` in `src/workflow/fence.ts`), the modes a folder team's
  background step may run in unasked (`validateFolderMode` in `src/workflow/validate.ts`), and the models that take no `auto` mode
  (`AUTO_UNSUPPORTED` in `src/keys/keys.ts`).

**In the api today, below its layer**: `runsInOf` in `src/detail/detail.ts` reading a
harness's argv for a mode, and `src/capabilities/reach.ts` re-implementing permission matching. Its readers that touch the machine
are counted against a baseline that only shrinks (`MOVES` in `apps/api/test/kinds.test.ts`), each entry naming the card that moves it,
else the move and where it goes.

**Words of another layer, in every layer today**: a harness's words outside the runtime, a workflow's inside it, and this repository's
team in the packages, each file counted against a baseline that only shrinks (`HARNESS_WORDS`, `WORKFLOW_WORDS` and `TEAM_NAMES` in
`packages/agent-orchestrator/test/words.test.ts`), each entry naming its card, else the move and where it goes.

**In the web today, against its rule**, until the api answers that text, each file counted against a baseline that only shrinks
(`STORE_PATHS` and `COMMAND_TEXT` in `apps/web/test/structure.test.ts`):

- store paths, in `src/routes/agents.tsx`, `src/routes/agents_.new.tsx`, `src/routes/agents_.skills.new.tsx`,
  `src/routes/agents_.$from.$agent.tsx`, `src/routes/workflows.tsx` and `src/components/NewWorkflow.tsx`;
- the commands it spells itself: every file of `apps/web/src` that names a `wf` or `nemia` verb, a JSDoc's mention included.

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
(`WF_VERIFY_REST`). The stats keep one more, on the same key, in the process that serves them: each finished run's facts,
while its files in the store stamp the same and nothing of its tasks is on the feed (`StatsMemo` in
`src/stats/stats.verb.ts`, both memos brought up to the feed by `src/rest/rest.verb.ts`). The api holds it for an app;
`wf stats` keeps none, and the api's tests read every answer from it afresh as well.

## The rules

**1. Between packages, only the public contract.** Code outside packages/agent-runtime reaches it through
`agent-runtime` and `agent-runtime/effect`, and its vocabulary through `agent-runtime/vocabulary`, alone. That rules out its src/ by any route: a subpath not in its `exports`,
a relative path, `import.meta.resolve`, or a path built with path.join. `decide` is exported by neither entry. The apps
reach packages/agent-orchestrator through `agent-orchestrator`, `agent-orchestrator/run`,
`agent-orchestrator/workflow` and `agent-orchestrator/effect` alone. `./workflow` is the pure format, `./effect` the
refusals by kind, and what reads a folder from disk is exported from `agent-orchestrator`. XState is a dependency
of the runtime alone: `src/core/lifecycle.ts` is the one file of any workspace that imports it, and neither entry exports it,
the machine, or the readings `decide` moves by. `agent-runtime` exports the lifecycle's graph as plain data (`lifecycleGraph`: its states, edges and a person's verbs),
which the board draws.

Lint holds the layers' imports as they are typed: `.oxlintrc.json` sets `no-restricted-imports` in one block per layer, over its
source. The web's imports no workspace package, no harness SDK and no path into `packages/`; the api's imports the orchestrator
through its four entries alone, and no runtime or harness SDK; the orchestrator's imports no harness SDK; the runtime's imports no
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
  check, closeout, daemon, ending, feed, folder, former, gate, harness, inbox, keys, meter, plan, prune, record, refusal,
  rest, say, skills, status, step, timeline, views, wait, workflow, workspace.
- **store** is the I/O beneath the controllers. It imports no agent-runtime, never a controller and not the client:
  branches and artifacts at the top, and record.store, folder.store, write.store, worktree.store, agents.store,
  skills.store, plan.store, daemon.store, feed.store, inbox.store, tally.store, places.store, config.store and a2a.store in
  the folders. They load as a tree. At the bottom are record/places.store.ts, folder/folder.store.ts, meter/tally.store.ts
  (the pass's meter) and config/config.store.ts, which import no store file. record/record.store.ts imports only those
  four; workspace/worktree.store.ts imports only record.store.ts, places.store.ts and tally.store.ts; folder/write.store.ts
  imports only record.store.ts and folder.store.ts. Any other store file imports only these, and none imports it.
  Outside the store, only the client and the controllers beneath the CLI import a store file, and one of them imports
  each.
- **controller** uses the runtime through the client: runner.ts, the package's root, which re-exports by name; the tick
  (tick.verb, advance.verb) and the verbs beneath it, one feature each (views.verb, file.verb, ending.verb, cap.verb,
  meter.verb, start.verb, plan.verb, inbox.verb, cancel.verb, retry.verb, gate.verb, say.verb, wait.verb, round.verb,
  list.verb, decide.verb, forget.verb, prune.verb); and src/cli/ and bin/wf.ts
  above it. A verb reaches the client itself or through a controller it imports.
  src/cli/ reaches the package only through runner.ts, workflow.ts and its own files, and bin/wf.ts only through cli/main.ts
  and cli/exit.ts. The client and
  the controllers import one another with no cycle.
- **client** is `src/runtime-client.ts`, the subject of the third rule.

A place skill's scripts (`place/<name>/scripts/`) are none of the four: node runs them as they are, so they import node's
built-ins and the scripts beside them alone (`placeBreaks` in the same test).

A file in src or bin that no kind names fails the suite. `packages/agent-orchestrator/test/layout.test.ts` holds the
folders: at most six source files in one, no folder named `utils`, `helpers`, `common`, `shared` or `misc`, no two
source files that need each other's values, no source file that imports a test, and a folder's pure code imported from
outside through its face — its `index.ts`, or its one pure file.

**3. The runtime is reached through one client.** Of the orchestrator's files, `src/runtime-client.ts` alone imports
agent-runtime, a type included (`CLIENT` in test/boundary.test.ts). It creates the runtime (`engine()`, `HARNESSES`): the
runtime's `Engine` service from `agent-runtime/effect`, provided as a layer, each verb run as a Promise for the controllers
(`engineOf`, which a test hands a layer of its own). It passes the runtime's surface through rather than wrapping it. Every controller beneath the CLI reaches it, itself or
through a controller it imports, and it imports no controller. The runtime's behaviour comes through the client; its vocabulary through
its pure door, `agent-runtime/vocabulary` (`src/vocabulary.ts`: the words each harness takes and `fenceReach`, with no Effect and no
I/O, held by `packages/agent-runtime/test/vocabulary-door.test.ts`), which any file of the orchestrator imports, a pure one included
(`VOCABULARY` in test/boundary.test.ts).

**Inside the runtime, folders by feature**, held by path in `packages/agent-runtime/test/layout.test.ts`. The entries,
`src/facade.ts`, `src/index.ts` and the vocabulary door `src/vocabulary.ts`, are the only files flat in `src/`; each re-exports by name. `core/` is the judgement
(`domain.ts`, `session.ts`, `lifecycle.ts`) and `core/engine/` its shell (the engine, filing, the journal, the memo, the tally);
`harness/` is the seam (`seam.ts`, `args.ts`) and each harness's driver beneath it (`claude/`, `codex/`, `detached/`); `a2a/` is
the one place the A2A SDK is imported; `service/` is the engine as an Effect service, `facade/` the Promise door over it behind
`src/facade.ts`, and `cli/` the `ae` command. The core imports of the harnesses only `seam.ts`, `args.ts` and the harness face;
neither the core nor a harness imports `a2a/`, `service/`, `facade/` or `cli/`; `cli/` reaches the runtime through `src/facade.ts` alone; and no two files import each other's values,
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
import between two folders names the file it needs wherever the face would close a cycle — `agents/` reads the runs'
judgement and `runs/` an agent's try — since a cycle of values passes the typecheck and fails only as the modules load. No two api
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
