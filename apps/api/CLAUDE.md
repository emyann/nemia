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
  branch tips stand, and a moving run within the pass that judged it. A write through the api drops its run (`uninformed`,
  `commands/routes.ts`). A new input `summaryOf` reads for a run goes into one of those, or a poll answers it stale. The informer keeps the run it
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
- **The objects are served by HttpApi handlers in `src/objects/`** (`runs.ts`, `cards.ts`, `factories.ts`; a factory's parts in
  `src/factory-parts/`: `mcp-servers.ts`, `schedules.ts`, `hires.ts`, `volumes.ts`, and in `parts.ts` what they share, their paths and
  the guard words of their writes; the Workflows, Agents and Skills in `src/definitions/`: `workflows.ts`, `agents.ts`, `skills.ts`,
  in `served.ts` what they share and in `routes.ts` their paths and guard words, each request placed in its namespace's factory by
  `placeFor`, a write of yours taken in `default` alone; the cluster's builtin templates, the feed's subscriptions and its lines as
  events in `src/template-objects/templates.ts` and `src/feed-objects/` (`subscriptions.ts`, `events.ts`), a template's documents read from its render by the definitions' own
  tree readers, `treeWorkflowsHeld`, `treeAgentsHeld` and `treeSkillsHeld`), built from `objects`' one `Api` into a web
  handler (`serve.ts`) that Hono's routes hand exactly the paths it serves, each inside `served`, guarded first where it writes: a handler
  reads the request's services (`ServedNow`, the app's informer among them), never a layer of its own. A path added to the `Api` gets its
  forwarding route there, or Hono answers it 404. The feed, `watch` and every other route stay Hono's.
- **Every list is watched by `watchable`** (`src/watch/watch.ts`, `?watch=true`): a list's route goes through `listed` in `serve.ts`
  (and `partsRoutes`' and `definitionsRoutes`' `listed`), or it is not watched, which `src/watch/watch.test.ts` refuses for every GET
  list of the `Api`. A watch reads its list again through its own route, so each open one costs a list read per feed line (at most
  one per 500 ms) and per resync: a watch of runs on a busy feed reads the RunList about a third of the time (the measure below). Discovery (`GET /api`,
  `src/discovery/discovery.ts`) is read off the `Api`, so a path added there is discovered with nothing to change. SSE under HttpApi was
  measured on 2026-11-05 (`docs/measure-2026-11-05-sse-under-httpapi.md`): the watch's frames are already HttpApi's and it can move;
  the feed can once its opening comment and its `Last-Event-ID` resume are written through `StreamSse({ events })`. Neither moved yet.
- **A request body is decoded by its route's schema** (`readBody` in `body.ts`) and refused in the route's own words, the first wrong
  key named: no schema message reaches a response. A new key goes into the schema and its `*_SHAPE`, with a test that makes it refuse.
- **A feed fixture writes the events the runtime writes**: the runtime decodes its feed, so a fixture event missing a field the
  runtime always writes fails the read, not the assertion you meant.
- **A handler reads what it needs through `served(c, …)`** (`layer.ts`), never off a module: the engine, the store's root, the
  environment and the askers are the app's services, and a test gives its own with `appOf(Layer.merge(liveOf(), …))`
  (`test/layer.test.ts`). What a read keeps between requests is the app's too (`ReadMemo`, an asker's closure): a test wanting a fresh
  one builds an app. `StoreRoot` is the package's own service (`orchestrator/StoreRoot`), given by the app's layer from `WF_ROOT`
  (`storeRootLayer(env)` in `app.ts`) and re-exported by `store.ts` so a route has one import site; what the package still reads off a
  root of its own as it loads is counted in the orchestrator's `test/global-roots.baseline.ts`, so a test that means to move those
  sets `WF_ROOT` before it imports the package, as `test/harness.ts` does.
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
  `factory/quota.ts`, `makeMcpAsker` in `capabilities/capabilities.ts`) is never interrupted by one request's going.
- **A handle count is waited for, never read once after a close** (`followers` in `src/factory/feed.test.ts`, waited for with the `until`
  of `test/waits.ts`): a stream's reader is counted a few microtasks after its response, so a test waits for it before it breaks the feed.
- **A package program that asks the place is run with `runPlaced(placeService, e, program)`** (`src/store.ts`), the place the app's layer
  holds (`PlaceService` in `Services`, `gitPlaceLayer` in `liveOf`, `Served.placeService`); a test replaces it with
  `Layer.merge(liveOf(), PlaceService.layer(…))`, and runs a package program itself with the `runOver` of `test/placed.ts`.
- **A handler reads an agent or a skill through the package's `AgentDoor` and `SkillDoor`, run with `inRequest`** (`Served`, `layer.ts`),
  never a store of them (`loadAgents`, `agentsFor`, `skillsFor`, …; the orchestrator's `src/agents/agent-door.store.test.ts` counts the
  api's calls, none allowed): `inRequest` runs a program over the request's own services, so the door reads the app's `StoreRoot`, or
  the door a test merged into the app's layer. A test merges `agentDoorMemory()` or `skillDoorMemory()` (`agent-orchestrator/testing`)
  only where the route makes no `runPlaced` read of agents or skills, which runs outside the app's runtime and reads the files.
- **A request's factory and repository are resolved in `served`** (`placeFor`, `factories/place.ts`): a handler reads `repo` and `factory`
  off `Served`, never `?repo=` itself.
- **An agent fills a step by the file a start would run it with** (`stepsFilled`, the package's `roster/fills.store.ts`), never by its
  name alone: the same name in the repository and in yours are two agents. `usedBy` is the package's by-name, same-place list the delete refusal reads.
- **The app's layer holds the process's telemetry** (`telemetryLayer` in `liveOf`, `app.ts`), so every request says a line
  (`saidRequest`, `src/request/request.ts`) in a test too: a test that reads the lines merges its own `Logger.layer([keeper])` after
  `liveOf()` (`test/request.test.ts`), one that wants silence `Logger.layer([])`.
