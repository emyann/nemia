import { Handle, Position, type Node, type NodeProps } from '@xyflow/react';
import type { RunDetail, WorkflowStepSpec } from '../lib/api';
import { needOf, needText, type Need } from '../lib/asks';
import { gateNodeLine } from '../lib/gate';
import { attemptLine, isLive, LOOP_SOURCE, LOOP_TARGET } from '../lib/canvas';
import { contextText } from '../lib/builder';
import { costText, pastBudget } from '../lib/cost';
import { isGate, stepState } from '../lib/status';
import { useNow } from '../lib/useNow';
import { StatusChip } from './StatusChip';

/**
 * `index` is the step's place in the run's order, which is the order `wf ls` lists it in. `waitingOnYou` is whether the
 * run's `waitingOnYou` names the step: the api's word, which leaves out a step a person has already asked something of.
 */
export type StepNodeData = { step: RunDetail['steps'][number]; index: number; runCancelled: boolean; waitingOnYou: boolean };
export type StepFlowNode = Node<StepNodeData, 'step'>;

/**
 * One step on the canvas: which step, what it runs on, and what it is doing now.
 *
 * `w-56` is narrower than the layering's column, which leaves room for the arrow between columns.
 */
export function StepNode({
  data: { step, index, runCancelled, waitingOnYou },
  selected,
  sourcePosition = Position.Right,
  targetPosition = Position.Left,
}: NodeProps<StepFlowNode>) {
  const state = stepState(step.status, runCancelled);
  const live = isLive(state);
  // Every second while the attempt's time is counting; otherwise only "started … ago" moves.
  const now = useNow(live ? 1_000 : 30_000);
  const running = state === 'working';
  // The human gate: a step that signed off blocked, or a loop out of rounds — and that the api says waits on you. A step a
  // person has sent round (`wf round`) or asked to retry (`wf retry`) keeps its word until the tick files what they asked
  // for, and is no gate from the moment they ask: the page's banner reads the api, and so does the drawing.
  const gate = waitingOnYou && isGate(state, runCancelled);
  // What a person has to know to act on it: the question of a step that asks, or that the harness blocked its session.
  const need = needOf(step, waitingOnYou, runCancelled);
  const { spec } = step;
  // What its tries have cost, of its cap where it has one: red once they have cost it or more.
  const cost = costText(step);
  const over = pastBudget(step);
  // Held on its budget only when its word says so: past the cap alone, a finished step holds nothing (a --bg session is not stopped at its cap).
  const held = state === 'over-budget' || state === 'budget-exhausted';

  return (
    <div
      className={[
        'w-56 overflow-hidden rounded-md bg-white text-neutral-900 shadow-sm dark:bg-neutral-900 dark:text-neutral-100',
        gate
          ? 'border-2 border-amber-500 dark:border-amber-400'
          : running
            ? 'border border-sky-500 ring-4 ring-sky-500/25 dark:border-sky-400 dark:ring-sky-400/20'
            : 'border border-neutral-300 dark:border-neutral-700',
        selected ? 'outline-2 outline-offset-2 outline-neutral-900 dark:outline-neutral-100' : '',
      ].join(' ')}
    >
      <Handle type="target" position={targetPosition} isConnectable={false} className="opacity-0" />

      <div className="px-3 pt-2 pb-2">
        <div className="flex items-center justify-between gap-2">
          <span
            className={`font-mono text-[10px] uppercase tracking-wider ${gate ? 'text-amber-700 dark:text-amber-400' : 'text-neutral-500'}`}
          >
            {gate ? 'human gate' : stepLabel(index)}
          </span>
          {running && (
            <span
              role="img"
              aria-label="running now"
              className="size-3 animate-spin rounded-full border-2 border-sky-500 border-t-transparent dark:border-sky-400 dark:border-t-transparent"
            />
          )}
        </div>
        <p className="mt-0.5 truncate text-sm font-semibold" title={step.name}>
          {step.name}
        </p>
        <p className="mt-0.5 truncate font-mono text-[11px] text-neutral-500 dark:text-neutral-400">
          {spec ? runsOn(spec) : 'no spec'}
        </p>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-x-2 gap-y-1 border-t border-neutral-200 px-3 py-1.5 dark:border-neutral-800">
        <StatusChip status={step.status} runCancelled={runCancelled} note={step.note} />
        <span className="font-mono text-[11px] text-neutral-500 dark:text-neutral-400">
          {attemptLine(step.attempts, live, now) ?? (step.taskId === null ? 'not filed yet' : 'no attempt yet')}
        </span>
      </div>

      {cost && (
        <p
          data-cost={over ? 'over' : 'within'}
          title={step.budget ? `What its tries have cost of its ${step.budget.said} budget${over ? (held ? ': the cap or more, so the run spends nothing more on it until a person raises it' : ': the cap or more — a --bg session is not stopped at its cap, and this step finished; nothing waits on a raise') : ''}` : 'What its tries have cost'}
          className={`truncate border-t border-neutral-200 px-3 py-1 font-mono text-[11px] dark:border-neutral-800 ${over ? 'font-semibold text-red-700 dark:text-red-400' : 'text-neutral-500 dark:text-neutral-400'}`}
        >
          <span className="font-sans font-normal">cost </span>
          {cost}
        </p>
      )}

      {/*
        The gate, and what it waits for when the step said: one line, as the node's others, and whole on hover — a second would
        make the node taller than the layering's row, and the card and the run's banner say it whole.
      */}
      {gate && (
        <p
          title={need ? nodeNeed(need, step) : undefined}
          className="truncate border-t border-amber-200 bg-amber-50 px-3 py-1 text-xs text-amber-800 dark:border-amber-900 dark:bg-amber-950 dark:text-amber-300"
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
      {/* A session the harness blocked is no gate: the step asked nothing. It says so, with what the session said last. */}
      {!gate && need && (
        <p
          data-need={need.kind}
          title={needText(need)}
          className="truncate border-t border-orange-200 bg-orange-50 px-3 py-1 text-xs text-orange-800 dark:border-orange-900 dark:bg-orange-950 dark:text-orange-300"
        >
          {needText(need)}
        </p>
      )}

      <Handle type="source" position={sourcePosition} isConnectable={false} className="opacity-0" />
      {/*
        Under the node, where the edge back that `loop:` makes leaves its looping step and comes into its target (`StateEdge`).
        Last, so an edge that names no handle takes the one on the side: React Flow takes the first of a type.
      */}
      <Handle id={LOOP_SOURCE} type="source" position={Position.Bottom} isConnectable={false} className="opacity-0" />
      <Handle id={LOOP_TARGET} type="target" position={Position.Bottom} isConnectable={false} className="opacity-0" />
    </div>
  );
}

/** A step's place in its workflow's order, as its node heads it: `step 01`. */
const stepLabel = (index: number): string => `step ${String(index + 1).padStart(2, '0')}`;

/** Who does a step and what on, as its node says it: its agent first where it has one, then the harness and the model, or that it takes the default. */
const runsOn = (spec: { agent?: string | null; harness: string | null; model: string | null }): string =>
  `${spec.agent ? `${spec.agent} · ` : ''}${spec.harness ?? 'default harness'} · ${spec.model ?? 'default model'}`;

/**
 * A step of a workflow no run has started: `index` is its place in the workflow's order, `spec` what its frontmatter sets. `build` while the
 * builder has it (`WorkflowBuilder`): whether it has changes not saved, whether the last save was refused for it, and whether it is the one
 * its form shows.
 */
export type SpecNodeData = { name: string; index: number; spec: WorkflowStepSpec; build?: { unsaved: boolean; refused: boolean; selected: boolean } };
export type SpecFlowNode = Node<SpecNodeData, 'spec'>;

/** The most tools a node writes out. Past it the node counts them, and the names are the line's title: a list of four runs long. */
const TOOLS_WRITTEN_OUT = 3;

/** What a step that sets no effort, or no tools, runs with: its harness's, as the run page's spec rows say it. */
export const HARNESS_OWN = "harness's own";

/**
 * What a step is set to do beyond what it runs on, as its node lists it: its check, its effort, its context window, its tools, its
 * permission mode and its loop. The check, the window, the mode and the loop only when the step sets them; the effort and the tools always, `harness's own` where
 * it sets none — what a session runs with is the thing a person reads a workflow for, and a step that says nothing gets the most.
 * The rest of its keys are on the step's file. A line's `title`, when it has one, is what its value stands for — the tools' names,
 * where the value counts them — and is the value itself otherwise.
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
  if (spec.loop) lines.push(['loop', `${spec.loop} · ${spec.rounds} ${spec.rounds === 1 ? 'round' : 'rounds'}`]);
  return lines;
}

/**
 * The step node in its spec mode, for a workflow before any run of it: the frame, the head and the handles a run's step has,
 * and where a run's step has its status and its attempt, what the step is set to do (`specLines`). No status and no
 * attempt: nothing has happened to it.
 */
export function SpecNode({ data: { name, index, spec, build }, sourcePosition = Position.Right, targetPosition = Position.Left }: NodeProps<SpecFlowNode>) {
  const lines = specLines(spec);
  if (build) return <BuildingNode name={name} index={index} lines={lines} spec={spec} build={build} sourcePosition={sourcePosition} targetPosition={targetPosition} />;

  return (
    <div
      data-spec
      className="w-56 overflow-hidden rounded-md border border-neutral-300 bg-white text-neutral-900 shadow-sm dark:border-neutral-700 dark:bg-neutral-900 dark:text-neutral-100"
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
              {/* Wrapped rather than cut to one line: a check is a command a person reads whole. Three lines, then the title. */}
              <dd className="line-clamp-3 min-w-0 font-mono break-words text-neutral-700 dark:text-neutral-300" title={title}>{value}</dd>
            </div>
          ))}
        </dl>
      )}

      {/* The handles a run's step has, in its order (`StepNode`), so an edge meets a step here where it meets it on a run. */}
      <Handle type="source" position={sourcePosition} isConnectable={false} className="opacity-0" />
      <Handle id={LOOP_SOURCE} type="source" position={Position.Bottom} isConnectable={false} className="opacity-0" />
      <Handle id={LOOP_TARGET} type="target" position={Position.Bottom} isConnectable={false} className="opacity-0" />
    </div>
  );
}

/** A handle a person drags from or to while building: a dot on the node's edge, in the colour of the edge it draws. */
const HANDLE = '!size-3 !border-2 !border-white dark:!border-neutral-900';

/**
 * The spec node while the builder has it: the same head and lines, with handles a person draws edges with. Drag from the right-hand dot to a
 * step's left-hand dot and that step waits on this one (`after:`); drag from the violet dot underneath to another step and this one runs that
 * step again (`loop:`). The dot a loop comes into sits beside it, and takes no drag of its own. A step not saved says so under its name, and a
 * step the last save was refused for is drawn in red.
 */
function BuildingNode({ name, index, lines, spec, build, sourcePosition, targetPosition }: {
  name: string; index: number; lines: ReturnType<typeof specLines>; spec: WorkflowStepSpec; build: NonNullable<SpecNodeData['build']>;
  sourcePosition: Position; targetPosition: Position;
}) {
  return (
    <div
      data-spec
      data-building
      data-unsaved-step={build.unsaved || undefined}
      data-refused-step={build.refused || undefined}
      className={[
        'w-56 cursor-pointer rounded-md bg-white text-neutral-900 shadow-sm dark:bg-neutral-900 dark:text-neutral-100',
        build.refused ? 'border-2 border-red-500 dark:border-red-400' : 'border border-neutral-300 dark:border-neutral-700',
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
            <span className="rounded-full bg-amber-100 px-1.5 text-[10px] font-medium text-amber-800 dark:bg-amber-950 dark:text-amber-300">unsaved</span>
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
              <dd className="line-clamp-2 min-w-0 font-mono break-words text-neutral-700 dark:text-neutral-300" title={title}>{value}</dd>
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
        className={`${HANDLE} !bg-violet-500`}
      />
      <Handle
        id={LOOP_TARGET}
        type="target"
        position={Position.Bottom}
        isConnectableStart={false}
        title={`Where a loop back to ${name} comes in`}
        style={{ left: '30%' }}
        className={`${HANDLE} !bg-violet-300 dark:!bg-violet-800`}
      />
    </div>
  );
}

/**
 * What a gate's node says after `waiting on you`: what approving does in a line (`approve ship to run it`, `approve plan's hand-off`), whose
 * whole — and the answer — is the inspector's, a click away. A question is said as it was asked.
 */
const nodeNeed = (need: Need, step: StepNodeData['step']): string =>
  (need.kind === 'approve' ? gateNodeLine({ step: step.name, ends: step.spec?.workspace === 'main' && step.taskId === null }) : needText(need));
