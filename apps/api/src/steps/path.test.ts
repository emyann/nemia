/**
 * A step's task's path through the runtime's lifecycle over HTTP: GET /api/runs/:id/steps/:step/path, the current try's by default and
 * an earlier try's by number, held to the journal this file seeds.
 *
 * At shipped defaults: the api's own engine over the harness's store (`root`), which this file seeds, and its fake `claude` first on PATH.
 * The path is read off the journal alone, so no harness is asked.
 */
import { observations, root } from '../../test/harness.ts';
import { test } from 'node:test';
import { story } from '../../test/checkpoints.ts';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { app } from '../app.ts';
import type { StepPath } from './path.ts';

const T0 = Date.parse('2026-09-29T08:00:00.000Z');
const at = (s: number) => new Date(T0 + s * 1000).toISOString();
const jsonl = (lines: object[]) => lines.map((line) => `${JSON.stringify(line)}\n`).join('');
const write = (file: string, text: string) => {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, text);
};
const journal = (taskId: string, events: object[]) => write(path.join(root, 'engine', 'tasks', `${taskId}.jsonl`), jsonl(events));

const filed = (extra: object = {}) => ({ kind: 'filed', at: at(0), brief: 'Do it.', cwd: root, harness: 'codex', ...extra });
/** One attempt of turn `n` of a task, from its intent to its signed end at seconds `s` on. */
const turn = (n: number, s: number) => [
  { kind: 'starting', at: at(s), attempt: n },
  { kind: 'spawned', at: at(s + 1), attempt: n },
  {
    kind: 'ended',
    at: at(s + 2),
    attempt: n,
    sessionId: `ae/t/${n}`,
    nativeId: `native-${n}`,
    observed: 'done',
    reason: 'harness',
    closeout: { outcome: 'done', summary: 'Did it.', needs: null, artifacts: [] },
  },
];

const PLAIN = [{ name: 'implement', after: [], body: 'Implement it.', harness: 'codex' }];
const writeRun = (id: string, steps: Record<string, object>) =>
  write(
    path.join(root, 'runs', `${id}.json`),
    JSON.stringify({
      id,
      repo: root,
      baseRef: 'main',
      workspace: root,
      branch: 'main',
      isolate: false,
      brief: `The brief of ${id}`,
      createdAt: at(0),
      workflowDir: path.join(root, 'no-such-workflow'),
      workflow: PLAIN,
      steps,
    }),
  );

journal('r-retried-1', [filed(), ...turn(1, 1), { kind: 'settled', at: at(4), outcome: 'failed' }]);
journal('r-retried-2', [filed(), { kind: 'starting', at: at(10), attempt: 1 }, { kind: 'spawned', at: at(11), attempt: 1 }]);
writeRun('r-retried', { implement: { taskId: 'r-retried-2', tries: [{ taskId: 'r-retried-1', then: 'retries' }] } });

journal('r-held-1', [
  filed({ holdOpen: true }),
  ...turn(1, 1),
  { kind: 'input', at: at(5), text: 'Once more.' },
  ...turn(2, 6),
  { kind: 'input', at: at(10), text: 'And again.' },
  { kind: 'starting', at: at(11), attempt: 3 },
]);
writeRun('r-held', {
  implement: {
    taskId: 'r-held-1',
    tries: [
      { taskId: 'r-held-1', then: 'nudge' },
      { taskId: 'r-held-1', then: 'recheck' },
      { taskId: 'r-held-1', then: 'nudge' },
    ],
  },
});

writeRun('r-unfiled', {});

journal('r-spoiled-1', [filed(), { kind: 'measured', at: at(1), attempt: 1, usage: { responses: 'three' } }]);
writeRun('r-spoiled', { implement: { taskId: 'r-spoiled-1' } });

const get = async (url: string) => {
  const res = await app.request(url);
  return { status: res.status, body: (await res.json()) as StepPath & { error?: string } };
};
const words = (p: StepPath) => p.path.map((s) => `${s.state} <- ${s.event}`);

test('REFUSED: a path asked of a try that is not a whole number or not yet, a run or a step there is not, a journal that does not read', async (t) => {
  await t.test('REFUSED: a try that is not a whole number from 1 is 400, and one past the current is 404', async () => {
    for (const asked of ['x', '0', '1.5', '-1', '01']) {
      const { status, body } = await get(`/api/runs/r-retried/steps/implement/path?try=${asked}`);
      assert.equal(status, 400, asked);
      assert.match(body.error ?? '', /is not a try: give a whole number from 1/, asked);
    }
    const { status, body } = await get('/api/runs/r-retried/steps/implement/path?try=3');
    assert.equal(status, 404);
    assert.match(body.error ?? '', /has had 2 tries, so it has no try 3/);
  });
  await t.test('REFUSED: a run or a step there is not is 404', async () => {
    assert.equal((await get('/api/runs/r-none/steps/implement/path')).status, 404);
    assert.equal((await get('/api/runs/r-retried/steps/review/path')).status, 404);
  });
  await t.test('REFUSED: a journal that does not read is 502, naming the task', async () => {
    const { status, body } = await get('/api/runs/r-spoiled/steps/implement/path');
    assert.equal(status, 502);
    assert.match(body.error ?? '', /Could not read the journal of task r-spoiled-1 \(step 'implement', try 1\)/);
  });
});

test("A person reads a step's path, try by try: none before it is filed, the current try's states, an earlier try to its end, and a held try to the answer that reopened it", async (t) => {
  const s = story(t);
  await s.test('a step not filed yet has no task and an empty path', async () => {
    const { status, body } = await get('/api/runs/r-unfiled/steps/implement/path');
    assert.equal(status, 200);
    assert.deepEqual(body, { taskId: null, try: 1, path: [] });
  });
  await s.test(
    "the current try's path by default: each state the journal says, the entry that moved it and when, asking no harness",
    async () => {
      const before = observations();
      const { status, body } = await get('/api/runs/r-retried/steps/implement/path');
      assert.equal(status, 200);
      assert.deepEqual([body.taskId, body.try], ['r-retried-2', 2]);
      assert.deepEqual(body.path, [
        { state: 'submitted', event: 'filed', at: at(0) },
        { state: 'starting', event: 'starting', at: at(10) },
        { state: 'working', event: 'spawned', at: at(11) },
      ]);
      assert.equal(observations(), before, 'no harness is asked for a path');
    },
  );
  await s.test('an earlier try by number is its own task, to its end', async () => {
    const { status, body } = await get('/api/runs/r-retried/steps/implement/path?try=1');
    assert.equal(status, 200);
    assert.deepEqual([body.taskId, body.try], ['r-retried-1', 1]);
    assert.deepEqual(words(body), [
      'submitted <- filed',
      'starting <- starting',
      'working <- spawned',
      'ending <- ended',
      'failed <- settled',
    ]);
    const current = await get('/api/runs/r-retried/steps/implement/path?try=2');
    assert.deepEqual(current.body, (await get('/api/runs/r-retried/steps/implement/path')).body, 'the current try, asked by number');
  });
  await s.test('an earlier try of a task held open runs to the answer that opened the next turn; a recheck is the same turn', async () => {
    const first = (await get('/api/runs/r-held/steps/implement/path?try=1')).body;
    assert.deepEqual(words(first), ['submitted <- filed', 'starting <- starting', 'working <- spawned', 'input-required <- ended']);
    const second = (await get('/api/runs/r-held/steps/implement/path?try=2')).body;
    assert.deepEqual(words(second), [
      ...words(first),
      'submitted <- input',
      'starting <- starting',
      'working <- spawned',
      'input-required <- ended',
    ]);
    assert.deepEqual(
      (await get('/api/runs/r-held/steps/implement/path?try=3')).body.path,
      second.path,
      'a recheck replaced only the check',
    );
    const current = (await get('/api/runs/r-held/steps/implement/path')).body;
    assert.deepEqual([current.try, words(current).slice(-2)], [4, ['submitted <- input', 'starting <- starting']]);
  });
});
