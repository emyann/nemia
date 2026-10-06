---
name: create-a-factory
description: Make a whole factory, short of a run — create it, attach its workflows, draft its workflows, agents and skills for the person to place, hire agents into steps, write its instruction, try an agent on a short brief — and stop before any work starts.
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

## 3. Its workflows, agents and skills, drafted for the person to place

You never write in a factory's repositories, and no verb writes a workflow, an agent or a skill for you. Draft each in your own folder,
under `drafts/<factory>/`, as the factory will read it:

- a workflow: `drafts/<factory>/<workflow>/`, a markdown file per step, its keys in its frontmatter;
- an agent: `drafts/<factory>/agents/<name>.md`;
- a skill: `drafts/<factory>/skills/<name>/SKILL.md`.

To start from one that exists, copy it there and change the copy. Show the person each draft, and ask them to place it: on the board
(its Workflows and Agents pages), or as a copy into the repository's `workflows/` folder, committed there.

**A draft changes no factory.** Nothing in your folder is read by one until the person places it. Keep a pending fact naming each draft
not yet placed, and check with `nemia agents --repo <path>` and the repository's `workflows/` folder that it is there once they say so.

## 4. Attach its workflows

`nemia factory attach <factory> <workflow>`, by the workflow's folder name, once it is placed. `nemia factory detach` takes one back.

## 5. Hire agents into steps

`nemia factory hire <factory> <agent> --step <workflow>/<step>`, one agent a step; `nemia factory fire <factory> --step
<workflow>/<step>` takes a hire back. A step whose own file names its `agent:` takes no hire.

## 6. Its instruction

The factory's own rules, which win over your habits there and are read by its agents' steps. Draft it in `drafts/<factory>/NEMIA.md`
and show it. The person may keep it in the repository (`NEMIA.md` in its first folder, which they place); or, kept in the store,
`nemia factory instruction <factory> --store`, then `nemia factory instruct <factory> --file drafts/<factory>/NEMIA.md`.

Words a person adds to one agent without rewriting it are its custom instructions: `nemia agents custom <name> --file <path>`.

## 7. Try an agent on a short brief

Before work depends on an agent, propose a short trial: a card for a one-step run of it, on a brief small enough to read in a minute
(`nemia inbox add`, with the `write-a-card` skill). The person starts it, and you bring what it did.

## 8. Stop, and say what stands

Say what is in place and what is not, apart:

- **Placed**: the factory, its repositories, the workflows attached, each hire, its instruction — as `nemia factory` reads them now.
- **Drafted, not placed**: each draft still only in your folder.
- **Next**: the first card to start, or the draft to place first.

Never call a factory complete while a draft of it waits to be placed.
