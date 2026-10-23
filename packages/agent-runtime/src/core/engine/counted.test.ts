/**
 * A long-lived attempt's spend, journalled as it grows (`countedFacts`), and what the fold makes of it: the attempt's usage
 * replaced whole by each reading, kept by an end that carries none, and a job's spend untouched.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fold, nameFor, type Event, type Sighting, type Usage } from '../domain.ts';
import { countedFacts } from './counted.ts';
import { viewOfState } from './engine.ts';

const T0 = Date.parse('2026-01-01T00:00:00Z');
const at = (ms: number) => new Date(T0 + ms).toISOString();
const TASK = 't-1';

const filed = (longLived: boolean): Event => ({
  kind: 'filed',
  at: at(0),
  brief: 'b',
  cwd: '/r',
  queued: false,
  ...(longLived ? { restartPolicy: 'Always' as const } : {}),
});
const inFlight = (longLived: boolean, ...more: Event[]): Event[] => [
  filed(longLived),
  { kind: 'starting', at: at(1), attempt: 1 },
  { kind: 'spawned', at: at(2), attempt: 1 },
  ...more,
];
const seen = (usage?: Usage): Sighting => ({
  sessionId: 's1',
  state: 'input-required',
  busy: false,
  held: true,
  ...(usage ? { usage } : {}),
});
const counted = (usage: Usage, n = 1): Event => ({ kind: 'counted', at: at(10), attempt: n, usage });

const TWO_TURNS: Usage = {
  turns: 2,
  toolCalls: 1,
  inputTokens: 300,
  uncachedTokens: 10,
  cacheWriteTokens: 90,
  cacheReadTokens: 200,
  outputTokens: 40,
};

test("countedFacts, fold and the view: a long-lived attempt's counts journalled once a reading, none for a job, and how fold and the view read them", async (t) => {
  await t.test(
    'COUNTED: a long-lived attempt in flight whose sighting reports more than the record is written one counted entry, its counts and never a cost',
    () => {
      const state = fold(TASK, inFlight(true, counted({ turns: 1, outputTokens: 20 })));
      const facts = countedFacts(state, seen({ ...TWO_TURNS, costUsd: 0.5, apiMs: 900, toolMs: 30, unpricedModel: true }), at(20));
      assert.deepEqual(facts, [{ kind: 'counted', at: at(20), attempt: 1, usage: TWO_TURNS }]);
    },
  );

  await t.test('COUNTED: a job is written nothing for the same sighting — its spend is written at its end', () => {
    assert.deepEqual(countedFacts(fold(TASK, inFlight(false)), seen(TWO_TURNS), at(20)), []);
    assert.equal(
      countedFacts(fold(TASK, inFlight(true)), seen(TWO_TURNS), at(20)).length,
      1,
      'the control: filed long-lived, it is written',
    );
  });

  await t.test('COUNTED: nothing for a settled task, an ended attempt, no sighting, or a sighting without usage', () => {
    const settled = fold(TASK, inFlight(true, { kind: 'settled', at: at(5), outcome: 'stopped' }));
    assert.deepEqual(countedFacts(settled, seen(TWO_TURNS), at(20)), [], 'settled');
    const ended = fold(TASK, inFlight(true, { kind: 'ended', at: at(5), attempt: 1, sessionId: 's1', observed: 'failed', reason: 'lost' }));
    assert.deepEqual(countedFacts(ended, seen(TWO_TURNS), at(20)), [], 'ended');
    const open = fold(TASK, inFlight(true));
    assert.deepEqual(countedFacts(open, undefined, at(20)), [], 'not seen');
    assert.deepEqual(countedFacts(open, seen(), at(20)), [], 'seen busy, with no usage');
  });

  await t.test('COUNTED: a reading equal to the record by value is written nothing, whatever cost it carries beside the counts', () => {
    const state = fold(TASK, inFlight(true, counted(TWO_TURNS)));
    assert.deepEqual(countedFacts(state, seen({ ...TWO_TURNS, costUsd: 0.5 }), at(20)), []);
  });

  await t.test('COUNTED: a reading with fewer turns than the record is no count of this attempt, and is written nothing', () => {
    const state = fold(TASK, inFlight(true, counted(TWO_TURNS)));
    assert.deepEqual(countedFacts(state, seen({ turns: 1, outputTokens: 900 }), at(20)), []);
  });

  await t.test(
    'COUNTED: a compacted attempt whose reading lost its tokens but grew in turns is written them gone, and the fold drops the stale tokens',
    () => {
      const events = inFlight(true, counted(TWO_TURNS));
      const facts = countedFacts(fold(TASK, events), seen({ turns: 3, toolCalls: 2, compactions: 1 }), at(20));
      assert.deepEqual(facts, [{ kind: 'counted', at: at(20), attempt: 1, usage: { turns: 3, toolCalls: 2, compactions: 1 } }]);
      const usage = fold(TASK, [...events, ...facts]).attempts[0].usage;
      assert.deepEqual(usage, { turns: 3, toolCalls: 2, compactions: 1 }, 'no inputTokens left over from the reading before');
    },
  );

  await t.test('FOLD: a counted entry replaces the attempt usage whole, where a measured one merges into it', () => {
    const twice = fold(TASK, inFlight(true, counted({ turns: 1, inputTokens: 100 }), counted({ turns: 2 })));
    assert.deepEqual(twice.attempts[0].usage, { turns: 2 });
  });

  await t.test(
    'FOLD: an end with no usage keeps what was counted, an end with usage replaces it, and a cost measured after merges in',
    () => {
      const lost: Event = { kind: 'ended', at: at(30), attempt: 1, sessionId: 's1', observed: 'failed', reason: 'lost' };
      assert.deepEqual(fold(TASK, inFlight(true, counted(TWO_TURNS), lost)).attempts[0].usage, TWO_TURNS);
      const read = { ...lost, reason: 'harness' as const, usage: { turns: 3 } };
      assert.deepEqual(fold(TASK, inFlight(true, counted(TWO_TURNS), read)).attempts[0].usage, { turns: 3 });
      const measured: Event = { kind: 'measured', at: at(40), attempt: 1, usage: { costUsd: 0.25 } };
      assert.deepEqual(fold(TASK, inFlight(true, counted(TWO_TURNS), lost, measured)).attempts[0].usage, { ...TWO_TURNS, costUsd: 0.25 });
    },
  );

  await t.test('FOLD: a job with nothing counted folds no usage before its end, and none after an end that carries none', () => {
    assert.equal(fold(TASK, inFlight(false)).attempts[0].usage, null);
    const lost: Event = { kind: 'ended', at: at(30), attempt: 1, sessionId: 's1', observed: 'failed', reason: 'lost' };
    assert.equal(fold(TASK, inFlight(false, lost)).attempts[0].usage, null);
  });

  await t.test(
    "VIEW: a long-lived task shows its attempt's journalled counts, though the view's own sighting counts less; a job shows its sighting's",
    () => {
      const lower = new Map([[nameFor(TASK, 1), seen({ turns: 1 })]]);
      assert.deepEqual(viewOfState(fold(TASK, inFlight(true, counted(TWO_TURNS))), lower).usage, TWO_TURNS);
      assert.deepEqual(viewOfState(fold(TASK, inFlight(false)), lower).usage, { turns: 1 });
    },
  );
});
