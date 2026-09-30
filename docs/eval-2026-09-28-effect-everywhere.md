# Effect everywhere it can be, outside the web app — an evaluation

2026-09-28. Asked by the owner: *"I think I would want it [Effect] to be adopted everywhere we can"*, with the web app probably
left out. This page gives the evidence to decide from. It changes no code. Every count below was taken on this branch
(`44e5d83`, effect `4.0.0-rc.116`), and *How it was measured* at the end says how.

## In short

- **Where it pays.** It pays in the shells, where the code waits, holds something or fails: the api's routes, `wf up` and
  `wf watch`, and the few places that start a process with a deadline. The failures would get a type, the resources held
  for a process's life would be scoped, and the `WF_` settings and the runtime client would be services a test provides.
- **Where it does not pay.** More than half the orchestrator is pure (12,884 of 23,482 lines) and should stay plain
  functions. The store files are synchronous: 279 `*Sync` calls and no `async` function outside `worktree.ts` and
  `feed-store.ts`. Wrapping each call in `Effect.try` would add syntax and buy little. The durable resources — worktrees,
  run records, `daemon.json` after a crash — are owned by the disk and by the level-triggered pass, not by a scope.
- **The largest error defect needs no Effect to fix.** `wf` exits 1 on every refusal, whatever `exitCode` the thrown error
  carries (`packages/agent-orchestrator/bin/wf.ts:4-6`, measured below). The api then maps that same `exitCode: 2` to a
  409 in some routes and a 422 in others (13 checks in 5 files). Typed errors are the part of Effect that fixes this class
  of defect for good, and they can come first: a `Data.TaggedError` is an `Error`, so plain code can throw one, and the
  `effect/Data` subpath it comes from loads 14 modules in 6 ms, where the barrel loads 203.
- **Cost.** Start-up is already paid. Every controller and the api load the whole `effect` barrel today, through
  `agent-runtime` (203 modules, about 105–130 ms of a 290 ms import). What it would really cost is knowledge. Effect 4 renamed
  much of Effect 3, which is what an agent has mostly read (`Context.Tag`, `Effect.catchAll`, `Either`: all absent here).
  And a release candidate lands about once a week.
- **Recommended order.** Ten small cards (*Order*, below). Start with knowledge and one pinned version, then errors,
  configuration, the runtime client as a service, and the daemon's lifetime. Stop and measure after card 6, before any
  controller is rewritten.

## What there is today

| Package | `src` lines | Effect today | Shape of the I/O |
|---|---|---|---|
| `agent-runtime` | 10,252 | 13 of about 29 files; Promise facade `src/facade.ts`, Effect door `src/index.ts` | async, harnesses and journals |
| `agent-orchestrator` | 23,482 (+7 in `bin/`) | none; `src/runtime-client.ts:12-13` says so on purpose | synchronous disk and git, async only through the runtime |
| `apps/api` | 8,551 | none | Hono routes over the orchestrator, one SSE feed, two child processes |
| `apps/web` | 20,997 | none | React, react-query, `fetch` and `EventSource` |

The orchestrator by kind (`packages/agent-orchestrator/test/boundary.test.ts`): **pure** 12,884 lines in 16 files, **store**
4,206 lines in 11 files, **controllers** 6,149 lines in 8 files, the **client** 132 lines. The store is synchronous: `places`,
`workflow-store`, `store`, `artifacts`, `authoring`, `daemon-store` and `inbox-store` have no `async` at all. The controllers'
`await`s (120 in all, 56 of them in `tick.ts`) are almost all calls to the runtime's `Engine`.

What the runtime already uses of Effect (from its `src`, all imports from the `effect` barrel): `Effect` in 12 files, `Layer` 5,
`Context` 4, `Schema` 4 (for `Schema.TaggedError`), `Exit` 1. It uses no `Scope`, `acquireRelease`, `Schedule`, `Stream`,
`Fiber`, `Config`, `ManagedRuntime`, `Ref` or `Queue`. Its services are `Journal` (`journal.ts:124`), `Runner`
(`runner.ts:198`), `TickMemo` (`tick-memo.ts:46`) and `Lifecycle` (`engine.ts:41`). It has eight tagged errors, among them
`RunnerError` (`runner.ts:43`), `JournalError` (`journal.ts:36`) and `FileRefused` (`engine.ts:99`). Its deadlines are
domain logic in `decide`, not `Effect.timeout`. So the repository has written services, layers and tagged errors in Effect.
It has not yet written scopes, streams, schedules or fibers, and those are most of what the shells below would use.

## Where it would pay, concern by concern

### Errors

**Today.** A refusal is `Object.assign(new Error(words), { exitCode: 2 })`: 31 sites in the orchestrator's `src` and 4 in the
api's, plus one class that sets it (`WorkflowError`, `workflow.ts:533`). Readers tell a refusal from a crash by
`(err as { exitCode?: number }).exitCode === 2`: 6 checks in the orchestrator (`cli.ts` 3, `tick.ts` 2, `start.ts` 1) and 15
in the api, in 7 files (`=== 2` or `!== 2`). Thirteen of the api's pick a status; the other two do not
(`feed.ts:67` ends the stream, `steps.ts:80` throws `Unread`).

- **`wf` loses the code.** `bin/wf.ts:4-6` prints the message and calls `process.exit(1)` for anything `main` throws.
  `WF_ROOT=<empty> wf approve nope step` printed its refusal and exited **1** (`ae`'s bin honours `e.exitCode`,
  `packages/agent-runtime/bin/ae.ts`). CLAUDE.md's rule *Errors say what to do next … `.exitCode = 2`* is kept by the
  words and not by the exit status, and no test of `wf` asserts an exit status of 2.
- **The api maps the same refusal to different statuses, by hand, route by route.** `exitCode === 2` becomes 409 in
  `asks.ts:198, 240, 286, 330, 378` and `runs.ts:338`. It becomes 422 in `runs.ts:314, 377`, `inbox.ts:311` and
  `agents.ts:381, 460`. `workflows.ts:597` and `inbox.ts:376` choose 404, 409 or 422 by reading the disk after the refusal
  (`cardRefusalStatus`, `queueRefusalStatus`). The api has no `app.onError` at all, so an error a route does not catch is
  Hono's plain-text 500.
- **Each failure has its own shape.** The api's routes return `Refusal` values (`guard.ts:28`) and throw `AgentWriteError`
  and `SkillWriteError` with a `why`, each mapped to a status by hand (`agents.ts:378-387`, `skills.ts:375-379`). There is
  also `class Unread extends Error { status }` (`steps.ts:37`). `messageOf = (err) => err instanceof Error ? err.message :
  String(err)` is defined 6 times (`inbox.ts:72`, `skills.ts:84`, `agents.ts:102`, `builder.ts:230`, `workflows.ts:370`,
  `capabilities.ts:572`), and the same expression is written inline 25 times more.
- **Much is swallowed.** There are 172 `try` blocks in the orchestrator's `src` and 108 in the api's, and at least 97 and 44
  of their `catch`es are empty or keep nothing. Most are deliberate: a file not there reads as nothing.
- **The runtime's own failures come through untyped.** The facade maps `AdmitRefused` and `InputRefused` to `exitCode: 2`
  (`facade.ts:680, 849`). Anything else rejects as the tagged error itself. Measured: `Effect.runPromise` of a failed
  `Schema.TaggedError` rejects with that instance, an `Error` with its `_tag` and no `exitCode`. So a `JournalError`
  reaches `wf` as a crash, and the api's 502s and 500s.

**With Effect.** Refusals become a closed union in the error channel: `Missing`, `Conflict` and `Invalid` for the api's 404,
409 and 422, each still carrying its words and still `exitCode: 2` for the CLI. The api maps that union to a status once, and
the compiler checks the mapping is complete: a `switch` on `_tag` over a closed union fails the typecheck when a case is
added and not mapped. A route that reads the disk after a refusal to pick its status would become a refusal that says
which kind it is when it is thrown.

**Verdict: pays, and first.** It replaces the 13 casts in the api that pick a status, the 6 `messageOf` copies and the three hand-written error
classes' status maps. It adds one module of tagged errors per package and one mapping in the api. The `wf` exit status is a
one-line fix on its own and should not wait for any of this.

### Resources

What is held and let go by hand:

| Resource | Where | How it is let go | What is skipped |
|---|---|---|---|
| The daemon's claim on the store, `daemon.json` | `takeStore` `daemon-store.ts:171-201`, `releaseStore` `:243-251` | `finally` in `wf up` (`cli.ts:1169-1173`) and a signal handler | Two release paths: the handlers call `releaseStore` then `process.exit` (`cli.ts:1111-1113`), so on a signal the `finally` is skipped. Nothing is lost by it — the process ends, and a pass dropped mid-way is picked up by the next — but each new thing `wf up` holds has to be let go in both places |
| The beat timer | `cli.ts:1120` (unref'd) | `clearInterval` in the same `finally` | as above |
| `wf watch`'s fs watcher and 1 s timer | `feed-store.ts:275, 282`; `cli.ts:1188-1190` | `stop()` exists and is never called: the command returns a promise that never settles | ends only when the process is killed |
| The api's feed stream | `apps/api/src/feed.ts:39-43, 83-88` (now `feedEvents` in `factory/feed.ts`) | a hand-made deferred resolved by `stream.onAbort`, then `finally { watch.stop() }` | none known; `test/feed.test.ts:299-315` proves the stop |
| `claude` for the usage quota | `apps/api/src/quota.ts:321-380` (now `usageAsk` in `factory/quota.ts`) | 60 lines: a `done` flag, `settle()`, a SIGTERM timer (`:346`), a SIGKILL escalation (`:335`) | none known |
| An MCP server asked for its tools | `apps/api/src/capabilities.ts:520-545` (now `serverAsk` in `capabilities/capabilities.ts`) | `Promise.race` with a timer, `finally { clearTimeout; client.close() }` | the race's loser keeps running until `close` |
| File descriptors | `feed-store.ts:49/55, 99/103`, `views.ts:387/394`, `store.ts:604/613` | `try`/`finally` | none |
| A worktree | `worktree.ts:357` | `wf rm` and prune only (`forget.ts:190-197, 388-396`) | on purpose, see below |

**With Effect.** Each resource that lives only as long as the process becomes `Effect.acquireRelease` in a scope: the claim,
the beat (a forked fiber), the watcher, the child process, the MCP client. Interruption — a signal, the stream's reader
going, a deadline — then runs every finalizer in order. For `wf up` that buys one release path instead of two, and an order
of release the code states; it does not buy a pass that stops cleanly part-way. The store's calls are synchronous, so an
interruption on a signal also stops the pass at its next `await`, as `process.exit` does now, and the level-triggered pass is
built to be dropped there. In `wf watch` the gain is as small: a signal already ends it and the OS frees its watcher, so what
a scope adds is a watch that can be stopped from inside the process — by a test, or by a caller that embeds it — where the
command's promise today never settles and its `stop()` is out of reach. The real gains are in the api's child process and MCP
ask: `quota.ts` and `capabilities.ts`, 60 and about 25 lines of hand-kept flags and timers, shrink to an acquire, a use under
`Effect.timeout`, and a release. `effect/unstable/process` has a
`ChildProcess` module, but it is *unstable* and needs a platform layer from `@effect/platform-node`, which is not installed.
The runtime's own pattern, `Effect.callback` around `execFile` with `child.kill()` as the interrupt (`runner.ts:795-814`),
needs neither.

**Where it does not pay: the durable resources.** A worktree is left where it stands on purpose. A pass that died after
cutting it is picked up by the next pass (`worktree.ts:355-357`), and the run record, not the process, owns it. A crash that
leaves `daemon.json` is read as *gone* by the next `wf up` (`cli.ts:1103`). A scope would release these on a failure, and
the level-triggered design depends on them not being released. They stay as they are.

**Verdict: pays in six places** (the claim, the beat, `wf watch`, the api's feed, `quota.ts`, `capabilities.ts`), and
nowhere in the store.

### Concurrency and timeouts

- **The tick.** `wf up` is a `for (;;)` that awaits each pass, then sleeps (`cli.ts:1136-1168`). Passes cannot overlap, and
  inside a pass each run is advanced in turn (`tick.ts:1393-1400`; `tally.ts:10` builds on it). There is nothing to fix.
  As an Effect it would be `Effect.repeat` with `Schedule.spaced`, and the beat a fiber beside it. That is shorter, but it is
  not safer.
- **Check deadlines** are the runtime's (`CHECK_DEADLINE_SECONDS`, `check.ts:38`, filed as `deadlineSeconds`). The
  orchestrator enforces none. The one timeout it sets itself is `npm ci`'s, through `execFile`'s own option
  (`worktree.ts:181-183`).
- **The feed.** `watchFeed` (`feed-store.ts:41`, over `watchFeedFile` at `:202-291`) allows one read at a time with a `draining`/`again` pair of flags, and
  is woken by `fs.watch` or the 1 s timer. As a `Stream` it would be a watch merged with a tick and read one at a time. Its
  callers (`wf watch`, the api's SSE) would each consume the stream and be interrupted at their end. The same holds for the
  transcript stream's polling loop (`apps/api/src/steps.ts:251-279`).
- **Races.** `capabilities.ts:530` and `quota.ts:439` race a promise against a timer. `Effect.timeout` does that and
  interrupts the loser. `Promise.all` without a bound asks every MCP server at once (`capabilities.ts:89`). The orchestrator
  has one `Promise.all` (`verbs.ts:397`) and no `AbortSignal` anywhere.

**Verdict: pays a little.** It pays in the api's two races and in the feed as a stream. It does not pay in the tick.

### Retries

The code has almost none, and those it has are not schedules. `takeStore` tries 3 times with no delay, to settle a race on
`linkSync` (`daemon-store.ts:182-200`). The quota backs off by `HKB_QUOTA_BACKOFF_MS`, a cached answer, not a loop
(`quota.ts:420-421`). Step retries (`retry.ts`) are the run's domain, filed and journaled, and not I/O retries. The
prototype of 2026-09-18 reached the same finding: *"`Schedule` retries did not [earn their place]: the SDK already retries"*
(`docs/pivot-2026-09-18.md:150`).

**Verdict: does not pay.** Nothing asks for `Schedule` today.

### Dependency injection, and the tests' fakes

**Today.**

- **The runtime.** `engine()` is made once, in a default parameter, `main(argv, e = engine())` (`cli.ts:843`). The
  controllers take `e: Engine` as their first positional argument (38 parameters across `tick`, `views`, `verbs`, `decide`
  and `forget`). The api makes one engine for the process at load (`apps/api/src/store.ts:16`), and its routes import it.
- **The store's root.** `HOME = process.env.WF_ROOT ?? …` is fixed when `store.ts` loads (`store.ts:39`), and 15 files
  import it. Tests therefore set `WF_ROOT` and then import dynamically: 36 of the orchestrator's 63 test files do this, and
  29 of the api's 33 (`test/store.test.ts:29-30` says why).
- **Fake engines.** They are object literals cast `as unknown as Engine`. An in-memory `board()` engine is written again in 13
  test files (`a2a-agents`, `decide`, `feed`, `queue-store`, `gate`, `hold`, `rendering`, `prune`, `folder`,
  `session-cache`, `supervisor`, `ship` and `store`). The line that says which phases are settled is copied into 10 of them.
  Beside them are ad-hoc `engineWith`, `engineOf` and `fake` engines. `{} as Engine` in 5 files stands for an engine
  nothing should call.
- **Other fakes.** `mock.method` is used 61 times, 46 of them on `console.log`. A fake `claude`, `codex`, `git` or `npm` is
  put first on `PATH` in 10 of the orchestrator's files, and `apps/api/test/harness.ts` does it for every api file.

**With Effect.** `Engine` becomes a `Context.Service`, provided by the client's layer and by one `Engine.test` layer in the
tests. The store's root becomes a service (or a `Config`) provided per test, so a test file can import statically and give
each test its own root. A controller's requirements then show in its type: `tick` needs `Engine | StoreRoot | Clock`, and
forgetting to provide one fails the typecheck, not the run.

**What the fakes gain, honestly.** The 13 copies of `board()` are a missing shared helper. A `test/engine-board.ts` would
remove them with or without Effect. What Effect adds is a checked obligation: a fake that lacks a method the controller uses
fails the typecheck, where `as unknown as Engine` hides it. The fake `claude` on `PATH` stays in either design. It tests the
runtime's harness through its real process boundary, which is the point (`apps/api/test/harness.ts`).

**Verdict: pays, most of all for the root and the engine.** Dropping the dynamic imports touches 65 test files, one line or a
few each, and is the largest mechanical change in this evaluation.

### Configuration: the `WF_` environment

| Variable | Where | How it is read |
|---|---|---|
| `WF_ROOT` | `store.ts:39` | at module load, `??` a default, no check |
| `WF_MAX_CONCURRENT` | `daemon-store.ts:31` | `Number(…) \|\| 2`: empty, `0` and `NaN` read 2; `-3` and `1.5` are taken as they are |
| `WF_MAX_RUNS` | `daemon-store.ts:32`, `tick.ts:1661`, `apps/api/src/ceilings.ts:58` | `runCapOf` (`run.ts:1217-1228`): whole number or a refusal with `exitCode: 2` |
| `WF_VERIFY_REST` | `tick.ts:1351`, `apps/api/src/resting.ts` | a default parameter, `=== '1'` |
| `WF_A2A_<NAME>_<SCHEME>` | `runtime-client.ts:125` | on every request, `\|\| undefined` |
| `PORT`, `HKB_REPO`, `HKB_QUOTA_KEEP_MS`, `HKB_QUOTA_BACKOFF_MS` | `apps/api/src/port.ts:21-30`, `capabilities.ts:69`, `quota.ts:420-421` | each its own parser; some injectable as `env = process.env`, some global |

CLAUDE.md records what this cost: *"A check the run executes inherits the daemon's environment, so a test that reads a `WF_`
default passes there and fails by hand"*. That test left `WF_MAX_RUNS` to the environment, and failed every hand-typed
`npm test` for a stage.

**With Effect.** `Config.schema(Schema, 'WF_MAX_CONCURRENT')` with `Config.withDefault` refuses `-3` in the one place it is
read, in words. `ConfigProvider.fromEnvRecord` gives a test the environment it means instead of the process's, so that class
of test cannot be written. (Effect 4 has no `Config.string`: its `Config` is `schema`, `withDefault`, `option`, `nested`, …)

**Verdict: pays, and it is small.** There are about ten variables in two packages.

### Logging and the tick's meter

- **Logging.** `cli.ts` has 185 `console.log` and 5 `console.error`. Almost all of them are the command's *output*: what `wf
  ls` prints is not a log. The daemon's lines are the one log. They are stamped with `new Date().toISOString().slice(11,
  19)` written inline 9 times (`cli.ts:1146-1165`), and `tick` prints nothing but returns what happened (`tick.ts:1411-1416`).
  `Effect.log` would change the lines' format, which people read, for no gain. A helper for the stamp is enough.
- **The meter.** `tally.ts` keeps a module-global `meter` (`tally.ts:34`) and a stack of frames. `within(kind, f)`
  (`tally.ts:67-82`) handles a result that is either synchronous or a promise. The engine is metered through a `Proxy`
  (`meteredEngine`, `tick.ts:1629-1638`) keyed by `ENGINE_PHASES`. The global is right only because a pass is sequential,
  and `tally.ts:10-11` says so. In Effect the meter would be a fiber-local reference provided for the pass, so it would be
  correct under concurrency too. But CLAUDE.md's obligation — a new engine verb must be added to `ENGINE_PHASES` — would
  stay, as a wrapped service instead of a `Proxy`.

**Verdict: does not pay now.** Revisit the meter only if a pass ever advances runs concurrently.

## What it would replace, delete and add

These are counts of what exists, not estimates of lines written. The lines follow from them.

| Replaced or deleted | Count today | Added |
|---|---|---|
| `exitCode === 2` casts in the api that pick a status | 13 in 5 files (of 15 in 7) | one error union per package, one status mapping in the api |
| `messageOf` copies and inline copies | 6 + 25 | nothing |
| Hand-written error-to-status maps (`AgentWriteError`, `SkillWriteError`, `Unread`, `cardRefusalStatus`, `queueRefusalStatus`) | 5 | the union's cases |
| The signal-then-`process.exit` path in `wf up` | `cli.ts:1104-1117` | a scoped claim and a forked beat, interrupted on a signal |
| `wf watch`'s promise that never settles | `cli.ts:1188-1190` | a stream consumed until interrupted |
| Hand-managed child processes and races in the api | `quota.ts:321-380`, `capabilities.ts:520-545` | `acquireRelease` + `Effect.timeout` |
| Dynamic imports after setting `WF_ROOT` | 36 + 29 test files | a root service or `Config`, provided per test |
| `board()` fakes and ad-hoc engines | 13 copies + 4 others | one `Engine.test` layer |
| `process.env` parsed ad hoc | about 10 variables | one `Config` module per package |
| Plain wrappers at the orchestrator's face (option A below only) | — | about 38, one per controller function the api calls |

Not replaced: the 12,884 pure lines, the store's 279 synchronous calls, the tick's loop, the `Proxy` meter, the CLI's output,
the fake binaries on `PATH`, `node:test`. `@effect/vitest` needs vitest (`peerDependencies: vitest >=5 <6`), and this
repository runs `node --test`. Effect code is tested the way the runtime tests it: `Effect.runPromise(program.pipe(
Effect.provide(layer)))` inside a `node:test` case (22 of the runtime's 45 test files import `effect`).

## The layers

The three rules of `docs/architecture.md` survive. Each needs a line more in its test, not a new rule.

- **Pure stays pure, and stays plain.** `assess`, `workflow.ts` and the other 14 pure files are data in, data out, tested as
  data. The pure kind's test gains one refusal: a pure file imports nothing from `effect` but the `effect/Data` subpath, for
  the tagged refusals two pure files throw (`runCapOf` in `run.ts:1217-1228`, `WorkflowError` in `workflow.ts:533`). Not the
  barrel and not `Schema`: measured, `effect/Schema` alone loads 109 modules in about 75 ms, and `effect/Data` 14 in 6 ms,
  against the 9 modules and 55 ms of `agent-orchestrator/run` today (*Start-up*, below). A schema the boundary-parsing card
  writes for a record lives with the store that reads the record, not in a pure file.
- **The store stays plain, synchronous functions.** A handful of synchronous file calls gains nothing from being an Effect
  each; a controller wraps what it calls in `Effect.try`, and a test calls the store as it does today. Two
  things change: `HOME` stops being read at load and comes from a root the controller passes, and the store's refusals are
  thrown as the tagged errors. The tree the store loads as is unchanged.
- **Controllers become Effects.** Their requirements are `Engine`, the store's root, `Config` and `Clock`. `runner.ts` stays
  the root, re-exporting by name. `cli.ts` runs the program.
- **The client provides `Engine`.** Rule 3 is unchanged: `runtime-client.ts` stays the one importer of `agent-runtime`.
  There are two ways to build the layer:
  - *Wrap the Promise facade* (`Effect.tryPromise` per method, the rejection mapped to the error union). This needs no change
    to the runtime. It costs one `runPromise` per call, which is already the facade's price (`go`, `facade.ts:576`).
  - *Use `agent-runtime/effect`.* This drops the nested run and gets `RunnerError` and `JournalError` typed. But the engine's
    assembly — the composite runner, the A2A seam, the observe counters, the tick memo (`facade.ts:514-573`) — exists only
    inside `createEngine`, and the Effect door exports none of it. The runtime would have to export an engine layer, which
    is a runtime change, and CLAUDE.md says *the engine is finished*. The first way comes first.

  Either way the client keeps its one wrapper, `file` filed `queued` (`runtime-client.ts:69-75`). Its doc comment — *"Nothing
  here imports Effect, which is the point"* (`:12-13`) — is rewritten in the same card.

One version of `effect` in the tree becomes load-bearing. The runtime README says why: *"Context tags are identity-based, and
two copies in one tree do not see each other's services"* (`packages/agent-runtime/README.md`, *Using it without Effect*).
Two packages depend on `effect` today, with two ranges that happen to resolve to one copy: the runtime (`^4.0.0-rc.115`) and
the judge (`^4.0.0-rc.116`, `packages/agent-judge/package.json:13`). The owner is removing the judge in a run of its own, and
this evaluation leaves it out as a package that will not exist; once that lands, the runtime is the one. Once the orchestrator
and the api depend on `effect` too, their ranges must resolve to that same copy, and once the orchestrator provides a runtime service through the Effect door, a second copy would fail at run time, not at compile.

## The public faces

**Decided 2026-09-29: B.** The owner chose face B at card 8. `agent-orchestrator/effect` (`src/effect.ts`) sits beside the
three plain faces, which export what they did. It holds the refusal union — `Missing`, `Conflict`, `Invalid`, the type
`Refusal` and `isRefusal`, which tells a refusal by its class — and loads `effect/Data` alone (16 modules, pinned in
`test/refusal.test.ts`). The api maps the union to statuses in one table, `REFUSAL_STATUS` in `apps/api/src/app.ts`,
checked by the compiler, and `app.onError` answers it and the rest. The api is not an Effect program yet: its handlers,
the `ManagedRuntime` and the layers come with cards 9 and 10, and the face grows with them.

The options as they were weighed:

**A. Plain faces stay; Effect is inside.** `agent-orchestrator`, `agent-orchestrator/run` and `agent-orchestrator/workflow`
export what they export today. The controllers are Effects run by a facade, as the runtime runs its own
(`Effect.runPromise(program.pipe(Effect.provide(layer)))`). The api calls plain functions and catches plain errors, now
`instanceof` the tagged classes. The api imports 114 distinct values from the root across 22 files. Most are pure or store
functions, which stay as they are, so the facade wraps only the controller functions, about 38. The CLI can run the Effect
program directly, since it lives inside the package. This keeps the owner's condition of 2026-09-19 as written (*"a
consumer never has to adopt it, which a Promise facade keeps"*, `docs/pivot-2026-09-18.md:433-435`). The api gets
none of the checked error mapping, because a rejected promise carries no type.

**B. An Effect face beside the plain one.** Add `agent-orchestrator/effect`, as the runtime has `agent-runtime/effect`, and
make the api an Effect program. Its handlers run through one `ManagedRuntime` built from the app's layer. That is Effect's
own pattern for Hono (`node_modules/effect/ai-docs/src/04_integration/10_managed-runtime.ts`). The api then maps the error
union to statuses once, and the compiler checks every case. Its dependencies (engine, root, config, the MCP asker, the quota
asker) become layers that the tests provide. The plain face stays for any consumer outside the repository; today there is
none, since the api is the only importer. B costs a second export list to keep in step, and the contract tests' allowed
subpaths grow by one (`packages/agent-orchestrator/test/contract.test.ts`).

A mixed path is possible. Build A first: nothing outside the package changes, and every card below up to card 6 works under
it. Choose B when the api's error mapping comes up (card 8). By then the error union exists and the choice is concrete.

## The web app

Leave it out. The case against:

- **Bundle.** Measured with esbuild, minified, for the browser: `Effect.gen` with `Effect.timeout` is 85 KB (29 KB
  gzipped). Adding one `Schema` decode brings it to 286 KB (90 KB gzipped). The web's entry chunk is 307 KB (97 KB gzipped),
  of 2.0 MB (513 KB gzipped) across 87 chunks. Schema alone would nearly double what the first page loads.
- **What it would replace is already a library's job.** Reads, retries, caching and the refetch rules are react-query's
  (`lib/feed.ts`'s `pace`, and CLAUDE.md's pages of lessons about it). The feed is an `EventSource` behind `follow`
  (`lib/following.ts`). Effect would sit beside react-query, not replace it.

Where one piece could pay: the web types every answer by assertion, `return (await res.json()) as T`
(`apps/web/src/lib/api/read.ts:22`), against hand-kept mirrors of the api's types (CLAUDE.md names several). A schema shared
by the api and the web would check them. But the web imports no package (`docs/architecture.md`, *The layers*), so a shared
schema means a new shared package and a change to rule 1. That is a decision of its own and should wait for the
boundary-parsing card's phase 1.

## Cost and risk

**The version.** `effect` is `4.0.0-rc.116` in the lockfile. The rc tag is `4.0.0-rc.118` and `latest` is `3.22.2`. Releases
rc.110 to rc.118 came between 2026-08-17 and 2026-09-28, about one a week. The ranges are carets on a prerelease, and
`^4.0.0-rc.115` also admits every `4.x` final: only the lockfile holds the version.

**What an upgrade touched, measured.** The runtime was copied beside a fresh `effect@4.0.0-rc.118`, with every other package
the checkout's own. It typechecks clean. Its suite: 813 tests, 788 pass, 20 skipped, 5 fail. All 5 read the rest of the
workspace (`contract.test.ts`, `xstate-boundary.test.ts`), which the copy did not have. The judge was not measured, as it is
being removed. So rc.116 → rc.118 costs the runtime nothing today. The exposure grows with use, though. The runtime uses services, layers and tagged errors and little else, and the adoption would add scopes,
streams, `Config` and `ManagedRuntime`, which a release candidate is freer to rename.

**Start-up.** This cost is already paid.

- Importing the `effect` barrel alone takes 104–129 ms (203 modules).
- The runtime's facade loads 308 modules, of which 203 are effect's, in about 257 ms.
- The orchestrator's root loads 344 modules in about 291 ms, and those include the same 203.
- The api's `app.ts` loads 660 modules in about 388 ms.
- `wf ls` on an empty store takes 0.33 s and 176 MB.

Only the pure entries load none: `agent-orchestrator/run` loads 9 modules in 55 ms, and `agent-orchestrator/workflow` loads
2. Effect in the controllers and the api adds no module the process does not already load. The `effect` barrel in a pure
file would add about 100 ms to every consumer of `/run` and `/workflow`, and `effect/Schema` about 75 ms; `effect/Data`, the
one import the pure rule above allows, adds 14 modules and about 6 ms.

**What an agent step needs to write Effect well.**

- **The docs ship in the package.** `node_modules/effect/AGENTS.md` (409 lines, the same file as its `CLAUDE.md`) and
  `ai-docs/src/` have worked examples. The package says to use them and not outside copies: *"Avoid unrelated copies of
  Effect or external documentation, as they may be outdated or incorrect"*.
- **The traps are Effect 3's names.** Checked against rc.116, these are absent: `Context.Tag`, `Context.GenericTag`,
  `Effect.Service`, `Effect.catchAll`, `Effect.catchAllCause`, `Effect.either`, `Either`, `Effect.fork`,
  `Effect.forkDaemon`, `Effect.zipRight`, `Effect.tapErrorCause`, `Layer.scoped` and `Config.string`. These are present
  instead: `Context.Service`, `Effect.catch`, `Effect.catchCause`, `Effect.result`, `Result`, `Effect.forkChild`,
  `Effect.forkDetach` and `Effect.andThen`. `tsc` catches every one of them, but an agent that writes from memory will
  spend rounds on them.
- **What to write down.**
  - A repository skill, `.claude/skills/effect/`: read `node_modules/effect/AGENTS.md` first; the list of Effect 3 names;
    the house rules (a plain face, tagged errors that carry `exitCode`, the store kept plain, `node:test` with
    `Effect.runPromise`, no `@effect/vitest`).
  - A CLAUDE.md line for each trap met. One is already there: an `Effect.fn` generator cannot declare `...args: never[]`
    (the entry under *A parameter taken away is refused*).
  - The shipped implementer and reviewer agents name the skill.

## Order: cards small enough to review

Each card is one concern, leaves the suite green, and can be merged alone. They follow the concurrent boundary-parsing card
(Effect Schema for records, journals and the api's bodies) and do not overlap it.

1. **One version, and the skill.** Pin `effect` exactly, and the same, in every package that depends on it, with a test
   that refuses two ranges. It lands after the judge's removal, or it pins the judge's range as well. Add
   `.claude/skills/effect/` and the CLAUDE.md lines. No code.
2. **`wf` exits with the refusal's code.** `bin/wf.ts` honours `exitCode`, and a test runs `wf` and asserts 2. Plain code.
3. **Tagged refusals in the orchestrator.** `Data.TaggedError` classes, imported from `effect/Data`, that are `Error`s and
   carry `exitCode: 2`: `Missing`, `Conflict`, `Invalid` (checked on rc.116: `yield*` fails with one, `Effect.catchTag`
   catches it, and `exitCode` survives). The 31 `Object.assign` sites move over, file by file, and the pure kind's boundary
   test allows `effect/Data` alone, and a test pins `agent-orchestrator/run`'s module count so the barrel cannot creep in.
4. **`Config` for the `WF_` environment.** Covers `WF_ROOT`, `WF_MAX_CONCURRENT`, `WF_MAX_RUNS` and `WF_VERIFY_REST`, with a
   refusal test for each at the shipped defaults, and one for `WF_MAX_CONCURRENT=-3`.
5. **`Engine` as a service.** The client's layer wraps the Promise facade, and `test/engine-board.ts` provides
   `Engine.test`. The 13 `board()` copies move over as their files are touched, not in one sweep.
6. **The daemon's lifetime.** `wf up` and `wf watch` run as Effects: the claim scoped, the beat forked, both interrupted on a
   signal, so the claim has one release path. The existing real-process test (`daemon-store.test.ts:332`) still asserts the
   store is let go with the signal's exit code. A new one interrupts `wf watch`'s program in the process and asserts no
   watcher is left, which cannot be written today, since the command's promise never settles. Decide here between `@effect/platform-node`'s `NodeRuntime.runMain` (a new dependency, also rc) and a small `runMain` of our own.

   *Stop here and measure:* lines added and removed, test lines touched, typecheck time, and review rounds per card. Then
   decide A or B, and whether to go on.
7. **Controllers one at a time**, smallest first: `decide`, `forget`, `verbs`, `views`, `start`, then `tick` last and alone.
   The meter stays a module global until a pass is concurrent. `decide` landed as the pattern the others follow: the program
   (`decideRun`, an `Effect.fn`) requires the Promise engine as a service (`EngineService`, in `runtime-client.ts`), and the
   plain `decide(engine, id)` runs it over that engine and rejects with what it failed with. `forget` followed it
   (`forgetRun`, and the plain `forget(e, id, how)`). Both programs fail with the refusals (`Missing`, `Conflict`, `Invalid`)
   and die of anything else, through the two lifts beside `EngineService` in `runtime-client.ts`, `tried` for the store and
   git and `awaited` for the engine; the plain faces reject with either as it was thrown. The verbs followed (`roundRun`,
   `acceptRun`, `retryRun`, `approveRun`, `sayRun`, `cancelRun`, each beside its plain face): `wf say`'s engine refusal, an
   error with exit code 2, is its program's `Conflict`, and `hold` and `unhold` are left as they are, for a card of their own.
   `views` followed: `taskPhasesRead`, `checkReportsRead`, `refusalRead`, `parentRead`, `parentsRead` and `filingsRead`, each
   beside its plain face (`taskPhases`, `checkReports`, `refusalOf`, `parentOf`, `parentsOf`, `readFilings`). The views'
   callers stay on the faces; switching the Effect ones to yield the programs, keeping `viewedOnce`'s memo, is a card of its own.
8. **The api's errors.** One mapping from the union to statuses (under B, checked by the compiler), `app.onError` for the
   rest, and the 6 `messageOf` copies gone. Landed under B. Left for a card of its own: the authoring errors that carry a
   `why` beside their kind (`AgentWriteError`, `SkillWriteError`, each an `Invalid` today) are still answered by their
   routes; moving each `why` onto `Missing` or `Conflict` puts them in the table too.
9. **The api's resources.** The feed as a `Stream` over the watch, `quota.ts`'s child and `capabilities.ts`'s MCP ask under
   `acquireRelease` and `Effect.timeout`. Landed under B: `feedEvents`, `usageAsk` and `serverAsk`, each let go on one path and a test
   of each that interrupts it or runs out its time. The asks requests share are still shared, and a request's going interrupts only
   the feed's watch, which is its own.
10. **The api's root and engine as layers.** The 29 dynamic imports become static, file by file. Landed: the api runs its
   handlers on one `ManagedRuntime` built from its layer (`appOf`, `served`), and the environment, the engine, the store's root,
   the two askers and what the reads keep between requests are services a test replaces (`ApiConfig`, `Engine`, `StoreRoot`,
   `McpAsker`, `QuotaAsker`, `ReadMemo`). The api's tests import it and the package statically: the harness they import first sets
   `WF_ROOT` as it loads, and `harness.test.ts` refuses an `import()`. The environment is still read on each request, so a bad
   `WF_MAX_RUNS` or `WF_VERIFY_REST` is still the 422 of the route that reads it. The package still fixes its root as it loads, so
   `StoreRoot` moves where the api looks for yours and not the package's runs or inbox.

Not on the list: the store as Effects, the tick as a `Schedule`, `Effect.log`, `Schedule` retries, the meter, and the web app.

## How it was measured

- **Counts.** `grep` over `src` of each package on this branch. Every figure cited with a `file:line` was read at that line.
  Two broad sweeps (the orchestrator's resources and fakes, the api's errors and fakes) were made by search agents and
  spot-checked here: `cli.ts:1098-1175`, `cli.ts:1185-1192`, `forget.ts`'s `execFileSync`s, the 13 `board()` copies,
  `feed.ts`, `capabilities.ts:518-546`, `quota.ts`, `daemon-store.ts:29-33, 171-201`, `worktree.ts:350-376`,
  `facade.ts:505-580` and `tally.ts`.
- **The exit status.** `WF_ROOT=$(mktemp -d)/wf AE_ROOT=…/ae node packages/agent-orchestrator/bin/wf.ts approve nope step;
  echo $?` printed the refusal and `1`.
- **The tagged error through `runPromise`.** A `Schema.TaggedError` failed in `Effect.runPromise` was caught and was the
  same instance, `instanceof Error`, with no `exitCode`. A class `extends TaggedError('Invalid') { exitCode = 2 }` from
  `effect/Data` was an `Error` with its `_tag` and `exitCode`, failed a program by `yield*`, and was caught by
  `Effect.catchTag`, with `exitCode` still 2.
- **Start-up.** Node 24.20.0 on WSL2. A dynamic `import()` of each entry was timed three times. Modules were counted with a
  `module.registerHooks` load hook passed by `--import`. The `effect/Schema` and `effect/Data` subpaths were imported alone,
  twice each, the same way. `wf ls` was timed with `/usr/bin/time`.
- **Bundle.** `esbuild --bundle --minify --format=esm --platform=browser` of two ten-line files, gzipped at `-9`. The web's
  figures are from `npm run build --workspace web`.
- **The upgrade.** In `/tmp`, a copy of `packages/agent-runtime` beside a `node_modules` of links to
  the checkout's, with `effect` replaced by an `npm i effect@4.0.0-rc.118`. `tsc --explainFiles` confirmed rc.118 was the
  copy compiled against. `tsc -p` and `node --test test/*.test.ts` were run in it, with a `TMPDIR` of their own.
  The copy was then removed.
- **The API names.** Each name was checked for presence on the module object of `node_modules/effect/dist/index.js`, rc.116.
