/**
 * The board's one door to what this browser keeps (`lib/stored.ts`): read, kept and forgotten under a key, and nothing thrown where
 * storage is refused.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { forgetStored, readStored, store } from '../src/lib/stored.ts';

/** While the test runs, `storage` as the page's `localStorage`. */
function stubStorage(t: { after: (fn: () => void) => void }, storage: object) {
  const before = Object.getOwnPropertyDescriptor(globalThis, 'localStorage');
  Object.defineProperty(globalThis, 'localStorage', { value: storage, configurable: true, writable: true });
  t.after(() => {
    if (before) Object.defineProperty(globalThis, 'localStorage', before);
    else Reflect.deleteProperty(globalThis, 'localStorage');
  });
}

/** A storage of this process's own. */
function memory(kept: Map<string, string>) {
  return {
    getItem: (key: string) => kept.get(key) ?? null,
    setItem: (key: string, value: string) => void kept.set(key, value),
    removeItem: (key: string) => void kept.delete(key),
  };
}

/** A number read from what is kept, or nothing for words that are not one. */
const number = (raw: string): number | undefined => (Number.isFinite(Number(raw)) ? Number(raw) : undefined);

test('stored: what this browser keeps, under one door', async (t) => {
  await t.test('a value kept is read back through its parse, and forgotten', (t) => {
    const kept = new Map<string, string>();
    stubStorage(t, memory(kept));
    assert.equal(readStored('k', number, -1), -1, 'nothing kept: the none');
    store('k', '420');
    assert.equal(readStored('k', number, -1), 420);
    store('k', 'wide');
    assert.equal(readStored('k', number, -1), -1, 'words the parse reads nothing in: the none');
    forgetStored('k');
    assert.equal(kept.has('k'), false);
  });
  await t.test('a width kept as JSON reads as the same width kept as a string', (t) => {
    stubStorage(t, memory(new Map()));
    store('w', JSON.stringify(420));
    const json = readStored('w', number, -1);
    store('w', String(420));
    assert.equal(readStored('w', number, -1), json);
  });
  await t.test('a browser that refuses storage keeps nothing, and throws nothing — nor one where storage is not there at all', (t) => {
    const refuse = () => {
      throw new Error('SecurityError: storage is disabled');
    };
    stubStorage(t, { getItem: refuse, setItem: refuse, removeItem: refuse });
    assert.deepEqual(
      readStored('k', (raw) => [raw], []),
      [],
    );
    assert.doesNotThrow(() => store('k', '[]'));
    assert.doesNotThrow(() => forgetStored('k'));
    Object.defineProperty(globalThis, 'localStorage', { get: refuse, configurable: true });
    assert.deepEqual(
      readStored('k', (raw) => [raw], []),
      [],
      'a sandboxed frame throws on reading `localStorage` itself, before any call',
    );
    assert.doesNotThrow(() => store('k', '[]'));
    assert.doesNotThrow(() => forgetStored('k'));
  });
});
