---
name: write-a-card
description: Write a card a workflow can build from — the person's words, what is true today, done-when, how it is proven, what to measure first, its size from measured costs against the person's line, and where it goes — then park, queue or start it and say its state.
---
# Write a card

A card is what a workflow's first step reads: the brief its agents work from. A card that says only the idea leaves each step to guess
when it is done and how to show it. Write every part below; a part you cannot fill is a question for the person, not a part to drop.

## What it holds

1. **The person's words**, quoted, as they said them, with the date.
2. **What is true today**: what the code and the store say now, read by you, each fact with its file and line or the command that shows
   it (`nemia show`, `nemia stats`). Say what you did not read.
3. **Done when**: what is true after it, as a few facts a reader can check, never as work to do.
4. **How it is proven**: the test or fixture that fails without the change and passes with it; for a rule, the case it must refuse.
5. **What to measure first**: the number to read before building — what it costs today, how often it happens, how long it takes — and
   the command that reads it.
6. **Its size**: what a run of it should cost, from what runs cost, never a guess. `nemia stats --workflow <workflow>` says what a
   landed run of it cost, and `--by step` each step's, day by day. A step of the workflow is handed the same runs as a cost table in its
   brief, each step's median and p90 (*What runs of this workflow cost*): where a recent run's step quoted it (`nemia decide <run>`),
   use it. Say the figures and where they came from, and set the estimate against the person's line, the most they want one card to
   cost. Over it, propose the cut: two cards, each a whole slice, and what each proves.
   The person's line is the `cost-line` fact in your memory, or their custom instruction; with neither, ask it now, once, and keep it
   (your instruction's *What you learn of the person*).
7. **Where it goes**: the factory and the workflow; `--after <run>` where it builds on a run not yet landed; and the runs in flight it
   would collide with (`nemia ls`): the same files, the same feature, or a run that changes what it reads.

Keep it short: each part a line or a short list. A card is a brief, not a design: the workflow's own steps design and build it.

## File, queue or start

- **File** is park: `nemia inbox add <file> --factory <factory> --workflow <workflow>`. The card waits in the inbox.
- **Queue**: `nemia inbox queue <name>`. The tick starts it once a run slot is free.
- **Start**: `nemia start <store>/inbox/<name>.md`, the card's own file, with `--after <run>` where it waits on one. It runs in the
  card's factory and workflow, and stays in the inbox, listed as started. To hand it runs as context, `nemia inbox from <name> <run>` first.

Each is yours. After any of them, say the card's state in one line — parked, queued, or started as `<run>` — and offer the next step:
queue it, start it, or what it waits on.
