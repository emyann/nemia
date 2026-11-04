/**
 * A parked step in `nemia ls`: the word `paused`, with the call it stopped after or the call it cut, reason `Paused`, read through the
 * listing's `parkedOf`; the feed's word for it names the same reason (`test/assessed.ts`'s `listing`).
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { listing, phases, run, STEPS } from '../../test/assessed.ts';

/** The implement row of a run whose implement is at work as `t1`, parked as `parked` says. */
const implementRow = (parked: { after?: string; cut?: string } | undefined) => {
  const listed = listing({
    steps: STEPS,
    run: run({ implement: 't1', review: null }),
    phaseOf: phases({ t1: 'running' }),
    closeoutOf: () => undefined,
    parkedOf: (id) => (id === 't1' ? parked : undefined),
  });
  const row = listed.steps.find((s) => s.name === 'implement');
  assert.ok(row, 'the implement row is listed');
  return row;
};

test('a parked step says paused, with the call it stopped after or the call it cut, reason Paused', async (t) => {
  await t.test('held after its call to Read: paused after its call to Read', () => {
    const row = implementRow({ after: 'Read' });
    assert.deepEqual([row.message, row.reason, row.phase], ['paused after its call to Read', 'Paused', 'running']);
  });
  await t.test('held between two calls with no call kept: paused', () => {
    const row = implementRow({});
    assert.deepEqual([row.message, row.reason], ['paused', 'Paused']);
  });
  await t.test('parked with its call to Bash cut: paused, its call to Bash cut', () => {
    const row = implementRow({ cut: 'Bash' });
    assert.deepEqual([row.message, row.reason], ['paused, its call to Bash cut', 'Paused']);
  });
  await t.test('a step not parked says the engine’s word, as before', () => {
    const row = implementRow(undefined);
    assert.deepEqual([row.message, row.reason], ['running', 'Running']);
  });
});
