/**
 * The run store's two reads of a store that holds hundreds: `runs.find`, one run by id, found among the ids the store lists and never
 * read by a path made of the id; and `keptRuns`, every run projected off a memo keyed by the run's stamp, which every read that wants
 * a little of every run goes through.
 *
 * `WF_ROOT` is set before the import, since the store reads it as it loads.
 */
import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { scratch } from '../../test/scratch.ts';

const ROOT = scratch('wf-files-store-');
process.env.WF_ROOT = ROOT;
const { runStore, keptRuns } = await import('./files.store.ts');
const { runsDir, runFile } = await import('./record.store.ts');
const { recordMemo } = await import('../rest/index.ts');
const { metered } = await import('../meter/tally.store.ts');

/** A folder run's record as the tick writes one. */
const aRecord = (id: string) => ({
  id,
  workspace: ROOT,
  brief: `the brief of ${id}`,
  workflowDir: path.join(ROOT, 'workflows', 'dev'),
  place: { kind: 'folder' },
  steps: { work: { taskId: `${id}-work` } },
  createdAt: '2026-10-16T12:00:00.000Z',
});

const put = (id: string, record: unknown = aRecord(id)): void =>
  fs.writeFileSync(runFile(id), typeof record === 'string' ? record : JSON.stringify(record, null, 2));

beforeEach(() => {
  fs.rmSync(runsDir(), { recursive: true, force: true });
  fs.mkdirSync(runsDir(), { recursive: true });
});

test('`runs.find`: one run by id, among the ids the store lists, never by a path made of the id', async (t) => {
  await t.test('a listed run is found as `runs.read` reads it, and at the cost of its one record whatever the store holds', async () => {
    put('r-one');
    assert.deepEqual(runStore.runs.find('r-one'), runStore.runs.read('r-one'));
    const alone = (await metered(async () => runStore.runs.find('r-one'))).tallies?.records;
    for (let n = 0; n < 200; n++) put(`fin-${String(n).padStart(3, '0')}`);
    const among = (await metered(async () => runStore.runs.find('r-one'))).tallies?.records;
    assert.equal(alone, 1, 'one record read');
    assert.equal(among, alone, 'and one still, with two hundred other records in the store');
  });

  await t.test(
    'REFUSED: an id the store does not list, one climbing out with `..`, and an absolute one — each undefined, no file read outside runs/',
    () => {
      put('r-one');
      const outside = path.join(ROOT, 'outside.json');
      fs.writeFileSync(outside, JSON.stringify(aRecord('outside')));
      assert.equal(runStore.runs.find('r-nothing'), undefined, 'an id the store does not list');
      assert.equal(runStore.runs.find('../outside'), undefined, 'an id climbing out of the store');
      assert.equal(runStore.runs.find(path.join(ROOT, 'outside')), undefined, 'an absolute id');
      assert.equal(runStore.runs.find(''), undefined, 'no id at all');
      assert.ok(fs.existsSync(outside), 'and the file outside runs/ is untouched');
    },
  );

  await t.test(
    'a record that does not read as a run is undefined, said with its fix, and said once a process on stderr, as `runs.list` says it',
    (c) => {
      put('r-bad', '{"id": "r-bad"');
      const said: string[] = [];
      assert.equal(
        runStore.runs.find('r-bad', (line) => said.push(line)),
        undefined,
      );
      assert.equal(said.length, 1);
      assert.match(said[0], /^left out: run r-bad: its record, .*is not JSON/);
      assert.match(said[0], /Only the tick writes a record/);

      const wrote: string[] = [];
      c.mock.method(process.stderr, 'write', (line: string) => {
        wrote.push(line);
        return true;
      });
      assert.equal(runStore.runs.find('r-bad'), undefined);
      assert.equal(runStore.runs.find('r-bad'), undefined);
      assert.equal(wrote.length, 1, `said once a process, not ${wrote.length} times`);
    },
  );
});

/** Every run as `keptRuns` projects it here: its id and its brief, which a record alone says. */
const briefs = (memo?: ReturnType<typeof recordMemo<{ id: string; brief: string }>>) =>
  keptRuns(memo, (run) => ({ id: run.id, brief: run.brief }), { WF_VERIFY_REST: '0' });

test('a warm read through a memo reads no record whose run has not moved, however many the store holds, and answers a cold read’s own', async () => {
  put('r-moving');
  const memo = recordMemo<{ id: string; brief: string }>();
  briefs(memo);
  const few = (await metered(async () => briefs(memo))).tallies?.records;
  for (let n = 0; n < 200; n++) put(`fin-${String(n).padStart(3, '0')}`);
  briefs(memo);
  const many = (await metered(async () => briefs(memo))).tallies?.records;
  assert.equal(few, 0, 'nothing moved, so nothing is read');
  assert.equal(many, few, "a warm read reads no finished run's record, however many there are");
  assert.deepEqual(briefs(memo), briefs(), "the warm answer is a cold read's own: nothing a reader of it shows changes");
});

test('a run whose record is rewritten is read again, and one removed leaves the memo', async () => {
  put('r-edit');
  put('r-go');
  const memo = recordMemo<{ id: string; brief: string }>();
  briefs(memo);
  put('r-edit', { ...aRecord('r-edit'), brief: 'edited' });
  fs.rmSync(runFile('r-go'));
  const after = (await metered(async () => briefs(memo))).tallies?.records;
  assert.equal(after, 1, 'the record that was rewritten, and no other');
  assert.deepEqual(briefs(memo), [{ id: 'r-edit', brief: 'edited' }]);
  assert.deepEqual([...memo.runs.keys()], ['r-edit']);
});
