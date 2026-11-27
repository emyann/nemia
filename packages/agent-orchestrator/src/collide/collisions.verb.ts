/**
 * The collisions a run's decision says (`collisionsAt`), read live: the other runs in flight off the store, where their branches stand
 * off git, and every trial merge in one call of the place's trial verb (`trialMerges`). Nothing is kept: the next decision reads them
 * again.
 */
import { Effect } from 'effect';
import { tried } from '../runtime-client.ts';
import { stepsOf } from '../steps/steps.verb.ts';
import type { StepSpec } from '../workflow.ts';
import { isRepositoryRun, type RepositoryRun, type Run } from '../record/record.ts';
import type { BranchStanding } from '../status/status.ts';
import { RunDoor } from '../runs/runs.store.ts';
import { standingsOf, type BranchReader } from '../branches/branches.store.ts';
import { trialMerges, type Place } from '../place/place.store.ts';
import { collisionsOf, othersInFlight, trialsOf, type Collisions, type Theirs } from './collide.ts';

const ahead = (standings: readonly BranchStanding[]) => standings.filter((s) => s.where === 'ahead').map((s) => s.branch);

/**
 * What `run`'s decision reads before its branches are merged (`collisionsOf`): its branches ahead of the base (`standings`, as the
 * decision read
 * them) tried onto the base and onto each branch ahead of it of every other run in flight (`othersInFlight`), whose standings `git` reads.
 * Undefined, asking nothing, for a folder run, a run without worktrees, or one with no branch ahead of its base. Fails with a refusal a
 * read threw; dies of anything else (`tried`).
 * @param run The run whose branches are to be merged.
 * @param standings Where the run's branches stand against its base, as the decision read them.
 * @param git What reads where the other runs' branches stand.
 * @param place The place whose trial verb merges.
 */
export const collisionsAt = (run: Run, standings: readonly BranchStanding[], git: BranchReader, place: Place) =>
  Effect.gen(function* () {
    const ours = ahead(standings);
    if (!isRepositoryRun(run) || !run.isolate || !ours.length) return undefined;
    const others = othersInFlight(run, yield* (yield* RunDoor).runs.list());
    const steps = new Map(yield* Effect.forEach(others, (other) => Effect.map(stepsOf(other), (s) => [other.id, s] as const)));
    return yield* tried(() => collisionsRead(run, ours, git, place, others, steps));
  });

/** The collisions of `ours`, `run`'s branches ahead, with the branches ahead of `others`, whose `steps` were read. */
function collisionsRead(
  run: RepositoryRun,
  ours: readonly string[],
  git: BranchReader,
  place: Place,
  others: readonly RepositoryRun[],
  steps: ReadonlyMap<string, readonly StepSpec[]>,
) {
  const theirs: Theirs[] = others.flatMap((other) =>
    ahead(standingsOf(other, steps.get(other.id) ?? [], git)).map((branch) => ({ run: other.id, branch })),
  );
  return collisionsOf(run, ours, theirs, trialMerges(run.repo, trialsOf(run.branch, ours, theirs), place)) satisfies Collisions;
}
