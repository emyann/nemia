import { MarkerType, type Edge } from '@xyflow/react';
import type { RunDetail } from '../lib/api';
import { edgesOf, LOOP_SOURCE, LOOP_STROKE, LOOP_TARGET } from '../lib/canvas';
import { stepState, type StepState } from '../lib/status';
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
  exhausted: 'var(--color-amber-500)',
  unsigned: 'var(--color-amber-400)',
  failed: 'var(--color-red-500)',
  'failed-check': 'var(--color-red-500)',
  waiting: 'var(--color-neutral-400)',
  cancelled: 'var(--color-neutral-400)',
  unknown: 'var(--color-neutral-400)',
};

/**
 * A run's edges as its graph draws them, on its page and on the Factory alike: the api's `graph`, never a step's spec —
 * an edge per `after`, and for a loop, the edge back from its looping step to the step a round runs again (`LoopEdge`),
 * under both nodes, pulsing while a round is due and labelled with the round once past the first.
 *
 * `prefix` goes before every node's id: nothing on the run's page, the run on the Factory, where two
 * runs may each have an `implement`.
 */
export function stepEdges(run: RunDetail, prefix = ''): Edge[] {
  const runCancelled = run.cancelledAt !== null;
  const steps = run.steps.map((s) => ({ name: s.name, state: stepState(s.status, runCancelled), note: s.note }));
  return edgesOf(run.graph, steps).map((e): Edge => {
    const drawn = {
      id: prefix + e.id,
      source: prefix + e.source,
      target: prefix + e.target,
      ...(e.pulsing ? { className: 'pulsing' } : {}),
      selectable: false,
      focusable: false,
    };
    return e.kind === 'loop'
      ? {
          ...drawn,
          type: 'loop',
          sourceHandle: LOOP_SOURCE,
          targetHandle: LOOP_TARGET,
          markerEnd: { type: MarkerType.ArrowClosed, color: LOOP_STROKE },
          ...(e.label ? { label: e.label } : {}),
        }
      : {
          ...drawn,
          markerEnd: { type: MarkerType.ArrowClosed },
          // Solid once both ends are done; dashed while what it stands for is still to happen.
          style: e.complete ? undefined : { strokeDasharray: '6 4' },
        };
  });
}

/**
 * The edges from a run's card on the Factory, which is the head of its graph: one dashed edge into each root the api's
 * graph names — a step with no `after` — and none into a step that waits on another, whatever its spec says or lacks.
 */
export function cardEdges(run: RunDetail, card: string, prefix: string): Edge[] {
  const shown = new Set(run.steps.map((s) => s.name));
  return run.graph.roots
    .filter((root) => shown.has(root))
    .map((root) => ({
      id: `${prefix}->${root}`,
      source: card,
      target: prefix + root,
      style: { strokeDasharray: '3 4' },
      selectable: false,
      focusable: false,
    }));
}
