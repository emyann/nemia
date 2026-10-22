/**
 * The detached worker's two shipped bounds, named once: the spawn writes them onto every plan (`detachedOps`), and the worker
 * (`bin/ae-worker.ts`) falls back to them for a run file written before plans carried them. Imports nothing, as the worker does.
 */

/** How long a harness told to stop has to end on SIGTERM before what is left of its group is killed. */
export const WORKER_STOP_GRACE_MS = 5_000;

/** How often a worker rewrites its run file when nothing else moves it: its heartbeat, which `STALE_MS` leases. */
export const WORKER_BEAT_MS = 5_000;
