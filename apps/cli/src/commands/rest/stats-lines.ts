/**
 * The stats in words, off `GET /api/stats`' answer, its groups read by `objects`' `StatsGroup` and its health by `StatsHealth`: the
 * tiles, a row per landing check that passed in more than half its deadline, a row per day, a row per change to what the runs froze, a
 * row per step, a row per call a step was refused, a row per skill a step loaded, a row per rule a step's skills declare, a row per day
 * and count a step declares (`tally:`), and the one line the morning recap quotes. A number with nothing measured under it reads `—`,
 * never 0. Pure.
 */
import type { StatsGroup, StatsHeadline, StatsHealth, StatsStepRow } from 'objects';

/** The stats as this file reads them: the answer's keys, its groups and health decoded. */
export type StatsRead = {
  readonly from: string | null;
  readonly to: string;
  readonly by: string | null;
  readonly filters: Readonly<Record<string, string>>;
  readonly all: StatsGroup;
  readonly groups: readonly (StatsGroup & { readonly key: string | null })[];
  readonly unreadable: readonly string[];
  readonly health: StatsHealth;
};

const NONE = '—';

const or = <T>(v: T | null, word: (v: T) => string): string => (v === null ? NONE : word(v));
const percent = (share: number): string => `${Math.round(share * 100)}%`;
const oneDecimal = (n: number): string => (Math.round(n * 10) / 10).toString();
/** A rate per try to two decimals, or to one significant figure under 0.01, so a rate above 0 never reads as 0. */
const perTry = (n: number): string => `${n > 0 && n < 0.01 ? Number(n.toPrecision(1)) : Math.round(n * 100) / 100}/try`;
/** Dollars as a person reads them: `$0.42`, and three figures under a cent. */
const dollars = (usd: number): string => `$${usd > 0 && usd < 0.01 ? Number(usd.toPrecision(3)) : usd.toFixed(2)}`;

/** A span of time in its two largest units: `45s`, `3m05s`, `2h07m`, `1d03h`. */
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

/** A headline's numbers in words, by the name each is printed under. */
const wordsOf = (h: StatsHeadline): Record<string, string> => ({
  runs: String(h.runs),
  landed: or(h.landed, String),
  rounds: or(h.rounds, oneDecimal),
  'first try': or(h.firstTry, percent),
  'cost/landed': or(h.costPerLanded, dollars),
  'time/landed': or(h.timePerLanded, durationWord),
  tries: String(h.tries),
  refused: String(h.refused),
  'gate wait': or(h.gateWaitMs, durationWord),
  denied: or(h.deniedPerTry, perTry),
  skills: or(h.skillsPerTry, perTry),
});

/** Rows of cells in columns, each as wide as its widest cell, two spaces apart. */
function table(rows: readonly string[][]): string[] {
  const widths = (rows[0] ?? []).map((_, i) => Math.max(...rows.map((r) => r[i]?.length ?? 0)));
  return rows.map((r) =>
    r
      .map((cell, i) => cell.padEnd(widths[i] ?? 0))
      .join('  ')
      .trimEnd(),
  );
}

/** The tiles: each headline number over the last 14 days, beside the same over the 14 before. */
function tileLines(g: StatsGroup): string[] {
  const { last, before } = g.tiles;
  const now = wordsOf(last);
  const then = wordsOf(before);
  return [
    `last 14 days (${last.from} → ${last.to}), against the 14 before (${before.from} → ${before.to})`,
    ...table(Object.entries(now).map(([name, word]) => [`  ${name}`, word, `(${then[name]})`])),
  ];
}

/** A row per landing check that passed in more than half its deadline, under a line saying what to do; none where no check did. */
function slowLandingLines(slow: StatsGroup['slowLandings']): string[] {
  if (!slow.length) return [];
  return [
    'landing checks over half their deadline: measure the passing landing checks again, then change LANDING_CHECK_DEADLINE_SECONDS and ' +
      'its JSDoc (src/check/check.ts)',
    ...table([
      ['day', 'run', 'step', 'try', 'ran', 'deadline', 'share'],
      ...slow.map((x) => [x.day, x.run, x.step, String(x.try), durationWord(x.checkMs), durationWord(x.deadlineMs), percent(x.share)]),
    ]),
  ];
}

/** A row per day, under a header: a day with nothing that happened on it is left out of the words. */
function dayLines(g: StatsGroup): string[] {
  const days = g.days.filter((d) => d.tries || d.runs);
  if (!days.length) return [];
  const names = Object.keys(wordsOf(g.total));
  return table([['day', ...names], ...days.map((d) => [d.day, ...Object.values(wordsOf(d))])]);
}

/** A row per change: its day, what changed, the run that changed it and the run it is compared with; none without a change. */
function markLines(marks: StatsGroup['marks']): string[] {
  if (!marks.length) return [];
  return table([['day', 'changed', 'run', 'since'], ...marks.map((m) => [m.day, `${m.kind} ${m.name}`, m.run, m.since])]);
}

/** A count over a step's measured tries in words, and how many were, where not all. */
const ofTries = (count: number | null, measured: number, tries: number, word: (n: number) => string = String): string =>
  count === null ? NONE : measured === tries ? word(count) : `${word(count)} (${measured} of ${tries})`;

/** A row per step and agent: its tries, run time, checks' time and cost, verdicts, gate wait, calls refused and skills loaded. */
function stepLines(steps: readonly StatsStepRow[]): string[] {
  if (!steps.length) return [];
  return table([
    ['step', 'agent', 'tries', 'ran', 'checks', 'cost', 'passed', 'refused', 'unfinished', 'gate wait', 'denied', 'skills'],
    ...steps.map((s) => [
      s.step,
      s.agent ?? NONE,
      String(s.tries),
      or(s.ranMs, durationWord),
      or(s.checkMs, durationWord),
      ofTries(s.costUsd, s.costTries, s.tries, dollars),
      String(s.checks.passed),
      String(s.checks.refused),
      String(s.checks.unfinished),
      or(s.gateWaitMs, durationWord),
      ofTries(s.deniedCalls, s.deniedTries, s.tries),
      ofTries(s.skillLoads, s.skillTries, s.tries),
    ]),
  ]);
}

/** A row per call each step and agent was refused, with how many times; none where no step was refused a call. */
function denialLines(steps: readonly StatsStepRow[]): string[] {
  const rows = steps.flatMap((s) => s.denials.map((d) => [s.step, s.agent ?? NONE, d.call, String(d.count)]));
  return rows.length ? table([['step', 'agent', 'denied', 'calls'], ...rows]) : [];
}

/** A row per skill each step and agent loaded or touched the paths of; none where no step loaded or touched a skill. */
function skillLines(steps: readonly StatsStepRow[]): string[] {
  const rows = steps.flatMap((s) =>
    s.skills.map((k) => [
      s.step,
      s.agent ?? NONE,
      k.skill,
      String(k.count),
      String(k.tries),
      k.touched === null ? NONE : `${k.loadedWhenTouched} of ${k.touched}`,
    ]),
  );
  return rows.length ? table([['step', 'agent', 'skill', 'loads', 'tries', 'when touched'], ...rows]) : [];
}

/** A row per rule each step and agent's skills declare, kept and broken over its measured tries; none where no step has one. */
function ruleLines(steps: readonly StatsStepRow[]): string[] {
  const rows = steps.flatMap((s) => s.rules.map((r) => [s.step, s.agent ?? NONE, r.skill, r.rule, String(r.kept), String(r.broken)]));
  return rows.length ? table([['step', 'agent', 'skill', 'rule', 'kept', 'broken'], ...rows]) : [];
}

/** A tally's cell in words: its sum, to two decimals, `—` where no try was measured; and how many were. */
const tallyCells = (c: { readonly sum: number | null; readonly tries: number }): string[] => [
  or(c.sum, (n) => String(Math.round(n * 100) / 100)),
  String(c.tries),
];

/** A row per day something happened on and count a step declares, then a row per count over the whole range; none where none. */
function tallyLines(g: StatsGroup): string[] {
  if (!g.tallies.length) return [];
  const days = g.days.filter((d) => d.tries || d.runs).map((d) => d.day);
  return table([
    ['day', 'step', 'tally', 'sum', 'tries'],
    ...days.flatMap((day) =>
      g.tallies.map((row) => [day, row.step, row.tally, ...tallyCells(row.days.find((d) => d.day === day) ?? { sum: null, tries: 0 })]),
    ),
    ...g.tallies.map((row) => ['all', row.step, row.tally, ...tallyCells(row.total)]),
  ]);
}

/** A load in words, to two decimals: the share of the cores at work. */
const loadWord = (n: number): string => (Math.round(n * 100) / 100).toString();

/** The system's health over the days in words, a line each, or none where the series kept nothing over them. */
export function healthLines(h: StatsHealth): string[] {
  const lines = [
    h.pass.p50 === null ? null : `a pass: ${h.pass.p50.toFixed(1)} ms (p50), ${or(h.pass.p95, (n) => n.toFixed(1))} ms (p95)`,
    h.runs === null ? null : `runs in the store: ${h.runs} at most; journal reads a pass: ${or(h.reads, oneDecimal)} (p95)`,
    h.queued === null ? null : `sessions queued: ${h.queued} at most, waiting ${or(h.waitMs, durationWord)} at longest`,
    h.load.max === null
      ? null
      : `load: ${or(h.load.p95, loadWord)} (p95), ${loadWord(h.load.max)} at most; checks filed at ${or(h.checkLoad, loadWord)} (p50)`,
    ...h.quota.map((q) => `quota ${q.harness} ${q.window}: ${Math.round(q.latest)}% used, ${Math.round(q.peak)}% at most`),
  ].filter((line): line is string => line !== null);
  return lines.length ? ['system', ...lines.map((line) => `  ${line}`)] : [];
}

/** `lines` after a blank line, or nothing where there are none. */
const block = (lines: readonly string[]): string[] => (lines.length ? ['', ...lines] : []);

/** What `nemia stats` prints, in the order its help says, the runs left out last. */
export function statsLines(s: StatsRead): string[] {
  const filtered = Object.entries(s.filters).map(([k, v]) => `${k} ${v}`);
  const groups = s.by ? s.groups.flatMap((g) => ['', `${s.by} ${g.key ?? NONE}`, ...dayLines(g)]) : ['', ...dayLines(s.all)];
  return [
    ...(filtered.length ? [`only ${filtered.join(', ')}`] : []),
    ...tileLines(s.all),
    ...block(slowLandingLines(s.all.slowLandings)),
    '',
    s.from ? `${s.from} → ${s.to}` : 'no try has ended, and no run has finished',
    ...groups,
    ...block(markLines(s.all.marks)),
    ...block(stepLines(s.all.steps)),
    ...block(denialLines(s.all.steps)),
    ...block(skillLines(s.all.steps)),
    ...block(ruleLines(s.all.steps)),
    ...block(tallyLines(s.all)),
    ...block(healthLines(s.health)),
    ...(s.unreadable.length ? ['', `left out, a journal of each not reading (nemia ls says why): ${s.unreadable.join(', ')}`] : []),
  ];
}

/** How many landing checks of the last 14 days passed in more than half their deadline, in words; none where none did. */
function slowLandingWord(s: StatsRead): string {
  const { from, to } = s.all.tiles.last;
  const n = s.all.slowLandings.filter((x) => x.day >= from && x.day <= to).length;
  if (!n) return '';
  return n === 1
    ? ', 1 landing check over half its deadline: measure again'
    : `, ${n} landing checks over half their deadline: measure again`;
}

/** The one line the morning recap quotes (`nemia stats --line`): the last 14 days, the 14 before in brackets, and the slow landings. */
export function statsLine(s: StatsRead): string {
  const now = wordsOf(s.all.tiles.last);
  const then = wordsOf(s.all.tiles.before);
  const was = (name: string) => `${now[name]} (${then[name]})`;
  return (
    `stats, last 14 days (the 14 before): ${was('runs')} runs finished, ${was('landed')} landed, ${was('first try')} on the first try, ` +
    `${was('rounds')} rounds, ${was('cost/landed')} and ${was('time/landed')} per landed run, ${was('tries')} tries, ` +
    `${was('refused')} checks refused, ${was('gate wait')} at a gate, ${was('denied')} calls denied, ${was('skills')} skills loaded` +
    slowLandingWord(s)
  );
}
