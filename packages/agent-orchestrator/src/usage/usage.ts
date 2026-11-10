/**
 * What a session consumed (`Consumed`), summed over sessions (`sumUsage`), and said in words: its reads of the context and their peak
 * (`readWords`, `peakMark`), and the lines `nemia decide` prints under a step (`usedLines`), with the counts and durations they are said
 * in (`count`, `durationWord`). `views/views.verb.ts` asks the engine (`consumption`). Pure.
 */
import type { PeakMark } from 'objects';
import { dollars } from '../money/money.ts';

/**
 * What a session consumed, as the engine's `Usage` carries it: a count nobody measured is absent, never 0. `costUsd` is the harness's own
 * figure, and `apiMs` and `toolMs` the time it counted waiting on the model and running tools — each read once a session has ended.
 */
export type Consumed = {
  responses?: number;
  toolCalls?: number;
  inputTokens?: number;
  outputTokens?: number;
  costUsd?: number;
  apiMs?: number;
  toolMs?: number;
  /** The input in its three classes, which sum to `inputTokens` where the runner saw them: read from the cache, written to it, neither. */
  cacheReadTokens?: number;
  cacheWriteTokens?: number;
  uncachedTokens?: number;
  /** The largest context one response read. Of several attempts, the largest of theirs: a peak does not add up. */
  peakContextTokens?: number;
  /**
   * One attempt's first response: the context it read and what of it was written to the cache (`rebuiltCache`). Not summed: several
   * attempts have no one first response.
   */
  firstContextTokens?: number;
  firstCacheWriteTokens?: number;
  /** How many times its sessions compacted their conversation, which a session does short of its window. Absent where none was seen. */
  compactions?: number;
  /**
   * How many of its attempts were resumed and wrote their parent's conversation to the cache again (`rebuiltCache`) — a reading of the
   * counts above, not a count the engine made. Absent where none did.
   */
  rebuiltCaches?: number;
};

const FIELDS = [
  'responses',
  'toolCalls',
  'inputTokens',
  'outputTokens',
  'costUsd',
  'apiMs',
  'toolMs',
  'cacheReadTokens',
  'cacheWriteTokens',
  'uncachedTokens',
] as const;

/**
 * Several attempts' usage as one. A count is the sum only when every attempt measured it: a sum over
 * the attempts that happened to be counted would under-report, and read as the whole. The peak is the
 * largest, by the same rule: an attempt that measured none may have been the largest.
 */
export function sumUsage(usages: ReadonlyArray<Consumed | null | undefined>): Consumed | undefined {
  if (!usages.length) return undefined;
  const sum: Consumed = {};
  for (const field of FIELDS) {
    const values = usages.map((u) => u?.[field]);
    if (values.every((v): v is number => v !== undefined)) sum[field] = values.reduce((n, v) => n + v, 0);
  }
  const peaks = usages.map((u) => u?.peakContextTokens);
  if (peaks.every((v): v is number => v !== undefined)) sum.peakContextTokens = Math.max(...peaks);
  const rebuilt = usages.reduce((n, u) => n + (u?.rebuiltCaches ?? 0), 0);
  if (rebuilt) sum.rebuiltCaches = rebuilt;
  const compactions = usages.reduce((n, u) => n + (u?.compactions ?? 0), 0);
  if (compactions) sum.compactions = compactions;
  return Object.keys(sum).length ? sum : undefined;
}

/**
 * Whether a resumed attempt rebuilt its cache rather than read it: its first response wrote more than half the context it read to the
 * cache. A continuation's first response reads its parent's whole conversation, which a warm cache serves as reads; written again, it is
 * the same tokens at twenty times a read's price, and the one input count hides it. Judged on the first response alone, since the
 * attempt's writes in all grow with its work, warm or not. Never for an attempt that started cold, whose first writes are its cache, nor
 * one whose runner did not see its first response.
 */
export const rebuiltCache = (u: Consumed | null | undefined, resumed: boolean): boolean =>
  resumed &&
  u?.firstCacheWriteTokens !== undefined &&
  u.firstContextTokens !== undefined &&
  u.firstCacheWriteTokens > u.firstContextTokens / 2;

/** The peak context, in tokens, past which a step with no `context:` cap is marked `large` (`peakMark`). */
export const LARGE_CONTEXT = 200_000;

/**
 * Where a peak stands against a step's `context:` cap: `cap` once the session reached it — it compacted, which a harness does well short
 * of its window, or its peak got there — and `large` past `LARGE_CONTEXT` on a step with none. Null otherwise, and where nobody measured
 * either.
 */
export function peakMark(u: Consumed | null | undefined, cap: number | undefined): PeakMark | null {
  const peak = u?.peakContextTokens;
  if (cap !== undefined) return u?.compactions || (peak !== undefined && peak >= cap) ? 'cap' : null;
  return peak !== undefined && peak > LARGE_CONTEXT ? 'large' : null;
}

/** What `n` resumed sessions that wrote their context to the cache again say, or undefined for none. */
const rebuiltWords = (n: number | undefined): string | undefined =>
  !n
    ? undefined
    : n > 1
      ? `${n} resumed sessions wrote their context to the cache again instead of reading it`
      : 'a resumed session wrote its context to the cache again instead of reading it';

/** How often a session compacted, in words: `compacted`, `compacted twice`, `compacted 3 times`. */
const compactedWords = (n: number): string => `compacted${n === 1 ? '' : n === 2 ? ' twice' : ` ${n} times`}`;

/**
 * What a session read, by price, for a person at a glance: `read 21.4M · wrote 412k · peak 167k` — the cache's reads and writes, which
 * are nearly all of an attempt's input and priced twenty-fold apart, and the largest context it carried. The peak says where it reached
 * a step's `context:` cap — compacting says it did — or passed 200k with none, and a resumed attempt that rebuilt its cache says so. Empty
 * where nothing measured any of it: a runner that counted none says nothing, rather than 0.
 */
export function readWords(u: Consumed | null | undefined, cap?: number): string {
  if (!u) return '';
  const mark = peakMark(u, cap);
  const where = [
    ...(u.compactions ? [compactedWords(u.compactions)] : []),
    ...(mark === 'large' ? [`past ${count(LARGE_CONTEXT)} with no cap`] : []),
  ].join(', ');
  const reached = mark === 'cap' && cap !== undefined ? `${u.compactions ? `${where} ` : ''}at its ${count(cap)} cap` : where;
  const peak =
    u.peakContextTokens !== undefined ? `peak ${count(u.peakContextTokens)}${reached ? `, ${reached}` : ''}` : reached || undefined;
  const rebuilt = rebuiltWords(u.rebuiltCaches);
  return [
    ...(u.cacheReadTokens !== undefined ? [`read ${count(u.cacheReadTokens)}`] : []),
    ...(u.cacheWriteTokens !== undefined ? [`wrote ${count(u.cacheWriteTokens)}`] : []),
    ...(peak ? [peak] : []),
    ...(rebuilt ? [rebuilt] : []),
  ].join(' · ');
}

/** A count for a person, to three figures: 112000 → 112k, 6350000 → 6.35M. */
export function count(n: number): string {
  for (const [of, unit] of [
    [1e9, 'B'],
    [1e6, 'M'],
    [1e3, 'k'],
  ] as const) {
    if (n >= of * 0.9995) return `${Number((n / of).toPrecision(3))}${unit}`;
  }
  return String(n);
}

/** A duration for a person, as the operator measures one: `58s`, `19m42s`, `1h05m`, `2d03h`. */
export function durationWord(ms: number): string {
  const s = Math.floor(Math.max(0, ms) / 1000);
  const two = (n: number) => String(n).padStart(2, '0');
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m${two(s % 60)}s`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h${two(m % 60)}m`;
  return `${Math.floor(h / 24)}d${two(h % 24)}h`;
}

/**
 * What a step consumed, beside its check: `used` and `cost`. Unmeasured says so, never `0` — a zero
 * that means "nobody counted" reads as "cost nothing". Cost prints a number only where the engine measured
 * one: the harness's own figure, read once a session has ended (agent-runtime's README, *What an attempt consumed*).
 * The api and tool time go beside the counts once either was measured, and each says not measured where the
 * other was, and neither is said where nothing timed it. A measured time under a
 * second reads `<1s`, never `0s`.
 */
export function usedLines(u: Consumed | undefined): string[] {
  const read = readWords(u);
  const cost = `cost  ${u?.costUsd !== undefined ? dollars(u.costUsd) : 'not measured'}${read ? ` · ${read}` : ''}`;
  if (!u) return ['used  not measured', cost];
  const said = (n: number | undefined, what: string, unmeasured: string) =>
    n === undefined ? `${unmeasured} not measured` : `${count(n)} ${what}`;
  const took = (ms: number | undefined, what: string) =>
    ms === undefined ? `${what} not measured` : `${what} ${ms > 0 && ms < 1000 ? '<1s' : durationWord(ms)}`;
  const timed = u.apiMs !== undefined || u.toolMs !== undefined ? [took(u.apiMs, 'api'), took(u.toolMs, 'tools')] : [];
  return [
    `used  ${[
      said(u.responses, 'responses', 'responses'),
      said(u.toolCalls, 'tool calls', 'tool calls'),
      said(u.inputTokens, 'in', 'tokens in'),
      said(u.outputTokens, 'out', 'tokens out'),
      ...timed,
    ].join(' · ')}`,
    cost,
  ];
}
