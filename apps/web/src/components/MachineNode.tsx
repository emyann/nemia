import type { ReactNode } from 'react';
import { Handle, Position, type Node, type NodeProps } from '@xyflow/react';
import type { ByAction, StateBox } from '../lib/machine';

/**
 * A state's box; whether it is lit, the state a task's path stands in (`DebugPanel`); whether a press on it shows it in the frame's bar
 * (`pressable`), and whether the bar shows it (`inspected`), on the Machines page.
 */
export type MachineFlowNode = Node<StateBox & { lit?: boolean; pressable?: boolean; inspected?: boolean }, 'state'>;

/**
 * Edges listed by the action they take: each edge's event, with its guard, on a line of its own (`data-edge-line`), then the action
 * behind an arrow, and under them any `children`, in the same frame. What a state's box lists of the edges back to it, and what a
 * route's label lists of its edges, its verbs under them.
 */
export function ByActionList({ list, children }: { list: readonly ByAction[]; children?: ReactNode }) {
  return (
    <div className="px-2.5 py-1 font-mono text-[11px] leading-4 whitespace-nowrap">
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

/** What kind of state a state is, said over its name on its box and in its bar: where the machine starts, where it can end, or neither. */
export const kindOf = ({ initial, final }: Pick<StateBox, 'initial' | 'final'>): string =>
  initial ? 'initial state' : final ? 'final state' : 'state';

/**
 * The fill and ring of a box: alive while lit; ringed while the bar shows it, as thick as a lit one, since the drawing shrinks beside the
 * bar; ringed on keyboard focus while it can be pressed.
 */
function markOf({ lit, inspected, pressable }: MachineFlowNode['data']): string {
  if (lit) return 'bg-alive-container ring-4 ring-alive';
  const fill = 'bg-white dark:bg-neutral-900';
  if (inspected) return `${fill} cursor-pointer ring-4 ring-ring`;
  return pressable ? `${fill} cursor-pointer in-focus-visible:ring-2 in-focus-visible:ring-ring` : fill;
}

/**
 * A state of a machine, in the box its layout gave it: its kind and its name, and under them the edges that come back to it. The first
 * state has a sage border and says it is the initial one; a final one has a double border and says so. A lit one — where a task's path
 * stands — is ringed and filled as alive, and says so as `data-lit`. One the frame's bar shows is ringed, and says so as `data-inspected`;
 * one a press shows in the bar is ringed on keyboard focus too. Handles are hidden: nobody draws an edge here.
 */
export function MachineNode({ data }: NodeProps<MachineFlowNode>) {
  const edge = data.initial
    ? 'border-2 border-sage'
    : data.final
      ? 'border-4 border-double border-neutral-500 dark:border-neutral-400'
      : 'border border-neutral-300 dark:border-neutral-700';
  return (
    <div
      data-state={data.id}
      data-initial={data.initial || undefined}
      data-final={data.final || undefined}
      data-lit={data.lit || undefined}
      data-inspected={data.inspected || undefined}
      className={`size-full overflow-hidden rounded-md text-foreground shadow-sm ${edge} ${markOf(data)}`}
    >
      <Handle type="target" position={Position.Top} isConnectable={false} className="opacity-0" />
      <div className="px-2.5 pt-1.5">
        <p className={`font-mono text-[10px] uppercase tracking-wider text-muted-foreground`}>{kindOf(data)}</p>
        <p data-state-name className="text-sm font-semibold">
          {data.id}
        </p>
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
