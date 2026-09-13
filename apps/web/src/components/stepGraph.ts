import { MarkerType, type Edge } from '@xyflow/react';
import type { RunDetail } from '../lib/api';
import { edgesOf } from '../lib/canvas';
import { stepState, type StepState } from '../lib/status';

/** The minimap in the chips' colours, so a glance at it says what the nodes say. */
export const stepMinimapFill: Record<StepState, string> = {
  working: 'var(--color-sky-500)',
  'needs-human': 'var(--color-orange-500)',
  done: 'var(--color-emerald-500)',
  blocked: 'var(--color-amber-500)',
  failed: 'var(--color-red-500)',
  waiting: 'var(--color-neutral-400)',
  cancelled: 'var(--color-neutral-400)',
  unknown: 'var(--color-neutral-400)',
};

/**
 * A run's edges as its graph draws them, on its page and on the Factory alike: an edge per `after`.
 *
 * `prefix` goes before every node's id: nothing on the run's page, the run on the Factory, where two
 * runs may each have an `implement`.
 */
export function stepEdges(run: RunDetail, prefix = ''): Edge[] {
  const runCancelled = run.cancelledAt !== null;
  const steps = run.steps.map((s) => ({ name: s.name, after: s.spec?.after ?? [], state: stepState(s.status, runCancelled) }));
  return edgesOf(steps).map((e) => ({
    id: prefix + e.id,
    source: prefix + e.source,
    target: prefix + e.target,
    markerEnd: { type: MarkerType.ArrowClosed },
    // Solid once both ends are done; dashed while what it stands for is still to happen.
    style: e.complete ? undefined : { strokeDasharray: '6 4' },
    selectable: false,
    focusable: false,
  }));
}
