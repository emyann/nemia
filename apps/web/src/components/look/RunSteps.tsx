import type { RunView } from '@/lib/api/judged';
import type { WaitOn } from 'objects';
import { Fragment, type ReactNode } from 'react';
import { dashed, filled, ink, paint } from '@/lib/meaning';
import { railSaid, railStates } from '@/lib/runWords';
import { stateClass, stateDrawn, type StepState } from '@/lib/status';
import { cn } from '@/components/ui/ds/utils';

/** The ink of a step's name under its bar: its hue where it waits on a person or failed, muted for every other. */
function nameInk(state: StepState): string {
  const { hue } = stateDrawn[state];
  return hue === 'yours' || hue === 'failure' ? ink[hue] : 'text-on-surface-variant';
}

/** The states of a step not started: to come, waiting for a run slot, or held. */
const NOT_STARTED: ReadonlySet<StepState> = new Set(['waiting', 'waiting-for-slot', 'held']);

/**
 * A step's bar, by its state: done filled whether a check says so or its own word does; at work filled in its hue, its glow
 * breathing on a layer of its own (`Breath`); one that waits on a person filled in yellow, one that failed filled in red; one not
 * started a dashed outline; every other as its state is drawn on every page (`stateClass`).
 */
function barClass(state: StepState): string {
  const { hue } = stateDrawn[state];
  if (state === 'working') return cn('relative', filled.alive);
  if (hue === 'yours') return filled.yours;
  if (hue === 'failure') return filled.failure;
  if (NOT_STARTED.has(state)) return dashed.grey;
  return stateClass[state === 'unverified' ? 'verified' : state];
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
 * A run's own steps as a rail: one bar a step, in the run's order, each drawn by its state (`barClass`, `Breath`), short bars side by
 * side, or, with `names`, bars that share the rail's width with each step's name under its own. Read aloud as one picture, each step and its word (`railSaid`). `cancelled` and `held` are
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
  steps: ReadonlyArray<Pick<RunView['steps'][number], 'name' | 'phase' | 'reason' | 'on' | 'via'>>;
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
      className={cn('grid text-label-small uppercase', names ? 'gap-1.5' : 'w-fit gap-[3px]')}
      style={{ gridTemplateColumns: `repeat(${Math.max(1, drawn.length)}, ${names ? 'minmax(0, 1fr)' : '30px'})` }}
    >
      {drawn.map((step) => {
        const bar = (
          <span
            key={step.name}
            data-step={step.name}
            data-state={step.state}
            className={cn('block', names ? 'h-2' : 'h-[5px]', barClass(step.state))}
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
