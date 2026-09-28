# packages/agent-runtime — `ae`

One session run to completion, durably, on one harness. `decide` (`src/domain.ts`) is the whole judgement, pure; `src/facade.ts` and
`src/index.ts` are the only doors.

## The pass

- **The pass skips a settled task until the feed names it**, so every write to a journal goes through `Journal.append`. The engine's own
  tick tests run `tickMemoLayer({ verify: true })`, which fails a pass that skipped a change.
- **The engine decides a task again in the pass that recorded its end**: a rule that stops or refuses (a deadline) never overrules an end
  on record. Test it with the end and the rule in one pass.
- **A pass asks `claude agents` only for a session it expects that is no job** (`observeFor`), read off the world, never off
  `config.background`; `agent-orchestrator/test/agents-calls.test.ts` counts the calls.
- **An absence read off a failed look is not an absence**: `observeFor` answers `{ seen, unread }`, and an unread name is neither there
  nor gone (`UNREAD`). A new harness says which names a failed read left unread.
- **XState's `transition` answers an event with no edge by staying**: `moveOn` asks `snapshot.can(event)` first and refuses. A new edge is
  taken by a case of `lifecycle.test.ts`'s corpus, and the README's diagram is regenerated.
- **A sighting speaks A2A's names; a harness's rows and the journal keep their own** (`claudeStateOf`, `detachedStateOf` translate at the
  edge; `decide-corpus.json` proves it case for case).
- **`unsigned` is the orchestrator's word**: the runtime records `stated: false` on a `done` end. Read an end through `closeoutAsked` or
  `endWords`, which also map a fact that replaced an old word back to it (`limit: 'budget'`).
- **The engine can say a task waits before its harness has let the session go** (`closedOut`, and it waits for the session before ending
  on a statement on disk): a test asserts both sides, or waits for the Task.
- **`io().reads` counts every file the runtime reads**, not only journals.

## Arguments and doors

- **A parameter taken away is refused, never ignored** (`Object.hasOwn`, the argument count: `tickRefusalOf`, `StepRefused`).
- **A flag only Claude Code has goes under `config.claude`**, never a named argument; a key moved there is read at its old place off a
  journal (`upgrade`) and refused there at both doors (`FORMER_ARGS`). Pin the argv before a move and compare after.
- **An optional verb renamed on its way through a seam is dropped by every door that takes the old type**: keep the old verb beside the
  new one, and test each door by calling the verb through it.
- **Node's type stripping refuses a parameter property** (`constructor(private readonly ops)`): declare the field and assign it.
- **A journal is decoded before `upgrade`, as any store gives it back** (`Journal.layer`, `event-schema.ts`): an entry no runtime
  wrote fails the read with a `JournalError` naming the entry and its first wrong field (`journalWords`). A former shape is accepted
  by the schema, rewritten by `upgrade`, and read by a test; a field added to `Event` in `domain.ts` is added to its struct, or `tsc`
  refuses the assignment in `journal.ts` (the struct's rest is `unknown`). Each event keeps the keys it does not name
  (`StructWithRest`: a `Struct` strips them), and a decoded struct comes back with its keys in the schema's order, so where the
  object's own keys matter test it with `Schema.is` and decode only to say why not.

## Processes and streams

- **A stop between two processes that share only files**: each writes its half before it reads the other's (the stop's marker, then the
  pid; the worker's pid, then the marker). A worker installs its signal handlers before it publishes its pid.
- **A stream-json line is parsed for its `type`, never matched at its start** (`closesOn` in `bin/ae-worker.ts`): a job reading
  `--input-format stream-json` exits only when its stdin ends.

## A2A and remote agents

- **The SDK's `Transport` and `A2ARequestHandler` spell three methods differently**, and its `Client` answers some calls itself
  (`InProcessTransport` forwards them).
- **A card the SDK's own server serves loses its security schemes in the SDK's parser**: `cardOfJson` keeps them;
  `test/remote-server.ts` serves both forms (`cardForm`).
- **A remote session's `nativeId` is the Task's context**, not its id: `bySession` resolves one to the other.
- **A request to another party's address is bounded (`REQUEST_MS`), goes to the origin it was given, follows no redirect, and is named by
  origin and path** (`cardUrlOf`, `shownUrl`).
- **A paged read is served from the listing its token names** (`OPEN_LISTINGS`), never the latest.
