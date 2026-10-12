/**
 * A time of day in words has one writer, `timeOfDay` (src/lib/timeOfDay.ts), on a 12-hour clock, and the board's source holds no
 * second one: no option that writes an hour (`hourCycle`, `hour12`, `hour:`, `timeStyle:`) outside the writer's file, and no instant
 * written whole as the browser does (`toLocaleTimeString(`, a bare `toLocaleString()`) but the ones `LEFT` lists, by file and count,
 * a list that only shrinks. The vendored kit (`src/components/ui/ds`) is another repository's and stays out.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { clockWord } from '../src/lib/quota.ts';
import { whenColumn, whenWords } from '../src/lib/runWords.ts';
import { fireWord } from '../src/lib/schedules.ts';
import { timeOfDay } from '../src/lib/timeOfDay.ts';

const WEB = path.resolve(import.meta.dirname, '..');

/** The one folder of `src` the rule does not read, from the board's root. */
const KIT = 'src/components/ui/ds';

/** The one file an hour is written in, from the board's root. */
export const WRITER = 'src/lib/timeOfDay.ts';

/** The options that make a formatter write an hour: each is the writer's alone. */
export const OPTIONS: Record<string, RegExp> = {
  cycle: /(?<![\w.])hourCycle(?!\w)/g,
  twelve: /(?<![\w.])hour12(?!\w)/g,
  hour: /(?<![\w.'"`])hour\s*:/g,
  style: /(?<![\w.'"`])timeStyle\s*:/g,
};

/** The calls that write a whole instant as the browser does, its hour included. */
export const LOCALE: Record<string, RegExp> = {
  time: /\.toLocaleTimeString\s*\(/g,
  bare: /\.toLocaleString\s*\(\s*\)/g,
};

/** What a pattern found in a text: the words written and where, as `line:column`. */
export interface Found {
  words: string;
  at: string;
}

/** Everything `families` find in `text`, in the order written. */
export function foundAt(text: string, families: Record<string, RegExp>): Found[] {
  return Object.values(families)
    .flatMap((family) => [...text.matchAll(family)])
    .sort((a, b) => a.index - b.index)
    .map((m) => {
      const before = text.slice(0, m.index).split('\n');
      return { words: m[0].replace(/\s+/g, ''), at: `${before.length}:${before.at(-1)!.length + 1}` };
    });
}

/** An instant left written as the browser does: its file from the board's root, how many of them it holds, and why it is no time of day in words. */
export interface Left {
  file: string;
  count: number;
  why: string;
}

const WHOLE = "a whole instant, its date and its seconds, in the browser's own form: the form of an instant is a card of its own";

/** The instants left, each in its file alone. A new one is refused, and one moved onto the writer lowers its count here. */
export const LEFT: Left[] = [
  { file: 'src/components/Facts.tsx', count: 1, why: WHOLE },
  { file: 'src/components/InboxParts.tsx', count: 2, why: WHOLE },
  { file: 'src/components/QueueLane.tsx', count: 1, why: WHOLE },
  { file: 'src/components/Timeline.tsx', count: 2, why: "a log line's instant to the second, and its date in the title: data read as a log's" },
  { file: 'src/lib/factory.ts', count: 3, why: WHOLE },
  { file: 'src/routes/inbox.tsx', count: 1, why: WHOLE },
  { file: 'src/routes/inbox_.$name.tsx', count: 1, why: WHOLE },
];

/**
 * What is wrong in `files` (each a source text by its path from the board's root): an hour option outside `WRITER`, as
 * `file:line:column (words)`; a file with more whole instants than `left` gives it; and an entry of `left` whose file holds fewer.
 */
export function refusals(files: Record<string, string>, left: Left[] = LEFT): string[] {
  const options = Object.entries(files)
    .filter(([file]) => file !== WRITER)
    .flatMap(([file, text]) =>
      foundAt(text, OPTIONS).map(({ words, at }) => `${file}:${at} (${words}) writes an hour: take the time from timeOfDay (${WRITER})`),
    );
  const names = [...new Set([...Object.keys(files), ...left.map((l) => l.file)])].sort();
  const instants = names.flatMap((file) => {
    const found = foundAt(files[file] ?? '', LOCALE);
    const allowed = left.find((l) => l.file === file)?.count ?? 0;
    if (found.length > allowed)
      return [
        `${file} writes ${found.length} instants as the browser does (${found.map((f) => f.at).join(', ')}), ${allowed} are left to it: take the time from timeOfDay (${WRITER})`,
      ];
    if (found.length < allowed) return [`${file} writes ${found.length} instants as the browser does, LEFT says ${allowed}: lower the list`];
    return [];
  });
  return [...options, ...instants];
}

/** Every `.ts` and `.tsx` of `root`'s `src` outside the kit, as its text by its path from `root`. */
function sources(root: string): Record<string, string> {
  return Object.fromEntries(
    fs
      .readdirSync(path.join(root, 'src'), { withFileTypes: true, recursive: true })
      .filter((e) => e.isFile() && /\.tsx?$/.test(e.name))
      .map((e) => path.relative(root, path.join(e.parentPath, e.name)).split(path.sep).join('/'))
      .filter((file) => !file.startsWith(`${KIT}/`))
      .sort()
      .map((file) => [file, fs.readFileSync(path.join(root, file), 'utf8')]),
  );
}

test('a time of day is written on a 12-hour clock: the hour with no leading zero, a plain space, AM or PM', () => {
  assert.equal(timeOfDay(new Date('2026-10-12T09:05:00Z'), 'UTC'), '9:05 AM', 'a morning');
  assert.equal(timeOfDay(new Date('2026-10-12T12:00:00Z'), 'UTC'), '12:00 PM', 'noon');
  assert.equal(timeOfDay(new Date('2026-10-12T00:05:00Z'), 'UTC'), '12:05 AM', 'after midnight');
  assert.equal(timeOfDay(new Date('2026-10-12T13:11:00Z'), 'UTC'), '1:11 PM', 'a single-digit hour of the afternoon');
  assert.equal(timeOfDay(new Date('2026-10-12T13:11:00Z'), 'Asia/Tokyo'), '10:11 PM', 'the same instant where the person is');
  assert.equal(timeOfDay(new Date('2026-10-12T23:59:00Z'), 'UTC'), '11:59 PM', 'the last minute of a day');
  assert.doesNotMatch(timeOfDay(new Date('2026-10-12T13:11:00Z'), 'UTC'), /[^\d: APM]/, 'no narrow space before the period');
});

test('every word that says a time takes it from the one writer, and decides its own day beside it', () => {
  const now = new Date('2026-10-12T15:00:00Z');
  const at = new Date('2026-10-12T13:11:00Z');
  assert.equal(clockWord(at, now, 'UTC'), '1:11 PM', 'the same day');
  assert.equal(clockWord(new Date('2026-10-13T02:00:00Z'), now, 'UTC'), 'Tue 2:00 AM', 'another day, by its weekday');
  assert.equal(whenWords(at, now, 'UTC'), '1:11 PM');
  assert.equal(whenWords(new Date('2026-10-11T13:11:00Z'), now, 'UTC'), '11 Oct 1:11 PM', 'another day, by its date');
  assert.equal(whenColumn(at, now, 'UTC'), '12 Oct  1:11 PM', 'a column pads the hour to two characters');
  assert.equal(whenWords(new Date('2025-12-31T13:11:00Z'), now, 'UTC'), '31 Dec 2025', 'the runs page drops the time in another year');
  assert.equal(fireWord(new Date('2026-10-20T12:00:00Z'), now, 'UTC'), '20 Oct 12:00 PM', "a far fire, in the runs page's order");
  assert.equal(fireWord(new Date('2027-01-01T09:00:00Z'), now, 'UTC'), '1 Jan 2027 9:00 AM', 'a fire in another year keeps its time');
});

test('REFUSED: a second writer of an hour, by each way one is written, and never the writer itself', () => {
  const second = (text: string) => refusals({ 'src/lib/x.ts': text }, []);
  assert.deepEqual(second("new Intl.DateTimeFormat(undefined, { hour: '2-digit', hourCycle: 'h23' }).format(at)"), [
    `src/lib/x.ts:1:38 (hour:) writes an hour: take the time from timeOfDay (${WRITER})`,
    `src/lib/x.ts:1:55 (hourCycle) writes an hour: take the time from timeOfDay (${WRITER})`,
  ]);
  assert.equal(second('const o = {\n  hour12:\n    true };').length, 1, 'an option broken across lines');
  assert.match(second('const o = {\n  hour\n    : "numeric" };')[0] ?? '', /^src\/lib\/x\.ts:2:3 \(hour:\)/, 'named where it starts');
  assert.equal(second("new Intl.DateTimeFormat('en', { timeStyle: 'short' })").length, 1, 'a time style');
  assert.equal(second("at.toLocaleTimeString([], { minute: '2-digit' })").length, 1, 'a time in the locale');
  assert.equal(second('at.toLocaleTimeString\n  ()').length, 1, 'broken before its parenthesis');
  assert.equal(second('new Date(iso).toLocaleString()').length, 1, 'a whole instant in the locale');
  assert.equal(second("count.toLocaleString('en')").length, 0, 'a number in a locale is no instant');
  assert.equal(second("of('hour'); const perHour = 3; rate.hour; type T = { hours: number }").length, 0, 'a word that only holds the name');
  assert.equal(refusals({ [WRITER]: 'new Intl.DateTimeFormat("en-US", { hour: "numeric", hour12: true })' }, []).length, 0, 'the writer');
});

test('REFUSED: one more instant written as the browser does than the list leaves a file, and a list left loose', () => {
  const left: Left[] = [{ file: 'src/a.tsx', count: 1, why: 'a fixture' }];
  const one = 'new Date(iso).toLocaleString()';
  assert.equal(refusals({ 'src/a.tsx': one }, left).length, 0, 'the one left to it');
  assert.deepEqual(refusals({ 'src/a.tsx': `${one}\n${one}` }, left), [
    `src/a.tsx writes 2 instants as the browser does (1:14, 2:14), 1 are left to it: take the time from timeOfDay (${WRITER})`,
  ]);
  assert.deepEqual(refusals({ 'src/a.tsx': '' }, left), ['src/a.tsx writes 0 instants as the browser does, LEFT says 1: lower the list']);
  assert.equal(refusals({}, left).length, 1, 'a file that is gone holds none');
  assert.equal(refusals({ 'src/a.tsx': one, 'src/b.tsx': one }, left).length, 1, 'the list is by file: another file has none left to it');
});

test("the board's source has one writer of an hour, and no instant in the browser's form but the ones left", () => {
  const files = sources(WEB);
  assert.ok(Object.keys(files).length > 100, `the source is read: ${Object.keys(files).length} files`);
  assert.ok(foundAt(files[WRITER] ?? '', OPTIONS).some((found) => found.words === 'hour12'), `${WRITER} is read, and holds the option`);
  assert.equal(
    LEFT.every((l) => l.why.trim()),
    true,
    'every instant left says why',
  );
  const wrong = refusals(files);
  assert.equal(wrong.length, 0, wrong.join('\n'));
});
