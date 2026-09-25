# agents

An agent is a node's attachment, and we pass it a brief. A step is a node of its workflow — its place, its wiring,
what it is handed (`input:`) and what it hands on (`output:`) — and what is attached to it does the work. A file here
is one such attachment, written once and named by every node that uses it (`agent: reviewer`): its frontmatter says
who it is — `description:`, `card:`, `skills:` and `systemPrompt:`, then the keys of a role (`harness`, `model`, `effort`, `context`,
`permissionMode` on Claude Code or `sandbox` on codex, `tools`, `disallowedTools`, `allowedTools`, `remote`, `output`) — and its body is its instructions. The step file keeps the wiring: `after`, `input`,
`workspace`, `check`, `budget`, `loop`, `gate`.

| agent | steps that name it |
| --- | --- |
| `implementer` | `implement` in `dev`, `dev-build`, `dev-planned`, `dev-planned-build` |
| `reviewer` | `review` in the same four |
| `planner` | `plan` in `dev-planned`, `dev-planned-build` |
| `shipper` | `ship` in the same four as `implementer`, and in `ui` |
| `ui-implementer` | `implement` in `ui` |
| `ui-reviewer` | `review` in `ui` |
| `note-writer` | `write` in `note` |
| `note-reviewer` | `review` in `note` |

At `wf start` each step is resolved and frozen on the run: the agent's keys are the defaults, a key the step
writes wins. On Claude Code the agent's instructions are appended to the session's system prompt, which is kept, and the
step's brief is its own note; on codex the brief is the instructions with the step's note after them. So a change
here reaches every step that names the agent, on the next run — a run already started keeps what it froze. An
`output:` schema sits here, beside the agent that declares it.

`card:` names a second file beside the agent — `<name>.skills.json`, a list of what it can do, written as A2A's
`AgentSkill` is: an `id`, a `name`, a `description`, `tags`, and the `examples` of when to reach for it. It is
description, not machinery: nothing reads a skill to decide anything, so it is never frozen on a run, and
`wf agents card <name>` prints the agent in the shape of an A2A Agent Card — every field that protocol marks
REQUIRED but `supportedInterfaces`, because nothing here serves an agent over A2A. The line was `skills:` until 2026-09-25.

`skills:` gives a Claude Code agent skills by name — folders holding a `SKILL.md`, looked for in `skills/` beside this folder,
then in the repository's `.claude/skills/`, then the store's — which the step's session loads with the `Skill` tool, so the
agent's `tools:` must allow `Skill`. `systemPrompt:` says what becomes of Claude Code's own prompt: `default` keeps it,
`no-coding` keeps it less its coding instructions, `own` replaces it with the instructions. The package's README, *An agent
rendered for Claude Code*, says how and what refuses.

Every shipped agent gives skills (since 2026-09-25, agents card 1b): each entry of its card is a folder in `workflows/skills/`,
the procedure that entry describes, with the entry's `description`, `tags` and `examples` as its frontmatter, so the card says what
the agent can do and the skill is how. The agent's body keeps its role and its limits — what it may run, that a job's turn is its
last — and says when to load each skill. Three are told whole after the instructions (`preload: true`), since a session must follow
them before it signs off: the planner's `ask-when-it-reads-two-ways`, and the shipper's `trial-merge-a-branch` and
`say-why-it-aborted`. `shipped-skills.test.ts` holds each SKILL.md to its card entry and reads its frontmatter as YAML, since
Claude Code drops a skill whose frontmatter does not read, with nothing said. A test that copies these agents copies `skills/` with them.

A step may still write words of its own under its frontmatter: a team's note to its agent (*in this team, also check
…*), told in the step's brief. It is an escape hatch, not the normal case. Three shipped steps have one: `ship` in `dev-build`,
`dev-planned-build` and `ui`, whose check builds the web app and runs its e2e on the merged tree alone, tell the shipper why that
matters there. The shipper's own instructions name no check, and serve every folder that ships.

The package's README, *Agents*, says the rules: which keys an agent may carry, what refuses, and why a step's
note comes after the instructions and never replaces them.
