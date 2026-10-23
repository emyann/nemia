# Plan: the Factory on several repositories

> **Status (2026-10-23): superseded by factories** (`65142b5a1`, `8abba04fa`, 2026-09-30): a run starts in a factory, and a factory
> names its repository. Nothing below was built as written.

Written 2026-09-22, from a session with the owner. The owner's order: finish P2's list first (`docs/pivot-2026-09-18.md`
§6), then use the Factory on the other projects on this machine — pipao-v2 first named. Nothing here is built or filed.
Every claim about the code was read on main at `0b5c7ef`; paths are the repository's.

**In one paragraph.** The engine and the daemon already serve several repositories: a run carries its own repository, and
one `wf up` advances every run in the store whatever it belongs to. What serves one is everything around them — the api
answers for its own checkout alone, the board has no word for "which repository", and the shipped workflows are written for
this npm and turbo monorepo. So the work is the api, the board, and a way for each repository to say how its work is
checked; the P2 item *workspaces at the Factory's level* is most of it.

---

## 1. What already works

- **A run carries its repository.** A git run's record holds `repo`, `baseRef`, `branch` and `workflowDir`, and freezes its
  workflow (`packages/agent-orchestrator/src/run.ts:40-76`). `tick()` advances every run in the store
  (`runner.ts:2587-2604`); a `workspace: main` step runs in `run.repo` (`runner.ts:941`), and the one-at-a-time hold on a
  checkout is keyed by repository (`MainClaim.repo`, `run.ts:604`).
- **The store is the machine's.** `WF_ROOT`, or `~/.agent-workflows` (`runner.ts:42`): runs, inbox, queue, checks and the
  engine's journal are keyed by run id or card name, never by repository. `WF_MAX_RUNS` and `WF_MAX_CONCURRENT` are caps
  for the machine.
- **Worktrees are per run.** `$WF_ROOT/worktrees/<run>/<step>` on `wf/<run>/<step>` (`runner.ts:952-958`); the base is the
  repository's checked-out branch, not a hardcoded `main` (`runner.ts:910-911`).
- **Sessions are the checkout's.** `claude --bg` and codex start in the step's workspace
  (`agent-runtime/src/runner-detached.ts:230-263`) and read that checkout's `.mcp.json`, `.claude/settings.json` and codex
  rules. `.worktreeinclude` is read from `run.repo` (`runner.ts:846-850`).
- **So the CLI can already drive another repository**, with a workflow folder written for it:
  `wf start "<brief>" --repo ~/projects/pipao-v2 --workflows <folder>`.

## 2. What ties the Factory to one repository

In the order they block.

1. **The api's one repository.** `repoOf()` is `HKB_REPO || HOME_REPO`, and `HOME_REPO` is the api's own checkout
   (`apps/api/src/capabilities/capabilities.ts:66-69`); `HKB_REPO` is set by the e2e alone. Starting a run (`workflows.ts:430, 460`),
   starting an inbox card (`startFromInbox({ callerRepo: repoOf() })`, `workflows.ts:442`), filing a card (`inbox.ts:194-197`),
   the workflow list (`sourcesOf(repoOf())`, `workflows.ts:139-146, 388`), `GET /api/repository` (`workflows.ts:424`), the
   Agents page (`agents.ts:214-221`) and the capabilities (`capabilities.ts:74-88`) all answer for it. `/api/runs` already
   lists every repository's runs and carries `repo` on each.
2. **A card for another repository runs this one's workflow.** A card with `repo: X` is started with a workflow folder
   found in the api's repository, against X (documented at `features.md:1710`). And a step's agent is read from the
   `agents/` beside its workflow folder (`workflow.ts:1188`), not from the repository it works on.
3. **The board has no repository.** No picker; "this repository" in `AgentParts.tsx:23`, `routes/agents.tsx:48`,
   `routes/workflows.tsx:35, 83` and `StartRun.tsx:96`; `lib/inbox.ts:62-80` compares a card's `repo:` with the api's one.
   Run cards already name their repository (`RunNode.tsx:99`).
4. **The shipped workflows are this repository's.** Their checks are `npm test && npm run typecheck`, and the build and e2e
   when `apps/` is touched (`dev/implement.md:11`, `dev-planned/implement.md:14`; unconditional in `dev-build`,
   `dev-planned-build`, `ui`). The agents name turbo, `packages/<pkg>`, `apps/web/test/e2e` and the `look` skill
   (`agents/reviewer.md:34-40`, `ui-implementer.md:22-28`, `ui-reviewer.md:33`); planner and reviewers
   `disallow: Bash(npm run build), Bash(npm run e2e)`. The supervisor writes this repository's `CLAUDE.md` and
   `features.md`. The shipper and `note` are generic.
5. **`dontAsk` steps lean on the target's allow-list.** Planner and reviewers run in `dontAsk`: a command the repository's
   `.claude/settings.json` does not allow is denied with no prompt, and the session carries on without it — so a repository
   whose tests are `pytest`, or `npm run test:integration`, has to allow them, or its reviewer never runs them.
6. **`wf` lives in this checkout.** It is `packages/agent-orchestrator`'s `bin` (`bin/wf.ts`), reached with `npx wf` from here,
   on Node's type stripping (unflagged from 22.18, and the floor `engines.node` claims is now 24.16). A card that names no
   repository starts where `wf up` was started
   (`cli/main.ts`; `runner.ts:1773, 1837`).
7. **A worktree's dependencies are npm's.** `provisionDeps` links the checkout's `node_modules` or runs `npm ci` when the
   lockfile moved (`runner.ts:813-844`, `deps.ts`). With neither it does nothing, harmlessly; pnpm, yarn and a Python
   `.venv` get nothing unless `.worktreeinclude` lists them.

## 3. The first other repository: pipao-v2

Read 2026-09-22 (`~/projects/pipao-v2`, main at `1dfe63b`).

- **The same shape as this one.** npm workspaces and turbo (`apps/web` Next.js, `packages/{md3,db,platform,qr,ofs}`),
  a `CLAUDE.md`, `AGENTS.md`, `.claude/settings.json`, `.mcp.json`, `skills-lock.json`: a worktree's dependencies work as
  they are.
- **Its checks:** `npm test`, `npm run typecheck`, `npm run lint` (all turbo). Integration tests and the Playwright e2e need
  Postgres from docker (`task docker:db`), the gitignored `apps/web/.env`, and dev servers on fixed ports: two runs side by
  side collide on the ports and the database, and a worktree has no `.env` unless `.worktreeinclude` names it.
- **It still runs the old board**: `.kanban/` and `kb-*` worktrees under `.claude/worktrees`. Whether it is retired there, or
  both run for a while, is the owner's (§6).
- **The hardest case on the machine**, for the database and the e2e. A first pilot can leave both out of its check.

## 4. The work, in order

**Step 1 — a pilot from the CLI, nothing built.** A workflow folder for pipao in the home store
(`~/.agent-workflows/workflows/pipao-planned`, with its `agents/`): `dev-planned` with pipao's check (`npm test && npm run
typecheck && npm run lint`), the agents' Nemia words taken out, pipao's allow-list extended for what its reviewers must
run, and `.worktreeinclude` for `apps/web/.env` if a check needs it. Run one or two real small cards through it with
`wf start --repo ~/projects/pipao-v2`. What breaks there is the list the next steps answer, measured rather than guessed —
the migration note's advice: "run your own real work through `agent-runtime` + `agent-orchestrator` for a week first".

**Step 2 — the rest of P2, which is this work.** "Workspaces at the Factory's level — `folder | git repository | github
repository`" is choosing a folder or one of the person's repositories. Small cards, chained with `--after` where they touch
the board:

- **(a) The machine's repositories.** A list in the store (`wf repos add | ls | rm`), one writer, and a card's `repo:` refused
  unless it names one of them. Package only.
- **(b) The api reads the repository from the request**, not `repoOf()`: starting a run or a card, the workflow list and the
  Agents page per repository; `GET /api/repositories` in place of `/api/repository`. The api's own checkout stays the
  default while there is one repository.
- **(c) The board chooses a repository**: a picker where a run or a card is started, the inbox grouped by `repo:`, and
  "this repository" gone.
- **(d) Shipped agents with no repository in them.** The repository's part — its check, its test words, what its reviewer
  may run — goes in the workflow folder the repository owns (§6, decision 1); the agents in `workflows/agents/` say "the
  check" and never `npm`. A test holds the shipped agents to no repository's words, as the folder briefs are held to none
  of git's.

**Step 3 — `wf` from anywhere.** An install that puts `wf` on the path (`npm link` from the package, or a documented global install), and one `wf up` for the machine started from any directory; a card with no repository refused rather than
started where the daemon happens to run.

**Later.** pnpm, yarn and Python dependencies in a worktree. Per-repository caps (`WF_MAX_RUNS` for one repository) and
per-worktree ports and databases for e2e checks. The supervisor for a repository that is not this one.

## 5. What does not change

The engine: a task already carries its `cwd`, and nothing in it knows a repository. The run record, the store's layout and
the rule that a check comes from the workflow folder frozen at `wf start`, never from a checkout a step can edit. One store
and one daemon per machine.

## 6. Decisions that are the owner's

1. **Where a repository's workflows live.** In the repository (`<repo>/workflows/`, committed, as this one does), or in the
   home store with one folder per repository, leaving the repository untouched. Both keep "no command from a checkout": the
   folder is read from the repository's main checkout and frozen at `wf start`, never from a worktree.
2. **pipao's old board.** Retire `.kanban/` and the `kb-*` worktrees there, or run both for a while.
3. **The pilot.** pipao, the hardest case on the machine, or a smaller repository first.
4. **When P2's GitHub kind comes** — a repository that is not checked out on this machine — against a local repository
   list first.
