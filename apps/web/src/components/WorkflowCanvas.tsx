import { useEffect, useMemo, useRef, type RefObject } from 'react';
import { useNavigate } from '@tanstack/react-router';
import { Background, BackgroundVariant, type Edge, Position, ReactFlow, ReactFlowProvider, useReactFlow } from '@xyflow/react';
import type { PagePlace, RunDetail, WorkflowListing } from '../lib/api';
import { specStep, stepPage } from '../lib/bar';
import { extentOf, layout, stepsOf } from '../lib/layout';
import { useBarOver } from '../lib/useBarOver';
import { useCanvasPress } from '../lib/useCanvasPress';
import { StateEdge } from './StateEdge';
import { stepEdges } from './stepGraph';
import { SpecNode, type SpecFlowNode } from './StepNode';

/** The canvas's node types for React Flow, one object for the module's life. */
const nodeTypes = { spec: SpecNode };
/** The canvas's edge types for React Flow, one object for the module's life. */
const edgeTypes = { state: StateEdge };

/** How the canvas is fitted to its frame: every step in view, never larger than life. */
const FIT = { padding: 0.15, maxZoom: 1 };

/** Room under the lowest row for the edge back a `loop:` makes, which runs beneath the nodes (`LOOP_DEPTH`), and its label. */
const LOOP_ROOM = 70;

/**
 * The run a workflow would start, the moment the CLI's `start` has written it: every step waiting, nothing filed, nobody waited
 * on. What a workflow's graph is drawn as, so its edges are the run canvas's own (`stepEdges`), drawn as they are on a run's
 * page before anything has happened: dashed, since all of it is still to come.
 */
export function unstartedRun(workflow: WorkflowListing): RunDetail {
  return {
    id: `${workflow.from}:${workflow.name}`,
    kinds: [],
    refresh: '',
    brief: '',
    decide: '',
    repo: '',
    place: workflow.folderTeam ? 'folder' : 'repository',
    work: null,
    workflowDir: workflow.dir,
    workflowPage: null,
    try: null,
    baseRef: '',
    branch: '',
    isolate: true,
    createdAt: '',
    startedAt: null,
    cancelledAt: null,
    pruned: null,
    onDisk: { worktrees: false, files: false },
    after: [],
    waiting: null,
    context: [],
    holdUntil: [],
    holding: null,
    status: 'running',
    phase: 'running',
    reason: 'Running',
    on: null,
    via: null,
    moving: false,
    cost: null,
    atWork: null,
    tokens: null,
    read: null,
    waitingOnYou: [],
    onYou: [],
    toDecide: null,
    gates: [],
    warning: null,
    graph: workflow.graph,
    steps: workflow.steps.map(({ name }) => unstartedStep(name)),
    timeline: {
      rounds: [],
      run: {
        loop: null,
        round: null,
        tasks: 0,
        inFlight: 0,
        queuedMs: 0,
        ranMs: 0,
        wallMs: null,
        queued: '—',
        ran: '—',
        wall: 'not known',
        cost: null,
      },
    },
  };
}

/** The step `name` of an unstarted run: waiting, on its first try, nothing filed, told nothing yet. */
function unstartedStep(name: string): RunDetail['steps'][number] {
  return {
    name,
    spec: null,
    filed: null,
    body: null,
    told: null,
    layers: null,
    taskParts: null,
    taskId: null,
    workspace: null,
    files: [],
    filesError: null,
    branch: null,
    phase: 'pending',
    reason: 'Pending',
    on: null,
    via: null,
    message: 'pending',
    verdict: null,
    status: 'pending',
    note: null,
    roundDue: false,
    commands: { approve: '', retry: '', say: '' },
    needs: null,
    blockedByHarness: false,
    waitingFor: null,
    approve: null,
    denied: null,
    sessionUnread: null,
    gate: null,
    accepted: null,
    lastLine: null,
    said: [],
    asked: null,
    closeout: null,
    unreadable: null,
    check: null,
    attempts: { count: 0, latest: null },
    used: null,
    spent: null,
    budget: null,
    raise: null,
    tries: [
      {
        try: 1,
        round: 1,
        cause: null,
        current: true,
        taskId: null,
        note: null,
        phase: 'pending',
        reason: 'Pending',
        on: null,
        via: null,
        message: 'pending',
        status: 'pending',
        attempts: { count: 0, latest: null },
        check: null,
        closeout: null,
        unreadable: null,
        answer: null,
      },
    ],
    timeline: [],
  };
}

/** A workflow's graph as the canvas draws it: its nodes, its edges, and how tall its rows and the room under them are. */
type Drawn = { nodes: SpecFlowNode[]; edges: Edge[]; height: number };

/**
 * The graph of `workflow`'s steps, laid out as a run's page lays a run out, or why it cannot be laid out. Each node is named for a screen
 * reader, neither dragged nor selected, and given the pointer back that React Flow takes off such a node: a step is pressed.
 */
function drawnOf(workflow: WorkflowListing): Drawn | Error {
  const { steps, graph } = workflow;
  let at;
  try {
    at = layout(
      stepsOf(
        steps.map((s) => s.name),
        graph.edges,
      ),
    );
  } catch (err) {
    return err instanceof Error ? err : new Error(String(err));
  }
  const nodes: SpecFlowNode[] = steps.map((step, index) => ({
    id: step.name,
    type: 'spec',
    position: at.get(step.name)!,
    sourcePosition: Position.Right,
    targetPosition: Position.Left,
    data: { name: step.name, index, spec: step.spec },
    ariaLabel: `Step ${step.name}`,
    className: 'outline-none',
    draggable: false,
    selectable: false,
    style: { pointerEvents: 'all' },
  }));
  const loops = graph.edges.some((e) => e.kind === 'loop');
  return { nodes, edges: stepEdges(unstartedRun(workflow)), height: extentOf(at).height + (loops ? LOOP_ROOM : 0) };
}

/**
 * A workflow's steps as the graph a run of it would draw: a node per step in the step node's spec mode (`SpecNode`), an edge
 * per `after` and the edge back a `loop:` makes, as the api's `graph` has them — laid out as a run's page lays a run out.
 *
 * Fitted to its frame and not arranged by hand: it is a card on a page of cards, so the wheel scrolls the page past it
 * rather than zooming, and nothing about it is kept. A click, a tap or Enter on a step shows it in the frame's bar, ringed; the same step
 * again or the empty canvas closes it, and another switches it. A double click on a step, or the bar's Open, goes to its page
 * (`useCanvasPress`). Its frame holds its rows and the room around them, 180 px at least and 420 px at most, so one workflow never takes
 * the page; its flow has an id of its own, which scopes its arrowheads' ids on a page that draws several, and its arrowheads take their
 * edges' colour in both themes. The builder (`WorkflowBuilder`) draws a workflow in its place, and keeps a click to edit a step. A step's
 * page is reached in `place`, the place the workflow's page is read in.
 */
export function WorkflowCanvas({ workflow, place = {} }: { workflow: WorkflowListing; place?: PagePlace }) {
  const drawn = useMemo(() => drawnOf(workflow), [workflow]);
  if (drawn instanceof Error) {
    return <p className="rounded border border-failure px-3 py-2 text-body-medium text-failure">{drawn.message}</p>;
  }
  return (
    <ReactFlowProvider>
      <Graph workflow={workflow} drawn={drawn} place={place} />
    </ReactFlowProvider>
  );
}

/**
 * The canvas of `workflow`'s graph `drawn`, its step the bar shows marked `inspected`, and its frame narrowed by what the bar covers of it
 * (`useBarOver`), so the step inspected stays clear of the bar, fitted again as the frame changes width (`useRefit`). A double click
 * goes to the step's page in `place`.
 */
function Graph({ workflow, drawn, place }: { workflow: WorkflowListing; drawn: Drawn; place: PagePlace }) {
  const { from, name } = workflow;
  const navigate = useNavigate();
  const { shown, ...press } = useCanvasPress(
    (step) => ({ kind: 'spec', from, workflow: name, step }),
    (step) => void navigate(stepPage({ kind: 'spec', from, workflow: name, step }, place)),
  );
  const inspected = specStep(shown, from, name);
  const nodes = useMemo(
    () => drawn.nodes.map((node) => ({ ...node, data: { ...node.data, inspected: node.id === inspected } })),
    [drawn, inspected],
  );
  const whole = useRef<HTMLDivElement>(null);
  const frame = useRef<HTMLDivElement>(null);
  const over = useBarOver(whole);
  useRefit(frame);
  return (
    <div
      ref={whole}
      aria-label={`The steps of ${name} as a graph`}
      className="overflow-hidden rounded border border-outline-variant"
      style={{ height: Math.min(Math.max(drawn.height + 40, 180), 420) }}
    >
      <div ref={frame} className="h-full min-w-0" style={{ marginRight: over }}>
        <ReactFlow
          id={`workflow-${from}-${name}`}
          nodes={nodes}
          edges={drawn.edges}
          nodeTypes={nodeTypes}
          edgeTypes={edgeTypes}
          {...press}
          nodesDraggable={false}
          nodesConnectable={false}
          elementsSelectable={false}
          edgesFocusable={false}
          zoomOnScroll={false}
          zoomOnDoubleClick={false}
          preventScrolling={false}
          deleteKeyCode={null}
          selectionKeyCode={null}
          multiSelectionKeyCode={null}
          colorMode="system"
          defaultMarkerColor={null}
          fitView
          fitViewOptions={FIT}
        >
          <Background variant={BackgroundVariant.Dots} gap={16} />
        </ReactFlow>
      </div>
    </div>
  );
}

/** Fits every step of the canvas in `frame` again (`FIT`) each time the frame changes width, as the bar opens or closes beside it. */
function useRefit(frame: RefObject<HTMLDivElement | null>) {
  const { fitView } = useReactFlow();
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
  }, [frame, fitView]);
}
