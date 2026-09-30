/**
 * The stats in words (`Stats`, `stats.ts`): the tiles, a row per day, a row per step, and the one line the morning recap quotes. A number
 * with nothing measured under it reads `—`, never 0. Pure.
 */
import { dollars, durationWord } from '../status/status.ts';
import type { Group, Headline, Stats, StepRow } from './stats.ts';

const NONE = '—';

const or = <T>(v: T | null, word: (v: T) => string): string => (v === null ? NONE : word(v));
const percent = (share: number): string => `${Math.round(share * 100)}%`;
const oneDecimal = (n: number): string => (Math.round(n * 10) / 10).toString();

/** A headline's numbers in words, by the name each is printed under. */
const wordsOf = (h: Headline): Record<string, string> => ({
  runs: String(h.runs),
  landed: String(h.landed),
  rounds: or(h.rounds, oneDecimal),
  'first try': or(h.firstTry, percent),
  'cost/landed': or(h.costPerLanded, dollars),
  'time/landed': or(h.timePerLanded, durationWord),
  tries: String(h.tries),
  refused: String(h.refused),
  'gate wait': or(h.gateWaitMs, durationWord),
});

/** Rows of cells in columns, each as wide as its widest cell, two spaces apart. */
function table(rows: readonly string[][]): string[] {
  const widths = rows[0].map((_, i) => Math.max(...rows.map((r) => r[i].length)));
  return rows.map((r) =>
    r
      .map((cell, i) => cell.padEnd(widths[i]))
      .join('  ')
      .trimEnd(),
  );
}

/** The tiles: each headline number over the last 14 days, beside the same over the 14 before. */
function tileLines(g: Group): string[] {
  const { last, before } = g.tiles;
  const now = wordsOf(last);
  const then = wordsOf(before);
  return [
    `last 14 days (${last.from} → ${last.to}), against the 14 before (${before.from} → ${before.to})`,
    ...table(Object.keys(now).map((name) => [`  ${name}`, now[name], `(${then[name]})`])),
  ];
}

/** A row per day, under a header: a day with nothing that happened on it is left out of the words. */
function dayLines(g: Group, label?: string): string[] {
  const days = g.days.filter((d) => d.tries || d.runs);
  if (!days.length) return [];
  const names = Object.keys(wordsOf(g.total));
  return table([
    ['day', ...(label === undefined ? [] : ['']), ...names],
    ...days.map((d) => [d.day, ...(label === undefined ? [] : [label]), ...Object.values(wordsOf(d))]),
  ]);
}

/** A step's cost in words: the sum of its measured tries, and how many were, where not all. */
const costWord = (s: StepRow): string =>
  s.costUsd === null ? NONE : s.costTries === s.tries ? dollars(s.costUsd) : `${dollars(s.costUsd)} (${s.costTries} of ${s.tries})`;

/** A row per step and agent: its tries, their run time and cost, its checks' verdicts, its mean gate wait. */
function stepLines(steps: readonly StepRow[]): string[] {
  if (!steps.length) return [];
  return table([
    ['step', 'agent', 'tries', 'ran', 'cost', 'passed', 'refused', 'unfinished', 'gate wait'],
    ...steps.map((s) => [
      s.step,
      s.agent ?? NONE,
      String(s.tries),
      or(s.ranMs, durationWord),
      costWord(s),
      String(s.checks.passed),
      String(s.checks.refused),
      String(s.checks.unfinished),
      or(s.gateWaitMs, durationWord),
    ]),
  ]);
}

/** What `wf stats` prints: the tiles, a row per day — per group, with a key — then a row per step, and the runs left out. */
export function statsLines(s: Stats): string[] {
  const filtered = Object.entries(s.filters).map(([k, v]) => `${k} ${v}`);
  const groups = s.by ? s.groups.flatMap((g) => ['', `${s.by} ${g.key ?? NONE}`, ...dayLines(g)]) : ['', ...dayLines(s.all)];
  return [
    ...(filtered.length ? [`only ${filtered.join(', ')}`] : []),
    ...tileLines(s.all),
    '',
    s.from ? `${s.from} → ${s.to}` : 'no try has ended, and no run has finished',
    ...groups,
    ...(s.all.steps.length ? ['', ...stepLines(s.all.steps)] : []),
    ...(s.unreadable.length ? ['', `left out, a journal of each not reading (wf ls says why): ${s.unreadable.join(', ')}`] : []),
  ];
}

/** The one line the morning recap quotes (`wf stats --line`): the last 14 days, the 14 before in brackets. */
export function statsLine(s: Stats): string {
  const now = wordsOf(s.all.tiles.last);
  const then = wordsOf(s.all.tiles.before);
  const was = (name: string) => `${now[name]} (${then[name]})`;
  return (
    `stats, last 14 days (the 14 before): ${was('runs')} runs finished, ${was('landed')} landed, ${was('first try')} on the first try, ` +
    `${was('rounds')} rounds, ${was('cost/landed')} and ${was('time/landed')} per landed run, ${was('tries')} tries, ` +
    `${was('refused')} checks refused, ${was('gate wait')} at a gate`
  );
}
