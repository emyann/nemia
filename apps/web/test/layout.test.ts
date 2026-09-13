import { test } from 'node:test';
import assert from 'node:assert/strict';
import { COLUMN_WIDTH, layers, layout, ROW_HEIGHT } from '../src/lib/layout.ts';

// A layering that loops would hang the suite rather than fail it; these fail it.
const bounded = { timeout: 2_000 };

test('a chain is one column, a row per step, in the order it runs', bounded, () => {
  const steps = [
    { name: 'respond', after: ['review'] },
    { name: 'implement', after: [] },
    { name: 'review', after: ['implement'] },
  ];
  assert.deepEqual(layers(steps), [['implement'], ['review'], ['respond']]);
  assert.deepEqual(Object.fromEntries(layout(steps)), {
    implement: { x: 0, y: 0 },
    review: { x: 0, y: ROW_HEIGHT },
    respond: { x: 0, y: 2 * ROW_HEIGHT },
  });
});

test('a fan-in is placed below both of its parents, between them', bounded, () => {
  const at = layout([
    { name: 'api', after: [] },
    { name: 'web', after: [] },
    { name: 'merge', after: ['api', 'web'] },
  ]);
  const [api, web, merge] = [at.get('api')!, at.get('web')!, at.get('merge')!];
  assert.ok(merge.y > api.y && merge.y > web.y, JSON.stringify({ api, web, merge }));
  assert.ok(api.x < merge.x && merge.x < web.x, JSON.stringify({ api, web, merge }));
  assert.equal(web.x - api.x, COLUMN_WIDTH);
});

test('a step goes below the deepest step it waits on, not the nearest', bounded, () => {
  assert.deepEqual(layers([
    { name: 'plan', after: [] },
    { name: 'build', after: ['plan'] },
    { name: 'ship', after: ['plan', 'build'] },
  ]), [['plan'], ['build'], ['ship']]);
});

test('within a row, steps follow their parents, so a fan-out does not cross', bounded, () => {
  assert.deepEqual(layers([
    { name: 'left', after: [] },
    { name: 'right', after: [] },
    { name: 'under-right', after: ['right'] },
    { name: 'under-left', after: ['left'] },
  ]), [['left', 'right'], ['under-left', 'under-right']]);
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
