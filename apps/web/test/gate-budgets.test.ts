/**
 * The budgets a gated step proposes for the steps after it, at its gate (`Gate.tsx`, `GateBudgets.tsx`): what an approval sends of
 * them (`approvalBody`, `budgetsGiven`) — only the amounts the person changed, and no `budgets` at all where they changed none — and how
 * the rows are drawn, before the approval with a field each and after it read only.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import './tsx.ts';

const { createElement } = await import('react');
const { renderToStaticMarkup } = await import('react-dom/server');
const Gates = await import('../src/components/gate/Gate.tsx');
const { budgetsGiven, GateBudgetRows } = await import('../src/components/gate/GateBudgets.tsx');

const proposal = (from: 'proposed' | 'approved' = 'proposed') => ({
  from,
  steps: [
    { step: 'implement', usd: 60, said: '$60.00', why: 'Five parts, as the two wide runs took.', workflow: 40, above: true },
    { step: 'review', usd: 8, said: '$8.00', why: null, workflow: 16, above: false },
  ],
  said: 'spent $3.10 so far; at most $81.10 under these caps',
});

test('an approval sends no budgets where the person changed none, and the changed ones alone where they changed some', () => {
  assert.deepEqual(budgetsGiven(proposal(), {}), { given: [], unread: [] });
  assert.deepEqual(Gates.approvalBody([], {}, '', budgetsGiven(proposal(), {}).given), {});
  assert.ok(!('budgets' in Gates.approvalBody([], {}, 'Fine.', [])), 'no budgets key where none changed');

  const put = budgetsGiven(proposal(), { implement: '60', review: ' 8 ' });
  assert.equal(put.given.length, 0, 'a field put back to the proposal gives nothing');
  assert.equal(put.unread.length, 0);

  const changed = budgetsGiven(proposal(), { implement: '60', review: '6' });
  assert.deepEqual(changed, { given: [{ step: 'review', usd: 6 }], unread: [] });
  assert.deepEqual(Gates.approvalBody([], {}, 'Go.', changed.given), { message: 'Go.', budgets: [{ step: 'review', usd: 6 }] });
});

test('a field holding no amount above zero gives nothing and holds Approve; caps already approved give nothing', () => {
  assert.deepEqual(budgetsGiven(proposal('approved'), { review: '6' }), { given: [], unread: [] });
  assert.deepEqual(budgetsGiven(undefined, { review: '6' }), { given: [], unread: [] });
  for (const typed of ['', '0', '-3', 'x'])
    assert.deepEqual(budgetsGiven(proposal(), { review: typed }), { given: [], unread: ['review'] }, `typed ${JSON.stringify(typed)}`);
});

test("the gate's budgets are drawn per step: its amount, its own budget, the 'above' words where it is above, its why, and the run line", () => {
  const html = renderToStaticMarkup(
    createElement(GateBudgetRows, { step: 'design', budgets: proposal(), amounts: {}, onAmounts: () => {}, field: 'f' }),
  );
  assert.match(html, /data-gate-budgets="proposed"/);
  assert.match(html, /data-budget="implement" data-above=""/);
  assert.match(html, /above the workflow&#x27;s \$40</);
  assert.match(html, /its own budget \$16</);
  assert.equal(html.match(/above the workflow/g)?.length, 1, "review's row says no 'above'");
  assert.match(html, /Five parts, as the two wide runs took\./);
  assert.match(html, /spent \$3\.10 so far; at most \$81\.10 under these caps/);
  assert.equal(html.match(/<input/g)?.length, 2, 'a field per row before approval');

  const edited = renderToStaticMarkup(
    createElement(GateBudgetRows, { step: 'design', budgets: proposal(), amounts: { implement: '30' }, onAmounts: () => {} }),
  );
  assert.doesNotMatch(edited, /above the workflow/, 'an amount put under the step’s own budget is above it no more');

  const approved = renderToStaticMarkup(createElement(GateBudgetRows, { step: 'design', budgets: proposal('approved') }));
  assert.match(approved, /data-gate-budgets="approved"/);
  assert.doesNotMatch(approved, /<input/, 'read only once approved');
  assert.match(approved, /\$60\.00/);
});

test("the run's cost line, past it, is said under the run's line in the api's words; under it, or with none, nothing is", () => {
  const past = 'at most $71.10 under these caps passes the cost line of $50.00 factory mill sets for build';
  const html = renderToStaticMarkup(
    createElement(GateBudgetRows, { step: 'design', budgets: { ...proposal(), line: { usd: 50, said: past } } }),
  );
  const drawn = /<p data-past-line[^>]*>([^<]*)<\/p>/.exec(html);
  assert.equal(drawn?.[1], past, "the api's sentence, drawn as it is");
  assert.match(drawn?.[0] ?? '', /text-yours/, 'drawn as what a person weighs');
  assert.ok(html.indexOf('data-said') < html.indexOf('data-past-line'), "under the run's line");
  assert.doesNotMatch(renderToStaticMarkup(createElement(GateBudgetRows, { step: 'design', budgets: proposal() })), /data-past-line/);
});
