/**
 * The files a start's form lists as files are dropped or picked (lib/startInputs.ts): a drop of several, folded one at a time by the
 * function `contracts/start-inputs.contract.ts` proves (`inputAddedOf`), so the last of a drop under one name wins, where the one it
 * replaces stood. What one file added does is the contract's, proved; this holds a drop of several, which no law reads.
 */
import { test } from 'vitest';
import assert from 'node:assert/strict';
import { inputAddedOf, inputsAdded } from '../src/lib/startInputs.ts';

const file = (name: string, size: number) => ({ name, size });

test('a drop of several files is each added in turn: a name once, the last under it in the place of the one listed, new names after', () => {
  const listed = [file('a.png', 1), file('b.png', 2)];
  const dropped = [file('c.png', 3), file('a.png', 4), file('c.png', 5), file('a.png', 6)];
  assert.deepEqual(inputsAdded(listed, dropped), [file('a.png', 6), file('b.png', 2), file('c.png', 5)]);
  assert.deepEqual(
    inputsAdded(listed, dropped),
    dropped.reduce<readonly { name: string; size: number }[]>((list, f) => inputAddedOf(list, f), listed),
    'the form folds the proved function',
  );
  assert.deepEqual(listed, [file('a.png', 1), file('b.png', 2)], 'the list it was given is left as it was');
});
