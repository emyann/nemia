/** What sessions consumed, in the CLI `decide`'s words (apps/api/src/detail/usage.ts), each type with the schema `get` decodes it with. */
import { Schema } from 'effect';

/** Mirrors `Usage` in apps/api/src/detail/usage.ts: a count nobody measured is absent, never 0. */
export type Usage = {
  responses?: number;
  toolCalls?: number;
  inputTokens?: number;
  outputTokens?: number;
  costUsd?: number;
  apiMs?: number;
  toolMs?: number;
  cacheReadTokens?: number;
  cacheWriteTokens?: number;
  uncachedTokens?: number;
  peakContextTokens?: number;
  firstContextTokens?: number;
  firstCacheWriteTokens?: number;
  compactions?: number;
  rebuiltCaches?: number;
};

/** A count of a `Usage`: absent where nobody measured it. */
const Count = Schema.optionalKey(Schema.Number);

/** Decodes a `Usage`. */
export const UsageSchema = Schema.Struct({
  responses: Count,
  toolCalls: Count,
  inputTokens: Count,
  outputTokens: Count,
  costUsd: Count,
  apiMs: Count,
  toolMs: Count,
  cacheReadTokens: Count,
  cacheWriteTokens: Count,
  uncachedTokens: Count,
  peakContextTokens: Count,
  firstContextTokens: Count,
  firstCacheWriteTokens: Count,
  compactions: Count,
  rebuiltCaches: Count,
}) satisfies Schema.Schema<Usage>;

/** Where a peak context stands: at the step's `context:` cap, or past 200k on a step with none. */
export type PeakMark = 'cap' | 'large' | null;

/** Decodes a `PeakMark`. */
export const PeakMarkSchema = Schema.NullOr(Schema.Literals(['cap', 'large'])) satisfies Schema.Schema<PeakMark>;

/**
 * Mirrors `StepUsed` in apps/api/src/detail/usage.ts: the usage, and the CLI `decide`'s words for it — `used` and `cost`, `not measured`
 * where nobody counted — and the engine's cost, api time and tool time off it, each null where nobody measured it. `read` is what the
 * sessions read, by price, in the CLI `decide`'s words (`read 21.4M · wrote 412k · peak 167k`), null where nothing measured it; `peak`
 * where its peak stands; and `rebuilt` how many resumed sessions wrote their context to the cache again.
 */
export type StepUsed = {
  usage: Usage | null;
  used: string;
  cost: string;
  costUsd: number | null;
  apiMs: number | null;
  toolMs: number | null;
  read: string | null;
  peak: PeakMark;
  rebuilt: number;
};

/** Decodes a `StepUsed`. */
export const StepUsedSchema = Schema.Struct({
  usage: Schema.NullOr(UsageSchema),
  used: Schema.String,
  cost: Schema.String,
  costUsd: Schema.NullOr(Schema.Number),
  apiMs: Schema.NullOr(Schema.Number),
  toolMs: Schema.NullOr(Schema.Number),
  read: Schema.NullOr(Schema.String),
  peak: PeakMarkSchema,
  rebuilt: Schema.Number,
}) satisfies Schema.Schema<StepUsed>;

/**
 * Mirrors `RunRead` in apps/api/src/detail/usage.ts: what a run's sessions read, by price, in words, where its peak stands, and how many
 * rebuilt their cache.
 */
export type RunRead = { said: string; peak: PeakMark; rebuilt: number };

/** Decodes a `RunRead`. */
export const RunReadSchema = Schema.Struct({
  said: Schema.String,
  peak: PeakMarkSchema,
  rebuilt: Schema.Number,
}) satisfies Schema.Schema<RunRead>;
