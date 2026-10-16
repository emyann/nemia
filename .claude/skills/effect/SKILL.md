---
name: effect
description: "Any change to a file that imports from effect — a service, a layer, a verb, a schema at a boundary, a stream, a fiber, a schedule, a log or a metric — and the design or review of one: load it before reading, writing or judging such a file. How this repository writes Effect 4: read the docs installed with it first, reach for Effect's own primitives before writing one by hand, leave the Effect 3 names it no longer has, and keep our services, layers, Effect.fn verbs, tagged errors and programs, each where the runtime shows it."
applies: ["packages/agent-runtime/src/**", "packages/agent-orchestrator/src/**/*.store.ts", "packages/agent-orchestrator/src/**/*.verb.ts", "packages/agent-orchestrator/src/runtime-client.ts", "packages/agent-orchestrator/src/cli/**", "apps/api/src/**", "apps/web/src/lib/api/**"]
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

## Reach for Effect's own primitives

Before writing a loop, a list of listeners, a registry, a fan-out, a timer, a retry, a cache, a counter or a parser by hand, find the task
here and read its page.

| task | primitive | page |
| --- | --- | --- |
| Tell every listener of one event: a feed, a watcher, a page kept live | `PubSub.unbounded`, `PubSub.subscribe` | `node_modules/effect/ai-docs/src/01_effect/07_pubsub/10_pubsub.ts` |
| Do the same work over many items, a bounded number at once: a batch of reads, of removals, of processes | `Effect.forEach`, its concurrency option | `node_modules/effect/dist/Effect.d.ts` |
| Hand work from one fiber to another, bounded, the writer waiting when it is full | `Queue.bounded`, `Queue.take` | `node_modules/effect/dist/Queue.d.ts` |
| Read a sequence over time: the lines of a file, the events of a feed, the pages of a listing | `Stream.callback`, `Stream.fromQueue` | `node_modules/effect/ai-docs/src/03_stream/10_creating-streams.ts` |
| Keep a registry of running fibers, one per key, the old one interrupted when the key runs again | `FiberMap.make`, `FiberMap.run` | `node_modules/effect/dist/FiberMap.d.ts` |
| Run fibers that end with their scope, none left behind | `FiberSet.make`, `FiberSet.run` | `node_modules/effect/dist/FiberSet.d.ts` |
| Keep what was computed for a key, looked up again, refreshed or bounded: a memo, a hand-made cache | `Cache.make`, `Cache.get` | `node_modules/effect/dist/Cache.d.ts` |
| Retry, poll or beat on a cadence: a backoff, a tick, a limit of tries | `Schedule.spaced`, `Schedule.exponential`, `Effect.retry`, `Effect.repeat` | `node_modules/effect/ai-docs/src/06_schedule/10_schedules.ts` |
| Count or measure what the code does: passes, reads, durations | `Metric.counter`, `Metric.histogram` | `node_modules/effect/dist/Metric.d.ts` |
| Say what happened, at a level, with its fields | `Effect.logInfo`, `Effect.annotateLogs`, `Logger.layer` | `node_modules/effect/ai-docs/src/08_observability/10_logging.ts` |
| Time a verb and tie it to its caller | `Effect.fn`, `Effect.withSpan`, `Tracer` | `node_modules/effect/ai-docs/src/08_observability/20_otlp-tracing.ts` |
| Send the spans and logs to a collector, over OTLP | `OtlpTracer.layer`, `OtlpLogger.layer`, `OtlpSerialization.layerJson` | `node_modules/effect/ai-docs/src/08_observability/20_otlp-tracing.ts` |
| Read a value that crosses a boundary: a file, a request, a harness's line, JSON | `Schema.Struct`, `Schema.decodeUnknownEffect` | `node_modules/effect/ai-docs/src/01_effect/02_schema/10_schema-basics.ts` |
| Hold a resource and let it go whatever happens, the last taken first | `Effect.acquireRelease`, `Scope.addFinalizer` | `node_modules/effect/ai-docs/src/01_effect/05_resources/10_acquire-release.ts` |
| Build a service from others and give it to a program | `Layer.effect`, `Layer.provide`, `Layer.mergeAll` | `node_modules/effect/ai-docs/src/01_effect/03_services/20_layer-composition.ts` |

In a review, a hand-rolled version of one of these is a finding.

v4 is not v3: read the page, not your memory.

`effect-version.test.ts` reads this table: each name must be one the pinned version exports, from `effect` or, for the exporters,
`effect/observability`, and each page installed.

## Effect 3 names this version does not have

Measured on `4.0.1`. `tsc` catches each, but writing from memory costs a round per name.

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
- A test is given a stand-in as a layer, and hands no implementation of its own for what is outside the process: the place is
  `testPlace()`'s layer (`packages/agent-orchestrator/place/memory`), and a new test file that makes an engine by hand
  (`Layer.succeed(Tag)(Tag.of({ ... }))`, `promised`) is refused by `packages/agent-orchestrator/test/stand-ins.test.ts`. An engine is the
  runtime's stand-in, `testEngine()` of `agent-runtime/testing` (`const engine = eachTest(testEngine);`), a verb it does not keep an
  `Effect.die` naming itself.

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
  (an error says what to do next): `Missing`, `Conflict` and `Invalid` in
  `packages/agent-orchestrator/src/refusal/refusal.ts`, thrown as `new Invalid({ message })`, and exported to the api by
  `agent-orchestrator`. `effect/Data` loads 15 modules; the
  barrel loads 216, about 130 ms, on every consumer of `agent-orchestrator/run` and `agent-orchestrator/workflow`, whose modules
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
- What an api route holds is let go in its scope too. A live reader is a stream that takes what it holds in its own scope: `followFeed`
  in `packages/agent-orchestrator/src/feed/feed.verb.ts` subscribes to the process's `PubSub.sliding` (`FeedHub`), so a slow reader never
  holds up the writer, reads what the hub dropped from the file, and is counted while it is open; `feedEvents` in
  `apps/api/src/factory/feed.ts` maps it to the stream's events. Hono's `streamSSE` runs it with the app's `runtime.runPromiseExit(program, { signal })`, the signal
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

- The packages' entries are Effect, and the api is the system's public interface. No function the runtime's entries export runs a
  program for its caller or answers a Promise (`packages/agent-runtime/test/plain-faces.test.ts`, its `PROMISED` empty): a program is
  run at its edge — the CLI (`ae`), the api's server, a test — with `Effect.runPromise` or `Effect.runSync`.
- A caller of the runtime builds its engine once from `Engine.layer(options)` (`agent-runtime`, `src/index.ts`, which does not export
  `decide`) and runs each verb as an Effect: `ae` (`packages/agent-runtime/src/cli/main.ts`) and the orchestrator's client (`engineOf`
  in `packages/agent-orchestrator/src/runtime-client.ts`). A refusal a caller answers with a sentence and an exit code is worded by
  `refusalWords` (`src/service/refusal.ts`): an `Error` led by the verb whose `exitCode` is 2.
- Stores and pure files stay plain TypeScript: `decide` in `src/core/domain.ts` imports no Effect.
- A controller is an `Effect.fn` program that requires the engine as a service (`EngineService`): it reads the engine with `asked`,
  which dies of a runtime refusal in the runtime's words, and lifts every other read with `tried` or `awaited`, failing with a
  `Refusal` and dying of anything else. Its caller runs it with `runWith(e, program)` over the engine it built once — the CLI, the
  daemon, the api's handlers and the tests — and the Promise rejects with the refusal or the defect as it was thrown: `decideRun`,
  `forgetRun`, the verbs a person asks of a run (`roundRun`, `acceptRun`, `retryRun`, `approveRun`, `sayRun`, `cancelRun`, `hold`), the
  views' reads (`taskPhasesRead`, `checkReportsRead`, `refusalRead`, `parentRead`, `parentsRead`, `filingsRead`), and the tick
  (`tickRun`), whose pass is metered through `meteredPass` over the module-global meter. A command's `handler` is a program too. An
  engine refusal a controller answers itself is read off the raw verb: `toldBy` in `say.verb.ts` turns the runtime's refusal into a
  `Conflict`, and a journal that does not read is told by `unreadableJournal`.
- A controller that reads no engine requires none: `unhold`, run with `Effect.runPromise` or `runWith` alike.
- A controller that asks where a run's work lives requires the place (`PlaceService` in
  `packages/agent-orchestrator/src/place/place.store.ts`, a service with no default): `startRun` requires it alone, `tickRun` beside the
  engine. `runWith` removes the engine's requirement only, so whoever runs the program gives the place by name
  (`Effect.provide(gitPlaceLayer)`, `shipped(program)`), and a program given none does not compile. A test gives the test place's
  layer (`runOver(runEngine, () => stand().layer)`, `test/placed.ts`); the git place is named only in a `.boundary.test.ts` file.

## Logs and traces

- **A span is a verb's `Effect.fn` name**, nested by the fiber: `tick` > `pass` > `advancePass` > `fileReady` in the orchestrator's tick,
  then the runtime's `file` > `append` (`packages/agent-orchestrator/test/telemetry-nesting.test.ts`). A runtime verb run in its own
  `Effect.runPromise` starts a root of its own: a caller yields the engine's verbs (`engineOf`), never runs them apart.
- **Each layer annotates in its own words**, on its spans and its logs alike: the orchestrator the `run` (`advancePass`) and the `step`
  (`forStep` in `packages/agent-orchestrator/src/telemetry/telemetry.store.ts`); the runtime the `task`, `kind` and `attempt`
  (`appendFields` in `packages/agent-runtime/src/core/engine/journal.ts`), and never a run or a step.
- **Levels**: Info is what a person reads in `nemia up`'s lines (`logPass` in `packages/agent-orchestrator/src/daemon/up.verb.ts`) and
  each line of the feed, said once as it is written (`emitFeed` in `packages/agent-orchestrator/src/feed/feed.verb.ts`); a
  warning or worse goes to stderr; Debug is the journal, an append said by its kind, below the default level.
- **One `telemetryLayer`, provided by the process around its program**, never by a verb: `nemia up` in
  `packages/agent-orchestrator/src/cli/main.ts` and the api's daemon in `apps/api/src/main.ts`. A test provides its own logger
  (`Logger.layer`) and tracer (`Effect.withTracer`), and `References.MinimumLogLevel` to read Debug.
- **OTLP only when `OTEL_EXPORTER_OTLP_ENDPOINT` is set**, under the service `OTEL_SERVICE_NAME`, `nemia` by default (`otlpOf` in
  `packages/agent-orchestrator/src/telemetry/telemetry.ts`); a test that spawns a daemon sets it, blank where it wants none.

## Tests

`node:test`, with `Effect.runPromise` and the layers provided in the test (`const run` in
`packages/agent-runtime/test/engine.test.ts`). No `@effect/vitest`, though `ai-docs/src/09_testing` uses it.

## Why

`docs/eval-2026-09-28-effect-everywhere.md` weighs Effect in every layer and orders the cards that adopt it.
