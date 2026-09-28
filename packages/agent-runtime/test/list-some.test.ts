/**
 * `list(taskIds)`: the views of some tasks, each journal read once and the harnesses looked at once for those in flight among them
 * (`viewsOf` in engine.ts). What the api's list of runs reads for the runs it has not kept, in place of `list()` — every journal in the
 * store, 1,850 on the live store on 2026-09-25 — or a `view` each, which observes its harness for each task in flight.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createEngine, type Sighting } from '../src/facade.ts';
import { scratch } from './scratch.ts';

/** A harness whose sessions are what the test says, counting its observes. */
const harness = () => {
  const sessions = new Map<string, Sighting>();
  const counts = { observe: 0 };
  const runner = {
    async spawn(r: { name: string }) { sessions.set(r.name, { sessionId: `s-${sessions.size + 1}`, state: 'working', busy: true }); },
    async observe() { counts.observe++; return new Map(sessions); },
    async stop() {},
    async logs(sessionId: string) { return `logs of ${sessionId}`; },
  };
  return { sessions, counts, runner };
};

/** Three tasks settled, two in flight, one filed and never started. */
const board = async () => {
  const h = harness();
  const engine = createEngine({ root: scratch('ae-list-some-root-'), harnesses: { mine: h.runner } });
  const cwd = scratch('ae-list-some-cwd-');
  const settled = [await engine.file({ brief: 'a', cwd }), await engine.file({ brief: 'b', cwd }), await engine.file({ brief: 'c', cwd })];
  await engine.tick();
  for (const id of settled) h.sessions.set(`ae/${id}/1`, { ...h.sessions.get(`ae/${id}/1`)!, state: 'completed', busy: false });
  await engine.tick();
  const flying = [await engine.file({ brief: 'd', cwd }), await engine.file({ brief: 'e', cwd })];
  await engine.tick();
  const queued = await engine.file({ brief: 'f', cwd, queued: true });
  return { engine, ...h, settled, flying, queued };
};

test('the views of some tasks are their views, each journal read once and the harness observed once for all those in flight', async () => {
  const { engine, counts, settled, flying, queued } = await board();
  const asked = [flying[1]!, settled[0]!, queued, flying[0]!, settled[0]!];
  const one = async (id: string) => engine.view(id);
  const expected = await Promise.all([...new Set(asked)].map(one));

  const reads = engine.io().reads;
  const observes = counts.observe;
  const views = await engine.list(asked);
  assert.deepEqual(views.map((v) => v.id), [flying[1], settled[0], queued, flying[0]], 'in the order asked, with no id twice');
  assert.deepEqual(views.map((v) => v.phase), expected.map((v) => v.phase));
  assert.deepEqual(views.map((v) => v.state), expected.map((v) => v.state));
  assert.deepEqual(views.map((v) => v.phase), ['running (working)', 'succeeded', 'pending', 'running (working)']);
  assert.equal(engine.io().reads - reads, 4, 'a journal for each task asked, and none of the store\'s other two');
  assert.equal(counts.observe - observes, 1, 'one look at the harness for the two in flight');
});

test('the views of tasks none of which is in flight observe nothing', async () => {
  const { engine, counts, settled, queued } = await board();
  const observes = counts.observe;
  const views = await engine.list([...settled, queued]);
  assert.deepEqual(views.map((v) => v.phase), ['succeeded', 'succeeded', 'succeeded', 'pending']);
  assert.equal(counts.observe - observes, 0);
  assert.deepEqual(await engine.list([]), []);
});

test('with no ids, every task on the board over one observation, as before', async () => {
  const { engine, counts, settled, flying, queued } = await board();
  const observes = counts.observe;
  const views = await engine.list();
  assert.deepEqual(new Set(views.map((v) => v.id)), new Set([...settled, ...flying, queued]));
  assert.equal(counts.observe - observes, 1);
});

test('REFUSED: `list` handed anything but a list of task ids, or more than one argument, says what it takes', async () => {
  const { engine, settled } = await board();
  const untyped = engine.list as (...args: unknown[]) => Promise<unknown>;
  for (const args of [[settled[0]], [[1]], [{ ids: settled }], [settled, 'more'], [null]]) {
    assert.throws(() => untyped(...args), (err: Error & { exitCode?: number }) =>
      err.message.startsWith('list: takes the task ids to view, a list of strings, or nothing for every task') && err.exitCode === 2, JSON.stringify(args));
  }
});
