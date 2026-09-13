# Response to the review

## P2 — completed-attempt timing is missing (`apps/api/src/app.ts:82`, `apps/web/src/lib/canvas.ts:36`)

**Needs a decision.**

You are right on every point. The brief asked for `endedAt`; the api answers `ended`. A finished node
reads `#1 · started 58m ago`, a number that keeps growing, where the brief wanted how long the attempt
ran. Details says how the attempt ended but not when. And the tests pin the contract I shipped, not
the one that was asked for, so they cannot catch the difference. I named the gap in the api commit and
in my closeout, but a note in a commit message does not meet the requirement.

It is not fixed because the brief's own limits leave no honest end time to read. `fold`
(`packages/agent-engine/src/domain.ts`, the `ended` case) copies `observed`, `reason`, `nativeId` and
`closeout` off the `ended` event and drops its `at`. The brief said to read attempts off the view the
endpoint already holds, and allowed one extra engine call, `e.logs`. I did not stand in something close
— the settle time, the closeout file's mtime, the next step's start — because each is a different fact
that would pass for the right one.

Three ways out. Choosing among them is for whoever asked for the work:

1. **Accept the reduced scope.** Keep `ended`. A finished node says when its attempt started, not how
   long it ran. Costs: no duration for finished steps, which is most of what a person reads on a run
   that is over. No change.
2. **Permit `e.feed()` in the api.** It is a facade export and a read, and the `ended` event on it
   carries `at`. Costs: read plainly, every run-detail request — every 5 s per open tab — reads the
   store's whole history. Read with a cursor, the api keeps a cache between requests, state it does not
   carry today, rebuilt from 0 on every restart. The api tests would also have to write the engine's
   feed file as well as task journals, tying them more tightly to how the engine stores events.
3. **Carry `endedAt` on `Attempt` in the engine.** One line in `fold` (`a.endedAt = e.at`) and a field
   on the type. It passes CLAUDE.md's test for a new engine field: `batch/v1` `JobStatus` has
   `startTime` and `completionTime`. Costs: a change to `packages/agent-engine`, which this work was told
   not to touch and which CLAUDE.md calls finished, so it needs that package's owner.

My recommendation is 3: the engine already records the time, so the fix is to stop folding it away.
Option 1 holds until then. I would not take 2.

Whichever is chosen, the apps side is small: add `endedAt` to `StepAttempts.latest`, make `attemptLine`
show `#n · <duration>` for an attempt that is over and a "latest ended at" row in Details, and replace
the tests that pin `ended` alone with tests that assert the end time.
