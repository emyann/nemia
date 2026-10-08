/**
 * What a page cost in a run of the e2e, and the bound a whole run is held to. A page's time is split into the phases `visit` (visit.ts)
 * goes through; a run ranks its slowest pages last, and a whole run — every page, in the dark theme alone, as a check runs it — that takes
 * longer than `E2E_BOUND_MS` fails, naming them (`overBound`), so the e2e cannot creep back past a step's ten-minute tool unnoticed. Pure:
 * `e2e-timing.test.ts` holds it with times it makes up, never a wait.
 */

/** The phases of one visit, in the order `visit` goes through them. */
export const PHASES = ['load', 'idle', 'expect', 'quiet', 'settle', 'picture'] as const;
export type Phase = (typeof PHASES)[number];

/** One page in one theme: its name, the theme, the worker that visited it, its whole time and each phase's, in milliseconds. */
export type PageTiming = { name: string; theme: string; worker: number; ms: number; phases: Record<Phase, number> };

/** The longest a whole run may take: well under the ten minutes a step's Bash tool gives one command. */
export const E2E_BOUND_MS = 480_000;

/** How many of the slowest pages a refusal names. */
const NAMED = 5;

const seconds = (ms: number): string => `${(ms / 1000).toFixed(1)} s`;

/** The `k` slowest of `timings`, slowest first; the list given is left as it was. */
export const slowest = (timings: readonly PageTiming[], k: number): PageTiming[] => [...timings].sort((a, b) => b.ms - a.ms).slice(0, k);

/** A page's time and its phases, on one line: `5.8 s (load 0.4 s, idle 0.6 s, …)`. */
export const costLine = (timing: Pick<PageTiming, 'ms' | 'phases'>): string =>
  `${seconds(timing.ms)} (${PHASES.map((phase) => `${phase} ${seconds(timing.phases[phase])}`).join(', ')})`;

/** The `k` slowest pages, a line each: the page, its theme, its worker, its time and its phases. */
export const rankLines = (timings: readonly PageTiming[], k: number): string[] =>
  slowest(timings, k).map((t) => `${t.name} (${t.theme}, worker ${t.worker}): ${costLine(t)}`);

/**
 * Why a run that took `totalMs` fails on its time, or null: only a `whole` run — every page, in the dark theme alone, the run a check
 * makes — is held to `boundMs`, and refused only past it, naming its slowest pages, slowest first, and what to do. A run of some pages, or
 * one that pictures them, takes as long as it is asked to.
 */
export function overBound(totalMs: number, timings: readonly PageTiming[], whole: boolean, boundMs = E2E_BOUND_MS): string | null {
  if (!whole || totalMs <= boundMs) return null;
  return (
    `the whole e2e took ${seconds(totalMs)}, over its bound of ${seconds(boundMs)}, which keeps it well under a step's ten-minute tool. ` +
    `Its slowest pages:\n    ${rankLines(timings, NAMED).join('\n    ')}\n` +
    '  Make those pages faster, or give the e2e more workers (--workers <n>). If other checks ran beside it on a loaded machine, ' +
    "the time is the machine's, not the work's: run the check again, `nemia retry <run> <step> --recheck`."
  );
}
