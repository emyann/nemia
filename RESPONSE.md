# Response to review

## `apps/web/src/lib/factory.ts:17`: a failed run whose sibling is still working leaves the Factory: **Fixed**

You're right about the code, and I reproduced it. `assess` returns `failed` as soon as one step is final
without letting its followers run (`all.some(stopsFollowers)`), whatever its siblings are doing. Your
`fanout-live-sibling.ts` prints `{ ready: [], check: [], blocked: ['c'], status: 'failed' }` while `b` is
`running (working)`. Under `status === 'running'`, that run's card left the floor and counted as finished
while an agent was working.

One correction to the finding: the case was not untested. `factory.test.ts:62-64` passed a `failed` run with
`checking` and `needs-human` steps to `inFlight` and asserted `false`. I wrote it to show the Factory no longer
reads step words. What it actually did was pin the defect, not catch it.

**Why this is a fix and not a decision.** The brief's reason for the rule (plan §4) is a run that never moves
again: "its followers are `waiting` and will wait for ever". A run with a session still going is not that
run. The package already draws the line the brief meant. `cancelPlan` (`packages/agent-workflows/src/run.ts`)
says "`failed` does not mean a run has stopped moving", and it calls a run finished only when nothing is in
flight *and* nothing is ready to file. So I kept the brief's rule as the floor and added that line to it:

- **api:** both endpoints carry `moving`. It is true when either:
  - the engine holds a task of the run: a step's or a check's, pending or running, via agent-workflows'
    exported `inFlight`;
  - or a tick would still file a step or a check (`assess`'s `ready` and `check`).

  A record the tick cannot read files nothing, so its `ready` steps don't count. That is a record from
  before runs froze their workflow, whose folder is gone. `status` is still `assess`'s, unchanged. To tell
  a queued task from a lost one, the api's `phaseOf` now narrows the engine's view as runner.ts's
  unexported `phaseOfView` does. Nothing new is read: the list still observes the engine once.
- **web:** `inFlight = status === 'running' || moving`. Nothing still moves in a run stopped at a refused
  check or a blocked step, so that run is finished, as the brief asked. These stay on the floor:
  - a fan-out with a live sibling;
  - a failed run whose other branch still has a step to file;
  - a cancelled run whose stop hasn't landed.
- **tests:**
  - **api:** a test covers your case (r-24), plus each way a run can move or not, on both endpoints. That
    includes a lost task (`running`, not moving) and a record the tick cannot read, which must *not* move.
  - **`factory.test.ts`:** failed and cancelled runs with `moving` both ways.
  - **e2e:** the second seeded run now has your shape. `sketch` failed, `ship` waits on it for ever, and
    `plan`'s session still runs. Its card must be on the floor with a clock counting.

**What it costs, if the person wants the letter of the brief.**
- **The Factory and `wf decide` now differ while a sibling works.** `decision` also reads `assess`'s status,
  so it will offer a decision on a failed run whose sibling is still working, while the Factory keeps that
  run on the floor.
- **Going back to the letter is small:** restore `run.status === 'running'` in `factory.ts` and the tests that
  name the live-sibling case. `moving` can stay on the api at no cost.
