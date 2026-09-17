import { useMemo } from 'react';
import { useNavigate } from '@tanstack/react-router';
import { Background, BackgroundVariant, Position, ReactFlow } from '@xyflow/react';
import type { RunDetail, WorkflowListing } from '../lib/api';
import { extentOf, layout, stepsOf } from '../lib/layout';
import { StateEdge } from './StateEdge';
import { stepEdges } from './stepGraph';
import { SpecNode, type SpecFlowNode } from './StepNode';

// Declared once: a new object per render makes React Flow warn and mount every node afresh.
const nodeTypes = { spec: SpecNode };
const edgeTypes = { state: StateEdge };

const FIT = { padding: 0.15, maxZoom: 1 };

/** Room under the lowest row for the edge back a `loop:` makes, which runs beneath the nodes (`LOOP_DEPTH`), and its label. */
const LOOP_ROOM = 70;

/**
 * The run a workflow would start, the moment `wf start` has written it: every step waiting, nothing filed, nobody waited
 * on. What a workflow's graph is drawn as, so its edges are the run canvas's own (`stepEdges`), drawn as they are on a run's
 * page before anything has happened: dashed, since all of it is still to come.
 */
export function unstartedRun(workflow: WorkflowListing): RunDetail {
  return {
    id: `${workflow.from}:${workflow.name}`, brief: '', repo: '', workflowDir: workflow.dir, baseRef: '', branch: '', isolate: true,
    createdAt: '', cancelledAt: null, after: [], waiting: null, status: 'running', moving: false, cost: null, waitingOnYou: [], warning: null,
    graph: workflow.graph,
    steps: workflow.steps.map(({ name }) => ({
      name, spec: null, filed: null, body: null, told: null, taskId: null, workspace: null, branch: null, status: 'waiting', note: null,
      needs: null, blockedByHarness: false, lastLine: null, said: [], asked: null,
      closeout: null, check: null, attempts: { count: 0, latest: null },
      used: null, spent: null, budget: null, raise: null,
      tries: [{ try: 1, round: 1, then: null, current: true, taskId: null, note: null, status: 'waiting', attempts: { count: 0, latest: null }, check: null, closeout: null, answer: null }],
      timeline: [],
    })),
    timeline: { rounds: [], run: { loop: null, round: null, tasks: 0, inFlight: 0, queuedMs: 0, ranMs: 0, wallMs: null, queued: '—', ran: '—', wall: 'not known', cost: null } },
  };
}

/**
 * A workflow's steps as the graph a run of it would draw: a node per step in the step node's spec mode (`SpecNode`), an edge
 * per `after` and the edge back a `loop:` makes, as the api's `graph` has them — laid out as a run's page lays a run out.
 *
 * Fitted to its frame and not arranged by hand: it is a card on a page of cards, so the wheel scrolls the page past it
 * rather than zooming, and nothing about it is kept. A block clicked opens its step's page.
 */
export function WorkflowCanvas({ workflow }: { workflow: WorkflowListing }) {
  const { steps, graph } = workflow;
  const navigate = useNavigate();
  const drawn = useMemo(() => {
    let at;
    try {
      at = layout(stepsOf(steps.map((s) => s.name), graph.edges));
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
      draggable: false,
      selectable: false,
      className: 'cursor-pointer',
    }));
    const loops = graph.edges.some((e) => e.kind === 'loop');
    return { nodes, edges: stepEdges(unstartedRun(workflow)), height: extentOf(at).height + (loops ? LOOP_ROOM : 0) };
  }, [workflow]);

  if (drawn instanceof Error) {
    return (
      <p className="rounded border border-red-300 px-3 py-2 text-sm text-red-700 dark:border-red-900 dark:text-red-400">{drawn.message}</p>
    );
  }
  return (
    <div
      aria-label={`The steps of ${workflow.name} as a graph`}
      className="overflow-hidden rounded border border-neutral-200 dark:border-neutral-800"
      // A row of nodes and the room around it, and never so tall that one workflow takes the page.
      style={{ height: Math.min(Math.max(drawn.height + 40, 180), 420) }}
    >
      <ReactFlow
        // Marker ids are scoped by the flow's id, and a page of cards draws several flows.
        id={`workflow-${workflow.from}-${workflow.name}`}
        nodes={drawn.nodes}
        edges={drawn.edges}
        nodeTypes={nodeTypes}
        edgeTypes={edgeTypes}
        nodesDraggable={false}
        nodesConnectable={false}
        elementsSelectable={false}
        edgesFocusable={false}
        nodesFocusable={false}
        zoomOnScroll={false}
        zoomOnDoubleClick={false}
        preventScrolling={false}
        deleteKeyCode={null}
        onNodeClick={(_, node) =>
          void navigate({ to: '/workflows/$from/$workflow/$step', params: { from: workflow.from, workflow: workflow.name, step: node.id } })
        }
        colorMode="system"
        // Null, so arrowheads take `--xy-edge-stroke` like their edges instead of one grey for both themes.
        defaultMarkerColor={null}
        fitView
        fitViewOptions={FIT}
      >
        <Background variant={BackgroundVariant.Dots} gap={16} />
      </ReactFlow>
    </div>
  );
}
