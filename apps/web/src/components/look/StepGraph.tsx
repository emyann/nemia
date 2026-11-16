import type { RunView } from '@/lib/api/judged';
import type { RunGraph } from '@/lib/api/graph';
import type { WaitOn } from 'objects';
import { Fragment, type CSSProperties, type ReactNode } from 'react';
import { flowSteps, graphOf, type GraphLine, type GraphPoint } from '@/lib/flow';
import type { Frozen } from '@/lib/frozen';
import { paint } from '@/lib/meaning';
import { railSaid, railStates } from '@/lib/runWords';
import type { StepState } from '@/lib/status';
import { stepMark, waitsNow, type StepMark } from '@/lib/stepMark';
import { stateWordsOf } from '@/lib/words';
import { Focusable, Tooltip, TooltipTrigger } from '@/components/ui/ds';
import { cn, focusRing } from '@/components/ui/ds/utils';

/** A step of the run as the graph reads it: its name, its codes, its note and whether its next round is due. */
type GraphStep = Pick<RunView['steps'][number], 'name' | 'phase' | 'reason' | 'on' | 'via' | 'note' | 'roundDue'>;

/** The run the graph draws: its steps, its graph, its gates, when it was called off and its hold. */
type GraphRun = { steps: readonly GraphStep[]; graph: Frozen<RunGraph>; gates: readonly string[]; cancelledAt: string | null } & {
  holding?: RunView['holding'];
};

/** A step as a wrap is handed it: its name, its state, and what it waits on. */
type WrappedStep = { name: string; state: StepState; on: WaitOn | null };

/** The line that has been walked: solid. */
const GONE = 'var(--md-sys-color-outline)';
/** The line still ahead, a loop not gone round, a route not taken: dashed, quieter. */
const AHEAD = 'var(--md-sys-color-outline-variant)';

/** A diamond of half-width `s` about the origin, its path starting at its top corner. */
const diamond = (s: number): string => `M0,${-s} L${s},0 L0,${s} L${-s},0 Z`;

/**
 * How a node's mark is painted: done filled sage, alive and yours filled in their hue with a still glow, failure filled red; a step
 * not started hollow, by its corners alone where it waits on something now; a route passed by dotted and small; the rest a quiet fill.
 */
function markPaint(mark: StepMark): {
  fill: string;
  stroke?: string;
  strokeDasharray?: string;
  strokeDashoffset?: number;
  filter?: string;
} {
  if (mark === 'done') return { fill: paint.sage };
  if (mark === 'alive') return { fill: paint.alive, filter: `drop-shadow(0 0 4px ${paint.alive})` };
  if (mark === 'yours') return { fill: paint.yours, filter: `drop-shadow(0 0 3px ${paint.yours})` };
  if (mark === 'failure') return { fill: paint.failure };
  if (mark === 'waits') return { fill: 'none', stroke: GONE, strokeDasharray: '3.2 3.871', strokeDashoffset: 1.6 };
  if (mark === 'todo') return { fill: 'none', stroke: GONE };
  if (mark === 'off') return { fill: 'none', stroke: AHEAD, strokeDasharray: '1.6 1.6' };
  return { fill: `color-mix(in srgb, ${paint.grey} 45%, transparent)` };
}

/**
 * A node's mark, in a box 24 wide and `tall` high about its centre: a cut diamond, or a dot for a route; for a step at work, its pulse
 * ring on a layer of its own (`pulse.css`).
 */
function Mark({ point, mark, tall }: { point: GraphPoint; mark: StepMark; tall: number }) {
  const s = point.r;
  return (
    <svg
      width="24"
      height={tall}
      viewBox={`-12 ${-tall / 2} 24 ${tall}`}
      aria-hidden="true"
      className="pointer-events-none overflow-visible"
    >
      {mark === 'alive' && <path data-step-pulse d={diamond(6.8)} fill="none" stroke={paint.alive} strokeWidth={1} />}
      {point.route ? (
        <circle r={s - 0.4} strokeWidth={1.4} style={markPaint(mark)} />
      ) : (
        <path d={diamond(s)} strokeWidth={1.4} strokeLinejoin="miter" style={markPaint(mark)} />
      )}
    </svg>
  );
}

/** A line of the graph: solid where the run has gone, dashed ahead, faint off the route taken; a loop violet once gone round. */
function Line({ line }: { line: GraphLine }) {
  const stroke = line.loop
    ? line.taken
      ? `color-mix(in srgb, ${paint.alive} 70%, transparent)`
      : AHEAD
    : line.state === 'to-come'
      ? AHEAD
      : GONE;
  const dashed = line.loop || line.state === 'to-come';
  return (
    <g
      data-arrow={line.id}
      data-state={line.state}
      data-loop-taken={line.loop ? String(line.taken) : undefined}
      opacity={line.untaken ? 0.4 : 1}
    >
      <path d={line.path} fill="none" stroke={stroke} strokeWidth={line.loop ? 1.4 : 1.5} strokeDasharray={dashed ? '3 3' : undefined} />
      {line.head && <path d={line.head} fill="none" stroke={stroke} strokeWidth={1.4} />}
    </g>
  );
}

/** A node not wrapped, or a fold: a focusable mark whose words the kit's tooltip says, on hover and on focus. */
function Told({ said, children }: { said: string; children: ReactNode }) {
  return (
    <TooltipTrigger delay={300}>
      <Focusable>
        <span
          role="img"
          aria-label={said}
          // oxlint-disable-next-line jsx-a11y/no-noninteractive-tabindex -- the keyboard opens the step's tooltip by focusing it
          tabIndex={0}
          className={cn('grid size-full place-items-center outline-none', focusRing())}
        >
          {children}
        </span>
      </Focusable>
      <Tooltip>{said}</Tooltip>
    </TooltipTrigger>
  );
}

/**
 * A run's steps as its workflow's graph drawn small (`graphOf`), `width` wide, 24 high for a row or a fork: each step a cut diamond by
 * its mark (`stepMark`, a step at work or waiting on you a size larger, at work with a slow pulse), a route a dot, a line solid where the
 * run has gone and dashed ahead, a loop under the row at right angles, violet once gone round, a gate a tick before its step, yellow
 * where that step waits on you. Past what its width holds the columns away from where the run is fold into a count. Read aloud as one
 * group, each step and its word (`railSaid`). With `wrap`, each node is put inside what it gives (a button that opens the step);
 * without, each says its name and word in the kit's tooltip. A run listed without its graph says what to do (`UNGRAPHED`). `width` is
 * 188 pixels by default; `className` is the box's, `nodrag` on the floor.
 */
export function StepGraph({
  run,
  wrap,
  width = 188,
  className,
}: {
  run: GraphRun;
  wrap?: (node: ReactNode, step: WrappedStep) => ReactNode;
  width?: number;
  className?: string;
}) {
  const cancelled = run.cancelledAt !== null;
  const held = run.holding != null;
  const drawn = railStates(run.steps, cancelled, held);
  const layout = graphOf(
    run.steps.map((step) => step.name),
    run.graph,
    flowSteps(run),
    run.gates,
    cancelled,
    width,
  );
  const at = new Map(drawn.map((step, i) => [step.name, { step, mark: stepMark(step.state, waitsNow(drawn, i, held)) }]));
  const lanes = new Map<number, number>();
  for (const point of layout.points) lanes.set(point.x, (lanes.get(point.x) ?? 0) + 1);
  return (
    <div className={cn('flex min-w-0 flex-col gap-1', className)}>
      <div
        role="group"
        aria-label={railSaid(run.steps, cancelled, held)}
        data-run-steps
        className="relative shrink-0"
        style={{ width: layout.width, height: layout.height }}
      >
        <svg
          width={layout.width}
          height={layout.height}
          aria-hidden="true"
          className="pointer-events-none absolute top-0 left-0 overflow-visible"
        >
          {layout.lines.map((line) => (
            <Line key={line.id} line={line} />
          ))}
          {layout.gates.map((gate) => (
            <line
              key={gate.step}
              data-gate={gate.step}
              x1={gate.x}
              x2={gate.x}
              y1={gate.y - 5.5}
              y2={gate.y + 5.5}
              strokeWidth={1.8}
              stroke={at.get(gate.step)?.mark === 'yours' ? paint.yours : GONE}
            />
          ))}
        </svg>
        {layout.points.map((point) => (
          <Node key={point.id} point={point} at={at} tall={(lanes.get(point.x) ?? 1) > 1 ? 13 : 24} held={held} wrap={wrap} />
        ))}
      </div>
      {layout.error && (
        <p data-graph-error title={layout.error} className="m-0 line-clamp-2 text-body-small text-failure">
          {layout.error}
        </p>
      )}
    </div>
  );
}

/**
 * A point of the graph in its holder, 24 wide and `tall` high about its centre: a step's node, put inside `wrap` where there is one, else
 * told in the kit's tooltip; or a fold's count, told the steps it stands for.
 */
function Node({
  point,
  at,
  tall,
  held,
  wrap,
}: {
  point: GraphPoint;
  at: ReadonlyMap<string, { step: WrappedStep; mark: StepMark }>;
  tall: number;
  held: boolean;
  wrap?: (node: ReactNode, step: WrappedStep) => ReactNode;
}) {
  const box: CSSProperties = { left: point.x - 12, top: point.y - tall / 2, width: 24, height: tall };
  const one = point.kind === 'step' ? at.get(point.names[0]) : undefined;
  if (!one) {
    const said = point.names.map((name) => `${name} ${wordOf(at.get(name)?.step, held)}`).join(', ');
    return (
      <div data-fold={point.names.join(' ')} className="absolute" style={box}>
        <Told said={said}>
          <span className="font-mono text-body-small leading-none text-on-surface-variant">+{point.names.length}</span>
        </Told>
      </div>
    );
  }
  const node = <Mark point={point} mark={one.mark} tall={tall} />;
  return (
    <div
      data-step={one.step.name}
      data-state={one.step.state}
      data-mark={one.mark}
      data-live={point.live || undefined}
      className="absolute grid place-items-center"
      style={box}
    >
      {wrap ? <Fragment>{wrap(node, one.step)}</Fragment> : <Told said={`${one.step.name} · ${wordOf(one.step, held)}`}>{node}</Told>}
    </div>
  );
}

/** A step's rail word, as the rail says it, or nothing for a name the run does not have. */
const wordOf = (step: WrappedStep | undefined, held: boolean): string => (step ? stateWordsOf(step.state, step.on, held).rail : '');
