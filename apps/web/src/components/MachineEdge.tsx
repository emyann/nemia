import { BaseEdge, EdgeLabelRenderer, type Edge, type EdgeProps } from '@xyflow/react';
import { pathThrough, type Route } from '../lib/machine';
import { ByActionList } from './MachineNode';

export type MachineFlowEdge = Edge<Route, 'route'>;

/**
 * The edges from one state to another, drawn as one along the route the layout gave it (`pathThrough`), with an arrow at the state it
 * leads to and, in the box the layout made room for, its edges listed by action. React Flow's own ends are not read: the route is the
 * layout's.
 */
export function MachineEdge({ data, markerEnd }: EdgeProps<MachineFlowEdge>) {
  if (!data) return null;
  const { label } = data;
  return (
    <>
      <BaseEdge path={pathThrough(data.points)} markerEnd={markerEnd} style={{ stroke: 'var(--edge-done)', strokeWidth: 1.5 }} />
      <EdgeLabelRenderer>
        <div
          data-route={data.id}
          className="absolute overflow-hidden rounded border border-neutral-200 bg-white dark:border-neutral-800 dark:bg-neutral-900"
          style={{
            width: label.width,
            height: label.height,
            transform: `translate(${label.x - label.width / 2}px, ${label.y - label.height / 2}px)`,
          }}
        >
          <ByActionList list={data.edges} />
        </div>
      </EdgeLabelRenderer>
    </>
  );
}
