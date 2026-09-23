# Architecture

Two packages and two apps, in layers, and one package beside them. Each layer owns one thing and is reached through a
short list of entries, its public contract. Three rules keep it that way, and each is a test that fails the suite when
broken. This page says what the tests hold; the tests are the rules.

## The layers

| Layer | Owns | Public contract |
|---|---|---|
| `packages/agent-runtime` | One agent session run to completion, durably, on one harness: the journal, the attempts, the harnesses' vocabulary. The `ae` command. | `agent-runtime` → `src/facade.ts`, the runtime in Promises. `agent-runtime/effect` → `src/index.ts`, the same in Effect. `decide` is exported by neither. |
| `packages/agent-orchestrator` | A folder of markdown as a workflow, and a run of its steps: which task to file next, what a person must decide, what the run's record says. The `wf` command. | `agent-orchestrator` → `src/runner.ts`: the controller, and everything that reads or writes the disk. `agent-orchestrator/run` → `src/run.ts`: `assess`, and the words a run is described in. `agent-orchestrator/workflow` → `src/workflow.ts`: the format, pure. |
| `apps/api` | The workflows behind HTTP, and the feed as a stream. | Its routes. |
| `apps/web` | The board people look at. It talks to the api over HTTP and imports no package. | Its pages. |
| `packages/agent-judge` | Beside the layers, and optional: asks one typed question once and records the answer. The `judge` command. | Its own entries; nothing in the workspace uses them. |

Dependencies point down the table and never up: the web app talks to the api, the api imports the orchestrator, and
the orchestrator imports the runtime. A test of the api may import the runtime's entries too. Spawning a package's
`bin/` — `wf feed` in the web app's e2e test, say — is using its CLI, not importing it.

## Pure core, effectful shell

Each package keeps its judgement in a pure function and applies it in a shell that does the I/O. In the runtime, the
core is `decide` (`packages/agent-runtime/src/domain.ts`) and the shell is `src/engine.ts`. In the orchestrator, the
core is `assess` (`packages/agent-orchestrator/src/run.ts`) and the shell is `src/runner.ts`. The core is tested as
data. The shell reads the world, asks the core, and applies one decision; an `if` that judges belongs in the core.

## The rules

**1. Between packages, only the public contract.** Code outside packages/agent-runtime reaches it through
`agent-runtime` and `agent-runtime/effect` alone. That rules out its src/ by any route: a subpath not in its `exports`,
a relative path, `import.meta.resolve`, or a path built with path.join. `decide` is exported by neither entry. The apps
reach packages/agent-orchestrator through `agent-orchestrator`, `agent-orchestrator/run` and
`agent-orchestrator/workflow` alone. `./workflow` is the pure format, and what reads a folder from disk is exported
from `agent-orchestrator`. The judge imports nothing from the workspace, and nothing imports it.

Tests: `packages/agent-runtime/test/contract.test.ts`, `packages/agent-orchestrator/test/contract.test.ts` and
`packages/agent-judge/test/boundary.test.ts`.

**2. Inside the orchestrator, every file is of one of three kinds**, named in
`packages/agent-orchestrator/test/boundary.test.ts`.

- **pure** imports no agent-runtime, no node:fs (nor fs/promises), no node:child_process, and no file of the other
  two kinds: check, closeout, daemon, deps, feed, inbox, plan, radius, retry, run, timeline, workflow.
- **store** is the I/O beneath the controllers. It imports no agent-runtime and never a controller: places,
  workflow-store, store, worktree, branches, artifacts, authoring, daemon-store, feed-store, inbox-store. They load as a
  tree. At the bottom are places.ts and workflow-store.ts, which import no store file. store.ts imports only those two,
  and worktree.ts imports only store.ts and places.ts. No other store file is imported by another, and runner.ts
  imports each one.
- **controller** may use the runtime: runner.ts, cli.ts, bin/wf.ts. cli.ts reaches the package only through runner.ts
  and workflow.ts.

A file in src or bin that no kind names fails the suite.

**3. The runtime is reached through one client.** Of the orchestrator's files, `src/runner.ts` alone imports
agent-runtime, a type included (`CLIENT` in test/boundary.test.ts). The next card moves that import into a client file
of its own and splits runner.ts, and `CLIENT` moves with it.

Each rule's test first refuses planted source that breaks it, so none can pass by reading nothing. The contract tests
read every file git lists outside their package, so a change elsewhere alone is not in their package's turbo cache
key: run `npx turbo run test --force` after one.
