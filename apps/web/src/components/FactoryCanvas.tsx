import { useCallback, useEffect, useId, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { useQueries, useQuery } from '@tanstack/react-query';
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
  useStoreApi,
  type Edge,
  type NodeChange,
} from '@xyflow/react';
import { Button, LinkButton } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Switch } from '@/components/ui/switch';
import { routeLink } from '@/components/routeLink';
import { ceilingsQuery, inboxQuery, runQuery, type RunDetail, type RunSummary } from '@/lib/api';
import { forgetFactoryLayout, forgetFactoryOpen, readFactoryLayout, readFactoryOpen, saveFactoryLayout, saveFactoryOpen } from '@/lib/canvas';
import {
  CARD_WIDTH,
  CELL_HEIGHT,
  CELL_WIDTH,
  floorRuns,
  graphAt,
  inFlight,
  keepLayout,
  movedOpen,
  ONE_CELL,
  placeRuns,
  spanOf,
  titleOf,
  toggleOpen,
  waitsOnYou,
  type Span,
} from '@/lib/factory';
import { capLine, queueOf } from '@/lib/inbox';
import { extentOf, layout, stepsOf, type Point } from '@/lib/layout';
import { stepState } from '@/lib/status';
import { CanvasLegend } from './CanvasLegend';
import { QueueLane } from './QueueLane';
import { RunNode, type RunFlowNode } from './RunNode';
import { StateEdge } from './StateEdge';
import { StepInspector } from './StepInspector';
import { StepNode, type StepFlowNode } from './StepNode';
import { afterEdges, cardEdges, stepData, stepEdges, stepMinimapFill } from './stepGraph';

// Declared once: a new object per render makes React Flow warn and mount every node afresh.
const nodeTypes = { run: RunNode, step: StepNode };
const edgeTypes = { state: StateEdge };

type FloorNode = RunFlowNode | StepFlowNode;

const FIT = { padding: 0.15, maxZoom: 1 };

/** A handful of cells fits on a screen; past that, the minimap says where the rest are. */
const HANDFUL = 5;

/**
 * The minimap in the cards' terms — waiting on you, still going, or finished — and a step in its chip's colour.
 * Waiting on you before finished: a run stopped at a step that needs a person is over, and still wants finding.
 */
const minimapFill = (node: FloorNode) =>
  node.type === 'step'
    ? stepMinimapFill[stepState(node.data.step.status, node.data.runCancelled)]
    : waitsOnYou(node.data.run)
      ? 'var(--color-amber-500)'
      : node.data.finished
        ? 'var(--color-neutral-400)'
        : 'var(--color-sky-500)';

/** A step's node on the floor, named by its run too: two runs may each have an `implement`. */
const stepId = (runId: string, step: string) => `${runId}/${step}`;

/** Where an open run's steps go beside its card, from their names and the `after` edges of its graph alone; or why they cannot. */
type Unfolded = { at: Map<string, Point>; span: Span } | { error: string };

function unfold(names: readonly string[], edges: RunDetail['graph']['edges']): Unfolded {
  try {
    const at = layout(stepsOf(names, edges));
    return { at: graphAt(at), span: spanOf(extentOf(at)) };
  } catch (err) {
    return { error: err instanceof Error ? err.message : String(err) };
  }
}

/** An open run's graph: null while its steps are read; the run as last read, unfolded; or why it cannot be drawn. */
type Graph = null | { error: string } | ({ run: RunDetail } & Exclude<Unfolded, { error: string }>);

/**
 * Every run in flight, a card each, on a floor a person can arrange — and beside each card a person
 * opens, that run's steps, drawn as its page draws them. A run started `--after` runs is drawn with an
 * edge from each of their cards into its own (`afterEdges`), and a finished run a run in flight waits on
 * is on the floor for it (`floorRuns`); cards joined so are laid out layered, parents left of children.
 *
 * Laid out on a grid, oldest first, the first time a run is seen in this browser — so a run that
 * starts takes the next free cell and moves no card already down — and after that wherever a person
 * dragged it, until "Reset layout". A click on a card, or Enter on one, opens it: its graph unfolds to
 * the right over as many cells as it needs, and the cards in them move aside (`placeRuns`) — when it opens,
 * and when a card is dropped where a person dragged it. The steps
 * are the card's children in React Flow, placed relative to it, so they move with it when it is
 * dragged. A click on a step opens its inspector beside the floor. Which runs are open is kept in this
 * browser with the layout.
 *
 * The inbox's queued cards wait at the floor's left edge, as ghosts, in the order the tick starts them (`QueueLane`), and the header says the
 * run slots taken of the cap the daemon runs with (`CapLine`). Both are read again every 5 s, as the runs are: the daemon starts a card
 * when a run slot frees, and nothing on the board asks it to.
 */
export function FactoryCanvas({ runs }: { runs: readonly RunSummary[] }) {
  return (
    <ReactFlowProvider>
      <Floor runs={runs} />
    </ReactFlowProvider>
  );
}

const nodeOf = (run: RunSummary, position: Point): RunFlowNode => ({
  id: run.id,
  type: 'run',
  position,
  // What a card shows is filled in on every render, from the runs and their graphs.
  data: { run, finished: false, open: false, reading: false, trouble: null, onToggle: () => {} },
});

function Floor({ runs }: { runs: readonly RunSummary[] }) {
  const { fitView } = useReactFlow<FloorNode>();
  const store = useStoreApi<FloorNode>();
  const [showFinished, setShowFinished] = useState(false);

  const flying = useMemo(() => new Set(runs.filter(inFlight).map((run) => run.id)), [runs]);
  const shown = useMemo(() => floorRuns(runs, showFinished), [runs, showFinished]);
  // Each card's runs it waits on: what lays the cards joined by an edge out layered.
  const after = useMemo(() => new Map(shown.map((run) => [run.id, run.after])), [shown]);
  const known = useMemo(() => new Set(runs.map((run) => run.id)), [runs]);
  const ids = shown.map((run) => run.id);
  const idsKey = JSON.stringify(ids);

  // The runs whose graphs are unfolded, in the order they were opened; kept in this browser.
  const [open, setOpen] = useState<string[]>(readFactoryOpen);
  const openSet = useMemo(() => new Set(open), [open]);
  // The step whose inspector is open.
  const [selected, setSelected] = useState<{ runId: string; step: string } | null>(null);

  // Only a run open on the floor reads its detail, again every 5 s (`runQuery`); a closed card reads the list.
  const reading = useMemo(() => open.filter((id) => ids.includes(id)), [open, idsKey]);
  const reads = useQueries({ queries: reading.map((id) => runQuery(id)) });

  // The layering reads names and the graph's edges only, so a refetch that moves a status does not redo it.
  const shapes = reading.map((id, i) => {
    const data = reads[i]?.data;
    return [id, data ? { names: data.steps.map((s) => s.name), edges: data.graph.edges } : null] as const;
  });
  const shapesKey = JSON.stringify(shapes);
  const unfolded = useMemo(() => new Map(shapes.map(([id, shape]) => [id, shape && unfold(shape.names, shape.edges)])), [shapesKey]);

  const readsKey = JSON.stringify(reads.map((read) => [read.dataUpdatedAt, read.errorUpdatedAt]));
  const graphs = useMemo(
    () =>
      new Map<string, Graph>(
        reading.map((id, i) => {
          const { data, error } = reads[i]!;
          const shape = unfolded.get(id);
          if (data && shape) return [id, 'error' in shape ? shape : { run: data, ...shape }];
          return [id, error ? { error: `Could not read its steps: ${error.message}` } : null];
        }),
      ),
    [reading, readsKey, unfolded],
  );

  // The cells each drawn graph takes, the run opened last first: the order `placeRuns` claims cells in.
  const spansKey = JSON.stringify(
    [...reading].reverse().flatMap((id) => {
      const graph = graphs.get(id);
      return graph && 'span' in graph ? [[id, graph.span]] : [];
    }),
  );
  const spans = useMemo(() => new Map<string, Span>(JSON.parse(spansKey)), [spansKey]);

  // Where each card is and how big React Flow measured it, changed only through `onNodesChange`, a run
  // joining or leaving the floor or opening or closing, and a reset. What a card shows is read below.
  const [placed, setPlaced] = useState<RunFlowNode[]>(() => {
    const at = placeRuns(ids, new Map(), readFactoryLayout(), new Map(), after);
    return shown.map((run) => nodeOf(run, at.get(run.id)!));
  });
  // Cards a person has dropped where they dragged them: the floor is laid out again on each drop, so a
  // card left under a graph moves then, and not on whatever changes the floor next.
  const [drops, setDrops] = useState(0);
  // Which runs, graphs and drops `placed` was last laid out for: whatever reads the cards' positions waits for it.
  const layoutKey = `${idsKey} ${spansKey} ${drops}`;
  const [placedFor, setPlacedFor] = useState('');

  // Set when a card has moved — dragged, or moved aside by a graph — and cleared once the arrangement is saved.
  const moved = useRef(false);

  // Runs that started, finished, were asked for, opened, closed or dropped since: every card where it belongs.
  useEffect(() => {
    setPlaced((current) => {
      const have = new Map(current.map((node) => [node.id, node]));
      // Cards on the floor stay put, unless a graph now covers them; one coming back yields its old cell.
      const at = placeRuns(ids, new Map(current.map((node) => [node.id, node.position])), readFactoryLayout(), spans, after);
      const next = shown.map((run) => {
        const node = have.get(run.id);
        const point = at.get(run.id)!;
        if (!node) return nodeOf(run, point);
        return node.position.x === point.x && node.position.y === point.y ? node : { ...node, position: point };
      });
      // A card a graph moved aside is kept where it went, so the next visit lays out the same floor.
      if (next.some((node) => have.has(node.id) && node !== have.get(node.id))) moved.current = true;
      return next.length === current.length && next.every((node, i) => node === current[i]) ? current : next;
    });
    setPlacedFor(layoutKey);
  }, [layoutKey]);

  useEffect(() => {
    if (!moved.current) return;
    moved.current = false;
    // A card off the floor now keeps where it was left; a run the store no longer lists does not.
    saveFactoryLayout(keepLayout(readFactoryLayout(), new Map(placed.map((node) => [node.id, node.position])), known));
  }, [placed, known]);

  useEffect(() => {
    // A run the store no longer lists is not kept open.
    const kept = open.filter((id) => known.has(id));
    if (kept.length) saveFactoryOpen(kept);
    else forgetFactoryOpen();
  }, [open]);

  // How big React Flow measured each step. The step nodes are made afresh on every render, and one handed
  // back without its size is measured again, its edges undrawn until it is.
  const [sizes, setSizes] = useState<ReadonlyMap<string, { width: number; height: number }>>(() => new Map());

  const onNodesChange = useCallback((changes: NodeChange<FloorNode>[]) => {
    const dropped = changes.flatMap((change) => (change.type === 'position' && !change.dragging ? [change.id] : []));
    if (dropped.length) {
      moved.current = true;
      // An open run dropped claims its cells first, as one opened last does, so what it lands on moves aside
      // and not the card a person just put down; a closed card dropped on a graph takes a free cell.
      setOpen((current) => dropped.reduce(movedOpen, current));
      setDrops((n) => n + 1);
    }
    // Only cards are kept here, and a change to a step matches none of them.
    const kept = changes.filter((change) => change.type !== 'select' && change.type !== 'remove') as NodeChange<RunFlowNode>[];
    setPlaced((current) => applyNodeChanges(kept, current));
    const measured = changes.flatMap((change) => (change.type === 'dimensions' && change.dimensions ? [[change.id, change.dimensions] as const] : []));
    if (measured.length) setSizes((current) => new Map([...current, ...measured]));
  }, []);

  // A click opens or closes a run. The run just opened is brought into view once its graph is on the floor.
  const [revealing, setRevealing] = useState<string | null>(null);
  const toggle = useCallback((runId: string) => {
    setOpen((current) => toggleOpen(current, runId));
    setSelected((current) => (current?.runId === runId ? null : current));
    setRevealing(runId);
  }, []);

  const nodes = useMemo(() => {
    const byId = new Map(shown.map((run) => [run.id, run]));
    return placed.flatMap((card): FloorNode[] => {
      const run = byId.get(card.id);
      if (!run) return [];
      const isOpen = openSet.has(run.id);
      const graph = isOpen ? graphs.get(run.id) : undefined;
      const head: RunFlowNode = {
        ...card,
        ariaLabel: `${isOpen ? 'Hide' : 'Show'} the steps of run: ${titleOf(run)}`,
        data: { run, finished: !flying.has(run.id), open: isOpen, reading: graph === null, trouble: graph && 'error' in graph ? graph.error : null, onToggle: toggle },
      };
      if (!graph || !('run' in graph)) return [head];
      // After their card: React Flow places a child from its parent, so the parent comes first.
      return [
        head,
        ...graph.run.steps.map(
          (step, index): StepFlowNode => ({
            id: stepId(run.id, step.name),
            type: 'step',
            parentId: run.id,
            position: graph.at.get(step.name)!,
            measured: sizes.get(stepId(run.id, step.name)),
            // Laid out by the layering, so the cells the run takes stay what `spanOf` says; the card is what moves.
            draggable: false,
            sourcePosition: Position.Right,
            targetPosition: Position.Left,
            ariaLabel: `Inspect step ${step.name} of run: ${titleOf(run)}`,
            data: stepData(graph.run, index),
            selected: selected?.runId === run.id && selected.step === step.name,
          }),
        ),
      ];
    });
  }, [placed, shown, flying, openSet, graphs, sizes, selected, toggle]);

  const edges = useMemo(
    (): Edge[] => [
      // Between the cards: from each run a card waits on, into it.
      ...afterEdges(shown),
      ...[...graphs].flatMap(([runId, graph]): Edge[] =>
        graph && 'run' in graph
          ? [
              // The card is the run's head: one edge into each of the roots the api's graph names, and no other.
              ...cardEdges(graph.run, runId, `${runId}/`),
              ...stepEdges(graph.run, `${runId}/`),
            ]
          : [],
      ),
    ],
    [graphs, shown],
  );

  // What the observers and the reveal read, as of the last commit.
  const frame = useRef<HTMLDivElement>(null);
  const latest = useRef({ placed, graphs, inspecting: selected?.runId ?? null });
  useLayoutEffect(() => {
    latest.current = { placed, graphs, inspecting: selected?.runId ?? null };
  });

  /** An open run's card and graph brought into view, if any of it is off the floor's screen: panned, and zoomed out only as far as it must be. */
  const reveal = useCallback(
    (runId: string) => {
      const { placed, graphs } = latest.current;
      const card = placed.find((node) => node.id === runId);
      const graph = graphs.get(runId);
      const el = frame.current;
      if (!card || !graph || !('run' in graph) || !el) return;
      const [tx, ty, zoom] = store.getState().transform;
      const { x, y } = card.position;
      const right = x + graph.span.columns * CELL_WIDTH - (CELL_WIDTH - CARD_WIDTH);
      const bottom = y + graph.span.rows * CELL_HEIGHT;
      if (x * zoom + tx >= 0 && y * zoom + ty >= 0 && right * zoom + tx <= el.clientWidth && bottom * zoom + ty <= el.clientHeight) return;
      const nodes = [{ id: runId }, ...graph.run.steps.map((step) => ({ id: stepId(runId, step.name) }))];
      void fitView({ nodes, padding: 0.1, maxZoom: zoom, duration: 300 });
    },
    [fitView, store],
  );

  useEffect(() => {
    if (!revealing || placedFor !== layoutKey) return;
    // Closed again, or not on the floor: nothing to show.
    if (!openSet.has(revealing) || !graphs.has(revealing)) {
      setRevealing(null);
      return;
    }
    // Its steps are still being read.
    if (graphs.get(revealing) === null) return;
    setRevealing(null);
    reveal(revealing);
  }, [revealing, placedFor, layoutKey, openSet, graphs, reveal]);

  // Fitted once per ask, and not before the cards asked for are on the floor, or it fits the floor
  // they are about to join.
  const [fits, setFits] = useState(0);
  const fitted = useRef(0);
  useEffect(() => {
    if (fits === fitted.current) return;
    if (placed.length !== ids.length || placed.some((node, i) => node.id !== ids[i])) return;
    fitted.current = fits;
    void fitView({ ...FIT, duration: 300 });
  }, [fits, placed, idsKey, fitView]);

  // Runs left open on the last visit unfold once their steps are read, and the floor is fitted again then, once.
  const restoring = useRef(reading.length > 0);
  useEffect(() => {
    if (!restoring.current || placedFor !== layoutKey || [...graphs.values()].includes(null)) return;
    restoring.current = false;
    setFits((n) => n + 1);
  }, [placedFor, layoutKey, graphs]);

  // The floor narrows when a step's inspector opens beside it: the run inspected is kept in view.
  const onFloor = shown.length > 0;
  useEffect(() => {
    const el = frame.current;
    if (!el) return;
    let width = el.clientWidth;
    const observer = new ResizeObserver(() => {
      if (el.clientWidth === width) return;
      width = el.clientWidth;
      if (latest.current.inspecting) reveal(latest.current.inspecting);
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, [onFloor, reveal]);

  /** A card opens or closes; a step opens its inspector. */
  const activate = (node: FloorNode) => {
    if (node.type === 'step') setSelected({ runId: node.parentId!, step: node.data.step.name });
    else toggle(node.id);
  };
  const close = useCallback(() => setSelected(null), []);

  // Laid out on the grid again with every run closed, and the saved arrangement forgotten, so the next visit
  // agrees. The open runs are forgotten by the effect that keeps them, their one writer.
  const resetLayout = () => {
    forgetFactoryLayout();
    setOpen([]);
    setSelected(null);
    const at = placeRuns(ids, new Map(), null, new Map(), after);
    setPlaced((current) => current.map((node) => ({ ...node, position: at.get(node.id) ?? node.position })));
    setFits((n) => n + 1);
  };
  // Every graph folded away. The cards they moved aside stay where they went.
  const collapseAll = () => {
    setOpen([]);
    setSelected(null);
  };
  const finishedSwitch = useId();
  const toggleFinished = (on: boolean) => {
    setShowFinished(on);
    setFits((n) => n + 1);
  };
  const finished = runs.length - flying.size;
  // Said beside the counts: a run stopped at a step that needs a person is finished, so off the floor by default — and so is one
  // waiting on a run that never ships without a person.
  const waiting = runs.filter(waitsOnYou).length;
  const queue = useQuery({ ...inboxQuery, refetchInterval: 5_000 });
  const queued = queue.data ? queueOf(queue.data) : [];
  // The lane beside the floor comes or goes with the first card queued or the last one started: the floor is fitted again to its new width.
  const laned = queued.length > 0;
  const wasLaned = useRef(laned);
  useEffect(() => {
    if (wasLaned.current === laned) return;
    wasLaned.current = laned;
    setFits((n) => n + 1);
  }, [laned]);
  const cells = placed.reduce((sum, node) => {
    const { columns, rows } = spans.get(node.id) ?? ONE_CELL;
    return sum + columns * rows;
  }, 0);

  // A step the folder has lost since it was clicked is off the floor, and its panel goes with it.
  const inspectedGraph = selected ? graphs.get(selected.runId) : undefined;
  const inspectedRun = inspectedGraph && 'run' in inspectedGraph ? inspectedGraph.run : null;
  const inspected = inspectedRun?.steps.find((step) => step.name === selected?.step);

  return (
    // The height left under the root's `h-12` header, so the floor fills the screen and no more.
    <div className="flex h-[calc(100svh-3rem)] min-h-96 flex-col">
      <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 border-b px-4 py-2">
        <div className="flex flex-wrap items-baseline gap-x-4 gap-y-1">
          <p className="text-sm text-muted-foreground">
            <span className="font-medium text-foreground">{flying.size}</span> in flight
            {finished > 0 && ` · ${finished} finished`}
            {waiting > 0 && ` · ${waiting} waiting on you`}
          </p>
          <CapLine queued={queued.length} queueError={queue.error} />
        </div>
        {/* The aria switch is a label of its own, round its input, so its words are a label beside it that names that input. */}
        <div className="flex items-center gap-2 text-sm">
          <Switch id={finishedSwitch} isSelected={showFinished} onChange={toggleFinished} />
          <label htmlFor={finishedSwitch} className="cursor-pointer">
            Show finished
          </label>
        </div>
      </div>

      <div className="flex min-h-0 flex-1 flex-col md:flex-row">
        {/* Off while a step's inspector is open beside the floor, which the two together would leave too narrow to read: the header still counts the queue. */}
        {laned && !(inspectedRun && inspected) && <QueueLane cards={queued} />}
        {shown.length ? (
          <div className="flex min-h-0 min-w-0 flex-1 flex-col md:flex-row">
            <div ref={frame} className="@container min-h-0 min-w-0 flex-1">
              <ReactFlow
                nodes={nodes}
                edges={edges}
                nodeTypes={nodeTypes}
                edgeTypes={edgeTypes}
                onNodesChange={onNodesChange}
                onNodeClick={(event, node) => {
                  // The title's link and the chevron do what they do, and no more.
                  if (node.type === 'run' && (event.target as Element).closest('a, button')) return;
                  activate(node);
                }}
                onPaneClick={close}
                onKeyDown={(event) => {
                  if (event.key !== 'Enter') return;
                  // On a card or a step itself: Enter on the title's link or the chevron is theirs.
                  const target = event.target as HTMLElement;
                  if (!target.classList.contains('react-flow__node')) return;
                  const node = nodes.find((candidate) => candidate.id === target.dataset.id);
                  if (node) activate(node);
                }}
                nodesConnectable={false}
                elementsSelectable={false}
                edgesFocusable={false}
                deleteKeyCode={null}
                selectionKeyCode={null}
                multiSelectionKeyCode={null}
                colorMode="system"
                // Null, so arrowheads take `--xy-edge-stroke` like their edges instead of one grey for both themes.
                defaultMarkerColor={null}
                minZoom={0.2}
                fitView
                fitViewOptions={FIT}
              >
                {/* Only where the floor is wide enough for it beside the buttons: a step's inspector narrows it. */}
                <Panel position="top-left" className="hidden text-[11px] text-muted-foreground @2xl:block">
                  Click a run for its steps · drag to arrange · kept in this browser
                </Panel>
                <Panel position="top-right" className="flex gap-2">
                  <Button variant="outline" size="sm" onPress={resetLayout}>
                    Reset layout
                  </Button>
                  <Button variant="outline" size="sm" onPress={collapseAll} isDisabled={!open.length}>
                    Collapse all
                  </Button>
                  <Button variant="outline" size="sm" onPress={() => setFits((n) => n + 1)}>
                    Fit view
                  </Button>
                </Panel>
                <Background variant={BackgroundVariant.Dots} gap={16} />
                <Controls showInteractive={false} showFitView={false} />
                {/* Wrapped short of the minimap, when there is one. */}
                <CanvasLegend cards className={cells > HANDFUL ? 'mr-40 ml-12' : 'mr-4 ml-12'} />
                {cells > HANDFUL && <MiniMap<FloorNode> pannable zoomable style={{ width: 128, height: 88 }} nodeColor={minimapFill} />}
              </ReactFlow>
            </div>
            {inspectedRun && inspected && (
              <StepInspector
                run={inspectedRun}
                step={inspected}
                runTitle={titleOf(inspectedRun)}
                onClose={close}
                className="h-80 shrink-0 rounded-none border-0 border-t md:h-auto md:border-t-0 md:border-l"
              />
            )}
          </div>
        ) : (
          <Empty anyRuns={runs.length > 0} queued={queued.length} />
        )}
      </div>
    </div>
  );
}

/**
 * The cap on runs in flight, as the daemon's last pass ran with it (`capLine`): `2 of 4 run slots taken · 3 queued`, or `no cap`. Its count is the
 * cap's — a run with a task filed and not settled, or started with something due — which a run waiting on runs, on the floor, is not; the
 * difference is said on hover. Nothing until the cap is read; why, when it cannot be.
 */
function CapLine({ queued, queueError }: { queued: number; queueError: Error | null }) {
  const { data, error } = useQuery(ceilingsQuery);
  if (error || queueError) {
    return (
      <p data-cap-error className="max-w-md truncate text-xs text-red-600 dark:text-red-400" title={(error ?? queueError)!.message}>
        {error ? 'The cap on runs in flight' : 'The queue'} could not be read: {(error ?? queueError)!.message}
      </p>
    );
  }
  if (!data) return null;
  const by = data.last
    ? `as the daemon's last pass ran with it (WF_MAX_RUNS=${data.last.runs}, WF_MAX_CONCURRENT=${data.last.sessions})`
    : "as the api's environment sets it: no pass of the daemon has written its own";
  const title = data.cap > 0
    ? `Runs in flight against the cap, ${by}. A run takes a slot while a task of it is filed and not settled, or, once started, while it has something due; a run waiting on runs, which the floor counts in flight, takes none until it starts. ${data.held.length ? `Held for a slot: ${data.held.map((h) => h.run).join(', ')}.` : ''}`
    : `No cap on runs in flight, ${by}: every run is filed as soon as it is ready.`;
  return (
    <p data-cap={data.cap} title={title.trim()} className="border-l pl-4 text-sm text-muted-foreground">
      {capLine(data, queued)}
    </p>
  );
}

/** A button that is a link to a route: React Aria's link in the button's look, given the router's `to` and its preloading. */
const RouterLinkButton = routeLink(LinkButton);

/** Nothing on the floor: say so, where the runs are, and that the queue beside it starts on its own. */
function Empty({ anyRuns, queued }: { anyRuns: boolean; queued: number }) {
  return (
    <div className="flex flex-1 items-center justify-center p-6">
      <Card className="w-full max-w-sm">
        <CardHeader>
          <CardTitle>Nothing in flight</CardTitle>
          <CardDescription>
            {anyRuns ? (
              'Every run has finished. Show finished runs above, or read them on Runs.'
            ) : (
              <>
                No runs yet. Start one with <code>npx wf start</code>.
              </>
            )}
            {queued > 0 && (
              <>
                {' '}
                {queued === 1 ? 'The card queued beside it starts on its own' : `The ${queued} cards queued beside it start on their own`} while{' '}
                <code>npx wf up</code> runs.
              </>
            )}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <RouterLinkButton to="/runs" variant="outline" size="sm">
            Go to Runs
          </RouterLinkButton>
        </CardContent>
      </Card>
    </div>
  );
}
