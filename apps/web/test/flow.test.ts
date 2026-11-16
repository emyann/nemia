/**
 * A run's steps laid out (src/lib/flow.ts), two tables: its graph drawn small, folded around its live column (`graphOf`), and the tiles
 * of a run on the Factory opened.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import type { GraphEdge, RunGraph } from '../src/lib/api/graph.ts';
import type { EdgeStep } from '../src/lib/canvas.ts';
import { graphOf, GRAPH_SLOTS, tilesOf, TILE, UNGRAPHED, windowOf, type Flow, type StepGraphLayout } from '../src/lib/flow.ts';
import type { StepState } from '../src/lib/status.ts';

const after = (from: string, to: string): GraphEdge => ({ from, to, kind: 'after' });
const loop = (from: string, to: string, rounds = 3): GraphEdge => ({ from, to, kind: 'loop', rounds });
const graphOfEdges = (...edges: GraphEdge[]): RunGraph => ({ roots: [], edges });
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

test('tilesOf: a run opened, every step a tile', async (t) => {
  await t.test('a loop past its first round says the round it is on, under the middle of its curve, below the tiles', () => {
    const names = ['implement', 'review'];
    const graph = graphOfEdges(after('implement', 'review'), loop('review', 'implement'));
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
  await t.test('opened, every step is a tile, nothing folded or counted', () => {
    const chain = ['a', 'b', 'c', 'd', 'e', 'f'];
    const graph = graphOfEdges(
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
});

/** Each column's points, left first, top to bottom: what the graph reads as. */
const readGraph = (g: StepGraphLayout): string[][] => {
  const xs = [...new Set(g.points.map((p) => p.x))].sort((a, b) => a - b);
  return xs.map((x) =>
    g.points
      .filter((p) => p.x === x)
      .sort((a, b) => a.y - b.y)
      .map((p) => p.label),
  );
};
const lines = (g: StepGraphLayout): Record<string, string> => Object.fromEntries(g.lines.map((l) => [l.id, l.state]));
const build = ['design', 'implement', 'review', 'land'];
const buildGraph: RunGraph = {
  roots: ['design'],
  edges: [after('design', 'implement'), after('implement', 'review'), after('review', 'land'), loop('review', 'implement')],
};
const buildAt = (states: Record<string, StepState>, notes: Record<string, string> = {}) =>
  graphOf(build, buildGraph, stepsOf(states, notes), ['design', 'land'], false);

test("graphOf and windowOf: a run's steps as its workflow's graph drawn small, folded around the live column", async (t) => {
  await t.test("a chain of four is a row of points across 188 pixels, on one line, 24 high, in the layering's order", () => {
    const g = buildAt({ design: 'verified', implement: 'working', review: 'waiting', land: 'waiting' });
    assert.deepEqual(readGraph(g), [['design'], ['implement'], ['review'], ['land']]);
    assert.deepEqual(
      g.points.map((p) => p.x),
      [14, 67.3, 120.7, 174],
    );
    assert.ok(g.points.every((p) => p.y === 8));
    assert.equal(g.width, 188);
    assert.equal(g.height, 24);
    assert.equal(g.error, null);
    assert.deepEqual(lines(g), {
      'step:design->step:implement': 'running',
      'step:implement->step:review': 'to-come',
      'step:review->step:land': 'to-come',
      'loop:step:review->step:implement': 'to-come',
    });
    assert.ok(
      g.points.find((p) => p.names[0] === 'implement')!.r > g.points.find((p) => p.names[0] === 'design')!.r,
      'at work a size larger',
    );
  });
  await t.test('a loop runs under the row at right angles, its head under the step it runs again, taken only past its first round', () => {
    const first = buildAt({ design: 'verified', implement: 'working', review: 'waiting', land: 'waiting' });
    const back = first.lines.find((l) => l.loop)!;
    const m = /^M([\d.]+),([\d.]+) V([\d.]+) H([\d.]+) V([\d.]+)$/.exec(back.path);
    assert.ok(m, back.path);
    const [, x1, , bottom, x2, end] = m.map(Number);
    const implement = first.points.find((p) => p.names[0] === 'implement')!;
    const review = first.points.find((p) => p.names[0] === 'review')!;
    assert.equal(x1, review.x);
    assert.equal(x2, implement.x);
    assert.ok(bottom >= 23 && bottom <= first.height, `${bottom} under the row, inside the graph`);
    assert.ok(end > implement.y + implement.r, 'it stops short of the step');
    const tip = /L([\d.]+),([\d.]+)/.exec(back.head ?? '')!.map(Number);
    assert.equal(tip[1], implement.x);
    assert.ok(tip[2] - implement.y >= 8.8, `room under the step: its tip ${tip[2]}`);
    assert.equal(back.taken, false);
    const again = buildAt({ design: 'verified', implement: 'working', review: 'verified', land: 'waiting' }, { implement: 'round 2 of 3' });
    assert.equal(again.lines.find((l) => l.loop)!.taken, true);
  });
  await t.test('two loops get two depths under the row, and the graph grows to hold the deeper', () => {
    const g = graphOf(
      ['a', 'b', 'c'],
      graphOfEdges(after('a', 'b'), after('b', 'c'), loop('b', 'a'), loop('c', 'a')),
      stepsOf({ a: 'working', b: 'waiting', c: 'waiting' }),
      [],
      false,
    );
    const bottoms = g.lines.filter((l) => l.loop).map((l) => Number(/ V([\d.]+) H/.exec(l.path)![1]));
    assert.equal(new Set(bottoms).size, 2, bottoms.join());
    assert.ok(g.height >= Math.max(...bottoms));
  });
  await t.test('a gate is a tick 12 pixels before each gated step drawn', () => {
    const g = buildAt({ design: 'verified', implement: 'working', review: 'waiting', land: 'waiting' });
    assert.deepEqual(g.gates, [
      { step: 'design', x: 2, y: 8 },
      { step: 'land', x: 162, y: 8 },
    ]);
  });
  await t.test("a route's fork is two lanes in one column, the condition a dot, the route not taken untaken", () => {
    const names = ['intake', 'next', 'to-build', 'to-quick'];
    const graph: RunGraph = {
      roots: ['intake'],
      edges: [
        after('intake', 'next'),
        { from: 'next', to: 'to-build', kind: 'route', route: 'build' },
        { from: 'next', to: 'to-quick', kind: 'route', route: 'quick' },
      ],
      nodes: [
        { name: 'intake', kind: 'step' },
        { name: 'next', kind: 'condition' },
        { name: 'to-build', kind: 'workflow', workflow: 'build' },
        { name: 'to-quick', kind: 'workflow', workflow: 'quick' },
      ],
    };
    const g = graphOf(
      names,
      graph,
      stepsOf({ intake: 'verified', next: 'verified', 'to-build': 'sent', 'to-quick': 'skipped' }),
      [],
      false,
    );
    assert.deepEqual(readGraph(g), [['intake'], ['next'], ['to-build', 'to-quick']]);
    const [top, under] = g.points.filter((p) => p.label.startsWith('to-'));
    assert.notEqual(top.y, under.y);
    assert.deepEqual(
      g.points.filter((p) => p.route).map((p) => p.label),
      ['next'],
    );
    assert.equal(g.lines.find((l) => l.to === 'step:to-quick')!.untaken, true);
    assert.equal(g.lines.find((l) => l.to === 'step:to-build')!.untaken, false);
    assert.equal(g.height, 24, 'two lanes fit the row');
  });
  await t.test('nine steps fold to at most six points around the live column, a fold counting the rest', () => {
    const chain = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h', 'i'];
    const graph = graphOfEdges(...chain.slice(1).map((name, i) => after(chain[i], name)));
    const g = graphOf(
      chain,
      graph,
      stepsOf(Object.fromEntries(chain.map((name, i) => [name, i < 5 ? 'verified' : i === 5 ? 'working' : 'waiting']))),
      [],
      false,
    );
    assert.ok(g.points.length <= GRAPH_SLOTS, `${g.points.length}`);
    assert.deepEqual(readGraph(g), [['4 done'], ['e'], ['f'], ['g'], ['h'], ['i']]);
    assert.deepEqual(g.points[0].names, ['a', 'b', 'c', 'd']);
    assert.equal(g.points[0].kind, 'fold');
  });
  await t.test('a column of five shows two and a point counting the rest, the live step never among them', () => {
    const lanes = ['l1', 'l2', 'l3', 'l4', 'l5'];
    const graph = graphOfEdges(...lanes.map((l) => after('plan', l)), ...lanes.map((l) => after(l, 'merge')));
    const states = {
      plan: 'verified',
      l1: 'verified',
      l2: 'verified',
      l3: 'verified',
      l4: 'working',
      l5: 'waiting',
      merge: 'waiting',
    } as const;
    const g = graphOf(['plan', ...lanes, 'merge'], graph, stepsOf(states), [], false);
    assert.deepEqual(readGraph(g), [['plan'], ['l1', 'l4', '+3'], ['merge']]);
    assert.equal(g.height, 24 + 13, 'a lane past two takes 13 pixels more');
  });
  await t.test('a run listed without its graph, by an api older than the board: its steps in its order, no lines, and what to do', () => {
    const g = graphOf(
      ['implement', 'review'],
      undefined as unknown as RunGraph,
      stepsOf({ implement: 'working', review: 'waiting' }),
      [],
      false,
    );
    assert.deepEqual(readGraph(g), [['implement'], ['review']]);
    assert.equal(g.lines.length, 0);
    assert.equal(g.error, UNGRAPHED);
    assert.equal(tilesOf(['implement'], { roots: [] } as unknown as RunGraph, stepsOf({ implement: 'working' }), false).error, UNGRAPHED);
  });
  await t.test("a cycle in the steps' after is the run's order, no lines, and says why", () => {
    const g = graphOf(['a', 'b'], graphOfEdges(after('a', 'b'), after('b', 'a')), stepsOf({ a: 'waiting', b: 'waiting' }), [], false);
    assert.deepEqual(readGraph(g), [['a'], ['b']]);
    assert.equal(g.lines.length, 0);
    assert.match(g.error ?? '', /cycle among a, b/);
  });
  await t.test('a run called off has nothing live', () => {
    const g = buildAt({ design: 'verified', implement: 'cancelled', review: 'cancelled', land: 'cancelled' });
    const off = graphOf(build, buildGraph, stepsOf({ design: 'verified', implement: 'working' }), [], true);
    assert.ok(off.points.every((p) => !p.live));
    assert.ok(g.points.every((p) => !p.live));
  });
  await t.test('the window: six slots around the live column, the rest folded into a point that counts them', () => {
    assert.deepEqual(windowOf(5, 2), { start: 0, end: 4 });
    assert.deepEqual(windowOf(9, 5), { start: 4, end: 8 });
    assert.deepEqual(windowOf(6, 3, 4), { start: 2, end: 3 });
    for (let n = 7; n < 12; n++) {
      for (let live = 0; live < n; live++) {
        const { start, end } = windowOf(n, live);
        assert.ok(start !== 1 && end !== n - 2, `never a fold of a single column: ${n} columns, live ${live}: ${start}..${end}`);
        assert.ok(start <= live && live <= end, `${n} columns, live ${live}: ${start}..${end}`);
        assert.ok((start > 0 ? 1 : 0) + (end - start + 1) + (end < n - 1 ? 1 : 0) <= GRAPH_SLOTS);
      }
    }
  });
});
