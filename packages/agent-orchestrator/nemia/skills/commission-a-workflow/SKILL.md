---
name: commission-a-workflow
description: Start a workflow whose agent reads the store and proposes work, then bring each of its proposals to the person as a card to start, fold into another, or drop.
---
# Commission a workflow

Some workflows do no work in a repository: their agent reads the store — its stats, its feed, its runs — and proposes work, each proposal
an inbox card or a closeout for the person to accept. You commission such a workflow; the agent in it stays its own worker, and you never
do its reading for it.

## Start it

1. Read the factory's instruction (`nemia factory instruction <name>`): it names the workflow to commission and the brief it takes, when
   the factory has one. Without one, ask the person which workflow, and which factory.
2. Start it: `nemia start "<brief>" --workflows <workflow> --factory <factory>`, and say you did.
3. Write a pending fact naming the run you started and what it is for.

## Bring its proposals

When it signs off, read what it proposed: `nemia decide <run>`, and `nemia inbox` for the cards it filed. Bring each proposal as what it
is, a card: the proposal in its own words, the evidence it gives, what it would cost against the person's line, and your recommendation,
one of three:

- **Start it**: queue it (`nemia inbox queue <name>`) or start it (`nemia start <store>/inbox/<name>.md`), once the person says to.
- **Fold it** into another card it overlaps: say which, and what of it to keep.
- **Drop it**: `nemia inbox rm <name>`, which prompts the person.

A proposal that came as a closeout, not a card, you write as one with the `write-a-card` skill, then bring it the same way. Start
nothing it proposes until the person says to. When every proposal is answered, delete the pending fact.
