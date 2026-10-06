/**
 * Nemia, the store's own agent (`GET` and `PUT /api/level`, `GET /api/nemia/memory` and `GET /api/nemia/memory/:fact`, the api's
 * `nemia/nemia.ts` and the route its command table generates): her level, her session, and the facts she keeps, read and never written.
 */
import { queryOptions } from '@tanstack/react-query';
import { Schema } from 'effect';
import { pace } from '../feed.ts';
import { get, ReadRefusal, send } from './read.ts';

/** Mirrors the package's `Level`: Manual, her session stopped; Semi-auto, her session kept, what waits on a person asked of them. */
export type Level = 'manual' | 'semi-auto';

/** Mirrors the package's `Spend`: what her ended sessions cost, how many were measured, and how many were not. */
export type Spend = { usd: number; measured: number; unmeasured: number };

/**
 * Mirrors the package's `NemiaLevel`: her `level` and since when; her task, its phase and its session where one is filed; the lines that
 * reach her session (`reach`); whether it was stopped from outside (`stopped`); what her sessions cost (`spend`, null where none is
 * filed); and the allow rules a person gave her at a prompt (`allows`).
 */
export type NemiaLevel = {
  level: Level;
  since: string | null;
  task: string | null;
  phase: string | null;
  sessionId: string | null;
  reach: readonly string[];
  stopped: boolean;
  spend: Spend | null;
  allows: readonly string[];
};

/** Mirrors the package's `NemiaMemory`: the folder she keeps her facts in, their names, and the words of the one asked, if any. */
export type NemiaMemory = { dir: string; facts: readonly string[]; fact: { name: string; text: string } | null };

/** Decodes a `NemiaLevel`. */
const NemiaLevelSchema = Schema.Struct({
  level: Schema.Literals(['manual', 'semi-auto']),
  since: Schema.NullOr(Schema.String),
  task: Schema.NullOr(Schema.String),
  phase: Schema.NullOr(Schema.String),
  sessionId: Schema.NullOr(Schema.String),
  reach: Schema.Array(Schema.String),
  stopped: Schema.Boolean,
  spend: Schema.NullOr(Schema.Struct({ usd: Schema.Number, measured: Schema.Number, unmeasured: Schema.Number })),
  allows: Schema.Array(Schema.String),
}) satisfies Schema.Schema<NemiaLevel>;

/** Decodes a `NemiaMemory`. */
const NemiaMemorySchema = Schema.Struct({
  dir: Schema.String,
  facts: Schema.Array(Schema.String),
  fact: Schema.NullOr(Schema.Struct({ name: Schema.String, text: Schema.String })),
}) satisfies Schema.Schema<NemiaMemory>;

/** Where Nemia is: polled at `pace`, the keeper's beat, since the feed says nothing of her session. */
export const levelQuery = queryOptions({
  queryKey: ['nemia', 'level'],
  queryFn: () => get('/api/level', NemiaLevelSchema),
  refetchInterval: () => pace(5_000),
});

/** The facts she keeps, by name: polled slowly, since only her session writes them. */
export const nemiaMemoryQuery = queryOptions({
  queryKey: ['nemia', 'memory'],
  queryFn: () => get('/api/nemia/memory', NemiaMemorySchema),
  refetchInterval: () => pace(30_000),
});

/** Every failure tried again three times, as react-query does by default, but a fact she no longer keeps: said at once. */
const retryFact = (failures: number, error: unknown): boolean => !(error instanceof ReadRefusal && error.status === 404) && failures < 3;

/** One fact's words, read when a person opens it, never polled. */
export const nemiaFactQuery = (name: string) =>
  queryOptions({
    queryKey: ['nemia', 'memory', name],
    queryFn: () => get(`/api/nemia/memory/${encodeURIComponent(name)}`, NemiaMemorySchema),
    retry: retryFact,
  });

/**
 * Sets her level, as the package's level command does: Semi-auto files her a session at the keeper's next beat, Manual stops it. Resolves
 * with where she is after the write; rejects with the api's refusal in full — her folder not trusted, naming what trusts it.
 */
export const putLevel = (level: Level): Promise<NemiaLevel> =>
  send('PUT', '/api/level', NemiaLevelSchema, {
    body: { level },
    may: 'Her level may be written: read her state again before setting it again.',
  });
