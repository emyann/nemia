# Migrating hkb onto the engine

Written from a session that read hkb closely and then built this engine. Everything else that
session learned is in the two READMEs; this analysis is not, and rebuilding it means re-reading
~2,000 lines of `src/controller.ts`. Hence the file.

Nothing here is committed to. hkb may never be migrated, and that is a legitimate outcome —
`agent-runtime` + `agent-orchestrator` is already a plausible hkb-v2 core built from scratch.

## What hkb looks like today

Healthy by the usual measures — 693 tests passing, boundaries enforced by tests, the Kubernetes
mapping stated in the schema. The problem is not correctness, it is the shape of one function:

| | |
|---|---|
| `reconcile()` | 1,390 lines (`src/controller.ts` 670–2060) |
| └ `runAndRecord()` nested inside it | ~1,075 lines |
| &nbsp;&nbsp;└ one `try` block | ~930 lines, ~15 sequential phases |
| sharing mutable scope across them | `outcome`, `recorded`, `heldToTheEnd`, `checkInterrupted` |
| `src/controller.ts` | 2,071 lines, **53% comments** |
| `test/controller.test.ts` | 3,231 lines |

Three consequences, all of which show up as poor agent output in that repo:

1. **The unit of change is the whole function.** Editing one phase means holding the renewer, the
   lease invariants, the try/finally and fourteen other phases in context.
2. **Ordering constraints live in comments, not types** — "collect outputs BEFORE teardown",
   "check only while we still hold the lease". A model cannot violate a type it cannot see; it can
   absolutely violate a comment.
3. **The prose is justification, not instruction.** Excellent for a human reader; for a narrow edit
   it is thousands of tokens explaining decisions that are not the current task.

## The phases, sorted by whose they are

Apply hkb's own ADR-018 test — *does `batch/v1` have a field for it?* — to the contents of that
`try` block:

**The engine replaces these (roughly five):**
- claim, lease acquisition, lease renewal, fenced release
- running the session
- the Job-wide deadline
- the retry/resume decision (`nextPhase`)
- writing the attempt record and its events

**The engine has no opinion about these (roughly ten), and `batch/v1` has no field for any of
them — so by hkb's own rule they are board concepts sitting in the core:**
- reading an approval off the event stream
- the previous attempt's check failure
- results directory, artifacts directory, plugin grants
- resolving declared inputs
- the contributor guide, the board's default workflow, brief composition
- collecting declared outputs / results / artifacts
- the proposal
- the completion check

**Deleted outright:** `src/liveness.ts`, the supervisor, the `AbortSignal` plumbing (56 sites),
`src/runtime/`, the `Lease` table. The engine does not own the process, so none of it is needed.

Net: ~1,000–1,100 lines replaced by an import, plus ~800 lines *relocated* into board modules.
That relocation is the decomposition hkb needs anyway.

## The four phases

**Phase 1 — plumbing only (½ day, risk ≈ 0).**
Keep hkb at the repo root; add `engine/` beside `src/` with `"workspaces": ["engine"]` and
`"agent-runtime": "*"`. Do **not** move hkb into `packages/hkb/` — that touches `paths.ts`, the
prisma config, `bin`, `files`, the smoke test and CI for no benefit yet.

*Verified*: Node runs the engine's `.ts` through the workspace symlink, because the realpath is
outside `node_modules`. hkb's "no build step until publish" rule survives.

Write `prismaJournal` (below), add one test that hkb files a task through the engine against its
own `board.db`, and change nothing else.

**Phase 2 — one Job through the engine, behind a flag (1–2 days).** A second path alongside the
old one. Run real work through both and compare.

**Phase 3 — move the board phases out of `controller.ts` (2–3 days).** The big one. Each phase
becomes a module with its own test. The board's post-run work (outputs, results, artifacts, check,
verdict) becomes a **consumer of the engine's feed**, triggered by the `settled` event.

**Phase 4 — delete (1 day).** The execution half of `controller.ts`, `liveness.ts`, `runtime/`,
the `Lease` table and its migration.

Usable after phase 2. Roughly a week focused.

## `Journal.prisma()` — hkb's store, in hkb

The engine defines the interface; hkb implements it. No Prisma, no SQL, no migration ever reaches
the engine, and the import arrow points one way.

```ts
// hkb: src/engine-journal.ts
import { Journal, JournalError, type Event, type JournalOps } from 'agent-runtime'
import { openBoard } from './db.ts'

export const prismaJournal = (boardId: number): JournalOps => { /* four methods */ }
```

The engine takes it as `Engine.layer({ root, journal: prismaJournal(boardId) })`, each method an Effect
(`list` an Effect value): a Prisma call goes in through `Effect.tryPromise`, its failure a `JournalError`.

Three details that make it fit:

- **`kind: 'ae:…'` namespacing.** Engine events live in the `Event` table hkb already has, without
  colliding with `claimed`/`triaged`, and `watch.ts` keeps working untouched.
- **`String(job.id)` is the engine's task id.** Engine ids are strings, `Job.id` is an int, and
  `file({ id })` takes an explicit id — so Step → Job → engine task share one identity and no
  mapping table exists.
- **The cursor becomes `WHERE id > cursor ORDER BY id`.** hkb's own `watch.ts` already argues why
  that is a complete read on SQLite: one writer file-wide, so a lower id always commits first.

## Two consequences to decide on *before* starting

1. **The completion check leaves the attempt loop.** Today hkb's "succeeded" means *session done
   AND declared outputs present AND check passed*, all inside one attempt. With the engine, the
   engine says "the session finished" and the board says "and it produced what it promised" — two
   verdicts, two records. A failed check files a *new* engine task (resuming the session) rather
   than looping inside an attempt. That is ADR-008's split done properly, and it is most of why
   that function is 1,400 lines.

2. **Two writes instead of one transaction.** Today Job phase + Attempt + Event commit together.
   With the engine owning attempts, its `settled` and the board's verdict are separate writes —
   even in the same SQLite file, since the engine's API exposes no transaction. You get eventual
   consistency reconciled by the board's own level-triggered pass. That is fine and it is the
   correct pattern; it should be a decision rather than a discovery.

## The advice that came with all of this

Run your own real work through `agent-runtime` + `agent-orchestrator` for a week first. The answer to
"replace hkb's core, or make hkb a consumer, or neither" will be obvious by then, and waiting
costs nothing.
