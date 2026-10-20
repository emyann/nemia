/**
 * What a page cost in a run of the e2e, and the bound a whole run is held to. A page's time is split into the phases `visit` (visit.ts)
 * goes through; a run ranks its slowest pages last, and a whole run — every page, in the dark theme alone, as a check runs it — whose
 * pages cost more than `PAGES_BOUND_MS`, summed, fails, naming them (`overBound`): the sum is the work's, whichever workers drew the
 * pages — and whichever shards drew them, which is why a run of shards is summed by reading every shard's page times together
 * (`shardPages`), each shard being a run of some pages and held to nothing itself (`pages-bound.ts`). The run's own time, which is as
 * long as the workers the machine gave it, refuses nothing: past `E2E_BOUND_MS` it is said
 * (`pastTool`). Pure: `e2e-timing.test.ts` holds it with times it makes up, never a wait.
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

/** The workers a whole run's pages are counted at. */
export const BOUND_WORKERS = 4;

/** The most a whole run's pages may cost, summed: what `BOUND_WORKERS` workers draw inside `E2E_BOUND_MS`. */
export const PAGES_BOUND_MS = E2E_BOUND_MS * BOUND_WORKERS;

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
 * What one shard of a run wrote down: which shard it was of how many, and the page times it collected (`run.ts`, into `OUT`). A shard is
 * a run of some pages, so it is held to no bound of its own; the shards of one run together are the whole e2e, and are summed as one.
 */
export type ShardPages = { shard: number; of: number; pages: PageTiming[] };

/** The pages of every shard of `shards`, together: the pages of one whole run, for `overBound` and `pagesLine` to read as one. */
export const shardPages = (shards: readonly ShardPages[]): PageTiming[] => shards.flatMap((shard) => shard.pages);

/** One or several, written out with `and`: `3`, `1 and 2`, `1, 2 and 4`. */
const listed = (ns: readonly number[]): string => (ns.length < 2 ? String(ns[0]) : `${ns.slice(0, -1).join(', ')} and ${ns.at(-1)}`);

/**
 * Why `shards` are not the shards of one whole run, or null when they are: none at all, a shard that wrote its times twice, a shard
 * outside 1..of, shards that disagree about how many there are, and a shard that wrote nothing. Each of those would sum less than the
 * whole e2e and pass, which is the worst way for the bound to be wrong, so each is a sentence naming what to run or what to delete.
 */
export function shardsMissing(shards: readonly ShardPages[]): string | null {
  if (!shards.length)
    return (
      'no shard of the e2e wrote its page times here: run `npm run e2e -- --shard <i> --of <n>` for every shard of n, ' +
      'each with WF_ARTIFACTS set to the directory it writes its pages-<i>-of-<n>.json into, and give this that directory'
    );
  const counts = [...new Set(shards.map((shard) => shard.of))].sort((a, b) => a - b);
  if (counts.length > 1)
    return (
      `the shard files here disagree about how many shards there are (${listed(counts)}), so they are of two different runs ` +
      'and their pages are no one run\u2019s: delete the ones left over, and give this one run\u2019s shards alone'
    );
  const of = counts[0];
  const stray = shards.find((shard) => shard.shard < 1 || shard.shard > of);
  if (stray)
    return (
      `shard ${stray.shard} is no shard of ${of}, so the run it belongs to is not the one these files are of: ` +
      `give this one run\u2019s shards alone (pages-<i>-of-${of}.json, i from 1 to ${of})`
    );
  const twice = shards.map((shard) => shard.shard).find((i, at, all) => all.indexOf(i) !== at);
  if (twice !== undefined)
    return (
      `shard ${twice} of ${of} wrote its page times twice, and its pages would be counted twice in the sum: ` +
      'give this one run\u2019s shards alone, since a shard of a run is run once'
    );
  const here = new Set(shards.map((shard) => shard.shard));
  const absent = Array.from({ length: of }, (_, i) => i + 1).filter((i) => !here.has(i));
  if (absent.length)
    return (
      `shard${absent.length > 1 ? 's' : ''} ${listed(absent)} of ${of} wrote no page times here, so the pages ` +
      `${absent.length > 1 ? 'they' : 'it'} visited are in no sum and the e2e is held to less than the whole: run ` +
      `${absent.map((i) => `\`npm run e2e -- --shard ${i} --of ${of}\``).join(' and ')} and put ` +
      `${absent.map((i) => `pages-${i}-of-${of}.json`).join(' and ')} here`
    );
  return null;
}

/** What the pages of `timings` cost, summed, in milliseconds: the same whichever workers drew them. */
const summed = (timings: readonly PageTiming[]): number => timings.reduce((sum, t) => sum + t.ms, 0);

/** The line of a whole run's pages, summed, against the `boundMs` they are held to. */
export const pagesLine = (timings: readonly PageTiming[], boundMs = PAGES_BOUND_MS): string =>
  `the pages cost ${seconds(summed(timings))} summed, of the ${seconds(boundMs)} a whole run's are held to`;

/**
 * Why a run fails on its time, or null: only a `whole` run — every page, in the dark theme alone, the run a check makes — is held to
 * `boundMs`, by what its pages cost summed, and refused only past it, naming its slowest pages, slowest first, and what to do. The
 * workers that drew the pages and the time the run took change nothing. A run of some pages, or one that pictures them, takes as long as
 * it is asked to.
 */
export function overBound(timings: readonly PageTiming[], whole: boolean, boundMs = PAGES_BOUND_MS): string | null {
  const sum = summed(timings);
  if (!whole || sum <= boundMs) return null;
  return (
    `the pages of the whole e2e cost ${seconds(sum)} summed, over their bound of ${seconds(boundMs)}: ` +
    `at ${BOUND_WORKERS} workers that is ${seconds(sum / BOUND_WORKERS)} at least, ` +
    `against the ${seconds(boundMs / BOUND_WORKERS)} that keeps a whole run well under a step's ten-minute tool. ` +
    `Its slowest pages:\n    ${rankLines(timings, NAMED).join('\n    ')}\n` +
    "  Make those pages faster: more workers change no page's time. If other checks ran beside it on a loaded machine, " +
    "the time is the machine's, not the work's: run the check again, `nemia retry <run> <step> --recheck`."
  );
}

/**
 * What a `whole` run that passed says of the `totalMs` it took over `workers` workers, or null when that is within `boundMs`, or the run
 * is not whole: the time is the machine's, and a session runs the pages its change touches. Said, never a refusal.
 */
export function pastTool(totalMs: number, workers: number, whole: boolean, boundMs = E2E_BOUND_MS): string | null {
  if (!whole || totalMs <= boundMs) return null;
  return (
    `the whole e2e took ${seconds(totalMs)} over ${workers} worker${workers > 1 ? 's' : ''}, past the ${seconds(boundMs)} that keeps it ` +
    "well under a step's ten-minute tool. The time is the machine's, which gave it " +
    `${workers > 1 ? 'those workers' : 'that worker'}, not the work's: a session runs the pages its change touches (--pages <name,…>).`
  );
}
