# Working on Nemia

This is for working on Nemia itself, from a checkout of its repository. To use Nemia, install a release: see the README.

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

## Running from the repository

To use Nemia, install a release: [Getting started](../apps/docs/src/content/docs/getting-started.mdx) in the docs takes one line to a
first landed change. This section is for working on Nemia itself, from a checkout.

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
`WF_MAX_CONCURRENT`, `WF_MAX_RUNS`, `WF_FOLDER_ROOTS` (the folders the board's folder field lists names under, the home by default) or
`OTEL_EXPORTER_OTLP_ENDPOINT` come from `nemia service install --env`. `NEMIA_DAEMON_START=off` turns the start off.

## No build step, except the web app

The packages and the API are TypeScript that Node runs directly (type stripping, unflagged since Node 22.18; the floor
`engines.node` claims is 24.16, which is not where stripping arrived but where libuv keeps a file's millisecond time).
Node refuses to strip types under `node_modules`, but a workspace is a symlink whose realpath is
outside it, so importing `agent-orchestrator` from the API runs the `.ts` source.

The engine must also **not be bundled**: it finds its detached worker (`bin/ae-worker.ts`)
relative to its own source file. That is why the API is a plain Node process and not a Next.js
or TanStack Start server.

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
