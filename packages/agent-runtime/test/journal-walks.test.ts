/**
 * The Task door's walks (`journal-walks.ts`) on each of its layers: the files under a scratch root, and memory keeping bodies and
 * keeping each event whole. Then that the table bites: a door that lets a refused append through fails every invariant's walk, and a
 * method no walk asks is named.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Effect, type Layer } from 'effect';
import { Journal } from '../src/core/engine/journal.ts';
import { failing, JOURNAL_WALKS, LAYER_ONLY, unwalked, walksOn, type Side } from './journal-walks.ts';
import { scratch } from './scratch.ts';

/** The door a layer gives. */
const sideOf = (layer: Layer.Layer<Journal>): Side => ({ journal: Effect.runSync(Effect.provide(Effect.service(Journal), layer)) });

const SIDES = {
  files: () => sideOf(Journal.files(scratch('ae-journal-walks-'))),
  memory: () => sideOf(Journal.test()),
  'memory, whole events': () => sideOf(Journal.test({ bodies: false })),
};

for (const [side, made] of Object.entries(SIDES)) {
  for (const [name, body] of walksOn(made)) test(`${side}: ${name}`, body);
}

test('every method of the door is walked, or named as one no walk can ask of every layer', () => {
  for (const made of Object.values(SIDES)) assert.deepEqual(unwalked(Object.keys(made().journal)), []);
  assert.deepEqual(unwalked(['append', 'renamed'], JOURNAL_WALKS, LAYER_ONLY), ['renamed'], 'a method with no walk is named');
});

test('REFUSED: a door that lets a refused append through fails each invariant walk', async () => {
  const lax = (): Side => {
    const { journal } = SIDES.memory();
    return { journal: { ...journal, append: (...args) => journal.append(...args).pipe(Effect.catch(() => Effect.void)) } };
  };
  const failed = await failing(lax);
  for (const reason of ['filed-twice', 'not-filed', 'malformed-id', 'attempt-out-of-order'])
    assert.ok(
      failed.some((name) => name.startsWith(`append: ${reason}`)),
      `the ${reason} walk fails: ${failed.join('; ')}`,
    );
});
