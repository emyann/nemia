/**
 * The list's memo of runs at rest: what `GET /api/runs` answered for a finished run, kept while nothing it was judged on has changed, so a
 * poll of the Factory reads the journals of the runs still moving and not of every run the store has ever had.
 *
 * A cache of a pure function, never a source of truth, keyed by the facts the tick's own memo of runs at rest watches (`restMemo` in the
 * package's tick.ts): the run's files in the store — its record, the markers and asks a person writes beside it (`restStamps`) — and its record
 * as read; nothing of its tasks on the engine's feed since (`evictedBy`), every journal append being a line there; and the tips of the branches
 * git was asked about for it, with its base branch's, read in one `for-each-ref` a repository (`headsOf`). Anything else takes the run out,
 * and the next request judges it afresh. In memory alone: nothing is written for it, and a restarted api starts with none.
 *
 * `WF_VERIFY_REST=1`, which every api test sets (`test/harness.ts`), judges each run the memo answers in full too, and a request whose answer
 * differs fails: a change the memo missed is a bug in what it watches. Off in normal runs, since it spends all that the memo saves.
 */
import path from 'node:path';
import { isDeepStrictEqual } from 'node:util';
import { evictedBy, headsOf, restStamps } from 'agent-orchestrator';
import { isGitRun, type Run } from 'agent-orchestrator/run';
import { e } from './store.ts';

/** One run's answer and what it was judged on. */
type Kept<T> = { stamp: string; record: string; tips: Readonly<Record<string, string | null>>; answer: T };

/** The memo: each run at rest, and where on the engine's feed it has read to — undefined until a request has read the feed. */
export type RestingMemo<T> = { cursor?: number; runs: Map<string, Kept<T>>; hits: number };

export const restingMemo = <T>(): RestingMemo<T> => ({ runs: new Map(), hits: 0 });

/** What a request reads the memo through: the store stamped and the feed read once, before any record is. */
export type RestingRead<T> = {
  /** Whether each answer from memory is judged afresh too (`WF_VERIFY_REST=1`). */
  verify: boolean;
  /** The answer kept for `run`, where every input it was judged on is as it was; undefined otherwise. */
  kept(run: Run): T | undefined;
  /**
   * Keep `answer` for `run`, judged on its record as read and on the tips of `branches`, the result branches git was asked about for it —
   * and its base branch with them, since whether a branch is on it moves when the base does — as `heads` gives them: the listing the answer
   * was read from. Nothing is kept for a run the store has no stamp for, for a memo that could not read the feed, or once another request has
   * read the feed on past where this one read to: a line it read concerned no run then kept, and this answer may be judged on a journal from
   * before it.
   */
  keep(run: Run, answer: T, branches: readonly string[], heads: (repo: string) => ReadonlyMap<string, string>): void;
  /** Take `run` out: judged afresh, it was not at rest. */
  drop(run: Run): void;
  /** Count an answer given from memory. */
  hit(): void;
  /** Forget every run but `ids`, the runs the store has: a run gone from it is gone from the memo. */
  only(ids: Iterable<string>): void;
};

/**
 * The memo brought up to the engine's feed — every run a task of which appended since is taken out — and the store stamped: made before the
 * request reads a record, so what changes between the two is read as changed on the next request, never missed. A memo that has read
 * nothing reads the feed from its end, and holds nothing a line before could concern; a feed that went back — a journal replaced or cut — or
 * that cannot be read empties the memo, and a read made while it cannot be read keeps nothing.
 */
export async function restingRead<T>(memo: RestingMemo<T>, verify = process.env.WF_VERIFY_REST === '1'): Promise<RestingRead<T>> {
  let fed = true;
  try {
    if (memo.cursor === undefined) {
      memo.runs.clear();
      const { cursor } = await e.feed(Number.MAX_SAFE_INTEGER);
      memo.cursor = cursor >= Number.MAX_SAFE_INTEGER ? 0 : cursor;
    } else {
      const { entries, cursor } = await e.feed(memo.cursor);
      if (cursor < memo.cursor) memo.runs.clear();
      else
        for (const id of evictedBy(
          entries.map((f) => f.taskId),
          new Set(memo.runs.keys()),
        ))
          memo.runs.delete(id);
      memo.cursor = cursor;
    }
  } catch {
    memo.runs.clear();
    memo.cursor = undefined;
    fed = false;
  }
  // Where this request read the feed to: a line past it is read by the next request, unless another request reads it first (`keep`).
  const readTo = memo.cursor;
  const stamps = restStamps();
  const heads = new Map<string, ReadonlyMap<string, string>>();
  const now = (repo: string) => {
    const at = path.resolve(repo);
    if (!heads.has(at)) heads.set(at, new Map(Object.entries(headsOf(at))));
    return heads.get(at)!;
  };
  const tipsOf = (
    run: Run,
    branches: readonly string[],
    headsIn: (repo: string) => ReadonlyMap<string, string>,
  ): Record<string, string | null> =>
    isGitRun(run) && branches.length
      ? Object.fromEntries([...new Set([...branches, run.branch])].map((b) => [b, headsIn(run.repo).get(b) ?? null]))
      : {};
  return {
    verify,
    kept(run) {
      const kept = memo.runs.get(run.id);
      if (!kept || kept.stamp !== stamps.get(run.id) || kept.record !== JSON.stringify(run)) return undefined;
      return isDeepStrictEqual(tipsOf(run, Object.keys(kept.tips), now), kept.tips) ? kept.answer : undefined;
    },
    keep(run, answer, branches, heads) {
      const stamp = stamps.get(run.id);
      if (!fed || memo.cursor !== readTo || stamp === undefined) return;
      memo.runs.set(run.id, { stamp, record: JSON.stringify(run), tips: tipsOf(run, branches, heads), answer });
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
}
