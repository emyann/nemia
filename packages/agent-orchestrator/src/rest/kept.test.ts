/**
 * The stamp-keyed memo of a projection of each run's record (`keptRecords`, kept.ts): the stamps and the reader are handed in, so the
 * test needs no store at all. A run whose stamp stands is answered from memory and never read; one whose stamp moved is read and
 * projected again; one gone from the stamps is gone from the memo; and under `verify` a projection the stamps do not watch is refused,
 * naming the run.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import type { Run } from '../record/record.ts';
import { keptRecords, recordMemo } from './kept.ts';

/** A record as the reader hands one back: only the fields the projections here read. */
const aRun = (id: string, brief: string): Run => ({ id, brief }) as Run;

/**
 * A reader over `briefs`, by id, counting every read it is asked for: what `find` is in the store, and what a test counts record reads
 * by here.
 */
const reader = (briefs: Record<string, string>) => {
  const read: string[] = [];
  return {
    read,
    find: (id: string) => {
      read.push(id);
      return id in briefs ? aRun(id, briefs[id]) : undefined;
    },
  };
};

const briefOf = (run: Run) => ({ id: run.id, brief: run.brief });

test('a run whose stamp stands is answered from memory and its record is not read; one whose stamp moved is read and projected again', () => {
  const memo = recordMemo<{ id: string; brief: string }>();
  const stamps = new Map([
    ['a', '1'],
    ['b', '1'],
  ]);
  const cold = reader({ a: 'the a', b: 'the b' });
  const first = keptRecords(memo, { stamps, find: cold.find, verify: false }, briefOf);
  assert.deepEqual(cold.read, ['a', 'b'], 'the first read reads every record');
  assert.deepEqual(first, [
    { id: 'a', brief: 'the a' },
    { id: 'b', brief: 'the b' },
  ]);

  const warm = reader({ a: 'the a', b: 'the b' });
  assert.deepEqual(keptRecords(memo, { stamps, find: warm.find, verify: false }, briefOf), first, 'the same answer');
  assert.deepEqual(warm.read, [], 'and no record read');

  const moved = reader({ a: 'the a', b: 'b, edited' });
  const after = keptRecords(
    memo,
    {
      stamps: new Map([
        ['a', '1'],
        ['b', '2'],
      ]),
      find: moved.find,
      verify: false,
    },
    briefOf,
  );
  assert.deepEqual(moved.read, ['b'], 'the run whose stamp moved, and no other');
  assert.deepEqual(after[1], { id: 'b', brief: 'b, edited' });
});

test('an id gone from the stamps is gone from the memo, and a run the reader does not answer for is left out and forgotten', () => {
  const memo = recordMemo<{ id: string; brief: string }>();
  const stamps = new Map([
    ['a', '1'],
    ['gone', '1'],
  ]);
  const first = reader({ a: 'the a', gone: 'the gone' });
  keptRecords(memo, { stamps, find: first.find, verify: false }, briefOf);
  assert.deepEqual([...memo.runs.keys()].sort(), ['a', 'gone']);

  const after = reader({ a: 'the a' });
  const listed = keptRecords(memo, { stamps: new Map([['a', '1']]), find: after.find, verify: false }, briefOf);
  assert.deepEqual(listed, [{ id: 'a', brief: 'the a' }]);
  assert.deepEqual([...memo.runs.keys()], ['a'], 'the run the store no longer stamps is out of the memo');

  const unread = reader({});
  const none = keptRecords(memo, { stamps: new Map([['a', '2']]), find: unread.find, verify: false }, briefOf);
  assert.deepEqual(none, [], 'a record the reader does not answer for is left out, as listRuns leaves one out');
  assert.deepEqual([...memo.runs.keys()], [], 'and is forgotten, not kept at its old stamp');
});

test('REFUSED under WF_VERIFY_REST: a projection kept that a fresh read does not give again, named by its run', () => {
  const memo = recordMemo<{ id: string; brief: string }>();
  const stamps = new Map([['a', '1']]);
  keptRecords(memo, { stamps, find: reader({ a: 'the a' }).find, verify: true }, briefOf);
  assert.throws(
    () => keptRecords(memo, { stamps, find: reader({ a: 'changed behind the stamp' }).find, verify: true }, briefOf),
    (err: Error) => {
      assert.match(err.message, /answered a differently from a fresh read \(WF_VERIFY_REST\)/);
      return true;
    },
  );
});

test('with no memo every record is read, and the answer is the memo’s own, in the store’s order', () => {
  const stamps = new Map([
    ['b', '1'],
    ['a', '1'],
  ]);
  const cold = reader({ a: 'the a', b: 'the b' });
  const listed = keptRecords(undefined, { stamps, find: cold.find, verify: false }, briefOf);
  assert.deepEqual(cold.read, ['a', 'b'], 'by id, as listRuns orders its runs, whatever order the stamps came in');
  assert.deepEqual(listed, keptRecords(recordMemo(), { stamps, find: reader({ a: 'the a', b: 'the b' }).find, verify: false }, briefOf));
});
