/**
 * `brokenBy`'s rows: what a write breaks, read off its first refused place by its tag, a fragment of its words each, never a sentence.
 */
import { describe, test } from 'vitest';
import assert from 'node:assert/strict';
import { Schema } from 'effect';
import { brokenBy } from './door.store.ts';

const Named = Schema.Struct({
  name: Schema.String,
  tag: Schema.optional(Schema.String.check(Schema.makeFilter((s: string) => s.length > 0 || 'is empty'))),
});

describe('brokenBy: a value its schema refuses, said by the place it breaks', () => {
  test('a value that decodes breaks nothing', () => {
    assert.equal(brokenBy(Named, { name: 'a' }), null);
  });

  test('a missing key is said missing, at its path', () => {
    assert.ok(brokenBy(Named, {})?.startsWith('its `name` is missing'));
  });

  test('a value of the wrong type is quoted, with the type the schema takes', () => {
    const said = brokenBy(Named, { name: 5 }) ?? '';
    assert.ok(said.startsWith('its `name` is 5, where'), said);
    assert.ok(said.endsWith('takes string'), said);
  });

  test("a check's declared message is said as it was declared", () => {
    const said = brokenBy(Named, { name: 'a', tag: '' }) ?? '';
    assert.ok(said.startsWith('its `tag` is empty'), said);
    assert.ok(!said.includes('where'), said);
  });
});
