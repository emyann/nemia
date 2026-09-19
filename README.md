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
reset in your own time zone, and how old the reading is. Claude Code tells only a statusline command, so the
reading comes from one: `apps/api/statusline/quota.ts` writes the quota part of the statusline's payload to
`~/.agent-workflows/quota.json` (`$WF_ROOT/quota.json` when that is set), and `GET /api/quota` serves what the
file says. Nothing installs it for you: add this to `~/.claude/settings.json`, with the path to your checkout
and an absolute path to `node` (`which node`; under nvm, Claude Code's own PATH may not find it):

```json
"statusLine": {
  "type": "command",
  "command": "/home/you/.nvm/versions/node/v24.20.0/bin/node /home/you/projects/hkb-v2/apps/api/statusline/quota.ts"
}
```

It prints its own line, `5h 38% · 7d 86% · resets 16:40`, and writes the file only after an answer, so the
reading's age is the age of your last turn in any session, not of the last repaint. To keep a statusline you
already have, put its command after the script's path, quoted as one argument: the script runs it with the same
payload and prints its output first — `"command": "node …/quota.ts 'bash ~/.claude/my-statusline.sh'"`.

To check it:

```bash
# The script alone, into a store of its own: a line, then the file.
echo '{"version":"2.1.278","rate_limits":{"five_hour":{"used_percentage":38,"resets_at":'$(( $(date +%s) + 3600 ))'},"seven_day":{"used_percentage":86,"resets_at":'$(( $(date +%s) + 86400 ))'}}}' \
  | WF_ROOT=/tmp/quota-check node apps/api/statusline/quota.ts
cat /tmp/quota-check/quota.json
# Installed: send a message in an interactive claude session signed in to the subscription, then
cat ~/.agent-workflows/quota.json
curl -s localhost:8787/api/quota    # state "fresh", with its windows; the Factory's header shows them
```

A reading older than 5 hours is not shown as the quota, and neither is a session with no limits (an API key):
the header says which, and what to do.

## History

Both packages keep their git history, imported from the standalone repositories at
`agent-engine` master `102106b` and `agent-workflows` master `0c438ac`:

```bash
git log -- packages/agent-engine
```
