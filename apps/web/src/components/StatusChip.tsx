import { CircleDashed } from 'lucide-react';
import { stateClass, stateMeaning, stepState } from '../lib/status';

/**
 * A step's status in `wf ls`'s words, coloured by what it means, and what that is on hover.
 *
 * `unverified` carries a dashed circle before its words: its colour is neutral, like a step still to do,
 * and the mark says it is not one — it signed off, and nothing but its own word says it worked.
 * `data-state` is the state the colour was chosen for, so a check can read it without reading a colour.
 */
export function StatusChip({ status, runCancelled }: { status: string; runCancelled: boolean }) {
  const state = stepState(status, runCancelled);
  return (
    <span
      title={stateMeaning[state]}
      data-state={state}
      className={`inline-flex items-center gap-1 whitespace-nowrap rounded px-1.5 py-0.5 font-mono text-[11px] leading-none ${stateClass[state]}`}
    >
      {state === 'unverified' && <CircleDashed aria-hidden strokeWidth={2.5} className="size-2.5 shrink-0" />}
      {status}
    </span>
  );
}
