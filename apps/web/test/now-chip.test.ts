/**
 * Where a runs-page row's step stands, as its chip reads it (`nowStandsOf`, src/lib/nowChip.ts), and how many runs of the page wait on
 * a run (`waitersOf`). The chip's colour by where it stands is the contract's (`contracts/now-chip.contract.ts`), proved there: no row
 * here restates a tone.
 */
import { describe, test } from 'vitest';
import assert from 'node:assert/strict';
import type { WaitOn } from 'objects';
import type { NowStands } from '../contracts/now-chip.contract.ts';
import { nowStandsOf, waitersOf } from '../src/lib/nowChip.ts';
import { type StepState, waitsOnPerson } from '../src/lib/status.ts';
import { summary } from './run.fixture.ts';

/** Where each state stands on a run nobody holds, waiting on no thing. */
const STANDS: Record<StepState, NowStands> = {
  working: 'atWork',
  checking: 'atWork',
  failed: 'failed',
  'failed-check': 'failed',
  unreadable: 'failed',
  held: 'held',
  waiting: 'toCome',
  'waiting-for-slot': 'waitsForASlot',
  paused: 'atRest',
  cancelled: 'atRest',
  skipped: 'atRest',
  unknown: 'atRest',
  sent: 'atRest',
  verified: 'atRest',
  unverified: 'atRest',
  'asks-in-session': 'toCome',
  blocked: 'toCome',
  'awaiting-approval': 'toCome',
  exhausted: 'toCome',
  'over-budget': 'toCome',
  'budget-exhausted': 'toCome',
  denied: 'toCome',
  unsigned: 'toCome',
};

describe('nowStandsOf: where a step stands, by its state, what it waits on and the hold', () => {
  test('every state on a run nobody holds, waiting on no thing', () => {
    for (const [state, stands] of Object.entries(STANDS) as Array<[StepState, NowStands]>)
      assert.equal(nowStandsOf(state, null, false), stands, state);
  });
  test('a step to come by what it waits on: another run or the checkout, the pause, a hold', () => {
    const on: Record<WaitOn, NowStands> = {
      run: 'waitsOnARun',
      base: 'waitsOnARun',
      limit: 'waitsForASlot',
      pause: 'atRest',
      hold: 'held',
    };
    for (const [thing, stands] of Object.entries(on) as Array<[WaitOn, NowStands]>)
      assert.equal(nowStandsOf('waiting', thing, false), stands, thing);
  });
  test('on a held run, a step not started stands as held, and one at work or failed as itself', () => {
    assert.equal(nowStandsOf('waiting', null, true), 'held');
    assert.equal(nowStandsOf('waiting', 'run', true), 'held');
    assert.equal(nowStandsOf('waiting-for-slot', 'limit', true), 'held');
    assert.equal(nowStandsOf('working', null, true), 'atWork');
    assert.equal(nowStandsOf('failed', null, true), 'failed');
  });
  test('on a run someone has in hand, a step that waits on a person stands as assigned, and every other as it would; a hold comes first', () => {
    for (const [state, stands] of Object.entries(STANDS) as Array<[StepState, NowStands]>) {
      assert.equal(nowStandsOf(state, null, false, true), waitsOnPerson(state, false) ? 'assigned' : stands, state);
      assert.equal(nowStandsOf(state, null, true, true), nowStandsOf(state, null, true), `${state}, held`);
    }
  });
});

/** A run of the page, `id`, waiting on the runs `on` and held until the runs `until` (each `[run, landed]`). */
const row = (id: string, on: string[] = [], until: Array<[string, boolean]> = [], missing = false) =>
  summary([['design', 'waiting']], {
    id,
    waiting:
      on.length === 0
        ? null
        : { runs: on.map((run) => ({ run, missing, cancelledAt: null, failed: false })), word: '', advice: '', waitingOnYou: false },
    holding:
      until.length === 0
        ? null
        : {
            at: '2026-11-15T00:00:00.000Z',
            runs: until.map(([run, landed]) => ({ run, missing: false, cancelledAt: null, failed: false, released: landed })),
            word: '',
            advice: '',
            waitingOnYou: false,
          },
  });

describe('waitersOf: the runs of the page that wait on a run, on its checkout, or are held until it succeeds', () => {
  test('a wait and an unlanded hold each count once', () => {
    const rows = [row('a'), row('b', ['a']), row('c', [], [['a', false]]), row('d', ['x'])];
    assert.equal(waitersOf(rows, 'a').length, 2);
    assert.equal(waitersOf(rows, 'x').length, 1);
    assert.equal(waitersOf(rows, 'b').length, 0);
  });
  test('a hold on a run that landed, a missing run and the run itself are not counted', () => {
    assert.equal(waitersOf([row('c', [], [['a', true]])], 'a').length, 0);
    assert.equal(waitersOf([row('b', ['a'], [], true)], 'a').length, 0);
    assert.equal(waitersOf([row('a', ['a'], [['a', false]])], 'a').length, 0);
  });
  test('a run that both waits on and is held until the run is one run', () => {
    assert.equal(waitersOf([row('b', ['a'], [['a', false]])], 'a').length, 1);
  });
  test('a run whose step waits on the checkout counts in the fan of the run whose ending has it, once', () => {
    const onCheckout = (id: string, holder: string, waitsOn: string[] = []) => {
      const r = row(id, waitsOn);
      return { ...r, steps: [{ ...r.steps[0], on: 'base' as const, baseHeldBy: { run: holder, step: 'land' } }] };
    };
    const rows = [row('a'), onCheckout('b', 'a'), onCheckout('c', 'a', ['a']), row('d', ['a'])];
    assert.equal(waitersOf(rows, 'a').length, 3);
    assert.equal(waitersOf(rows, 'b').length, 0);
    assert.equal(waitersOf([onCheckout('a', 'a')], 'a').length, 0, 'never the run itself');
  });
});
