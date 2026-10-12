import { useCallback, useEffect, useId, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { useQueries, useQuery, type UseQueryResult } from '@tanstack/react-query';
import {
  applyNodeChanges,
  Background,
  BackgroundVariant,
  Controls,
  MiniMap,
  Panel,
  ReactFlow,
  ReactFlowProvider,
  useReactFlow,
  useStoreApi,
  type Edge,
  type Node,
  type NodeChange,
  type NodeDimensionChange,
  type NodePositionChange,
} from '@xyflow/react';
import { useNavigate } from '@tanstack/react-router';
import { routeLink } from '@/components/routeLink';
import { Button, LinkButton } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Switch } from '@/components/ui/switch';
import { ceilingsQuery, inboxQuery, runQuery, type RunDetail, type RunSummary } from '@/lib/api';
import {
  forgetFactoryLayout,
  forgetFactoryOpen,
  forgetFactoryLeftovers,
  readFactoryLayout,
  readFactoryOpen,
  readNarrowFactoryLayout,
  saveFactoryLayout,
  saveFactoryOpen,
} from '@/lib/canvas';
import {
  CARD_WIDTH,
  CELL_HEIGHT,
  CELL_WIDTH,
  floorRuns,
  inFlight,
  keepLayout,
  ONE_CELL,
  openSpan,
  placeRuns,
  readsLines,
  titleOf,
  toDecideOf,
  toggleOpen,
  unfoldingNow,
  waitsOnYou,
  widenLayout,
  type Span,
} from '@/lib/factory';
import { flowSteps, tilesOf } from '@/lib/flow';
import { paint } from '@/lib/meaning';
import { anyInView, boxesOf, revealView, sized, sizeOf, type Box, type Size, type Transform } from '@/lib/frame';
import { queuedIn, type FactoryPlace } from '@/lib/factories';
import { capLine, queueOf } from '@/lib/inbox';
import { passLine, passTitle } from '@/lib/pass';
import { wholeMachine, type Bar } from '@/lib/bar';
import { useBar } from '@/lib/useBar';
import { useBarOver } from '@/lib/useBarOver';
import { useCanvasPress } from '@/lib/useCanvasPress';
import { useContent } from '@/lib/useContent';
import { useFrameSize } from '@/lib/useFrameSize';
import { useNow } from '@/lib/useNow';
import type { Point } from '@/lib/layout';
import { CanvasLegend } from './CanvasLegend';
import { QueueLane } from './QueueLane';
import { RunNode, type RunFlowNode } from './RunNode';
import { StateEdge } from './StateEdge';
import { afterEdges, readEdges } from './stepGraph';

/**
 * Where the cards were left in this browser: the arrangement saved at the cell width, or else the one saved at the narrower width, widened
 * (`widenLayout`).
 */
const savedLayout = (): Map<string, Point> | null => readFactoryLayout() ?? widenLayout(readNarrowFactoryLayout());

/** The floor's node types for React Flow, one object for the module's life. */
const nodeTypes = { run: RunNode };
/** The floor's edge types for React Flow, one object for the module's life. */
const edgeTypes = { state: StateEdge };

/** The room left round the cards when the floor is fitted, beyond what the floor's own panels take (`fitClear`). */
const FIT_GAP = 16;

/**
 * How far the panels drawn over the floor reach into it from its top — the buttons, the hint — and from its bottom — the zoom controls,
 * the legend and the minimap. Takes the floor's frame, or null; measures the panels where they are drawn, at each call, since the legend's
 * height moves with the floor's width. A panel hidden on a narrow floor is drawn nowhere and takes no room.
 */
function panelsOver(frame: HTMLElement | null): { top: number; bottom: number } {
  let top = 0;
  let bottom = 0;
  if (frame) {
    const box = frame.getBoundingClientRect();
    for (const panel of frame.querySelectorAll('.react-flow__panel')) {
      const at = panel.getBoundingClientRect();
      if (!at.height) continue;
      if (panel.classList.contains('top')) top = Math.max(top, at.bottom - box.top);
      if (panel.classList.contains('bottom')) bottom = Math.max(bottom, box.bottom - at.top);
    }
  }
  return { top, bottom };
}

/**
 * How the floor is fitted: every card in view, and none under a panel drawn over the floor (`panelsOver`). Takes the floor's frame, or
 * null, and returns React Flow's fit options, at zoom 1 at most, keeping clear above and below as much as the panels take, plus `FIT_GAP`.
 */
function fitClear(frame: HTMLElement | null) {
  const { top, bottom } = panelsOver(frame);
  return { maxZoom: 1, padding: { top: `${top + FIT_GAP}px`, bottom: `${bottom + FIT_GAP}px`, x: `${2 * FIT_GAP}px` } } as const;
}

/** The box an open card at `at` takes on the floor: the cells it spans, less the gap beside the last, which React Flow may not measure. */
const boxOf = (at: Point, span: Span): Box => ({
  ...at,
  width: span.columns * CELL_WIDTH - (CELL_WIDTH - CARD_WIDTH),
  height: span.rows * CELL_HEIGHT - (CELL_WIDTH - CARD_WIDTH),
});

/** How far out bringing an open card into view zooms, at most: past it, the card is too small to read, and a person pans instead. */
const REVEAL_MIN_ZOOM = 0.4;

/** The view that brings `box` into the floor's `frame` from `transform`, clear of the panels at the frame's top (`revealView`). */
const revealIn = (frame: HTMLElement, box: Box, transform: Transform) =>
  revealView(box, transform, sizeOf(frame), REVEAL_MIN_ZOOM, panelsOver(frame).top + FIT_GAP);

/** A handful of cells fits on a screen; past that, the minimap says where the rest are. */
const HANDFUL = 5;

/**
 * A card's colour on the minimap, in the look's meanings: yours when to decide or waiting on you, else sage once finished, else
 * alive. A run whose
 * result nobody has decided, and one stopped at a step that needs a person, are both over, and both still want finding.
 */
const minimapFill = (node: RunFlowNode) =>
  toDecideOf(node.data.run) ? paint.yours : waitsOnYou(node.data.run) ? paint.yours : node.data.finished ? paint.sage : paint.alive;

/**
 * Every run in flight of `factory`, given as `runs`, a card each, on a floor a person can arrange, each with its steps as a small
 * flowchart on it (`StepRail`). A run started `--after` runs is drawn with an edge from each of their cards into its own (`afterEdges`),
 * and a finished run a run in flight waits on is on the floor for it (`floorRuns`); cards joined so are laid out layered, parents left
 * of children.
 *
 * Laid out on a grid, oldest first, the first time a run is seen in this browser — so a run that starts takes the next free cell and
 * moves no card already down — and after that wherever a person dragged it, until "Reset layout". A card's chevron opens it: the card
 * grows to the right over as many cells as its steps' tiles need (`openSpan`), and the cards in them move aside (`placeRuns`) — when it
 * opens, by its chevron or brought back onto the floor open, and then only (`unfoldingNow`). Otherwise each card moves alone, as in a
 * factory modeller: a drop moves nothing else — a card dropped over another stays over it, since that is where the person put it. The
 * edges between cards stretch to follow; they pull nothing. A click on a card shows the run in the frame's bar, a double click opens its
 * page, and a press on a step's tile shows that step in the bar (`useFloorPress`). Which runs are open is kept in this browser with the
 * layout.
 *
 * The inbox's queued cards of `factory` (`queuedIn`) wait at the floor's left edge, as ghosts, in the order the tick starts them
 * (`QueueLane`), and the header says the run slots taken of the cap the daemon runs with (`CapLine`), said to be this machine's, not the
 * factory's; the daemon and the quota are the frame's bottom bar's (`FrameFooter`). The cap is read again as the runs are, on each run's
 * event of the workflow feed; the queue every 5 s, since the feed carries no card's events: the daemon starts a card when a run slot frees,
 * and nothing on the board asks it to.
 *
 * What the page puts `above` the floor, its template among them, takes its height from the floor's, which fills the rest of the frame.
 */
export function FactoryCanvas({ runs, factory, above }: { runs: readonly RunSummary[]; factory: FactoryPlace; above?: ReactNode }) {
  return (
    <div className="flex h-[calc(100svh-5rem)] min-h-96 flex-col">
      {above}
      <ReactFlowProvider>
        <Floor runs={runs} factory={factory} />
      </ReactFlowProvider>
    </div>
  );
}

/**
 * A card as the floor keeps it: where it is and how big React Flow measured it. What it shows is filled in on every render, from the runs
 * and the open runs' reads.
 */
type PlacedCard = Node<Record<string, never>, 'run'>;
const nodeOf = (id: string, position: Point): PlacedCard => ({ id, type: 'run', position, data: {} });

/** What a card is told of an open run's read: its record once read, or why it could not be. */
type Read = { detail: RunDetail | null; trouble: string | null };
const NOT_READ: Read = { detail: null, trouble: null };
const readsOf = (results: UseQueryResult<RunDetail>[]): Read[] =>
  results.map(({ data, error }) => ({ detail: data ?? null, trouble: error ? `Could not read its steps: ${error.message}` : null }));

/** The floor's header counts: the runs in flight (`flying` of `runs`), finished, to decide and waiting on you. */
function FloorCounts({ runs, flying }: { runs: readonly RunSummary[]; flying: number }) {
  const finished = runs.length - flying;
  const waiting = runs.filter(waitsOnYou).length;
  const toDecide = runs.filter((run) => toDecideOf(run) !== null).length;
  return (
    <p className="text-sm text-muted-foreground">
      <span className="font-medium text-foreground">{flying}</span> in flight
      {finished > 0 && ` · ${finished} finished`}
      {toDecide > 0 && <span className="text-yours"> · {toDecide} to decide</span>}
      {waiting > 0 && ` · ${waiting} waiting on you`}
    </p>
  );
}

/**
 * A drag moving a card, or React Flow measuring one: the only changes the floor takes, since it adds, removes and selects no card itself.
 */
const placing = (change: NodeChange<RunFlowNode>): change is NodePositionChange | NodeDimensionChange =>
  change.type === 'position' || change.type === 'dimensions';

/**
 * The factory's floor and its header, for `FactoryCanvas`: the runs shown (`floorRuns`), each a card placed by `placeRuns`.
 *
 * - A refetch that moves a status moves no card: what lays the cards out is kept by its content (`useContent`).
 * - Only a run open on the floor reads its detail, again on each of its events on the feed (`runQuery`): each tile's attempt and cost,
 *   which the bar reads for itself. A closed card reads the list, and so does an open card's flowchart.
 * - The cards' positions change only through a drag or React Flow measuring a card, a run joining or leaving the floor, a card opening   or
 *   closing, and Reset layout. The open cards claim their cells first, the one opened last first; a card on the floor stays put unless   an
 *   opening card covers it, and one coming back takes its saved cell. A card moved is saved in this browser (`keepLayout`), where a   card
 *   off the floor keeps its place and a run the store no longer lists does not; nor is such a run kept open.
 * - On mount it forgets what this browser keeps for the Factory that nothing reads (`forgetFactoryLeftovers`).
 * - A card opened is brought into view once the floor is laid out for it, and the run the bar shows, or a step of, is brought into view as
 *   the bar shows it and kept in view whenever the floor's frame changes size, across or down (`useFrameSize`): panned to its middle, if
 *   any of it is off screen, and zoomed out only as far as it must be, to `REVEAL_MIN_ZOOM` at most (`revealView`); a card taller than the
 *   frame even then shows its head, below the panels at the frame's top. Its box is the cells it takes (`openSpan`, `boxOf`).
 * - The floor is fitted once per ask, never before the cards asked for are on it: first on mount, unanimated, in place of React Flow's
 *   own fit so it keeps clear of the panels too (`fitClear`); then on Fit view, Reset layout, Show finished, and whenever the queue lane
 *   comes or goes; and when the frame changes size with no run inspected and leaves no card in view (`anyInView`).
 * - No view is aimed at a frame without a size (`sized`), nor a reveal at one with no room below its panels: a reveal or a fit asked   for
 *   while the frame is hidden or squeezed flat waits until it has a size.
 * - Reset layout lays the cards on the grid again with every run closed and the saved arrangement forgotten; Collapse all closes every
 *   card and leaves the cards they moved aside where they went. The effect that keeps the open runs is their one writer.
 * - The header counts runs in flight, finished, to decide as the CLI's `ls` says them, and waiting on you. A run waiting on you, or to
 *   decide,   is counted finished too, and stays on the floor whatever Show finished says (`floorRuns`); a run at its ending's gate is in
 *   both.   Beside the counts it draws the cap (`CapLine`), and at its right the floor's options (`FloorOptions`).
 * - The floor fills the screen between the root's header and its bottom bar, its frame narrowed by what the bar covers of it
 *   (`useBarOver`), so the card inspected and every panel over the floor stay clear of the bar. The queue lane sits at its left, and gives
 *   its room to the floor while the bar shows a run, a step, or what is the whole machine's: its gauges or the runs waiting on you. The
 *   floor's buttons wrap to a narrow floor, its hint shows only where the floor is wide enough beside them, and the legend wraps short of
 *   the minimap when there is one; arrowheads take their edges' colour in both themes.
 * - A click on a card, or Enter on the card itself, shows the run in the bar or closes it; a click or Enter on a link or a button in it
 *   does only what that does (`useFloorPress`).
 */
function Floor({ runs, factory }: { runs: readonly RunSummary[]; factory: FactoryPlace }) {
  const { fitView, setViewport } = useReactFlow<RunFlowNode>();
  const store = useStoreApi<RunFlowNode>();
  const [showFinished, setShowFinished] = useState(false);

  const flying = useMemo(() => new Set(runs.filter(inFlight).map((run) => run.id)), [runs]);
  const shown = useMemo(() => floorRuns(runs, showFinished), [runs, showFinished]);
  const known = useMemo(() => new Set(runs.map((run) => run.id)), [runs]);
  const ids = useContent(shown.map((run) => run.id));
  const afterEntries = useContent(shown.map((run): [string, string[]] => [run.id, run.after]));
  const after = useMemo(() => new Map(afterEntries), [afterEntries]);

  const [open, setOpen] = useState<string[]>(readFactoryOpen);
  const openSet = useMemo(() => new Set(open), [open]);
  const { inspecting, inspected, step: barStep, onStep, machine, ...press } = useFloorPress();

  const opened = useMemo(() => open.filter((id) => ids.includes(id)), [open, ids]);
  const reads = useQueries({ queries: opened.map((id) => runQuery(id)), combine: readsOf });
  const details = useMemo(() => new Map(opened.map((id, i) => [id, reads[i] ?? NOT_READ])), [opened, reads]);

  const spanEntries = useContent(
    [...opened].reverse().map((id): [string, Span] => {
      const run = shown.find((one) => one.id === id)!;
      return [
        id,
        openSpan(
          tilesOf(
            run.steps.map((step) => step.name),
            run.graph,
            flowSteps(run),
            run.cancelledAt !== null,
          ),
        ),
      ];
    }),
  );
  const spans = useMemo(() => new Map(spanEntries), [spanEntries]);

  const [placed, setPlaced] = useState<PlacedCard[]>(() => {
    const at = placeRuns(ids, new Map(), savedLayout(), spans, after, new Set());
    return ids.map((id) => nodeOf(id, at.get(id)!));
  });
  const [placedFor, setPlacedFor] = useState<{ ids: string[]; spans: ReadonlyMap<string, Span> } | null>(null);

  const drawn = useRef(new Set(opened));

  const moved = useRef(false);

  useEffect(() => {
    const { unfolding, drawn: now } = unfoldingNow(drawn.current, spans);
    drawn.current = now;
    setPlaced((current) => {
      const have = new Map(current.map((node) => [node.id, node]));
      const onFloor = new Map(current.map((node) => [node.id, node.position]));
      const at = placeRuns(ids, onFloor, savedLayout(), spans, after, unfolding);
      const next = ids.map((id) => {
        const node = have.get(id);
        const point = at.get(id)!;
        if (!node) return nodeOf(id, point);
        return node.position.x === point.x && node.position.y === point.y ? node : { ...node, position: point };
      });
      if (next.some((node) => have.has(node.id) && node !== have.get(node.id))) moved.current = true;
      return next.length === current.length && next.every((node, i) => node === current[i]) ? current : next;
    });
    setPlacedFor({ ids, spans });
  }, [ids, spans, after]);

  useEffect(() => {
    if (!moved.current) return;
    moved.current = false;
    saveFactoryLayout(keepLayout(savedLayout(), new Map(placed.map((node) => [node.id, node.position])), known));
  }, [placed, known]);

  useEffect(() => {
    const kept = open.filter((id) => known.has(id));
    if (kept.length) saveFactoryOpen(kept);
    else forgetFactoryOpen();
  }, [open, known]);

  useEffect(() => forgetFactoryLeftovers(), []);

  const frame = useRef<HTMLDivElement>(null);
  const whole = useRef<HTMLDivElement>(null);
  const over = useBarOver(whole);
  const latest = useRef({ open, placed, spans, inspecting });
  useLayoutEffect(() => {
    latest.current = { open, placed, spans, inspecting };
  });

  const onNodesChange = useCallback((changes: NodeChange<RunFlowNode>[]) => {
    if (changes.some((change) => change.type === 'position' && !change.dragging)) moved.current = true;
    const kept = changes.filter(placing);
    setPlaced((current) => applyNodeChanges(kept, current));
  }, []);

  const revealing = useRef<string | null>(null);
  const toggle = useCallback((runId: string) => {
    if (!latest.current.open.includes(runId)) drawn.current.delete(runId);
    setOpen((current) => toggleOpen(current, runId));
    revealing.current = runId;
  }, []);

  const nodes = useMemo(() => {
    const byId = new Map(shown.map((run) => [run.id, run]));
    return placed.flatMap((card): RunFlowNode[] => {
      const run = byId.get(card.id);
      if (!run) return [];
      const isOpen = openSet.has(run.id);
      const read = isOpen ? details.get(run.id) : undefined;
      return [
        {
          ...card,
          ariaLabel: `Inspect run: ${titleOf(run)}`,
          data: {
            run,
            finished: !flying.has(run.id),
            reads: readsLines(run, runs),
            open: isOpen,
            detail: read?.detail ?? null,
            trouble: read?.trouble ?? null,
            inspected: inspected === run.id,
            selected: barStep?.run === run.id ? barStep.step : null,
            onToggle: toggle,
            onStep,
          },
        },
      ];
    });
  }, [placed, shown, runs, flying, openSet, details, inspected, barStep, toggle, onStep]);

  const [hovered, setHovered] = useState<string | null>(null);
  const focus = hovered ?? inspected;
  const edges = useMemo((): Edge[] => [...afterEdges(shown), ...readEdges(shown, focus)], [shown, focus]);
  const onNodeMouseEnter = useCallback((_: unknown, node: RunFlowNode) => setHovered(node.id), []);
  const onNodeMouseLeave = useCallback(() => setHovered(null), []);

  const onFloor = shown.length > 0;
  const size = useFrameSize(frame, onFloor);

  const reveal = useCallback(
    (runId: string) => {
      const { placed, spans } = latest.current;
      const card = placed.find((node) => node.id === runId);
      if (!card || !frame.current) return;
      const to = revealIn(frame.current, boxOf(card.position, spans.get(runId) ?? ONE_CELL), store.getState().transform);
      if (to) void setViewport(to, { duration: 300 });
    },
    [setViewport, store],
  );

  const was = useRef<Size | null>(null);
  useEffect(() => {
    const { inspecting } = latest.current;
    if (!sized(size)) {
      if (inspecting) revealing.current = inspecting;
      return;
    }
    const before = was.current;
    was.current = size;
    if (!before || (size.width === before.width && size.height === before.height) || revealing.current) return;
    if (inspecting) return reveal(inspecting);
    const { nodeLookup, transform } = store.getState();
    if (!anyInView(boxesOf(nodeLookup.values()), transform, size)) void fitView({ ...fitClear(frame.current), duration: 300 });
  }, [size, reveal, store, fitView]);

  useEffect(() => {
    const runId = revealing.current;
    if (!runId || placedFor?.ids !== ids || placedFor.spans !== spans || !sized(size)) return;
    revealing.current = null;
    if (openSet.has(runId) && spans.has(runId)) reveal(runId);
  }, [placedFor, ids, spans, openSet, reveal, size]);

  const [fits, setFits] = useState(1);
  const fitted = useRef(0);
  useEffect(() => {
    if (fits === fitted.current || !sized(size)) return;
    if (placed.length !== ids.length || placed.some((node, i) => node.id !== ids[i])) return;
    const first = fitted.current === 0;
    fitted.current = fits;
    void fitView({ ...fitClear(frame.current), duration: first ? 0 : 300 });
  }, [fits, placed, ids, fitView, size]);

  useEffect(() => {
    if (inspecting && was.current) reveal(inspecting);
  }, [inspecting, reveal]);

  const resetLayout = () => {
    forgetFactoryLayout();
    setOpen([]);
    const at = placeRuns(ids, new Map(), null, new Map(), after);
    setPlaced((current) => current.map((node) => ({ ...node, position: at.get(node.id) ?? node.position })));
    setFits((n) => n + 1);
  };
  const collapseAll = () => setOpen([]);
  const toggleFinished = (on: boolean) => {
    setShowFinished(on);
    setFits((n) => n + 1);
  };
  const queue = useQuery({ ...inboxQuery, refetchInterval: 5_000 });
  const queued = queue.data ? queueOf(queuedIn(queue.data, factory)) : [];
  const laned = queued.length > 0 && !machine;
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

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 border-b px-4 py-2">
        <div className="flex flex-wrap items-baseline gap-x-4 gap-y-1">
          <FloorCounts runs={runs} flying={flying.size} />
          <CapLine queued={queued.length} queueError={queue.error} />
        </div>
        <FloorOptions factory={factory} showFinished={showFinished} onShowFinished={toggleFinished} />
      </div>

      <div className="flex min-h-0 flex-1 flex-col md:flex-row">
        {laned && !inspecting && <QueueLane cards={queued} />}
        {shown.length ? (
          <div ref={whole} className="flex min-h-0 min-w-0 flex-1">
            <div ref={frame} className="@container min-h-0 min-w-0 flex-1" style={{ marginRight: over }}>
              <ReactFlow
                nodes={nodes}
                edges={edges}
                nodeTypes={nodeTypes}
                edgeTypes={edgeTypes}
                onNodesChange={onNodesChange}
                onNodeMouseEnter={onNodeMouseEnter}
                onNodeMouseLeave={onNodeMouseLeave}
                {...press}
                nodesConnectable={false}
                elementsSelectable={false}
                edgesFocusable={false}
                deleteKeyCode={null}
                selectionKeyCode={null}
                multiSelectionKeyCode={null}
                colorMode="system"
                defaultMarkerColor={null}
                minZoom={0.2}
              >
                <Panel position="top-left" className="hidden text-[11px] text-muted-foreground @4xl:block">
                  Click a run to inspect it · double-click to open its page · drag a card, and it moves alone · kept in this browser
                </Panel>
                <Panel position="top-right" className="flex flex-wrap justify-end gap-2">
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
                <CanvasLegend cards className={cells > HANDFUL ? 'mr-40 ml-12' : 'mr-4 ml-12'} />
                {cells > HANDFUL && <MiniMap<RunFlowNode> pannable zoomable style={{ width: 128, height: 88 }} nodeColor={minimapFill} />}
              </ReactFlow>
            </div>
          </div>
        ) : (
          <Empty anyRuns={runs.length > 0} queued={queued.length} />
        )}
      </div>
    </div>
  );
}

/**
 * What a press on the floor does (`useCanvasPress`): a card shows its run in the frame's bar, or closes it, and a double click opens the
 * run's page; a step's tile shows that step, or closes it (`onStep`). With the run whose card or step the bar shows (`inspecting`), the run
 * it shows (`inspected`) and the step (`step`), each none while it shows anything else; and whether it shows what is the whole machine's
 * (`machine`): its gauges or the runs waiting on you.
 */
function useFloorPress() {
  const navigate = useNavigate();
  const { shown, ...press } = useCanvasPress(runBar, (runId) => void navigate({ to: '/runs/$runId', params: { runId } }));
  const { open, toggle } = useBar();
  const onStep = useCallback((run: string, step: string) => toggle({ kind: 'step', run, step }), [toggle]);
  return {
    machine: wholeMachine(open),
    inspecting: shown?.kind === 'run' || shown?.kind === 'step' ? shown.run : null,
    inspected: shown?.kind === 'run' ? shown.run : null,
    step: shown?.kind === 'step' ? shown : null,
    onStep,
    ...press,
  };
}

/** The bar a run's card shows: the run's. */
const runBar = (run: string): Bar => ({ kind: 'run', run });

/**
 * The cap on runs in flight, as the daemon's last pass ran with it (`capLine`): `2 of 4 run slots taken · 3 queued`, or `no cap`. Its count
 * is the cap's — a run with a task filed and not settled, or started with something due — which a run waiting on runs, on the floor, is
 * not; the difference is said on hover. Then what that pass cost, `a pass takes 212 ms`, text with the pass's breakdown on hover
 * (`passTitle`), once a pass has written it, its time of day said as today's or another day's against a clock read each minute (`useNow`).
 * Nothing until the cap is read; why, when it or the queue cannot be.
 */
function CapLine({ queued, queueError }: { queued: number; queueError: Error | null }) {
  const { data, error } = useQuery(ceilingsQuery);
  const now = new Date(useNow(60_000));
  if (error || queueError) {
    return (
      <p data-cap-error className="max-w-md truncate text-xs text-failure" title={(error ?? queueError)!.message}>
        {error ? 'The cap on runs in flight' : 'The queue'} could not be read: {(error ?? queueError)!.message}
      </p>
    );
  }
  if (!data) return null;
  const by = data.last
    ? `as the daemon's last pass ran with it (WF_MAX_RUNS=${data.last.runs}, WF_MAX_CONCURRENT=${data.last.sessions})`
    : "as the api's environment sets it: no pass of the daemon has written its own";
  const title =
    data.cap > 0
      ? `Runs in flight against the cap, ${by}. A run takes a slot while a task of it is filed and not settled, or, once started, while it has something due; a run waiting on runs, which the floor counts in flight, takes none until it starts. ${data.held.length ? `Held for a slot: ${data.held.map((h) => h.run).join(', ')}.` : ''}`
      : `No cap on runs in flight, ${by}: every run is filed as soon as it is ready.`;
  return (
    <p data-cap={data.cap} title={title.trim()} className="border-l pl-4 text-sm text-muted-foreground">
      {capLine(data, queued)}
      {data.pass && (
        <span data-pass={Math.round(data.pass.ms)} title={passTitle(data.pass, now)}>
          {' · '}
          {passLine(data.pass)}
        </span>
      )}
    </p>
  );
}

/** A button that is a link to a route: React Aria's link in the button's look, given the router's `to` and its preloading. */
const RouterLinkButton = routeLink(LinkButton);

/**
 * The floor's options, at the header's right: the Show finished switch, named by a label beside it, and, but on the default factory, which
 * has no file to keep settings in, a link to the factory's settings.
 */
function FloorOptions(props: { factory: FactoryPlace; showFinished: boolean; onShowFinished: (on: boolean) => void }) {
  const finishedSwitch = useId();
  return (
    <div className="flex items-center gap-4 text-sm">
      <div className="flex items-center gap-2">
        <Switch id={finishedSwitch} isSelected={props.showFinished} onChange={props.onShowFinished} />
        <label htmlFor={finishedSwitch} className="cursor-pointer">
          Show finished
        </label>
      </div>
      {!props.factory.default && (
        <RouterLinkButton
          to="/factories/$factory/settings"
          params={{ factory: props.factory.name }}
          variant="outline"
          size="sm"
          data-factory-settings-link
        >
          Settings
        </RouterLinkButton>
      )}
    </div>
  );
}

/** Nothing on the floor: say so, where the runs are, and that the queue beside it starts on its own. */
function Empty({ anyRuns, queued }: { anyRuns: boolean; queued: number }) {
  return (
    <div className="flex flex-1 items-center justify-center p-6">
      <Card className="w-full max-w-sm">
        <CardHeader>
          <CardTitle>Nothing in flight</CardTitle>
          <CardDescription>
            {anyRuns
              ? 'Every run has finished. Show finished runs above, or read them on Runs.'
              : 'No runs yet. Start one from a workflow, on Workflows.'}
            {queued > 0 && (
              <>
                {' '}
                {queued === 1
                  ? 'The card queued beside it starts on its own'
                  : `The ${queued} cards queued beside it start on their own`}{' '}
                while a daemon ticks the store: the api, <code>npm start</code> in apps/api.
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
