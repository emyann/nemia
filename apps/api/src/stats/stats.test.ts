/**
 * `GET /api/stats`: the flow numbers of every run in the store, whatever factory and repository the request is answered in, as the
 * package's `statsRun` answers them; kept to one factory or one repository by `ofFactory` and `ofRepo`, and refused with a 422 for a query
 * the package refuses.
 *
 * At shipped defaults: the api's own engine over a store this file seeds, the harness's fake `claude` (test/harness.ts) first on PATH.
 */
import { root } from '../../test/harness.ts';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Effect } from 'effect';
import fs from 'node:fs';
import path from 'node:path';
import { runShipped as runWith, statsRun as flowNumbers } from 'agent-orchestrator';
import type { Stats } from './stats.ts';
import { app, runtime } from '../app.ts';
import { Engine } from '../store.ts';
import { ReadMemo } from '../layer.ts';

const e = await runtime.runPromise(Engine.useSync((engine) => engine));

/** A file written whole, by a rename over it: as a hand edit of a journal must be, since the engine reads one only past what it kept. */
const write = (file: string, text: string) => {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(`${file}.new`, text);
  fs.renameSync(`${file}.new`, file);
};

/**
 * The journals `f` asks the engine for: a task it views, and each task a list answers, read or unreadable. What a request costs whether
 * or not the engine's reader reads their bytes again: it reads a journal only for what was appended since it last read it.
 */
async function journalsAsked<T>(f: () => Promise<T>): Promise<{ value: T; asked: number }> {
  const { view, list } = e;
  let asked = 0;
  Object.assign(e, {
    view: (taskId: string) => {
      asked++;
      return view(taskId);
    },
    list: (...args: unknown[]) =>
      Effect.map(Reflect.apply(list, e, args) as ReturnType<typeof list>, (listed) => {
        asked += listed.views.length + listed.unreadable.length;
        return listed;
      }),
  });
  try {
    return { value: await f(), asked };
  } finally {
    Object.assign(e, { view, list });
  }
}

const at = '2026-09-28T09:00:00.000Z';
const ended = '2026-09-28T10:00:00.000Z';
const jsonl = (lines: object[]) => lines.map((line) => `${JSON.stringify(line)}\n`).join('');

/** A task that ran an hour, signed off and was measured at `costUsd`, its end saying the skills its session loaded where given. */
const signedOff = (taskId: string, costUsd: number, skills?: string[]) =>
  write(
    path.join(root, 'engine', 'tasks', `${taskId}.jsonl`),
    jsonl([
      { kind: 'filed', at, brief: 'Do it.', cwd: root, maxAttempts: 1, harness: 'codex' },
      { kind: 'starting', at, attempt: 1 },
      { kind: 'spawned', at, attempt: 1 },
      {
        kind: 'ended',
        at: ended,
        attempt: 1,
        sessionId: `ae/${taskId}/1`,
        observed: 'done',
        reason: 'harness',
        closeout: { outcome: 'done', summary: 'Did it.', needs: null, artifacts: [] },
        ...(skills ? { skills } : {}),
      },
      { kind: 'measured', at: ended, attempt: 1, usage: { costUsd } },
      { kind: 'settled', at: ended, outcome: 'succeeded' },
    ]),
  );

/** A finished run of one step on `repo`, in `factory` when one is named, its session's end saying the skills it loaded where given. */
function finished(id: string, repo: string, costUsd: number, factory?: string, skills?: string[]) {
  signedOff(`${id}-implement`, costUsd, skills);
  write(
    path.join(root, 'runs', `${id}.json`),
    JSON.stringify({
      id,
      repo,
      baseRef: 'abc',
      workspace: repo,
      branch: 'main',
      isolate: true,
      brief: `The brief of ${id}`,
      createdAt: at,
      workflowDir: path.join(repo, 'workflows', 'build'),
      workflow: [{ name: 'implement', after: [], body: 'Implement it.', harness: 'codex' }],
      steps: { implement: { taskId: `${id}-implement` } },
      ...(factory ? { factory } : {}),
    }),
  );
}

finished('r-home', '/repos/home', 1);
finished('r-away', '/repos/away', 2, 'other', ['look', 'look']);

/** A run of the review workflow on `/repos/home`, created at `createdAt`, its skill rendered as `text`: nothing of it ran. */
function reviewed(id: string, createdAt: string, text: string) {
  write(
    path.join(root, 'runs', `${id}.json`),
    JSON.stringify({
      id,
      repo: '/repos/home',
      baseRef: 'abc',
      workspace: '/repos/home',
      branch: 'main',
      isolate: true,
      brief: `The brief of ${id}`,
      createdAt,
      workflowDir: '/repos/home/workflows/review',
      workflow: [
        {
          name: 'review',
          after: [],
          body: 'You are Agora.\n\nReview it.',
          agent: { name: 'agora', keys: [], body: 'Review it.', given: {}, instructions: 'You are Agora.', skills: ['review-a-change'] },
        },
      ],
      steps: {},
    }),
  );
  write(
    path.join(root, 'runs', id, 'agents', 'review', 'nemia-agora', 'skills', 'review-a-change', 'SKILL.md'),
    `---\nname: review-a-change\ndescription: Review a change.\n---\n${text}\n`,
  );
}

reviewed('m-1', '2026-09-26T09:00:00.000Z', 'Read the diff.');
reviewed('m-2', '2026-09-27T09:00:00.000Z', 'Read the diff, then run the suite.');

const TALLY_DAY = '2026-09-24';

/** A run of a step that tallies its issues, in the factory `tallies`, its session signing `issues` on `TALLY_DAY`, or none. */
function tallied(id: string, issues?: object[]) {
  const day = (hour: number) => `${TALLY_DAY}T${String(hour).padStart(2, '0')}:00:00.000Z`;
  write(
    path.join(root, 'engine', 'tasks', `${id}-triage.jsonl`),
    jsonl([
      { kind: 'filed', at: day(10), brief: 'Sort them.', cwd: root, maxAttempts: 1, harness: 'codex' },
      { kind: 'starting', at: day(10), attempt: 1 },
      { kind: 'spawned', at: day(10), attempt: 1 },
      {
        kind: 'ended',
        at: day(11),
        attempt: 1,
        sessionId: `ae/${id}-triage/1`,
        observed: 'done',
        reason: 'harness',
        closeout: { outcome: 'done', summary: 'Sorted.', needs: null, artifacts: [], ...(issues ? { issues } : {}) },
      },
      { kind: 'settled', at: day(11), outcome: 'succeeded' },
    ]),
  );
  write(
    path.join(root, 'runs', `${id}.json`),
    JSON.stringify({
      id,
      repo: '/repos/triage',
      baseRef: 'abc',
      workspace: '/repos/triage',
      branch: 'main',
      isolate: true,
      brief: `The brief of ${id}`,
      createdAt: day(9),
      workflowDir: '/repos/triage/workflows/triage',
      workflow: [{ name: 'triage', after: [], body: 'Sort them.', harness: 'codex', tally: ['issues', 'issues.open'] }],
      steps: { triage: { taskId: `${id}-triage` } },
      factory: 'tallies',
    }),
  );
}

tallied('t-signed', [{ open: true }, { open: false }, { open: true }]);
tallied('t-unsigned');

const asked = async (query: string) => {
  const res = await app.request(`/api/stats${query}`);
  return { status: res.status, body: (await res.json()) as Stats & { error?: string } };
};

test('GET /api/stats counts every run in the store, of every factory and repository, as the package counts them', async () => {
  const { status, body } = await asked('?from=2026-09-28&to=2026-09-28&by=factory');
  assert.equal(status, 200, body.error);
  assert.deepEqual(
    body.groups.map((g) => [g.key, g.total.tries, g.steps[0]?.costUsd]),
    [
      ['default', 1, 1],
      ['other', 1, 2],
      ['tallies', 0, undefined],
    ],
    'a run of another factory, on a repository the api does not serve, is counted; one with no try that day is a group of none',
  );
  assert.deepEqual(body, await runWith(e, flowNumbers({ from: '2026-09-28', to: '2026-09-28', by: 'factory' })));
});

test('GET /api/stats answers the calls refused per try as null, never 0, where every try ran on a harness that records none', async () => {
  const { body } = await asked('?from=2026-09-28&to=2026-09-28');
  assert.equal(body.all.total.tries, 2, 'two tries ended, each on codex');
  assert.equal(body.all.total.deniedPerTry, null);
  assert.equal(body.all.days[0].deniedPerTry, null);
  assert.deepEqual([body.all.steps[0].deniedCalls, body.all.steps[0].deniedTries, body.all.steps[0].denials], [null, 0, []]);
});

test('GET /api/stats answers the skills loaded per try as null, never 0, where no end says them, and counts each where one does', async () => {
  const { body } = await asked('?from=2026-09-28&to=2026-09-28&ofFactory=default');
  assert.equal(body.all.total.tries, 1);
  assert.equal(body.all.total.skillsPerTry, null);
  assert.equal(body.all.days[0].skillsPerTry, null);
  assert.deepEqual([body.all.steps[0].skillLoads, body.all.steps[0].skillTries, body.all.steps[0].skills], [null, 0, []]);
  const other = await asked('?from=2026-09-28&to=2026-09-28&ofFactory=other');
  assert.equal(other.body.all.total.skillsPerTry, 2);
  const { skillLoads, skillTries, skills } = other.body.all.steps[0];
  assert.deepEqual(
    { skillLoads, skillTries, skills },
    { skillLoads: 2, skillTries: 1, skills: [{ skill: 'look', count: 2, tries: 1, touched: null, loadedWhenTouched: null }] },
  );
});

test('GET /api/stats keeps one factory with ofFactory and one repository with ofRepo, compared as strings', async () => {
  const other = await asked('?ofFactory=other');
  assert.deepEqual([other.body.all.total.tries, other.body.filters], [1, { factory: 'other' }]);
  const home = await asked(`?ofRepo=${encodeURIComponent('/repos/home')}`);
  assert.deepEqual([home.body.all.total.tries, home.body.filters], [1, { repo: '/repos/home' }]);
  const none = await asked(`?ofRepo=${encodeURIComponent('/repos/home/')}`);
  assert.equal(none.body.all.total.tries, 0, 'a path is not resolved: /repos/home/ is not /repos/home');
});

test('GET /api/stats refuses a key to go by it does not know, and a day that is not one, with a 422 naming what it takes', async () => {
  const colour = await asked('?by=colour');
  assert.deepEqual([colour.status, colour.body.error], [422, '?by= takes one of agent, step, factory, workflow, repo, not "colour".']);
  const day = await asked('?from=2026-13-40');
  assert.equal(day.status, 422);
  assert.match(day.body.error ?? '', /^\?from= takes a day as YYYY-MM-DD, in UTC/);
});

test('GET /api/stats answers the change marks as the package does: a rendered skill that differs from the run before', async () => {
  const { status, body } = await asked('?workflow=review');
  assert.equal(status, 200, body.error);
  assert.deepEqual(
    body.all.marks.map((m) => [m.day, m.run, m.kind, m.name, m.since]),
    [['2026-09-27', 'm-2', 'skill', 'review-a-change', 'm-1']],
  );
  assert.deepEqual(body, await runWith(e, flowNumbers({ workflow: 'review' })));
});

test('GET /api/stats answers each tally a step froze, per day and over the range, as null — never 0 — where no closeout measured it', async () => {
  const { status, body } = await asked(`?ofFactory=tallies&from=2026-09-23&to=${TALLY_DAY}`);
  assert.equal(status, 200, body.error);
  assert.deepEqual(body.all.tallies, [
    {
      step: 'triage',
      tally: 'issues',
      total: { sum: 3, tries: 1 },
      days: [
        { day: '2026-09-23', sum: null, tries: 0 },
        { day: TALLY_DAY, sum: 3, tries: 1 },
      ],
    },
    {
      step: 'triage',
      tally: 'issues.open',
      total: { sum: 2, tries: 1 },
      days: [
        { day: '2026-09-23', sum: null, tries: 0 },
        { day: TALLY_DAY, sum: 2, tries: 1 },
      ],
    },
  ]);
  assert.equal(body.all.total.tries, 2, 'the run whose closeout signed no issues is a try, and measured no tally');
  const none = await asked('?ofFactory=other');
  assert.deepEqual(none.body.all.tallies, [], 'a step that declares no tally has no row');
});

/** With the memo's check off: what the memo alone answers, and reads. */
async function unverified<T>(f: () => Promise<T>): Promise<T> {
  process.env.WF_VERIFY_REST = '0';
  try {
    return await f();
  } finally {
    process.env.WF_VERIFY_REST = '1';
  }
}

test("GET /api/stats reads no run's journal again while the store is as it was, and reads again only the run whose record changed", async () => {
  const first = await asked('');
  const again = await journalsAsked(() => unverified(() => asked('')));
  assert.equal(again.asked, 0, "the app's memo answered every run");
  assert.deepEqual(again.value, first);
  const record = path.join(root, 'runs', 'r-home.json');
  write(record, JSON.stringify({ ...JSON.parse(fs.readFileSync(record, 'utf8')), brief: 'The brief of r-home, said again' }));
  const after = await journalsAsked(() => unverified(() => asked('')));
  assert.equal(after.asked, 1, "r-home's one journal, and no other run's");
  assert.deepEqual(after.value.body, await runWith(e, flowNumbers({})));
});

test("REFUSED at shipped defaults: under WF_VERIFY_REST=1, GET /api/stats refuses an answer of the app's memo unlike a read afresh, naming the run", async () => {
  await asked('');
  const { stats: memo } = await runtime.runPromise(ReadMemo.useSync((kept) => kept));
  const kept = memo.runs.get('r-home')?.read;
  assert.ok(kept, "r-home is in the app's memo");
  kept.facts.tries = [];
  kept.facts.runs = [];
  assert.equal((await unverified(() => asked(''))).status, 200, 'unverified, the memo answers as it stands');
  const { status, body } = await asked('');
  assert.equal(status, 500);
  assert.equal(body.error, "the stats' memo answered the run r-home unlike a read of it afresh: an input of its facts is not in its stamp");
  memo.runs.clear();
});
