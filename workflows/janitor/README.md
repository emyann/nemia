# janitor

Read how the factory's work went and say what to correct. Argus, the janitor, reads `wf stats` since the janitor's last run, against
the same length of time before it, writes a short report, and proposes one correction per card: an allow or a deny by name, a line in an
agent's body or a skill, or a refusal kept on purpose, each with the numbers behind it. Argus proposes and never acts.

```
argus
```

The step's check files the cards (`cards.ts`, read from the run's base, never from the tree): each through `wf inbox add`, with its
factory, workflow and repository, so it is ready to start. It refuses the whole closeout, filing nothing, when a card names no factory,
workflow or repository, when two cards share a title, or when the period compared with is not as long as the period read and does not
end the day before it. A card whose title the inbox already has is not filed again, so the check run again files only what is missing.
Nothing is started: the inbox is where a person decides.

Schedule it in the nemia factory, and the daemon starts it every Monday morning, at every level, Nemia off:
`nemia factory schedule nemia janitor --cron "0 9 * * 1" --brief "Read the stats" --tz America/Montreal`. Then `nemia factory ls` and
`nemia ls` say its next run and its last, and `nemia factory unschedule nemia janitor` takes it back. A hand start still works, when the
stats are worth reading sooner: `nemia start "Read the stats" --workflows janitor --factory nemia`, with a period in the message when the
default is not the one wanted.
