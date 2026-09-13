# Open issues: agent-engine and agent-workflows

What is still wrong, what is only half-verified, and what is waiting on a decision — written down so
it can be picked up later without reconstructing it from commit history. The last section is a
record of what was fixed, with commits, so the open items have their context.

State as of 2026-09-12: agent-engine `d8cae64`, agent-workflows `0e7b02a`.

## Bugs

### 1. A step that asked for a closeout still settles `succeeded` when it goes quiet without one

**Where.** The Claude runner turns *working, not busy, transcript quiet for 90 seconds* into
`state: done` whether or not the task asked for a closeout (`agent-engine/src/runner.ts:248`). The
engine records that as a normal end (`agent-engine/src/engine.ts:73` never sees a statement), and
the workflow stops a DAG only for a closeout that says `blocked` (`agent-workflows/src/run.ts:84`),
so a missing one reads as success.

**Effect.** A step that crashes, hits a rate limit, or ends its turn without calling
`StructuredOutput` is reported `succeeded`, the next step is filed, and `wf decide` says every step
succeeded — with no summary for that step. A false completion, which the engine README calls the one
failure worse than a stall.

**Proposed fix.** The runner stops deciding: it reports how long the session has been quiet, as a
fact on the sighting. The engine decides, because only the journal knows whether this task asked for
a closeout:

- no `closeoutSchema` → quiet means done, as today (it is all such a task has);
- a schema and no statement → the attempt ends as *stalled*, not a success, so nothing downstream
  runs; the task's resume policy then applies — resume the session with a nudge ("you stopped
  without giving your closeout; finish, or report blocked") — and a person gets it when attempts
  run out.

**Status.** Proposed, not decided.

### 2. `advance` hands off only steps that succeeded

**Where.** `agent-workflows/src/runner.ts:318` commits a finished step's leftover work only when its
engine task succeeded.

**Effect.** A step that fails or is stopped keeps anything it did not commit only in its worktree
(`~/.agent-workflows/worktrees/<run>/<step>`): not on its branch, not merged into later steps, not
shown by `wf decide`, and lost if the worktree is removed. The closeout contract tells steps "the run
commits whatever you left", which holds only for succeeded steps.

**Fix.** Hand off every finished step — succeeded, failed or stopped. A failed step still blocks what
follows; this only keeps its work on its branch.

**Status.** Deferred on purpose (2026-09-12): fix it when it bites.

### 3. Claude sessions stay in the registry after their task settles

A `--bg` session that has given its closeout stays `working/idle` in `claude agents` indefinitely.
The engine settles the task but never stops or removes the session, so every run leaves its sessions
behind; each one had to be cleared by hand with `claude stop` and `claude rm`. Stopping (and
possibly removing) a session once its task settles belongs in the engine.

### 4. `claude-detached` ignores `closeoutSchema`

`agent-engine/src/runner-detached.ts:280`: the spec's `command` does not take the harness `io`, so a
task on this harness never gets a closeout. Completion itself still works — `claude -p` exits — but
the workflow sees no statement. Only `claude` (background sessions) and `codex` support closeouts. The
fix is `--json-schema` plus reading `structured_output` from the JSON output. Low priority: this
harness exists for comparison.

### 5. The engine README's "three next things" is stale

`agent-engine/README.md:517` lists worktrees and sequencing, both done (sequencing is
agent-workflows). Only *watch instead of poll* — waking the tick loop when the harness registry
changes — is still open.

## Verified by tests, not by a live run

- **Resuming a Codex task** (`f63dc55`). The argument order is checked against Codex's own parser; no
  workflow has resumed a Codex step, so whether exec-level `-C` and `-s` apply to the resumed session
  is unknown.
- **Discarding a statement inherited on resume** (`agent-engine/src/engine.ts:73`). In the one live
  resumed step, the session was busy for as long as only its parent's `StructuredOutput` call
  existed, so the busy rule alone explains why it did not settle early.
- **Codex trust** (`d8cae64`). Only one configuration was shown to let a sandboxed step commit from a
  worktree: repository *and* worktree trusted, with the rule committed in the repository. Whether one
  trust entry is enough was not established.
- **`claude --bg --json-schema`** works on Claude Code 2.1.270 but is documented only for `-p`. A
  future release could change it.

## Open questions

1. **Quiescence: stalled or done** for a task that asked for a closeout — bug 1.
2. **Why a Claude session stays `working` instead of reaching `done`.** Twenty-plus sessions measured:
   not resume, not duration, not the two together. It is the reason the quiescence floor exists.
3. **Should the engine stop a session once its task settles** — bug 3.
4. **`wf ls` choices merged as implemented** (`7f07b71`), open to revisit: an extra "waiting on you"
   line for a run with a blocked step; `closeout unreadable` for an answer that cannot be parsed; no
   such line for a cancelled run. The reasons are in `RESPONSE.md` on
   `wf/make-wf-ls-say-how-each-fini-zpp7/respond`.
5. **hkb migration**: two decisions to make before starting — see
   [hkb-migration.md](hkb-migration.md), "Two consequences to decide on *before* starting".

## Fixed

| Symptom | Fix | Commit |
|---|---|---|
| `wf tick` could never reach the quiescence verdict: the clock lived in process memory | the clock reads the transcript's own mtime | engine `3cdfb8f` |
| `ae watch` polled while the layer above used the pushed feed | `ae watch` uses `engine.watch` | engine `60b7aac` |
| `ae up` exited immediately (an unref'd timer); `resumeFrom` could not be written in a brief | the loop holds the process; `resumeFrom` in briefs | engine `187e20e` |
| completion could only be guessed from outside | a task declares its own end — first a file, now a structured answer | engine `0d2de7d`, `e53f227` |
| a done file travelled down a branch: two steps settled in six seconds having done nothing | marker cleared per attempt, then replaced by a statement made to the harness | engine `dc8d906`, `e53f227`; workflows `a641ad7`, `a6c7b0c` |
| a step revised its verdict after the engine had acted on it | a statement from a busy session is not final | engine `488f3d2` |
| `--add-dir` claimed to let Codex commit; it did not | removed | engine `32b3144` (undoes `e9aab35`) |
| resuming a Codex task never parsed | every flag before `resume` | engine `f63dc55` |
| a Codex review could not commit and stopped two runs | the run commits for the step; a trusted repository's rule lets Codex commit itself | engine `d8cae64`; workflows `0b21509` |
| a mistyped run id printed a raw ENOENT | a sentence | workflows `cc3f209` |
| a run ended by trailing off | `wf decide` | workflows `a819b94` |
| the JSON example in every brief was invalid | fixed, then superseded by the structured answer | workflows `d127fd3` |
| `wf ls` could not show a blocked step | outcome beside phase | workflows `7f07b71` |
| a task the engine forgot read as queued, so a run looked in flight for ever | `unknown`, not `pending` | workflows `0e7b02a` |
| cancel raced a tick; a failed run with work left could still file it | cancellation in its own file, enforced every tick | workflows `f59d95c`, `3eeaf2f` (merged in `e1c9170`) |
