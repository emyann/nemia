/**
 * What the run page's result box draws beside the ask (`resultOf`, proved by `contracts/run-result.contract.ts`): what the graph's final
 * steps gave, or until they have, where the run stands and the step that says it; and the run's steps as the box reads them
 * (`resultStepsOf`), final where no step comes after them on the graph. Pure.
 */
import type { ResultOf, ResultStep, Stands } from '../../contracts/run-result.contract.ts';
import type { RunDetail, StepView } from './runView.ts';
import { meaningOf } from './meaning.ts';
import { movingInto, isLive } from './canvas.ts';
import { nodeKinds } from './routing.ts';
import { satisfiesAfter, stateDrawn, stepState, type StepState } from './status.ts';

/** Where the run stands, in the order the box says it: waiting on a person first, then failed, then at work, else to come. */
const STANDS_ORDER = ['yours', 'failed', 'working', 'toCome'] as const;

/**
 * The box: the final steps the run will run, in its order, once every one is done and gave; else the first of `STANDS_ORDER` a step stands
 * as, linked to the first step that does (none where none does: to come with nothing to come).
 */
export const resultOf: ResultOf = (steps) => {
  const owed = steps.filter((s) => s.final && s.stands !== 'skipped');
  if (owed.length > 0 && owed.every((s) => s.stands === 'done' && s.gave)) return { kind: 'gave', steps: owed.map((s) => s.name) };
  const why = STANDS_ORDER.find((w) => steps.some((s) => s.stands === w)) ?? 'toCome';
  return { kind: 'stands', why, step: steps.find((s) => s.stands === why)?.name ?? null };
};

/** Where a step stands for the box, by its state: done, skipped, waiting on a person, failed, at work, else to come. */
export function standsOf(state: StepState): Stands {
  if (satisfiesAfter(state)) return 'done';
  if (state === 'skipped') return 'skipped';
  const meaning = meaningOf(stateDrawn[state].hue);
  if (meaning === 'yours') return 'yours';
  if (meaning === 'failure') return 'failed';
  return movingInto(state) || isLive(state) ? 'working' : 'toCome';
}

/** Whether the step's shown try gave anything: the summary it signed off with, a declared field, a file or a value. */
const gaveOf = (step: StepView): boolean => {
  const closeout = step.closeout;
  return (
    closeout !== null &&
    (closeout.summary.trim() !== '' ||
      Object.keys(closeout.output).length > 0 ||
      closeout.artifacts.length > 0 ||
      closeout.values.length > 0)
  );
};

/**
 * The run's steps as the box reads them, in the run's order: each final where no `after` or route edge leaves it (a loop's edge back
 * leads to no step after it), where it stands (`standsOf`), and whether it gave: its shown try's closeout, or, for a node that is no
 * plain step — a workflow node, which files a card, or a condition, which takes a route — what it did, which no session signs off.
 */
export function resultStepsOf(view: RunDetail): ResultStep[] {
  const before = new Set(view.graph.edges.filter((e) => e.kind !== 'loop').map((e) => e.from));
  const nodes = nodeKinds(view.graph);
  return view.steps.map((step) => ({
    name: step.name,
    final: !before.has(step.name),
    stands: standsOf(stepState(step, view.cancelledAt !== null, view.holding != null)),
    gave: nodes.has(step.name) || gaveOf(step),
  }));
}

/** How a run ended before its final steps gave: called off by a person, or ended on its own. */
type RunEnd = 'calledOff' | 'ended';

/**
 * How the run ended, where it has: called off (its status, or the moment it was), else ended once its status is one a run ends in
 * (succeeded or failed); null for a run still going. What none of its steps says once it stopped: a step a called-off run never ran
 * reads as still to come.
 */
export function runEndOf(view: Pick<RunDetail, 'status' | 'cancelledAt'>): RunEnd | null {
  if (view.cancelledAt !== null || view.status === 'cancelled') return 'calledOff';
  return view.status === 'succeeded' || view.status === 'failed' ? 'ended' : null;
}
