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

/** What the board offers to prune of a run, and whether the run's branch would be the only copy of its work once pruned. */
export type PruneOffer = { choices: PruneChoice[]; unmerged: boolean; branches: string };

type Prunable = Pick<RunDetail, 'id' | 'place' | 'status' | 'moving' | 'cancelledAt' | 'toDecide' | 'pruned'>;

/**
 * Whether a finished run's branch is not on its base, as `pruneRefusal` asks: a run that finished and was neither shipped nor called off. A run
 * that succeeded with nothing left to decide shipped; one that failed, or succeeded with its branch to merge, did not. Read off the status and
 * `toDecide`, since the api's `git` decision is said only of a run that succeeded — a failed run nobody merged needs `--unmerged` all the same.
 */
export function nobodyMerged(run: Pick<RunDetail, 'status' | 'cancelledAt' | 'toDecide'>): boolean {
  if (run.cancelledAt || run.status === 'cancelled' || run.status === 'running') return false;
  return run.toDecide?.kind === 'git' || run.status !== 'succeeded';
}

/**
 * What the run's page offers to prune, or null where it offers nothing: a folder run (the package prunes git runs alone), a run still moving,
 * and one whose worktrees and files are both gone. A run already pruned is offered its files alone. The api judges the prune again whatever
 * this says, and a refusal is shown in the package's words.
 */
export function pruneOffer(run: Prunable): PruneOffer | null {
  if (run.place !== 'git' || run.moving || run.status === 'running' || run.pruned?.artifacts) return null;
  const unmerged = nobodyMerged(run);
  const branches = run.toDecide?.kind === 'git' && run.toDecide.branches.length ? run.toDecide.branches.join(', ') : `wf/${run.id}/…`;
  const merge = unmerged ? `Nobody merged ${branches}: only the last choice prunes it.` : null;
  const kept = run.pruned ? 'Its worktrees are already gone.' : 'The folders its steps worked in.';
  const worktrees: PruneChoice = {
    key: 'worktrees',
    label: 'Its worktrees',
    says: `${kept} Its record, its branches and its files are kept.`,
    how: { artifacts: false, unmerged: false },
    unavailable: merge,
  };
  const files: PruneChoice = {
    key: 'files',
    label: run.pruned ? 'Its files' : 'Its worktrees and its files',
    says: 'And the files its steps handed on (wf prune --artifacts): a closeout that names one then says it was pruned. Its record and branches are kept.',
    how: { artifacts: true, unmerged: false },
    unavailable: merge,
  };
  const all: PruneChoice = {
    key: 'unmerged',
    label: run.pruned ? 'Its files, though nobody merged it' : 'Its worktrees and its files, though nobody merged it',
    says: unmergedWarning(branches),
    how: { artifacts: true, unmerged: true },
    unavailable: null,
  };
  return { choices: [...(run.pruned ? [] : [worktrees]), files, ...(unmerged ? [all] : [])], unmerged, branches };
}

/** What `--unmerged` gives up, said plainly: no branch is deleted, and the branch becomes the only copy of the run's work. */
export function unmergedWarning(branches: string): string {
  return `Its work was never merged: once pruned, ${branches} is the only copy of it. No branch is ever deleted, and none of its steps can be tried again, sent round or approved (wf prune --unmerged --artifacts).`;
}

/** The choice selected first: the least a prune gives back that the api would take. */
export function firstChoice(offer: PruneOffer): PruneChoice {
  return offer.choices.find((choice) => !choice.unavailable) ?? offer.choices[0]!;
}

/** The question the second press answers: the run and what it gives back, and for a run nobody merged, the warning again. */
export function pruneQuestion(id: string, choice: PruneChoice, offer: PruneOffer): string {
  const what = choice.label.charAt(0).toLowerCase() + choice.label.slice(1);
  return `Prune ${id}: ${what}? This cannot be undone.${choice.how.unmerged ? ` ${unmergedWarning(offer.branches)}` : ''}`;
}
