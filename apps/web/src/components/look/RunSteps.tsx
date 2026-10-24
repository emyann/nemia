import type { RunSummary, WaitOn } from '@/lib/api';
import { Fragment, type CSSProperties, type ReactNode } from 'react';
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
 * A step's bar: its state's drawing on every page (`stateClass`), but three. A step done is filled whether a check says so or its own
 * word does, the step at work is filled in its hue, and the step that waits on a person's word is hollow, edged in its hue;
 * `barGlow` lights the gate, and `Breath` the step at work.
 */
function barClass(state: StepState): string {
  if (state === 'working') return cn('relative', filled.alive);
  if (isLitGate(state)) return 'bg-transparent';
  return stateClass[state === 'unverified' ? 'verified' : state];
}

/** What lights a bar of its own: the gate's edge and its still glow, and nothing for any other. */
function barGlow(state: StepState): CSSProperties | undefined {
  if (isLitGate(state))
    return { boxShadow: `inset 0 0 0 1.5px ${paint.yours}, 0 0 10px color-mix(in srgb, ${paint.yours} 45%, transparent)` };
  return undefined;
}

/**
 * The glow of the step at work, on a layer of its own over its bar, which breathes (`data-step-breath`, `breath.css`): its opacity
 * swells and eases while the bar's fill and size stay still, and it is still where a person asks for reduced motion.
 */
function Breath() {
  return (
    <span
      aria-hidden="true"
      data-step-breath
      className="absolute inset-0"
      style={{ boxShadow: `0 0 12px color-mix(in srgb, ${paint.alive} 70%, transparent)` }}
    />
  );
}

/**
 * A run's own steps as a rail: one bar a step, in the run's order, each drawn by its state (`barClass`, `barGlow`, `Breath`), and under
 * the bars, with `names`, each step's name. Read aloud as one picture, each step and its word (`railSaid`). `cancelled` and `held` are
 * the run's, as `stepState` takes them. With `wrap`, each bar is put inside what it gives (a button that opens the step), and the rail
 * is a group named by `railSaid`, each bar its own step.
 */
export function RunSteps({
  steps,
  cancelled,
  held,
  names = false,
  wrap,
}: {
  steps: ReadonlyArray<Pick<RunSummary['steps'][number], 'name' | 'phase' | 'reason' | 'on' | 'via'>>;
  cancelled: boolean;
  held: boolean;
  names?: boolean;
  wrap?: (bar: ReactNode, step: { name: string; state: StepState; on: WaitOn | null }) => ReactNode;
}) {
  const drawn = railStates(steps, cancelled, held);
  return (
    <div
      role={wrap ? 'group' : 'img'}
      aria-label={railSaid(steps, cancelled, held)}
      data-run-steps
      className="grid gap-1.5 text-label-small uppercase"
      style={{ gridTemplateColumns: `repeat(${Math.max(1, drawn.length)}, minmax(0, 1fr))` }}
    >
      {drawn.map((step) => {
        const bar = (
          <span
            key={step.name}
            data-step={step.name}
            data-state={step.state}
            className={cn('block h-2', barClass(step.state))}
            style={barGlow(step.state)}
          >
            {step.state === 'working' && <Breath />}
          </span>
        );
        return wrap ? <Fragment key={step.name}>{wrap(bar, step)}</Fragment> : bar;
      })}
      {names &&
        drawn.map((step) => (
          <span key={step.name} data-step-name={step.name} className={cn('truncate', nameInk(step.state))} title={step.name}>
            {step.name}
          </span>
        ))}
    </div>
  );
}
