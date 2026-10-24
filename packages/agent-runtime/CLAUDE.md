# packages/agent-runtime — `ae`

Agent sessions on one harness each, durably (README). `decide` (`src/core/domain.ts`) is the whole judgement, pure
(`test/engine.test.ts`); `src/index.ts` and `src/vocabulary.ts` are the only doors, with `src/testing.ts` for tests
(`test/contract.test.ts`), and the vocabulary loads no Effect and no I/O (`test/vocabulary-door.test.ts`). The runtime imports nothing
above it. Most of its rules are said in a comment at the code they hold: read that comment before you change the code.

- **A person's story is one test, its checkpoints `story` subtests** (`test/checkpoints.ts`), and a function's inputs are one test whose
  rows are `t.test` subtests. A focused test of its own is for a race, a crash window, a real boundary or an invariant of a pure function.

## The pass

- **Every write to a journal goes through `Journal.append`**: the pass skips a settled task until the feed names it, and the engine's
  tick tests run `tickMemoLayer({ verify: true })`, which fails a pass that skipped a change.
- **A rule that stops or refuses (a deadline) never overrules an end recorded in the same pass**: test it with the end and the rule in
  one pass.
- **No test sleeps or waits a shipped bound out**: a deadline is met with a start journalled long ago (`startedLongAgo`), a clock is
  stepped (`stepClock`, `test/clock.ts`), and a bound the runtime ships is a parameter a test shortens; a new bound gets one.
- **A duration the runtime decides on is `elapsedMs` over `instantNow()`** (`core/clock.ts`), never two `Date.now()` readings.

## Arguments and doors

- **A parameter taken away is refused, never ignored** (`Object.hasOwn`, the argument count: `tickRefusalOf`, `ReconcileRefused`).
- **The source is under `noUncheckedIndexedAccess`, and lint refuses a `!`**: say what an absence means (a refusal, the miss the function
  already gives), never a cast or a default the contract does not give; a dictionary read goes through `own` (`src/core/own.ts`).
- **Node's type stripping refuses a parameter property** (`constructor(private readonly ops)`), which `tsc` lets through: declare the
  field and assign it.
- **A flag only Claude Code has goes under `config.claude`**, never a named argument; a key moved there is refused at its old place
  (`FORMER_ARGS`) and read there off a journal by `upgrade`. Pin the argv before a move and compare after.
- **What the runtime reads from a store or a harness is decoded by its schema first** (`event-schema.ts`, `RegistryRowSchema`,
  `PRINTED`, `LINES`, `CodexEventSchema`, `ROLLOUT`, `CardSchema`): a field the runtime starts reading is added to the schema, and what
  does not decode is unread, never absent. A former journal shape is accepted by the schema, rewritten by `upgrade`, and read by a test.
- **A feed is read through `readFeed`, never as plain lines, and written under `withFeedLock`.**

## Processes and streams

- **`attachedOptions` is one function for a held session and a job**: a flag added there reaches both.
- **`config.env` is journalled with the task**: no secret there. Every child is spawned `withoutTelemetry` (`harness/telemetry.ts`).
- **A test that reads an SDK-written argv reads it through `sdkArgValue`** (`test/sdk-argv.ts`); the argv we write is read as written.
- **The Agent SDK is pinned exactly** (`test/sdk-pin.test.ts`), and an `sdk.d.ts:<line>` in our prose is checked against it
  (`test/sdk-citations.boundary.test.ts`): a bump moves every one.

## A2A and remote agents

- **A sentence quotes another party's content through `quote`** (`core/quote.ts`).
- **An async generator's `return` waits behind its pending `next`**: `Stream.fromAsyncIterable` calls it on interruption, so a silent
  subscription is aborted first (`abortedOnReturn`), or its interruption never ends.
- **A test of a holder and a viewer is two processes**, or the viewer dials nothing (`test/holder-follow.boundary.test.ts`).

## Claude Code, as a harness

What Claude Code does as the steps meet it, measured at a named version, is in `docs/harness.md`: read it before you lean on a fact of
Claude Code or the Agent SDK, and write a new measurement there.
