/**
 * A step's tallies (`tally.ts`), as three tables: a `tally:` line read against the step's `output:` schema (`tallyOf`), each refusal a
 * row asserting its kind and exit code; a closeout's value of a tally (`tallyIn`), null where nothing was measured and 0 where a zero
 * was; and the rows a step's tries total to (`tallyRowsOf`). The fixtures name a workflow of their own, and no source of the counting
 * names this repository's: the source guard at the file's end.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { Invalid } from '../refusal/refusal.ts';
import type { OutputSchema, StepOutput } from '../step/step.ts';
import { tallyIn, tallyOf, tallyRowsOf } from './tally.ts';

const schema = (properties: OutputSchema['properties']): StepOutput => ({
  file: 'triage.schema.json',
  schema: { type: 'object', properties, required: Object.keys(properties), additionalProperties: false },
});

const triage = schema({
  issues: {
    type: 'array',
    items: {
      type: 'object',
      properties: {
        open: { type: 'boolean' },
        title: { type: 'string' },
        kind: { type: 'string', enum: ['bug', 'idea'] },
        note: { type: ['string', 'null'] },
      },
    },
  },
  score: { type: 'number' },
  seen: { type: ['integer', 'null'] },
  verdict: { type: 'string' },
});

/** A row of `tallyOf`: the line written, the schema it is read against, and the list it reads as, or `'refused'`. */
type TallyOfRow = { name: string; written: string | undefined; output?: StepOutput | undefined; reads: string[] | undefined | 'refused' };

const TALLY_OF: TallyOfRow[] = [
  {
    name: 'a tally of an array, a number, an integer or null, and an array of items with a boolean flag reads as the list written',
    written: ' issues, issues.open ,score, seen',
    output: triage,
    reads: ['issues', 'issues.open', 'score', 'seen'],
  },
  { name: 'no line, no tally', written: undefined, output: triage, reads: undefined },
  { name: 'an empty line on a step with no output counts nothing', written: '', output: undefined, reads: [] },
  {
    name: 'a tally of the items of an array whose string has a value reads as written, a value of its enum or any value of a free string',
    written: 'issues, issues.kind=bug, issues.note=a.b',
    output: triage,
    reads: ['issues', 'issues.kind=bug', 'issues.note=a.b'],
  },
  { name: 'REFUSED: a value its enum does not hold', written: 'issues.kind=nope', output: triage, reads: 'refused' },
  ...['issues.open=true', 'issues.closed=bug', 'score.kind=bug'].map((written): TallyOfRow => ({
    name: `REFUSED: a key that is no string of the items of an array: ${written}`,
    written,
    output: triage,
    reads: 'refused',
  })),
  { name: 'REFUSED: an entry that names a key and no value', written: 'issues.kind=', output: triage, reads: 'refused' },
  { name: 'REFUSED: an entry that names a free string and no value', written: 'issues.title=', output: triage, reads: 'refused' },
  { name: 'REFUSED: a tally on a step with no output', written: 'issues', output: undefined, reads: 'refused' },
  { name: 'REFUSED: a tally of a field the schema does not declare', written: 'issues, nope', output: triage, reads: 'refused' },
  {
    name: 'REFUSED: a tally of a field that is not an array, an integer or a number',
    written: 'verdict',
    output: triage,
    reads: 'refused',
  },
  ...['issues.title', 'issues.closed', 'score.open'].map((written): TallyOfRow => ({
    name: `REFUSED: a flag that is not a boolean of the items of an array: ${written}`,
    written,
    output: triage,
    reads: 'refused',
  })),
  ...['issues.open.now', 'issues.', '.open', 'issues.kind=bug=x', 'issues.kind.x=bug', 'issues=bug', '=bug', 'issues.=bug'].map(
    (written): TallyOfRow => ({
      name: `REFUSED: more than one dot or equals sign, an empty part, or a value with no key: ${written}`,
      written,
      output: triage,
      reads: 'refused',
    }),
  ),
  { name: 'REFUSED: an entry given twice', written: 'issues, score, issues', output: triage, reads: 'refused' },
  { name: 'REFUSED: an entry with a value given twice', written: 'issues.kind=bug, issues.kind=bug', output: triage, reads: 'refused' },
];

test("`tallyOf` reads a `tally:` line against the step's `output:` schema, and refuses what the closeout cannot hold", async (t) => {
  for (const row of TALLY_OF)
    await t.test(row.name, () => {
      if (row.reads !== 'refused') return assert.deepEqual(tallyOf('triage', row.written, row.output), row.reads);
      assert.throws(
        () => tallyOf('triage', row.written, row.output),
        (err: unknown) => err instanceof Invalid && err._tag === 'Invalid' && err.exitCode === 2,
      );
    });
});

/** A closeout every `tallyIn` row reads. */
const OUTPUT = {
  issues: [{ open: true }, { open: false }, {}, { open: 'true' }],
  score: 2.5,
  empty: [],
  zero: 0,
  kinds: [{ kind: 'bug' }, { kind: 'idea' }, { kind: 'Bug' }, {}, 'bug', { kind: 'bug ' }],
  three: 'three',
  none: null,
  nan: Number.NaN,
};

const TALLY_IN: Array<{ name: string; tally: string; output?: Record<string, unknown>; value: number | null }> = [
  { name: 'an array gives its item count', tally: 'issues', value: 4 },
  { name: 'a flag gives the items whose flag is exactly true', tally: 'issues.open', value: 1 },
  { name: 'a number gives its value', tally: 'score', value: 2.5 },
  { name: 'an empty array is a measured 0', tally: 'empty', value: 0 },
  { name: 'a flag of an empty array is a measured 0', tally: 'empty.open', value: 0 },
  { name: 'a zero is a measured 0', tally: 'zero', value: 0 },
  { name: '`field.key=value` gives the items whose key is exactly the value', tally: 'kinds.kind=bug', value: 1 },
  { name: '`field.key=value` of another value', tally: 'kinds.kind=idea', value: 1 },
  { name: '`field.key=value` of an empty array is 0', tally: 'empty.kind=bug', value: 0 },
  { name: 'a field missing measured nothing: null, never 0', tally: 'missing', value: null },
  { name: 'a field of another type at run time measured nothing', tally: 'three', value: null },
  { name: 'a flag of a field that is no array measured nothing', tally: 'three.open', value: null },
  { name: 'a match of a field that is no array measured nothing', tally: 'three.kind=bug', value: null },
  { name: 'a match of a missing field measured nothing', tally: 'missing.kind=bug', value: null },
  { name: 'a null measured nothing', tally: 'none', value: null },
  { name: 'NaN measured nothing', tally: 'nan', value: null },
  { name: 'no closeout measured nothing', tally: 'issues', output: undefined, value: null },
  { name: 'no closeout measured no match', tally: 'issues.kind=bug', output: undefined, value: null },
];

test("`tallyIn` gives a closeout's value of a tally: null where nothing was measured, 0 where a zero was", async (t) => {
  for (const row of TALLY_IN)
    await t.test(row.name, () => assert.equal(tallyIn(row.tally, 'output' in row ? row.output : OUTPUT), row.value));
});

const DAYS = ['2026-09-01', '2026-09-02', '2026-09-03'];

const TALLY_ROWS: Array<{ name: string; tries: Parameters<typeof tallyRowsOf>[0]; rows: ReturnType<typeof tallyRowsOf> }> = [
  {
    name: "a step's tries total per tally over the range and per day, null on a day nothing was measured, in the order first given",
    tries: [
      { step: 'triage', day: '2026-09-01', tallies: [{ tally: 'issues', value: 3 }] },
      { step: 'triage', day: '2026-09-01', tallies: [{ tally: 'issues', value: 0 }] },
      { step: 'triage', day: '2026-09-02', tallies: [{ tally: 'issues', value: null }] },
      { step: 'check-in', day: '2026-09-02', tallies: [{ tally: 'notes', value: 2 }] },
      { step: 'plain', day: '2026-09-02', tallies: [] },
    ],
    rows: [
      {
        step: 'triage',
        tally: 'issues',
        total: { sum: 3, tries: 2 },
        days: [
          { day: '2026-09-01', sum: 3, tries: 2 },
          { day: '2026-09-02', sum: null, tries: 0 },
          { day: '2026-09-03', sum: null, tries: 0 },
        ],
      },
      {
        step: 'check-in',
        tally: 'notes',
        total: { sum: 2, tries: 1 },
        days: [
          { day: '2026-09-01', sum: null, tries: 0 },
          { day: '2026-09-02', sum: 2, tries: 1 },
          { day: '2026-09-03', sum: null, tries: 0 },
        ],
      },
    ],
  },
  {
    name: 'a tally no try measured totals null over 0 tries, never 0',
    tries: [{ step: 'triage', day: '2026-09-03', tallies: [{ tally: 'issues', value: null }] }],
    rows: [
      {
        step: 'triage',
        tally: 'issues',
        total: { sum: null, tries: 0 },
        days: DAYS.map((day) => ({ day, sum: null, tries: 0 })),
      },
    ],
  },
  { name: 'no try declares a tally: no row', tries: [{ step: 'plain', day: '2026-09-01', tallies: [] }], rows: [] },
];

test("`tallyRowsOf` totals a step's tries per tally, over the range and on each of its days", async (t) => {
  for (const row of TALLY_ROWS) await t.test(row.name, () => assert.deepEqual(tallyRowsOf(row.tries, DAYS), row.rows));
});

/** The words of this repository's build workflow that the counting must never know. */
const BUILD_WORDS = /\b(findings|placement)\b/;

/** The source files, tests left out, that read and count tallies. */
const countingSources = (): Array<[string, string]> =>
  ['tally', 'stats'].flatMap((folder) =>
    fs
      .readdirSync(path.join(import.meta.dirname, '..', folder))
      .filter((f) => f.endsWith('.ts') && !f.endsWith('.test.ts'))
      .map((f): [string, string] => [`${folder}/${f}`, fs.readFileSync(path.join(import.meta.dirname, '..', folder, f), 'utf8')]),
  );

test("no source that counts tallies names a field of this repository's build workflow", () => {
  for (const planted of ['const n = tallyIn("findings", output);', "const kinds = ['placement'];"])
    assert.match(planted, BUILD_WORDS, `the matcher refuses a planted name: ${planted}`);
  const sources = countingSources();
  assert.ok(sources.some(([file]) => file === 'tally/tally.ts') && sources.some(([file]) => file === 'stats/stats.ts'));
  for (const [file, text] of sources) assert.doesNotMatch(text, BUILD_WORDS, file);
});
