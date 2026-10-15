/**
 * The closeout's envelope: the one cut of a summary to a line (`summaryLine`), a v0 closeout converted on read and a v1 read as given
 * (`parseCloseout`), and the one refusal of a v1 envelope, a `needs` on a `done` closeout (`envelopeRefusals`).
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { envelopeRefusals, SUMMARY_MAX, summaryLine } from './envelope.ts';
import { CLOSEOUT_SCHEMA, looseAt, parseCloseout, type Closeout } from './closeout.ts';

/** The cases every copy of the cut answers alike: the board's transcript (`apps/web/test/transcript.test.ts`) asks the same. */
const CUTS: Array<[string, string]> = [
  ['a'.repeat(119), 'a'.repeat(119)],
  ['a'.repeat(120), 'a'.repeat(120)],
  [`${'word '.repeat(24)}x`, `${'word '.repeat(22)}word…`],
  ['a'.repeat(200), `${'a'.repeat(119)}…`],
  ['\n\n  First line.  \nSecond line.', 'First line.'],
  ['', ''],
];

test('a summary is its first non-empty line, cut at a word to at most 120 characters with an ellipsis, or hard where it has no space', () => {
  for (const [given, shown] of CUTS) {
    assert.equal(summaryLine(given), shown, JSON.stringify(given));
    assert.ok(summaryLine(given).length <= SUMMARY_MAX);
  }
  assert.equal(summaryLine(`${'a'.repeat(118)} bc`), `${'a'.repeat(118)}…`, 'a 121-character line is cut at its last space');
});

const read = (value: unknown): Closeout => {
  const c = parseCloseout(value);
  assert.ok(!('error' in c), JSON.stringify(c));
  return c;
};

test('a v0 closeout is converted on read: the whole summary its body, its first line its summary, its strings file artifacts', () => {
  const c = read({ outcome: 'done', summary: 'First line.\n\nMore.', artifacts: ['a.md'], needs: null, findings: [] });
  assert.deepEqual(c, {
    outcome: 'done',
    summary: 'First line.',
    body: 'First line.\n\nMore.',
    artifacts: ['a.md'],
    needs: undefined,
    output: { findings: [] },
  });
  const long = 'word '.repeat(136).trim();
  const paragraph = read({ outcome: 'done', summary: long, artifacts: [], needs: null });
  assert.ok(paragraph.summary.endsWith('…') && paragraph.summary.length <= SUMMARY_MAX);
  assert.equal(paragraph.body, long);
  assert.equal(read({ outcome: 'done', summary: 'One line.', artifacts: [], needs: null }).body, undefined);
  assert.deepEqual(read({ outcome: 'done', summary: 's', artifacts: [], needs: null, body: 'mine' }).output, { body: 'mine' });
  assert.equal(read({ outcome: 'done', summary: 's', artifacts: [], needs: null, body: 'mine' }).body, undefined);
});

test('a v1 closeout is read by its own envelope: files and values apart, and a cut summary leading the body', () => {
  const c = read({
    apiVersion: 'nemia/v1',
    outcome: 'done',
    summary: 'Short.',
    body: 'The rest.',
    artifacts: [{ path: 'a.md' }, { name: 'PR', value: 'https://x/1' }],
    needs: null,
    mutants: [],
  });
  assert.deepEqual(c, {
    apiVersion: 'nemia/v1',
    outcome: 'done',
    summary: 'Short.',
    body: 'The rest.',
    artifacts: ['a.md'],
    values: [{ name: 'PR', value: 'https://x/1' }],
    needs: undefined,
    output: { mutants: [] },
  });
  const twoLines = read({ apiVersion: 'nemia/v1', outcome: 'done', summary: 'One.\nTwo.', body: 'Body.', artifacts: [], needs: null });
  assert.equal(twoLines.summary, 'One.');
  assert.equal(twoLines.body, 'One.\nTwo.\n\nBody.');
  assert.deepEqual(parseCloseout({ apiVersion: 'nemia/v9', outcome: 'done', summary: '', artifacts: [], needs: null }), {
    error: 'apiVersion "nemia/v9" is not one this run reads',
  });
});

test('REFUSED: `needs` on a done v1 closeout, and nothing else of its envelope, a 10,000-character summary included', () => {
  const v1 = (outcome: string, needs: string | null, summary = 's') =>
    read({ apiVersion: 'nemia/v1', outcome, summary, body: null, artifacts: [], needs });
  assert.equal(envelopeRefusals(v1('done', 'x')).length, 1);
  assert.match(envelopeRefusals(v1('done', 'x'))[0], /sign off `blocked`/);
  assert.deepEqual(envelopeRefusals(v1('done', null)), []);
  assert.deepEqual(envelopeRefusals(v1('done', '')), []);
  assert.deepEqual(envelopeRefusals(v1('blocked', 'x')), []);
  assert.deepEqual(envelopeRefusals(v1('done', null, 'y'.repeat(10_000))), []);
  assert.deepEqual(
    envelopeRefusals(read({ outcome: 'done', summary: 's', artifacts: [], needs: 'x' })),
    [],
    'a v0 closeout is never refused',
  );
});

test('the v1 envelope a harness is handed is strict all the way down', () => {
  assert.equal(looseAt(CLOSEOUT_SCHEMA, ''), undefined);
  assert.deepEqual(CLOSEOUT_SCHEMA.required, Object.keys(CLOSEOUT_SCHEMA.properties));
});
