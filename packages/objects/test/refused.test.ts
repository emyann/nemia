/**
 * `refusedIn`'s rows: one per issue `_tag` the walk handles, each decoded with `reportInput` and read by its fields, never a sentence.
 */
import { describe, test } from 'vitest';
import assert from 'node:assert/strict';
import { Result, Schema } from 'effect';
import { refusedIn } from 'objects';

const placesOf = (schema: Schema.Decoder<unknown>, value: unknown, errors?: 'all') => {
  const decoded = Schema.decodeUnknownResult(schema)(value, { reportInput: true, ...(errors ? { errors } : {}) });
  assert.ok(Result.isFailure(decoded), 'the schema refuses the value');
  return refusedIn(decoded.failure.issue);
};

describe('refusedIn: each issue a schema refuses with, read by its tag', () => {
  test('MissingKey: a required key absent, with no input', () => {
    const [place] = placesOf(Schema.Struct({ a: Schema.String }), {});
    assert.deepEqual(place?.path, ['a']);
    assert.equal(place?._tag, 'MissingKey');
    assert.equal(place !== undefined && Object.hasOwn(place, 'input'), false);
  });

  test('InvalidType: the wrong type, the value kept and the type expected', () => {
    const [place] = placesOf(Schema.Struct({ a: Schema.String }), { a: 5 });
    assert.deepEqual(place, { path: ['a'], _tag: 'InvalidType', input: 5, expected: 'string' });
  });

  test('AnyOf: an optional union no member matches, said without its undefined', () => {
    const [place] = placesOf(Schema.Struct({ a: Schema.optional(Schema.Literals(['x', 'y'])) }), { a: 'z' });
    assert.deepEqual(place, { path: ['a'], _tag: 'AnyOf', input: 'z', expected: '"x" | "y"' });
  });

  test('Filter: a check with a declared message, its message and the value it refused', () => {
    const Short = Schema.String.check(Schema.makeFilter((s: string) => s.length < 3 || 'is too long'));
    const [place] = placesOf(Schema.Struct({ a: Short }), { a: 'long' });
    assert.equal(place?._tag, 'Filter');
    assert.equal(place?.message, 'is too long');
    assert.equal(place?.input, 'long');
    assert.deepEqual(place?.path, ['a']);
  });

  test('Pointer: a nested path through an array', () => {
    const [place] = placesOf(Schema.Struct({ a: Schema.Array(Schema.Struct({ b: Schema.Number })) }), { a: [{ b: 'x' }] });
    assert.deepEqual(place?.path, ['a', 0, 'b']);
  });

  test('Composite: two wrong fields, both listed in order', () => {
    const places = placesOf(Schema.Struct({ a: Schema.String, b: Schema.String }), { a: 1, b: 2 }, 'all');
    assert.deepEqual(
      places.map((p) => [p.path, p.input]),
      [
        [['a'], 1],
        [['b'], 2],
      ],
    );
  });

  test('Encoding: a transformation that fails, the value it was given kept', () => {
    const [place] = placesOf(Schema.Struct({ a: Schema.DateTimeUtcFromString }), { a: 'x' });
    assert.deepEqual(place?.path, ['a']);
    assert.equal(place?._tag, 'InvalidValue');
    assert.equal(place?.input, 'x');
  });
});
