/**
 * The series' files: a tier's lines by UTC day, `$WF_ROOT/metrics/<tier>/<YYYY-MM-DD>.jsonl`, a line of JSON a series over a span
 * (`RollupLine`), appended by the ticking daemon's pass alone (`keepSeries`) and deleted by date as their retention passes. Beneath the
 * controllers: it imports the store's root and the pass's meter, and no controller.
 */
import fs from 'node:fs';
import path from 'node:path';
import { Schema } from 'effect';
import { HOME } from '../record/record.store.ts';
import { countRead } from '../meter/tally.store.ts';
import { Invalid } from '../refusal/refusal.ts';
import { dayOf, LABEL_KEYS, strangeLabels, type RollupLine, type Tier } from './series.ts';

/** The folder of a tier's files. */
export const tierDir = (tier: Tier): string => path.join(HOME, 'metrics', tier);

/** The file of a tier's day. */
export const dayFile = (tier: Tier, day: string): string => path.join(tierDir(tier), `${day}.jsonl`);

const DAY_FILE = /^(\d{4}-\d{2}-\d{2})\.jsonl$/;

/** The days a tier holds a file of, oldest first: none before any is written. */
export const days = (tier: Tier): string[] => {
  let names: string[];
  try {
    names = fs.readdirSync(tierDir(tier));
  } catch {
    return [];
  }
  return names.flatMap((name) => DAY_FILE.exec(name)?.slice(1, 2) ?? []).sort();
};

/** Lines appended to their days' files of `tier`. Refuses as `Invalid` a line labelled by a key outside `LABEL_KEYS`, writing none. */
export const appendLines = (tier: Tier, lines: readonly RollupLine[]): void => {
  for (const line of lines) {
    const strange = strangeLabels(line.l);
    if (strange.length)
      throw new Invalid({
        message: `A series line may not be labelled ${strange.join(', ')}: its labels are ${LABEL_KEYS.join(', ')}. A run's own detail stays in its record.`,
      });
  }
  if (!lines.length) return;
  fs.mkdirSync(tierDir(tier), { recursive: true });
  const byDay = new Map<string, string[]>();
  for (const line of lines) byDay.set(dayOf(line.t), [...(byDay.get(dayOf(line.t)) ?? []), `${JSON.stringify(line)}\n`]);
  for (const [day, texts] of byDay) fs.appendFileSync(dayFile(tier, day), texts.join(''));
};

/** A line as the files hold it. */
const isLine = Schema.is(
  Schema.Struct({
    t: Schema.String,
    s: Schema.String,
    l: Schema.Record(Schema.String, Schema.String),
    n: Schema.Finite,
    sum: Schema.Finite,
    min: Schema.Finite,
    max: Schema.Finite,
    last: Schema.Finite,
    b: Schema.optionalKey(Schema.Array(Schema.Finite)),
    p50: Schema.optionalKey(Schema.Finite),
    p95: Schema.optionalKey(Schema.Finite),
  }),
);

/** The lines `text` holds, and how many of its lines do not read as one. */
const linesIn = (text: string): { lines: RollupLine[]; unread: number } => {
  const lines: RollupLine[] = [];
  let unread = 0;
  for (const raw of text.split('\n')) {
    if (!raw.trim()) continue;
    let value: unknown;
    try {
      value = JSON.parse(raw);
    } catch {
      value = undefined;
    }
    if (isLine(value)) lines.push(value as RollupLine);
    else unread++;
  }
  return { lines, unread };
};

/** The bytes the tail read takes: many lines longer than a histogram's. */
const TAIL = 16_384;

/** The last line of `tier`'s latest day, read off the file's tail alone; undefined where none reads. */
export const lastLine = (tier: Tier): RollupLine | undefined => {
  const day = days(tier).at(-1);
  if (!day) return undefined;
  let fd: number | undefined;
  try {
    fd = fs.openSync(dayFile(tier, day), 'r');
    const size = fs.fstatSync(fd).size;
    const length = Math.min(size, TAIL);
    const buf = Buffer.alloc(length);
    fs.readSync(fd, buf, 0, length, size - length);
    countRead(length);
    return linesIn(
      buf
        .toString('utf8')
        .split('\n')
        .slice(size > length ? 1 : 0)
        .join('\n'),
    ).lines.at(-1);
  } catch {
    return undefined;
  } finally {
    if (fd !== undefined) fs.closeSync(fd);
  }
};

/** A tier's day as it reads: its lines, a line that does not read as one left out and the file said once on stderr; none for no file. */
export const readDay = (tier: Tier, day: string): RollupLine[] => {
  let text: string;
  try {
    text = fs.readFileSync(dayFile(tier, day), 'utf8');
  } catch {
    return [];
  }
  countRead(Buffer.byteLength(text));
  const { lines, unread } = linesIn(text);
  if (unread) process.stderr.write(`${dayFile(tier, day)}: ${unread} of its lines did not read as a series line and were left out.\n`);
  return lines;
};

/** What a day's file is now, its size and time of change, to tell a memo it moved; undefined for no file. */
export const dayStamp = (tier: Tier, day: string): string | undefined => {
  try {
    const st = fs.statSync(dayFile(tier, day));
    return `${st.size}:${st.mtimeMs}`;
  } catch {
    return undefined;
  }
};

/** A tier's day deleted; nothing for one that is gone. */
export const dropDay = (tier: Tier, day: string): void => fs.rmSync(dayFile(tier, day), { force: true });
