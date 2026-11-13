/**
 * The board's list of the runs, the RunList asked by a field (`GET /api/runs?fieldSelector=status.state…` or `status.outcome…`): the
 * runs not finished by name and the finished newest first by when their work stopped, those of one outcome too, a page at a time by their own token, each kept to its namespace; a plain list
 * carries no frame; a selector that is none is a 422; and the three reads it replaced are gone, 404.
 */
import { root } from '../../test/harness.ts';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import type { RunList } from 'objects';
import { Effect } from 'effect';
import { testEngine } from 'agent-runtime/testing';
import { testPlace } from 'agent-orchestrator/testing';
import { appOver, beforeEachTest, eachTest, engineFor } from '../../test/placed.ts';

const stand = eachTest(testPlace);
const standIn = eachTest(testEngine);
const engine = () => engineFor(standIn());
const app = eachTest(() => appOver(standIn(), stand()));

/** An instant `m` minutes into the fixtures' hour. */
const at = (m: number) => new Date(Date.UTC(2026, 9, 4, 10, m)).toISOString();

const DONE = { outcome: 'done', summary: 'Wrote it.', needs: null, artifacts: [] };
const BLOCKED = { outcome: 'blocked', summary: 'Could not.', needs: 'a key', artifacts: [] };

/** A task on the engine, at work from `from`, and signed `closeout` at `to` where one is given. */
function journalled(taskId: string, from: string, end?: { to: string; closeout: typeof DONE | typeof BLOCKED }): void {
  Effect.runSync(engine().file({ id: taskId, brief: 'Write it.', cwd: root, harness: 'codex' }));
  const begun = { startedAt: from, spawnedAt: from };
  if (!end) standIn().settle(taskId, 'working', begun);
  else
    standIn().settle(taskId, end.closeout.outcome === 'done' ? 'succeeded' : 'failed', {
      ...begun,
      endedAt: end.to,
      exitCode: 0,
      closeout: end.closeout,
    });
}

/** A folder run of one step, created at `created`, of `factory` where one is named. */
function aRun(id: string, created: string, factory?: string): void {
  fs.mkdirSync(path.join(root, 'runs'), { recursive: true });
  fs.writeFileSync(
    path.join(root, 'runs', `${id}.json`),
    JSON.stringify({
      id,
      place: { kind: 'folder' },
      workspace: path.join(root, 'runs', id, 'work'),
      brief: `List ${id}.`,
      createdAt: created,
      workflowDir: path.join(root, 'no-such-workflow'),
      workflow: [{ name: 'write', after: [], body: 'Write it.', harness: 'codex', workspace: 'folder' }],
      steps: { write: { taskId: `${id}-write` } },
      ...(factory ? { factory } : {}),
    }),
  );
}

/** A run whose step signed off done at minute `to`: finished. */
const finished = (id: string, created: number, to: number, factory?: string) => {
  journalled(`${id}-write`, at(created), { to: at(to), closeout: DONE });
  aRun(id, at(created), factory);
};

beforeEachTest(() => {
  finished('l-first', 0, 50, 'acme');
  finished('l-second', 5, 20);
  finished('l-third', 10, 30, 'acme');
  finished('l-fourth', 15, 40);
  finished('l-fifth', 16, 45, 'beta');
  journalled('l-asks-write', at(20), { to: at(25), closeout: BLOCKED });
  aRun('l-asks', at(20), 'acme');
  journalled('l-moves-write', at(30));
  aRun('l-moves', at(30));
});

const read = async <T>(address: string): Promise<T> => {
  const res = await app().request(address);
  assert.equal(res.status, 200, `${address}: ${await res.clone().text()}`);
  return (await res.json()) as T;
};

/** The names of a list's runs, in its order. */
const namesOf = (list: RunList): string[] => list.items.map((item) => item.metadata.name);

test('the runs not finished by name, and the finished newest first, each with the frame and the counts of the whole namespace', async () => {
  const open = await read<RunList>('/api/runs?fieldSelector=status.state!%3Dfinished');
  assert.deepEqual(namesOf(open), ['l-asks', 'l-moves']);
  assert.deepEqual(open.metadata.counts, { waiting: 1, inFlight: 1, finished: 5 });
  assert.deepEqual(
    open.items.map((item) => item.status.state),
    ['waiting', 'inFlight'],
  );
  const done = await read<RunList>('/api/runs?fieldSelector=status.state%3Dfinished');
  assert.deepEqual(namesOf(done), ['l-first', 'l-fifth', 'l-fourth', 'l-third', 'l-second']);
  assert.deepEqual(
    done.items.map((item) => [item.status.finishedAt, item.status.outcome]),
    [at(50), at(45), at(40), at(30), at(20)].map((when) => [when, 'succeeded']),
  );
  const plain = await read<RunList>('/api/runs');
  assert.equal('counts' in plain.metadata, false, 'a plain list carries no counts');
  assert.ok(
    plain.items.every((item) => !('state' in item.status)),
    'nor any frame key',
  );
});

test('the finished runs of one outcome, newest first, with the frame and the counts of the whole namespace', async () => {
  const succeeded = await read<RunList>('/api/runs?fieldSelector=status.outcome%3Dsucceeded');
  assert.deepEqual(namesOf(succeeded), ['l-first', 'l-fifth', 'l-fourth', 'l-third', 'l-second']);
  assert.deepEqual(succeeded.metadata.counts, { waiting: 1, inFlight: 1, finished: 5 });
  assert.deepEqual(namesOf(await read<RunList>('/api/runs?fieldSelector=status.outcome%3Dundecided')), []);
  assert.deepEqual(
    namesOf(await read<RunList>('/api/runs?fieldSelector=status.outcome!%3Dsucceeded')),
    ['l-asks', 'l-moves'],
    'every other run, those not finished among them',
  );
});

test('a finished list of two a page gives a continue whose follow gives the next two, newest first', async () => {
  const first = await read<RunList>('/api/runs?fieldSelector=status.state%3Dfinished&limit=2');
  assert.deepEqual(namesOf(first), ['l-first', 'l-fifth']);
  const token = first.metadata.continue;
  assert.ok(token);
  const next = await read<RunList>(`/api/runs?fieldSelector=status.state%3Dfinished&limit=2&continue=${encodeURIComponent(token)}`);
  assert.deepEqual(namesOf(next), ['l-fourth', 'l-third']);
  assert.equal(next.metadata.remainingItemCount, 1);
});

test("a namespace's list by state keeps its factory's runs, and default those whose record names none", async () => {
  const acme = await read<RunList>('/api/namespaces/acme/runs?fieldSelector=status.state!%3Dfinished');
  assert.deepEqual(namesOf(acme), ['l-asks']);
  assert.deepEqual(acme.metadata.counts, { waiting: 1, inFlight: 0, finished: 2 });
  const plain = await read<RunList>('/api/namespaces/default/runs?fieldSelector=status.state!%3Dfinished');
  assert.deepEqual(namesOf(plain), ['l-moves']);
  assert.deepEqual(plain.metadata.counts, { waiting: 0, inFlight: 1, finished: 2 });
});

test('REFUSED 422: a fieldSelector that is none of the forms, and a token of the other order', async () => {
  for (const query of [
    'fieldSelector=spec.repo%3Dx',
    'fieldSelector=status.state%3Ddone',
    'fieldSelector=status.outcome%3Ddone',
    'fieldSelector=status.state%3Dwaiting,status.state%3DinFlight',
  ]) {
    const res = await app().request(`/api/runs?${query}`);
    assert.equal(res.status, 422, query);
  }
  const named = await read<RunList>('/api/runs?limit=1');
  const res = await app().request(
    `/api/runs?fieldSelector=status.state%3Dfinished&continue=${encodeURIComponent(named.metadata.continue ?? '')}`,
  );
  assert.equal(res.status, 422, 'a name-order token on the finished order');
});

test('the three reads the RunList replaced are gone', async () => {
  for (const address of ['/api/runs-summaries', '/api/runs-open', '/api/runs-finished']) {
    const res = await app().request(address);
    assert.equal(res.status, 404, address);
  }
});
