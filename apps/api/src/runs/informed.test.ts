/**
 * The app's informer (`Informer`, the package's rest/informer.verb.ts, given one per app by `liveOf`): the run object, the runs list and
 * the sub-resources answer from one judgement of a run, the same for the object and the list (Q18), and a write made through the api is
 * seen on the very next request — the generic write mount takes the run it names out of the informer once it has run (`uninformed` in
 * commands/routes.ts). A cold app answers as a warm one.
 *
 * On the stand-ins: the runtime's test engine, its tasks filed and settled by hand, and the test place, under the records this file seeds.
 * The stand-in's feed has no line, so a write that moves only the engine's journal — a word said to a session at work — moves nothing the
 * informer keeps a run against but the drop.
 */
import { root } from '../../test/harness.ts';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { Effect, Layer } from 'effect';
import { testEngine } from 'agent-runtime/testing';
import { testPlace } from 'agent-orchestrator/testing';
import { Informer, informerMemo, type InformerMemo } from 'agent-orchestrator';
import type { Labelled, RunList } from 'objects';
import type { RunAnswer, RunListing } from './runs.ts';
import { appOver, beforeEachTest, eachTest, engineFor } from '../../test/placed.ts';
import { summariesOf } from '../../test/run-reads.ts';

const stand = eachTest(testPlace);
const standIn = eachTest(testEngine);
const engine = () => engineFor(standIn());
/** The informer of the app the test reads, its own: what a daemon's passes would fill. */
const informer = eachTest(() => informerMemo());
const app = eachTest(() => appOver(standIn(), stand(), Layer.succeed(Informer)(informer())));

/** What the board sends, through vite's proxy: JSON, same-origin, and Host rewritten to the api's. */
const BOARD = {
  'content-type': 'application/json',
  'sec-fetch-site': 'same-origin',
  origin: 'http://localhost:5173',
  host: '127.0.0.1:8787',
};

const GATED = 'r-informed-gated';
const AT_WORK = 'r-informed-at-work';
/** A run's record of one step, `implement`, its task `t-<id>`, gated where asked. */
const record = (id: string, gates: string[] = []) => ({
  id,
  repo: '/code/app',
  workspace: '/code/app',
  baseRef: 'abc123',
  branch: 'main',
  isolate: true,
  brief: 'Inform it',
  workflowDir: path.join(root, 'no-such-workflow'),
  createdAt: '2026-11-02T06:00:00.000Z',
  workflow: [{ name: 'implement', after: [], body: 'Implement it.', harness: 'claude' }],
  gates,
  steps: { implement: { taskId: `t-${id}` } },
});
fs.mkdirSync(path.join(root, 'runs'), { recursive: true });
fs.writeFileSync(path.join(root, 'runs', `${GATED}.json`), JSON.stringify(record(GATED, ['implement'])));
fs.writeFileSync(path.join(root, 'runs', `${AT_WORK}.json`), JSON.stringify(record(AT_WORK)));
beforeEachTest(() => {
  fs.rmSync(path.join(root, 'runs', `${GATED}.asks`), { recursive: true, force: true });
  Effect.runSync(engine().file({ id: `t-${GATED}`, brief: 'Do it.', cwd: '/code/app', harness: 'claude' }));
  standIn().settle(`t-${GATED}`, 'succeeded', {
    exitCode: 0,
    closeout: { outcome: 'done', summary: 'Built it.', needs: null, artifacts: [] },
  });
  Effect.runSync(engine().file({ id: `t-${AT_WORK}`, brief: 'Do it.', cwd: '/code/app', harness: 'claude' }));
  standIn().settle(`t-${AT_WORK}`, 'working');
});

const object = async (id: string, on = app()): Promise<RunAnswer> => {
  const res = await on.request(`/api/runs/${id}`);
  assert.equal(res.status, 200, `the run ${id} answers`);
  return (await res.json()) as RunAnswer;
};
const listing = async (on = app()): Promise<RunListing[]> => await summariesOf(on);
const post = (route: string, body: unknown) => app().request(route, { method: 'POST', headers: BOARD, body: JSON.stringify(body) });

test('an approval through the api is answered on the very next request, with no pass between', async () => {
  assert.deepEqual((await object(GATED)).status.waitingOnYou, ['implement'], 'the fixture waits at its gate');
  assert.ok(informer().runs.has(GATED), 'and the informer keeps it, at rest at its gate');
  assert.equal((await post(`/api/namespaces/default/runs/${GATED}/steps/implement/approve`, {})).status, 202);
  assert.ok(!informer().runs.has(GATED), 'the write mount took it out');
  assert.deepEqual((await object(GATED)).status.waitingOnYou, [], 'approved, on the next request');
});

test('a word said through the api to a session at work, which moves no stamp and no line of the stand-in’s feed, is seen at once: the drop alone takes the run out', async () => {
  informer().pass = 1;
  await object(AT_WORK);
  assert.ok(informer().runs.has(AT_WORK), 'kept within the pass now running');
  assert.equal((await post(`/api/namespaces/default/runs/${AT_WORK}/steps/implement/say`, { text: 'Widen the scope.' })).status, 202);
  const step = (await object(AT_WORK)).status.steps.find((s) => s.name === 'implement');
  assert.deepEqual(
    step?.said.map((said) => said.text),
    ['Widen the scope.'],
    'the word said, on the next request',
  );
});

test("a run's labels set through the api are its object's on the very next request, the informer warm and its check off", async () => {
  process.env.WF_VERIFY_REST = '0';
  try {
    assert.equal((await object(GATED)).metadata.labels['team'], undefined, 'the fixture carries no team');
    assert.ok(informer().runs.has(GATED), 'and the informer keeps it');
    const res = await post(`/api/namespaces/default/runs/${GATED}/labels`, { labels: ['team=core'] });
    assert.equal(res.status, 200, await res.clone().text());
    const labelled = (await res.json()) as Labelled;
    assert.deepEqual([labelled.kind, labelled.name, labelled.labels, labelled.was], ['Run', GATED, { team: 'core' }, {}]);
    assert.ok(!informer().runs.has(GATED), 'the write mount took it out');
    assert.equal((await object(GATED)).metadata.labels['team'], 'core', 'labelled, on the next request');
    assert.equal((await listing()).find((r) => r.id === GATED)?.labels['team'], 'core', 'and on its row of the list');
    const changed = await post(`/api/namespaces/default/runs/${GATED}/labels`, { labels: ['team=infra'] });
    assert.equal(changed.status, 422, 'REFUSED: a value changed without overwrite');
    const over = await post(`/api/namespaces/default/runs/${GATED}/labels`, { labels: ['team=infra'], overwrite: true });
    assert.equal(over.status, 200, await over.clone().text());
    assert.equal((await object(GATED)).metadata.labels['team'], 'infra', 'overwritten, on the next request');
    const wrong = await post(`/api/namespaces/default/runs/${GATED}/labels`, { labels: 'team=core' });
    assert.equal(wrong.status, 400, 'REFUSED: labels that are no list');
  } finally {
    process.env.WF_VERIFY_REST = '1';
  }
});

/** The runs as a list of objects (`GET /api/runs`, the `RunList`), a 200. */
const runList = async (on = app()): Promise<RunList> => {
  const res = await on.request('/api/runs');
  assert.equal(res.status, 200, 'the runs list answers');
  return (await res.json()) as RunList;
};

test('a cold app and a warm app answer the run object and the runs list alike', async () => {
  const warm = app();
  const warmed = { object: await object(GATED, warm), list: await runList(warm) };
  assert.ok(informer().runs.has(GATED), 'the warm app kept the run');
  const cold = appOver(standIn(), stand(), Layer.succeed(Informer)(informerMemo() satisfies InformerMemo));
  assert.deepEqual(await object(GATED, cold), warmed.object, 'the object');
  assert.deepEqual(await runList(cold), warmed.list, 'the list');
});

test("the run's status phase and reason are its row's in the list: one judgement for both (Q18)", async () => {
  for (const id of [GATED, AT_WORK]) {
    const { status } = await object(id);
    const row = (await listing()).find((r) => r.id === id);
    assert.ok(row, `${id} is listed`);
    assert.deepEqual([status.phase, status.reason], [row.phase, row.reason], id);
  }
});
