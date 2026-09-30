import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  applyNodeChanges,
  Background,
  BackgroundVariant,
  Controls,
  MiniMap,
  Panel,
  Position,
  ReactFlow,
  ReactFlowProvider,
  useReactFlow,
  type Node,
  type NodeChange,
  type NodeDimensionChange,
  type NodePositionChange,
} from '@xyflow/react';
import type { RunDetail } from '../lib/api';
import { forgetLayout, place, readLayout, saveLayout } from '../lib/canvas';
import { layout, stepsOf, type Point } from '../lib/layout';
import { useContent } from '../lib/useContent';
import { stepState } from '../lib/status';
import { CanvasLegend } from './CanvasLegend';
import { StateEdge } from './StateEdge';
import { stepData, stepEdges, stepMinimapFill } from './stepGraph';
import { StepNode, type StepFlowNode } from './StepNode';

type Props = { run: RunDetail; selected: string | null; onSelect: (step: string | null) => void };

/** The canvas's node types for React Flow, one object for the module's life. */
const nodeTypes = { step: StepNode };
/** The canvas's edge types for React Flow, one object for the module's life. */
const edgeTypes = { state: StateEdge };

const FIT = { padding: 0.2, maxZoom: 1.25 };

const button =
  'rounded border border-neutral-300 bg-white px-2 py-1 text-xs text-neutral-700 shadow-sm hover:bg-neutral-100 disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:bg-white dark:border-neutral-700 dark:bg-neutral-900 dark:text-neutral-300 dark:hover:bg-neutral-800 dark:disabled:hover:bg-neutral-900';

/**
 * The run as the graph it froze: a node per step, an edge per `after`, and the edge back that `loop:` makes — as the api's
 * `graph` has them, never worked out here from a step's spec.
 *
 * Laid out from the `after` edges the first time the run is seen in this browser; after that, wherever a
 * person dragged the nodes, kept per run until "Reset layout" lays it out again. The layering reads the steps' names and the graph's
 * edges only, so a refetch that moves a status does not redo it; a graph that cannot be laid out is said in place of the canvas.
 */
export function RunCanvas(props: Props) {
  const names = useContent(props.run.steps.map((s) => s.name));
  const edges = useContent(props.run.graph.edges);
  const computed = useMemo(() => {
    try {
      return layout(stepsOf(names, edges));
    } catch (err) {
      return err instanceof Error ? err : new Error(String(err));
    }
  }, [names, edges]);

  if (computed instanceof Error) {
    return (
      <p className="rounded border border-red-300 px-3 py-2 text-sm text-red-700 dark:border-red-900 dark:text-red-400">
        {computed.message}
      </p>
    );
  }
  return (
    <ReactFlowProvider>
      <Canvas {...props} computed={computed} />
    </ReactFlowProvider>
  );
}

/** A node as the canvas keeps it: where it is and how big React Flow measured it. What it shows is read from the run on every render. */
type PlacedStep = Node<Record<string, never>, 'step'>;
/** The node of the step `name` at `position`: its edges leave it on its right and arrive on its left, so the graph reads left to right. */
const nodeAt = (name: string, position: Point): PlacedStep => ({
  id: name,
  type: 'step',
  position,
  sourcePosition: Position.Right,
  targetPosition: Position.Left,
  data: {},
});

/** A drag moving a node, or React Flow measuring one: the only changes the canvas keeps; a selection is handed up to the page. */
const placing = (change: NodeChange<StepFlowNode>): change is NodePositionChange | NodeDimensionChange =>
  change.type === 'position' || change.type === 'dimensions';

/**
 * The canvas of `RunCanvas`, given the layering it computed.
 *
 * - A node's place and size change only through a drag, a move by the arrow keys or React Flow measuring it, a step the workflow folder
 *   gains or loses while the page is open (placed where it belongs, `place`), and Reset layout. What a node shows is read from the run
 *   on every render, so a refetch moves the chips and leaves the nodes where a person put them. A node moved is saved in this browser.
 * - A click or a key that selects a step hands it up (`onSelect`), and a click on the pane hands up none: the page owns the panel, so it
 *   owns which step is selected.
 * - Reset layout lays the nodes out again from `after`, forgets the saved arrangement, and fits the view once, after the commit that
 *   moved them. The view is fitted again when the canvas changes width, as when the step panel opens beside it.
 * - The legend wraps short of the minimap, drawn smaller than React Flow's own so it covers no node; arrowheads take their edges' colour
 *   in both themes.
 */
function Canvas({ run, selected, onSelect, computed }: Props & { computed: ReadonlyMap<string, Point> }) {
  const { fitView } = useReactFlow<StepFlowNode>();
  const runCancelled = run.cancelledAt !== null;
  const names = useContent(run.steps.map((s) => s.name));

  const [placed, setPlaced] = useState<PlacedStep[]>(() => {
    const at = place(names, computed, readLayout(run.id));
    return names.map((name) => nodeAt(name, at.get(name)!));
  });

  useEffect(() => {
    // oxlint-disable-next-line react/set-state-in-effect -- a drag writes the nodes too: the steps are merged into them after the commit
    setPlaced((current) => {
      const have = new Map(current.map((n) => [n.id, n]));
      const at = place(names, computed, readLayout(run.id));
      const next = names.map((name) => have.get(name) ?? nodeAt(name, at.get(name)!));
      return next.length === current.length && next.every((n, i) => n === current[i]) ? current : next;
    });
  }, [names, computed, run.id]);

  const runHeld = run.holding != null;
  const states = useMemo(
    () => new Map(run.steps.map((s) => [s.name, stepState(s.status, runCancelled, runHeld)])),
    [run, runCancelled, runHeld],
  );

  const nodes = useMemo(() => {
    const indexOf = new Map(run.steps.map((s, i) => [s.name, i]));
    return placed.flatMap((node): StepFlowNode[] => {
      const index = indexOf.get(node.id);
      return index === undefined ? [] : [{ ...node, data: stepData(run, index), selected: node.id === selected }];
    });
  }, [placed, run, selected]);

  const edges = useMemo(() => stepEdges(run), [run]);

  const moved = useRef(false);
  const onNodesChange = useCallback(
    (changes: NodeChange<StepFlowNode>[]) => {
      const picked = changes.find((c) => c.type === 'select' && c.selected);
      if (picked?.type === 'select') onSelect(picked.id);
      if (changes.some((c) => c.type === 'position' && !c.dragging)) moved.current = true;
      const kept = changes.filter(placing);
      setPlaced((current) => applyNodeChanges(kept, current));
    },
    [onSelect],
  );
  useEffect(() => {
    if (!moved.current) return;
    moved.current = false;
    saveLayout(run.id, new Map(placed.map((n) => [n.id, n.position])));
  }, [placed, run.id]);

  const running = run.steps.filter((s) => states.get(s.name) === 'working').map((s) => s.name);
  const focusRunning = () => void fitView({ nodes: running.map((id) => ({ id })), padding: 0.5, maxZoom: 1.25, duration: 400 });

  const [resets, setResets] = useState(0);
  const resetLayout = () => {
    forgetLayout(run.id);
    setPlaced((current) => current.map((n) => ({ ...n, position: computed.get(n.id) ?? n.position })));
    setResets((n) => n + 1);
  };
  const fitted = useRef(0);
  useEffect(() => {
    if (resets === fitted.current) return;
    fitted.current = resets;
    void fitView({ ...FIT, duration: 300 });
  }, [resets, fitView]);

  const frame = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = frame.current;
    if (!el) return;
    let width = el.clientWidth;
    const observer = new ResizeObserver(() => {
      if (el.clientWidth === width) return;
      width = el.clientWidth;
      void fitView({ ...FIT, duration: 200 });
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, [fitView]);

  return (
    <div ref={frame} className="h-[30rem] overflow-hidden rounded border border-neutral-200 dark:border-neutral-800">
      <ReactFlow
        nodes={nodes}
        edges={edges}
        nodeTypes={nodeTypes}
        edgeTypes={edgeTypes}
        onNodesChange={onNodesChange}
        onPaneClick={() => onSelect(null)}
        nodesConnectable={false}
        selectNodesOnDrag={false}
        edgesFocusable={false}
        deleteKeyCode={null}
        selectionKeyCode={null}
        multiSelectionKeyCode={null}
        colorMode="system"
        defaultMarkerColor={null}
        fitView
        fitViewOptions={FIT}
      >
        <Panel position="top-left" className="text-[11px] text-neutral-500">
          Drag to arrange · kept in this browser
        </Panel>
        <Panel position="top-right" className="flex gap-2">
          <button type="button" className={button} onClick={resetLayout}>
            Reset layout
          </button>
          <button
            type="button"
            className={button}
            onClick={focusRunning}
            disabled={!running.length}
            title={running.length ? undefined : 'No step is running'}
          >
            Focus running step
          </button>
        </Panel>
        <Background variant={BackgroundVariant.Dots} gap={16} />
        <Controls showInteractive={false} />
        <CanvasLegend className="mr-40 ml-14" />
        <MiniMap<StepFlowNode>
          pannable
          zoomable
          style={{ width: 128, height: 88 }}
          nodeColor={(node) => stepMinimapFill[stepState(node.data.step.status, runCancelled, runHeld)]}
        />
      </ReactFlow>
    </div>
  );
}
