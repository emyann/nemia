# How workflows work today (hkb-v2, main at c0954da, 2026-09-25)

## 1. What a workflow is

**Format.** A workflow is a folder of markdown files. Every `.md` in it is a step except `README.md`, whose first paragraph is the description the board shows. The step's name is its file name without `.md`. The frontmatter holds keys and the body is the prose the agent is told. The parser is `packages/agent-orchestrator/src/workflow.ts` (`parseWorkflow`, `parseFolder`, `validate`), and it is pure. The disk reader is `src/workflow-store.ts` (`loadWorkflows`, `loadAgents`, `workflowFolder`).

Workflows live in two places:
- `<repo>/workflows/<name>/`, which the board labels "this repository".
- `~/.agent-workflows/workflows/<name>/` (or under `WF_ROOT`), which the board labels "yours".

`wf start <brief> --workflows <name|path>` picks one. A bare name resolves under `<repo>/workflows/`.

**Design stance** (workflow.ts header, package README "The format"): *"No key is control flow."* There are no conditions, expressions or templating. The one backward edge, `loop:`, turns on the agent's own `again` word, not on a predicate. The README says: "The workflow is a team, not a program."

**The keys are a closed list.** `STEP_KEYS` (workflow.ts:267) has 26 keys. An unknown key is refused by name. `guide:` and `maxAttempts:` are refused with reasons of their own. The former names `disallow`/`allow` are still read as `disallowedTools`/`allowedTools` (`FORMER_KEYS`). Each key has a one-line meaning in `STEP_KEY_MEANINGS` (:284). By group:

- **Wiring**
  - `after:` lists the steps that must finish first. The steps form a DAG, and `validate` refuses a cycle using Kahn's algorithm.
  - `resume:` continues another step's session. It implies `after`, and the two steps must use the same harness and context window.
  - `input:` names steps whose declared `output:` fields this step receives as data under `## From <step>`. Each must be a step it waits on and one that declares an output.
  - `output:` names a JSON Schema file beside the step (or beside its agent). The schema must be strict: every property required, `additionalProperties: false`, no `$ref`. It may not redeclare `outcome`, `summary`, `artifacts` or `needs`. Its fields are merged into the closeout schema (`outputOf`, :1255).
  - `loop:` names the step to run again when this step's closeout says `again: true`. The target must be upstream, and the loop's steps must form a chain (`validateLoops`, :2094). `rounds:` caps it; the default is `DEFAULT_ROUNDS = 3`, after which a person decides with `wf round` or `wf accept`.
  - `gate: true` holds everything after the step until `wf approve` writes an approval file.
- **Verification and limits**
  - `check:` is a shell command. The run executes it as an engine task on its own `check` harness (`src/check.ts`), in the step's workspace, after handing the work off. Exit 0 marks the step `verified`; anything else is `failed (check)`. It receives `WF_RUN`, `WF_STEP`, `WF_BASE_REF`, `WF_WORKSPACE`, `WF_STDERR` and `WF_ARTIFACTS`, and runs under `nice -n 10`.
  - `retries:` is how many times the run re-files the step after its check refuses it.
  - `deadlineSeconds:` is the engine's time limit.
  - `budget:` is the most, in dollars, that all of a step's tries may cost together. It is refused on codex and beside `background:`.
- **Where the step works**
  - With no `workspace:` line, each step gets a git worktree on branch `wf/<run>/<step>`, and a fan-in step's branch has its parents' branches merged into it.
  - `workspace: main` runs the step in the repository's own checkout. It must be the single last step, and it may not have `check:` or `resume:` (`validateMainWorkspace`).
  - `workspace: folder` gives each step a folder of its own with no git. Every step of the team says it or none does (`validateFolder`).
  - `slot: none` keeps a one-step workflow out of `WF_MAX_RUNS`.
- **Who does the work and how** (the role keys)
  - `agent:`
  - `harness:`: `claude` (the default), `codex` or `claude-detached`.
  - `model:`, `effort:` and `context:`. Effort words are checked per harness. `context:` takes 100k–1M and is refused on codex.
  - `permissionMode:` is Claude Code's fence. `sandbox:` is Codex's fence. Each is refused on the other harness.
  - `tools:` is the exact tool list (`--tools`) and is refused on codex.
  - `disallowedTools:` and `allowedTools:` are Claude Code permission rules. A path rule on a file-editing tool that is not `Edit(...)`, such as `Write(**)`, is refused (`fileRuleRefusal`).
  - `denials: fail` makes a denied tool call stop the step and wait on a person.
  - `background: true` runs the step as `claude --bg`. Without it, a claude step runs as a `claude -p` job.
  - `remote: true` bridges the session to claude.ai and requires `background: true`.

**Closeout.** Every step signs off with structured output (`CLOSEOUT_SCHEMA`: `outcome`, `summary`, `artifacts`, `needs`) plus any fields its `output:` declares. Claude Code enforces this through its StructuredOutput tool and Codex through `--output-schema`. `outcome: blocked` stops everything downstream. `summary` goes only to the person, never to another step.

**The brief.** `composeBrief` (`src/run.ts` ~4075) builds what a step is told:
- the step's body;
- `## What was asked for` (the run's brief);
- `## Where to look`;
- `## From <step>` for each input;
- `## Approved` / `## Accepted` where a person approved a gate or accepted a loop.

The runner then appends contracts: the check the step will be judged by, where its files go, and how to sign off. The README calls this "Mechanism, not prose a workflow author has to remember." Process never travels between steps: no transcript and no summary.

**Freezing.** `wf start` resolves every step, agents included, and freezes the result on the run record. Editing a folder affects only later runs, and a `check:` is always read from the frozen copy ("No command from a checkout", CLAUDE.md).

## 2. Agents

`workflows/agents/*.md` sits beside the workflow folders (`agentsDir`, workflow.ts:1494). Yours are in `~/.agent-workflows/workflows/agents/`. `AGENT_KEYS` (:1533) is `description, skills, harness, model, effort, context, permissionMode, sandbox, tools, disallowedTools, allowedTools, remote, output`.

- **Refusals in an agent file.** A wiring key is refused by name, saying it belongs on the step. So is `agent:`, because an agent does not name another agent.
- **Resolution.** A step that says `agent: x` takes x's role keys as defaults, and any key the step sets wins. The fence (`permissionMode`/`sandbox`) counts as one key. The body the step is told is the agent's instructions, a blank line, then the step's own note.
- **Where refusals land.** An agent that fails to parse refuses only the steps that name it. A symlinked agent file is refused.
- **Writing back.** `renderStep` writes a resolved step back as only its `agent:` line, its own keys and its own note.
- **`skills:`** names `<agent>.skills.json`, a list in the shape of A2A's `AgentSkill` (`id`, `name`, `description`, `tags` required; `examples`, `inputModes`, `outputModes` optional), checked by `skillsOf` (:1332). It is description only. It is not frozen on a run, nothing routes by it, and `wf agents card` renders an A2A-shaped card that declares no interfaces. It is not the same thing as a Claude Code skill.

The eight shipped agents (`workflows/agents/README.md`):

| Agent | Used by |
|---|---|
| `implementer` | `implement` in the four `dev*` folders |
| `reviewer` | `review` in the four `dev*` folders |
| `planner` | `plan` in `dev-planned` and `dev-planned-build` |
| `shipper` | `ship` in the four `dev*` folders and `ui` |
| `ui-implementer`, `ui-reviewer` | `implement` and `review` in `ui` |
| `note-writer`, `note-reviewer` | `write` and `review` in `note` |

The supervisor's step names no agent. Every agent sets `context: 200k`, and all but the two note agents set `effort: high` (the shipper sets `medium`).

## 3. What is validated deterministically, and what is only prose

**Refused before anything is spent** (at `wf start`, on a builder save through `writeWorkflow`/`parseFolder`, and when the api lists folders):
- unknown keys and malformed values;
- harness vocabulary (copied from agent-runtime and held to it by `test/vocabulary.test.ts`);
- a DAG with a cycle or a missing step;
- `input:` without `after:` or without an `output:` on the producer;
- loop shape;
- schema strictness;
- workspace rules: one ending, folder all-or-none, and in a folder team a `background: true` step must use `dontAsk` or `bypassPermissions` (`validateFolderMode`);
- the `slot:` rule, `Write(...)` path rules, `budget:` with `background:`, and `remote:` without `background:`.

**Enforced while a run is in flight:**
- The check's exit code decides whether what follows is filed.
- A closeout missing a declared field reads `unsigned`.
- Declared `artifacts` are checked against the step's files directory.
- A gate holds until an approval file exists for the current try.
- `budget:` stops filing, and the harness gets `--max-budget-usd`.
- `denials: fail` and the `rounds:` count.
- Tool and permission keys become harness flags, which the harness enforces.
- Only one `workspace: main` step per repository runs at a time (`heldCheckouts`, run.ts:723).
- "Shipped" is read from git (`isShipped`, `src/branches.ts:33`: `git merge-base --is-ancestor` of the result branch against the local base branch). `--after` chains and the "to decide" state depend on it.

**Only prose:**
- **The shipper's whole recipe** (`workflows/agents/shipper.md`): check `git status` is clean, trial merge with `--no-ff --no-commit`, run the named check by hand mid-merge, `git commit -F` with a message written to stated rules, `git merge --abort` on any failure. `check:` is refused on a `workspace: main` step, so nothing machine-verifies the ship. The machinery around it is the gate, the checkout lock, and naming the check line on its brief.
- "Do not open a pull request" (`implementer.md:31`, `ui-implementer.md:46`).
- The implementer running the e2e itself when a page changes.
- The planner signing off `blocked` when a brief reads two ways. The gate is the machine version of that hold, but `dev-planned` sets no gate on `plan` by default.
- Keeping reviewers off `npx turbo run test:*` and `node --test:*`, which the settings allow and which reach the build and e2e (`dev/README.md` says so).
- Most of `supervise.md`. "Never type git for a run" is partly backed by a prefix deny list in `disallowedTools`.

The repository's rule is "Prose is not a constraint" (CLAUDE.md, *Rules the code keeps*).

## 4. The shipped folders

| Folder | Shape | Distinguishing facts |
|---|---|---|
| `dev` | implement ⇄ review → ship | implement's `check:` is one long line: `npm test && npm run typecheck`, then build if `git diff` since `WF_BASE_REF` touches `apps/web`, `apps/api` or the root `package*.json`/`turbo.json`. The e2e runs only where `WF_BASE_REF` is unset, i.e. in the shipper's hands. review: `budget: 20`, `loop: implement`, `rounds: 3`. ship: `workspace: main`, `gate: true`. |
| `dev-build` | same | check always builds; e2e at the ship; ship carries a 5-line note to the shipper |
| `dev-planned` | plan → implement ⇄ review → ship | adds `plan.md` (planner, output `plan.schema.json`); implement adds `after: plan` and `input: plan` |
| `dev-planned-build` | same | the planned × build combination |
| `ui` | implement ⇄ review → ship | ui agents; review sets `input: implement` (screenshots and pages) and its own `output: review.schema.json` beside the step, overriding the agent's |
| `note` | write → review | `workspace: folder`, sonnet, `dontAsk`, writer given `allowedTools: Edit(**)`, `budget: 2`, no check |
| `supervisor` | supervise (one step, never ends) | no agent; every role key inline; `main`, `slot: none`, `background: true`, `remote: true`; long allow and deny lists; ~150-line body |

**Duplication**, measured on disk: 20 step files, 400 lines, about 210 distinct lines.
- `review.md` is byte-identical in all four `dev*` folders.
- `ship.md` exists in two variants: `dev` = `dev-planned`, and `dev-build` = `dev-planned-build` = `ui`.
- `plan.md` is identical in both planned folders.
- `implement.md` in `dev` and `dev-planned` differ by three lines (`after: plan`, a comment, `input: plan`). The two `-build` files differ the same way.
- The conditional check line appears in 2 files, and the unconditional build check in 3.
- The "planned" and "build" variants are a 2×2 matrix of whole folders.
- `packages/agent-orchestrator/workflows/ui` is a byte-for-byte copy of `workflows/ui`, required by a test. Its `workflows/agents` also copies the shipper and the two ui agents. That package also ships its own `implement.md` and a codex `review.md`.

Before agents existed (P1, merged `f937d12`), `docs/pivot-2026-09-18.md` §4 counted `review.md` five times with 71 of 228 lines distinct. P1 took the five review files from 228 lines to 72.

**No composition mechanism exists** beyond `agent:`. There is no include, extends, import, or override of another folder. The only per-run overlays are:
- `wf start --gate <step>` and an inbox card's `gate:` (`INBOX_KEYS` = `workflow, repo, queued, gate`, `src/inbox.ts:53`);
- `wf retry --model/--budget/--message` and `wf round --budget` on individual tries.

## 5. How a person customises today

- **By hand:** copy a folder, e.g. `cp -r <repo>/workflows/dev ~/.agent-workflows/workflows/`, and edit the markdown. The api's refusal text says exactly this (`yoursOnly`, `apps/api/src/builder.ts:157`).
- **The board's builder** (`apps/web/src/components/WorkflowBuilder.tsx`, `StepForm.tsx`, `NewWorkflow.tsx`; api `apps/api/src/builder.ts`):
  - It edits **yours only**. Repository workflows show "No builder: the board writes only yours…" (`routes/workflows.tsx:102`).
  - Steps are blocks on a React Flow canvas. Dragging between handles sets `after:`, and a violet handle sets `loop:`.
  - Clicking a block opens a form with one field per key, drawn by kind from `GET /api/workflows/keys` (`KINDS`, builder.ts), each labelled with the package's meaning line.
  - A step with an agent shows the agent's values as placeholders, and a value set on the step becomes the step's own.
  - A schema can be pasted for `output:`.
  - Save sends the whole folder with a `version`; a folder changed on disk since gets a 409. The package's `writeWorkflow` (`src/authoring.ts`) parses the result in memory first, and refusals come back as 422 in the parser's words, naming the steps.
- **The Agents page** (`routes/agents*.tsx`, `AgentForm.tsx`; api `apps/api/src/agents.ts`) edits yours' agents, including their schema and skills. It will not remove or rename an agent a step still names.
- **The Capabilities page** (`apps/api/src/capabilities.ts`) is a read-only inventory of the repository's skills, agents, MCP servers with their tools, and denied rules.
- **What a non-developer can do on the board without editing files:**
  - Pick a listed workflow and start a run (brief, plus runs to wait on; `StartRun.tsx` has no gate or input picker).
  - Park, queue and start inbox cards.
  - Approve, send back, answer or accept at gates.
  - Build a new workflow of their own from blocks and forms. The form still exposes every key in harness vocabulary (permission modes, rule syntax such as `Bash(npm run build)`, `Edit(**)`).

## 6. Skills, MCP, and what agents do versus what the orchestrator does

- **Claude Code skills** live in `.claude/skills/`: `look` (the repository's own) and `shadcn` (third-party, pinned in `skills-lock.json`). A session loads them through the `Skill` tool, which `tools:` allows or omits.
- **MCP.** `.mcp.json` declares `playwright`, enabled in `.claude/settings.json`. Sessions read the checkout's `.mcp.json`. No step key names MCP servers, although the runtime task's `config` (`HarnessArgs`) carries an `mcp` field (`packages/agent-runtime/src/facade.ts` ~75); the orchestrator does not set it. `.claude/settings.json` supplies the allow and deny lists every session inherits:
  - allows `npm test`, typecheck, build, e2e, `npx turbo run test:*`, `node --test:*`, git reads, WebSearch/WebFetch and `npx shadcn@latest:*`;
  - denies `git push` and `git branch -D`.
- **What agents do themselves:** commit in their worktree (Codex through `.codex/rules/git-commit.rules`). The shipper merges onto the base branch in the checkout. `gh` appears in no workflow, and implementers are told not to open PRs.
- **What the orchestrator does in code:**
  - cuts worktrees and branches;
  - provisions `node_modules` (hardlinks, or `npm ci` when the lockfile differs);
  - commits whatever a step leaves (`handOff`, `src/worktree.ts:332`);
  - merges parents' branches for a fan-in;
  - runs checks;
  - reads git ancestry for "shipped" and `--after`;
  - serialises ending steps per checkout.

The README says "Nothing in the packages knows what shipping means". Another repository's `ship.md` "says 'open a pull request with the closeout as its body'" (package README, *The end of a run is a step*).

## 7. Layering rules that constrain any design

`docs/architecture.md` states three rules, each backed by a test:

1. **Only public contracts between packages.** The runtime is reached through `agent-runtime` and `agent-runtime/effect`. The orchestrator is reached through `agent-orchestrator`, `agent-orchestrator/run` and `agent-orchestrator/workflow`, and the last is the pure format. Tests: the `contract.test.ts` files and the judge's `boundary.test.ts`.
2. **Every orchestrator file is one of four kinds** (`test/boundary.test.ts`):
   - pure: workflow, run, check, closeout, plan, inbox and others; no fs, no child_process, no runtime;
   - store: places, workflow-store, store, worktree, authoring and others, loaded as a tree;
   - controller: runner, views, start, tick, verbs, forget, decide, cli;
   - client.
3. **One client.** Only `src/runtime-client.ts` imports agent-runtime.

From CLAUDE.md:
- **The runtime is finished.** It runs one session on one harness and knows nothing of workflows. A knob is a field on the task, read by a runner, never a callback into `decide`.
- **Level-triggered.** A tick reads the world, decides and acts, carrying nothing between passes.
- **One writer per file.** A person's facts (approvals, retries, `.cancelled`, `.hold`) are separate files composed on read.
- **No model call** in a tick, in `assess`, in `wf decide` or at a gate (the judge package is outside all of them).
- **Errors say what to do next.** They are thrown with `exitCode = 2` and name the fix.
- **A guard is proven by a test that makes it refuse.**
- **Hand-mirrored changes.** A new step key must also be mirrored in `apps/api/src/builder.ts` (`KINDS`), `apps/api/src/workflows.ts` (`WorkflowStepSpec`, `specOf`) and `apps/web/src/lib/api/workflows.ts` with `UNSET`.

## 8. Product direction

**`docs/pivot-2026-09-18.md`**
- §3: the project becomes "a machine a person can trust with work of any kind". Work comes in through an inbox and is routed to a team; typed results come back; anything that leaves the machine waits for a person. Code is one preset, and GTD is the first.
- "People who want to build their own can, and it has to be simple: create an agent, say what it is responsible for, put agents in a team."
- The agent is the building block. A step remains a node, and what is attached to it (an agent today; later perhaps a script, an HTTP call or a remote A2A agent) does the work.
- "An agent is an interface, not a file", in three kinds: defined here, a native sub-agent, or remote.
- §5, which stays: least privilege per agent; sending is a separate gated step.
- P2: git becomes one workspace provider.
- P3: capabilities split into read, draft and send, with send gated. It was deferred in favour of A2A skills.
- P9: "Presets are folders, so they stay shareable and diffable". "Create an agent" is a form, and the product's words change (step → agent + wiring, workflow → team, check → verification, gate → approval).
- §4 notes git is the spine of the orchestrator (291 git-bound lines in `run.ts`, at the time).

**`docs/plan-github-ci.md`** (not started; waiting on the project's new name)
- Move to the public GitHub repo, with an Actions workflow on `pull_request` and `merge_group` (test, typecheck, build, e2e, gitleaks), branch protection and a merge queue.
- CODEOWNERS on `.github/`, `.claude/settings.json`, `workflows/` and the `package.json` scripts.
- §6, the factory ships through PRs:
  - a run pushes only its own `wf/<run>/…` branch;
  - `ship` opens the PR (`gh pr create`, body from the closeouts) and enables auto-merge;
  - the gate stays;
  - the run reads CI and queue results with `gh`, level-triggered, "a runtime harness that 'runs' a CI check, or the ship reading the PR's status on each tick; the plan for that step chooses";
  - the shipper's trial merge and hand-run check go away.
- The owner still has to decide whether round checks stay local or move to CI.
- `docs/plan-multi-repo.md` records that the shipped workflows are specific to this repository: npm/turbo checks, and agents that name `apps/web`, turbo and the `look` skill. It lists what ties the api and board to one repository.