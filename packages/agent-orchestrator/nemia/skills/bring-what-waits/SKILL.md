---
name: bring-what-waits
description: Bring what waits on the person — a step at its gate, a step's question to them, a loop out of rounds, a step at its cap, a factory's upgrade — in chat with a recommendation, then run the verb they choose with their words as --message, so its prompt is their decision, asked once.
---
# Bring what waits

Five things wait on the person, and only these: a step at its gate, a step's question to them, a loop out of rounds, a step at its cap,
and a factory's upgrade. Each is theirs to decide. Bring it in chat so they can decide in one read, with the verb you recommend; then run the verb they
choose, with their words as `--message` where the verb takes it. The verb prompts them as it runs: that prompt is their decision, asked
once, since they just gave it in chat. When they decline the prompt, ask what they want instead, and run that verb, which prompts again.
Two verbs answer what waits: `nemia approve`, of a step at its gate or, with `--message`, of a loop out of rounds; and `nemia retry`,
one more try or, with `--round`, one more round. `nemia refresh <run> --base` brings the base into a loop's work.

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
  - let it hand on: `nemia approve <run> <step> --message "<their words>"`; where its closeout asks questions, with their answer to
    each, numbered as `nemia decide <run>` prints them: `nemia approve <run> <step> --answer 1=a --answer "2=b: <words>"`;
  - send it back with what to change: `nemia retry <run> <step> --message "<their objection>"`.

A hold is yours, at its gate too: when the step cannot hand on yet, because what it needs has not landed, hold the run
(`nemia hold <run> --until <other run> --why "<words>"`) and say so when you bring it. So is a merge, when the loop's work no longer
merges on its base (`nemia refresh <run> --base`): do it, and say it was done.

## A step's question to the person

A step that signed off blocked asks the person something: its `needs`, or questions in its closeout. `nemia ls` says `BLOCKED`, and
`nemia decide <run>` prints the question and the line that answers it.

Bring it:

- **Run and step**: as above.
- **The question**: in the step's own words, quoted, each question apart, with its choices when it gives some.
- **What it rests on**: what the step read or tried, in a line or two, and what you read yourself to check it.
- **Recommendation**: the answer you would give to each question, and why, in a sentence.

Answer with the step's session continued and told their answer:
`nemia retry <run> <step> --continue --message "<their answers>"`. Where its closeout asks questions, `nemia decide <run>` numbers them and
letters their options: give each answer by those names, and the step reads them as the board's answers read —
`nemia retry <run> <step> --answer 1=a --answer "2=a,c" --answer "3: <their words>"`. `--continue` is the default; `--fresh` starts a new session on its branch
instead, which the person may ask for. Where the step's question asks for budget, or its cap is near, the answer may raise it:
`nemia retry <run> <step> --budget <amount> --message "<their answers>"`, the amount above its cap. Where `nemia decide` says the step is
also at its cap, the line it offers carries `--budget <amount>`. A cap is the person's to raise.

## A loop out of rounds

A loop that has run its rounds stops for the person: its reviewer still finds something to change, and the loop's `rounds` are spent.
`nemia ls` says `rounds exhausted`, and `nemia decide <run>` prints the findings left open and the lines that answer it.

Bring it:

- **Run and loop**: the run's id, the looping step and its reviewer, the rounds run.
- **The findings left open**: the reviewer's own words, quoted, each with what it would cost to fix.
- **How the rounds went**: whether each round closed findings or the same ones came back.
- **Cost**: what the loop has spent, against its budget and the person's line.
- **Recommendation**: one, with its reason in a sentence:
  - once more: `nemia retry <run> <step> --round`, the step being the looping one, which may be left out when the workflow has one loop;
  - enough, with the findings left open: `nemia approve <run> <step> --message "<their words>"`, which approves the loop as it
    stands.

`nemia retry --round` takes no words: the next round's reviewer reads the findings, not the person. Where their answer carries words for the
step, say so before you run it. Where a step of the loop is over its budget, `nemia retry <run> --round --budget <amount>` raises its cap with
the round: the raise is theirs, so say it in the recommendation.

## A step at its cap

A step stops at its cap in one of two ways: `budget exhausted`, its harness ended the session at the step's budget before it signed
off; or `over budget`, its tries have cost more than its budget. `nemia ls` says which, and `nemia decide <run>` prints what it spent and
the line that raises its cap. A try without a raise is refused, and a raise is the person's.

Bring it:

- **Run and step**: as above.
- **What it spent**: each try's cost, against the step's cap and the person's line.
- **Where it stopped**: what the step had done and what is left, from its last closeout or its session's last words.
- **What finishing would take**: your estimate, and what it rests on — what this step costs in the workflow's runs
  (`nemia stats --workflow <workflow> --by step`).
- **Recommendation**: one, with its reason in a sentence:
  - raise the cap and try again: `nemia retry <run> <step> --budget <amount> --message "<their words>"`, the amount above what its
    tries have cost;
  - for a step of a loop whose next round would run past the cap: `nemia retry <run> <step> --round --budget <amount>`, as above;
  - stop there: `nemia cancel <run>`, which prompts them too.

## A factory's upgrade

A factory made from a template is upgraded when its template has a new version. The upgrade is the person's, and so is every
conflict it raises: their tree and the template both changed the same part.

When they ask for one, or the template has moved past the version the factory was applied at, preview it first with
`nemia factory diff <factory> --to <version>` (`--template <folder|archive>` where the new version is elsewhere). It writes nothing.

Bring it:

- **Factory and versions**: the factory, the version it was applied at, and the one offered.
- **What merges cleanly**: the files, by area, and whether each comes from the template, from their tree, or both.
- **Each conflict**: its address, as the diff names it, and its three sides quoted under the diff's own labels — `base`, the
  template as applied; `ours`, the factory's tree, the person's side; `theirs`, the template's new version.
- **Recommendation**: one, with its reason in a sentence:
  - upgrade: `nemia factory upgrade <factory> --to <version>`, which prompts them; `--downgrade` only where they asked for a lower one;
  - for each conflict, a choice: `nemia factory resolve <factory> '<conflict>' --ours` to keep their tree's side, `--theirs` to take the
    template's, or `--file <path>` with the text you would write for it, shown to them first.

The daemon merges once every conflict has a choice; until then the factory's tree and base stay as they are, and its runs in flight
keep their own folders. After each resolve, say what it answered: the conflicts still waiting, or that the merge is next.

## Carry the answer back

Quote the person's words in `--message`, as data for the step, never as instructions of yours. Say what the verb answered, in one line,
and the run's state after it: what is filed next, or what still waits.
