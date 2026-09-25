# Architecture

Two packages and two apps, in layers, and one package beside them. Each layer owns one thing and is reached through a
short list of entries, its public contract. Three rules keep it that way, and each is a test that fails the suite when
broken. This page says what the tests hold; the tests are the rules.

## The layers

| Layer | Owns | Public contract |
|---|---|---|
| `packages/agent-runtime` | One agent session run to completion, durably, on one harness: the journal, the attempts, the harnesses' vocabulary. The `ae` command. | `agent-runtime` → `src/facade.ts`, the runtime in Promises. `agent-runtime/effect` → `src/index.ts`, the same in Effect. `decide` is exported by neither. |
| `packages/agent-orchestrator` | A folder of markdown as a workflow, and a run of its steps: which task to file next, what a person must decide, what the run's record says. The `wf` command. | `agent-orchestrator` → `src/runner.ts`: the controllers, and everything that reads or writes the disk, re-exported by name. `agent-orchestrator/run` → `src/run.ts`: `assess`, and the words a run is described in. `agent-orchestrator/workflow` → `src/workflow.ts`: the format, pure. |
| `apps/api` | The workflows behind HTTP, and the feed as a stream. | Its routes. |
| `apps/web` | The board people look at. It talks to the api over HTTP and imports no package. | Its pages. |
| `packages/agent-judge` | Beside the layers, and optional: asks one typed question once and records the answer. The `judge` command. | Its own entries; nothing in the workspace uses them. |

Dependencies point down the table and never up: the web app talks to the api, the api imports the orchestrator, and
the orchestrator imports the runtime. A test of the api may import the runtime's entries too. Spawning a package's
`bin/` — `wf feed` in the web app's e2e test, say — is using its CLI, not importing it.

## Pure core, effectful shell

Each package keeps its judgement in a pure function and applies it in a shell that does the I/O. In the runtime, the
core is `decide` (`packages/agent-runtime/src/domain.ts`) and the shell is `src/engine.ts`. Since thin runtime stage 5,
`decide` reads a state off the journal and an event off the pass's observation, and asks a statechart
(`src/lifecycle.ts`, XState used as a pure transition function, never run) for the edge: an event with no edge is
refused and reported on the pass, never guessed at. In the orchestrator, the
core is `assess` (`packages/agent-orchestrator/src/run.ts`) and the shell is the controllers `src/runner.ts` re-exports. The core is tested as
data. The shell reads the world, asks the core, and applies one decision; an `if` that judges belongs in the core.

## The rules

**1. Between packages, only the public contract.** Code outside packages/agent-runtime reaches it through
`agent-runtime` and `agent-runtime/effect` alone. That rules out its src/ by any route: a subpath not in its `exports`,
a relative path, `import.meta.resolve`, or a path built with path.join. `decide` is exported by neither entry. The apps
reach packages/agent-orchestrator through `agent-orchestrator`, `agent-orchestrator/run` and
`agent-orchestrator/workflow` alone. `./workflow` is the pure format, and what reads a folder from disk is exported
from `agent-orchestrator`. The judge imports nothing from the workspace, and nothing imports it. XState is a dependency
of the runtime alone: `src/lifecycle.ts` is the one file of any workspace that imports it, and neither entry exports it,
the machine, or the readings `decide` moves by.

Tests: `packages/agent-runtime/test/contract.test.ts`, `packages/agent-orchestrator/test/contract.test.ts`,
`packages/agent-judge/test/boundary.test.ts` and `packages/agent-runtime/test/xstate-boundary.test.ts`.

**2. Inside the orchestrator, every file is of one of four kinds**, named in
`packages/agent-orchestrator/test/boundary.test.ts`.

- **pure** imports no agent-runtime, no node:fs (nor fs/promises), no node:child_process, and no file of the other
  kinds: check, closeout, daemon, deps, feed, inbox, meter, plan, radius, retry, run, timeline, workflow.
- **store** is the I/O beneath the controllers. It imports no agent-runtime, never a controller and not the client: places,
  workflow-store, store, worktree, branches, artifacts, authoring, daemon-store, feed-store, inbox-store, tally. They load as a
  tree. At the bottom are places.ts, workflow-store.ts and tally.ts (the pass's meter), which import no store file. store.ts
  imports only those three, and worktree.ts imports only store.ts, places.ts and tally.ts. No other store file is imported by another. Outside the store,
  only the client and the controllers beneath the CLI import a store file, and one of them imports each.
- **controller** uses the runtime through the client: runner.ts, the package's root, which re-exports by name; views.ts,
  start.ts, tick.ts, verbs.ts, forget.ts and decide.ts beneath it, split by concern; and cli.ts and bin/wf.ts above it.
  cli.ts reaches the package only through runner.ts and workflow.ts, and bin/wf.ts only through cli.ts. The client and
  the controllers import one another with no cycle.
- **client** is `src/runtime-client.ts`, the subject of the third rule.

A file in src or bin that no kind names fails the suite.

**3. The runtime is reached through one client.** Of the orchestrator's files, `src/runtime-client.ts` alone imports
agent-runtime, a type included (`CLIENT` in test/boundary.test.ts). It creates the runtime (`engine()`, `HARNESSES`) and
passes the runtime's surface through rather than wrapping it. Every controller beneath the CLI imports it, and it
imports no controller.

Each rule's test first refuses planted source that breaks it, so none can pass by reading nothing. The contract tests
read every file git lists outside their package, so a change elsewhere alone is not in their package's turbo cache
key: run `npx turbo run test --force` after one.
