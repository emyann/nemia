# dev-planned

Plan the change before anyone makes it, then implement it and have a second engineer review it, as in
dev. The plan is a step of its own, on tools that cannot write, and its closeout is the plan: on the
record, in `wf decide`, and handed to implement as data.

```
plan → implement ⇄ review → ship
```

`plan` runs on Claude (opus), fenced as `dev`'s review is, by machinery rather than by its brief:
`tools: Read, Grep, Glob, Bash, Skill, WebFetch, WebSearch` in `permissionMode: dontAsk`, and review's
`disallow: Bash(npm run build), Bash(npm run e2e)` (`dev`'s README says what that deny closes, and what
it does not). Its closeout declares the plan (`plan.schema.json`): `approach`, the change in a
paragraph; `files`, each path it would touch with one line on what changes; `steps`, in order; and
`risks`. The paragraph is `approach` and not `summary` because every closeout already has a `summary`,
written for the person who decides, and the parser refuses a declared field that reuses it.

When the brief reads one way, `plan` signs off `done` and implement starts. When it admits two
materially different readings — or says to wait for approval of the plan — `plan` signs off `blocked`,
with the plan for the reading it would take and the question in `needs`, and the run waits on you:

```bash
wf decide <run>                                       # the plan, and its question under needs
wf retry <run> plan --message "the second reading"    # plan's session continued, told your answer
```

The answer reaches `plan` in its try's brief as `## Your answer`, under `## Try 2`, and it plans again.
`wf ls` and `wf decide` say the try was answered, and `wf decide` prints your answer beside the question.

`implement` is `dev`'s, check and all — the build and the e2e run when git says the work touched the web
app — with `after: plan` and `input: plan`: the plan reaches it under `## From plan`,
as data — the declared fields, never plan's summary — and it is told to say in its commit message where
it departs from the plan. `review` and `review.schema.json` are `dev`'s, and the loop is `dev`'s: a round
goes back to implement, not to planning. `ship` is `dev`'s too, file for file: the run's ending, gated,
which merges the result onto the base branch in the repository's checkout once a person approves it —
`dev`'s README says what the step does.

## When to use it

A brief that warrants a look before the work: one that touches several packages, changes a shape other
code reads, or can be read two ways. Or one whose plan you want to approve before a session spends an
hour on it — say so in the brief, and `plan` stops with the plan for your word.

## When not

A small brief. The plan repeats it, and a session is spent restating what was asked. Use `dev`, whose
implement picks the reading a careful colleague would and says so in its commit message.

```bash
wf start "<what to do>" --workflows workflows/dev-planned
```
