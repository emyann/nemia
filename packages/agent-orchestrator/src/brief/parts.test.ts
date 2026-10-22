/**
 * Where a brief is cut (`briefParts`): before each `## ` section, the parts joining into the brief. One table; the briefs themselves
 * are told in `test/assess-lifecycle.test.ts` and the `assess-*` tables of each feature.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { briefParts } from './parts.ts';

test('briefParts: where a brief is cut', async (t) => {
  await t.test('a brief is cut before each line that opens a section, and its parts join into it', () => {
    const brief =
      'The step.\n\n## What was asked for\n\nThe card.\n## From design\n\n### a heading inside\nit said ##  this\n## Approved\n';
    const parts = briefParts(brief);
    assert.deepEqual(parts, [
      'The step.\n\n',
      '## What was asked for\n\nThe card.\n',
      '## From design\n\n### a heading inside\nit said ##  this\n',
      '## Approved\n',
    ]);
    assert.equal(parts.join(''), brief);
  });

  await t.test('a section reads alike in two briefs, whatever comes before it', () => {
    const shared = '## From design\n\nthe spec, at length\n';
    assert.equal(briefParts(`one step's words\n${shared}`).at(-1), shared);
    assert.equal(briefParts(`another's, longer\n\n## What was asked for\n\ncard\n${shared}`).at(-1), shared);
  });

  await t.test('a brief with no section, or opening with one, is one part, or has no empty part first', () => {
    assert.deepEqual(briefParts('only words, ## not a section'), ['only words, ## not a section']);
    assert.deepEqual(briefParts('## First\nwords\n## Second\n'), ['## First\nwords\n', '## Second\n']);
  });
});
