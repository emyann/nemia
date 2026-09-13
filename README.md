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

## History

Both packages keep their git history, imported from the standalone repositories at
`agent-engine` master `102106b` and `agent-workflows` master `0c438ac`:

```bash
git log -- packages/agent-engine
```
