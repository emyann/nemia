# hkb v2

The harness kanban board, rebuilt on the two libraries that replaced its core.

| | what it is | depends on |
|---|---|---|
| `packages/agent-engine` | runs one agent session to completion, durably; the `ae` CLI | — |
| `packages/agent-workflows` | sequences engine tasks into runs of steps; the `wf` CLI | `agent-engine` |
| `apps/api` | Node server (Hono) that puts the workflows behind HTTP | `agent-workflows` |
| `apps/web` | React app: Vite, TanStack Router + Query, Tailwind | `apps/api`, over HTTP only |

Dependencies point down this table, never up. The web app imports no package: the engine spawns
processes and reads your home directory, so it lives behind the API.

## Getting started

```bash
npm install
npm run dev         # api on :8787, web on :5173 (it proxies /api)
npm test
npm run typecheck
npx wf              # the workspace CLIs are linked at the root
```

## No build step, except the web app

The packages and the API are TypeScript that Node runs directly (type stripping, Node >= 22.18).
Node refuses to strip types under `node_modules`, but a workspace is a symlink whose realpath is
outside it, so importing `agent-workflows` from the API runs the `.ts` source.

The engine must also **not be bundled**: it finds its detached worker (`bin/ae-worker.ts`)
relative to its own source file. That is why the API is a plain Node process and not a Next.js
or TanStack Start server.

## The quota on the board

The Factory's header shows how much of the subscription's five-hour window and week is used, each with its
reset in your own time zone, and how old the reading is. Nothing to install: `GET /api/quota` asks Claude Code
itself, with its `get_usage` control request, and serves the answer. It asks the `claude` on the api's PATH, at
most once every 3 minutes, one ask at a time, and only while a board asks (`HKB_QUOTA_KEEP_MS` sets the keep; `0`
asks on every read). An ask is a short `claude -p` that makes no model turn and spends nothing:

```bash
claude -p --input-format stream-json --output-format stream-json --verbose \
  --no-session-persistence --strict-mcp-config --setting-sources ''
```

with one `{"type":"control_request","request_id":…,"request":{"subtype":"get_usage"}}` on stdin. It writes no
transcript, starts no MCP server and loads no settings, so no hook runs; it runs from the temp directory with
the `CLAUDE*` variables of a session around the api taken out, all but `CLAUDE_CONFIG_DIR`. That claude must be
signed in to the subscription under the api's `CLAUDE_CONFIG_DIR` (`claude`, then `/login`): an API key, Bedrock
or Vertex has no plan limits to show.

To check it:

```bash
curl -s localhost:8787/api/quota   # state "fresh", with its windows; the Factory's header shows them
```

Every other state is a sentence on the header saying what to do, and never a number read as the quota:
`asking` (the first ask, still out), `no-plan` (not signed in to a subscription), `no-claude` (none on the api's
PATH), `timeout` (no answer in 15 s), `failed` (claude stopped first; its last line of stderr is quoted) and
`unknown` (an answer this board does not read — `get_usage` is experimental in Claude Code, and a new version may
change it). The last answer that had windows is on hover.

If you installed the statusline an earlier version of this board asked for, take its `statusLine` block out of
`~/.claude/settings.json` and delete `~/.agent-workflows/quota.json`: nothing reads either now.

## History

Both packages keep their git history, imported from the standalone repositories at
`agent-engine` master `102106b` and `agent-workflows` master `0c438ac`:

```bash
git log -- packages/agent-engine
```
