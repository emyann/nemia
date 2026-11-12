# apps/cli — `nemia` (`wf`, its alias), a client of the api

`nemia` and `wf` as a person types them: the moved reads (`READ_VERBS` in `src/route.ts`: `show`, `closeout`, `ls`, the
inbox's read and `watch`) asked of the api serving the store over HTTP, the client's own verbs (`CLIENT_VERBS`: `get`, `apply`,
`explain`, over every kind the api serves, `propose` and `proposals`, `decide`, `channel`, and `server`) asked of it whatever else is typed, the commands
whose words it holds (`MOVED_COMMANDS`, `objects`' `COMMAND_WORDS`) parsed, helped and run here through the api under every context, and
every other verb and a help of one run on the orchestrator's own CLI, spawned with the same words (`src/local.ts`). `--local` is refused,
exit 2 (`routeOf`'s `refused`), naming the command typed without it: `local` is this machine's daemon, reached through its api. It sits beside the board, above the api: the order is
`web, cli → api → orchestrator → runtime` (`docs/architecture.md`, *The layers*). Which way a command goes is `routeOf`
(`src/route.ts`), a pure decision proved by its contract, each verb list spelled once there and read by the code (`npm run contracts` proves it, `apps/cli/src` being one of the roots `tools/contracts/legs.ts` names).

- **It imports the objects by their entry, the api's types, and no other package of ours.** Its source and its bins import no
  `agent-orchestrator`, no `agent-runtime`, no harness SDK and no path into `packages/`; `objects` by its entry alone, never
  `objects/...`; from the api, only `import type` of its client door, `apps/api/src/client/client.ts`, so an answer's shape is the
  api's or the objects' and the client holds no copy of it. A value the client needs is asked of the api over HTTP. Held by
  `apps/cli/test/structure.test.ts` and the cli's block of `.oxlintrc.json` (proven by
  `packages/agent-orchestrator/test/imports.boundary.test.ts`). A bin imports `../src/` and nothing else.
- **Every read is asked through `src/objects.ts`**, `objects`' one typed client of its `Api` (`apiClient`) over the daemon's lease
  url, decoded by the Schemas the api encodes with: `nemia show`'s Run and its record, `nemia closeout`'s tries, `nemia decide`'s
  RunDecision, the pause `nemia watch` says, and the runs and cards lists `nemia ls` and `nemia inbox` ask for their `Table`. **One ask**:
  `served` (`src/daemon.ts`) takes the lease's url where something listens there, else starts the daemon once and waits until `GET
  /api/health` answers, bounded; the read then asks once (`asked`). No read retries after a refused connection.
- **`nemia server upgrade [<tag> | --back]` upgrades the server a context names** (`src/server/upgrade.ts`), as the board's Settings and
  the MCP port's `upgrade` tool do: it reads `GET /api/version` and `GET /api/upgrades`, chooses the release (`upgradeTarget`, proved by
  `contracts/server-upgrade.contract.ts`), posts `POST /api/upgrades`, and follows `GET /api/upgrades/:id/output` through the daemon's
  restart: a stream that closes without `ended` is the daemon going down, waited for (`BACK_WITHIN_MS`) and opened again, its resent
  output printed once. It asks through `askedAcross` (`src/objects.ts`), `asked` with the release check left out, since it is the verb
  that repairs a client/daemon mismatch and talks to a newer daemon on purpose after the restart; the decode still guards it. A test
  shortens the bound through its seams, never waiting out the shipped one. `server` is the daemon a context names; `service` is this
  machine's login unit, a machine verb: the usage keeps the two apart.
- **A list is printed as the server prints it** (`src/reads/table.ts`, fc2e, and `objects`' `tableLines`, the one printer of a
  `Table`, which the api's MCP port prints with too): `nemia ls` and `nemia inbox` ask with `Accept:
  TABLE_ACCEPT` and print the `Table`'s columns of priority 0 (every one with `-o wide`, `Labels` with `--show-labels`, a column per
  `-L <key>` off each row's object), kubectl's way. The client keeps no printer of a list but the lines `nemia ls` says around
  the runs' Table, from server reads that serve no Table: the pause first, how old where the branches stand is (`Daemon.branchesLine`), a
  line per schedule and the daemon's last (`src/reads/standing.ts`). `nemia ls <run>`, which no server table prints yet, goes to the old path on this machine's context;
  under a remote one it is refused, exit 2, naming `nemia show <run>` (`oneRunAway`): forwarded, the old path would print the Run
  `GET /api/runs/:name` answers with its in-process listing's printer.
- **Which daemon, in `src/context.ts`**: kubectl's contexts, the client's own config (`${XDG_CONFIG_HOME:-~/.config}/nemia/config.yaml`,
  0600) written by `nemia config`, and `NEMIA_CONTEXT` for one command, judged by `contextOf` (`contracts/context.contract.ts`). Under a
  remote context a read asks its server with its token and nothing reads this machine's store or starts a daemon; `routeOf` forwards a
  verb about the store only the old path has (`forwarded`), and `handedOn` (`src/local.ts`) the words a moved read hands on: the old path
  spawned with `forwardedEnv(chosen)` (`src/where.ts`, the one file that spells the store's variable), the context's server and token
  in `NEMIA_SERVER` and `NEMIA_SERVER_TOKEN` (never on argv; the orchestrator's `FORWARD_VARIABLES`, spelled once there, since `src`
  imports nothing of it) and no `WF_ROOT`, so it calls that daemon's endpoints and refuses in its own words a command none serves. A machine verb (`MACHINE_VERBS`:
  `service`, `upgrade`, `up`, `tick`, `version`, `token`, `claude-token`, and `template`, `frontmatter`, `admit`, which touch this
  machine's files and no store) runs here whatever the context (`nemia upgrade` upgrades this machine's install under a remote one
  too, then names `nemia server upgrade` on stderr, `serverHint`), but for `template export --factory`, which reads a factory from the
  store in process: under a remote context `main` refuses it, naming `NEMIA_CONTEXT=local` (`factoryNotHere`).
  On a store marked exposed, its own machine's reads present the token kept for `local` (`nemia config set-context local --token-file
  <file>`, `local-token` in the file, `chosenToken`).
  `ambient()` drops `NEMIA_CONTEXT` and `XDG_CONFIG_HOME`, so no test asks the daemon a person's config names.
- **A command whose words the client holds is run under `src/commands/`** (`commanded.ts`): parsed by `objects`' `parseArgv` against
  its `COMMAND_WORDS` spec, its help printed from those words, a `CommandRefused` a `Refused`, exit 2. The person's files are read here
  (`files.ts`: a folder's regular files directly in it, a link refused by name, a subfolder not read), read into the kind's spec by the
  api (`workflows.read`, `agents.read`, `skills.read`, which write nothing: the client never parses a definition's frontmatter), and
  written through `create` or `replace` in `default`, the board's one write path; on `factory`, proposed to `--factory` through the call
  `nemia propose` makes (`proposalMade`), since a factory's own definitions change by a proposal. A command moves by joining
  `COMMAND_WORDS`, and its old path's runner is deleted with the move.
- **A client and a daemon of two releases are refused** (`src/release.ts`, `releaseMet`, proved by `contracts/release.contract.ts`): the
  client's release is its install's `release.json` `tag`, the daemon's `GET /api/health`'s `release`, either null for a checkout;
  `served` refuses one that `differs`, exit 2, naming `nemia version`. One `unsaid` is let through, and the decode guards it: an answer
  that does not decode by its `Api` Schema is refused in `answerOf`, exit 2, naming the verb, both releases as known (`servedWith` hands
  the daemon's on) and `nemia version` (`undecoded`, `src/objects.ts`), never a JavaScript error.
- **No file of `src` imports a value of `contracts/`**: a contract loads the verifier, which an archive does not carry. The verb lists
  live in `src/route.ts` and the contract imports them (`tools/guards/test/no-contract-values.test.ts`).
- **One store fact, in `src/where.ts`**: the store's root (`WF_ROOT`, else `~/.agent-workflows`) and the `url` its lease holds
  (`daemon.json`), read only under this machine's context, and `forwardedEnv`, which drops `WF_ROOT` from a forwarded CLI's
  environment. No other file of `src` spells a store path or reads a file of the store: what it shows comes from the api.
- **One process, in `src/local.ts`**: the orchestrator's CLI entries, `agent-orchestrator/bin` and `/bin/wf`, resolved and spawned with
  this process's stdio and environment, never imported (`binBreaches` in `packages/agent-orchestrator/test/contract.test.ts`); no
  other file imports `node:child_process`. A daemon started on demand (`src/daemon.ts`) starts through it. `agent-orchestrator` is in
  `dependencies` for that resolve alone.
- **The feed's stream is followed under `src/watch/` alone**: no other file names `/api/feed/stream` or an `EventSource`. `nemia watch`
  prints its lines; `nemia channel` (`src/watch/channel.ts`, a verb of `CLIENT_VERBS`) pushes them into a Claude Code session as its
  notifications, a stdio MCP server Claude Code spawns. Its notifications are `objects`' Events, read off the Event list's watch
  (`?watch=true&resourceVersion=`), each by `channelNotice` (proved by `contracts/channel-notice.contract.ts`), and its Claude Code words
  (`claude/channel`, the notification's method, the instructions) stay in that file: no other file of the repository's layers says them
  (`packages/agent-orchestrator/test/words.test.ts`). Its stdout is the MCP connection: it prints nothing there but its help.
- **The printers it still has hold parity with the in-process reads until those retire**: `nemia show`, `nemia closeout` and `nemia
  watch`'s lines (`src/watch/lines.ts`: the feed has no server table) print what the old path prints for the same store, line for line,
  and their tests compare the two. A change to one of those outputs on either side changes both.
- **`nemia decide` is a verb of the client's own** (`src/objects/decide.ts`, the untangle intent's Q14): it prints the screen of the
  api's one decide read model and, at a terminal, runs the `nemia` command a person picks as this client runs it; a `git` command it
  prints and never runs. **Every write but `apply`, the proposals' and the moved commands' stays on the old path.** The client judges nothing, and moves `nemia apply -f`
  (`src/objects/apply.ts`, resource-objects' decision 5), which writes each object a file holds through the typed client as its kind
  takes it (`applyOf`, proved by `contracts/apply.contract.ts`), and `nemia propose` and `nemia proposals approve|decline`
  (`src/objects/propose.ts`), which ask the api to make and judge a proposal; the api judges who may. A verb in neither `READ_VERBS` nor `CLIENT_VERBS` goes to the old path
  unchanged, and a verb moves by joining one of them, whose laws say the rest. A command's name is the longest of `MOVED_COMMANDS` its words
  open with, else its first word (`nameOf`): a moved read
  typed with words it does not read (`inbox rm <card>`) hands them to the old path itself (`apps/cli/test/route.test.ts`).
- **The client's own verbs, `get`, `apply` and `explain`, call each kind through `KIND_CALLS`** (`src/objects/kinds.ts`), a table total
  over `objects`' `KINDS`: a kind added to the package fails the typecheck here until it is mapped. Each says its own `--help`. A word names a resource by discovery (`GET /api`,
  `resourceNamed`), and `explain` reads the fields off `OpenApi.fromApi(Api)`, the document the api serves, computed here. YAML is read
  and written with `yaml`.
- **Every request carries the session's token** where `WF_SESSION_TOKEN` is set and not empty, as `Authorization: Bearer <token>`
  (`callerToken` and `sessionHeaders`, `src/client.ts`), on the typed client, the readiness probe and the feed's stream alike; none is
  the person.
  A 403 `Forbidden` or a 401 `Unauthorized` of the api is its refusal in its words, exit 2, as `Invalid` is; a `Conflict` (a stale
  version) exits 1.
- **A refusal is a `Refused` (`src/refused.ts`)**: its words name the command to type next and its `code` is the exit code, 2 for a
  usage refusal; the bin prints the words and exits with the code. A test asserts the code and that a command is named, never the
  sentence.
- **A bin ends through `exited` (`src/exited.ts`)**, which exits with the code once stdout and stderr have drained: a bare
  `process.exit` drops what a pipe has not taken yet, past its 64 KiB (`apps/cli/test/pipe.test.ts`). `nemia watch` stopped by a
  signal answers its code to the bin rather than exiting itself.
- **The source is under `noUncheckedIndexedAccess`, and lint refuses a `!`** there, as in the orchestrator and the api. Tests run from
  this folder: `node --test test/<file>`.
