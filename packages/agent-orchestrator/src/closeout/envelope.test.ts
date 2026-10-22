/**
 * The closeout's envelope, as one table: the one cut of a summary to a line (`summaryLine`), a closeout read forgivingly, a v0 one
 * converted on read and a v1 read as given (`parseCloseout`), the schema a harness is handed (`CLOSEOUT_SCHEMA`), and the one refusal of
 * a v1 envelope, a `needs` on a `done` closeout (`envelopeRefusals`). What a run makes of a closeout is in `test/closeouts.test.ts`
 * and `test/assess-closeouts.test.ts`.
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

/** A closeout read, failing where it does not decode. */
const read = (value: unknown): Closeout => {
  const c = parseCloseout(value);
  assert.ok(!('error' in c), JSON.stringify(c));
  return c;
};

test("the closeout's envelope", async (t) => {
  await t.test(
    'a summary is its first non-empty line, cut at a word to at most 120 characters with an ellipsis, or hard where it has no space',
    () => {
      for (const [given, shown] of CUTS) {
        assert.equal(summaryLine(given), shown, JSON.stringify(given));
        assert.ok(summaryLine(given).length <= SUMMARY_MAX);
      }
      assert.equal(summaryLine(`${'a'.repeat(118)} bc`), `${'a'.repeat(118)}…`, 'a 121-character line is cut at its last space');
    },
  );

  await t.test(
    'a v0 closeout is converted on read: the whole summary its body, its first line its summary, its strings file artifacts',
    () => {
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
    },
  );

  await t.test(
    'a v1 closeout is read by its own envelope: files and values apart, a cut summary leading the body, a field no step declares kept',
    () => {
      const c = read({
        apiVersion: 'nemia/v1',
        outcome: 'done',
        summary: 'Short.',
        body: 'The rest.',
        artifacts: [{ path: 'a.md' }, { name: 'PR', value: 'https://x/1' }],
        needs: null,
        mutants: [],
      });
      assert.deepEqual(
        c,
        {
          apiVersion: 'nemia/v1',
          outcome: 'done',
          summary: 'Short.',
          body: 'The rest.',
          artifacts: ['a.md'],
          values: [{ name: 'PR', value: 'https://x/1' }],
          needs: undefined,
          output: { mutants: [] },
        },
        '`mutants` is a field no step declares any more, and a closeout written when one did still reads: the envelope nests a field the ' +
          'frozen step did not declare under `output`, rather than dropping it or refusing the closeout',
      );
      const twoLines = read({ apiVersion: 'nemia/v1', outcome: 'done', summary: 'One.\nTwo.', body: 'Body.', artifacts: [], needs: null });
      assert.equal(twoLines.summary, 'One.');
      assert.equal(twoLines.body, 'One.\nTwo.\n\nBody.');
      assert.deepEqual(parseCloseout({ apiVersion: 'nemia/v9', outcome: 'done', summary: '', artifacts: [], needs: null }), {
        error: 'apiVersion "nemia/v9" is not one this run reads',
      });
    },
  );

  await t.test(
    "a v1 summary over 120 characters, or on two lines, is cut on read as a v0 first line is, never refused, so a step never spends a round on its summary: a `needs` on a done closeout is the envelope's one refusal",
    () => {
      const v1 = (outcome: string, needs: string | null, summary = 's') =>
        read({ apiVersion: 'nemia/v1', outcome, summary, body: null, artifacts: [], needs });
      const long = 'y'.repeat(10_000);
      const cut = v1('done', null, long);
      assert.ok(cut.summary.endsWith('\u2026') && cut.summary.length <= SUMMARY_MAX, cut.summary);
      assert.equal(cut.body, long, 'the whole of a cut summary leads the body');
      assert.deepEqual(envelopeRefusals(cut), [], 'a summary is never refused for its length');
      const twoLines = v1('done', null, 'One.\nTwo.');
      assert.equal(twoLines.summary, 'One.');
      assert.equal(twoLines.body, 'One.\nTwo.', 'the whole of a summary on two lines leads the body');
      assert.deepEqual(envelopeRefusals(twoLines), [], 'a summary is never refused for being on two lines');
      assert.equal(envelopeRefusals(v1('done', 'x')).length, 1);
      assert.match(envelopeRefusals(v1('done', 'x'))[0], /sign off `blocked`/);
      assert.deepEqual(envelopeRefusals(v1('done', null)), []);
      assert.deepEqual(envelopeRefusals(v1('done', '')), []);
      assert.deepEqual(envelopeRefusals(v1('blocked', 'x')), []);
      assert.deepEqual(
        envelopeRefusals(read({ outcome: 'done', summary: 's', artifacts: [], needs: 'x' })),
        [],
        'a v0 closeout is never refused',
      );
    },
  );

  await t.test('the v1 envelope a harness is handed is strict all the way down', () => {
    assert.equal(looseAt(CLOSEOUT_SCHEMA, ''), undefined);
    assert.deepEqual(CLOSEOUT_SCHEMA.required, Object.keys(CLOSEOUT_SCHEMA.properties));
  });

  await t.test(
    'the schema is strict enough for the strictest harness: nothing extra, every property required, an optional one nullable',
    () => {
      assert.equal(CLOSEOUT_SCHEMA.additionalProperties, false, 'Codex enforces strict structured outputs: nothing extra allowed');
      assert.deepEqual(
        [...CLOSEOUT_SCHEMA.required].sort(),
        Object.keys(CLOSEOUT_SCHEMA.properties).sort(),
        'Codex requires every property',
      );
      assert.deepEqual(CLOSEOUT_SCHEMA.properties.needs.type, ['string', 'null'], 'an optional field is nullable instead');
    },
  );

  await t.test('a closeout is read forgivingly: the harness enforced the shape, but an agent filled it in', () => {
    assert.deepEqual(
      parseCloseout({ outcome: 'done', summary: 'probe ok', artifacts: [], needs: null }),
      { outcome: 'done', summary: 'probe ok', artifacts: [], needs: undefined },
      'what Codex writes: an object, with needs null when unused',
    );
    assert.deepEqual(
      parseCloseout('{"outcome":"blocked","summary":"s","artifacts":[],"needs":"pick one"}'),
      { outcome: 'blocked', summary: 's', artifacts: [], needs: 'pick one' },
      'text is accepted too',
    );
    assert.ok('error' in parseCloseout('{not json'));
    assert.ok('error' in parseCloseout([]), 'an array is not a closeout');
    assert.ok('error' in parseCloseout(null));
    assert.deepEqual(parseCloseout({}), { outcome: 'done', summary: '', artifacts: [], needs: undefined });
    assert.deepEqual((parseCloseout({ artifacts: ['a.md', 7, null] }) as { artifacts: string[] }).artifacts, ['a.md']);
  });

  await t.test('a closeout keeps what it says beyond the four fields under `output`; one that says nothing more reads as before', () => {
    const found = [{ file: 'src/run.ts', line: 183, what: 'a producer with no findings reads as done' }];
    assert.deepEqual(parseCloseout({ outcome: 'done', summary: 's', artifacts: [], needs: null, findings: found }), {
      outcome: 'done',
      summary: 's',
      artifacts: [],
      needs: undefined,
      output: { findings: found },
    });
    assert.equal('output' in parseCloseout({ outcome: 'done', summary: 's', artifacts: [], needs: null }), false);
  });
});
