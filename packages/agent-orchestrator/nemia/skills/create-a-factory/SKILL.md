---
name: create-a-factory
description: Make a whole factory, short of a run — create it, write its workflows, agents and skills into yours, attach its workflows, hire agents into steps, write its rules and its instruction, try an agent on a short brief — and stop before any work starts.
---
# Create a factory

A factory is a set of repositories, the workflows attached to it, and the agents hired into their steps (`nemia factory --help`). You
make one whole, short of a run, and stop before any work starts: starting is the person's next step, not part of making it.

Each write to a factory's definition prompts the person (the `verbs` skill): say what it does before you run it, one at a time.

## 1. Ask what it is for

What the factory builds, on which repositories, and how its work should go: the steps, who does each, what is checked, where a
person decides. Read what exists first — `nemia factory`, `nemia agents --repo <path>`, the repository's own `workflows/` folder — and
build on it rather than beside it.

## 2. Create it

`nemia factory add <name> --repo <path>`, a `--repo` for each repository, as an absolute path.

A factory has its own level, `nemia level <level> --factory <name>`, and follows the store's until it has one. Its level is the person's
to set: you never raise it.

## 3. Its workflows, agents and skills, written into yours

You write a factory's workflows, agents and skills yourself, into yours, never into its repositories. Each write prompts the person: say
what it writes and why, then run it. Write the file or folder in your own folder first, under `drafts/<factory>/`, as the factory will
read it, then write it into yours from there:

- an agent: `drafts/<factory>/agents/<name>.md`, with the result schema its `output:` names beside it —
  `nemia agents write yours --file drafts/<factory>/agents/<name>.md`;
- a skill: `drafts/<factory>/skills/<name>/SKILL.md` — `nemia skills write yours --file drafts/<factory>/skills/<name>/SKILL.md`;
- a workflow: `drafts/<factory>/<workflow>/`, a markdown file per step, its keys in its frontmatter, and its README —
  `nemia workflows write yours <workflow> --folder drafts/<factory>/<workflow>`.

An agent the person already has, in another factory's repository or in their library, is recruited with the `recruit-or-create` skill, not
written again. To start from one that exists, copy it there and change the copy. To change one in yours, write it again with `--version`,
the version it was read at: a write without one, of a name there already, is refused naming the version it is at now — read it again, and
write your change on what it holds. `nemia agents rm` and `nemia workflows rm` take one back, at its version too.

**Two things no verb writes**: a workflow's own `*.schema.json`, beside its steps, and a skill's files beside its SKILL.md. Draft those
in the same folder, show the person each, and ask them to place it — on the board, or copied into yours by hand. Keep a pending fact
naming each until they say it is there, and check that it is.

What you write is the factory's words, and its taste is the person's: name each file you wrote when you say what stands, so they read it
before work depends on it.

## 4. Attach its workflows

`nemia factory attach <factory> <workflow>`, by the workflow's folder name, once it is written. `nemia factory detach` takes one back.

## 5. Hire agents into steps

Who to hire into a step, find with the `recruit-or-create` skill. `nemia factory hire <factory> <agent> --step <workflow>/<step>`, one agent
a step; `nemia factory fire <factory> --step <workflow>/<step>` takes a hire back. A step whose own file names its `agent:` takes no hire.

## 6. Its rules, and its instruction

Two files, each told to someone else.

**Its rules** are what every agent hired into the factory is told, in every step of every run started there, after the agent's custom
instructions and before the step's own policy: the factory's rules and policies, whoever does the work. Draft them in
`drafts/<factory>/RULES.md`, show them, then `nemia factory rules <factory> --file drafts/<factory>/RULES.md`; `nemia factory rules
<factory>` reads them back and `--clear` removes them. They are kept in your store, never in a repository, and only add words: a
frontmatter block is refused. A run freezes them when it starts, so an edit reaches only the runs started after it. A factory with none
tells nothing.

**Its instruction** is yours: what you are to know about the factory, which wins over your habits there. No step is told it. Draft it
in `drafts/<factory>/NEMIA.md` and show it. The person may keep it in the repository (`NEMIA.md` in its first folder, which they place); or, kept in the store,
`nemia factory instruction <factory> --store`, then `nemia factory instruct <factory> --file drafts/<factory>/NEMIA.md`.

Words a person adds to one agent without rewriting it are its custom instructions: `nemia agents custom <name> --file <path>`.

## 7. Try an agent on a short brief

Before work depends on an agent, try it: `nemia agents run yours <name> --brief "<words>"`, on a brief small enough to read in a minute.
A try is yours to run unasked: one step of that agent, in a folder of its own, capped at a dollar, one at a time an agent. Say that you
started it, follow it with `nemia ls`, and bring what it did.

## 8. Stop, and say what stands

Say what is in place and what is not, apart:

- **Placed**: the factory, its repositories, the workflows attached, each hire, its instruction — as `nemia factory` reads them now.
- **Written**: each workflow, agent and skill you wrote into yours, by its file, for the person to read; and each try, with what it did.
- **Drafted, not placed**: each schema or skill file still only in your folder.
- **Next**: the first card to start, or the draft to place first.

Never call a factory complete while a draft of it waits to be placed.
