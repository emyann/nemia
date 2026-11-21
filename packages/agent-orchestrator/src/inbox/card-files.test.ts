/**
 * A card's `files:` key (`inbox.ts`): read as the map of a file's name to the File it names, in the order written, and written back the
 * same; a value that is not a map, or not a File's id, refused by its kind. The names a card's text uses as an image's or a link's target
 * (`namedInText`), `name` or `./name`.
 */
import { test } from 'vitest';
import assert from 'node:assert/strict';
import { WorkflowError } from '../step/step.ts';
import { cardText, filesText, parseInboxCard } from './inbox.ts';
import { namedInText } from './card-files.ts';

const A = `file_${'a'.repeat(32)}`;
const B = `file_${'b'.repeat(32)}`;

test("a card's files read back in the order written, and its text written again is the same", () => {
  const text = `---\nfactory: acme\nfiles:\n  shot.png: ${A}\n  notes.pdf: ${B}\n---\nLook at ![the bug](shot.png).\n`;
  const card = parseInboxCard('look.md', text);
  assert.deepEqual(card.files, [
    { name: 'shot.png', file: A },
    { name: 'notes.pdf', file: B },
  ]);
  assert.deepEqual(parseInboxCard('look.md', cardText(card, {})).files, card.files);
});

test('files written on a card that had none are read back, and none takes the key off', () => {
  const card = parseInboxCard('look.md', 'Look at it.\n');
  const withFiles = parseInboxCard('look.md', filesText(card, [{ name: 'shot.png', file: A }]));
  assert.deepEqual(withFiles.files, [{ name: 'shot.png', file: A }]);
  assert.equal(parseInboxCard('look.md', filesText(withFiles, [])).files, undefined);
});

for (const [row, block] of [
  ['a list, not a map', 'files: shot.png'],
  ['a value that is no File id', 'files: { a.png: nope }'],
  ['the key set twice', `files: { a.png: ${A} }\nfiles: { b.png: ${B} }`],
] as const) {
  test(`REFUSED: \`files:\` as ${row}`, () => {
    assert.throws(() => parseInboxCard('look.md', `---\n${block}\n---\nLook.\n`), WorkflowError);
  });
}

test('the names a text uses as an image or a link target are found, bare or after ./, and no other', () => {
  const body = 'See ![a](shot.png) and [the log](./run.log "title"), not notes.pdf, nor ![x](https://example.com/shot.png).';
  assert.deepEqual(namedInText(body, ['shot.png', 'run.log', 'notes.pdf']), ['shot.png', 'run.log']);
});
