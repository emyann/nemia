import type { RunView } from './api/judged.ts';
import { holdable } from './hold.ts';
import { prunable } from './prune.ts';

/** An action on a whole run: remove a try, lift its hold, hold it, prune what it left on disk. */
export type RunAction = 'remove' | 'lift' | 'hold' | 'prune';

/** What each action's item says, in both menus that offer it: the run page's and the one a right-click opens on a listed run. */
const ACTION_LABEL: Record<RunAction, string> = {
  remove: 'Remove…',
  lift: 'Lift…',
  hold: 'Hold…',
  prune: 'Prune…',
};

/** What of a run its actions are read from. */
type Actionable = Pick<
  RunView,
  'try' | 'holding' | 'id' | 'cancelledAt' | 'holdUntil' | 'status' | 'pruned' | 'place' | 'moving' | 'onDisk'
>;

/**
 * The run's actions, the one list every surface that offers them reads, in their order: Remove for a try, Lift while held, else Hold where
 * it can be held, and Prune where it would take anything — `Prune its files…` where its worktrees are gone. None where it offers none.
 * @param run the run the actions are on
 */
export const runActionsOf = (run: Actionable): Array<{ key: RunAction; label: string }> =>
  [
    ...(run.try ? (['remove'] as const) : []),
    ...(run.holding ? (['lift'] as const) : holdable(run) ? (['hold'] as const) : []),
    ...(prunable(run) ? (['prune'] as const) : []),
  ].map((key) => ({ key, label: key === 'prune' && !run.onDisk.worktrees ? 'Prune its files…' : ACTION_LABEL[key] }));
