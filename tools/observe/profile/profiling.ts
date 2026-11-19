/**
 * Whether a process is profiled into the side Pyroscope, and how, read from its environment alone: `profilingOf` answers the options the
 * profiler is started with, or `undefined` when `PYROSCOPE_SERVER_ADDRESS` is unset or blank. It imports nothing, so the preload that
 * reads it loads nothing more when the answer is no.
 */

/** The profiler the preload imports, from this folder's own `node_modules` (`npm ci --prefix tools/observe/profile`). */
export const PROFILER = '@pyroscope/nodejs';

/** The variable that names the Pyroscope to send to; without it nothing is profiled. */
export const ENDPOINT_KEY = 'PYROSCOPE_SERVER_ADDRESS';

/** The service a profile is filed under when `OTEL_SERVICE_NAME` names none: the one the daemon's traces use by default. */
export const DEFAULT_SERVICE = 'nemia';

/** How often a profile is sent, in milliseconds: often enough that a flame graph over a few minutes of passes is there to read. */
export const FLUSH_MS = 15_000;

/** The options the profiler's `init` takes, as far as the preload gives them. */
export type Profiling = {
  serverAddress: string;
  appName: string;
  flushIntervalMs: number;
  wall: { collectCpuTime: boolean };
};

/**
 * What to profile with, from `env`: the endpoint without its trailing `/`, the service `OTEL_SERVICE_NAME` names (else
 * `DEFAULT_SERVICE`), wall time with its CPU time beside it, and the heap at the profiler's own sampling interval.
 * @returns `undefined` when `PYROSCOPE_SERVER_ADDRESS` is unset or blank, so nothing is started.
 */
export function profilingOf(env: Readonly<Record<string, string | undefined>>): Profiling | undefined {
  const endpoint = env[ENDPOINT_KEY]?.trim().replace(/\/+$/, '');
  if (!endpoint) return undefined;
  return {
    serverAddress: endpoint,
    appName: env.OTEL_SERVICE_NAME?.trim() || DEFAULT_SERVICE,
    flushIntervalMs: FLUSH_MS,
    wall: { collectCpuTime: true },
  };
}
