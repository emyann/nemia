/**
 * The facts a rule is judged on, from fixture reads of a run (`factsOf`), as one table: all five hold where all agree, and each fails on
 * the state that breaks it: a blocked step or a question with no recommendation, a check that refused, did not finish or is none, a loop
 * asking again or accepted by a person over its findings, a step at its cap, a question or a need left open, and another step waiting.
 */
import assert from 'node:assert/strict';
import test from 'node:test';
import { factsOf, type Seen } from './index.ts';

/** What admission reads of a run where all agree. */
const AGREED: Seen = {
  closeout: { outcome: 'done' },
  questions: [],
  verdict: 0,
  loops: [{ again: false, personAccepted: false }],
  overBudget: false,
  spend: 4.5,
  othersWaiting: false,
};

test('`factsOf`: all five hold where all agree, and each fails on the state that breaks it', async (t) => {
  await t.test('all five hold where all agree, with the spend read as it is', () => {
    assert.deepEqual(factsOf(AGREED), {
      recommends: true,
      checked: true,
      accepted: true,
      withinBudget: true,
      nothingOpen: true,
      spend: 4.5,
    });
    assert.equal(factsOf({ ...AGREED, loops: [] }).accepted, true, 'no loop signed, no reviewer refused');
  });
  await t.test('REFUSED recommends: a blocked step, one that signed nothing, and a question with no recommended answer', () => {
    assert.equal(factsOf({ ...AGREED, closeout: { outcome: 'blocked', needs: 'a key' } }).recommends, false);
    assert.equal(factsOf({ ...AGREED, closeout: undefined }).recommends, false);
    assert.equal(factsOf({ ...AGREED, questions: [{ recommended: 'Strict' }, { recommended: null }] }).recommends, false);
    assert.equal(factsOf({ ...AGREED, questions: [{ recommended: 'Strict' }] }).recommends, true);
  });
  await t.test('REFUSED checked: a check that refused, one that did not finish, and a step with no check', () => {
    assert.equal(factsOf({ ...AGREED, verdict: 1 }).checked, false);
    assert.equal(factsOf({ ...AGREED, verdict: 'unfinished' }).checked, false);
    assert.equal(factsOf({ ...AGREED, verdict: undefined }).checked, false, 'strict: no check is no pass');
  });
  await t.test('REFUSED accepted: a loop that asks again, exhausted or not, and one a person accepted over its findings', () => {
    assert.equal(
      factsOf({
        ...AGREED,
        loops: [
          { again: false, personAccepted: false },
          { again: true, personAccepted: false },
        ],
      }).accepted,
      false,
    );
    assert.equal(factsOf({ ...AGREED, loops: [{ again: false, personAccepted: true }] }).accepted, false);
  });
  await t.test('REFUSED withinBudget: a step at or past its cap', () => {
    assert.equal(factsOf({ ...AGREED, overBudget: true }).withinBudget, false);
  });
  await t.test('REFUSED nothingOpen: a question asked, a need said, and another step waiting on the person', () => {
    assert.equal(factsOf({ ...AGREED, questions: [{ recommended: 'Strict' }] }).nothingOpen, false);
    assert.equal(factsOf({ ...AGREED, closeout: { outcome: 'done', needs: 'the key' } }).nothingOpen, false);
    assert.equal(factsOf({ ...AGREED, closeout: { outcome: 'done', needs: '  ' } }).nothingOpen, true, 'blank words need nothing');
    assert.equal(factsOf({ ...AGREED, othersWaiting: true }).nothingOpen, false);
  });
});
