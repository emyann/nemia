/**
 * What a pass costs, in words: the pure half of the pass's meter (`tally.store.ts` counts; this composes and says). A pass's cost
 * (`PassCost`) is its time and, phase by phase, where the time went, the calls made, the bytes read and the processes started — with each
 * harness's observes as the runtime reported them. `nemia up` says one line of it an interval (`summaryLine`), and `nemia up --stats` and
 * `nemia tick --stats` the last pass whole (`breakdownLines`).
 */
import type { DiskReading } from '../disk/disk.ts';

/**
 * The phases of a pass. `records`: the run records, with the cancellation, pruning and hold beside each. `asks`: a person's asks,
 * approvals, acceptances and answers. `journals`: the runtime's journals, read through the engine (`view`, `feed`, `logs`, `output`), less
 * the observing a view does.
 * `revisions`: the workflow folders, agents, skills and factory rules a run's kinds are resolved from, and the ledger they are
 * numbered in — one read of each folder a pass, shared by every run on it (`passRevisions`).
 * `observe`: asking each harness what runs — the harnesses of one pass at once, so the slowest's time.
 * `runtime`: the runtime's own pass, less its observe. `place`: every question asked of the place, a call each, the processes the place
 * starts to answer it and its time, whether it judged (where a branch stands) or acted (a worktree, a hand-off, a landing). `assess`: the
 * judgement, and any time not counted as another phase. `act`: filing, admitting, stopping, collecting a step's artifacts, and writing the
 * run's record, the feed and the ceilings.
 */
export const PHASES = ['records', 'asks', 'journals', 'revisions', 'observe', 'runtime', 'place', 'assess', 'act'] as const;
export type Phase = (typeof PHASES)[number];

/**
 * A phase's former word, as a stored series line may still carry it, and the phase it is read as: `git` is `place`, its word while the
 * place was git's alone. Read by the series' store (`linesIn`); never written.
 */
export const FORMER_PHASE_WORDS = ['git'] as const;
export type FormerPhase = (typeof FORMER_PHASE_WORDS)[number];
export const FORMER_PHASES: { readonly [P in FormerPhase]: Phase } = { git: 'place' };

/** Whether a word is a phase of today's (`PHASES`). */
export const isPhase = (word: string): word is Phase => (PHASES as readonly string[]).includes(word);

/**
 * One phase's count: its time in ms, the calls made to it, the bytes and reads counted while it ran, and the processes it started. A read
 * is one of bytes: a journal is read for what was appended to it since the engine last read it, and one it finds as it left it costs a
 * `stat` and no read, so a pass's journal reads are the journals that changed, not the ones it asked for.
 */
export type PhaseCost = { ms: number; calls: number; bytes: number; reads: number; spawned: number };

/**
 * One harness's observes in the pass, as the runtime reported them: how many, their time, what they listed, the processes started, and
 * how many could not read all they were to (`unread`), written only when there were some.
 */
export type HarnessCost = { calls: number; ms: number; listed: number; spawned: number; unread?: number };

/**
 * What one pass cost. `ms` is its time, measured apart from the phases, which add up to it less the counting done inside the pass.
 * `records` is the run records it read, `bytes` and `spawned` its totals, and `overheadMs` what measuring took — the counting inside the
 * pass, and composing this after it and writing it down — so that the meter's own cost is measured too. `rested` is the runs the pass
 * answered from its memo of runs at rest (`rest.ts`), reading neither their tasks nor git for them. Beside the time, what the pass saw
 * (`Seen`): the runs the store listed to it, the tasks the runtime reported on its pass, and the sessions of those queued and admitted.
 * `unobserved` is why the runtime could not read a harness on the pass (`Pass.unobserved`), written only when it could not.
 */
export type PassCost = Seen & {
  at: string;
  ms: number;
  phases: Record<Phase, PhaseCost>;
  harnesses: Record<string, HarnessCost>;
  records: number;
  bytes: number;
  spawned: number;
  overheadMs: number;
  rested: number;
  unobserved?: readonly string[];
};

/**
 * What a pass saw beside its time: `runs`, the runs the store listed to it, its size as the pass saw it; `tasks`, the tasks the runtime
 * reported on its pass, every one not settled; `queued`, those of them waiting for a slot; `admitted`, the sessions holding one — at work,
 * or admitted and not yet started; `waitMs`, how long the oldest of those queued has waited since it was filed, 0 with none; and `load`,
 * the machine's load over the last minute per core it has.
 */
export type Seen = { runs: number; tasks: number; queued: number; admitted: number; waitMs: number; load: number };

/** What a pass sees before it has seen anything. */
export const NOTHING_SEEN: Seen = { runs: 0, tasks: 0, queued: 0, admitted: 0, waitMs: 0, load: 0 };

/**
 * The tasks a runtime's pass reported at `now`, and the sessions of them queued and admitted (`Seen`): `views` the tasks not settled, each
 * with its admission and when it was filed, and `running` the sessions at work by harness. A session at work counts once, in `running`;
 * one admitted and not yet started is its view's. The wait is the oldest queued view's, one with no time of filing left out. A report that
 * carries neither reads as none.
 */
export const sessionsOf = (
  report: {
    views?: ReadonlyArray<{ admission?: 'queued' | 'admitted'; state?: { filedAt?: string } }>;
    running?: Readonly<Record<string, number>>;
  },
  now: number,
): Omit<Seen, 'runs' | 'load'> => {
  const views = report.views ?? [];
  const queued = views.filter((v) => v.admission === 'queued');
  const filed = queued.map((v) => Date.parse(v.state?.filedAt ?? '')).filter((ms) => Number.isFinite(ms));
  return {
    tasks: views.length,
    queued: queued.length,
    admitted: views.filter((v) => v.admission === 'admitted').length + Object.values(report.running ?? {}).reduce((n, k) => n + k, 0),
    waitMs: filed.length ? Math.max(0, now - Math.min(...filed)) : 0,
  };
};

/** A pass's cost as it reads back off disk: what it saw is absent from a file an older tick wrote, which kept none of it. */
export type PassCostRead = Omit<PassCost, keyof Seen> & Partial<Seen>;

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

/** How often `nemia up` says what its passes cost: once a minute, however often it ticks. */
export const STATS_EVERY_MS = 60_000;

/**
 * The passes since the last line `nemia up` said of them: numbers only, summed, and started afresh after each line (`summaryDue`). All that
 * is carried between passes.
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

/** Whether the interval has run its length, so `nemia up` says its line and starts another. */
export const summaryDue = (interval: Interval | undefined, now: number, every = STATS_EVERY_MS): boolean =>
  interval !== undefined && now - interval.from >= every;

const msWord = (ms: number): string => (ms >= 100 ? `${Math.round(ms)}` : ms >= 10 ? ms.toFixed(1) : ms.toFixed(2));

/** Bytes as a person reads them: `812 B`, `14.2 kB`, `3.1 MB`. */
export const bytesWord = (n: number): string =>
  n < 1000 ? `${n} B` : n < 1_000_000 ? `${(n / 1000).toFixed(1)} kB` : `${(n / 1_000_000).toFixed(1)} MB`;

const plural = (n: number, one: string, many = `${one}s`): string => `${n} ${n === 1 ? one : many}`;

/**
 * `nemia up`'s line for an interval: how many passes, what a pass took on average and at most, the three heaviest phases over the interval,
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

/** What a pass saw, said in a line, and its journal reads: none from a file an older tick wrote, which kept none of it. */
const seenLines = ({ runs, tasks, queued, admitted, phases }: PassCostRead): string[] =>
  runs === undefined
    ? []
    : [
        `it saw ${plural(runs, 'run')} in the store, ${plural(tasks ?? 0, 'task')} not settled, ${queued ?? 0} queued and ${admitted ?? 0} admitted, ` +
          `and made ${plural(phases.journals.reads, 'journal read')}`,
      ];

/** The last pass, phase by phase and harness by harness, for `nemia up --stats` and `nemia tick --stats`. */
export const breakdownLines = (c: PassCostRead): string[] => {
  const rows = PHASES.map((p) => [
    p,
    msWord(c.phases[p].ms),
    String(c.phases[p].calls),
    bytesWord(c.phases[p].bytes),
    String(c.phases[p].spawned),
  ]);
  const head = ['phase', 'ms', 'calls', 'read', 'processes'];
  const widths = head.map((h, k) => Math.max(h.length, ...rows.map((r) => (r[k] ?? '').length)));
  const line = (r: string[]) =>
    `  ${r.map((cell, k) => (k === 0 ? cell.padEnd(widths[k] ?? 0) : cell.padStart(widths[k] ?? 0))).join('  ')}`;
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
    ...seenLines(c),
    ...(harnesses.length ? ['observed, by harness (at once, so their times overlap):', ...harnesses] : ['no harness was observed']),
    `measuring it: ${msWord(c.overheadMs)} ms`,
  ];
};

/**
 * One pass as the store keeps it among the recent (`tick-recent.json`): when, its time, what it saw (`Seen`, its wait and load absent from
 * a pass an older tick kept), the run records it read and the runs it answered from memory, its journal reads (`reads`, those of its
 * `journals` phase), and each phase's time; with them, the quota the daemon last read (`Reading`), the labels of each check it filed, and
 * what the daemon's last sweep of the store's disk read (`disk`), none before any.
 */
export type RecentPass = Omit<Seen, 'waitMs' | 'load'> &
  Partial<Pick<Seen, 'waitMs' | 'load'>> & {
    at: string;
    ms: number;
    records: number;
    rested: number;
    reads: number;
    phases: Record<Phase, number>;
    quota?: Reading;
    checks?: CheckLabels[];
    disk?: DiskReading;
  };

/** Each harness's quota as last read: harness, then the harness's own name for a window, then the percent of it used. */
export type Reading = Record<string, Record<string, number>>;

/** A check filed, by what it belongs to: never its run, whose own detail stays in its record. */
export type CheckLabels = { factory: string; workflow: string; step: string; agent: string };

/** What a pass is kept with beside its cost: the quota read, the checks filed in it, and the last reading of the store's disk. */
export type AlsoKept = { quota?: Reading; checks?: readonly CheckLabels[]; disk?: DiskReading };

/** A pass's cost as it is kept among the recent passes (`RecentPass`), with what it is kept with (`AlsoKept`). */
export const recentOf = (c: PassCost, also: AlsoKept = {}): RecentPass => ({
  at: c.at,
  ms: c.ms,
  runs: c.runs,
  tasks: c.tasks,
  queued: c.queued,
  admitted: c.admitted,
  waitMs: c.waitMs,
  load: c.load,
  records: c.records,
  rested: c.rested,
  reads: c.phases.journals.reads,
  phases: Object.fromEntries(PHASES.map((p) => [p, c.phases[p].ms])) as Record<Phase, number>,
  ...(also.quota && Object.keys(also.quota).length ? { quota: also.quota } : {}),
  ...(also.checks?.length ? { checks: [...also.checks] } : {}),
  ...(also.disk ? { disk: also.disk } : {}),
});

/** How many recent passes the store keeps: about ten minutes of a daemon ticking every four seconds. */
export const RECENT_KEPT = 150;

/** The upper bounds, in ms, of a pass's buckets, one past the last for any longer: the histogram's, and the pass's metric's. */
export const PASS_BOUNDS: readonly number[] = [10, 25, 50, 100, 250, 500, 1000, 2500, 5000];

/** The upper bounds of a pass's journal reads, one past the last for more: the histogram's, and the pass's metric's. */
export const READ_BOUNDS: readonly number[] = [0, 1, 2, 5, 10, 25, 50, 100, 250, 500, 1000];

/** One bucket of passes: those over the bound before and at most `le` ms, `le` null for the last, which has no bound. */
export type PassBucket = { le: number | null; count: number };

/** The passes counted into the buckets of `bounds`, each in the first whose bound it does not pass, and one past the last for the rest. */
export const passHistogram = (recent: readonly Pick<RecentPass, 'ms'>[], bounds: readonly number[] = PASS_BOUNDS): PassBucket[] => {
  const counts = Array.from({ length: bounds.length + 1 }, () => 0);
  for (const { ms } of recent) {
    const at = bounds.findIndex((le) => ms <= le);
    const bucket = at < 0 ? bounds.length : at;
    counts[bucket] = (counts[bucket] ?? 0) + 1;
  }
  return counts.map((count, k) => ({ le: bounds[k] ?? null, count }));
};

/** One phase over the recent passes: its time a pass, on average, and its share of all their time. */
export type PassPart = { phase: Phase; ms: number; share: number };

/** Each phase over `recent` (`PassPart`), heaviest first, the phases' own order between equals; none for no pass. */
export const passParts = (recent: readonly Pick<RecentPass, 'ms' | 'phases'>[]): PassPart[] => {
  if (!recent.length) return [];
  const whole = recent.reduce((n, r) => n + r.ms, 0);
  return PHASES.map((phase) => {
    const ms = recent.reduce((n, r) => n + r.phases[phase], 0);
    return { phase, ms: ms / recent.length, share: whole > 0 ? ms / whole : 0 };
  }).sort((a, b) => b.ms - a.ms);
};

/**
 * The recent passes in a few numbers: how many, the median and the slowest time, and what the latest saw — the runs listed, the journal
 * reads, the tasks, the sessions queued and admitted. Null for no pass.
 */
export type PassSummary = Omit<Seen, 'waitMs' | 'load'> & {
  passes: number;
  medianMs: number;
  slowestMs: number;
  reads: number;
  at: string;
};

/** The recent passes' summary (`PassSummary`), null for none. */
export const passSummary = (recent: readonly RecentPass[]): PassSummary | null => {
  const latest = recent.at(-1);
  if (!latest) return null;
  const sorted = recent.map((r) => r.ms).sort((a, b) => a - b);
  const mid = sorted.length >> 1;
  const [lower, upper, slowest] = [sorted[mid - 1], sorted[mid], sorted.at(-1)];
  if (upper === undefined || slowest === undefined) return null;
  return {
    passes: recent.length,
    medianMs: sorted.length % 2 || lower === undefined ? upper : (lower + upper) / 2,
    slowestMs: slowest,
    at: latest.at,
    runs: latest.runs,
    tasks: latest.tasks,
    queued: latest.queued,
    admitted: latest.admitted,
    reads: latest.reads,
  };
};

/**
 * What `nemia passes` and `GET /api/passes` answer: the recent passes, oldest first, and of them the histogram over `bounds`, the parts
 * and the summary.
 */
export type PassesRead = {
  recent: RecentPass[];
  histogram: PassBucket[];
  parts: PassPart[];
  summary: PassSummary | null;
  bounds: readonly number[];
};

/** The answer of the recent passes `recent` (`PassesRead`). */
export const passesRead = (recent: RecentPass[]): PassesRead => ({
  recent,
  histogram: passHistogram(recent),
  parts: passParts(recent),
  summary: passSummary(recent),
  bounds: PASS_BOUNDS,
});

/** A bucket's bound as a person reads it: `≤ 100 ms`, and `> 5000 ms` for the last. */
const bucketWord = (b: PassBucket, bounds: readonly number[]): string => (b.le === null ? `> ${bounds.at(-1)} ms` : `≤ ${b.le} ms`);

/** `nemia passes`' lines: the summary, the histogram a row a bucket from the first to the last with passes, and the parts. */
export const passesLines = ({ recent, histogram, parts, summary, bounds }: PassesRead): string[] => {
  const [oldest] = recent;
  if (!summary || !oldest) return ['no pass is kept yet: nemia up, or the api, ticks the store and keeps its last passes'];
  const first = histogram.findIndex((b) => b.count > 0);
  const last = histogram.length - 1 - [...histogram].reverse().findIndex((b) => b.count > 0);
  const most = Math.max(...histogram.map((b) => b.count));
  const width = Math.max(...histogram.map((b) => bucketWord(b, bounds).length));
  return [
    `${plural(summary.passes, 'pass', 'passes')} since ${oldest.at}: ${msWord(summary.medianMs)} ms a pass (median), slowest ${msWord(summary.slowestMs)}`,
    `the last pass: ${plural(summary.runs, 'run')} in the store, ${plural(summary.reads, 'journal read')}, ` +
      `${plural(summary.tasks, 'task')} not settled, ${summary.queued} queued, ${summary.admitted} admitted`,
    'passes by time:',
    ...histogram
      .slice(first, last + 1)
      .map((b) => `  ${bucketWord(b, bounds).padStart(width)}  ${'#'.repeat(Math.ceil((b.count / most) * 30))} ${b.count}`),
    'where the time went, a pass on average:',
    ...parts.map((p) => `  ${p.phase.padEnd(8)} ${msWord(p.ms).padStart(7)} ms  ${Math.round(p.share * 100)}%`),
  ];
};
