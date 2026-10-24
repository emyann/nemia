/** The subscription's quota (`GET /api/quota`, apps/api/src/factory/quota.ts). */
import { queryOptions } from '@tanstack/react-query';
import { Schema } from 'effect';
import { decodes } from './decodes.ts';
import { get } from './read.ts';

/**
 * Mirrors `QuotaWindow` in apps/api/src/factory/quota.ts: one limit of the subscription as Claude Code reported it — `key` Claude Code's,
 * `label` the board's word, `resetsAt` ISO, `reset` whether that time has passed since the answer, `marked` whether it is used past
 * `Quota.markAt`.
 */
export type QuotaWindow = { key: string; label: string; usedPercentage: number; resetsAt: string | null; reset: boolean; marked: boolean };

/** Decodes a `QuotaWindow`. */
const QuotaWindowSchema = decodes<QuotaWindow>()(
  Schema.Struct({
    key: Schema.String,
    label: Schema.String,
    usedPercentage: Schema.Number,
    resetsAt: Schema.NullOr(Schema.String),
    reset: Schema.Boolean,
    marked: Schema.Boolean,
  }),
);

/** A list of windows, as a decoded answer holds it. */
const QuotaWindowsSchema = Schema.mutable(Schema.Array(QuotaWindowSchema));

/**
 * Mirrors `Quota` in apps/api/src/factory/quota.ts: the plan's usage as the api last asked Claude Code for it (`get_usage`), judged at the
 * request — `fresh` to show, `asking`, or `no-plan`, `unanswered` (signed in, and Anthropic's usage service gave nothing), `no-claude`,
 * `timeout`, `failed` or `unknown`, each with `said`, the sentence to show in its place. `last` is the last answer with windows, up to six
 * hours old, shown dimmed with its time; `againAt` when a read will next ask; `keepMs` how long a good reading is kept.
 */
export type Quota = {
  state: 'fresh' | 'asking' | 'no-plan' | 'unanswered' | 'no-claude' | 'timeout' | 'failed' | 'unknown';
  askedAt: string | null;
  ageMs: number | null;
  againAt: string | null;
  subscription: string | null;
  windows: QuotaWindow[];
  last: { askedAt: string; windows: QuotaWindow[] } | null;
  keepMs: number;
  markAt: number;
  said: string | null;
};

/** Decodes a `Quota`. */
const QuotaSchema = decodes<Quota>()(
  Schema.Struct({
    state: Schema.Literals(['fresh', 'asking', 'no-plan', 'unanswered', 'no-claude', 'timeout', 'failed', 'unknown']),
    askedAt: Schema.NullOr(Schema.String),
    ageMs: Schema.NullOr(Schema.Number),
    againAt: Schema.NullOr(Schema.String),
    subscription: Schema.NullOr(Schema.String),
    windows: QuotaWindowsSchema,
    last: Schema.NullOr(Schema.Struct({ askedAt: Schema.String, windows: QuotaWindowsSchema })),
    keepMs: Schema.Number,
    markAt: Schema.Number,
    said: Schema.NullOr(Schema.String),
  }),
);

/**
 * The subscription's quota, read again every minute — the api asks Claude Code at most once a keep, however often it is read — and every
 * 2 s while the api is still asking.
 */
export const quotaQuery = queryOptions({
  queryKey: ['quota'],
  queryFn: () => get('/api/quota', QuotaSchema),
  refetchInterval: (query) => (query.state.data?.state === 'asking' ? 2_000 : 60_000),
});
