---
name: effect
description: "How this repository writes Effect 4: read the docs installed with it first, then the Effect 3 names it no longer has, and our services, layers, Effect.fn verbs, tagged errors and plain faces, each where the runtime shows it. For a change that imports from effect, and for a review of one."
---

# Writing Effect 4 here

## Read the installed docs first

`effect` is pinned to one exact version, the same in every package (`packages/agent-runtime/test/effect-version.test.ts`
refuses a range or a second version). Its own guide ships with it and matches it:

1. `node_modules/effect/AGENTS.md` — the patterns and an index of worked examples.
2. The topic you need under `node_modules/effect/ai-docs/src/` (`01_effect` for services, layers, errors and resources).
3. The installed source and types, `node_modules/effect/dist/*.d.ts`, when a name is in doubt.

Prefer them to what you remember and to anything outside the repository: the package says outside copies may be outdated.
This file holds only what is ours.

## Effect 3 names this version does not have

Measured on `4.0.0-rc.116`. `tsc` catches each, but writing from memory costs a round per name.

| Effect 3 | Effect 4 |
| --- | --- |
| `Context.Tag`, `Context.GenericTag`, `Effect.Service` | `Context.Service` |
| `Effect.catchAll` | `Effect.catch` |
| `Effect.catchAllCause` | `Effect.catchCause` |
| `Effect.either` | `Effect.result` |
| `Either` | `Result` |
| `Effect.fork` | `Effect.forkChild` |
| `Effect.forkDaemon` | `Effect.forkDetach` |
| `Effect.zipRight` | `Effect.andThen` |
| `Effect.tapErrorCause` | `Effect.tapCause` |
| `Layer.scoped` | `Layer.effect` |
| `Config.string` | `Config.String` |

`effect-version.test.ts` reads this table: each name on the left must be gone and each on the right present in the pinned
version, and the version above must be the pin. An upgrade re-measures the table before it changes the pin.

## Services and layers

- A service is a `Context.Service` class, and its static `layer` turns any implementation into a layer: `Journal` in
  `packages/agent-runtime/src/core/engine/journal.ts`, `Runner` in `src/harness/seam.ts`, each `Layer.succeed(Tag)(Tag.of({ ... }))`.
- A value with a default is a `Context.Reference`, given by `Layer.succeed`: `TickMemo` and `tickMemoLayer` in `src/core/engine/memo.ts`.
- A layer built from another service is `Layer.unwrap(Effect.gen(...))`: `a2aRunner` in `src/a2a/client.ts`.
- A service made from options is `Layer.effect(Tag, make(options))` under a static `layer`: `Engine` in `src/service/engine.ts`,
  whose `make` joins the engine's layers with `Layer.mergeAll` and provides them to each verb.
- A service changed in one verb is a layer over it: `Layer.effect(Tag, ...)` that reads the service and returns `Tag.of({ ...e, verb })`,
  `.pipe(Layer.provide(inner))` (`engineOf` in `packages/agent-orchestrator/src/runtime-client.ts`).
- A test hands its own implementation as `Layer.succeed(Tag)(Tag.of({ ... }))`, a verb it does not keep an `Effect.die` naming
  itself: `board` in `packages/agent-orchestrator/test/engine-board.ts`.

## Verbs

- Each verb is `Effect.fn('name')(function* (...) { ... })`, which names its span: `file`, `admit` in
  `src/core/engine/filing.ts`, `step`, `tick` in `src/core/engine/engine.ts`.
- A verb refuses an argument it no longer takes, never ignores it (`packages/agent-runtime/CLAUDE.md`, *Arguments and doors*):
  `tick` declares no parameter and reads `[...arguments]` into `tickRefusalOf`.

## Tagged errors

- The runtime's errors are `Schema.TaggedError` classes from `effect`, each with a `message`: `FileRefused` in
  `src/core/engine/filing.ts`, `TickRefused` in `src/core/engine/engine.ts`, `JournalError` in `src/core/engine/journal.ts`,
  `RunnerError` in `src/harness/error.ts`. A verb fails with
  `return yield* Effect.fail(new TickRefused({ message }))`, and a caller picks one out with `Effect.catchTag('TickMemoDiverged', ...)`
  (`src/service/engine.ts`).
- A refusal written for a file that must not load the `effect` barrel — a pure file, or the orchestrator's refusals — is a
  `Data.TaggedError` imported from `effect/Data`, never from `effect`, and carries `exitCode: 2` as every refusal here does
  (the root `CLAUDE.md`, *Errors say what to do next*): `Missing`, `Conflict` and `Invalid` in
  `packages/agent-orchestrator/src/refusal/refusal.ts`, thrown as `new Invalid({ message })`, and exported to the api by
  `agent-orchestrator`. `effect/Data` loads 14 modules; the
  barrel loads 203, about 100 ms, on every consumer of `agent-orchestrator/run` and `agent-orchestrator/workflow`, whose modules
  `packages/agent-orchestrator/test/refusal.test.ts` pins.

## Resources and the process

- What a command holds while the process lives is `Effect.acquireRelease` in its scope, and a loop beside it `Effect.forkScoped`:
  the claim on the store and the beat of `wf up`, and `watching` (the watcher of `wf watch`), in `packages/agent-orchestrator/src/cli/main.ts`.
  Finalizers run in reverse, so the beat is interrupted before the store is let go.
- `runMain` in `packages/agent-orchestrator/src/cli/main.ts` runs such a command: SIGINT, SIGTERM and SIGHUP interrupt it and
  exit 130, 143 or 129 once the finalizers ran; otherwise it resolves the value or rejects with the failure itself (`Cause.squash`),
  so a refusal's `exitCode` reaches `bin/wf.ts`. Not `NodeRuntime.runMain` of `@effect/platform-node`, which is not installed: its
  default teardown (`Runtime.defaultTeardown`) exits 130 on any interruption, whichever signal came, it handles no SIGHUP, and it
  hands no failure back to the caller.
- What an api route holds is let go in its scope too. A callback watch becomes a stream with `Stream.callback` on a bounded `suspend`
  buffer, each item handed on with an awaited `Queue.offer`, so the watch waits for a slow reader: `feedEvents` in
  `apps/api/src/factory/feed.ts`. Hono's `streamSSE` runs it with the app's `runtime.runPromiseExit(program, { signal })`, the signal
  aborted from `stream.onAbort`: `runPromiseExit`, since `streamSSE` prints a rejection. A child process is `acquireRelease` with its
  release reading the `Exit`, under `Effect.timeoutOrElse`, which waits for the release: `claudeQuota` in
  `packages/agent-runtime/src/harness/claude/quota.ts`, `serverAsk` in `apps/api/src/capabilities/capabilities.ts`.

## The api's runtime

- The api runs its handlers on one `ManagedRuntime`, built from its layer (`appOf` in `apps/api/src/app.ts`), as
  `ai-docs/src/04_integration/10_managed-runtime.ts` does for Hono: a middleware puts it on each request (`c.var.runtime`), and
  `served` (`apps/api/src/layer.ts`) runs a handler over the services — the environment, the engine, the store's root, the MCP asker,
  the quota asker, and what its reads keep between requests (`ApiConfig`, `Engine`, `StoreRoot`, `McpAsker`, `QuotaAsker`, `ReadMemo`).
- What an app keeps between requests is a service built with its runtime (`Layer.sync`), never module state: each `ManagedRuntime`
  builds its layer afresh, so an app over another engine keeps nothing of another's.
- A test builds an app over `Layer.merge(liveOf(), …)`, the service it replaces given last: `Layer.merge` keeps the later of two.
- A handler's body stays a plain `async` function: a failure yielded inside `Effect.gen` never reaches a `try` around the `yield*`,
  and the routes catch what they word themselves. `runPromise` rejects with the failure itself, so a refusal reaches `app.onError`
  as the instance it was.

## Programs

- The layers speak Effect to each other; the api is the system's public face. A caller of the runtime builds its engine once from
  `Engine.layer(options)` (`agent-runtime/effect`) and runs each verb as an Effect: `ae` (`packages/agent-runtime/src/cli/main.ts`)
  and the orchestrator's client (`engineOf` in `packages/agent-orchestrator/src/runtime-client.ts`). A refusal a caller answers with
  a sentence and an exit code is worded by `refusalWords` (`src/service/refusal.ts`): an `Error` led by the verb whose `exitCode` is 2.
  `promiseEngine` (`src/facade/engine.ts`) is left only to the runtime's own tests.
- `agent-runtime/effect` (`src/index.ts`) is the door that hands out Effect values, and it does not export `decide`.
- Stores and pure files stay plain TypeScript: `decide` in `src/core/domain.ts` imports no Effect.
- A controller is an `Effect.fn` program that requires the engine as a service (`EngineService`): it reads the engine with `asked`,
  which dies of a runtime refusal in the runtime's words, and lifts every other read with `tried` or `awaited`, failing with a
  `Refusal` and dying of anything else. Its caller runs it with `runWith(e, program)` over the engine it built once — the CLI, the
  daemon, the api's handlers and the tests — and the Promise rejects with the refusal or the defect as it was thrown: `decideRun`,
  `forgetRun`, the verbs a person asks of a run (`roundRun`, `acceptRun`, `retryRun`, `approveRun`, `sayRun`, `cancelRun`), the
  views' reads (`taskPhasesRead`, `checkReportsRead`, `refusalRead`, `parentRead`, `parentsRead`, `filingsRead`), and the tick
  (`tickRun`), whose pass is metered through `meteredPass` over the module-global meter. A command's `handler` is a program too. An
  engine refusal a controller answers itself is read off the raw verb: `toldBy` in `say.verb.ts` turns the runtime's refusal into a
  `Conflict`, and a journal that does not read is told by `unreadableJournal`.
- A controller that reads no engine requires nothing: `startRun`, run with `Effect.runPromise` or `runWith` alike.

## Tests

`node:test`, with `Effect.runPromise` and the layers provided in the test (`const run` in
`packages/agent-runtime/test/engine.test.ts`). No `@effect/vitest`, though `ai-docs/src/09_testing` uses it.

## Why

`docs/eval-2026-09-28-effect-everywhere.md` weighs Effect in every layer and orders the cards that adopt it.
