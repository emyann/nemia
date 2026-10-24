/**
 * Nemia, the store's own agent (`GET` and `PUT /api/level`, `GET /api/nemia/memory` and `GET /api/nemia/memory/:fact`, the api's
 * `nemia/nemia.ts` and the route its command table generates): her level, her session, and the facts she keeps, read and never written.
 */
import { queryOptions } from '@tanstack/react-query';
import { Schema } from 'effect';
import { decodes } from './decodes.ts';
import { pace } from '../feed.ts';
import { BridgeSchema, type Bridge } from './bridge.ts';
import { get, ReadRefusal, send } from './read.ts';

/** Mirrors the package's `Level`: Manual, her session stopped; Semi-auto, her session kept, what waits on a person asked of them. */
export type Level = 'manual' | 'semi-auto' | 'auto';

/** Mirrors the package's `Spend`: what her ended sessions cost, how many were measured, and how many were not. */
export type Spend = { usd: number; measured: number; unmeasured: number };

/** Mirrors the package's `Raise`: the level a factory is raised to, until the moment `until`. */
export type Raise = { level: Level; until: string };

/**
 * Mirrors the package's `FactoryLevel`: a factory's `level` in force, its `default` (its own, else the store's), its `own` default (null
 * where it follows the store's) and the `raise` in force, null where none is.
 */
export type FactoryLevel = { factory: string; level: Level; default: Level; own: Level | null; raise: Raise | null };

/**
 * Mirrors the package's `NemiaLevel`: her `level`, the store's, and since when; each factory's level (`factories`); her task, its phase
 * and its session where one is filed; the lines that reach her session (`reach`), and her web link where her session is bridged
 * (`bridge`, null where not); whether it was stopped from outside (`stopped`); what her sessions cost (`spend`, null where none is
 * filed); the allow rules a person gave her at a prompt (`allows`); and the line a person runs once in a terminal so her harness trusts
 * her folder (`trust`), null where it does: until it does, her session waits.
 */
export type NemiaLevel = {
  level: Level;
  since: string | null;
  task: string | null;
  phase: string | null;
  sessionId: string | null;
  reach: readonly string[];
  bridge: Bridge | null;
  stopped: boolean;
  spend: Spend | null;
  allows: readonly string[];
  factories: readonly FactoryLevel[];
  trust: string | null;
};

/** Mirrors the package's `NemiaMemory`: the folder she keeps her facts in, their names, and the words of the one asked, if any. */
export type NemiaMemory = { dir: string; facts: readonly string[]; fact: { name: string; text: string } | null };

/** Decodes a `Level`. */
const LevelSchema = Schema.Literals(['manual', 'semi-auto', 'auto']);

/** Decodes a `FactoryLevel`. */
const FactoryLevelSchema = decodes<FactoryLevel>()(
  Schema.Struct({
    factory: Schema.String,
    level: LevelSchema,
    default: LevelSchema,
    own: Schema.NullOr(LevelSchema),
    raise: Schema.NullOr(Schema.Struct({ level: LevelSchema, until: Schema.String })),
  }),
);

/** Decodes a `NemiaLevel`. */
const NemiaLevelSchema = decodes<NemiaLevel>()(
  Schema.Struct({
    level: LevelSchema,
    since: Schema.NullOr(Schema.String),
    task: Schema.NullOr(Schema.String),
    phase: Schema.NullOr(Schema.String),
    sessionId: Schema.NullOr(Schema.String),
    reach: Schema.Array(Schema.String),
    bridge: Schema.NullOr(BridgeSchema),
    stopped: Schema.Boolean,
    spend: Schema.NullOr(Schema.Struct({ usd: Schema.Number, measured: Schema.Number, unmeasured: Schema.Number })),
    allows: Schema.Array(Schema.String),
    factories: Schema.Array(FactoryLevelSchema),
    trust: Schema.NullOr(Schema.String),
  }),
);

/** Decodes a `NemiaMemory`. */
const NemiaMemorySchema = decodes<NemiaMemory>()(
  Schema.Struct({
    dir: Schema.String,
    facts: Schema.Array(Schema.String),
    fact: Schema.NullOr(Schema.Struct({ name: Schema.String, text: Schema.String })),
  }),
);

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
 * A write of a level, as the package's level command takes it: the store's `level` alone; a factory's default (`level` and `factory`); a
 * raise of a factory to `level` for the stretch `for` (`2h`); or its raise ended (`factory` and `end`).
 */
export type LevelAsk = { level?: Level; factory?: string; for?: string; end?: boolean };

/**
 * Sets a level, as the package's level command does: some factory put above Manual files her a session at the keeper's next beat, none
 * left above it stops it, and her folder not trusted holds her session until it is (`trust`). Resolves with where she is after the
 * write; rejects with the api's refusal in full, such as a raise that raises nothing.
 */
export const putLevel = (ask: LevelAsk): Promise<NemiaLevel> =>
  send('PUT', '/api/level', NemiaLevelSchema, {
    body: ask,
    may: 'A level may be written: read the levels again before setting it again.',
  });
