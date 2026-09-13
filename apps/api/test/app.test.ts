import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

// agent-workflows locates its store when the module loads, so point it at a scratch directory first.
const root = fs.mkdtempSync(path.join(os.tmpdir(), 'hkb-api-'));
process.env.WF_ROOT = root;
const { app } = await import('../src/app.ts');
const { readRun } = await import('agent-workflows');

const writeRun = (run: { id: string } & Record<string, unknown>) => {
  fs.mkdirSync(path.join(root, 'runs'), { recursive: true });
  fs.writeFileSync(path.join(root, 'runs', `${run.id}.json`), JSON.stringify(run));
};

/** A task the engine ran once and settled, which signed off with `closeout` — its journal, as the engine writes it. */
const settledTask = (taskId: string, closeout: object) => {
  const at = '2026-09-12T00:10:00.000Z';
  const events = [
    { kind: 'filed', at, brief: 'Implement the thing.', cwd: '/code/app', maxAttempts: 1 },
    { kind: 'starting', at, attempt: 1 },
    { kind: 'spawned', at, attempt: 1 },
    { kind: 'ended', at, attempt: 1, sessionId: `ae/${taskId}/1`, observed: 'done', reason: 'harness', closeout },
    { kind: 'settled', at, outcome: 'succeeded' },
  ];
  fs.mkdirSync(path.join(root, 'engine', 'tasks'), { recursive: true });
  fs.writeFileSync(path.join(root, 'engine', 'tasks', `${taskId}.jsonl`), events.map((e) => JSON.stringify(e) + '\n').join(''));
};

/** Two steps, the second reviewing the first. */
const workflowDir = fs.mkdtempSync(path.join(os.tmpdir(), 'hkb-api-workflow-'));
fs.writeFileSync(path.join(workflowDir, 'implement.md'), '---\nharness: codex\nmodel: gpt-5\ndeadlineSeconds: 600\n---\nImplement the thing.\n');
fs.writeFileSync(path.join(workflowDir, 'review.md'), '---\nafter: implement\nmaxAttempts: 2\n---\nReview what implement did.\n');

const blocked = { outcome: 'blocked', summary: 'Half of it is done.', needs: 'Which database?', artifacts: ['NOTES.md'] };

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
      // t-1 is a task this engine has never seen. `wf ls` says `pending` for it — the engine's own
      // phase, which `list` passes through — not `unknown`.
      { name: 'implement', taskId: 't-1', branch: 'wf/r-1/implement', status: 'pending' },
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

  assert.deepEqual({ ...implement, told: undefined }, {
    name: 'implement',
    spec: { harness: 'codex', model: 'gpt-5', after: [], resume: null, permissionMode: null, deadlineSeconds: 600, maxAttempts: null },
    body: 'Implement the thing.',
    told: undefined,
    taskId: 't-2', workspace: '/code/app/.wt/r-2/implement', branch: 'wf/r-2/implement',
    status: 'succeeded · BLOCKED',
    closeout: { outcome: 'blocked', summary: 'Half of it is done.', needs: 'Which database?', artifacts: ['NOTES.md'] },
  });
  assert.ok(implement.told.startsWith('Implement the thing.\n\n## What was asked for\n\nAdd a cache\n\nKeep it small.'), implement.told);
  assert.match(implement.told, /## When you are finished/);

  assert.deepEqual({ ...review, told: undefined }, {
    name: 'review',
    spec: { harness: null, model: null, after: ['implement'], resume: null, permissionMode: null, deadlineSeconds: null, maxAttempts: 2 },
    body: 'Review what implement did.',
    told: undefined,
    taskId: null, workspace: null, branch: null,
    status: 'waiting',
    closeout: null,
  });
  // Told what the run knows at the time of asking: implement has run in this workspace, so look there.
  assert.match(review.told, /already been worked in by: implement/);
  assert.match(review.told, /git diff def456/);
});

test('a step that signed off blocked is waiting on you in the list too', async () => {
  const runs = await (await app.request('/api/runs')).json();
  const run = runs.find((r: { id: string }) => r.id === 'r-2');
  assert.deepEqual(run.steps.map((s: { status: string }) => s.status), ['succeeded · BLOCKED', 'waiting']);
  assert.deepEqual(run.waitingOnYou, ['implement']);
});

test('a run whose workflow folder is gone still answers, from its record, in the words wf ls uses', async () => {
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
      name: 'implement', spec: null, body: null, told: null,
      taskId: 't-2', workspace: '/code/app/.wt/r-2/implement', branch: 'wf/r-2/implement',
      status: 'succeeded · BLOCKED',
      closeout: { outcome: 'blocked', summary: 'Half of it is done.', needs: 'Which database?', artifacts: ['NOTES.md'] },
    },
    { name: 'review', spec: null, body: null, told: null, taskId: null, workspace: null, branch: null, status: 'waiting', closeout: null },
  ]);

  // Without the folder the api words the steps itself. Same record, same engine: same words as `list`.
  const summary = async () => {
    const runs = await (await app.request('/api/runs')).json();
    const pick = (id: string) => runs.find((r: { id: string }) => r.id === id);
    return { withFolder: pick('r-2'), withoutFolder: pick('r-3') };
  };
  let { withFolder, withoutFolder } = await summary();
  assert.deepEqual(withoutFolder.steps, withFolder.steps);
  assert.deepEqual(withoutFolder.waitingOnYou, withFolder.waitingOnYou);

  // A run somebody called off waits on nobody, though its step still says how it signed off.
  fs.writeFileSync(path.join(root, 'runs', 'r-2.cancelled'), '2026-09-12T03:00:00.000Z');
  fs.writeFileSync(path.join(root, 'runs', 'r-3.cancelled'), '2026-09-12T03:00:00.000Z');
  ({ withFolder, withoutFolder } = await summary());
  assert.deepEqual(withFolder.waitingOnYou, []);
  assert.deepEqual(withoutFolder.waitingOnYou, []);
  assert.deepEqual(withoutFolder.steps, withFolder.steps);
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
