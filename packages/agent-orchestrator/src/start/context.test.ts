/**
 * The runs a run is handed as context: what a start refuses of them, and what it says of each — pure, as data.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { contextLines, contextRefusal } from './context.ts';

const store = new Set(['a-1', 'b-2']);
const exists = (id: string) => store.has(id);

test('a context run the store has, shipped or in flight, is taken', () => {
  assert.equal(contextRefusal(['a-1', 'b-2'], [], exists, 'c-3'), null);
});

test('a context run the store does not have is Missing, naming how to find one', () => {
  const refused = contextRefusal(['x-9'], [], exists);
  assert.equal(refused?._tag, 'Missing');
  assert.match(refused.message, /--from x-9: the store has no run x-9\. .*nemia ls/);
});

test('a context run named twice is refused', () => {
  const refused = contextRefusal(['a-1', 'a-1'], [], exists);
  assert.equal(refused?._tag, 'Invalid');
  assert.match(refused.message, /--from a-1 is given twice/);
});

test('a context run also waited on is refused, since --after hands its section already', () => {
  const refused = contextRefusal(['a-1'], ['a-1'], exists);
  assert.equal(refused?._tag, 'Invalid');
  assert.match(refused.message, /already waited on \(--after a-1\).*Drop --from a-1/);
});

test('the run itself is refused as its own context', () => {
  const refused = contextRefusal(['a-1'], [], exists, 'a-1');
  assert.equal(refused?._tag, 'Invalid');
  assert.match(refused.message, /that is the run itself/);
});

test('a context id that is not a name is Invalid before the store is asked, so `../x` never reads a file outside runs/', () => {
  const asked: string[] = [];
  const refused = contextRefusal(['../escape'], [], (id) => (asked.push(id), true));
  assert.equal(refused?._tag, 'Invalid');
  assert.match(refused.message, /^--from "\.\.\/escape" is not a run's id/);
  assert.match(refused.message, /--from add-a-flag-x1y2\.$/);

  assert.equal(asked.length, 0, 'the store is never asked of a path');
});

test("a card's refusal names its from: key", () => {
  assert.match(contextRefusal(['x-9'], [], exists, undefined, 'from:')!.message, /^from: x-9: the store has no run x-9/);
});

test('a start says a context run in flight is handed not shipped, not judged, and a shipped one is not waited on', () => {
  const lines = contextLines(['a-1', 'b-2'], (id) => id === 'a-1');
  assert.match(lines[0], /^reads: a-1 — .*not waited on/);
  assert.match(lines[1], /^reads: b-2, still in flight — .*not shipped, not judged/);
});
