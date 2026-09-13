import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate } from '@tanstack/react-router';
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
  type Edge,
  type NodeChange,
} from '@xyflow/react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Switch } from '@/components/ui/switch';
import type { RunSummary } from '@/lib/api';
import { forgetFactoryLayout, readFactoryLayout, saveFactoryLayout } from '@/lib/canvas';
import { byAge, inFlight, keepLayout, placeRuns, titleOf } from '@/lib/factory';
import type { Point } from '@/lib/layout';
import { RunNode, type RunFlowNode } from './RunNode';

// Declared once: a new object per render makes React Flow warn and mount every node afresh.
const nodeTypes = { run: RunNode };

// Runs do not wait on each other, so the floor has no edges.
const NO_EDGES: Edge[] = [];

const FIT = { padding: 0.15, maxZoom: 1 };

/** A handful of cards fits on a screen; past that, the minimap says where the rest are. */
const HANDFUL = 5;

/** The minimap in the cards' terms: waiting on you, still going, or finished. */
const minimapFill = (node: RunFlowNode) =>
  node.data.finished
    ? 'var(--color-neutral-400)'
    : node.data.run.waitingOnYou.length
      ? 'var(--color-amber-500)'
      : 'var(--color-sky-500)';

/**
 * Every run in flight, a card each, on a floor a person can arrange.
 *
 * Laid out on a grid, oldest first, the first time a run is seen in this browser — so a run that
 * starts takes the next free cell and moves no card already down — and after that wherever a person
 * dragged it, until "Reset layout". A click on a card, or Enter on one, opens the run.
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
  data: { run, finished: false },
  ariaLabel: `Open run: ${titleOf(run)}`,
});

function Floor({ runs }: { runs: readonly RunSummary[] }) {
  const navigate = useNavigate();
  const { fitView } = useReactFlow<RunFlowNode>();
  const [showFinished, setShowFinished] = useState(false);

  const flying = useMemo(() => new Set(runs.filter(inFlight).map((run) => run.id)), [runs]);
  const shown = useMemo(() => byAge(runs).filter((run) => showFinished || flying.has(run.id)), [runs, flying, showFinished]);
  const known = useMemo(() => new Set(runs.map((run) => run.id)), [runs]);
  const ids = shown.map((run) => run.id);
  const idsKey = JSON.stringify(ids);

  // Where each card is and how big React Flow measured it, changed only through `onNodesChange`, a
  // run joining or leaving the floor, and a reset. What a card shows is read from the runs below.
  const [placed, setPlaced] = useState<RunFlowNode[]>(() => {
    const at = placeRuns(ids, readFactoryLayout() ?? new Map());
    return shown.map((run) => nodeOf(run, at.get(run.id)!));
  });

  // Runs that started, finished, or were asked for since: add them where they belong, drop the rest.
  useEffect(() => {
    setPlaced((current) => {
      const have = new Map(current.map((node) => [node.id, node]));
      const kept = new Map([...(readFactoryLayout() ?? []), ...current.map((node) => [node.id, node.position] as const)]);
      const at = placeRuns(ids, kept);
      const next = shown.map((run) => have.get(run.id) ?? nodeOf(run, at.get(run.id)!));
      return next.length === current.length && next.every((node, i) => node === current[i]) ? current : next;
    });
  }, [idsKey]);

  const nodes = useMemo(() => {
    const byId = new Map(shown.map((run) => [run.id, run]));
    return placed.flatMap((node) => {
      const run = byId.get(node.id);
      return run ? [{ ...node, data: { run, finished: !flying.has(run.id) } }] : [];
    });
  }, [placed, shown, flying]);

  // Set when a person has dragged a card, and cleared once the arrangement is saved.
  const moved = useRef(false);
  const onNodesChange = useCallback((changes: NodeChange<RunFlowNode>[]) => {
    if (changes.some((change) => change.type === 'position' && !change.dragging)) moved.current = true;
    setPlaced((current) => applyNodeChanges(changes.filter((change) => change.type !== 'select' && change.type !== 'remove'), current));
  }, []);
  useEffect(() => {
    if (!moved.current) return;
    moved.current = false;
    // A card off the floor now keeps where it was left; a run the store no longer lists does not.
    saveFactoryLayout(keepLayout(readFactoryLayout(), new Map(placed.map((node) => [node.id, node.position])), known));
  }, [placed, known]);

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

  // Laid out on the grid again, and the saved arrangement forgotten, so the next visit agrees.
  const resetLayout = () => {
    forgetFactoryLayout();
    const at = placeRuns(ids, new Map());
    setPlaced((current) => current.map((node) => ({ ...node, position: at.get(node.id) ?? node.position })));
    setFits((n) => n + 1);
  };
  const toggleFinished = (on: boolean) => {
    setShowFinished(on);
    setFits((n) => n + 1);
  };
  const open = (runId: string) => void navigate({ to: '/runs/$runId', params: { runId } });
  const finished = runs.length - flying.size;

  return (
    // The height left under the root's `h-12` header, so the floor fills the screen and no more.
    <div className="flex h-[calc(100svh-3rem)] min-h-96 flex-col">
      <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 border-b px-4 py-2">
        <p className="text-sm text-muted-foreground">
          <span className="font-medium text-foreground">{flying.size}</span> in flight
          {finished > 0 && ` · ${finished} finished`}
        </p>
        <label className="flex cursor-pointer items-center gap-2 text-sm">
          <Switch checked={showFinished} onCheckedChange={toggleFinished} />
          Show finished
        </label>
      </div>

      {shown.length ? (
        <div className="min-h-0 flex-1">
          <ReactFlow
            nodes={nodes}
            edges={NO_EDGES}
            nodeTypes={nodeTypes}
            onNodesChange={onNodesChange}
            onNodeClick={(_, node) => open(node.id)}
            onKeyDown={(event) => {
              if (event.key !== 'Enter') return;
              const card = (event.target as HTMLElement).closest<HTMLElement>('.react-flow__node');
              if (card?.dataset.id) open(card.dataset.id);
            }}
            nodesConnectable={false}
            elementsSelectable={false}
            deleteKeyCode={null}
            selectionKeyCode={null}
            multiSelectionKeyCode={null}
            colorMode="system"
            minZoom={0.2}
            fitView
            fitViewOptions={FIT}
          >
            <Panel position="top-left" className="hidden text-[11px] text-muted-foreground sm:block">
              Drag to arrange · kept in this browser
            </Panel>
            <Panel position="top-right" className="flex gap-2">
              <Button type="button" variant="outline" size="sm" onClick={resetLayout}>
                Reset layout
              </Button>
              <Button type="button" variant="outline" size="sm" onClick={() => setFits((n) => n + 1)}>
                Fit view
              </Button>
            </Panel>
            <Background variant={BackgroundVariant.Dots} gap={16} />
            <Controls showInteractive={false} showFitView={false} />
            {nodes.length > HANDFUL && (
              <MiniMap<RunFlowNode> pannable zoomable style={{ width: 128, height: 88 }} nodeColor={minimapFill} />
            )}
          </ReactFlow>
        </div>
      ) : (
        <Empty anyRuns={runs.length > 0} />
      )}
    </div>
  );
}

/** Nothing on the floor: say so, and where the runs are. */
function Empty({ anyRuns }: { anyRuns: boolean }) {
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
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Button asChild variant="outline" size="sm">
            <Link to="/runs">Go to Runs</Link>
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
