import { Button as AriaButton } from 'react-aria-components';
import type { RunDetail, RunSummary } from '../lib/api';
import { needNodeText, needOf, needText, type Need } from '../lib/asks';
import { attemptLine, edgeLine, edgeStroke, isLive } from '../lib/canvas';
import { costText, pastBudget } from '../lib/cost';
import type { Flow, Pill } from '../lib/flow';
import { gateNodeLine, gateOfSummary } from '../lib/gate';
import { isGate, stateClass, stateMeaning, stepState } from '../lib/status';
import { useNow } from '../lib/useNow';
import { StatusChip } from './StatusChip';
import { Travelling } from './StateEdge';

type SummaryStep = RunSummary['steps'][number];

/**
 * The arrows of a flow, in one SVG under its boxes: each as the canvases draw an edge — dashed and still to come, solid done, in the
 * running colour with a dot travelling it while work moves along it (`Travelling`, still where a person asked for reduced motion), its own
 * looping back. With `rounds`, a loop past its first round says the round it is on under its curve, as the run's page labels the edge: the
 * open card's tiles have the room, and the rail at rest leaves it to the pill's hover. The round is drawn after the dot, ringed in the
 * card's colour over the curve, so the dot passes under it and not over its words.
 */
function Arrows({ flow, rounds = false }: { flow: Flow; rounds?: boolean }) {
  return (
    <svg width={flow.width} height={flow.height} aria-hidden className="pointer-events-none absolute top-0 left-0 overflow-visible">
      {flow.arrows.map((arrow) => {
        const stroke = edgeStroke(arrow.state, arrow.loop);
        return (
          <g key={arrow.id} data-arrow={arrow.id} data-state={arrow.state}>
            <path d={arrow.path} fill="none" style={{ stroke, ...edgeLine(arrow.state, arrow.loop) }} />
            <path d={arrow.head} fill={stroke} />
            {arrow.state === 'running' && <Travelling path={arrow.path} colour={stroke} />}
            {rounds && arrow.round && (
              <text
                data-round
                x={arrow.round.x}
                y={arrow.round.y}
                textAnchor="middle"
                dominantBaseline="central"
                className="text-label-small"
                strokeWidth={4}
                strokeLinejoin="round"
                style={{ fill: stroke, stroke: 'var(--card)', paintOrder: 'stroke' }}
              >
                {arrow.round.text}
              </text>
            )}
          </g>
        );
      })}
    </svg>
  );
}

/** Where a box is drawn in its flow: React Flow's floor is scaled, so everything in a flow is placed in its own pixels. */
const at = (pill: Pill) => ({ left: pill.x, top: pill.y, width: pill.width, height: pill.height });

/**
 * A run's steps on its card at rest: a pill per step in its chip's colour, on the run's layering, with the arrows between them (`railOf`).
 * A pill says its step's name, cut to its width and whole on hover with the step's status and note; the step the run is at wears a ring.
 * Past four columns, the columns before and after the ones around the run are one pill that counts them; past three lanes, one that counts
 * the rest.
 */
export function StepRail({ run, flow }: { run: RunSummary; flow: Flow }) {
  const cancelled = run.cancelledAt !== null;
  const held = run.holding != null;
  const byName = new Map(run.steps.map((step) => [step.name, step]));
  return (
    <div className="px-3">
      <div className="relative" style={{ width: flow.width, height: flow.height }}>
        <Arrows flow={flow} />
        <ul aria-label="Steps">
          {flow.pills.map((pill) => (
            <li
              key={pill.id}
              data-step={pill.kind === 'step' ? pill.names[0] : undefined}
              data-fold={pill.kind === 'fold' ? pill.names.join(' ') : undefined}
              data-more={pill.kind === 'more' ? pill.names.join(' ') : undefined}
              data-state={pill.state ?? (pill.done ? 'done' : 'mixed')}
              data-live={pill.live || undefined}
              title={
                pill.kind === 'step'
                  ? stepTitle(byName.get(pill.names[0]), pill.names[0], cancelled, held)
                  : pill.names.map((name) => stepTitle(byName.get(name), name, cancelled, held)).join('\n')
              }
              style={at(pill)}
              className={[
                'absolute flex items-center justify-center rounded-full px-1 font-mono text-body-small leading-none',
                pill.state ? stateClass[pill.state] : 'border border-dashed border-outline bg-background text-muted-foreground',
                pill.live ? 'ring-2 ring-alive/60 ring-offset-1 ring-offset-background' : '',
              ].join(' ')}
            >
              <span className="truncate">{pill.label}</span>
            </li>
          ))}
        </ul>
      </div>
      {flow.error && (
        <p title={flow.error} className="mt-1 line-clamp-2 text-body-small text-failure">
          {flow.error}
        </p>
      )}
    </div>
  );
}

/** A step's name, its status and its meaning, and its note: what hovering over it says. */
const stepTitle = (step: SummaryStep | undefined, name: string, cancelled: boolean, held: boolean): string =>
  step ? `${name}: ${step.status} — ${stateMeaning[stepState(step.status, cancelled, held)]}${step.note ? `\n${step.note}` : ''}` : name;

/**
 * A run's steps on its card opened, to the right of what the card says at rest: every step a tile on the run's layering (`tilesOf`), with
 * its status, its latest attempt and what its tries cost — once the run's detail is read — and what it waits on a person for. A press on a
 * tile shows its step in the frame's bar (`onStep`), and the tile pressed is the step the bar shows (`selected`). The attempts' times move
 * every second while one counts, and every 30 s otherwise.
 */
export function StepTiles({
  run,
  detail,
  flow,
  selected,
  onStep,
}: {
  run: RunSummary;
  detail: RunDetail | null;
  flow: Flow;
  selected: string | null;
  onStep: (step: string) => void;
}) {
  const cancelled = run.cancelledAt !== null;
  const byName = new Map(run.steps.map((step) => [step.name, step]));
  const details = new Map(detail?.steps.map((step) => [step.name, step]));
  const gate = gateOfSummary(run);
  const held = run.holding != null;
  const live = run.steps.some((step) => isLive(stepState(step.status, cancelled, held)));
  const now = useNow(live ? 1_000 : 30_000);
  return (
    <section aria-label="The run's steps" className="border-l px-3">
      <p className="mb-1 h-4 text-body-small leading-4 text-muted-foreground">Click a step for its inspector</p>
      <div className="relative" style={{ width: flow.width, height: flow.height }}>
        <Arrows flow={flow} rounds />
        {flow.pills.map((pill) => {
          const name = pill.names[0];
          const step = byName.get(name);
          if (!step) return null;
          const state = stepState(step.status, cancelled, held);
          const onYou = run.waitingOnYou.includes(name);
          const need = needOf(step, onYou, cancelled);
          const read = details.get(name);
          const attempt = read
            ? (attemptLine(read.attempts, isLive(state), now) ?? (read.taskId === null ? 'not filed yet' : 'no attempt yet'))
            : null;
          const cost = read ? costText(read) : null;
          const gated = onYou && isGate(state, cancelled);
          return (
            <AriaButton
              key={pill.id}
              data-tile={name}
              data-state={state}
              data-live={pill.live || undefined}
              aria-label={`Inspect step ${name}`}
              aria-pressed={selected === name}
              onPress={() => onStep(name)}
              style={at(pill)}
              className={[
                'nodrag absolute flex cursor-pointer flex-col items-stretch gap-1 overflow-hidden rounded-md bg-card px-2 py-1.5 text-left shadow-xs outline-none',
                gated ? 'border-2 border-yours' : state === 'working' ? 'border border-alive ring-2 ring-alive/25' : 'border',
                selected === name
                  ? 'outline-2 outline-offset-2 outline-foreground'
                  : 'data-[focus-visible]:outline-2 data-[focus-visible]:outline-offset-2 data-[focus-visible]:outline-ring',
              ].join(' ')}
            >
              <span className="truncate text-body-small font-semibold" title={name}>
                {name}
              </span>
              <span className="flex min-w-0">
                <StatusChip status={step.status} runCancelled={cancelled} runHeld={held} note={step.note} />
              </span>
              <span className="flex min-w-0 gap-1 font-mono text-body-small text-muted-foreground">
                <span className="truncate">{attempt ?? '…'}</span>
                {cost && read && (
                  <span
                    data-cost={pastBudget(read) ? 'over' : 'within'}
                    className={`truncate ${pastBudget(read) ? 'font-semibold text-money' : ''}`}
                  >
                    · {cost}
                  </span>
                )}
              </span>
              {need && (
                <span data-need={need.kind} title={needText(need)} className="truncate text-body-small text-yours">
                  {tileNeed(need, gate)}
                </span>
              )}
            </AriaButton>
          );
        })}
      </div>
      {flow.error && <p className="mt-1 text-body-small text-failure">{flow.error}</p>}
    </section>
  );
}

/**
 * What a tile says a person is asked: what approving its gate does in a line (`approve ship to run it`), off the gate the card answers,
 * which knows an ending from the list; a question as it was asked; and what a blocked session's harness waits for (`needNodeText`).
 */
const tileNeed = (need: Need, gate: ReturnType<typeof gateOfSummary>): string =>
  need.kind === 'approve' ? gateNodeLine({ step: need.step, ends: gate?.step === need.step && gate.ends }) : needNodeText(need);
