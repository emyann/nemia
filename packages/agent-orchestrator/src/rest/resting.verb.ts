/**
 * The list's memo of runs at rest: what the board's list of runs answered for a finished run, kept while nothing it was judged on has
 * changed, so a poll of the list reads the journals of the runs still moving and not of every run the store has ever had.
 *
 * A cache of a pure function, never a source of truth, keyed by the facts the tick's own memo of runs at rest watches (`RestMemo` in
 * tick.verb.ts): the run's files in the store — its record, the markers and asks a person writes beside it (its stamp in `runStore`) —
 * and the run it judged, which it hands back to the store in place of a read of the record (`given`, as the tick's `keptOf` does), so
 * that a run at rest costs its stamp and no record; nothing of its tasks on the engine's feed since (`followedFeed`), every journal
 * append being a line there; and the tips of the branches git was asked about for it, with its base branch's, as the read's `git` gives
 * them (`BranchReader.heads`). Anything else takes the run out, and the next read judges it afresh. In memory alone: nothing is written
 * for it, and a process started again starts with none.
 *
 * `WF_VERIFY_REST=1` judges each run the memo answers in full too, and a read whose answer differs is refused (`answered`): a change the
 * memo missed is a bug in what it watches. Such a read gives the store nothing from memory (`given`), so every record is read afresh
 * and the run the memo kept is compared against it as text. Off in normal runs, since it spends all that the memo saves. A controller:
 * it reads the feed through the client, the store's stamps and the tips its reader gives, and writes nothing.
 */
import path from 'node:path';
import { isDeepStrictEqual } from 'node:util';
import { Effect } from 'effect';
import type { Engine } from '../runtime-client.ts';
import type { BranchReader } from '../branches/branches.store.ts';
import { runStore } from '../record/files.store.ts';
import { isRepositoryRun, type Run } from '../record/record.ts';
import { followedFeed } from './rest.verb.ts';

/** One run's answer and what it was judged on: the run as it was read, which `given` hands back in place of its record. */
type Kept<T> = { stamp: string; run: Run; tips: Readonly<Record<string, string | null>>; answer: T };

/** The memo: each run at rest, and where on the engine's feed it has read to — undefined until a read has read the feed. */
export type RestingMemo<T> = { cursor?: number; runs: Map<string, Kept<T>>; hits: number };

/** A memo that holds nothing: what a serving process starts with. */
export const restingMemo = <T>(): RestingMemo<T> => ({ runs: new Map(), hits: 0 });

/** What a read of the list reads the memo through: the store stamped and the feed read once, before any record is. */
export type RestingRead<T> = {
  /** Whether each answer from memory is judged afresh too (`WF_VERIFY_REST=1`). */
  verify: boolean;
  /**
   * The answer kept for `run`, where every input it was judged on is as it was; undefined otherwise. The run itself is the one `given`
   * handed the store, by identity — a record read afresh was read because something moved — save on a verified read, where the store is
   * given nothing and the run read afresh is compared as text instead.
   */
  kept(run: Run): T | undefined;
  /**
   * The run the memo kept for `id`, for the store to list in place of a read of its record (`listRuns`), while its files in the store
   * stamp as they did; undefined otherwise, and undefined for every run on a verified read, which judges each kept answer against a
   * record read afresh.
   */
  given: (id: string) => Run | undefined;
  /**
   * Refuses `fresh`, `run` judged afresh, where this read answered `run` from memory (`kept`) otherwise: something it was judged on is not
   * watched. Answers nothing where the memo gave no answer for `run`.
   */
  answered(run: Run, fresh: T): void;
  /**
   * Keep `answer` for `run`, judged on its record as read and on the tips of `branches`, the result branches git was asked about for it —
   * and its base branch with them, since whether a branch is on it moves when the base does — as `heads` gives them: the listing the answer
   * was read from; the run kept is the very object given, which `given` hands back and `kept` knows by identity. Nothing is kept for a
   * run the store has no stamp for, for a memo that could not read the feed, or once another read has read the feed on past where this
   * one read to: a line it read concerned no run then kept, and this answer may be judged on a journal from before it.
   */
  keep(run: Run, answer: T, branches: readonly string[], heads: (repo: string) => ReadonlyMap<string, string>): void;
  /** Take `run` out: judged afresh, it was not at rest. */
  drop(run: Run): void;
  /** Count an answer given from memory. */
  hit(): void;
  /** Forget every run but `ids`, the runs the store has: a run gone from it is gone from the memo. */
  only(ids: Iterable<string>): void;
};

/** The tips of `branches` and `run`'s base branch, as `heads` gives them for its repository; none for a folder run or no branch. */
const tipsOf = (
  run: Run,
  branches: readonly string[],
  heads: (repo: string) => ReadonlyMap<string, string>,
): Record<string, string | null> =>
  isRepositoryRun(run) && branches.length
    ? Object.fromEntries([...new Set([...branches, run.branch])].map((b) => [b, heads(run.repo).get(b) ?? null]))
    : {};

/**
 * The memo brought up to the engine's feed (`followedFeed`) and the store stamped: made before the read takes a record, so what changes
 * between the two is read as changed on the next read, never missed. A read made while the feed cannot be read keeps nothing. The read
 * keeps where it read the feed to: a line past it is read by the next read, unless another read takes it first, and then its `keep` keeps
 * nothing. The feed is read through `e`, `verify` is `WF_VERIFY_REST` as the caller's environment gives it (`verifiesRest`), and the
 * tips a kept answer is checked against are what `git` read, with no process.
 */
export const restingRead = Effect.fn('restingRead')(function* <T>(e: Engine, memo: RestingMemo<T>, verify: boolean, git: BranchReader) {
  const fed = yield* followedFeed(e, memo);
  const readTo = memo.cursor;
  const stamps = runStore.runs.stamps();
  const heads = new Map<string, ReadonlyMap<string, string>>();
  const now = (repo: string) => {
    const at = path.resolve(repo);
    const known = heads.get(at);
    if (known !== undefined) return known;
    const found = git.heads(at);
    heads.set(at, found);
    return found;
  };
  const gave = new Map<string, T>();
  const read: RestingRead<T> = {
    verify,
    kept(run) {
      const kept = memo.runs.get(run.id);
      if (!kept || kept.stamp !== stamps.get(run.id)) return undefined;
      if (kept.run !== run && !(verify && JSON.stringify(kept.run) === JSON.stringify(run))) return undefined;
      if (!isDeepStrictEqual(tipsOf(run, Object.keys(kept.tips), now), kept.tips)) return undefined;
      gave.set(run.id, kept.answer);
      return kept.answer;
    },
    given: (id) => {
      if (verify) return undefined;
      const kept = memo.runs.get(id);
      return kept && kept.stamp === stamps.get(id) ? kept.run : undefined;
    },
    answered(run, fresh) {
      const was = gave.get(run.id);
      if (was !== undefined && !isDeepStrictEqual(was, fresh))
        throw new Error(
          `The list's memo of runs at rest answered ${run.id} differently from a fresh read (WF_VERIFY_REST): something it was judged on is not watched.`,
        );
    },
    keep(run, answer, branches, heads) {
      const stamp = stamps.get(run.id);
      if (!fed || memo.cursor !== readTo || stamp === undefined) return;
      memo.runs.set(run.id, { stamp, run, tips: tipsOf(run, branches, heads), answer });
    },
    drop(run) {
      memo.runs.delete(run.id);
    },
    hit() {
      memo.hits++;
    },
    only(ids) {
      const present = new Set(ids);
      for (const id of memo.runs.keys()) if (!present.has(id)) memo.runs.delete(id);
    },
  };
  return read;
});
