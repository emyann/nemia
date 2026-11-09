import { useEffect, useMemo, useRef, type RefObject } from 'react';
import { useNavigate } from '@tanstack/react-router';
import { Background, BackgroundVariant, type Edge, Position, ReactFlow, ReactFlowProvider, useReactFlow } from '@xyflow/react';
import type { PagePlace, WorkflowListing } from '../../lib/api';
import { specStep, stepPage } from '../../lib/bar';
import { extentOf, layout, stepsOf } from '../../lib/layout';
import { useBarOver } from '../../lib/useBarOver';
import { useCanvasPress } from '../../lib/useCanvasPress';
import { useFrameSize } from '../../lib/useFrameSize';
import { FLOOR_BOX } from '../../lib/classes';
import { StateEdge } from '../step/StateEdge';
import { stepEdges, type StepGraphFacts } from '../step/stepGraph';
import { nodeKinds, routesOf } from '../../lib/routing';
import { SpecNode, type SpecFlowNode } from '../step/StepNode';

/** The canvas's node types for React Flow, one object for the module's life. */
const nodeTypes = { spec: SpecNode };
/** The canvas's edge types for React Flow, one object for the module's life. */
const edgeTypes = { state: StateEdge };

/** How the canvas is fitted to its frame: every step in view, never larger than life. */
const FIT = { padding: 0.15, maxZoom: 1 };

/** Room under the lowest row for the edge back a `loop:` makes, which runs beneath the nodes (`LOOP_DEPTH`), and its label. */
const LOOP_ROOM = 70;

/**
 * What a workflow's graph is drawn from, as the run it would start the moment the CLI's `start` has written it: every step pending,
 * nothing filed, nobody called it off or holds it. So its edges are the run canvas's own (`stepEdges`), drawn as they are on a run's page
 * before anything has happened: dashed, since all of it is still to come.
 */
const unstartedFacts = (workflow: WorkflowListing): StepGraphFacts => ({
  cancelledAt: null,
  holding: null,
  graph: workflow.graph,
  steps: workflow.steps.map(({ name }) => ({
    name,
    phase: 'pending',
    reason: 'Pending',
    on: null,
    via: null,
    note: null,
    roundDue: false,
    message: 'pending',
  })),
});

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
  const kinds = nodeKinds(graph);
  const nodes: SpecFlowNode[] = steps.map((step, index) => ({
    id: step.name,
    type: 'spec',
    position: at.get(step.name)!,
    sourcePosition: Position.Right,
    targetPosition: Position.Left,
    data: { name: step.name, index, spec: step.spec, node: kinds.get(step.name) ?? null, routes: routesOf(graph, step.name) },
    ariaLabel: `Step ${step.name}`,
    className: 'outline-none',
    draggable: false,
    selectable: false,
    style: { pointerEvents: 'all' },
  }));
  const loops = graph.edges.some((e) => e.kind === 'loop');
  return { nodes, edges: stepEdges(unstartedFacts(workflow)), height: extentOf(at).height + (loops ? LOOP_ROOM : 0) };
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
      className={FLOOR_BOX}
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
  const { width } = useFrameSize(frame, true);
  const fitted = useRef<number | null>(null);
  useEffect(() => {
    if (width === 0) return;
    if (fitted.current !== null && fitted.current !== width) void fitView({ ...FIT, duration: 200 });
    fitted.current = width;
  }, [width, fitView]);
}
