# Nemia

**Nemia — Recruit intelligence.** Said NEH-mee-ah.

Nemia runs teams of agents. A runtime keeps each agent session alive to completion; an orchestrator sequences steps from folders of
markdown; every harness is reached over A2A, as an agent of its own; and a board, behind an api, shows the runs and takes what a person
decides.

Where it is going: a persistent runtime that assembles agents, remembers what they learn, and gets better at deciding who should do the
work.

| | what it is | depends on |
|---|---|---|
| `packages/agent-runtime` | runs one agent session to completion, durably; the `ae` CLI | — |
| `packages/agent-orchestrator` | sequences engine tasks into runs of steps; the `wf` CLI | `agent-runtime` |
| `apps/api` | Node server (Hono) that puts the workflows behind HTTP | `agent-orchestrator` |
| `apps/web` | React app: Vite, TanStack Router + Query, Tailwind | `apps/api`, over HTTP only |
| `apps/docs` | the documentation site: Astro Starlight, the state diagrams read from the package docs at build | — |

Dependencies point down this table, never up. The web app imports no package: the engine spawns
processes and reads your home directory, so it lives behind the API.

## Getting started

```bash
npm install
npm run dev         # for working on the board: an api on :8788 that ticks nothing (--no-tick), web on :5173 (it proxies /api)
npm test
npm run typecheck
npx wf              # the workspace CLIs are linked at the root
```

`npm start` in `apps/api` is the store's daemon and the board's api at once: it holds `~/.agent-workflows/daemon.json`, ticks the runs
and answers `/api` on :8787. The board itself is the web's server: `npm run build` then `npm run preview` in `apps/web`, which proxies
`/api` to :8787. `npx wf up` is the same daemon on a machine that serves no board. One store takes one daemon: each refuses the other
while it ticks, naming its pid. Where none ticks, a command that files work (`nemia start`, `approve`, `retry` and the like) starts it:
the store's login service if `nemia service install` put one, else the same daemon detached, logging to `$WF_ROOT/daemon.log`, which it
names with how to stop it. That daemon has the service's environment, not your shell's: settings such as `PORT` (8787 by default),
`WF_MAX_CONCURRENT`, `WF_MAX_RUNS` or `OTEL_EXPORTER_OTLP_ENDPOINT` come from `nemia service install --env`. `NEMIA_DAEMON_START=off` turns the start off.

## No build step, except the web app

The packages and the API are TypeScript that Node runs directly (type stripping, Node >= 22.18).
Node refuses to strip types under `node_modules`, but a workspace is a symlink whose realpath is
outside it, so importing `agent-orchestrator` from the API runs the `.ts` source.

The engine must also **not be bundled**: it finds its detached worker (`bin/ae-worker.ts`)
relative to its own source file. That is why the API is a plain Node process and not a Next.js
or TanStack Start server.

## The quota on the board

The Factory's header shows how much of the subscription's five-hour window and week is used, each with its
reset in your own time zone, and how old the reading is. Nothing to install: `GET /api/quota` asks the runtime's `claude` harness for its
`quota`, which asks Claude Code itself its usage question through the Agent SDK, and serves the answer. It asks the `claude` on the api's PATH, at
most once every 10 minutes, one ask at a time, and only while a board asks (`HKB_QUOTA_KEEP_MS` sets the keep; `0`
asks on every read). A read is never answered by an ask that began more than the keep before it (with `0`, only by one that began after
it), and a reading's age counts from when its ask began. A read waits 2 s for its ask before it says it is asking (`HKB_QUOTA_WAIT_MS`):
with a keep shorter than an ask lasts, set a wait longer than one, or every read starts an ask it does not wait out.
An ask is one short query of the Agent SDK that makes no model turn and spends nothing:

```ts
query({ prompt, options: { pathToClaudeCodeExecutable: 'claude', cwd: os.tmpdir(), persistSession: false, settingSources: [] } })
  .usage_EXPERIMENTAL_MAY_CHANGE_DO_NOT_RELY_ON_THIS_API_YET({ skipBehaviors: true })
```

The SDK starts that `claude` with arguments of its own choosing and sends it the `get_usage` control request; which
Claude Code it starts is the one thing the runtime names, so the quota is read by the Claude Code the sessions run
on. It writes no transcript, starts no MCP server and loads no settings, so no hook runs; it runs from the temp directory with
the variables a Claude Code session hands its children taken out, should the api run inside one; how it signs in
(`CLAUDE_CONFIG_DIR`, `CLAUDE_CODE_OAUTH_TOKEN`, a provider's switch) is kept, as the engine's workers keep it. That claude must be
signed in to the subscription under the api's `CLAUDE_CONFIG_DIR` (`claude`, then `/login`): an API key, Bedrock
or Vertex has no plan limits to show.

To check it:

```bash
curl -s localhost:8787/api/quota   # state "fresh", with its windows; the Factory's header shows them
```

Every other state is a sentence on the header saying what to do, and never a number read as the quota:
`asking` (the first ask, still out), `no-plan` (not signed in to a subscription), `unanswered` (see below),
`no-claude` (none on the api's PATH), `timeout` (no answer in 15 s), `failed` (claude stopped first; its last line
of stderr is quoted) and `unknown` (an answer this board does not read — `get_usage` is experimental in Claude
Code, and a new version may change it). Under the sentence, the last good reading stays in sight, dimmed and
dated (`as of 11:20, 25 min ago`), for up to six hours; past that it goes.

**`unanswered`: the usage service gave nothing.** Claude Code signed in to a subscription answers
`rate_limits_available: true` with `rate_limits: null` when Anthropic's usage service did not give it the windows:
2.1.278's `--debug` log then says `Usage fetch returned a fieldless or non-object body (in-band error)`. The service
may be limiting how often the account asks — that cannot be told from outside, and the board does not claim it —
so the board asks less often: 20 minutes after the first such answer, then 40, 80, 160, and every 4 hours for as
long as it lasts; the first good reading begins it again. `HKB_QUOTA_BACKOFF_MS` sets the first wait (`0` asks on
every read). The waits are kept in the api's memory, as the rest is: a restart costs one ask.

**Why not the Agent SDK.** `@anthropic-ai/claude-agent-sdk` (0.3.270) has the same request as
`query.usage_EXPERIMENTAL_MAY_CHANGE_DO_NOT_RELY_ON_THIS_API_YET({ skipBehaviors })`, typed
`SDKControlGetUsageResponse`: it writes the same control request to the same `claude`, and would get the same
answers, `rate_limits: null` included (its type says "or null when unavailable"). The api asks the CLI itself and
does not take the SDK's type either: the SDK is the engine's dependency, not the api's, and the api reads the
answer defensively, as `unknown`, should a version change it.

If you installed the statusline an earlier version of this board asked for, take its `statusLine` block out of
`~/.claude/settings.json` and delete `~/.agent-workflows/quota.json`: nothing reads either now.

## History

The project was hkb v2 until it was named Nemia on 2026-09-29: the harness kanban board, rebuilt on the two libraries that replaced
its core. What is typed and what is on disk kept its name, as with the packages below, and so did the checkout's folder.

Both packages keep their git history, imported from the standalone repositories at
`agent-engine` master `102106b` and `agent-workflows` master `0c438ac`, the names they had until they were renamed on 2026-09-23.

On 2026-09-23 the two packages took the names of their layers: `agent-runtime` keeps one agent session
alive to completion (create, resume, stop), and `agent-orchestrator` turns folders and cards into its
tasks, watches them and reconciles. What people type and what is on disk kept its name: the `wf` and `ae`
commands, the stores under `~/.agent-workflows` and `~/.agent-engine` with `WF_ROOT` and `AE_ROOT`, and the workflow
folders' format. A path that crosses the rename is followed by naming both ends:

```bash
git log -- packages/agent-runtime packages/agent-engine # renamed on 2026-09-23
```

After pulling the rename, run `npm install` at the root (the workspace links are renamed) and restart a
running daemon: a daemon started before it spawns its sessions from a worker path that is gone.

Nemia is MIT-licensed (`LICENSE`); the vendored skills and the design system kit keep their own licences, reproduced in
`THIRD_PARTY_NOTICES.md`.
