import { useCallback, useEffect, useId, useLayoutEffect, useMemo, useRef, useState } from 'react';
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
import { routeLink } from '@/components/routeLink';
import { Button, LinkButton } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Switch } from '@/components/ui/switch';
import { DaemonLine } from '@/components/DaemonLine';
import { QuotaLine } from '@/components/QuotaLine';
import { ceilingsQuery, daemonQuery, inboxQuery, quotaQuery, runQuery, type RunDetail, type RunSummary } from '@/lib/api';
import {
  forgetFactoryLayout,
  forgetFactoryOpen,
  forgetFactorySteps,
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
  titleOf,
  toDecideOf,
  toggleOpen,
  unfoldingNow,
  waitsOnYou,
  widenLayout,
  type Span,
} from '@/lib/factory';
import { flowSteps, tilesOf } from '@/lib/flow';
import { capLine, queueOf } from '@/lib/inbox';
import { passLine, passTitle } from '@/lib/pass';
import { useContent } from '@/lib/useContent';
import { useNow } from '@/lib/useNow';
import type { Point } from '@/lib/layout';
import { CanvasLegend } from './CanvasLegend';
import { QueueLane } from './QueueLane';
import { RunNode, type RunFlowNode } from './RunNode';
import { StateEdge } from './StateEdge';
import { StepInspector } from './StepInspector';
import { afterEdges } from './stepGraph';

/** Where the cards were left in this browser: the arrangement saved at today's cell width, or else the one saved at the old, widened. */
const savedLayout = (): Map<string, Point> | null => readFactoryLayout() ?? widenLayout(readNarrowFactoryLayout());

// Declared once: a new object per render makes React Flow warn and mount every node afresh.
const nodeTypes = { run: RunNode };
const edgeTypes = { state: StateEdge };

/** The room left round the cards when the floor is fitted, beyond what the floor's own panels take (`fitClear`). */
const FIT_GAP = 16;

/**
 * How the floor is fitted: every card in view, and none under a panel drawn over the floor — the buttons at its top, the zoom controls,
 * the legend and the minimap at its bottom. A padding in proportion to the floor was not enough: with a floor of three rows, the fit put
 * the bottom row's footer under the legend, which wraps to two lines, and its Approve could not be pressed. So the panels are measured
 * where they are drawn, at each fit, and the fit keeps that much clear above and below: the legend's height moves with the floor's width.
 */
function fitClear(frame: HTMLElement | null) {
  let top = 0;
  let bottom = 0;
  if (frame) {
    const box = frame.getBoundingClientRect();
    for (const panel of frame.querySelectorAll('.react-flow__panel')) {
      const at = panel.getBoundingClientRect();
      // A panel hidden on a narrow floor is drawn nowhere, and takes no room.
      if (!at.height) continue;
      if (panel.classList.contains('top')) top = Math.max(top, at.bottom - box.top);
      if (panel.classList.contains('bottom')) bottom = Math.max(bottom, box.bottom - at.top);
    }
  }
  return { maxZoom: 1, padding: { top: `${top + FIT_GAP}px`, bottom: `${bottom + FIT_GAP}px`, x: `${2 * FIT_GAP}px` } } as const;
}

/** How far out bringing an open card into view zooms, at most: past it, the card is too small to read, and a person pans instead. */
const REVEAL_MIN_ZOOM = 0.4;

/** A handful of cells fits on a screen; past that, the minimap says where the rest are. */
const HANDFUL = 5;

/**
 * The minimap in the cards' terms — to decide, waiting on you, still going, or finished.
 * To decide first, then waiting on you, then finished: a run whose result nobody has decided, and one stopped at a step that needs a
 * person, are both over, and both still want finding.
 */
const minimapFill = (node: RunFlowNode) =>
  toDecideOf(node.data.run)
    ? 'var(--color-emerald-500)'
    : waitsOnYou(node.data.run)
      ? 'var(--color-amber-500)'
      : node.data.finished
        ? 'var(--color-neutral-400)'
        : 'var(--color-sky-500)';

/**
 * Every run in flight, a card each, on a floor a person can arrange, each with its steps as a small flowchart on it (`StepRail`). A run started `--after` runs is drawn with an
 * edge from each of their cards into its own (`afterEdges`), and a finished run a run in flight waits on
 * is on the floor for it (`floorRuns`); cards joined so are laid out layered, parents left of children.
 *
 * Laid out on a grid, oldest first, the first time a run is seen in this browser — so a run that
 * starts takes the next free cell and moves no card already down — and after that wherever a person
 * dragged it, until "Reset layout". A click on a card, or Enter on one, opens it: the card grows to the right
 * over as many cells as its steps' tiles need (`openSpan`), and the cards in them move aside (`placeRuns`) — when
 * it opens, by a click or brought back onto the floor open, and then only (`unfoldingNow`). Otherwise each card
 * moves alone, as in a factory modeller: a drop moves nothing else — a card dropped over another stays over it,
 * since that is where the person put it. The edges between cards stretch to follow; they pull nothing. A press
 * on a step's tile opens its inspector beside the floor. Which runs are open is kept in this browser with the layout.
 *
 * The inbox's queued cards wait at the floor's left edge, as ghosts, in the order the tick starts them (`QueueLane`), and the header says the
 * run slots taken of the cap the daemon runs with (`CapLine`), and the subscription's quota as the api last asked Claude Code for it (`QuotaLine`) —
 * and, when no wf up ticks the store, that nothing does and how to start one (`DaemonLine`), since a run waiting its turn and a run nobody moves
 * look alike on the floor. The cap is read again as the runs are, on each run's event of the workflow feed; the queue every 5 s, since the feed
 * carries no card's events yet: the daemon starts a card when a run slot frees, and nothing on the board asks it to.
 */
export function FactoryCanvas({ runs }: { runs: readonly RunSummary[] }) {
  return (
    <ReactFlowProvider>
      <Floor runs={runs} />
    </ReactFlowProvider>
  );
}

/** A card as the floor keeps it: where it is and how big React Flow measured it. What it shows is filled in on every render, from the runs and the open runs' reads. */
type PlacedCard = Node<Record<string, never>, 'run'>;
const nodeOf = (id: string, position: Point): PlacedCard => ({ id, type: 'run', position, data: {} });

/** What a card is told of an open run's read: its record once read, or why it could not be. */
type Read = { detail: RunDetail | null; trouble: string | null };
const NOT_READ: Read = { detail: null, trouble: null };
const readsOf = (results: UseQueryResult<RunDetail>[]): Read[] =>
  results.map(({ data, error }) => ({ detail: data ?? null, trouble: error ? `Could not read its steps: ${error.message}` : null }));

/** A drag moving a card, or React Flow measuring one: the only changes the floor takes, since it adds, removes and selects no card itself. */
const placing = (change: NodeChange<RunFlowNode>): change is NodePositionChange | NodeDimensionChange =>
  change.type === 'position' || change.type === 'dimensions';

function Floor({ runs }: { runs: readonly RunSummary[] }) {
  const { fitView, setViewport } = useReactFlow<RunFlowNode>();
  const store = useStoreApi<RunFlowNode>();
  const [showFinished, setShowFinished] = useState(false);

  const flying = useMemo(() => new Set(runs.filter(inFlight).map((run) => run.id)), [runs]);
  const shown = useMemo(() => floorRuns(runs, showFinished), [runs, showFinished]);
  const known = useMemo(() => new Set(runs.map((run) => run.id)), [runs]);
  // The list is new on every refetch; what lays the cards out is kept by its content, so a refetch that moves a status moves no card.
  const ids = useContent(shown.map((run) => run.id));
  // Each card's runs it waits on: what lays the cards joined by an edge out layered.
  const afterEntries = useContent(shown.map((run): [string, string[]] => [run.id, run.after]));
  const after = useMemo(() => new Map(afterEntries), [afterEntries]);

  // The runs whose cards are open, in the order they were opened; kept in this browser.
  const [open, setOpen] = useState<string[]>(readFactoryOpen);
  const openSet = useMemo(() => new Set(open), [open]);
  // The step whose inspector is open.
  const [selected, setSelected] = useState<{ runId: string; step: string } | null>(null);

  // Only a run open on the floor reads its detail, again on each of its events on the feed (`runQuery`): each tile's attempt and cost, and
  // what the inspector shows. A closed card reads the list, and so does an open card's flowchart.
  const opened = useMemo(() => open.filter((id) => ids.includes(id)), [open, ids]);
  // Combined, the reads keep their identity until one of them changes (react-query shares what is equal).
  const reads = useQueries({ queries: opened.map((id) => runQuery(id)), combine: readsOf });
  const details = useMemo(() => new Map(opened.map((id, i) => [id, reads[i] ?? NOT_READ])), [opened, reads]);

  // The cells each open card takes, from its tiles' size — which reads the steps' names and the graph, not their words — the run opened
  // last first: the order `placeRuns` claims cells in.
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

  // Where each card is and how big React Flow measured it, changed only through `onNodesChange`, a run joining or leaving the floor or
  // opening or closing, and a reset. What a card shows is read below. The cards left open on the last visit claim their cells first,
  // and the ones saved around them stay where they were left unless one is under an open card.
  const [placed, setPlaced] = useState<PlacedCard[]>(() => {
    const at = placeRuns(ids, new Map(), savedLayout(), spans, after, new Set());
    return ids.map((id) => nodeOf(id, at.get(id)!));
  });
  // Which runs and open cards `placed` was last laid out for: whatever reads the cards' positions waits for it.
  const [placedFor, setPlacedFor] = useState<{ ids: string[]; spans: ReadonlyMap<string, Span> } | null>(null);

  // The open cards the floor was last laid out with — at first, the ones left open on the last visit: a card not among them opens when it
  // is drawn open, and is the only thing that moves a card aside (`unfoldingNow`). A card dropped moves nothing but itself.
  const drawn = useRef(new Set(opened));

  // Set when a card has moved — dragged, or moved aside by a card opening — and cleared once the arrangement is saved.
  const moved = useRef(false);

  // Runs that started, finished, were asked for, opened or closed since: every card where it belongs.
  useEffect(() => {
    const { unfolding, drawn: now } = unfoldingNow(drawn.current, spans);
    drawn.current = now;
    // React Flow's nodes are state a drag and its measurements write too: a run joining or leaving the floor, or a card opening or
    // closing, is merged into them after the commit, with the arrangement saved in this browser.
    setPlaced((current) => {
      const have = new Map(current.map((node) => [node.id, node]));
      const onFloor = new Map(current.map((node) => [node.id, node.position]));
      // Cards on the floor stay put, unless a card opening now covers them; one coming back yields its old cell.
      const at = placeRuns(ids, onFloor, savedLayout(), spans, after, unfolding);
      const next = ids.map((id) => {
        const node = have.get(id);
        const point = at.get(id)!;
        if (!node) return nodeOf(id, point);
        return node.position.x === point.x && node.position.y === point.y ? node : { ...node, position: point };
      });
      // A card an open card moved aside is kept where it went, so the next visit lays out the same floor.
      if (next.some((node) => have.has(node.id) && node !== have.get(node.id))) moved.current = true;
      return next.length === current.length && next.every((node, i) => node === current[i]) ? current : next;
    });
    setPlacedFor({ ids, spans });
  }, [ids, spans, after]);

  useEffect(() => {
    if (!moved.current) return;
    moved.current = false;
    // A card off the floor now keeps where it was left; a run the store no longer lists does not.
    saveFactoryLayout(keepLayout(savedLayout(), new Map(placed.map((node) => [node.id, node.position])), known));
  }, [placed, known]);

  useEffect(() => {
    // A run the store no longer lists is not kept open.
    const kept = open.filter((id) => known.has(id));
    if (kept.length) saveFactoryOpen(kept);
    else forgetFactoryOpen();
  }, [open, known]);

  // Where a person dragged the steps of the graph that used to unfold beside a card: nothing reads it since the steps went onto the card.
  useEffect(() => forgetFactorySteps(), []);

  // What the observers and the reveal read, as of the last commit.
  const frame = useRef<HTMLDivElement>(null);
  const latest = useRef({ open, placed, spans, inspecting: selected?.runId ?? null });
  useLayoutEffect(() => {
    latest.current = { open, placed, spans, inspecting: selected?.runId ?? null };
  });

  const onNodesChange = useCallback((changes: NodeChange<RunFlowNode>[]) => {
    // A card dropped where a person dragged it stays there, over whatever it landed on, and the arrangement is kept. It moves alone:
    // the cards joined to it by `after` stay, and their edges stretch.
    if (changes.some((change) => change.type === 'position' && !change.dragging)) moved.current = true;
    const kept = changes.filter(placing);
    setPlaced((current) => applyNodeChanges(kept, current));
  }, []);

  // A click opens or closes a run. The run just opened is brought into view once the floor is laid out for it.
  const revealing = useRef<string | null>(null);
  const toggle = useCallback((runId: string) => {
    // Opened by a click, it moves aside the cards under it.
    if (!latest.current.open.includes(runId)) drawn.current.delete(runId);
    setOpen((current) => toggleOpen(current, runId));
    setSelected((current) => (current?.runId === runId ? null : current));
    revealing.current = runId;
  }, []);

  const inspect = useCallback((runId: string, step: string) => setSelected({ runId, step }), []);

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
          ariaLabel: `${isOpen ? 'Hide' : 'Show'} the steps of run: ${titleOf(run)}`,
          data: {
            run,
            finished: !flying.has(run.id),
            open: isOpen,
            detail: read?.detail ?? null,
            trouble: read?.trouble ?? null,
            selected: selected?.runId === run.id ? selected.step : null,
            onToggle: toggle,
            onStep: inspect,
          },
        },
      ];
    });
  }, [placed, shown, flying, openSet, details, selected, toggle, inspect]);

  // Between the cards: from each run a card waits on, into it.
  const edges = useMemo((): Edge[] => afterEdges(shown), [shown]);

  /**
   * An open card brought into view, if any of it is off the floor's screen: panned to its middle, and zoomed out only as far as it must be.
   * Its box is the cells it takes (`openSpan`), less the gap beside the last: the card as it will be drawn, which React Flow may not have
   * measured yet.
   */
  const reveal = useCallback(
    (runId: string) => {
      const { placed, spans } = latest.current;
      const card = placed.find((node) => node.id === runId);
      const el = frame.current;
      if (!card || !el) return;
      const [tx, ty, zoom] = store.getState().transform;
      const { x, y } = card.position;
      const span = spans.get(runId) ?? ONE_CELL;
      const width = span.columns * CELL_WIDTH - (CELL_WIDTH - CARD_WIDTH);
      const height = span.rows * CELL_HEIGHT - (CELL_WIDTH - CARD_WIDTH);
      if (
        x * zoom + tx >= 0 &&
        y * zoom + ty >= 0 &&
        (x + width) * zoom + tx <= el.clientWidth &&
        (y + height) * zoom + ty <= el.clientHeight
      )
        return;
      const room = 0.9;
      const to = Math.max(REVEAL_MIN_ZOOM, Math.min(zoom, (room * el.clientWidth) / width, (room * el.clientHeight) / height));
      void setViewport(
        { x: el.clientWidth / 2 - (x + width / 2) * to, y: el.clientHeight / 2 - (y + height / 2) * to, zoom: to },
        { duration: 300 },
      );
    },
    [setViewport, store],
  );

  useEffect(() => {
    const runId = revealing.current;
    if (!runId || placedFor?.ids !== ids || placedFor.spans !== spans) return;
    revealing.current = null;
    // Closed again, or not on the floor: nothing to show.
    if (openSet.has(runId) && spans.has(runId)) reveal(runId);
  }, [placedFor, ids, spans, openSet, reveal]);

  // Fitted once per ask, and not before the cards asked for are on the floor, or it fits the floor
  // they are about to join. Asked once from the start: the first fit is this one, not React Flow's own, so it keeps clear of the
  // panels too (`fitClear`) — React Flow waits for the cards to be measured — and it is not animated from nowhere.
  const [fits, setFits] = useState(1);
  const fitted = useRef(0);
  useEffect(() => {
    if (fits === fitted.current) return;
    if (placed.length !== ids.length || placed.some((node, i) => node.id !== ids[i])) return;
    const first = fitted.current === 0;
    fitted.current = fits;
    void fitView({ ...fitClear(frame.current), duration: first ? 0 : 300 });
  }, [fits, placed, ids, fitView]);

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

  const close = useCallback(() => setSelected(null), []);

  // Laid out on the grid again with every run closed and the saved arrangement forgotten, so the next visit agrees. The open
  // runs are forgotten by the effect that keeps them, its one writer.
  const resetLayout = () => {
    forgetFactoryLayout();
    setOpen([]);
    setSelected(null);
    const at = placeRuns(ids, new Map(), null, new Map(), after);
    setPlaced((current) => current.map((node) => ({ ...node, position: at.get(node.id) ?? node.position })));
    setFits((n) => n + 1);
  };
  // Every card closed. The cards they moved aside stay where they went.
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
  // Said beside the counts: a run stopped at a step that needs a person, or waiting on a run that never ships without one. Nothing of it
  // moves, so it is counted finished too, but it stays on the floor whatever "Show finished" says (`floorRuns`): each has its card.
  const waiting = runs.filter(waitsOnYou).length;
  // And the runs nobody has decided, which are finished too and stay on the floor: counted as `wf ls` says them, before who else
  // the run waits on. A run at its ending's gate is in both counts — the decision is what it waits on you for.
  const toDecide = runs.filter((run) => toDecideOf(run) !== null).length;
  // Polled every 5 s whether or not the feed is followed: a card queued, dropped or edited is on no event of it.
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
  // The quota over the floor, read in the route's loader so the floor is fitted beside it once. Should it come, go, or change what it says —
  // a sentence in place of the numbers, which may wrap the header to another line, or the dimmed last reading under it — the floor is fitted
  // again to its new height.
  const quota = useQuery(quotaQuery);
  const quotaShown = quota.error ? 'error' : `${quota.data?.state ?? 'none'}${quota.data?.last ? ' with the last reading' : ''}`;
  const wasQuota = useRef(quotaShown);
  useEffect(() => {
    if (wasQuota.current === quotaShown) return;
    wasQuota.current = quotaShown;
    setFits((n) => n + 1);
  }, [quotaShown]);
  // Whether a wf up ticks the store, read in the route's loader too: the line comes when nothing ticks and goes when one does, and changes
  // its words with how, which may wrap it — the floor is fitted again to the header's new height.
  const daemon = useQuery(daemonQuery);
  const daemonShown = daemon.error ? 'error' : daemon.data && !daemon.data.ticking ? daemon.data.kind : 'nothing';
  const wasDaemon = useRef(daemonShown);
  useEffect(() => {
    if (wasDaemon.current === daemonShown) return;
    wasDaemon.current = daemonShown;
    setFits((n) => n + 1);
  }, [daemonShown]);
  const cells = placed.reduce((sum, node) => {
    const { columns, rows } = spans.get(node.id) ?? ONE_CELL;
    return sum + columns * rows;
  }, 0);

  // A step the folder has lost since it was clicked is off the floor, and its panel goes with it.
  const inspectedRun = selected ? (details.get(selected.runId)?.detail ?? null) : null;
  const inspected = inspectedRun?.steps.find((step) => step.name === selected?.step);

  return (
    // The height left under the root's `h-12` header, so the floor fills the screen and no more.
    <div className="flex h-[calc(100svh-3rem)] min-h-96 flex-col">
      <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 border-b px-4 py-2">
        <div className="flex flex-wrap items-baseline gap-x-4 gap-y-1">
          <p className="text-sm text-muted-foreground">
            <span className="font-medium text-foreground">{flying.size}</span> in flight
            {finished > 0 && ` · ${finished} finished`}
            {toDecide > 0 && <span className="text-emerald-700 dark:text-emerald-400"> · {toDecide} to decide</span>}
            {waiting > 0 && ` · ${waiting} waiting on you`}
          </p>
          <CapLine queued={queued.length} queueError={queue.error} />
          <DaemonLine daemon={daemon.data} error={daemon.error} />
          <QuotaLine quota={quota.data} error={quota.error} />
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
                  // The title's link, the chevron, a tile and the gate's buttons do what they do, and no more.
                  if ((event.target as Element).closest('a, button')) return;
                  toggle(node.id);
                }}
                onPaneClick={close}
                onKeyDown={(event) => {
                  if (event.key !== 'Enter') return;
                  // On a card itself: Enter on the title's link, the chevron or a tile is theirs.
                  const target = event.target as HTMLElement;
                  if (!target.classList.contains('react-flow__node')) return;
                  const node = nodes.find((candidate) => candidate.id === target.dataset.id);
                  if (node) toggle(node.id);
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
              >
                {/* Only where the floor is wide enough for it beside the buttons: a step's inspector narrows it. */}
                <Panel position="top-left" className="hidden text-[11px] text-muted-foreground @2xl:block">
                  Click a run to open its steps · drag a card, and it moves alone · kept in this browser
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
                {cells > HANDFUL && <MiniMap<RunFlowNode> pannable zoomable style={{ width: 128, height: 88 }} nodeColor={minimapFill} />}
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
 * difference is said on hover. Then what that pass cost, `a pass takes 212 ms`, with its breakdown on hover (`passTitle`), once a pass has
 * written it. Nothing until the cap is read; why, when it cannot be.
 */
function CapLine({ queued, queueError }: { queued: number; queueError: Error | null }) {
  const { data, error } = useQuery(ceilingsQuery);
  // The pass's time of day is said as today's or another day's: read against a clock that moves.
  const now = new Date(useNow(60_000));
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
                {queued === 1
                  ? 'The card queued beside it starts on its own'
                  : `The ${queued} cards queued beside it start on their own`}{' '}
                while <code>npx wf up</code> runs.
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
