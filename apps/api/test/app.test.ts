import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

// agent-workflows locates its store when the module loads, so point it at a scratch directory first.
const root = fs.mkdtempSync(path.join(os.tmpdir(), 'hkb-api-'));
process.env.WF_ROOT = root;
const { app } = await import('../src/app.ts');
const { engine, list, readRun } = await import('agent-workflows');

const writeRun = (run: { id: string } & Record<string, unknown>) => {
  fs.mkdirSync(path.join(root, 'runs'), { recursive: true });
  fs.writeFileSync(path.join(root, 'runs', `${run.id}.json`), JSON.stringify(run));
};

const at = '2026-09-12T00:10:00.000Z';
const filedBrief = (taskId: string) => `The brief ${taskId} was filed with.`;

/** A task's journal, as the engine writes it. */
const journal = (taskId: string, events: object[]) => {
  fs.mkdirSync(path.join(root, 'engine', 'tasks'), { recursive: true });
  fs.writeFileSync(path.join(root, 'engine', 'tasks', `${taskId}.jsonl`), events.map((e) => JSON.stringify(e) + '\n').join(''));
};
const filed = (taskId: string) => ({ kind: 'filed', at, brief: filedBrief(taskId), cwd: '/code/app', maxAttempts: 1 });

/** A task filed and waiting for a slot: the engine has its brief and nothing else. */
const queuedTask = (taskId: string) => journal(taskId, [filed(taskId)]);

/** A task the engine ran once and settled, which signed off with `closeout`. */
const settledTask = (taskId: string, closeout: object) => journal(taskId, [
  filed(taskId),
  { kind: 'starting', at, attempt: 1 },
  { kind: 'spawned', at, attempt: 1 },
  { kind: 'ended', at, attempt: 1, sessionId: `ae/${taskId}/1`, observed: 'done', reason: 'harness', closeout },
  { kind: 'settled', at, outcome: 'succeeded' },
]);

const workflowFolder = (files: Record<string, string>) => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'hkb-api-workflow-'));
  for (const [name, text] of Object.entries(files)) fs.writeFileSync(path.join(dir, name), text);
  return dir;
};

/** Two steps, the second reviewing the first. */
const workflowDir = workflowFolder({
  'implement.md': '---\nharness: codex\nmodel: gpt-5\ndeadlineSeconds: 600\n---\nImplement the thing.\n',
  'review.md': '---\nafter: implement\nmaxAttempts: 2\n---\nReview what implement did.\n',
});

const blocked = { outcome: 'blocked', summary: 'Half of it is done.', needs: 'Which database?', artifacts: ['NOTES.md'] };

/** A run as GET /api/runs lists it. */
const listed = async (id: string) =>
  (await (await app.request('/api/runs')).json()).find((r: { id: string }) => r.id === id);

test('health answers', async () => {
  const res = await app.request('/api/health');
  assert.equal(res.status, 200);
  assert.deepEqual(await res.json(), { ok: true });
});

test('an empty store lists no runs', async () => {
  const res = await app.request('/api/runs');
  assert.deepEqual(await res.json(), []);
});

test('runs are read from the workflow store and summarized, with what each step is doing', async () => {
  writeRun({
    id: 'r-1', repo: '/code/app', workspace: '/code/app', baseRef: 'abc123', branch: 'main', isolate: true,
    brief: 'Do the thing', workflowDir: '/code/app/workflows', createdAt: '2026-09-12T00:00:00.000Z',
    steps: { implement: { taskId: 't-1', branch: 'wf/r-1/implement' }, review: { taskId: null } },
  });
  fs.writeFileSync(path.join(root, 'runs', 'r-1.cancelled'), '2026-09-12T01:00:00.000Z');

  const res = await app.request('/api/runs');
  assert.deepEqual(await res.json(), [{
    id: 'r-1', repo: '/code/app', brief: 'Do the thing', createdAt: '2026-09-12T00:00:00.000Z',
    cancelledAt: '2026-09-12T01:00:00.000Z',
    steps: [
      // t-1 is on the record and not in this engine's store: a fresh WF_ROOT has no tasks at all.
      { name: 'implement', taskId: 't-1', branch: 'wf/r-1/implement', status: 'unknown' },
      { name: 'review', taskId: null, branch: null, status: 'waiting' },
    ],
    waitingOnYou: [],
  }]);
});

const r2 = {
  id: 'r-2', repo: '/code/app', workspace: '/code/app/.wt/r-2', baseRef: 'def456', branch: 'main', isolate: true,
  brief: 'Add a cache\n\nKeep it small.', workflowDir, createdAt: '2026-09-12T02:00:00.000Z',
  steps: {
    implement: { taskId: 't-2', workspace: '/code/app/.wt/r-2/implement', branch: 'wf/r-2/implement' },
    review: { taskId: null },
  },
};

test('a run in full: the brief, each step\'s spec and prose, what it was told, and how it went', async () => {
  settledTask('t-2', blocked);
  writeRun(r2);

  const res = await app.request('/api/runs/r-2');
  assert.equal(res.status, 200);
  const run = await res.json();
  const [implement, review] = run.steps;
  assert.deepEqual({ ...run, steps: undefined }, {
    id: 'r-2', brief: 'Add a cache\n\nKeep it small.', repo: '/code/app', workflowDir, baseRef: 'def456',
    branch: 'main', isolate: true, createdAt: '2026-09-12T02:00:00.000Z', cancelledAt: null,
    waitingOnYou: ['implement'], warning: null, steps: undefined,
  });

  assert.deepEqual(implement, {
    name: 'implement',
    spec: { harness: 'codex', model: 'gpt-5', after: [], resume: null, permissionMode: null, deadlineSeconds: 600, maxAttempts: null },
    body: 'Implement the thing.',
    // What the engine was filed with, not the brief recomposed from today's folder and record.
    told: filedBrief('t-2'),
    taskId: 't-2', workspace: '/code/app/.wt/r-2/implement', branch: 'wf/r-2/implement',
    status: 'succeeded · BLOCKED',
    closeout: { outcome: 'blocked', summary: 'Half of it is done.', needs: 'Which database?', artifacts: ['NOTES.md'] },
  });

  assert.deepEqual({ ...review, told: undefined }, {
    name: 'review',
    spec: { harness: null, model: null, after: ['implement'], resume: null, permissionMode: null, deadlineSeconds: null, maxAttempts: 2 },
    body: 'Review what implement did.',
    told: undefined,
    taskId: null, workspace: null, branch: null,
    status: 'waiting',
    closeout: null,
  });
  // Not filed, so what it would be given now: implement has run in this workspace, so look there.
  assert.ok(review.told.startsWith('Review what implement did.\n\n## What was asked for\n\nAdd a cache\n\nKeep it small.'), review.told);
  assert.match(review.told, /already been worked in by: implement/);
  assert.match(review.told, /git diff def456/);
});

test('a step that signed off blocked is waiting on you in the list too', async () => {
  const run = await listed('r-2');
  assert.deepEqual(run.steps.map((s: { status: string }) => s.status), ['succeeded · BLOCKED', 'waiting']);
  assert.deepEqual(run.waitingOnYou, ['implement']);
});

test('a task the engine has no record of is unknown on both endpoints, not queued', async () => {
  writeRun({ ...r2, id: 'r-4', steps: { implement: { taskId: 't-4-lost', branch: 'wf/r-4/implement' }, review: { taskId: null } } });
  queuedTask('t-5');
  writeRun({ ...r2, id: 'r-5', steps: { implement: { taskId: 't-5', branch: 'wf/r-5/implement' }, review: { taskId: null } } });

  const lost = await (await app.request('/api/runs/r-4')).json();
  assert.equal(lost.steps[0].status, 'unknown');
  assert.equal(lost.steps[0].told, null);
  assert.equal((await listed('r-4')).steps[0].status, 'unknown');

  // The case it must not swallow: a task filed and waiting for a slot is still `pending`.
  const queued = await (await app.request('/api/runs/r-5')).json();
  assert.equal(queued.steps[0].status, 'pending');
  assert.equal(queued.steps[0].told, filedBrief('t-5'));
  assert.equal((await listed('r-5')).steps[0].status, 'pending');
});

test('where list words a step correctly, the api uses the same words', async () => {
  // Not r-4: for a task the engine has no record of, `list` says `pending` and the api says `unknown`.
  const e = engine();
  for (const id of ['r-2', 'r-5']) {
    const words = await list(e, readRun(id));
    const run = await listed(id);
    assert.deepEqual(run.steps.map(({ name, status, branch }: { name: string; status: string; branch: string | null }) => ({ name, status, branch })), words.steps, id);
    assert.deepEqual(run.waitingOnYou, words.waitingOnYou, id);
  }
});

test('a run whose workflow folder is gone still answers, from its record', async () => {
  const gone = path.join(os.tmpdir(), 'hkb-api-no-such-workflow');
  writeRun({ ...r2, id: 'r-3', workflowDir: gone });

  const res = await app.request('/api/runs/r-3');
  assert.equal(res.status, 200);
  const run = await res.json();
  assert.match(run.warning, /is gone/);
  assert.ok(run.warning.includes(gone), run.warning);
  assert.deepEqual(run.waitingOnYou, ['implement']);
  assert.deepEqual(run.steps, [
    {
      name: 'implement', spec: null, body: null, told: filedBrief('t-2'),
      taskId: 't-2', workspace: '/code/app/.wt/r-2/implement', branch: 'wf/r-2/implement',
      status: 'succeeded · BLOCKED',
      closeout: { outcome: 'blocked', summary: 'Half of it is done.', needs: 'Which database?', artifacts: ['NOTES.md'] },
    },
    { name: 'review', spec: null, body: null, told: null, taskId: null, workspace: null, branch: null, status: 'waiting', closeout: null },
  ]);

  // Same record, same engine: the same words with the folder as without it.
  let [withFolder, withoutFolder] = [await listed('r-2'), await listed('r-3')];
  assert.deepEqual(withoutFolder.steps, withFolder.steps);
  assert.deepEqual(withoutFolder.waitingOnYou, withFolder.waitingOnYou);

  // A run somebody called off waits on nobody, though its step still says how it signed off.
  fs.writeFileSync(path.join(root, 'runs', 'r-2.cancelled'), '2026-09-12T03:00:00.000Z');
  fs.writeFileSync(path.join(root, 'runs', 'r-3.cancelled'), '2026-09-12T03:00:00.000Z');
  [withFolder, withoutFolder] = [await listed('r-2'), await listed('r-3')];
  assert.deepEqual(withFolder.waitingOnYou, []);
  assert.deepEqual(withoutFolder.waitingOnYou, []);
  assert.deepEqual(withoutFolder.steps, withFolder.steps);
});

test('a folder changed since the run started keeps the steps that ran, and names what moved', async () => {
  const changed = workflowFolder({
    'original.md': 'Do the original thing.\n',
    'review.md': '---\nafter: original\n---\nReview it.\n',
  });
  settledTask('t-6', blocked);
  writeRun({
    ...r2, id: 'r-6', workflowDir: changed,
    steps: { original: { taskId: 't-6', workspace: '/code/app/.wt/r-6/original', branch: 'wf/r-6/original' }, review: { taskId: null } },
  });
  // Renamed after the run started: the folder still reads as a workflow, only not this run's.
  fs.renameSync(path.join(changed, 'original.md'), path.join(changed, 'replacement.md'));
  fs.writeFileSync(path.join(changed, 'review.md'), '---\nafter: replacement\n---\nReview it.\n');

  const run = await (await app.request('/api/runs/r-6')).json();
  assert.match(run.warning, /no longer has original/);
  assert.match(run.warning, /has replacement, which the run did not start with/);
  assert.deepEqual(run.waitingOnYou, ['original']);
  assert.deepEqual(run.steps.map((s: { name: string }) => s.name), ['original', 'review', 'replacement']);

  const [original, review, replacement] = run.steps;
  assert.deepEqual(original, {
    name: 'original', spec: null, body: null, told: filedBrief('t-6'),
    taskId: 't-6', workspace: '/code/app/.wt/r-6/original', branch: 'wf/r-6/original',
    status: 'succeeded · BLOCKED',
    closeout: { outcome: 'blocked', summary: 'Half of it is done.', needs: 'Which database?', artifacts: ['NOTES.md'] },
  });
  assert.deepEqual([review.body, review.spec.after, review.status], ['Review it.', ['replacement'], 'waiting']);
  assert.deepEqual([replacement.body, replacement.taskId, replacement.status, replacement.closeout], ['Do the original thing.', null, 'waiting', null]);

  const summary = await listed('r-6');
  assert.deepEqual(summary.steps.map((s: { name: string; status: string }) => [s.name, s.status]), [
    ['original', 'succeeded · BLOCKED'], ['review', 'waiting'], ['replacement', 'waiting'],
  ]);
  assert.deepEqual(summary.waitingOnYou, ['original']);
});

test('an unknown run is refused with a 404 that says where to look', async () => {
  const res = await app.request('/api/runs/no-such-run');
  assert.equal(res.status, 404);
  const { error } = await res.json();
  assert.match(error, /No run 'no-such-run'/);
  assert.match(error, /GET \/api\/runs/);
});

test('a run id cannot name a file outside the run store', async () => {
  writeRun({ ...r2, id: '../escape' });
  // The file is a readable run, one directory up: reading the id as a path would have served it.
  assert.equal(readRun('../escape').id, '../escape');

  const res = await app.request('/api/runs/..%2Fescape');
  assert.equal(res.status, 404);
});
