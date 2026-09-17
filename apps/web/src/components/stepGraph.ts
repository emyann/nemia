import { MarkerType } from '@xyflow/react';
import type { RunDetail, RunSummary } from '../lib/api';
import { edgeState, edgesOf, edgeStroke, LOOP_SOURCE, LOOP_TARGET, type EdgeState } from '../lib/canvas';
import { runEdges } from '../lib/factory';
import { stepState, type StepState } from '../lib/status';
import type { StateFlowEdge } from './StateEdge';
import type { StepNodeData } from './StepNode';

/**
 * What a step's node shows, on its run's page and on the Factory alike: read off the run as the api gives it, whose
 * `waitingOnYou` decides the human gate beside the step's own word.
 */
export const stepData = (run: RunDetail, index: number): StepNodeData => ({
  step: run.steps[index]!,
  index,
  runCancelled: run.cancelledAt !== null,
  waitingOnYou: run.waitingOnYou.includes(run.steps[index]!.name),
});

/** The minimap in the chips' colours, so a glance at it says what the nodes say. */
export const stepMinimapFill: Record<StepState, string> = {
  working: 'var(--color-sky-500)',
  'needs-human': 'var(--color-orange-500)',
  checking: 'var(--color-blue-500)',
  verified: 'var(--color-emerald-500)',
  unverified: 'var(--color-neutral-500)',
  blocked: 'var(--color-amber-500)',
  'awaiting-approval': 'var(--color-amber-500)',
  exhausted: 'var(--color-amber-500)',
  'over-budget': 'var(--color-amber-500)',
  'budget-exhausted': 'var(--color-amber-500)',
  unsigned: 'var(--color-amber-400)',
  failed: 'var(--color-red-500)',
  'failed-check': 'var(--color-red-500)',
  waiting: 'var(--color-neutral-400)',
  cancelled: 'var(--color-neutral-400)',
  unknown: 'var(--color-neutral-400)',
};

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
 * `prefix` goes before every node's id: nothing on the run's page, the run on the Factory, where two
 * runs may each have an `implement`.
 */
export function stepEdges(run: RunDetail, prefix = ''): StateFlowEdge[] {
  const runCancelled = run.cancelledAt !== null;
  const steps = run.steps.map((s) => ({ name: s.name, state: stepState(s.status, runCancelled), note: s.note }));
  return edgesOf(run.graph, steps).map((e) => {
    const edge = drawn(prefix + e.id, prefix + e.source, prefix + e.target, e.state, e.kind === 'loop');
    return e.kind === 'loop'
      ? { ...edge, sourceHandle: LOOP_SOURCE, targetHandle: LOOP_TARGET, ...(e.label ? { label: e.label } : {}) }
      : edge;
  });
}

/**
 * The edges from a run's card on the Factory, which is the head of its graph: one into each root the api's graph names — a
 * step with no `after` — and none into a step that waits on another, whatever its spec says or lacks. Each says what its
 * root is doing: done once the root's work is, running while work moves into it, and to come otherwise.
 */
/**
 * The edges between the Factory's cards (`runEdges`): from a run into each card on the floor that waits on it, out of the one card's right
 * side and into the other's left, drawn as every edge is — dashed while the card waits, solid once its run has started.
 */
export function afterEdges(runs: ReadonlyArray<Pick<RunSummary, 'id' | 'after' | 'steps'>>): StateFlowEdge[] {
  return runEdges(runs).map((e) => drawn(e.id, e.source, e.target, e.state, false));
}

export function cardEdges(run: RunDetail, card: string, prefix: string): StateFlowEdge[] {
  const runCancelled = run.cancelledAt !== null;
  const states = new Map(run.steps.map((s) => [s.name, stepState(s.status, runCancelled)]));
  return run.graph.roots.flatMap((root) => {
    const state = states.get(root);
    return state ? [drawn(`${prefix}->${root}`, card, prefix + root, edgeState(true, state), false)] : [];
  });
}
