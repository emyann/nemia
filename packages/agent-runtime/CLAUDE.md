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
- **The engine decides a task again in the pass that recorded its end**: a rule that stops or refuses (a deadline) never overrules an end
  on record. Test it with the end and the rule in one pass.
- **An absence read off a failed look is not an absence**: `observeFor` answers `{ seen, unread }`, and an unread name is neither there
  nor gone (`UNREAD`). A new harness says which names a failed read left unread.
- **XState's `transition` answers an event with no edge by staying**: `moveOn` asks `snapshot.can(event)` first and refuses.
- **A sighting speaks A2A's names; a harness's rows and the journal keep their own** (`claudeStateOf`, `detachedStateOf` translate at the
  edge; `decide-corpus.json` proves it case for case).
- **`unsigned` is the orchestrator's word**: the runtime records `stated: false` on a `succeeded` end. Read an end through `closeoutAsked` or
  `endWords`, which also map a fact that replaced an old word back to it (`limit: 'budget'`).
- **The engine can say a task waits before its harness has let the session go** (`closedOut`, and it waits for the session before ending
  on a statement on disk): a test asserts both sides, or waits for the Task.
- **`io().reads` counts every file the runtime reads**, not only journals.
- **A test stamps the times the runtime compares from the journal's attempt start** (`begun` in `test/release.test.ts`), and meets a
  deadline with a start journalled long ago (`startedLongAgo`), never a sleep: a stepped wall clock drops a closeout or misses the
  deadline. A duration a test measures is read with `performance.now()`. A runner that cannot be handed another attempt's statement
  (the detached spawn clears the last one's), or that tells it from its parent's (`--bg`: the parent's last call id,
  `harness/claude/parent.ts`), reports it with no time, and its test steps the clock (`stepClock`, `test/clock.ts`).
- **A duration the runtime decides on is `elapsedMs` over `Instant`s from `instantNow()`** (`core/clock.ts`, `core/engine/now.ts`), never
  two `Date.now()` readings: monotonic within a boot, the wall clock across one. `stepClock` leaves `process.hrtime` alone. A test's
  floor on such a bound reads `elapsedMs` over `instantNow()` taken around the call (`test/feed-rotation.test.ts`), never
  `performance.now()`: `monoNow` keeps whole milliseconds, so the bound fires up to 1 ms before `performance.now()` reaches it.
- **A detached look told names reads only their run files** (`observeFor`); `observe` lists every run, for views and verbs. A finished
  session leaves the pass's look once released and not at work (`releaseFinished`).

## Arguments and doors

- **A parameter taken away is refused, never ignored** (`Object.hasOwn`, the argument count: `tickRefusalOf`, `ReconcileRefused`).
- **The engine's `root` is required and defaults to nothing**, on `EngineOptions`, `ClaudeOptions`, `claudeCodeOps`'s options,
  `Journal.files`, `Journal.filesOps` and `Runner.claude`: whoever builds an engine says where its records go, and `src/cli/main.ts`
  is the one module that reads `AE_ROOT` or names `~/.agent-engine` (`test/engine-root.test.ts`, which also holds `os.homedir()` to
  that entry and to the files that find a harness's own home). A runner or an engine a test makes with no root is refused by name
  (`test/scratch.test.ts`), which catches a rootless literal cast past the typecheck inline; a literal bound and cast on another line
  and then handed over by name is what neither reaches, said in `rootlessRunners`.
- **The source is under `noUncheckedIndexedAccess`, and lint refuses a `!` in it**: an index or dictionary read is `T | undefined`, and the
  code says what its absence means — a refusal, the miss the function already gives, a destructured regex group. Never `!`, a cast, or a
  default the contract does not give. A dictionary read keeps its `Object.hasOwn` through `own` (`src/core/own.ts`): `r[k] === undefined`
  lets `toString` through. The tests are on `test/tsconfig.json`, the flag off, where an absent element already fails the test at its
  line; `agent-orchestrator/test/index-reads.test.ts` holds the flag, the source in its config and the lint block.
- **A flag only Claude Code has goes under `config.claude`**, never a named argument; a key moved there is read at its old place off a
  journal (`upgrade`) and refused there (`FORMER_ARGS`). Pin the argv before a move and compare after.
- **An optional verb renamed on its way through a seam is dropped by every adapter that takes the old type**: keep the old verb beside
  the new one, and test the verb through the `Engine` service.
- **A test that sets `CLAUDE_CONFIG_DIR` (or another env read at load) before a dynamic import of `src`** imports
  `test/promise-runner.ts` and `test/engine.ts` dynamically too: their static import loads `src` first.
- **Node's type stripping refuses a parameter property** (`constructor(private readonly ops)`): declare the field and assign it.
- **A journal is decoded before `upgrade`, as any store gives it back** (`Journal.layer`, `event-schema.ts`): an entry no runtime
  wrote fails that task's read with a `JournalError` naming the file, the entry and its first wrong field (`entryWords`); the pass
  leaves the task out and says why on every report while it lasts (`TickReport.unreadable`), as `list` does (`readEach`), and a feed entry is skipped, said
  once, with the cursor past it (`FeedRefusal`). A former shape is accepted by the schema, rewritten by `upgrade`, and read by a
  test; a field added to `Event` in `domain.ts` is added to its struct, or `tsc` refuses the assignment in `journal.ts` (the
  struct's rest is `unknown`). Each event keeps the keys it does not name (`StructWithRest`: a `Struct` strips them), and a decoded
  struct comes back with its keys in the schema's order, so where the object's own keys matter test it with `Schema.is` and decode
  only to say why not.
- **A long text of a line is a body named by its sha256, resolved on every read** (`core/engine/bodies.ts`): its field takes the
  place of the one it stands for (`STANDS_FOR`), so a read gives the event key for key.
- **Every feed write goes through `filesOps.append` under `feed.lock`** (`withFeedLock`), a rotation too; a rotated feed has a header
  and a sealed file (`core/engine/feed.ts`): read it through `readFeed`, never as plain lines from byte 0. How long a write waits for
  a live holder before it refuses naming it is `FEED_LOCK_WAIT_MS`, carried as `withFeedLock`'s and `Journal.filesOps`'s last
  argument and named in the refusal, so a test shortens it rather than waiting the shipped bound out.
- **A bound the runtime ships is a seam a test shortens, never one it waits out**: the detached worker's stop grace and heartbeat
  are plan fields `detachedOps`'s options write (`DetachedOptions`, defaults `WORKER_STOP_GRACE_MS` and `WORKER_BEAT_MS` in
  `harness/detached/worker-bounds.ts`), and a `--bg` follow's pace is `ClaudeOptions.followPaceMs` (default `FOLLOW_PACE_MS`), as a
  say's is `sayTimeoutMs` and a remote request's `requestMs`.
- **A `claude agents --json` row of ours is decoded by `RegistryRowSchema` (`harness/claude/registry.ts`)**: one that does not decode
  fails the whole read, so every background session is unread, never absent. A field the runtime starts reading is added to the schema;
  a row not ours (no `ae/` name, no `state`) is skipped undecoded.
- **A rule that stops or refuses (a deadline) never overrules an end recorded in the same pass**: test it with the end and the rule in
  one pass.
- **No test sleeps or waits a shipped bound out**: a deadline is met with a start journalled long ago (`startedLongAgo`), a clock is
  stepped (`stepClock`, `test/clock.ts`), and a bound the runtime ships is a parameter a test shortens; a new bound gets one.
- **A duration the runtime decides on is `elapsedMs` over `instantNow()`** (`core/clock.ts`), never two `Date.now()` readings.

## Arguments and doors

- **A parameter taken away is refused, never ignored** (`Object.hasOwn`, the argument count: `tickRefusalOf`, `StepRefused`).
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
