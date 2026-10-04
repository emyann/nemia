/**
 * The favourites' store (src/lib/useFavorites.ts), without a browser: a window and a local storage stood in for, which refuse or keep what
 * the test says. `npm run e2e` stars and unstars on the pages themselves (`395-favorites.ts`).
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { FAVORITES_KEY, favoritesOf } from '../src/lib/favorites.ts';
import { favoritesText, subscribeFavorites, toggleFavorite } from '../src/lib/useFavorites.ts';

const page = new EventTarget();
Object.assign(globalThis, { window: page });

/** A local storage that keeps what it is given, or one whose every read and write throws, as a private window's or blocked site data's. */
function storage(refused: boolean): Map<string, string> {
  const kept = new Map<string, string>();
  const refuse = () => {
    throw new Error('The operation is insecure.');
  };
  Object.assign(globalThis, {
    localStorage: {
      getItem: (key: string) => (refused ? refuse() : (kept.get(key) ?? null)),
      setItem: (key: string, value: string) => (refused ? refuse() : void kept.set(key, value)),
    },
  });
  return kept;
}

/** Another page of this browser changing `key`, or clearing what it keeps with a null one. */
const otherPage = (key: string | null) => page.dispatchEvent(Object.assign(new Event('storage'), { key }));

test('REFUSED: where storage throws, nothing is starred and a star pressed lasts as long as the page, without a throw', () => {
  storage(true);
  assert.equal(favoritesOf(favoritesText()).length, 0);
  toggleFavorite({ kind: 'run', run: 'r-1' });
  assert.deepEqual(favoritesOf(favoritesText()), [{ kind: 'run', run: 'r-1' }]);
  toggleFavorite({ kind: 'workflow', from: 'repo', workflow: 'dev' });
  assert.deepEqual(favoritesOf(favoritesText()), [
    { kind: 'run', run: 'r-1' },
    { kind: 'workflow', from: 'repo', workflow: 'dev' },
  ]);
});

test('REFUSED: a star pressed on this page tells its readers with no storage event, and another page changing the favourites is read again', () => {
  const kept = storage(false);
  let told = 0;
  const stop = subscribeFavorites(() => told++);
  try {
    otherPage('nemia:bar');
    assert.equal(told, 0, 'another key changed is not the favourites');
    otherPage(FAVORITES_KEY);
    assert.equal(told, 1);
    assert.equal(favoritesText(), null, 'what this page wrote is dropped for what this browser keeps');
    toggleFavorite({ kind: 'run', run: 'r-2' });
    assert.equal(told, 2, 'a star pressed here tells this page');
    assert.deepEqual(favoritesOf(kept.get(FAVORITES_KEY) ?? null), [{ kind: 'run', run: 'r-2' }], 'and is kept by this browser');
    kept.set(FAVORITES_KEY, JSON.stringify([{ kind: 'run', run: 'r-3' }]));
    otherPage(null);
    assert.equal(told, 3, 'what this browser keeps cleared or changed elsewhere is read again');
    assert.deepEqual(favoritesOf(favoritesText()), [{ kind: 'run', run: 'r-3' }]);
    toggleFavorite({ kind: 'run', run: 'r-3' });
    assert.equal(favoritesOf(favoritesText()).length, 0, 'pressed again, it is taken off');
    assert.equal(told, 4);
  } finally {
    stop();
  }
  toggleFavorite({ kind: 'run', run: 'r-4' });
  assert.equal(told, 4, 'a reader stopped is told nothing');
});
