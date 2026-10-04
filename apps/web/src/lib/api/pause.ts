/** The store's pause (`GET`, `POST` and `DELETE /api/pause`, the package's `paused`, `pause` and `resume`). */
import { queryOptions } from '@tanstack/react-query';
import { pace } from '../feed.ts';
import { Schema } from 'effect';
import { get, send } from './read.ts';

/** Mirrors the package's `Pause`: since when (ISO), by whom, and why, when a reason was given. Empty where its file no longer says. */
export type Pause = { at: string; by: string; why?: string };

/** Mirrors the package's `PauseStaged`: a run whose ending has its merge staged in `repo`'s checkout, its check held by the pause. */
export type PauseStaged = { run: string; step: string; repo: string };

/** Mirrors the package's `Finishing`: `run`'s `step`, still at work under the pause, as a session, a check, or a landing's check. */
export type Finishing = { run: string; step: string; kind: 'session' | 'check' | 'landing' };

/**
 * Mirrors the package's `Paused`: the pause, null where none stands; each task still finishing under it, none once it is Paused; and each
 * landing it holds with its merge staged.
 */
export type Paused = { pause: Pause | null; finishing: readonly Finishing[]; staged: readonly PauseStaged[] };

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
    Schema.Struct({ run: Schema.String, step: Schema.String, kind: Schema.Literals(['session', 'check', 'landing']) }),
  ),
  staged: Schema.Array(Schema.Struct({ run: Schema.String, step: Schema.String, repo: Schema.String })),
}) satisfies Schema.Schema<Paused>;

/** Decodes what a pause or a lift answers: the pause put, or the one lifted. */
const PauseAnswerSchema = Schema.Struct({ pause: PauseSchema }) satisfies Schema.Schema<{ pause: Pause }>;

/** Whether the store is paused, and what finishes under it: polled at `pace`, since the feed says nothing of either. */
export const pauseQuery = queryOptions({
  queryKey: ['pause'],
  queryFn: () => get('/api/pause', PausedSchema),
  refetchInterval: () => pace(5_000),
});

/**
 * Pauses the store, as the package's `pause` does, saying `why` when given: from the next pass nothing new starts, and what runs
 * finishes. Rejects with the api's refusal in full — the package's words for a store already paused — or its own about the request.
 */
export const putPause = (why?: string): Promise<{ pause: Pause }> =>
  send('POST', '/api/pause', PauseAnswerSchema, {
    body: why ? { why } : {},
    may: 'The store may be paused: read the board again before pausing it again.',
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
