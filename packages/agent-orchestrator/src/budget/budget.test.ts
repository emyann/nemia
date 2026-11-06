/**
 * The budgets a gated step proposes, as data (`budget.ts`): the `x-shape` marker the output-schema loader expands to `BUDGETS_SCHEMA`,
 * the strict decoder (`budgetsOf`), a closeout whose budgets cannot be set read `unsigned` and refused back to its session
 * (`closeoutRefusals`), and the cap a step is filed under read from the approvals in force (`budgetOf`). The four functions a contract
 * proves are its laws' (`contracts/budget.contract.ts`), not rows here, but one: the full law `aProposalStands` narrows there, that each
 * budget the step proposed and the person did not change is the cap the approval sets for its step, is held here by `approvedCaps` over
 * every proposal and every set of amounts given, until tsverify proves a loop keeps every element it passes on
 * (src-a-filter-s-result-is-pro-p25m, in the tsverify factory). Each refusal row breaks one rule and is asserted by its kind and the
 * facts it names.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { looseAt, type Closeout } from '../closeout/closeout.ts';
import { closeoutRefusals, expandShapes } from '../question/question.ts';
import { parseWorkflow, type Workflow } from '../workflow.ts';
import { Invalid } from '../refusal/refusal.ts';
import { budgetOf, stepStatus } from '../status/status.ts';
import type { Run } from '../record/record.ts';
import { names, phases, run } from '../../test/assessed.ts';
import { gateBudgets } from '../gate-budgets/gate-budgets.ts';
import {
  approvedCaps,
  BUDGETS_SCHEMA,
  budgetFields,
  budgetsOf,
  budgetRefusals,
  laterSteps,
  proposedBudgets,
  type StepBudget,
} from './budget.ts';

/** A gated `design` whose output declares `budgets` as the shape, with `budget:` 12 of its own. */
const design = parseWorkflow('design', '---\nplace: git\ngate: true\nbudget: 12\noutput: design.schema.json\n---\nDesign it.\n', () =>
  JSON.stringify({
    type: 'object',
    properties: { budgets: { 'x-shape': 'budgets', description: 'd' } },
    required: ['budgets'],
    additionalProperties: false,
  }),
);
const STEPS: Workflow[] = [
  { name: 'intake', after: [], body: 'x' },
  { ...design, after: ['intake'] },
  { name: 'implement', after: ['design'], body: 'x', budget: 40 },
  { name: 'review', after: ['implement'], body: 'x', budget: 10 },
];
const [, DESIGN, IMPLEMENT] = STEPS as [Workflow, Workflow, Workflow, Workflow];

/** A closeout of design proposing `budgets`, flat as a harness gives it under `output`. */
const proposing = (budgets: unknown): Closeout => ({ outcome: 'done', summary: 's', artifacts: [], output: { budgets } });

/** What `budgetsOf` gives `value` when it refuses it, or a failure when it decodes. */
const decodeFails = (value: unknown): string => {
  const read = budgetsOf(value);
  assert.ok(!Array.isArray(read), `${JSON.stringify(value)} decoded`);
  return read.error;
};

test('expandShapes and budgetFields: the `budgets` shape of a step’s `output:`', async (t) => {
  await t.test('BUDGETS_SCHEMA is strict, as every schema handed to a harness is', () => {
    assert.equal(looseAt(BUDGETS_SCHEMA, ''), undefined);
  });
  await t.test('the loader expands a marked field to the strict schema, its description kept, and knows it by its schema', () => {
    assert.deepEqual(design.output?.schema.properties.budgets, { ...BUDGETS_SCHEMA, description: 'd' });
    assert.deepEqual(expandShapes({ caps: { 'x-shape': 'budgets' } }), { properties: { caps: BUDGETS_SCHEMA } });
    assert.deepEqual(budgetFields(design), ['budgets']);
  });
  await t.test('REFUSED: a shape it does not know still, naming the shapes there are', () => {
    const read = expandShapes({ open: { 'x-shape': 'poll' } });
    assert.ok('error' in read);
    names(read.error, '`open`', '"poll"', '`questions`', '`budgets`');
    assert.throws(
      () =>
        parseWorkflow('design', '---\noutput: d.json\n---\nx\n', () =>
          JSON.stringify({ type: 'object', properties: { open: { 'x-shape': 'poll' } }, required: ['open'], additionalProperties: false }),
        ),
      (err: unknown) => err instanceof Invalid && err.exitCode === 2,
    );
  });
});

test('budgetsOf: a field read as budgets, strictly', async (t) => {
  await t.test('reads a list of budgets as it is, an empty one too', () => {
    const row = { step: 'implement', usd: 7, why: 'p90 of implement' };
    assert.deepEqual(budgetsOf([row]), [row]);
    assert.deepEqual(budgetsOf([]), []);
  });
  await t.test('REFUSED: a value that is no list', () => names(decodeFails({ step: 'implement' }), 'not a list'));
  await t.test('REFUSED: a budget without `why`', () => names(decodeFails([{ step: 'implement', usd: 7 }]), 'budget 1', 'step, usd, why'));
  await t.test('REFUSED: a budget with a key beside its three', () =>
    names(decodeFails([{ step: 'implement', usd: 7, why: 'w', note: 'n' }]), 'budget 1', 'note'),
  );
  await t.test('REFUSED: a `usd` that is no number', () =>
    names(decodeFails([{ step: 'implement', usd: '7', why: 'w' }]), 'budget 1', '`usd`'),
  );
});

test('budgetRefusals and closeoutRefusals: budgets a gate cannot set refuse the closeout back to its session', async (t) => {
  await t.test('the steps after the gate are those that wait on it, directly or through another', () => {
    assert.deepEqual(laterSteps(STEPS, 'design'), ['implement', 'review']);
  });
  const refused = (budgets: unknown, ...facts: string[]) => {
    const said = proposing(budgets);
    const why = budgetRefusals(DESIGN, STEPS, said);
    assert.equal(why.length, 1, JSON.stringify(why));
    names(why[0], ...facts);
    assert.deepEqual(closeoutRefusals(DESIGN, said, STEPS).slice(-1), why, 'closeoutRefusals carries them');
  };
  const row = (step: string, usd: number) => ({ step, usd, why: 'w' });
  await t.test('REFUSED: a budget for the gated step itself', () => refused([row('design', 5)], '"design"', 'implement, review'));
  await t.test('REFUSED: a budget for an earlier step', () => refused([row('intake', 5)], '"intake"'));
  await t.test('REFUSED: a budget for a step the workflow does not have', () => refused([row('nosuch', 5)], '"nosuch"'));
  await t.test('REFUSED: a budget of no dollars', () => refused([row('implement', 0)], 'implement', 'not an amount'));
  await t.test('REFUSED: two budgets for one step', () => refused([row('implement', 5), row('implement', 6)], 'implement', 'two'));
  await t.test('REFUSED: a field that does not decode', () => refused('seven', '`budgets`', 'not a list'));
  await t.test('budgets each naming a later step once, each an amount, are taken', () => {
    const said = proposing([row('implement', 7), row('review', 3)]);
    assert.deepEqual(budgetRefusals(DESIGN, STEPS, said), []);
    assert.deepEqual(
      proposedBudgets(DESIGN, said).map((b) => [b.step, b.usd]),
      [
        ['implement', 7],
        ['review', 3],
      ],
    );
  });
});

test('ownStatus: a gated step whose budgets cannot be set reads unsigned, and with budgets it can set awaits approval', () => {
  const r = run({ intake: 'i1', design: 'd1', implement: null, review: null });
  const done = phases({ i1: 'succeeded', d1: 'succeeded' });
  const status = (said: Closeout) =>
    stepStatus(
      DESIGN,
      r,
      done,
      (s) => (s === 'design' ? said : undefined),
      () => false,
      STEPS,
    );
  assert.equal(status(proposing([{ step: 'design', usd: 5, why: 'w' }])), 'unsigned');
  assert.equal(status(proposing([{ step: 'implement', usd: 0, why: 'w' }])), 'unsigned');
  assert.equal(status(proposing([{ step: 'implement', usd: 7, why: 'w' }])), 'awaiting approval');
});

test('approvedCaps: each budget the step proposed that the person did not change is the cap the approval sets for its step', () => {
  const later = ['implement', 'review', 'land'];
  const subsets = (usd: number): StepBudget[][] =>
    Array.from({ length: 2 ** later.length }, (_, mask) =>
      later.filter((_, i) => mask & (1 << i)).map((step, i) => ({ step, usd: usd + i })),
    );
  let cases = 0;
  for (const proposed of subsets(10)) {
    for (const given of subsets(50)) {
      const set = approvedCaps(proposed, given, later);
      assert.ok(!('refused' in set), `${JSON.stringify(given)} can be set`);
      for (const p of proposed.filter((b) => !given.some((g) => g.step === b.step))) {
        assert.ok(
          set.caps.some((c) => c.step === p.step && c.usd === p.usd),
          `${p.step} proposed at ${p.usd}, not given: the cap stands in ${JSON.stringify(set.caps)}`,
        );
      }
      cases += 1;
    }
  }
  assert.equal(cases, 64, 'every proposal against every set of amounts given');
});

test('budgetOf: the cap in force, read from the record and the approvals in force on every pass', async (t) => {
  const onTry = (approvals: Run['approvals'], tries?: Run['steps'][string]['tries']): Run =>
    run(
      { design: 'd1', implement: 'm1' },
      {
        approvals,
        steps: { design: { taskId: 'd1' }, implement: { taskId: 'm1', ...(tries ? { tries } : {}) } },
      },
    );
  const at = (n: number, budgets: Record<string, number>, tryNo = 1) => ({
    step: 'design',
    try: tryNo,
    at: `2026-01-01T00:00:0${n}Z`,
    budgets,
  });
  await t.test("no approval: the step's own budget", () => assert.equal(budgetOf(IMPLEMENT, onTry(undefined)), 40));
  await t.test('an approval of the try its step is on: its cap for the step', () =>
    assert.equal(budgetOf(IMPLEMENT, onTry([at(1, { implement: 7 })])), 7),
  );
  await t.test('two approvals capping one step: the last given, whatever order the files are read in', () =>
    assert.equal(budgetOf(IMPLEMENT, onTry([at(2, { implement: 9 }, 1), { ...at(1, { implement: 7 }), step: 'intake' }])), 9),
  );
  await t.test('an approval a later try of its step spent sets nothing: the step falls back to its own budget', () =>
    assert.equal(budgetOf(IMPLEMENT, onTry([at(1, { implement: 7 }, 0)])), 40),
  );
  await t.test("a person's raise on the step's own try wins over the approval", () =>
    assert.equal(budgetOf(IMPLEMENT, onTry([at(1, { implement: 7 })], [{ taskId: 'm0', cause: 'continue', budget: 9 }])), 9),
  );
});

test("gateBudgets: a gate's budgets, proposed before its approval and approved after, each against its step's own budget", async (t) => {
  const said = proposing([
    { step: 'implement', usd: 60, why: 'two wide runs' },
    { step: 'review', usd: 3, why: 'p90' },
  ]);
  const gated = (approvals?: Run['approvals']) => run({ intake: 'i1', design: 'd1', implement: null, review: null }, { approvals });
  const spent = () => ({ usd: 1.5, measured: 1, unmeasured: 0, budgetEnded: false });
  await t.test('before the approval: the proposal, a cap above its step’s own budget said above, and the run line', () => {
    const at = gateBudgets(gated(), DESIGN, STEPS, said, spent);
    assert.equal(at?.from, 'proposed');
    assert.deepEqual(
      at?.steps.map((b) => [b.step, b.usd, b.said, b.why, b.workflow, b.above]),
      [
        ['implement', 60, '$60.00', 'two wide runs', 40, true],
        ['review', 3, '$3.00', 'p90', 10, false],
      ],
    );
    names(at?.said, 'the run has spent $3.00', 'at most', 'intake', 'no cap');
  });
  await t.test('after it: the caps it set, the why of an amount the person changed gone', () => {
    const approved = gated([{ step: 'design', try: 1, at: '2026-01-01T00:00:00Z', budgets: { implement: 60, review: 4 } }]);
    const at = gateBudgets(approved, DESIGN, STEPS, said, spent);
    assert.equal(at?.from, 'approved');
    assert.deepEqual(
      at?.steps.map((b) => [b.step, b.usd, b.why]),
      [
        ['implement', 60, 'two wide runs'],
        ['review', 4, null],
      ],
    );
  });
  await t.test('none for a step with no gate, or a closeout whose budgets the run refuses', () => {
    assert.equal(gateBudgets(gated(), IMPLEMENT, STEPS, said, spent), undefined);
    assert.equal(gateBudgets(gated(), DESIGN, STEPS, proposing([{ step: 'design', usd: 5, why: 'w' }]), spent), undefined);
  });
});
