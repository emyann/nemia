import { BaseEdge, EdgeLabelRenderer, type Edge, type EdgeProps } from '@xyflow/react';
import type { Route } from '../lib/machine';
import { ByActionList } from './MachineNode';

/** A route, and whether it is taken: a move of a task's path from its state to the next (`DebugPanel`). */
export type MachineFlowEdge = Edge<Route & { taken?: boolean }, 'route'>;

/**
 * The edges and verbs from one state to another, drawn as one along the path the layout gave it (`pathOf`), with an arrow at the state
 * it leads to and, in the box the layout made room for, its edges listed by action, then each verb a person takes along it on a line of
 * its own (`data-verb`). A route only a person's verb takes is dashed, and its label says so as `data-dashed`. A route a task's path
 * took is drawn heavier in `--edge-taken`, its label bordered alike, and says so as `data-taken`. React Flow's own ends are not read: the
 * route is the layout's.
 */
export function MachineEdge({ data, markerEnd }: EdgeProps<MachineFlowEdge>) {
  if (!data) return null;
  const { label } = data;
  return (
    <>
      <BaseEdge
        path={data.path}
        markerEnd={markerEnd}
        style={{
          stroke: data.taken ? 'var(--edge-taken)' : 'var(--edge-done)',
          strokeWidth: data.taken ? 3 : 1.5,
          strokeDasharray: data.dashed ? '6 4' : undefined,
        }}
      />
      <EdgeLabelRenderer>
        <div
          data-route={data.id}
          data-taken={data.taken || undefined}
          data-dashed={data.dashed || undefined}
          className={`absolute overflow-hidden rounded border bg-card ${data.taken ? 'border-alive' : 'border-border'}`}
          style={{
            width: label.width,
            height: label.height,
            transform: `translate(${label.x - label.width / 2}px, ${label.y - label.height / 2}px)`,
          }}
        >
          <ByActionList list={data.edges}>
            {data.verbs.map((verb) => (
              <div key={verb} data-verb={verb} className="text-muted-foreground italic">
                {verb}
              </div>
            ))}
          </ByActionList>
        </div>
      </EdgeLabelRenderer>
    </>
  );
}
