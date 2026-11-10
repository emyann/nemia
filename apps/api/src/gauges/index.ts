/**
 * The floor's gauges, as the server group answers them (server/server.ts): the cap on runs in flight, the process's metrics, the daemon,
 * the feed and the quota.
 */
export { ceilingsOf, metricsOf } from './ceilings.ts';
export type { Ceilings, MetricRead } from './ceilings.ts';
export { readDaemon } from './daemon.ts';
export { feedOpened } from './feed.ts';
export { QuotaAsker } from './quota.ts';
