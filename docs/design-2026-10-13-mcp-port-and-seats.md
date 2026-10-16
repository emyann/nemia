# Design discussion, 2026-10-13: an MCP port, Nemia in two seats, and a store off the machine

**Status: a vision discussion, to be refined.** Not a spec, not a plan, and nothing is filed from it. It records what the owner
and the operator session worked out on 2026-10-13 from a ChatGPT thread the owner shared ("MCP Events Overview",
https://chatgpt.com/share/6aceca0d-afe0-83ea-b050-4d997f20a308), the code at `06ad3548`, and the Claude Code and MCP documentation
read that day. Where it says "decided", the owner said so in the discussion; everything else is the session's reading, for the
owner to refine, cut or overturn before anything becomes an intake card. The three lines marked *decided* are the only ones.

What it is for: catching up on this discussion later without re-reading the code. Section 2 is the facts, each with the file that
holds it; sections 5 to 9 are the thinking.

## 1. The ask, in the owner's words

Three ways to interact with Nemia today: the CLI, the api, the board. Add a fourth, MCP, so a coding agent (Claude Code, Codex, any
other) operates the system through tools with descriptions, beside skills that say how; the way Nemia, the system agent, operates it.
Two use cases: the whole system on a VPS, piloted from a laptop over MCP; and a person installing it on their own machine and using
it over MCP. The ChatGPT thread was about watching events; the question here is the whole surface, every verb of the CLI and the api:
feasible or not, and the gaps.

Refined later in the same discussion into a product shape (section 5) and an incremental plan (section 7).

## 2. What exists today

### 2.1 One command table, served on two sides

Every verb is one entry of a table, said as data (`packages/agent-orchestrator/src/command/command.ts`, `CommandSpec`; the entries in
`src/command/commands.verb.ts`, `COMMANDS` and `TABLE`; the two shapes in `src/command/entry.verb.ts`, `Command` and `Ran`):

- `name`, `usage`, `help` lines and often a `manual`, as `nemia --help` prints them;
- `spec`: positionals (`required`, `optional`, `rest`, `many`; kind `name` or `text`) and flags (`switch`, `name`, `text`, `amount`;
  `key`, `sets`, `way`, `many`, and `only: { side: 'cli' | 'api' }` for a flag one side alone takes);
- `check`, the refusal of the arguments before anything is read, the same on both sides;
- `writes`, and `nemia`, the command's class (`src/admission/class.ts`, `CommandClass`): `read`, `hers`, `prompts`, `answers`, `out`,
  or `{ bare: 'read', sets: 'prompts', setsBy, readsBy }` for a verb that reads bare and writes given some words;
- `route`, where the api serves it (method, path, status, `sets`, or `hand` where the api serves it by a route of its own), or `only`;
- `apiTakes`, keys of a body the api folds into the arguments; `ticks`, that the command starts the daemon where none ticks;
  `asksAlways`, asked of the person every time (a `prompts` verb under `nemia auto` alone);
- `handler(args, env, home, kept)`: one Effect over `EngineService` and `PlaceService`, answering data, never lines; `print(data, args)`,
  the CLI's lines; `apiKeys`, what the api answers of the data; `apiRefusal`, data that did nothing thrown as a refusal on the api.

The CLI parses, refuses and helps from the spec (`src/cli/main.ts`, `RUNS` for the four it runs itself). The api generates its write
routes from the same entries (`apps/api/src/commands/routes.ts`, `routesOf(COMMANDS)`): `bodySchema` derives a body's schema from the
spec, `WORDS` (`words.ts`) gives each route its guard and refusal words, `EXTENSIONS` (`extend.ts`) what the api does beyond the
handler, and `wordBreaks` refuses a routed entry with no words. Reads and `hand` routes are the api's own, each calling the entry's
handler. Nemia's `verbs` skill is generated from the same table by class (`src/nemia/verbs.verb.ts`, `REGENERATE`), held by
`test/verbs-skill.test.ts`.

Counted on 2026-10-13 (a script over `TABLE`):

| Fact | Value |
|---|---|
| Entries | 97 |
| By class: read / hers / prompts / answers / out / read-bare-sets | 41 / 14 / 32 / 4 / 2 / 4 |
| Served on the api | 66 |
| CLI-only | 31 |

The 31 CLI-only: `plan`, `factory ls`, `factory add`, `factory apply`, `factory plan`, `factory upgrade`, `factory resolve`,
`factory attach`, `factory detach`, `factory trust`, `factory rm`, `template check`, `template export`, `template pack`,
`template unpack`, `ls`, `show`, `feed`, `merges`, `auto propose`, `service install`, `service uninstall`, `service status`,
`service restart`, `upgrade`, `version`, `cancel`, and the four the CLI runs itself, `tick`, `up`, `watch`, `admit`. Most are
machine-local by nature (paths, the process, the install); `cancel`, `ls`, `show`, `feed`, the factory's attach, detach, trust and
rm, and `auto propose` are plain gaps on the HTTP side.

Reads the api serves that are no entry of the table: `/api/capabilities`, `/api/machines`, `/api/quota`, `/api/daemon`,
`/api/health`, `/api/version`, `/api/repository`, `/api/metrics`, `/api/workflows/keys`, and two server-sent streams,
`/api/feed/stream` and `/api/runs/:id/steps/:step/transcript/stream` (`apps/api/src/app.ts` mounts each folder's face).

A request's repository and factory are resolved in `served` from `?repo=` and `?factory=` (`apps/api/src/factories/place.ts`,
`placeFor`), and the api serves no repository but its own and a factory's.

### 2.2 Reach

The api listens on `127.0.0.1` alone, by design, with no authentication (`apps/api/src/port.ts`, `HOST`; `PORT` 8787, or 8788 with
`--no-tick`). Writes are refused before their body is read unless the `Host` is loopback, `Sec-Fetch-Site` is absent or
`same-origin`, and the content type is JSON (`apps/api/src/guard.ts`, `refusedBeforeReading`): a browser threat model. The api
process is the store's daemon unless started `--no-tick` (`apps/api/src/main.ts`; `nemia up` is the same daemon with no board). The
board is the web's own server, `vite preview` proxying `/api` to 8787; the api serves no static file.

Reaching the system from elsewhere today is Claude Code's Remote Control on Nemia's session and on a supervisor step (`remote: true`,
`slot: none`, the orchestrator README *A supervisor*): it reaches the agent, not the api. `features.md`: "A phone. The gate is a form
on a page served on this machine, and Remote Control is what reaches it from elsewhere."

The `nemia` command reads the store from disk (`WF_ROOT`), so it cannot drive a store on another machine.

### 2.3 Following the store

- **The feed**: `$WF_ROOT/feed.jsonl`, one JSON line per change of a run's or a step's word, written by the daemon alone
  (`src/feed/feed.verb.ts`, `emitFeed`), published to the process's hub (`FeedHub`, a sliding `PubSub`). Its cursor is a byte offset
  that never expires; a cursor inside a line is refused by name (`feedCursorRefusal`).
- **A read that ends**: `nemia watch --once [cursor]`, CLI-only.
- **A read that never ends**: `nemia watch` (`src/cli/main.ts`, `watching`, over `watchFeed`), with `-l`, `--cursor-file`, `--json`,
  `--wake`, `--wake-word`, and the store's liveness beside it (`livenessLines`, read every 2 s). It is a subscribe, not an await.
- **The api's stream**: `GET /api/feed/stream` (`apps/api/src/factory/feed.ts`), server-sent events over the live reader
  `followFeed` (hub items, and the file for what the hub dropped), each event's id the cursor after its line, so an EventSource
  resumes with `Last-Event-ID`.
- **Subscriptions, the activation path**: `nemia subscribe <name> <task>` (`src/subscription/subscription.verb.ts`, also
  `POST /api/subscriptions/:name`) and the daemon's deliverer (`src/subscription/deliver.verb.ts`): the feed followed per
  subscription, wake lines said to the long-lived task at once through the runtime's `say`, routine lines folded into a digest, the
  cursor moved only once the `say` resolved. A floor (`--at-least`) keeps lines of factories below it out.
- **No `wait` verb**: `src/wait/` is `nemia hold`, a run held until other runs ship. Nothing blocks until a run or a step reaches a
  state.

### 2.4 Admission and the fence

Nemia's task carries `callAdmission: { command: ['nemia', 'admit', '--at-least', 'semi-auto', '--auto', 'nemia'], tools: ['Bash'] }`
(`src/nemia/keep.verb.ts`): the runtime's hook runs it before each Bash call (`packages/agent-runtime/src/harness/admission.ts`;
`AdmissionCall` is `{ tool, input, cwd }`, `AdmissionAnswer` is allow, ask or deny with a reason; a tool's name may be an MCP tool's
full name). `admissionOf` (`src/admission/admission.ts`) parses the shell line to find each `nemia <verb>` typed and the runs and
factories it names (`typedIn`, `namedIn`), then decides from the class, the factory's level and the run's state (`Scope`, the
person's confirmed rules for `auto`). Her fence is derived from the classes (`nemiaFence`), as `Bash(nemia <verb>:*)` rules. The
`tools` list of an admission takes exact names, no glob.

### 2.5 MCP in the workspace today

- **The api is an MCP client, in one place, for one page.** `apps/api/src/capabilities/capabilities.ts` serves the Capabilities page:
  it reads a repository's `.mcp.json` and `.claude/settings.json`, and for each declared server that is stdio and enabled
  (`enabledMcpjsonServers`, `enableAllProjectMcpServers`, not `disabledMcpjsonServers`) starts it in the repository with `${VAR}`
  expanded, connects with the SDK's `Client` (named `nemia-api`) over `StdioClientTransport`, pages `tools/list`, and stops it
  (`serverAsk`; 15 s; once per app per server, `McpAsker`; a failure quotes the fix and the last 20 lines of stderr). URL servers are
  not asked. It then matches each tool against the deny, ask and allow rules (`reach.ts`, counted below the api's layer in
  `apps/api/test/kinds.test.ts`, `MOVES`). This is the workspace's only import of `@modelcontextprotocol/sdk` (`apps/api/package.json`,
  `^1.30.0`). The owner's intent for the page: the MCP servers a repository offers, listed as a composable object beside its skills and
  agents; discoverability, which may find a better shape later.
- **The runtime hands a session its servers, and nothing else may.** A task's `checkoutMcp` names servers of its checkout's
  `.mcp.json`; `mcp` is a map of servers, stdio `{ command, args, env }` or `{ type: http | sse, url, headers }`, refused by shape
  (`packages/agent-runtime/src/harness/mcp.ts`, `mcpRefuses`). `sessionMcp` merges them, `writeMcpConfig` writes a per-task file (mode
  0600, removed when empty), and every Claude session is spawned with the checkout's file and that file under `--mcp-config`, then
  `--strict-mcp-config` and `--no-chrome`, always (`claudeMcpArgs`; `harness/claude/bg.ts`, `code.ts`, `harness/detached/detached.ts`).
  Strict, because a background step once loaded the operator's user-scope servers and claude.ai connectors (the runtime's
  `docs/open-issues.md`, issue 9); `--no-chrome`, because Claude in Chrome is switched on by a user setting and connects even under
  strict. Codex gets the task's map as one `-c mcp_servers=...` override (`harness/codex/codex.ts`, `codexMcpServers`); it reads no
  `.mcp.json`. Measured: `--tools` does not narrow a server's tools; a tool denied bare by `mcp__<server>__<tool>` is absent from the
  session; a deny with a parameter glob holds (the runtime's `CLAUDE.md`, *Claude Code, as a harness*).
- **The orchestrator sets the names only.** An agent file's `mcp:` names servers of the checkout's `.mcp.json`; a step's own `mcp:`
  line adds to its agent's (`src/workflow/step-file.ts`, `sessionServers`); a step with no agent loads none, an agent frozen before the
  key existed loads the whole file (`src/filed/filed.ts`, `checkoutMcpOf`); a remote A2A step is refused the key (`src/keys/keys.ts`,
  `serversRefusal`). The orchestrator never builds the `mcp` map, so a server reaches a session only through a repository's
  `.mcp.json`. This checkout's declares one, `playwright`, enabled in `.claude/settings.json`.
- **No server of Nemia's.** Nothing in the workspace answers `tools/list` as Nemia. An agent reaches her as a process: `nemia`
  through Bash under the admission hook, or the HTTP routes by hand. Nemia's own task names no server: her cwd is her folder in the
  store, which has no `.mcp.json`, and she is spawned strict, so her session has zero MCP servers.

### 2.6 Nemia's seat today

Her shipped folder is `packages/agent-orchestrator/nemia/`: `nemia.md` (role Operator, `permissionMode: auto`, a deny list naming
`SendMessage`, the crons, `RemoteTrigger`, the pushes and merges, `pkill`, `Bash(wf:*)`, `Bash(ae:*)` and the unsafe browser tool)
and nine skills (`bring-what-waits`, `commission-a-workflow`, `create-a-factory`, `first-meeting`, `grant-access`, `recap`,
`recruit-or-create`, `verbs`, `write-a-card`). `test/nemia-shipped.test.ts` holds that it names nothing of this repository. The keeper
(`src/nemia/keep.verb.ts`) files her as a long-lived task (`restartPolicy: 'Always'`, `background: true`, Remote Control on) while any
factory is above `manual`, with every factory's folders mounted read-only, her memory writable, the daemon's own `nemia` first on her
PATH, her subscription under the name `nemia`, and the admission above. Levels: `manual`, `semi-auto`, `auto`, per factory
(`docs/architecture.md`, *Levels*).

Today the owner runs with Nemia off and operates the factory from a Claude Code session in the checkout, which uses the CLI; a
Monitor on `nemia watch` is how that session is woken (the ChatGPT thread's third exchange).

## 3. External facts, verified 2026-10-13

Read from code.claude.com/docs (mcp, cli-reference, permissions, hooks, headless, tools-reference, channels) and
modelcontextprotocol.io (the 2026-07-28 changelog and the tasks extension) by a documentation agent; each is a doc's claim, not a
measurement on a Claude Code version.

- **MCP 2026-07-28**: `resources/subscribe` and `resources/unsubscribe` are replaced by `subscriptions/listen`, one long-lived stream a
  client opts into per notification type; `initialize`, `Mcp-Session-Id`, `ping` and `logging/setLevel` are gone (stateless,
  per-request `_meta`); `server/discover` is added; tasks move to the extension `io.modelcontextprotocol/tasks` with `tasks/get`
  polling, `tasks/update`, `tasks/cancel`. So the ChatGPT thread's claim about `subscriptions/listen` is right; that the final
  shipped on that exact date was not confirmed from an official page.
- **Claude Code's client**: `claude mcp add --transport http <name> <url> --header "Authorization: Bearer ..."`; `${VAR}` and
  `${VAR:-default}` expand in `url`, `headers`, `command`, `args`, `env`; OAuth per server (`/mcp`, `claude mcp login`). Scopes local,
  project (`.mcp.json`), user; `--mcp-config` with `--strict-mcp-config`; `--bare` skips discovery.
- **Primitives**: tools as `mcp__<server>__<tool>` (plugin-bundled: `mcp__plugin_<plugin>_<server>__<tool>`); since 2.1.x MCP tools are
  deferred behind tool search by default, a server opts out with `alwaysLoad` and a tool with `_meta["anthropic/alwaysLoad"]`;
  resources as `@server:uri` and the list and read tools; prompts as slash commands; `notifications/tools/list_changed` honoured;
  elicitation supported (form and URL), with `Elicitation` hooks. **Resource subscriptions and `notifications/resources/updated`
  are not documented.** The only documented push into a running session is channels (research preview, a startup flag, claude.ai or
  Console auth, not on the v2 runtime with the 2026-07-28 negotiation).
- **Long calls**: a tool call still running after two minutes moves to a background task and its result arrives as a task
  notification that wakes the model (2.1.212+); the per-call timeout is about 28 hours unless `MCP_TOOL_TIMEOUT` or a server's
  `timeout` says otherwise; the idle timeout for HTTP is five minutes (`CLAUDE_CODE_MCP_TOOL_IDLE_TIMEOUT`), reset by progress
  notifications. A tool result is capped at 25,000 tokens (`MAX_MCP_OUTPUT_TOKENS`; a tool may raise its own cap with
  `_meta["anthropic/maxResultSizeChars"]`).
- **Permissions and hooks**: rules name `mcp__<server>`, `mcp__<server>__*` or one tool; a glob is valid only after a literal
  `mcp__<server>__` prefix; a rule with parentheses on an `mcp__` name is skipped; a server marks a tool as always needing a person
  with `_meta["anthropic/requiresUserInteraction"]`. `PreToolUse` sees MCP tools, with `tool_name` and `tool_input`, and answers
  allow, deny, ask or defer.
- **Waking a session**: the Monitor tool feeds each line of a background watch back to the model (default 5 min, max 30, 10 under
  `-p`); `run_in_background` under `-p` waits and takes one more turn with the outcome. `claude mcp serve` exposes Claude Code's own
  tools as a stdio server.

## 4. The ChatGPT thread, and what the code answers

Its points: MCP has protocol notifications, not an event bus; "notifications are hints, state is truth"; subscribe, then read, then
reconcile, with periodic resync; expose get, watch and wait as resources, subscriptions and a bounded `wait` tool; a host may never
surface a notification to the model, so `wait` is the universal fallback and native subscriptions an optimisation; think in three
harness tiers (native notifications, background process monitoring, synchronous tool calls only) over one observer abstraction;
keep observation apart from activation. Its two questions:

- *Watch an execution, or a broader scope?* The store, every run of every factory, filtered by wake words and by a floor.
- *Does the watch end?* No; the feed read from a cursor is the read that ends, and a subscription is the activation.

Where the code is stronger than the thread assumed: the feed is a cursor-addressed log, so the race it warns about is solved by
reading state plus a cursor and waiting from the cursor; the one watch abstraction already exists (`followFeed`); the unit is a run or
a step, not a task. Where the thread is right and matters: no documented push into Claude Code from a resource, so build the `wait`.

## 5. The vision, restated

One system, wherever it runs: a store, its daemon, the api, and `claude` signed in beside them. On a laptop today; on a VPS for a
power user who hit the wall (memory, storage: 453 worktrees and 143 GB at one point, the retention card `jwss`); in a per-account
container or micro VM for a person who only wants a board and an agent to talk to, on a subscription. One store takes one daemon, so
a tenant is one VM, and "infrastructure handled for them" is the same install, provisioned.

Two seats for the same agent:

- **Inside**: Nemia as the keeper files her (section 2.6): instruction, skills, fence from the classes, memory, subscription, admission
  by level, Remote Control for the phone.
- **Outside**: a person's own Claude Code or Codex session given the same instruction and skills, and the MCP port. What differs is who
  hosts the session and how it is woken. The concrete artifact is a plugin, generated from the same `nemia/` folder: an agent, skills
  and an MCP server entry pointing at a store's URL and token. Frictionless then means: install the plugin, paste the URL. No clone.

Two audiences, one shape: the power user adds the outside seat through the port; the other audience uses the board and the inside
seat. The owner's current mode (level `manual`, a Claude session operating from the terminal) is the outside seat before the port
exists; at `semi-auto` both seats run, she brings gates to the phone, the person steers from the terminal.

Prior art the discussion leaned on: Kubernetes (`kubectl` outside, an operator inside, one API server, a service account and a token,
admission in the cluster: the memory's "identity, RBAC = classed fence, admission by a tool-call hook"); Claude Code itself (one agent
in the terminal and in the cloud, bridged by Remote Control); Docker Machine (the client keeps the source, the daemon has the
resources, only the build context is sent); VS Code Remote-SSH and Codespaces (a thin editor, the thing that understands the code
runs where the code is).

*Decided*: the vision as restated above makes sense to the owner; the CLI becomes the surface for a person operating by hand, and
the inside seat's tool; the port is the agent's surface.

## 6. Where it bends

1. **Context for the outside seat.** Inside Nemia has every factory's folders mounted; outside Nemia has nothing. Section 8.
2. **Waking the outside seat is the harness's, not Nemia's.** Inside, the deliverer says wake lines into her inbox. Outside, Claude
   Code has the Monitor on a watch and the backgrounded long tool call; no documented push through MCP resources. The outside seat is
   never as awake as the inside one; let the inside seat do the waking.
3. **Talking to Nemia in the board does not exist.** Reaching her is a claude.ai link through Remote Control. The runtime can say words
   to her task and follow a background session's transcript, and the api streams a step's transcript, so the pieces exist; the Nemia
   chat on the board is a parked card set (the board frame memory).
4. **Identity is the hosted product's first wall.** No auth, loopback by design; a hosted account needs a login for the board and a
   token for the port, and each tenant's VM its own `claude` sign-in, the person's subscription.
5. **The CLI stops being the outside client**, since it reads the store from disk; a loss of habit, not capability.

## 7. The incremental plan, as the owner ordered it

1. **The port.** The MCP server in the api, tools generated from the command table (section 9). The Claude session's habit moves
   from the CLI to the port. Pulls two CLI-shaped pieces along: the admission hook's shell parsing and the fence's `Bash(nemia ...)`
   rules need MCP-shaped twins (`callAdmission.tools` naming `mcp__nemia__<verb>`, `admissionOf` reading `{ tool, input }` directly,
   `nemiaFence` emitting MCP rule names).
2. **Authentication**, in two halves. The transport, now: a bearer token on the MCP path and on the api for non-browser clients, a
   configurable bind address, TLS at a proxy; the write guard's Host rule has to yield to a valid token, since behind a proxy the Host
   is the domain. The session's recommendation: a token locally too, so the client config has one shape, a URL and a header, and the
   install prints the one `claude mcp add` line. Identity and scope, later: who a token is and the level floor it carries, enforced by
   the server for outside seats as the hook enforces it inside; a login for the board; MCP's OAuth. That is the hosted product's wall.
3. **Context** (section 8).

Beside the three, for the VPS by hand, no code: provision (Node 22.18+, git, `gh`, `claude` signed in under its own
`CLAUDE_CONFIG_DIR`; memory sized for runs, each package's suite near 2 GB, `WF_MAX_CONCURRENT` and `WF_MAX_RUNS` low); install as a
service (`nemia service install --env`, systemd user units with linger or launchd, `src/service/`; releases and `nemia upgrade`);
clone each repository there and `nemia factory add`; reach it through an SSH tunnel or Tailscale (8787 and the board's preview
port; the guard passes since the Host stays loopback; Remote Control to Nemia works unchanged); back up `WF_ROOT` (files only).

Cards the discussion named, none filed: the port; the wait and feed tools plus a Claude Code skill that backgrounds the watch;
admission for MCP names; a clone verb (`nemia factory add --clone <url>`, the git place cloning into the store, a deploy key or `gh`
on the VPS, and the onboarding audit the pipao lesson taught); disk guard rails on the VPS; the plugin; auth's first half. The
intents: auth's second half and the board's chat with Nemia.

## 8. The context question

An outside seat knows nothing of code that lives with the store. Three answers, two of them viable for a product that must work
with any coding agent (Claude's teleport and Remote Control, and Codex's cloud, are each vendor's own, so neither is the basis):

- **Delegation, through a run.** The outside agent starts a brief through the port, waits on the run with the `wait` tool, and reads
  the closeout through the decide and artifact tools. The inside agent is whatever harness the factory hires, so it is
  harness-agnostic by construction, and the answer is structured, since a step signs off against a schema. For back-and-forth, the
  supervisor pattern: a step that signs off with a question and continues its own session on each `retry --message`, keeping the
  context it built. Cost: a pass or two of the daemon and a session start before the first word, a model turn per exchange. Suits
  "go look at this and propose a card"; does not suit twenty quick questions. Iris's intake is this for the larger questions.
- **Reads through the port**: search, tree and file over a factory's repositories, as Sourcegraph's and GitHub's MCP servers do.
  Cheap on the server; the 25,000-token result cap is handled by paging. But the outside agent can only read, never run anything,
  so half the context; a token then exposes repository contents; and it pulls Nemia toward being a code browser.
- **A partial clone** (`git clone --filter=blob:none`) on the laptop: git is the one context transport every coding agent reads; the
  cost being offloaded is runs, not a checkout. The owner would rather not require a clone in the product; it stays the power user's
  bridge meanwhile.

The session's recommendation, not decided: delegation first, since every piece is on the table; measure how often the
back-and-forth stalls on the outside agent needing its own eyes on a file; add a small read-only tool set, scoped to the token, only
if it does.

## 9. Implementation notes for the port, a sketch

Where: a reader folder in the api (`apps/api/src/mcp/`), mounted by `app.ts` as `commands/` is, served through `served`
(`layer.ts`) and `runPlaced`, with the app's memos (`Kept`). The SDK is already the api's dependency. Transport: Streamable HTTP at
one path; to verify, that SDK 1.30 offers a fetch-standard server transport that fits Hono. No stdio variant: HTTP serves local and
remote alike, and `claude mcp add --transport http nemia http://127.0.0.1:8787/mcp` registers it.

Tools from `COMMANDS`, as `routesOf` builds routes:

- skip `only.side === 'cli'` entries and the four runners; take the api's forms (content, never a path; the `apiTakes` keys and the
  `EXTENSIONS`); a `hand` route's logic (a start, an inbox add, the library's writers) is the api's own and is reused, not the raw
  handler;
- name: `nemia_<name>` with the spaces of a name as `_`; description: the help lines and the usage; the manual as a resource or a
  help tool, never in the description;
- input schema from the spec, as `bodySchema` does but as JSON Schema: a positional required unless optional or many, a flag by its
  key (switch boolean, amount number, text string, many an array), `sets` as an enum of ways, an api-only key required where it says
  so, a CLI-only flag left out; `repo` and `factory` as arguments where the route would take them as a query;
- `check` refuses before the handler; `Missing`, `Conflict` and `Invalid` answer `isError: true` with their message, which already
  says what to do next; `apiRefusal` and `apiKeys` honoured;
- result: the data as `structuredContent`, the `print` lines as text; annotations `readOnlyHint` from `writes: false`,
  `destructiveHint` from the class `prompts`, `_meta["anthropic/requiresUserInteraction"]` for `prompts` and `asksAlways`;
  `_meta["anthropic/alwaysLoad"]` on a first set (the reads, the four answers, start, inbox, hold, say, pause, level), the rest
  deferred behind tool search;
- a transcript, a log or an artifact read pages or tails under the 25,000-token cap, as the CLI prints a tail.

Wait and feed: a `feed` tool from a cursor (the entry exists, unrouted); a new `wait` verb over `followFeed` with a predicate (a run,
a step, a word or a wake line) and a bound, served as a tool and as a long-poll route, sending progress every few minutes so the
HTTP idle timer never fires, and long enough that Claude Code backgrounds it and wakes on its result. Resources for a run and the
feed are cheap off the hub but of unknown value until a host surfaces them.

Tests: every entry a tool or named as left out (as `wordBreaks`); a planted entry with no class fails; the SDK's `Client` against
the app in-process (as `serverAsk` does for a stdio server); refusals by kind; the generated schema against the api's `bodySchema`.

Auth, first half: a token kept in the store, checked on the MCP path and on `/api` for requests carrying the header; a valid token
satisfies the guard where the Host is not loopback; `HOST` configurable; the install prints
`claude mcp add --transport http nemia <url> --header "Authorization: Bearer ${NEMIA_TOKEN}"`.

Capabilities page follow-up: an `http` server shows as not asked; listing Nemia's own tools there needs the asker extended.

## 10. Open questions, to refine

- Which entries are tools at all: every served one, or a curated first set with the rest deferred? What of the HTTP-side gaps
  (`cancel`, `ls`, `show`, `feed`, the factory's attach, detach, trust and rm, `auto propose`)?
- The shape of `wait`: by run and word, by wake line, by cursor alone? Its bound, and its progress cadence.
- Where repositories live on a hosted store, and who updates them (the git place; a clone verb; the onboarding audit).
- The token's scope: one per store, or one per seat with a floor? How a factory's level and a token's floor compose.
- The plugin: generated from `nemia/` at build, or at install from the store? Codex's equivalent (`config.toml` servers, skills)?
- Delegation's primitive: an "explore" workflow of one step with a card-shaped closeout, or Iris's intake as is?
- The board's chat with Nemia, for the second audience: through the runtime's `say` and the transcript follow, or something else?
- Whether a resource subscription ever reaches a host's model; nothing to build on it until one does.
