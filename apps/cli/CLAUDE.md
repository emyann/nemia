# apps/cli — `nemia` (`wf`, its alias), a client of the api

`nemia` and `wf` as a person types them: the moved reads (`READ_VERBS` in `contracts/route.contract.ts`: `show`, `closeout`, `ls`, the
inbox's read and `watch`) asked of the api serving the store over HTTP, and every other verb, a help, and a read typed with `--local`
run on the orchestrator's own CLI, spawned with the same words (`src/local.ts`). It sits beside the board, above the api: the order is
`web, cli → api → orchestrator → runtime` (`docs/architecture.md`, *The layers*). Which way a command goes is `routeOf`
(`src/route.ts`), a pure decision proved by its contract (`npm run contracts` runs `tsverify apps/cli/src`).

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
- **`decide` and every write stay in process.** The client moves no write and judges nothing; a verb that is not in `READ_VERBS` goes
  to the old path unchanged, and a verb moves by joining `READ_VERBS`, whose laws say the rest
  (`apps/cli/test/route.test.ts` for the two-word names).
- **A refusal is a `Refused` (`src/refused.ts`)**: its words name the command to type next and its `code` is the exit code, 2 for a
  usage refusal; the bin prints the words and exits with the code. A test asserts the code and that a command is named, never the
  sentence.
- **The source is under `noUncheckedIndexedAccess`, and lint refuses a `!`** there, as in the orchestrator and the api. Tests run from
  this folder: `node --test test/<file>`.
