/**
 * What a run or a step cost, as the board says it: the api's words — the package's — put side by side, and never a sum worked out here.
 * Pure.
 */
import type { RunDetail, Spent } from './api';

type Priced = Pick<RunDetail['steps'][number], 'spent' | 'budget'>;

/**
 * What a step's tries have cost, as its node and the inspector say it: of its cap where it has one (`$4.25 of $3`), all of them where it
 * has none (`$4.25`), or its cap before anything of it was measured (`budget $3`). Null for a step with neither: nothing measured, and no
 * cap.
 */
export function costText(step: Priced): string | null {
  if (step.budget) return step.budget.of ?? `budget ${step.budget.said}`;
  return step.spent?.said ?? null;
}

/**
 * Whether a step's tries have cost its cap or more — what holds it, where another session of it is the way on: what its cost is drawn red
 * for.
 */
export const pastBudget = (step: Pick<Priced, 'budget'>): boolean => step.budget?.over === true;

/**
 * What a cost adds up, on hover: how many ended sessions the harness priced — and for a cost that reads `≥`, how many had no cost on them,
 * so the figure is the least it was; and that a session still running is in it only once it ends, when its harness prices it.
 */
export function spentTitle(spent: Spent, of: string): string {
  const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? '' : 's'}`;
  const missing = spent.unmeasured
    ? `; ${plural(spent.unmeasured, 'ended session')} had no cost on ${spent.unmeasured === 1 ? 'it' : 'them'}, so it cost at least this`
    : '';
  return `What ${of} cost, as its harness priced each session: ${plural(spent.measured, 'session')} measured${missing}. A session still running is priced once it ends.`;
}
