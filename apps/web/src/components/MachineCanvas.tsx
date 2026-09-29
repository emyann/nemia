import { useMemo, useState } from 'react';
import { Background, BackgroundVariant, MarkerType, ReactFlow } from '@xyflow/react';
import type { MachineGraph } from '../lib/api';
import { drawMachine } from '../lib/machine';
import { MachineEdge, type MachineFlowEdge } from './MachineEdge';
import { MachineNode, type MachineFlowNode } from './MachineNode';

/** The canvas's node types for React Flow, one object for the module's life. */
const nodeTypes = { state: MachineNode };
/** The canvas's edge types for React Flow, one object for the module's life. */
const edgeTypes = { route: MachineEdge };

/**
 * A state machine drawn from its graph (`drawMachine`): a box per state, an edge per pair of states an edge joins, every edge listed by
 * action on its route or, back to its own state, on the state's box.
 *
 * Laid out, never arranged: nothing moves, joins or zooms, and the wheel scrolls the page past it. It is drawn at its own size, or
 * smaller to fit a narrower frame, which is as tall as the drawing then is; its flow has an id of its own, which scopes its arrowheads'
 * ids on a page that draws several.
 */
export function MachineCanvas({ machine }: { machine: MachineGraph }) {
  const [frameWidth, setFrameWidth] = useState(0);
  const drawn = useMemo(() => {
    const drawing = drawMachine(machine);
    const nodes: MachineFlowNode[] = drawing.states.map((box) => ({
      id: box.id,
      type: 'state',
      position: { x: box.x, y: box.y },
      data: box,
      style: { width: box.width, height: box.height },
      draggable: false,
      selectable: false,
    }));
    const edges: MachineFlowEdge[] = drawing.routes.map((route) => ({
      id: route.id,
      type: 'route',
      source: route.from,
      target: route.to,
      data: route,
      markerEnd: { type: MarkerType.ArrowClosed, color: 'var(--edge-done)', width: 18, height: 18, markerUnits: 'userSpaceOnUse' },
      selectable: false,
      focusable: false,
    }));
    return { nodes, edges, width: drawing.width, height: drawing.height };
  }, [machine]);
  const zoom = frameWidth ? Math.min(1, frameWidth / drawn.width) : 1;

  return (
    <div
      ref={(el) => {
        if (!el) return;
        const observer = new ResizeObserver(() => setFrameWidth(el.clientWidth));
        observer.observe(el);
        return () => observer.disconnect();
      }}
      aria-label={`${machine.title} as a graph`}
      data-machine={machine.name}
      className="overflow-hidden rounded border border-neutral-200 dark:border-neutral-800"
      style={{ height: Math.ceil(drawn.height * zoom) + 2 }}
    >
      {frameWidth > 0 && (
        <ReactFlow
          id={`machine-${machine.name}`}
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
