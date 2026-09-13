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
  type NodeChange,
} from '@xyflow/react';
import type { RunDetail } from '../lib/api';
import { forgetLayout, place, readLayout, saveLayout } from '../lib/canvas';
import { layout, type Point } from '../lib/layout';
import { stepState } from '../lib/status';
import { stepData, stepEdges, stepMinimapFill } from './stepGraph';
import { StepNode, type StepFlowNode } from './StepNode';

type Props = { run: RunDetail; selected: string | null; onSelect: (step: string | null) => void };

// Declared once: a new object per render makes React Flow warn and mount every node afresh.
const nodeTypes = { step: StepNode };

const FIT = { padding: 0.2, maxZoom: 1.25 };

const button =
  'rounded border border-neutral-300 bg-white px-2 py-1 text-xs text-neutral-700 shadow-sm hover:bg-neutral-100 disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:bg-white dark:border-neutral-700 dark:bg-neutral-900 dark:text-neutral-300 dark:hover:bg-neutral-800 dark:disabled:hover:bg-neutral-900';

/**
 * The run as the DAG it is: a node per step, an edge per `after`.
 *
 * Laid out from `after` the first time the run is seen in this browser; after that, wherever a
 * person dragged the nodes, kept per run until "Reset layout" lays it out again.
 */
export function RunCanvas(props: Props) {
  const { steps } = props.run;
  // The layering reads names and `after` only, so a refetch that moves a status does not redo it.
  const shape = JSON.stringify(steps.map((s) => [s.name, s.spec?.after ?? []]));
  const computed = useMemo(() => {
    try {
      return layout(steps.map((s) => ({ name: s.name, after: s.spec?.after ?? [] })));
    } catch (err) {
      return err instanceof Error ? err : new Error(String(err));
    }
  }, [shape]);

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

const nodeAt = (run: RunDetail, index: number, position: Point): StepFlowNode => ({
  id: run.steps[index]!.name,
  type: 'step',
  position,
  // The graph reads left to right: an edge leaves a step on its right and arrives on the left.
  sourcePosition: Position.Right,
  targetPosition: Position.Left,
  data: stepData(run, index),
});

function Canvas({ run, selected, onSelect, computed }: Props & { computed: ReadonlyMap<string, Point> }) {
  const { fitView } = useReactFlow<StepFlowNode>();
  const runCancelled = run.cancelledAt !== null;
  const names = run.steps.map((s) => s.name);

  // Where each node is and how big React Flow measured it, changed only through `onNodesChange`.
  // What a node shows is not kept here: it is read from the run on every render below, so a
  // refetch moves the chips and leaves the nodes where a person put them.
  const [placed, setPlaced] = useState<StepFlowNode[]>(() => {
    const at = place(names, computed, readLayout(run.id));
    return names.map((name, i) => nodeAt(run, i, at.get(name)!));
  });

  // Steps the workflow folder gained or lost while the page was open: add them where they belong.
  const namesKey = JSON.stringify(names);
  useEffect(() => {
    setPlaced((current) => {
      const have = new Map(current.map((n) => [n.id, n]));
      const at = place(names, computed, readLayout(run.id));
      const next = names.map((name, i) => have.get(name) ?? nodeAt(run, i, at.get(name)!));
      return next.length === current.length && next.every((n, i) => n === current[i]) ? current : next;
    });
  }, [namesKey]);

  const states = useMemo(() => new Map(run.steps.map((s) => [s.name, stepState(s.status, runCancelled)])), [run, runCancelled]);

  const nodes = useMemo(() => {
    const indexOf = new Map(run.steps.map((s, i) => [s.name, i]));
    return placed.flatMap((node) => {
      const index = indexOf.get(node.id);
      return index === undefined ? [] : [{ ...node, data: stepData(run, index), selected: node.id === selected }];
    });
  }, [placed, run, selected]);

  const edges = useMemo(() => stepEdges(run), [run]);

  // Set when a person has moved a node — a drag, or the arrow keys — and cleared once it is saved.
  const moved = useRef(false);
  const onNodesChange = useCallback(
    (changes: NodeChange<StepFlowNode>[]) => {
      // A click or a key picks the step to inspect. The page owns the panel, so it owns which step
      // is selected: selection is handed up, not applied here.
      const picked = changes.find((c) => c.type === 'select' && c.selected);
      if (picked?.type === 'select') onSelect(picked.id);
      if (changes.some((c) => c.type === 'position' && !c.dragging)) moved.current = true;
      setPlaced((current) => applyNodeChanges(changes.filter((c) => c.type !== 'select' && c.type !== 'remove'), current));
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

  // Laid out again from `after`, and the saved arrangement forgotten, so the next visit agrees.
  const [resets, setResets] = useState(0);
  const resetLayout = () => {
    forgetLayout(run.id);
    setPlaced((current) => current.map((n) => ({ ...n, position: computed.get(n.id) ?? n.position })));
    setResets((n) => n + 1);
  };
  // Fitted after the commit that moved the nodes, once React Flow has them where they now are; and
  // once per reset, not on every render after one.
  const fitted = useRef(0);
  useEffect(() => {
    if (resets === fitted.current) return;
    fitted.current = resets;
    void fitView({ ...FIT, duration: 300 });
  }, [resets, fitView]);

  // Fitted again when the canvas changes width — the step panel opening beside it, mostly — or the
  // nodes fitted to the wider canvas are left hanging off its edge.
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
        onNodesChange={onNodesChange}
        onPaneClick={() => onSelect(null)}
        nodesConnectable={false}
        selectNodesOnDrag={false}
        edgesFocusable={false}
        deleteKeyCode={null}
        selectionKeyCode={null}
        multiSelectionKeyCode={null}
        colorMode="system"
        // Null, so arrowheads take `--xy-edge-stroke` like their edges instead of one grey for both themes.
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
        <Legend />
        {/* Smaller than React Flow's 200 × 150, which covers a node on a canvas this size. */}
        <MiniMap<StepFlowNode>
          pannable
          zoomable
          style={{ width: 128, height: 88 }}
          nodeColor={(node) => stepMinimapFill[stepState(node.data.step.status, runCancelled)]}
        />
      </ReactFlow>
    </div>
  );
}

/** Beside the zoom controls: what the drawing means. */
function Legend() {
  return (
    <Panel
      position="bottom-left"
      className="ml-14 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-neutral-500 dark:text-neutral-400"
    >
      <span className="flex items-center gap-1">
        <span className="size-2.5 animate-spin rounded-full border-2 border-sky-500 border-t-transparent" />
        running
      </span>
      <span className="flex items-center gap-1">
        <span className="size-2.5 rounded-sm border-2 border-amber-500" />
        human gate
      </span>
      <span className="flex items-center gap-1">
        <svg width="18" height="6" aria-hidden className="stroke-neutral-400 dark:stroke-neutral-600">
          <line x1="0" y1="3" x2="18" y2="3" strokeWidth="1.5" />
        </svg>
        done
      </span>
      <span className="flex items-center gap-1">
        <svg width="18" height="6" aria-hidden className="stroke-neutral-400 dark:stroke-neutral-600">
          <line x1="0" y1="3" x2="18" y2="3" strokeWidth="1.5" strokeDasharray="4 3" />
        </svg>
        to come
      </span>
    </Panel>
  );
}
