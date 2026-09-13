# Response to the review of F (`retries:` and `wf retry`)

## 1. `refusedCheck` counts a missing verdict as a refusal (`packages/agent-workflows/src/run.ts:312`)

**Fixed.**

You are right, and it was not a latent default: `apps/api` already called `assess` without a verdict.

I made `undefined` mean "the phase decides" on purpose, and the purpose was the wrong one. It kept a pure test
written before verdicts existed — `decision` called with none, expecting a failed check under `failedCheck` —
reading as it did. That bought an old assertion's comfort with the unsafe reading for every caller that leaves the
argument out. A verdict nobody read is no evidence of a refusal. `listing` already words a missing verdict as
`unfinished` (`verdictOf(name) ?? 'unfinished'`), so two pure functions in the same file read the same absence two
ways before the api and the tick did.

What changed:

- `refusedCheck` counts only a number: `phase === 'failed' && typeof verdict === 'number'`. A caller that passes
  no verdict now reads a failed check as the tick reads one with no exit code: failed, waiting on a person, and no
  try of `retries:` due. The doc comments on `refusedCheck` and on `assess`'s parameter say so.
- `apps/api/src/app.ts`, `judge`: the verdict it already built for `listing` is passed to `assess` too. The board's
  status and its step words now come from one reading, and it is the tick's: the exit code the engine recorded.
  Without this, the new default would only have moved the disagreement. A refused check with a try left would have
  read `failed` on the board while `listing` in the same response said the try was due.
- `moving` in the same function counts a try that `retries:` would file. Its own doc says it means "a step or a
  check a tick would still file", and a tick now files tries. Without it, your scenario's opposite case — refused,
  try left — read running and not moving.

What I did not do: make `verdictOf` required. On `assess`, `decision`, `cancelPlan` and `retriesDue` it comes after
parameters that have defaults, and most calls in the tests pass three to five arguments. The safe default gives a
forgetful caller the same protection without rewriting those calls.

Tests:

- `run.test.ts`, *a check that did not finish is no refusal*: your scenario, pure. `retries: 2`, the check settled
  `failed`, no verdict passed. `assess` returns `failed`, with `review` blocked and no try due, the same answer
  as passing `'unfinished'`. `cancelPlan` returns `finished`, and `decision` puts the step under `unfinishedCheck`.
  `refusedCheck('failed', undefined)` is now asserted false; it was asserted true.
- `run.test.ts`, *`wf decide` names every step that did not earn a follower*: its call relied on the default this
  finding is about. It now passes step `a` the exit code 1 it is meant to have refused with, and a second call
  without one asserts the same check reads as not finished and the run is still failed. The setup changed; no
  assertion got weaker.
- `apps/api/test/app.test.ts`, a new test with two runs, each checked on both endpoints and against `wf ls`'s
  `waitingOnYou`. `r-27` refused with exit 1 under `retries: 1`: `running`, moving, waiting on nobody. `r-28` is
  your case, `failed` with no exit code: `failed`, not moving, waiting on `a`.

`docs/features.md` now says the board reads a try of `retries:` as the tick does. It still reads no ask files, so a
try a person asked for shows failed and waiting on them until the tick files it. The note on two readings of one
verdict adds that a caller passing none gets the "did not finish" reading.
