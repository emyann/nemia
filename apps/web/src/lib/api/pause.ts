/**
 * The store's pause (`GET`, `POST` and `DELETE /api/pause`, the package's `paused`, `pause` and `resume`), and what a pause at once would
 * stop (`GET /api/pause/now`, the package's `pause now`).
 */
import { queryOptions } from '@tanstack/react-query';
import { pace } from '../feed.ts';
import { Schema } from 'effect';
import { get, send } from './read.ts';

/** Mirrors the package's `Pause`: since when (ISO), by whom, and why, when a reason was given. Empty where its file no longer says. */
export type Pause = { at: string; by: string; why?: string };

/** Mirrors the package's `PauseStaged`: a run whose ending has its merge staged in `repo`'s checkout, its check held by the pause. */
export type PauseStaged = { run: string; step: string; repo: string };

/** Mirrors the package's `PauseHeld`: a run whose step signed off, its check held by the pause, its merge not staged. */
export type PauseHeld = { run: string; step: string };

/**
 * Mirrors the package's `Finishing`: `run`'s `step`, still at work under the pause, as a session, a check, or a landing's check;
 * `stopping` once it was asked to stop, and `resumed` while a pause at once's ask names it, which tries it again on the resume;
 * `calling`, the tool a session is in a call to, which a restart of the daemon waits for.
 */
export type Finishing = {
  run: string;
  step: string;
  kind: 'session' | 'check' | 'landing';
  stopping?: true;
  resumed?: true;
  calling?: string;
};

/** Mirrors the package's `Interrupt`: `run`'s `step`, its session at work or its check, which a pause at once stops. */
export type Interrupt = { run: string; step: string; kind: 'session' | 'check' };

/** What `GET /api/pause/now` answers: each task a pause at once would stop, and what an interrupted step costs, in the package's words. */
export type PauseNowRead = { interrupts: readonly Interrupt[]; cost: string };

/** What a pause or a lift answers: the pause put, kept or lifted; and, for a pause at once, whether it was kept and what it stopped. */
export type PauseAnswer = { pause: Pause; kept?: boolean; interrupted?: readonly Interrupt[] };

/**
 * Mirrors the package's `Paused`: the pause, null where none stands; each task still finishing under it, none once it is Paused; each
 * landing it holds with its merge staged; and each other check it holds.
 */
export type Paused = {
  pause: Pause | null;
  finishing: readonly Finishing[];
  staged: readonly PauseStaged[];
  held: readonly PauseHeld[];
};

/** Decodes a `Pause`. */
const PauseSchema = Schema.Struct({
  at: Schema.String,
  by: Schema.String,
  why: Schema.optional(Schema.String),
}) satisfies Schema.Schema<Pause>;

/** Decodes a `Paused`. */
const PausedSchema = Schema.Struct({
  pause: Schema.NullOr(PauseSchema),
  finishing: Schema.Array(
    Schema.Struct({
      run: Schema.String,
      step: Schema.String,
      kind: Schema.Literals(['session', 'check', 'landing']),
      stopping: Schema.optional(Schema.Literal(true)),
      resumed: Schema.optional(Schema.Literal(true)),
      calling: Schema.optional(Schema.String),
    }),
  ),
  staged: Schema.Array(Schema.Struct({ run: Schema.String, step: Schema.String, repo: Schema.String })),
  held: Schema.Array(Schema.Struct({ run: Schema.String, step: Schema.String })),
}) satisfies Schema.Schema<Paused>;

/** Decodes an `Interrupt`. */
const InterruptSchema = Schema.Struct({
  run: Schema.String,
  step: Schema.String,
  kind: Schema.Literals(['session', 'check']),
}) satisfies Schema.Schema<Interrupt>;

/** Decodes a `PauseNowRead`. */
const PauseNowSchema = Schema.Struct({
  interrupts: Schema.Array(InterruptSchema),
  cost: Schema.String,
}) satisfies Schema.Schema<PauseNowRead>;

/** Decodes a `PauseAnswer`. */
const PauseAnswerSchema = Schema.Struct({
  pause: PauseSchema,
  kept: Schema.optional(Schema.Boolean),
  interrupted: Schema.optional(Schema.Array(InterruptSchema)),
}) satisfies Schema.Schema<PauseAnswer>;

/**
 * Whether the store is paused, and what finishes under it: read again on the feed's `store` event, the pause put or lifted (`keysOf`), and
 * polled at `pace` besides, since the feed says nothing of what finishes under it.
 */
export const pauseQuery = queryOptions({
  queryKey: ['pause'],
  queryFn: () => get('/api/pause', PausedSchema),
  refetchInterval: () => pace(5_000),
});

/**
 * What a pause at once would stop now, read when a person asks for it and never polled: the api reads every run's tasks to answer it.
 * Kept by no cache, so each confirm reads it afresh.
 */
export const pauseNowQuery = queryOptions({
  queryKey: ['pause', 'now'],
  queryFn: (): Promise<PauseNowRead> => get('/api/pause/now', PauseNowSchema),
  gcTime: 0,
});

/**
 * Pauses the store, as the package's `pause` does, saying `why` when given: from the next pass nothing new starts, and what runs
 * finishes. With `now`, a pause at once, as the package's `pauseNow`: what runs is asked to stop too, each step tried again on the
 * resume, and a pause that stands is kept as it was. Rejects with the api's refusal in full — the package's words for a store already
 * paused — or its own about the request.
 */
export const putPause = (why?: string, now?: boolean): Promise<PauseAnswer> =>
  send('POST', '/api/pause', PauseAnswerSchema, {
    body: { ...(why ? { why } : {}), ...(now ? { now: true } : {}) },
    may: now
      ? 'The store may be paused and what ran asked to stop: read the board again before pausing it again.'
      : 'The store may be paused: read the board again before pausing it again.',
  });

/**
 * Resumes the store, as the package's `resume` does: the next pass files what waits. Rejects as `putPause` does, for a store none stands
 * on.
 */
export const resumePause = (): Promise<{ pause: Pause }> =>
  send('DELETE', '/api/pause', PauseAnswerSchema, {
    body: {},
    may: 'The store may be resumed: read the board again before resuming it again.',
  });
