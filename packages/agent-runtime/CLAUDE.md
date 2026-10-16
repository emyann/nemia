# packages/agent-runtime — `ae`

Agent sessions on one harness each, durably: a job that runs to its end, and a long-lived session that runs until stopped
(`restartPolicy: 'Always'` with `background: true`, README *A long-lived session*). It owns how a session runs: the task's command,
mounts, restart and spend, the journal, the attempts, the harnesses' vocabulary. `decide` (`src/core/domain.ts`) is the whole judgement,
pure (`test/engine.test.ts`); `src/index.ts` and `src/vocabulary.ts` are the only doors, with `src/testing.ts` for tests (`test/contract.test.ts`); the second, the
harnesses' words, `HARNESS_CHOICES`, `fenceReach`, `unruledIn` and `configFolderIn`, loads no Effect and no I/O
(`test/vocabulary-door.test.ts`). The orchestrator reaches it through its one client; what is still above it and a candidate to come
down is in `docs/architecture.md`, *Who owns what*.

## The pass

- **The pass skips a settled task until the feed names it**, so every write to a journal goes through `Journal.append`. The engine's own
  tick tests run `tickMemoLayer({ verify: true })`, which fails a pass that skipped a change.
- **The engine decides a task again in the pass that recorded its end**: a rule that stops or refuses (a deadline) never overrules an end
  on record. Test it with the end and the rule in one pass.
- **An absence read off a failed look is not an absence**: `observeFor` answers `{ seen, unread }`, and an unread name is neither there
  nor gone (`UNREAD`). A new harness says which names a failed read left unread.
- **XState's `transition` answers an event with no edge by staying**: `moveOn` asks `snapshot.can(event)` first and refuses.
- **A sighting speaks A2A's names; a harness's rows and the journal keep their own** (`claudeStateOf`, `detachedStateOf` translate at the
  edge; `decide-corpus.json` proves it case for case).
- **`unsigned` is the orchestrator's word**: the runtime records `stated: false` on a `done` end. Read an end through `closeoutAsked` or
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

- **A parameter taken away is refused, never ignored** (`Object.hasOwn`, the argument count: `tickRefusalOf`, `StepRefused`).
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
  and a sealed file (`core/engine/feed.ts`): read it through `readFeed`, never as plain lines from byte 0.
- **A `claude agents --json` row of ours is decoded by `RegistryRowSchema` (`harness/claude/registry.ts`)**: one that does not decode
  fails the whole read, so every background session is unread, never absent. A field the runtime starts reading is added to the schema;
  a row not ours (no `ae/` name, no `state`) is skipped undecoded.

## Processes and streams

- **A stop between two processes that share only files**: each writes its half before it reads the other's (the stop's marker, then the
  pid; the worker's pid, then the marker). A worker installs its signal handlers before it publishes its pid.
- **A Codex `exec --json` line of a type the runtime reads is decoded by `CodexEventSchema` (`harness/codex/stream.ts`)**: one that
  does not decode leaves that session alone unread while its process runs and failed once it has ended (`lookOf`, `detached.ts`),
  never gone. A field the runtime starts reading is added to the schema; any other line passes undecoded.
- **A Codex rollout record of a kind the runtime reads is decoded by `ROLLOUT` (`harness/codex/rollout.ts`)**: an `event_msg`
  `task_complete` or `item_completed`. One that does not decode refuses the `transcript` verb, naming the line by its byte offset
  and the rollout, never read as saying nothing. A field the runtime starts reading is added to the schema; any other record
  passes undecoded.
- **A `claude -p` line of a kind the runtime reads is decoded by `PRINTED` (`harness/claude/print.ts`)**: a `result`, a `system`
  `permission_denied` or `init`, an `assistant` line's `tool_use` blocks. One that does not decode refuses the output: that session alone
  is unread while its process runs and failed once it has ended (`lookOf`), never read with no answer. A field the runtime starts
  reading is added to the schema; any other line passes undecoded.
- **A Claude Code transcript line of a kind the runtime reads is decoded by `LINES` (`harness/claude/lines.ts`), by the reader that
  reads it**: one that does not decode leaves that `--bg` session alone unread until it has ended, then failed (`endedOf`,
  `harness/claude/bg.ts`), or refuses the `transcript` verb, never read as absent; so does a transcript found and not read
  (`TranscriptUnread`, `harness/claude/transcript.ts`), never kept by `keptRead`. A field the runtime starts reading is added to the
  schema; any other line passes undecoded.
- **A stream a runner keeps whole is read through `output`, never off the run directory** (`streamIn`, `detached.ts`, which counts
  the read); a harness that keeps its streams apart says `streams: true`. `config.env` is journalled with the task: no secret there.
- **A test runs at whatever niceness and IO class its parent gave it, and a worker it starts inherits both**: read a niceness
  relative to the test's own (`ownNiceness`, `test/command.test.ts`), and prove an argv the IO class would hide by calling the
  harness's `command`.
- **A stream-json line is parsed for its `type`, never matched at its start** (`closesOn` in `bin/ae-worker.ts`): a job reading
  `--input-format stream-json` exits only when its stdin ends.
- **A detached session's id is read by the worker from its spec's `start` event, on whole stdout lines** (`readers`, `bin/ae-worker.ts`).
  Measured 2026-10-06: `codex exec --json` (0.154.0) prints `thread.started` first; `claude -p` (2.1.291) prints `system`/`init` first
  under `--output-format stream-json --verbose`, and one `result` line under `--output-format json`.
- **A turn's end is not the session's end for a long-lived attached request** (`took`, `harness/claude/attached-session.ts`): the run
  file is rewritten `idle`, the input stays open, and an `is_error` result fails nothing. The SDK reads `errors` off a result whose
  subtype is not `success`, so a stand-in's interrupted result carries one or `readMessages` throws. Words pushed on its input begin
  the next turn, so `hear` writes `working` with them: a session heard and left `idle` is read as waiting on a person while it answers,
  and no turn of it can be ended. It is `idle` again only once a result has named every word pushed, by `user_message_uuids` on the
  result (`answered`), never by counting: words pushed while the model writes run as a turn of their own, and words pushed while a tool
  call runs are folded into the turn in flight and answered by its one result (measured live 2026-10-16, SDK 0.3.270, CLI 2.1.301;
  `queued_turn_count` was 0 on a result a second turn followed, so nothing reads it).
- **An attached sighting says `held` and the holder's `pid` while its state is open** (`sightingOf`, `harness/claude/attached.ts`), and
  a holder gone says `held: false`, which `decide` restarts the task under: `interrupted` reads the interrupt file on every look, never
  as a transition, so another process's ask survives a restart of the holder, and an ask that landed after its turn ended is dropped
  there, never kept for the next turn.
- **The claude.ai bridge is an undeclared method on the SDK's `query()` object**, read off it in `attached-bridge.ts` alone, its answer
  decoded before anything is written from it, and refused in words on the run file where the SDK has none.
- **A drain or a let-go never holds a call that belongs to a call already in flight**, or the call it waits for can never end and the
  holder waits on what it forbids: `held` (`harness/claude/attached.ts`) is a question about the session, and a `PreToolUse` input
  carrying `agent_id` — a sub-agent's call, as the SDK's hook input documents it — is never held.
- **A holder's whole let-go is bounded by one budget its waits share** (`LET_GO_MS`, `leftOf`, `attached.ts`), never one bound each,
  and it says on its log what it waits for and what it cut. The restart's wait for the lease, `stopMs`, is not the bound it gives a
  call in flight (`takeover.verb.ts`).
- **A `parked` run that carries `calling` is a call its holder cut**: the next holder resumes that session with `crashNote`, the road a
  crashed holder's session already takes (`noteOf`, `attached.ts`).
- **The Agent SDK (0.3.270) speaks to its CLI in control requests both ways, and writes a resume as one argument, `--resume=<id>`**: the
  stand-in CLI (`test/fixtures/stand-in-claude.ts`) answers `initialize` and asks `hook_callback` and `can_use_tool` as it does, and
  `test/attached.boundary.test.ts` pins it; an SDK update that moves the protocol fails there first.
- **The SDK sends an empty system prompt when `systemPrompt` is unasked**, so an agent's own prompt on `append-system-prompt-file` is
  appended to nothing: `attachedOptions` asks for the preset `claude_code`, which a `claude -p` job has by default (measured 0.3.270:
  the `initialize` request carried `[""]` without it, and none with it).

## A2A and remote agents

- **The SDK's `Transport` and `A2ARequestHandler` spell three methods differently**, and its `Client` answers some calls itself
  (`InProcessTransport` forwards them).
- **A card the SDK's own server serves loses its security schemes in the SDK's parser**: `cardOfJson` keeps them;
  `test/remote-server.ts` serves both forms (`cardForm`).
- **A card is decoded by `CardSchema` (`a2a/card.ts`) on both roads, served and configured, before `AgentCard.fromJSON`**, which
  coerces anything and reads snake_case too: a field the runtime starts reading is added to the schema, its snake_case spelling
  refused beside it.
- **A remote session's `nativeId` is the Task's context**, not its id: `bySession` resolves one to the other.
- **A request to another party's address is bounded (`REQUEST_MS`), goes to the origin it was given, follows no redirect, and is named by
  origin and path** (`cardUrlOf`, `shownUrl`).
- **A sentence quotes another party's content through `quote` (`core/quote.ts`)**, and an error in the runtime's own words is a class
  `wordsOf` leaves whole (`a2a/said.ts`); anything else is cut at 200.
- **A paged read is served from the listing its token names** (`OPEN_LISTINGS`), never the latest.
- **An async generator's `return` waits behind its pending `next`**: `Stream.fromAsyncIterable` calls it on interruption, so a silent
  subscription is aborted first (`abortedOnReturn`, `a2a/remote-follow.ts`), or its interruption never ends.
- **A test that shortens a remote harness's `requestMs` hands the agent its card (`opsOn`, `test/remote-follow.test.ts`) and waits for the
  send's answer**, or every request it does not test (the card read again after a failure, a subscription's headers) is held to it.
- **`Stream.retry` starts its schedule again at the attempt's first output**, an empty array included: a bound on failures in a row
  is counted by hand (`drops` in `followTask`).

## Claude Code, as a harness

What Claude Code does as the steps meet it, measured, is in `docs/harness.md`: its fences and how a rule is matched, what a job has
that a background session has not, trust, the bridge to claude.ai, and what it exports.
