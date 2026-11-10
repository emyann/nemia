import { useMemo, useRef } from 'react';
import { Background, BackgroundVariant, MarkerType, ReactFlow } from '@xyflow/react';
import type { MachineGraph } from '../../lib/api/steps.ts';
import { FLOOR_BOX } from '../../lib/classes';
import { drawMachine, type Drawing } from '../../lib/machine';
import { useFrameSize } from '../../lib/useFrameSize';
import { MachineEdge, type MachineFlowEdge } from './MachineEdge';
import { MachineNode, type MachineFlowNode } from './MachineNode';

/** The canvas's node types for React Flow, one object for the module's life. */
const nodeTypes = { state: MachineNode };
/** The canvas's edge types for React Flow, one object for the module's life. */
const edgeTypes = { route: MachineEdge };
/** No route taken: one array for the module's life. */
const NONE: readonly string[] = [];

/**
 * The drawing's states and routes as React Flow's nodes and edges, `lit` and `taken` marked on them.
 *
 * A state carries the size its layout gave it as the node's own `width` and `height`, never in its `style` alone: React Flow draws a node
 * whose size it does not know `visibility: hidden` until it has measured the box, and it forgets what it measured every time these nodes
 * are built again, as the lit state moves.
 */
export function flowOf(drawing: Drawing, lit: string | undefined, taken: readonly string[]) {
  const nodes: MachineFlowNode[] = drawing.states.map((box) => ({
    id: box.id,
    type: 'state',
    position: { x: box.x, y: box.y },
    data: { ...box, lit: box.id === lit },
    width: box.width,
    height: box.height,
    draggable: false,
    selectable: false,
  }));
  const edges: MachineFlowEdge[] = drawing.routes.map((route) => {
    const on = taken.includes(route.id);
    const color = on ? 'var(--edge-taken)' : 'var(--edge-done)';
    return {
      id: route.id,
      type: 'route',
      source: route.from,
      target: route.to,
      data: { ...route, taken: on },
      markerEnd: {
        type: route.dashed ? MarkerType.Arrow : MarkerType.ArrowClosed,
        color,
        width: 18,
        height: 18,
        markerUnits: 'userSpaceOnUse',
      },
      selectable: false,
      focusable: false,
    };
  });
  return { nodes, edges, width: drawing.width, height: drawing.height };
}

/**
 * A state machine drawn from its graph (`drawMachine`): a box per state, a route per pair of states an edge or a person's verb joins,
 * every edge listed by action on its route or, back to its own state, on the state's box, and every verb on each route it takes. A route
 * only a verb takes is dashed, its arrowhead open; one an edge takes is solid, its arrowhead filled.
 *
 * Laid out, never arranged: nothing moves, joins or zooms, and the wheel scrolls the page past it. It is drawn at its own size, or
 * smaller to fit a narrower frame, or one lower than `maxHeight`, which is as tall as the drawing then is; its flow has an id of its own,
 * `id` or else the machine's `name`, which scopes its arrowheads' ids on a page that draws several; `title` is what a person calls the
 * machine, which names the drawing.
 *
 * `lit` names the state a task's path stands in, and `taken` the routes it took there (`from->to`): drawn over the graph, lit in amber.
 * Nothing on it takes a press or the focus.
 */
export function MachineCanvas({
  machine,
  name,
  title,
  id,
  lit,
  taken = NONE,
  maxHeight = Infinity,
}: {
  machine: MachineGraph;
  name: string;
  title: string;
  id?: string;
  lit?: string;
  taken?: readonly string[];
  maxHeight?: number;
}) {
  const frame = useRef<HTMLDivElement>(null);
  const frameWidth = useFrameSize(frame, true).width;
  const drawing = useMemo(() => drawMachine(machine), [machine]);
  const drawn = useMemo(() => flowOf(drawing, lit, taken), [drawing, lit, taken]);
  const zoom = frameWidth ? Math.min(1, frameWidth / drawn.width, maxHeight / drawn.height) : 1;

  return (
    <div
      ref={frame}
      aria-label={`${title} as a graph`}
      data-machine={name}
      className={FLOOR_BOX}
      style={{ height: Math.ceil(drawn.height * zoom) + 2 }}
    >
      {frameWidth > 0 && (
        <ReactFlow
          id={id ?? `machine-${name}`}
          nodes={drawn.nodes}
          edges={drawn.edges}
          nodeTypes={nodeTypes}
          edgeTypes={edgeTypes}
          viewport={{ x: Math.max(0, (frameWidth - drawn.width * zoom) / 2), y: 0, zoom }}
          minZoom={0.1}
          nodesDraggable={false}
          nodesConnectable={false}
          elementsSelectable={false}
          edgesFocusable={false}
          nodesFocusable={false}
          panOnDrag={false}
          panOnScroll={false}
          zoomOnScroll={false}
          zoomOnPinch={false}
          zoomOnDoubleClick={false}
          preventScrolling={false}
          deleteKeyCode={null}
          colorMode="system"
          defaultMarkerColor={null}
        >
          <Background variant={BackgroundVariant.Dots} gap={16} />
        </ReactFlow>
      )}
    </div>
  );
}
