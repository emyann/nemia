import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  attemptLine,
  duration,
  edgesOf,
  forgetFactoryLayout,
  forgetFactoryOpen,
  forgetLayout,
  LOOP_DEPTH,
  loopLabel,
  loopPath,
  parseLayout,
  parseOpen,
  place,
  readFactoryLayout,
  readFactoryOpen,
  readLayout,
  saveFactoryLayout,
  saveFactoryOpen,
  saveLayout,
  type EdgeStep,
} from '../src/lib/canvas.ts';
import type { GraphEdge, RunGraph } from '../src/lib/api.ts';
import type { StepState } from '../src/lib/status.ts';

const after = (from: string, to: string): GraphEdge => ({ from, to, kind: 'after' });
const loop = (from: string, to: string, rounds = 3): GraphEdge => ({ from, to, kind: 'loop', rounds });
const graphOf = (...edges: GraphEdge[]): RunGraph => ({ roots: [], edges });
const step = (name: string, state: StepState, note: string | null = null): EdgeStep => ({ name, state, note });

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
  assert.equal(attemptLine({ count: 2, latest: { startedAt, ended: null, endedAt: null, reason: null } }, true, now), '#2 · 12m 04s');
  assert.equal(attemptLine({ count: 1, latest: { startedAt, ended: 'done', endedAt: null, reason: 'harness' } }, false, now), '#1 · started 12m 04s ago');
  // No end on the record, but no session going either (stopped before the engine saw it end):
  // counting on would claim it is still at work.
  assert.equal(attemptLine({ count: 1, latest: { startedAt, ended: null, endedAt: null, reason: null } }, false, now), '#1 · started 12m 04s ago');
  assert.equal(attemptLine({ count: 0, latest: null }, false, now), null);
});

test('an attempt that is over says how long it took, once the record keeps when it ended', () => {
  const now = Date.parse('2026-09-13T01:00:00.000Z');
  const startedAt = '2026-09-13T00:30:00.000Z';
  const endedAt = '2026-09-13T00:59:04.000Z';
  assert.equal(attemptLine({ count: 1, latest: { startedAt, ended: 'done', endedAt, reason: 'harness' } }, false, now), '#1 · 29m 04s');
  // Ended, and the step still live behind it — between attempts: the attempt shown took what it took.
  assert.equal(attemptLine({ count: 2, latest: { startedAt, ended: 'failed', endedAt, reason: 'exit' } }, true, now), '#2 · 29m 04s');
  // Still running: the time counts, whatever the record says of an end it has not got.
  assert.equal(attemptLine({ count: 3, latest: { startedAt, ended: null, endedAt: null, reason: null } }, true, now), '#3 · 30m 00s');
  // An old record, over and with no end: no clock to stop, so it says when it started.
  assert.equal(attemptLine({ count: 1, latest: { startedAt, ended: 'done', endedAt: null, reason: 'harness' } }, false, now), '#1 · started 30m 00s ago');
});

test('an edge is complete only when the work at both of its ends is done: verified, or on its own word', () => {
  const edges = edgesOf(graphOf(after('implement', 'review'), after('review', 'respond'), after('implement', 'respond'), after('implement', 'gate'), after('review', 'deploy')), [
    step('implement', 'verified'),
    step('review', 'unverified'),
    step('respond', 'working'),
    // Signed off blocked: not done, so the edge into it is not complete.
    step('gate', 'blocked'),
    // Refused by its check: the session ended, and the work is not done.
    step('deploy', 'failed-check'),
  ]);
  assert.deepEqual(edges.map((e) => [e.source, e.target, e.complete]), [
    ['implement', 'review', true],
    ['review', 'respond', false],
    ['implement', 'respond', false],
    ['implement', 'gate', false],
    ['review', 'deploy', false],
  ]);
});

test('an edge naming a step the run does not have draws nothing, and an edge given twice is drawn once', () => {
  assert.deepEqual(edgesOf(graphOf(after('gone', 'review'), after('gone', 'review'), loop('review', 'gone')), [step('review', 'waiting')]), []);
  assert.deepEqual(edgesOf(graphOf(after('a', 'b'), after('a', 'b')), [step('a', 'verified'), step('b', 'waiting')]).map((e) => e.id), ['a->b']);
});

test("a loop's edge goes from the looping step back to its target, beside the `after` edge it returns along, and is never complete", () => {
  const edges = edgesOf(graphOf(after('implement', 'review'), loop('review', 'implement')), [step('implement', 'verified'), step('review', 'verified')]);
  assert.deepEqual(edges.map(({ id, source, target, kind, complete }) => ({ id, source, target, kind, complete })), [
    { id: 'implement->review', source: 'implement', target: 'review', kind: 'after', complete: true },
    // A round that may yet come: drawn dashed whatever its ends say.
    { id: 'loop:review->implement', source: 'review', target: 'implement', kind: 'loop', complete: false },
  ]);
});

test("a loop's edge is labelled with the round it is on past the first — the looping step's note first, then its target's", () => {
  const cases: Array<[review: string | null, implement: string | null, rounds: number, label: string | null]> = [
    // On its first round `wf ls` prints no note, and neither does the edge.
    [null, null, 3, null],
    ['try 2, by retries: 1', null, 3, null],
    ['try 2 due — retries: 1, 0 spent', null, 3, null],
    ['round 3 of 3, and it asked again — once more: wf round r-1 review', 'round 3 of 3', 3, 'round 3 of 3'],
    ['round 2 of 5 due — review asked again, and the next tick files implement', null, 5, 'round 2 of 5'],
    // Filed first in a round, so the target's note says it before the looping step's does.
    [null, 'round 2 of 3', 3, 'round 2 of 3'],
    ['round 2 of 3, try 3, by retries: 1', 'round 2 of 3', 3, 'round 2 of 3'],
    // Past the cap on a person's word: the note has no `of`, and the edge says the cap it went past.
    ['round 4 asked (wf round) — the next tick files implement', 'round 3 of 3', 3, 'round 4 of 3'],
    ['round 4, past rounds: 3, on your word', 'round 4, past rounds: 3, on your word', 3, 'round 4 of 3'],
  ];
  for (const [review, implement, rounds, label] of cases) {
    const [, back] = edgesOf(graphOf(after('implement', 'review'), loop('review', 'implement', rounds)), [step('implement', 'unverified', implement), step('review', 'unverified', review)]);
    assert.equal(back!.label, label, `review: ${review}; implement: ${implement}`);
    assert.equal(loopLabel([review, implement], rounds), label);
  }
});

test("an edge pulses while work moves along it — into a step at work, or back round a loop whose next round is due — and not otherwise", () => {
  const loopPulses = (review: string | null, implement: string | null = null) =>
    edgesOf(graphOf(loop('review', 'implement')), [step('implement', 'unverified', implement), step('review', 'unverified', review)])[0]!.pulsing;
  assert.equal(loopPulses('round 2 of 3 due — review asked again, and the next tick files implement'), true, 'asked again with rounds left');
  assert.equal(loopPulses('round 4 asked (wf round) — the next tick files implement'), true, 'a person sent it round');
  const still: Array<[string | null, string | null]> = [
    [null, null],
    ['round 3 of 3, and it asked again — once more: wf round r-1 review', 'round 3 of 3'],
    ['round 2 of 3', 'round 2 of 3'],
    // A try due is not a round due, on the looping step or its target.
    ['try 2 due — retries: 1, 0 spent', null],
    [null, 'round 2 of 3 due — review asked again, and the next tick files implement'],
  ];
  for (const [review, implement] of still) assert.equal(loopPulses(review, implement), false, `review: ${review}; implement: ${implement}`);

  const into = (state: StepState, from: StepState = 'verified') => edgesOf(graphOf(after('a', 'b')), [step('a', from), step('b', state)])[0]!.pulsing;
  assert.equal(into('working'), true);
  for (const state of ['waiting', 'needs-human', 'checking', 'verified', 'failed'] as const) assert.equal(into(state), false, state);
  assert.equal(into('waiting', 'working'), false, 'out of a step at work, nothing has reached the next one yet');
});

test("a loop's path runs from under the looping step, beneath both, and up into its target, its label at the lowest point", () => {
  const [review, implement] = [{ x: 524, y: 110 }, { x: 112, y: 110 }];
  const { path, labelX, labelY } = loopPath(review, implement);
  const m = /^M ([\d.-]+),([\d.-]+) C ([\d.-]+),([\d.-]+) ([\d.-]+),([\d.-]+) ([\d.-]+),([\d.-]+)$/.exec(path);
  assert.ok(m, path);
  const [x0, y0, x1, y1, x2, y2, x3, y3] = m.slice(1).map(Number) as [number, number, number, number, number, number, number, number];
  assert.deepEqual([x0, y0, x3, y3], [review.x, review.y, implement.x, implement.y], 'it ends at the target, where the arrow goes');
  assert.ok(y1 > review.y && y2 > implement.y, `its control points are below both ends: ${path}`);
  assert.deepEqual([x1, x2], [review.x, implement.x], 'it leaves straight down and arrives straight up');
  // The cubic's middle is where the label sits: `LOOP_DEPTH` below the row.
  const mid = (a: number, b: number, c: number, d: number) => (a + 3 * b + 3 * c + d) / 8;
  assert.deepEqual([mid(x0, x1, x2, x3), mid(y0, y1, y2, y3)], [labelX, labelY]);
  assert.equal(labelY, review.y + LOOP_DEPTH);

  // Nodes of different heights: beneath the lower end.
  const uneven = loopPath({ x: 300, y: 140 }, { x: 0, y: 100 }, 40);
  assert.equal(uneven.labelY, 180);
  assert.ok(uneven.path.endsWith(' 0,100'), uneven.path);
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
