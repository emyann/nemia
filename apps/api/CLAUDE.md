# apps/api — the workflows behind HTTP

The workflows behind HTTP, and the feed as a stream: Hono over the orchestrator's public contract (`agent-orchestrator`,
`agent-orchestrator/run`, `agent-orchestrator/workflow`; the entries:
`packages/agent-orchestrator/test/contract.test.ts`), and nothing below it: its source imports no runtime `(no test yet)`, while its
tests may import the runtime's public entries to build fakes. A harness fact it needs comes from the orchestrator; what it holds today
below its layer is in `docs/architecture.md`, *Who owns what*.

- **The test script loads `test/harness.ts` with `--import`, and every test file imports it first too**, by its path from the file
  (`../../test/harness.ts` beside the code): a fake `claude` first on PATH, so no test asks this machine's live registry, even one run by
  hand (`node --import ./test/harness.ts --test <file>` from `apps/api`). `harness.test.ts` refuses a script or a file without it. It deletes
  `OTEL_EXPORTER_OTLP_ENDPOINT` too: the api is the daemon, and a test that exports sets the address of a collector it made.
  It sets `WF_MAX_RUNS` and `WF_MAX_CONCURRENT` to a value the package refuses: a test that reads a ceiling sets or deletes it itself.
- **`npm run dev` watches the sources alone**, a `--watch-path` for each (`apps/api/src` and the packages' sources it loads), never
  `node_modules`, whose files a run's worktree hardlinks: a worktree made or freed changes their ctime and restarted the viewer
  (`test/dev-watch.test.ts`).
- **A body read off a response is `unknown`**: name the api's own answer type (`(await res.json()) as RunDetail`).
- **An encoded `..` never reaches a route in a test**: `app.request` resolves `%2E%2E` before the router sees it. Send `..%2F…` to reach
  a name refusal.
- **The list answers a finished run from memory** (`restingRead`, the package's `rest/resting.verb.ts`) while its record, its stamps, the feed for its tasks and its branch tips
  stand. A new input `summarize` reads for a finished run goes into one of those, or a poll answers it stale. `WF_VERIFY_REST=1` (set by
  the harness) judges every kept answer afresh; a test that counts reads turns that off for its request (`unverified`). Requests overlap
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
- **The list's `toDecide` is not the package's decision**: `decision` answers `awaiting` where `toDecide` says nothing; a page that must
  agree with a verb's refusal reads `Decidable.awaiting`, which `src/runs/prune.test.ts` holds to `wf prune`'s own answer.
- **A remote step's wait is answered with `wf say`** (`answerIn` in the package's `needsOf`), never in Claude Code.
- **A new key in `STEP_KEYS` or `AGENT_KEYS` has sites here**: see `packages/agent-orchestrator/CLAUDE.md`.
- **A route lets the package's refusal through and never picks its status**: `app.onError` answers it by kind (`answerError`,
  `REFUSAL_STATUS` in `app.ts`: `Missing` 404, `Conflict` 409, `Invalid` 422), and anything else a 500 (`test/refusal.test.ts`).
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
- **A test imports the api and the package statically, after the harness**, which sets `WF_ROOT` and `CLAUDE_CONFIG_DIR` to scratch
  folders as it loads (`root`, `config`): the package fixes its store as its modules load. `harness.test.ts` refuses an `import()`.
- **A new test file that runs git, starts a process, names the real place or engine (`shipped`, `engine`) or makes an engine by hand
  is named `<what>.boundary.test.ts`**: `packages/agent-orchestrator/test/stand-ins.test.ts` refuses any other but those on its
  baseline, which only shrinks. The `runWith` of `test/placed.ts` gives the git place, so a file that imports it reaches `place`.
- **A folder's face (`index.ts`) is the door `app.ts` mounts**: an import between folders names the file where the face would close a
  value cycle (`detail/` ↔ `steps/`), which tsc passes and the load fails on (`test/layout.test.ts`). `body.ts` stays at the root:
  every folder decodes its bodies there.
- **A route's contract is an entry in the JSDoc of its exported router** (`runs` in `runs/runs.ts`): the comment guard refuses a JSDoc on
  `.post(`. In a test, what a statement means goes into the test's name, an assertion's message, or a JSDoc on a property.
- **What a route holds is taken with `acquireRelease` and let go as its scope closes** (`followFeed` under `feedEvents`, `serverAsk`): a release
  that ends a process waits for it, so a test reads its pid gone as the Effect returns. An ask requests share (`makeQuota` in
  `factory/quota.ts`, `makeMcpAsker` in `capabilities/capabilities.ts`) is never interrupted by one request's going.
- **A handle count is waited for, never read once after a close** (`followers` in `src/factory/feed.test.ts`, waited for with the `until`
  of `test/waits.ts`): a stream's reader is counted a few microtasks after its response, so a test waits for it before it breaks the feed.
- **A test waits in its process with `until` (`test/waits.ts`, the runtime's copy, held by `test/waits.test.ts`)**, asked on a `bell`
  its event's source rings or at a pace for a state, its test given `WAITED`: the runner's timeout is its one bound, which the `test`
  script's `--test-timeout` gives a test given none. `DEADLINES` (`test/waits.test.ts`) refuses a hand-written deadline.
- **A run's record, asks and stamps, and the inbox's cards, are read through `runStore`** (`agent-orchestrator`): the root exports no
  store function of a run (`packages/agent-orchestrator/test/entries.test.ts`).
- **A package program that asks the place is run with `runPlaced(placeService, e, program)`** (`src/store.ts`), the place the app's layer
  holds (`PlaceService` in `Services`, `gitPlaceLayer` in `liveOf`, `Served.placeService`); a test replaces it with
  `Layer.merge(liveOf(), PlaceService.layer(…))`, and runs a package program itself with the `runWith` of `test/placed.ts`.
- **A request's factory and repository are resolved in `served`** (`placeFor`, `factories/place.ts`): a handler reads `repo` and `factory`
  off `Served`, never `?repo=` itself, and the api serves no repository but its own and those a factory names (`factories.test.ts`).
- **An agent fills a step by the file a start would run it with** (`stepsFilled`, the package's `roster/fills.store.ts`), never by its
  name alone: the same name in the repository and in yours are two agents. `usedBy` is the package's by-name, same-place list the delete refusal reads.
- **The app's layer holds the process's telemetry** (`telemetryLayer` in `liveOf`, `app.ts`), so every request says a line
  (`saidRequest`, `src/request/request.ts`) in a test too: a test that reads the lines merges its own `Logger.layer([keeper])` after
  `liveOf()` (`test/request.test.ts`), one that wants silence `Logger.layer([])`.
- **Only `main.ts`, `app.ts` and `layer.ts` touch the machine or read `process.env` and `fetch`**: a new reach in any other file is
  refused by `test/kinds.test.ts`. Reach it through the orchestrator; when a move lands, take the reach off its entry in `MOVES`.
