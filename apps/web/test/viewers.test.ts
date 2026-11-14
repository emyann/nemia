/**
 * What a step's file and field are drawn by (src/lib/viewers.ts, src/lib/fieldWidget.ts), past what their contracts prove: a file's
 * extension read off its name, and a field's schema read into what `widgetOf` decides on.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { extensionOf, viewerOf } from '../src/lib/viewers.ts';
import { fieldReadOf, widgetOf } from '../src/lib/fieldWidget.ts';

test("extensionOf: the last dot of the name's last segment, lower case; none for no dot or a leading one", () => {
  assert.deepEqual(['report.MD', 'out/a.b/data.json', 'shots/x.png', 'Makefile', '.env', 'dir.d/README'].map(extensionOf), [
    'md',
    'json',
    'png',
    '',
    '',
    '',
  ]);
  assert.equal(viewerOf({ kind: 'text', extension: extensionOf('NOTES.Markdown') }), 'markdown');
});

test("fieldReadOf: a schema's type words, its enum and an array's items, each word once", () => {
  assert.deepEqual(fieldReadOf({ type: ['string', 'null'], enum: ['a', 'b'] }, null), {
    shape: null,
    types: ['string', 'null'],
    enumerated: true,
    items: [],
  });
  assert.deepEqual(fieldReadOf({ type: 'array', items: { type: 'object' } }, null).items, ['object']);
  assert.deepEqual(fieldReadOf({ type: ['string', 'string'] }, null).types, ['string'], 'a word named twice is read once');
  assert.deepEqual(fieldReadOf(null, 'commit'), { shape: 'commit', types: [], enumerated: false, items: [] });
  assert.equal(widgetOf(fieldReadOf({ type: 'array', items: { type: 'object' } }, null)), 'table');
  assert.equal(widgetOf(fieldReadOf({ anyOf: [{ type: 'string' }] }, null)), 'json');
});
