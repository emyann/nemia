/** A template's parameters given values: typed as declared, a default filling a gap, every wrong `--set` refused at once by name. */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { resolveParams, substitute } from './index.ts';

const DECLARED = {
  model: { type: 'string', description: 'the model', default: 'sonnet' },
  budget: { type: 'number', description: 'dollars a step' },
  gated: { type: 'boolean', description: 'whether ship waits', default: false },
} as const;

test("a template's parameters given values: typed, defaulted, substituted, and every wrong one refused", async (t) => {
  await t.test('each parameter takes its --set typed as declared, the last of a key winning, and its default where none gives it', () => {
    assert.deepEqual(resolveParams(DECLARED, ['budget=7', 'gated=true', 'budget=8']), {
      params: { budget: 8, gated: true, model: 'sonnet' },
      refusals: [],
    });
    assert.deepEqual(resolveParams(DECLARED, ['budget=1', 'model=a=b']).params.model, 'a=b');
  });
  await t.test(
    'a key not declared, a value of the wrong type, a --set with no key and a required parameter not given are refused, every one',
    () => {
      const { refusals } = resolveParams(DECLARED, ['colour=red', 'gated=yes', '=3', 'model']);
      assert.equal(refusals.length, 5, refusals.join('\n'));
      assert.ok(refusals[0].startsWith('--set colour=red'), refusals[0]);
      assert.ok(refusals[0].includes('budget, gated, model'), refusals[0]);
      assert.match(refusals[1], /--set =3: a parameter is given as <key>=<value>/);
      assert.match(refusals[2], /--set model: a parameter is given as <key>=<value>/);
      assert.ok(refusals[3].includes('(dollars a step)'), refusals[3]);
      assert.ok(refusals[3].includes('add --set budget=<number>'), refusals[3]);
      assert.ok(refusals[4].startsWith('--set gated=yes'), refusals[4]);
      assert.ok(refusals[4].includes('true or false'), refusals[4]);
      assert.match(resolveParams(DECLARED, ['budget=lots']).refusals.join('\n'), /--set budget=lots: budget is a number, and lots is none/);
      assert.match(resolveParams(DECLARED, ['budget=']).refusals.join('\n'), /--set budget=: budget is a number, and nothing is none/);
    },
  );
  await t.test('a {param} is replaced at any depth, and one the parameters lack is refused by name', () => {
    assert.deepEqual(substitute({ a: [{ param: 'n' }, 'x'], b: { c: { param: 'n' } } }, { n: 3 }), { a: [3, 'x'], b: { c: 3 } });
    assert.throws(
      () => substitute({ a: { param: 'm' } }, {}),
      (err: Error) => err instanceof Error && err.message.startsWith('{param: m}') && err.message.includes("nemia.yaml's parameters"),
    );
  });
});
