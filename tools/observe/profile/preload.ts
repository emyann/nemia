/**
 * The preload a person names to profile a process into the side Pyroscope: `node --import tools/observe/profile/preload.ts src/main.ts`.
 * With no `PYROSCOPE_SERVER_ADDRESS` it imports nothing but `profiling.ts`, starts nothing and opens no connection. With one, it takes
 * the endpoint out of `process.env`, so a child the process starts inherits none, then imports the profiler from this folder and starts
 * its wall (with CPU time) and heap profiles. A profiler that cannot be loaded or started is said once on stderr and never stops the
 * process.
 */
import { ENDPOINT_KEY, PROFILER, profilingOf, type Profiling } from './profiling.ts';

/** The profiler's entry, as far as the preload calls it. */
type Profiler = { init: (options: Profiling) => void; start: () => void };

const profiling = profilingOf(process.env);
if (profiling) {
  delete process.env[ENDPOINT_KEY];
  try {
    const loaded = (await import(PROFILER)) as { default: Profiler };
    loaded.default.init(profiling);
    loaded.default.start();
  } catch (err) {
    console.error(
      `profile: not profiling, ${(err as Error).message}. Install the profiler with npm ci --prefix tools/observe/profile, ` +
        `or unset ${ENDPOINT_KEY}.`,
    );
  }
}
