/**
 * Where a pass's repositories stand, read once a pass (`passStanding`): one `standing` of each run's place for each repository, place and
 * base branch the pass lists a git run of, asking it of the result branches of every run another waits on there — every branch of the
 * repository and its commit, and where each branch asked of stands. What the pass reads of git through it: whether a run waited on has
 * shipped (`standingReader`), the heads its memo of runs at rest and its tips are read from, and the commit a run's base branch is at
 * (`headsFor`). Written to `standing.json` for whoever reads it next (`writeStanding`). A reading the place refused or did not answer is
 * unread: nothing on it has shipped, and the pass says why.
 */
import os from 'node:os';
import path from 'node:path';
import { Effect } from 'effect';
import { tried } from '../runtime-client.ts';
import { RunPlace } from '../place/place.store.ts';
import { runPlaceVerbAsync } from '../place/place-async.store.ts';
import type { BranchStood, PlaceRequests } from '../place/place.ts';
import { countSpawn, within, withinEffect } from '../meter/tally.store.ts';
import { isGitRun, type GitRun, type Run } from '../record/record.ts';
import { waitedOn } from '../wait/wait.ts';
import { oneByOne, resultBranches, type BranchReader } from '../branches/branches.store.ts';
import { shippedOver } from '../branches/index.ts';
import { writeStanding, type StoodRead } from './standing.store.ts';

/** How long a pass waits for one `standing`: past it, the repository reads unread on this pass, and is asked again on the next. */
export const STANDING_DEADLINE_MS = 15_000;

/**
 * What a pass read of where its repositories stand (`passStanding`): each repository, place and base branch it asked, and where a run's
 * place verbs run from, undefined for a run naming a place this nemia does not ship.
 */
export type PassStanding = { readonly read: ReadonlyMap<string, StoodRead>; readonly placeOf: (run: GitRun) => string | undefined };

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

/**
 * The asks of a pass over `runs`: one for each repository, place and base branch a git run of the listing is in, each asked of the result
 * branches of the runs waited on there (`waitedOn`), with the tip each recorded and the commit it was cut at.
 */
function asksOf(runs: readonly Run[], placeOf: PassStanding['placeOf']): Ask[] {
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
    askOf(run);
    for (const parent of waitedOn(run).map((id) => byId.get(id))) {
      if (parent && isGitRun(parent) && !parent.cancelledAt) askedOf(askOf(parent), parent);
    }
  }
  return [...asks.values()];
}

/** `ask`, where there is one, asked of each result branch of `parent` too, with the tip it recorded and the commit it was cut at. */
function askedOf(ask: Ask | undefined, parent: GitRun): void {
  for (const branch of ask ? branchesOf(parent) : []) {
    const tip = parent.tips?.[branch];
    ask!.branches.set(branch, { branch, baseRef: parent.baseRef, ...(tip ? { tip } : {}) });
  }
}

/** The environment a `standing` runs in: this process's, with node's compile cache on, which more than halves the script's start. */
const cachedEnv = (): NodeJS.ProcessEnv => ({
  ...process.env,
  NODE_COMPILE_CACHE: process.env.NODE_COMPILE_CACHE ?? path.join(os.tmpdir(), 'node-compile-cache'),
});

/** One ask answered by its place within `STANDING_DEADLINE_MS`, or unread in words, stamped when it was read. */
const stoodRead = (ask: Ask): Effect.Effect<StoodRead> =>
  Effect.suspend(() => {
    countSpawn();
    const request = { repo: ask.repo, base: ask.base, branches: [...ask.branches.values()] };
    return runPlaceVerbAsync(ask.place, 'standing', request, { deadlineMs: STANDING_DEADLINE_MS, env: cachedEnv() });
  }).pipe(
    Effect.map((outcome): StoodRead => {
      const where = { repo: ask.repo, place: ask.place, base: ask.base, at: new Date().toISOString() };
      if ('answer' in outcome) return { ...where, answer: outcome.answer };
      const unread = 'refused' in outcome ? `the place refused: ${outcome.refused}` : `the place was not heard: ${outcome.unread.said}`;
      return { ...where, unread };
    }),
  );

/**
 * Where the pass's repositories stand, each asked at once (`asksOf`), metered as git, and written to `standing.json`. Fails with a refusal
 * where the file cannot be written; a place that refuses or is not heard reads unread, never a failure.
 */
export const passStanding = Effect.fn('passStanding')(function* (runs: readonly Run[]) {
  const dirOf = yield* RunPlace;
  const placeOf = (run: GitRun): string | undefined => {
    try {
      return dirOf(run);
    } catch {
      return undefined;
    }
  };
  const read = yield* withinEffect('git', Effect.forEach(asksOf(runs, placeOf), stoodRead, { concurrency: 'unbounded' }));
  yield* tried(() => within('act', () => writeStanding(new Date().toISOString(), read)));
  return { read: new Map(read.map((r) => [keyOf(r.repo, r.place, r.base), r])), placeOf } satisfies PassStanding;
});

/** What the pass read of the repository, place and base branch `run` is in, or undefined where it asked none. */
const stoodOf = (standing: PassStanding, run: GitRun): StoodRead | undefined => {
  const place = standing.placeOf(run);
  return place === undefined ? undefined : standing.read.get(keyOf(run.repo, place, run.branch));
};

/** Every branch of `run`'s repository and its commit, as the pass read them; undefined where it read none. */
export const headsFor = (standing: PassStanding, run: GitRun): Readonly<Record<string, string>> | undefined => {
  const stood = stoodOf(standing, run);
  return stood && 'answer' in stood ? stood.answer.heads : undefined;
};

/**
 * The `BranchReader` that answers off what the pass read (`passStanding`), with no process of its own: a branch on a reading that is
 * unread has not shipped and is never gone; a question the pass did not ask — a run it did not list, a branch it did not ask of — is asked
 * one by one (`oneByOne`).
 */
export function standingReader(standing: PassStanding): BranchReader {
  const stoodBranch = (run: GitRun, branch: string): BranchStood | 'unread' | undefined => {
    const stood = stoodOf(standing, run);
    if (!stood) return undefined;
    return 'answer' in stood ? stood.answer.branches.find((b) => b.branch === branch) : 'unread';
  };
  const ofRepo = (repo: string): StoodRead[] => [...standing.read.values()].filter((s) => s.repo === path.resolve(repo));
  return {
    shipped: (run, branch) => {
      const stood = stoodBranch(run, branch);
      return stood === undefined ? oneByOne.shipped(run, branch) : stood !== 'unread' && shippedOver(stood);
    },
    has: (repo, branch) => {
      const read = ofRepo(repo);
      const heads = read.find((s) => 'answer' in s);
      if (heads && 'answer' in heads) return Object.hasOwn(heads.answer.heads, branch);
      return read.length > 0 || oneByOne.has(repo, branch);
    },
    ahead: (run, branch) => {
      const stood = stoodBranch(run, branch);
      return stood === undefined ? oneByOne.ahead(run, branch) : stood === 'unread' ? 0 : (stood.ahead ?? 0);
    },
    prime: () => {},
    heads: (repo) => {
      const read = ofRepo(repo);
      const heads = read.find((s) => 'answer' in s);
      if (heads && 'answer' in heads) return new Map(Object.entries(heads.answer.heads));
      return read.length ? new Map() : oneByOne.heads(repo);
    },
    unread: (run) => {
      const stood = stoodOf(standing, run);
      return stood && 'unread' in stood ? stood.unread : undefined;
    },
  };
}
