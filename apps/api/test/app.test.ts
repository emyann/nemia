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
const { DEFAULT_ROUNDS } = await import('agent-workflows/workflow');

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
const filed = (taskId: string) => ({ kind: 'filed', at, brief: filedBrief(taskId), cwd: '/code/app', maxAttempts: 1, harness: 'codex' });

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

const later = '2026-09-12T00:40:00.000Z';

/** A task on its second attempt, still running: the engine lost sight of the first. */
const retryingTask = (taskId: string) => journal(taskId, [
  { ...filed(taskId), maxAttempts: 2 },
  { kind: 'starting', at, attempt: 1 },
  { kind: 'spawned', at, attempt: 1 },
  { kind: 'ended', at, attempt: 1, sessionId: `ae/${taskId}/1`, observed: 'failed', reason: 'lost' },
  { kind: 'starting', at: later, attempt: 2 },
  { kind: 'spawned', at: later, attempt: 2 },
]);

/**
 * A session of a detached harness — `codex`, or the run's `check` — as its worker leaves it on disk: a
 * run file, and the output. `unreadable` puts a directory where the output should be, so reading it fails.
 */
const detachedSession = (harness: string, taskId: string, attempt: number, output: string | { unreadable: true }, exitCode = 0) => {
  const name = `ae/${taskId}/${attempt}`;
  const dir = path.join(root, 'engine', 'runs', harness);
  const base = path.join(dir, name.replace(/[^a-zA-Z0-9]+/g, '_'));
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(`${base}.json`, JSON.stringify({ name, state: 'done', pid: 0, heartbeatAt: at, logFile: `${base}.log`, exitCode }));
  if (typeof output === 'string') fs.writeFileSync(`${base}.log`, output);
  else fs.mkdirSync(`${base}.log`);
};
const codexSession = (taskId: string, attempt: number, output: string | { unreadable: true }) => detachedSession('codex', taskId, attempt, output);

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
    id: 'r-1', repo: '/code/app', brief: 'Do the thing', workflowDir: '/code/app/workflows', createdAt: '2026-09-12T00:00:00.000Z',
    cancelledAt: '2026-09-12T01:00:00.000Z',
    status: 'cancelled',
    moving: false,
    steps: [
      // t-1 is on the record and not in this engine's store: a fresh WF_ROOT has no tasks at all.
      { name: 'implement', taskId: 't-1', branch: 'wf/r-1/implement', status: 'unknown', note: null },
      { name: 'review', taskId: null, branch: null, status: 'waiting', note: null },
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
    // implement signed off blocked, so review can never be filed: the run is over, and failed.
    status: 'failed', moving: false, waitingOnYou: ['implement'], warning: null,
    graph: { roots: ['implement'], edges: [{ from: 'implement', to: 'review', kind: 'after' }] },
    steps: undefined,
  });

  assert.deepEqual(implement, {
    name: 'implement',
    spec: { harness: 'codex', model: 'gpt-5', after: [], resume: null, permissionMode: null, deadlineSeconds: 600, maxAttempts: null, loop: null, rounds: null },
    body: 'Implement the thing.',
    // What the engine was filed with, not the brief recomposed from today's folder and record.
    told: filedBrief('t-2'),
    taskId: 't-2', workspace: '/code/app/.wt/r-2/implement', branch: 'wf/r-2/implement',
    status: 'succeeded · BLOCKED',
    note: null,
    closeout: { outcome: 'blocked', summary: 'Half of it is done.', needs: 'Which database?', artifacts: ['NOTES.md'] },
    check: null,
    attempts: { count: 1, latest: { startedAt: at, ended: 'done', endedAt: at, reason: 'harness' } },
  });

  assert.deepEqual({ ...review, told: undefined }, {
    name: 'review',
    spec: { harness: null, model: null, after: ['implement'], resume: null, permissionMode: null, deadlineSeconds: null, maxAttempts: 2, loop: null, rounds: null },
    body: 'Review what implement did.',
    told: undefined,
    taskId: null, workspace: null, branch: null,
    status: 'waiting',
    note: null,
    closeout: null,
    check: null,
    attempts: { count: 0, latest: null },
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

test('the api words a step as list does — `unknown` for a task the engine has no record of, `pending` for one queued', async () => {
  // r-4 too: `list` once passed the engine's `pending` through for a task nobody can find, and the api said `unknown`.
  const e = engine();
  for (const id of ['r-2', 'r-4', 'r-5']) {
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
  assert.match(run.warning, /without their spec or prose/);
  // From before runs froze their workflow, and its folder gone: nothing on the record says what waits on what.
  assert.deepEqual(run.graph, { roots: ['implement', 'review'], edges: [] });
  assert.deepEqual(run.waitingOnYou, ['implement']);
  assert.deepEqual(run.steps, [
    {
      name: 'implement', spec: null, body: null, told: filedBrief('t-2'),
      taskId: 't-2', workspace: '/code/app/.wt/r-2/implement', branch: 'wf/r-2/implement',
      status: 'succeeded · BLOCKED',
      note: null,
      closeout: { outcome: 'blocked', summary: 'Half of it is done.', needs: 'Which database?', artifacts: ['NOTES.md'] },
      check: null,
      attempts: { count: 1, latest: { startedAt: at, ended: 'done', endedAt: at, reason: 'harness' } },
    },
    {
      name: 'review', spec: null, body: null, told: null, taskId: null, workspace: null, branch: null, status: 'waiting', note: null, closeout: null,
      check: null, attempts: { count: 0, latest: null },
    },
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
    note: null,
    closeout: { outcome: 'blocked', summary: 'Half of it is done.', needs: 'Which database?', artifacts: ['NOTES.md'] },
    check: null,
    attempts: { count: 1, latest: { startedAt: at, ended: 'done', endedAt: at, reason: 'harness' } },
  });
  assert.deepEqual([review.body, review.spec.after, review.status], ['Review it.', ['replacement'], 'waiting']);
  assert.deepEqual([replacement.body, replacement.taskId, replacement.status, replacement.closeout], ['Do the original thing.', null, 'waiting', null]);

  const summary = await listed('r-6');
  assert.deepEqual(summary.steps.map((s: { name: string; status: string }) => [s.name, s.status]), [
    ['original', 'succeeded · BLOCKED'], ['review', 'waiting'], ['replacement', 'waiting'],
  ]);
  assert.deepEqual(summary.waitingOnYou, ['original']);
});

/** A loop as `wf start` freezes it: review loops back to implement, for at most two rounds. */
const frozenLoop = [
  { name: 'implement', after: [], body: 'Implement it, as frozen.', harness: 'claude', model: 'opus' },
  {
    name: 'review', after: ['implement'], body: 'Review it, as frozen.', harness: 'codex', loop: 'implement', rounds: 2,
    output: { file: 'review.json', schema: { type: 'object', properties: { again: { type: 'boolean' } }, required: ['again'], additionalProperties: false } },
  },
];

const frozenSpecs = {
  implement: { harness: 'claude', model: 'opus', after: [], resume: null, permissionMode: null, deadlineSeconds: null, maxAttempts: null, loop: null, rounds: null },
  review: { harness: 'codex', model: null, after: ['implement'], resume: null, permissionMode: null, deadlineSeconds: null, maxAttempts: null, loop: 'implement', rounds: 2 },
};

const frozenGraph = {
  roots: ['implement'],
  edges: [{ from: 'implement', to: 'review', kind: 'after' }, { from: 'review', to: 'implement', kind: 'loop', rounds: 2 }],
};

test('a run that froze its workflow draws from it when its folder does not read: spec, prose, what a step would be told, and the graph', async () => {
  // The case seen on 2026-09-13: the folder holds a key this parser does not know — written for a newer one — so it does not
  // read, and every step came back with no spec and was drawn as a root. The record had the graph all along.
  const newer = workflowFolder({
    'implement.md': '---\nharness: claude\nsomeNewerKey: yes\n---\nImplement it.\n',
    'review.md': '---\nafter: implement\nloop: implement\n---\nReview it.\n',
  });
  writeRun({ ...r2, id: 'r-40', workflowDir: newer, workflow: frozenLoop, steps: { implement: { taskId: null }, review: { taskId: null } } });

  const run = await (await app.request('/api/runs/r-40')).json();
  assert.match(run.warning, /no longer reads as a workflow/);
  assert.match(run.warning, /someNewerKey/);
  // Not the pre-freeze record's warning, which would say the page has no spec to show.
  assert.doesNotMatch(run.warning, /without their spec or prose/);
  assert.match(run.warning, /the workflow the run froze/);
  assert.deepEqual(run.steps.map((s: { name: string; spec: unknown; body: string }) => [s.name, s.spec, s.body]), [
    ['implement', frozenSpecs.implement, 'Implement it, as frozen.'],
    ['review', frozenSpecs.review, 'Review it, as frozen.'],
  ]);
  assert.deepEqual(run.graph, frozenGraph);
  // Not filed: what the tick would file it with, composed from the frozen workflow.
  assert.ok(run.steps[0].told?.startsWith('Implement it, as frozen.\n\n## What was asked for'), run.steps[0].told);

  // And with no folder at all: the same page.
  writeRun({ ...r2, id: 'r-41', workflowDir: path.join(os.tmpdir(), 'hkb-api-no-such-workflow'), workflow: frozenLoop, steps: { implement: { taskId: null }, review: { taskId: null } } });
  const gone = await (await app.request('/api/runs/r-41')).json();
  assert.match(gone.warning, /is gone\. Nothing here is read from it/);
  assert.deepEqual(gone.steps.map((s: { spec: unknown }) => s.spec), [frozenSpecs.implement, frozenSpecs.review]);
  assert.deepEqual(gone.graph, frozenGraph);
});

test('a run that froze its workflow is drawn from it, not from a folder that reads and says something else', async () => {
  // Edited after `wf start`: the same steps, the loop taken out, and review no longer waiting on implement.
  const edited = workflowFolder({
    'implement.md': '---\nharness: codex\n---\nImplement it, edited.\n',
    'review.md': '---\nharness: claude\n---\nReview it, edited.\n',
  });
  writeRun({ ...r2, id: 'r-42', workflowDir: edited, workflow: frozenLoop, steps: { implement: { taskId: null }, review: { taskId: null } } });

  const run = await (await app.request('/api/runs/r-42')).json();
  assert.equal(run.warning, null);
  assert.deepEqual(run.steps.map((s: { spec: unknown }) => s.spec), [frozenSpecs.implement, frozenSpecs.review]);
  assert.deepEqual(run.steps.map((s: { body: string }) => s.body), ['Implement it, as frozen.', 'Review it, as frozen.']);
  assert.deepEqual(run.graph, frozenGraph);
  assert.ok(run.steps[1].told?.startsWith('Review it, as frozen.'), run.steps[1].told);
});

test('a run that froze its workflow shows only its steps: one its folder gained since is named in the warning, and neither listed nor drawn', async () => {
  // A step added to the folder after `wf start`. The tick reads the frozen workflow, so it never files it.
  const grown = workflowFolder({
    'implement.md': 'Implement it.\n',
    'review.md': '---\nafter: implement\n---\nReview it.\n',
    'docs.md': 'Write it down.\n',
  });
  writeRun({ ...r2, id: 'r-43', workflowDir: grown, workflow: frozenLoop, steps: { implement: { taskId: null }, review: { taskId: null } } });

  const run = await (await app.request('/api/runs/r-43')).json();
  assert.match(run.warning, /has changed since this run started: it has docs, which the run did not start with and will never file, so it is not shown\./);
  assert.deepEqual(run.steps.map((s: { name: string }) => s.name), ['implement', 'review']);
  // Not a root beside implement: the graph is the one the run froze.
  assert.deepEqual(run.graph, frozenGraph);
  assert.deepEqual((await listed('r-43')).steps.map((s: { name: string }) => s.name), ['implement', 'review']);
  // The steps `wf ls` lists, and no other.
  assert.deepEqual((await list(engine(), readRun('r-43'))).steps.map((s: { name: string }) => s.name), ['implement', 'review']);
  assert.equal((await app.request('/api/runs/r-43/steps/docs/log')).status, 404);
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

test('each step says how many attempts it has had, when the latest began, and how and when it ended', async () => {
  retryingTask('t-7');
  writeRun({ ...r2, id: 'r-7', steps: { implement: { taskId: 't-7', branch: 'wf/r-7/implement' }, review: { taskId: null } } });

  const run = await (await app.request('/api/runs/r-7')).json();
  assert.deepEqual(run.steps.map((s: { attempts: unknown }) => s.attempts), [
    // The second attempt is still going, so it has not ended; the one the engine lost is counted.
    { count: 2, latest: { startedAt: later, ended: null, endedAt: null, reason: null } },
    { count: 0, latest: null },
  ]);

  // An attempt that ran half an hour: its end is its `ended` event's, not its start's, so the board can say how long it took.
  journal('t-8', [
    filed('t-8'),
    { kind: 'starting', at, attempt: 1 },
    { kind: 'spawned', at, attempt: 1 },
    { kind: 'ended', at: later, attempt: 1, sessionId: 'ae/t-8/1', observed: 'done', reason: 'harness' },
    { kind: 'settled', at: later, outcome: 'succeeded' },
  ]);
  writeRun({ ...r2, id: 'r-8', steps: { implement: { taskId: 't-8', branch: 'wf/r-8/implement' }, review: { taskId: null } } });
  assert.deepEqual((await (await app.request('/api/runs/r-8')).json()).steps[0].attempts, {
    count: 1,
    latest: { startedAt: at, ended: 'done', endedAt: later, reason: 'harness' },
  });

  // A task the engine has no record of has had no attempts it can speak for.
  assert.deepEqual((await (await app.request('/api/runs/r-4')).json()).steps[0].attempts, { count: 0, latest: null });

  // The list is kept as it was, with the note `wf ls` prints beside a step: none, for a step on its first try.
  assert.deepEqual(Object.keys((await listed('r-7')).steps[0]), ['name', 'taskId', 'branch', 'status', 'note']);
  assert.equal((await listed('r-7')).steps[0].note, null);
});

const numbered = (n: number) => Array.from({ length: n }, (_, i) => `line ${i + 1}`);

const logOf = async (url: string) => {
  const res = await app.request(url);
  return { status: res.status, body: await res.json() };
};

test('a step\'s log is the end of its session\'s output: the last 200 lines, and whether there were more', async () => {
  settledTask('t-8', blocked);
  codexSession('t-8', 1, numbered(250).join('\n') + '\n');
  writeRun({ ...r2, id: 'r-8', steps: { implement: { taskId: 't-8', branch: 'wf/r-8/implement' }, review: { taskId: null } } });
  assert.deepEqual(await logOf('/api/runs/r-8/steps/implement/log'), {
    status: 200,
    body: { lines: numbered(250).slice(-200), truncated: true },
  });

  // As many lines as it shows is all of them, and output with no final newline loses no line.
  settledTask('t-9', blocked);
  codexSession('t-9', 1, numbered(200).join('\n'));
  writeRun({ ...r2, id: 'r-9', steps: { implement: { taskId: 't-9', branch: 'wf/r-9/implement' }, review: { taskId: null } } });
  assert.deepEqual(await logOf('/api/runs/r-9/steps/implement/log'), {
    status: 200,
    body: { lines: numbered(200), truncated: false },
  });
});

test('a step with no task has no log yet, and one filed but not started has the engine\'s word for it', async () => {
  assert.deepEqual(await logOf('/api/runs/r-8/steps/review/log'), { status: 200, body: { lines: [], truncated: false } });
  // A step the folder gained after the run started has no task either.
  assert.deepEqual(await logOf('/api/runs/r-6/steps/replacement/log'), { status: 200, body: { lines: [], truncated: false } });
  // Filed and waiting for a slot: there is no session to read, and the engine says so.
  assert.deepEqual(await logOf('/api/runs/r-5/steps/implement/log'), {
    status: 200,
    body: { lines: ['(no session yet)'], truncated: false },
  });
});

test('a log for a run or a step that does not exist is refused with a 404 that says where to look', async () => {
  const noRun = await logOf('/api/runs/no-such-run/steps/implement/log');
  assert.equal(noRun.status, 404);
  assert.match(noRun.body.error, /No run 'no-such-run'/);
  assert.match(noRun.body.error, /GET \/api\/runs/);

  const noStep = await logOf('/api/runs/r-8/steps/deploy/log');
  assert.equal(noStep.status, 404);
  assert.match(noStep.body.error, /Run 'r-8' has no step 'deploy'/);
  assert.match(noStep.body.error, /GET \/api\/runs\/r-8 lists the steps/);

  // Names every object answers to are not steps, and a run id is not a path out of the store.
  for (const url of ['/api/runs/r-8/steps/constructor/log', '/api/runs/r-8/steps/__proto__/log', '/api/runs/..%2Fescape/steps/implement/log']) {
    assert.equal((await app.request(url)).status, 404, url);
  }
});

test('output the engine cannot read is a 502 that says how to read it from the command line', async () => {
  settledTask('t-10', blocked);
  codexSession('t-10', 1, { unreadable: true });
  writeRun({ ...r2, id: 'r-10', steps: { implement: { taskId: 't-10', branch: 'wf/r-10/implement' }, review: { taskId: null } } });

  const { status, body } = await logOf('/api/runs/r-10/steps/implement/log');
  assert.equal(status, 502);
  assert.match(body.error, /Could not read the output of step 'implement' \(task t-10\)/);
  assert.match(body.error, /`wf logs r-10 implement`/);
});

// ─── what the run established ────────────────────────────────────────────────

const done = { outcome: 'done', summary: 'It is done.', needs: null, artifacts: [] };

/** A task on the run's `check` harness, as the engine journals one: running, or settled with the exit code its process gave, if it gave one. */
const checkTask = (taskId: string, how: { running: true } | { settled: 'succeeded' | 'failed' | 'stopped'; exitCode?: number }) => journal(taskId, [
  { ...filed(taskId), harness: 'check' },
  { kind: 'starting', at, attempt: 1 },
  { kind: 'spawned', at, attempt: 1 },
  ...('settled' in how
    ? [
        {
          kind: 'ended', at, attempt: 1, sessionId: `ae/${taskId}/1`, observed: how.settled === 'succeeded' ? 'done' : how.settled, reason: 'harness',
          ...(how.exitCode === undefined ? {} : { exitCode: how.exitCode }),
        },
        { kind: 'settled', at, outcome: how.settled },
      ]
    : []),
]);

/** A task asked for a closeout, whose session ended without giving one. */
const silentTask = (taskId: string) => journal(taskId, [
  { ...filed(taskId), closeoutSchema: { type: 'object' } },
  { kind: 'starting', at, attempt: 1 },
  { kind: 'spawned', at, attempt: 1 },
  { kind: 'ended', at, attempt: 1, sessionId: `ae/${taskId}/1`, observed: 'done', reason: 'harness' },
  { kind: 'settled', at, outcome: 'succeeded' },
]);

/** A test runner's stdout as the check's log keeps it: the command's output, then the exit code the run printed. */
const refusedOutput = 'ok 1 - builds\nnot ok 2 - parses a trailing comma\n# fail 1\n\n[wf check] exit 1\n';

/**
 * A run that froze its workflow, with a step for each thing `wf ls` says the run established: verified;
 * refused by its check, with an exit code and without one; still checking; done on its own word; ended
 * without the closeout it was asked for; still running; and waiting behind a refusal.
 */
const r20Steps = [
  { name: 'build', after: [], body: 'Build it.', check: 'npm run build' },
  { name: 'test', after: [], body: 'Test it.', check: 'npm test' },
  { name: 'e2e', after: [], body: 'Try it in a browser.', check: 'npm run e2e' },
  { name: 'lint', after: [], body: 'Lint it.', check: 'npm run lint' },
  { name: 'docs', after: [], body: 'Write it down.' },
  { name: 'notes', after: [], body: 'Say what changed.' },
  { name: 'plan', after: [], body: 'Plan the next one.' },
  { name: 'ship', after: ['test'], body: 'Ship it.' },
];

function seedChecks() {
  for (const step of ['build', 'test', 'e2e', 'lint', 'docs']) settledTask(`t-20-${step}`, done);
  checkTask('r-20-build-check', { settled: 'succeeded', exitCode: 0 });
  checkTask('r-20-test-check', { settled: 'failed', exitCode: 1 });
  detachedSession('check', 'r-20-test-check', 1, refusedOutput, 1);
  fs.mkdirSync(path.join(root, 'checks'), { recursive: true });
  fs.writeFileSync(path.join(root, 'checks', 'r-20-test-check.stderr'), 'npm error Test failed.\n');
  // Stopped at its deadline before it printed anything: no exit code, and no session output.
  checkTask('r-20-e2e-check', { settled: 'stopped' });
  checkTask('r-20-lint-check', { running: true });
  silentTask('t-20-notes');
  retryingTask('t-20-plan');
  writeRun({
    ...r2, id: 'r-20', workflow: r20Steps,
    // The folder as somebody left it after `wf start`: the same steps, and every `check:` taken out. The
    // run is judged by the workflow it froze, so these change nothing.
    workflowDir: workflowFolder(Object.fromEntries(r20Steps.map((s) => [`${s.name}.md`, `${s.after.length ? `---\nafter: ${s.after.join(', ')}\n---\n` : ''}${s.body}\n`]))),
    steps: {
      build: { taskId: 't-20-build', check: { taskId: 'r-20-build-check' } },
      test: { taskId: 't-20-test', check: { taskId: 'r-20-test-check' } },
      e2e: { taskId: 't-20-e2e', check: { taskId: 'r-20-e2e-check' } },
      lint: { taskId: 't-20-lint', check: { taskId: 'r-20-lint-check' } },
      docs: { taskId: 't-20-docs' },
      notes: { taskId: 't-20-notes' },
      plan: { taskId: 't-20-plan' },
      ship: { taskId: null },
    },
  });

  // Verified, then done on its own word: every step final, and every one lets a follower be filed.
  settledTask('t-21-build', done);
  checkTask('r-21-build-check', { settled: 'succeeded', exitCode: 0 });
  settledTask('t-21-docs', done);
  writeRun({
    ...r2, id: 'r-21', workflowDir: path.join(os.tmpdir(), 'hkb-api-no-such-workflow'),
    workflow: [{ name: 'build', after: [], body: 'Build it.', check: 'npm run build' }, { name: 'docs', after: ['build'], body: 'Write it down.' }],
    steps: { build: { taskId: 't-21-build', check: { taskId: 'r-21-build-check' } }, docs: { taskId: 't-21-docs' } },
  });
}

type Said = { name: string; status: string; branch: string | null };

test("each step says what the run established, in `wf ls`'s words, on both endpoints", async () => {
  seedChecks();
  const words = [
    ['build', 'verified ✓'],
    ['test', 'failed ✗ check (exit 1)'],
    ['e2e', 'failed ✗ check (unfinished)'],
    ['lint', 'checking'],
    ['docs', 'unverified · done'],
    ['notes', 'unsigned'],
    ['plan', 'starting'],
    ['ship', 'waiting'],
  ];
  const detail = await (await app.request('/api/runs/r-20')).json();
  const summary = await listed('r-20');
  assert.deepEqual(detail.steps.map((s: Said) => [s.name, s.status]), words);
  assert.deepEqual(summary.steps.map((s: Said) => [s.name, s.status]), words);
  // The refusals and the step that never signed; not a check still running, nor a step done on its own word.
  assert.deepEqual(detail.waitingOnYou, ['test', 'e2e', 'notes']);
  assert.deepEqual(summary.waitingOnYou, ['test', 'e2e', 'notes']);
  assert.equal(detail.warning, null);
});

test("the api's words, and who it says is waited on, are `list`'s — a refused check's exit code among them", async () => {
  const e = engine();
  for (const id of ['r-20', 'r-21']) {
    const words = await list(e, readRun(id));
    const detail = await (await app.request(`/api/runs/${id}`)).json();
    for (const [where, run] of [['list', await listed(id)], ['detail', detail]]) {
      assert.deepEqual(run.steps.map(({ name, status, branch }: Said) => ({ name, status, branch })), words.steps, `${id}, ${where}`);
      assert.deepEqual(run.waitingOnYou, words.waitingOnYou, `${id}, ${where}`);
    }
  }
});

test("a run's status is where `assess` puts it — running, succeeded, failed or cancelled — on both endpoints", async () => {
  const cases: Array<[id: string, status: string, why: string]> = [
    ['r-5', 'running', 'a step filed and queued for a slot, its follower still to be filed'],
    ['r-7', 'running', 'a step on its second attempt'],
    ['r-21', 'succeeded', 'verified, then done on its own word'],
    // From before runs froze their workflow, so judged by its folder, as the tick judges it — which has a step still to file.
    ['r-6', 'running', 'its step signed off blocked, and the folder since gained a step the tick would file'],
    ['r-20', 'failed', 'a check refused, so what waits on that step waits for ever'],
    ['r-8', 'failed', 'a step signed off blocked, so its follower will never be filed'],
    ['r-2', 'cancelled', 'called off, whatever its steps say'],
    ['r-3', 'cancelled', 'called off, and judged from its record, its folder gone'],
  ];
  for (const [id, status, why] of cases) {
    assert.equal((await listed(id)).status, status, `${id} listed: ${why}`);
    assert.equal((await (await app.request(`/api/runs/${id}`)).json()).status, status, `${id} in full: ${why}`);
  }
});

test('a run moves while the engine holds a task of it, or a tick would still file one — whatever `assess` calls it', async () => {
  const gone = path.join(os.tmpdir(), 'hkb-api-no-such-workflow');

  // The review's case: one root's check refused while its sibling's session still runs, and what waits on both
  // never will be filed. `assess` calls it failed; it is not finished.
  settledTask('t-24-a', done);
  checkTask('r-24-a-check', { settled: 'failed', exitCode: 1 });
  journal('t-24-b', [filed('t-24-b'), { kind: 'starting', at, attempt: 1 }, { kind: 'spawned', at, attempt: 1 }]);
  writeRun({
    ...r2, id: 'r-24', workflowDir: gone,
    workflow: [{ name: 'a', after: [], body: 'A.', check: 'npm test' }, { name: 'b', after: [], body: 'B.' }, { name: 'c', after: ['a', 'b'], body: 'C.' }],
    steps: { a: { taskId: 't-24-a', check: { taskId: 'r-24-a-check' } }, b: { taskId: 't-24-b' }, c: { taskId: null } },
  });
  assert.deepEqual((await listed('r-24')).steps.map((s: Said) => [s.name, s.status]), [['a', 'failed ✗ check (exit 1)'], ['b', 'starting'], ['c', 'waiting']]);

  // One branch failed, nothing is running, and a step waiting only on the other branch is still to be filed.
  journal('t-25-a', [
    filed('t-25-a'), { kind: 'starting', at, attempt: 1 }, { kind: 'spawned', at, attempt: 1 },
    { kind: 'ended', at, attempt: 1, sessionId: 'ae/t-25-a/1', observed: 'failed', reason: 'harness' },
    { kind: 'settled', at, outcome: 'failed' },
  ]);
  settledTask('t-25-b', done);
  writeRun({
    ...r2, id: 'r-25', workflowDir: gone,
    workflow: [{ name: 'a', after: [], body: 'A.' }, { name: 'b', after: [], body: 'B.' }, { name: 'c', after: ['b'], body: 'C.' }, { name: 'd', after: ['a'], body: 'D.' }],
    steps: { a: { taskId: 't-25-a' }, b: { taskId: 't-25-b' }, c: { taskId: null }, d: { taskId: null } },
  });

  // Called off, with a session the stop has not reached yet.
  writeRun({ ...r2, id: 'r-23', steps: { implement: { taskId: 't-7', branch: 'wf/r-23/implement' }, review: { taskId: null } } });
  fs.writeFileSync(path.join(root, 'runs', 'r-23.cancelled'), '2026-09-12T03:00:00.000Z');

  // From before runs froze their workflow, its folder gone and nobody calling it off: its bare `review` would
  // read as ready, and the tick, which cannot read its steps, files nothing.
  writeRun({ ...r2, id: 'r-26', workflowDir: gone });

  const cases: Array<[id: string, status: string, moving: boolean, why: string]> = [
    ['r-24', 'failed', true, "a check refused while a sibling's session still runs"],
    ['r-25', 'failed', true, 'a step failed, and a step waiting only on its sibling is still to file'],
    ['r-20', 'failed', true, 'a check refused, and another check and a session still run'],
    ['r-23', 'cancelled', true, 'called off, its session not stopped yet'],
    ['r-5', 'running', true, 'a step queued for a slot'],
    ['r-6', 'running', true, 'a step the folder gained, which the tick would file'],
    ['r-8', 'failed', false, 'a step signed off blocked, and its follower will never be filed'],
    ['r-26', 'failed', false, 'a record the tick cannot read'],
    ['r-21', 'succeeded', false, 'verified, then done on its own word'],
    ['r-2', 'cancelled', false, 'called off, nothing left running'],
    // `assess` reads a task nobody can find as still running; it holds nothing, and nothing waits for it to be filed.
    ['r-4', 'running', false, 'a step the engine has lost'],
  ];
  for (const [id, status, moving, why] of cases) {
    const summary = await listed(id);
    const detail = await (await app.request(`/api/runs/${id}`)).json();
    assert.deepEqual([summary.status, summary.moving], [status, moving], `${id} listed: ${why}`);
    assert.deepEqual([detail.status, detail.moving], [status, moving], `${id} in full: ${why}`);
  }
});

test('a check that refused with `retries:` left reads as the tick has it — running, moving, waiting on nobody — and one that did not finish, failed and waiting on you', async () => {
  const gone = path.join(os.tmpdir(), 'hkb-api-no-such-workflow');
  const retried = [{ name: 'a', after: [], body: 'A.', check: 'npm test', retries: 1 }, { name: 'b', after: ['a'], body: 'B.' }];
  // Refused: the check ran to its end and exited 1, and `retries: 1` leaves a try for the next tick to file.
  settledTask('t-27-a', done);
  checkTask('r-27-a-check', { settled: 'failed', exitCode: 1 });
  detachedSession('check', 'r-27-a-check', 1, refusedOutput, 1);
  writeRun({ ...r2, id: 'r-27', workflowDir: gone, workflow: retried, steps: { a: { taskId: 't-27-a', check: { taskId: 'r-27-a-check' } }, b: { taskId: null } } });
  // F's review: stopped at its deadline, which the engine settles `failed` with no exit code. No try is spent on it.
  settledTask('t-28-a', done);
  checkTask('r-28-a-check', { settled: 'failed' });
  writeRun({ ...r2, id: 'r-28', workflowDir: gone, workflow: retried, steps: { a: { taskId: 't-28-a', check: { taskId: 'r-28-a-check' } }, b: { taskId: null } } });

  const e = engine();
  const cases: Array<[id: string, status: string, moving: boolean, waitingOnYou: string[], word: string, why: string]> = [
    ['r-27', 'running', true, [], 'failed ✗ check (exit 1)', 'refused, with a try left: the next tick files it'],
    ['r-28', 'failed', false, ['a'], 'failed ✗ check (unfinished)', 'did not finish: it waits on a person, and no tick files a thing'],
  ];
  for (const [id, status, moving, waitingOnYou, word, why] of cases) {
    assert.deepEqual((await list(e, readRun(id))).waitingOnYou, waitingOnYou, `${id}, wf ls: ${why}`);
    for (const [where, run] of [['list', await listed(id)], ['detail', await (await app.request(`/api/runs/${id}`)).json()]] as const) {
      assert.deepEqual([run.status, run.moving, run.waitingOnYou, run.steps[0].status], [status, moving, waitingOnYou, word], `${id}, ${where}: ${why}`);
    }
  }
});

// ─── a loop, and what people asked for ───────────────────────────────────────

/**
 * A review that loops back to implement, frozen as `wf start` freezes it: `again` declared boolean in its `output:`,
 * and `rounds:` as the parser sets it for a loop that does not say — the shipped default.
 */
const looped = [
  { name: 'implement', after: [], body: 'Implement it.' },
  {
    name: 'review', after: ['implement'], body: 'Review it.', loop: 'implement', rounds: DEFAULT_ROUNDS,
    output: { file: 'review.json', schema: { type: 'object', properties: { again: { type: 'boolean' } }, required: ['again'], additionalProperties: false } },
  },
];

/**
 * A run whose loop is on `round`, both steps signed off: implement done — with its `replies`, which a loop's target owes
 * from round 2 — and review saying `again`. Each step has a try behind it for every round before, as `roundFiled` moves it.
 */
function seedLoop(id: string, round: number, again: boolean) {
  const steps: Record<string, object> = {};
  for (const name of ['implement', 'review']) {
    steps[name] = {
      taskId: `t-${id}-${name}-${round}`,
      tries: Array.from({ length: round - 1 }, (_, i) => ({ taskId: `t-${id}-${name}-${i + 1}`, then: 'round' })),
    };
  }
  // A declared field is a field of the closeout itself, beside the four every closeout has.
  settledTask(`t-${id}-implement-${round}`, round > 1 ? { ...done, replies: [] } : done);
  settledTask(`t-${id}-review-${round}`, { ...done, again });
  writeRun({ ...r2, id, workflowDir: path.join(os.tmpdir(), 'hkb-api-no-such-workflow'), workflow: looped, steps });
}

/** A person's ask, as `wf retry` and `wf round` leave one: a file of its own beside the run's record, named for what it asks. */
function askFor(id: string, name: string, ask: object) {
  const dir = path.join(root, 'runs', `${id}.asks`);
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, name), `${JSON.stringify({ ...ask, at: later }, null, 2)}\n`);
}

type Row = Said & { note: string | null };

/** A step row as `list` has it: a note only where it prints one. */
const asListed = ({ name, status, branch, note }: Row) => ({ name, status, branch, ...(note === null ? {} : { note }) });

type Judgement = [id: string, status: string, moving: boolean, waitingOnYou: string[], rows: Array<[name: string, status: string, note: string | null]>, why: string];

/** Each run on both endpoints: where it stands, whether it moves, who it waits on, each step's word and note — and those are `wf ls`'s. */
async function expectJudged(cases: readonly Judgement[]) {
  const e = engine();
  for (const [id, status, moving, waitingOnYou, rows, why] of cases) {
    const words = await list(e, readRun(id));
    for (const [where, run] of [['list', await listed(id)], ['detail', await (await app.request(`/api/runs/${id}`)).json()]] as const) {
      assert.deepEqual([run.status, run.moving, run.waitingOnYou], [status, moving, waitingOnYou], `${id}, ${where}: ${why}`);
      assert.deepEqual(run.steps.map((s: Row) => [s.name, s.status, s.note]), rows, `${id}, ${where}: ${why}`);
      assert.deepEqual(run.steps.map(asListed), words.steps, `${id}, ${where}: wf ls's words and notes`);
      assert.deepEqual(run.waitingOnYou, words.waitingOnYou, `${id}, ${where}: who wf ls says is waited on`);
    }
  }
}

test('a loop out of rounds reads `rounds exhausted`, waits on you, and does not move — until a person sends it round again', async () => {
  // Round 3 of 3, and review asked for another.
  seedLoop('r-30', DEFAULT_ROUNDS, true);
  // The same, and a person asked for round 4 with `wf round`, which the next tick files.
  seedLoop('r-31', DEFAULT_ROUNDS, true);
  askFor('r-31', 'round-review-4', { step: 'review', round: 4 });

  await expectJudged([
    ['r-30', 'failed', false, ['review'], [
      ['implement', 'unverified · done', 'round 3 of 3'],
      ['review', 'rounds exhausted', 'round 3 of 3, and it asked again — once more: wf round r-30 review'],
    ], 'at its cap, and it asked again: a person decides, and no tick files a thing'],
    ['r-31', 'running', true, [], [
      ['implement', 'unverified · done', 'round 3 of 3'],
      ['review', 'rounds exhausted', 'round 4 asked (wf round) — the next tick files implement'],
    ], 'a person asked for round 4: the next tick files it, and nobody is waited on'],
  ]);
});

test('a round the loop asked for, and a try a person asked for, read as the tick has them: a note beside the step, and the run moving', async () => {
  // Round 1 of 3, and review asked for another: the next tick files round 2 on its word, with nothing of the run in flight.
  seedLoop('r-32', 1, true);
  // Signed off blocked, and a person asked for another try with `wf retry r-33 implement`.
  settledTask('t-33-implement', blocked);
  writeRun({
    ...r2, id: 'r-33', workflowDir: path.join(os.tmpdir(), 'hkb-api-no-such-workflow'),
    workflow: [{ name: 'implement', after: [], body: 'Implement it.' }, { name: 'review', after: ['implement'], body: 'Review it.' }],
    steps: { implement: { taskId: 't-33-implement' }, review: { taskId: null } },
  });
  askFor('r-33', 'retry-implement-2', { mode: 'nudge' });

  await expectJudged([
    ['r-32', 'running', true, [], [
      ['implement', 'unverified · done', null],
      ['review', 'unverified · done', `round 2 of ${DEFAULT_ROUNDS} due — review asked again, and the next tick files implement`],
    ], 'review asked again with rounds left: a round due moves the run as a try due does'],
    ['r-33', 'running', true, [], [
      ['implement', 'succeeded · BLOCKED', 'try 2 asked (--nudge) — the next tick files it'],
      ['review', 'waiting', null],
    ], 'a person asked for another try: the next tick files it, and nobody is waited on'],
  ]);
});

test("a step with a `check:` carries its command, and once its check refused, the exit and each stream's last lines", async () => {
  const run = await (await app.request('/api/runs/r-20')).json();
  const checkOf = (name: string) => run.steps.find((s: Said) => s.name === name).check;
  assert.deepEqual(checkOf('build'), { command: 'npm run build', refused: null });
  assert.deepEqual(checkOf('lint'), { command: 'npm run lint', refused: null });
  assert.deepEqual(checkOf('test'), {
    command: 'npm test',
    refused: {
      exit: 'exit 1',
      stdout: { lines: ['ok 1 - builds', 'not ok 2 - parses a trailing comma', '# fail 1', '', '[wf check] exit 1'], truncated: false },
      stderr: { lines: ['npm error Test failed.'], truncated: false },
      unreadable: null,
    },
  });
  // Stopped before it printed: no number, no stderr file, and the engine's word that there is no session to read.
  assert.deepEqual(checkOf('e2e'), {
    command: 'npm run e2e',
    refused: { exit: 'unfinished', stdout: { lines: ['(no session yet)'], truncated: false }, stderr: { lines: [], truncated: false }, unreadable: null },
  });
  // No `check:` in the workflow the run froze.
  for (const name of ['docs', 'notes', 'plan', 'ship']) assert.equal(checkOf(name), null, name);
});

test("a refused check whose output cannot be read still answers, and says how to read it from the command line", async () => {
  settledTask('t-22-test', done);
  checkTask('r-22-test-check', { settled: 'failed', exitCode: 2 });
  detachedSession('check', 'r-22-test-check', 1, { unreadable: true }, 2);
  writeRun({
    ...r2, id: 'r-22', workflowDir: path.join(os.tmpdir(), 'hkb-api-no-such-workflow'),
    workflow: [{ name: 'test', after: [], body: 'Test it.', check: 'npm test' }],
    steps: { test: { taskId: 't-22-test', check: { taskId: 'r-22-test-check' } } },
  });

  const res = await app.request('/api/runs/r-22');
  assert.equal(res.status, 200);
  const [test] = (await res.json()).steps;
  assert.equal(test.status, 'failed ✗ check (exit 2)');
  assert.deepEqual({ ...test.check.refused, unreadable: undefined }, {
    exit: 'exit 2', stdout: { lines: [], truncated: false }, stderr: { lines: [], truncated: false }, unreadable: undefined,
  });
  assert.match(test.check.refused.unreadable, /Could not read the output of its check \(task r-22-test-check\)/);
  assert.match(test.check.refused.unreadable, /`wf decide r-22`/);
});

test('the list of runs observes the engine once, however many runs and steps are filed', async (t) => {
  // A `claude` ahead of the real one on PATH, which notes each call and sees no sessions of ours.
  const bin = fs.mkdtempSync(path.join(os.tmpdir(), 'hkb-api-bin-'));
  const calls = path.join(bin, 'calls');
  fs.writeFileSync(path.join(bin, 'claude'), `#!/bin/sh\necho "$*" >> '${calls}'\necho '[]'\n`, { mode: 0o755 });
  const before = process.env.PATH;
  process.env.PATH = `${bin}${path.delimiter}${before}`;
  t.after(() => {
    process.env.PATH = before;
  });
  const observations = () =>
    (fs.existsSync(calls) ? fs.readFileSync(calls, 'utf8') : '').split('\n').filter((line) => line.startsWith('agents')).length;

  for (const n of [11, 12, 13]) {
    queuedTask(`t-${n}`);
    writeRun({ ...r2, id: `r-${n}`, steps: { implement: { taskId: `t-${n}`, branch: `wf/r-${n}/implement` }, review: { taskId: null } } });
  }
  const res = await app.request('/api/runs');
  assert.equal(res.status, 200);
  const runs: Array<{ steps: Array<{ taskId: string | null; status: string }> }> = await res.json();
  // A view per filed step would have observed once for each of these, and reading a refused check's log once more for each of those.
  assert.ok(runs.flatMap((r) => r.steps).filter((s) => s.taskId).length >= 3);
  assert.ok(runs.flatMap((r) => r.steps).some((s) => s.status === 'failed ✗ check (exit 1)'), 'a refused check, worded with its exit code, is on the list');
  assert.equal(observations(), 1);
});
