/**
 * Where a repository's result branches stand, as the place's `standing` says it, one ask for each repository and base branch: every
 * branch of the repository and its commit, and where each branch asked of stands (`PassStanding`). Reached three ways: the tick's pass asks
 * it and writes it to `standing.json` (`passStanding`); a read off the tick — `nemia ls`, the board — decodes that file, with no process
 * (`standingSnapshot`); a person's one-off verb asks it live and writes nothing (`standingNow`, `standingLive`). One reader answers off any
 * of them (`standingReader`): a question none asked is unread, never asked of git as it goes. A reading the place refused or did not
 * answer is unread too: nothing on it has landed, and the reader says why.
 */
import path from 'node:path';
import { Effect } from 'effect';
import { tried } from '../runtime-client.ts';
import { PlaceService, type Place } from '../place/place.store.ts';
import type { BranchStood, KnownStood, PlaceOutcome, PlaceRequests } from '../place/place.ts';
import { within } from '../meter/tally.store.ts';
import { isRepositoryRun, type RepositoryRun, type Run } from '../record/record.ts';
import { hasStarted, waitedOn } from '../wait/wait.ts';
import { resultBranches, type BranchReader } from '../branches/branches.store.ts';
import { landedOver } from '../branches/index.ts';
import { runStore } from '../record/files.store.ts';
import { readStanding, writeStanding, type StandingFile, type StoodRead } from './standing.store.ts';

/** How long a pass waits for one `standing`: past it, the repository reads unread on this pass, and is asked again on the next. */
export const STANDING_DEADLINE_MS = 15_000;

/**
 * What was read of where repositories stand: each repository and base branch asked, when it was read (`at`, absent where nothing was: no
 * `standing.json` yet), and the words a question nobody asked is unread with (`unasked`).
 */
export type PassStanding = {
  readonly read: ReadonlyMap<string, StoodRead>;
  readonly at?: string;
  readonly unasked?: string;
};

/** A repository and base branch as one key. */
const keyOf = (repo: string, base: string): string => JSON.stringify([path.resolve(repo), base]);

/** A branch as `standing` is asked of it. */
type AskedBranch = PlaceRequests['standing']['branches'][number];

/** One `standing` to ask: its request, each branch asked of once. */
type Ask = { repo: string; base: string; branches: Map<string, AskedBranch> };

/**
 * What the tick's passes last read of where branches stand, kept on its memo of runs at rest (`RestMemo`): for each repository and base
 * branch asked, each branch's `baseRef` and what was read of it against that `baseRef`, handed back to the place as `known`. The place
 * believes it only while the branch's commit is the one it was read of, and both are commit ids, so it never goes stale: a fresh one is a
 * restart, which asks every `baseRef` once.
 */
export type StandingMemo = Map<string, KeptStood>;

/** What a `StandingMemo` keeps of one repository and base branch: each branch's `baseRef`, and what was read of it against it. */
type KeptStood = ReadonlyMap<string, { readonly baseRef: string; readonly known: KnownStood }>;

/** A memo that holds nothing: what a daemon starts with. */
export const freshStandingMemo = (): StandingMemo => new Map();

/** A full commit id, as git names one in SHA-1 or SHA-256: a name that moves, as `main` does, is none. */
const OBJECT_ID = /^[0-9a-f]{40}(?:[0-9a-f]{24})?$/;

/**
 * What is kept of `asked` once `stood` is read of it: the commit judged and its `pastBase`, the commit null where none was judged or it is
 * no commit id. Nothing where nothing was read of it, or its `baseRef` is no commit id: a fact against a name that moves is no fact.
 */
export const knownOf = (asked: AskedBranch, stood: BranchStood | undefined): KnownStood | undefined => {
  if (!stood || !OBJECT_ID.test(asked.baseRef)) return undefined;
  const commit = stood.tip ?? asked.tip;
  const tip = commit !== undefined && OBJECT_ID.test(commit) ? commit : null;
  return { tip, pastBase: tip === null ? null : stood.pastBase };
};

/** `branches`, each told what `kept` last read of it (`known`), where that was read against the `baseRef` it is asked against now. */
export const toldOf = (branches: Iterable<AskedBranch>, kept: KeptStood | undefined): AskedBranch[] =>
  [...branches].map((b) => {
    const was = kept?.get(b.branch);
    return was?.baseRef === b.baseRef ? { ...b, known: was.known } : b;
  });

/**
 * `memo` made what `read` says of `asks`, read in that order: each ask answered keeps what was read of its branches (`knownOf`), one not
 * answered what was kept before, and a repository, place and base no longer asked nothing.
 */
const remember = (memo: StandingMemo, asks: readonly Ask[], read: readonly StoodRead[]): void => {
  const next: StandingMemo = new Map();
  asks.forEach((ask, i) => {
    const key = keyOf(ask.repo, ask.base);
    const stood = read[i];
    if (!('answer' in stood)) {
      const was = memo.get(key);
      if (was) next.set(key, was);
      return;
    }
    const answered = new Map(stood.answer.branches.map((b) => [b.branch, b]));
    const kept = new Map<string, { baseRef: string; known: KnownStood }>();
    for (const b of ask.branches.values()) {
      const known = knownOf(b, answered.get(b.branch));
      if (known) kept.set(b.branch, { baseRef: b.baseRef, known });
    }
    next.set(key, kept);
  });
  memo.clear();
  for (const [key, kept] of next) memo.set(key, kept);
};

/** A run's result branches, none where its steps cannot be read. */
const branchesOf = (run: Run): string[] => {
  try {
    return resultBranches(run);
  } catch {
    return [];
  }
};

/**
 * Whether `run`'s own result branches are asked: a repository run that cut worktrees of its own and was not called off; a prune keeps them.
 */
const asksOwn = (run: Run): run is RepositoryRun => isRepositoryRun(run) && run.isolate && !run.cancelledAt;

/**
 * The asks over `runs`: one for each repository and base branch a repository run of them is in, each asked of the result branches of
 * every run `own` asks of — by default one that cut worktrees and was not called off (`asksOwn`): what the list shows and a decision reads
 * — of the runs waited on there (`waitedOn`: `--after` and a hold's `--until`), and of the runs a run not yet started is handed as context,
 * with the tip each recorded and the commit it was cut at.
 */
function asksOf(runs: readonly Run[], own: (run: RepositoryRun) => boolean): Ask[] {
  const asks = new Map<string, Ask>();
  const askOf = (run: RepositoryRun): Ask => {
    const key = keyOf(run.repo, run.branch);
    let ask = asks.get(key);
    if (!ask) asks.set(key, (ask = { repo: path.resolve(run.repo), base: run.branch, branches: new Map() }));
    return ask;
  };
  const byId = new Map(runs.map((r) => [r.id, r]));
  for (const run of runs) {
    if (!isRepositoryRun(run)) continue;
    const ask = askOf(run);
    if (own(run)) askedOf(ask, run);
    const related = [...waitedOn(run), ...(hasStarted(run) || run.cancelledAt ? [] : (run.context ?? []))];
    for (const other of related.map((id) => byId.get(id))) {
      if (other && isRepositoryRun(other) && !other.cancelledAt) askedOf(askOf(other), other);
    }
  }
  return [...asks.values()];
}

/** `ask`, where there is one, asked of each result branch of `run` too, with the tip it recorded and the commit it was cut at. */
function askedOf(ask: Ask | undefined, run: RepositoryRun): void {
  for (const branch of ask ? branchesOf(run) : []) {
    const tip = run.tips?.[branch];
    ask!.branches.set(branch, { branch, baseRef: run.baseRef, ...(tip ? { tip } : {}) });
  }
}

/** What the place answered `ask`, or the words it was not read with, stamped when it was read. */
const stoodOutcome = (ask: Pick<Ask, 'repo' | 'base'>, outcome: PlaceOutcome<'standing'>): StoodRead => {
  const where = { repo: ask.repo, base: ask.base, at: new Date().toISOString() };
  if ('answer' in outcome) return { ...where, answer: outcome.answer };
  const unread = 'refused' in outcome ? `the place refused: ${outcome.refused}` : `the place was not heard: ${outcome.unread.said}`;
  return { ...where, unread };
};

/** One ask answered by `place` within `STANDING_DEADLINE_MS`, or unread in words, each branch told what `memo` last read of it. */
const stoodRead = (place: Place, ask: Ask, memo: StandingMemo | undefined): Effect.Effect<StoodRead> =>
  Effect.suspend(() => {
    const kept = memo?.get(keyOf(ask.repo, ask.base));
    const request = { repo: ask.repo, base: ask.base, branches: toldOf(ask.branches.values(), kept) };
    return place.ask('standing', request, { deadlineMs: STANDING_DEADLINE_MS });
  }).pipe(Effect.map((outcome) => stoodOutcome(ask, outcome)));

/** The readings as one `PassStanding`, by repository and base branch. */
const byKey = (read: readonly StoodRead[]): Map<string, StoodRead> => new Map(read.map((r) => [keyOf(r.repo, r.base), r]));

/**
 * Where the repositories of `runs` stand now, each repository and base branch asked at once (`asksOf`, of the result branches of
 * each run `own` asks of), metered as the place, and written nowhere: what the tick's pass and a person's one-off verb read, as `trial`
 * is asked at a decision's read. A place that refuses or is not heard reads unread, never a failure; runs with no repository run among
 * them ask nothing. `memo`, the tick's, tells the place what it last read of each branch, and keeps what it reads now (`StandingMemo`);
 * with none, every `baseRef` is asked.
 */
export const standingNow = Effect.fn('standingNow')(function* (
  runs: readonly Run[],
  own: (run: RepositoryRun) => boolean = asksOwn,
  memo?: StandingMemo,
) {
  const place = yield* PlaceService;
  const asks = asksOf(runs, own);
  const read = yield* Effect.forEach(asks, (ask) => stoodRead(place, ask, memo), { concurrency: 'unbounded' });
  if (memo) remember(memo, asks, read);
  return { read: byKey(read), at: new Date().toISOString() } satisfies PassStanding;
});

/**
 * Where the pass's repositories stand (`standingNow`, told what `memo` last read), written to `standing.json` for every read off the tick
 * (`writeStanding`): called by the tick's pass, and by a test standing for one, never by a reader. Fails with a refusal where the file
 * cannot be written.
 */
export const passStanding = Effect.fn('passStanding')(function* (runs: readonly Run[], memo?: StandingMemo) {
  const standing = yield* standingNow(runs, asksOwn, memo);
  yield* tried(() => within('act', () => writeStanding(standing.at, [...standing.read.values()])));
  return standing;
});

/** Where the branches stand where nothing was read: what a reader asks nothing through, all of it unread. */
export const NOTHING_READ: PassStanding = { read: new Map() };

/**
 * Every branch of a run's repository and its commit as `git` read them, what a `StatusMemo` reads a run's result tips off: none where
 * nothing of the repository was read.
 */
export const headsOver =
  (git: BranchReader) =>
  (run: RepositoryRun): Readonly<Record<string, string>> =>
    Object.fromEntries(git.heads(run.repo));

/** What a read off the tick says of a question no pass asked, with no `standing.json`: no pass has read it yet. */
export const NO_SNAPSHOT = 'no pass has read where it stands yet: nemia up reads it';

/**
 * `standing.json` as the tick's last pass wrote it (`file`), as a `PassStanding`, with no process: undefined, nothing read, and every
 * question unread in the words `NO_SNAPSHOT` says.
 */
export const snapshotStanding = (file: StandingFile | undefined): PassStanding =>
  file ? { read: byKey(file.places), at: file.at, unasked: 'the last pass did not ask it' } : { read: new Map(), unasked: NO_SNAPSHOT };

/**
 * What the tick's last pass read of where the branches stand (`readStanding`, `snapshotStanding`), with no process: what `nemia ls`, the
 * board's list and a run's page read. Fails with the refusal `readStanding` gives a file that does not read.
 */
export const standingSnapshot = Effect.fn('standingSnapshot')(function* () {
  return snapshotStanding(yield* tried(() => readStanding()));
});

/** The records of `ids` the store has, none of `runs`: a run named that is not there is left out. */
const recordsOf = (ids: Iterable<string>, runs: readonly Run[]): Run[] =>
  [...new Set(ids)].flatMap((id) => {
    if (runs.some((r) => r.id === id) || !runStore.runs.exists(id)) return [];
    try {
      return [runStore.runs.read(id)];
    } catch {
      return [];
    }
  });

/**
 * A reader over where `runs` — each asked of, called off or not — and the runs they wait on or are handed as context stand now
 * (`standingNow`, `standingReader`), the store read for those: what a person's one-off verb reads through. Fails with a refusal a read of
 * the store failed with.
 */
export const standingLive = Effect.fn('standingLive')(function* (runs: readonly Run[]) {
  const related = yield* tried(() => recordsOf([...runs.flatMap(waitedOn), ...runs.flatMap((r) => r.context ?? [])], runs));
  return standingReader(yield* standingNow([...runs, ...related], asksOwnOr(runs.map((r) => r.id))));
});

/**
 * Where the repositories of `runs` stand, asked now at most once, and only once a reader is wanted (`standingNow`, of the result
 * branches of the run `id` and of every run the tick's pass would ask of): what a person's verb reads that needs it for some runs and
 * not others. `standing` is the reading, asked as it is first yielded; `when(need)` a reader over it where `need` holds, and one that
 * asks nothing where it does not (`NOTHING_READ`); `read()` a reader over what was asked so far, nothing before the first.
 */
export const standingWhen = Effect.fn('standingWhen')(function* (runs: readonly Run[], id: string) {
  let asked: PassStanding = NOTHING_READ;
  const remember = (standing: PassStanding) =>
    Effect.sync(() => {
      asked = standing;
    });
  const place = yield* PlaceService;
  const now = standingNow(runs, asksOwnOr([id])).pipe(Effect.provideService(PlaceService, place));
  const standing = yield* Effect.cached(now.pipe(Effect.tap(remember)));
  return {
    standing,
    read: (): BranchReader => standingReader(asked),
    when: (need: boolean): Effect.Effect<BranchReader> =>
      need ? Effect.map(standing, standingReader) : Effect.succeed(standingReader(NOTHING_READ)),
  };
});

/** Where branches stand, asked at most once for a person's verb (`standingWhen`), to hand on to another read of the same request. */
export type StandingAsker = Effect.Success<ReturnType<typeof standingWhen>>;

/** What a person's verb asks of: the result branches of each run of `ids`, called off or not, and of every run `asksOwn` asks of. */
export const asksOwnOr = (ids: readonly string[]): ((run: RepositoryRun) => boolean) => {
  const asked = new Set(ids);
  return (run) => asked.has(run.id) || asksOwn(run);
};

/** A reader over where the runs of `ids` the store has stand now, each asked of (`standingLive`): none asked where the store has none. */
export const standingLiveOf = Effect.fn('standingLiveOf')(function* (ids: readonly string[]) {
  return yield* standingLive(yield* tried(() => recordsOf(ids, [])));
});

/**
 * Every branch of `run`'s repository and its commit, asked of `place` now: for a pass that read none for it, or whose reading a hand-off
 * it committed has moved. Undefined for a folder run, and a reading the place gave none of.
 */
export function headsNow(run: Run, place: Place): Readonly<Record<string, string>> | undefined {
  if (!isRepositoryRun(run)) return undefined;
  const request = { repo: path.resolve(run.repo), base: run.branch, branches: [] };
  const outcome = place.askNow('standing', request, { deadlineMs: STANDING_DEADLINE_MS });
  return 'answer' in outcome ? outcome.answer.tips : undefined;
}

/** What was read of the repository and base branch `run` is in, or undefined where none was. */
const stoodOf = (standing: PassStanding, run: RepositoryRun): StoodRead | undefined => standing.read.get(keyOf(run.repo, run.branch));

/** Every branch of `run`'s repository and its commit, as it was read; undefined where none was. */
export const headsFor = (standing: PassStanding, run: RepositoryRun): Readonly<Record<string, string>> | undefined => {
  const stood = stoodOf(standing, run);
  return stood && 'answer' in stood ? stood.answer.tips : undefined;
};

/** The heads of `repo` off any reading of it that has an answer, or undefined where none has. */
const repoHeads = (standing: PassStanding, repo: string): Readonly<Record<string, string>> | undefined => {
  for (const stood of standing.read.values()) if (stood.repo === path.resolve(repo) && 'answer' in stood) return stood.answer.tips;
  return undefined;
};

/**
 * The `BranchReader` that answers off what was read (`PassStanding`), with no process of its own. A question nobody asked — a run whose
 * repository, place and base were not read, a branch not asked of — and one on a reading that is unread are unread (`unread` says why):
 * not landed, never gone, ahead by none. Whether git has a branch is read off any answered reading of its repository.
 */
export function standingReader(standing: PassStanding): BranchReader {
  const unasked = standing.unasked ?? 'not asked on this read';
  const stoodBranch = (run: RepositoryRun, branch: string): BranchStood | undefined => {
    const stood = stoodOf(standing, run);
    return stood && 'answer' in stood ? stood.answer.branches.find((b) => b.branch === branch) : undefined;
  };
  return {
    landed: (run, branch) => landedOver(stoodBranch(run, branch)),
    has: (repo, branch) => {
      const heads = repoHeads(standing, repo);
      return heads ? Object.hasOwn(heads, branch) : true;
    },
    ahead: (run, branch) => stoodBranch(run, branch)?.ahead ?? 0,
    heads: (repo) => new Map(Object.entries(repoHeads(standing, repo) ?? {})),
    unread: (run, branch) => {
      const stood = stoodOf(standing, run);
      if (!stood) return unasked;
      if ('unread' in stood) return stood.unread;
      return branch !== undefined && !stood.answer.branches.some((b) => b.branch === branch) ? unasked : undefined;
    },
  };
}
