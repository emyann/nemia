/**
 * A run's timeline as flat rows, one number each: what a view across runs averages, a row of it the same row of every run of a workflow.
 *
 * Pure, as `timeline.ts` is: a run, its timeline and its workflow's steps in, the rows out. A row is named so that the names, sorted as
 * text, read as the run page's Timeline does: each step by its place in the workflow, its check under it, then each loop's rounds, then
 * the run.
 */
import type { Run } from '../record/record.ts';
import { hasGate } from '../status/status.ts';
import type { Workflow } from '../step/step.ts';
import type { Timeline } from './timeline.ts';
import { gateWaitOf } from './took.ts';
import { answerWaitOf } from './turns.ts';

/** What a row is a number of: a try's session, a try's check, a step, a round of a loop, or the run. */
export const TIMELINE_OF = ['try', 'check', 'step', 'round', 'run'] as const;

/**
 * Which number a row is: the time `queued` and the time `ran`, in ms; a session's `cost`, in dollars; a step's `tries`, a count; a `wall`
 * time, in ms; and of a run alone, its time in `check`, at a `gate`, and waiting on a person's `answer` to a step that signed off
 * blocked, in ms.
 */
export const TIMELINE_PARTS = ['queued', 'ran', 'cost', 'tries', 'wall', 'check', 'gate', 'answer'] as const;

/**
 * One number of a run's timeline. `row` is its name: a step's is its place among the workflow's steps, from 1 and two digits wide, then
 * its name (`02 build`); its check's adds ` check`; a round's is its looping step, then `round` and the round, two digits wide
 * (`review round 01`); the run's is `run`. `step` is the step a try's, a check's and a step's row is of, null on a round's and the run's;
 * `try` the try a try's and a check's row is of, null on any other.
 */
export type TimelineRow = {
  of: (typeof TIMELINE_OF)[number];
  step: string | null;
  try: number | null;
  row: string;
  part: (typeof TIMELINE_PARTS)[number];
  value: number;
};

/** A number two digits wide, so that names holding it sort as text in its order. */
const padded = (n: number): string => String(n).padStart(2, '0');

/** The rows of `parts` that were measured: one whose value is null or undefined is no row, never a 0. */
const measured = (
  row: Omit<TimelineRow, 'part' | 'value'>,
  parts: ReadonlyArray<readonly [TimelineRow['part'], number | null | undefined]>,
): TimelineRow[] => parts.flatMap(([part, value]) => (value === null || value === undefined ? [] : [{ ...row, part, value }]));

/**
 * The rows of one step of the timeline `tl`, named `label`: for each try with a session of its own, how long it was queued, how long it
 * ran and what it cost; for each try's check, how long it was queued and ran; and how many tries the step took. None for a step with no
 * try on the clock.
 */
function stepRows(tl: Timeline, step: string, label: string): TimelineRow[] {
  const tries = tl.steps[step] ?? [];
  if (!tries.length) return [];
  return [
    ...tries.flatMap((t) => [
      ...measured({ of: 'try', step, try: t.try, row: label }, [
        ['queued', t.session?.queuedMs],
        ['ran', t.session?.ranMs],
        ['cost', t.session ? t.used?.costUsd : undefined],
      ]),
      ...measured({ of: 'check', step, try: t.try, row: `${label} check` }, [
        ['queued', t.check?.queuedMs],
        ['ran', t.check?.ranMs],
      ]),
    ]),
    { of: 'step', step, try: null, row: label, part: 'tries', value: tries.length },
  ];
}

/**
 * The run's own rows, only once its wall time is known: that wall time, the time its tasks were queued (its wait for a run slot among
 * it), the time its checks ran, the time people took at its gates (`gateWaitOf`), and the time it waited on a person's answer to a
 * session held open (`answerWaitOf`), each 0 where there was none.
 */
function runRows(run: Pick<Run, 'approvals' | 'gates'>, tl: Timeline, steps: readonly Workflow[]): TimelineRow[] {
  if (tl.run.wallMs === null) return [];
  const tries = Object.values(tl.steps).flat();
  const check = tries.reduce((ms, t) => ms + (t.check?.ranMs ?? 0), 0);
  const gate = steps
    .filter((step) => hasGate(step, run))
    .flatMap((step) => (tl.steps[step.name] ?? []).map((t) => gateWaitOf(run, tl, step, t) ?? 0))
    .reduce((ms, waited) => ms + waited, 0);
  const answer = tries.reduce((ms, t) => ms + (answerWaitOf(t) ?? 0), 0);
  return measured({ of: 'run', step: null, try: null, row: 'run' }, [
    ['wall', tl.run.wallMs],
    ['queued', tl.run.queuedMs],
    ['check', check],
    ['gate', gate],
    ['answer', answer],
  ]);
}

/**
 * The timeline `tl` of `run` as rows (`TimelineRow`), `steps` being the workflow it was judged by, whose order names the rows: each
 * step's, in that order; the wall time of each round of each loop where it is known; and the run's, where its wall time is. Times are in
 * ms and a cost in dollars. A number nobody measured is no row.
 */
export function timelineRows(run: Pick<Run, 'approvals' | 'gates'>, tl: Timeline, steps: readonly Workflow[]): TimelineRow[] {
  return [
    ...steps.flatMap((step, i) => stepRows(tl, step.name, `${padded(i + 1)} ${step.name}`)),
    ...tl.rounds.flatMap((r) =>
      measured({ of: 'round', step: null, try: null, row: `${r.loop} round ${padded(r.round ?? 0)}` }, [['wall', r.wallMs]]),
    ),
    ...runRows(run, tl, steps),
  ];
}
