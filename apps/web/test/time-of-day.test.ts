/**
 * A time of day in words has one writer, `timeOfDay` (src/lib/timeOfDay.ts), on a 12-hour clock, and the board's source holds no
 * second one: no option that writes an hour (`hourCycle`, `hour12`, `hour:`, `timeStyle:`) outside the writer's file, and nothing
 * written as the browser's locale does (`toLocaleString(`, `toLocaleTimeString(`, `toLocaleDateString(`, whatever their arguments):
 * a whole instant is `instantWords`'s (src/lib/instant.ts). Every moment and date is written by date-fns, so no file of `src` builds
 * a formatter of its own (`Intl.DateTimeFormat`, with `new` or without), the writer's file included: no exemption. date-fns is the
 * one way left to write a moment, so the library itself is imported only in the four files that write one (`WRITERS`): that is what
 * holds the one-writer rule, which `OPTIONS` and `LOCALE` held between them while Intl was the only way. The calls that
 * write a number in a locale are `NUMBERS`, by file and count, each with its reason. The vendored kit (`src/components/ui/ds`) is
 * another repository's and stays out.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { clockWord } from '../src/lib/quota.ts';
import { agoWords, whenWords } from '../src/lib/runWords.ts';
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

/** The file a whole instant is written in, from the board's root: where a refusal sends a date written in a locale. */
export const INSTANT = 'src/lib/instant.ts';

/** The calls that write in a locale, whatever their arguments: a date's writes its hour or its date as the browser does. */
export const LOCALE: Record<string, RegExp> = {
  whole: /\.toLocaleString\s*\(/g,
  time: /\.toLocaleTimeString\s*\(/g,
  date: /\.toLocaleDateString\s*\(/g,
};

/**
 * How the board no longer writes a date: a formatter of its own, called with `new` or without, which ECMA-402 allows either way.
 * Refused in every file of `src`, the writer's own included. `\b` keeps the types out (`Intl.DateTimeFormatOptions`), and the
 * lookbehind a name that merely ends in `Intl`.
 */
export const FORMATTERS: Record<string, RegExp> = {
  parts: /(?<!\w)Intl\.DateTimeFormat\b/g,
};

/**
 * The files date-fns is for, from the board's root: the one writer of an hour, the one writer of a whole instant, and the two that
 * decide a day beside them. Every moment and date the board shows is written in one of these four, so the library itself is theirs:
 * a fifth file that imports it is a second writer, which is what `LIBRARY` refuses. A file joins this list with its reason.
 */
export const WRITERS: readonly string[] = [WRITER, INSTANT, 'src/lib/runWords.ts', 'src/lib/quota.ts'];

/**
 * How a second writer is spelled now the board is on date-fns: the library imported, by any of its names, anywhere but the writers'
 * four files. `OPTIONS` and `LOCALE` caught every way to write an hour while Intl was the only way; date-fns's `format` is another,
 * and this is what holds the one-writer rule over it.
 */
export const LIBRARY: Record<string, RegExp> = {
  module: /['"](?:date-fns|@date-fns\/[\w.-]+)(?:\/[\w./-]+)?['"]/g,
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

/** A file's calls that write a number in a locale: the file from the board's root, how many it holds, and why none is an instant. */
export interface Numbers {
  file: string;
  count: number;
  why: string;
}

/** The numbers written in a locale, each in its file alone. A call no entry counts is refused, and one that goes lowers its count. */
export const NUMBERS: Numbers[] = [
  { file: 'src/lib/skills.ts', count: 4, why: "a skill's token counts, each a number grouped by thousands in English: no date, no hour" },
];

/**
 * What is wrong in `files` (each a source text by its path from the board's root): an hour option outside `WRITER`, as
 * `file:line:column (words)`; a formatter built by hand in any file, `WRITER` included; date-fns imported outside `WRITERS`; a file
 * with more calls that write in a locale than `numbers` gives it; and an entry of `numbers` whose file holds fewer.
 */
export function refusals(files: Record<string, string>, numbers: Numbers[] = NUMBERS): string[] {
  const options = Object.entries(files)
    .filter(([file]) => file !== WRITER)
    .flatMap(([file, text]) =>
      foundAt(text, OPTIONS).map(({ words, at }) => `${file}:${at} (${words}) writes an hour: take the time from timeOfDay (${WRITER})`),
    );
  const formatters = Object.entries(files).flatMap(([file, text]) =>
    foundAt(text, FORMATTERS).map(
      ({ words, at }) => `${file}:${at} (${words}) writes a date: format it with date-fns (format, isSameDay, isSameYear)`,
    ),
  );
  const library = Object.entries(files)
    .filter(([file]) => !WRITERS.includes(file))
    .flatMap(([file, text]) =>
      foundAt(text, LIBRARY).map(
        ({ words, at }) =>
          `${file}:${at} (${words}) writes a moment of its own: take the time from timeOfDay (${WRITER}), or a whole instant from instantWords (${INSTANT})`,
      ),
    );
  const names = [...new Set([...Object.keys(files), ...numbers.map((n) => n.file)])].sort();
  const locale = names.flatMap((file) => {
    const found = foundAt(files[file] ?? '', LOCALE);
    const allowed = numbers.find((n) => n.file === file)?.count ?? 0;
    if (found.length > allowed)
      return [
        `${file} writes ${found.length} times in a locale (${found.map((f) => f.at).join(', ')}), NUMBERS gives it ${allowed}: write an instant with instantWords (${INSTANT}), or name a number's call in NUMBERS`,
      ];
    if (found.length < allowed) return [`${file} writes ${found.length} times in a locale, NUMBERS says ${allowed}: lower the list`];
    return [];
  });
  return [...options, ...formatters, ...library, ...locale];
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

test('timeOfDay and the words that say a time: a 12-hour clock, from the one writer, each word deciding its own day', async (t) => {
  await t.test('a time of day is written on a 12-hour clock: the hour with no leading zero, a plain space, AM or PM', () => {
    assert.equal(timeOfDay(new Date('2026-10-12T09:05:00Z'), 'UTC'), '9:05 AM', 'a morning');
    assert.equal(timeOfDay(new Date('2026-10-12T12:00:00Z'), 'UTC'), '12:00 PM', 'noon');
    assert.equal(timeOfDay(new Date('2026-10-12T00:05:00Z'), 'UTC'), '12:05 AM', 'after midnight');
    assert.equal(timeOfDay(new Date('2026-10-12T13:11:00Z'), 'UTC'), '1:11 PM', 'a single-digit hour of the afternoon');
    assert.equal(timeOfDay(new Date('2026-10-12T13:11:00Z'), 'Asia/Tokyo'), '10:11 PM', 'the same instant where the person is');
    assert.equal(timeOfDay(new Date('2026-10-12T23:59:00Z'), 'UTC'), '11:59 PM', 'the last minute of a day');
    assert.doesNotMatch(timeOfDay(new Date('2026-10-12T13:11:00Z'), 'UTC'), /[^\d: APM]/, 'no narrow space before the period');
  });
  await t.test('every word that says a time takes it from the one writer, and decides its own day beside it', () => {
    const now = new Date('2026-10-12T15:00:00Z');
    const at = new Date('2026-10-12T13:11:00Z');
    assert.equal(clockWord(at, now, 'UTC'), '1:11 PM', 'the same day');
    assert.equal(clockWord(new Date('2026-10-13T02:00:00Z'), now, 'UTC'), 'Tue 2:00 AM', 'another day, by its weekday');
    assert.equal(whenWords(at, now, 'UTC'), '1:11 PM');
    assert.equal(whenWords(new Date('2026-10-11T13:11:00Z'), now, 'UTC'), '11 Oct 1:11 PM', 'another day, by its date');
    assert.equal(agoWords(at, now), '2 hours ago', 'a distance has no zone to take, and so takes none');
    assert.equal(whenWords(new Date('2025-12-31T13:11:00Z'), now, 'UTC'), '31 Dec 2025', 'the runs page drops the time in another year');
    assert.equal(fireWord(new Date('2026-10-20T12:00:00Z'), now, 'UTC'), '20 Oct 12:00 PM', "a far fire, in the runs page's order");
    assert.equal(
      fireWord(new Date('2027-01-01T09:00:00Z'), now, 'UTC'),
      '1 Jan 2027, 9:00 AM',
      'a fire in another year keeps its time, after a comma',
    );
  });
});

test("REFUSED, refusals: a second writer of an hour, a formatter, date-fns or a locale outside their files, each on a fixture, then on the board's source", async (t) => {
  await t.test('REFUSED: a second writer of an hour, by each way one is written, and never the writer itself', () => {
    const second = (text: string) => refusals({ 'src/lib/x.ts': text }, []);
    assert.deepEqual(second("new Intl.DateTimeFormat(undefined, { hour: '2-digit', hourCycle: 'h23' }).format(at)"), [
      `src/lib/x.ts:1:38 (hour:) writes an hour: take the time from timeOfDay (${WRITER})`,
      `src/lib/x.ts:1:55 (hourCycle) writes an hour: take the time from timeOfDay (${WRITER})`,
      'src/lib/x.ts:1:5 (Intl.DateTimeFormat) writes a date: format it with date-fns (format, isSameDay, isSameYear)',
    ]);
    assert.equal(second('const o = {\n  hour12:\n    true };').length, 1, 'an option broken across lines');
    assert.match(second('const o = {\n  hour\n    : "numeric" };')[0] ?? '', /^src\/lib\/x\.ts:2:3 \(hour:\)/, 'named where it starts');
    assert.equal(second("new Intl.DateTimeFormat('en', { timeStyle: 'short' })").length, 2, 'a time style, and the formatter it sits in');
    assert.equal(
      second("of('hour'); const perHour = 3; rate.hour; type T = { hours: number }").length,
      0,
      'a word that only holds the name',
    );
    assert.equal(refusals({ [WRITER]: 'const o = { hour: "numeric", hour12: true };' }, []).length, 0, 'the writer may name an hour');
  });
  await t.test("REFUSED: a date formatted outside date-fns, called with `new` or without, in the writers' files too", () => {
    const built = (text: string) => refusals({ 'src/lib/x.ts': text }, []);
    assert.deepEqual(built("Intl.DateTimeFormat('en-US', { month: 'short' }).format(at)"), [
      'src/lib/x.ts:1:1 (Intl.DateTimeFormat) writes a date: format it with date-fns (format, isSameDay, isSameYear)',
    ]);
    assert.equal(built("new Intl.DateTimeFormat('en-US').format(at)").length, 1, 'constructed with new');
    assert.equal(built('globalThis.Intl.DateTimeFormat()').length, 1, 'reached off globalThis');
    assert.deepEqual(
      refusals({ [WRITER]: "Intl.DateTimeFormat('en-US', { hour: 'numeric', hour12: true }).format(at)" }, []),
      [`${WRITER}:1:1 (Intl.DateTimeFormat) writes a date: format it with date-fns (format, isSameDay, isSameYear)`],
      'the family has no exemption, so a second writer of an hour cannot slip back into the one writer, where OPTIONS does not look',
    );
    assert.equal(built('let o: Intl.DateTimeFormatOptions; const DateTimeFormatOf = 1;').length, 0, 'a type, and a word holding the name');
    assert.equal(built('const n = new Intl.NumberFormat("en"); const i = MyIntl.DateTimeFormat;').length, 0, 'a number, and another name');
  });
  await t.test('REFUSED: date-fns imported outside the four files that write a moment, and never inside them', () => {
    const sent = `: take the time from timeOfDay (${WRITER}), or a whole instant from instantWords (${INSTANT})`;
    const other = (text: string) => refusals({ 'src/components/Turns.tsx': text }, []);
    assert.deepEqual(other("import { format } from 'date-fns';"), [
      `src/components/Turns.tsx:1:24 ('date-fns') writes a moment of its own${sent}`,
    ]);
    assert.equal(other('import { tz } from "@date-fns/tz";').length, 1, 'the time zone package, in double quotes');
    assert.equal(other("const { format } = await import('date-fns');").length, 1, 'imported for its value');
    assert.equal(other("import { format } from 'date-fns/format';").length, 1, 'by a subpath');
    assert.equal(other('const dateFns = 1; // date-fns in a word and `date-fns` in a backtick').length, 0, 'the name unquoted');
    for (const file of WRITERS)
      assert.equal(
        refusals({ [file]: "import { format, isSameDay, isSameYear } from 'date-fns';\nimport { tz } from '@date-fns/tz';" }, []).length,
        0,
        `${file} writes a moment, so the library is its own`,
      );
  });
  await t.test(
    'REFUSED: anything written as the locale does, a date with a locale and no options too, and a number until the list names it',
    () => {
      const written = (text: string) => refusals({ 'src/lib/x.ts': text }, []);
      assert.deepEqual(written('new Date(iso).toLocaleString()'), [
        `src/lib/x.ts writes 1 times in a locale (1:14), NUMBERS gives it 0: write an instant with instantWords (${INSTANT}), or name a number's call in NUMBERS`,
      ]);
      assert.equal(written("new Date(iso).toLocaleString('en-GB')").length, 1, 'a date with a locale and no options writes an hour');
      assert.equal(written('new Date(iso).toLocaleString(undefined)').length, 1, 'with no locale of its own');
      assert.equal(written('at.toLocaleDateString()').length, 1, 'a date alone');
      assert.equal(written("at.toLocaleTimeString([], { minute: '2-digit' })").length, 1, 'a time in the locale');
      assert.equal(written('at.toLocaleTimeString\n  ()').length, 1, 'broken before its parenthesis');
      assert.equal(written('at.toLocaleString\n  (\n  "en-GB")').length, 1, 'broken around its argument');
      assert.equal(written("count.toLocaleString('en')").length, 1, 'a number, which the guard cannot tell from a date');
      const named: Numbers[] = [{ file: 'src/lib/x.ts', count: 1, why: 'a fixture' }];
      assert.equal(refusals({ 'src/lib/x.ts': "count.toLocaleString('en')" }, named).length, 0, 'and none once the list names its file');
      assert.equal(written('const toLocaleStringOf = 1; at.toISOString()').length, 0, 'a word that only holds the name');
    },
  );
  await t.test('REFUSED: one more call in a locale than the list gives a file, and a list left loose', () => {
    const numbers: Numbers[] = [{ file: 'src/a.tsx', count: 1, why: 'a fixture' }];
    const one = "count.toLocaleString('en')";
    assert.equal(refusals({ 'src/a.tsx': one }, numbers).length, 0, 'the one it is given');
    assert.deepEqual(refusals({ 'src/a.tsx': `${one}\nnew Date(iso).toLocaleString()` }, numbers), [
      `src/a.tsx writes 2 times in a locale (1:6, 2:14), NUMBERS gives it 1: write an instant with instantWords (${INSTANT}), or name a number's call in NUMBERS`,
    ]);
    assert.deepEqual(refusals({ 'src/a.tsx': '' }, numbers), ['src/a.tsx writes 0 times in a locale, NUMBERS says 1: lower the list']);
    assert.equal(refusals({}, numbers).length, 1, 'a file that is gone holds none');
    assert.equal(refusals({ 'src/a.tsx': one, 'src/b.tsx': one }, numbers).length, 1, 'the list is by file: another file is given none');
  });
  await t.test("the board's source has one writer of an hour, and writes nothing in a locale but the numbers the list names", () => {
    const files = sources(WEB);
    assert.ok(Object.keys(files).length > 100, `the source is read: ${Object.keys(files).length} files`);
    assert.ok(files[WRITER]?.includes('export function timeOfDay('), `${WRITER} is read, and holds the one writer of an hour`);
    assert.ok(files[WRITER]?.includes("from 'date-fns'"), `${WRITER} writes its hour with date-fns`);
    assert.ok(files[INSTANT]?.includes('export function instantWords('), `${INSTANT} is read, and holds the writer of an instant`);
    assert.equal(
      NUMBERS.every((n) => n.why.trim()),
      true,
      'every number written in a locale says why',
    );
    const wrong = refusals(files);
    assert.equal(wrong.length, 0, wrong.join('\n'));
    const back = refusals({
      ...files,
      'src/components/Facts.tsx': `${files['src/components/Facts.tsx']}\nnew Date(iso).toLocaleString();\n`,
    });
    assert.equal(back.length, 1, back.join('\n'));
    assert.match(back[0] ?? '', /^src\/components\/Facts\.tsx writes 1 times in a locale/, 'a toLocaleString() written back is refused');
    const built = refusals({
      ...files,
      'src/components/Facts.tsx': `${files['src/components/Facts.tsx']}\nIntl.DateTimeFormat('en-US').format(d);\n`,
    });
    assert.equal(built.length, 1, built.join('\n'));
    assert.match(built[0] ?? '', /^src\/components\/Facts\.tsx:\d+:1 \(Intl\.DateTimeFormat\) writes a date/, 'a formatter written back');
    const took = refusals({
      ...files,
      'src/components/Facts.tsx': `import { format } from 'date-fns';\n${files['src/components/Facts.tsx']}`,
    });
    assert.equal(took.length, 1, took.join('\n'));
    assert.match(took[0] ?? '', /^src\/components\/Facts\.tsx:1:24 \('date-fns'\) writes a moment of its own/, 'the library taken up');
    assert.ok(
      WRITERS.every((file) => files[file]?.length),
      `every file of WRITERS is read: ${WRITERS.join(', ')}`,
    );
  });
});
