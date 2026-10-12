/**
 * Where a run's wall time went, in five parts that add up to it (`RunClock`): sessions at work, checks running, a wait on a person, a
 * wait for a slot, and the rest.
 *
 * Pure, as `took.ts` is: a run, the views of its tasks and their filing times in, the parts out. Each instant of the wall belongs to the
 * first part that covers it, in that order, so two sessions side by side count once, and a session at work while another step waits at its
 * gate is a session at work. `TimelineTotal` sums durations instead, and a fan-out's sum is more than its wall.
 */
import { runTasks, type Run } from '../record/record.ts';
import { hasGate, sessionTasks } from '../status/status.ts';
import type { Workflow } from '../step/step.ts';
import { hasStarted } from '../wait/wait.ts';
import { timeline, type TaskClock, type TaskSpan, type Timeline, type TimelineTry } from './timeline.ts';
import { gateWaitOf, ranIn, tryEndOf, unionMs, type Ran } from './took.ts';

/**
 * A run's wall time and its parts, in ms: `wallMs` is created → `until`, and the five others add up to it exactly. `sessionsMs` is the
 * time any session of it ran; `checksMs` the time a check ran and no session did; `personMs` the time it waited on a person and nothing
 * ran — at a gate until its approval, on a blocked sign-off until its answer, on a step that waits on a person still; `slotMs` the time a
 * task, or the run itself, waited for a slot and none of the three before held; `restMs` what none of the four covers: a wait on another
 * run, a hold, the passes between two steps, and a wait of the run itself on a person, which the record does not date.
 */
export type RunClock = { wallMs: number; sessionsMs: number; checksMs: number; personMs: number; slotMs: number; restMs: number };

/** An interval that ended, in epoch milliseconds. */
type Span = { from: number; to: number };

/** `spans` cut to `wall`, one with no end running to the wall's; an interval the cut leaves empty is dropped. */
const clipped = (spans: readonly Ran[], wall: Span): Span[] =>
  spans.flatMap((s) => {
    const from = Math.max(s.from, wall.from);
    const to = Math.min(s.to ?? wall.to, wall.to);
    return to > from ? [{ from, to }] : [];
  });

/** The intervals the tasks `ids` ran in (`ranIn`), a task `views` does not hold running nothing. */
const ranOf = (ids: readonly string[], views: ReadonlyMap<string, TaskClock>): Ran[] =>
  ids.flatMap((id) => {
    const view = views.get(id);
    return view ? ranIn(view) : [];
  });

/** The interval between two instants, `to` null for one still open; none where `from` is not known. */
const spanOf = (from: string | null | undefined, to: string | null): Ran[] =>
  from ? [{ from: Date.parse(from), to: to === null ? null : Date.parse(to) }] : [];

/** The waits at a gate that an approval closed: each approved try of a gated step, for as long as `gateWaitOf` says. */
const gateWaits = (run: Run, tl: Timeline, steps: readonly Workflow[]): Ran[] =>
  steps
    .filter((step) => hasGate(step, run))
    .flatMap((step) =>
      (tl.steps[step.name] ?? []).flatMap((t): Ran[] => {
        const approval = run.approvals?.find((a) => a.step === step.name && a.try === t.try);
        const ms = gateWaitOf(run, tl, step, t);
        if (!approval || ms === null) return [];
        const to = Date.parse(approval.at);
        return [{ from: to - ms, to }];
      }),
    );

/**
 * The waits on a person's answer to a blocked sign-off: from the end of the turn that asked to the first spawn of the turn that
 * answered.
 */
const answerWaits = (tl: Timeline): Ran[] =>
  Object.values(tl.steps)
    .flat()
    .flatMap((t) => (t.turn?.asked && t.turn.spawnedAt ? spanOf(t.turn.heldFrom, t.turn.spawnedAt) : []));

/** The latest end among `tries` that ended (`tryEndOf`), or null where none did. */
const lastEndOf = (tries: readonly TimelineTry[]): string | null =>
  tries
    .map(tryEndOf)
    .filter((at): at is string => at !== null)
    .sort()
    .at(-1) ?? null;

/**
 * The waits still open on a person: each step of `waiting`, from the end of its last try, or, for one whose last try has no end — a step
 * held at its gate before it is filed — from the latest end of the steps it comes after; none where neither is known.
 */
const openWaits = (tl: Timeline, steps: readonly Workflow[], waiting: readonly string[]): Ran[] =>
  waiting.flatMap((name) => {
    const own = tl.steps[name]?.at(-1);
    const after = steps.find((s) => s.name === name)?.after ?? [];
    return spanOf((own && tryEndOf(own)) ?? lastEndOf(after.flatMap((before) => tl.steps[before] ?? [])), null);
  });

/** A task's wait for a slot: filed → its first spawn, and still open while it is queued or starting; none where its filing is not known. */
const taskSlot = (span: TaskSpan | null): Ran[] => {
  if (!span) return [];
  if (span.at === 'queued' || span.at === 'starting') return spanOf(span.filedAt, null);
  return span.spawnedAt ? spanOf(span.filedAt, span.spawnedAt) : [];
};

/** The waits for a slot: each task's (`taskSlot`), and the run's own for a run slot (`SlotWait`), open until its first task is filed. */
const slotWaits = (run: Run, tl: Timeline): Ran[] => {
  const tasks = Object.values(tl.steps)
    .flat()
    .flatMap((t) => [...taskSlot(t.session), ...taskSlot(t.check)]);
  if (!tl.slot) return tasks;
  if (!hasStarted(run)) return [...tasks, ...spanOf(tl.slot.from, null)];
  return [...tasks, ...(tl.slot.filedAt ? spanOf(tl.slot.from, tl.slot.filedAt) : [])];
};

/**
 * A run's clock (`RunClock`) from its creation to `until`, never before it.
 *
 * @param views The engine's view of every task of the run (`runTasks`); a task it does not hold ran nothing.
 * @param filed Each task's filing time, off the engine's feed; a task without one waited for no slot that is known.
 * @param steps The workflow the run is judged by: whose gates and whose `after` the waits on a person read.
 * @param waiting The steps that wait on a person now (`waitingOnYou`), each an open wait.
 * @param until The instant the clock is read at, in epoch milliseconds.
 */
export function clockOf(
  run: Run,
  views: ReadonlyMap<string, TaskClock>,
  filed: ReadonlyMap<string, string>,
  steps: readonly Workflow[],
  waiting: readonly string[],
  until: number,
): RunClock {
  const from = Date.parse(run.createdAt);
  const wall = { from, to: Math.max(from, until) };
  const tl = timeline(run, views, filed, steps);
  const sessionIds = new Set(Object.values(run.steps).flatMap((record) => sessionTasks(record)));
  const checkIds = [...new Set(runTasks(run))].filter((id) => !sessionIds.has(id));
  const parts = [
    ranOf([...sessionIds], views),
    ranOf(checkIds, views),
    [...gateWaits(run, tl, steps), ...answerWaits(tl), ...openWaits(tl, steps, waiting)],
    slotWaits(run, tl),
  ].map((spans) => clipped(spans, wall));
  const reach = parts.map((_, i) => unionMs(parts.slice(0, i + 1).flat()));
  const [sessionsMs, checksMs, personMs, slotMs] = reach.map((ms, i) => ms - (reach[i - 1] ?? 0));
  const wallMs = wall.to - wall.from;
  return { wallMs, sessionsMs, checksMs, personMs, slotMs, restMs: wallMs - reach[3] };
}

/**
 * When a run's present wait on a person began, as an ISO instant: the earliest start among the waits open on one — each step of
 * `waiting`, dated as the open part of `personMs` dates it (`openWaits`), and `held`. Null where none is dated: nothing waits, or the
 * record dates none of what does.
 *
 * @param views The engine's view of every task of the run, as `clockOf` takes them.
 * @param filed Each task's filing time, as `clockOf` takes them.
 * @param steps The workflow the run is judged by.
 * @param waiting The steps that wait on a person now (`waitingOnYou`).
 * @param held When a hold that only a person lifts was placed, null for a run with none.
 */
export function waitingSinceOf(
  run: Run,
  views: ReadonlyMap<string, TaskClock>,
  filed: ReadonlyMap<string, string>,
  steps: readonly Workflow[],
  waiting: readonly string[],
  held: string | null,
): string | null {
  const starts = [...openWaits(timeline(run, views, filed, steps), steps, waiting), ...spanOf(held, null)].map((wait) => wait.from);
  return starts.length ? new Date(Math.min(...starts)).toISOString() : null;
}
