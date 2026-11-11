/**
 * A step's `checkFailurePolicy:` as a step file writes it: each shape the parser cannot take refused as the load refuses a key, the
 * line `checkFailurePolicyLine` writes read back as the same policy, and a step rendered with it and parsed again holding it. What the
 * policy decides of a verdict is proved by contracts/check-failure-policy.contract.ts, and what the run does on it by
 * src/retry/retry.test.ts.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { checkFailurePolicyLine, checkFailurePolicyOf, type CheckFailurePolicy } from './check-policy.ts';
import { parseWorkflow, renderStep } from '../workflow/step-file.ts';
import { WorkflowError } from '../step/step.ts';

/** A step file of `lines`, with a place and a body. */
const step = (lines: string): string => `---\nplace: git\n${lines}\n---\nDo the work.\n`;

const PERSONS: CheckFailurePolicy = { rules: [{ action: 'FailStep', onExitCodes: { operator: 'In', values: [78] } }] };

test('a check failure policy is read from its line, and each shape it cannot take is refused at load', async (t) => {
  await t.test('read: the rules in order, each code a number', () => {
    const read = parseWorkflow(
      'implement',
      step(
        'check: npm test\ncheckFailurePolicy: { rules: [ { action: Count, onExitCodes: { operator: In, values: [1, 2] } }, { action: FailStep, onExitCodes: { operator: NotIn, values: [3] } } ] }',
      ),
    );
    assert.deepEqual(read.checkFailurePolicy, {
      rules: [
        { action: 'Count', onExitCodes: { operator: 'In', values: [1, 2] } },
        { action: 'FailStep', onExitCodes: { operator: 'NotIn', values: [3] } },
      ],
    });
  });
  await t.test('absent: no policy, every refusal counted', () => {
    assert.equal(parseWorkflow('implement', step('check: npm test')).checkFailurePolicy, undefined);
  });
  const refused: [row: string, line: string][] = [
    [
      'no check: to read the exit code of',
      'checkFailurePolicy: { rules: [ { action: FailStep, onExitCodes: { operator: In, values: [78] } } ] }',
    ],
    ['not a map', 'check: npm test\ncheckFailurePolicy: FailStep'],
    [
      'a key other than rules',
      'check: npm test\ncheckFailurePolicy: { rules: [ { action: FailStep, onExitCodes: { operator: In, values: [78] } } ], backoffLimit: 2 }',
    ],
    ['no rule', 'check: npm test\ncheckFailurePolicy: { rules: [] }'],
    ['a rule that is no map', 'check: npm test\ncheckFailurePolicy: { rules: [ FailStep ] }'],
    [
      'a rule key other than action and onExitCodes',
      'check: npm test\ncheckFailurePolicy: { rules: [ { action: FailStep, onPodConditions: [], onExitCodes: { operator: In, values: [78] } } ] }',
    ],
    [
      'Ignore, a try counted against nothing',
      'check: npm test\ncheckFailurePolicy: { rules: [ { action: Ignore, onExitCodes: { operator: In, values: [78] } } ] }',
    ],
    [
      'an action that is none',
      'check: npm test\ncheckFailurePolicy: { rules: [ { action: FailJob, onExitCodes: { operator: In, values: [78] } } ] }',
    ],
    ['no onExitCodes', 'check: npm test\ncheckFailurePolicy: { rules: [ { action: FailStep } ] }'],
    [
      'a containerName',
      'check: npm test\ncheckFailurePolicy: { rules: [ { action: FailStep, onExitCodes: { containerName: main, operator: In, values: [78] } } ] }',
    ],
    [
      'an operator that is none',
      'check: npm test\ncheckFailurePolicy: { rules: [ { action: FailStep, onExitCodes: { operator: Equals, values: [78] } } ] }',
    ],
    ['no values', 'check: npm test\ncheckFailurePolicy: { rules: [ { action: FailStep, onExitCodes: { operator: In, values: [] } } ] }'],
    [
      '0, a check that passed',
      'check: npm test\ncheckFailurePolicy: { rules: [ { action: FailStep, onExitCodes: { operator: In, values: [0] } } ] }',
    ],
    ['past 255', 'check: npm test\ncheckFailurePolicy: { rules: [ { action: FailStep, onExitCodes: { operator: In, values: [256] } } ] }'],
    [
      'no whole number',
      'check: npm test\ncheckFailurePolicy: { rules: [ { action: FailStep, onExitCodes: { operator: In, values: [7.5] } } ] }',
    ],
    [
      'a code given twice',
      'check: npm test\ncheckFailurePolicy: { rules: [ { action: FailStep, onExitCodes: { operator: In, values: [78, 78] } } ] }',
    ],
  ];
  for (const [row, lines] of refused)
    await t.test(`REFUSED: ${row}`, () => {
      assert.throws(
        () => parseWorkflow('implement', step(lines)),
        (e: unknown) => e instanceof WorkflowError && e.exitCode === 2 && e.message.includes('checkFailurePolicy'),
      );
    });
});

test('a check failure policy is written back as the parser reads it: its line, and the step file a render writes', () => {
  const policy: CheckFailurePolicy = {
    rules: [
      { action: 'Count', onExitCodes: { operator: 'In', values: [1] } },
      { action: 'FailStep', onExitCodes: { operator: 'NotIn', values: [1, 2, 126] } },
    ],
  };
  const line = checkFailurePolicyLine(policy);
  assert.deepEqual(parseWorkflow('implement', step(`check: npm test\ncheckFailurePolicy: ${line}`)).checkFailurePolicy, policy);
  const read = parseWorkflow('implement', step(`check: npm test\ncheckFailurePolicy: ${checkFailurePolicyLine(PERSONS)}`));
  assert.deepEqual(parseWorkflow('implement', renderStep(read)).checkFailurePolicy, PERSONS);
  assert.equal(checkFailurePolicyOf('implement', undefined), undefined);
});
