import type { RunSummary } from '@/lib/api';
import type { CSSProperties } from 'react';
import { filled, ink, paint } from '@/lib/meaning';
import { railSaid, railStates } from '@/lib/runWords';
import { stateClass, stateDrawn, type StepState } from '@/lib/status';
import { cn } from '@/components/ui/ds/utils';

/** The ink of a step's name under its bar: its hue where it waits on a person or failed, muted for every other. */
function nameInk(state: StepState): string {
  const { hue } = stateDrawn[state];
  return hue === 'yours' || hue === 'failure' ? ink[hue] : 'text-on-surface-variant';
}

/** Whether a state waits on a person's word: the rail draws its bar hollow and lit, whatever form every other page gives it. */
const isLitGate = (state: StepState): boolean => stateDrawn[state].hue === 'yours';

/**
 * A step's bar: its state's drawing on every page (`stateClass`), but the rail's two lit bars. The step at work is filled in its hue,
 * and the step that waits on a person's word is hollow, edged in its hue; `barGlow` lights both.
 */
const barClass = (state: StepState): string =>
  state === 'working' ? filled.alive : isLitGate(state) ? 'bg-transparent' : stateClass[state];

/** What lights a bar: the gate's edge and its glow, the glow of the step at work, and nothing for any other. */
function barGlow(state: StepState): CSSProperties | undefined {
  if (isLitGate(state))
    return { boxShadow: `inset 0 0 0 1.5px ${paint.yours}, 0 0 10px color-mix(in srgb, ${paint.yours} 45%, transparent)` };
  if (state === 'working') return { boxShadow: `0 0 12px color-mix(in srgb, ${paint.alive} 70%, transparent)` };
  return undefined;
}

/**
 * A run's own steps as a rail: one bar a step, in the run's order, each drawn by its state (`barClass`, `barGlow`), and under
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
        <span
          key={step.name}
          data-step={step.name}
          data-state={step.state}
          className={cn('block h-2', barClass(step.state))}
          style={barGlow(step.state)}
        />
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
