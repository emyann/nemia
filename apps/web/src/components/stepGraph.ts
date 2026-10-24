import { MarkerType } from '@xyflow/react';
import type { RunDetail } from '../lib/api';
import { edgesOf, edgeStroke, LOOP_SOURCE, LOOP_TARGET, type EdgeState } from '../lib/canvas';
import { contextEdges, runEdges } from '../lib/factory';
import { statePaint, stepState, type StepState } from '../lib/status';
import type { StateFlowEdge } from './StateEdge';
import type { StepNodeData } from './StepNode';

/**
 * What a step's node shows, on its run's page and on the Factory alike: read off the run as the api gives it, whose
 * `waitingOnYou` decides the human gate beside the step's own word.
 */
export const stepData = (run: RunDetail, index: number): StepNodeData => ({
  step: run.steps[index],
  index,
  runCancelled: run.cancelledAt !== null,
  runHeld: run.holding != null,
  waitingOnYou: run.waitingOnYou.includes(run.steps[index].name),
});

/** The minimap in the chips' colours, so a glance at it says what the nodes say: each state's fill is its meaning's (`statePaint`). */
export const stepMinimapFill: Record<StepState, string> = statePaint;

/**
 * An edge as React Flow takes it: drawn by `StateEdge` from what it says, with an arrow at its target in its colour, sized in
 * pixels so a heavier line does not draw a bigger arrow. Nobody picks or focuses one.
 */
function drawn(id: string, source: string, target: string, state: EdgeState, loop: boolean): StateFlowEdge {
  return {
    id,
    source,
    target,
    type: 'state',
    data: { state, loop },
    markerEnd: { type: MarkerType.ArrowClosed, color: edgeStroke(state, loop), width: 20, height: 20, markerUnits: 'userSpaceOnUse' },
    selectable: false,
    focusable: false,
  };
}

/**
 * A run's edges as its graph draws them, on its page and on the Factory alike: the api's `graph`, never a step's spec —
 * an edge per `after`, and for a loop, the edge back from its looping step to the step a round runs again, under both
 * nodes and labelled with the round once past the first. Each says what `edgesOf` reads off the steps at its ends.
 *
 * `prefix` goes before every node's id, for a floor that draws two runs' steps, which may each have an
 * `implement`: nothing on the run's page and the workflow's, which draw one.
 */
export function stepEdges(run: RunDetail, prefix = ''): StateFlowEdge[] {
  const runCancelled = run.cancelledAt !== null;
  const runHeld = run.holding != null;
  const steps = run.steps.map((s) => ({
    name: s.name,
    state: stepState(s, runCancelled, runHeld),
    note: s.note,
    roundDue: s.roundDue,
  }));
  return edgesOf(run.graph, steps).map((e) => {
    const edge = drawn(prefix + e.id, prefix + e.source, prefix + e.target, e.state, e.kind === 'loop');
    return e.kind === 'loop'
      ? { ...edge, sourceHandle: LOOP_SOURCE, targetHandle: LOOP_TARGET, ...(e.label ? { label: e.label } : {}) }
      : edge;
  });
}

/**
 * The edges between the Factory's cards (`runEdges`): from a run into each card on the floor that still waits on it, out of the one card's
 * right side and into the other's left, dashed: a wait that is over draws nothing.
 */
export function afterEdges(runs: Parameters<typeof runEdges>[0]): StateFlowEdge[] {
  return runEdges(runs).map((e) => drawn(e.id, e.source, e.target, e.state, false));
}

/**
 * The lines of what the focused card reads as context (`contextEdges`): faint and dotted, with no arrow, under the class `context-edge`.
 * None without a focus.
 */
export function readEdges(runs: Parameters<typeof contextEdges>[0], focus: string | null): StateFlowEdge[] {
  return contextEdges(runs, focus).map((e) => ({
    id: e.id,
    source: e.source,
    target: e.target,
    type: 'state',
    data: { state: 'to-come', loop: false, read: true },
    className: 'context-edge',
    selectable: false,
    focusable: false,
  }));
}
