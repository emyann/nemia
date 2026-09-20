/**
 * The arithmetic of `judge runs`, and every line it prints. Pure: no file, no network, no clock.
 *
 * Two things are scored against the same label — the folder a person chose — and the label is the only ground truth
 * there is. It is agreement with a person, never accuracy: pivot §2.4 records that the owner found afterwards that
 * skipping the plan step had been the mistake on some runs. That is what the list of disagreements is for, and why it
 * prints the brief's first line beside the probabilities: it is meant to be read, not counted.
 *
 * `unsure` is kept out of both the right and the wrong column and shown on a line of its own, for the judge alone; the
 * rival has no unsure, because plain code always answers.
 */
import { dispatch, THRESHOLDS, type CardAnswers, type Dispatch } from './card.ts';
import { decide, type Judgment, type Verdict } from './decide.ts';
import type { Guess } from './rival.ts';
import { reasons, type Label, type Skipped } from './runs.ts';

/** One run in scope: what the person chose, what the rival guessed, and — when the judge is on — what it answered. */
export type Row = {
  readonly id: string;
  readonly first: string;
  /** The person's choice, and the two properties it is made of. */
  readonly folder: Label;
  readonly web: boolean;
  readonly plan: boolean;
  readonly rival: Guess;
  /**
   * The stripped card that would travel, which is the dispatch's identity: two runs whose brief strips to the same
   * card are asked once and answered alike, so the report counts the distinct briefs and names the runs that share one.
   */
  readonly card: string;
  /** Absent when the judge is off. */
  readonly answers?: CardAnswers;
};

/** How many distinct briefs the rows are: fewer than the rows when one brief was dispatched more than once. */
export const distinctBriefs = (rows: readonly Row[]): number => new Set(rows.map((r) => r.card)).size;

/** For each run that shares its brief with another in scope, the other runs' ids, in the order they were read. */
export const sharing = (rows: readonly Row[]): Map<string, string[]> => {
  const by = new Map<string, string[]>();
  for (const r of rows) by.set(r.card, [...(by.get(r.card) ?? []), r.id]);
  const out = new Map<string, string[]>();
  for (const r of rows) {
    const ids = by.get(r.card)!.filter((id) => id !== r.id);
    if (ids.length > 0) out.set(r.id, ids);
  }
  return out;
};

export type Property = 'web' | 'plan';

/** The judge's verdict on a property, through the shipped thresholds: one mapping, never a second copy. */
export const verdictOf = (row: Row, property: Property): Verdict | undefined =>
  row.answers ? decide(row.answers[property], THRESHOLDS[property]) : undefined;

/** Where the judge would have sent the run, through `dispatch` itself. */
export const dispatchOf = (row: Row): Dispatch | undefined => (row.answers ? dispatch(row.answers) : undefined);

/** What a judgment reads as, in a table's width: its probability, its level, or the kind of failure. */
export const shown = (j: Judgment): string => {
  if (j.status === 'failed') return j.kind;
  const a = j.answer as { type: string; noul?: number; score?: number };
  return a.type === 'noul' ? `P ${a.noul!.toFixed(2)}` : `score ${a.score!.toFixed(2)}`;
};

// ─── the tables ─────────────────────────────────────────────────────────────────────────────────

/**
 * A property against the label. `yesNo` is a yes where the label says no, and so on; `unsure` is counted apart and is
 * in neither. Precision and recall are over the decided ones only, and are null when nothing was decided that way.
 */
export type Table = {
  readonly yesYes: number;
  readonly yesNo: number;
  readonly noYes: number;
  readonly noNo: number;
  readonly unsure: number;
  readonly decided: number;
  readonly right: number;
  readonly precision: number | null;
  readonly recall: number | null;
};

export const confusion = (
  rows: readonly Row[],
  predict: (row: Row) => Verdict | undefined,
  truth: (row: Row) => boolean,
): Table => {
  let yesYes = 0, yesNo = 0, noYes = 0, noNo = 0, unsure = 0;
  for (const row of rows) {
    const p = predict(row);
    if (p === undefined) continue;
    const t = truth(row);
    if (p === 'unsure') unsure++;
    else if (p === 'yes') t ? yesYes++ : yesNo++;
    else t ? noYes++ : noNo++;
  }
  const decided = yesYes + yesNo + noYes + noNo;
  return {
    yesYes, yesNo, noYes, noNo, unsure, decided, right: yesYes + noNo,
    precision: yesYes + yesNo > 0 ? yesYes / (yesYes + yesNo) : null,
    recall: yesYes + noYes > 0 ? yesYes / (yesYes + noYes) : null,
  };
};

/** Whole folders: how many match the person's, how many differ, and how many the judge left in the inbox. */
export type Agreement = { readonly same: number; readonly differ: number; readonly inbox: number; readonly of: number };

export const agreement = (rows: readonly Row[], guess: (row: Row) => string | null | undefined): Agreement => {
  let same = 0, differ = 0, inbox = 0, of = 0;
  for (const row of rows) {
    const g = guess(row);
    if (g === undefined) continue;
    of++;
    if (g === null) inbox++;
    else if (g === row.folder) same++;
    else differ++;
  }
  return { same, differ, inbox, of };
};

export const judgeFolder = (row: Row): string | null | undefined => {
  const d = dispatchOf(row);
  return d === undefined ? undefined : 'folder' in d ? d.folder : null;
};

export type Disagreement = {
  readonly id: string;
  readonly first: string;
  readonly folder: Label;
  /** Where the judge would have sent it, or why it stayed in the inbox. */
  readonly judge: string;
  readonly inbox: boolean;
  readonly probabilities: { readonly web: string; readonly plan: string; readonly clear: string };
  /** Other runs in scope dispatched with this same brief: one disagreement, not two, whatever folder each chose. */
  readonly also: readonly string[];
};

/** The runs where the judge and the person do not agree: the interesting ones, in the order the runs were read. */
export const disagreements = (rows: readonly Row[]): Disagreement[] => {
  const shared = sharing(rows);
  const out: Disagreement[] = [];
  for (const row of rows) {
    const d = dispatchOf(row);
    if (d === undefined || ('folder' in d && d.folder === row.folder)) continue;
    out.push({
      id: row.id, first: row.first, folder: row.folder,
      judge: 'folder' in d ? d.folder : `the inbox: ${d.inbox}`, inbox: !('folder' in d),
      probabilities: {
        web: shown(row.answers!.web), plan: shown(row.answers!.plan), clear: shown(row.answers!.clear),
      },
      also: shared.get(row.id) ?? [],
    });
  }
  return out;
};

// ─── the report ─────────────────────────────────────────────────────────────────────────────────

export type Cost = {
  readonly requests: number;
  readonly questions: number;
  readonly inputTokens: number;
  readonly ms: number;
};

export type Report = {
  readonly store: string;
  readonly record: string;
  readonly model: string;
  readonly since?: string;
  /** Records read from the store, in scope and out. */
  readonly read: number;
  readonly rows: readonly Row[];
  readonly skipped: readonly Skipped[];
  /** Absent when the judge is off; then only the rival is scored, and this says why. */
  readonly asked?: Cost;
  readonly off?: string;
};

const pct = (x: number | null) => (x === null ? '  — ' : x.toFixed(2));

const WHAT: Record<Property, string> = {
  web: 'does the work change apps/web or the api it runs against · the label is a -build folder',
  plan: 'should someone read the code and plan first · the label is a dev-planned folder',
};

const row = (cells: readonly string[], widths: readonly number[]) =>
  cells.map((c, i) => (i === 0 ? c.padEnd(widths[i]!) : c.padStart(widths[i]!))).join('').trimEnd();

const WIDTHS = [10, 11, 10, 10];
const WIDE = WIDTHS.reduce((a, b) => a + b, 0);

const LABEL_LIST = 'dev, dev-build, dev-planned or dev-planned-build';

const table = (name: string, t: Table, unsure: boolean): string[] => {
  const lines = [
    row([`  ${name}`, 'label yes', 'label no', ''], WIDTHS),
    row([`    yes`, String(t.yesYes), String(t.yesNo), `P ${pct(t.precision)}`], WIDTHS),
    row([`    no`, String(t.noYes), String(t.noNo), `R ${pct(t.recall)}`], WIDTHS),
  ];
  if (unsure) lines.push(`${row(['    unsure', String(t.unsure), '', ''], WIDTHS).padEnd(WIDE)}   kept out of both`);
  return lines;
};

/** Everything `judge runs` prints after its preamble. */
export const lines = (report: Report): string[] => {
  const { rows, skipped } = report;
  const out: string[] = [];
  const since = report.since ? ` · since ${report.since}` : '';
  out.push(`judge runs: ${rows.length} of ${report.read} records were dispatched to ${LABEL_LIST}${since} · ${report.model}`);
  const distinct = distinctBriefs(rows);
  if (distinct < rows.length) {
    out.push(`  ${distinct} distinct brief${distinct === 1 ? '' : 's'}: ${rows.length - distinct} of these runs repeat one another sent.`);
    out.push('    each is scored — a dispatch is a choice a person made — and the judge is asked once per brief.');
  }
  out.push(`  store: ${report.store}`);
  for (const { why, count } of reasons(skipped)) out.push(`  skipped ${String(count).padStart(3)}  ${why}`);
  if (report.off) out.push(`  ${report.off}; only the rival is scored.`);
  if (rows.length === 0) {
    out.push('  nothing to score.');
    return out;
  }
  const on = report.off === undefined;
  for (const property of ['web', 'plan'] as const) {
    out.push('');
    out.push(`${property} · ${WHAT[property]}`);
    const truth = (r: Row) => r[property];
    if (on) out.push(...table('judge', confusion(rows, (r) => verdictOf(r, property), truth), true));
    out.push(...table('rival', confusion(rows, (r) => (r.rival[property] ? 'yes' : 'no'), truth), false));
  }
  out.push('');
  out.push('the whole folder');
  const say = (name: string, a: Agreement) =>
    `  ${name.padEnd(8)}${a.same} of ${a.of} agree · ${a.differ} differ${name === 'judge' ? ` · ${a.inbox} stayed in the inbox, counted apart` : ''}`;
  if (on) out.push(say('judge', agreement(rows, judgeFolder)));
  out.push(say('rival', agreement(rows, (r) => r.rival.folder)));
  if (on) {
    const differ = disagreements(rows);
    out.push('');
    out.push(`where the judge and the person differ · ${differ.length} of ${rows.length}; the person's choice is not always right (pivot §2.4)`);
    for (const d of differ) {
      out.push(`  ${d.id}${d.also.length > 0 ? ` · the same brief was dispatched as ${d.also.join(', ')}` : ''}`);
      out.push(`    ${d.folder} → ${d.judge}`);
      out.push(`    web ${d.probabilities.web} · plan ${d.probabilities.plan} · clear ${d.probabilities.clear}`);
      out.push(`    ${d.first}`);
    }
    if (differ.length === 0) out.push('  none.');
  }
  out.push('');
  if (report.asked) {
    const a = report.asked;
    out.push(`${a.requests} requests · ${a.questions} questions · ${a.inputTokens} input tokens · ${a.ms} ms`);
  }
  out.push(`record: ${report.record}`);
  out.push('nothing was filed, started or shown to anyone: this command gates nothing.');
  return out;
};

/** The same report, whole, for `--json`: the tables, the rows and every judgment exactly as it was read. */
export const document = (report: Report) => {
  const on = report.off === undefined;
  const property = (p: Property) => ({
    ...(on ? { judge: confusion(report.rows, (r) => verdictOf(r, p), (r) => r[p]) } : {}),
    rival: confusion(report.rows, (r) => (r.rival[p] ? 'yes' : 'no'), (r) => r[p]),
  });
  return {
    v: 1,
    store: report.store,
    record: report.record,
    model: report.model,
    ...(report.since ? { since: report.since } : {}),
    ...(report.off ? { off: report.off } : {}),
    read: report.read,
    inScope: report.rows.length,
    distinctBriefs: distinctBriefs(report.rows),
    labels: LABEL_LIST,
    skipped: report.skipped,
    asked: report.asked ?? null,
    web: property('web'),
    plan: property('plan'),
    folder: {
      ...(on ? { judge: agreement(report.rows, judgeFolder) } : {}),
      rival: agreement(report.rows, (r) => r.rival.folder),
    },
    disagreements: on ? disagreements(report.rows) : [],
    runs: report.rows.map((r) => ({
      id: r.id, first: r.first, folder: r.folder, label: { web: r.web, plan: r.plan },
      rival: r.rival,
      judge: r.answers
        ? {
            folder: judgeFolder(r), web: verdictOf(r, 'web'), plan: verdictOf(r, 'plan'),
            clear: decide(r.answers.clear, THRESHOLDS.clear), answers: r.answers,
          }
        : null,
    })),
  };
};
