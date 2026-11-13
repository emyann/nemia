---
name: groom-the-inbox
description: "Read each card in play in the inbox against the repository and say, per card, done (the commit on the base that landed it), replaced (the decision or card that did), stale (each fact that moved, what it said and what it says now) or standing, reading closely only what the period touched. For the janitor's step, which proposes and never acts: a person removes or amends each card by the command the check writes."
---

# Groom the inbox

A card that was true when it was filed goes stale as the repository moves: its paths and lines move, its verbs are renamed, its work
lands under another card, a later decision replaces it. A design that starts from a stale card designs against a repository that is
no longer there. You say which is which; a person decides.

1. **List the cards in play**: `nemia inbox`, bare, which lists them with how old each is. Read each card's text in the inbox folder your
   brief names, with Read, Grep and Glob: its name is its file's, without `.md`.
2. **Take what moved on the base in the period**: `git log --since=<the period's first day> --name-only <the base>`, one call, the period
   being the one `read-the-stats` chose. A brief that says **Groom every card** reads every card closely, whatever the period.
3. **Triage.** Read a card closely when it was filed or edited in the period, or when a path, a verb, a page or a name it cites is one
   the period's commits touched (Grep the card folder for each path the log names). Every other card stood at your last run and
   nothing since touched it: it is `standing`, its `why` saying it was not read closely, and why.
4. **Read closely through subagents**, about 16 cards each, with the Agent tool: hand each its cards' names, the inbox folder, the
   period's commits and paths, and this skill's verdicts, and ask for one verdict per card back. A subagent works under your fence:
   it reads, and writes nothing. Read its verdicts before you take them; the check refuses what does not hold.
5. **Give one verdict per card in play**, none twice:
   - `done`: its work landed on the base. `commit` is the commit that landed it, by its hash, which the check finds on the base or
     refuses. Work landed only in part is not done: say the part still to do as stale.
   - `replaced`: a later decision or card took its place. `by` names it: the card by its name, the decision by where it is written.
   - `stale`: facts it says have moved, and its idea holds. Each fact is a `was`, quoted exactly as the card's body reads now and found
     there once (quote more around it where it is found twice), a `now`, what the repository says now, and a `why`, where it moved. The
     check applies them in order, each to the body as the facts before it left it, and refuses one it cannot place.
   - `standing`: it holds as written.
   Leave `commit`, `by` and `facts` empty where the verdict takes none.
6. **Change nothing.** You remove, amend and start no card. The check writes the report and, for each card, the command a person
   types: `nemia inbox rm <card>` for done or replaced, `nemia apply -f <file>` for stale. A card filed from your corrections this run
   is not in play before the period's last day, and needs no verdict.
7. **Say the grooming in your report**: how many cards were in play, how many read closely, and each verdict that is not standing.
