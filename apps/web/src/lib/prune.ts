import type { RunDetail } from './api/detail.ts';
import type { Decidable, RunDecision } from './api/decision.ts';
import { isDecidable } from './decide.ts';
import type { PruneHow } from './api/runs.ts';

/**
 * One thing a person may give back of a finished run, as the CLI's `prune` takes it: its worktrees; with its files too (`--artifacts`); and
 * with them a run nobody merged (`--unmerged`). Each takes in what the one before it gives back. `unavailable` says why a choice would be
 * refused.
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

type Prunable = Pick<RunDetail, 'id' | 'place' | 'status' | 'moving' | 'onDisk'>;

/**
 * Whether the run finished and nobody has decided it, as the api's decision says it off the package's own (`Decidable['awaiting']`): the
 * reading the CLI's `prune` refuses without `--unmerged` (`pruneRefusal`). Taken from the decision, never worked out here: the run's status
 * says nothing of a failed run whose branch a person merged by hand (landed, the package says), and the list's `toDecide` is never said of
 * a run that worked on its base branch itself, which waits on a decision all the same.
 */
export type Awaiting = NonNullable<Decidable['awaiting']>;

/**
 * The api's decision as the prune reads it: `awaiting` for a run nobody decided, and null for any other answer — a run landed or called
 * off (`nothing`), and one still going, waited on or held, which the package refuses in words of its own. A decision without `awaiting` is
 * read as null.
 */
export const awaitingOf = (decision: RunDecision): Awaiting | null => (isDecidable(decision) ? (decision.awaiting ?? null) : null);

/**
 * Whether the run's page offers a prune at all: a repository run (the package prunes repository runs alone), with nothing moving, and
 * with worktrees or files left on disk (`onDisk`). What it offers waits on the decision (`pruneOffer`).
 */
export function prunable(run: Prunable): boolean {
  const { worktrees, files } = run.onDisk;
  return run.place === 'git' && !run.moving && run.status !== 'running' && (worktrees || files);
}

/**
 * What the run's page offers to prune, or null where it offers nothing (`prunable`). Only what is on disk is offered, and for a run nobody
 * decided (`awaiting`) the first two are shown refused and the third is the one to press. The api judges the prune again whatever this
 * says, and a refusal is shown in the package's words.
 */
export function pruneOffer(run: Prunable, awaiting: Awaiting | null): PruneOffer | null {
  if (!prunable(run)) return null;
  const { worktrees, files } = run.onDisk;
  const warning = awaiting ? unmergedWarning(awaiting) : null;
  const merge = !awaiting
    ? null
    : awaiting.direct
      ? 'It waits on your decision: only the last choice prunes it.'
      : 'Nobody merged it: only the last choice prunes it.';
  const most = files ? (worktrees ? 'Its worktrees and its files' : 'Its files') : 'Its worktrees';
  const choices: PruneChoice[] = [
    ...(worktrees
      ? [
          {
            key: 'worktrees' as const,
            label: 'Its worktrees',
            says: `The folders its steps worked in. Its record, its branches${files ? ' and its files' : ''} are kept.`,
            how: { artifacts: false, unmerged: false },
            unavailable: merge,
          },
        ]
      : []),
    ...(files
      ? [
          {
            key: 'files' as const,
            label: most,
            says: 'And the files its steps handed on: a closeout that names one then says it was pruned. Its record and branches are kept.',
            how: { artifacts: true, unmerged: false },
            unavailable: merge,
          },
        ]
      : []),
    ...(awaiting && warning !== null
      ? [
          {
            key: 'unmerged' as const,
            label: `${most}, though ${awaiting.direct ? 'nobody decided it' : 'nobody merged it'}`,
            says: warning,
            how: { artifacts: files, unmerged: true },
            unavailable: null,
          },
        ]
      : []),
  ];
  return { choices, warning };
}

/**
 * What `--unmerged` gives up, said plainly: no branch is deleted, and the run's result branches become the only copy of its work — or, for
 * a run that worked on its base branch itself, what it would be decided on is gone.
 */
export function unmergedWarning(awaiting: Awaiting): string {
  const after = 'No branch is ever deleted, and none of its steps can be tried again, sent round or approved.';
  if (awaiting.direct)
    return `It worked on ${awaiting.branches[0] ?? 'its base branch'} itself and nobody has decided it: once pruned, the files you would read to decide it are gone. ${after}`;
  const branches = awaiting.branches.length ? awaiting.branches.join(', ') : `the run's branches`;
  return `Its work was never merged: once pruned, ${branches} ${awaiting.branches.length > 1 ? 'are' : 'is'} the only copy of it. ${after}`;
}

/** The choice selected first: the least a prune gives back that the api would take. */
export function firstChoice(offer: PruneOffer): PruneChoice {
  return offer.choices.find((choice) => !choice.unavailable) ?? offer.choices[0];
}

/** The question the second press answers: the run and what it gives back, and for a run nobody merged, the warning again. */
export function pruneQuestion(id: string, choice: PruneChoice, offer: PruneOffer): string {
  const what = choice.label.charAt(0).toLowerCase() + choice.label.slice(1);
  return `Prune ${id}: ${what}? This cannot be undone.${choice.how.unmerged && offer.warning ? ` ${offer.warning}` : ''}`;
}
