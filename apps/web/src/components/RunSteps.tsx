import type { RunSummary } from '@/lib/api';
import { ink } from '@/lib/meaning';
import { railSaid, railStates } from '@/lib/runWords';
import { stateClass, stateDrawn, type StepState } from '@/lib/status';
import { cn } from '@/lib/utils';

/** The ink of a step's name under its bar: its hue where it waits on a person or failed, muted for every other. */
function nameInk(state: StepState): string {
  const { hue } = stateDrawn[state];
  return hue === 'yours' || hue === 'failure' ? ink[hue] : 'text-on-surface-variant';
}

/**
 * A run's own steps as a rail: one bar a step, in the run's order, each drawn as its state is on every page (`stateClass`), and under
 * the bars, with `names`, each step's name. Read aloud as one picture, each step and its word (`railSaid`). `cancelled` and `held` are
 * the run's, as `stepState` takes them.
 */
export function RunSteps({
  steps,
  cancelled,
  held,
  names = false,
}: {
  steps: ReadonlyArray<Pick<RunSummary['steps'][number], 'name' | 'status'>>;
  cancelled: boolean;
  held: boolean;
  names?: boolean;
}) {
  const drawn = railStates(steps, cancelled, held);
  return (
    <div
      role="img"
      aria-label={railSaid(steps, cancelled, held)}
      data-run-steps
      className="grid gap-1.5 text-[11px] leading-4 font-semibold tracking-widest uppercase"
      style={{ gridTemplateColumns: `repeat(${Math.max(1, drawn.length)}, minmax(0, 1fr))` }}
    >
      {drawn.map((step) => (
        <span key={step.name} data-step={step.name} data-state={step.state} className={cn('block h-2', stateClass[step.state])} />
      ))}
      {names &&
        drawn.map((step) => (
          <span key={step.name} data-step-name={step.name} className={cn('truncate', nameInk(step.state))} title={step.name}>
            {step.name}
          </span>
        ))}
    </div>
  );
}
