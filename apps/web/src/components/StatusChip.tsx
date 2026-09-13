import { stateClass, stepState } from '../lib/status';

/** A step's status in `wf ls`'s words, coloured by what it means. */
export function StatusChip({ status, runCancelled }: { status: string; runCancelled: boolean }) {
  const state = stepState(status, runCancelled);
  return (
    <span
      title={state}
      className={`inline-block whitespace-nowrap rounded px-1.5 py-0.5 font-mono text-[11px] leading-none ${stateClass[state]}`}
    >
      {status}
    </span>
  );
}
