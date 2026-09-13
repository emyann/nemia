# Response to the review

## 1. `packages/agent-workflows/src/run.ts:1317`: a new session of the loop's target owes replies to findings nobody gave it

**Fixed.**

You're right about the code, and about what it costs. I had listed this in `docs/features.md` as a known
gap, but nothing refused it. A step that owes `replies` and was never handed the findings can honestly
answer only `replies: []`. That reads as signed, and the next reviewer gets an empty list with nothing
marking that the findings went unanswered. It is the "prose is not a constraint" failure.

Of your two remedies I took the first, handing the findings on, and not refusing `--fresh`/`--model`.
Refusing would close only the person's route. The same hole opens on the run's own route: a `retries:`
nudge that finds no session to continue starts a new one, and the run cannot refuse its own `retries:`.
Handing the findings closes both, in one place.

What changed:

- **`askingTry` (`run.ts`, pure).** For a loop's target past round 1, it returns the looping step and its
  last `then: 'round'` try, the one whose closeout asked for the round. It returns nothing in round 1,
  and nothing for any step that owes no replies.
- **`composeBrief`.** A retry that is not resumed, for a target that owes replies, now gets the round's
  section after its `## Try <n>`: the three answers, then `## From review` with the findings. As in the
  round's first try, `again` and the summary are left out. "This is a new session" is said once, by the
  try. A try that continues its session gets nothing more, since it has the findings already. It still
  owes `replies`.
- **`advance` (`runner.ts`).** When it files such a try with no session to resume, it reads that try's
  closeout from the engine and answers for the looping step with it. The other steps' closeouts are
  read as before.
- **Docs.** The README's loop-contract bullet now says a new session is handed the findings again. The
  gap entry in `docs/features.md` is removed.

Tests:

- **`run.test.ts`.** A fresh try, and a nudge with no session, of implement in round 2 are each given
  the round section and the findings JSON without the summary, and are still asked for `replies`. A
  continued nudge is not handed them twice. Round 1 hands nothing.
- **`store.test.ts`.** Your repro, end to end. Round 2's implement signs off without replies and reads
  unsigned. `wf retry --fresh` files try 3 as a new session, and its brief carries `## Round 2 of 3`,
  the three answers and review's round-1 findings. It is filed with `replies` required.

`npm test && npm run typecheck` from the repository root, on the fixed tree: both exited 0 (every package's tests, no failures; typecheck 4 of 4).
