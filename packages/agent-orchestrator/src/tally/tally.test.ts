/**
 * A step's tallies (`tally.ts`): a `tally:` line read against the step's `output:` schema and refused where the closeout cannot hold it,
 * naming the step's file, the schema's and the entry; a closeout's value of a tally, null where nothing was measured and 0 where a zero
 * was; and the rows a step's tries total to. The fixtures name a workflow of their own, and no source of the counting names this
 * repository's.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import type { OutputSchema, StepOutput } from '../step/step.ts';
import { tallyIn, tallyOf, tallyRowsOf } from './tally.ts';

const schema = (properties: OutputSchema['properties']): StepOutput => ({
  file: 'triage.schema.json',
  schema: { type: 'object', properties, required: Object.keys(properties), additionalProperties: false },
});

const triage = schema({
  issues: {
    type: 'array',
    items: { type: 'object', properties: { open: { type: 'boolean' }, title: { type: 'string' } } },
  },
  score: { type: 'number' },
  seen: { type: ['integer', 'null'] },
  verdict: { type: 'string' },
});

/** The message `tallyOf` refuses `written` with, against `output`. */
function refusal(written: string, output: StepOutput | undefined): string {
  try {
    tallyOf('triage', written, output);
  } catch (err) {
    return (err as Error).message;
  }
  return assert.fail(`tally: ${written} was not refused`);
}

test('a tally of an array, a number, an integer or null, and an array of items with a boolean flag reads as the list written', () => {
  assert.deepEqual(tallyOf('triage', ' issues, issues.open ,score, seen', triage), ['issues', 'issues.open', 'score', 'seen']);
  assert.equal(tallyOf('triage', undefined, triage), undefined, 'no line, no tally');
  assert.deepEqual(tallyOf('triage', '', undefined), [], 'an empty line on a step with no output counts nothing');
});

test('a tally on a step with no output is refused, naming the step file', () => {
  const message = refusal('issues', undefined);
  assert.match(message, /^triage: `tally: issues` in triage\.md /);
  assert.match(message, /declares no `output:`/);
});

test('a tally of a field the schema does not declare is refused, naming the step file, the schema file and the fields it has', () => {
  const message = refusal('issues, nope', triage);
  assert.match(message, /triage\.md/);
  assert.match(message, /`output: triage\.schema\.json` declares no field `nope`; it declares issues, score, seen, verdict/);
});

test('a tally of a field that is not an array, an integer or a number is refused, naming the field and its type', () => {
  const message = refusal('verdict', triage);
  assert.match(message, /triage\.md/);
  assert.match(message, /`output: triage\.schema\.json` declares `verdict` as \["string"\]/);
});

test('a flag that is not a boolean of the items of an array is refused, naming the field and the flag', () => {
  for (const written of ['issues.title', 'issues.closed', 'score.open']) {
    const message = refusal(written, triage);
    const [field, flag] = written.split('.');
    assert.match(message, /triage\.md/, written);
    assert.ok(message.includes(`declares no boolean \`${flag}\` on the items of an array \`${field}\``), `${written}: ${message}`);
    assert.ok(message.includes('`output: triage.schema.json`'), written);
  }
});

test('an entry with more than one dot, or an empty part, is refused', () => {
  for (const written of ['issues.open.now', 'issues.', '.open']) {
    const message = refusal(written, triage);
    assert.ok(message.includes(`\`${written}\` is neither a field nor \`field.flag\``), `${written}: ${message}`);
    assert.match(message, /triage\.md/);
  }
});

test('an entry given twice is refused', () => {
  const message = refusal('issues, score, issues', triage);
  assert.match(message, /triage\.md/);
  assert.match(message, /names `issues` twice/);
});

test('a closeout gives an array its item count, a number its value and a flag its true items; a zero measured is 0', () => {
  const output = { issues: [{ open: true }, { open: false }, {}, { open: 'true' }], score: 2.5, empty: [], zero: 0 };
  assert.equal(tallyIn('issues', output), 4);
  assert.equal(tallyIn('issues.open', output), 1);
  assert.equal(tallyIn('score', output), 2.5);
  assert.equal(tallyIn('empty', output), 0);
  assert.equal(tallyIn('empty.open', output), 0);
  assert.equal(tallyIn('zero', output), 0);
});

test('a closeout without the field, with another type at run time, or none at all, measured nothing: null, never 0', () => {
  const output = { issues: 'three', score: null, nan: Number.NaN };
  assert.equal(tallyIn('missing', output), null);
  assert.equal(tallyIn('issues', output), null);
  assert.equal(tallyIn('issues.open', output), null);
  assert.equal(tallyIn('score', output), null);
  assert.equal(tallyIn('nan', output), null);
  assert.equal(tallyIn('issues', undefined), null);
});

test("a step's tries total per tally over the range and per day, null on a day nothing was measured", () => {
  const rows = tallyRowsOf(
    [
      { step: 'triage', day: '2026-09-01', tallies: [{ tally: 'issues', value: 3 }] },
      { step: 'triage', day: '2026-09-01', tallies: [{ tally: 'issues', value: 0 }] },
      { step: 'triage', day: '2026-09-02', tallies: [{ tally: 'issues', value: null }] },
      { step: 'check-in', day: '2026-09-02', tallies: [{ tally: 'notes', value: 2 }] },
      { step: 'plain', day: '2026-09-02', tallies: [] },
    ],
    ['2026-09-01', '2026-09-02', '2026-09-03'],
  );
  assert.deepEqual(rows, [
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
  ]);
});

/** The words of this repository's build workflow that the counting must never know. */
const BUILD_WORDS = /\b(findings|mutants|proves)\b/;

/** The source files, tests left out, that read and count tallies. */
const countingSources = (): Array<[string, string]> =>
  ['tally', 'stats'].flatMap((folder) =>
    fs
      .readdirSync(path.join(import.meta.dirname, '..', folder))
      .filter((f) => f.endsWith('.ts') && !f.endsWith('.test.ts'))
      .map((f): [string, string] => [`${folder}/${f}`, fs.readFileSync(path.join(import.meta.dirname, '..', folder, f), 'utf8')]),
  );

test("no source that counts tallies names a field of this repository's build workflow", () => {
  const planted = 'const n = tallyIn("findings", output);';
  assert.match(planted, BUILD_WORDS, 'the matcher refuses a planted name');
  const sources = countingSources();
  assert.ok(sources.some(([file]) => file === 'tally/tally.ts') && sources.some(([file]) => file === 'stats/stats.ts'));
  for (const [file, text] of sources) assert.doesNotMatch(text, BUILD_WORDS, file);
});
