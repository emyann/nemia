/**
 * What a waiting run's three tiles break down, each from the light answer's own numbers: where its wall time went, what each step cost,
 * and its tokens by kind. A breakdown adds up to its tile: its parts, then a last line for what no part covers, absent when that is
 * nothing. Pure.
 */
import type { RunTokens, Spent } from './api/judged.ts';
import type { RunClock, StepCost } from './api/runs.ts';
import { sinceCreated, sinceWords } from './runWords.ts';

/** One line of a breakdown: what it counts, how much in the tile's own unit, how the page says it, and whether it says there is none. */
export type BreakdownRow = { what: string; amount: number; said: string; none: boolean };

/** A tile's breakdown: its headline, its rows, which add up to the tile, and a closing note, empty for none. */
export type Breakdown = { head: string; rows: BreakdownRow[]; foot: string };

/**
 * `parts` in whole `unit`s that add up to `total` units: each part floored, then the units still owed handed one each to the parts
 * that lost the most by it, the earliest first among equals, to a millionth of a unit.
 */
export function shared(parts: readonly number[], unit: number, total: number): number[] {
  const floors = parts.map((part) => Math.floor(part / unit));
  const owed = total - floors.reduce((sum, n) => sum + n, 0);
  const lost = (part: number, i: number): number => Math.round((part / unit - floors[i]) * 1e6);
  const byLoss = parts.map((part, i) => ({ i, lost: lost(part, i) })).sort((a, b) => b.lost - a.lost || a.i - b.i);
  for (const { i } of byLoss.slice(0, Math.max(0, owed))) floors[i] += 1;
  return floors;
}

/** What a part of the clock says for `minutes` whole minutes of `ms`: `none`, `under 1m`, or the minutes as the tile says them. */
const minutesSaid = (ms: number, minutes: number): string => (ms <= 0 ? 'none' : minutes < 1 ? 'under 1m' : sinceWords(minutes * 60_000));

/** The clock's last line: the time none of its four parts covers. */
export const CLOCK_REST = 'Everything else';

/**
 * Where a run's wall time went: sessions, checks, the wait on a person, the wait for a slot, and a last line for the rest, absent when
 * it is nothing. The rows' numbers add up to `clock.wallMs`, and their minutes to the tile's. `from` is when the run was created, as
 * the page says a time.
 */
export function clockBreakdown(clock: RunClock, from: string): Breakdown {
  const parts: Array<[string, number]> = [
    ['Sessions at work', clock.sessionsMs],
    ['Checks running', clock.checksMs],
    ['Waiting on you', clock.personMs],
    ['Queued for a slot', clock.slotMs],
    ...(clock.restMs === 0 ? [] : [[CLOCK_REST, clock.restMs] as [string, number]]),
  ];
  const minutes = shared(
    parts.map(([, ms]) => ms),
    60_000,
    Math.floor(Math.max(0, clock.wallMs) / 60_000),
  );
  return {
    head: sinceCreated(clock.wallMs),
    rows: parts.map(([what, ms], i) => ({ what, amount: ms, said: minutesSaid(ms, minutes[i]), none: ms <= 0 })),
    foot: `Wall time, from ${from}.`,
  };
}

/** Dollars from whole cents: `$5.63`. */
const dollars = (cents: number): string => `${cents < 0 ? '-' : ''}$${(Math.abs(cents) / 100).toFixed(2)}`;

/** The cost's last line: what the run cost beyond its steps' own costs. */
export const COST_REST = 'Outside its steps';

/**
 * What each step cost, in the answer's order, `none measured` for a step no cost was measured of, and a last line for what the run cost
 * beyond its steps, absent under half a cent. The rows' dollars add up to the run's, and their cents to the tile's.
 */
export function costBreakdown(cost: Spent, steps: readonly StepCost[]): Breakdown {
  const rest = cost.usd - steps.reduce((sum, step) => sum + (step.cost?.usd ?? 0), 0);
  const parts = [...steps.map((step) => ({ what: step.step, usd: step.cost?.usd ?? 0, run: step.cost !== null })), ...restOf(rest)];
  const cents = shared(
    parts.map((part) => part.usd),
    0.01,
    Math.round(cost.usd * 100),
  );
  return {
    head: `${cost.said} so far, by step`,
    rows: parts.map((part, i) => ({
      what: part.what,
      amount: part.usd,
      said: part.run ? dollars(cents[i]) : 'none measured',
      none: !part.run,
    })),
    foot: cost.unmeasured > 0 ? 'A session that ended with no cost on it is counted in none of these.' : '',
  };
}

/** The cost's rest as a part, none under half a cent either way. */
const restOf = (usd: number): Array<{ what: string; usd: number; run: boolean }> =>
  Math.abs(usd) < 0.005 ? [] : [{ what: COST_REST, usd, run: true }];

/** A count of tokens in three figures: `86`, `73.9k`, `4.10M`. */
export function tokensSaid(count: number): string {
  if (count < 1_000) return String(count);
  if (count < 999_500) return `${(count / 1_000).toPrecision(3)}k`;
  return `${(count / 1_000_000).toPrecision(3)}M`;
}

/** The tokens' last line: what the total counts beyond its kinds. */
export const TOKENS_REST = 'Counted in no kind';

/** The kinds a run's tokens are counted in: the four the harness bills apart, or in and out where a session gave no parts. */
function kindsOf(tokens: RunTokens): Array<[string, number]> {
  const { cacheWrite, uncached, cacheRead } = tokens;
  if (cacheWrite === null || uncached === null || cacheRead === null) {
    return [
      ['In', tokens.input],
      ['Out', tokens.output],
    ];
  }
  return [
    ['Written to the cache', cacheWrite],
    ['Uncached, in', uncached],
    ['Out', tokens.output],
    ['Read back from the cache', cacheRead],
  ];
}

/**
 * A run's tokens by kind, and a last line for what the total counts beyond them, absent when that is nothing. The rows' counts add up
 * to `tokens.total`.
 */
export function tokensBreakdown(tokens: RunTokens): Breakdown {
  const kinds = kindsOf(tokens);
  const rest = tokens.total - kinds.reduce((sum, [, count]) => sum + count, 0);
  const parts = rest === 0 ? kinds : [...kinds, [TOKENS_REST, rest] as [string, number]];
  const fresh = tokens.cacheRead === null ? null : tokens.total - tokens.cacheRead;
  return {
    head: `${tokensSaid(tokens.total)} counted${fresh === null ? '' : `, ${tokensSaid(fresh)} of them new`}`,
    rows: parts.map(([what, count]) => ({ what, amount: count, said: tokensSaid(count), none: count === 0 })),
    foot: 'Each kind is billed at its own rate, reads from the cache at the lowest.',
  };
}
