/**
 * The report's shape, as `--json` writes it and `--compare` reads it, and the markdown `report.ts` prints of it: the report alone
 * (`rendered`) and beside a baseline (`comparedWith`).
 */
import type { Refusal } from './fence.ts';

/**
 * The six reads, the run's object counted twice, the old list of summaries beside the RunList (its yardstick), the list, an open run
 * and the inbox read again after a pass, and her chat's three (its history, the old beat's whole re-projection and the fold of one
 * moment of her session), and the factory's reads the board polls (the list, one factory, its commands, its schedules, hires, volumes
 * and MCP servers) and the ceilings: `measures`' keys.
 */
export const MEASURES = [
  'tickPass',
  'tickPassInformed',
  'runList',
  'runSummaries',
  'stats',
  'finishedRun',
  'openRun',
  'feedFromCursor',
  'runListAfterPass',
  'openRunAfterPass',
  'inbox',
  'inboxAfterPass',
  'chatHistory',
  'chatBeatBefore',
  'chatFoldStep',
  'factoryList',
  'factoryGet',
  'factoryCommands',
  'scheduleList',
  'hireList',
  'volumeList',
  'mcpServerList',
  'ceilings',
] as const;

/** A read the report measures. */
export type MeasureKey = (typeof MEASURES)[number];

/** One read's cost: the median of its calls in milliseconds, and the median heap it left held after a collection, in megabytes. */
export type Timed = { ms: number; heapMb: number };

/** A read cold and warm, and the median count of run records (`runs/<id>.json`) one call read, where it was counted. */
export type Measured = { cold: Timed; warm: Timed; records?: { cold: number; warm: number } };
/** What the report says, as `--json` writes it and `--compare` reads it. */
export type StoreMeasure = {
  /** `load` is the machine's five-minute load average as the measure ends: numbers taken under another's load are not a baseline. */
  machine: { cpu: string; cores: number; memoryBytes: number; node: string; platform: string; load: number };
  commit: string;
  date: string;
  repeat: number;
  from: string;
  engine: string;
  copy: { files: number; bytes: number; ms: number; leftOut: string[] };
  counts: {
    runs: number;
    finishedRuns: number;
    openRuns: number;
    tasks: number;
    journalBytes: number;
    feedLines: number;
    /** The cards `GET /api/cards` lists, and those of them a run was started from (a `status.runs` that is not empty). */
    cards: { listed: number; started: number };
    /** Runs the list answered off their record because a task's journal did not read, and the lines the pass said were unreadable. */
    unreadable: { runs: number; passLines: number };
    /** The records the Run model refuses (`invariantRefusals`). */
    invariantRefusals: number;
  };
  asked: {
    /** The factory the factory's reads were asked of: the copy's first but the default, null where it has none. */
    factory?: string | null;
    finishedRun: string | null;
    openRun: string | null;
    feedCursor: number;
    feedLinesRead: number;
    /** Her chat as the copy's level file names it: her task (null where none is filed), the events her history listed, its cursor. */
    chat?: { task: string | null; events: number; cursor: string };
  };
  measures: Record<MeasureKey, Measured | null>;
  /** Each child process the reads ran, by verdict and program, counted. */
  spawned: Record<string, number>;
  /** Each write the place refused the pass, by verb, counted. */
  placeRefused: Record<string, number>;
  refusals: Refusal[];
};

const ms = (n: number) => n.toFixed(1);
const mb = (n: number) => (n / 1e6).toFixed(1);

/** The report as markdown. */
export function rendered(report: StoreMeasure): string {
  const { counts } = report;
  const row = (key: MeasureKey) => {
    const m = report.measures[key];
    return m === null
      ? `| ${key} | — | — | — | — | — |`
      : `| ${key} | ${ms(m.cold.ms)} | ${m.cold.heapMb.toFixed(1)} | ${ms(m.warm.ms)} | ${m.warm.heapMb.toFixed(1)} | ${m.records ? `${m.records.cold} / ${m.records.warm}` : '—'} |`;
  };
  return [
    `store measure of ${report.from} (${report.engine}), copied: ${report.copy.files} files, ${mb(report.copy.bytes)} MB in ${(report.copy.ms / 1000).toFixed(0)} s, without ${report.copy.leftOut.join(', ') || 'nothing'}`,
    `${counts.runs} runs (${counts.finishedRuns} finished, ${counts.openRuns} open), ${counts.tasks} tasks, ${mb(counts.journalBytes)} MB of journals, ${counts.feedLines} feed lines, ${counts.cards.listed} cards (${counts.cards.started} started); unreadable: ${counts.unreadable.runs} runs, ${counts.unreadable.passLines} pass lines; invariant refusals: ${counts.invariantRefusals}`,
    `${report.machine.cpu}, ${report.machine.cores} cores, ${mb(report.machine.memoryBytes)} MB, node ${report.machine.node}, load ${report.machine.load}; commit ${report.commit.slice(0, 12)}; ${report.date}; median of ${report.repeat}`,
    `runs read: finished ${report.asked.finishedRun ?? '—'}, open ${report.asked.openRun ?? '—'}; feed from byte ${report.asked.feedCursor}, ${report.asked.feedLinesRead} lines; her chat: task ${report.asked.chat?.task ?? '—'}, ${report.asked.chat?.events ?? 0} events listed, cursor ${report.asked.chat?.cursor ?? '—'}`,
    '',
    '| read | cold ms | cold heap MB | warm ms | warm heap MB | run records read, cold / warm |',
    '| --- | ---: | ---: | ---: | ---: | ---: |',
    ...MEASURES.map(row),
    '',
    `spawned: ${
      Object.entries(report.spawned)
        .map(([what, n]) => `${what} ×${n}`)
        .join(', ') || 'nothing'
    }; place writes refused: ${
      Object.entries(report.placeRefused)
        .map(([verb, n]) => `${verb} ×${n}`)
        .join(', ') || 'none'
    }`,
  ].join('\n');
}

/** Each number of `now` beside `baseline`'s, and their ratio, as markdown: `—` for a read or a count the baseline lacks. */
export function comparedWith(now: StoreMeasure, baseline: StoreMeasure): string {
  const records = (m: Measured | null | undefined) => (m?.records ? `${m.records.cold} / ${m.records.warm}` : '—');
  const ratio = (a: number, b: number | undefined) => (b !== undefined && b > 0 ? `×${(a / b).toFixed(2)}` : '—');
  const cell = (n: Measured | null, b: Measured | null | undefined, side: 'cold' | 'warm') =>
    n === null ? '— | — | —' : `${ms(n[side].ms)} | ${b ? ms(b[side].ms) : '—'} | ${ratio(n[side].ms, b?.[side].ms)}`;
  return [
    `against ${baseline.commit.slice(0, 12)} of ${baseline.date}: ${now.counts.runs} runs now, ${baseline.counts.runs} then; ${now.counts.tasks} tasks now, ${baseline.counts.tasks} then; ${now.counts.cards.listed} cards now, ${baseline.counts.cards?.listed ?? '—'} then`,
    '',
    '| read | cold ms | baseline | ratio | warm ms | baseline | ratio | records read now | baseline |',
    '| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |',
    ...MEASURES.map(
      (key) =>
        `| ${key} | ${cell(now.measures[key], baseline.measures?.[key], 'cold')} | ${cell(now.measures[key], baseline.measures?.[key], 'warm')} | ${records(now.measures[key])} | ${records(baseline.measures?.[key])} |`,
    ),
  ].join('\n');
}
