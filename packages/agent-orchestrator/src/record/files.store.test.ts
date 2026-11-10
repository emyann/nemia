/**
 * The run store's two reads of a store that holds hundreds: `runs.find`, one run by id, found among the ids the store lists and never
 * read by a path made of the id; and `keptRuns`, every run projected off a memo keyed by the run's stamp, which every read that wants
 * a little of every run goes through. And a run's labels, a person's file beside the record (`runs/<id>.labels`): composed onto every
 * read, never written into the record, written whole and removed by an empty map or with the run, and in the run's stamp.
 *
 * `WF_ROOT` is set before the import, since the store reads it as it loads.
 */
import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { scratch } from 'test-kit/scratch';

const ROOT = scratch('wf-files-store-');
process.env.WF_ROOT = ROOT;
const { filesStore: runStore, keptRuns, labelsFile, writeLabels } = await import('./files.store.ts');
const { runsDir, runFile, restStamps } = await import('./record.store.ts');
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

/** What `body` wrote to stderr while it ran, line by line, and what it answered. */
const stderrOf = <T>(body: () => T): { lines: string[]; value: T } => {
  const lines: string[] = [];
  const write = process.stderr.write.bind(process.stderr);
  process.stderr.write = (chunk: string | Uint8Array) => {
    lines.push(...String(chunk).split('\n').filter(Boolean));
    return true;
  };
  try {
    return { lines, value: body() };
  } finally {
    process.stderr.write = write;
  }
};

test("a run's labels are a person's file beside the record: composed on every read, never written into it, and their write moves the stamp", async (t) => {
  await t.test(
    '`runs/<id>.labels` is read onto the run as `labels` by read, find, list and keptRuns; a run with none reads no `labels` key',
    () => {
      put('r-labelled');
      put('r-unlabelled');
      assert.equal(labelsFile('r-labelled'), path.join(runsDir(), 'r-labelled.labels'));
      fs.writeFileSync(labelsFile('r-labelled'), JSON.stringify({ team: 'core', tier: 'gold' }));
      const labels = { team: 'core', tier: 'gold' };
      assert.deepEqual(runStore.runs.read('r-labelled').labels, labels);
      assert.deepEqual(runStore.runs.find('r-labelled')?.labels, labels);
      assert.deepEqual(runStore.runs.list(() => {}).find((r) => r.id === 'r-labelled')?.labels, labels);
      assert.deepEqual(
        keptRuns(undefined, (r) => [r.id, r.labels]),
        [
          ['r-labelled', labels],
          ['r-unlabelled', undefined],
        ],
      );
      assert.equal('labels' in runStore.runs.read('r-unlabelled'), false);
    },
  );

  await t.test('a run the memo keeps is listed as the very run given, its labels not read again', () => {
    put('r-kept');
    fs.writeFileSync(labelsFile('r-kept'), JSON.stringify({ team: 'core' }));
    const kept = { ...runStore.runs.read('r-kept'), brief: 'kept' };
    const listed = runStore.runs.list(
      () => {},
      (id) => (id === 'r-kept' ? kept : undefined),
    );
    assert.equal(
      listed.find((r) => r.id === 'r-kept'),
      kept,
    );
  });

  await t.test('`rewrite` writes no `labels` key into the record, and a `labels` key the record carries is not read as labels', () => {
    put('r-labelled');
    writeLabels('r-labelled', { team: 'core' });
    assert.ok(runStore.runs.rewrite({ ...runStore.runs.read('r-labelled'), brief: 'changed' }));
    const written = JSON.parse(fs.readFileSync(runFile('r-labelled'), 'utf8')) as Record<string, unknown>;
    assert.equal(written.brief, 'changed');
    assert.equal('labels' in written, false);
    assert.deepEqual(runStore.runs.read('r-labelled').labels, { team: 'core' });
    put('r-labels-in-record', { ...aRecord('r-labels-in-record'), labels: { team: 'stale' } });
    assert.equal('labels' in runStore.runs.read('r-labels-in-record'), false, 'only the file says a run is labelled');
  });

  await t.test('`writeLabels` writes the whole map over the one there, an empty map removes the file, and no hidden file is left', () => {
    put('r-labelled');
    runStore.labels.put('r-labelled', { a: '1', b: '2' });
    runStore.labels.put('r-labelled', { b: '3' });
    assert.deepEqual(JSON.parse(fs.readFileSync(labelsFile('r-labelled'), 'utf8')), { b: '3' });
    assert.deepEqual(runStore.runs.read('r-labelled').labels, { b: '3' });
    runStore.labels.put('r-labelled', {});
    assert.equal(fs.existsSync(labelsFile('r-labelled')), false);
    assert.equal('labels' in runStore.runs.read('r-labelled'), false);
    runStore.labels.put('r-labelled', {});
    assert.equal(fs.existsSync(labelsFile('r-labelled')), false, 'removing none is no refusal');
    assert.deepEqual(fs.readdirSync(runsDir()), ['r-labelled.json']);
  });

  await t.test(
    'a labels file that is no JSON object of strings reads as no labels, and is said, naming the file and the verb that mends it',
    () => {
      for (const [id, text] of [
        ['r-labels-text', 'not json'],
        ['r-labels-list', '["team"]'],
        ['r-labels-number', '{"team": 3}'],
      ] as const) {
        put(id);
        fs.writeFileSync(labelsFile(id), text);
        const { lines, value } = stderrOf(() => runStore.runs.read(id));
        assert.equal('labels' in value, false, id);
        assert.equal(lines.length, 1, `${id} said once: ${lines.join('\n')}`);
        assert.ok(lines[0].includes(labelsFile(id)), lines[0]);
        assert.ok(lines[0].includes(`nemia label run ${id}`), lines[0]);
      }
    },
  );

  await t.test("the run's rest stamp moves when its labels are written, and again when they are removed", () => {
    put('r-labels-stamp');
    const before = restStamps().get('r-labels-stamp');
    runStore.labels.put('r-labels-stamp', { team: 'core' });
    const written = restStamps().get('r-labels-stamp');
    runStore.labels.put('r-labels-stamp', {});
    const removed = restStamps().get('r-labels-stamp');
    assert.ok(before);
    assert.notEqual(written, before);
    assert.notEqual(removed, written);
  });

  await t.test('`nemia rm` removes the labels file with the run', () => {
    put('r-labels-rm');
    runStore.labels.put('r-labels-rm', { team: 'core' });
    assert.ok(runStore.runs.forget('r-labels-rm').includes(path.join('runs', 'r-labels-rm.labels')));
    assert.equal(fs.existsSync(labelsFile('r-labels-rm')), false);
  });
});
