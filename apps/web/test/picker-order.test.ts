/**
 * The order a picker offers its runs in (`pickedOf`, src/lib/pickerRuns.ts, read by `usePickerRuns`): the runs not finished, waiting and
 * in flight together, newest created first, then the finished runs in the list's order, each run once, and none the list could not judge.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { pickedOf } from '../src/lib/pickerRuns.ts';
import type { FinishedPage, FinishedRun, OpenRuns } from '../src/lib/api/runs.ts';
import { detail } from './run-fixtures.ts';

const AS_OF = '2026-09-30T00:00:00.000Z';

/** A run of the light answer, created at `createdAt`. */
const listed = (id: string, createdAt: string) => ({ ...detail({ id, createdAt }), wallMs: 0, finishedAt: null, clock: null });

/** A finished run, created at `createdAt`. */
const finished = (id: string, createdAt: string): FinishedRun => ({
  ...detail({ id, createdAt, status: 'succeeded', moving: false }),
  wallMs: 0,
  finishedAt: AS_OF,
  outcome: 'succeeded',
  clock: null,
});

/** The light answer, its waiting and in-flight runs as given. */
const openOf = (waiting: OpenRuns['waiting'], inFlight: OpenRuns['inFlight']): OpenRuns => ({
  asOf: AS_OF,
  counts: { waiting: waiting.length, inFlight: inFlight.length, finished: 0 },
  waiting,
  inFlight,
});

/** A page of the finished runs, with the token of the next. */
const page = (runs: FinishedRun[], next: string | null = null): FinishedPage => ({ asOf: AS_OF, total: runs.length, runs, continue: next });

const ids = (runs: ReadonlyArray<{ id: string }>): string[] => runs.map((run) => run.id);

test('pickedOf: the open runs newest created first, waiting and in flight together, then the finished in the order of their pages', () => {
  const open = openOf(
    [{ ...listed('r-wait', '2026-09-10T00:00:00.000Z'), stepCosts: null, waitingSince: null }],
    [listed('r-old', '2026-09-01T00:00:00.000Z'), listed('r-new', '2026-09-20T00:00:00.000Z')],
  );
  const picked = pickedOf(open, [
    page([finished('f-1', '2026-08-01T00:00:00.000Z'), finished('f-2', '2026-09-25T00:00:00.000Z')], 'p2'),
    page([finished('f-3', '2026-07-01T00:00:00.000Z')]),
  ]);
  assert.deepEqual(ids(picked.open), ['r-new', 'r-wait', 'r-old'], 'by creation, whatever the part of the answer');
  assert.deepEqual(ids(picked.finished), ['f-1', 'f-2', 'f-3'], "the list's order, page after page, not re-sorted by creation");
});

test('pickedOf: a run the list could not judge is not offered, and a run read twice is offered once, as open where it is', () => {
  const open = openOf([], [listed('r-1', '2026-09-01T00:00:00.000Z'), { id: 'r-broken', factory: null, unjudged: 'unreadable' }]);
  const picked = pickedOf(open, [
    page([finished('r-1', '2026-09-01T00:00:00.000Z'), finished('f-1', '2026-08-01T00:00:00.000Z')], 'p2'),
    page([finished('f-1', '2026-08-01T00:00:00.000Z'), finished('f-2', '2026-07-01T00:00:00.000Z')]),
  ]);
  assert.deepEqual(ids(picked.open), ['r-1']);
  assert.deepEqual(ids(picked.finished), ['f-1', 'f-2'], 'no run twice: a key of the list is a run');
});

test('pickedOf: no finished page read yet offers the open runs alone', () => {
  assert.deepEqual(pickedOf(openOf([], [listed('r-1', AS_OF)]), []), { open: [listed('r-1', AS_OF)], finished: [] });
});
