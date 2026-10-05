/**
 * The words of what the last pass cost, beside the cap over the Factory's floor (`PassCost`, served with the ceilings):
 * `a pass takes 212 ms`, and the breakdown `wf up --stats` prints, as its title. Pure: the time and the time zone are handed in, the
 * browser's own on the page.
 */
import type { PassCost, PassPhase } from './api';
import { clockWord } from './quota.ts';

/** The phases in the order the package prints them (`PHASES` in agent-orchestrator's meter.ts). */
export const PASS_PHASES: readonly PassPhase[] = ['records', 'asks', 'journals', 'observe', 'runtime', 'git', 'assess', 'act'];

/** A time in ms as the package says it: whole from 100, one place from 10, two below. */
export const msWord = (ms: number): string => (ms >= 100 ? `${Math.round(ms)}` : ms >= 10 ? ms.toFixed(1) : ms.toFixed(2));

/** Bytes as a person reads them: `812 B`, `14.2 kB`, `3.1 MB`. */
export const bytesWord = (n: number): string =>
  n < 1000 ? `${n} B` : n < 1_000_000 ? `${(n / 1000).toFixed(1)} kB` : `${(n / 1_000_000).toFixed(1)} MB`;

const plural = (n: number, one: string, many = `${one}s`): string => `${n} ${n === 1 ? one : many}`;

/** The line over the floor: `a pass takes 212 ms`. */
export const passLine = (pass: Pick<PassCost, 'ms'>): string => `a pass takes ${msWord(pass.ms)} ms`;

/**
 * The last pass whole, a line each: when it ran and its totals, each phase with its time, calls, bytes and processes, each harness
 * observed, and what measuring it took — the breakdown `wf up --stats` prints.
 */
export function passTitle(pass: PassCost, now: Date, timeZone?: string): string {
  const phases = PASS_PHASES.map((p) => {
    const c = pass.phases[p];
    return `${p}: ${msWord(c.ms)} ms, ${plural(c.calls, 'call')}, ${bytesWord(c.bytes)} read, ${plural(c.spawned, 'process', 'processes')} started`;
  });
  const harnesses = Object.entries(pass.harnesses)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(
      ([name, h]) =>
        `${name}: ${plural(h.calls, 'observe')}, ${msWord(h.ms)} ms, ${plural(h.listed, 'session or run file', 'sessions or run files')} listed, ${plural(h.spawned, 'process', 'processes')} started`,
    );
  return [
    `The daemon's last pass, at ${clockWord(new Date(pass.at), now, timeZone)}: ${msWord(pass.ms)} ms, ${plural(pass.records, 'run record')} read, ${bytesWord(pass.bytes)} read, ${plural(pass.spawned, 'process', 'processes')} started.`,
    ...phases,
    ...(harnesses.length ? ['Observed, by harness (at once, so their times overlap):', ...harnesses] : ['No harness was observed.']),
    `Measuring it took ${msWord(pass.overheadMs)} ms. wf up --stats says the same.`,
  ].join('\n');
}

/** A bucket of the recent passes' histogram, in words: `≤ 10 ms` up to its bound, `> 5000 ms` past the last bound (`le` null). */
export const bucketWord = (le: number | null, bounds: readonly number[]): string =>
  le === null ? `> ${bounds.at(-1) ?? 0} ms` : `≤ ${le} ms`;

/** A bucket's label under its column, short enough for a narrow one: `250`, `2.5k`, `>5k` past the last bound (`le` null). */
export const bucketLabel = (le: number | null, bounds: readonly number[]): string => {
  const short = (ms: number) => (ms >= 1000 ? `${ms / 1000}k` : `${ms}`);
  return le === null ? `>${short(bounds.at(-1) ?? 0)}` : short(le);
};

/** A share of the whole as a person reads it: `37%`, `< 1%` for a part too small to round to one. */
export const shareWord = (share: number): string => (share > 0 && share < 0.005 ? '< 1%' : `${Math.round(share * 100)}%`);

/** What a pass saw, in words: `43 runs in the store, 3 tasks not settled, 1 queued and 2 admitted`. */
export const seenWords = (seen: { runs: number; tasks: number; queued: number; admitted: number }): string =>
  `${plural(seen.runs, 'run')} in the store, ${plural(seen.tasks, 'task')} not settled, ${seen.queued} queued and ${seen.admitted} admitted`;
