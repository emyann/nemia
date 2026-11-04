/**
 * When a task's deadline counts from, and whether its attempt in flight is held: pure, and read by `observe` (`domain.ts`). No pause
 * ends a try by its deadline: while an attempt is held at its hook, or a sessions' drain stands, the deadline does not fire, and it
 * counts again from when the session goes on, as Kubernetes resets a resumed Job's `startTime`.
 */
import { elapsedMs, type Instant } from './clock.ts';
import type { Monotonic } from './clock.ts';
import type { Attempt, Event, Now, Sighting, State } from './domain.ts';
import { turnOf } from './turn.ts';
import { startedWhen } from './restart.ts';

/** Whether `a` is held back at its hook now: seen held (`held`), and not seen going on since (`released`). */
export const heldNow = (a: Attempt): boolean => a.heldSince !== undefined && a.releasedAt === undefined;

/**
 * A hold or a release written into the fold of its attempt `a`: a hold opens one, its moment kept and the last release cleared; a
 * release closes the open one. A hold already open, or a release of none, changes nothing.
 */
export const holdInto = (a: Attempt, e: Extract<Event, { kind: 'held' | 'released' }>): void => {
  if (heldNow(a) === (e.kind === 'held')) return;
  if (e.kind === 'released') {
    a.releasedAt = e.at;
    if (e.mono) a.releasedMono = e.mono;
    return;
  }
  a.heldSince = e.at;
  if (e.mono) a.heldMono = e.mono;
  else delete a.heldMono;
  delete a.releasedAt;
  delete a.releasedMono;
};

/** When `a` was released from its last hold, on both clocks it was stamped on; none while held or never held. */
const releasedWhen = (a: Attempt): Instant | undefined =>
  a.releasedAt === undefined ? undefined : { at: Date.parse(a.releasedAt), mono: a.releasedMono };

/** The later of two moments, by `elapsedMs`; `to` when there is no `from`. */
const laterOf = (from: Instant | undefined, to: Instant | undefined): Instant | undefined =>
  from === undefined ? to : to === undefined || elapsedMs(from, to) <= 0 ? from : to;

/**
 * The moment the deadline of the task's current turn (`turnOf`) counts from: the latest of the turn's first attempt's start, any of its
 * attempts' release from a hold, and the start of an attempt that continues a parked one (`Attempt.parked`). None for a turn with no
 * attempt.
 */
export const deadlineFrom = (state: State): Instant | undefined => {
  let from: Instant | undefined;
  let continues = true;
  for (const a of turnOf(state).attempts) {
    if (continues) from = laterOf(from, startedWhen(a));
    from = laterOf(from, releasedWhen(a));
    continues = a.parked !== undefined;
  }
  return from;
};

/**
 * How long the task's current turn has run since it last went on (`deadlineFrom`), in milliseconds, at `now`, and whether that is past
 * the task's deadline: neither before the turn has an attempt, as a turn queued for admission has not started burning its time.
 */
export const deadlineOf = (state: State, now: Now): { ranFor: number; overdue: boolean } => {
  const from = turnOf(state).attempts[0] === undefined ? undefined : deadlineFrom(state);
  if (from === undefined) return { ranFor: 0, overdue: false };
  const ranFor = elapsedMs(from, { at: now.at.getTime(), mono: now.mono });
  return { ranFor, overdue: state.deadlineSeconds !== undefined && ranFor > state.deadlineSeconds * 1000 };
};

/**
 * What the engine journals of the hold of an attempt in flight, `last`, off its sighting: `held` the first time it is seen held back
 * at its hook (`Sighting.heldBack`), `released` the first time one held is seen without it. Stamped `at`, and `mono` when read.
 */
export const holdFacts = (last: Attempt, sighting: Sighting, at: string, mono?: Monotonic): Event[] => {
  const held = heldNow(last);
  if (held === (sighting.heldBack !== undefined)) return [];
  return [{ kind: held ? 'released' : 'held', at, attempt: last.n, ...(mono ? { mono } : {}) }];
};
