/**
 * The list's memo of runs at rest (`restingRead`, resting.verb.ts): an answer kept for a run is given back while its files in the store,
 * its record and the engine's feed for its tasks stand, and a read that judges it afresh (`WF_VERIFY_REST`) refuses an answer the memo
 * gave otherwise. Each guard is made to refuse on a store of scratch files and a feed held in memory.
 *
 * A file of its own, since the store's stamps read every run under `WF_ROOT`, read as the store loads, so it is set before the import.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import type { Run } from '../record/record.ts';
import { scratch } from '../../test/scratch.ts';
import { promised } from '../../test/promised.ts';

const ROOT = scratch('wf-resting-');
fs.mkdirSync(path.join(ROOT, 'runs'), { recursive: true });
process.env.WF_ROOT = ROOT;
const { restingMemo, restingRead } = await import('./resting.verb.ts');
const { runWith } = await import('../runtime-client.ts');
const { NOTHING_READ, standingReader } = await import('../standing/standing.verb.ts');

/** The reader the memo reads heads through: these runs are folder runs, and none of their branches is asked. */
const git = standingReader(NOTHING_READ);

/** The engine's feed, in memory: one line a task's append, of the kind its event names; `broken` makes it unreadable. */
const feed: Array<{ taskId: string; event?: { kind: string } }> = [];
let broken = false;
const e = promised({
  feed: async (after: number) => {
    if (broken) throw new Error('the feed does not read');
    return { entries: feed.slice(after), cursor: feed.length };
  },
});

/** A folder run with one step, its task `<id>-work-1`, its record written in the store. */
function stored(id: string): Run {
  const run: Run = {
    id,
    workspace: ROOT,
    brief: 'Do it.',
    workflowDir: path.join(ROOT, 'team'),
    workflow: [],
    createdAt: '2026-10-04T10:00:00.000Z',
    place: { kind: 'folder' },
    steps: { work: { status: 'done', taskId: `${id}-work-1` } },
  } as Run;
  fs.writeFileSync(path.join(ROOT, 'runs', `${id}.json`), JSON.stringify(run));
  return run;
}

/** A memo holding `run`'s answer `{ said }`, kept by a read made on a feed already read once. */
async function memoOf(run: Run, said: string) {
  const memo = restingMemo<{ said: string }>();
  await runWith(e, restingRead(e, memo, false, git));
  (await runWith(e, restingRead<{ said: string }>(e, memo, false, git))).keep(run, { said }, [], () => new Map());
  return memo;
}

test('a run kept at rest is answered from memory while its files, its record and the feed for its tasks stand', async () => {
  const run = stored('kept');
  const memo = await memoOf(run, 'done');
  feed.push({ taskId: 'other-work-1' });
  assert.deepEqual(
    (await runWith(e, restingRead(e, memo, false, git))).kept(run),
    { said: 'done' },
    'a line of another run moves nothing of this one',
  );
});

test('REFUSED: a line of its task on the feed, its file in the store rewritten, or its record read otherwise takes the run out', async () => {
  const fed = stored('fed');
  const fedMemo = await memoOf(fed, 'done');
  feed.push({ taskId: 'fed-work-1' });
  assert.equal((await runWith(e, restingRead(e, fedMemo, false, git))).kept(fed), undefined, 'its task appended');
  assert.equal(fedMemo.runs.has('fed'), false);

  const written = stored('written');
  const writtenMemo = await memoOf(written, 'done');
  fs.writeFileSync(path.join(ROOT, 'runs', 'written.cancelled'), '2026-10-04T11:00:00.000Z');
  assert.equal((await runWith(e, restingRead(e, writtenMemo, false, git))).kept(written), undefined, 'a file beside its record');

  const read = stored('read');
  const readMemo = await memoOf(read, 'done');
  assert.equal((await runWith(e, restingRead(e, readMemo, false, git))).kept({ ...read, brief: 'Do it again.' }), undefined, 'its record');
});

test('REFUSED: a read whose feed another read went past keeps nothing, and a feed that does not read empties the memo', async () => {
  const run = stored('raced');
  const memo = restingMemo<{ said: string }>();
  await runWith(e, restingRead(e, memo, false, git));
  const slow = await runWith(e, restingRead<{ said: string }>(e, memo, false, git));
  feed.push({ taskId: 'raced-work-1' });
  await runWith(e, restingRead(e, memo, false, git));
  slow.keep(run, { said: 'done' }, [], () => new Map());
  assert.equal(memo.runs.has('raced'), false, 'its answer may stand on a journal from before the line the other read');

  const kept = await memoOf(run, 'done');
  broken = true;
  try {
    const unfed = await runWith(e, restingRead<{ said: string }>(e, kept, false, git));
    assert.equal(kept.runs.size, 0, 'emptied');
    unfed.keep(run, { said: 'done' }, [], () => new Map());
    assert.equal(kept.runs.size, 0, 'nothing kept by a read made without the feed');
  } finally {
    broken = false;
  }
});

test('REFUSED: a verified read refuses a run judged afresh otherwise than the memo answered it (WF_VERIFY_REST)', async () => {
  const run = stored('verified');
  const memo = await memoOf(run, 'done');
  const read = await runWith(e, restingRead<{ said: string }>(e, memo, true, git));
  assert.equal(read.verify, true);
  assert.deepEqual(read.kept(run), { said: 'done' });
  read.answered(run, { said: 'done' });
  let refused: unknown;
  try {
    read.answered(run, { said: 'blocked' });
  } catch (err) {
    refused = err;
  }
  assert.ok(refused instanceof Error, 'an answer the memo gave otherwise is refused');
  assert.match(refused.message, /answered verified differently from a fresh read \(WF_VERIFY_REST\)/);
  read.answered(stored('unkept'), { said: 'anything' });
});
