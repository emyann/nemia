/**
 * What a person reads at an ending's decision before a run lands: whether its result branches merge onto the base branch as it is now,
 * which runs in flight on the same base its branches collide with and in which files, and whether a clean merge's tree has already failed
 * the ending's landing check, a conflict of meaning git cannot see. The trial merges are the place's (`trialMerges`); this file asks for
 * them in order (`trialsOf`) and words what they answer (`collisionsOf`). Pure.
 */
import path from 'node:path';
import type { Trials } from '../place/place.ts';
import { isRepositoryRun, type RepositoryRun, type Run } from '../record/record.ts';
import type { Workflow } from '../step/step.ts';
import { type ToDecide } from '../ending/ending.ts';
import { landsOnCheck } from '../status/status.ts';
import { landingRefusedOn } from '../merge/merge.ts';
import { mergeWord, mergeWordOf, type MergeWord, type StandingMerge } from '../branches/index.ts';

/** A result branch of another run on the base: the run's id and its branch ahead of the base. */
export type Theirs = { run: string; branch: string };

/** One trial asked of the place: merge `branch` onto `onto`. */
export type TrialAsked = { onto: string; branch: string };

/** A branch of this run that does not merge cleanly onto another run's (`theirs`): `ours`, the merge as git says it, and that in words. */
export type Collision = Theirs & { ours: string; merge: MergeWord; said: string };

/**
 * What an ending's decision says of collisions (`collisionsOf`):
 *
 *   onto       the base branch
 *   base       whether each of this run's branches ahead merges onto the base as it is now, each in words
 *   inFlight   the other runs on the base whose branches are ahead of it, by id: what this run was tried against
 *   colliding  each branch of theirs that one of ours does not merge onto cleanly, conflicted or not known
 *   semantic   the ending whose landing check refused the merged tree on the base as it is now, though every branch merges cleanly, its
 *              check's task and the base's commit; null otherwise
 *   said       the whole in one line
 */
export type Collisions = {
  onto: string;
  base: (StandingMerge & { branch: string })[];
  inFlight: string[];
  colliding: Collision[];
  semantic: { step: string; check: string; sha: string; said: string } | null;
  said: string;
};

/**
 * The other runs whose branches may collide with `run`'s: repository runs on the same repository and the same base branch, each step in a
 * worktree of its own, neither called off nor pruned. A held run is kept: its branches still land on the same base.
 */
export const othersInFlight = (run: RepositoryRun, runs: readonly Run[]): RepositoryRun[] =>
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

/** The trials to ask, in the order `collisionsOf` reads them: each of `ours` onto `onto`, then each of `ours` onto each of `theirs`. */
export const trialsOf = (onto: string, ours: readonly string[], theirs: readonly Theirs[]): TrialAsked[] => [
  ...ours.map((branch) => ({ onto, branch })),
  ...theirs.flatMap((t) => ours.map((branch) => ({ onto: t.branch, branch }))),
];

/**
 * The ending a decision reads collisions for: the one waiting at its gate, or one whose landing a check refused, which is filed and waits
 * at no gate again. Undefined for any other decision, and for a run called off or pruned.
 *
 * The refused landing is read over `landsOnCheck` rather than over the gated endings (`endingSteps`): an ending with no gate, filed by its
 * workflow once its review passed, lands on its check in the same way, and its refused merge owes the same trials.
 */
export function collisionsDue(steps: readonly Workflow[], run: Run, decide: ToDecide | undefined): string | undefined {
  if (decide?.kind === 'approve') return decide.step;
  if (run.cancelledAt || run.pruned) return undefined;
  const aborted = (s: Workflow): boolean => {
    const landed = run.steps[s.name]?.landed;
    return Boolean(landed && 'aborted' in landed);
  };
  return steps.find((step) => landsOnCheck(step, run) && aborted(step))?.name;
}

/** The run's collisions in one line: how many of the runs in flight it collides with, and which; those git could not say of. */
function summary(onto: string, inFlight: readonly string[], colliding: readonly Collision[]): string {
  if (!inFlight.length) return `no other run is in flight on ${onto}`;
  const runs = (cs: readonly Collision[]) => [...new Set(cs.map((c) => c.run))];
  const conflicts = runs(colliding.filter((c) => !('error' in c.merge)));
  const of = `of the ${inFlight.length} run${inFlight.length === 1 ? '' : 's'} in flight on ${onto}`;
  const head = conflicts.length ? `collides with ${conflicts.length} ${of}: ${conflicts.join(', ')}` : `collides with none ${of}`;
  const unknown = runs(colliding.filter((c) => 'error' in c.merge)).filter((r) => !conflicts.includes(r));
  return unknown.length ? `${head}; whether it collides with ${unknown.join(', ')} is not known` : head;
}

/** The semantic conflict at `ending`: its landing check refused the merged tree on the base as it is now, though every branch merges. */
function semanticOf(
  run: RepositoryRun,
  ending: string | undefined,
  base: readonly StandingMerge[],
  sha: string | null,
): Collisions['semantic'] {
  if (!ending || !sha || !base.length || !base.every((b) => 'clean' in b && b.clean)) return null;
  const check = landingRefusedOn(run.steps[ending], sha);
  if (!check) return null;
  return {
    step: ending,
    check,
    sha,
    said: `merges cleanly onto ${run.branch}, and ${ending}'s landing check refused the merged tree at ${sha.slice(0, 7)}: a conflict of meaning, not of text`,
  };
}

/**
 * What the trials asked by `trialsOf(run.branch, ours, theirs)` say (`answer`), at the ending `ending` (`collisionsDue`): each of `ours`
 * onto the base, each branch of theirs one of ours does not merge onto cleanly, and the semantic conflict, read off the base's commit the
 * place names now.
 */
export function collisionsOf(
  run: RepositoryRun,
  ending: string | undefined,
  ours: readonly string[],
  theirs: readonly Theirs[],
  answer: Trials,
): Collisions {
  const onto = run.branch;
  const word = (i: number) => mergeWordOf(answer.trials[i] ?? { unknown: 'the place answered no trial for it' });
  const base = ours.map((branch, i) => {
    const merge = word(i);
    return { branch, ...merge, said: mergeWord(merge, onto) };
  });
  const colliding = theirs.flatMap((t, j) =>
    ours.flatMap((branch, k): Collision[] => {
      const merge = word(ours.length * (j + 1) + k);
      return 'clean' in merge && merge.clean ? [] : [{ ...t, ours: branch, merge, said: mergeWord(merge, `${t.run}'s ${t.branch}`) }];
    }),
  );
  const inFlight = [...new Set(theirs.map((t) => t.run))];
  const semantic = semanticOf(run, ending, base, answer.at[onto] ?? null);
  return { onto, base, inFlight, colliding, semantic, said: summary(onto, inFlight, colliding) };
}
