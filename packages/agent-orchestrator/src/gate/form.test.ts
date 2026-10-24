/** Which yes `nemia approve` gives: at a step's gate, or to a loop out of rounds, as `nemia accept` gave it. */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { approveFormOf, type ApproveForm } from './gate.ts';
import type { Workflow } from '../step/step.ts';

const STEPS = [
  { name: 'plan', gate: true },
  { name: 'review', loop: 'implement' },
  { name: 'judge', gate: true, loop: 'implement' },
] as unknown as Workflow[];

test('`approveFormOf`: a gate where the step is gated, a loop where it closes one, and a step both by whether it waits at its gate', async (t) => {
  const rows: Array<[string, string | undefined, boolean, ApproveForm]> = [
    ['no step named: the run alone, for its only loop', undefined, true, 'loop'],
    ['a gated step', 'plan', false, 'gate'],
    ['a step that closes a loop and is gated at no step', 'review', true, 'loop'],
    ['a step both gated and closing a loop, waiting at its gate', 'judge', true, 'gate'],
    ['a step both gated and closing a loop, out of rounds', 'judge', false, 'loop'],
    ['a step the run does not have, which the gate refuses by name', 'nowhere', false, 'gate'],
  ];
  for (const [name, step, atGate, form] of rows)
    await t.test(name, () =>
      assert.equal(
        approveFormOf(STEPS, { gates: [] }, step, () => atGate),
        form,
      ),
    );
});
