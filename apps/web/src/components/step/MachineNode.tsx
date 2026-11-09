import type { ReactNode } from 'react';
import { Handle, Position, type Node, type NodeProps } from '@xyflow/react';
import type { ByAction, StateBox } from '../../lib/machine';

/** A state's box, and whether it is lit: the state a task's path stands in (`DebugPanel`). */
export type MachineFlowNode = Node<StateBox & { lit?: boolean }, 'state'>;

/**
 * Edges listed by the action they take: each edge's event, with its guard, on a line of its own (`data-edge-line`), then the action
 * behind an arrow, and under them any `children`, in the same frame. What a state's box lists of the edges back to it, and what a
 * route's label lists of its edges, its verbs under them.
 */
export function ByActionList({ list, children }: { list: readonly ByAction[]; children?: ReactNode }) {
  return (
    <div className="px-2.5 py-1 font-mono text-body-small leading-4 whitespace-nowrap">
      {list.map((group) => (
        <div key={group.action} data-action={group.action}>
          {group.events.map((event, i) => (
            <div key={i} data-edge-line className="text-foreground">
              {event}
            </div>
          ))}
          <div className="text-muted-foreground">→ {group.action}</div>
        </div>
      ))}
      {children}
    </div>
  );
}

/** What kind of state a state is, said over its name on its box: where the machine starts, where it can end, or neither. */
const kindOf = ({ initial, final }: Pick<StateBox, 'initial' | 'final'>): string =>
  initial ? 'initial state' : final ? 'final state' : 'state';

/** The fill and ring of a box: alive while lit. */
const markOf = ({ lit }: MachineFlowNode['data']): string => (lit ? 'bg-alive-container ring-4 ring-alive' : 'bg-card');

/**
 * A state of a machine, in the box its layout gave it: its kind and its name, and under them the edges that come back to it. The first
 * state has a sage border and says it is the initial one; a final one has a double border and says so. A lit one — where a task's path
 * stands — is ringed and filled as alive, and says so as `data-lit`. Handles are hidden: nobody draws an edge here.
 */
export function MachineNode({ data }: NodeProps<MachineFlowNode>) {
  const edge = data.initial ? 'border-2 border-sage' : data.final ? 'border-4 border-double border-outline' : 'border border-outline';
  return (
    <div
      data-state={data.id}
      data-initial={data.initial || undefined}
      data-final={data.final || undefined}
      data-lit={data.lit || undefined}
      className={`size-full overflow-hidden rounded-md text-foreground shadow-sm ${edge} ${markOf(data)}`}
    >
      <Handle type="target" position={Position.Top} isConnectable={false} className="opacity-0" />
      <div className="px-2.5 pt-1.5">
        <p className={`text-label-small uppercase text-muted-foreground`}>{kindOf(data)}</p>
        <p data-state-name className="text-body-medium font-semibold">
          {data.id}
        </p>
      </div>
      {data.stays.length > 0 && (
        <div className="mt-1.5 border-t border-outline-variant">
          <ByActionList list={data.stays} />
        </div>
      )}
      <Handle type="source" position={Position.Bottom} isConnectable={false} className="opacity-0" />
    </div>
  );
}
