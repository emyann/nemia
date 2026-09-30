/** Whether a `wf up` ticks the store (`GET /api/daemon`, apps/api/src/factory/daemon.ts). */
import { queryOptions } from '@tanstack/react-query';
import { pace } from '../feed.ts';
import { Schema } from 'effect';
import { get } from './read.ts';

/**
 * Mirrors `Daemon` in apps/api/src/factory/daemon.ts: whether a `wf up` ticks the store, as the package judges `daemon.json` — `ticking`
 * alone moves the runs; `none`, `unreadable`, `stopped`, `gone` and `stalled` (alive, silent past `staleAfterMs`) do not. Times are ISO,
 * null where the file says none; `lastHeardAt` is the latest of its start, its last pass and its beat. `line` is `wf ls`'s own sentence.
 */
export type Daemon = {
  kind: 'none' | 'unreadable' | 'stopped' | 'gone' | 'stalled' | 'ticking';
  ticking: boolean;
  pid: number | null;
  cwd: string | null;
  every: number | null;
  startedAt: string | null;
  passedAt: string | null;
  lastHeardAt: string | null;
  stoppedAt: string | null;
  staleAfterMs: number | null;
  identity: 'same' | 'other' | 'unknown' | 'gone' | null;
  line: string;
};

/** Decodes a `Daemon`. */
const DaemonSchema = Schema.Struct({
  kind: Schema.Literals(['none', 'unreadable', 'stopped', 'gone', 'stalled', 'ticking']),
  ticking: Schema.Boolean,
  pid: Schema.NullOr(Schema.Number),
  cwd: Schema.NullOr(Schema.String),
  every: Schema.NullOr(Schema.Number),
  startedAt: Schema.NullOr(Schema.String),
  passedAt: Schema.NullOr(Schema.String),
  lastHeardAt: Schema.NullOr(Schema.String),
  stoppedAt: Schema.NullOr(Schema.String),
  staleAfterMs: Schema.NullOr(Schema.Number),
  identity: Schema.NullOr(Schema.Literals(['same', 'other', 'unknown', 'gone'])),
  line: Schema.String,
}) satisfies Schema.Schema<Daemon>;

/**
 * Whether a daemon ticks the store: polled at `pace`, the same fallback as the cap's, since the feed carries no pass of the daemon — a pass
 * writes a feed line only where a word changed, so the feed is no heartbeat.
 */
export const daemonQuery = queryOptions({
  queryKey: ['daemon'],
  queryFn: () => get('/api/daemon', DaemonSchema),
  refetchInterval: () => pace(5_000),
});
