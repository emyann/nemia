import { test } from 'node:test';
import assert from 'node:assert/strict';
import { COLUMN_WIDTH, extentOf, layers, layout, ROW_HEIGHT } from '../src/lib/layout.ts';

// A layering that loops would hang the suite rather than fail it; these fail it.
const bounded = { timeout: 2_000 };

test('a chain is one row, a column per step, in the order it runs', bounded, () => {
  const steps = [
    { name: 'respond', after: ['review'] },
    { name: 'implement', after: [] },
    { name: 'review', after: ['implement'] },
  ];
  assert.deepEqual(layers(steps), [['implement'], ['review'], ['respond']]);
  assert.deepEqual(Object.fromEntries(layout(steps)), {
    implement: { x: 0, y: 0 },
    review: { x: COLUMN_WIDTH, y: 0 },
    respond: { x: 2 * COLUMN_WIDTH, y: 0 },
  });
});

test('a fan-in is placed to the right of both of its parents, between them vertically', bounded, () => {
  const at = layout([
    { name: 'api', after: [] },
    { name: 'web', after: [] },
    { name: 'merge', after: ['api', 'web'] },
  ]);
  const [api, web, merge] = [at.get('api')!, at.get('web')!, at.get('merge')!];
  assert.ok(merge.x > api.x && merge.x > web.x, JSON.stringify({ api, web, merge }));
  assert.ok(api.y < merge.y && merge.y < web.y, JSON.stringify({ api, web, merge }));
  // The parents stand in one column, a row apart.
  assert.equal(api.x, web.x);
  assert.equal(web.y - api.y, ROW_HEIGHT);
});

test('every edge points right, however the steps fan out and in', bounded, () => {
  const steps = [
    { name: 'plan', after: [] },
    { name: 'api', after: ['plan'] },
    { name: 'web', after: ['plan'] },
    { name: 'docs', after: [] },
    { name: 'merge', after: ['api', 'web', 'docs'] },
    { name: 'ship', after: ['merge', 'plan'] },
  ];
  const at = layout(steps);
  for (const step of steps) {
    for (const parent of step.after) {
      assert.ok(at.get(step.name)!.x > at.get(parent)!.x, `${parent} -> ${step.name}: ${JSON.stringify(Object.fromEntries(at))}`);
    }
  }
});

test('a step goes right of the deepest step it waits on, not the nearest', bounded, () => {
  assert.deepEqual(layers([
    { name: 'plan', after: [] },
    { name: 'build', after: ['plan'] },
    { name: 'ship', after: ['plan', 'build'] },
  ]), [['plan'], ['build'], ['ship']]);
});

test('within a column, steps follow their parents, so a fan-out does not cross', bounded, () => {
  const steps = [
    { name: 'top', after: [] },
    { name: 'bottom', after: [] },
    { name: 'after-bottom', after: ['bottom'] },
    { name: 'after-top', after: ['top'] },
  ];
  assert.deepEqual(layers(steps), [['top', 'bottom'], ['after-top', 'after-bottom']]);
  const at = layout(steps);
  assert.ok(at.get('after-top')!.y < at.get('after-bottom')!.y, JSON.stringify(Object.fromEntries(at)));
});

test('a cycle is refused, naming the steps in it, and the layering does not loop', bounded, () => {
  assert.throws(
    () => layers([{ name: 'a', after: ['b'] }, { name: 'b', after: ['a'] }]),
    /cycle among a, b\b/,
  );
  // Behind a step that is fine, and dragging a step that waits on it: everything it cannot place.
  assert.throws(
    () => layout([
      { name: 'start', after: [] },
      { name: 'a', after: ['start', 'b'] },
      { name: 'b', after: ['a'] },
      { name: 'after-b', after: ['b'] },
    ]),
    /cycle among a, b, after-b\b/,
  );
  assert.throws(() => layers([{ name: 'self', after: ['self'] }]), /cycle among self\b/);
});

test('an `after` naming a step the run does not have is drawn as nothing', bounded, () => {
  assert.deepEqual(layers([{ name: 'review', after: ['gone', 'gone'] }, { name: 'other', after: [] }]), [['review', 'other']]);
  assert.deepEqual(layers([]), []);
});

test("a layout's extent is a column's width per column and a row's height per row of its tallest column", bounded, () => {
  assert.deepEqual(extentOf(new Map()), { width: 0, height: 0 });
  assert.deepEqual(extentOf(layout([{ name: 'alone', after: [] }])), { width: COLUMN_WIDTH, height: ROW_HEIGHT });
  assert.deepEqual(extentOf(layout([
    { name: 'plan', after: [] },
    { name: 'api', after: ['plan'] },
    { name: 'web', after: ['plan'] },
    { name: 'merge', after: ['api', 'web'] },
  ])), { width: 3 * COLUMN_WIDTH, height: 2 * ROW_HEIGHT });
});
