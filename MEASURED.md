# Every poll of the board reads only what changed — a fixture store's before and after

## The fixture

A scratch store under `WF_ROOT` of **806 run records**: 800 copies of a real finished run's record from the live store
(`a-badge-takes-a-colour-role-2udj`, so a record of the size the daemon actually holds — frozen steps, agent instructions and all),
and 6 runs with a task id on each step, standing for the runs still moving.

Each read's store half is timed and its record reads counted with the package's own meter (`metered`, `tallies.records`), cold (a
fresh process, a fresh memo) and warm (the third call, after two). `WF_VERIFY_REST=0`, as the daemon runs. On this machine
(WSL2, 12 cores); a time measured here is a floor, not a ceiling.

## Before (`16816851`, this card's base)

Every read lists every record on every poll.

| read | cold | warm |
| --- | --- | --- |
| inbox | 236 ms / 806 records | 143 ms / 806 records |
| factories | 165 ms / 806 records | 140 ms / 806 records |
| pause | 129 ms / 806 records | 125 ms / 806 records |
| step page | 140 ms / 806 records | 123 ms / 806 records |
| run page | 120 ms / 806 records | 126 ms / 806 records |

## After

| read | cold | warm |
| --- | --- | --- |
| inbox | 150 ms / 806 records | **4 ms / 0 records** |
| factories | 118 ms / 806 records | **2 ms / 0 records** |
| pause | 126 ms / 806 records | **2 ms / 0 records** |
| step page | 152 ms / 806 records | **5 ms / 0 records** |
| run page | **1 ms / 1 record** | **1 ms / 1 record** |

Measured again on the tree with the base merged in (`eb71f6f9`), the record counts are the same and the times within this machine's
spread: cold 232 / 134 / 152 / 180 ms and 5 ms for the run page, warm 4 / 3 / 3 / 5 ms and 0 ms, each warm read still 0 records and
the run page still 1.

The run page needs no memo: `runs.find` reads the one record the id names, found among the ids the store lists.

The cold read answers exactly what it answered before, at the same cost: the memo is a cache of a pure function, and a fresh process
holds none. The four warm reads cost one `readdir` of the store and a `stat` of each file beside each record (`restStamps`) and no
record at all.

A first cut of `keptRuns` went through `runs.find` per run, which lists the store and reads the store's pause once per run: the cold
read then cost 380–414 ms, over twice the before. The store is now listed once and the pause read once for the whole read, as
`runs.list` does, and the cold figures above are that.

## What a test holds

- `src/record/files.store.test.ts` — a warm read through a memo reads 0 records, unchanged when 200 finished records are added, and
  its answer deep-equals a cold read's; `runs.find` costs one record whatever the store holds.
- `src/inbox/inbox.store.test.ts`, `src/factory/factory.verb.test.ts` — the same for the inbox's and the factories' reads, 0 records
  warm with 200 more finished runs, and parity against a cold read.
- `src/pause/pause.verb.test.ts` — one record per live run and no finished run's, with 200 finished runs in the store.
- `apps/api/src/workflows/workflows.test.ts` — a step's page read twice says the same, under the harness's `WF_VERIFY_REST=1`.
