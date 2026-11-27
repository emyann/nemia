/**
 * What a person reads at a run's decision before its branch is merged: whether its result branches merge onto the base branch as it is now,
 * and which runs in flight on the same base its branches collide with and in which files. The trial merges are the place's (`trialMerges`); this file asks for
 * them in order (`trialsOf`) and words what they answer (`collisionsOf`). Pure.
 */
import path from 'node:path';
import type { Trials } from '../place/place.ts';
import { isRepositoryRun, type RepositoryRun, type Run } from '../record/record.ts';
import { mergeWord, mergeWordOf, type MergeWord, type StandingMerge } from '../branches/index.ts';

/** A result branch of another run on the base: the run's id and its branch ahead of the base. */
export type Theirs = { run: string; branch: string };

/** A branch of this run that does not merge cleanly onto another run's (`theirs`): `ours`, the merge as git says it, and that in words. */
export type Collision = Theirs & { ours: string; merge: MergeWord; said: string };

/**
 * What an ending's decision says of collisions (`collisionsOf`):
 *
 *   onto       the base branch
 *   base       whether each of this run's branches ahead merges onto the base as it is now, each in words
 *   inFlight   the other runs on the base whose branches are ahead of it, by id: what this run was tried against
 *   colliding  each branch of theirs that one of ours does not merge onto cleanly, conflicted or not known
 *   said       the whole in one line
 */
export type Collisions = {
  onto: string;
  base: (StandingMerge & { branch: string })[];
  inFlight: string[];
  colliding: Collision[];
  said: string;
};

/**
 * The other runs whose branches may collide with `run`'s: repository runs on the same repository and the same base branch, each step in a
 * worktree of its own, neither called off nor pruned. A held run is kept: its branches still land on the same base.
 * @param run The repository run whose ending reads the collisions.
 * @param runs The store's runs.
 */
export const othersInFlight = (run: RepositoryRun, runs: readonly Run[]) =>
  runs.filter(
    (o): o is RepositoryRun =>
      isRepositoryRun(o) &&
      o.id !== run.id &&
      o.isolate &&
      !o.cancelledAt &&
      !o.pruned &&
      o.branch === run.branch &&
      path.resolve(o.repo) === path.resolve(run.repo),
  );

/**
 * The trials to ask, in the order `collisionsOf` reads them: each of `ours` onto `onto`, then each of `ours` onto each of `theirs`.
 * @param onto The base branch.
 * @param ours This run's branches ahead of the base.
 * @param theirs The branches ahead of the base of the other runs in flight.
 */
export const trialsOf = (onto: string, ours: readonly string[], theirs: readonly Theirs[]) => [
  ...ours.map((branch) => ({ onto, branch })),
  ...theirs.flatMap((t) => ours.map((branch) => ({ onto: t.branch, branch }))),
];

/** The run's collisions in one line: how many of the runs in flight it collides with, and which; those git could not say of. */
function summary(onto: string, inFlight: readonly string[], colliding: readonly Collision[]) {
  if (!inFlight.length) return `no other run is in flight on ${onto}`;
  const runs = (cs: readonly Collision[]) => [...new Set(cs.map((c) => c.run))];
  const conflicts = runs(colliding.filter((c) => !('error' in c.merge)));
  const of = `of the ${inFlight.length} run${inFlight.length === 1 ? '' : 's'} in flight on ${onto}`;
  const head = conflicts.length ? `collides with ${conflicts.length} ${of}: ${conflicts.join(', ')}` : `collides with none ${of}`;
  const unknown = runs(colliding.filter((c) => 'error' in c.merge)).filter((r) => !conflicts.includes(r));
  return unknown.length ? `${head}; whether it collides with ${unknown.join(', ')} is not known` : head;
}

/**
 * What the trials asked by `trialsOf(run.branch, ours, theirs)` say (`answer`) : each of `ours`
 * onto the base, and each branch of theirs one of ours does not merge onto cleanly.
 * @param run The repository run, whose `branch` is the base.
 * @param ours This run's branches ahead of the base.
 * @param theirs The branches ahead of the base of the other runs in flight.
 * @param answer What the place's trial merges answered, in the order `trialsOf` asked them, and the commit each branch is at.
 */
export function collisionsOf(
  run: RepositoryRun,
  ours: readonly string[],
  theirs: readonly Theirs[],
  answer: Trials,
) {
  const onto = run.branch;
  const word = (i: number) => mergeWordOf(answer.trials[i] ?? { unknown: 'the place answered no trial for it' });
  const base = ours.map((branch, i) => {
    const merge = word(i);
    return { branch, ...merge, said: mergeWord(merge, onto) };
  });
  const colliding = theirs.flatMap((t, j) =>
    ours.flatMap((branch, k) => {
      const merge = word(ours.length * (j + 1) + k);
      return (
        'clean' in merge && merge.clean ? [] : [{ ...t, ours: branch, merge, said: mergeWord(merge, `${t.run}'s ${t.branch}`) }]
      ) satisfies Collision[];
    }),
  );
  const inFlight = [...new Set(theirs.map((t) => t.run))];
  return { onto, base, inFlight, colliding, said: summary(onto, inFlight, colliding) } satisfies Collisions;
}
