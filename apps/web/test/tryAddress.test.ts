/**
 * The addresses a step's part keeps (src/lib/tryAddress.ts, src/lib/viewAddress.ts): the try each step shows, `?try=<step>:<n>,…`, read
 * back as it was written, a malformed entry dropped and one step's choice changed with the others kept; and the file the viewer's sheet
 * shows, `?view=<step>/<path>`, opened by a push and closed with every other key kept.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { setTry, triesOf, triesPrinted, tryShown, trySearch } from '../src/lib/tryAddress.ts';
import { viewClosed, viewOf, viewOpened, viewSearch, viewValue } from '../src/lib/viewAddress.ts';

test('?try= round-trips through trySearch, triesOf and triesPrinted', () => {
  assert.deepEqual(triesOf('a:2,b:3'), { a: 2, b: 3 });
  assert.equal(triesPrinted(triesOf('a:2,b:3')), 'a:2,b:3');
  assert.deepEqual(trySearch({ try: 'a:2,b:3', bar: 'run:r-1' }), { try: 'a:2,b:3' });
  assert.equal(triesOf('ns:step:4')['ns:step'], 4, "a step's own `:` stays in its name: the address splits at the last");
});

test('a malformed ?try= entry is dropped, and a value that names none leaves the key out', () => {
  assert.deepEqual(triesOf('a:2,b,:3,c:0,d:-1,e:1.5,f:x,g:'), { a: 2 });
  assert.deepEqual(trySearch({ try: 'a:2,b' }), { try: 'a:2' });
  assert.deepEqual(trySearch({ try: 'b,c:0' }), {});
  assert.deepEqual(trySearch({ try: 7 }), {});
  assert.deepEqual(trySearch({}), {});
});

test("setTry replaces one step's choice and keeps the others', and every other key of the search", () => {
  const search = { bar: 'run:r-1', try: 'a:2,b:3' };
  assert.deepEqual(setTry(search, 'a', 1), { bar: 'run:r-1', try: 'a:1,b:3' });
  assert.deepEqual(setTry(search, 'c', 5), { bar: 'run:r-1', try: 'a:2,b:3,c:5' });
  assert.deepEqual(setTry(search, 'b', null), { bar: 'run:r-1', try: 'a:2' });
  assert.deepEqual(setTry({ bar: 'run:r-1', try: 'a:2' }, 'a', null), { bar: 'run:r-1' }, 'no choice left: the key goes');
  assert.deepEqual(setTry({}, 'a', 2), { try: 'a:2' });
});

test('tryShown: the choice the step has, else its current, else its last', () => {
  assert.equal(tryShown([1, 2, 3], 3, 1), 1);
  assert.equal(tryShown([1, 2, 3], 3, 9), 3, 'a stale choice is no choice');
  assert.equal(tryShown([1, 2, 3], null, null), 3);
  assert.equal(tryShown([], null, 2), null);
});

test('?view= names a step and a path, split at the first `/`; opening and closing keep every other key', () => {
  assert.deepEqual(viewOf('review/shots/a.png'), { step: 'review', path: 'shots/a.png' });
  assert.equal(viewValue({ step: 'review', path: 'shots/a.png' }), 'review/shots/a.png');
  for (const bad of ['review', 'review/', '/a.png', 3, undefined]) assert.equal(viewOf(bad), undefined, String(bad));
  assert.deepEqual(viewSearch({ view: 'review/a.md', bar: 'run:r-1' }), { view: 'review/a.md' });
  assert.deepEqual(viewSearch({ view: 'review' }), {});
  const search = { bar: 'run:r-1', try: 'review:2' };
  const opened = viewOpened(search, { step: 'review', path: 'a.md' });
  assert.deepEqual(opened, { bar: 'run:r-1', try: 'review:2', view: 'review/a.md' });
  assert.deepEqual(viewClosed(opened), search);
});
