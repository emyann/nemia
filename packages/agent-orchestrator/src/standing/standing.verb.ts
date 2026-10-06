/**
 * Where a repository's result branches stand, as the place's `standing` says it, one ask for each repository, place and base branch: every
 * branch of the repository and its commit, and where each branch asked of stands (`PassStanding`). Reached three ways: the tick's pass asks
 * it and writes it to `standing.json` (`passStanding`); a read off the tick — `nemia ls`, the board — decodes that file, with no process
 * (`standingSnapshot`); a person's one-off verb asks it live and writes nothing (`standingNow`, `standingLive`). One reader answers off any
 * of them (`standingReader`): a question none asked is unread, never asked of git as it goes. A reading the place refused or did not
 * answer is unread too: nothing on it has shipped, and the reader says why.
 */
import os from 'node:os';
import path from 'node:path';
import { Effect } from 'effect';
import { tried } from '../runtime-client.ts';
import { RunPlace, runPlaceVerb } from '../place/place.store.ts';
import { runPlaceVerbAsync } from '../place/place-async.store.ts';
import type { BranchStood, PlaceOutcome, PlaceRequests } from '../place/place.ts';
import { countSpawn, within, withinEffect } from '../meter/tally.store.ts';
import { isGitRun, type GitRun, type Run } from '../record/record.ts';
import { hasStarted, waitedOn } from '../wait/wait.ts';
import { resultBranches, type BranchReader } from '../branches/branches.store.ts';
import { shippedOver } from '../branches/index.ts';
import { runStore } from '../record/files.store.ts';
import { readStanding, writeStanding, type StandingFile, type StoodRead } from './standing.store.ts';

/** How long a pass waits for one `standing`: past it, the repository reads unread on this pass, and is asked again on the next. */
export const STANDING_DEADLINE_MS = 15_000;

/**
 * What was read of where repositories stand: each repository, place and base branch asked, where a run's place verbs run from (undefined
 * for a run naming a place this nemia does not ship), when it was read (`at`, absent where nothing was: no `standing.json` yet), and the
 * words a question nobody asked is unread with (`unasked`).
 */
export type PassStanding = {
  readonly read: ReadonlyMap<string, StoodRead>;
  readonly placeOf: (run: GitRun) => string | undefined;
  readonly at?: string;
  readonly unasked?: string;
};

/** A repository, place and base branch as one key. */
const keyOf = (repo: string, place: string, base: string): string => JSON.stringify([path.resolve(repo), place, base]);

/** One `standing` to ask: its place, and its request, each branch asked of once. */
type Ask = { place: string; repo: string; base: string; branches: Map<string, PlaceRequests['standing']['branches'][number]> };

/** A run's result branches, none where its steps cannot be read. */
const branchesOf = (run: Run): string[] => {
  try {
    return resultBranches(run);
  } catch {
    return [];
  }
};

/** Whether `run`'s own result branches are asked: a git run that cut worktrees of its own and was not called off; a prune keeps them. */
const asksOwn = (run: Run): run is GitRun => isGitRun(run) && run.isolate && !run.cancelledAt;

/**
 * The asks over `runs`: one for each repository, place and base branch a git run of them is in, each asked of the result branches of every
 * run `own` asks of — by default one that cut worktrees and was not called off (`asksOwn`): what the list shows and a
 * decision reads — of the runs waited on there (`waitedOn`: `--after` and a hold's `--until`), and of the runs a run not yet started is
 * handed as context, with the tip each recorded and the commit it was cut at.
 */
function asksOf(runs: readonly Run[], placeOf: PassStanding['placeOf'], own: (run: GitRun) => boolean): Ask[] {
  const asks = new Map<string, Ask>();
  const askOf = (run: GitRun): Ask | undefined => {
    const place = placeOf(run);
    if (place === undefined) return undefined;
    const key = keyOf(run.repo, place, run.branch);
    let ask = asks.get(key);
    if (!ask) asks.set(key, (ask = { place, repo: path.resolve(run.repo), base: run.branch, branches: new Map() }));
    return ask;
  };
  const byId = new Map(runs.map((r) => [r.id, r]));
  for (const run of runs) {
    if (!isGitRun(run)) continue;
    const ask = askOf(run);
    if (own(run)) askedOf(ask, run);
    const related = [...waitedOn(run), ...(hasStarted(run) || run.cancelledAt ? [] : (run.context ?? []))];
    for (const other of related.map((id) => byId.get(id))) {
      if (other && isGitRun(other) && !other.cancelledAt) askedOf(askOf(other), other);
    }
  }
  return [...asks.values()];
}

/** `ask`, where there is one, asked of each result branch of `run` too, with the tip it recorded and the commit it was cut at. */
function askedOf(ask: Ask | undefined, run: GitRun): void {
  for (const branch of ask ? branchesOf(run) : []) {
    const tip = run.tips?.[branch];
    ask!.branches.set(branch, { branch, baseRef: run.baseRef, ...(tip ? { tip } : {}) });
  }
}

/** The environment a `standing` runs in: this process's, with node's compile cache on, which more than halves the script's start. */
const cachedEnv = (): NodeJS.ProcessEnv => ({
  ...process.env,
  NODE_COMPILE_CACHE: process.env.NODE_COMPILE_CACHE ?? path.join(os.tmpdir(), 'node-compile-cache'),
});

/** What the place answered `ask`, or the words it was not read with, stamped when it was read. */
const stoodOutcome = (ask: Pick<Ask, 'place' | 'repo' | 'base'>, outcome: PlaceOutcome<'standing'>): StoodRead => {
  const where = { repo: ask.repo, place: ask.place, base: ask.base, at: new Date().toISOString() };
  if ('answer' in outcome) return { ...where, answer: outcome.answer };
  const unread = 'refused' in outcome ? `the place refused: ${outcome.refused}` : `the place was not heard: ${outcome.unread.said}`;
  return { ...where, unread };
};

/** One ask answered by its place within `STANDING_DEADLINE_MS`, or unread in words. */
const stoodRead = (ask: Ask): Effect.Effect<StoodRead> =>
  Effect.suspend(() => {
    countSpawn();
    const request = { repo: ask.repo, base: ask.base, branches: [...ask.branches.values()] };
    return runPlaceVerbAsync(ask.place, 'standing', request, { deadlineMs: STANDING_DEADLINE_MS, env: cachedEnv() });
  }).pipe(Effect.map((outcome) => stoodOutcome(ask, outcome)));

/** Where a run's place verbs run from (`RunPlace`), undefined for a run naming a place this nemia does not ship. */
export const placeReader = Effect.map(RunPlace, (dirOf) => (run: GitRun): string | undefined => {
  try {
    return dirOf(run);
  } catch {
    return undefined;
  }
});

/** The readings as one `PassStanding`, by repository, place and base branch. */
const byKey = (read: readonly StoodRead[]): Map<string, StoodRead> => new Map(read.map((r) => [keyOf(r.repo, r.place, r.base), r]));

/**
 * Where the repositories of `runs` stand now, each repository, place and base branch asked at once (`asksOf`, of the result branches of
 * each run `own` asks of), metered as git, and written nowhere: what the tick's pass and a person's one-off verb read, as `trial` is asked
 * at a decision's read. A place that refuses or is not heard reads unread, never a failure; runs with no git run among them ask nothing.
 */
export const standingNow = Effect.fn('standingNow')(function* (runs: readonly Run[], own: (run: GitRun) => boolean = asksOwn) {
  const placeOf = yield* placeReader;
  const read = yield* withinEffect('git', Effect.forEach(asksOf(runs, placeOf, own), stoodRead, { concurrency: 'unbounded' }));
  return { read: byKey(read), placeOf, at: new Date().toISOString() } satisfies PassStanding;
});

/**
 * Where the pass's repositories stand (`standingNow`), written to `standing.json` for every read off the tick (`writeStanding`): called by
 * the tick's pass, and by a test standing for one, never by a reader. Fails with a refusal where the file cannot be written.
 */
export const passStanding = Effect.fn('passStanding')(function* (runs: readonly Run[]) {
  const standing = yield* standingNow(runs);
  yield* tried(() => within('act', () => writeStanding(standing.at, [...standing.read.values()])));
  return standing;
});

/** Where the branches stand where nothing was read: what a reader asks nothing through, all of it unread. */
export const NOTHING_READ: PassStanding = { read: new Map(), placeOf: () => undefined };

/**
 * Every branch of a run's repository and its commit as `git` read them, what a `StatusMemo` reads a run's result tips off: none where
 * nothing of the repository was read.
 */
export const headsOver =
  (git: BranchReader) =>
  (run: GitRun): Readonly<Record<string, string>> =>
    Object.fromEntries(git.heads(run.repo));

/** What a read off the tick says of a question no pass asked, with no `standing.json`: no pass has read it yet. */
export const NO_SNAPSHOT = 'no pass has read where it stands yet: nemia up reads it';

/**
 * `standing.json` as the tick's last pass wrote it (`file`), as a `PassStanding`, with no process: undefined, nothing read, and every
 * question unread in the words `NO_SNAPSHOT` says.
 */
export const snapshotStanding = (file: StandingFile | undefined, placeOf: PassStanding['placeOf']): PassStanding =>
  file
    ? { read: byKey(file.places), placeOf, at: file.at, unasked: 'the last pass did not ask it' }
    : { read: new Map(), placeOf, unasked: NO_SNAPSHOT };

/**
 * What the tick's last pass read of where the branches stand (`readStanding`, `snapshotStanding`), with no process: what `nemia ls`, the
 * board's list and a run's page read. Fails with the refusal `readStanding` gives a file that does not read.
 */
export const standingSnapshot = Effect.fn('standingSnapshot')(function* () {
  const placeOf = yield* placeReader;
  return snapshotStanding(yield* tried(() => readStanding()), placeOf);
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
  const standing = yield* Effect.cached(standingNow(runs, asksOwnOr([id])).pipe(Effect.tap(remember)));
  return {
    standing,
    read: (): BranchReader => standingReader(asked),
    when: (need: boolean): Effect.Effect<BranchReader> =>
      need ? Effect.map(standing, standingReader) : Effect.succeed(standingReader(NOTHING_READ)),
  };
});

/** What a person's verb asks of: the result branches of each run of `ids`, called off or not, and of every run `asksOwn` asks of. */
export const asksOwnOr = (ids: readonly string[]): ((run: GitRun) => boolean) => {
  const asked = new Set(ids);
  return (run) => asked.has(run.id) || asksOwn(run);
};

/** A reader over where the runs of `ids` the store has stand now, each asked of (`standingLive`): none asked where the store has none. */
export const standingLiveOf = Effect.fn('standingLiveOf')(function* (ids: readonly string[]) {
  return yield* standingLive(yield* tried(() => recordsOf(ids, [])));
});

/**
 * Every branch of `run`'s repository and its commit, asked of its place now, in one process: for a pass that read none for it, or whose
 * reading a hand-off it committed has moved, its place found by `placeOf` (`placeReader`). Undefined for a folder run, a place this nemia
 * does not ship, and a reading the place gave none of.
 */
export function headsNow(run: Run, placeOf: PassStanding['placeOf']): Readonly<Record<string, string>> | undefined {
  if (!isGitRun(run)) return undefined;
  const place = placeOf(run);
  if (place === undefined) return undefined;
  countSpawn();
  const request = { repo: path.resolve(run.repo), base: run.branch, branches: [] };
  const outcome = within('git', () => runPlaceVerb(place, 'standing', request, { deadlineMs: STANDING_DEADLINE_MS, env: cachedEnv() }));
  return 'answer' in outcome ? outcome.answer.heads : undefined;
}

/** What was read of the repository, place and base branch `run` is in, or undefined where none was. */
const stoodOf = (standing: PassStanding, run: GitRun): StoodRead | undefined => {
  const place = standing.placeOf(run);
  return place === undefined ? undefined : standing.read.get(keyOf(run.repo, place, run.branch));
};

/** Every branch of `run`'s repository and its commit, as it was read; undefined where none was. */
export const headsFor = (standing: PassStanding, run: GitRun): Readonly<Record<string, string>> | undefined => {
  const stood = stoodOf(standing, run);
  return stood && 'answer' in stood ? stood.answer.heads : undefined;
};

/** The heads of `repo` off any reading of it that has an answer, or undefined where none has. */
const repoHeads = (standing: PassStanding, repo: string): Readonly<Record<string, string>> | undefined => {
  for (const stood of standing.read.values()) if (stood.repo === path.resolve(repo) && 'answer' in stood) return stood.answer.heads;
  return undefined;
};

/**
 * The `BranchReader` that answers off what was read (`PassStanding`), with no process of its own. A question nobody asked — a run whose
 * repository, place and base were not read, a branch not asked of — and one on a reading that is unread are unread (`unread` says why):
 * not shipped, never gone, ahead by none. Whether git has a branch is read off any answered reading of its repository.
 */
export function standingReader(standing: PassStanding): BranchReader {
  const unasked = standing.unasked ?? 'not asked on this read';
  const stoodBranch = (run: GitRun, branch: string): BranchStood | undefined => {
    const stood = stoodOf(standing, run);
    return stood && 'answer' in stood ? stood.answer.branches.find((b) => b.branch === branch) : undefined;
  };
  return {
    shipped: (run, branch) => shippedOver(stoodBranch(run, branch)),
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
