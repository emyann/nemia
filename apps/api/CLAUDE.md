# apps/api — the workflows behind HTTP

The workflows behind HTTP, and the feed as a stream: Hono over the orchestrator's public contract (`agent-orchestrator`,
`agent-orchestrator/run`, `agent-orchestrator/workflow`; the entries:
`packages/agent-orchestrator/test/contract.test.ts`), and nothing below it: its source imports no runtime `(no test yet)`, while its
tests may import the runtime's public entries to build fakes. A harness fact it needs comes from the orchestrator; what it holds today
below its layer is in `docs/architecture.md`, *Who owns what*.

- **A body read off a response is `unknown`**: name the api's own answer type (`(await res.json()) as RunDetail`).
- **An encoded `..` never reaches a route in a test**: `app.request` resolves `%2E%2E` before the router sees it. Send `..%2F…` to reach
  a name refusal.
- **The list answers a finished run from memory** (`restingRead`, the package's `rest/resting.verb.ts`) while its record, its stamps, the feed for its tasks and its branch tips
  stand. A new input `summarize` reads for a finished run goes into one of those, or a poll answers it stale. The memo keeps the run it
  judged and hands it to the store in place of a read of its record (`given`), so a warm list reads no record of a run at rest.
  `WF_VERIFY_REST=1` (set by the harness) judges every kept answer afresh and is handed nothing from memory, so every record is read
  again; a test that counts reads turns that off for its request (`unverified`). Requests overlap
  and share the feed cursor: a request keeps nothing once another has read the feed past where it read to.
- **`GET /api/stats` answers a finished run's facts from the app's memo** (`ReadMemo.stats`, the package's `StatsMemo`) while its
  stamp and the feed for its tasks stand. A new input of a run's stats facts goes into one of those, or the stats answer stale. Verified
  under `WF_VERIFY_REST=1`; a test that counts reads turns that off (`unverified` in `src/stats/stats.test.ts`).
- **A run's tasks are every step's, every check's, and every earlier try's and its check's** (`runTasks` in the package's `record/record.ts`); `list(taskIds)`
  looks at no harness when nothing among them is in flight.
- **A run whose task's journal does not read is answered off its record** (`judgedOrNot` in the package's `summary/summary.verb.ts`), never judged, and not kept:
  `list` names the task in `unreadable`, and a parent's task read to see if it shipped rejects with the `JournalError`.
- **A transcript of an attempt in flight asks its harness**: read it on a run's detail, never on the list the Factory polls.
- **Read a `Wait` by the key you mean**: a hold's `Wait` carries `shipped`, which an `--after` wait never does (`holdNeedsYou`, not
  `neverShips`, in the package's `summary/judged.verb.ts`).
- **A remote agent's address is shown as origin and path, never whole** (`remoteOf` in `detail/detail.ts`): a query string can carry a key.
- **A list a page turns into a sentence carries everything the sentence is about** (`folderFiles` in `steps/artifacts.ts` lists what it cannot
  serve by path), and leaves out only what the run itself put there (`GIVEN`).
- **The list's `toDecide` is not the package's decision**: `decision` answers `awaiting` where `toDecide` says nothing.
- **A remote step's wait is answered with `wf say`** (`answerIn` in the package's `needsOf`), never in Claude Code.
- **A new key in `STEP_KEYS` or `AGENT_KEYS` has sites here**: see `packages/agent-orchestrator/CLAUDE.md`.
- **A request body is decoded by its route's schema** (`readBody` in `body.ts`) and refused in the route's own words, the first wrong
  key named: no schema message reaches a response. A new key goes into the schema and its `*_SHAPE`, with a test that makes it refuse.
- **A feed fixture writes the events the runtime writes**: the runtime decodes its feed, so a fixture event missing a field the
  runtime always writes fails the read, not the assertion you meant.
- **A handler reads what it needs through `served(c, …)`** (`layer.ts`), never off a module: the engine, the store's root, the
  environment and the askers are the app's services, and a test gives its own with `appOf(Layer.merge(liveOf(), …))`
  (`test/layer.test.ts`). What a read keeps between requests is the app's too (`ReadMemo`, an asker's closure): a test wanting a fresh
  one builds an app. `StoreRoot` moves where the api looks for yours, never the package's runs or inbox, which keep its `HOME`.
- **A handler's body stays a plain `async` function inside `served`**: a failure yielded in `Effect.gen` never reaches a `try` around
  it, and the routes catch what they word themselves; `runPromise` rejects with the failure itself, so `app.onError` sees its kind.
  A package's program runs over the request's engine and the app's place with `runPlaced(placeService, e, …)`, a verb of the engine itself with `engineRead` (store.ts).
- **In a test, what a statement means goes into the test's name, an assertion's message, or a JSDoc on a property.**
- **What a route holds is taken with `acquireRelease` and let go as its scope closes** (`followFeed` under `feedEvents`, `serverAsk`): a release
  that ends a process waits for it, so a test reads its pid gone as the Effect returns. An ask requests share (`makeQuota` in
  `factory/quota.ts`, `makeMcpAsker` in `capabilities/capabilities.ts`) is never interrupted by one request's going.
- **A handle count is waited for, never read once after a close** (`followers` in `src/factory/feed.test.ts`, waited for with the `until`
  of `test/waits.ts`): a stream's reader is counted a few microtasks after its response, so a test waits for it before it breaks the feed.
- **A test waits in its process with `until` (the runtime's, taken from `agent-runtime/testing`; a test beside the code, under `src/`,
  reads it through `test/waits.ts`, which re-exports it, since the layer's lint block refuses `agent-runtime` under `src/`)**, asked on a `bell`
  its event's source rings or at a pace for a state, its test given `WAITED`: the runner's timeout is its one bound, which the `test`
  script's `--test-timeout` gives a test given none. `DEADLINES` (`test/waits.test.ts`) refuses a hand-written deadline.
- **A run's record, asks and stamps, and the inbox's cards, are read through `runStore`** (`agent-orchestrator`): the root exports no
  store function of a run (`packages/agent-orchestrator/test/entries.test.ts`).
- **A package program that asks the place is run with `runPlaced(placeService, e, program)`** (`src/store.ts`), the place the app's layer
  holds (`PlaceService` in `Services`, `gitPlaceLayer` in `liveOf`, `Served.placeService`); a test replaces it with
  `Layer.merge(liveOf(), PlaceService.layer(…))`, and runs a package program itself with the `runWith` of `test/placed.ts`.
- **A request's factory and repository are resolved in `served`** (`placeFor`, `factories/place.ts`): a handler reads `repo` and `factory`
  off `Served`, never `?repo=` itself.
- **An agent fills a step by the file a start would run it with** (`stepsFilled`, the package's `roster/fills.store.ts`), never by its
  name alone: the same name in the repository and in yours are two agents. `usedBy` is the package's by-name, same-place list the delete refusal reads.
- **The app's layer holds the process's telemetry** (`telemetryLayer` in `liveOf`, `app.ts`), so every request says a line
  (`saidRequest`, `src/request/request.ts`) in a test too: a test that reads the lines merges its own `Logger.layer([keeper])` after
  `liveOf()` (`test/request.test.ts`), one that wants silence `Logger.layer([])`.
