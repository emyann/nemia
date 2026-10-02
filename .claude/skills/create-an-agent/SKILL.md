---
name: create-an-agent
description: "How to create an agent in Nemia — who it is (a name, a role, a description), its file and keys, its instructions, its closeout schema, its skills (and a third party's, vendored and credited), its fence, how it talks with a person in rounds, and how to check it loads and runs. For a person or a session writing or changing an agent, and for a review of one."
---

# Create an agent in Nemia

An agent is a hire: a person with a job, standards (its skills) and equipment (its tools). A workflow's step is a position it fills; one
agent can fill positions in several workflows. A person's factories get no agent from Nemia: this repository's team is in `workflows/`, a
person's in `~/.agent-workflows/workflows/`, and the board's Agents page writes the second. Read `packages/agent-orchestrator/README.md`,
*An agent is a node's attachment*, for the whole format; this is the procedure, and what it cost to learn.

## Who it is

- **Its name is its file's**, `agents/<name>.md`, a person's first name in lower case (`iris`), and a step names it by that
  (`agent: iris`). The board shows the name as a person's (`Iris`) beside a face drawn from it (Blobatar), the same wherever it shows.
- **`role:`** is the job it holds, in a few words (`Product engineer`); **`description:`** says when to attach it, one line. Both are the
  agent's own lines, with `skills:` and `systemPrompt:`: a step that sets one is refused.
- A `name:` line must equal the file's name; `card:` is retired (the card is generated from its skills: `npx wf agents card <name>`).

## The file

Frontmatter, then its instructions. The other keys are how its sessions run — `harness`, `model`, `effort`, `context`, `permissionMode`
(`sandbox` on codex), `tools`, `disallowedTools`, `allowedTools`, `remote`, `output` — and a step that names it takes each unless it sets
its own. Wiring is the step's and refused here: `after`, `input`, `workspace`, `check`, `gate`, `loop`, `budget`, `background`.

- Say `effort:` and `context:` (`200k`): a job reads no user settings, and a session left unbounded reads up to a million tokens on every
  call.
- `auto` is refused at load on the models measured to drop it (haiku, `claude-sonnet-4-5`); name `dontAsk` with rules there.

## Its instructions

The body is appended to Claude Code's system prompt (`systemPrompt: default`; `no-coding` drops its coding section, `own` replaces it).
Keep it generic and short: who it is, what it is accountable for, what it never does, how it ends a turn, what its closeout holds. The
procedure belongs in a skill, and a rule the machinery holds (a fence, a gate) needs no sentence. A resumed session keeps the body it
started with: an edit reaches the next run, never one in flight.

## Its closeout

`output: <name>.schema.json`, a JSON Schema beside the agent: what the step hands on, decoded strictly. House style: every field
`described`, `required`, `additionalProperties: false`.

- **Reserved:** `outcome`, `summary`, `artifacts`, `needs` are the run's own on every closeout; the loader refuses a schema that declares
  one. (Iris's intent says `proposedOutcome` for that reason.)
- Keep a schema the same across the tries of a session: a continued session given a changed schema rebuilds its whole prompt cache.
- A step reads a closeout with `input: <step>` from any step it waits on, through the steps between too; a step that loops (`loop:`)
  may wait on one step only, so it reads what came before the loop that way (`workflows/build/review.md` reads the spec).

## Its skills

`skills: <a>, <b>` names folders holding a `SKILL.md`, looked for in `skills/` beside the agents folder, then in the repository's
`.claude/skills/`, then the store's. `tools:` must allow `Skill`. The repository's `.claude/skills/` is found only when the repository is
the step's place, as a start gives it: a test that loads a shipped folder passes the place too (`placesOf` in
`packages/agent-orchestrator/test/team.ts`).

- **Write a skill** with skill-creator's method: a `description:` that says when to use it, a short body, detail in files beside it.
- **Use someone else's** unchanged: in a scratch project, `DO_NOT_TRACK=1 npx skills add <owner>/<repo> --skill <name> --agent
  claude-code --copy -y`; copy the folder into `.claude/skills/`, merge its entry into `skills-lock.json`, and add its author, source and
  licence to `THIRD_PARTY_NOTICES.md` (MIT asks for the notice in every copy). Never edit it — the lock pins it — and adapt it in the
  agent's body. Vendor the skill a model may invoke: one saying `disable-model-invocation: true` is a person's slash command (`grill-me`
  only calls `grilling`).

## Its fence

- **A role that writes nothing runs `dontAsk`.** Only reads in its workspace, read-only commands, and what an allow rule names run; the
  rest is refused without asking. The repository's `.claude/settings.json` allows commands for other roles — `npm run build` and
  `npm run e2e` write into the workspace — so an agent given `Bash` denies them by name: `disallowedTools: Bash(npm run build), Bash(npm
  run e2e)`. A sub-agent inherits the mode and the rules; list `Agent` in `allowedTools:` so the dispatch itself is never refused.
  Allow by exact name each check the role runs that the settings do not (`npm run lint`, `npx turbo run typecheck --force`); its skill
  spells each bare, one per call (one wrapped, piped, redirected, or behind `cd`, `git -C`, `VAR=` or `for` is refused), and sends a read
  or search to Read, Grep or Glob, not Bash. Its agent and skill join `CHECKERS` in `packages/agent-orchestrator/test/agent-fences.test.ts`.
- **A role that edits runs `auto`**, and denies by name what it must never do: `Bash(git push)`, `Bash(git push:*)`, `Bash(git branch
  -D:*)`, `Bash(git branch --delete --force:*)`, `mcp__playwright__browser_run_code_unsafe`.
- **A background session** (`background: true`) also reads the person's user and local settings, where "don't ask again" writes allows:
  it denies those five itself, whatever its mode. `packages/agent-orchestrator/test/agent-fences.test.ts` holds every shipped step to
  this.

## Talking with a person

A step is a job (`claude -p`): it cannot wait inside a conversation. To ask, it signs off `blocked` with its questions; the person
answers on the board or with `wf retry <run> <step> --message "…"`, and the same session continues with the answers as its next turn.
Say so in the body of an agent that interviews, and gate the step whose closeout a person must accept (`gate: true`). A job's last
turn is its sign-off: an agent that runs long commands (the e2e) is told to run them in the foreground or wait on them, never to sign
off with one running (Ada's first web build signed off before its e2e ended). A closeout
signed `blocked` is read on its own, so an agent that asks in rounds carries everything settled so far in each one: Iris's third
round once dropped her earlier decisions. Declare the questions as a field of the output schema, `{ "x-shape": "questions", "description":
"…" }`, which the loader expands to one strict shape (`question/question.ts`): the board draws them as choices a person answers by clicking.

## Check it

1. `npx wf agents card <name>` from the repository: the real loader reads the file — its keys, its schema's reserved names, each skill
   found — and prints the card, or refuses in words that name the fix.
2. `npx turbo run test --force --continue`, `npm run typecheck`, `npm run lint`: the guards read every shipped folder (the fences, the
   frozen steps, the render round trip). Turbo does not see `workflows/`: force it.
3. Run it: a gated workflow that names it, on a small real card, and read its closeout before approving.
4. Name the new agent in the root `CLAUDE.md`'s *Where things are*.

## When you learn something

Creating an agent is how this skill is tested. When a step here was wrong or missing — a refusal you met, a key that surprised you —
fix this file in the same change as the agent, in three lines at most, with the file that holds the rule.
