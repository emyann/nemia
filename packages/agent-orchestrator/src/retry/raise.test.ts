/**
 * A step's raise, judged once (`stepRaise`, `raiseVerdict`): what `nemia decide` says a raise has to pass is what the run page's `raise`
 * says, for a try over its budget and for a loop whose round waits on a step over its budget. The laws of the verdict itself are
 * `contracts/raise.contract.ts`'s.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import type { Closeout } from '../closeout/closeout.ts';
import { decision } from '../decide/decide.ts';
import type { Run, TaskPhase } from '../record/record.ts';
import type { StepSpec } from '../step/step.ts';
import type { SpendOf } from '../status/status.ts';
import { answerLines, overBudgetLine, retryOffers, stepRaise, type RaiseReads } from './retry.ts';
import { aRead, phases, run, step } from '../../test/assessed.ts';

const asked = () => true;
const nothingShipped = () => false;
/** What each task's sessions cost, in dollars, every one measured. */
const spends =
  (usd: Record<string, number>): SpendOf =>
  (id) =>
    id in usd ? { usd: usd[id], measured: 1, unmeasured: 0, budgetEnded: false } : undefined;
const reads = (phaseOf: (id: string) => TaskPhase, closeoutOf: (name: string) => Closeout | undefined, verdict?: 0): RaiseReads => ({
  phaseOf,
  closeoutOf,
  askedCloseout: asked,
  verdictOf: () => verdict,
});

test('decide names the raise the run page shows: one judgement, read by both', async (t) => {
  await t.test('a try over its budget, signed off blocked: the answer line asks for a budget above the raise', () => {
    const steps: StepSpec[] = [{ ...step('implement'), budget: 3 }, step('review', ['implement'])];
    const r = run({ implement: 't1', review: null });
    const spent = spends({ t1: 4 });
    const settled = phases({ t1: 'succeeded' });
    const stuck = (name: string): Closeout | undefined =>
      name === 'implement' ? { outcome: 'blocked', summary: 's', artifacts: [], needs: 'which flag name ships' } : undefined;
    const raise = stepRaise(steps[0], r, steps, reads(settled, stuck), spent);
    assert.deepEqual(raise, { by: 'retry', above: 4, said: '$4.00', modes: ['continue', 'fresh'], own: 'blocked' });
    const d = decision(
      aRead(steps, r, { phaseOf: settled, signedOff: stuck, asked, sessionBlocked: () => false, spendOf: spent }),
      nothingShipped,
    );
    const line = answerLines(steps, r, d, settled, stuck, asked, spent).implement ?? '';
    assert.ok(line.includes(`its cap raised above ${raise?.said}:`), line);
  });
  await t.test('a loop whose round waits on a step over its budget: raised by round, above what that step cost', () => {
    const steps: StepSpec[] = [
      { ...step('implement'), check: 'npm test', budget: 3 },
      { ...step('review', ['implement']), loop: 'implement', rounds: 3 },
      step('ship', ['review']),
    ];
    const r: Run = run(
      {},
      { steps: { implement: { taskId: 'i1', check: { taskId: 'c1' } }, review: { taskId: 'r1' }, ship: { taskId: null } } },
    );
    const spent = spends({ i1: 4.25, r1: 0.5 });
    const all = (): TaskPhase => 'succeeded';
    const said = (name: string): Closeout | undefined =>
      name === 'review'
        ? { outcome: 'done', summary: 's', artifacts: [], needs: undefined, output: { findings: [], again: true } }
        : name === 'implement'
          ? { outcome: 'done', summary: 's', artifacts: [], needs: undefined }
          : undefined;
    const raise = stepRaise(steps[1], r, steps, reads(all, said, 0), spent);
    assert.deepEqual(raise, { by: 'round', above: 4.25, said: '$4.25', modes: [], own: null });
    const d = decision(
      aRead(steps, r, {
        phaseOf: all,
        signedOff: said,
        asked,
        verdictOf: () => 0,
        asks: [],
        roundAsks: [],
        sessionBlocked: () => false,
        spendOf: spent,
      }),
      nothingShipped,
    );
    const line = overBudgetLine(steps, r, d, spent) ?? '';
    assert.ok(line.includes(`review (held: its round would file implement again, which has cost ${raise?.said} `), line);
  });
  await t.test('none on a run called off: cancelled, pruned or held', () => {
    const steps: StepSpec[] = [{ ...step('implement'), budget: 3 }];
    const stuck = (): Closeout => ({ outcome: 'blocked', summary: 's', artifacts: [], needs: 'which' });
    const settled = phases({ t1: 'succeeded' });
    const spent = spends({ t1: 4 });
    const offs: Array<Partial<Run>> = [
      { cancelledAt: '2026-01-02T00:00:00Z' },
      { pruned: { at: '2026-09-17T01:00:00.000Z', worktrees: [] } },
      { hold: { at: '2026-01-01T01:00:00Z', until: ['r-0'] } },
    ];
    const d = decision(
      aRead(steps, run({ implement: 't1' }), { phaseOf: settled, signedOff: stuck, asked, sessionBlocked: () => false, spendOf: spent }),
      nothingShipped,
    );
    assert.equal(d.kind, 'awaiting', 'the run unmarked waits on the person');
    for (const off of offs) {
      const r = run({ implement: 't1' }, off as object);
      assert.equal(stepRaise(steps[0], r, steps, reads(settled, stuck), spent), null);
      assert.deepEqual(answerLines(steps, r, d, settled, stuck, asked, spent), {}, 'no answer line: the ask would not be honoured');
      assert.deepEqual(retryOffers(steps, r, d, settled, stuck, asked, spent), [], 'no try offered: the ask would not be honoured');
    }
    assert.notDeepEqual(answerLines(steps, run({ implement: 't1' }), d, settled, stuck, asked, spent), {}, 'unmarked, it is answered');
  });
});
