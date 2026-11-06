# apps/cli — `nemia` (`wf`, its alias), a client of the api

`nemia` and `wf` as a person types them: the moved reads (`READ_VERBS` in `contracts/route.contract.ts`: `show`, `closeout`, `ls`, the
inbox's read and `watch`) asked of the api serving the store over HTTP, the client's own verbs (`CLIENT_VERBS`: `get`, `apply`,
`explain`, over every kind the api serves) asked of it whatever else is typed, and every other verb, a help, and a read typed with `--local`
run on the orchestrator's own CLI, spawned with the same words (`src/local.ts`). It sits beside the board, above the api: the order is
`web, cli → api → orchestrator → runtime` (`docs/architecture.md`, *The layers*). Which way a command goes is `routeOf`
(`src/route.ts`), a pure decision proved by its contract (`npm run contracts` proves it, `apps/cli/src` being one of the roots `tools/contracts/legs.ts` names).

- **It imports the objects by their entry, the api's types, and no other package of ours.** Its source and its bins import no
  `agent-orchestrator`, no `agent-runtime`, no harness SDK and no path into `packages/`; `objects` by its entry alone, never
  `objects/...`; from the api, only `import type` of its client door, `apps/api/src/client/client.ts`, so an answer's shape is the
  api's or the objects' and the client holds no copy of it. A value the client needs is asked of the api over HTTP. Held by
  `apps/cli/test/structure.test.ts` and the cli's block of `.oxlintrc.json` (proven by
  `packages/agent-orchestrator/test/imports.boundary.test.ts`). A bin imports `../src/` and nothing else.
- **A kind of `objects` is read through `src/objects.ts`**, `objects`' `Api` made a typed client (`HttpApiClient.make`) over the
  daemon's lease url: `nemia show`'s Run, `nemia closeout`'s tries and `nemia inbox`'s CardList and FactoryList, decoded by the Schemas the api
  encodes with. A read of a kind `objects` does not hold yet is a GET of `src/client.ts`, typed by the client door; a kind that moves
  into `objects` leaves the door and moves onto `src/objects.ts`. The printers map an object to the row they read in one place (`rowOf`
  for the inbox), and work out here what the object does not carry (a queued card's place, the in-play states).
- **One store fact, in `src/where.ts`**: the store's root (`WF_ROOT`, else `~/.agent-workflows`) and the `url` its lease holds
  (`daemon.json`). No other file of `src` spells a store path or reads a file of the store: what it shows comes from the api.
- **One process, in `src/local.ts`**: the orchestrator's CLI entries, `agent-orchestrator/bin` and `/bin/wf`, resolved and spawned with
  this process's stdio and environment, never imported (`binBreaches` in `packages/agent-orchestrator/test/contract.test.ts`); no
  other file imports `node:child_process`. A daemon started on demand (`src/daemon.ts`) starts through it. `agent-orchestrator` is in
  `dependencies` for that resolve alone.
- **The feed's stream is followed under `src/watch/` alone**: no other file names `/api/feed/stream` or an `EventSource`.
- **Its printers hold parity with the in-process reads until those retire**: a moved read prints what the old path prints for the same
  store, line for line, and the tests beside the printers compare the two. A change to a read's output on either side changes both.
- **`decide` and every write but `apply` stay in process.** The client judges nothing, and moves one write: `nemia apply -f`
  (`src/objects/apply.ts`, resource-objects' decision 5), which writes each object a file holds through the typed client as its kind
  takes it (`applyOf`, proved by `contracts/apply.contract.ts`). A verb in neither `READ_VERBS` nor `CLIENT_VERBS` goes to the old path
  unchanged, and a verb moves by joining one of them, whose laws say the rest (`apps/cli/test/route.test.ts` for the two-word names).
- **The client's own verbs, `get`, `apply` and `explain`, call each kind through `KIND_CALLS`** (`src/objects/kinds.ts`), a table total
  over `objects`' `KINDS`: a kind added to the package fails the typecheck here until it is mapped. Each says its own `--help` and
  refuses `--local`, naming `nemia service status`: no process has them. A word names a resource by discovery (`GET /api`,
  `resourceNamed`), and `explain` reads the fields off `OpenApi.fromApi(Api)`, the document the api serves, computed here. YAML is read
  and written with `yaml`.
- **A refusal is a `Refused` (`src/refused.ts`)**: its words name the command to type next and its `code` is the exit code, 2 for a
  usage refusal; the bin prints the words and exits with the code. A test asserts the code and that a command is named, never the
  sentence.
- **The source is under `noUncheckedIndexedAccess`, and lint refuses a `!`** there, as in the orchestrator and the api. Tests run from
  this folder: `node --test test/<file>`.
