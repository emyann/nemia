import { test } from 'node:test';
import assert from 'node:assert/strict';
import { FAVORITES_KEY, favoriteRows, favoritesOf, isStarred, sameFavorite, toggled, type Favorite } from '../src/lib/favorites.ts';

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

const run = (id: string): Favorite => ({ kind: 'run', run: id });
const flow = (from: 'repo' | 'yours', workflow: string): Favorite => ({ kind: 'workflow', from, workflow });

test('REFUSED: a favourite starred joins the end, and one starred again leaves its place, the others kept in order', () => {
  const [a, b, c] = [run('r-a'), flow('repo', 'dev'), run('r-c')];
  assert.deepEqual(toggled([a, b], c), [a, b, c]);
  assert.deepEqual(toggled([a, b, c], b), [a, c]);
  assert.deepEqual(toggled([c, a, b], run('r-a')), [c, b], 'the one starred is found by what it names, not by being the same object');
  assert.equal(toggled([], a).length, 1);
});

test('REFUSED: two favourites are the same only when their kind and every key match', () => {
  assert.equal(sameFavorite(run('x'), run('x')), true);
  assert.equal(sameFavorite(flow('repo', 'dev'), flow('repo', 'dev')), true);
  assert.equal(sameFavorite(run('x'), flow('repo', 'x')), false, 'a run x and a workflow x');
  assert.equal(sameFavorite(flow('repo', 'x'), run('x')), false, 'a workflow x and a run x');
  assert.equal(sameFavorite(flow('repo', 'dev'), flow('yours', 'dev')), false, "the repository's dev and yours");
  assert.equal(sameFavorite(flow('repo', 'dev'), flow('repo', 'build')), false);
  assert.equal(sameFavorite(run('x'), run('y')), false);
  assert.equal(isStarred([run('a'), flow('yours', 'dev')], flow('yours', 'dev')), true);
  assert.equal(isStarred([run('a'), flow('yours', 'dev')], flow('repo', 'dev')), false);
  assert.equal(isStarred([], run('a')), false);
});

test('REFUSED: a list holding a favourite twice keeps it once, where it first stands', () => {
  const raw = JSON.stringify([run('r-1'), flow('repo', 'dev'), run('r-2'), run('r-1'), flow('repo', 'dev'), flow('yours', 'dev')]);
  assert.deepEqual(favoritesOf(raw), [run('r-1'), flow('repo', 'dev'), run('r-2'), flow('yours', 'dev')]);
});

test('REFUSED: a workflow is gone only once its list is read and lacks it; a run reads its title, a workflow its name', () => {
  const favorites = [run('r-1'), run('r-9'), flow('repo', 'dev'), flow('yours', 'dev')];
  const unread = favoriteRows(favorites, undefined, new Map(), undefined);
  assert.deepEqual(
    unread.map((row) => [row.title, row.gone]),
    [
      ['r-1', false],
      ['r-9', false],
      ['dev', false],
      ['dev', false],
    ],
    'before anything is read, or when the read failed, nothing is gone and a run reads its id',
  );
  const open = [{ id: 'r-1', brief: '# Star the runs\n\nand the workflows' }];
  const workflows = [{ from: 'repo' as const, name: 'dev' }];
  const read = favoriteRows(favorites, open, new Map([['r-9', 'gone']]), workflows);
  assert.deepEqual(
    read.map((row) => [row.favorite, row.title, row.gone]),
    [
      [run('r-1'), 'Star the runs', false],
      [run('r-9'), 'r-9', true],
      [flow('repo', 'dev'), 'dev', false],
      [flow('yours', 'dev'), 'dev', true],
    ],
  );
  assert.deepEqual(
    favoriteRows(favorites, open, new Map(), undefined).map((row) => row.gone),
    [false, false, false, false],
    'the workflows unread, none of them is gone',
  );
});

test('REFUSED: a starred run the open runs lack is not gone: a finished one reads the title of its own read', () => {
  const open = [{ id: 'r-moving', brief: '# Still going' }];
  const finished = { id: 'r-done', brief: '\n# Shipped last week\n\nMore.' };
  const rows = favoriteRows([run('r-moving'), run('r-done'), run('r-unread')], open, new Map([['r-done', finished]]), undefined);
  assert.deepEqual(
    rows.map((row) => [row.title, row.gone]),
    [
      ['Still going', false],
      ['Shipped last week', false],
      ['r-unread', false],
    ],
    'absent from the open runs alone is not gone; one whose own read is on its way, or failed otherwise, reads its id',
  );
});

test('REFUSED: a starred run whose own read found no such run is gone, and reads its id', () => {
  const [row] = favoriteRows([run('r-forgotten')], [], new Map([['r-forgotten', 'gone']]), undefined);
  assert.deepEqual([row.title, row.gone], ['r-forgotten', true]);
  const [unread] = favoriteRows([run('r-forgotten')], undefined, new Map([['r-forgotten', 'gone']]), undefined);
  assert.equal(unread.gone, true, 'the open runs unread, as when their read failed, the run is gone all the same');
  const [back] = favoriteRows([run('r-back')], [{ id: 'r-back', brief: 'Back' }], new Map([['r-back', 'gone']]), undefined);
  assert.deepEqual([back.title, back.gone], ['Back', false], 'a run the open runs hold is there, whatever an older read said');
});
