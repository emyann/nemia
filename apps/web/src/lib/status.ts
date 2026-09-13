/**
 * What a step's status means for the person looking at it.
 *
 * The words are `wf ls`'s and the board shows them as they are; this only chooses the colour.
 * `cancelled` is a fact about the run rather than the step: a step that has not started on a run
 * somebody called off never will, and a step the cancellation stopped reads `stopped`.
 */
export type StepState = 'working' | 'needs-human' | 'done' | 'blocked' | 'failed' | 'waiting' | 'cancelled' | 'unknown';

export function stepState(status: string, runCancelled: boolean): StepState {
  // `succeeded · BLOCKED`: the session ended cleanly, and the step is waiting on a person.
  const [phase = '', said] = status.split(' · ');
  if (said === 'BLOCKED') return 'blocked';
  if (phase === 'needs-human') return 'needs-human';
  if (phase === 'failed') return 'failed';
  if (phase === 'stopped') return 'cancelled';
  if (phase === 'succeeded') return 'done';
  if (phase === 'unknown') return 'unknown';
  if (phase === 'waiting' || phase === 'pending') return runCancelled ? 'cancelled' : 'waiting';
  // `running (working)`, `working (quiescent)`, `starting`, `between attempts`.
  return 'working';
}

export const stateClass: Record<StepState, string> = {
  working: 'bg-sky-100 text-sky-800 dark:bg-sky-950 dark:text-sky-300',
  'needs-human': 'bg-orange-100 text-orange-800 dark:bg-orange-950 dark:text-orange-300',
  done: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300',
  blocked: 'bg-amber-100 font-semibold text-amber-900 dark:bg-amber-950 dark:text-amber-300',
  failed: 'bg-red-100 text-red-800 dark:bg-red-950 dark:text-red-300',
  waiting: 'bg-neutral-100 text-neutral-600 dark:bg-neutral-800 dark:text-neutral-300',
  cancelled: 'bg-neutral-100 text-neutral-500 line-through dark:bg-neutral-900 dark:text-neutral-500',
  unknown: 'border border-dashed border-neutral-300 text-neutral-500 dark:border-neutral-700',
};
