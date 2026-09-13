# Response to review

## 1. `release` decides the stop on the translated state — **Fixed** (`c2ebd62`)

You're right, and the worktree case was worse than anything I had tested. `claudeOps.observe` applies
the quiescence floor and reports a quiet `working/idle` session as `done`, and `release` read that
state. My release tests all ticked straight after the closeout, while the session was still `working`,
so none of them saw it. With a worktree the session was sent nothing and stayed `working` in `claude
agents` — bug 3 again, under a README that said it was stopped. Without one, `claude rm` went to a
running session with no stop first, which the live run never measured.

I took the first of your two fixes. The runner now keeps each of our sessions' state as `claude agents`
listed it, rebuilt on every `observe` (as the composite's owner map already is), and `release` stops on
that. It falls back to the sighting only when that runner instance has never observed. I did not take
"always stop unless `stopped`/`failed`": a genuinely `done` row for a worktree task is never removed, so
that rule would send a failing `claude stop` on every pass for as long as the row exists.

Test: `release.test.ts` gives the session a transcript last written ten minutes ago and ticks three
times, once with `worktree` and once without. It expects `stop` then `rm`, or `stop` alone with the row
left `stopped`. I checked that it fails when that one line is reverted. Still not measured live:
`claude stop` followed by `rm` on a session that really is running.

## 2. Only `ended` is released, not `settled` — **Fixed** (`9c4221e`)

The narrowing was deliberate. My reason was that the session's id isn't on the record for a task
settled without an `ended`, and I took recording it to mean changing what `decide` settles on. You're
right that it doesn't. `record-end` already copies `usage` and `exitCode` off the sighting as facts
`decide` never reads, and an open attempt's session id can go on `settled` the same way. The request
said "`ended`, or `settled`", so I no longer have a reason to refuse part of it.

What changed:
- When the engine applies a settle and the last attempt is still open, the `settled` entry carries that
  session's `nativeId`. `fold` gives it to the open attempt.
- `releaseFinished` releases an attempt that ended, or an open attempt in a settled task whose id is
  recorded.
- `ae logs` reads the released session by that id, as it does for an ended one.
- `decide` is unchanged.

What it costs:
- `settled` gains an optional field.
- A task settled by a person or a deadline before this change has no id on the record, so it keeps its
  session listed, since releasing it would lose its logs. A test pins that.
- A stopped task's `attempts.at(-1).nativeId` is now set. Its only reader outside the engine is
  agent-workflows' `sessionOf`, and a stopped step blocks its followers (`run.ts:87`), so no follower
  resumes one.

Tests, each checked to fail without its part of the change:
- A person's stop is released (`stop` then `rm`), and `ae logs` still reads the transcript.
- A deadline stop is released the same way.
- A hand-written journal without the id is left alone.

Bug 3 in `docs/open-issues.md` is narrowed to what is left: a worktree task's session is stopped and
kept, because `claude rm` deletes the worktree with the task's work in it.

## Checks

`npm test && npm run typecheck` from the repository root exits 0.

| Package | Tests |
|---|---|
| web | 33 pass |
| agent-workflows | 156 pass |
| agent-engine | 213 pass, 3 live tests skipped |
| api | 17 pass |

Typecheck: all four packages clean.
