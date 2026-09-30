/**
 * `GET /api/stats`: the flow numbers of every run in the store, whatever factory and repository the request is answered in, as the
 * package's `stats` answers them; kept to one factory or one repository by `ofFactory` and `ofRepo`, and refused with a 422 for a query
 * the package refuses.
 *
 * At shipped defaults: the api's own engine over a store this file seeds, the harness's fake `claude` (test/harness.ts) first on PATH.
 */
import { root } from '../../test/harness.ts';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { stats as flowNumbers } from 'agent-orchestrator';
import type { Stats } from './stats.ts';
import { app, runtime } from '../app.ts';
import { Engine } from '../store.ts';

const e = await runtime.runPromise(Engine.useSync((engine) => engine));

const write = (file: string, text: string) => {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, text);
};

const at = '2026-09-28T09:00:00.000Z';
const ended = '2026-09-28T10:00:00.000Z';
const jsonl = (lines: object[]) => lines.map((line) => `${JSON.stringify(line)}\n`).join('');

/** A task that ran an hour, signed off and was measured at `costUsd`. */
const signedOff = (taskId: string, costUsd: number) =>
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
      },
      { kind: 'measured', at: ended, attempt: 1, usage: { costUsd } },
      { kind: 'settled', at: ended, outcome: 'succeeded' },
    ]),
  );

/** A finished run of one step on `repo`, in `factory` when one is named. */
function finished(id: string, repo: string, costUsd: number, factory?: string) {
  signedOff(`${id}-implement`, costUsd);
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
finished('r-away', '/repos/away', 2, 'other');

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
    ],
    'a run of another factory, on a repository the api does not serve, is counted',
  );
  assert.deepEqual(body, await flowNumbers(e, { from: '2026-09-28', to: '2026-09-28', by: 'factory' }));
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
  assert.deepEqual(body, await flowNumbers(e, { workflow: 'review' }));
});
