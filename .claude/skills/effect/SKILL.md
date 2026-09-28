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
  `packages/agent-runtime/src/journal.ts`, `Runner` in `src/runner.ts`, each `Layer.succeed(Tag)(Tag.of({ ... }))`.
- A value with a default is a `Context.Reference`, given by `Layer.succeed`: `TickMemo` and `tickMemoLayer` in `src/tick-memo.ts`.
- A layer built from another service is `Layer.unwrap(Effect.gen(...))`: `a2aRunner` in `src/a2a-client.ts`.
- Layers are joined with `Layer.mergeAll` and provided once, where the program starts: `createEngine` in `src/facade.ts`.

## Verbs

- Each verb is `Effect.fn('name')(function* (...) { ... })`, which names its span: `file`, `admit`, `step`, `tick` in
  `src/engine.ts`.
- A verb refuses an argument it no longer takes, never ignores it (`packages/agent-runtime/CLAUDE.md`, *Arguments and doors*):
  `tick` declares no parameter and reads `[...arguments]` into `tickRefusalOf`.

## Tagged errors

- The runtime's errors are `Schema.TaggedError` classes from `effect`, each with a `message`: `FileRefused`, `TickRefused`
  in `src/engine.ts`, `JournalError` in `src/journal.ts`, `RunnerError` in `src/runner.ts`. A verb fails with
  `return yield* Effect.fail(new TickRefused({ message }))`, and a caller picks one out with `Effect.catchTag('AdmitRefused', ...)`
  (`src/facade.ts`).
- A refusal written for a file that must not load the `effect` barrel — a pure file, or the orchestrator's refusals — is a
  `Data.TaggedError` imported from `effect/Data`, never from `effect`, and carries `exitCode: 2` as every refusal here does
  (the root `CLAUDE.md`, *Errors say what to do next*). `effect/Data` loads 14 modules; the barrel loads 203, about 100 ms, on
  every consumer of `agent-orchestrator/run` and `agent-orchestrator/workflow`. No file uses one yet.

## Plain faces

- Consumers never adopt Effect. `agent-runtime` is Promises: `createEngine` in `src/facade.ts` runs each verb with
  `Effect.runPromise(e.pipe(Effect.provide(layer)))` and turns a tagged refusal into a plain `Error`.
- `agent-runtime/effect` (`src/index.ts`) is the one door that hands out Effect values, and it does not export `decide`.
- Stores and pure files stay plain TypeScript: `decide` in `src/domain.ts` imports no Effect.

## Tests

`node:test`, with `Effect.runPromise` and the layers provided in the test (`const run` in
`packages/agent-runtime/test/engine.test.ts`). No `@effect/vitest`, though `ai-docs/src/09_testing` uses it.

## Why

`docs/eval-2026-09-28-effect-everywhere.md` weighs Effect in every layer and orders the cards that adopt it.
