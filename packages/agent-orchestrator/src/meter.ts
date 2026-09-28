/**
 * What a pass costs, in words: the pure half of the pass's meter (`tally.ts` counts; this composes and says). A pass's cost
 * (`PassCost`) is its time and, phase by phase, where the time went, the calls made, the bytes read and the processes started — with each
 * harness's observes as the runtime reported them. `wf up` says one line of it an interval (`summaryLine`), and `wf up --stats` and
 * `wf tick --stats` the last pass whole (`breakdownLines`).
 */

/**
 * The phases of a pass. `records`: the run records, with the cancellation, pruning and hold beside each. `asks`: a person's asks,
 * approvals, acceptances and answers. `journals`: the runtime's journals, read through the engine (`view`, `feed`, `logs`), less the
 * observing a view does. `observe`: asking each harness what runs — the harnesses of one pass at once, so the slowest's time. `runtime`: the
 * runtime's own pass, less its observe. `git`: every git command, whether it judged (is a branch shipped) or acted (a worktree, a hand-off).
 * `assess`: the judgement — which queued tasks to admit among it — and any time not counted as another phase. `act`: filing, admitting,
 * stopping, collecting a step's artifacts, and writing the run's record, the feed and the ceilings.
 */
export const PHASES = ['records', 'asks', 'journals', 'observe', 'runtime', 'git', 'assess', 'act'] as const;
export type Phase = (typeof PHASES)[number];

/** One phase's count: its time in ms, the calls made to it, the bytes and reads counted while it ran, and the processes it started. */
export type PhaseCost = { ms: number; calls: number; bytes: number; reads: number; spawned: number };

/**
 * One harness's observes in the pass, as the runtime reported them: how many, their time, what they listed, the processes started, and
 * how many could not read all they were to (`unread`), written only when there were some.
 */
export type HarnessCost = { calls: number; ms: number; listed: number; spawned: number; unread?: number };

/**
 * What one pass cost. `ms` is its time, measured apart from the phases, which add up to it less the counting done inside the pass. `records`
 * is the run records it read, `bytes` and `spawned` its totals, and `overheadMs` what measuring took — the counting inside the pass, and
 * composing this after it and writing it down — so that the meter's own cost is measured too. `rested` is the runs the pass answered from
 * its memo of runs at rest (`rest.ts`), reading neither their tasks nor git for them — absent from a pass written before there was one.
 */
export type PassCost = {
  at: string;
  ms: number;
  phases: Record<Phase, PhaseCost>;
  harnesses: Record<string, HarnessCost>;
  records: number;
  bytes: number;
  spawned: number;
  overheadMs: number;
  rested?: number;
};

/** A pass's cost from its counts: the totals summed from the phases. */
export const passCost = (c: Omit<PassCost, 'bytes' | 'spawned'>): PassCost => ({
  ...c,
  bytes: PHASES.reduce((n, p) => n + c.phases[p].bytes, 0),
  spawned: PHASES.reduce((n, p) => n + c.phases[p].spawned, 0),
});

/** The phases that took longest, longest first, at most `n`, leaving out any that took no time. */
export const heaviest = (phases: Record<Phase, { ms: number }>, n = 3): Array<{ phase: Phase; ms: number }> =>
  PHASES.map((phase) => ({ phase, ms: phases[phase].ms }))
    .filter((p) => p.ms > 0)
    .sort((a, b) => b.ms - a.ms)
    .slice(0, n);

/** How often `wf up` says what its passes cost: once a minute, however often it ticks. */
export const STATS_EVERY_MS = 60_000;

/**
 * The passes since the last line `wf up` said of them: numbers only, summed, and started afresh after each line (`summaryDue`). All that is
 * carried between passes.
 */
export type Interval = {
  from: number;
  passes: number;
  ms: number;
  slowestMs: number;
  phases: Record<Phase, number>;
  bytes: number;
  spawned: number;
  overheadMs: number;
};

/** The interval with one more pass in it — a new one, from `now`, when there was none. */
export const addPass = (interval: Interval | undefined, cost: PassCost, now: number): Interval => {
  const i = interval ?? {
    from: now,
    passes: 0,
    ms: 0,
    slowestMs: 0,
    phases: Object.fromEntries(PHASES.map((p) => [p, 0])) as Record<Phase, number>,
    bytes: 0,
    spawned: 0,
    overheadMs: 0,
  };
  return {
    from: i.from,
    passes: i.passes + 1,
    ms: i.ms + cost.ms,
    slowestMs: Math.max(i.slowestMs, cost.ms),
    phases: Object.fromEntries(PHASES.map((p) => [p, i.phases[p] + cost.phases[p].ms])) as Record<Phase, number>,
    bytes: i.bytes + cost.bytes,
    spawned: i.spawned + cost.spawned,
    overheadMs: i.overheadMs + cost.overheadMs,
  };
};

/** Whether the interval has run its length, so `wf up` says its line and starts another. */
export const summaryDue = (interval: Interval | undefined, now: number, every = STATS_EVERY_MS): boolean =>
  interval !== undefined && now - interval.from >= every;

const msWord = (ms: number): string => (ms >= 100 ? `${Math.round(ms)}` : ms >= 10 ? ms.toFixed(1) : ms.toFixed(2));

/** Bytes as a person reads them: `812 B`, `14.2 kB`, `3.1 MB`. */
export const bytesWord = (n: number): string =>
  n < 1000 ? `${n} B` : n < 1_000_000 ? `${(n / 1000).toFixed(1)} kB` : `${(n / 1_000_000).toFixed(1)} MB`;

const plural = (n: number, one: string, many = `${one}s`): string => `${n} ${n === 1 ? one : many}`;

/**
 * `wf up`'s line for an interval: how many passes, what a pass took on average and at most, the three heaviest phases over the interval,
 * the bytes read and the processes started, and what measuring cost.
 */
export const summaryLine = (i: Interval, now: number): string => {
  const heavy = heaviest(Object.fromEntries(PHASES.map((p) => [p, { ms: i.phases[p] }])) as Record<Phase, { ms: number }>);
  return (
    `cost: ${plural(i.passes, 'pass', 'passes')} in ${Math.round((now - i.from) / 1000)}s, ${msWord(i.ms / Math.max(i.passes, 1))} ms a pass (slowest ${msWord(i.slowestMs)}) — ` +
    `${heavy.length ? heavy.map((h) => `${h.phase} ${msWord(h.ms)}`).join(', ') : 'nothing took time'} ms in all — ` +
    `${bytesWord(i.bytes)} read, ${plural(i.spawned, 'process', 'processes')} started; measuring ${msWord(i.overheadMs)} ms`
  );
};

/** The last pass, phase by phase and harness by harness, for `wf up --stats` and `wf tick --stats`. */
export const breakdownLines = (c: PassCost): string[] => {
  const rows = PHASES.map((p) => [
    p,
    msWord(c.phases[p].ms),
    String(c.phases[p].calls),
    bytesWord(c.phases[p].bytes),
    String(c.phases[p].spawned),
  ]);
  const head = ['phase', 'ms', 'calls', 'read', 'processes'];
  const widths = head.map((h, k) => Math.max(h.length, ...rows.map((r) => r[k]!.length)));
  const line = (r: string[]) => `  ${r.map((cell, k) => (k === 0 ? cell.padEnd(widths[k]!) : cell.padStart(widths[k]!))).join('  ')}`;
  const harnesses = Object.entries(c.harnesses)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(
      ([name, h]) =>
        `  ${name}: ${plural(h.calls, 'observe')}, ${msWord(h.ms)} ms, ${plural(h.listed, 'session or run file', 'sessions or run files')} listed, ${plural(h.spawned, 'process', 'processes')} started` +
        (h.unread ? `, ${h.unread} could not read it` : ''),
    );
  return [
    `the last pass, at ${c.at}: ${msWord(c.ms)} ms, ${plural(c.records, 'run record')} read, ${bytesWord(c.bytes)} read, ${plural(c.spawned, 'process', 'processes')} started` +
      (c.rested ? `, ${plural(c.rested, 'run')} at rest answered from memory` : ''),
    line(head),
    ...rows.map(line),
    ...(harnesses.length ? ['observed, by harness (at once, so their times overlap):', ...harnesses] : ['no harness was observed']),
    `measuring it: ${msWord(c.overheadMs)} ms`,
  ];
};
