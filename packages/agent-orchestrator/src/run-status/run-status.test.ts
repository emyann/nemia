/**
 * A run's observed status as a record (`run-status.ts`): the text two records are compared by leaves out the times measured to the read of
 * a run going, and nothing else; a plain list serves the status without the frame's parts, a list asked by state with them, a going run's
 * clock laid to the instant of the read.
 */
import { describe, test } from 'vitest';
import assert from 'node:assert/strict';
import { comparedText, servedStatus, type StatusRecord } from './run-status.ts';
import { recordIn } from './run-status.store.ts';

const clock = (wallMs: number) => ({ wallMs, sessionsMs: wallMs - 10, checksMs: 0, personMs: 0, slotMs: 0, restMs: 10 });

/** A record of a run in `state` whose clock was measured at `at`, `growing` the part that grows: the anchor only for a run going. */
const recordOf = (state: string, at: number, growing = 'sessionsMs', extra: object = {}) => {
  const going = state !== 'finished';
  const read = recordIn(
    JSON.stringify({
      spec: { steps: [] },
      status: {
        phase: 'running',
        state,
        wallMs: at - 1000,
        clock: clock(at - 1000),
        stepCosts: null,
        waitingSince: null,
        finishedAt: null,
        outcome: null,
        ...extra,
      },
      ...(going ? { anchor: { at, growing } } : {}),
    }),
  );
  assert.ok(read !== null);
  return read satisfies StatusRecord;
};

describe('the text two records are compared by', () => {
  test('is one text for a run going read at two instants', () => {
    assert.equal(comparedText(recordOf('inFlight', 5000)), comparedText(recordOf('inFlight', 9000)));
  });

  test('differs where the part that grows, or any other field, moved', () => {
    const base = comparedText(recordOf('inFlight', 5000));
    assert.notEqual(comparedText(recordOf('inFlight', 5000, 'checksMs')), base);
    assert.notEqual(comparedText(recordOf('inFlight', 5000, 'sessionsMs', { phase: 'waiting' })), base);
  });

  test('keeps a finished run’s clock, which stands still', () => {
    assert.notEqual(comparedText(recordOf('finished', 5000)), comparedText(recordOf('finished', 9000)));
  });

  test('is the same for a record whatever order its keys were written in', () => {
    assert.equal(comparedText({ a: 1, b: { c: 2, d: 3 } }), comparedText({ b: { d: 3, c: 2 }, a: 1 }));
  });
});

describe('the status a record serves', () => {
  test('a plain list serves none of the frame’s parts', () => {
    const served = servedStatus(recordOf('inFlight', 5000), undefined);
    for (const key of ['state', 'wallMs', 'clock', 'stepCosts', 'waitingSince', 'finishedAt', 'outcome']) assert.ok(!(key in served), key);
    assert.equal(served.phase, 'running');
  });

  test('a list asked by state lays a going run’s clock to the instant of the read', () => {
    const served = servedStatus(recordOf('inFlight', 5000), 5600);
    assert.equal(served.wallMs, 4000 + 600);
    assert.equal(served.clock?.wallMs, served.wallMs);
    assert.equal(served.clock?.sessionsMs, 3990 + 600);
    assert.equal(served.clock?.restMs, 10);
  });

  test('a finished run’s frame is served as it was recorded', () => {
    const record = recordOf('finished', 5000);
    assert.deepEqual(servedStatus(record, 90_000), record.status);
  });
});
