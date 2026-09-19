---
gate: plan
---
An agent is written once: an `agents/` directory beside the workflow folders, and a step names its agent — agent-workflows, the shipped folders, and the new key's obligations in the apps

This is the first refactor of the pivot (docs/pivot-2026-09-18.md, §4 and §6 P1 — read them if the file is in your checkout; this brief stands without it). The project's building block becomes the agent, not the step. Today a step file mixes WHO does the work with HOW it is wired, so the same step is copied: `review.md` five times with 71 of 228 lines distinct, `ship.md` four times with 34 of 140, `implement.md` five times with 42 of 113. This change splits the two and changes no run.

Read CLAUDE.md, then packages/agent-workflows/src/workflow.ts (`STEP_KEYS`, `STEP_KEY_MEANINGS`, `parseWorkflow`, `parseFolder`, `loadWorkflows`, `workflowsIn`, `workflowFolder`, `validate`, `renderStep`, `StepDraft`, and the "No key is control flow" comment at the top), src/runner.ts (`writeWorkflow`, and where `start` freezes the workflow on the run record), src/run.ts (how a `Run` carries its frozen `workflow`), every folder under workflows/, then the key's three obligations outside the package as CLAUDE.md lists them: `KINDS` in apps/api/src/builder.ts, `WorkflowStepSpec` and `specOf` in apps/api/src/workflows.ts, and apps/web/src/lib/api.ts's mirror with `UNSET` beside it in apps/web/src/lib/builder.ts.

What to build:

1. An agent definition is a markdown file: frontmatter, then the instructions as its body. Its keys are the ROLE keys a step has today — `harness`, `model`, `effort`, `context`, `permissionMode`, `tools`, `disallow`, `remote`, `output` — plus `description`, one line saying when to use this agent (a dispatcher will read it later; nothing reads it yet beyond listing it). Keep the names Claude Code's own sub-agent files use where they overlap (`description`, `tools`, `model`), so one file can later serve as both. WIRING keys — `after`, `resume`, `input`, `workspace`, `slot`, `check`, `retries`, `gate`, `loop`, `rounds`, `budget`, `maxAttempts`, `deadlineSeconds` — are refused in an agent file, by name, with a message that says where they belong.

2. A step may say `agent: <name>`. Its role keys then default to the agent's, the step's own keys win, and its brief is the agent's body followed by the step's own body, which may be empty. A step with no `agent:` works exactly as it does today. An `agent:` naming no agent is refused by name, saying which agents there are.

3. Resolution happens when a folder is loaded, so everything downstream — `validate`, `assess`, `composeBrief`, the runner, the api — sees fully resolved steps and does not change, and the run record freezes the resolved steps at `wf start`. "No command from a checkout" holds for agents too: a run never reads an agent definition from a worktree a step can edit. Propose where `agents/` lives and say why; note that `workflowsIn` lists the directories under the workflows directory, so an `agents` directory there must not read as a workflow folder, and a workflow folder named `agents` must be refused or the two collide. A symlinked agent file is refused by name, as `writeWorkflow` refuses a linked step file.

4. Migrate the shipped folders: one definition each for the implementer, the reviewer, the planner and the shipper (and whatever `ui` and `supervisor` need of their own), with each step file reduced to its wiring, `agent:`, and any words that are truly that folder's. The proof is mechanical: BEFORE you change any folder, capture what every shipped folder resolves to with today's loader, and add a test that pins the resolved steps after the migration as equal to it, field for field, apart from the new `agent` field. A difference is a finding to report, not something to smooth over.

5. The builder round-trips: `renderStep` and `writeWorkflow` write a step that names an agent back with its `agent:` key and only the keys the step itself set, never the inherited ones inlined. On the board a step shows the agent it names; editing agent definitions from the board is NOT part of this change — say so in features.md's *What it leaves*.

6. `wf` says it: the listing of a workflow's steps names each step's agent, and `STEP_KEY_MEANINGS` gains the key's sentence.

Not part of this change, and to be left alone: the closeout schema and `owesReplies`; workspaces and worktrees; any harness; the engine (nothing in packages/agent-engine changes); any model call or judgment; the project's name; teams, dispatch, capabilities.

You own packages/agent-workflows (src, tests, README, docs/features.md), workflows/, and in apps/api and apps/web only what the new key obliges, with their tests and the e2e line a changed page needs. CLAUDE.md gains whatever trap this costs you.

Done means `npm test`, `npm run typecheck`, `npm run build` and `npm run e2e` green from the root, the PNGs read for any page you touched (the look skill), the before-and-after test in place and green, and every new refusal with a test that makes it refuse at shipped defaults, asserted on `err.message`. A rule about names is proven by a fixture that has another name: give a test an agent called something other than its step. Commit as you go, one coherent commit per numbered item, plain messages, no attribution trailers. End your own servers and watchers before you sign off. Sign off by calling the StructuredOutput closeout: `done`, or `blocked` with what you need.

For the plan step: the owner approves your plan before anyone implements it (`gate: plan`). Put the decisions that are really the owner's at the top — where `agents/` lives, whether an agent's body and a step's body are joined or the step's replaces it, and how the before-and-after proof is captured — each with your recommendation and the alternative you rejected.
