import { Handle, Position, type Node, type NodeProps } from '@xyflow/react';
import type { ByAction, StateBox } from '../lib/machine';

/** A state's box, and whether it is lit: the state a task's path stands in (`DebugPanel`). */
export type MachineFlowNode = Node<StateBox & { lit?: boolean }, 'state'>;

/**
 * Edges listed by the action they take: each edge's event, with its guard, on a line of its own (`data-edge-line`), then the action
 * behind an arrow. What a state's box lists of the edges back to it, and what a route's label lists of its edges.
 */
export function ByActionList({ list }: { list: readonly ByAction[] }) {
  return (
    <div className="px-2.5 py-1 font-mono text-[11px] leading-4 whitespace-nowrap">
      {list.map((group) => (
        <div key={group.action} data-action={group.action}>
          {group.events.map((event, i) => (
            <div key={i} data-edge-line className="text-neutral-800 dark:text-neutral-200">
              {event}
            </div>
          ))}
          <div className="text-neutral-500 dark:text-neutral-400">→ {group.action}</div>
        </div>
      ))}
    </div>
  );
}

/** What kind of state a box is, said over its name: where the machine starts, where it can end, or neither. */
const kindOf = ({ initial, final }: StateBox) => (initial ? 'initial state' : final ? 'final state' : 'state');

/**
 * A state of a machine, in the box its layout gave it: its kind and its name, and under them the edges that come back to it. The first
 * state has a sky border and says it is the initial one; a final one has a double border and says so. A lit one — where a task's path
 * stands — is ringed and filled in amber, and says so as `data-lit`. Handles are hidden: nobody draws an edge here.
 */
export function MachineNode({ data }: NodeProps<MachineFlowNode>) {
  const edge = data.initial
    ? 'border-2 border-sky-500 dark:border-sky-400'
    : data.final
      ? 'border-4 border-double border-neutral-500 dark:border-neutral-400'
      : 'border border-neutral-300 dark:border-neutral-700';
  return (
    <div
      data-state={data.id}
      data-initial={data.initial || undefined}
      data-final={data.final || undefined}
      data-lit={data.lit || undefined}
      className={`size-full overflow-hidden rounded-md text-neutral-900 shadow-sm dark:text-neutral-100 ${edge} ${data.lit ? 'bg-amber-50 ring-4 ring-amber-400 dark:bg-amber-950 dark:ring-amber-400' : 'bg-white dark:bg-neutral-900'}`}
    >
      <Handle type="target" position={Position.Top} isConnectable={false} className="opacity-0" />
      <div className="px-2.5 pt-1.5">
        <p
          className={`font-mono text-[10px] uppercase tracking-wider ${data.initial ? 'text-sky-700 dark:text-sky-400' : 'text-neutral-500 dark:text-neutral-400'}`}
        >
          {kindOf(data)}
        </p>
        <p className="text-sm font-semibold">{data.id}</p>
      </div>
      {data.stays.length > 0 && (
        <div className="mt-1.5 border-t border-neutral-200 dark:border-neutral-800">
          <ByActionList list={data.stays} />
        </div>
      )}
      <Handle type="source" position={Position.Bottom} isConnectable={false} className="opacity-0" />
    </div>
  );
}
