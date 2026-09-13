import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  attemptLine,
  duration,
  edgesOf,
  forgetFactoryLayout,
  forgetFactoryOpen,
  forgetLayout,
  parseLayout,
  parseOpen,
  place,
  readFactoryLayout,
  readFactoryOpen,
  readLayout,
  saveFactoryLayout,
  saveFactoryOpen,
  saveLayout,
} from '../src/lib/canvas.ts';

test('a duration reads in its two largest units', () => {
  const s = 1000;
  const cases: Array<[number, string]> = [
    [0, '0s'],
    [42 * s, '42s'],
    [12 * 60 * s + 4 * s, '12m 04s'],
    [3 * 3600 * s + 12 * 60 * s + 59 * s, '3h 12m'],
    [2 * 86400 * s + 4 * 3600 * s, '2d 4h'],
    // The engine's clock ahead of this one: nothing has elapsed yet, not a negative time.
    [-5 * s, '0s'],
  ];
  for (const [ms, said] of cases) assert.equal(duration(ms), said, String(ms));
});

test('an attempt that runs counts its time; one that is over says when it started', () => {
  const now = Date.parse('2026-09-13T01:00:00.000Z');
  const startedAt = '2026-09-13T00:47:56.000Z';
  assert.equal(attemptLine({ count: 2, latest: { startedAt, ended: null, reason: null } }, true, now), '#2 · 12m 04s');
  assert.equal(attemptLine({ count: 1, latest: { startedAt, ended: 'done', reason: 'harness' } }, false, now), '#1 · started 12m 04s ago');
  // No end on the record, but no session going either (stopped before the engine saw it end):
  // counting on would claim it is still at work.
  assert.equal(attemptLine({ count: 1, latest: { startedAt, ended: null, reason: null } }, false, now), '#1 · started 12m 04s ago');
  assert.equal(attemptLine({ count: 0, latest: null }, false, now), null);
});

test('an edge is complete only when both of its ends are done', () => {
  const edges = edgesOf([
    { name: 'implement', after: [], state: 'done' },
    { name: 'review', after: ['implement'], state: 'done' },
    { name: 'respond', after: ['review', 'implement'], state: 'working' },
    // Signed off blocked: not done, so the edge into it is not complete.
    { name: 'gate', after: ['implement'], state: 'blocked' },
  ]);
  assert.deepEqual(edges.map((e) => [e.source, e.target, e.complete]), [
    ['implement', 'review', true],
    ['review', 'respond', false],
    ['implement', 'respond', false],
    ['implement', 'gate', false],
  ]);
});

test('an `after` naming a step the run does not have draws no edge', () => {
  assert.deepEqual(edgesOf([{ name: 'review', after: ['gone', 'gone'], state: 'waiting' }]), []);
});

test('a step goes where a person left it, and a step they never moved where the layering puts it', () => {
  const computed = new Map([['implement', { x: 0, y: 0 }], ['review', { x: 0, y: 150 }]]);
  const saved = new Map([['implement', { x: 40, y: -20 }], ['removed-since', { x: 9, y: 9 }]]);
  assert.deepEqual(Object.fromEntries(place(['implement', 'review'], computed, saved)), {
    implement: { x: 40, y: -20 },
    review: { x: 0, y: 150 },
  });
  assert.deepEqual(Object.fromEntries(place(['implement'], computed, null)), { implement: { x: 0, y: 0 } });
});

test('a saved layout is refused unless it is an object of finite points', () => {
  const refused = [null, '', 'not json', 'null', '[]', '3', '{"a":null}', '{"a":{"x":1}}', '{"a":{"x":"1","y":2}}', '{"a":{"x":1e999,"y":0}}'];
  for (const raw of refused) assert.equal(parseLayout(raw), null, String(raw));
  assert.deepEqual(Object.fromEntries(parseLayout('{"a":{"x":1,"y":-2.5}}')!), { a: { x: 1, y: -2.5 } });
  assert.deepEqual(parseLayout('{}'), new Map());
});

test('storage that refuses every call is survived: nothing read, nothing thrown', (t) => {
  const refuse = () => {
    throw new Error('SecurityError: storage is disabled');
  };
  stubStorage(t, { getItem: refuse, setItem: refuse, removeItem: refuse });
  assert.equal(readLayout('r-1'), null);
  assert.doesNotThrow(() => saveLayout('r-1', new Map([['a', { x: 1, y: 2 }]])));
  assert.doesNotThrow(() => forgetLayout('r-1'));
  assert.equal(readFactoryLayout(), null);
  assert.doesNotThrow(() => saveFactoryLayout(new Map([['r-1', { x: 1, y: 2 }]])));
  assert.doesNotThrow(() => forgetFactoryLayout());
});

test('a layout is kept per run until it is forgotten', (t) => {
  const kept = new Map<string, string>();
  stubStorage(t, {
    getItem: (key: string) => kept.get(key) ?? null,
    setItem: (key: string, value: string) => void kept.set(key, value),
    removeItem: (key: string) => void kept.delete(key),
  });
  saveLayout('r-1', new Map([['implement', { x: 12, y: 34 }]]));
  assert.deepEqual(Object.fromEntries(readLayout('r-1')!), { implement: { x: 12, y: 34 } });
  assert.equal(readLayout('r-2'), null);
  forgetLayout('r-1');
  assert.equal(readLayout('r-1'), null);
});

function stubStorage(t: { after: (fn: () => void) => void }, storage: object) {
  const before = Object.getOwnPropertyDescriptor(globalThis, 'localStorage');
  Object.defineProperty(globalThis, 'localStorage', { value: storage, configurable: true, writable: true });
  t.after(() => {
    if (before) Object.defineProperty(globalThis, 'localStorage', before);
    else Reflect.deleteProperty(globalThis, 'localStorage');
  });
}

test('a layout saved before the graph read left to right is not read', (t) => {
  const kept = new Map([['hkb:canvas-layout:r-1', JSON.stringify({ implement: { x: 0, y: 300 } })]]);
  stubStorage(t, memory(kept));
  assert.equal(readLayout('r-1'), null);
  // What is arranged now is read back, and the old arrangement is not laid over it.
  saveLayout('r-1', new Map([['implement', { x: 300, y: 0 }]]));
  assert.deepEqual(Object.fromEntries(readLayout('r-1')!), { implement: { x: 300, y: 0 } });
});

test("the Factory's arrangement is kept apart from every run's, until it is forgotten", (t) => {
  stubStorage(t, memory(new Map()));
  saveFactoryLayout(new Map([['r-1', { x: 320, y: 0 }]]));
  assert.deepEqual(Object.fromEntries(readFactoryLayout()!), { 'r-1': { x: 320, y: 0 } });
  assert.equal(readLayout('r-1'), null);
  forgetFactoryLayout();
  assert.equal(readFactoryLayout(), null);
});

function memory(kept: Map<string, string>) {
  return {
    getItem: (key: string) => kept.get(key) ?? null,
    setItem: (key: string, value: string) => void kept.set(key, value),
    removeItem: (key: string) => void kept.delete(key),
  };
}

test("the Factory's open runs are kept in the order opened, apart from its arrangement, until forgotten", (t) => {
  stubStorage(t, memory(new Map()));
  assert.deepEqual(readFactoryOpen(), []);
  saveFactoryOpen(['r-2', 'r-1']);
  assert.deepEqual(readFactoryOpen(), ['r-2', 'r-1']);
  saveFactoryLayout(new Map([['r-1', { x: 320, y: 0 }]]));
  forgetFactoryLayout();
  assert.deepEqual(readFactoryOpen(), ['r-2', 'r-1'], 'forgetting the arrangement is not closing the runs');
  saveFactoryLayout(new Map([['r-1', { x: 320, y: 0 }]]));
  forgetFactoryOpen();
  assert.deepEqual(readFactoryOpen(), []);
  assert.deepEqual(Object.fromEntries(readFactoryLayout()!), { 'r-1': { x: 320, y: 0 } });
});

test('a saved open set is refused unless it is a list of run ids', () => {
  const refused = [null, '', 'not json', 'null', '{}', '"r-1"', '3', '[1]', '["r-1",null]', '["r-1",["r-2"]]', '[""]'];
  for (const raw of refused) assert.deepEqual(parseOpen(raw), [], String(raw));
  assert.deepEqual(parseOpen('["r-2","r-1","r-2"]'), ['r-2', 'r-1']);
  assert.deepEqual(parseOpen('[]'), []);
});

test('a browser that refuses storage keeps no run open, and throws nothing — nor one where storage is not there at all', (t) => {
  const refuse = () => {
    throw new Error('SecurityError: storage is disabled');
  };
  stubStorage(t, { getItem: refuse, setItem: refuse, removeItem: refuse });
  assert.deepEqual(readFactoryOpen(), []);
  assert.doesNotThrow(() => saveFactoryOpen(['r-1']));
  assert.doesNotThrow(() => forgetFactoryOpen());
  // A sandboxed frame throws on reading `localStorage` itself, before any call.
  Object.defineProperty(globalThis, 'localStorage', { get: refuse, configurable: true });
  assert.deepEqual(readFactoryOpen(), []);
  assert.doesNotThrow(() => saveFactoryOpen(['r-1']));
  assert.doesNotThrow(() => forgetFactoryOpen());
});
