import { test } from 'node:test';
import assert from 'node:assert/strict';
import { FAVORITES_KEY, favoritesOf } from '../src/lib/favorites.ts';

test('the favourites are kept under one key of this browser', () => {
  assert.equal(FAVORITES_KEY, 'nemia:favorites');
});

test('nothing stored, and anything but a list, reads as no favourite', () => {
  for (const raw of [null, '', 'not json', '{}', '"run"', '42', 'null', '{"kind":"run","run":"r-1"}'])
    assert.equal(favoritesOf(raw).length, 0, `${JSON.stringify(raw)} reads as none`);
});

test('a list keeps its well-formed runs and workflows, in order, and drops anything else', () => {
  const raw = JSON.stringify([
    { kind: 'workflow', from: 'yours', workflow: 'mine' },
    { kind: 'run', run: 'r-1' },
    { kind: 'run' },
    { kind: 'run', run: '' },
    { kind: 'run', run: 7 },
    { kind: 'workflow', from: 'elsewhere', workflow: 'dev' },
    { kind: 'workflow', from: 'repo' },
    { kind: 'step', run: 'r-1', step: 's' },
    42,
    null,
    'r-2',
    { kind: 'workflow', from: 'repo', workflow: 'dev', extra: true },
  ]);
  assert.deepEqual(favoritesOf(raw), [
    { kind: 'workflow', from: 'yours', workflow: 'mine' },
    { kind: 'run', run: 'r-1' },
    { kind: 'workflow', from: 'repo', workflow: 'dev' },
  ]);
});
