/**
 * `list(taskIds)`: the views of some tasks, each journal read once and the harnesses looked at once for those in flight among them
 * (`viewsOf` in engine.ts). What the api's list of runs reads for the runs it has not kept, in place of `list()`, which reads every
 * journal in the store, or a `view` each, which observes its harness for each task in flight.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import type { PromiseJournal, Sighting } from '../src/facade.ts';
import { Engine, promiseEngine } from '../src/index.ts';
import { scratch } from './scratch.ts';

/** A harness whose sessions are what the test says, counting its observes. */
const harness = () => {
  const sessions = new Map<string, Sighting>();
  const counts = { observe: 0 };
  const runner = {
    async spawn(r: { name: string }) {
      sessions.set(r.name, { sessionId: `s-${sessions.size + 1}`, state: 'working', busy: true });
    },
    async observe() {
      counts.observe++;
      return new Map(sessions);
    },
    async stop() {},
    async logs(sessionId: string) {
      return `logs of ${sessionId}`;
    },
  };
  return { sessions, counts, runner };
};

/** Three tasks settled, two in flight, one filed and never started. */
const board = async () => {
  const h = harness();
  const root = scratch('ae-list-some-root-');
  const engine = promiseEngine(Engine.layer({ root, harnesses: { mine: h.runner } }));
  const cwd = scratch('ae-list-some-cwd-');
  const settled = [await engine.file({ brief: 'a', cwd }), await engine.file({ brief: 'b', cwd }), await engine.file({ brief: 'c', cwd })];
  await engine.tick();
  for (const id of settled) h.sessions.set(`ae/${id}/1`, { ...h.sessions.get(`ae/${id}/1`)!, state: 'completed', busy: false });
  await engine.tick();
  const flying = [await engine.file({ brief: 'd', cwd }), await engine.file({ brief: 'e', cwd })];
  await engine.tick();
  const queued = await engine.file({ brief: 'f', cwd, queued: true });
  return { engine, root, ...h, settled, flying, queued };
};

test('the views of some tasks are their views, each journal read once and the harness observed once for all those in flight', async () => {
  const { engine, root, runner, counts, settled, flying, queued } = await board();
  const asked = [flying[1], settled[0], queued, flying[0], settled[0]];
  const one = async (id: string) => engine.view(id);
  const expected = await Promise.all([...new Set(asked)].map(one));
  const cold = promiseEngine(Engine.layer({ root, harnesses: { mine: runner } }));

  const reads = cold.io().reads;
  const observes = counts.observe;
  const { views } = await cold.list(asked);
  assert.deepEqual(
    views.map((v) => v.id),
    [flying[1], settled[0], queued, flying[0]],
    'in the order asked, with no id twice',
  );
  assert.deepEqual(
    views.map((v) => v.phase),
    expected.map((v) => v.phase),
  );
  assert.deepEqual(
    views.map((v) => v.state),
    expected.map((v) => v.state),
  );
  assert.deepEqual(
    views.map((v) => v.phase),
    ['running (working)', 'succeeded', 'pending', 'running (working)'],
  );
  assert.equal(
    cold.io().reads - reads,
    4,
    "an engine that never read them reads a journal for each task asked, and none of the store's other two",
  );
  assert.equal(counts.observe - observes, 1, 'one look at the harness for the two in flight');
  const again = cold.io().reads;
  await cold.list(asked);
  assert.equal(cold.io().reads - again, 0, 'and once read, a journal nothing has written to since is not read again');
});

test('the views of tasks none of which is in flight observe nothing', async () => {
  const { engine, counts, settled, queued } = await board();
  const observes = counts.observe;
  const { views } = await engine.list([...settled, queued]);
  assert.deepEqual(
    views.map((v) => v.phase),
    ['succeeded', 'succeeded', 'succeeded', 'pending'],
  );
  assert.equal(counts.observe - observes, 0);
  assert.deepEqual(await engine.list([]), { views: [], unreadable: [] });
});

test('with no ids, every task on the board over one observation, as before', async () => {
  const { engine, counts, settled, flying, queued } = await board();
  const observes = counts.observe;
  const { views } = await engine.list();
  assert.deepEqual(new Set(views.map((v) => v.id)), new Set([...settled, ...flying, queued]));
  assert.equal(counts.observe - observes, 1);
});

/** A `measured` line whose usage no runtime wrote, as a person's or another program's edit leaves one. */
const MISWRITTEN = JSON.stringify({ kind: 'measured', at: '2026-09-28T00:00:00Z', attempt: 1, usage: { turns: 'three' } }) + '\n';

test('a task whose journal holds an entry no runtime wrote is left out of `list()` and `list(ids)` and named once, as the pass says it; the others are answered', async () => {
  const { engine, root, settled, flying, queued } = await board();
  const [bad, other] = [flying[1], flying[0]];
  const file = path.join(root, 'tasks', `${bad}.jsonl`);
  fs.appendFileSync(file, MISWRITTEN);
  const said = (await engine.tick()).unreadable;
  assert.equal(said.length, 1);
  assert.ok(said[0].startsWith(`${bad}'s journal (${file}), entry `), said[0]);

  const some = await engine.list([other, bad, settled[0], bad]);
  assert.deepEqual(
    some.views.map((v) => v.id),
    [other, settled[0]],
  );
  assert.deepEqual(some.unreadable, [{ taskId: bad, why: said[0] }], 'named once, though asked twice, in the words of the pass');

  const every = await engine.list();
  assert.deepEqual(new Set(every.views.map((v) => v.id)), new Set([...settled, other, queued]));
  assert.deepEqual(every.unreadable, [{ taskId: bad, why: said[0] }]);
});

test('any other failure of a read fails `list()`: a store that cannot be listed', async () => {
  const journal: PromiseJournal = {
    async append() {},
    async read() {
      return [];
    },
    async list() {
      throw new Error('fake: the store is gone');
    },
    async feed() {
      return { entries: [], cursor: 0 };
    },
  };
  const engine = promiseEngine(Engine.layer({ journal, harnesses: { mine: harness().runner } }));
  await assert.rejects(engine.list(), (err: Error) => err.message.includes('fake: the store is gone'));
});

test('REFUSED: `list` handed anything but a list of task ids, or more than one argument, says what it takes', async () => {
  const { engine, settled } = await board();
  const untyped = engine.list as (...args: unknown[]) => Promise<unknown>;
  for (const args of [[settled[0]], [[1]], [{ ids: settled }], [settled, 'more'], [null]]) {
    assert.throws(
      () => untyped(...args),
      (err: Error & { exitCode?: number }) =>
        err.message.startsWith('list: takes the task ids to view, a list of strings, or nothing for every task') && err.exitCode === 2,
      JSON.stringify(args),
    );
  }
});
