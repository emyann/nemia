import { root } from './harness.ts';
import { test } from 'node:test';
import { story } from './checkpoints.ts';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { scratch } from './scratch.ts';
import { until } from './waits.ts';
import type { RunDetail } from '../src/detail/detail.ts';
import { app } from '../src/app.ts';
import {
  atWork,
  COMMANDS,
  commandLine,
  engine,
  list,
  filingsRead,
  runTokens,
  timeline,
  runStore,
  VERSION,
  type RunSummary,
} from 'agent-orchestrator';
import { runWith } from './shipped-place.ts';
import { Engine } from 'agent-runtime';
import { Context, Effect, Exit, Layer, Scope } from 'effect';
import { DEFAULT_ROUNDS } from 'agent-orchestrator/workflow';
import { PRECEDENCE } from 'agent-orchestrator/run';
/** A folder nothing is made in: a path under it names a workflow folder that is not there. */
const NOWHERE = scratch('nemia-api-nowhere-');

const writeRun = (run: { id: string } & Record<string, unknown>) => {
  fs.mkdirSync(path.join(root, 'runs'), { recursive: true });
  fs.writeFileSync(path.join(root, 'runs', `${run.id}.json`), JSON.stringify(run));
};

const at = '2026-09-12T00:10:00.000Z';
const filedBrief = (taskId: string) => `The brief ${taskId} was filed with.`;

/** A task's journal, as the engine writes it, and written again whole by a rename over it: the engine reads one only past what it kept. */
const journal = (taskId: string, events: object[]) => {
  const file = path.join(root, 'engine', 'tasks', `${taskId}.jsonl`);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(`${file}.new`, events.map((e) => JSON.stringify(e) + '\n').join(''));
  fs.renameSync(`${file}.new`, file);
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
/**
 * The streams the runtime keeps of attempt 1 of a check, each whole in its own file beside its run's (`streams`): a stream given as
 * `{ unreadable: true }` is a folder, which no read of the file gets through.
 */
const checkStreams = (taskId: string, streams: Partial<Record<'stdout' | 'stderr', string | { unreadable: true }>>) => {
  const dir = path.join(root, 'engine', 'runs', 'check');
  const base = path.join(dir, `ae/${taskId}/1`.replace(/[^a-zA-Z0-9]+/g, '_'));
  fs.mkdirSync(dir, { recursive: true });
  for (const [stream, text] of Object.entries(streams))
    if (typeof text === 'string') fs.writeFileSync(`${base}.${stream}`, text);
    else fs.mkdirSync(`${base}.${stream}`);
};
const codexSession = (taskId: string, attempt: number, output: string | { unreadable: true }) =>
  detachedSession('codex', taskId, attempt, output);

const workflowFolder = (files: Record<string, string>) => {
  const dir = scratch('nemia-api-workflow-');
  for (const [name, text] of Object.entries(files)) fs.writeFileSync(path.join(dir, name), text);
  return dir;
};

/** Two steps, the second reviewing the first. */
const workflowDir = workflowFolder({
  'implement.md': '---\nplace: git\nharness: codex\nmodel: gpt-5\ndeadlineSeconds: 600\n---\nImplement the thing.\n',
  'review.md': '---\nafter: implement\nplace: git\n---\nReview what implement did.\n',
});

const blocked = { outcome: 'blocked', summary: 'Half of it is done.', needs: 'Which database?', artifacts: ['NOTES.md'] };

/**
 * `blocked` as the api gives it: a path on the branch is the path alone, and it declared no output and gave no replies. `raw` is the
 * statement as the engine recorded it.
 */
const blockedCloseout = {
  apiVersion: null,
  outcome: 'blocked',
  summary: 'Half of it is done.',
  body: null,
  needs: 'Which database?',
  artifacts: [{ path: 'NOTES.md' }],
  values: [],
  refused: [],
  output: {},
  missing: [],
  replies: null,
  schema: {},
  questions: [],
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
  bridge: null,
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

/** That run `id`'s page and its decision are refused as the list leaves it unjudged, in the list's words. */
const saysAsListed = async (id: string) => {
  const { unreadable } = await listed(id);
  assert.ok(unreadable, `${id} is unjudged on the list`);
  for (const route of [`/api/runs/${id}`, `/api/runs/${id}/decision`]) {
    const res = await app.request(route);
    assert.deepEqual([res.status, ((await res.json()) as { error?: string }).error], [502, unreadable], `${route} says what the list says`);
  }
};

test("the api's own answers: its health and its version", async (t) => {
  await t.test('health answers', async () => {
    const res = await app.request('/api/health');
    assert.equal(res.status, 200);
    assert.deepEqual(await res.json(), { ok: true });
  });
  await t.test(
    "the version answers: the orchestrator's package version, a non-empty string, and the code the api runs, this checkout",
    async () => {
      const res = await app.request('/api/version');
      assert.equal(res.status, 200);
      const body = (await res.json()) as { version: string; release: unknown };
      assert.deepEqual(body, {
        version: VERSION,
        release: { kind: 'checkout', root: path.resolve(import.meta.dirname, '..', '..', '..') },
      });
      assert.ok(body.version.length > 0, 'the version is a word, not empty');
    },
  );
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

/**
 * The run's time over that one task, in a workflow with no loop: no round is totalled, and the run is, with a queue and a wall nobody can
 * know.
 */
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

test("a store's runs read on the list and on a run's page: each summarized with what its steps do, one in full, a blocked step waiting on you, a task the engine has no record of", async (t) => {
  const s = story(t);
  await s.test('an empty store lists no runs', async () => {
    const res = await app.request('/api/runs');
    assert.deepEqual(await res.json(), []);
  });
  await s.test('runs are read from the workflow store and summarized, with what each step is doing', async () => {
    writeRun({
      id: 'r-1',
      repo: '/code/app',
      workspace: '/code/app',
      baseRef: 'abc123',
      branch: 'main',
      isolate: true,
      brief: 'Do the thing',
      workflowDir: '/code/app/workflows',
      workflow: [
        { name: 'implement', after: [], body: 'Implement it.' },
        { name: 'review', after: [], body: 'Review it.' },
      ],
      createdAt: '2026-09-12T00:00:00.000Z',
      steps: { implement: { taskId: 't-1', branch: 'wf/r-1/implement' }, review: { taskId: null } },
    });
    fs.writeFileSync(path.join(root, 'runs', 'r-1.cancelled'), '2026-09-12T01:00:00.000Z');

    const res = await app.request('/api/runs');
    assert.deepEqual(await res.json(), [
      {
        id: 'r-1',
        repo: '/code/app',
        factory: null,
        place: 'repository',
        work: null,
        brief: 'Do the thing',
        workflowDir: '/code/app/workflows',
        try: null,
        createdAt: '2026-09-12T00:00:00.000Z',
        /** Started, and none of its filings on the feed (there is none here): when it was created. */
        startedAt: '2026-09-12T00:00:00.000Z',
        cancelledAt: '2026-09-12T01:00:00.000Z',
        /** Nobody pruned it: no mark beside its status. */
        pruned: null,
        /** Started without `--after`: it waits on no run. */
        after: [],
        context: [],
        waiting: null,
        heldUntil: [],
        holding: null,
        status: 'cancelled',
        moving: false,
        /** Nothing of it was measured: no cost, which is not $0. */
        cost: null,
        /** Its one task is on no engine here: nothing of it ran, so nothing at work, and no end. */
        atWork: { ms: 0, since: null, endedAt: null },
        /** No session measured tokens: no figure, which is not 0. */
        tokens: null,
        steps: [
          {
            name: 'implement',
            taskId: 't-1',
            branch: 'wf/r-1/implement',
            /** `t-1` is on the record and not in this engine's store: a fresh `WF_ROOT` has no tasks at all. */
            status: 'unknown',
            note: null,
            roundDue: false,
            agent: null,
            since: null,
            needs: null,
            blockedByHarness: false,
            waitingFor: null,
            approve: null,
            denied: null,
            sessionUnread: null,
          },
          {
            name: 'review',
            taskId: null,
            branch: null,
            status: 'waiting',
            note: null,
            roundDue: false,
            agent: null,
            since: null,
            needs: null,
            blockedByHarness: false,
            waitingFor: null,
            approve: null,
            denied: null,
            sessionUnread: null,
          },
        ],
        /** Neither step it froze waits on the other: every step is a root, as on the run's page. */
        graph: { roots: ['implement', 'review'], edges: [] },
        waitingOnYou: [],
        onYou: [],
        /** Called off: nothing to decide about a result nobody is waiting for. */
        toDecide: null,
        /** Every task of it reads, or has no journal at all: judged. */
        unreadable: null,
        /** Another repository's folder, in no factory: the board pages it on no address. */
        workflowPage: null,
      },
    ]);
  });
  await s.test("a run in full: the brief, each step's spec and prose, what it was told, and how it went", async () => {
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
        decide: 'nemia decide r-2',
        repo: '/code/app',
        place: 'repository',
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
        context: [],
        waiting: null,
        heldUntil: [],
        holding: null,
        /** implement signed off blocked, so review is not filed: the run waits on an answer, and nothing in it failed. */
        status: 'blocked',
        moving: false,
        cost: null,
        /** implement spawned and ended at the same instant, and nothing else ran: at work for no time, and over. */
        atWork: { ms: 0, since: null, endedAt: at },
        tokens: null,
        read: null,
        waitingOnYou: ['implement'],
        onYou: ['implement'],
        /** Failed at implement: not a run at its result, so there is nothing about the result to decide. */
        toDecide: null,
        /** Gated at no step: no gate to wait at. */
        gates: [],
        warning: null,
        kinds: [],
        refresh: 'nemia refresh r-2',
        graph: { roots: ['implement'], edges: [{ from: 'implement', to: 'review', kind: 'after' }] },
        steps: undefined,
        timeline: oneTaskTotals(),
        /** A folder given by path: the board pages it on no address. */
        workflowPage: null,
      },
    );

    const implementTry = {
      taskId: 't-2',
      status: 'succeeded · BLOCKED',
      check: null,
      closeout: blockedCloseout,
      unreadable: null,
      attempts: { count: 1, latest: { startedAt: at, ended: 'succeeded', endedAt: at, reason: 'harness' } },
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
        place: 'git',
        resume: null,
        permissionMode: null,
        sandbox: null,
        tools: null,
        deadlineSeconds: 600,
        loop: null,
        rounds: null,
      },
      /** The engine's record, not the folder's words: this journal was written with none of them. */
      filed: filedBare,
      body: 'Implement the thing.',
      /** What the engine was filed with, not the brief recomposed from today's folder and record. */
      told: filedBrief('t-2'),
      layers: null,
      taskParts: [{ kind: 'text', text: filedBrief('t-2') }],
      workspace: '/code/app/.wt/r-2/implement',
      branch: 'wf/r-2/implement',
      /** A repository run's step works on a branch: it lists no files, whatever its worktree holds. */
      files: [],
      filesError: null,
      note: null,
      roundDue: false,
      commands: { approve: 'nemia approve r-2 implement', retry: 'nemia retry r-2 implement', say: 'nemia say r-2 implement' },
      /** Its question, off its closeout; no session the harness blocked, so no last line; nothing asked of it yet. */
      needs: 'Which database?',
      blockedByHarness: false,
      waitingFor: null,
      approve: null,
      denied: null,
      sessionUnread: null,
      gate: null,
      accepted: null,
      lastLine: null,
      said: [],
      asked: null,
      ...implementTry,
      /** Its journal carries no usage: nobody measured it, which is not 0. */
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
    assert.ok(
      review.taskParts?.length && review.taskParts.every((part) => part.kind === 'text'),
      'composed: its task by part, none handed',
    );
    assert.deepEqual(
      { ...review, told: undefined, taskParts: undefined },
      {
        name: 'review',
        spec: {
          harness: null,
          model: null,
          effort: null,
          context: null,
          after: ['implement'],
          workspace: null,
          place: 'git',
          resume: null,
          permissionMode: null,
          sandbox: null,
          tools: null,
          deadlineSeconds: null,
          loop: null,
          rounds: null,
        },
        /** Not filed: the engine has filed it with nothing yet. */
        filed: null,
        body: 'Review what implement did.',
        told: undefined,
        layers: null,
        taskParts: undefined,
        workspace: null,
        branch: null,
        files: [],
        filesError: null,
        note: null,
        roundDue: false,
        commands: { approve: 'nemia approve r-2 review', retry: 'nemia retry r-2 review', say: 'nemia say r-2 review' },
        needs: null,
        blockedByHarness: false,
        waitingFor: null,
        approve: null,
        denied: null,
        sessionUnread: null,
        gate: null,
        accepted: null,
        lastLine: null,
        said: [],
        asked: null,
        ...reviewTry,
        /** Not filed: it consumed nothing, and has no try on the clock. */
        used: null,
        spent: null,
        budget: null,
        raise: null,
        tries: firstTry(reviewTry),
        timeline: [],
      },
    );
    assert.ok(review.told, 'not filed, so told what it would be given now: implement has run in this workspace, so look there');
    assert.ok(
      review.told.startsWith(`${PRECEDENCE}\n\nReview what implement did.\n\n## What was asked for\n\nAdd a cache\n\nKeep it small.`),
      review.told,
    );
    assert.match(review.told, /already been worked in by: implement/);
    assert.match(review.told, /git diff def456/);
  });
  await s.test('a step that signed off blocked is waiting on you in the list too', async () => {
    const run = await listed('r-2');
    assert.deepEqual(
      run.steps.map((s: { status: string }) => s.status),
      ['succeeded · BLOCKED', 'waiting'],
    );
    assert.deepEqual(run.waitingOnYou, ['implement']);
  });
  await s.test('a task the engine has no record of is unknown on both endpoints, not queued', async () => {
    writeRun({ ...r2, id: 'r-4', steps: { implement: { taskId: 't-4-lost', branch: 'wf/r-4/implement' }, review: { taskId: null } } });
    queuedTask('t-5');
    writeRun({ ...r2, id: 'r-5', steps: { implement: { taskId: 't-5', branch: 'wf/r-5/implement' }, review: { taskId: null } } });

    const lost = await detailOf('r-4');
    assert.equal(lost.steps[0].status, 'unknown');
    assert.equal(lost.steps[0].told, null);
    assert.equal((await listed('r-4')).steps[0].status, 'unknown');

    const queued = await detailOf('r-5');
    assert.equal(queued.steps[0].status, 'pending', 'a task filed and waiting for a slot is still pending');
    assert.equal(queued.steps[0].told, filedBrief('t-5'));
    assert.equal((await listed('r-5')).steps[0].status, 'pending');
  });
  await s.test(
    'the api words a step as list does — `unknown` for a task the engine has no record of, `pending` for one queued',
    async () => {
      const e = engine();
      for (const id of ['r-2', 'r-4', 'r-5']) {
        const words = await runWith(e, list(e, runStore.runs.read(id)));
        const run = await listed(id);
        assert.deepEqual(
          run.steps.map(({ name, status, branch }: { name: string; status: string; branch: string | null }) => ({ name, status, branch })),
          words.steps,
          id,
        );
        assert.deepEqual(run.waitingOnYou, words.waitingOnYou, id);
      }
    },
  );
});

/** A loop as `nemia start` freezes it: review loops back to implement, for at most two rounds. */
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
    place: null,
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
    place: null,
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

test('a run whose workflow folder changes or vanishes after it starts is read off what it froze: the steps that ran kept, what moved named, and unjudged where it froze nothing', async (t) => {
  const s = story(t);
  await s.test(
    'a run whose workflow folder is gone, and froze none, is answered unjudged: its list off its record, its page and decision in its words',
    async () => {
      const gone = path.join(NOWHERE, 'no-such-workflow');
      writeRun({ ...r2, id: 'r-3', workflowDir: gone });

      const listing = await listed('r-3');
      assert.deepEqual(
        listing.graph,
        { roots: ['implement', 'review'], edges: [] },
        'a record with no frozen workflow and its folder gone: nothing says what waits on what, so every step is a root',
      );
      await saysAsListed('r-3');

      const unjudged = (listing: RunSummary, why: string) => {
        const said = listing.unreadable ?? '';
        assert.ok(said.startsWith("r-3's workflow folder does not load, so the board does not judge the run"), why);
        assert.ok(said.includes(`does not load: no workflow folder at ${gone}`), said);
        assert.deepEqual([listing.status, listing.moving, listing.waitingOnYou], ['running', true, []], why);
        assert.deepEqual(
          listing.steps.map((s) => [s.name, s.status]),
          [
            ['implement', 'succeeded'],
            ['review', 'pending'],
          ],
          why,
        );
      };
      let [withFolder, withoutFolder] = [await listed('r-2'), await listed('r-3')];
      assert.deepEqual(withFolder.waitingOnYou, ['implement']);
      unjudged(withoutFolder, 'the list says it as the tick leaves it, unjudged and in flight, its steps off its record');

      fs.writeFileSync(path.join(root, 'runs', 'r-2.cancelled'), '2026-09-12T03:00:00.000Z');
      fs.writeFileSync(path.join(root, 'runs', 'r-3.cancelled'), '2026-09-12T03:00:00.000Z');
      [withFolder, withoutFolder] = [await listed('r-2'), await listed('r-3')];
      assert.deepEqual(withFolder.waitingOnYou, [], 'a run somebody called off waits on nobody');
      assert.equal(withFolder.steps[0].status, 'succeeded · BLOCKED', 'a called-off step still says how it signed off');
      unjudged(withoutFolder, 'called off, it is still unjudged: the tick reads its steps to stop it');
    },
  );
  await s.test('a folder changed since the run started keeps the steps that ran, and names what moved', async () => {
    const changed = workflowFolder({
      'original.md': '---\nplace: git\n---\nDo the original thing.\n',
      'review.md': '---\nafter: original\nplace: git\n---\nReview it.\n',
    });
    settledTask('t-6', blocked);
    writeRun({
      ...r2,
      id: 'r-6',
      workflowDir: changed,
      steps: { original: { taskId: 't-6', workspace: '/code/app/.wt/r-6/original', branch: 'wf/r-6/original' }, review: { taskId: null } },
    });
    fs.renameSync(path.join(changed, 'original.md'), path.join(changed, 'replacement.md'));
    fs.writeFileSync(path.join(changed, 'review.md'), '---\nafter: replacement\nplace: git\n---\nReview it.\n');

    const run = await detailOf('r-6');
    assert.ok(run.warning, "a step renamed after the run started: the folder still reads as a workflow, only not this run's");
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
      attempts: { count: 1, latest: { startedAt: at, ended: 'succeeded', endedAt: at, reason: 'harness' } },
    };
    assert.deepEqual(original, {
      name: 'original',
      spec: null,
      filed: filedBare,
      body: null,
      told: filedBrief('t-6'),
      layers: null,
      taskParts: [{ kind: 'text', text: filedBrief('t-6') }],
      workspace: '/code/app/.wt/r-6/original',
      branch: 'wf/r-6/original',
      files: [],
      filesError: null,
      note: null,
      roundDue: false,
      commands: { approve: 'nemia approve r-6 original', retry: 'nemia retry r-6 original', say: 'nemia say r-6 original' },
      needs: 'Which database?',
      blockedByHarness: false,
      waitingFor: null,
      approve: null,
      denied: null,
      sessionUnread: null,
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
  await s.test(
    'a run that froze its workflow draws from it when its folder does not read: spec, prose, what a step would be told, and the graph',
    async () => {
      const newer = workflowFolder({
        'implement.md': '---\nplace: git\nharness: claude\nsomeNewerKey: yes\n---\nImplement it.\n',
        'review.md': '---\nafter: implement\nplace: git\nloop: implement\n---\nReview it.\n',
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
      assert.match(run.warning, /the workflow the run froze/);
      assert.ok(!run.warning.includes('..'), run.warning);
      assert.deepEqual(
        run.steps.map((s) => [s.name, s.spec, s.body]),
        [
          ['implement', frozenSpecs.implement, 'Implement it, as frozen.'],
          ['review', frozenSpecs.review, 'Review it, as frozen.'],
        ],
      );
      assert.deepEqual(
        run.graph,
        frozenGraph,
        "a folder holding a key this parser does not know does not read: the graph is the record's, not every step a root",
      );
      assert.deepEqual(
        (await listed('r-40')).graph,
        frozenGraph,
        "the list draws the card's flow off the same graph, with no read of the run",
      );
      assert.ok(
        run.steps[0].told?.startsWith(`${PRECEDENCE}\n\nImplement it, as frozen.\n\n## What was asked for`),
        `not filed: told what the tick would file it with, composed from the frozen workflow, not ${String(run.steps[0].told)}`,
      );

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
      assert.ok(!gone.warning.includes('..'), gone.warning);
      assert.deepEqual(
        gone.steps.map((s) => s.spec),
        [frozenSpecs.implement, frozenSpecs.review],
        'with no folder at all: the same page',
      );
      assert.deepEqual(gone.graph, frozenGraph);
      assert.deepEqual((await listed('r-41')).graph, frozenGraph);
    },
  );
  await s.test('a run frozen with a step of the former key `maxAttempts: 2` still reads, and its spec does not carry the key', async () => {
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
  await s.test('a run that froze its workflow is drawn from it, not from a folder that reads and says something else', async () => {
    const edited = workflowFolder({
      'implement.md': '---\nplace: git\nharness: codex\n---\nImplement it, edited.\n',
      'review.md': '---\nplace: git\nharness: claude\n---\nReview it, edited.\n',
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
    assert.deepEqual(
      run.graph,
      frozenGraph,
      'the frozen graph, not the one of a folder edited after `nemia start` with the loop taken out and review waiting on nothing',
    );
    assert.deepEqual(
      (await listed('r-42')).graph,
      frozenGraph,
      "and so is its card: not the edited folder's graph, which has no edge at all",
    );
    assert.ok(run.steps[1].told?.startsWith(`${PRECEDENCE}\n\nReview it, as frozen.`), String(run.steps[1].told));
  });
  await s.test(
    'a run that froze its workflow shows only its steps: one its folder gained since is named in the warning, and neither listed nor drawn',
    async () => {
      const grown = workflowFolder({
        'implement.md': '---\nplace: git\n---\nImplement it.\n',
        'review.md': '---\nafter: implement\nplace: git\n---\nReview it.\n',
        'docs.md': '---\nplace: git\n---\nWrite it down.\n',
      });
      writeRun({
        ...r2,
        id: 'r-43',
        workflowDir: grown,
        workflow: frozenLoop,
        steps: { implement: { taskId: null }, review: { taskId: null } },
      });

      const run = await detailOf('r-43');
      assert.ok(run.warning, 'docs was added to the folder after `nemia start`: the tick reads the frozen workflow, so it never files it');
      assert.match(
        run.warning,
        /has changed since this run started: it has docs, which the run did not start with and will never file, so it is not shown\./,
      );
      assert.deepEqual(
        run.steps.map((s) => s.name),
        ['implement', 'review'],
      );
      assert.deepEqual(run.graph, frozenGraph, 'docs is not a root beside implement: the graph is the one the run froze');
      assert.deepEqual((await listed('r-43')).graph, frozenGraph);
      assert.deepEqual(
        (await listed('r-43')).steps.map((s) => s.name),
        ['implement', 'review'],
      );
      assert.deepEqual(
        (await runWith(engine(), list(engine(), runStore.runs.read('r-43')))).steps.map((s: { name: string }) => s.name),
        ['implement', 'review'],
        'the steps `nemia ls` lists, and no other',
      );
      assert.equal((await app.request('/api/runs/r-43/steps/docs/log')).status, 404);
    },
  );
});

const numbered = (n: number) => Array.from({ length: n }, (_, i) => `line ${i + 1}`);

const logOf = async (url: string) => {
  const res = await app.request(url);
  return { status: res.status, body: await res.json() };
};

test("a step's attempts and its log: how many, when the latest began and ended, the last 200 lines of its session, and the engine's word before it starts", async (t) => {
  const s = story(t);
  await s.test('each step says how many attempts it has had, when the latest began, and how and when it ended', async () => {
    retryingTask('t-7');
    writeRun({ ...r2, id: 'r-7', steps: { implement: { taskId: 't-7', branch: 'wf/r-7/implement' }, review: { taskId: null } } });

    const run = await detailOf('r-7');
    assert.deepEqual(
      run.steps.map((s: { attempts: unknown }) => s.attempts),
      [
        { count: 2, latest: { startedAt: later, ended: null, endedAt: null, reason: null } },
        { count: 0, latest: null },
      ],
      'the second attempt is still going, so it has not ended; the one the engine lost is counted',
    );

    journal('t-8', [
      filed('t-8'),
      { kind: 'starting', at, attempt: 1 },
      { kind: 'spawned', at, attempt: 1 },
      { kind: 'ended', at: later, attempt: 1, sessionId: 'ae/t-8/1', observed: 'done', reason: 'harness' },
      { kind: 'settled', at: later, outcome: 'succeeded' },
    ]);
    writeRun({ ...r2, id: 'r-8', steps: { implement: { taskId: 't-8', branch: 'wf/r-8/implement' }, review: { taskId: null } } });
    assert.deepEqual(
      (await detailOf('r-8')).steps[0].attempts,
      {
        count: 1,
        latest: { startedAt: at, ended: 'succeeded', endedAt: later, reason: 'harness' },
      },
      'an attempt that ran half an hour ends at its ended event, not at its start, so the board can say how long it took',
    );

    const quiet = (taskId: string, end: object, settled: string) =>
      journal(taskId, [
        { ...filed(taskId), closeoutSchema: { type: 'object' } },
        { kind: 'starting', at, attempt: 1 },
        { kind: 'spawned', at, attempt: 1 },
        { kind: 'ended', at: later, attempt: 1, sessionId: `ae/${taskId}/1`, ...end },
        { kind: 'settled', at: later, outcome: settled },
      ]);
    const unsignedWords = { count: 1, latest: { startedAt: at, ended: 'failed', endedAt: later, reason: 'unsigned' } };
    quiet('t-8u', { observed: 'done', reason: 'harness', closedOut: false }, 'succeeded');
    writeRun({ ...r2, id: 'r-8u', steps: { implement: { taskId: 't-8u', branch: 'wf/r-8u/implement' }, review: { taskId: null } } });
    const unsigned = await detailOf('r-8u');
    assert.deepEqual(
      [unsigned.steps[0].attempts, unsigned.steps[0].status],
      [unsignedWords, 'unsigned'],
      'a session that ended with no statement its task asked for, closedOut: false on an end its harness settled, reads unsigned',
    );
    quiet('t-8o', { observed: 'failed', reason: 'unsigned' }, 'failed');
    writeRun({ ...r2, id: 'r-8o', steps: { implement: { taskId: 't-8o', branch: 'wf/r-8o/implement' }, review: { taskId: null } } });
    const judgedUnsigned = await detailOf('r-8o');
    assert.deepEqual(
      [judgedUnsigned.steps[0].attempts, judgedUnsigned.steps[0].status],
      [unsignedWords, 'unsigned'],
      'an old journal, whose end the runtime judged unsigned itself, reads the same',
    );

    const cappedWords = { count: 1, latest: { startedAt: at, ended: 'failed', endedAt: later, reason: 'budget' } };
    quiet('t-8b', { observed: 'failed', reason: 'harness', limit: 'budget', exitCode: 1 }, 'failed');
    writeRun({ ...r2, id: 'r-8b', steps: { implement: { taskId: 't-8b', branch: 'wf/r-8b/implement' }, review: { taskId: null } } });
    const capped = await detailOf('r-8b');
    assert.deepEqual(
      [capped.steps[0].attempts, capped.steps[0].status],
      [cappedWords, 'budget exhausted'],
      "a session its harness cut at its spend cap, limit: 'budget' on the harness's own end, reads budget exhausted",
    );
    quiet('t-8c', { observed: 'failed', reason: 'budget', exitCode: 1 }, 'failed');
    writeRun({ ...r2, id: 'r-8c', steps: { implement: { taskId: 't-8c', branch: 'wf/r-8c/implement' }, review: { taskId: null } } });
    const judgedCapped = await detailOf('r-8c');
    assert.deepEqual(
      [judgedCapped.steps[0].attempts, judgedCapped.steps[0].status],
      [cappedWords, 'budget exhausted'],
      'an end the runtime judged budget itself reads the same',
    );

    assert.deepEqual(
      (await detailOf('r-4')).steps[0].attempts,
      { count: 0, latest: null },
      'a task the engine has no record of has had no attempts it can speak for',
    );

    assert.deepEqual(
      Object.keys((await listed('r-7')).steps[0]),
      [
        'name',
        'taskId',
        'branch',
        'status',
        'note',
        'roundDue',
        'agent',
        'since',
        'needs',
        'blockedByHarness',
        'waitingFor',
        'approve',
        'denied',
        'sessionUnread',
      ],
      'the list carries the note `nemia ls` prints beside a step, its agent and since when it works, and what a person has to know to act on it',
    );
    assert.equal((await listed('r-7')).steps[0].note, null, 'no note for a step on its first try');
  });
  await s.test("a step's log is the end of its session's output: the last 200 lines, and whether there were more", async () => {
    settledTask('t-8', blocked);
    codexSession('t-8', 1, numbered(250).join('\n') + '\n');
    writeRun({ ...r2, id: 'r-8', steps: { implement: { taskId: 't-8', branch: 'wf/r-8/implement' }, review: { taskId: null } } });
    assert.deepEqual(await logOf('/api/runs/r-8/steps/implement/log'), {
      status: 200,
      body: { lines: numbered(250).slice(-200), truncated: true },
    });

    settledTask('t-9', blocked);
    codexSession('t-9', 1, numbered(200).join('\n'));
    writeRun({ ...r2, id: 'r-9', steps: { implement: { taskId: 't-9', branch: 'wf/r-9/implement' }, review: { taskId: null } } });
    assert.deepEqual(
      await logOf('/api/runs/r-9/steps/implement/log'),
      {
        status: 200,
        body: { lines: numbered(200), truncated: false },
      },
      'as many lines as it shows is all of them, and output with no final newline loses no line',
    );
  });
  await s.test("a step with no task has no log yet, and one filed but not started has the engine's word for it", async () => {
    assert.deepEqual(await logOf('/api/runs/r-8/steps/review/log'), { status: 200, body: { lines: [], truncated: false } });
    assert.deepEqual(
      await logOf('/api/runs/r-6/steps/replacement/log'),
      { status: 200, body: { lines: [], truncated: false } },
      'a step the folder gained after the run started has no task either',
    );
    assert.deepEqual(
      await logOf('/api/runs/r-5/steps/implement/log'),
      {
        status: 200,
        body: { lines: ['(no session yet)'], truncated: false },
      },
      'filed and waiting for a slot: there is no session to read, and the engine says so',
    );
  });
});

test("GET /api/runs/:id and a step's log refuse: an unknown run or step is a 404, an id is no path out of the store, and output the engine cannot read a 502", async (t) => {
  await t.test('an unknown run is refused with a 404 that says where to look', async () => {
    const res = await app.request('/api/runs/no-such-run');
    assert.equal(res.status, 404);
    const { error } = (await res.json()) as { error: string };
    assert.match(error, /No run 'no-such-run'/);
    assert.match(error, /GET \/api\/runs/);
  });
  await t.test('a run id cannot name a file outside the run store', async () => {
    writeRun({ ...r2, id: '../escape' });
    assert.equal(
      runStore.runs.read('../escape').id,
      '../escape',
      'the file is a readable run, one directory up: reading the id as a path serves it',
    );

    const res = await app.request('/api/runs/..%2Fescape');
    assert.equal(res.status, 404);
  });
  await t.test('a log for a run or a step that does not exist is refused with a 404 that says where to look', async () => {
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

    for (const url of [
      '/api/runs/r-8/steps/constructor/log',
      '/api/runs/r-8/steps/__proto__/log',
      '/api/runs/..%2Fescape/steps/implement/log',
    ]) {
      assert.equal(
        (await app.request(url)).status,
        404,
        `${url}: a name every object answers to is not a step, and a run id is not a path out of the store`,
      );
    }
  });
  await t.test('output the engine cannot read is a 502 that says how to read it from the command line', async () => {
    settledTask('t-10', blocked);
    codexSession('t-10', 1, { unreadable: true });
    writeRun({ ...r2, id: 'r-10', steps: { implement: { taskId: 't-10', branch: 'wf/r-10/implement' }, review: { taskId: null } } });

    const { status, body } = await logOf('/api/runs/r-10/steps/implement/log');
    assert.equal(status, 502);
    const { error } = body as { error: string };
    assert.match(error, /Could not read the output of step 'implement' \(task t-10\)/);
    assert.match(error, /`nemia logs r-10 implement`/);
  });
});

const done = { outcome: 'done', summary: 'It is done.', needs: null, artifacts: [] };

/**
 * A task on the run's `check` harness, as the engine journals one: running, or settled with the exit code its process gave, if it gave one,
 * its attempt ended by its harness unless `reason` says its deadline or an operator ended it.
 */
const checkTask = (
  taskId: string,
  how: { running: true } | { settled: 'succeeded' | 'failed' | 'stopped'; exitCode?: number; reason?: 'deadline' | 'operator' },
) =>
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
            reason: how.reason ?? 'harness',
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

/** A test runner's stdout, as a check's log and its stdout keep it. */
const refusedOutput = 'ok 1 - builds\nnot ok 2 - parses a trailing comma\n# fail 1\n';

/**
 * A run that froze its workflow, with a step for each thing `nemia ls` says the run established: verified;
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

/**
 * Seeds r-20, a step for each thing the run established (`r20Steps`), its e2e check stopped at its deadline before it printed anything:
 * no exit code, and no session output. And r-21, verified then done on its own word: every step final, and every one lets a follower
 * be filed.
 */
function seedChecks() {
  for (const step of ['build', 'test', 'e2e', 'lint', 'docs']) settledTask(`t-20-${step}`, done);
  checkTask('r-20-build-check', { settled: 'succeeded', exitCode: 0 });
  checkTask('r-20-test-check', { settled: 'failed', exitCode: 1 });
  detachedSession('check', 'r-20-test-check', 1, '', 1);
  checkStreams('r-20-test-check', { stdout: refusedOutput, stderr: 'npm error Test failed.\n' });
  checkTask('r-20-e2e-check', { settled: 'stopped' });
  checkTask('r-20-lint-check', { running: true });
  silentTask('t-20-notes');
  retryingTask('t-20-plan');
  writeRun({
    ...r2,
    id: 'r-20',
    workflow: r20Steps,
    /**
     * The folder as somebody left it after `nemia start`: the same steps, and every `check:` taken out. The run is judged by the workflow
     * it froze, so these change nothing.
     */
    workflowDir: workflowFolder(
      Object.fromEntries(
        r20Steps.map((s) => [`${s.name}.md`, `---\n${s.after.length ? `after: ${s.after.join(', ')}\n` : ''}place: git\n---\n${s.body}\n`]),
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

/**
 * A review that loops back to implement, frozen as `nemia start` freezes it: `again` declared boolean in its `output:`,
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
 * A declared field is a field of the closeout itself, beside the four every closeout has, and from round 2 an empty `replies` is
 * no answer.
 */
function seedLoop(id: string, round: number, again: boolean) {
  const steps: Record<string, object> = {};
  for (const name of ['implement', 'review']) {
    steps[name] = {
      taskId: `t-${id}-${name}-${round}`,
      tries: Array.from({ length: round - 1 }, (_, i) => ({ taskId: `t-${id}-${name}-${i + 1}`, then: 'round' })),
    };
  }
  const replies = [{ finding: 'src/flag.ts:12', answer: 'fixed', why: 'parsed before it is read' }];
  settledTask(`t-${id}-implement-${round}`, round > 1 ? { ...done, replies } : done);
  settledTask(`t-${id}-review-${round}`, { ...done, again });
  writeRun({ ...r2, id, workflowDir: path.join(NOWHERE, 'no-such-workflow'), workflow: looped, steps });
}

/** A person's ask, as `nemia retry` and `nemia round` leave one: a file of its own beside the run's record, named for what it asks. */
function askFor(id: string, name: string, ask: object) {
  const dir = path.join(root, 'runs', `${id}.asks`);
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, name), `${JSON.stringify({ ...ask, at: later }, null, 2)}\n`);
}

/** A step row as the list and the detail both carry it. */
type Row = Pick<RunSummary['steps'][number], 'name' | 'status' | 'branch' | 'note' | 'roundDue'>;

/** A step row as `list` has it: a note only where it prints one, and `roundDue` only where a round is due. */
const asListed = ({ name, status, branch, note, roundDue }: Row) => ({
  name,
  status,
  branch,
  ...(note === null ? {} : { note }),
  ...(roundDue ? { roundDue } : {}),
});

type Judgement = [
  id: string,
  status: string,
  moving: boolean,
  waitingOnYou: string[],
  rows: Array<[name: string, status: string, note: string | null]>,
  why: string,
];

/**
 * Each run on both endpoints: where it stands, whether it moves, who it waits on, each step's word and note — and those are `nemia ls`'s.
 */
async function expectJudged(cases: readonly Judgement[]) {
  const e = engine();
  for (const [id, status, moving, waitingOnYou, rows, why] of cases) {
    const words = await runWith(e, list(e, runStore.runs.read(id)));
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
      assert.deepEqual(run.steps.map(asListed), words.steps, `${id}, ${where}: nemia ls's words and notes`);
      assert.deepEqual(run.waitingOnYou, words.waitingOnYou, `${id}, ${where}: who nemia ls says is waited on`);
    }
  }
}

test("what a run established, read as the tick and `nemia ls` have it: each step's words, the run's status and whether it moves, a refused check with retries left, a loop out of rounds sent round again, and the commands it offers", async (t) => {
  const s = story(t);
  await s.test("each step says what the run established, in `nemia ls`'s words, on both endpoints", async () => {
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
    assert.deepEqual(
      detail.waitingOnYou,
      ['test', 'e2e', 'notes'],
      'the refusals and the step that never signed; not a check still running, nor a step done on its own word',
    );
    assert.deepEqual(summary.waitingOnYou, ['test', 'e2e', 'notes']);
    assert.equal(detail.warning, null);
  });
  await s.test("the api's words, and who it says is waited on, are `list`'s — a refused check's exit code among them", async () => {
    const e = engine();
    for (const id of ['r-20', 'r-21']) {
      const words = await runWith(e, list(e, runStore.runs.read(id)));
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
  await s.test(
    "a run's status is where `assess` puts it on both endpoints, in one word under one key: a run at its gate alone is awaiting approval and one waiting on an answer blocked, REFUSED failed, which is a run in which a step broke",
    async () => {
      settledTask('t-gate', done);
      writeRun({
        ...r2,
        id: 'r-gate',
        gates: ['implement'],
        steps: { implement: { taskId: 't-gate', branch: 'wf/r-gate/implement' }, review: { taskId: null } },
      });
      const cases: Array<[id: string, status: RunSummary['status'], why: string]> = [
        ['r-5', 'running', 'a step filed and queued for a slot, its follower still to be filed'],
        ['r-7', 'running', 'a step on its second attempt'],
        ['r-21', 'succeeded', 'verified, then done on its own word'],
        [
          'r-6',
          'running',
          'no frozen workflow, so judged by its folder as the tick judges it: its step signed off blocked, and the folder gained a step the tick would file',
        ],
        ['r-20', 'failed', 'a check refused, so what waits on that step waits for ever: a step broke'],
        ['r-8', 'blocked', 'a step signed off blocked: it waits on an answer, and nothing broke'],
        ['r-gate', 'awaiting approval', 'a step signed off at its gate: it waits for a yes, and nothing broke'],
        ['r-2', 'cancelled', 'called off, whatever its steps say'],
      ];
      for (const [id, status, why] of cases) {
        const row = (await listed(id)) as unknown as Record<string, unknown>;
        const full = (await detailOf(id)) as unknown as Record<string, unknown>;
        assert.equal(row.status, status, `${id} listed: ${why}`);
        assert.equal(full.status, status, `${id} in full: ${why}`);
        assert.deepEqual(['stoppedOn' in row, 'stoppedOn' in full], [false, false], `${id}: the word has one key`);
      }
      assert.equal(
        (await listed('r-3')).status,
        'running',
        'called off, its folder gone and no workflow frozen: unjudged, as the tick leaves it',
      );
      await saysAsListed('r-3');
    },
  );
  await s.test('a run moves while the engine holds a task of it, or a tick would still file one — whatever `assess` calls it', async () => {
    const gone = path.join(NOWHERE, 'no-such-workflow');

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
      "one root's check refused while its sibling's session still runs, and c, which waits on both, will never be filed",
    );

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

    writeRun({ ...r2, id: 'r-23', steps: { implement: { taskId: 't-7', branch: 'wf/r-23/implement' }, review: { taskId: null } } });
    fs.writeFileSync(path.join(root, 'runs', 'r-23.cancelled'), '2026-09-12T03:00:00.000Z');

    writeRun({ ...r2, id: 'r-26', workflowDir: gone });

    const cases: Array<[id: string, status: string, moving: boolean, why: string]> = [
      ['r-24', 'failed', true, "a check refused while a sibling's session still runs"],
      ['r-25', 'failed', true, 'a step failed, nothing is running, and a step waiting only on its sibling is still to file'],
      ['r-20', 'failed', true, 'a check refused, and another check and a session still run'],
      ['r-23', 'cancelled', true, 'called off, its session not stopped yet'],
      ['r-5', 'running', true, 'a step queued for a slot'],
      ['r-6', 'running', true, 'a step the folder gained, which the tick would file'],
      ['r-8', 'blocked', false, 'a step signed off blocked, and its follower is not filed'],
      ['r-21', 'succeeded', false, 'verified, then done on its own word'],
      ['r-2', 'cancelled', false, 'called off, nothing left running'],
      [
        'r-4',
        'running',
        false,
        'a step the engine has lost: assess reads it as still running, but it holds nothing, and nothing waits for it to be filed',
      ],
    ];
    for (const [id, status, moving, why] of cases) {
      const summary = await listed(id);
      const detail = await detailOf(id);
      assert.deepEqual([summary.status, summary.moving], [status, moving], `${id} listed: ${why}`);
      assert.deepEqual([detail.status, detail.moving], [status, moving], `${id} in full: ${why}`);
    }
    const summary = await listed('r-26');
    assert.deepEqual(
      [summary.status, summary.moving],
      ['running', true],
      'a record with no frozen workflow, its folder gone and not called off: unjudged and in flight, as the tick leaves it',
    );
    await saysAsListed('r-26');
  });
  await s.test(
    'a check that refused with `retries:` left reads as the tick has it — running, moving, waiting on nobody — and one that did not finish, failed and waiting on you',
    async () => {
      const gone = path.join(NOWHERE, 'no-such-workflow');
      const retried = [
        { name: 'a', after: [], body: 'A.', check: 'npm test', retries: 1 },
        { name: 'b', after: ['a'], body: 'B.' },
      ];
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
        [
          'r-27',
          'running',
          true,
          [],
          'failed ✗ check (exit 1)',
          'the check ran to its end and exited 1, with a try left: the next tick files it',
        ],
        [
          'r-28',
          'failed',
          false,
          ['a'],
          'failed ✗ check (unfinished)',
          'stopped at its deadline, failed with no exit code, so it did not finish: no try is spent, it waits on a person, and no tick files a thing',
        ],
      ];
      for (const [id, status, moving, waitingOnYou, word, why] of cases) {
        assert.deepEqual((await runWith(e, list(e, runStore.runs.read(id)))).waitingOnYou, waitingOnYou, `${id}, nemia ls: ${why}`);
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
    },
  );
  await s.test(
    'a loop out of rounds reads `rounds exhausted`, waits on you, and does not move — until a person sends it round again',
    async () => {
      seedLoop('r-30', DEFAULT_ROUNDS, true);
      seedLoop('r-31', DEFAULT_ROUNDS, true);
      askFor('r-31', 'round-review-4', { step: 'review', round: 4 });

      await expectJudged([
        [
          'r-30',
          'blocked',
          false,
          ['review'],
          [
            ['implement', 'unverified · done', 'round 3 of 3'],
            ['review', 'rounds exhausted', 'round 3 of 3, and it asked again — once more: nemia round r-30 review'],
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
            ['review', 'rounds exhausted', 'round 4 asked (nemia round) — the next tick files implement'],
          ],
          'a person asked for round 4: the next tick files it, and nobody is waited on',
        ],
      ]);
      assert.deepEqual(
        (await listed('r-31')).steps.map((s) => [s.name, s.roundDue]),
        [
          ['implement', false],
          ['review', true],
        ],
        'the round asked is a fact beside the note, never read off its words',
      );
    },
  );
  await s.test(
    "a run's detail answers its decide line, and each step's approve, retry and say lines, built off the command table",
    async () => {
      seedLoop('r-34', 1, true);
      const entry = (name: string) => COMMANDS.find((c) => c.name === name)!;
      const run = await detailOf('r-34');
      assert.equal(run.decide, commandLine(entry('decide'), { runId: 'r-34' }));
      assert.equal(run.decide, 'nemia decide r-34');
      assert.deepEqual(
        run.steps.map((s) => [s.name, s.commands]),
        ['implement', 'review'].map((step) => [
          step,
          {
            approve: commandLine(entry('approve'), { runId: 'r-34', step }),
            retry: commandLine(entry('retry'), { runId: 'r-34', step }),
            say: commandLine(entry('say'), { runId: 'r-34', step }),
          },
        ]),
      );
      assert.deepEqual(run.steps[1].commands, {
        approve: 'nemia approve r-34 review',
        retry: 'nemia retry r-34 review',
        say: 'nemia say r-34 review',
      });
    },
  );
  await s.test(
    'a round the loop asked for, and a try a person asked for, read as the tick has them: a note beside the step, and the run moving',
    async () => {
      seedLoop('r-32', 1, true);
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
          'review asked again with rounds left and nothing of the run in flight: a round due moves the run as a try due does',
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
          'signed off blocked, and a person asked for another try: the next tick files it, and nobody is waited on',
        ],
      ]);
    },
  );
});

test("a step's check read on the board: its command, and once it refused its exit and each stream's last lines, `unfinished` when it was ended, and an answer still where its output cannot be read", async (t) => {
  const s = story(t);
  await s.test(
    "a step with a `check:` carries its command, and once its check refused, the exit and each stream's last lines",
    async () => {
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
          stdout: { lines: ['ok 1 - builds', 'not ok 2 - parses a trailing comma', '# fail 1'], truncated: false },
          stderr: { lines: ['npm error Test failed.'], truncated: false },
          unreadable: null,
        },
      });
      assert.deepEqual(
        checkOf('e2e'),
        {
          command: 'npm run e2e',
          taskId: 'r-20-e2e-check',
          verdict: 'unfinished',
          refused: {
            exit: 'unfinished',
            stdout: { lines: ['(no output yet)'], truncated: false },
            stderr: { lines: [], truncated: false },
            unreadable: null,
          },
        },
        'stopped before it printed: no number, no stderr file, and, as for any check that kept no stdout, its log: the word of its harness, read by the id its end was recorded under with no observe, that its session printed nothing',
      );
      for (const name of ['docs', 'notes', 'plan', 'ship'])
        assert.equal(checkOf(name), null, `${name}: no check: in the workflow the run froze`);
    },
  );
  await s.test(
    'a check its deadline or an operator ended reads `unfinished` whatever code it recorded, and one its harness ended reads its exit',
    async () => {
      const cases = [
        ['deadline', { settled: 'failed', exitCode: 1, reason: 'deadline' }],
        ['operator', { settled: 'failed', exitCode: 1, reason: 'operator' }],
        ['harness', { settled: 'failed', exitCode: 1 }],
      ] as const;
      for (const [name, how] of cases) {
        settledTask(`t-72-${name}`, done);
        checkTask(`r-72-${name}-check`, how);
        checkStreams(`r-72-${name}-check`, { stdout: refusedOutput, stderr: '' });
      }
      writeRun({
        ...r2,
        id: 'r-72',
        workflowDir: path.join(NOWHERE, 'no-such-workflow'),
        workflow: cases.map(([name]) => ({ name, after: [], body: 'Test it.', check: 'npm test' })),
        steps: Object.fromEntries(cases.map(([name]) => [name, { taskId: `t-72-${name}`, check: { taskId: `r-72-${name}-check` } }])),
      });

      const { steps } = await detailOf('r-72');
      const words = Object.fromEntries(steps.map((s) => [s.name, [s.status, s.check?.verdict, s.check?.refused?.exit]]));
      assert.deepEqual(words, {
        deadline: ['failed ✗ check (unfinished)', 'unfinished', 'unfinished'],
        operator: ['failed ✗ check (unfinished)', 'unfinished', 'unfinished'],
        harness: ['failed ✗ check (exit 1)', 'exit 1', 'exit 1'],
      });
    },
  );
  await s.test("an earlier try's check its deadline ended reads `unfinished` whatever code it recorded", async () => {
    settledTask('r-73-implement', done);
    checkTask('r-73-implement-check', { settled: 'failed', exitCode: 1, reason: 'deadline' });
    settledTask('r-73-implement-try2', done);
    checkTask('r-73-implement-try2-check', { settled: 'succeeded', exitCode: 0 });
    writeRun({
      ...r2,
      id: 'r-73',
      workflowDir: path.join(NOWHERE, 'no-such-workflow'),
      workflow: [{ name: 'implement', after: [], body: 'Implement it.', check: 'npm test', retries: 1 }],
      steps: {
        implement: {
          taskId: 'r-73-implement-try2',
          check: { taskId: 'r-73-implement-try2-check' },
          tries: [{ taskId: 'r-73-implement', check: { taskId: 'r-73-implement-check' }, then: 'retries' }],
        },
      },
    });

    const [implement] = (await detailOf('r-73')).steps;
    const first = implement.tries[0].check;
    assert.deepEqual([first?.verdict, first?.refused?.exit], ['unfinished', 'unfinished']);
    assert.equal(implement.tries[1].check?.verdict, 'passed');
  });
  await s.test('a refused check that kept no stdout is read off its log, as `nemia decide` reads it', async () => {
    settledTask('t-74-e2e', done);
    checkTask('r-74-e2e-check', { settled: 'stopped' });
    detachedSession('check', 'r-74-e2e-check', 1, 'starting the browser\n', 1);
    writeRun({
      ...r2,
      id: 'r-74',
      workflowDir: path.join(NOWHERE, 'no-such-workflow'),
      workflow: [{ name: 'e2e', after: [], body: 'Try it in a browser.', check: 'npm run e2e' }],
      steps: { e2e: { taskId: 't-74-e2e', check: { taskId: 'r-74-e2e-check' } } },
    });

    const [e2e] = (await detailOf('r-74')).steps;
    assert.deepEqual(e2e.check?.refused?.stdout, { lines: ['starting the browser'], truncated: false });
  });
  await s.test('a refused check whose output cannot be read still answers, and says how to read it from the command line', async () => {
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
    assert.match(refused.unreadable, /`nemia decide r-22`/);
  });
  await s.test(
    'a refused check whose stderr the engine cannot give still answers with its stdout, and says how to read it from the command line',
    async () => {
      settledTask('t-71-test', done);
      checkTask('r-71-test-check', { settled: 'failed', exitCode: 1 });
      detachedSession('check', 'r-71-test-check', 1, '', 1);
      checkStreams('r-71-test-check', { stdout: refusedOutput, stderr: { unreadable: true } });
      writeRun({
        ...r2,
        id: 'r-71',
        workflowDir: path.join(NOWHERE, 'no-such-workflow'),
        workflow: [{ name: 'test', after: [], body: 'Test it.', check: 'npm test' }],
        steps: { test: { taskId: 't-71-test', check: { taskId: 'r-71-test-check' } } },
      });

      const [test] = (await detailOf('r-71')).steps;
      const refused = test.check?.refused;
      assert.ok(refused);
      assert.deepEqual(
        { ...refused, unreadable: undefined },
        {
          exit: 'exit 1',
          stdout: { lines: ['ok 1 - builds', 'not ok 2 - parses a trailing comma', '# fail 1'], truncated: false },
          stderr: { lines: [], truncated: false },
          unreadable: undefined,
        },
      );
      assert.match(
        refused.unreadable ?? '',
        /^Could not read the output of its check \(task r-71-test-check\): .*EISDIR.*`nemia decide r-71`/,
      );
    },
  );
});

test('the list of runs observes the engine at most once, however many runs and steps are filed, and not at all with nothing in flight', async (t) => {
  const bin = scratch('nemia-api-bin-');
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
  assert.ok(
    runs.flatMap((r) => r.steps).filter((s) => s.taskId).length >= 3,
    'filed steps, each of which a view per step would observe once',
  );
  assert.ok(
    runs.flatMap((r) => r.steps).some((s) => s.status === 'failed ✗ check (exit 1)'),
    'a refused check, worded with its exit code, is on the list',
  );
  assert.equal(
    observations(),
    0,
    "queued, settled and refused, none of them in flight: no harness is looked at (list(taskIds)); once for any number in flight is asks.test.ts's",
  );
});

/**
 * A `claude` ahead of the real one on PATH for the length of the test, which notes each call and sees no sessions of ours: how
 * many times a request observed the harnesses.
 */
function countingObservations(t: { after: (fn: () => void) => void }): () => number {
  const bin = scratch('nemia-api-bin-');
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

test("a step's tries and its closeout: every try of a looped step off one observation, each declared field's schema as the run froze it, and a statement that could not be read as it came", async (t) => {
  const s = story(t);
  await s.test(
    'a step on its third try, in the second round of its loop, carries every try: its round, what replaced it, its task, check and closeout — off one observation',
    async (t) => {
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
      checkStreams('r-50-implement-check', { stdout: refusedOutput, stderr: 'npm error Test failed.\n' });
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
        /**
         * implement's check refused its first try, and `retries: 1` filed a second, which passed; review asked for another round, and the
         * loop filed implement's third try, which answered the findings and passed; review then asked for no more.
         */
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
      assert.equal(
        observations(),
        0,
        "eight tasks, implement's three and their checks and review's two, all settled and no refused check of the current try: no look at the harnesses (list(taskIds))",
      );

      const once = { count: 1, latest: { startedAt: at, ended: 'succeeded', endedAt: at, reason: 'harness' } };
      const closeout = (raw: { summary: string }, more: object = {}) => ({
        apiVersion: null,
        outcome: 'done',
        summary: raw.summary,
        body: null,
        needs: null,
        artifacts: [],
        values: [],
        refused: [],
        output: {},
        missing: [],
        replies: null,
        schema: {},
        questions: [],
        raw,
        ...more,
      });
      const passed = (taskId: string) => ({ command: 'npm test', taskId, verdict: 'passed', refused: null });
      const [implement, review] = run.steps;
      assert.deepEqual([implement.status, implement.note, implement.attempts], ['verified ✓', 'round 2 of 3', once]);
      assert.deepEqual(
        implement.tries,
        [
          {
            try: 1,
            round: 1,
            then: 'retries',
            current: false,
            taskId: 'r-50-implement',
            note: null,
            status: 'succeeded',
            attempts: once,
            /** Its check refused: the verdict, and the stderr the runtime kept. Its stdout is not read for a try that is over. */
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
        ],
        "each closeout keeps what was recorded, untouched, as raw: replies is read into the api's shape, and the statement is not",
      );
      assert.deepEqual(
        [implement.check, implement.closeout],
        [implement.tries[2].check, implement.tries[2].closeout],
        "the step's own check and closeout are its current try's",
      );

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
          /**
           * What it declared, in its schema's order: the findings implement was handed, and each field's schema off the frozen
           * workflow.
           */
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
    },
  );
  await s.test(
    "a closeout carries each declared field's schema off the workflow the run froze — given or missing — and the statement as it was recorded",
    async () => {
      const schema = {
        type: 'object',
        properties: {
          approach: { type: 'string', description: 'The change in a paragraph.' },
          files: { type: 'array', items: { type: 'object', properties: { path: { type: 'string' }, change: { type: 'string' } } } },
        },
        required: ['approach', 'files'],
        additionalProperties: false,
      };
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
        'an outcome that is neither word, an artifact that is not a path, a field nobody declared: read forgivingly',
      );
      assert.deepEqual(
        closeout.schema,
        schema.properties,
        "the folder is gone: the schema is the record's, a field's own, files among them though it was not given",
      );
      assert.deepEqual(closeout.raw, said, 'and kept as said');
    },
  );
  await s.test(
    'a statement that could not be read reaches the board as it came, with why — and a readable one has nothing unreadable',
    async () => {
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
      assert.equal(c.unreadable.raw, cut, 'cut off mid-string: not a closeout, and what the agent said, shown whole');
      assert.match(c.unreadable.error, /\S/);
      assert.deepEqual(c.tries.at(-1)?.unreadable, c.unreadable, 'the try carries it too');
      assert.equal(l.closeout, null);
      assert.ok(l.unreadable);
      assert.deepEqual(l.unreadable.raw, ['done'], 'an array: not a closeout, and what the agent said, shown whole');
      assert.equal(f.unreadable, null);
      assert.equal(f.closeout?.summary, 'Fine.');
    },
  );
});

test("what a step runs with: the workflow's effort, context and tools, the mode its harness gives its session, and the model a person's retry asked for, on that try alone", async (t) => {
  const s = story(t);
  await s.test(
    "a step says what it runs with: the workflow's effort, context window and tools, and what the engine filed its try with where the workflow says nothing",
    async () => {
      await Effect.runPromise(
        engine().file({
          id: 'r-51-implement',
          brief: 'Implement it.',
          cwd: '/code/app',
          harness: 'claude',
          /** Filed as the tick files a step, with its effort, window and tools, and as a step that sets no deadline, with none. */
          config: { effort: 'high', contextTokens: 200_000, tools: ['Read', 'Grep'] },
        }),
      );
      writeRun({
        ...r2,
        id: 'r-51',
        workflowDir: gone,
        workflow: [
          {
            name: 'implement',
            after: [],
            body: 'Implement it.',
            harness: 'claude',
            effort: 'high',
            context: 200_000,
            tools: ['Read', 'Grep'],
          },
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
        place: null,
        resume: null,
        permissionMode: null,
        sandbox: null,
        tools: ['Read', 'Grep'],
        deadlineSeconds: null,
        loop: null,
        rounds: null,
      });
      assert.deepEqual(
        implement.filed,
        {
          model: null,
          askedModel: null,
          effort: 'high',
          contextTokens: 200_000,
          permissionMode: null,
          runsIn: { mode: 'auto', by: 'default' },
          remote: null,
          bridge: null,
          tools: ['Read', 'Grep'],
          deadlineSeconds: null,
        },
        "the engine's defaults, off its journal: one attempt, no deadline, which is no limit, and no model, which is the harness's; and auto, the mode Claude Code runs a task filed with none in, which is not Claude Code's own",
      );
      assert.equal(review.filed, null, 'not filed: nothing the engine could say');
      assert.equal((await detailOf('r-4')).steps[0].filed, null, 'nor for a task the engine has no record of');
    },
  );
  await s.test(
    'a step says the mode its session runs in, as its harness decides it — a Codex sandbox narrowed by its tools, read-only for a reviewer that may not write whatever mode it named — at shipped defaults',
    async () => {
      const e = engine();
      const cases: Array<[id: string, spec: { harness: string; permissionMode?: string; tools?: string[] }, runsIn: object]> = [
        ['r-54-claude', { harness: 'claude' }, { mode: 'auto', by: 'default' }],
        ['r-54-claude-mode', { harness: 'claude', permissionMode: 'dontAsk' }, { mode: 'dontAsk', by: 'filed' }],
        ['r-54-codex', { harness: 'codex' }, { mode: 'workspace-write', by: 'default' }],
        ['r-54-codex-writes', { harness: 'codex', tools: ['Read', 'Bash'] }, { mode: 'workspace-write', by: 'default' }],
        ['r-54-codex-reads', { harness: 'codex', tools: ['Read', 'Grep'] }, { mode: 'read-only', by: 'tools' }],
        ['r-54-codex-named', { harness: 'codex', permissionMode: 'workspace-write', tools: ['Read'] }, { mode: 'read-only', by: 'tools' }],
        ['r-54-codex-bypass', { harness: 'codex', permissionMode: 'bypassPermissions' }, { mode: 'danger-full-access', by: 'filed' }],
      ];
      for (const [id, spec, runsIn] of cases) {
        const { harness, ...config } = spec;
        await Effect.runPromise(e.file({ id: `${id}-implement`, brief: 'Implement it.', cwd: '/code/app', harness, config }));
        writeRun({
          ...r2,
          id,
          workflowDir: gone,
          workflow: [{ name: 'implement', after: [], body: 'Implement it.', ...spec }],
          steps: { implement: { taskId: `${id}-implement` } },
        });
        const [implement] = (await detailOf(id)).steps;
        assert.deepEqual(implement.filed?.runsIn, runsIn, `${id}, filed as the tick files it: the harness's arguments under config`);
      }
    },
  );
  await s.test(
    "the mode the api says a Claude Code task runs in is the one the engine's `claude` spawns it with, a job on the Agent SDK",
    async (t) => {
      const said = new Map<string, string>();
      for (const [id, permissionMode] of [
        ['r-59-claude', undefined],
        ['r-59-claude-mode', 'dontAsk'],
      ] as const) {
        const spec = { harness: 'claude', ...(permissionMode ? { permissionMode } : {}) };
        await Effect.runPromise(
          engine().file({
            id: `${id}-implement`,
            brief: 'Implement it.',
            cwd: '/code/app',
            harness: 'claude',
            ...(permissionMode ? { config: { permissionMode } } : {}),
          }),
        );
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

      const spawnedWith = async (permissionMode: string | undefined) => {
        const dir = scratch('nemia-api-claude-');
        const argsFile = path.join(dir, 'args');
        const recorder = path.join(dir, 'claude.mjs');
        fs.writeFileSync(
          recorder,
          `import fs from 'node:fs';\nfs.writeFileSync(${JSON.stringify(argsFile)}, process.argv.slice(2).join('\\n'));\nprocess.exit(1);\n`,
        );
        const scope = Scope.makeUnsafe();
        t.after(() => Effect.runPromise(Scope.close(scope, Exit.void)));
        const e = await Effect.runPromise(
          Layer.build(Engine.layer({ root: path.join(dir, 'engine'), harnesses: { claude: 'claude' }, claudeExecutable: recorder })).pipe(
            Effect.map((context) => Context.get(context, Engine)),
            Effect.provideService(Scope.Scope, scope),
          ),
        );
        await Effect.runPromise(
          e.file({ brief: 'the prompt', cwd: dir, harness: 'claude', ...(permissionMode ? { config: { permissionMode } } : {}) }),
        );
        await Effect.runPromise(e.tick());
        const argv = await until(t, () => fs.existsSync(argsFile) && fs.readFileSync(argsFile, 'utf8'), 'the session spawned', {
          everyMs: 50,
        });
        return argv
          .split('\n')
          .find((arg) => arg.startsWith('--permission-mode='))
          ?.slice('--permission-mode='.length);
      };
      assert.equal(
        said.get('r-59-claude'),
        await spawnedWith(undefined),
        "filed with no mode: the argv the engine's job on the Agent SDK hands the Claude Code it runs",
      );
      assert.equal(said.get('r-59-claude-mode'), await spawnedWith('dontAsk'), 'filed with one');
    },
  );
  await s.test(
    "a model a person's `nemia retry --model` asked for is on the try it was asked for, past a recheck — and on no other",
    async () => {
      await Effect.runPromise(
        engine().file({
          id: 'r-55-implement-try2',
          brief: 'Implement it.',
          cwd: '/code/app',
          harness: 'claude',
          config: { model: 'sonnet' },
        }),
      );
      const asked = { taskId: 'r-55-implement', then: 'fresh', model: 'sonnet' };
      const cases: Array<[id: string, tries: object[], askedModel: string | null]> = [
        ['r-55', [asked], 'sonnet'],
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
    },
  );
});

/** A PNG of one pixel. */
const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==', 'base64');

/** An SVG that carries a script: an agent's markup, which would run on the board's origin opened as a page of its own. */
const SVG =
  '<svg xmlns="http://www.w3.org/2000/svg" width="10" height="10"><script>parent.pwned = true</script><rect width="10" height="10"/></svg>\n';

/**
 * r-52's `shoot`, which named its files: some in its files directory, and some not, or not by a name the api serves. `../outside.png` is
 * named as a step spells it, not as `path.join` resolves it, and `link.png` is made afresh on each call.
 */
function seedFiles() {
  const dir = path.join(root, 'runs', 'r-52', 'artifacts', 'shoot');
  const files: Record<string, string | Buffer> = {
    'shot.png': PNG,
    'notes.txt': 'It rendered.\n',
    'trace.zip': 'PK',
    'sub/deep.png': PNG,
    /** Markup that would run on the board's origin opened as a page: served sandboxed, and the HTML as text. The page is not named. */
    'diagram.svg': SVG,
    'page.html': '<script>parent.pwned = true</script>\n',
    /** Each a file the directory has, which a refusal alone keeps from being served. */
    '..shot.png': PNG,
    'a\\b.png': PNG,
    /** Beside the directory, where `..` leads. */
    '../outside.png': PNG,
  };
  for (const [name, body] of Object.entries(files)) {
    fs.mkdirSync(path.dirname(path.join(dir, name)), { recursive: true });
    fs.writeFileSync(path.join(dir, name), body);
  }
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

test("a step's files: a closeout's files with where they are served, each served by name with its type and refused as a path, and read pruned once `nemia prune --artifacts` removed them", async (t) => {
  const s = story(t);
  await s.test(
    "a closeout's files in the step's files directory carry where the api serves them, their kind and size — any other path is the path alone",
    async () => {
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
      assert.deepEqual(
        shoot.closeout.artifacts,
        [
          served('shot.png', 'image', PNG.length),
          served('notes.txt', 'text', 13),
          served('trace.zip', 'other', 2),
          served('diagram.svg', 'image', Buffer.byteLength(SVG)),
          { path: named[4] },
          { path: named[5] },
          { path: named[6] },
          { path: named[7] },
          { path: named[8] },
          { path: 'RESPONSE.md' },
          { path: '/etc/hosts' },
        ],
        'the path alone: outside the directory however it is spelled, under it where no name reaches, a link out of it, a name the route refuses, a file it does not have, a path on the branch, and an absolute path anywhere else, which is not looked at',
      );
      assert.deepEqual(shoot.tries[0].closeout?.artifacts, shoot.closeout.artifacts);
    },
  );
  await s.test(
    "a step's file is served by name, with its type and no caching — and a name that is a path, or not in the directory, is refused",
    async () => {
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

      const svg = await app.request(`${base}/diagram.svg`);
      assert.deepEqual(
        [svg.status, svg.headers.get('content-type'), await svg.text()],
        [200, 'image/svg+xml', SVG],
        "markup an agent wrote runs no script on the board's origin, opened in a tab: an SVG is served as an image under a policy that sandboxes it",
      );
      assert.equal((await app.request(`${base}/page.html`)).headers.get('content-type'), 'text/plain; charset=utf-8', 'and HTML as text');
      for (const name of ['diagram.svg', 'page.html', 'shot.png', 'notes.txt', 'trace.zip']) {
        const policy = (await app.request(`${base}/${name}`)).headers.get('content-security-policy') ?? '';
        assert.ok(policy.split(/\s*;\s*/).includes('sandbox'), `${name} is served sandboxed: ${policy || 'no policy'}`);
        assert.match(policy, /\bdefault-src 'none'/, `${name}: ${policy}`);
      }

      for (const name of ['..%2Foutside.png', 'sub%2Fdeep.png', 'a%5Cb.png', '..shot.png']) {
        const res = await app.request(`${base}/${name}`);
        assert.equal(res.status, 400, `${name} names a file on disk: only the refusal stands between it and the response`);
        const { error } = (await res.json()) as { error: string };
        assert.ok(/is not the name of a file: a name has no `\/`, `\\`, or `\.\.`/.test(error), `${name}: ${error}`);
      }
      for (const name of ['gone.png', 'sub', 'link.png']) {
        const res = await app.request(`${base}/${name}`);
        assert.equal(res.status, 404, `${name}: not a regular file in the directory`);
        assert.match(((await res.json()) as { error: string }).error, /has no file .* in its files directory/, name);
      }
      const noRun = (await (await app.request('/api/runs/no-such-run/steps/shoot/artifacts/shot.png')).json()) as { error: string };
      assert.match(noRun.error, /No run 'no-such-run'/, 'no such run');
      assert.equal((await app.request('/api/runs/r-52/steps/deploy/artifacts/shot.png')).status, 404, 'no such step');
    },
  );
  await s.test(
    "once `nemia prune --artifacts` removed a run's files, each file a closeout named there reads pruned, the route answers 410 saying so — not a 404 that reads as missing — and the run's page and its decision still answer",
    async () => {
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
        const said = `its files were removed at ${files.at} (nemia prune --artifacts)`;
        const [shoot] = page.steps;
        assert.ok(shoot.closeout);
        assert.deepEqual(
          shoot.closeout.artifacts,
          [
            ...[0, 1, 2, 3].map((i) => ({ path: named[i], pruned: said, prunedAt: files.at })),
            { path: named[4] },
            ...[5, 6, 7, 8].map((i) => ({ path: named[i], pruned: said, prunedAt: files.at })),
            { path: 'RESPONSE.md' },
            { path: '/etc/hosts' },
          ],
          'every file named in the directory went with it, one beneath it and one the route refuses by name included; beside the directory is not in it: the path alone',
        );
        assert.deepEqual(shoot.tries[0].closeout?.artifacts, shoot.closeout.artifacts);

        const base = '/api/runs/r-52/steps/shoot/artifacts';
        for (const name of ['shot.png', 'gone.png']) {
          const gone = await app.request(`${base}/${name}`);
          assert.equal(gone.status, 410, name);
          const body = (await gone.json()) as { error: string; pruned: string };
          assert.equal(
            body.error,
            `Step 'shoot' of run 'r-52' has no file '${name}': ${said}. Its record, its closeouts and its branches are kept; \`nemia decide r-52\` reads them.`,
          );
          assert.equal(body.pruned, files.at);
        }
        assert.equal(
          (await app.request(`${base}/sub%2Fdeep.png`)).status,
          400,
          'a name that is a path is refused, pruned or not: the prune answers only for a name the route would serve',
        );

        const decision = await app.request('/api/runs/r-52/decision');
        assert.equal(decision.status, 200, await decision.clone().text());
      } finally {
        fs.rmSync(marker, { force: true });
      }
      seedFiles();
      const missing = await app.request('/api/runs/r-52/steps/shoot/artifacts/gone.png');
      assert.equal(missing.status, 404, 'its files back, unpruned: a file the directory lacks is missing, a 404, and says so');
      assert.match(((await missing.json()) as { error: string }).error, /has no file 'gone\.png' in its files directory/);
      assert.ok(fs.existsSync(path.join(dir, 'shot.png')));
    },
  );
});

/** A task as the engine journals one: filed, a slot taken and spawned, and — given an end — ended and settled. */
const ranTask = (
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

test("where a run's time and tokens went, on its list line and its page, and the calls its attempts were denied", async (t) => {
  const s = story(t);
  await s.test(
    "the detail carries where each step's time went — per try and per check, filed off the engine's feed — and the run's, in the package's words",
    async (t) => {
      const T = (m: number, s = 0) => new Date(Date.UTC(2026, 8, 13, 9, m, s)).toISOString();
      const feed = path.join(root, 'engine', 'feed.jsonl');
      const fileOnFeed = (taskId: string, at: string) =>
        fs.appendFileSync(
          feed,
          `${JSON.stringify({ taskId, event: { kind: 'filed', at, brief: filedBrief(taskId), cwd: '/code/app', harness: 'codex' } })}\n`,
        );

      ranTask('r-60-implement', 'codex', T(0), T(0, 12), {
        at: T(19, 54),
        outcome: 'succeeded',
        more: { closeout: done, usage: { responses: 54, toolCalls: 146 } },
      });
      ranTask('r-60-implement-check', 'check', T(19, 56), T(19, 57), { at: T(20, 55), outcome: 'failed', more: { exitCode: 1 } });
      ranTask('r-60-implement-try2', 'codex', T(21), T(21, 3), { at: T(26, 38), outcome: 'succeeded', more: { closeout: done } });
      ranTask('r-60-implement-try2-check', 'check', T(26, 40), T(26, 41));
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
        /** implement's check refused try 1, and try 2's check is still running. The feed has each filing; a task's view has none. */
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
      assert.equal(
        observations(),
        0,
        'the feed is a read of the store: the detail observes no harness for it, and none for tasks all settled',
      );
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
      assert.deepEqual(
        implement.timeline[0].used,
        {
          usage: { responses: 54, toolCalls: 146 },
          used: '54 responses · 146 tool calls · tokens in not measured · tokens out not measured',
          cost: 'not measured',
          costUsd: null,
          apiMs: null,
          toolMs: null,
          read: null,
          peak: null,
          rebuilt: 0,
        },
        "what each session used, in nemia decide's words, as the step's used is",
      );
      assert.deepEqual(review.timeline, [], 'a step not filed has no try on the clock');
      assert.deepEqual(
        [run.timeline.run.tasks, run.timeline.run.inFlight, run.timeline.run.queued, run.timeline.run.ran, run.timeline.run.wall],
        [4, 1, '17s', '26m15s, 1 still running', 'still going'],
      );

      const e = engine();
      const views = new Map((await Effect.runPromise(e.list())).views.map((view) => [view.id, view]));
      const { filed } = await runWith(e, filingsRead());
      const theirs = timeline(runStore.runs.read('r-60'), views, filed);
      const lessCost = ({ cost, ...total }: { cost: unknown }) => (assert.equal(cost, null, 'nobody priced these sessions'), total);
      assert.deepEqual(
        { rounds: run.timeline.rounds.map(lessCost), run: lessCost(run.timeline.run) },
        JSON.parse(JSON.stringify({ rounds: theirs.rounds, run: theirs.run })),
        "the package's timeline over the engine's own views and the feed's filings, word for word, less the cost the totals carry beside it",
      );
      const lessUsed = (tries: ReadonlyArray<{ used?: unknown }>) => JSON.parse(JSON.stringify(tries.map(({ used: _, ...x }) => x)));
      assert.deepEqual(
        lessUsed(implement.timeline),
        lessUsed(theirs.steps.implement),
        'each try as the package has it, less used, which the api words as nemia decide does',
      );

      ranTask('r-60-implement-try3', 'codex', T(40), T(40, 7));
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
      assert.deepEqual(
        words(again.steps[0].timeline[2].session),
        {
          at: 'running',
          filedAt: T(40),
          spawnedAt: T(40, 7),
          endedAt: null,
          queued: '7s',
          ran: 'still running, no end yet',
        },
        'a try filed later is read on from where the last read of the feed stopped: its filing is known on the next poll, not "not known"',
      );
    },
  );
  await s.test(
    "a run's list line and its page say what it took — its time at work and its sessions' tokens — as the package has them off the same views",
    async () => {
      const T = (m: number) => new Date(Date.UTC(2026, 8, 14, 9, m)).toISOString();
      const used = (input: number, read: number, write: number, output: number) => ({
        inputTokens: input,
        cacheReadTokens: read,
        cacheWriteTokens: write,
        uncachedTokens: input - read - write,
        outputTokens: output,
      });
      ranTask('r-61-plan', 'codex', T(0), T(0), {
        at: T(20),
        outcome: 'succeeded',
        more: { closeout: done, usage: used(1_000_000, 900_000, 80_000, 10_000) },
      });
      ranTask('r-61-plan-check', 'check', T(20), T(20), { at: T(22), outcome: 'succeeded', more: { exitCode: 0 } });
      ranTask('r-61-build', 'codex', T(90), T(90), {
        at: T(100),
        outcome: 'succeeded',
        more: { closeout: done, usage: used(2_000_000, 1_800_000, 150_000, 30_000) },
      });
      writeRun({
        ...r2,
        id: 'r-61',
        workflowDir: gone,
        workflow: [
          { name: 'plan', after: [], body: 'Plan it.', check: 'npm test' },
          { name: 'build', after: ['plan'], body: 'Build it.' },
        ],
        steps: { plan: { taskId: 'r-61-plan', check: { taskId: 'r-61-plan-check' } }, build: { taskId: 'r-61-build' } },
      });

      const summary = await listed('r-61');
      const run = await detailOf('r-61');
      assert.deepEqual(
        [summary.atWork, run.atWork],
        [
          { ms: 32 * 60_000, since: null, endedAt: T(100) },
          { ms: 32 * 60_000, since: null, endedAt: T(100) },
        ],
        'the session, its check, and the next step an hour later: 32 minutes at work, the wait between counted for nothing',
      );
      assert.equal(summary.tokens?.said, '3.04M tokens');
      assert.deepEqual(run.tokens, summary.tokens, "the run's page carries the same total, with its split");
      assert.equal(run.tokens?.split, '2.7M read from the cache · 230k written to it · 70k uncached · 40k out');

      const views = new Map((await Effect.runPromise(engine().list())).views.map((view) => [view.id, view]));
      const record = runStore.runs.read('r-61');
      assert.deepEqual(
        { atWork: summary.atWork, tokens: summary.tokens },
        JSON.parse(JSON.stringify({ atWork: atWork(record, views), tokens: runTokens(record, views) })),
        "the package's figures over the engine's own views, word for word",
      );
    },
  );
  await s.test(
    "a step whose attempts were denied calls says which, on the list and on the run's page, beside a status that is unchanged",
    async () => {
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
      const denied = {
        words: 'denied: Skill(look), Bash(pytest), Edit(/tmp/a b)',
        calls: ['Skill(look)', 'Bash(pytest)', 'Edit(/tmp/a\nb)'],
      };

      const [implement, review] = (await listed('r-denied')).steps;
      assert.deepEqual(
        [implement.status, implement.denied],
        ['unverified · done', denied],
        'two attempts denied look and pytest, then look again and a path with a newline in it: each call once, and the status the chip reads as it was',
      );
      assert.equal(implement.note, null, 'nor in the note: the board says it once, from its own field');
      assert.equal(review.denied, null, 'a step denied nothing: null, not an empty list');
      const page = (await detailOf('r-denied')).steps;
      assert.deepEqual([page[0].status, page[0].denied, page[1].denied], ['unverified · done', denied, null]);
    },
  );
});
