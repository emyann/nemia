/**
 * A run's canvas (src/lib/canvas.ts), as tables: an attempt's time, a run's edges and how each is drawn, a saved layout read back, the
 * layout store per run and per Factory, and where a canvas is fitted beside the bar; the edge colours read from the theme, and the
 * double click, each a test of its own.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {
  attemptLine,
  BESIDE_MIN,
  besideBar,
  besideOpen,
  drawnWhole,
  duration,
  edgeLine,
  edgesOf,
  edgeState,
  edgeStroke,
  forgetFactoryLayout,
  forgetFactoryOpen,
  forgetFactoryLeftovers,
  forgetLayout,
  LEAST_ZOOM,
  LOOP_DEPTH,
  loopLabel,
  loopPath,
  parseLayout,
  parseOpen,
  place,
  secondClick,
  readFactoryLayout,
  readFactoryOpen,
  readNarrowFactoryLayout,
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
const step = (name: string, state: StepState, note: string | null = null, roundDue = false): EdgeStep => ({ name, state, note, roundDue });

test("duration and attemptLine: an attempt's time", async (t) => {
  await t.test(
    "a duration reads in its two largest units, and one below zero — the engine's clock ahead of this one — as nothing elapsed yet",
    () => {
      const s = 1000;
      const cases: Array<[number, string]> = [
        [0, '0s'],
        [42 * s, '42s'],
        [12 * 60 * s + 4 * s, '12m 04s'],
        [3 * 3600 * s + 12 * 60 * s + 59 * s, '3h 12m'],
        [2 * 86400 * s + 4 * 3600 * s, '2d 4h'],
        [-5 * s, '0s'],
      ];
      for (const [ms, said] of cases) assert.equal(duration(ms), said, String(ms));
    },
  );
  await t.test('an attempt that runs counts its time; one that is over says when it started', () => {
    const now = Date.parse('2026-09-13T01:00:00.000Z');
    const startedAt = '2026-09-13T00:47:56.000Z';
    assert.equal(attemptLine({ count: 2, latest: { startedAt, ended: null, endedAt: null, reason: null } }, true, now), '#2 · 12m 04s');
    assert.equal(
      attemptLine({ count: 1, latest: { startedAt, ended: 'done', endedAt: null, reason: 'harness' } }, false, now),
      '#1 · started 12m 04s ago',
    );
    assert.equal(
      attemptLine({ count: 1, latest: { startedAt, ended: null, endedAt: null, reason: null } }, false, now),
      '#1 · started 12m 04s ago',
      'no end on the record, and no session going either: counting on would claim it is still at work',
    );
    assert.equal(attemptLine({ count: 0, latest: null }, false, now), null);
  });
  await t.test('an attempt that is over says how long it took, once the record keeps when it ended', () => {
    const now = Date.parse('2026-09-13T01:00:00.000Z');
    const startedAt = '2026-09-13T00:30:00.000Z';
    const endedAt = '2026-09-13T00:59:04.000Z';
    assert.equal(attemptLine({ count: 1, latest: { startedAt, ended: 'done', endedAt, reason: 'harness' } }, false, now), '#1 · 29m 04s');
    assert.equal(
      attemptLine({ count: 2, latest: { startedAt, ended: 'failed', endedAt, reason: 'exit' } }, true, now),
      '#2 · 29m 04s',
      'ended, and the step still live behind it between attempts: the attempt shown took what it took',
    );
    assert.equal(
      attemptLine({ count: 3, latest: { startedAt, ended: null, endedAt: null, reason: null } }, true, now),
      '#3 · 30m 00s',
      'still running: the time counts',
    );
    assert.equal(
      attemptLine({ count: 1, latest: { startedAt, ended: 'done', endedAt: null, reason: 'harness' } }, false, now),
      '#1 · started 30m 00s ago',
      'a record over and with no end: no clock to stop, so it says when it started',
    );
  });
});

test("edgesOf, loopLabel and edgeState: a run's edges, done, running or to come", async (t) => {
  await t.test('an edge is done only when the work at both of its ends is done: verified, or on its own word', () => {
    const edges = edgesOf(
      graphOf(
        after('implement', 'review'),
        after('review', 'respond'),
        after('implement', 'respond'),
        after('implement', 'gate'),
        after('review', 'deploy'),
      ),
      [
        step('implement', 'verified'),
        step('review', 'unverified'),
        step('respond', 'working'),
        step('gate', 'blocked'),
        step('deploy', 'failed-check'),
      ],
    );
    assert.deepEqual(
      edges.map((e) => [e.source, e.target, e.state]),
      [
        ['implement', 'review', 'done'],
        ['review', 'respond', 'running'],
        ['implement', 'respond', 'running'],
        ['implement', 'gate', 'to-come'],
        ['review', 'deploy', 'to-come'],
      ],
      'into a step at work: moving; into one signed off blocked, or refused by its check: not done',
    );
  });
  await t.test('an edge naming a step the run does not have draws nothing, and an edge given twice is drawn once', () => {
    assert.deepEqual(
      edgesOf(graphOf(after('gone', 'review'), after('gone', 'review'), loop('review', 'gone')), [step('review', 'waiting')]),
      [],
    );
    assert.deepEqual(
      edgesOf(graphOf(after('a', 'b'), after('a', 'b')), [step('a', 'verified'), step('b', 'waiting')]).map((e) => e.id),
      ['a->b'],
    );
  });
  await t.test(
    "a loop's edge goes from the looping step back to its target, beside the `after` edge it returns along, and is never done",
    () => {
      const edges = edgesOf(graphOf(after('implement', 'review'), loop('review', 'implement')), [
        step('implement', 'verified'),
        step('review', 'verified'),
      ]);
      assert.deepEqual(
        edges.map(({ id, source, target, kind, state }) => ({ id, source, target, kind, state })),
        [
          { id: 'implement->review', source: 'implement', target: 'review', kind: 'after', state: 'done' },
          { id: 'loop:review->implement', source: 'review', target: 'implement', kind: 'loop', state: 'to-come' },
        ],
        'a round that may yet come: to come whatever its ends say',
      );
    },
  );
  await t.test(
    "a loop's edge is labelled with the round it is on past the first, as `wf ls` notes it — the looping step's note first, then its target's, which a round filed first notes first — and past the cap on a person's word, with the cap it went past",
    () => {
      const cases: Array<[review: string | null, implement: string | null, rounds: number, label: string | null]> = [
        [null, null, 3, null],
        ['try 2, by retries: 1', null, 3, null],
        ['try 2 due — retries: 1, 0 spent', null, 3, null],
        ['round 3 of 3, and it asked again — once more: nemia round r-1 review', 'round 3 of 3', 3, 'round 3 of 3'],
        ['round 2 of 5 due — review asked again, and the next tick files implement', null, 5, 'round 2 of 5'],
        [null, 'round 2 of 3', 3, 'round 2 of 3'],
        ['round 2 of 3, try 3, by retries: 1', 'round 2 of 3', 3, 'round 2 of 3'],
        ['round 4 asked (nemia round) — the next tick files implement', 'round 3 of 3', 3, 'round 4 of 3'],
        ['round 4, past rounds: 3, on your word', 'round 4, past rounds: 3, on your word', 3, 'round 4 of 3'],
      ];
      for (const [review, implement, rounds, label] of cases) {
        const [, back] = edgesOf(graphOf(after('implement', 'review'), loop('review', 'implement', rounds)), [
          step('implement', 'unverified', implement),
          step('review', 'unverified', review),
        ]);
        assert.equal(back.label, label, `review: ${review}; implement: ${implement}`);
        assert.equal(loopLabel([review, implement], rounds), label);
      }
    },
  );
  await t.test(
    'an edge runs while work moves along it — into a step at work or at its check, or back round a loop whose looping step the api says is due, whatever its note words — and not otherwise',
    () => {
      const loopState = (review: string | null, due: boolean, implement: string | null = null, implementDue = false) =>
        edgesOf(graphOf(loop('review', 'implement')), [
          step('implement', 'unverified', implement, implementDue),
          step('review', 'unverified', review, due),
        ])[0].state;
      assert.equal(loopState('round 2 of 3 due — review asked again, and the next tick files implement', true), 'running', 'asked again');
      assert.equal(loopState('round 4 asked (nemia round) — the next tick files implement', true), 'running', 'a person sent it round');
      assert.equal(loopState(null, true), 'running', 'the fact, with no note to word it');
      const still: Array<[review: string | null, implement: string | null, implementDue: boolean]> = [
        [null, null, false],
        ['round 2 of 3 due — review asked again, and the next tick files implement', null, false],
        ['round 4 asked (nemia round) — the next tick files implement', null, false],
        ['round 3 of 3, and it asked again — once more: nemia round r-1 review', 'round 3 of 3', false],
        ['try 2 due — retries: 1, 0 spent', null, false],
        [null, 'round 2 of 3 due — review asked again, and the next tick files implement', true],
      ];
      for (const [review, implement, implementDue] of still)
        assert.equal(
          loopState(review, false, implement, implementDue),
          'to-come',
          `REFUSED: review not due, its note ${review}; implement: ${implement}`,
        );

      const into = (state: StepState, from: StepState = 'verified') =>
        edgesOf(graphOf(after('a', 'b')), [step('a', from), step('b', state)])[0].state;
      assert.equal(into('working'), 'running', 'its session is at work');
      assert.equal(into('checking'), 'running', 'its check is running');
      const stillInto = [
        'blocked',
        'exhausted',
        'failed-check',
        'needs-human',
        'unsigned',
        'denied',
        'failed',
        'unreadable',
        'unknown',
        'cancelled',
        'waiting',
      ] as const;
      for (const state of stillInto)
        assert.equal(
          into(state),
          'to-come',
          `${state}: nothing moves into a human gate, a refused check, a step asking a person, one that ended badly, or one not filed`,
        );
      for (const state of ['verified', 'unverified'] as const) assert.equal(into(state), 'done', state);
      assert.equal(into('waiting', 'working'), 'to-come', 'out of a step at work, nothing has reached the next one yet');

      assert.deepEqual(
        [edgeState(true, 'working'), edgeState(true, 'checking'), edgeState(true, 'unverified'), edgeState(true, 'blocked')],
        ['running', 'running', 'done', 'to-come'],
        "a card's edge has no step at its start: it reads its root alone",
      );
    },
  );
});

test('every edge colour is given once, from a name that follows the scheme — a colour named and never given draws no line at all', () => {
  const css = fs.readFileSync(path.resolve(import.meta.dirname, '..', 'src', 'styles.css'), 'utf8');
  const blocks = [...css.matchAll(/\.react-flow \{([^}]*)\}/g)];
  assert.equal(blocks.length, 1, "one .react-flow block: its colours are the theme's roles, which change with the scheme themselves");
  const [palette] = blocks as [RegExpExecArray];
  const named = (['to-come', 'done', 'running'] as const).flatMap((state) => [edgeStroke(state, false), edgeStroke(state, true)]);
  for (const colour of new Set(named)) {
    const name = /^var\((--[\w-]+)\)$/.exec(colour)?.[1];
    assert.ok(name, colour);
    assert.match(palette[1], new RegExp(`${name}:\\s*var\\(--(?:md-sys-color|meaning)-[\\w-]+\\);`), `${name} read from the theme`);
  }
  assert.doesNotMatch(palette[1], /var\(--color-/, 'no colour of one scheme alone');
});

test('edgeLine, edgeStroke and loopPath: how an edge is drawn', async (t) => {
  await t.test(
    "an edge is drawn from what it says: in the running colour while it moves, a loop's own colour at rest, dashed while still to come",
    () => {
      assert.deepEqual(
        [edgeStroke('to-come', false), edgeStroke('done', false), edgeStroke('running', false), edgeStroke('to-come', true)],
        ['var(--edge-to-come)', 'var(--edge-done)', 'var(--edge-running)', 'var(--edge-loop)'],
      );
      assert.equal(
        edgeStroke('running', true),
        'var(--edge-running)',
        'a loop whose round is due moves as a running edge does, and is told apart by the same colour',
      );

      assert.deepEqual(edgeLine('to-come', false), { strokeWidth: 1.5, strokeDasharray: '5 4' });
      assert.deepEqual(edgeLine('done', false), { strokeWidth: 1.5 });
      assert.deepEqual(edgeLine('running', false), { strokeWidth: 2 });
      assert.deepEqual(
        edgeLine('to-come', true),
        { strokeWidth: 1.5, strokeDasharray: '5 4' },
        "a loop's edge back stands for a round that may yet come: dashed at rest",
      );
      assert.deepEqual(
        edgeLine('running', true),
        { strokeWidth: 2, strokeDasharray: '5 4' },
        "a loop's edge back is dashed while its round is due too",
      );
    },
  );
  await t.test(
    "a loop's path runs from under the looping step, beneath both, and up into its target, its label at the lowest point",
    () => {
      const [review, implement] = [
        { x: 524, y: 110 },
        { x: 112, y: 110 },
      ];
      const { path, labelX, labelY } = loopPath(review, implement);
      const m = /^M ([\d.-]+),([\d.-]+) C ([\d.-]+),([\d.-]+) ([\d.-]+),([\d.-]+) ([\d.-]+),([\d.-]+)$/.exec(path);
      assert.ok(m, path);
      const [x0, y0, x1, y1, x2, y2, x3, y3] = m.slice(1).map(Number) as [number, number, number, number, number, number, number, number];
      assert.deepEqual([x0, y0, x3, y3], [review.x, review.y, implement.x, implement.y], 'it ends at the target, where the arrow goes');
      assert.ok(y1 > review.y && y2 > implement.y, `its control points are below both ends: ${path}`);
      assert.deepEqual([x1, x2], [review.x, implement.x], 'it leaves straight down and arrives straight up');
      const mid = (a: number, b: number, c: number, d: number) => (a + 3 * b + 3 * c + d) / 8;
      assert.deepEqual([mid(x0, x1, x2, x3), mid(y0, y1, y2, y3)], [labelX, labelY], "the cubic's middle is where the label sits");
      assert.equal(labelY, review.y + LOOP_DEPTH, '`LOOP_DEPTH` below the row');

      const uneven = loopPath({ x: 300, y: 140 }, { x: 0, y: 100 }, 40);
      assert.equal(uneven.labelY, 180, 'nodes of different heights: beneath the lower end');
      assert.ok(uneven.path.endsWith(' 0,100'), uneven.path);
    },
  );
});

function stubStorage(t: { after: (fn: () => void) => void }, storage: object) {
  const before = Object.getOwnPropertyDescriptor(globalThis, 'localStorage');
  Object.defineProperty(globalThis, 'localStorage', { value: storage, configurable: true, writable: true });
  t.after(() => {
    if (before) Object.defineProperty(globalThis, 'localStorage', before);
    else Reflect.deleteProperty(globalThis, 'localStorage');
  });
}

function memory(kept: Map<string, string>) {
  return {
    getItem: (key: string) => kept.get(key) ?? null,
    setItem: (key: string, value: string) => void kept.set(key, value),
    removeItem: (key: string) => void kept.delete(key),
  };
}

test('place, parseLayout and parseOpen: a saved layout and open set read back', async (t) => {
  await t.test('a step goes where a person left it, and a step they never moved where the layering puts it', () => {
    const computed = new Map([
      ['implement', { x: 0, y: 0 }],
      ['review', { x: 0, y: 150 }],
    ]);
    const saved = new Map([
      ['implement', { x: 40, y: -20 }],
      ['removed-since', { x: 9, y: 9 }],
    ]);
    assert.deepEqual(Object.fromEntries(place(['implement', 'review'], computed, saved)), {
      implement: { x: 40, y: -20 },
      review: { x: 0, y: 150 },
    });
    assert.deepEqual(Object.fromEntries(place(['implement'], computed, null)), { implement: { x: 0, y: 0 } });
  });
  await t.test('a saved layout is refused unless it is an object of finite points', () => {
    const refused = [
      null,
      '',
      'not json',
      'null',
      '[]',
      '3',
      '{"a":null}',
      '{"a":{"x":1}}',
      '{"a":{"x":"1","y":2}}',
      '{"a":{"x":1e999,"y":0}}',
    ];
    for (const raw of refused) assert.equal(parseLayout(raw), null, String(raw));
    assert.deepEqual(Object.fromEntries(parseLayout('{"a":{"x":1,"y":-2.5}}')!), { a: { x: 1, y: -2.5 } });
    assert.deepEqual(parseLayout('{}'), new Map());
  });
  await t.test('a saved open set is refused unless it is a list of run ids', () => {
    const refused = [null, '', 'not json', 'null', '{}', '"r-1"', '3', '[1]', '["r-1",null]', '["r-1",["r-2"]]', '[""]'];
    for (const raw of refused) assert.deepEqual(parseOpen(raw), [], String(raw));
    assert.deepEqual(parseOpen('["r-2","r-1","r-2"]'), ['r-2', 'r-1']);
    assert.deepEqual(parseOpen('[]'), []);
  });
});

test('the layout store: per run and per Factory, until forgotten, on storage that refuses or is absent', async (t) => {
  await t.test('storage that refuses every call is survived: nothing read, nothing thrown', (t) => {
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
  await t.test('a layout is kept per run until it is forgotten', (t) => {
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
  await t.test('a layout saved before the graph read left to right is not read', (t) => {
    const kept = new Map([['hkb:canvas-layout:r-1', JSON.stringify({ implement: { x: 0, y: 300 } })]]);
    stubStorage(t, memory(kept));
    assert.equal(readLayout('r-1'), null);
    saveLayout('r-1', new Map([['implement', { x: 300, y: 0 }]]));
    assert.deepEqual(
      Object.fromEntries(readLayout('r-1')!),
      { implement: { x: 300, y: 0 } },
      'what is arranged now is read back, and the old arrangement is not laid over it',
    );
  });
  await t.test("the Factory's arrangement is kept apart from every run's, until it is forgotten", (t) => {
    stubStorage(t, memory(new Map()));
    saveFactoryLayout(new Map([['r-1', { x: 320, y: 0 }]]));
    assert.deepEqual(Object.fromEntries(readFactoryLayout()!), { 'r-1': { x: 320, y: 0 } });
    assert.equal(readLayout('r-1'), null);
    forgetFactoryLayout();
    assert.equal(readFactoryLayout(), null);
  });
  await t.test("the Factory's arrangement saved at the old cell width is read apart, until one is saved or it is forgotten", (t) => {
    const narrow = JSON.stringify({ 'r-1': { x: 320, y: 0 } });
    const kept = new Map([['hkb:factory-layout', narrow]]);
    stubStorage(t, memory(kept));
    assert.equal(readFactoryLayout(), null, "not read as the arrangement at today's width: its cards are a narrower cell apart");
    assert.deepEqual(Object.fromEntries(readNarrowFactoryLayout()!), { 'r-1': { x: 320, y: 0 } });
    saveFactoryLayout(new Map([['r-1', { x: 384, y: 0 }]]));
    assert.equal(readNarrowFactoryLayout(), null, "the first arrangement saved at today's width is the one read from then on");
    assert.deepEqual(Object.fromEntries(readFactoryLayout()!), { 'r-1': { x: 384, y: 0 } });
    kept.set('hkb:factory-layout', narrow);
    forgetFactoryLayout();
    assert.equal(readFactoryLayout(), null, 'Reset layout forgets both');
    assert.equal(readNarrowFactoryLayout(), null, 'Reset layout forgets both');
  });
  await t.test("the Factory's open runs are kept in the order opened, apart from its arrangement, until forgotten", (t) => {
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
  await t.test('what an older board kept for the Factory is forgotten, and nothing else with them', (t) => {
    const kept = new Map([
      ['hkb:factory-steps', JSON.stringify({ 'r-1/review': { x: 40, y: -10 } })],
      ['hkb:factory-layout:v2', JSON.stringify({ 'r-2': { x: 0, y: 0 } })],
      ['hkb:factory-open', JSON.stringify(['r-2'])],
    ]);
    stubStorage(t, memory(kept));
    saveFactoryOpen(['r-1']);
    saveFactoryLayout(new Map([['r-1', { x: 320, y: 0 }]]));
    forgetFactoryLeftovers();
    assert.deepEqual([...kept.keys()].sort(), ['nemia:factory-layout:v2', 'nemia:factory-open']);
    assert.deepEqual(readFactoryOpen(), ['r-1'], 'the open runs stay');
    assert.deepEqual(Object.fromEntries(readFactoryLayout()!), { 'r-1': { x: 320, y: 0 } }, 'and the arrangement');
  });
  await t.test('a browser that refuses storage forgets no step, and throws nothing', (t) => {
    const refuse = () => {
      throw new Error('SecurityError: storage is disabled');
    };
    stubStorage(t, { getItem: refuse, setItem: refuse, removeItem: refuse });
    assert.doesNotThrow(() => forgetFactoryLeftovers());
  });
  await t.test('a browser that refuses storage keeps no run open, and throws nothing — nor one where storage is not there at all', (t) => {
    const refuse = () => {
      throw new Error('SecurityError: storage is disabled');
    };
    stubStorage(t, { getItem: refuse, setItem: refuse, removeItem: refuse });
    assert.deepEqual(readFactoryOpen(), []);
    assert.doesNotThrow(() => saveFactoryOpen(['r-1']));
    assert.doesNotThrow(() => forgetFactoryOpen());
    Object.defineProperty(globalThis, 'localStorage', { get: refuse, configurable: true });
    assert.deepEqual(readFactoryOpen(), [], 'a sandboxed frame throws on reading `localStorage` itself, before any call');
    assert.doesNotThrow(() => saveFactoryOpen(['r-1']));
    assert.doesNotThrow(() => forgetFactoryOpen());
  });
});

test('besideBar, besideOpen and drawnWhole: where a canvas is fitted', async (t) => {
  await t.test(
    'a canvas is fitted beside the bar only where the bar covers it, leaves room, and the nodes fit there at the least zoom',
    () => {
      assert.deepEqual(besideBar(900, 456, 400), { left: '10%', right: '480px', y: '20%' });
      assert.equal(besideBar(900, 0, 400), null, 'the bar covers none of the canvas');
      assert.equal(besideBar(900, -20, 400), null, 'the bar is beside the canvas');
      assert.equal(besideBar(900, 900 - BESIDE_MIN + 1, 10), null, 'it leaves less than the least width');
      const room = 900 * 0.9 - (456 + 24);
      assert.notEqual(besideBar(900, 456, room / LEAST_ZOOM), null, 'nodes as wide as the room at the least zoom fit');
      assert.equal(besideBar(900, 456, room / LEAST_ZOOM + 1), null, 'nodes any wider would run off the canvas: the fit takes it whole');
    },
  );
  await t.test(
    'a step opened in the bar is fitted beside it alone only where the run is too wide to fit there and its node lies under it',
    () => {
      const padding = { left: '10%', right: '519px', y: '20%' };
      assert.deepEqual(besideOpen(862, 495, 400, { right: 380, width: 224 }), { padding, alone: false }, 'the run fits beside the bar');
      assert.deepEqual(besideOpen(862, 495, 524, { right: 383, width: 224 }), { padding, alone: true }, 'too wide: the step under the bar');
      assert.equal(besideOpen(862, 495, 524, { right: 862 - 495, width: 224 }), null, 'a node that ends where the bar begins is left');
      assert.equal(besideOpen(862, 495, 524, null), null, 'no step is open');
      assert.equal(besideOpen(862, 495, 524, { right: 383, width: 600 }), null, 'no room beside the bar even for the step');
    },
  );
  await t.test('nodes are drawn whole on a canvas only where none of their edges is past one of its own', () => {
    const box = { x: 100, y: 50, width: 400, height: 100 };
    assert.equal(drawnWhole(box, { x: 0, y: 0, zoom: 1 }, 500, 150), true, 'they end on its right and bottom edges');
    assert.equal(drawnWhole(box, { x: -101, y: 0, zoom: 1 }, 500, 150), false, 'past its left edge');
    assert.equal(drawnWhole(box, { x: 0, y: -51, zoom: 1 }, 500, 150), false, 'past its top edge');
    assert.equal(drawnWhole(box, { x: 1, y: 0, zoom: 1 }, 500, 150), false, 'past its right edge');
    assert.equal(drawnWhole(box, { x: 0, y: 1, zoom: 1 }, 500, 150), false, 'past its bottom edge');
    assert.equal(drawnWhole(box, { x: 0, y: 0, zoom: 1.01 }, 500, 150), false, 'drawn larger, past its right and bottom edges');
    assert.equal(drawnWhole(box, { x: -50, y: -25, zoom: 0.5 }, 250, 75), true, 'its offset and zoom both count');
  });
});

test("a double click's second click opens the step its first click showed, wherever it lands, and no other click opens one", () => {
  assert.equal(secondClick('review', 2), 'review');
  assert.equal(secondClick('review', 1), null, 'a single click');
  assert.equal(secondClick('review', 0), null, 'a click the keyboard made');
  assert.equal(secondClick('review', 3), null, "a triple click's third");
  assert.equal(secondClick(null, 2), null, 'its first click showed no step');
});
