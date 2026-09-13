import { Handle, Position, type Node, type NodeProps } from '@xyflow/react';
import type { RunDetail } from '../lib/api';
import { attemptLine, isLive } from '../lib/canvas';
import { stepState } from '../lib/status';
import { useNow } from '../lib/useNow';
import { StatusChip } from './StatusChip';

/** `index` is the step's place in the run's order, which is the order `wf ls` lists it in. */
export type StepNodeData = { step: RunDetail['steps'][number]; index: number; runCancelled: boolean };
export type StepFlowNode = Node<StepNodeData, 'step'>;

/**
 * One step on the canvas: which step, what it runs on, and what it is doing now.
 *
 * `w-56` is narrower than the layering's column, which leaves room for the arrow between columns.
 */
export function StepNode({
  data: { step, index, runCancelled },
  selected,
  sourcePosition = Position.Right,
  targetPosition = Position.Left,
}: NodeProps<StepFlowNode>) {
  const state = stepState(step.status, runCancelled);
  const live = isLive(state);
  // Every second while the attempt's time is counting; otherwise only "started … ago" moves.
  const now = useNow(live ? 1_000 : 30_000);
  const running = state === 'working';
  // The human gate. On a run somebody called off, nobody is waiting for the answer any more.
  const gate = state === 'blocked' && !runCancelled;
  const { spec } = step;

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
            {gate ? 'human gate' : `step ${String(index + 1).padStart(2, '0')}`}
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
          {spec ? `${spec.harness ?? 'default harness'} · ${spec.model ?? 'default model'}` : 'no spec in the folder'}
        </p>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-x-2 gap-y-1 border-t border-neutral-200 px-3 py-1.5 dark:border-neutral-800">
        <StatusChip status={step.status} runCancelled={runCancelled} note={step.note} />
        <span className="font-mono text-[11px] text-neutral-500 dark:text-neutral-400">
          {attemptLine(step.attempts, live, now) ?? 'no attempt yet'}
        </span>
      </div>

      {gate && (
        <p className="border-t border-amber-200 bg-amber-50 px-3 py-1 text-xs font-semibold text-amber-800 dark:border-amber-900 dark:bg-amber-950 dark:text-amber-300">
          waiting on you
        </p>
      )}

      <Handle type="source" position={sourcePosition} isConnectable={false} className="opacity-0" />
    </div>
  );
}
