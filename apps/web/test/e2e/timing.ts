/**
 * What a page cost in a run of the e2e. A page's time is split into the phases `visit` (visit.ts) goes through; a run ranks its slowest
 * pages last, and says each worker's time. Nothing here refuses a run: the run's own time, which is as long as the workers the machine
 * gave it, is said past `E2E_BOUND_MS` (`pastTool`). Pure: `e2e-timing.test.ts` holds it with times it makes up, never a wait.
 */

/** The phases of one visit, in the order `visit` goes through them. */
export const PHASES = ['load', 'idle', 'expect', 'quiet', 'settle', 'picture'] as const;
export type Phase = (typeof PHASES)[number];

/** One page in one theme: its name, the theme, the worker that visited it, its whole time and each phase's, in milliseconds. */
export type PageTiming = { name: string; theme: string; worker: number; ms: number; phases: Record<Phase, number> };

/**
 * The time of a whole run that keeps it well under the ten minutes a step's Bash tool gives one command: said when passed (`pastTool`),
 * refused by nothing.
 */
export const E2E_BOUND_MS = 480_000;

const seconds = (ms: number) => `${(ms / 1000).toFixed(1)} s`;

/** The `k` slowest of `timings`, slowest first; the list given is left as it was. */
export const slowest = (timings: readonly PageTiming[], k: number) =>
  [...timings].sort((a, b) => b.ms - a.ms).slice(0, k) satisfies PageTiming[];

/** A page's time and its phases, on one line: `5.8 s (load 0.4 s, idle 0.6 s, …)`. */
export const costLine = (timing: Pick<PageTiming, 'ms' | 'phases'>) =>
  `${seconds(timing.ms)} (${PHASES.map((phase) => `${phase} ${seconds(timing.phases[phase])}`).join(', ')})`;

/** The `k` slowest pages, a line each: the page, its theme, its worker, its time and its phases. */
export const rankLines = (timings: readonly PageTiming[], k: number) =>
  slowest(timings, k).map((t) => `${t.name} (${t.theme}, worker ${t.worker}): ${costLine(t)}`) satisfies string[];

/**
 * What a `whole` run that passed says of the `totalMs` it took over `workers` workers, or null when that is within `boundMs`, or the run
 * is not whole: the time is the machine's, and a session runs the pages its change touches. Said, never a refusal.
 */
export function pastTool(totalMs: number, workers: number, whole: boolean, boundMs = E2E_BOUND_MS) {
  if (!whole || totalMs <= boundMs) return null satisfies string | null;
  return (`the whole e2e took ${seconds(totalMs)} over ${workers} worker${workers > 1 ? 's' : ''}, past the ${seconds(boundMs)} that keeps it ` +
    "well under a step's ten-minute tool. The time is the machine's, which gave it " +
    `${workers > 1 ? 'those workers' : 'that worker'}, not the work's: a session runs the pages its change touches (--pages <name,…>).`) satisfies
    | string
    | null;
}
