# apps/cli — `nemia` (`wf`, its alias), a client of the api

`nemia` and `wf` as a person types them: the moved reads (`READ_VERBS` in `contracts/route.contract.ts`: `show`, `closeout`, `ls`, the
inbox's read and `watch`) asked of the api serving the store over HTTP, the client's own verbs (`CLIENT_VERBS`: `get`, `apply`,
`explain`, over every kind the api serves, `propose` and `proposals`, and `decide`) asked of it whatever else is typed, and every other verb, a help, and a read typed with `--local`
run on the orchestrator's own CLI, spawned with the same words (`src/local.ts`). It sits beside the board, above the api: the order is
`web, cli → api → orchestrator → runtime` (`docs/architecture.md`, *The layers*). Which way a command goes is `routeOf`
(`src/route.ts`), a pure decision proved by its contract, each verb list spelled once there and read by the code (`npm run contracts` proves it, `apps/cli/src` being one of the roots `tools/contracts/legs.ts` names).

- **It imports the objects by their entry, the api's types, and no other package of ours.** Its source and its bins import no
  `agent-orchestrator`, no `agent-runtime`, no harness SDK and no path into `packages/`; `objects` by its entry alone, never
  `objects/...`; from the api, only `import type` of its client door, `apps/api/src/client/client.ts`, so an answer's shape is the
  api's or the objects' and the client holds no copy of it. A value the client needs is asked of the api over HTTP. Held by
  `apps/cli/test/structure.test.ts` and the cli's block of `.oxlintrc.json` (proven by
  `packages/agent-orchestrator/test/imports.boundary.test.ts`). A bin imports `../src/` and nothing else.
- **Every read is asked through `src/objects.ts`**, `objects`' `Api` made a typed client (`HttpApiClient.make`) over the daemon's lease
  url, decoded by the Schemas the api encodes with: `nemia show`'s Run and its record, `nemia closeout`'s tries, `nemia decide`'s
  RunDecision, the pause `nemia watch` says, and the runs and cards lists `nemia ls` and `nemia inbox` ask for their `Table`. **One ask**:
  `served` (`src/daemon.ts`) takes the lease's url where something listens there, else starts the daemon once and waits until `GET
  /api/health` answers, bounded; the read then asks once (`asked`). No read retries after a refused connection.
- **A list is printed as the server prints it** (`src/reads/table.ts`, fc2e): `nemia ls` and `nemia inbox` ask with `Accept:
  TABLE_ACCEPT` and print the `Table`'s columns of priority 0 (every one with `-o wide`, `Labels` with `--show-labels`, a column per
  `-L <key>` off each row's object), kubectl's way. The client keeps no printer of a list but the lines `nemia ls` says around
  the runs' Table, from server reads that serve no Table: the pause first, how old where the branches stand is (`Daemon.branchesLine`), a
  line per schedule and the daemon's last (`src/reads/standing.ts`). `nemia ls <run>`, which no server table prints yet, goes to the old path.
- **One store fact, in `src/where.ts`**: the store's root (`WF_ROOT`, else `~/.agent-workflows`) and the `url` its lease holds
  (`daemon.json`). No other file of `src` spells a store path or reads a file of the store: what it shows comes from the api.
- **One process, in `src/local.ts`**: the orchestrator's CLI entries, `agent-orchestrator/bin` and `/bin/wf`, resolved and spawned with
  this process's stdio and environment, never imported (`binBreaches` in `packages/agent-orchestrator/test/contract.test.ts`); no
  other file imports `node:child_process`. A daemon started on demand (`src/daemon.ts`) starts through it. `agent-orchestrator` is in
  `dependencies` for that resolve alone.
- **The feed's stream is followed under `src/watch/` alone**: no other file names `/api/feed/stream` or an `EventSource`.
- **The printers it still has hold parity with the in-process reads until those retire**: `nemia show`, `nemia closeout` and `nemia
  watch`'s lines (`src/watch/lines.ts`: the feed has no server table) print what the old path prints for the same store, line for line,
  and their tests compare the two. A change to one of those outputs on either side changes both.
- **`nemia decide` is a verb of the client's own** (`src/objects/decide.ts`, the untangle intent's Q14): it prints the screen of the
  api's one decide read model and, at a terminal, runs the `nemia` command a person picks as this client runs it; a `git` command it
  prints and never runs. **Every write but `apply` and the proposals' stays in process.** The client judges nothing, and moves `nemia apply -f`
  (`src/objects/apply.ts`, resource-objects' decision 5), which writes each object a file holds through the typed client as its kind
  takes it (`applyOf`, proved by `contracts/apply.contract.ts`), and `nemia propose` and `nemia proposals approve|decline`
  (`src/objects/propose.ts`), which ask the api to make and judge a proposal; the api judges who may. A verb in neither `READ_VERBS` nor `CLIENT_VERBS` goes to the old path
  unchanged, and a verb moves by joining one of them, whose laws say the rest. A command's name is its first word (`nameOf`): a moved read
  typed with words it does not read (`inbox rm <card>`) hands them to the old path itself (`apps/cli/test/route.test.ts`).
- **The client's own verbs, `get`, `apply` and `explain`, call each kind through `KIND_CALLS`** (`src/objects/kinds.ts`), a table total
  over `objects`' `KINDS`: a kind added to the package fails the typecheck here until it is mapped. Each says its own `--help` and
  refuses `--local`, naming `nemia service status`: no process has them. A word names a resource by discovery (`GET /api`,
  `resourceNamed`), and `explain` reads the fields off `OpenApi.fromApi(Api)`, the document the api serves, computed here. YAML is read
  and written with `yaml`.
- **Every request carries the session's token** where `WF_SESSION_TOKEN` is set and not empty, as `Authorization: Bearer <token>`
  (`sessionHeaders`, `src/client.ts`), on the typed client, the readiness probe and the feed's stream alike; none is the person.
  A 403 `Forbidden` or a 401 `Unauthorized` of the api is its refusal in its words, exit 2, as `Invalid` is.
- **A refusal is a `Refused` (`src/refused.ts`)**: its words name the command to type next and its `code` is the exit code, 2 for a
  usage refusal; the bin prints the words and exits with the code. A test asserts the code and that a command is named, never the
  sentence.
- **A bin ends through `exited` (`src/exited.ts`)**, which exits with the code once stdout and stderr have drained: a bare
  `process.exit` drops what a pipe has not taken yet, past its 64 KiB (`apps/cli/test/pipe.test.ts`). `nemia watch` stopped by a
  signal answers its code to the bin rather than exiting itself.
- **The source is under `noUncheckedIndexedAccess`, and lint refuses a `!`** there, as in the orchestrator and the api. Tests run from
  this folder: `node --test test/<file>`.
