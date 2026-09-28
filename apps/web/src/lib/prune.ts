import type { RunDetail } from './api/detail.ts';
import type { PruneHow } from './api/runs.ts';

/**
 * One thing a person may give back of a finished run, as `wf prune` takes it: its worktrees; with its files too (`--artifacts`); and with them
 * a run nobody merged (`--unmerged`). Each takes in what the one before it gives back. `unavailable` says why a choice would be refused.
 */
export type PruneChoice = {
  key: 'worktrees' | 'files' | 'unmerged';
  label: string;
  says: string;
  how: PruneHow;
  unavailable: string | null;
};

/** What the board offers to prune of a run, and what a prune `--unmerged` gives up, said plainly (`unmergedWarning`). */
export type PruneOffer = { choices: PruneChoice[]; warning: string | null };

type Prunable = Pick<RunDetail, 'id' | 'place' | 'status' | 'moving' | 'cancelledAt' | 'toDecide' | 'onDisk' | 'isolate' | 'branch'>;

/**
 * Whether a finished run waits on a decision `wf prune` asks `--unmerged` for, as `pruneRefusal` asks it: a run that finished and was neither
 * shipped nor called off. A run that succeeded with nothing left to decide shipped; one that failed, or succeeded with its branch to merge, did
 * not. Read off the status and `toDecide`, since the api's `git` decision is said only of a run that succeeded — a failed run nobody merged
 * needs `--unmerged` all the same.
 */
export function nobodyMerged(run: Pick<RunDetail, 'status' | 'cancelledAt' | 'toDecide'>): boolean {
  if (run.cancelledAt || run.status === 'cancelled' || run.status === 'running') return false;
  return run.toDecide?.kind === 'git' || run.status !== 'succeeded';
}

/**
 * What the run's page offers to prune, or null where it offers nothing: a folder run (the package prunes git runs alone), a run still moving,
 * and one with neither worktrees nor files left on disk (`onDisk`). Only what is there is offered. The api judges the prune again whatever
 * this says, and a refusal is shown in the package's words.
 */
export function pruneOffer(run: Prunable): PruneOffer | null {
  const { worktrees, files } = run.onDisk;
  if (run.place !== 'git' || run.moving || run.status === 'running' || !(worktrees || files)) return null;
  const warning = nobodyMerged(run) ? unmergedWarning(run) : null;
  const merge = warning === null ? null : run.isolate === false ? 'It waits on your decision: only the last choice prunes it.' : 'Nobody merged it: only the last choice prunes it.';
  const most = files ? (worktrees ? 'Its worktrees and its files' : 'Its files') : 'Its worktrees';
  const choices: PruneChoice[] = [
    ...(worktrees
      ? [{
          key: 'worktrees' as const,
          label: 'Its worktrees',
          says: `The folders its steps worked in. Its record, its branches${files ? ' and its files' : ''} are kept.`,
          how: { artifacts: false, unmerged: false },
          unavailable: merge,
        }]
      : []),
    ...(files
      ? [{
          key: 'files' as const,
          label: most,
          says: 'And the files its steps handed on (wf prune --artifacts): a closeout that names one then says it was pruned. Its record and branches are kept.',
          how: { artifacts: true, unmerged: false },
          unavailable: merge,
        }]
      : []),
    ...(warning !== null
      ? [{
          key: 'unmerged' as const,
          label: `${most}, though ${run.isolate === false ? 'nobody decided it' : 'nobody merged it'}`,
          says: warning,
          how: { artifacts: files, unmerged: true },
          unavailable: null,
        }]
      : []),
  ];
  return { choices, warning };
}

/**
 * What `--unmerged` gives up, said plainly: no branch is deleted, and the run's branch becomes the only copy of its work — or, for a run that
 * worked on its base branch itself, what it would be decided on is gone.
 */
export function unmergedWarning(run: Pick<RunDetail, 'id' | 'toDecide' | 'isolate' | 'branch'>): string {
  const after = 'No branch is ever deleted, and none of its steps can be tried again, sent round or approved (wf prune --unmerged).';
  if (run.isolate === false) return `It worked on ${run.branch ?? 'its base branch'} itself and nobody has decided it: once pruned, the files you would read to decide it are gone. ${after}`;
  const branches = run.toDecide?.kind === 'git' && run.toDecide.branches.length ? run.toDecide.branches.join(', ') : `wf/${run.id}/…`;
  return `Its work was never merged: once pruned, ${branches} ${run.toDecide?.kind === 'git' && run.toDecide.branches.length > 1 ? 'are' : 'is'} the only copy of it. ${after}`;
}

/** The choice selected first: the least a prune gives back that the api would take. */
export function firstChoice(offer: PruneOffer): PruneChoice {
  return offer.choices.find((choice) => !choice.unavailable) ?? offer.choices[0]!;
}

/** The question the second press answers: the run and what it gives back, and for a run nobody merged, the warning again. */
export function pruneQuestion(id: string, choice: PruneChoice, offer: PruneOffer): string {
  const what = choice.label.charAt(0).toLowerCase() + choice.label.slice(1);
  return `Prune ${id}: ${what}? This cannot be undone.${choice.how.unmerged && offer.warning ? ` ${offer.warning}` : ''}`;
}
