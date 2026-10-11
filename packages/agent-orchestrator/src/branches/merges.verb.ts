/** The merge check (`mergesOf`) and its entry in the command table (`MERGES`), served on the api alone. */
import { Effect } from 'effect';
import { tried } from '../runtime-client.ts';
import type { Command } from '../command/entry.verb.ts';
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
      const merge = mergeWordOf(trials[i]);
      return [branch, { ...merge, said: mergeWord(merge, run.branch) }];
    }),
  );
}

/**
 * Whether each branch named still merges onto the base branch of the run named (`mergesOf`), keyed by branch: what the board's decision
 * says under each branch ahead of the base.
 */
export const MERGES: Command<Record<string, StandingMerge>> = {
  name: 'merges',
  usage: '<runId> [<branches> ...]',
  help: ["whether each of a run's branches still merges onto its base branch"],
  spec: {
    positionals: [
      { key: 'runId', takes: 'required', kind: 'name' },
      { key: 'branches', takes: 'many', kind: 'name' },
    ],
    flags: [],
    unknown: (arg) => `the merge check does not take ${arg}.`,
  },
  writes: false,
  nemia: 'read',
  only: {
    side: 'api',
    why: "the board's decision says whether each branch ahead still merges onto its base; nemia decide leaves a trial merge to the person",
  },
  handler: (args) =>
    Effect.gen(function* () {
      const place = yield* PlaceService;
      return yield* tried(() => mergesOf(place, String(args.runId ?? ''), Array.isArray(args.branches) ? args.branches : []));
    }),
  print: () => [],
};
