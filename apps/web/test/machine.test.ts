/**
 * A state machine's drawing (`drawMachine`, src/lib/machine.ts): every edge and every verb in exactly one place, edges and verbs between
 * the same two states drawn as one, an edge back to its own state written on its box, a route only a person's verb takes dashed, and
 * nothing laid over anything else.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import type { MachineEdge, MachineVerb } from '../src/lib/api/machines.ts';
import {
  byAction,
  drawMachine,
  END_INSET,
  eventOf,
  HEAD_HEIGHT,
  labelSize,
  LINE_HEIGHT,
  PAD_Y,
  pathOf,
  stateFacts,
  stateSize,
  verbOf,
  type Drawing,
} from '../src/lib/machine.ts';

/**
 * A machine with what the drawing gathers: edges back to a state, two states joined by several edges, guards, a loop back, a root, and
 * a person's verb taken from two states: from `idle`, where no edge leads to `failed`, and from `busy`, where one does.
 */
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
  verbs: [
    { verb: 'cancel', entry: 'cancelled', by: 'person', from: ['idle', 'busy'], to: 'failed', guard: 'open' },
  ] satisfies MachineVerb[],
};

/** The task's lifecycle as the api served it when its drawing was written: a machine the size of the real one, held as it was. */
const LIFECYCLE = JSON.parse(fs.readFileSync(new URL('./fixtures/lifecycle-graph.json', import.meta.url), 'utf8')) as typeof MACHINE;

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

/** Where each edge and verb is written: `from->to` for a route, `from` for a box, with its event and its action, or the verb's line. */
const written = (drawing: Drawing): string[] => [
  ...drawing.routes.flatMap((r) => r.edges.flatMap((g) => g.events.map((e) => `${r.from}->${r.to} ${e} / ${g.action}`))),
  ...drawing.routes.flatMap((r) => r.verbs.map((v) => `${r.from}->${r.to} ${v}`)),
  ...drawing.states.flatMap((s) => s.stays.flatMap((g) => g.events.map((e) => `${s.id} ${e} / ${g.action}`))),
];

/** Points along an SVG path of absolute `M`, `L`, `Q` and `C` commands, every segment cut in `steps`: where its line is drawn. */
function along(path: string, steps = 40): { x: number; y: number }[] {
  const tokens = path.match(/[MLQC]|-?[\d.]+(?:e-?\d+)?/g) ?? [];
  const points: { x: number; y: number }[] = [];
  let at = { x: 0, y: 0 };
  for (let i = 0; i < tokens.length;) {
    const command = tokens[i++];
    const count = { M: 1, L: 1, Q: 2, C: 3 }[command] ?? 0;
    assert.ok(count, `a command along() reads, not ${command}`);
    const given = Array.from({ length: count }, () => ({ x: Number(tokens[i++]), y: Number(tokens[i++]) }));
    const ends = [at, ...given];
    for (let step = command === 'M' ? steps : 1; step <= steps; step++) {
      const t = step / steps;
      const blend = (key: 'x' | 'y') =>
        ends.reduce((sum, p, k) => sum + p[key] * binomial(ends.length - 1, k) * (1 - t) ** (ends.length - 1 - k) * t ** k, 0);
      points.push({ x: blend('x'), y: blend('y') });
    }
    at = given[given.length - 1];
  }
  return points;
}

const binomial = (n: number, k: number): number => (k === 0 || k === n ? 1 : binomial(n - 1, k - 1) + binomial(n - 1, k));

/** Each route whose line enters a box other than its own label, by a pixel or more: a state, or another route's label. */
const crossings = (drawing: Drawing): string[] =>
  drawing.routes.flatMap((route) =>
    boxesOf(drawing)
      .filter((box) => box.name !== `label ${route.id}`)
      .filter((box) =>
        along(route.path).some((p) => p.x > box.x + 1 && p.x < box.x + box.width - 1 && p.y > box.y + 1 && p.y < box.y + box.height - 1),
      )
      .map((box) => `${route.id} through ${box.name}`),
  );

test('drawMachine: every edge and verb written in one place, the pairs joined as one route, the ends marked, the boxes sized', async (t) => {
  await t.test(
    'every edge is written once, on its route or, back to its own state, on its box; every verb once on each route it takes',
    () => {
      const drawing = drawMachine(MACHINE);
      const expected = [
        ...MACHINE.edges.map((e) => `${e.from === e.to ? e.from : `${e.from}->${e.to}`} ${eventOf(e)} / ${e.action}`),
        ...MACHINE.verbs.flatMap((v) => v.from.map((from) => `${from}->${v.to} ${verbOf(v)}`)),
      ];
      assert.deepEqual(written(drawing).sort(), expected.sort());
      assert.equal(verbOf(MACHINE.verbs[0]), 'cancel [open]', 'a verb is written with its guard');
    },
  );
  await t.test("a pair only a person's verb joins is one dashed route; a pair an edge joins too is one solid route listing both", () => {
    const drawing = drawMachine(MACHINE);
    const route = (id: string) => drawing.routes.find((r) => r.id === id) ?? assert.fail(`no route ${id}`);
    assert.deepEqual(
      { ...route('idle->failed'), path: '', label: null },
      { id: 'idle->failed', from: 'idle', to: 'failed', edges: [], verbs: ['cancel [open]'], dashed: true, path: '', label: null },
    );
    assert.equal(route('busy->failed').dashed, false, 'an edge joins it: solid');
    assert.deepEqual(route('busy->failed').edges, [{ action: 'settle', events: ['ENDED'] }]);
    assert.deepEqual(route('busy->failed').verbs, ['cancel [open]']);
    assert.equal(route('idle->busy').dashed, false);
    assert.deepEqual(route('idle->busy').verbs, []);
    assert.deepEqual(
      drawing.routes.filter((r) => r.dashed).map((r) => r.id),
      ['idle->failed'],
    );
  });
  await t.test('the edges between the same two states are one route, listed by action; an edge back to its state is no route', () => {
    const drawing = drawMachine(MACHINE);
    assert.deepEqual(
      drawing.routes.map((r) => r.id),
      ['idle->busy', 'busy->done', 'busy->failed', 'busy->held', 'held->busy', 'held->failed', 'idle->failed'],
    );
    assert.deepEqual(drawing.routes.find((r) => r.id === 'busy->done')!.edges, [
      { action: 'settle', events: ['ENDED [ok]', 'CLOSED [ok]'] },
    ]);
    assert.deepEqual(drawing.states.find((s) => s.id === 'busy')!.stays, [
      { action: 'nothing', events: ['TICK'] },
      { action: 'stop', events: ['LATE [live]'] },
    ]);
    assert.deepEqual(drawing.states.find((s) => s.id === 'done')!.stays, []);
  });
  await t.test('the first state and the final ones are marked, and only they', () => {
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
  await t.test('a state an edge or a verb names that the graph does not list is drawn, so no edge and no verb is lost', () => {
    const drawing = drawMachine({ ...MACHINE, states: ['idle'] });
    assert.deepEqual(drawing.states.map((s) => s.id).sort(), [...MACHINE.states].sort());
    assert.equal(written(drawing).length, MACHINE.edges.length + 2);
    const verbs = [{ ...MACHINE.verbs[0], from: ['idle'], to: 'gone' }];
    const stopped = drawMachine({ ...MACHINE, verbs });
    assert.ok(
      stopped.states.some((s) => s.id === 'gone'),
      'the state only a verb leads to',
    );
    assert.deepEqual(stopped.routes.find((r) => r.id === 'idle->gone')?.verbs, ['cancel [open]']);
  });
  await t.test(
    'a box and a label are sized for their lines: a line per event, one per action and one per verb, as wide as the longest',
    () => {
      assert.equal(stateSize([]).height, HEAD_HEIGHT);
      assert.equal(stateSize(byAction(MACHINE.edges.slice(2, 4))).height, HEAD_HEIGHT + LINE_HEIGHT * 4 + PAD_Y, 'two events, two actions');
      const wide = stateSize([{ action: 'x', events: ['A_VERY_LONG_EVENT_NAME [with_a_guard]'] }]);
      assert.ok(wide.width > stateSize([]).width, 'a long event widens its box');
      assert.equal(labelSize([], ['cancel [open]']).height, LINE_HEIGHT + PAD_Y, 'a verb alone is a line');
      assert.equal(labelSize(byAction(MACHINE.edges.slice(6, 7)), ['cancel [open]']).height, LINE_HEIGHT * 3 + PAD_Y, 'an edge and a verb');
      assert.ok(labelSize([], ['a_very_long_verb [with_a_guard]']).width > labelSize([], ['cancel [open]']).width, 'a long verb widens it');
    },
  );
  await t.test('a route is drawn along its legs, straight along each and curving upright from one to the next, down or back up', () => {
    assert.equal(pathOf([]), '');
    assert.equal(pathOf([{ x: 5, enter: 0, leave: 10 }]), 'M 5 0 L 5 10');
    assert.equal(
      pathOf([
        { x: 0, enter: 0, leave: 10 },
        { x: 20, enter: 30, leave: 30 },
        { x: 20, enter: 50, leave: 60 },
      ]),
      'M 0 0 L 0 10 C 0 20 20 20 20 30 C 20 40 20 40 20 50 L 20 60',
    );
    assert.equal(
      pathOf([
        { x: 20, enter: 60, leave: 50 },
        { x: 0, enter: 10, leave: 0 },
      ]),
      'M 20 60 L 20 50 C 20 30 0 30 0 10 L 0 0',
    );
  });
});

test('drawMachine: nothing laid over anything, no route through a state, read top to bottom', async (t) => {
  await t.test('nothing is laid over anything else: no two boxes meet, whether states or labels, and all lie inside the drawing', () => {
    const drawing = drawMachine(MACHINE);
    const boxes = boxesOf(drawing);
    assert.equal(boxes.length, MACHINE.states.length + 7);
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
  await t.test("no route's line runs through a state or behind another route's label, on the machine the size of the lifecycle too", () => {
    assert.deepEqual(crossings(drawMachine(MACHINE)), []);
    assert.deepEqual(crossings(drawMachine(LIFECYCLE)), []);
    const drawing = drawMachine(MACHINE);
    const [route, other] = drawing.routes;
    const { x, y, width } = other.label;
    const across = `M ${x - width / 2 - 2} ${y} L ${x + width / 2 + 2} ${y}`;
    assert.deepEqual(
      crossings({ ...drawing, routes: [{ ...route, path: across }, ...drawing.routes.slice(1)] }),
      [`${route.id} through label ${other.id}`],
      'REFUSED: a line drawn straight across another label',
    );
  });
  await t.test(
    'read top to bottom: the first state above every other, and each route leaves its state and comes straight into the next',
    () => {
      for (const machine of [MACHINE, LIFECYCLE]) {
        const drawing = drawMachine(machine);
        const at = new Map(drawing.states.map((s) => [s.id, s]));
        for (const state of drawing.states.filter((s) => s.id !== machine.initial))
          assert.ok(at.get(machine.initial)!.y < state.y, state.id);
        for (const route of drawing.routes) {
          const line = along(route.path);
          const [first, last, before] = [line[0], line[line.length - 1], line[line.length - 2]];
          const [from, to] = [at.get(route.from)!, at.get(route.to)!];
          const down = to.y > from.y;
          const across = (x: number, box: typeof from) => x >= box.x + END_INSET && x <= box.x + box.width - END_INSET;
          assert.ok(first.y === (down ? from.y + from.height : from.y) && across(first.x, from), `${route.id} leaves ${route.from}`);
          assert.ok(last.y === (down ? to.y : to.y + to.height) && across(last.x, to), `${route.id} reaches ${route.to}`);
          assert.ok(
            down === before.y < last.y && Math.abs(before.x - last.x) < 0.5,
            `${route.id} comes upright into ${route.to}, as its arrow points`,
          );
        }
      }
    },
  );
});

test("stateFacts: a state's facts are what its drawing draws", async (t) => {
  await t.test(
    "a state's facts are what its drawing draws: its kind, the edges on its box, and each route that leaves it, on the lifecycle too",
    () => {
      for (const machine of [MACHINE, LIFECYCLE]) {
        const drawing = drawMachine(machine);
        for (const box of drawing.states) {
          const facts = stateFacts(machine, box.id) ?? assert.fail(`no facts for ${box.id}`);
          assert.deepEqual([facts.initial, facts.final], [box.initial, box.final], `${box.id}'s kind`);
          assert.deepEqual(facts.stays, box.stays, `${box.id}'s stays`);
          const drawn = drawing.routes.filter((r) => r.from === box.id).map(({ to, edges, verbs }) => ({ to, edges, verbs }));
          assert.deepEqual(facts.routes, drawn, `${box.id}'s routes out`);
        }
      }
    },
  );
  await t.test(
    "a state's facts keep an edge back to it in its stays, never a route out, and a final state with no edge out has no route",
    () => {
      const busy = stateFacts(MACHINE, 'busy') ?? assert.fail('no facts for busy');
      assert.deepEqual(busy.stays, [
        { action: 'nothing', events: ['TICK'] },
        { action: 'stop', events: ['LATE [live]'] },
      ]);
      assert.deepEqual(
        busy.routes.map((r) => r.to),
        ['done', 'failed', 'held'],
      );
      assert.deepEqual(busy.routes.find((r) => r.to === 'failed')?.verbs, ['cancel [open]']);
      assert.deepEqual(
        stateFacts(MACHINE, 'idle')?.routes.find((r) => r.to === 'failed'),
        {
          to: 'failed',
          edges: [],
          verbs: ['cancel [open]'],
        },
      );
      const done = stateFacts(MACHINE, 'done') ?? assert.fail('no facts for done');
      assert.deepEqual([done.initial, done.final, done.stays.length, done.routes.length], [false, true, 0, 0]);
    },
  );
  await t.test(
    "a state's facts are none for a state neither the graph nor any edge or verb names, and some for one only a verb names",
    () => {
      assert.equal(stateFacts(MACHINE, 'nowhere'), undefined);
      const verbs = [{ ...MACHINE.verbs[0], from: ['idle'], to: 'gone' }];
      assert.deepEqual(stateFacts({ ...MACHINE, verbs }, 'gone'), { initial: false, final: false, stays: [], routes: [] });
    },
  );
});
