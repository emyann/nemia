import { Handle, Position, type Node, type NodeProps } from '@xyflow/react';
import type { RunDetail, WorkflowStepSpec } from '../lib/api';
import { deniedNodeText, needNodeText, needOf, needText, type Need } from '../lib/asks';
import { gateNodeLine } from '../lib/gate';
import { attemptLine, isLive, LOOP_SOURCE, LOOP_TARGET } from '../lib/canvas';
import { contextText } from '../lib/builder';
import { costText, pastBudget } from '../lib/cost';
import { isGate, stepState } from '../lib/status';
import { useNow } from '../lib/useNow';
import { StatusChip } from './StatusChip';

/**
 * `index` is the step's place in the run's order, which is the order the CLI's `ls` lists it in. `waitingOnYou` is whether the
 * run's `waitingOnYou` names the step: the api's word, which leaves out a step a person has already asked something of.
 */
export type StepNodeData = {
  step: RunDetail['steps'][number];
  index: number;
  runCancelled: boolean;
  runHeld: boolean;
  waitingOnYou: boolean;
};
export type StepFlowNode = Node<StepNodeData, 'step'>;

/**
 * One step on the canvas: which step, what it runs on, and what it is doing now.
 *
 * `w-56` is narrower than the layering's column, which leaves room for the arrow between columns.
 *
 * - Its attempt's time moves every second while it counts, and every 30 s otherwise.
 * - It is drawn as a human gate when it is one (`isGate`), a step that signed off blocked or a loop out of rounds, and the run's
 *   `waitingOnYou` names it: a step a person has sent round or asked to retry keeps its word until the tick files what they asked for,
 *   and is no gate from the moment they ask, as the page's banner says.
 * - What its tries have cost, of its cap where it has one, in money's amber once they have cost it or more. It is held on its budget only when its
 *   word says so: past the cap alone, a finished step holds nothing, since its harness ends a job at its cap, a little past it where a
 *   call was under way.
 * - A gate's line, and what it waits for when the step said (`nodeNeed`), on one line whole on hover, so the node is no taller than
 *   the layering's row; the card and the run's banner say it whole.
 * - A session the harness blocked, which is no gate: the step asked nothing. Its line says what the harness waits for
 *   (`needNodeText`), and the whole of it, with what the session said last, is on hover and in the banner.
 * - What the harness denied its current try: a job carries on past a denied call, so its work may be short of it. How many, on a line
 *   that fits; which, in the package's words, on hover and on the step's section.
 * - Its handles: on its sides, then under it where the edge back that `loop:` makes leaves its looping step and comes into its target
 *   (`StateEdge`). The side ones come first, so an edge that names no handle takes the one on the side.
 */
export function StepNode({
  data: { step, index, runCancelled, runHeld, waitingOnYou },
  selected,
  sourcePosition = Position.Right,
  targetPosition = Position.Left,
}: NodeProps<StepFlowNode>) {
  const state = stepState(step.status, runCancelled, runHeld);
  const live = isLive(state);
  const now = useNow(live ? 1_000 : 30_000);
  const running = state === 'working';
  const gate = waitingOnYou && isGate(state, runCancelled);
  const need = needOf(step, waitingOnYou, runCancelled);
  const { spec } = step;
  const cost = costText(step);
  const over = pastBudget(step);
  const held = state === 'over-budget' || state === 'budget-exhausted';

  return (
    <div
      className={[
        'w-56 overflow-hidden rounded-md bg-white text-neutral-900 shadow-sm dark:bg-neutral-900 dark:text-neutral-100',
        gate
          ? 'border-2 border-yours'
          : running
            ? 'border border-alive ring-4 ring-alive/25'
            : 'border border-neutral-300 dark:border-neutral-700',
        selected ? 'outline-2 outline-offset-2 outline-neutral-900 dark:outline-neutral-100' : '',
      ].join(' ')}
    >
      <Handle type="target" position={targetPosition} isConnectable={false} className="opacity-0" />

      <div className="px-3 pt-2 pb-2">
        <div className="flex items-center justify-between gap-2">
          <span className={`font-mono text-[10px] uppercase tracking-wider ${gate ? 'text-yours' : 'text-muted-foreground'}`}>
            {gate ? 'human gate' : stepLabel(index)}
          </span>
          {running && (
            <span
              role="img"
              aria-label="running now"
              className="size-3 animate-spin rounded-full border-2 border-alive border-t-transparent"
            />
          )}
        </div>
        <p className="mt-0.5 truncate text-sm font-semibold" title={step.name}>
          {step.name}
        </p>
        <p className="mt-0.5 truncate font-mono text-[11px] text-neutral-500 dark:text-neutral-400">{spec ? runsOn(spec) : 'no spec'}</p>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-x-2 gap-y-1 border-t border-neutral-200 px-3 py-1.5 dark:border-neutral-800">
        <StatusChip status={step.status} runCancelled={runCancelled} runHeld={runHeld} note={step.note} />
        <span className="font-mono text-[11px] text-neutral-500 dark:text-neutral-400">
          {attemptLine(step.attempts, live, now) ?? (step.taskId === null ? 'not filed yet' : 'no attempt yet')}
        </span>
      </div>

      {cost && (
        <p
          data-cost={over ? 'over' : 'within'}
          title={
            step.budget
              ? `What its tries have cost of its ${step.budget.said} budget${over ? (held ? ': the cap or more, so the run spends nothing more on it until a person raises it' : ': the cap or more — its harness ends a job at its cap, a little past it where a call was under way, and this step finished; nothing waits on a raise') : ''}`
              : 'What its tries have cost'
          }
          className={`truncate border-t border-neutral-200 px-3 py-1 font-mono text-[11px] dark:border-neutral-800 ${over ? 'font-semibold text-money' : 'text-muted-foreground'}`}
        >
          <span className="font-sans font-normal">cost </span>
          {cost}
        </p>
      )}

      {gate && (
        <p
          title={need ? nodeNeed(need, step) : undefined}
          className="truncate border-t border-border bg-yours-container px-3 py-1 text-xs text-on-yours-container"
        >
          <span className="font-semibold">waiting on you</span>
          {need && (
            <span data-need={need.kind}>
              {' · '}
              {nodeNeed(need, step)}
            </span>
          )}
        </p>
      )}
      {!gate && need && (
        <p
          data-need={need.kind}
          title={needText(need)}
          className="truncate border-t border-border bg-yours-container px-3 py-1 text-xs text-on-yours-container"
        >
          {needNodeText(need)}
        </p>
      )}
      {step.denied && (
        <p
          data-denied
          title={step.denied.words}
          className="truncate border-t border-neutral-200 px-3 py-1 font-mono text-[11px] text-failure dark:border-neutral-800"
        >
          {deniedNodeText(step.denied.calls)}
        </p>
      )}

      <Handle type="source" position={sourcePosition} isConnectable={false} className="opacity-0" />
      <Handle id={LOOP_SOURCE} type="source" position={Position.Bottom} isConnectable={false} className="opacity-0" />
      <Handle id={LOOP_TARGET} type="target" position={Position.Bottom} isConnectable={false} className="opacity-0" />
    </div>
  );
}

/** A step's place in its workflow's order, as its node heads it: `step 01`. */
const stepLabel = (index: number): string => `step ${String(index + 1).padStart(2, '0')}`;

/**
 * Who does a step and what on, as its node says it: its agent first where it has one, then the harness and the model, or that it takes the
 * default.
 */
export const runsOn = (spec: { agent?: string | null; harness: string | null; model: string | null }): string =>
  `${spec.agent ? `${spec.agent} · ` : ''}${spec.harness ?? 'default harness'} · ${spec.model ?? 'default model'}`;

/**
 * A step of a workflow no run has started: `index` is its place in the workflow's order, `spec` what its frontmatter sets. `build` while
 * the builder has it (`WorkflowBuilder`): whether it has changes not saved, whether the last save was refused for it, and whether it is the
 * one its form shows. `inspected` while the frame's bar shows it, on the workflow's canvas (`WorkflowCanvas`); never in the builder.
 */
export type SpecNodeData = {
  name: string;
  index: number;
  spec: WorkflowStepSpec;
  build?: { unsaved: boolean; refused: boolean; selected: boolean };
  inspected?: boolean;
};
export type SpecFlowNode = Node<SpecNodeData, 'spec'>;

/** The most tools a node writes out. Past it the node counts them, and the names are the line's title: a list of four runs long. */
const TOOLS_WRITTEN_OUT = 3;

/** What a step that sets no effort, or no tools, runs with: its harness's, as the run page's spec rows say it. */
export const HARNESS_OWN = "harness's own";

/**
 * What a step is set to do beyond what it runs on, as its node lists it: its check, its effort, its context window, its tools, its
 * permission mode and its loop. The check, the window, the mode and the loop only when the step sets them; the effort and the tools always,
 * `harness's own` where it sets none — what a session runs with is the thing a person reads a workflow for, and a step that says nothing
 * gets the most. The rest of its keys are on the step's file. A line's `title`, when it has one, is what its value stands for — the tools'
 * names, where the value counts them — and is the value itself otherwise.
 */
export function specLines(spec: WorkflowStepSpec): Array<[label: string, value: string, title?: string]> {
  const lines: Array<[string, string, string?]> = [];
  if (spec.check) lines.push(['check', spec.check]);
  lines.push(['effort', spec.effort ?? HARNESS_OWN]);
  if (spec.context !== null && spec.context !== undefined) lines.push(['context', contextText(spec.context)]);
  if (!spec.tools) lines.push(['tools', HARNESS_OWN]);
  else if (!spec.tools.length) lines.push(['tools', 'none']);
  else {
    const names = spec.tools.join(', ');
    lines.push(spec.tools.length > TOOLS_WRITTEN_OUT ? ['tools', String(spec.tools.length), names] : ['tools', names]);
  }
  if (spec.permissionMode) lines.push(['mode', spec.permissionMode]);
  if (spec.sandbox) lines.push(['sandbox', spec.sandbox]);
  if (spec.loop) lines.push(['loop', `${spec.loop} · ${spec.rounds} ${spec.rounds === 1 ? 'round' : 'rounds'}`]);
  return lines;
}

/**
 * The step node in its spec mode, for a workflow before any run of it: the frame, the head and the handles a run's step has, in
 * the order `StepNode` has them, so an edge meets a step here where it meets it on a run; and where a run's step has its status and
 * its attempt, what the step is set to do (`specLines`), each value wrapped to three lines, since a check is a command a person reads
 * whole, then whole on hover. No status and no attempt: nothing has happened to it. Ringed and marked `data-inspected` while the frame's
 * bar shows it, ringed on keyboard focus too. While the builder has it, it is a `BuildingNode`, which takes no mark of the bar's.
 */
export function SpecNode({
  data: { name, index, spec, build, inspected },
  sourcePosition = Position.Right,
  targetPosition = Position.Left,
}: NodeProps<SpecFlowNode>) {
  const lines = specLines(spec);
  if (build)
    return (
      <BuildingNode
        name={name}
        index={index}
        lines={lines}
        spec={spec}
        build={build}
        sourcePosition={sourcePosition}
        targetPosition={targetPosition}
      />
    );

  return (
    <div
      data-spec
      data-inspected={inspected || undefined}
      className={`w-56 cursor-pointer overflow-hidden rounded-md border border-neutral-300 bg-white text-neutral-900 shadow-sm dark:border-neutral-700 dark:bg-neutral-900 dark:text-neutral-100 ${inspected ? 'ring-2 ring-ring' : 'hover:border-neutral-400 in-focus-visible:ring-2 in-focus-visible:ring-ring dark:hover:border-neutral-500'}`}
    >
      <Handle type="target" position={targetPosition} isConnectable={false} className="opacity-0" />

      <div className="px-3 pt-2 pb-2">
        <span className="font-mono text-[10px] uppercase tracking-wider text-neutral-500">{stepLabel(index)}</span>
        <p className="mt-0.5 truncate text-sm font-semibold" title={name}>
          {name}
        </p>
        <p className="mt-0.5 truncate font-mono text-[11px] text-neutral-500 dark:text-neutral-400">{runsOn(spec)}</p>
      </div>

      {lines.length > 0 && (
        <dl className="space-y-0.5 border-t border-neutral-200 px-3 py-1.5 text-[11px] dark:border-neutral-800">
          {lines.map(([label, value, title = value]) => (
            <div key={label} className="flex min-w-0 gap-1.5">
              <dt className="shrink-0 text-neutral-500">{label}</dt>
              <dd className="line-clamp-3 min-w-0 font-mono break-words text-neutral-700 dark:text-neutral-300" title={title}>
                {value}
              </dd>
            </div>
          ))}
        </dl>
      )}

      <Handle type="source" position={sourcePosition} isConnectable={false} className="opacity-0" />
      <Handle id={LOOP_SOURCE} type="source" position={Position.Bottom} isConnectable={false} className="opacity-0" />
      <Handle id={LOOP_TARGET} type="target" position={Position.Bottom} isConnectable={false} className="opacity-0" />
    </div>
  );
}

/** A handle a person drags from or to while building: a dot on the node's edge, in the colour of the edge it draws. */
const HANDLE = '!size-3 !border-2 !border-white dark:!border-neutral-900';

/**
 * The spec node while the builder has it: the same head and lines, with handles a person draws edges with. Drag from the right-hand dot to
 * a step's left-hand dot and that step waits on this one (`after:`); drag from the grey dot underneath to another step and this one runs
 * that step again (`loop:`). The dot a loop comes into sits beside it, and takes no drag of its own. A step not saved says so under its
 * name, and a step the last save was refused for is drawn as a failure.
 */
function BuildingNode({
  name,
  index,
  lines,
  spec,
  build,
  sourcePosition,
  targetPosition,
}: {
  name: string;
  index: number;
  lines: ReturnType<typeof specLines>;
  spec: WorkflowStepSpec;
  build: NonNullable<SpecNodeData['build']>;
  sourcePosition: Position;
  targetPosition: Position;
}) {
  return (
    <div
      data-spec
      data-building
      data-unsaved-step={build.unsaved || undefined}
      data-refused-step={build.refused || undefined}
      className={[
        'w-56 cursor-pointer rounded-md bg-white text-neutral-900 shadow-sm dark:bg-neutral-900 dark:text-neutral-100',
        build.refused ? 'border-2 border-failure' : 'border border-neutral-300 dark:border-neutral-700',
        build.selected ? 'outline-2 outline-offset-2 outline-neutral-900 dark:outline-neutral-100' : '',
      ].join(' ')}
    >
      <Handle
        type="target"
        position={targetPosition}
        isConnectableStart={false}
        title={`Drop an edge here: ${name} waits on the step it comes from`}
        className={`${HANDLE} !bg-neutral-500`}
      />

      <div className="px-3 pt-2 pb-2">
        <div className="flex items-center justify-between gap-2">
          <span className="font-mono text-[10px] uppercase tracking-wider text-neutral-500">{stepLabel(index)}</span>
          {build.unsaved && (
            <span className="rounded-full bg-yours-container px-1.5 text-[10px] font-medium text-on-yours-container">unsaved</span>
          )}
        </div>
        <p className="mt-0.5 truncate text-sm font-semibold" title={name}>
          {name}
        </p>
        <p className="mt-0.5 truncate font-mono text-[11px] text-neutral-500 dark:text-neutral-400">{runsOn(spec)}</p>
      </div>

      {lines.length > 0 && (
        <dl className="space-y-0.5 border-t border-neutral-200 px-3 py-1.5 text-[11px] dark:border-neutral-800">
          {lines.map(([label, value, title = value]) => (
            <div key={label} className="flex min-w-0 gap-1.5">
              <dt className="shrink-0 text-neutral-500">{label}</dt>
              <dd className="line-clamp-2 min-w-0 font-mono break-words text-neutral-700 dark:text-neutral-300" title={title}>
                {value}
              </dd>
            </div>
          ))}
        </dl>
      )}

      <Handle
        type="source"
        position={sourcePosition}
        title={`Drag to a step that waits on ${name}`}
        className={`${HANDLE} !bg-neutral-500`}
      />
      <Handle
        id={LOOP_SOURCE}
        type="source"
        position={Position.Bottom}
        title={`Drag to a step ${name} waits on, to run it again when ${name} says so: loop`}
        style={{ left: '70%' }}
        className={`${HANDLE} !bg-rest`}
      />
      <Handle
        id={LOOP_TARGET}
        type="target"
        position={Position.Bottom}
        isConnectableStart={false}
        title={`Where a loop back to ${name} comes in`}
        style={{ left: '30%' }}
        className={`${HANDLE} !bg-sage`}
      />
    </div>
  );
}

/**
 * What a gate's node says after `waiting on you`: what approving does in a line (`approve ship to run it`, `approve plan's hand-off`),
 * whose whole — and the answer — is the inspector's, a click away. A question is said as it was asked.
 */
const nodeNeed = (need: Need, step: StepNodeData['step']): string =>
  need.kind === 'approve'
    ? gateNodeLine({ step: step.name, ends: step.spec?.workspace === 'main' && step.taskId === null })
    : needText(need);
