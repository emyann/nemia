/** The store's cordon (`GET`, `POST` and `DELETE /api/cordon`, the package's `cordoned`, `cordon` and `uncordon`). */
import { queryOptions } from '@tanstack/react-query';
import { pace } from '../feed.ts';
import { Schema } from 'effect';
import { get, send } from './read.ts';

/** Mirrors the package's `Cordon`: since when (ISO), by whom, and why, when a reason was given. Empty where its file no longer says. */
export type Cordon = { at: string; by: string; why?: string };

/** Mirrors the package's `CordonStaged`: a run whose ending has its merge staged in `repo`'s checkout, its check held by the cordon. */
export type CordonStaged = { run: string; step: string; repo: string };

/** Mirrors the package's `Cordoned`: the cordon, null where none stands, and each landing it holds with its merge staged. */
export type Cordoned = { cordon: Cordon | null; staged: readonly CordonStaged[] };

/** Decodes a `Cordon`. */
const CordonSchema = Schema.Struct({
  at: Schema.String,
  by: Schema.String,
  why: Schema.optional(Schema.String),
}) satisfies Schema.Schema<Cordon>;

/** Decodes a `Cordoned`. */
const CordonedSchema = Schema.Struct({
  cordon: Schema.NullOr(CordonSchema),
  staged: Schema.Array(Schema.Struct({ run: Schema.String, step: Schema.String, repo: Schema.String })),
}) satisfies Schema.Schema<Cordoned>;

/** Decodes what a cordon or a lift answers: the cordon put, or the one lifted. */
const CordonAnswerSchema = Schema.Struct({ cordon: CordonSchema }) satisfies Schema.Schema<{ cordon: Cordon }>;

/** Whether the store is cordoned: polled at `pace`, since the feed says nothing of a cordon put or lifted. */
export const cordonQuery = queryOptions({
  queryKey: ['cordon'],
  queryFn: () => get('/api/cordon', CordonedSchema),
  refetchInterval: () => pace(5_000),
});

/**
 * Cordons the store, as the package's `cordon` does: from the next pass nothing new starts, and what runs finishes. Rejects with the api's refusal
 * in full — the package's words for a store already cordoned — or its own about the request.
 */
export const putCordon = (): Promise<{ cordon: Cordon }> =>
  send('POST', '/api/cordon', CordonAnswerSchema, {
    body: {},
    may: 'The store may be cordoned: read the board again before cordoning it again.',
  });

/** Lifts the store's cordon, as the package's `uncordon` does: the next pass files what waits. Rejects as `putCordon` does, for a store none stands on. */
export const liftCordon = (): Promise<{ cordon: Cordon }> =>
  send('DELETE', '/api/cordon', CordonAnswerSchema, {
    body: {},
    may: 'The cordon may be lifted: read the board again before lifting it again.',
  });
