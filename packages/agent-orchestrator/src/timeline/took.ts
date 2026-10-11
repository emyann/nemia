/**
 * What a run took: its time at work and the tokens its sessions used, off the engine's views of its tasks; and how long a person took to
 * approve a try at a gate (`gateWaitOf`), off its timeline.
 *
 * Pure, as `timeline.ts` is: a run and the views in, the figures and their words out. The api hands them to the board beside the run's
 * cost, and the board adds the time since a task still running started, which only it can count second by second.
 */
import { runTasks, type Run } from '../record/record.ts';
import { count, sessionTasks, type Consumed } from '../status/status.ts';
import type { Workflow } from '../step/step.ts';
import { signedAndHeld, taskUsage, type AttemptClock, type TaskClock, type Timeline, type TimelineTry } from './timeline.ts';

/**
 * A run's time at work: how long any session or check of it was running, two at once counted once, and a wait at a gate, a hold, a slot
 * or another run counted for nothing. `ms` is the union of the intervals its tasks ran in that ended — cut at `since` while one still runs;
 * `since` the earliest start of those still running, null when none is; `endedAt` the last end once none is, null while one is or while
 * nothing ran.
 */
export type AtWork = { ms: number; since: string | null; endedAt: string | null };

/** An interval a task ran in, in epoch milliseconds: `to` null while it still runs. */
type Ran = { from: number; to: number | null };

/**
 * The intervals one task ran in, turn by turn as `timeline`'s `ranOf` counts them: a turn's first spawn to its last end, an attempt that
 * never started (`unstartable`) left out. The last turn of a task neither settled nor held open and signed (`signedAndHeld`) still runs
 * when it has no end; a turn that has none otherwise is left out, as one the record does not say the end of.
 */
function ranIn(view: TaskClock): Ran[] {
  const turns = new Map<number, AttemptClock[]>();
  for (const a of view.state.attempts) {
    if (a.reason !== 'unstartable') turns.set(a.turn ?? 0, [...(turns.get(a.turn ?? 0) ?? []), a]);
  }
  const over = view.state.settled !== null || signedAndHeld(view);
  return [...turns.values()].flatMap((turn, i, all): Ran[] => {
    const from = turn.find((a) => a.spawnedAt)?.spawnedAt;
    if (!from) return [];
    const to = turn.at(-1)!.endedAt;
    if (to) return [{ from: Date.parse(from), to: Date.parse(to) }];
    return over || i < all.length - 1 ? [] : [{ from: Date.parse(from), to: null }];
  });
}

/** The length of the union of intervals that all ended. */
function unionMs(spans: ReadonlyArray<{ from: number; to: number }>): number {
  let ms = 0;
  let reach = -Infinity;
  for (const s of [...spans].sort((a, b) => a.from - b.from)) {
    if (s.to <= reach) continue;
    ms += s.to - Math.max(s.from, reach);
    reach = s.to;
  }
  return ms;
}

/** How long one task ran, off the engine's view of it: the union of its turns that ended (`ranIn`), a turn still running left out. */
export const ranMs = (view: TaskClock): number => unionMs(ranIn(view).flatMap((s) => (s.to === null ? [] : [{ from: s.from, to: s.to }])));

/**
 * A run's time at work (`AtWork`), off the engine's views of its tasks: every step's, every check's, every earlier try's (`runTasks`).
 * `views` may hold other runs' tasks too, and a task it does not hold — one the engine has no record of — ran nothing. Pure.
 */
export function atWork(run: Pick<Run, 'steps'>, views: ReadonlyMap<string, TaskClock>): AtWork {
  const spans = [...new Set(runTasks(run))].flatMap((id) => {
    const view = views.get(id);
    return view ? ranIn(view) : [];
  });
  const open = spans.flatMap((s) => (s.to === null ? [s.from] : []));
  const since = open.length ? Math.min(...open) : null;
  const ended = spans.flatMap((s) => (s.to === null ? [] : [{ from: s.from, to: since === null ? s.to : Math.min(s.to, since) }]));
  const last = ended.length ? Math.max(...spans.flatMap((s) => (s.to === null ? [] : [s.to]))) : null;
  return {
    ms: unionMs(ended.filter((s) => s.to > s.from)),
    since: since === null ? null : new Date(since).toISOString(),
    endedAt: since === null && last !== null ? new Date(last).toISOString() : null,
  };
}

/**
 * The tokens a run's sessions used, every try's, each session once (`sessionTasks`): its checks run on the shell and measure none.
 *
 * `total` is everything they used: `input` — which holds what they read from the cache, wrote to it and neither — and `output`. Each part
 * of the input is null unless every session that measured tokens measured it. `measured` counts the sessions that did; `unmeasured` those
 * that ran and measured none, which make the total the least it was. An attempt still running counts what it has used so far.
 *
 * `said` is the total for a card, `≥` where a session measured nothing; `split` its parts for a title, and how many measured nothing.
 */
export type RunTokens = {
  total: number;
  input: number;
  output: number;
  cacheRead: number | null;
  cacheWrite: number | null;
  uncached: number | null;
  measured: number;
  unmeasured: number;
  said: string;
  split: string;
};

/** A part of the input every measured session has, summed; null where one lacks it. */
const partOf = (used: readonly Consumed[], key: 'cacheReadTokens' | 'cacheWriteTokens' | 'uncachedTokens'): number | null =>
  used.every((u) => u[key] !== undefined) ? used.reduce((n, u) => n + u[key]!, 0) : null;

/** Whether a task's view shows a session that ran: an attempt that spawned, other than one that never could start. */
const ran = (view: TaskClock | undefined): boolean => Boolean(view?.state.attempts.some((a) => a.reason !== 'unstartable' && a.spawnedAt));

/**
 * The tokens a run's sessions used (`RunTokens`), off the engine's views of their tasks (`taskUsage`); null where no session that ran
 * measured any, so nobody reads a 0 nobody counted. A session that never spawned used nothing, and is in neither count. Pure.
 */
export function runTokens(run: Pick<Run, 'steps'>, views: ReadonlyMap<string, TaskClock>): RunTokens | null {
  const sessions = [...new Set(Object.values(run.steps).flatMap((record) => sessionTasks(record)))].filter((id) => ran(views.get(id)));
  const usages = sessions.map((id) => taskUsage(views.get(id)));
  const used = usages.filter((u): u is Consumed => u?.inputTokens !== undefined && u.outputTokens !== undefined);
  if (!used.length) return null;
  const input = used.reduce((n, u) => n + u.inputTokens!, 0);
  const output = used.reduce((n, u) => n + u.outputTokens!, 0);
  const [cacheRead, cacheWrite, uncached] = (['cacheReadTokens', 'cacheWriteTokens', 'uncachedTokens'] as const).map((k) =>
    partOf(used, k),
  );
  const unmeasured = sessions.length - used.length;
  const parts =
    cacheRead !== null && cacheWrite !== null && uncached !== null
      ? [`${count(cacheRead)} read from the cache`, `${count(cacheWrite)} written to it`, `${count(uncached)} uncached`]
      : [`${count(input)} in`];
  const missing = unmeasured ? `; ${unmeasured} session${unmeasured === 1 ? '' : 's'} measured nothing` : '';
  return {
    total: input + output,
    input,
    output,
    cacheRead,
    cacheWrite,
    uncached,
    measured: used.length,
    unmeasured,
    said: `${unmeasured ? '≥' : ''}${count(input + output)} tokens`,
    split: `${[...parts, `${count(output)} out`].join(' · ')}${missing}`,
  };
}

/**
 * When a try ended: its check's end; where it has no check, its session's, or, for a try that answered an earlier try's session, the end
 * of the turn it ran (`TurnSpan`). Null while any of them is in flight, and for a recheck's try whose check was never filed.
 */
export const tryEndOf = (t: TimelineTry): string | null => (t.check ? t.check.endedAt : (t.session?.endedAt ?? t.turn?.endedAt ?? null));

/** The ms from `from` to `to`, never negative; null with no `from`. */
const msBetween = (from: string | null, to: string): number | null => (from ? Math.max(0, Date.parse(to) - Date.parse(from)) : null);

/**
 * How long a person took to approve try `t` of `step` in `run`, off the run's timeline `tl`: from the try's end (`tryEndOf`: for a try
 * that answered an earlier try's session, the end of that answer's turn) to the approval of that step and that try, or, for a step
 * approved before it is filed (an ending in the checkout at a gate), from the latest end of the steps it waits on before the approval.
 * Null with no approval. The one rule of a gate's wait: `nemia stats`, the tick's metric (`gateWaits`) and the run's `gate` row
 * (`timelineRows`) all read it.
 */
export function gateWaitOf(
  run: Pick<Run, 'approvals'>,
  tl: Timeline,
  step: Pick<Workflow, 'name' | 'after'>,
  t: TimelineTry,
): number | null {
  const approval = run.approvals?.find((a) => a.step === step.name && a.try === t.try);
  if (!approval) return null;
  const end = tryEndOf(t);
  if (end && end <= approval.at) return msBetween(end, approval.at);
  const before = step.after
    .flatMap((name) => (tl.steps[name] ?? []).map(tryEndOf))
    .filter((at): at is string => at !== null && at <= approval.at)
    .sort()
    .at(-1);
  return msBetween(before ?? null, approval.at);
}
