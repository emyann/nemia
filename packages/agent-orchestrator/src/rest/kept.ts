/**
 * A stamp-keyed memo of a projection of each run's record, shared by every read that wants a little of every run: the inbox's listing,
 * the factories' schedules, the pause's current tasks and a step's recent runs. A read hands in what it needs of a run (`project`), and
 * a run whose files in the store stamp as they did is answered from memory, so a poll reads no finished run's record however many the
 * store holds.
 *
 * It keys on the stamp alone — no feed cursor, no branch tips, unlike the list's memo of runs at rest (`resting.verb.ts`) and the stats'
 * — because a projection of the record has no other input: what a pass reads of a run beside its record is a person's file beside it,
 * and the stamp is a `stat` of the record and of every such file (`restStamps` in record.store.ts), which is exactly what `readRun`
 * composes. A projection that read the engine's feed, git or the store's pause would belong in one of those memos instead.
 *
 * A cache of a pure function, never a source of truth: a caller that hands no memo reads every record, which is what the command line
 * and a cold test do, and a process started again starts with none. Pure: the stamps and the reader are handed in, and it touches no
 * disk.
 */
import { isDeepStrictEqual } from 'node:util';
import type { Run } from '../record/record.ts';

/** The memo: what each run was projected to, and the stamp of the files it was projected from. */
export type RecordMemo<P> = { runs: Map<string, { stamp: string; of: P }> };

/** A memo that holds nothing: what a serving process starts with, one per read. */
export const recordMemo = <P>(): RecordMemo<P> => ({ runs: new Map() });

/**
 * What a read reads the memo through: the store stamped before any record is read, the reader of one run by id
 * (`RunStore.runs.find`), and whether every kept projection is judged afresh too (`WF_VERIFY_REST=1`).
 */
export type RecordsRead = {
  readonly stamps: ReadonlyMap<string, string>;
  readonly find: (id: string) => Run | undefined;
  readonly verify: boolean;
};

/**
 * Every run of the store projected, by id as `listRuns` orders them: each run whose stamp stands answered from `memo`, each other read
 * through `read.find` and projected, and every id gone from the stamps forgotten, on every call and not only on a miss, so no run of a
 * store a daemon serves for weeks is held after it is removed. A run the reader does not answer for — a record removed since the stamps
 * were taken, or one that does not read as a run — is left out, as `listRuns` leaves it out, and is forgotten.
 *
 * With no `memo`, every record is read and nothing is kept. Under `read.verify`, a run answered from memory is read and projected afresh
 * too, and a projection that differs throws naming the run: something the projection reads is not in the stamp.
 */
export function keptRecords<P>(memo: RecordMemo<P> | undefined, read: RecordsRead, project: (run: Run) => P): P[] {
  const ids = [...read.stamps.keys()].sort((a, b) => a.localeCompare(b));
  const projected = (id: string): P | undefined => {
    const run = read.find(id);
    return run === undefined ? undefined : project(run);
  };
  if (!memo)
    return ids.flatMap((id) => {
      const of = projected(id);
      return of === undefined ? [] : [of];
    });
  for (const id of memo.runs.keys()) if (!read.stamps.has(id)) memo.runs.delete(id);
  const out: P[] = [];
  for (const id of ids) {
    const kept = memo.runs.get(id);
    const stamp = read.stamps.get(id)!;
    if (kept && kept.stamp === stamp) {
      if (read.verify) verified(id, kept.of, projected(id));
      out.push(kept.of);
      continue;
    }
    const of = projected(id);
    if (of === undefined) {
      memo.runs.delete(id);
      continue;
    }
    memo.runs.set(id, { stamp, of });
    out.push(of);
  }
  return out;
}

/** Refuses a projection kept for `id` that a fresh read does not give again (`WF_VERIFY_REST`), naming the run. */
function verified<P>(id: string, kept: P, fresh: P | undefined): void {
  if (isDeepStrictEqual(kept, fresh)) return;
  throw new Error(
    `The memo of run records answered ${id} differently from a fresh read (WF_VERIFY_REST): something its projection reads is not in the run's stamp.`,
  );
}
