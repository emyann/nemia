# janitor

Read how the factory's work went and say what to correct. Argus, the janitor, reads `nemia stats` since the janitor's last run, against
the same length of time before it, writes a short report, and proposes one correction per card: an allow or a deny by name, a line in an
agent's body or a skill, or a refusal kept on purpose, each with the numbers behind it. Argus also reads each card in play against the repository and says, per card, done (the commit on
the base that landed it), replaced (the decision or card that did), stale (each fact that moved, what it said and what it says now) or
standing. Argus proposes and never acts.

```
argus
```

The step's check files the cards (`cards.ts`, read from the run's frozen workflow files, `$WF_WORKFLOW_FILES`, never from the tree;
where that is not set, the check says so on stderr and fails): each through `nemia inbox add`, with its factory and workflow (its
repository is the one the factory wires to the workflow), so it is ready to start. It refuses the whole closeout, filing nothing, when
a card names no factory or workflow, when two cards share a title, or when the period compared with is not as long as the period read
and does not end the day before it. A card whose title the inbox already has is not filed again, so the check run again files only what is missing. Nothing is
started: the inbox is where a person decides.

The check then grooms the inbox (`groom.ts`, from the same frozen files): it reads the cards through `nemia get cards -A -o json` and
checks the verdicts whole before it writes anything, refusing, exit 1, a verdict word not of the four, two verdicts on one card, a done
card whose commit is not on the base (the run's `WF_BASE_REF`, whether the factory lands on GitHub or in the checkout), a replaced card
that names nothing replacing it, a stale card whose facts are none or whose `was` it does not find exactly once in the card, and a card
in play filed before the period's last day with no verdict. A verdict on a card no longer in play is skipped. It changes no card: it
writes, in the step's artifacts, `groom.md`, every verdict with its reasons, and for each stale card `groom/<card>.json`, the card as
the api serves it with each fact amended, and prints the command for each card that has one. A person confirms each by typing it:
`nemia inbox rm <card>` for a done or replaced card, `nemia apply -f <the file>` for a stale one, which the api refuses where the card
was written since it was read.

A regular run reads closely only the cards filed or edited in its period, or whose paths, verbs or names the period's commits on the
base touch; the rest stand. The first groom after upgrading, or after a long gap, reads every card:
`nemia start "Groom every card" --workflows janitor --factory <factory>`, bounded by the run's budget.

Schedule it in the factory, and the daemon starts it every Monday morning:
`nemia factory schedule <factory> janitor --cron "0 9 * * 1" --brief "Read the stats" --tz <zone>`. Then `nemia factory ls` and
`nemia ls` say its next run and its last, and `nemia factory unschedule <factory> janitor` takes it back. A hand start still works, when
the stats are worth reading sooner: `nemia start "Read the stats" --workflows janitor --factory <factory>`, with a period in the message
when the default is not the one wanted.
