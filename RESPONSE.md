# Response to the review of the engine edge hardening

## P1 — a spawn error is not proof that nothing started — **Fixed**

You are right, and it is worse than a missed case: ending every spawn `RunnerError` broke the one
property the journal-the-intent-then-spawn-by-name design exists for — a session we asked for is
always found and adopted, never started twice. Your repro is now `test/facade.test.ts` (a
`PromiseRunner` that registers the session and then rejects) and `test/engine.test.ts`; both failed
against `8a52173` and pass now.

I did not read "retain reconciliation" as "let the error escape again". That was the behaviour
before, and it is why item 5 existed: one bad spawn rejected the tick and stalled every task behind
it. So the fix splits the two cases you named, and leaves `decide` unchanged:

- **Nothing can have started** → `failed`, `unstartable`, as before. `RunnerError` gains
  `refused`, set only where that is certain: `claudeOps` when execFile's error comes from the spawn
  syscall itself (no binary, no cwd); `detachedOps` for anything thrown in its spawn block, all of
  which runs before or at the worker's launch; a `PromiseRunner` by rejecting with `refused: true`.
- **Anything else** → journalled as `spawned`, with the error on the attempt. `decide`'s existing
  grace window then settles it: a session that shows up under the name is adopted, and stop, the
  deadline and usage reach it; one that never shows up ends `lost` after `GRACE_MS`, and the retry
  policy applies. Tested both ways — adopted then stopped with one session ever, and `decide` at
  `GRACE_MS` past the spawn returning `record-end lost`.

What this costs, so it is on the record: a `claude --bg` that runs and exits non-zero — a bad
argument that got past `file()` included — now waits out the grace window and ends `lost` rather
than ending `unstartable` at once; its message is on the attempt, and `ae show` prints it. I did not
try to call such exits certain by reading claude's stderr or exit code: we do not know what
`claude --bg` has registered by the time it fails, and guessing "nothing started" is the mistake you
found. The remaining risk is one `decide` already carries for every spawn: a session that registers
later than the grace window is recorded `lost`, and a retry may run beside it.

Found while working out which detached failures are certain: a detached worker launched into a
missing cwd was not a throw at all. `spawn` returned, the child emitted ENOENT a moment later, and
nothing heard it, so it killed the process that launched the worker — the engine. The cwd is now
checked first and refused, and the child's `error` event is heard. The new test for it would have
taken the test runner down on the old code.

Commits: `0d5c720` (the fix and its tests), `5331cc0` (README paragraph, `docs/open-issues.md`).

## P3 — the numeric refusal misses overflow — **Fixed**

Agreed: the guard checked the syntax, not the number. `maxAttempts` must now also convert to a safe
integer, and 309 nines is in the refusal test — the old parser returned `Infinity` for it. I added
`deadlineSeconds: 1e400` beside it; that one was already refused, by the finiteness check, but
nothing had shown it. As you say, `file()` refused both already (`Number.isInteger(Infinity)` is
false); the parser no longer hands out an invalid spec before that door.

Commit: `3ca8ac4`.

## Checks

`npm test` and `npm run typecheck` from the repository root, after the last commit: green. Engine
170 tests (169 pass, the live test skipped without `AE_LIVE=1`), agent-workflows 72, api 3;
typecheck 4 of 4. `decide` is byte-identical to the merge-base, and nothing outside
`packages/agent-engine` changed.
