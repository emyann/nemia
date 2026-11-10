/** The merge check (`mergesOf`): what a run's decision says under each branch ahead of the base (`decisionRead`). */
import { Effect } from 'effect';
import { tried } from '../runtime-client.ts';
import { isRepositoryRun } from '../record/record.ts';
import { runStore } from '../record/files.store.ts';
import { PlaceService, trialMerges, type Place } from '../place/place.store.ts';
import { mergeWord, mergeWordOf, type StandingMerge } from './merges.ts';

/**
 * Whether each of `branches` merges onto the base branch of the run `runId` (`StandingMerge`), keyed by branch, by `place`'s trial
 * merges (`trialMerges`); none for a run that is not a repository run, which has no base to merge onto. Throws `Missing` for a run the
 * store does not have.
 */
export function mergesOf(place: Place, runId: string, branches: readonly string[]): Record<string, StandingMerge> {
  const run = runStore.runs.read(runId);
  if (!isRepositoryRun(run)) return {};
  const { trials } = trialMerges(
    run.repo,
    branches.map((branch) => ({ onto: run.branch, branch })),
    place,
  );
  return Object.fromEntries(
    branches.map((branch, i) => {
      const merge = mergeWordOf(trials[i] ?? { unknown: `the place answered no trial of ${branch}` });
      return [branch, { ...merge, said: mergeWord(merge, run.branch) }];
    }),
  );
}

/**
 * `mergesOf` on the place the program is given: whether each of `branches` still merges onto the base branch of the run `runId`, none asked
 * for no branch. Fails with `Missing` for a run the store does not have.
 */
export const mergesRead = Effect.fn('mergesRead')(function* (runId: string, branches: readonly string[]) {
  if (!branches.length) return {};
  const place = yield* PlaceService;
  return yield* tried(() => mergesOf(place, runId, branches));
});
