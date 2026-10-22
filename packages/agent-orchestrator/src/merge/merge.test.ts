/**
 * The table of what `nemia merge` refuses while its loop stands as it is (`mergeAsk`): a loop that goes round again on its own word, a
 * step of the loop that stopped, and a round still at work. Pure: the merge itself, on disk and on real git, is told in `ship.test.ts`
 * and `merge-round-walk.boundary.test.ts`.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mergeAsk, type MergeReads } from './merge.ts';
import type { StepStatus } from '../record/record.ts';
import type { Workflow } from '../workflow.ts';
import { names, run, step } from '../../test/assessed.ts';

/** implement ⇄ review: review closes the loop on implement. */
const LOOP: Workflow[] = [step('implement'), { ...step('review', ['implement']), loop: 'implement' }];
const LOOPING = run({ implement: 't1', review: 't2' });

/** Reads where each step stands as `standing` says (its status and its own), and whether the loop goes round itself. */
const reads = (standing: Record<string, StepStatus>, goesRound = false): MergeReads => ({
  standingOf: (s) => ({ status: standing[s.name], own: standing[s.name] }),
  stopped: () => false,
  goesRound: () => goesRound,
});

/** What `nemia merge r-1` answers over `reads`: its refusal, or a failure naming the ask it made instead. */
const refusalOf = (given: MergeReads): string => {
  const answer = mergeAsk(LOOP, LOOPING, undefined, given, [], () => assert.fail('no trial merge is made'), '2026-01-01T00:00:00Z');
  assert.ok('refusal' in answer, `refused, not asked: ${JSON.stringify(answer)}`);
  return answer.refusal;
};

test('`mergeAsk` refuses while the loop cannot take a merge as it stands, naming the verb that moves it', async (t) => {
  await t.test('REFUSED: the loop goes round again on its own word: merge once it ends', () => {
    names(refusalOf(reads({ implement: 'succeeded', review: 'succeeded' }, true)), 'round 2', 'nemia merge r-1 review');
  });
  await t.test("REFUSED: the loop's target stopped in the round: try it again, or see why", () => {
    names(
      refusalOf(reads({ implement: 'blocked', review: 'blocked' })),
      'implement',
      'blocked',
      'nemia retry r-1 implement',
      'nemia decide r-1',
    );
  });
  await t.test('REFUSED: the looping step itself stopped: try it again', () => {
    names(refusalOf(reads({ implement: 'succeeded', review: 'unsigned' })), 'review', 'unsigned', 'nemia retry r-1 review');
  });
  await t.test('REFUSED: the round is still at work, and nothing in it stopped: wait for it', () => {
    names(refusalOf(reads({ implement: 'succeeded', review: 'running' })), 'running', 'nemia ls r-1');
  });
  await t.test('a loop that is over holds no merge off: what refuses it is further on, here a target with no branch yet', () => {
    names(refusalOf(reads({ implement: 'verified', review: 'verified' })), 'implement', 'no branch', 'nemia ls r-1');
  });
});
