import type { RunSummary } from '@/lib/api';
import { filled, ink } from '@/lib/meaning';
import { railSaid, railStates } from '@/lib/runWords';
import { stateClass, stateDrawn, type StepState } from '@/lib/status';
import { cn } from '@/components/ui/ds/utils';

/** The ink of a step's name under its bar: its hue where it waits on a person or failed, muted for every other. */
function nameInk(state: StepState): string {
  const { hue } = stateDrawn[state];
  return hue === 'yours' || hue === 'failure' ? ink[hue] : 'text-on-surface-variant';
}

/**
 * A step's bar: its state's drawing on every page (`stateClass`), but the step at work in its hue's own fill, the one lit bar of the
 * rail: a bar carries no text, and a container's tone alone is the dimmest fill on a dark ground.
 */
const barClass = (state: StepState): string => (state === 'working' ? filled.alive : stateClass[state]);

/**
 * A run's own steps as a rail: one bar a step, in the run's order, each drawn by its state (`barClass`), and under
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
      className="grid gap-1.5 text-label-small uppercase"
      style={{ gridTemplateColumns: `repeat(${Math.max(1, drawn.length)}, minmax(0, 1fr))` }}
    >
      {drawn.map((step) => (
        <span key={step.name} data-step={step.name} data-state={step.state} className={cn('block h-2', barClass(step.state))} />
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
