---
name: create-an-agent
description: "How to create an agent in Nemia — who it is (a name, a role, a description), its file and keys, its instructions, its closeout schema, its skills (and a third party's, vendored and credited), its fence, how it talks with a person in rounds, and how to check it loads and runs. For a person or a session writing or changing an agent, and for a review of one."
---

# Create an agent in Nemia

An agent is a hire: a person with a job, standards (its skills) and equipment (its tools). A workflow's step is a position it fills; one
agent can fill positions in several workflows. A person's factories get no agent from Nemia: a repository's team is in its `workflows/`, a
person's in `~/.agent-workflows/workflows/`, and the board's Agents page writes the second. Read Nemia's README, *An agent is a node's
attachment*, for the whole format; this is the procedure, and what it cost to learn.

## Who it is

- **Its name is its file's**, `agents/<name>.md`, a person's first name in lower case (`nora`), and a step names it by that
  (`agent: nora`). The board shows the name as a person's (`Nora`) beside a face drawn from it (Blobatar), the same wherever it shows.
- **`role:`** is the job it holds, in a few words (`Product engineer`); **`description:`** says when to attach it, one line. Both are the
  agent's own lines, with `harnessPrompt:`: a step that sets one is refused. A step's `skills:` adds to its agent's (*Its skills*).
- **`mcp:`** names the MCP servers its sessions load, by the names the checkout's `.mcp.json` gives them (`mcp: playwright`). A step's
  `mcp:` adds to its agent's, as its `skills:` does: a server only one repository has is named by the step that needs it, so the agent
  stays portable. A session loads the servers its agent and its step name and no other: with no line on either it loads none, and a
  name the checkout does not declare refuses the session at its start. Loading a server allows none of its tools: its fence still
  decides. An agent that names one cannot be tried, since a try has no checkout.
- A `name:` line must equal the file's name; `card:` is retired (the card is generated from its skills: `npx wf agents card <name>`).

## The file

Frontmatter, then its instructions. The other keys are how its sessions run — `harness`, `model`, `effort`, `context`, `permissionMode`
(`sandbox` on codex), `tools`, `disallowedTools`, `allowedTools`, `remote`, `output` — and a step that names it takes each unless it sets
its own. Wiring is the step's and refused here: `after`, `input`, `workspace`, `check`, `gate`, `loop`, `budget`, `background`.

- **The frontmatter is YAML**, as a step's and a skill's are, every value read as the text written. Quote a value that holds `: ` or
  ` #`, or opens on a YAML sign (`[`, `{`, `*`, `&`, `!`, `|`, `>`, `-`, `?`), as in `description: "Reviews a change: its correctness"`.
  Write a long one as a literal block, `|-` and the value on the lines below it, indented. A list key takes `Read, Grep` or
  `[Read, Grep]`; the board writes the first.
- Say `effort:` and `context:` (`200k`): a job reads no user settings, and a session left unbounded reads up to a million tokens on every
  call.
- `auto` is refused at load on the models measured to drop it (haiku, `claude-sonnet-4-5`); name `dontAsk` with rules there.

## Its instructions

The body is its instructions, appended to Claude Code's own prompt (`harnessPrompt: keep`; `no-coding` drops the harness's coding section,
`replace` puts the instructions in its place). Keep them generic and short: who it is, what it is accountable for, what it never does, how
it ends a turn, what its closeout holds. The procedure belongs in a skill, and a rule the machinery holds (a fence, a gate) needs no
sentence. A resumed session keeps the body it started with: an edit reaches the next run, never one in flight.

## The five layers

The instructions are one of five layers that shape an agent apart from its task, each written by whoever owns it:

1. **Instructions** — the agent's body: who it is, wherever it is hired.
2. **Custom instructions** — what a person adds to an agent they use without rewriting it, kept in their store, one file per agent name
   (`wf agents custom <name>`), never in the agent's folder. Words only: they set no key, so they never widen the fence or give a tool.
   A run freezes them when it starts, so an edit reaches only the runs after it.
3. **The folder's files** — the files the harness reads from the folder the agent works in (today `CLAUDE.md`, `AGENTS.md`): what holds
   there for every agent at work in it. Nemia composes nothing of them. They rank above the agent's own instructions and below the
   factory's rules and the step's policy, although a harness presents them as overriding everything: that framing is the harness's.
4. **The factory's rules** — the rules and policies of one factory, told to every agent hired into it: one file a factory, kept in the
   store (`nemia factory rules <name>`), never in a repository. Words only, and frozen by a run when it starts, as custom instructions
   are. A step on a remote agent is told none.
5. **The step's policy** — the step's own words and keys: what this position of this process asks of a role. A normal layer, not a
   workaround: say there what one workflow expects, and keep it out of the instructions. A step may add skills, never take one away.

The number is precedence: where two layers say different things, the higher number wins, and the task is above them all. The order the
words arrive in is a separate thing — instructions, custom instructions, the factory's rules, the step's policy, then the task, with
the folder's files read by the harness wherever the agent works. Which layer owns a new instruction is Nemia's own routing rule, *Where
a new instruction goes*, said once in the shipped *Five layers* passage: ask it rather than guess. Fences only tighten: a step may narrow its agent's fence and
never widen it — a step's `disallowedTools:` adds to its agent's, and the loader refuses a step's `tools:`, `allowedTools:`,
`permissionMode:` or `sandbox:` that would
give the agent what its file does not, and a step's `background: true` over an agent in any mode but `bypassPermissions`. So the
instructions say what holds for the role everywhere, and nothing about one workflow or one workspace.

## Its closeout

`output: <name>.schema.json`, a JSON Schema beside the agent: what the step hands on, decoded strictly. House style: every field
`described`, `required`, `additionalProperties: false`.

- **Reserved:** `outcome`, `summary`, `artifacts`, `needs` are the run's own on every closeout; the loader refuses a schema that declares
  one. (Iris's intent says `proposedOutcome` for that reason.)
- Keep a schema the same across the tries of a session: a continued session given a changed schema rebuilds its whole prompt cache.
- A step reads a closeout with `input: <step>` from any step it waits on, through the steps between too; a step that loops (`loop:`)
  may wait on one step only, so it reads what came before the loop that way (a reviewing step reads the spec so).

## Its skills

`skills: <a>, <b>` names folders holding a `SKILL.md`, looked for in `skills/` beside the agents folder, then in the repository's
`.claude/skills/`, then the store's. `tools:` must allow `Skill`. The repository's `.claude/skills/` is found only when the repository is
the step's place, as a start gives it: a test that loads a folder passes the place too. A step with an agent may add skills with its
own `skills:`: the session gets the agent's, then the step's, each once. The agent's fence must already load them; a step never widens it.

- **Write a skill** with skill-creator's method: a `description:` that says when to use it, a short body, detail in files beside it.
- **Use someone else's** unchanged: in a scratch project, `DO_NOT_TRACK=1 npx skills add <owner>/<repo> --skill <name> --agent
  claude-code --copy -y`; copy the folder into `.claude/skills/`, merge its entry into `skills-lock.json`, and add its author, source and
  licence to `THIRD_PARTY_NOTICES.md` (MIT asks for the notice in every copy). Never edit it — the lock pins it — and adapt it in the
  agent's body. Vendor the skill a model may invoke: one saying `disable-model-invocation: true` is a person's slash command (`grill-me`
  only calls `grilling`).

## Its fence

- **A role that writes nothing runs `dontAsk`.** Only reads in its workspace, read-only commands, and what an allow rule names run; the
  rest is refused without asking. The repository's settings may allow commands other roles need that write into the workspace (a build,
  say), so an agent given `Bash` denies each by name in `disallowedTools:`. A sub-agent inherits the mode and the rules; list `Agent` in
  `allowedTools:` so the dispatch itself is never refused. Allow by exact name each check the role runs that the settings do not; its
  skill spells each bare, one per call (one wrapped, piped, redirected, or behind `cd`, `git -C`, `VAR=` or `for` is refused), and sends a
  read or search to Read, Grep or Glob, not Bash.
- **A role that edits runs `auto`**, and denies by name what it must never do: `Bash(git push)`, `Bash(git push:*)`, `Bash(git branch
  -D:*)`, `Bash(git branch --delete --force:*)`, `Bash(pkill:*)`, `Bash(killall:*)`, `mcp__playwright__browser_run_code_unsafe`.
- **A step only tightens it.** A step that needs a tool, an allow or a mode its agent's file does not give needs another agent; a
  step's `disallowedTools:` adds to its agent's: write only the denies the step adds; it can never take one of the agent's away.
- **A background session** (`background: true`) also reads the person's user and local settings, where "don't ask again" writes allows:
  it denies those seven itself, whatever its mode. A step may set it only over an agent in `bypassPermissions`, the one mode no allow rule
  widens; over any other the loader refuses it.

## Talking with a person

A step is a job (`claude -p`): it cannot wait inside a conversation. To ask, it signs off `blocked` with its questions; the person
answers on the board or with `wf retry <run> <step> --message "…"`, and the same session continues with the answers as its next turn.
Say so in the body of an agent that interviews, and gate the step whose closeout a person must accept (`gate: true`). A job's last
turn is its sign-off: an agent that runs long commands (the e2e) is told to run them in the foreground or wait on them, never to sign
off with one running (an engineer's first web build once signed off before its e2e ended). A closeout signed `blocked` is read on its
own, so an agent that asks in rounds carries everything settled so far in each one: an interviewer's third round once dropped its earlier
decisions. Declare the questions as a field of the output schema, `{ "x-shape": "questions", "description": "…" }`, which the loader
expands to one strict shape: the board draws them as choices a person answers by clicking.

## Check it

1. `npx wf agents card <name>` from the repository: the real loader reads the file — its keys, its schema's reserved names, each skill
   found — and prints the card, or refuses in words that name the fix.
2. The repository's own checks, where its guards read every folder it ships (the fences, the frozen steps, the render round trip): run
   them past any cache that does not see the workflows folder.
3. Run it: a gated workflow that names it, on a small real card, and read its closeout before approving.
4. Name the new agent where the repository lists its agents.

## When you learn something

Creating an agent is how this skill is tested. When a step here was wrong or missing — a refusal you met, a key that surprised you —
fix this file in the same change as the agent, in three lines at most, with the file that holds the rule.
