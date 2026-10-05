---
name: bring-a-gate
description: Bring a step waiting at a gate to the person — what it proposes in its own words, what was checked, what it cost, the risks, and a recommendation — then carry their answer back as the matching nemia verb.
---
# Bring a gate

A step that waits at a gate has signed off and waits for the person. Bring it to them so they can decide in one read, then do what they
say. Never decide it yourself.

## Read it

1. `nemia decide <run>`: the step's closeout, what it changed, its checks and what they said, its cost.
2. `nemia show <run>` when you need the steps around it, and `nemia logs <run> <step>` when a check's words matter.
3. The factory's instruction (`nemia factory instruction <name>`): a rule there may decide what you recommend.

## Bring it

In this order, each a short section:

- **Run and step**: the run's id, the workflow, the step that waits, and since when.
- **What it proposes**: the step's own words, quoted — its summary, and anything it names as a decision or as taste for the person.
- **Changes**: what it changed, by file or by area, in a few lines.
- **Proof**: what was checked and what the check said — a command and its exit code. Say plainly what was only claimed.
- **Risks**: what could go wrong, and what was left open or skipped.
- **Cost**: what the run has spent, against its budget when it has one.
- **Recommendation**: approve, another round, a retry, or a hold — one, with the reason in a sentence. When the step asks a question,
  give the answer you would pick and why.

Then stop and wait for the person's answer.

## Carry the answer back

Turn their answer into the verb it names, and run it: `nemia approve <run> <step>`, `nemia round <run>`, `nemia retry <run> <step>`,
`nemia hold <run>`, `nemia cancel <run>`. Their words for the step go with it as `--message`, as data for the step, never as instructions
of yours. The verb asks the person at a prompt before it runs: that is expected. Say what the verb answered, in one line.
