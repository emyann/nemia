/**
 * The board's frame of a run, as a RunList asked by state (`?fieldSelector=status.state…`) lays it on each run's status
 * (`framePartsOf`): its state in the list, its wall time and where it went (`clock`), what each step of a waiting run cost and when its
 * present wait on a person began, and when a finished run's work stopped and how it ended — each off the run's judgement (`Judgement`),
 * the one its object is built on, and the feed's filing times, so no record or journal is read again for it. And the state of a run left
 * unjudged, off its record, as the whole list summarizes it (`unjudgedFields`).
 */
import type { Run as RunObject, RunState, RunStatus } from 'objects';
import type { Run } from '../record/record.ts';
import { stepSpend, taskSpend } from '../status/status.ts';
import { spentOf } from '../summary/judged.verb.ts';
import type { Judgement } from '../summary/judgement.verb.ts';
import { type RunSummary, unjudgedFields } from '../summary/summary.verb.ts';
import { clockOf, waitingSinceOf } from '../timeline/index.ts';
import { clockUntilOf, finishedAtOf, kindOf, outcomeOf, wallMsOf } from '../run-state/run-state.ts';

/** The frame's parts of a run's status: all seven keys, null where a part is not of the run's state. */
export type FrameParts = Required<Pick<RunStatus, 'state' | 'wallMs' | 'clock' | 'stepCosts' | 'waitingSince' | 'finishedAt' | 'outcome'>>;

/** What a summary is read for here: the list's own, but when it started, which the frame reads nothing of. */
type Summarized = Omit<RunSummary, 'startedAt'>;

/**
 * The frame's parts of the run `summary` says, measured to `now` (epoch ms): its state (`kindOf`); its wall time until `now`, or until its
 * work stopped for a finished run (`wallMsOf`), and its clock read at that same instant (`clockUntilOf`), so the clock's five parts add up
 * to it; for a waiting run, what each of its steps cost in the summary's order, every try's session together, and when its present wait
 * on a person began (`waitingSinceOf`): the end of the waiting step's last try or the placing of a hold only a person lifts, the earliest
 * where several are open, null where the record does not date it; for a finished run, when its work stopped (`finishedAtOf`) and how it
 * ended (`outcomeOf`). Off `judgement`'s own run, views and steps, and the feed's filing times `filed`.
 */
export function framePartsOf(summary: Summarized, judgement: Judgement, filed: ReadonlyMap<string, string>, now: number): FrameParts {
  const { run, views, steps } = judgement;
  const state = kindOf(summary);
  const held = summary.holding?.waitingOnYou ? summary.holding.at : null;
  const waiting = state === 'waiting';
  const finished = state === 'finished';
  return {
    state,
    wallMs: wallMsOf(summary, now),
    clock: clockOf(run, views, filed, steps, summary.waitingOnYou, clockUntilOf(summary, now)),
    stepCosts: waiting
      ? summary.steps.map(({ name }) => ({ step: name, cost: spentOf(stepSpend(run, name, (id) => taskSpend(views.get(id)))) }))
      : null,
    waitingSince: waiting ? waitingSinceOf(run, views, filed, steps, summary.waitingOnYou, held) : null,
    finishedAt: finished ? finishedAtOf(summary) : null,
    outcome: finished ? outcomeOf(summary) : null,
  };
}

/** `object` with the frame's `parts` laid on its status: a new object, the one a list keeps never changed. */
export const framed = (object: RunObject, parts: FrameParts): RunObject => ({ ...object, status: { ...object.status, ...parts } });

/**
 * The state of a run left unjudged (a task of it does not read, or its unfrozen folder does not load), as the whole list summarizes it
 * off its record (`unjudgedFields`): `running` and moving, so in flight, but where nothing of it is judged.
 */
export const unjudgedStateOf = (run: Pick<Run, 'id' | 'factory' | 'createdAt' | 'cancelledAt'>): RunState =>
  kindOf({
    id: run.id,
    factory: run.factory ?? null,
    createdAt: run.createdAt,
    cancelledAt: run.cancelledAt ?? null,
    waitingOnYou: [],
    ...unjudgedFields(),
  });
