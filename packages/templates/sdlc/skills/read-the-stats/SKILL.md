---
name: read-the-stats
description: "Read a factory's stats since the janitor's last run, against the same length of time before it, write a short report, and propose one correction per card — an allow or deny by name, a line in an agent's body or a skill, or a refusal kept on purpose — each with the numbers behind it, never one already in the inbox. For the janitor's step, which proposes and never acts."
---

# Read the stats

1. **Run each read bare**, one command per call, run as your step says the command is reached:
   `nemia stats --json --workflow <the workflow your step is in>`, `nemia stats --json --by agent --from <day> --to <day>`,
   `nemia stats --json --by step --from <day> --to <day>`, `nemia inbox`. Never wrap one in `timeout` or `( … )`, pipe it to `tail` or
   `grep`, or redirect it; never `cd`, `git -C`, `VAR=` or `for`: your fence refuses them. Read a file with Read and search with Grep
   or Glob.
2. **Choose the period.** A period the brief gives wins. Else it runs from the last day the first of those reads counts a run on
   (`all.days`, the latest with `runs` above 0) to today; with none, the last 14 days to today. It is compared with as many days,
   ending the day before it starts (`against`). Days are UTC, `YYYY-MM-DD`.
3. **Read both periods**, by agent and by step (`--by agent`, `--by step`), and the step rows (`all.steps`): tries, time, cost, checks,
   gate waits, and refused calls (`deniedCalls`, `deniedTries`, `denials`). Quote the numbers as `nemia stats` gives them; a number it
   gives as null was not measured, and is said so, never as 0. Never re-derive one from a workflow's step names. Read each step's skills
   table (`skills`): `loads`, `tries` that loaded the skill, and `when touched`, `<loaded> of <touched>` (`loadedWhenTouched` of
   `touched`), the tries that touched the paths the skill applies to and how many of them loaded it. A skill touched in many tries
   and loaded in few is a description to sharpen: propose its new description, with the numbers beside it, on the skill of ours
   that carries the trigger (`skill`) — never on a vendored one.
4. **Group the refused calls by agent and by kind**: pipes to `tail` or `grep`, `timeout` and `( )` wrappers, shell variables
   (`VAR=`), `git -C` and `cd`, a read sent to Bash instead of Read or Grep, a write a read-only role tried. For each group, propose one
   correction: an allow by name (`fence`), a line in the agent's body (`body`) or in its skill (`skill`) that sends the call to a tool its
   fence allows, or "refused on purpose" (`on-purpose`) when the fence is right and the agent should stop asking. A role that writes
   nothing is never proposed a write. A skill's rule broken on many tries (a step row's `rules`) is a candidate card too — a fence, or a
   line in the skill — with its `kept` and `broken` as the evidence.
5. **Read the rest for what moved**: a step whose tries, cost or refused checks rose against the period before, a loop that took more
   rounds, a gate that waited longer, a count a workflow declares over its closeouts that rose (`all.tallies`: each step's `sum` over
   its measured `tries`, null where none was measured). Propose a correction only where the numbers point at one; a number that moved with nothing to
   correct goes in the report, not on a card.
6. **Read the inbox** (`nemia inbox`, and its cards in the inbox folder your brief names, mounted read-only: read them with Read, Grep
   and Glob): propose nothing a card there already says, under its title or another. The check files no card whose title one there already has.
7. **Write each card ready to start**: a title of one line, what to correct; the correction exactly — the rule, or the line and the
   file it goes in; the evidence, the numbers of both periods; the agent; and the factory, the workflow and the repository it is
   started with — the factory and repository the runs it is about ran in (`--by factory`, `--by repo`), and the workflow that changes
   that repository's agents and skills.
8. **Sign off** with the period, the period it is compared with, the report in markdown — what moved, with its numbers, and the
   corrections — and the cards. No card is filed by you: your step's check files them, and a person decides which to start.
