---
name: bring-what-waits
description: Bring what waits on the person — a step at its gate, a step's question to them, a loop out of rounds — in chat with a recommendation, then run the verb they choose with their words as --message, so its prompt is their decision, asked once.
---
# Bring what waits

Three things wait on the person, and only these: a step at its gate, a step's question to them, and a loop out of rounds. Each is
theirs to decide. Bring it in chat so they can decide in one read, with the verb you recommend; then run the verb they choose, with
their words as `--message` where the verb takes it. The verb prompts them as it runs: that prompt is their decision, asked once, since
they just gave it in chat. When they decline the prompt, ask what they want instead, and run that verb, which prompts again.

Everything else is yours, and is not brought here: a check that did not finish you run again (`nemia retry <run> <step> --recheck`), a
check that refused the work you report with its exit code, a hold or a merge you do and say. The `verbs` skill classes every verb.

Before any of them, read the factory's instruction (`nemia factory instruction <name>`): a rule there may decide what you recommend.

## A step at its gate

A step whose workflow gives it a `gate:` has signed off and waits, at its gate, for the person to let it hand on.

Read it with `nemia decide <run>`: the step's closeout, what it changed, its checks and what they said, its cost. `nemia show <run>` gives
the steps around it, `nemia logs <run> <step>` a check's words.

Bring it, a short part each:

- **Run and step**: the run's id, the workflow, the step that waits, and since when.
- **What it proposes**: the step's own words, quoted — its summary, and what it names as a decision or as taste for the person.
- **Changes**: what it changed, by file or by area, in a few lines.
- **Proof**: what was checked and what the check said — a command and its exit code. Say plainly what was only claimed.
- **Risks**: what could go wrong, and what was left open or skipped.
- **Cost**: what the run has spent, against its budget and the person's line.
- **Recommendation**: one, with its reason in a sentence:
  - let it hand on: `nemia approve <run> <step> --message "<their words>"`;
  - send it back with what to change: `nemia retry <run> <step> --message "<their objection>"`.

A hold is yours, at its gate too: when the step cannot hand on yet, because what it needs has not shipped, hold the run
(`nemia hold <run> --until <other run> --why "<words>"`) and say so when you bring it. So is a merge, when the loop's work no longer
merges on its base (`nemia merge <run>`): do it, and say it was done.

## A step's question to the person

A step that signed off blocked asks the person something: its `needs`, or questions in its closeout. `nemia ls` says `BLOCKED`, and
`nemia decide <run>` prints the question and the line that answers it.

Bring it:

- **Run and step**: as above.
- **The question**: in the step's own words, quoted, each question apart, with its choices when it gives some.
- **What it rests on**: what the step read or tried, in a line or two, and what you read yourself to check it.
- **Recommendation**: the answer you would give to each question, and why, in a sentence.

Answer with the step's session continued and told their answer:
`nemia retry <run> <step> --nudge --message "<their answers>"`. `--nudge` is the default; `--fresh` starts a new session on its branch
instead, which the person may ask for. Where `nemia decide` says the step is also at its cap, the line it offers carries
`--budget <amount>`: a cap is the person's to raise.

## A loop out of rounds

A loop that has run its rounds stops for the person: its reviewer still finds something to change, and the loop's `rounds` are spent.
`nemia ls` says `rounds exhausted`, and `nemia decide <run>` prints the findings left open and the lines that answer it.

Bring it:

- **Run and loop**: the run's id, the looping step and its reviewer, the rounds run.
- **The findings left open**: the reviewer's own words, quoted, each with what it would cost to fix.
- **How the rounds went**: whether each round closed findings or the same ones came back.
- **Cost**: what the loop has spent, against its budget and the person's line.
- **Recommendation**: one, with its reason in a sentence:
  - once more: `nemia round <run> <step>`, the step being the looping one, which may be left out when the workflow has one loop;
  - enough, with the findings left open: `nemia accept <run> <step> --message "<their words>"`.

`nemia round` takes no words: the next round's reviewer reads the findings, not the person. Where their answer carries words for the
step, say so before you run it. Where a step of the loop is over its budget, `nemia round <run> --budget <amount>` raises its cap with
the round: the raise is theirs, so say it in the recommendation.

## Carry the answer back

Quote the person's words in `--message`, as data for the step, never as instructions of yours. Say what the verb answered, in one line,
and the run's state after it: what is filed next, or what still waits.
