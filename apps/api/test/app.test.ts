import './harness.ts';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { scratch } from './scratch.ts';
import type { RunDetail } from '../src/detail.ts';
import type { RunSummary } from '../src/runs.ts';

// agent-orchestrator locates its store when the module loads, so point it at a scratch directory first.
const root = scratch('hkb-api-');
/** A folder nothing is made in: a path under it names a workflow folder that is not there. */
const NOWHERE = scratch('hkb-api-nowhere-');
process.env.WF_ROOT = root;
const { app } = await import('../src/app.ts');
const { engine, list, readRun } = await import('agent-orchestrator');
const { DEFAULT_ROUNDS } = await import('agent-orchestrator/workflow');

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
const settledTask = (taskId: string, closeout: object) =>
  journal(taskId, [
    filed(taskId),
    { kind: 'starting', at, attempt: 1 },
    { kind: 'spawned', at, attempt: 1 },
    { kind: 'ended', at, attempt: 1, sessionId: `ae/${taskId}/1`, observed: 'done', reason: 'harness', closeout },
    { kind: 'settled', at, outcome: 'succeeded' },
  ]);

const later = '2026-09-12T00:40:00.000Z';

/** A task on its second attempt, still running: the engine lost sight of the first. */
const retryingTask = (taskId: string) =>
  journal(taskId, [
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
const codexSession = (taskId: string, attempt: number, output: string | { unreadable: true }) =>
  detachedSession('codex', taskId, attempt, output);

const workflowFolder = (files: Record<string, string>) => {
  const dir = scratch('hkb-api-workflow-');
  for (const [name, text] of Object.entries(files)) fs.writeFileSync(path.join(dir, name), text);
  return dir;
};

/** Two steps, the second reviewing the first. */
const workflowDir = workflowFolder({
  'implement.md': '---\nharness: codex\nmodel: gpt-5\ndeadlineSeconds: 600\n---\nImplement the thing.\n',
  'review.md': '---\nafter: implement\n---\nReview what implement did.\n',
});

const blocked = { outcome: 'blocked', summary: 'Half of it is done.', needs: 'Which database?', artifacts: ['NOTES.md'] };

/**
 * `blocked` as the api gives it: a path on the branch is the path alone, and it declared no output and gave no replies. `raw` is the
 * statement as the engine recorded it.
 */
const blockedCloseout = {
  outcome: 'blocked',
  summary: 'Half of it is done.',
  needs: 'Which database?',
  artifacts: [{ path: 'NOTES.md' }],
  output: {},
  missing: [],
  replies: null,
  schema: {},
  raw: blocked,
};

/** What a step on its first try says of it, as its one entry in `tries`: the current try, reached by nothing. */
const firstTry = (step: {
  taskId: string | null;
  status: string;
  attempts: object;
  check: object | null;
  closeout: object | null;
  unreadable?: null;
}) => [
  {
    try: 1,
    round: 1,
    then: null,
    current: true,
    note: null,
    taskId: step.taskId,
    status: step.status,
    attempts: step.attempts,
    check: step.check,
    closeout: step.closeout,
    unreadable: null,
    answer: null,
  },
];

/** The engine's record of a task `filed` journals: a codex task with nothing else said — which Codex runs in `workspace-write`. */
const filedBare = {
  model: null,
  askedModel: null,
  effort: null,
  contextTokens: null,
  permissionMode: null,
  runsIn: { mode: 'workspace-write', by: 'default' },
  remote: null,
  tools: null,
  deadlineSeconds: null,
};

/** A run as GET /api/runs lists it. */
const listed = async (id: string) => {
  const run = ((await (await app.request('/api/runs')).json()) as RunSummary[]).find((r) => r.id === id);
  assert.ok(run, `${id} is on the list`);
  return run;
};
/** A run as GET /api/runs/:id answers it. */
const detailOf = async (id: string) => (await (await app.request(`/api/runs/${id}`)).json()) as RunDetail;

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
    id: 'r-1',
    repo: '/code/app',
    workspace: '/code/app',
    baseRef: 'abc123',
    branch: 'main',
    isolate: true,
    brief: 'Do the thing',
    workflowDir: '/code/app/workflows',
    createdAt: '2026-09-12T00:00:00.000Z',
    steps: { implement: { taskId: 't-1', branch: 'wf/r-1/implement' }, review: { taskId: null } },
  });
  fs.writeFileSync(path.join(root, 'runs', 'r-1.cancelled'), '2026-09-12T01:00:00.000Z');

  const res = await app.request('/api/runs');
  assert.deepEqual(await res.json(), [
    {
      id: 'r-1',
      repo: '/code/app',
      place: 'git',
      work: null,
      brief: 'Do the thing',
      workflowDir: '/code/app/workflows',
      try: null,
      createdAt: '2026-09-12T00:00:00.000Z',
      // Started, and none of its filings on the feed (there is none here): when it was created.
      startedAt: '2026-09-12T00:00:00.000Z',
      cancelledAt: '2026-09-12T01:00:00.000Z',
      // Nobody pruned it: no mark beside its status.
      pruned: null,
      // Started without `--after`: it waits on no run.
      after: [],
      waiting: null,
      heldUntil: [],
      holding: null,
      status: 'cancelled',
      moving: false,
      // Nothing of it was measured: no cost, which is not $0.
      cost: null,
      steps: [
        // t-1 is on the record and not in this engine's store: a fresh WF_ROOT has no tasks at all.
        {
          name: 'implement',
          taskId: 't-1',
          branch: 'wf/r-1/implement',
          status: 'unknown',
          note: null,
          needs: null,
          blockedByHarness: false,
          waitingFor: null,
          approve: null,
          denied: null,
        },
        {
          name: 'review',
          taskId: null,
          branch: null,
          status: 'waiting',
          note: null,
          needs: null,
          blockedByHarness: false,
          waitingFor: null,
          approve: null,
          denied: null,
        },
      ],
      // No workflow frozen and no folder to read: nothing says what waits on what, so every step is a root, as on the run's page.
      graph: { roots: ['implement', 'review'], edges: [] },
      waitingOnYou: [],
      onYou: [],
      // Called off: nothing to decide about a result nobody is waiting for.
      toDecide: null,
    },
  ]);
});

const r2 = {
  id: 'r-2',
  repo: '/code/app',
  workspace: '/code/app/.wt/r-2',
  baseRef: 'def456',
  branch: 'main',
  isolate: true,
  brief: 'Add a cache\n\nKeep it small.',
  workflowDir,
  createdAt: '2026-09-12T02:00:00.000Z',
  steps: {
    implement: { taskId: 't-2', workspace: '/code/app/.wt/r-2/implement', branch: 'wf/r-2/implement' },
    review: { taskId: null },
  },
};

/**
 * The timeline of a step whose one task settled as `settledTask` journals it — filed, spawned and ended all at `at` — in a store that keeps
 * no feed, so its filing, and the queue, is not known: never 0. What its session used is nobody's count.
 */
const settledTimeline = (taskId: string) => [
  {
    try: 1,
    round: 1,
    sessionOf: null,
    check: null,
    session: {
      taskId,
      at: 'ended',
      filedAt: null,
      spawnedAt: at,
      endedAt: at,
      attempts: 1,
      queuedMs: null,
      ranMs: 0,
      queued: 'not known',
      ran: '0s',
    },
    used: {
      usage: null,
      used: 'not measured',
      cost: 'not measured',
      costUsd: null,
      apiMs: null,
      toolMs: null,
      read: null,
      peak: null,
      rebuilt: 0,
    },
  },
];

/** The run's time over that one task, in a workflow with no loop: no round is totalled, and the run is, with a queue and a wall nobody can know. */
const oneTaskTotals = () => ({
  rounds: [],
  run: {
    loop: null,
    round: null,
    tasks: 1,
    inFlight: 0,
    queuedMs: 0,
    ranMs: 0,
    wallMs: null,
    queued: 'not known',
    ran: '0s',
    wall: 'not known',
    cost: null,
  },
});

test("a run in full: the brief, each step's spec and prose, what it was told, and how it went", async () => {
  settledTask('t-2', blocked);
  writeRun(r2);

  const res = await app.request('/api/runs/r-2');
  assert.equal(res.status, 200);
  const run = (await res.json()) as RunDetail;
  const [implement, review] = run.steps;
  assert.deepEqual(
    { ...run, steps: undefined },
    {
      id: 'r-2',
      brief: 'Add a cache\n\nKeep it small.',
      repo: '/code/app',
      place: 'git',
      work: null,
      workflowDir,
      try: null,
      baseRef: 'def456',
      branch: 'main',
      isolate: true,
      createdAt: '2026-09-12T02:00:00.000Z',
      startedAt: '2026-09-12T02:00:00.000Z',
      cancelledAt: null,
      pruned: null,
      onDisk: { worktrees: false, files: false },
      after: [],
      waiting: null,
      heldUntil: [],
      holding: null,
      // implement signed off blocked, so review can never be filed: the run is over, and failed.
      status: 'failed',
      moving: false,
      cost: null,
      read: null,
      waitingOnYou: ['implement'],
      onYou: ['implement'],
      // Failed at implement: not a run at its result, so there is nothing about the result to decide.
      toDecide: null,
      // Gated at no step: no gate to wait at.
      gates: [],
      warning: null,
      graph: { roots: ['implement'], edges: [{ from: 'implement', to: 'review', kind: 'after' }] },
      steps: undefined,
      timeline: oneTaskTotals(),
    },
  );

  const implementTry = {
    taskId: 't-2',
    status: 'succeeded · BLOCKED',
    check: null,
    closeout: blockedCloseout,
    unreadable: null,
    attempts: { count: 1, latest: { startedAt: at, ended: 'done', endedAt: at, reason: 'harness' } },
  };
  assert.deepEqual(implement, {
    name: 'implement',
    spec: {
      harness: 'codex',
      model: 'gpt-5',
      effort: null,
      context: null,
      after: [],
      workspace: null,
      resume: null,
      permissionMode: null,
      sandbox: null,
      tools: null,
      deadlineSeconds: 600,
      loop: null,
      rounds: null,
    },
    // The engine's record, not the folder's words: this journal was written with none of them.
    filed: filedBare,
    body: 'Implement the thing.',
    // What the engine was filed with, not the brief recomposed from today's folder and record.
    told: filedBrief('t-2'),
    workspace: '/code/app/.wt/r-2/implement',
    branch: 'wf/r-2/implement',
    // A git run's step works on a branch: it lists no files, whatever its worktree holds.
    files: [],
    filesError: null,
    note: null,
    // Its question, off its closeout; no session the harness blocked, so no last line; nothing asked of it yet.
    needs: 'Which database?',
    blockedByHarness: false,
    waitingFor: null,
    approve: null,
    denied: null,
    gate: null,
    accepted: null,
    lastLine: null,
    said: [],
    asked: null,
    ...implementTry,
    // Its journal carries no usage: nobody measured it, which is not 0.
    used: {
      usage: null,
      used: 'not measured',
      cost: 'not measured',
      costUsd: null,
      apiMs: null,
      toolMs: null,
      read: null,
      peak: null,
      rebuilt: 0,
    },
    spent: null,
    budget: null,
    raise: null,
    tries: firstTry(implementTry),
    timeline: settledTimeline('t-2'),
  });

  const reviewTry = {
    taskId: null,
    status: 'waiting',
    check: null,
    closeout: null,
    unreadable: null,
    attempts: { count: 0, latest: null },
  };
  assert.deepEqual(
    { ...review, told: undefined },
    {
      name: 'review',
      spec: {
        harness: null,
        model: null,
        effort: null,
        context: null,
        after: ['implement'],
        workspace: null,
        resume: null,
        permissionMode: null,
        sandbox: null,
        tools: null,
        deadlineSeconds: null,
        loop: null,
        rounds: null,
      },
      // Not filed: the engine has filed it with nothing yet.
      filed: null,
      body: 'Review what implement did.',
      told: undefined,
      workspace: null,
      branch: null,
      files: [],
      filesError: null,
      note: null,
      needs: null,
      blockedByHarness: false,
      waitingFor: null,
      approve: null,
      denied: null,
      gate: null,
      accepted: null,
      lastLine: null,
      said: [],
      asked: null,
      ...reviewTry,
      // Not filed: it consumed nothing, and has no try on the clock.
      used: null,
      spent: null,
      budget: null,
      raise: null,
      tries: firstTry(reviewTry),
      timeline: [],
    },
  );
  // Not filed, so what it would be given now: implement has run in this workspace, so look there.
  assert.ok(review.told);
  assert.ok(review.told.startsWith('Review what implement did.\n\n## What was asked for\n\nAdd a cache\n\nKeep it small.'), review.told);
  assert.match(review.told, /already been worked in by: implement/);
  assert.match(review.told, /git diff def456/);
});

test('a step that signed off blocked is waiting on you in the list too', async () => {
  const run = await listed('r-2');
  assert.deepEqual(
    run.steps.map((s: { status: string }) => s.status),
    ['succeeded · BLOCKED', 'waiting'],
  );
  assert.deepEqual(run.waitingOnYou, ['implement']);
});

test('a task the engine has no record of is unknown on both endpoints, not queued', async () => {
  writeRun({ ...r2, id: 'r-4', steps: { implement: { taskId: 't-4-lost', branch: 'wf/r-4/implement' }, review: { taskId: null } } });
  queuedTask('t-5');
  writeRun({ ...r2, id: 'r-5', steps: { implement: { taskId: 't-5', branch: 'wf/r-5/implement' }, review: { taskId: null } } });

  const lost = await detailOf('r-4');
  assert.equal(lost.steps[0].status, 'unknown');
  assert.equal(lost.steps[0].told, null);
  assert.equal((await listed('r-4')).steps[0].status, 'unknown');

  // The case it must not swallow: a task filed and waiting for a slot is still `pending`.
  const queued = await detailOf('r-5');
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
    assert.deepEqual(
      run.steps.map(({ name, status, branch }: { name: string; status: string; branch: string | null }) => ({ name, status, branch })),
      words.steps,
      id,
    );
    assert.deepEqual(run.waitingOnYou, words.waitingOnYou, id);
  }
});

test('a run whose workflow folder is gone still answers, from its record', async () => {
  const gone = path.join(NOWHERE, 'no-such-workflow');
  writeRun({ ...r2, id: 'r-3', workflowDir: gone });

  const res = await app.request('/api/runs/r-3');
  assert.equal(res.status, 200);
  const run = (await res.json()) as RunDetail;
  assert.ok(run.warning);
  assert.match(run.warning, /is gone/);
  assert.ok(run.warning.includes(gone), run.warning);
  assert.match(run.warning, /without their spec or prose/);
  // From before runs froze their workflow, and its folder gone: nothing on the record says what waits on what.
  assert.deepEqual(run.graph, { roots: ['implement', 'review'], edges: [] });
  assert.deepEqual((await listed('r-3')).graph, run.graph);
  assert.deepEqual(run.waitingOnYou, ['implement']);
  const implementTry = {
    taskId: 't-2',
    status: 'succeeded · BLOCKED',
    check: null,
    closeout: blockedCloseout,
    unreadable: null,
    attempts: { count: 1, latest: { startedAt: at, ended: 'done', endedAt: at, reason: 'harness' } },
  };
  const reviewTry = {
    taskId: null,
    status: 'waiting',
    check: null,
    closeout: null,
    unreadable: null,
    attempts: { count: 0, latest: null },
  };
  assert.deepEqual(run.steps, [
    {
      name: 'implement',
      spec: null,
      filed: filedBare,
      body: null,
      told: filedBrief('t-2'),
      workspace: '/code/app/.wt/r-2/implement',
      branch: 'wf/r-2/implement',
      files: [],
      filesError: null,
      note: null,
      needs: 'Which database?',
      blockedByHarness: false,
      waitingFor: null,
      approve: null,
      denied: null,
      gate: null,
      accepted: null,
      lastLine: null,
      said: [],
      asked: null,
      ...implementTry,
      used: {
        usage: null,
        used: 'not measured',
        cost: 'not measured',
        costUsd: null,
        apiMs: null,
        toolMs: null,
        read: null,
        peak: null,
        rebuilt: 0,
      },
      spent: null,
      budget: null,
      raise: null,
      tries: firstTry(implementTry),
      timeline: settledTimeline('t-2'),
    },
    {
      name: 'review',
      spec: null,
      filed: null,
      body: null,
      told: null,
      workspace: null,
      branch: null,
      files: [],
      filesError: null,
      note: null,
      needs: null,
      blockedByHarness: false,
      waitingFor: null,
      approve: null,
      denied: null,
      gate: null,
      accepted: null,
      lastLine: null,
      said: [],
      asked: null,
      ...reviewTry,
      used: null,
      spent: null,
      budget: null,
      raise: null,
      tries: firstTry(reviewTry),
      timeline: [],
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
    ...r2,
    id: 'r-6',
    workflowDir: changed,
    steps: { original: { taskId: 't-6', workspace: '/code/app/.wt/r-6/original', branch: 'wf/r-6/original' }, review: { taskId: null } },
  });
  // Renamed after the run started: the folder still reads as a workflow, only not this run's.
  fs.renameSync(path.join(changed, 'original.md'), path.join(changed, 'replacement.md'));
  fs.writeFileSync(path.join(changed, 'review.md'), '---\nafter: replacement\n---\nReview it.\n');

  const run = await detailOf('r-6');
  assert.ok(run.warning);
  assert.match(run.warning, /no longer has original/);
  assert.match(run.warning, /has replacement, which the run did not start with/);
  assert.deepEqual(run.waitingOnYou, ['original']);
  assert.deepEqual(
    run.steps.map((s: { name: string }) => s.name),
    ['original', 'review', 'replacement'],
  );

  const [original, review, replacement] = run.steps;
  const originalTry = {
    taskId: 't-6',
    status: 'succeeded · BLOCKED',
    check: null,
    closeout: blockedCloseout,
    unreadable: null,
    attempts: { count: 1, latest: { startedAt: at, ended: 'done', endedAt: at, reason: 'harness' } },
  };
  assert.deepEqual(original, {
    name: 'original',
    spec: null,
    filed: filedBare,
    body: null,
    told: filedBrief('t-6'),
    workspace: '/code/app/.wt/r-6/original',
    branch: 'wf/r-6/original',
    files: [],
    filesError: null,
    note: null,
    needs: 'Which database?',
    blockedByHarness: false,
    waitingFor: null,
    approve: null,
    denied: null,
    gate: null,
    accepted: null,
    lastLine: null,
    said: [],
    asked: null,
    ...originalTry,
    used: {
      usage: null,
      used: 'not measured',
      cost: 'not measured',
      costUsd: null,
      apiMs: null,
      toolMs: null,
      read: null,
      peak: null,
      rebuilt: 0,
    },
    spent: null,
    budget: null,
    raise: null,
    tries: firstTry(originalTry),
    timeline: settledTimeline('t-6'),
  });
  assert.deepEqual([review.body, review.spec?.after, review.status], ['Review it.', ['replacement'], 'waiting']);
  assert.deepEqual(
    [replacement.body, replacement.taskId, replacement.status, replacement.closeout],
    ['Do the original thing.', null, 'waiting', null],
  );

  const summary = await listed('r-6');
  assert.deepEqual(
    summary.steps.map((s: { name: string; status: string }) => [s.name, s.status]),
    [
      ['original', 'succeeded · BLOCKED'],
      ['review', 'waiting'],
      ['replacement', 'waiting'],
    ],
  );
  assert.deepEqual(summary.waitingOnYou, ['original']);
});

/** A loop as `wf start` freezes it: review loops back to implement, for at most two rounds. */
const frozenLoop = [
  { name: 'implement', after: [], body: 'Implement it, as frozen.', harness: 'claude', model: 'opus' },
  {
    name: 'review',
    after: ['implement'],
    body: 'Review it, as frozen.',
    harness: 'codex',
    loop: 'implement',
    rounds: 2,
    output: {
      file: 'review.json',
      schema: { type: 'object', properties: { again: { type: 'boolean' } }, required: ['again'], additionalProperties: false },
    },
  },
];

const frozenSpecs = {
  implement: {
    harness: 'claude',
    model: 'opus',
    effort: null,
    context: null,
    after: [],
    workspace: null,
    resume: null,
    permissionMode: null,
    sandbox: null,
    tools: null,
    deadlineSeconds: null,
    loop: null,
    rounds: null,
  },
  review: {
    harness: 'codex',
    model: null,
    effort: null,
    context: null,
    after: ['implement'],
    workspace: null,
    resume: null,
    permissionMode: null,
    sandbox: null,
    tools: null,
    deadlineSeconds: null,
    loop: 'implement',
    rounds: 2,
  },
};

const frozenGraph = {
  roots: ['implement'],
  edges: [
    { from: 'implement', to: 'review', kind: 'after' },
    { from: 'review', to: 'implement', kind: 'loop', rounds: 2 },
  ],
};

test('a run that froze its workflow draws from it when its folder does not read: spec, prose, what a step would be told, and the graph', async () => {
  // The case seen on 2026-09-13: the folder holds a key this parser does not know — written for a newer one — so it does not
  // read, and every step came back with no spec and was drawn as a root. The record had the graph all along.
  const newer = workflowFolder({
    'implement.md': '---\nharness: claude\nsomeNewerKey: yes\n---\nImplement it.\n',
    'review.md': '---\nafter: implement\nloop: implement\n---\nReview it.\n',
  });
  writeRun({
    ...r2,
    id: 'r-40',
    workflowDir: newer,
    workflow: frozenLoop,
    steps: { implement: { taskId: null }, review: { taskId: null } },
  });

  const run = await detailOf('r-40');
  assert.ok(run.warning);
  assert.match(run.warning, /no longer reads as a workflow/);
  assert.match(run.warning, /someNewerKey/);
  // Not the pre-freeze record's warning, which would say the page has no spec to show.
  assert.doesNotMatch(run.warning, /without their spec or prose/);
  assert.match(run.warning, /the workflow the run froze/);
  assert.deepEqual(
    run.steps.map((s) => [s.name, s.spec, s.body]),
    [
      ['implement', frozenSpecs.implement, 'Implement it, as frozen.'],
      ['review', frozenSpecs.review, 'Review it, as frozen.'],
    ],
  );
  assert.deepEqual(run.graph, frozenGraph);
  // The list draws the card's flow off the same graph, with no read of the run.
  assert.deepEqual((await listed('r-40')).graph, frozenGraph);
  // Not filed: what the tick would file it with, composed from the frozen workflow.
  assert.ok(run.steps[0].told?.startsWith('Implement it, as frozen.\n\n## What was asked for'), String(run.steps[0].told));

  // And with no folder at all: the same page.
  writeRun({
    ...r2,
    id: 'r-41',
    workflowDir: path.join(NOWHERE, 'no-such-workflow'),
    workflow: frozenLoop,
    steps: { implement: { taskId: null }, review: { taskId: null } },
  });
  const gone = await detailOf('r-41');
  assert.ok(gone.warning);
  assert.match(gone.warning, /is gone\. Nothing here is read from it/);
  assert.deepEqual(
    gone.steps.map((s) => s.spec),
    [frozenSpecs.implement, frozenSpecs.review],
  );
  assert.deepEqual(gone.graph, frozenGraph);
  assert.deepEqual((await listed('r-41')).graph, frozenGraph);
});

test('a run frozen before stage 4a part 2 with a step of `maxAttempts: 2` still reads, and its spec no longer carries the key', async () => {
  const frozen = frozenLoop.map((s) => (s.name === 'review' ? { ...s, maxAttempts: 2 } : s));
  writeRun({
    ...r2,
    id: 'r-44',
    workflowDir: path.join(NOWHERE, 'no-such-workflow'),
    workflow: frozen,
    steps: { implement: { taskId: null }, review: { taskId: null } },
  });
  const response = await app.request('/api/runs/r-44');
  assert.equal(response.status, 200);
  const run = (await response.json()) as RunDetail;
  assert.deepEqual(
    run.steps.map((s) => s.spec),
    [frozenSpecs.implement, frozenSpecs.review],
  );
  assert.ok(run.steps[1].spec);
  assert.equal('maxAttempts' in run.steps[1].spec, false);
  assert.ok(await listed('r-44'), 'and it lists');
});

test('a run that froze its workflow is drawn from it, not from a folder that reads and says something else', async () => {
  // Edited after `wf start`: the same steps, the loop taken out, and review no longer waiting on implement.
  const edited = workflowFolder({
    'implement.md': '---\nharness: codex\n---\nImplement it, edited.\n',
    'review.md': '---\nharness: claude\n---\nReview it, edited.\n',
  });
  writeRun({
    ...r2,
    id: 'r-42',
    workflowDir: edited,
    workflow: frozenLoop,
    steps: { implement: { taskId: null }, review: { taskId: null } },
  });

  const run = await detailOf('r-42');
  assert.equal(run.warning, null);
  assert.deepEqual(
    run.steps.map((s) => s.spec),
    [frozenSpecs.implement, frozenSpecs.review],
  );
  assert.deepEqual(
    run.steps.map((s) => s.body),
    ['Implement it, as frozen.', 'Review it, as frozen.'],
  );
  assert.deepEqual(run.graph, frozenGraph);
  // And so is its card: not the edited folder's graph, which has no edge at all.
  assert.deepEqual((await listed('r-42')).graph, frozenGraph);
  assert.ok(run.steps[1].told?.startsWith('Review it, as frozen.'), String(run.steps[1].told));
});

test('a run that froze its workflow shows only its steps: one its folder gained since is named in the warning, and neither listed nor drawn', async () => {
  // A step added to the folder after `wf start`. The tick reads the frozen workflow, so it never files it.
  const grown = workflowFolder({
    'implement.md': 'Implement it.\n',
    'review.md': '---\nafter: implement\n---\nReview it.\n',
    'docs.md': 'Write it down.\n',
  });
  writeRun({
    ...r2,
    id: 'r-43',
    workflowDir: grown,
    workflow: frozenLoop,
    steps: { implement: { taskId: null }, review: { taskId: null } },
  });

  const run = await detailOf('r-43');
  assert.ok(run.warning);
  assert.match(
    run.warning,
    /has changed since this run started: it has docs, which the run did not start with and will never file, so it is not shown\./,
  );
  assert.deepEqual(
    run.steps.map((s) => s.name),
    ['implement', 'review'],
  );
  // Not a root beside implement: the graph is the one the run froze.
  assert.deepEqual(run.graph, frozenGraph);
  assert.deepEqual((await listed('r-43')).graph, frozenGraph);
  assert.deepEqual(
    (await listed('r-43')).steps.map((s) => s.name),
    ['implement', 'review'],
  );
  // The steps `wf ls` lists, and no other.
  assert.deepEqual(
    (await list(engine(), readRun('r-43'))).steps.map((s: { name: string }) => s.name),
    ['implement', 'review'],
  );
  assert.equal((await app.request('/api/runs/r-43/steps/docs/log')).status, 404);
});

test('an unknown run is refused with a 404 that says where to look', async () => {
  const res = await app.request('/api/runs/no-such-run');
  assert.equal(res.status, 404);
  const { error } = (await res.json()) as { error: string };
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

  const run = await detailOf('r-7');
  assert.deepEqual(
    run.steps.map((s: { attempts: unknown }) => s.attempts),
    [
      // The second attempt is still going, so it has not ended; the one the engine lost is counted.
      { count: 2, latest: { startedAt: later, ended: null, endedAt: null, reason: null } },
      { count: 0, latest: null },
    ],
  );

  // An attempt that ran half an hour: its end is its `ended` event's, not its start's, so the board can say how long it took.
  journal('t-8', [
    filed('t-8'),
    { kind: 'starting', at, attempt: 1 },
    { kind: 'spawned', at, attempt: 1 },
    { kind: 'ended', at: later, attempt: 1, sessionId: 'ae/t-8/1', observed: 'done', reason: 'harness' },
    { kind: 'settled', at: later, outcome: 'succeeded' },
  ]);
  writeRun({ ...r2, id: 'r-8', steps: { implement: { taskId: 't-8', branch: 'wf/r-8/implement' }, review: { taskId: null } } });
  assert.deepEqual((await detailOf('r-8')).steps[0].attempts, {
    count: 1,
    latest: { startedAt: at, ended: 'done', endedAt: later, reason: 'harness' },
  });

  // A session that ended with no statement where its task asked for one: since stage 4a the runtime says so as a fact,
  // `stated: false`, and settles it as its harness ended it — the api says what it said before, off the orchestrator's reading.
  const quiet = (taskId: string, end: object, settled: string) =>
    journal(taskId, [
      { ...filed(taskId), closeoutSchema: { type: 'object' } },
      { kind: 'starting', at, attempt: 1 },
      { kind: 'spawned', at, attempt: 1 },
      { kind: 'ended', at: later, attempt: 1, sessionId: `ae/${taskId}/1`, ...end },
      { kind: 'settled', at: later, outcome: settled },
    ]);
  const unsignedWords = { count: 1, latest: { startedAt: at, ended: 'failed', endedAt: later, reason: 'unsigned' } };
  quiet('t-8u', { observed: 'done', reason: 'harness', stated: false }, 'succeeded');
  writeRun({ ...r2, id: 'r-8u', steps: { implement: { taskId: 't-8u', branch: 'wf/r-8u/implement' }, review: { taskId: null } } });
  const unsigned = await detailOf('r-8u');
  assert.deepEqual([unsigned.steps[0].attempts, unsigned.steps[0].status], [unsignedWords, 'unsigned']);
  // As a journal from before stage 4a has it: the runtime's own word.
  quiet('t-8o', { observed: 'failed', reason: 'unsigned' }, 'failed');
  writeRun({ ...r2, id: 'r-8o', steps: { implement: { taskId: 't-8o', branch: 'wf/r-8o/implement' }, review: { taskId: null } } });
  const old = await detailOf('r-8o');
  assert.deepEqual([old.steps[0].attempts, old.steps[0].status], [unsignedWords, 'unsigned']);

  // A session its harness cut at its spend cap: since stage 4b the runtime carries the cut as a fact, `limit: 'budget'`, on an end that is
  // the harness's own, and judges nothing of it — the api says what it said when the runtime did, off the orchestrator's reading. And a
  // journal from before, whose end the runtime judged `budget`, reads the same.
  const cappedWords = { count: 1, latest: { startedAt: at, ended: 'failed', endedAt: later, reason: 'budget' } };
  quiet('t-8b', { observed: 'failed', reason: 'harness', limit: 'budget', exitCode: 1 }, 'failed');
  writeRun({ ...r2, id: 'r-8b', steps: { implement: { taskId: 't-8b', branch: 'wf/r-8b/implement' }, review: { taskId: null } } });
  const capped = await detailOf('r-8b');
  assert.deepEqual([capped.steps[0].attempts, capped.steps[0].status], [cappedWords, 'budget exhausted']);
  quiet('t-8c', { observed: 'failed', reason: 'budget', exitCode: 1 }, 'failed');
  writeRun({ ...r2, id: 'r-8c', steps: { implement: { taskId: 't-8c', branch: 'wf/r-8c/implement' }, review: { taskId: null } } });
  const cappedBefore = await detailOf('r-8c');
  assert.deepEqual([cappedBefore.steps[0].attempts, cappedBefore.steps[0].status], [cappedWords, 'budget exhausted']);

  // A task the engine has no record of has had no attempts it can speak for.
  assert.deepEqual((await detailOf('r-4')).steps[0].attempts, { count: 0, latest: null });

  // The list is kept as it was, with the note `wf ls` prints beside a step — none, for a step on its first try — and what a person
  // has to know to act on it.
  assert.deepEqual(Object.keys((await listed('r-7')).steps[0]), [
    'name',
    'taskId',
    'branch',
    'status',
    'note',
    'needs',
    'blockedByHarness',
    'waitingFor',
    'approve',
    'denied',
  ]);
  assert.equal((await listed('r-7')).steps[0].note, null);
});

const numbered = (n: number) => Array.from({ length: n }, (_, i) => `line ${i + 1}`);

const logOf = async (url: string) => {
  const res = await app.request(url);
  return { status: res.status, body: await res.json() };
};

test("a step's log is the end of its session's output: the last 200 lines, and whether there were more", async () => {
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

test("a step with no task has no log yet, and one filed but not started has the engine's word for it", async () => {
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
  const { error: noRunError } = noRun.body as { error: string };
  assert.match(noRunError, /No run 'no-such-run'/);
  assert.match(noRunError, /GET \/api\/runs/);

  const noStep = await logOf('/api/runs/r-8/steps/deploy/log');
  assert.equal(noStep.status, 404);
  const { error: noStepError } = noStep.body as { error: string };
  assert.match(noStepError, /Run 'r-8' has no step 'deploy'/);
  assert.match(noStepError, /GET \/api\/runs\/r-8 lists the steps/);

  // Names every object answers to are not steps, and a run id is not a path out of the store.
  for (const url of [
    '/api/runs/r-8/steps/constructor/log',
    '/api/runs/r-8/steps/__proto__/log',
    '/api/runs/..%2Fescape/steps/implement/log',
  ]) {
    assert.equal((await app.request(url)).status, 404, url);
  }
});

test('output the engine cannot read is a 502 that says how to read it from the command line', async () => {
  settledTask('t-10', blocked);
  codexSession('t-10', 1, { unreadable: true });
  writeRun({ ...r2, id: 'r-10', steps: { implement: { taskId: 't-10', branch: 'wf/r-10/implement' }, review: { taskId: null } } });

  const { status, body } = await logOf('/api/runs/r-10/steps/implement/log');
  assert.equal(status, 502);
  const { error } = body as { error: string };
  assert.match(error, /Could not read the output of step 'implement' \(task t-10\)/);
  assert.match(error, /`wf logs r-10 implement`/);
});

// ─── what the run established ────────────────────────────────────────────────

const done = { outcome: 'done', summary: 'It is done.', needs: null, artifacts: [] };

/** A task on the run's `check` harness, as the engine journals one: running, or settled with the exit code its process gave, if it gave one. */
const checkTask = (taskId: string, how: { running: true } | { settled: 'succeeded' | 'failed' | 'stopped'; exitCode?: number }) =>
  journal(taskId, [
    { ...filed(taskId), harness: 'check' },
    { kind: 'starting', at, attempt: 1 },
    { kind: 'spawned', at, attempt: 1 },
    ...('settled' in how
      ? [
          {
            kind: 'ended',
            at,
            attempt: 1,
            sessionId: `ae/${taskId}/1`,
            observed: how.settled === 'succeeded' ? 'done' : how.settled,
            reason: 'harness',
            ...(how.exitCode === undefined ? {} : { exitCode: how.exitCode }),
          },
          { kind: 'settled', at, outcome: how.settled },
        ]
      : []),
  ]);

/** A task asked for a closeout, whose session ended without giving one. */
const silentTask = (taskId: string) =>
  journal(taskId, [
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
    ...r2,
    id: 'r-20',
    workflow: r20Steps,
    // The folder as somebody left it after `wf start`: the same steps, and every `check:` taken out. The
    // run is judged by the workflow it froze, so these change nothing.
    workflowDir: workflowFolder(
      Object.fromEntries(
        r20Steps.map((s) => [`${s.name}.md`, `${s.after.length ? `---\nafter: ${s.after.join(', ')}\n---\n` : ''}${s.body}\n`]),
      ),
    ),
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
    ...r2,
    id: 'r-21',
    workflowDir: path.join(NOWHERE, 'no-such-workflow'),
    workflow: [
      { name: 'build', after: [], body: 'Build it.', check: 'npm run build' },
      { name: 'docs', after: ['build'], body: 'Write it down.' },
    ],
    steps: { build: { taskId: 't-21-build', check: { taskId: 'r-21-build-check' } }, docs: { taskId: 't-21-docs' } },
  });
}

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
  const detail = await detailOf('r-20');
  const summary = await listed('r-20');
  assert.deepEqual(
    detail.steps.map((s) => [s.name, s.status]),
    words,
  );
  assert.deepEqual(
    summary.steps.map((s) => [s.name, s.status]),
    words,
  );
  // The refusals and the step that never signed; not a check still running, nor a step done on its own word.
  assert.deepEqual(detail.waitingOnYou, ['test', 'e2e', 'notes']);
  assert.deepEqual(summary.waitingOnYou, ['test', 'e2e', 'notes']);
  assert.equal(detail.warning, null);
});

test("the api's words, and who it says is waited on, are `list`'s — a refused check's exit code among them", async () => {
  const e = engine();
  for (const id of ['r-20', 'r-21']) {
    const words = await list(e, readRun(id));
    const detail = await detailOf(id);
    for (const [where, run] of [
      ['list', await listed(id)],
      ['detail', detail],
    ] as const) {
      assert.deepEqual(
        run.steps.map(({ name, status, branch }) => ({ name, status, branch })),
        words.steps,
        `${id}, ${where}`,
      );
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
    assert.equal((await detailOf(id)).status, status, `${id} in full: ${why}`);
  }
});

test('a run moves while the engine holds a task of it, or a tick would still file one — whatever `assess` calls it', async () => {
  const gone = path.join(NOWHERE, 'no-such-workflow');

  // The review's case: one root's check refused while its sibling's session still runs, and what waits on both
  // never will be filed. `assess` calls it failed; it is not finished.
  settledTask('t-24-a', done);
  checkTask('r-24-a-check', { settled: 'failed', exitCode: 1 });
  journal('t-24-b', [filed('t-24-b'), { kind: 'starting', at, attempt: 1 }, { kind: 'spawned', at, attempt: 1 }]);
  writeRun({
    ...r2,
    id: 'r-24',
    workflowDir: gone,
    workflow: [
      { name: 'a', after: [], body: 'A.', check: 'npm test' },
      { name: 'b', after: [], body: 'B.' },
      { name: 'c', after: ['a', 'b'], body: 'C.' },
    ],
    steps: { a: { taskId: 't-24-a', check: { taskId: 'r-24-a-check' } }, b: { taskId: 't-24-b' }, c: { taskId: null } },
  });
  assert.deepEqual(
    (await listed('r-24')).steps.map((s) => [s.name, s.status]),
    [
      ['a', 'failed ✗ check (exit 1)'],
      ['b', 'starting'],
      ['c', 'waiting'],
    ],
  );

  // One branch failed, nothing is running, and a step waiting only on the other branch is still to be filed.
  journal('t-25-a', [
    filed('t-25-a'),
    { kind: 'starting', at, attempt: 1 },
    { kind: 'spawned', at, attempt: 1 },
    { kind: 'ended', at, attempt: 1, sessionId: 'ae/t-25-a/1', observed: 'failed', reason: 'harness' },
    { kind: 'settled', at, outcome: 'failed' },
  ]);
  settledTask('t-25-b', done);
  writeRun({
    ...r2,
    id: 'r-25',
    workflowDir: gone,
    workflow: [
      { name: 'a', after: [], body: 'A.' },
      { name: 'b', after: [], body: 'B.' },
      { name: 'c', after: ['b'], body: 'C.' },
      { name: 'd', after: ['a'], body: 'D.' },
    ],
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
    const detail = await detailOf(id);
    assert.deepEqual([summary.status, summary.moving], [status, moving], `${id} listed: ${why}`);
    assert.deepEqual([detail.status, detail.moving], [status, moving], `${id} in full: ${why}`);
  }
});

test('a check that refused with `retries:` left reads as the tick has it — running, moving, waiting on nobody — and one that did not finish, failed and waiting on you', async () => {
  const gone = path.join(NOWHERE, 'no-such-workflow');
  const retried = [
    { name: 'a', after: [], body: 'A.', check: 'npm test', retries: 1 },
    { name: 'b', after: ['a'], body: 'B.' },
  ];
  // Refused: the check ran to its end and exited 1, and `retries: 1` leaves a try for the next tick to file.
  settledTask('t-27-a', done);
  checkTask('r-27-a-check', { settled: 'failed', exitCode: 1 });
  detachedSession('check', 'r-27-a-check', 1, refusedOutput, 1);
  writeRun({
    ...r2,
    id: 'r-27',
    workflowDir: gone,
    workflow: retried,
    steps: { a: { taskId: 't-27-a', check: { taskId: 'r-27-a-check' } }, b: { taskId: null } },
  });
  // F's review: stopped at its deadline, which the engine settles `failed` with no exit code. No try is spent on it.
  settledTask('t-28-a', done);
  checkTask('r-28-a-check', { settled: 'failed' });
  writeRun({
    ...r2,
    id: 'r-28',
    workflowDir: gone,
    workflow: retried,
    steps: { a: { taskId: 't-28-a', check: { taskId: 'r-28-a-check' } }, b: { taskId: null } },
  });

  const e = engine();
  const cases: Array<[id: string, status: string, moving: boolean, waitingOnYou: string[], word: string, why: string]> = [
    ['r-27', 'running', true, [], 'failed ✗ check (exit 1)', 'refused, with a try left: the next tick files it'],
    ['r-28', 'failed', false, ['a'], 'failed ✗ check (unfinished)', 'did not finish: it waits on a person, and no tick files a thing'],
  ];
  for (const [id, status, moving, waitingOnYou, word, why] of cases) {
    assert.deepEqual((await list(e, readRun(id))).waitingOnYou, waitingOnYou, `${id}, wf ls: ${why}`);
    for (const [where, run] of [
      ['list', await listed(id)],
      ['detail', await detailOf(id)],
    ] as const) {
      assert.deepEqual(
        [run.status, run.moving, run.waitingOnYou, run.steps[0].status],
        [status, moving, waitingOnYou, word],
        `${id}, ${where}: ${why}`,
      );
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
    name: 'review',
    after: ['implement'],
    body: 'Review it.',
    loop: 'implement',
    rounds: DEFAULT_ROUNDS,
    output: {
      file: 'review.json',
      schema: { type: 'object', properties: { again: { type: 'boolean' } }, required: ['again'], additionalProperties: false },
    },
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
  // A declared field is a field of the closeout itself, beside the four every closeout has. From round 2 an empty `replies` is no answer.
  const replies = [{ finding: 'src/flag.ts:12', answer: 'fixed', why: 'parsed before it is read' }];
  settledTask(`t-${id}-implement-${round}`, round > 1 ? { ...done, replies } : done);
  settledTask(`t-${id}-review-${round}`, { ...done, again });
  writeRun({ ...r2, id, workflowDir: path.join(NOWHERE, 'no-such-workflow'), workflow: looped, steps });
}

/** A person's ask, as `wf retry` and `wf round` leave one: a file of its own beside the run's record, named for what it asks. */
function askFor(id: string, name: string, ask: object) {
  const dir = path.join(root, 'runs', `${id}.asks`);
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, name), `${JSON.stringify({ ...ask, at: later }, null, 2)}\n`);
}

/** A step row as the list and the detail both carry it. */
type Row = Pick<RunSummary['steps'][number], 'name' | 'status' | 'branch' | 'note'>;

/** A step row as `list` has it: a note only where it prints one. */
const asListed = ({ name, status, branch, note }: Row) => ({ name, status, branch, ...(note === null ? {} : { note }) });

type Judgement = [
  id: string,
  status: string,
  moving: boolean,
  waitingOnYou: string[],
  rows: Array<[name: string, status: string, note: string | null]>,
  why: string,
];

/** Each run on both endpoints: where it stands, whether it moves, who it waits on, each step's word and note — and those are `wf ls`'s. */
async function expectJudged(cases: readonly Judgement[]) {
  const e = engine();
  for (const [id, status, moving, waitingOnYou, rows, why] of cases) {
    const words = await list(e, readRun(id));
    for (const [where, run] of [
      ['list', await listed(id)],
      ['detail', await detailOf(id)],
    ] as const) {
      assert.deepEqual([run.status, run.moving, run.waitingOnYou], [status, moving, waitingOnYou], `${id}, ${where}: ${why}`);
      assert.deepEqual(
        run.steps.map((s) => [s.name, s.status, s.note]),
        rows,
        `${id}, ${where}: ${why}`,
      );
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
    [
      'r-30',
      'failed',
      false,
      ['review'],
      [
        ['implement', 'unverified · done', 'round 3 of 3'],
        ['review', 'rounds exhausted', 'round 3 of 3, and it asked again — once more: wf round r-30 review'],
      ],
      'at its cap, and it asked again: a person decides, and no tick files a thing',
    ],
    [
      'r-31',
      'running',
      true,
      [],
      [
        ['implement', 'unverified · done', 'round 3 of 3'],
        ['review', 'rounds exhausted', 'round 4 asked (wf round) — the next tick files implement'],
      ],
      'a person asked for round 4: the next tick files it, and nobody is waited on',
    ],
  ]);
});

test('a round the loop asked for, and a try a person asked for, read as the tick has them: a note beside the step, and the run moving', async () => {
  // Round 1 of 3, and review asked for another: the next tick files round 2 on its word, with nothing of the run in flight.
  seedLoop('r-32', 1, true);
  // Signed off blocked, and a person asked for another try with `wf retry r-33 implement`.
  settledTask('t-33-implement', blocked);
  writeRun({
    ...r2,
    id: 'r-33',
    workflowDir: path.join(NOWHERE, 'no-such-workflow'),
    workflow: [
      { name: 'implement', after: [], body: 'Implement it.' },
      { name: 'review', after: ['implement'], body: 'Review it.' },
    ],
    steps: { implement: { taskId: 't-33-implement' }, review: { taskId: null } },
  });
  askFor('r-33', 'retry-implement-2', { mode: 'nudge' });

  await expectJudged([
    [
      'r-32',
      'running',
      true,
      [],
      [
        ['implement', 'unverified · done', null],
        ['review', 'unverified · done', `round 2 of ${DEFAULT_ROUNDS} due — review asked again, and the next tick files implement`],
      ],
      'review asked again with rounds left: a round due moves the run as a try due does',
    ],
    [
      'r-33',
      'running',
      true,
      [],
      [
        ['implement', 'succeeded · BLOCKED', 'try 2 asked (--nudge) — the next tick files it'],
        ['review', 'waiting', null],
      ],
      'a person asked for another try: the next tick files it, and nobody is waited on',
    ],
  ]);
});

test("a step with a `check:` carries its command, and once its check refused, the exit and each stream's last lines", async () => {
  const run = await detailOf('r-20');
  const checkOf = (name: string) => run.steps.find((s) => s.name === name)?.check;
  assert.deepEqual(checkOf('build'), { command: 'npm run build', taskId: 'r-20-build-check', verdict: 'passed', refused: null });
  assert.deepEqual(checkOf('lint'), { command: 'npm run lint', taskId: 'r-20-lint-check', verdict: 'checking', refused: null });
  assert.deepEqual(checkOf('test'), {
    command: 'npm test',
    taskId: 'r-20-test-check',
    verdict: 'exit 1',
    refused: {
      exit: 'exit 1',
      stdout: { lines: ['ok 1 - builds', 'not ok 2 - parses a trailing comma', '# fail 1', '', '[wf check] exit 1'], truncated: false },
      stderr: { lines: ['npm error Test failed.'], truncated: false },
      unreadable: null,
    },
  });
  // Stopped before it printed: no number, no stderr file, and its harness's word that the session it ended as printed nothing.
  // Read by the id its end was recorded under, with no observe (settled since 2026-09-25): before, this fixture, which has no run
  // file, read `(no session yet)` off an observe that found none; a real check's worker writes one, and read the same as now.
  assert.deepEqual(checkOf('e2e'), {
    command: 'npm run e2e',
    taskId: 'r-20-e2e-check',
    verdict: 'unfinished',
    refused: {
      exit: 'unfinished',
      stdout: { lines: ['(no output yet)'], truncated: false },
      stderr: { lines: [], truncated: false },
      unreadable: null,
    },
  });
  // No `check:` in the workflow the run froze.
  for (const name of ['docs', 'notes', 'plan', 'ship']) assert.equal(checkOf(name), null, name);
});

test('a refused check whose output cannot be read still answers, and says how to read it from the command line', async () => {
  settledTask('t-22-test', done);
  checkTask('r-22-test-check', { settled: 'failed', exitCode: 2 });
  detachedSession('check', 'r-22-test-check', 1, { unreadable: true }, 2);
  writeRun({
    ...r2,
    id: 'r-22',
    workflowDir: path.join(NOWHERE, 'no-such-workflow'),
    workflow: [{ name: 'test', after: [], body: 'Test it.', check: 'npm test' }],
    steps: { test: { taskId: 't-22-test', check: { taskId: 'r-22-test-check' } } },
  });

  const res = await app.request('/api/runs/r-22');
  assert.equal(res.status, 200);
  const [test] = ((await res.json()) as RunDetail).steps;
  assert.equal(test.status, 'failed ✗ check (exit 2)');
  const refused = test.check?.refused;
  assert.ok(refused);
  assert.deepEqual(
    { ...refused, unreadable: undefined },
    {
      exit: 'exit 2',
      stdout: { lines: [], truncated: false },
      stderr: { lines: [], truncated: false },
      unreadable: undefined,
    },
  );
  assert.ok(refused.unreadable);
  assert.match(refused.unreadable, /Could not read the output of its check \(task r-22-test-check\)/);
  assert.match(refused.unreadable, /`wf decide r-22`/);
});

test('the list of runs observes the engine at most once, however many runs and steps are filed, and not at all with nothing in flight', async (t) => {
  // A `claude` ahead of the real one on PATH, which notes each call and sees no sessions of ours.
  const bin = scratch('hkb-api-bin-');
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
  const runs = (await res.json()) as RunSummary[];
  // A view per filed step would have observed once for each of these, and reading a refused check's log once more for each of those.
  assert.ok(runs.flatMap((r) => r.steps).filter((s) => s.taskId).length >= 3);
  assert.ok(
    runs.flatMap((r) => r.steps).some((s) => s.status === 'failed ✗ check (exit 1)'),
    'a refused check, worded with its exit code, is on the list',
  );
  // Queued, settled and refused, none of them in flight: no harness is looked at (`list(taskIds)`). Once for any number of background
  // sessions in flight is `asks.test.ts`'s, with three the harness blocked.
  assert.equal(observations(), 0);
});

// ─── what each round did, what a step runs with, and its files ──────────────

/**
 * A `claude` ahead of the real one on PATH for the length of the test, which notes each call and sees no sessions of ours: how
 * many times a request observed the harnesses.
 */
function countingObservations(t: { after: (fn: () => void) => void }): () => number {
  const bin = scratch('hkb-api-bin-');
  const calls = path.join(bin, 'calls');
  fs.writeFileSync(path.join(bin, 'claude'), `#!/bin/sh\necho "$*" >> '${calls}'\necho '[]'\n`, { mode: 0o755 });
  const before = process.env.PATH;
  process.env.PATH = `${bin}${path.delimiter}${before}`;
  t.after(() => {
    process.env.PATH = before;
  });
  return () => (fs.existsSync(calls) ? fs.readFileSync(calls, 'utf8') : '').split('\n').filter((line) => line.startsWith('agents')).length;
}

const gone = path.join(NOWHERE, 'no-such-workflow');

test('a step on its third try, in the second round of its loop, carries every try: its round, what replaced it, its task, check and closeout — off one observation', async (t) => {
  // implement's check refused its first try, and `retries: 1` filed a second, which passed; review asked for another round, and
  // the loop filed implement's third try, which answered the findings and passed; review then asked for no more.
  const findings = [
    { file: 'src/cache.ts', line: 12, finding: 'The cache never expires.' },
    { file: 'src/cache.ts', line: 40, finding: 'A miss is counted twice.' },
  ];
  const replies = [
    {
      finding: 'src/cache.ts:12 — the cache never expires',
      answer: 'fixed',
      why: 'Entries expire after the TTL now, and a test waits it out.',
    },
    { finding: 'src/cache.ts:40 — a miss is counted twice', answer: "won't fix", why: 'It is counted once per layer, on purpose.' },
  ];
  const said = {
    implement: { ...done, summary: 'Added the cache.' },
    implement2: { ...done, summary: 'Fixed the failing test.' },
    implement3: { ...done, summary: 'Answered the review.', replies },
    review: { ...done, summary: 'Two findings.', again: true, findings },
    review2: { ...done, summary: 'Nothing left.', again: false, findings: [] },
  };
  settledTask('r-50-implement', said.implement);
  checkTask('r-50-implement-check', { settled: 'failed', exitCode: 1 });
  fs.mkdirSync(path.join(root, 'checks'), { recursive: true });
  fs.writeFileSync(path.join(root, 'checks', 'r-50-implement-check.stderr'), 'npm error Test failed.\n');
  settledTask('r-50-implement-try2', said.implement2);
  checkTask('r-50-implement-try2-check', { settled: 'succeeded', exitCode: 0 });
  settledTask('r-50-review', said.review);
  settledTask('r-50-implement-try3', said.implement3);
  checkTask('r-50-implement-try3-check', { settled: 'succeeded', exitCode: 0 });
  settledTask('r-50-review-try2', said.review2);
  const reviewOutput = {
    type: 'object',
    properties: { again: { type: 'boolean' }, findings: { type: 'array' } },
    required: ['again', 'findings'],
    additionalProperties: false,
  };
  writeRun({
    ...r2,
    id: 'r-50',
    workflowDir: gone,
    workflow: [
      { name: 'implement', after: [], body: 'Implement it.', check: 'npm test', retries: 1 },
      {
        name: 'review',
        after: ['implement'],
        body: 'Review it.',
        loop: 'implement',
        rounds: DEFAULT_ROUNDS,
        output: { file: 'review.json', schema: reviewOutput },
      },
    ],
    steps: {
      implement: {
        taskId: 'r-50-implement-try3',
        check: { taskId: 'r-50-implement-try3-check' },
        tries: [
          { taskId: 'r-50-implement', check: { taskId: 'r-50-implement-check' }, then: 'retries' },
          { taskId: 'r-50-implement-try2', check: { taskId: 'r-50-implement-try2-check' }, then: 'round' },
        ],
      },
      review: { taskId: 'r-50-review-try2', tries: [{ taskId: 'r-50-review', then: 'round' }] },
    },
  });

  const observations = countingObservations(t);
  const run = await detailOf('r-50');
  // Eight tasks — implement's three and their checks, review's two — read over one look at the harnesses, and no refused check of the
  // current try to read the output of. A `view` each was eight observations, one after another, on a page polled every five seconds; and
  // with every one of them settled, the look is not made (`list(taskIds)`).
  assert.equal(observations(), 0);

  const once = { count: 1, latest: { startedAt: at, ended: 'done', endedAt: at, reason: 'harness' } };
  // Each closeout with what was recorded, untouched, as `raw`: `replies` is read into the api's shape, and the statement is not.
  const closeout = (raw: { summary: string }, more: object = {}) => ({
    outcome: 'done',
    summary: raw.summary,
    needs: null,
    artifacts: [],
    output: {},
    missing: [],
    replies: null,
    schema: {},
    raw,
    ...more,
  });
  const passed = (taskId: string) => ({ command: 'npm test', taskId, verdict: 'passed', refused: null });
  const [implement, review] = run.steps;
  assert.deepEqual([implement.status, implement.note, implement.attempts], ['verified ✓', 'round 2 of 3', once]);
  assert.deepEqual(implement.tries, [
    {
      try: 1,
      round: 1,
      then: 'retries',
      current: false,
      taskId: 'r-50-implement',
      note: null,
      status: 'succeeded',
      attempts: once,
      // Its check refused: the verdict, and its stderr, which is a file. Its output is not read for a try that is over.
      check: {
        command: 'npm test',
        taskId: 'r-50-implement-check',
        verdict: 'exit 1',
        refused: { exit: 'exit 1', stdout: null, stderr: { lines: ['npm error Test failed.'], truncated: false }, unreadable: null },
      },
      closeout: closeout(said.implement),
      unreadable: null,
      answer: null,
    },
    {
      try: 2,
      round: 1,
      then: 'round',
      current: false,
      taskId: 'r-50-implement-try2',
      note: 'try 2, by retries: 1',
      status: 'succeeded',
      attempts: once,
      check: passed('r-50-implement-try2-check'),
      closeout: closeout(said.implement2),
      unreadable: null,
      answer: null,
    },
    {
      try: 3,
      round: 2,
      then: null,
      current: true,
      taskId: 'r-50-implement-try3',
      note: 'round 2 of 3',
      status: 'verified ✓',
      attempts: once,
      check: passed('r-50-implement-try3-check'),
      closeout: closeout(said.implement3, { replies }),
      unreadable: null,
      answer: null,
    },
  ]);
  // The current try is where it was: the step's own check and closeout are its.
  assert.deepEqual([implement.check, implement.closeout], [implement.tries[2].check, implement.tries[2].closeout]);

  assert.deepEqual(review.tries, [
    {
      try: 1,
      round: 1,
      then: 'round',
      current: false,
      taskId: 'r-50-review',
      note: null,
      status: 'succeeded',
      attempts: once,
      check: null,
      // What it declared, in its schema's order: the findings implement was handed, and each field's schema off the frozen workflow.
      closeout: closeout(said.review, { output: { again: true, findings }, schema: reviewOutput.properties }),
      unreadable: null,
      answer: null,
    },
    {
      try: 2,
      round: 2,
      then: null,
      current: true,
      taskId: 'r-50-review-try2',
      note: 'round 2 of 3',
      status: review.status,
      attempts: once,
      check: null,
      closeout: closeout(said.review2, { output: { again: false, findings: [] }, schema: reviewOutput.properties }),
      unreadable: null,
      answer: null,
    },
  ]);
  assert.equal(review.status, 'unverified · done');
});

test("a closeout carries each declared field's schema off the workflow the run froze — given or missing — and the statement as it was recorded", async () => {
  const schema = {
    type: 'object',
    properties: {
      approach: { type: 'string', description: 'The change in a paragraph.' },
      files: { type: 'array', items: { type: 'object', properties: { path: { type: 'string' }, change: { type: 'string' } } } },
    },
    required: ['approach', 'files'],
    additionalProperties: false,
  };
  // An outcome that is neither word, an artifact that is not a path, a field nobody declared: read forgivingly, and kept as said.
  const said = {
    outcome: 'finished',
    summary: 'A plan.',
    needs: null,
    artifacts: ['PLAN.md', 7],
    approach: 'Cache it.',
    aside: { mood: 'fine' },
  };
  settledTask('r-51-plan', said);
  writeRun({
    ...r2,
    id: 'r-51',
    workflowDir: gone,
    workflow: [{ name: 'plan', after: [], body: 'Plan it.', output: { file: 'plan.json', schema } }],
    steps: { plan: { taskId: 'r-51-plan' } },
  });
  const run = await detailOf('r-51');
  const { closeout } = run.steps[0];
  assert.ok(closeout);
  assert.deepEqual(
    [closeout.outcome, closeout.artifacts, closeout.output, closeout.missing],
    ['done', [{ path: 'PLAN.md' }], { approach: 'Cache it.' }, ['files']],
  );
  // The folder is gone: the schema is the record's, a field's own, `files` among them though it was not given.
  assert.deepEqual(closeout.schema, schema.properties);
  assert.deepEqual(closeout.raw, said);
});

test('a statement that could not be read reaches the board as it came, with why — and a readable one has nothing unreadable', async () => {
  // Cut off mid-string, and an array: neither is a closeout; each is what the agent said, and the board shows it whole.
  const cut = '{"outcome": "done", "summary": "Cut off';
  for (const [id, said] of [
    ['r-52-cut', cut],
    ['r-52-list', ['done']],
  ] as const) {
    settledTask(id, said as unknown as object);
  }
  settledTask('r-52-fine', { outcome: 'done', summary: 'Fine.' });
  writeRun({
    ...r2,
    id: 'r-52',
    workflowDir: gone,
    workflow: [
      { name: 'cut', after: [], body: 'Say it.' },
      { name: 'list', after: [], body: 'Say it.' },
      { name: 'fine', after: [], body: 'Say it.' },
    ],
    steps: { cut: { taskId: 'r-52-cut' }, list: { taskId: 'r-52-list' }, fine: { taskId: 'r-52-fine' } },
  });
  const [c, l, f] = (await detailOf('r-52')).steps;
  assert.equal(c.closeout, null);
  assert.ok(c.unreadable);
  assert.equal(c.unreadable.raw, cut);
  assert.match(c.unreadable.error, /\S/);
  assert.deepEqual(c.tries.at(-1)?.unreadable, c.unreadable, 'the try carries it too');
  assert.equal(l.closeout, null);
  assert.ok(l.unreadable);
  assert.deepEqual(l.unreadable.raw, ['done']);
  assert.equal(f.unreadable, null);
  assert.equal(f.closeout?.summary, 'Fine.');
});

test("a step says what it runs with: the workflow's effort, context window and tools, and what the engine filed its try with where the workflow says nothing", async () => {
  // Filed as the tick files a step — with its effort, window and tools — and, as a step that sets neither, with no deadline.
  await engine().file({
    id: 'r-51-implement',
    brief: 'Implement it.',
    cwd: '/code/app',
    harness: 'claude',
    config: { effort: 'high', contextTokens: 200_000, tools: ['Read', 'Grep'] },
  });
  writeRun({
    ...r2,
    id: 'r-51',
    workflowDir: gone,
    workflow: [
      { name: 'implement', after: [], body: 'Implement it.', harness: 'claude', effort: 'high', context: 200_000, tools: ['Read', 'Grep'] },
      { name: 'review', after: ['implement'], body: 'Review it.' },
    ],
    steps: { implement: { taskId: 'r-51-implement' }, review: { taskId: null } },
  });

  const [implement, review] = (await detailOf('r-51')).steps;
  assert.deepEqual(implement.spec, {
    harness: 'claude',
    model: null,
    effort: 'high',
    context: 200_000,
    after: [],
    workspace: null,
    resume: null,
    permissionMode: null,
    sandbox: null,
    tools: ['Read', 'Grep'],
    deadlineSeconds: null,
    loop: null,
    rounds: null,
  });
  // The engine's defaults, off its journal: one attempt, no deadline — which is no limit — and no model, which is the harness's; and the
  // mode Claude Code runs a task filed with none in, `auto`, which is not Claude Code's own.
  assert.deepEqual(implement.filed, {
    model: null,
    askedModel: null,
    effort: 'high',
    contextTokens: 200_000,
    permissionMode: null,
    runsIn: { mode: 'auto', by: 'default' },
    remote: null,
    tools: ['Read', 'Grep'],
    deadlineSeconds: null,
  });
  // Not filed: nothing the engine could say.
  assert.equal(review.filed, null);
  // Nor for a task the engine has no record of.
  assert.equal((await detailOf('r-4')).steps[0].filed, null);
});

test('a step says the mode its session runs in, as its harness decides it — a Codex sandbox narrowed by its tools — at shipped defaults', async () => {
  const e = engine();
  const cases: Array<[id: string, spec: { harness: string; permissionMode?: string; tools?: string[] }, runsIn: object]> = [
    ['r-54-claude', { harness: 'claude' }, { mode: 'auto', by: 'default' }],
    ['r-54-claude-mode', { harness: 'claude', permissionMode: 'dontAsk' }, { mode: 'dontAsk', by: 'filed' }],
    ['r-54-detached', { harness: 'claude-detached' }, { mode: 'auto', by: 'default' }],
    ['r-54-codex', { harness: 'codex' }, { mode: 'workspace-write', by: 'default' }],
    ['r-54-codex-writes', { harness: 'codex', tools: ['Read', 'Bash'] }, { mode: 'workspace-write', by: 'default' }],
    // A reviewer that may not write: read-only, whatever mode it named.
    ['r-54-codex-reads', { harness: 'codex', tools: ['Read', 'Grep'] }, { mode: 'read-only', by: 'tools' }],
    ['r-54-codex-named', { harness: 'codex', permissionMode: 'workspace-write', tools: ['Read'] }, { mode: 'read-only', by: 'tools' }],
    ['r-54-codex-bypass', { harness: 'codex', permissionMode: 'bypassPermissions' }, { mode: 'danger-full-access', by: 'filed' }],
  ];
  for (const [id, spec, runsIn] of cases) {
    // The step's keys are the workflow's; the engine is filed with the harness's arguments under `config`, as the tick files them.
    const { harness, ...config } = spec;
    await e.file({ id: `${id}-implement`, brief: 'Implement it.', cwd: '/code/app', harness, config });
    writeRun({
      ...r2,
      id,
      workflowDir: gone,
      workflow: [{ name: 'implement', after: [], body: 'Implement it.', ...spec }],
      steps: { implement: { taskId: `${id}-implement` } },
    });
    const [implement] = (await detailOf(id)).steps;
    assert.deepEqual(implement.filed?.runsIn, runsIn, id);
  }
});

test("the mode the api says a Claude Code task runs in is the one the engine's `claude` spawns it with, as a job and as a background session", async (t) => {
  // Neither spawn is a pure function the engine exports, so the api says its rule after them. This holds the three together: the argv
  // the background runner hands a fake `claude` on PATH, as the engine's own tests record it, and the flags of `claude -p`, which a job
  // and `claude-detached` share (`claudePrintFlags`) and the detached spec's `command` prints.
  // Seeded here, not borrowed from the test before, whose first wrong mode would stop it before it seeds the second.
  const said = new Map<string, string>();
  for (const [id, permissionMode] of [
    ['r-59-claude', undefined],
    ['r-59-claude-mode', 'dontAsk'],
  ] as const) {
    const spec = { harness: 'claude', ...(permissionMode ? { permissionMode } : {}) };
    await engine().file({
      id: `${id}-implement`,
      brief: 'Implement it.',
      cwd: '/code/app',
      harness: 'claude',
      ...(permissionMode ? { config: { permissionMode } } : {}),
    });
    writeRun({
      ...r2,
      id,
      workflowDir: gone,
      workflow: [{ name: 'implement', after: [], body: 'Implement it.', ...spec }],
      steps: { implement: { taskId: `${id}-implement` } },
    });
    const res = await app.request(`/api/runs/${id}`);
    assert.equal(res.status, 200, id);
    const { filed } = ((await res.json()) as RunDetail).steps[0];
    assert.ok(filed?.runsIn, id);
    said.set(id, filed.runsIn.mode);
  }

  // The engine's Effect surface, where its runners are: the Promise one has none.
  const { claudeOps } = await import('agent-runtime/effect');
  const { Effect } = await import('effect');
  const bin = scratch('hkb-api-claude-');
  const argsFile = path.join(bin, 'args');
  fs.writeFileSync(path.join(bin, 'claude'), `#!/bin/sh\nprintf '%s\\n' "$@" > '${argsFile}'\n`, { mode: 0o755 });
  const before = process.env.PATH;
  process.env.PATH = `${bin}${path.delimiter}${before}`;
  t.after(() => {
    process.env.PATH = before;
  });
  const spawnedWith = async (permissionMode: string | undefined) => {
    await Effect.runPromise(
      claudeOps().spawn({ name: 'ae/t/1', brief: 'the prompt', cwd: bin, ...(permissionMode ? { config: { permissionMode } } : {}) }),
    );
    const args = fs.readFileSync(argsFile, 'utf8').replace(/\n$/, '').split('\n');
    return args[args.indexOf('--permission-mode') + 1];
  };
  assert.equal(said.get('r-59-claude'), await spawnedWith(undefined), 'filed with no mode');
  assert.equal(said.get('r-59-claude-mode'), await spawnedWith('dontAsk'), 'filed with one');

  const { claudeDetached } = await import('agent-runtime/effect');
  const jobWith = (permissionMode: string | undefined) => {
    const { args } = claudeDetached.command({
      name: 'ae/t/1',
      brief: 'the prompt',
      cwd: bin,
      ...(permissionMode ? { config: { permissionMode } } : {}),
    });
    return args[args.indexOf('--permission-mode') + 1];
  };
  assert.equal(said.get('r-59-claude'), jobWith(undefined), 'a job filed with no mode');
  assert.equal(said.get('r-59-claude-mode'), jobWith('dontAsk'), 'a job filed with one');
});

test("a model a person's `wf retry --model` asked for is on the try it was asked for, past a recheck — and on no other", async () => {
  await engine().file({
    id: 'r-55-implement-try2',
    brief: 'Implement it.',
    cwd: '/code/app',
    harness: 'claude',
    config: { model: 'sonnet' },
  });
  const asked = { taskId: 'r-55-implement', then: 'fresh', model: 'sonnet' };
  const cases: Array<[id: string, tries: object[], askedModel: string | null]> = [
    ['r-55', [asked], 'sonnet'],
    // Its check run again: the same task, still the try sonnet was asked for.
    ['r-56', [asked, { taskId: 'r-55-implement-try2', then: 'recheck' }], 'sonnet'],
    ['r-57', [{ taskId: 'r-55-implement', then: 'nudge' }], null],
    ['r-58', [{ taskId: 'r-55-implement', then: 'retries' }], null],
  ];
  for (const [id, tries, askedModel] of cases) {
    writeRun({
      ...r2,
      id,
      workflowDir: gone,
      workflow: [{ name: 'implement', after: [], body: 'Implement it.', harness: 'claude' }],
      steps: { implement: { taskId: 'r-55-implement-try2', tries } },
    });
    const { filed } = (await detailOf(id)).steps[0];
    assert.ok(filed, id);
    assert.deepEqual([filed.model, filed.askedModel], ['sonnet', askedModel], id);
  }
});

/** A PNG of one pixel. */
const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==', 'base64');

/** An SVG that carries a script: an agent's markup, which would run on the board's origin opened as a page of its own. */
const SVG =
  '<svg xmlns="http://www.w3.org/2000/svg" width="10" height="10"><script>parent.pwned = true</script><rect width="10" height="10"/></svg>\n';

/** r-52's `shoot`, which named its files: some in its files directory, and some not, or not by a name the api serves. */
function seedFiles() {
  const dir = path.join(root, 'runs', 'r-52', 'artifacts', 'shoot');
  const files: Record<string, string | Buffer> = {
    'shot.png': PNG,
    'notes.txt': 'It rendered.\n',
    'trace.zip': 'PK',
    'sub/deep.png': PNG,
    // Markup that would run on the board's origin opened as a page: served sandboxed, and the HTML as text. The page is not named.
    'diagram.svg': SVG,
    'page.html': '<script>parent.pwned = true</script>\n',
    // Each a file the directory has, which a refusal alone keeps from being served.
    '..shot.png': PNG,
    'a\\b.png': PNG,
    // Beside the directory, where `..` leads.
    '../outside.png': PNG,
  };
  for (const [name, body] of Object.entries(files)) {
    fs.mkdirSync(path.dirname(path.join(dir, name)), { recursive: true });
    fs.writeFileSync(path.join(dir, name), body);
  }
  // Seeded by each test that reads it: the link is made afresh.
  fs.rmSync(path.join(dir, 'link.png'), { force: true });
  fs.symlinkSync(path.join(dir, '..', 'outside.png'), path.join(dir, 'link.png'));
  const named = [
    'shot.png',
    'notes.txt',
    'trace.zip',
    'diagram.svg',
    '../outside.png',
    'sub/deep.png',
    'link.png',
    '..shot.png',
    'gone.png',
  ].map((name) => path.join(dir, name));
  // `path.join` resolves `..`: named as a step would spell it.
  named[4] = `${dir}/../outside.png`;
  settledTask('t-52-shoot', { ...done, artifacts: [...named, 'RESPONSE.md', '/etc/hosts'] });
  writeRun({
    ...r2,
    id: 'r-52',
    workflowDir: gone,
    workflow: [{ name: 'shoot', after: [], body: 'Shoot it.' }],
    steps: { shoot: { taskId: 't-52-shoot' } },
  });
  return { dir, named };
}

test("a closeout's files in the step's files directory carry where the api serves them, their kind and size — any other path is the path alone", async () => {
  const { dir, named } = seedFiles();
  const [shoot] = (await detailOf('r-52')).steps;
  assert.ok(shoot.closeout);
  const served = (name: string, kind: string, size: number) => ({
    path: path.join(dir, name),
    name,
    url: `/api/runs/r-52/steps/shoot/artifacts/${encodeURIComponent(name)}`,
    kind,
    size,
  });
  assert.deepEqual(shoot.closeout.artifacts, [
    served('shot.png', 'image', PNG.length),
    served('notes.txt', 'text', 13),
    served('trace.zip', 'other', 2),
    served('diagram.svg', 'image', Buffer.byteLength(SVG)),
    // Outside the directory, however it is spelled; under it, which no name reaches; a link out of it; a name the route refuses; a file it does not have.
    { path: named[4] },
    { path: named[5] },
    { path: named[6] },
    { path: named[7] },
    { path: named[8] },
    // A path on the branch, and an absolute path anywhere else, which is not looked at.
    { path: 'RESPONSE.md' },
    { path: '/etc/hosts' },
  ]);
  assert.deepEqual(shoot.tries[0].closeout?.artifacts, shoot.closeout.artifacts);
});

test("a step's file is served by name, with its type and no caching — and a name that is a path, or not in the directory, is refused", async () => {
  seedFiles();
  const base = '/api/runs/r-52/steps/shoot/artifacts';

  const image = await app.request(`${base}/shot.png`);
  assert.equal(image.status, 200);
  assert.equal(image.headers.get('content-type'), 'image/png');
  assert.equal(image.headers.get('cache-control'), 'no-store');
  assert.equal(image.headers.get('x-content-type-options'), 'nosniff');
  assert.deepEqual(Buffer.from(await image.arrayBuffer()), PNG);

  const text = await app.request(`${base}/notes.txt`);
  assert.deepEqual(
    [text.status, text.headers.get('content-type'), text.headers.get('cache-control'), await text.text()],
    [200, 'text/plain; charset=utf-8', 'no-store', 'It rendered.\n'],
  );
  assert.equal((await app.request(`${base}/trace.zip`)).headers.get('content-type'), 'application/octet-stream');

  // Markup an agent wrote runs no script on the board's origin, opened in a tab: an SVG is served as an image under a policy that
  // sandboxes it, and HTML as text. So is every file served.
  const svg = await app.request(`${base}/diagram.svg`);
  assert.deepEqual([svg.status, svg.headers.get('content-type'), await svg.text()], [200, 'image/svg+xml', SVG]);
  assert.equal((await app.request(`${base}/page.html`)).headers.get('content-type'), 'text/plain; charset=utf-8');
  for (const name of ['diagram.svg', 'page.html', 'shot.png', 'notes.txt', 'trace.zip']) {
    const policy = (await app.request(`${base}/${name}`)).headers.get('content-security-policy') ?? '';
    assert.ok(policy.split(/\s*;\s*/).includes('sandbox'), `${name} is served sandboxed: ${policy || 'no policy'}`);
    assert.match(policy, /\bdefault-src 'none'/, `${name}: ${policy}`);
  }

  // Every one of these names a file on disk: only the refusal stands between it and the response.
  for (const name of ['..%2Foutside.png', 'sub%2Fdeep.png', 'a%5Cb.png', '..shot.png']) {
    const res = await app.request(`${base}/${name}`);
    assert.equal(res.status, 400, name);
    const { error } = (await res.json()) as { error: string };
    assert.ok(/is not the name of a file: a name has no `\/`, `\\`, or `\.\.`/.test(error), `${name}: ${error}`);
  }
  // Not a regular file in the directory: absent, a directory, and a link that leads out of it.
  for (const name of ['gone.png', 'sub', 'link.png']) {
    const res = await app.request(`${base}/${name}`);
    assert.equal(res.status, 404, name);
    assert.match(((await res.json()) as { error: string }).error, /has no file .* in its files directory/, name);
  }
  // No such run, and no such step.
  const noRun = (await (await app.request('/api/runs/no-such-run/steps/shoot/artifacts/shot.png')).json()) as { error: string };
  assert.match(noRun.error, /No run 'no-such-run'/);
  assert.equal((await app.request('/api/runs/r-52/steps/deploy/artifacts/shot.png')).status, 404);
});

test("once `wf prune --artifacts` removed a run's files, each file a closeout named there reads pruned, the route answers 410 saying so — not a 404 that reads as missing — and the run's page and its decision read as before", async () => {
  const { dir, named } = seedFiles();
  const marker = path.join(root, 'runs', 'r-52.pruned');
  const files = { at: '2026-09-28T09:00:00.000Z', bytes: 3 * 1024 * 1024 };
  fs.writeFileSync(marker, JSON.stringify({ at: files.at, worktrees: [], artifacts: files }));
  fs.rmSync(path.join(root, 'runs', 'r-52', 'artifacts'), { recursive: true });
  try {
    const res = await app.request('/api/runs/r-52');
    assert.equal(res.status, 200);
    const page = (await res.json()) as RunDetail;
    assert.deepEqual(page.pruned, { at: files.at, worktrees: [], artifacts: files });
    const said = `its files were removed at ${files.at} (wf prune --artifacts)`;
    const [shoot] = page.steps;
    assert.ok(shoot.closeout);
    assert.deepEqual(shoot.closeout.artifacts, [
      // Every file named in the directory went with it, one beneath it and one the route would refuse by name included.
      ...[0, 1, 2, 3].map((i) => ({ path: named[i], pruned: said, prunedAt: files.at })),
      // Beside the directory is not in it: the path alone, as before.
      { path: named[4] },
      ...[5, 6, 7, 8].map((i) => ({ path: named[i], pruned: said, prunedAt: files.at })),
      { path: 'RESPONSE.md' },
      { path: '/etc/hosts' },
    ]);
    assert.deepEqual(shoot.tries[0].closeout?.artifacts, shoot.closeout.artifacts);

    const base = '/api/runs/r-52/steps/shoot/artifacts';
    for (const name of ['shot.png', 'gone.png']) {
      const gone = await app.request(`${base}/${name}`);
      assert.equal(gone.status, 410, name);
      const body = (await gone.json()) as { error: string; pruned: string };
      assert.equal(
        body.error,
        `Step 'shoot' of run 'r-52' has no file '${name}': ${said}. Its record, its closeouts and its branches are kept; \`wf decide r-52\` reads them.`,
      );
      assert.equal(body.pruned, files.at);
    }
    // A name that is a path is refused as before; the prune answers only for a name the route would serve.
    assert.equal((await app.request(`${base}/sub%2Fdeep.png`)).status, 400);

    const decision = await app.request('/api/runs/r-52/decision');
    assert.equal(decision.status, 200, await decision.clone().text());
  } finally {
    fs.rmSync(marker, { force: true });
  }
  // Its files back, unpruned: a file the directory lacks is missing again, a 404, and says so.
  seedFiles();
  const missing = await app.request('/api/runs/r-52/steps/shoot/artifacts/gone.png');
  assert.equal(missing.status, 404);
  assert.match(((await missing.json()) as { error: string }).error, /has no file 'gone\.png' in its files directory/);
  assert.ok(fs.existsSync(path.join(dir, 'shot.png')));
});

// ─── where the time went ────────────────────────────────────────────────────

test("the detail carries where each step's time went — per try and per check, filed off the engine's feed — and the run's, in the package's words", async (t) => {
  const { readFilings, timeline } = await import('agent-orchestrator');
  const T = (m: number, s = 0) => new Date(Date.UTC(2026, 8, 13, 9, m, s)).toISOString();
  /** A task as the engine journals one: filed, a slot taken and spawned, and — given an end — ended and settled. */
  const ran = (
    taskId: string,
    harness: string,
    filedAt: string,
    spawnedAt: string,
    ended?: { at: string; outcome: 'succeeded' | 'failed'; more?: object },
  ) =>
    journal(taskId, [
      { kind: 'filed', at: filedAt, brief: filedBrief(taskId), cwd: '/code/app', maxAttempts: 1, harness },
      { kind: 'starting', at: spawnedAt, attempt: 1 },
      { kind: 'spawned', at: spawnedAt, attempt: 1 },
      ...(ended
        ? [
            {
              kind: 'ended',
              at: ended.at,
              attempt: 1,
              sessionId: `ae/${taskId}/1`,
              observed: ended.outcome === 'succeeded' ? 'done' : 'failed',
              reason: 'harness',
              ...ended.more,
            },
            { kind: 'settled', at: ended.at, outcome: ended.outcome },
          ]
        : []),
    ]);
  const feed = path.join(root, 'engine', 'feed.jsonl');
  const fileOnFeed = (taskId: string, at: string) =>
    fs.appendFileSync(feed, `${JSON.stringify({ taskId, event: { kind: 'filed', at } })}\n`);

  // implement's check refused try 1, and try 2's check is still running. The feed has each filing; a task's view has none.
  ran('r-60-implement', 'codex', T(0), T(0, 12), {
    at: T(19, 54),
    outcome: 'succeeded',
    more: { closeout: done, usage: { turns: 54, toolCalls: 146 } },
  });
  ran('r-60-implement-check', 'check', T(19, 56), T(19, 57), { at: T(20, 55), outcome: 'failed', more: { exitCode: 1 } });
  ran('r-60-implement-try2', 'codex', T(21), T(21, 3), { at: T(26, 38), outcome: 'succeeded', more: { closeout: done } });
  ran('r-60-implement-try2-check', 'check', T(26, 40), T(26, 41));
  for (const [taskId, at] of [
    ['r-60-implement', T(0)],
    ['r-60-implement-check', T(19, 56)],
    ['r-60-implement-try2', T(21)],
    ['r-60-implement-try2-check', T(26, 40)],
  ] as const)
    fileOnFeed(taskId, at);
  const record = {
    ...r2,
    id: 'r-60',
    workflowDir: gone,
    workflow: [
      { name: 'implement', after: [], body: 'Implement it.', check: 'npm test', retries: 1 },
      { name: 'review', after: ['implement'], body: 'Review it.' },
    ],
    steps: {
      implement: {
        taskId: 'r-60-implement-try2',
        check: { taskId: 'r-60-implement-try2-check' },
        tries: [{ taskId: 'r-60-implement', check: { taskId: 'r-60-implement-check' }, then: 'retries' }],
      },
      review: { taskId: null },
    },
  };
  writeRun(record);

  const observations = countingObservations(t);
  const run = await detailOf('r-60');
  assert.equal(observations(), 0, 'the feed is a read of the store: the detail observes no harness for it, and none for tasks all settled');
  const [implement, review] = run.steps;
  const words = (
    s: { at: string; filedAt: string | null; spawnedAt: string | null; endedAt: string | null; queued: string; ran: string } | null,
  ) => s && { at: s.at, filedAt: s.filedAt, spawnedAt: s.spawnedAt, endedAt: s.endedAt, queued: s.queued, ran: s.ran };
  assert.deepEqual(
    implement.timeline.map((x: { try: number; round: number; sessionOf: number | null }) => [x.try, x.round, x.sessionOf]),
    [
      [1, 1, null],
      [2, 1, null],
    ],
  );
  assert.deepEqual(words(implement.timeline[0].session), {
    at: 'ended',
    filedAt: T(0),
    spawnedAt: T(0, 12),
    endedAt: T(19, 54),
    queued: '12s',
    ran: '19m42s',
  });
  assert.deepEqual(words(implement.timeline[0].check), {
    at: 'ended',
    filedAt: T(19, 56),
    spawnedAt: T(19, 57),
    endedAt: T(20, 55),
    queued: '1s',
    ran: '58s',
  });
  assert.deepEqual(words(implement.timeline[1].check), {
    at: 'running',
    filedAt: T(26, 40),
    spawnedAt: T(26, 41),
    endedAt: null,
    queued: '1s',
    ran: 'still running, no end yet',
  });
  // What each session used, in `wf decide`'s words, as the step's `used` is.
  assert.deepEqual(implement.timeline[0].used, {
    usage: { turns: 54, toolCalls: 146 },
    used: '54 turns · 146 tool calls · tokens in not measured · tokens out not measured',
    cost: 'not measured',
    costUsd: null,
    apiMs: null,
    toolMs: null,
    read: null,
    peak: null,
    rebuilt: 0,
  });
  assert.deepEqual(review.timeline, [], 'a step not filed has no try on the clock');
  assert.deepEqual(
    [run.timeline.run.tasks, run.timeline.run.inFlight, run.timeline.run.queued, run.timeline.run.ran, run.timeline.run.wall],
    [4, 1, '17s', '26m15s, 1 still running', 'still going'],
  );

  // Held to the package: its `timeline` over the engine's own views and the feed's filings, word for word.
  const e = engine();
  const views = new Map((await e.list()).map((view) => [view.id, view]));
  const { filed } = await readFilings(e);
  const theirs = timeline(readRun('r-60'), views, filed);
  // The totals carry what their sessions cost beside it, which the package's `timeline` does not: nobody priced these.
  const lessCost = ({ cost, ...total }: { cost: unknown }) => (assert.equal(cost, null), total);
  assert.deepEqual(
    { rounds: run.timeline.rounds.map(lessCost), run: lessCost(run.timeline.run) },
    JSON.parse(JSON.stringify({ rounds: theirs.rounds, run: theirs.run })),
  );
  // Each try as the package has it, less `used`, which the api words as `wf decide` does (asserted above).
  const lessUsed = (tries: ReadonlyArray<{ used?: unknown }>) => JSON.parse(JSON.stringify(tries.map(({ used: _, ...x }) => x)));
  assert.deepEqual(lessUsed(implement.timeline), lessUsed(theirs.steps.implement!));

  // A try filed since is read on from where the last read of the feed stopped: its filing is known on the next poll, and not `not known`.
  ran('r-60-implement-try3', 'codex', T(40), T(40, 7));
  fileOnFeed('r-60-implement-try3', T(40));
  writeRun({
    ...record,
    steps: {
      ...record.steps,
      implement: {
        taskId: 'r-60-implement-try3',
        tries: [
          ...record.steps.implement.tries,
          { taskId: 'r-60-implement-try2', check: { taskId: 'r-60-implement-try2-check' }, then: 'nudge' },
        ],
      },
    },
  });
  const again = await detailOf('r-60');
  assert.deepEqual(words(again.steps[0].timeline[2].session), {
    at: 'running',
    filedAt: T(40),
    spawnedAt: T(40, 7),
    endedAt: null,
    queued: '7s',
    ran: 'still running, no end yet',
  });
});

test("a step whose attempts were denied calls says which, on the list and on the run's page, beside a status that is unchanged", async () => {
  // Two attempts of one filing: the first denied `look` and `pytest`, the second `look` again and a path with a newline in it.
  journal('t-denied', [
    { ...filed('t-denied'), maxAttempts: 2 },
    { kind: 'starting', at, attempt: 1 },
    { kind: 'spawned', at, attempt: 1 },
    {
      kind: 'ended',
      at,
      attempt: 1,
      sessionId: 'ae/t-denied/1',
      observed: 'failed',
      reason: 'lost',
      denials: [
        { tool: 'Skill', what: 'look' },
        { tool: 'Bash', what: 'pytest' },
      ],
    },
    { kind: 'starting', at, attempt: 2 },
    { kind: 'spawned', at, attempt: 2 },
    {
      kind: 'ended',
      at,
      attempt: 2,
      sessionId: 'ae/t-denied/2',
      observed: 'done',
      reason: 'harness',
      closeout: { outcome: 'done', summary: 'did it', artifacts: [], needs: null },
      denials: [
        { tool: 'Skill', what: 'look' },
        { tool: 'Edit', what: '/tmp/a\nb' },
      ],
    },
    { kind: 'settled', at, outcome: 'succeeded' },
  ]);
  settledTask('t-clean', { outcome: 'done', summary: 'did it', artifacts: [], needs: null });
  writeRun({
    ...r2,
    id: 'r-denied',
    steps: { implement: { taskId: 't-denied', branch: 'wf/r-denied/implement' }, review: { taskId: 't-clean' } },
  });
  const denied = { words: 'denied: Skill(look), Bash(pytest), Edit(/tmp/a b)', calls: ['Skill(look)', 'Bash(pytest)', 'Edit(/tmp/a\nb)'] };

  const [implement, review] = (await listed('r-denied')).steps;
  assert.deepEqual(
    [implement.status, implement.denied],
    ['unverified · done', denied],
    'each call once, and the status the chip reads as it was',
  );
  assert.equal(implement.note, null, 'nor in the note: the board says it once, from its own field');
  assert.equal(review.denied, null, 'a step denied nothing: null, not an empty list');
  const page = (await detailOf('r-denied')).steps;
  assert.deepEqual([page[0].status, page[0].denied, page[1].denied], ['unverified · done', denied, null]);
});
