/**
 * The floor's gauges, as app.ts answers them: the cap on runs in flight, what the recent passes cost, the process's metrics, the store's
 * pause, the daemon, the feed and the quota.
 */
export { ceilingsOf, metricsOf, passesOf } from './ceilings.ts';
export type { MetricRead } from './ceilings.ts';
export { pauseNowOf, pauseOf } from './pause.ts';
export { readDaemon } from './daemon.ts';
export { feed } from './feed.ts';
export { QuotaAsker } from './quota.ts';
