# Response to REVIEW.md

## 1. A changed workflow folder drops recorded steps — **Fixed**

You're right. I had seen this case while writing it and let it go as an edge; it isn't one. The
record is also what `wf decide` reads for stuck steps (`decision` in agent-workflows/src/run.ts
walks `run.steps`), so a step renamed out of the folder would still be waiting on a person in
`wf decide` while the board showed nothing of it.

What changed, in `apps/api/src/app.ts`:

- A run's steps are every step on the record, in the record's order — the workflow's order at
  `wf start` — then any step the folder has and the record does not. `wf start` records every step
  it finds, so a folder step missing from the record was added since. It is still shown, as
  `waiting`, because it is real: `advance` reads the folder and will file it.
- A recorded step the folder no longer has keeps its task, branch, status, closeout and place in
  `waitingOnYou`, with `spec` and `body` null.
- `warning` names the drift: "The workflow folder … has changed since this run started: it no
  longer has original, shown from the run record without spec or prose; it has replacement, which
  the run did not start with."
- Test: *a folder changed since the run started keeps the steps that ran, and names what moved* —
  your repro, `original.md` renamed to `replacement.md` after the run started, on both endpoints.

Not covered: prose edited in place under the same file name. The record keeps no copy of the
frontmatter, so `spec` and `body` show today's file. `told`, below, no longer depends on the folder
for a filed step, and that was the part a person reads as fact.

## 2. A task missing from the engine reads `pending`, not `unknown` — **Fixed**

In my closeout I defended `pending` as parity with `wf ls`. That was the wrong reading of the
request. The brief's list of words includes `unknown`, and `list` cannot say `unknown` for any
step: it views every task id on the record, so `views.get(taskId)?.phase ?? 'unknown'` never
reaches its fallback. The step you reproduced is the only one the brief could have meant.
`phaseOfView` in agent-workflows/src/runner.ts already draws this exact line for the DAG — no brief
on the engine's record means `unknown` — with a comment on the bug it caused before it did.

What changed:

- `statusOf` says `unknown` for a filed task whose engine view carries no brief. One test makes it
  refuse — `t-4-lost` is `unknown` on `/api/runs` and on `/api/runs/:id` — and one makes sure it
  does not swallow the neighbouring case: `t-5`, filed and queued, is still `pending` on both.
- The api no longer calls `list`. With both findings fixed, `list`'s answer would have been
  overridden for every recorded step the folder lost and for every lost task, and it would have read
  every task a second time on each 5 s poll (each read is a `claude agents` call, about 300 ms
  here). So the api words each step from one read, with `listing`'s rule plus the brief check, and
  *where list words a step correctly, the api uses the same words* compares its output to `list`'s
  for the runs where `list` is right.
- For whoever owns agent-workflows: `wf ls` still prints `pending` for a lost task. The fix belongs
  in `list` (runner.ts) — carry `phaseOfView`'s distinction, or check `state.brief` as the api now
  does. Until then the board and `wf ls` disagree on that one word, and the board is the one that is
  right.

## Also fixed, found while answering 1: `told` was recomposed, not what the step was told

Not in your review, but the same mistake as finding 1: reading today's folder and record where the
truth is already recorded. `told` was `composeBrief(step, run, steps)` at request time. `advance`
files exactly that string — at filing time. Recomposed later it changes: for a step with no
`after`, `composeBrief` points at every other step that has a task id, so once `review` was filed,
`implement`'s `told` said it had been sent to look at review's work. Every finished two-step run
would have shown that.

Now, for a filed step, `told` is the brief the engine holds (`view.state.brief`), which is what the
step was given. For a step not yet filed it is `composeBrief` as of now, and the web labels that
"What it would be told now". For a lost task it is null, because nobody can say.

This departs from the brief's letter in one place: when the folder is gone, a filed step's `told`
is no longer null, because it never came from the folder. If the person who asked wants the
letter kept, it is one line in `toldOf`.
