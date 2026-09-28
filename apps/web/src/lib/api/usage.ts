/** What sessions consumed, in `wf decide`'s words (apps/api/src/usage.ts). */

/** Mirrors `Usage` in apps/api/src/usage.ts: a count nobody measured is absent, never 0. */
export type Usage = {
  turns?: number;
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

/** Where a peak context stands: at the step's `context:` cap, or past 200k on a step with none. */
export type PeakMark = 'cap' | 'large' | null;

/**
 * Mirrors `StepUsed` in apps/api/src/usage.ts: the usage, and `wf decide`'s words for it — `used` and `cost`, `not measured` where nobody
 * counted — and the engine's cost, api time and tool time off it, each null where nobody measured it. `read` is what the sessions read, by
 * price, in `wf decide`'s words (`read 21.4M · wrote 412k · peak 167k`), null where nothing measured it; `peak` where its peak stands; and
 * `rebuilt` how many resumed sessions wrote their context to the cache again.
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

/** Mirrors `RunRead` in apps/api/src/usage.ts: what a run's sessions read, by price, in words, where its peak stands, and how many rebuilt their cache. */
export type RunRead = { said: string; peak: PeakMark; rebuilt: number };
