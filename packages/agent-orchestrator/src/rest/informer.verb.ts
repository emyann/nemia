/**
 * The informer: each run's judgement (`Judgement`, summary/judgement.verb.ts), kept in memory for a process that serves, so the tick's
 * pass judges a run once and the requests that read it — the run object, its sub-resources, the runs list — answer from that one
 * judgement instead of judging it again. A daemon gives one (`informerLayer`), which its passes fill and its requests read; a process
 * that gives none (`nemia show`, `nemia ls`, a test) judges each run on demand, as before.
 *
 * A cache of a pure function, never a source of truth, keyed by what the run was judged on — its files in the store (its stamp in
 * `runStore`, the record and every marker and ask a person writes beside it), each of its tasks' journals (a line on the engine's feed,
 * `followedFeed`), and the tips of the branches git was asked about for it with its base branch, as the read's `git` gives them
 * (`BranchReader.heads`) — and by whether it was at rest when judged and by which pass: whether an entry is served is `informedOf`'s
 * (rest.ts). A run at rest is served across passes while its inputs hold; a run still moving only within the pass that judged it, since
 * its judgement rests on sightings of its harnesses that no stamp or feed line announces. In memory alone: nothing is written for it, and
 * a process started again starts with none and judges every run afresh.
 *
 * Beside a run's judgement it keeps the run's listed object built on it (`keepObject`), for the RunList: served exactly while that
 * judgement is (`keptObject`), and gone with it. The object's parts no stamp watches — what is on disk, a folder run's step files, what
 * the workflow folder says now — are read on every request instead (`diskPartsOf`, object/run.verb.ts).
 *
 * `WF_VERIFY_REST=1` judges each run the informer answers afresh too, and a read whose answer differs is refused (`answered`): a change
 * it missed is a bug in what it watches. Such a read hands the store nothing from memory (`given`). A controller: it reads the feed
 * through the client, the store's stamps and the tips its reader gives, and writes nothing.
 */
import path from 'node:path';
import { isDeepStrictEqual } from 'node:util';
import { Context, Effect, Layer } from 'effect';
import type { Engine } from '../runtime-client.ts';
import type { BranchReader } from '../branches/branches.store.ts';
import { runStore } from '../record/files.store.ts';
import { isRepositoryRun, type Run } from '../record/record.ts';
import { type Judgements, type Judgement, type JudgedOrWhy, judgementsOf, restingOf } from '../summary/judgement.verb.ts';
import { followedFeed } from './rest.verb.ts';
import { evictedBy, informedOf } from './rest.ts';
import type { Run as RunObject } from '../object/run.model.ts';

/**
 * One run's kept value and what it was judged on: the run as it was read, which `given` hands back in place of its record; whether it was
 * at rest; and the pass that judged it, none where no pass had started.
 */
type Entry<T, O = unknown> = {
  stamp: string;
  run: Run;
  tips: Readonly<Record<string, string | null>>;
  atRest: boolean;
  pass: number | undefined;
  value: T;
  /** The run's listed object built on `value` (`keepObject`), its disk parts as they were then: served while `value` is. */
  object?: O;
};

/**
 * The informer's memory: each run's entry, where on the engine's feed it has read to (undefined until a read has read the feed), the
 * pass now running (none until a pass starts: `passStarted`), how many answers it gave from memory, and how many of the RunList's
 * objects it served kept (`objectHits`).
 */
export type InformerMemo<T = Judgement, O = RunObject> = {
  cursor?: number;
  runs: Map<string, Entry<T, O>>;
  pass?: number;
  hits: number;
  objectHits: number;
};

/** An informer that holds nothing: what a serving process starts with. */
export const informerMemo = <T = Judgement, O = RunObject>(): InformerMemo<T, O> => ({ runs: new Map(), hits: 0, objectHits: 0 });

/**
 * The listed object kept for the run `id` on the very entry that holds `judgement`, the one this read was served or judged: none where
 * the entry holds another judgement, since an object is served exactly while the judgement it was built on is.
 */
export const keptObject = <T, O>(memo: InformerMemo<T, O>, id: string, judgement: T): O | undefined => {
  const entry = memo.runs.get(id);
  return entry !== undefined && entry.value === judgement ? entry.object : undefined;
};

/**
 * Keep `object`, the run `id`'s listed object built on `judgement`, on the entry that holds that judgement, and on no other: an entry a
 * request since replaced with a newer judgement is never given an older object. Its disk parts are read again on every request.
 */
export const keepObject = <T, O>(memo: InformerMemo<T, O>, id: string, judgement: T, object: O): void => {
  const entry = memo.runs.get(id);
  if (entry !== undefined && entry.value === judgement) entry.object = object;
};

/**
 * This process's informer, a `Context.Reference` whose default is none: a daemon gives one (`informerLayer`) that its passes fill and its
 * requests read, and a program given none judges every run on demand.
 */
export const Informer = Context.Reference<InformerMemo | undefined>('agent-orchestrator/Informer', { defaultValue: () => undefined });

/** One informer for a process, made by its layer: the api gives one per app, read by the daemon's pass and every request alike. */
export const informerLayer = (): Layer.Layer<never> => Layer.sync(Informer, () => informerMemo());

/** A pass begins: an entry of a run still moving that an earlier pass or request kept is judged again from now on. */
export const passStarted = (memo: InformerMemo<unknown>): void => {
  memo.pass = (memo.pass ?? 0) + 1;
};

/** Forget the run `id`: a write just touched it, and the next read judges it again. */
export const dropInformed = (memo: InformerMemo<unknown>, id: string): void => {
  memo.runs.delete(id);
};

/** What a read reads the informer through: the store stamped and the feed read once, before any record is. */
export type InformerRead<T> = {
  /** Whether each answer from memory is judged afresh too (`WF_VERIFY_REST=1`). */
  verify: boolean;
  /**
   * The value kept for `run`, where `informedOf` serves it: its stamp, its tasks' feed and its tips as they were, and it at rest or judged
   * within this pass. The run is the one `given` handed the store, or a record read afresh that says the same.
   */
  kept(run: Run): T | undefined;
  /**
   * The run kept for `id`, for the store to list in place of a read of its record, while its files stamp as they did; undefined otherwise,
   * and for every run on a verified read, which judges each kept value against a record read afresh.
   */
  given: (id: string) => Run | undefined;
  /** Refuses `fresh`, `run` judged afresh, where this read answered `run` from memory otherwise (`same` says whether two agree). */
  answered(run: Run, fresh: T): void;
  /**
   * Keep `value` for `run`, judged on its record as read, on the tips of `branches` — the result branches git was asked about for it, and
   * its base branch with them — as `heads` gives them, `atRest` as the judgement says, in the pass now running. Held until `commit`. A
   * run still moving is kept only once a pass has started: kept before, it would be served by nothing. What is not kept takes out what
   * the informer held for the run.
   */
  keep(run: Run, value: T, branches: readonly string[], heads: (repo: string) => ReadonlyMap<string, string>, atRest: boolean): void;
  /**
   * Put what `keep` held into memory: all of it, where nobody read the feed on past this read; otherwise each run no line of whose tasks
   * is on the feed since this read read it, read again from there; none where the feed cannot be read, or went back.
   */
  commit(): Effect.Effect<void>;
  /** Take `run` out: judged afresh, it does not read. */
  drop(run: Run): void;
  /** Count an answer given from memory. */
  hit(): void;
  /** Forget every run but `ids`, the runs the store has. */
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
 * What a read kept (`held`) put into `memo`: all of it, where the memo's place on the feed is still `readTo`, where the read read it
 * to; otherwise each run no line of whose tasks is on the feed past `readTo`, read again from there; none where it cannot be read, or
 * went back.
 */
const committed = <T, O>(e: Engine, memo: InformerMemo<T, O>, held: ReadonlyMap<string, Entry<T, O>>, readTo: number | undefined) =>
  Effect.gen(function* () {
    if (!held.size || readTo === undefined) return;
    if (memo.cursor === readTo) {
      for (const [id, entry] of held) memo.runs.set(id, entry);
      return;
    }
    const since = yield* Effect.result(e.feed(readTo));
    if (since._tag === 'Failure' || since.success.cursor < readTo) return;
    const moved = evictedBy(
      since.success.entries.map((f) => f.taskId),
      new Set(held.keys()),
    );
    for (const [id, entry] of held) if (!moved.has(id)) memo.runs.set(id, entry);
  });

/**
 * The informer brought up to the engine's feed (`followedFeed`) and the store stamped: made before the read takes a record, so what
 * changes between the two is read as changed on the next read, never missed. A read made while the feed cannot be read serves and keeps
 * nothing. The feed is read through `e`, `verify` is `WF_VERIFY_REST` as the caller's environment gives it, the tips a kept value is
 * checked against are what `git` read, with no process, and `same` says whether a value from memory and one judged afresh agree.
 */
export const informerRead = Effect.fn('informerRead')(function* <T, O>(
  e: Engine,
  memo: InformerMemo<T, O>,
  verify: boolean,
  git: BranchReader,
  same: (kept: T, fresh: T) => boolean = isDeepStrictEqual,
) {
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
  const held = new Map<string, Entry<T, O>>();
  const read: InformerRead<T> = {
    verify,
    kept(run) {
      const entry = memo.runs.get(run.id);
      if (!entry) return undefined;
      const verdict = informedOf({
        stampHeld: entry.stamp === stamps.get(run.id) && (entry.run === run || JSON.stringify(entry.run) === JSON.stringify(run)),
        quiet: fed,
        tipsHeld: isDeepStrictEqual(tipsOf(run, Object.keys(entry.tips), now), entry.tips),
        atRest: entry.atRest,
        samePass: entry.pass !== undefined && entry.pass === memo.pass,
      });
      if (verdict === 'judge') return undefined;
      gave.set(run.id, entry.value);
      return entry.value;
    },
    given: (id) => {
      if (verify) return undefined;
      const entry = memo.runs.get(id);
      return entry && entry.stamp === stamps.get(id) ? entry.run : undefined;
    },
    answered(run, fresh) {
      const was = gave.get(run.id);
      if (was !== undefined && !same(was, fresh))
        throw new Error(
          `The informer answered ${run.id} differently from a fresh judgement (WF_VERIFY_REST): something it was judged on is not watched.`,
        );
    },
    keep(run, value, branches, heads, atRest) {
      const stamp = stamps.get(run.id);
      if (!fed || stamp === undefined || (!atRest && memo.pass === undefined)) {
        memo.runs.delete(run.id);
        return;
      }
      held.set(run.id, { stamp, run, tips: tipsOf(run, branches, heads), atRest, pass: memo.pass, value });
    },
    commit: () => committed(e, memo, held, readTo),
    drop(run) {
      memo.runs.delete(run.id);
      held.delete(run.id);
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

/**
 * `runs` judged through the informer's `read`: each one it serves (`kept`) from memory, the rest judged off one listing
 * (`judgementsOf`) and kept, at rest or not (`restingOf`), in the pass now running — and on a verified read every one judged afresh too
 * and compared (`answered`). A run not judged leaves the informer. What is kept is put into memory once all are judged (`commit`).
 */
export const informedJudgements = Effect.fn('informedJudgements')(function* (
  e: Engine,
  home: string,
  runs: readonly Run[],
  read: InformerRead<Judgement>,
  git: BranchReader,
  store?: () => readonly Run[],
) {
  const out = new Map<string, JudgedOrWhy>();
  const toJudge: Run[] = [];
  for (const run of runs) {
    const kept = read.kept(run);
    if (kept) {
      out.set(run.id, { judgement: kept });
      read.hit();
    }
    if (!kept || read.verify) toJudge.push(run);
  }
  const fresh = yield* judgementsOf(e, home, toJudge, git, store);
  for (const run of toJudge) {
    const one = fresh.runs.get(run.id);
    if (one === undefined) continue;
    if ('unjudged' in one) {
      out.set(run.id, one);
      read.drop(run);
      continue;
    }
    read.answered(run, one.judgement);
    if (out.has(run.id)) continue;
    out.set(run.id, one);
    read.keep(run, one.judgement, one.judgement.asked.branches, git.heads, yield* restingOf(e, one.judgement));
  }
  yield* read.commit();
  return { runs: out, views: fresh.views, unreadable: fresh.unreadable } satisfies Judgements;
});
