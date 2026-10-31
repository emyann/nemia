import { useCallback, useEffect, useMemo, useRef, useState, type RefObject } from 'react';
import { useNavigate } from '@tanstack/react-router';
import {
  applyNodeChanges,
  Background,
  BackgroundVariant,
  Controls,
  getViewportForBounds,
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
import { besideOpen, drawnWhole, forgetLayout, LEAST_ZOOM, place, readLayout, saveLayout } from '../lib/canvas';
import { layout, stepsOf, type Point } from '../lib/layout';
import { useContent } from '../lib/useContent';
import { stepState } from '../lib/status';
import { useBarOver } from '../lib/useBarOver';
import { useCanvasPress } from '../lib/useCanvasPress';
import { CanvasLegend } from './CanvasLegend';
import { StateEdge } from './StateEdge';
import { stepData, stepEdges, stepMinimapFill } from './stepGraph';
import { StepNode, type StepFlowNode } from './StepNode';

type Props = { run: RunDetail };

/** The canvas's node types for React Flow, one object for the module's life. */
const nodeTypes = { step: StepNode };
/** The canvas's edge types for React Flow, one object for the module's life. */
const edgeTypes = { state: StateEdge };

const FIT = { padding: 0.2, maxZoom: 1.25 };

/** The canvas's view, as `useReactFlow` gives it: what a fit reads the nodes from and fits. */
type Flow = ReturnType<typeof useReactFlow<StepFlowNode>>;

/**
 * The node of the step `id` on the canvas of `flow`, as `besideOpen` reads it: its right edge as drawn, in pixels from `left`, the
 * canvas's left edge on the screen, and its width at a zoom of 1. Null when the canvas has no such node.
 */
function stepOf(flow: Flow, id: string, left: number) {
  const node = flow.getInternalNode(id);
  if (!node) return null;
  const width = node.measured.width ?? 0;
  return { right: flow.flowToScreenPosition({ x: node.internals.positionAbsolute.x + width, y: 0 }).x - left, width };
}

/**
 * How the canvas in `frame` is fitted, with the step `open` in the bar, or null: as `FIT`, where the frame's floating bar is not drawn;
 * clear of the bar where it is (`besideOpen`), the whole run or the open step's node alone, at no more than the zoom it is drawn at and
 * only where every node is still drawn whole on the canvas (`drawnWhole`). Null, to leave the view as it is. Takes the canvas's frame,
 * or null; measures the bar where it is drawn, at each call.
 */
function fitBeside(frame: HTMLElement | null, flow: Flow, open: string | null) {
  const bar = document.querySelector('[data-floating-bar]');
  if (!frame || !bar) return FIT;
  const box = frame.getBoundingClientRect();
  const run = flow.getNodesBounds(flow.getNodes());
  const fit = besideOpen(
    frame.clientWidth,
    box.right - bar.getBoundingClientRect().left,
    run.width,
    open ? stepOf(flow, open, box.left) : null,
  );
  if (!fit) return null;
  if (!fit.alone || !open) return { ...FIT, padding: fit.padding };
  const { clientWidth: width, clientHeight: height } = frame;
  const view = getViewportForBounds(flow.getNodesBounds([open]), width, height, LEAST_ZOOM, flow.getZoom(), fit.padding);
  return drawnWhole(run, view, width, height) ? { ...FIT, padding: fit.padding, nodes: [{ id: open }], maxZoom: flow.getZoom() } : null;
}

/**
 * Fits the canvas in `frame` again, with the `fitView` of `flow`, clear of the bar (`fitBeside`): when the frame changes width, as when the
 * window does, and once after each Reset layout's commit (`resets`, its count), the whole run; when the step open in the bar (`open`)
 * changes, as the bar opens, switches or closes, the whole run or that step. A canvas drawn with no step open keeps React Flow's own fit.
 */
function useRefit(frame: RefObject<HTMLDivElement | null>, { open, resets }: { open: string | null; resets: number }, flow: Flow) {
  useEffect(() => {
    const el = frame.current;
    if (!el) return;
    let width = el.clientWidth;
    const observer = new ResizeObserver(() => {
      if (el.clientWidth === width) return;
      width = el.clientWidth;
      void flow.fitView({ ...(fitBeside(el, flow, null) ?? FIT), duration: 200 });
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, [frame, flow]);

  const was = useRef<string | null>(null);
  useEffect(() => {
    if (was.current === open) return;
    was.current = open;
    const fit = fitBeside(frame.current, flow, open);
    if (fit) void flow.fitView({ ...fit, duration: 300 });
  }, [open, frame, flow]);

  const fitted = useRef(0);
  useEffect(() => {
    if (resets === fitted.current) return;
    fitted.current = resets;
    void flow.fitView({ ...(fitBeside(frame.current, flow, null) ?? FIT), duration: 300 });
  }, [resets, frame, flow]);
}

const button =
  'rounded border border-outline bg-card px-2 py-1 text-body-small text-foreground shadow-sm hover:bg-accent disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:bg-card';

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
    return <p className="rounded border border-failure px-3 py-2 text-body-medium text-failure">{computed.message}</p>;
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

/** The room React Flow keeps round a panel over the canvas (`.react-flow__panel`), in pixels: kept from the bar's edge too. */
const PANEL_MARGIN = 15;

/** A drag moving a node, or React Flow measuring one: the only changes the canvas keeps; what is selected is the bar's. */
const placing = (change: NodeChange<StepFlowNode>): change is NodePositionChange | NodeDimensionChange =>
  change.type === 'position' || change.type === 'dimensions';

/**
 * What a press on the canvas of `run` does (`useCanvasPress`): a node shows its step in the frame's bar, or closes it, and a double click
 * opens the step's session. With the step the bar shows (`selected`), none when it shows anything else.
 */
function usePress(run: RunDetail) {
  const navigate = useNavigate();
  const { shown, ...press } = useCanvasPress(
    (step) => ({ kind: 'step', run: run.id, step }),
    (step) => void navigate({ to: '/runs/$runId/steps/$step', params: { runId: run.id, step } }),
  );
  return { selected: shown?.kind === 'step' && shown.run === run.id ? shown.step : null, ...press };
}

/**
 * The canvas's buttons, at its top right and clear of the frame's bar over the canvas in `frame` (`useBarOver`): Reset layout
 * (`onReset`), and Focus running step, which fits the view to the steps `running`, and is off while none is.
 */
function Buttons({ frame, running, onReset }: { frame: RefObject<HTMLElement | null>; running: string[]; onReset: () => void }) {
  const flow = useReactFlow<StepFlowNode>();
  const over = useBarOver(frame);
  const focusRunning = () => void flow.fitView({ nodes: running.map((id) => ({ id })), padding: 0.5, maxZoom: 1.25, duration: 400 });
  return (
    <Panel position="top-right" className="flex gap-2" style={{ marginRight: PANEL_MARGIN + over }}>
      <button type="button" className={button} onClick={onReset}>
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
  );
}

/**
 * The canvas of `RunCanvas`, given the layering it computed.
 *
 * - A node's place and size change only through a drag, a move by the arrow keys or React Flow measuring it, a step the workflow folder
 *   gains or loses while the page is open (placed where it belongs, `place`), and Reset layout. What a node shows is read from the run
 *   on every render, so a refetch moves the chips and leaves the nodes where a person put them. A node moved is saved in this browser.
 * - A press shows a step in the frame's bar, which floats over the page, and a double click opens its session (`usePress`); the step the
 *   bar shows is drawn selected.
 * - Reset layout lays the nodes out again from `after`, forgets the saved arrangement, and fits the view once, after the commit that
 *   moved them. The view is fitted again when the canvas changes width, as when the window does, and as a step opens in the bar, switches
 *   or closes, each time clear of the bar over the canvas: the whole run, or the open step where the run is too wide (`useRefit`).
 * - The legend wraps short of the minimap, drawn smaller than React Flow's own so it covers no node; arrowheads take their edges' colour
 *   in both themes.
 */
function Canvas({ run, computed }: Props & { computed: ReadonlyMap<string, Point> }) {
  const flow = useReactFlow<StepFlowNode>();
  const { selected, ...press } = usePress(run);
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
  const states = useMemo(() => new Map(run.steps.map((s) => [s.name, stepState(s, runCancelled, runHeld)])), [run, runCancelled, runHeld]);

  const nodes = useMemo(() => {
    const indexOf = new Map(run.steps.map((s, i) => [s.name, i]));
    return placed.flatMap((node): StepFlowNode[] => {
      const index = indexOf.get(node.id);
      return index === undefined ? [] : [{ ...node, data: stepData(run, index), selected: node.id === selected }];
    });
  }, [placed, run, selected]);

  const edges = useMemo(() => stepEdges(run), [run]);

  const moved = useRef(false);
  const onNodesChange = useCallback((changes: NodeChange<StepFlowNode>[]) => {
    if (changes.some((c) => c.type === 'position' && !c.dragging)) moved.current = true;
    const kept = changes.filter(placing);
    setPlaced((current) => applyNodeChanges(kept, current));
  }, []);
  useEffect(() => {
    if (!moved.current) return;
    moved.current = false;
    saveLayout(run.id, new Map(placed.map((n) => [n.id, n.position])));
  }, [placed, run.id]);

  const running = run.steps.filter((s) => states.get(s.name) === 'working').map((s) => s.name);

  const [resets, setResets] = useState(0);
  const resetLayout = () => {
    forgetLayout(run.id);
    setPlaced((current) => current.map((n) => ({ ...n, position: computed.get(n.id) ?? n.position })));
    setResets((n) => n + 1);
  };
  const frame = useRef<HTMLDivElement>(null);
  useRefit(frame, { open: selected, resets }, flow);

  return (
    <div ref={frame} className="h-[30rem] overflow-hidden rounded border border-outline-variant">
      <ReactFlow
        nodes={nodes}
        edges={edges}
        nodeTypes={nodeTypes}
        edgeTypes={edgeTypes}
        onNodesChange={onNodesChange}
        {...press}
        nodesConnectable={false}
        elementsSelectable={false}
        edgesFocusable={false}
        deleteKeyCode={null}
        selectionKeyCode={null}
        multiSelectionKeyCode={null}
        colorMode="system"
        defaultMarkerColor={null}
        fitView
        fitViewOptions={FIT}
        minZoom={LEAST_ZOOM}
      >
        <Panel position="top-left" className="text-body-small text-muted-foreground">
          Drag to arrange · kept in this browser
        </Panel>
        <Buttons frame={frame} running={running} onReset={resetLayout} />
        <Background variant={BackgroundVariant.Dots} gap={16} />
        <Controls showInteractive={false} />
        <CanvasLegend className="mr-40 ml-14" />
        <MiniMap<StepFlowNode>
          pannable
          zoomable
          style={{ width: 128, height: 88 }}
          nodeColor={(node) => stepMinimapFill[stepState(node.data.step, runCancelled, runHeld)]}
        />
      </ReactFlow>
    </div>
  );
}
