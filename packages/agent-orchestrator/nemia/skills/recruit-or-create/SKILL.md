---
name: recruit-or-create
description: Find an agent for a step — search the person's own places, read each candidate against the step's need, propose a few with one recommended, bring the copy and the hire in one message — or, when none fits, write a new one with the person.
---
# Recruit or create

A step needs an agent who can do its work. The person may already have one, in a repository the store knows or in their library: recruit
it rather than write it again. When none fits, write one with them.

## When

- A step has no hire, or the person wants to replace the one it has.
- The person asks who could do a piece of work.
- The `create-a-factory` skill reaches its hires, or an agent the person already has elsewhere.

## Search

Look only where the person keeps agents:

- `nemia agents --repo <path>`: the agents a step of that repository may name already, its own then yours.
- `nemia agents sources`: every agent file the store knows of, each repository's and your library's.
- `nemia agents sources --path <folder>`: a folder of agent files, only one the person named.

Never scan the disk for repositories or agents, and never guess a folder. A place you did not search is said as not searched.

## Read each against the need

First the need: the step's own file — what its body asks, the result its `output:` names, and the command its `check:` runs. Then each
candidate:

- its card, `nemia agents card <name> --repo <path>`, or `--from yours` for one in your library; else its file;
- the skills it is given, and the result schema it closes with, against what the step's `output:` names;
- a source listed as `does not read` is said with its own error, and is no candidate until it reads.

Keep a candidate only for what its card or file says it does, never for its name.

## Propose

A few, at most three, the best first. For each: its name, where it is (the repository or your library, and its file), why it fits the
step, and what it lacks. Recommend one and say why. With none that fits, say so, and offer to create one.

## Recruit

The person chose one. Bring the copy and the hire in one message, the two commands with what each does, and say that each prompts:

1. `nemia agents copy <file>`: the agent, its schema and its skills copied into your library. With `--as <name>` it takes another name
   there.
2. `nemia factory hire <factory> <name> --step <workflow>/<step>`: that agent hired into the step.

An agent already in your library, as it is in its source, goes straight to the hire. A part your library holds otherwise stops the copy,
naming it: say the part, and let the person choose `--as <name>` for the agent or `--keep <part>` for a skill or the schema. A key the
store refuses in the file is said with the copy's own words and its fix.

A recruit is copied into the person's library, never into a repository.

## Create

None fits, or the person wants their own. Write it with them, one question at a time: what it does, what it is given, what it closes with.

1. Draft it in your own folder, `drafts/<factory>/agents/<name>.md`, with the result schema its `output:` names beside it, and show it.
2. `nemia agents write yours --file drafts/<factory>/agents/<name>.md`: it prompts.
3. `nemia agents run yours <name> --brief "<words>"`, on a brief small enough to read in a minute, and bring what it did.
4. Hire it: `nemia factory hire <factory> <name> --step <workflow>/<step>`.

A schema no verb writes is placed by the person: the `create-a-factory` skill says how to keep it pending until it is there.
