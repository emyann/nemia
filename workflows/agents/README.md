# agents

An agent is a node's attachment, and we pass it a brief. A step is a node of its workflow — its place, its wiring,
what it is handed (`input:`) and what it hands on (`output:`) — and what is attached to it does the work. A file here
is one such attachment, written once and named by every node that uses it (`agent: reviewer`): its frontmatter says
who it is — `description:`, then the keys of a role (`harness`, `model`, `effort`, `context`, `permissionMode`, `tools`,
`disallow`, `remote`, `output`) — and its body is its instructions. The step file keeps the wiring: `after`, `input`,
`workspace`, `check`, `budget`, `loop`, `gate`.

| agent | steps that name it |
| --- | --- |
| `implementer` | `implement` in `dev`, `dev-build`, `dev-planned`, `dev-planned-build` |
| `reviewer` | `review` in the same four |
| `planner` | `plan` in `dev-planned`, `dev-planned-build` |
| `shipper` | `ship` in the same four as `implementer` |
| `ui-implementer` | `implement` in `ui` |
| `ui-reviewer` | `review` in `ui` |
| `note-writer` | `write` in `note` |
| `note-reviewer` | `review` in `note` |

At `wf start` each step is resolved and frozen on the run: the agent's keys are the defaults, a key the step
writes wins, and the step's brief is the agent's instructions with the step's own note after them. So a change
here reaches every step that names the agent, on the next run — a run already started keeps what it froze. An
`output:` schema sits here, beside the agent that declares it.

A step may still write words of its own under its frontmatter: a team's note to its agent (*in this team, also check
…*), told after the agent's instructions. It is an escape hatch, not the normal case. Two shipped steps have one: `ship` in `dev-build` and
`dev-planned-build`, whose check builds the web app and runs its e2e, tell the shipper why that matters on the merged
tree. The shipper's own instructions name no check, and serve every dev folder.

The package's README, *Agents*, says the rules: which keys an agent may carry, what refuses, and why a step's
note comes after the instructions and never replaces them.
