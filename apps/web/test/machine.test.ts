/**
 * A state machine's drawing (`drawMachine`, src/lib/machine.ts): every edge in exactly one place, edges between the same two states drawn
 * as one, an edge back to its own state written on its box, and nothing laid over anything else.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import type { MachineEdge } from '../src/lib/api/machines.ts';
import {
  byAction,
  drawMachine,
  eventOf,
  HEAD_HEIGHT,
  LINE_HEIGHT,
  PAD_Y,
  pathThrough,
  stateSize,
  type Drawing,
} from '../src/lib/machine.ts';

/** A machine with what the drawing gathers: edges back to a state, two states joined by several edges, guards, a loop back, a root. */
const MACHINE = {
  initial: 'idle',
  states: ['idle', 'busy', 'held', 'done', 'failed'],
  final: ['done', 'failed'],
  edges: [
    { from: 'idle', event: 'GO', to: 'busy', action: 'start' },
    { from: 'idle', event: 'WAIT', to: 'idle', action: 'nothing' },
    { from: 'busy', event: 'TICK', to: 'busy', action: 'nothing' },
    { from: 'busy', event: 'LATE', guard: 'live', to: 'busy', action: 'stop' },
    { from: 'busy', event: 'ENDED', guard: 'ok', to: 'done', action: 'settle' },
    { from: 'busy', event: 'CLOSED', guard: 'ok', to: 'done', action: 'settle' },
    { from: 'busy', event: 'ENDED', to: 'failed', action: 'settle' },
    { from: 'busy', event: 'ASKED', to: 'held', action: 'record' },
    { from: 'held', event: 'ANSWERED', to: 'busy', action: 'resume' },
    { from: 'held', event: 'GIVEN_UP', to: 'failed', action: 'settle' },
  ] satisfies MachineEdge[],
};

type Box = { name: string; x: number; y: number; width: number; height: number };

/** Every box the drawing puts down, states and labels, by their top-left corners. */
const boxesOf = (drawing: Drawing): Box[] => [
  ...drawing.states.map((s) => ({ name: s.id, x: s.x, y: s.y, width: s.width, height: s.height })),
  ...drawing.routes.map((r) => ({
    name: `label ${r.id}`,
    x: r.label.x - r.label.width / 2,
    y: r.label.y - r.label.height / 2,
    width: r.label.width,
    height: r.label.height,
  })),
];

const overlaps = (boxes: Box[]): string[] =>
  boxes.flatMap((a, i) =>
    boxes
      .slice(i + 1)
      .filter((b) => a.x < b.x + b.width && b.x < a.x + a.width && a.y < b.y + b.height && b.y < a.y + a.height)
      .map((b) => `${a.name} and ${b.name}`),
  );

/** Where each edge is written: `from->to` for a route, `from` for a box, with its event and its action. */
const written = (drawing: Drawing): string[] => [
  ...drawing.routes.flatMap((r) => r.edges.flatMap((g) => g.events.map((e) => `${r.from}->${r.to} ${e} / ${g.action}`))),
  ...drawing.states.flatMap((s) => s.stays.flatMap((g) => g.events.map((e) => `${s.id} ${e} / ${g.action}`))),
];

test('every edge is written once, on its route or, back to its own state, on its box', () => {
  const drawing = drawMachine(MACHINE);
  const expected = MACHINE.edges.map((e) => `${e.from === e.to ? e.from : `${e.from}->${e.to}`} ${eventOf(e)} / ${e.action}`);
  assert.deepEqual(written(drawing).sort(), expected.sort());
});

test('the edges between the same two states are one route, listed by action; an edge back to its state is no route', () => {
  const drawing = drawMachine(MACHINE);
  assert.deepEqual(
    drawing.routes.map((r) => r.id),
    ['idle->busy', 'busy->done', 'busy->failed', 'busy->held', 'held->busy', 'held->failed'],
  );
  assert.deepEqual(drawing.routes.find((r) => r.id === 'busy->done')!.edges, [{ action: 'settle', events: ['ENDED [ok]', 'CLOSED [ok]'] }]);
  assert.deepEqual(drawing.states.find((s) => s.id === 'busy')!.stays, [
    { action: 'nothing', events: ['TICK'] },
    { action: 'stop', events: ['LATE [live]'] },
  ]);
  assert.deepEqual(drawing.states.find((s) => s.id === 'done')!.stays, []);
});

test('nothing is laid over anything else: no two boxes meet, whether states or labels, and all lie inside the drawing', () => {
  const drawing = drawMachine(MACHINE);
  const boxes = boxesOf(drawing);
  assert.equal(boxes.length, MACHINE.states.length + 6);
  assert.deepEqual(overlaps(boxes), []);
  for (const box of boxes) {
    assert.ok(box.x >= 0 && box.y >= 0 && box.x + box.width <= drawing.width && box.y + box.height <= drawing.height, box.name);
  }
  assert.deepEqual(
    overlaps([
      { name: 'a', x: 0, y: 0, width: 10, height: 10 },
      { name: 'b', x: 5, y: 5, width: 10, height: 10 },
    ]),
    ['a and b'],
    'REFUSED: two boxes that meet',
  );
});

test('read top to bottom: the first state above every other, and each route leaves its state and reaches the next', () => {
  const drawing = drawMachine(MACHINE);
  const at = new Map(drawing.states.map((s) => [s.id, s]));
  for (const state of drawing.states.filter((s) => s.id !== 'idle')) assert.ok(at.get('idle')!.y < state.y, state.id);
  for (const route of drawing.routes) {
    const [first, last] = [route.points[0], route.points[route.points.length - 1]];
    const inside = (p: { x: number; y: number }, s: Box) =>
      p.x >= s.x - 1 && p.x <= s.x + s.width + 1 && p.y >= s.y - 1 && p.y <= s.y + s.height + 1;
    assert.ok(inside(first, { name: route.from, ...at.get(route.from)! }), `${route.id} leaves ${route.from}`);
    assert.ok(inside(last, { name: route.to, ...at.get(route.to)! }), `${route.id} reaches ${route.to}`);
  }
});

test('the first state and the final ones are marked, and only they', () => {
  const drawing = drawMachine(MACHINE);
  assert.deepEqual(
    drawing.states.filter((s) => s.initial).map((s) => s.id),
    ['idle'],
  );
  assert.deepEqual(
    drawing.states.filter((s) => s.final).map((s) => s.id),
    ['done', 'failed'],
  );
});

test('a state an edge names that the graph does not list is drawn, so no edge is lost', () => {
  const drawing = drawMachine({ ...MACHINE, states: ['idle'] });
  assert.deepEqual(drawing.states.map((s) => s.id).sort(), [...MACHINE.states].sort());
  assert.equal(written(drawing).length, MACHINE.edges.length);
});

test('a box and a label are sized for their lines: a line per event and one per action, as wide as the longest', () => {
  assert.equal(stateSize([]).height, HEAD_HEIGHT);
  assert.equal(stateSize(byAction(MACHINE.edges.slice(2, 4))).height, HEAD_HEIGHT + LINE_HEIGHT * 4 + PAD_Y, 'two events, two actions');
  const wide = stateSize([{ action: 'x', events: ['A_VERY_LONG_EVENT_NAME [with_a_guard]'] }]);
  assert.ok(wide.width > stateSize([]).width, 'a long event widens its box');
});

test('a route is drawn through its points, straight at its ends and bending at each point between', () => {
  assert.equal(pathThrough([]), '');
  assert.equal(
    pathThrough([
      { x: 0, y: 0 },
      { x: 10, y: 0 },
    ]),
    'M 0 0 L 10 0',
  );
  assert.equal(
    pathThrough([
      { x: 0, y: 0 },
      { x: 10, y: 10 },
      { x: 20, y: 30 },
    ]),
    'M 0 0 Q 10 10 15 20 L 20 30',
  );
});
