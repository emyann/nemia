/**
 * A step's `checks:` as a step file writes them: the plan the loader resolves (the default chain, `after: []`, a check turned off handing
 * its waits on), `check: <line>` read as one check named `check`, and each shape the loader cannot take refused at load. What the pass
 * files of a plan is proved by contracts/checks-due.contract.ts.
 */
import { describe, test } from 'vitest';
import assert from 'node:assert/strict';
import { parseWorkflow, renderStep } from '../workflow/step-file.ts';
import { stepChecks, WorkflowError } from '../step/step.ts';

/** A step file of `lines`, with a place and a body. */
const step = (lines: string) => `---\nplace: git\n${lines}\n---\nDo the work.\n`;

/** The plan a step file's `checks:` resolves to. */
const planOf = (lines: string) => stepChecks(parseWorkflow('implement', step(lines)));

describe("a step's checks resolve into the plan the pass files by", () => {
  test('a check with no after: waits on the one above it, the first on none', () => {
    assert.deepEqual(planOf('checks:\n  - name: a\n    run: one\n  - name: b\n    run: two\n  - name: c\n    run: three'), [
      { name: 'a', run: 'one', after: [] },
      { name: 'b', run: 'two', after: ['a'] },
      { name: 'c', run: 'three', after: ['b'] },
    ]);
  });

  test('after: [] on two checks makes both roots, so they run side by side', () => {
    assert.deepEqual(planOf('checks:\n  - name: a\n    run: one\n  - name: b\n    run: two\n    after: []'), [
      { name: 'a', run: 'one', after: [] },
      { name: 'b', run: 'two', after: [] },
    ]);
  });

  test('an explicit after: names the checks waited on', () => {
    const plan = planOf(
      'checks:\n  - name: a\n    run: one\n  - name: b\n    run: two\n    after: []\n  - name: c\n    run: three\n    after: [a, b]',
    );
    assert.deepEqual(plan.at(-1), { name: 'c', run: 'three', after: ['a', 'b'] });
  });

  test('enabled: false on the middle of three takes it out, and the third waits on the first', () => {
    assert.deepEqual(
      planOf('checks:\n  - name: a\n    run: one\n  - name: b\n    run: two\n    enabled: false\n  - name: c\n    run: three'),
      [
        { name: 'a', run: 'one', after: [] },
        { name: 'c', run: 'three', after: ['a'] },
      ],
    );
  });

  test('usesCheckout: false, as a boolean or as text, is carried on the plan; true or absent leaves the check using the checkout', () => {
    assert.deepEqual(
      planOf(
        'checks:\n  - name: a\n    run: one\n  - name: b\n    run: two\n    usesCheckout: false\n  - name: c\n    run: three\n    usesCheckout: "false"\n  - name: d\n    run: four\n    usesCheckout: true',
      ),
      [
        { name: 'a', run: 'one', after: [] },
        { name: 'b', run: 'two', after: ['a'], usesCheckout: false },
        { name: 'c', run: 'three', after: ['b'], usesCheckout: false },
        { name: 'd', run: 'four', after: ['c'] },
      ],
    );
  });

  test('a check that uses no checkout renders back with its usesCheckout: false, and the render reads as the same plan', () => {
    const read = parseWorkflow('implement', step('checks:\n  - name: a\n    run: one\n  - name: b\n    run: two\n    usesCheckout: false'));
    assert.deepEqual(parseWorkflow('implement', renderStep(read)).checks, read.checks);
    assert.equal(read.checks?.[1]?.usesCheckout, false);
  });

  test('check: <line> is one check named check, waiting on nothing', () => {
    const read = parseWorkflow('implement', step('check: npm test'));
    assert.deepEqual(stepChecks(read), [{ name: 'check', run: 'npm test', after: [] }]);
    assert.equal(read.checks, undefined);
  });

  test('a check may wait on a condition in place of a command, and the render reads as the same plan', () => {
    const read = parseWorkflow('implement', step('checks:\n  - name: a\n    run: one\n  - name: ci\n    condition: ci-green'));
    assert.deepEqual(stepChecks(read), [
      { name: 'a', run: 'one', after: [] },
      { name: 'ci', condition: 'ci-green', after: ['a'] },
    ]);
    assert.deepEqual(parseWorkflow('implement', renderStep(read)).checks, read.checks);
  });

  test('a step file renders its checks back, and the render reads as the same plan', () => {
    const read = parseWorkflow('implement', step('checks:\n  - name: a\n    run: one\n  - name: b\n    run: two\n    after: []'));
    assert.deepEqual(parseWorkflow('implement', renderStep(read)).checks, read.checks);
  });
});

describe('each shape of checks: the loader cannot take is refused at load', () => {
  const refusals: [string, string][] = [
    ['check: and checks: together', 'check: x\nchecks:\n  - name: a\n    run: one'],
    ['a repeated name', 'checks:\n  - name: a\n    run: one\n  - name: a\n    run: two'],
    ['an after: naming no check', 'checks:\n  - name: a\n    run: one\n    after: [z]'],
    ['an after: naming the check itself', 'checks:\n  - name: a\n    run: one\n    after: [a]'],
    ['a cycle', 'checks:\n  - name: a\n    run: one\n    after: [b]\n  - name: b\n    run: two\n    after: [a]'],
    ['an unknown key', 'checks:\n  - name: a\n    run: one\n    timeout: 5'],
    ['a name outside the word', 'checks:\n  - name: A b\n    run: one'],
    ['no run:', 'checks:\n  - name: a'],
    ['an enabled: that is no boolean', 'checks:\n  - name: a\n    run: one\n    enabled: maybe'],
    ['a usesCheckout: that is no boolean', 'checks:\n  - name: a\n    run: one\n    usesCheckout: maybe'],
    ['every check turned off', 'checks:\n  - name: a\n    run: one\n    enabled: false'],
    ['a check with both run: and condition:', 'checks:\n  - name: a\n    run: one\n    condition: ready'],
    ['a condition: that is no name', 'checks:\n  - name: a\n    condition: Not A Name'],
    ['a usesCheckout: on a condition', 'checks:\n  - name: a\n    condition: ready\n    usesCheckout: false'],
    ['an item that is no map', 'checks:\n  - npm test'],
  ];
  for (const [what, lines] of refusals) {
    test(what, () => {
      assert.throws(() => parseWorkflow('implement', step(lines)), WorkflowError);
    });
  }
});
