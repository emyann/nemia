# Evaluation: SQLite for the workflow store

Written 2026-09-22, on the owner's question: `~/.agent-workflows` holds a great many files — would SQLite be better than
files spread through that folder? Measured on this machine's store that day, main at `856b079`, Node 24.20.

**The answer in one paragraph.** Not as a replacement, and not now. The store does hold about 67,000 files and 3.2 GB,
but 99.7% of that is worktrees and screenshots — files that stay files under any database. The state itself is about
900 files and 10 MB, read in about a second per pass, and its layout carries three rules this repository keeps on
purpose: one writer per file, level-triggered passes that compose what they read, and records a person can read. SQLite
would not reduce the clutter, and would give up the readable records. What fixes the clutter is forgetting finished
runs and keeping fewer screenshots. SQLite earns a place later, behind the store interface P7 already plans: as the
engine's journal first, and as the hosted product's store.

---

## 1. What is in the store

| Part | Size | Files | What it is |
|---|---|---|---|
| `worktrees/` | 2.0 GB | ~60,000 | 32 runs' git worktrees, each with a `node_modules` per workspace package; one run's alone is 776 MB |
| `runs/<id>/artifacts/` | 1.2 GB | 5,512 | 5,330 of them PNGs: every run's e2e photographs every page in two themes, each round |
| `engine/` | 58 MB | 1,141 | the engine's journal: 686 task files (8.3 MB), `feed.jsonl` (7.3 MB, 3,805 lines), 450 check and codex logs (43 MB) |
| `runs/*.json` | 1.5 MB | 107 | one record per run, written by the tick |
| `runs/*.asks/` | tiny | 61 | a person's approvals and answers, one file each |
| `checks/`, `inbox/`, `inputs/`, `tick.json` | < 1 MB | ~190 | check logs, parked cards, `--input` files, the last pass's ceilings |

So of 3.2 GB, the state a database could hold — run records, asks, the journal and the feed — is about 17 MB
(10 MB without the check logs), in about 900 files. The rest is blobs: a git worktree is a directory git makes, and a
screenshot is a PNG a person opens. Neither goes into SQLite in any design worth having.

## 2. How the files perform

- `wf ls` over 107 runs: 1.3 s, most of it Node starting. One `wf tick`: 1.4 s, the same. The daemon passes every 4 s.
- The feed is read from a cursor, not from the start (`JournalOps.feed`, `agent-runtime/src/journal.ts:46-56`), and the
  api keeps its place (`filings` in `apps/api/src/store.ts`).
- Nothing in `open-issues.md` or `features.md` is a store problem: no lost write, corruption or slow read has been
  reported since one writer per file became a rule.

There is no performance case today. A pass reads every run, so its cost grows with the runs kept — which is the
retention question in §4, not a storage one.

## 3. What files give that SQLite would take

- **One writer per file.** The tick writes the run record; a person's facts (`.cancelled`, approvals, answers) are files
  of their own, composed when read (`CLAUDE.md`, *Rules the code keeps*). Two writers doing read-modify-write lost
  updates once. SQLite would allow several writers safely, but the design doesn't need it: no transaction spans two
  writers, by construction.
- **Level-triggered passes.** A pass reads the world and carries nothing forward. Files suit that: a deleted ask file is a
  withdrawn word (with the limits `CLAUDE.md` names). In a database the same fact becomes a row the tick must be taught
  to read in the same way — a change of medium, not a gain.
- **A person can read it.** `cat runs/<id>.json`, `ls runs/<id>.asks/`, `tail engine/feed.jsonl`, and git-like diffs of a
  record. The pivot names this as part of trusting the system: "Files stay the local default — people can read them"
  (`docs/pivot-2026-09-18.md`, P7).
- **The owner's earlier decision.** The inbox was built as a folder of cards with no SQLite (2026-09-16), for the same
  reason.

What SQLite would give: one file to back up, atomic writes across rows, queries (runs by repository, by state), a
schema, and the store a hosted product needs. `node:sqlite` is built into Node — SQLite 3.53.4 here, no dependency —
so the cost of trying is low.

## 4. What to do instead, now

The clutter has two causes, and neither is the file format.

1. **Nothing is forgotten.** 107 run records, 32 worktrees, 145 `wf/*` branches, 144 of them merged into main. `wf rm`
   exists and removes a run's worktrees through git, its record and every file keyed by its id. A retention rule — say,
   a run merged and older than a week is forgotten, its branch kept — would remove most of the 2 GB. Whether the tick
   does it or a person runs it (`wf rm --merged --older-than 7d`) is the owner's decision; a person's word fits the
   rules better than a tick that deletes.
2. **Every e2e keeps every screenshot of every round.** 5,330 PNGs. Keep the last round's, or only the pages a change
   touched, or drop a run's screenshots when it is forgotten (which `wf rm` already does).

These are two small cards in the package, and they do what the question was after: a folder with far fewer files in it.

## 5. If SQLite comes: the big steps

In order, each small enough for one card, none before the one above it.

1. **A store interface for the run records.** Today `runner.ts` reads and writes `runs/*.json`, asks and inbox cards
   directly. Put them behind one interface — read a run, write a run, list, the asks — as the engine's `JournalOps`
   already is. Files stay the only implementation. This is P7's first item, useful whether or not SQLite follows, and it
   makes the rest a swap rather than a rewrite.

   Begun 2026-09-30 as `RunStore` (`packages/agent-orchestrator/src/record/record.ts`), files its only implementation
   (`filesStore`, bound as `runStore` in `src/record/files.store.ts`), the tick's pass first. The person's verbs, the
   readers and the api, and the inbox's cards and queue tries (`inbox`) followed; no file of `src` but the store's own
   reaches a run's files directly, which `test/run-store.test.ts` refuses.
2. **SQLite as a second journal for the engine.** The engine's journal is already an interface with a file
   implementation and a memory one (`memoryJournal`). A `sqliteJournal` on `node:sqlite` — tasks, events and the feed in
   one file, WAL mode — is the cleanest place to try it: behind a boundary, measured, with the file journal kept as the
   default. Measure the pass time and the feed read against the files on a copy of this store.
3. **A derived index, never the source.** If the board's lists get slow as runs grow, a SQLite file rebuilt from the
   records (deletable at any time, rebuilt on the next read) answers queries without moving the truth off files.
4. **SQLite as the store, by choice.** Only when a reason exists that files cannot meet — the hosted product (P7:
   tenants, a database), or several machines on one store. Then the interface from step 1 gets a SQLite implementation,
   an export keeps records readable (`wf export <run>` writes the JSON a person reads today), and one writer per *row* is
   kept, as the files keep one per file.

## 6. The recommendation

Do §4 now: two small cards, retention and screenshots. Do §5 step 1 when P7 comes up, or as soon as multi-repo work
touches the store (`docs/plan-multi-repo.md`). Try step 2 as an experiment when a measurement asks for it. Keep
files as the local default.
