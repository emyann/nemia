/**
 * The layering of a run's steps (src/lib/layout.ts), one table: columns in the order they run, every edge pointing right, a cycle
 * refused, and the extent of a layout.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { COLUMN_WIDTH, extentOf, layers, layout, ROW_HEIGHT, stepsOf } from '../src/lib/layout.ts';

/** The bound that fails a test whose layering loops, where the loop would otherwise hang the suite. */
const bounded = { timeout: 2_000 };

test("layers, layout and extentOf: a run's steps in columns, every edge pointing right", async (t) => {
  await t.test('a chain is one row, a column per step, in the order it runs', bounded, () => {
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
  await t.test('a fan-in is placed to the right of both of its parents, between them vertically', bounded, () => {
    const at = layout([
      { name: 'api', after: [] },
      { name: 'web', after: [] },
      { name: 'merge', after: ['api', 'web'] },
    ]);
    const [api, web, merge] = [at.get('api')!, at.get('web')!, at.get('merge')!];
    assert.ok(merge.x > api.x && merge.x > web.x, JSON.stringify({ api, web, merge }));
    assert.ok(api.y < merge.y && merge.y < web.y, JSON.stringify({ api, web, merge }));
    assert.equal(api.x, web.x, 'the parents stand in one column');
    assert.equal(web.y - api.y, ROW_HEIGHT, 'the parents stand a row apart');
  });
  await t.test('every edge points right, however the steps fan out and in', bounded, () => {
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
  await t.test('a step goes right of the deepest step it waits on, not the nearest', bounded, () => {
    assert.deepEqual(
      layers([
        { name: 'plan', after: [] },
        { name: 'build', after: ['plan'] },
        { name: 'ship', after: ['plan', 'build'] },
      ]),
      [['plan'], ['build'], ['ship']],
    );
  });
  await t.test('within a column, steps follow their parents, so a fan-out does not cross', bounded, () => {
    const steps = [
      { name: 'top', after: [] },
      { name: 'bottom', after: [] },
      { name: 'after-bottom', after: ['bottom'] },
      { name: 'after-top', after: ['top'] },
    ];
    assert.deepEqual(layers(steps), [
      ['top', 'bottom'],
      ['after-top', 'after-bottom'],
    ]);
    const at = layout(steps);
    assert.ok(at.get('after-top')!.y < at.get('after-bottom')!.y, JSON.stringify(Object.fromEntries(at)));
  });
  await t.test('a cycle is refused, naming the steps in it, and the layering does not loop', bounded, () => {
    assert.throws(
      () =>
        layers([
          { name: 'a', after: ['b'] },
          { name: 'b', after: ['a'] },
        ]),
      /cycle among a, b\b/,
    );
    assert.throws(
      () =>
        layout([
          { name: 'start', after: [] },
          { name: 'a', after: ['start', 'b'] },
          { name: 'b', after: ['a'] },
          { name: 'after-b', after: ['b'] },
        ]),
      /cycle among a, b, after-b\b/,
      'a cycle behind a step that is fine, dragging a step that waits on it, names everything the layering cannot place',
    );
    assert.throws(() => layers([{ name: 'self', after: ['self'] }]), /cycle among self\b/);
  });
  await t.test('an `after` naming a step the run does not have is drawn as nothing', bounded, () => {
    assert.deepEqual(
      layers([
        { name: 'review', after: ['gone', 'gone'] },
        { name: 'other', after: [] },
      ]),
      [['review', 'other']],
    );
    assert.deepEqual(layers([]), []);
  });
  await t.test("a layout's extent is a column's width per column and a row's height per row of its tallest column", bounded, () => {
    assert.deepEqual(extentOf(new Map()), { width: 0, height: 0 });
    assert.deepEqual(extentOf(layout([{ name: 'alone', after: [] }])), { width: COLUMN_WIDTH, height: ROW_HEIGHT });
    assert.deepEqual(
      extentOf(
        layout([
          { name: 'plan', after: [] },
          { name: 'api', after: ['plan'] },
          { name: 'web', after: ['plan'] },
          { name: 'merge', after: ['api', 'web'] },
        ]),
      ),
      { width: 3 * COLUMN_WIDTH, height: 2 * ROW_HEIGHT },
    );
  });
  await t.test(
    "the layering reads a graph's `after` edges and leaves its `loop` edges out, so an edge back opens no column",
    bounded,
    () => {
      const names = ['implement', 'test', 'review'];
      const edges = [
        { from: 'implement', to: 'test', kind: 'after' },
        { from: 'test', to: 'review', kind: 'after' },
        { from: 'review', to: 'implement', kind: 'loop' },
      ];
      assert.deepEqual(stepsOf(names, edges), [
        { name: 'implement', after: [] },
        { name: 'test', after: ['implement'] },
        { name: 'review', after: ['test'] },
      ]);
      assert.deepEqual(layers(stepsOf(names, edges)), [['implement'], ['test'], ['review']]);
      assert.deepEqual(
        layout(stepsOf(names, edges)),
        layout(
          stepsOf(
            names,
            edges.filter((e) => e.kind === 'after'),
          ),
        ),
      );
      const asAfter = names.map((name) => ({ name, after: edges.filter((e) => e.to === name).map((e) => e.from) }));
      assert.throws(
        () => layers(asAfter),
        /cycle among implement, test, review\b/,
        'read as an `after`, the edge back is a cycle, which the layering refuses',
      );
      assert.deepEqual(
        layers(stepsOf(['implement', 'review'], [{ from: 'review', to: 'implement', kind: 'loop' }])),
        [['implement', 'review']],
        'a loop edge and nothing else orders nothing: both steps in the first column',
      );
    },
  );
});
