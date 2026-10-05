/**
 * The stats in words (`Stats`, `stats.ts`): the tiles, a row per day, a row per change to what the runs froze, a row per step, a row per
 * call a step was refused, a row per skill a step loaded, a row per rule a step's skills declare, a row per day and count a step
 * declares (`tally:`), and the one line the morning recap quotes. A number with nothing measured under it reads `—`, never 0. Pure.
 */
import { dollars, durationWord } from '../status/status.ts';
import type { Group, Headline, Stats, StepRow } from './stats.ts';
import type { Mark } from './marks.ts';
import type { TallyCell } from '../tally/tally.ts';

const NONE = '—';

const or = <T>(v: T | null, word: (v: T) => string): string => (v === null ? NONE : word(v));
const percent = (share: number): string => `${Math.round(share * 100)}%`;
const oneDecimal = (n: number): string => (Math.round(n * 10) / 10).toString();
/** A rate per try to two decimals, or to one significant figure under 0.01, so a rate above 0 never reads as 0. */
const perTry = (n: number): string => `${n > 0 && n < 0.01 ? Number(n.toPrecision(1)) : Math.round(n * 100) / 100}/try`;

/** A headline's numbers in words, by the name each is printed under. */
const wordsOf = (h: Headline): Record<string, string> => ({
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

/** A row per change (`Mark`): its day, what changed, the run that changed it and the run it is compared with; none without a change. */
function markLines(marks: readonly Mark[]): string[] {
  if (!marks.length) return [];
  return table([['day', 'changed', 'run', 'since'], ...marks.map((m) => [m.day, `${m.kind} ${m.name}`, m.run, m.since])]);
}

/** A step's cost in words: the sum of its measured tries, and how many were, where not all. */
const costWord = (s: StepRow): string =>
  s.costUsd === null ? NONE : s.costTries === s.tries ? dollars(s.costUsd) : `${dollars(s.costUsd)} (${s.costTries} of ${s.tries})`;

/** The calls a step was refused in words: their count over its measured tries, and how many were, where not all. */
const deniedWord = (s: StepRow): string =>
  s.deniedCalls === null ? NONE : s.deniedTries === s.tries ? String(s.deniedCalls) : `${s.deniedCalls} (${s.deniedTries} of ${s.tries})`;

/** The skills a step loaded in words: their count over its measured tries, and how many were, where not all. */
const skillsWord = (s: StepRow): string =>
  s.skillLoads === null ? NONE : s.skillTries === s.tries ? String(s.skillLoads) : `${s.skillLoads} (${s.skillTries} of ${s.tries})`;

/**
 * A row per step and agent: its tries, their run time and cost, its checks' verdicts, its mean gate wait, the calls it was refused, the
 * skills it loaded.
 */
function stepLines(steps: readonly StepRow[]): string[] {
  if (!steps.length) return [];
  return table([
    ['step', 'agent', 'tries', 'ran', 'cost', 'passed', 'refused', 'unfinished', 'gate wait', 'denied', 'skills'],
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
      deniedWord(s),
      skillsWord(s),
    ]),
  ]);
}

/** A row per call each step and agent was refused, with how many times; none where no step was refused a call. */
function denialLines(steps: readonly StepRow[]): string[] {
  const rows = steps.flatMap((s) => s.denials.map((d) => [s.step, s.agent ?? NONE, d.call, String(d.count)]));
  return rows.length ? table([['step', 'agent', 'denied', 'calls'], ...rows]) : [];
}

/** A row per skill each step and agent loaded, with how many times; none where no step loaded a skill. */
function skillLines(steps: readonly StepRow[]): string[] {
  const rows = steps.flatMap((s) => s.skills.map((k) => [s.step, s.agent ?? NONE, k.skill, String(k.count)]));
  return rows.length ? table([['step', 'agent', 'skill', 'loads'], ...rows]) : [];
}

/** A row per rule each step and agent's skills declare, kept and broken over its measured tries; none where no step has one. */
function ruleLines(steps: readonly StepRow[]): string[] {
  const rows = steps.flatMap((s) => s.rules.map((r) => [s.step, s.agent ?? NONE, r.skill, r.rule, String(r.kept), String(r.broken)]));
  return rows.length ? table([['step', 'agent', 'skill', 'rule', 'kept', 'broken'], ...rows]) : [];
}

/** A tally's cell in words: its sum, to two decimals, `—` where no try was measured; and how many were. */
const tallyCells = (c: TallyCell): string[] => [or(c.sum, (n) => String(Math.round(n * 100) / 100)), String(c.tries)];

/**
 * A row per day something happened on and count a step declares (`tally:`), then a row per count over the whole range (`all`); none
 * where no step declares one.
 */
function tallyLines(g: Group): string[] {
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

/**
 * What `nemia stats` prints: the tiles, a row per day — per group, with a key — then a row per change to what the runs froze, a row per step,
 * a row per call a step was refused, a row per skill a step loaded, a row per rule its skills declare, a row per day and count a step
 * declares, and the runs left out.
 */
export function statsLines(s: Stats): string[] {
  const filtered = Object.entries(s.filters).map(([k, v]) => `${k} ${v}`);
  const groups = s.by ? s.groups.flatMap((g) => ['', `${s.by} ${g.key ?? NONE}`, ...dayLines(g)]) : ['', ...dayLines(s.all)];
  return [
    ...(filtered.length ? [`only ${filtered.join(', ')}`] : []),
    ...tileLines(s.all),
    '',
    s.from ? `${s.from} → ${s.to}` : 'no try has ended, and no run has finished',
    ...groups,
    ...(s.all.marks.length ? ['', ...markLines(s.all.marks)] : []),
    ...(s.all.steps.length ? ['', ...stepLines(s.all.steps)] : []),
    ...(denialLines(s.all.steps).length ? ['', ...denialLines(s.all.steps)] : []),
    ...(skillLines(s.all.steps).length ? ['', ...skillLines(s.all.steps)] : []),
    ...(ruleLines(s.all.steps).length ? ['', ...ruleLines(s.all.steps)] : []),
    ...(s.all.tallies.length ? ['', ...tallyLines(s.all)] : []),
    ...(s.unreadable.length ? ['', `left out, a journal of each not reading (nemia ls says why): ${s.unreadable.join(', ')}`] : []),
  ];
}

/** The one line the morning recap quotes (`nemia stats --line`): the last 14 days, the 14 before in brackets. */
export function statsLine(s: Stats): string {
  const now = wordsOf(s.all.tiles.last);
  const then = wordsOf(s.all.tiles.before);
  const was = (name: string) => `${now[name]} (${then[name]})`;
  return (
    `stats, last 14 days (the 14 before): ${was('runs')} runs finished, ${was('landed')} landed, ${was('first try')} on the first try, ` +
    `${was('rounds')} rounds, ${was('cost/landed')} and ${was('time/landed')} per landed run, ${was('tries')} tries, ` +
    `${was('refused')} checks refused, ${was('gate wait')} at a gate, ${was('denied')} calls denied, ${was('skills')} skills loaded`
  );
}
