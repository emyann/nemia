# apps/api — the workflows behind HTTP

The workflows behind HTTP, and the feed as a stream: Hono over the orchestrator's public contract (`agent-orchestrator`,
`agent-orchestrator/run`, `agent-orchestrator/workflow`; the entries:
`packages/agent-orchestrator/test/contract.test.ts`), and nothing below it: its source imports no runtime, while its
tests may import the runtime's public entries, and the test place from `agent-orchestrator/testing`. A harness fact it needs comes
from the orchestrator; what it holds today below its layer is in `docs/architecture.md`, *Who owns what*.

- **The source (`src`) is under `noUncheckedIndexedAccess`, and lint refuses a `!`** there (`.oxlintrc.json`, held by
  `packages/agent-orchestrator/test/index-reads.test.ts`): say what an absence means (the refusal or the miss the code already gives),
  never a cast or a default the contract does not give. A dictionary read stays a plain read, its `undefined` handled, with no
  `Object.hasOwn` guard put in front of it: that changes what a prototype key reads. The tests' own `test/tsconfig.json` leaves the
  flag off.
- **The OpenAPI document has a page to browse it beside it**: `GET /openapi` (`src/openapi/reference.ts`) is Scalar's reference, drawn
  in the browser from the document at `OPENAPI_PATH`, never a copy, so a route the document gains shows there with nothing to change.
  The page reaches no host but the api: its script is the installed `@scalar/api-reference` bundle, read by `app.ts` and served at `/openapi/scalar.js`
  (Scalar's Hono helper would load it from jsDelivr), and the viewer's fonts, telemetry, agent, MCP button, developer tools and "try
  it" client are off; a Scalar option that calls out is turned off there, and `src/openapi/reference.test.ts` refuses a page naming
  another host.
- **A body read off a response is `unknown`**: name the api's own answer type (`(await res.json()) as RunAnswer`).
- **An encoded `..` never reaches a route in a test**: `app.request` resolves `%2E%2E` before the router sees it. Send `..%2F…` to reach
  a name refusal.
- **The run object, its sub-resources and the list answer from the app's informer** (`Informer`, one per app from `liveOf`; the
  package's `informerRead` in `rest/informer.verb.ts`): a run at rest while its record, its stamps, the feed for its tasks and its
  branch tips stand, and a moving run within the pass that judged it. A write through the api drops its run (`dropInformed`, by
  `acted` in `src/objects/runs.ts`). A new input `summaryOf` reads for a run goes into one of those, or a poll answers it stale. The informer keeps the run it
  judged and hands it to the store in place of a read of its record (`given`), so a warm list reads no record of a run at rest. The
  RunList serves each run's listed object kept beside its judgement, its disk parts read per request (`diskPartsOf`).
  `WF_VERIFY_REST=1` (set by the harness) judges every kept answer afresh and is handed nothing from memory, so every record is read
  again; a test that counts reads turns that off for its request (`unverified`). Requests overlap
  and share the feed cursor: a request keeps nothing once another has read the feed past where it read to.
- **`GET /api/stats` answers a finished run's facts from the app's memo** (`ReadMemo.stats`, the package's `StatsMemo`) while its
  stamp and the feed for its tasks stand. A new input of a run's stats facts goes into one of those, or the stats answer stale. Verified
  under `WF_VERIFY_REST=1`; a test that counts reads turns that off (`unverified` in `src/stats/stats.test.ts`).
- **A run's tasks are every step's, every check's, and every earlier try's and its check's** (`runTasks` in the package's `record/record.ts`); `list(taskIds)`
  looks at no harness when nothing among them is in flight.
- **A run whose task's journal does not read is answered off its record** (`judgedOrNot` in the package's `summary/summary.verb.ts`), never judged, and not kept:
  `list` names the task in `unreadable`, and a parent's task read to see if it landed rejects with the `JournalError`.
- **A transcript of an attempt in flight asks its harness**: read it on a run's detail, never on the list the Factory polls.
- **Read a `Wait` by the key you mean**: a hold's `Wait` carries `landed`, which an `--after` wait never does (`holdNeedsYou`, not
  `neverLands`, in the package's `summary/judged.verb.ts`).
- **A remote agent's address is shown as origin and path, never whole** (`remoteOf` in the package's `resource/told.verb.ts`): a query string can carry a key.
- **A list a page turns into a sentence carries everything the sentence is about** (`folderFiles` in the package's `resource/files.store.ts` lists what it cannot
  serve by path), and leaves out only what the run itself put there (`GIVEN`).
- **The list's `toDecide` is not the package's decision**: `decision` answers `awaiting` where `toDecide` says nothing.
- **A remote step's wait is answered with `wf say`** (`answerIn` in the package's `needsOf`), never in Claude Code.
- **A new key in `STEP_KEYS` or `AGENT_KEYS` has sites here**: see `packages/agent-orchestrator/CLAUDE.md`.
- **`objects`' `Api` is the one route table** (`docs/architecture.md`): every route the api serves is an endpoint there, served by the
  mount (`src/objects/serve.ts`, `.all(MOUNT, mount(runtime))` in `app.ts`), and Hono is the host alone — its middleware, the three
  OpenAPI routes, the MCP port and the 404. A route is added to the `Api` and handled in its group's folder (`runs/`, `steps/`, `decide/`, `server/`,
  `nemia/`, `workflows/`, `agents/`, `skills/`, `factory/`, `proposals/`, `src/objects/` for the runs and cards), never on Hono:
  `test/served.test.ts` derives what is served from the `Api`. A handler reads the request's services (`ServedNow`, the app's informer
  among them), never a layer of its own, and calls the package's verbs by type (`ENTRY.handler(input)` through `inRequest`, which gives it `StoreRoot` and `StoreConfig`),
  each request of a namespaced kind placed in its namespace's factory (`placeFor`, `answeredIn`), a write of yours taken in `default`
  alone. A refusal's status is its class's, said once (`refusedAs`, `statusOf`, `src/objects/refused.ts`).
- **The MCP port (`/mcp`, `src/mcp/`) is a protocol host, not a resource**: it calls the `Api`'s own endpoints through the app's `fetch`
  with the caller's `Authorization`, so every middleware, refusal and memo applies as to any client (a call logs two request lines). A
  tool is a link of the command table (`served` on the entry, `toolsOf`), never added here; a non-GET call always sends a JSON body, which
  the write guard asks for. An answer fits what a host reads (`src/mcp/bound.ts`): a link's `query` gives the defaults a call is sent
  with, a list is asked a page of `PORT_PAGE`, a `Table` endpoint is asked for its Table and answered as its lines (`objects`'
  `tableLines`), and no answer passes `ANSWER_BOUND` (`answerFit`), a page past it asked again shorter and any other refused, never
  cut. It says what Nemia is on `initialize`, and which tools come first, for a host that defers its tools (`PORT_INSTRUCTIONS`,
  `src/mcp/instructions.ts`), every tool it names one the port lists. A store marked exposed (`WF_EXPOSED=1`) refuses a request with
  no token on every route of the api (`/api`, `/openapi`), and `/mcp` takes a person's token alone; a page of the board needs none (`needOf`, `src/caller/caller.ts`).
- **The board's built pages are host content, served after the mount** (`src/board/board.ts`, `GET /*`): `NEMIA_BOARD_DIR`, else the
  running code's `apps/web/dist`, `index.html` for a route of the board's, never a path under `/api`, `/openapi` or `/mcp`. The board's
  token is an HttpOnly cookie (`TOKEN_COOKIE`) the api sets and clears (`POST` and `DELETE /api/session`, `src/server/session.ts`);
  `callerGate` reads it after the bearer, on the api's own paths alone, and the write guard lets it pass the host but not the site.
- **Who a request is from is resolved before any router** (`callerGate`, `src/caller/caller.ts`): a handler reads `caller` off `Served`,
  never the `Authorization` header, and hands it to the package's program, which judges it (`src/proposals/`). A token refused is a 401
  on every route, not the proposals' alone. A test that presents a live token mints it through the package's `TokenDoor`, its run
  planted and its task filed on the stand-in (`src/proposals/proposals.test.ts`).
- **Every list is watched by `watchable`** (`src/watch/watch.ts`, `?watch=true`): a GET whose success is a `<Kind>List` is watched by
  the mount with nothing to add (`src/objects/serve.ts`), which `src/watch/watch.test.ts` holds for every such endpoint of the `Api`; a
  watch asked for a `Table` is refused 406. A watch reads its list again, so each open one costs a list read per feed line (at most one
  per 500 ms) and per resync: a watch of runs on a busy feed reads the RunList about a third of the time (the measure below). The Event
  lists are the exception: their watch follows the feed (`eventsFollowed`, `src/feed-objects/events-watch.ts`). A list whose objects
  carry parts measured to the read hands `watchable` the version it compares them at (the runs' `runWatchVersion`, which leaves out a
  going run's `wallMs` and `clock`), or its watch sends a MODIFIED of each on every read. Discovery (`GET /api`,
  `src/discovery/discovery.ts`) is read off the `Api` by `objects`' `resourcesOf`. The feed and a step's stream are `StreamSse`
  endpoints.
- **A request body is decoded by its endpoint's Schema** and refused 400 with the `field` it stopped at (`decodeRefused` in
  `src/objects/serve.ts`): no schema message reaches a response. A new key goes into the Schema in `objects`, with a test that makes it refuse.
- **A server-side `Table`** (Kubernetes' `Accept: application/json;as=Table;g=meta.k8s.io;v=v1`, `TABLE_ACCEPT`) is answered where an
  endpoint declares `Table` beside its list (runs, cards, agents, skills, factories, a factory's MCP servers) and the request accepts
  it (`wantsTable`, `src/objects/table.ts`); its columns are the orchestrator's (`runTable`, `cardTable`, `src/kind-table/`), and a row's
  object is the item's metadata (`PartialObjectMetadata`) but a card's, the card whole.
- **A feed fixture writes the events the runtime writes**: the runtime decodes its feed, so a fixture event missing a field the
  runtime always writes fails the read, not the assertion you meant.
- **A handler reads what it needs through `served(c, …)`** (`layer.ts`), never off a module: the engine, the store's root, the
  environment and the askers are the app's services, and a test gives its own with `appOf(Layer.merge(liveOf(), …))`
  (`test/layer.test.ts`). What a read keeps between requests is the app's too (`ReadMemo`, an asker's closure): a test wanting a fresh
  one builds an app. `StoreRoot` is the package's own service (`orchestrator/StoreRoot`), given by the app's layer from `WF_ROOT`
  with the store's settings, `StoreConfig` (`storeConfigLayer(env)` in `app.ts`, beside `Engine.live(env)`), and re-exported by `store.ts` so a route has one import site; no module of the package reads a
  root as it loads, so a test imports it at its head and hands the store it means as an environment record (`liveOf(ENV)`,
  `engine(ENV)`, `storeConfigLayer(ENV)`): only `test/harness.ts` sets the process's `WF_ROOT`, and
  `tools/guards/test/env-given.test.ts` refuses any other test file that writes a `WF_` variable as it loads.
- **A handler's body stays a plain `async` function inside `served`**: a failure yielded in `Effect.gen` never reaches a `try` around
  it, and the routes catch what they word themselves; `runPromise` rejects with the failure itself, so `app.onError` sees its kind.
  A package's program runs over the request's engine and the app's place with `runPlaced(placeService, e, …)`, a verb of the engine itself with `engineRead` (store.ts).
- **A test is given the stand-ins, and names the real thing in a boundary file**: the runtime's test engine (`agent-runtime/testing`)
  and the test place (`agent-orchestrator/testing`), given to the app with `appOver(engine, stand)` (`Engine.over` under it) and to a
  package program with `runOver` (`test/placed.ts`); a task is filed on the stand-in and moved with `settle`, never a journal written by
  hand. A test that needs the real engine or the git place — a Claude Code file the harness reads, a journal entry the stand-in has no
  model of — is `<what>.boundary.test.ts`, and runs its programs with the `runWith` of `test/builtin-place.ts`; any other file that still
  does is on the orchestrator's `test/stand-ins.baseline.ts`, which only shrinks.
- **In a test, what a statement means goes into the test's name, an assertion's message, or a JSDoc on a property.**
- **What a route holds is taken with `acquireRelease` and let go as its scope closes** (`followFeed` under `feedEvents`, `serverAsk`): a release
  that ends a process waits for it, so a test reads its pid gone as the Effect returns. An ask requests share (`makeQuota` in
  `gauges/quota.ts`, `makeMcpAsker` in `capabilities/capabilities.ts`) is never interrupted by one request's going.
- **A handle count is waited for, never read once after a close** (`followers` in `src/gauges/feed.test.ts`, waited for with the `until`
  of `test/waits.ts`): a stream's reader is counted a few microtasks after its response, so a test waits for it before it breaks the feed.
- **A package program that asks the place is run with `runPlaced(placeService, e, program)`** (`src/store.ts`), the place the app's layer
  holds (`PlaceService` in `Services`, `gitPlaceLayer` in `liveOf`, `Served.placeService`); a test replaces it with
  `Layer.merge(liveOf(), PlaceService.layer(…))`, and runs a package program itself with the `runOver` of `test/placed.ts`.
- **A handler reads an agent or a skill through the package's `AgentDoor` and `SkillDoor`, run with `inRequest`** (`Served`, `layer.ts`),
  never a store of them (`loadAgents`, `agentsFor`, `skillsFor`, …; the orchestrator's `src/agents/agent-door.store.test.ts` counts the
  api's calls, none allowed): `inRequest` runs a program over the request's own services, so the door reads the app's `StoreRoot`, or
  the door a test merged into the app's layer. A test merges `agentDoorMemory()` or `skillDoorMemory()` (`agent-orchestrator/testing`)
  only where the route makes no `runPlaced` read of agents or skills, which runs outside the app's runtime and reads the files.
- **A request's factory and repository are resolved in `served`** (`placeFor`, `factory/place.ts`): a handler reads `repo` and `factory`
  off `Served`, never `?repo=` itself.
- **An agent fills a step by the file a start would run it with** (`stepsFilled`, the package's `roster/fills.store.ts`), never by its
  name alone: the same name in the repository and in yours are two agents. `usedBy` is the package's by-name, same-place list the delete refusal reads.
- **The app's layer holds the process's telemetry** (`telemetryLayer` in `liveOf`, `app.ts`), so every request says a line
  (`saidRequest`, `src/request/request.ts`) in a test too: a test that reads the lines merges its own `Logger.layer([keeper])` after
  `liveOf()` (`test/request.test.ts`), one that wants silence `Logger.layer([])`.
