/**
 * The store's writers of a person's marks on a run against the machine (run-marks.ts): each event brought to a run carrying each set
 * of marks leaves its records as `runMarkMove` answers — moved, as they stood, or untouched where it refuses — so a move the machine
 * does not make is one the store does not write.
 */
import { describe, test } from 'vitest';
import assert from 'node:assert/strict';
import { scratch } from 'test-kit/scratch';
import { RUN_MARK_EVENTS, RUN_MARKS, runMarkMove, runMarkOf, type RunMark, type RunMarkEvent } from './run-marks.ts';
import { markerKeys, plantMarker, runsNow } from '../../testing.ts';

const ID = 'a-run-m4rk';

/** A store whose run `ID` carries the marks of `mark`, each record planted as its writer leaves it. */
function arranged(mark: RunMark) {
  const home = scratch('wf-marks-walk-');
  if (mark.includes('called-off')) plantMarker(home, ID, 'cancelled', '2026-11-14T00:00:00.000Z');
  if (mark.includes('pruned')) plantMarker(home, ID, 'pruned', JSON.stringify({ at: '2026-11-14T00:00:01.000Z', worktrees: [] }));
  if (mark.includes('held')) plantMarker(home, ID, 'hold', JSON.stringify({ at: '2026-11-14T00:00:02.000Z', until: [] }));
  return home;
}

/** The marks the run carries at the store `home`, by which of its three records are there. */
const marksAt = (home: string) => {
  const keys = markerKeys(home, ID);
  return runMarkOf({ cancelled: keys.includes('cancelled'), pruned: keys.includes('pruned'), held: keys.includes('hold') });
};

/** Each event as the store's writers bring it. */
const BROUGHT: Readonly<Record<RunMarkEvent, (home: string) => unknown>> = {
  hold: (home) => runsNow(home).holds.put(ID, [], {}),
  lift: (home) => runsNow(home).holds.lift(ID, '2026-11-14T00:00:02.000Z'),
  cancel: (home) => runsNow(home).runs.cancel(ID),
  prune: (home) => runsNow(home).runs.prune(ID, { at: '2026-11-14T00:00:03.000Z', worktrees: [] }),
  unprune: (home) => runsNow(home).runs.prune(ID, undefined),
};

describe('the store writes the moves the marks machine makes and no other: each event on each set of marks leaves the records where runMarkMove says', () => {
  for (const from of RUN_MARKS)
    for (const event of Object.keys(RUN_MARK_EVENTS) as RunMarkEvent[])
      test(`${event} on a run ${from}`, () => {
        const home = arranged(from);
        assert.equal(marksAt(home), from, 'the run carries the marks arranged');
        const move = runMarkMove(from, event);
        BROUGHT[event](home);
        assert.equal(marksAt(home), move.kind === 'edge' ? move.to : from);
      });
});
