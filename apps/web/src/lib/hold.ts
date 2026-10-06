import type { RunSummary } from './api/runs.ts';

type Holdable = Pick<RunSummary, 'id' | 'place' | 'repo' | 'cancelledAt' | 'holding' | 'heldUntil' | 'status'> & { pruned: object | null };

type Candidate = Pick<RunSummary, 'id' | 'place' | 'repo' | 'cancelledAt' | 'pruned' | 'status' | 'toDecide'>;

/**
 * Whether the run's page offers a hold, by what the run says of itself: a git run, not called off, not pruned, nobody holding it, and
 * running or stopped on something; a run that succeeded has nothing left to file. The rest — a run that has shipped, a circle, a run on
 * another base branch — is the package's to refuse (`holdRefusal`), in its words.
 */
export const holdable = (run: Holdable): boolean =>
  run.place === 'git' &&
  run.repo !== null &&
  run.cancelledAt === null &&
  run.pruned === null &&
  run.holding === null &&
  run.heldUntil.length === 0 &&
  (run.status === 'running' || run.status === 'failed');

/**
 * The runs a hold of `run` may wait on, as the form offers them: every other git run of its repository not called off or pruned, that has
 * not finished with nothing left to decide — a run succeeded and merged has shipped, and one succeeded with branches nothing merges has
 * not. In the order `runs` gives them.
 */
export const holdCandidates = <R extends Candidate>(run: Pick<RunSummary, 'id' | 'repo'>, runs: readonly R[]): R[] =>
  runs.filter(
    (r) =>
      r.id !== run.id &&
      r.place === 'git' &&
      r.repo !== null &&
      r.repo === run.repo &&
      r.cancelledAt === null &&
      r.pruned === null &&
      (r.status !== 'succeeded' || r.toDecide !== null),
  );
