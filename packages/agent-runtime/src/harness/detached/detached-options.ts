/** What a detached runner is given beside its spec and root (`detachedOps`): how its workers run. */
import { STALE_MS } from './run-file.ts';
import { WORKER_BEAT_MS, WORKER_STOP_GRACE_MS } from './worker-bounds.ts';

/**
 * How a detached runner's workers run: their stop grace (`stopGraceMs`, default `WORKER_STOP_GRACE_MS`) and their heartbeat
 * (`beatMs`, default `WORKER_BEAT_MS`), written onto every plan for the worker to read. Options so that a test of a stop or a
 * heartbeat shortens them rather than waiting the shipped bounds out (`test/detached.test.ts`).
 */
export type DetachedOptions = { stopGraceMs?: number; beatMs?: number };

/**
 * The bounds `options` give, each defaulted to the shipped one. Throws a `RangeError` for a beat not above 0 and under `STALE_MS`:
 * the lease would read a live worker beating so as dead.
 */
export function workerBoundsOf(options: DetachedOptions): { stopGraceMs: number; beatMs: number } {
  const stopGraceMs = options.stopGraceMs ?? WORKER_STOP_GRACE_MS;
  const beatMs = options.beatMs ?? WORKER_BEAT_MS;
  if (!(beatMs > 0 && beatMs < STALE_MS))
    throw new RangeError(`detachedOps: beatMs ${beatMs} must be above 0 and under STALE_MS (${STALE_MS}): give a shorter beat, or none`);
  return { stopGraceMs, beatMs };
}
