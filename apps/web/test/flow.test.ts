import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import type { GraphEdge, RunGraph } from '../src/lib/api.ts';
import type { EdgeStep } from '../src/lib/canvas.ts';
import { railOf, RAIL_WIDTH, tilesOf, TILE, UNGRAPHED, windowOf, type Flow } from '../src/lib/flow.ts';
import { CHAR_WIDTH } from '../src/lib/machine.ts';
import type { StepState } from '../src/lib/status.ts';

const after = (from: string, to: string): GraphEdge => ({ from, to, kind: 'after' });
const loop = (from: string, to: string, rounds = 3): GraphEdge => ({ from, to, kind: 'loop', rounds });
const graphOf = (...edges: GraphEdge[]): RunGraph => ({ roots: [], edges });
const stepsOf = (states: Record<string, StepState>, notes: Record<string, string> = {}, due: string[] = []): EdgeStep[] =>
  Object.entries(states).map(([name, state]) => ({ name, state, note: notes[name] ?? null, roundDue: due.includes(name) }));

/** Each column's pills, left first, top to bottom: what the rail reads as. */
const read = (flow: Flow): string[][] => {
  const xs = [...new Set(flow.pills.map((p) => p.x))].sort((a, b) => a - b);
  return xs.map((x) =>
    flow.pills
      .filter((p) => p.x === x)
      .sort((a, b) => a.y - b.y)
      .map((p) => p.label),
  );
};
const arrows = (flow: Flow): Record<string, string> => Object.fromEntries(flow.arrows.map((a) => [a.id, a.state]));

test('a chain is a row of pills, one arrow between each, done, running and to come', () => {
  const names = ['review', 'implement', 'ship'];
  const flow = railOf(
    names,
    graphOf(after('review', 'ship'), after('implement', 'review')),
    stepsOf({ review: 'working', implement: 'verified', ship: 'waiting' }),
    false,
  );
  assert.deepEqual(
    read(flow),
    [['implement'], ['review'], ['ship']],
    "the run's order is not the chain's: the layering puts each after the step it waits on",
  );
  assert.deepEqual(arrows(flow), { 'step:implement->step:review': 'running', 'step:review->step:ship': 'to-come' });
  assert.deepEqual(
    flow.pills.map((p) => [p.label, p.live]),
    [
      ['implement', false],
      ['review', true],
      ['ship', false],
    ],
  );
  assert.equal(flow.error, null);
  assert.equal(flow.height, 20, 'a single row, with no arc over it or loop under it: no room kept for either');
  assert.ok(flow.width <= RAIL_WIDTH, `${flow.width}`);
});

test("a fan-out is two lanes, and an edge that skips a column arcs over the row: the Factory e2e's fake run", () => {
  const names = ['implement', 'review', 'respond', 'tokens', 'theme'];
  const graph = graphOf(after('implement', 'review'), after('review', 'respond'), after('implement', 'respond'), after('tokens', 'theme'));
  const flow = railOf(
    names,
    graph,
    stepsOf({ implement: 'blocked', review: 'waiting', respond: 'waiting', tokens: 'unverified', theme: 'failed-check' }),
    false,
  );
  assert.deepEqual(read(flow), [['implement', 'tokens'], ['review', 'theme'], ['respond']]);
  const skip = flow.arrows.find((a) => a.id === 'step:implement->step:respond')!;
  const side = flow.arrows.find((a) => a.id === 'step:implement->step:review')!;
  const controls = (path: string) => [...path.matchAll(/(-?[\d.]+),(-?[\d.]+)/g)].map((m) => Number(m[2]));
  const top = Math.min(...flow.pills.map((p) => p.y));
  assert.ok(
    controls(skip.path)
      .slice(1, 3)
      .every((y) => y < top),
    `over: its control points above every pill: ${skip.path}`,
  );
  assert.ok(!controls(side.path).some((y) => y < top), `beside: level with its ends: ${side.path}`);
  assert.ok(top >= 12, 'room over the row for the arc');
});

test('a loop is an arrow under the row, from the looping step back, running while its round is due', () => {
  const names = ['implement', 'review'];
  const graph = graphOf(after('implement', 'review'), loop('review', 'implement'));
  const due = railOf(
    names,
    graph,
    stepsOf({ implement: 'working', review: 'verified' }, { review: 'round 2 of 3 due — asked again' }, ['review']),
    false,
  );
  const back = due.arrows.find((a) => a.loop)!;
  assert.equal(back.id, 'loop:step:review->step:implement');
  assert.equal(back.state, 'running');
  const bottom = Math.max(...due.pills.map((p) => p.y + p.height));
  const ys = [...back.path.matchAll(/(-?[\d.]+),(-?[\d.]+)/g)].map((m) => Number(m[2]));
  assert.ok(
    ys.slice(1, 3).every((y) => y > bottom),
    back.path,
  );
  assert.ok(due.height > bottom, 'room under the row for the loop');
  const still = railOf(names, graph, stepsOf({ implement: 'verified', review: 'working' }), false);
  assert.equal(still.arrows.find((a) => a.loop)!.state, 'to-come');
});

test('a loop past its first round says the round it is on, under the middle of its curve, below the tiles', () => {
  const names = ['implement', 'review'];
  const graph = graphOf(after('implement', 'review'), loop('review', 'implement'));
  const tiles = tilesOf(
    names,
    graph,
    stepsOf({ implement: 'verified', review: 'working' }, { implement: 'round 2 of 3', review: 'round 2 of 3' }),
    false,
  );
  const back = tiles.arrows.find((a) => a.loop)!;
  assert.equal(back.round?.text, 'round 2 of 3');
  const [a, b] = tiles.pills;
  assert.equal(back.round.x, (a.x + a.width / 2 + b.x + b.width / 2) / 2);
  assert.ok(back.round.y > Math.max(...tiles.pills.map((p) => p.y + p.height)), 'under the tiles, where the curve is');
  const first = tilesOf(names, graph, stepsOf({ implement: 'working', review: 'waiting' }, { implement: 'round 1 of 3' }), false);
  assert.equal(first.arrows.find((a) => a.loop)!.round, null, 'on its first round, a loop says nothing of it');
  assert.ok(
    tiles.arrows.filter((a) => !a.loop).every((a) => a.round === null),
    'an `after` arrow never says a round',
  );
});

test('a run listed without its graph, by an api older than the board: its steps in its order, no arrows, and what to do', () => {
  const flow = railOf(
    ['implement', 'review'],
    undefined as unknown as RunGraph,
    stepsOf({ implement: 'working', review: 'waiting' }),
    false,
  );
  assert.deepEqual(read(flow), [['implement'], ['review']]);
  assert.deepEqual(flow.arrows, []);
  assert.equal(flow.error, UNGRAPHED);
  assert.match(flow.error, /restart the api/);
  assert.equal(tilesOf(['implement'], { roots: [] } as unknown as RunGraph, stepsOf({ implement: 'working' }), false).error, UNGRAPHED);
});

test('the window: four slots around the live column, the rest folded into a pill that counts them', () => {
  assert.deepEqual(windowOf(3, 2), { start: 0, end: 2 });
  assert.deepEqual(windowOf(6, 3), { start: 2, end: 3 });
  assert.deepEqual(windowOf(6, 5), { start: 3, end: 5 });
  assert.deepEqual(windowOf(6, 0), { start: 0, end: 2 });
  for (let n = 5; n < 9; n++) {
    for (let live = 0; live < n; live++) {
      const { start, end } = windowOf(n, live);
      assert.ok(start !== 1 && end !== n - 2, `never a fold of a single column: ${n} columns, live ${live}: ${start}..${end}`);
      assert.ok(start <= live && live <= end, `${n} columns, live ${live}: ${start}..${end}`);
      assert.ok((start > 0 ? 1 : 0) + (end - start + 1) + (end < n - 1 ? 1 : 0) <= 4);
    }
  }
});

test('six columns fold around the one the run is at, and the arrows into a fold are one — the run listing them backwards, so a window taken off the order and not the layering fails', () => {
  const chain = ['a', 'b', 'c', 'd', 'e', 'f'];
  const names = [...chain].reverse();
  const graph = graphOf(...chain.slice(1).map((name, i) => after(chain[i], name)));
  const states = (at: number) =>
    stepsOf(Object.fromEntries(chain.map((name, i) => [name, i < at ? 'verified' : i === at ? 'working' : 'waiting'])));
  const middle = railOf(names, graph, states(3), false);
  assert.deepEqual(read(middle), [['2 done'], ['c'], ['d'], ['2 steps']]);
  assert.deepEqual(arrows(middle), { 'fold:a->step:c': 'done', 'step:c->step:d': 'running', 'step:d->fold:e': 'to-come' });
  assert.deepEqual(middle.pills.find((p) => p.kind === 'fold' && p.done)!.names, ['a', 'b']);
  assert.deepEqual(read(railOf(names, graph, states(5), false)), [['3 done'], ['d'], ['e'], ['f']]);
  assert.deepEqual(read(railOf(names, graph, states(0), false)), [['a'], ['b'], ['c'], ['3 steps']]);
  assert.deepEqual(
    read(railOf(names, graph, states(6), false)),
    [['3 done'], ['d'], ['e'], ['f']],
    'nothing live and all done: the last column',
  );
  assert.ok(middle.width <= RAIL_WIDTH, `four slots across the card, arrows between them: ${middle.width}`);
});

test('a column of five steps shows two and a pill counting the rest, the live step never among them', () => {
  const lanes = ['l1', 'l2', 'l3', 'l4', 'l5'];
  const names = ['plan', ...lanes, 'merge'];
  const graph = graphOf(...lanes.map((l) => after('plan', l)), ...lanes.map((l) => after(l, 'merge')));
  const states = {
    plan: 'verified',
    l1: 'verified',
    l2: 'verified',
    l3: 'verified',
    l4: 'working',
    l5: 'waiting',
    merge: 'waiting',
  } as const;
  const flow = railOf(names, graph, stepsOf(states), false);
  assert.deepEqual(read(flow), [['plan'], ['l1', 'l4', '+3'], ['merge']]);
  assert.deepEqual(flow.pills.find((p) => p.kind === 'more')!.names, ['l2', 'l3', 'l5']);
  assert.deepEqual(
    arrows(flow),
    {
      'step:plan->step:l1': 'done',
      'step:plan->more:l2': 'to-come',
      'step:plan->step:l4': 'running',
      'step:l1->step:merge': 'to-come',
      'more:l2->step:merge': 'to-come',
      'step:l4->step:merge': 'to-come',
    },
    'every edge through a lane counted is one arrow into the pill, and one out: to come while one of them, l5, is',
  );
  assert.equal(flow.height, 3 * 20 + 2 * 6, 'three lanes, however many steps');
});

test("a cycle in the steps' after is the run's order, no arrows, and says why", () => {
  const flow = railOf(['a', 'b'], graphOf(after('a', 'b'), after('b', 'a')), stepsOf({ a: 'waiting', b: 'waiting' }), false);
  assert.deepEqual(read(flow), [['a'], ['b']]);
  assert.deepEqual(flow.arrows, []);
  assert.match(flow.error ?? '', /cycle among a, b/);
});

test('a run called off has nothing live, and the rail starts where nothing is done', () => {
  const chain = ['a', 'b', 'c', 'd', 'e', 'f'];
  const graph = graphOf(...chain.slice(1).map((name, i) => after(chain[i], name)));
  const flow = railOf(
    chain,
    graph,
    stepsOf({ a: 'verified', b: 'verified', c: 'verified', d: 'blocked', e: 'cancelled', f: 'cancelled' }),
    true,
  );
  assert.ok(flow.pills.every((p) => !p.live));
  assert.deepEqual(read(flow), [['2 done'], ['c'], ['d'], ['2 steps']]);
});

test('opened, every step is a tile, nothing folded or counted', () => {
  const chain = ['a', 'b', 'c', 'd', 'e', 'f'];
  const graph = graphOf(
    ...chain.slice(1).map((name, i) => after(chain[i], name)),
    after('a', 'x'),
    after('a', 'y'),
    after('a', 'z'),
    after('a', 'w'),
  );
  const names = [...chain, 'x', 'y', 'z', 'w'];
  const flow = tilesOf(names, graph, stepsOf(Object.fromEntries(names.map((n) => [n, 'waiting' as const]))), false);
  assert.deepEqual(read(flow), [['a'], ['b', 'x', 'y', 'z', 'w'], ['c'], ['d'], ['e'], ['f']]);
  assert.ok(flow.pills.every((p) => p.kind === 'step' && p.width === TILE.width && p.height === TILE.height));
  assert.equal(flow.width, 6 * TILE.width + 5 * TILE.gap);
  assert.equal(flow.height, 5 * TILE.height + 4 * TILE.lane);
});

/** What a pill keeps of its width from its name: its padding (`px-1`, four pixels a side) and its border, a pixel a side. */
const PILL_EDGES = 10;

test("REFUSED: a four-column rail whose pills cannot hold a nine-letter name: the pill's room is its width less its padding and border", () => {
  const chain = ['design', 'implement', 'review', 'land'];
  const flow = railOf(
    chain,
    graphOf(...chain.slice(1).map((name, i) => after(chain[i] ?? name, name))),
    stepsOf({ design: 'working' }),
    false,
  );
  assert.deepEqual(read(flow), [['design'], ['implement'], ['review'], ['land']]);
  for (const pill of flow.pills)
    assert.ok(pill.width - PILL_EDGES >= 'implement'.length * CHAR_WIDTH, `${pill.label}: ${pill.width} wide holds no nine letters`);
  const rail = fs.readFileSync(path.join(import.meta.dirname, '..', 'src', 'components', 'StepRail.tsx'), 'utf8');
  assert.match(
    rail,
    /rounded-full\s+px-1\s+font-mono\s+text-body-small/,
    'the pill pads its name by four pixels a side, in mono at the small body role',
  );
});
