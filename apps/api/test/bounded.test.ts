/**
 * No read of the `Api` answers past the app's bound: every GET endpoint, derived from the `Api` as `served.test.ts` derives them, is
 * asked of an app whose bound is one character (`AnswerBound`), over a store that holds a run with a settled try, a factory and a card,
 * its path's names filled with theirs. Each answer is refused — a 422 with an `error` naming how to narrow it (`readHandled`,
 * src/objects/answer-bound.ts), or another refusal where the read finds nothing — and none answers 200: so a group built without
 * `readsBounded`, whose GET handlers are not given through `readHandled`, is named here. A read of bytes or a stream (`READS`' `bytes`,
 * `stream`) is sent as it is read, never built as one answer, and is left out. And a step's counts (`tail`, `bodyFrom`, `bodyLimit`)
 * are whole numbers, refused 422 otherwise, a count past its most answered.
 */
import { root } from './harness.ts';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { Effect, Layer } from 'effect';
import { testEngine } from 'agent-runtime/testing';
import { testPlace } from 'agent-orchestrator/testing';
import { addFactory } from 'agent-orchestrator/testing';
import { Api, type ApiGetName, READS } from 'objects';
import { AnswerBound } from '../src/layer.ts';
import { appOver, beforeEachTest, eachTest, engineFor } from './placed.ts';

const stand = eachTest(testPlace);
const standIn = eachTest(testEngine);
const app = eachTest(() => appOver(standIn(), stand(), Layer.succeed(AnswerBound)(1)));

const RUN = 'r-bound';
fs.mkdirSync(path.join(root, 'runs'), { recursive: true });
fs.writeFileSync(
  path.join(root, 'runs', `${RUN}.json`),
  JSON.stringify({
    id: RUN,
    repo: '/code/app',
    workspace: '/code/app',
    baseRef: 'abc123',
    branch: 'main',
    isolate: true,
    brief: 'Bound it',
    workflowDir: path.join(root, 'no-such-workflow'),
    createdAt: '2026-11-02T06:00:00.000Z',
    workflow: [{ name: 'implement', after: [], body: 'Implement it.', harness: 'claude' }],
    steps: { implement: { taskId: `t-${RUN}` } },
  }),
);
beforeEachTest(() => {
  Effect.runSync(engineFor(standIn()).file({ id: `t-${RUN}`, brief: 'Do it.', cwd: '/code/app', harness: 'claude' }));
  standIn().settle(`t-${RUN}`, 'succeeded', {
    exitCode: 0,
    closeout: { outcome: 'done', summary: 'Built it.', needs: null, artifacts: [] },
  });
});
addFactory({ name: 'bf', repos: [root] });
fs.mkdirSync(path.join(root, 'inbox'), { recursive: true });
fs.writeFileSync(path.join(root, 'inbox', 'c-bound.md'), 'Do it.\n');

/** The name each path segment is filled with: the planted object's, where one is, else one no object has. */
const NAMES: Readonly<Record<string, Readonly<Record<string, string>>>> = {
  runs: { name: RUN },
  steps: { file: 'nothing-here' },
  cards: { name: 'c-bound' },
  factories: { name: 'bf' },
  templates: { name: 'sdlc' },
};
const COMMON: Readonly<Record<string, string>> = { runId: RUN, step: 'implement', try: '1', namespace: 'default' };

/** `path` with each `:name` filled for the group `group`. */
const filled = (group: string, at: string): string =>
  at.replace(/:([A-Za-z]+)/g, (_, key: string) => NAMES[group]?.[key] ?? COMMON[key] ?? 'nothing-here');

/** The query an endpoint is asked with, where its default would hold the request open. */
const ASKED: Readonly<Record<string, string>> = { '/api/feed/wait': '?for=1ms' };

/** Every GET endpoint of the `Api` built as one answer: its `<group>.<endpoint>` name and its path. */
const READ_ENDPOINTS = Object.values(Api.groups).flatMap((group) =>
  Object.entries(group.endpoints)
    .filter(([, e]) => e.method === 'GET')
    .map(([name, e]) => ({ read: `${group.identifier}.${name}` as ApiGetName, group: group.identifier, path: e.path }))
    .filter(({ read }) => READS[read].shape !== 'bytes' && READS[read].shape !== 'stream'),
);

test('every read of the Api is refused past the app bound: a 422 saying how to narrow it, or another refusal; none answers 200', async () => {
  assert.ok(READ_ENDPOINTS.length >= 80, `${READ_ENDPOINTS.length} reads off the Api`);
  const answered: string[] = [];
  const refused: string[] = [];
  for (const { read, group, path: at } of READ_ENDPOINTS) {
    const url = `${filled(group, at)}${ASKED[at] ?? ''}`;
    const res = await app().request(url);
    const text = await res.text();
    if (res.status < 300) answered.push(`${read}: GET ${url} answered ${res.status}`);
    if (res.status === 422) {
      const body = JSON.parse(text) as { error?: unknown };
      assert.equal(typeof body.error, 'string', `${read} says why in \`error\``);
      refused.push(read);
    }
  }
  assert.deepEqual(answered, [], 'no read answers past the bound');
  const pages = READ_ENDPOINTS.filter(({ read }) => READS[read].shape === 'page' && !refused.includes(read)).map(({ read }) => read);
  assert.deepEqual(pages, [], 'every list, which answers whatever it holds, is refused 422 past the bound');
});

test('a read refused past the bound names the keys that narrow it', async () => {
  const res = await app().request('/api/runs');
  assert.equal(res.status, 422);
  const { error } = (await res.json()) as { error: string };
  for (const key of READS['runs.listAll'].narrow ?? []) assert.ok(error.includes(`\`${key}\``), `names \`${key}\``);
});

/** The same store, at the shipped bound. */
const shipped = eachTest(() => appOver(standIn(), stand()));

test("a step's counts are whole numbers: a tail, a body's page and its start that are none are 422; one past its most is answered", async () => {
  const at = `/api/runs/${RUN}/steps/implement`;
  for (const url of [
    `${at}/log?tail=0`,
    `${at}/log?tail=x`,
    `${at}/tries/1/closeout?bodyLimit=0`,
    `${at}/tries/1/closeout?bodyFrom=-1`,
    `${at}/tries/1?bodyFrom=1.5`,
    `${at}/tries?bodyLimit=x`,
  ]) {
    const res = await shipped().request(url);
    assert.equal(res.status, 422, url);
    assert.equal(typeof ((await res.json()) as { error?: unknown }).error, 'string', `${url} says why in \`error\``);
  }
  for (const url of [`${at}/log?tail=100000`, `${at}/tries/1/closeout?bodyLimit=100000000&bodyFrom=0`, `${at}/tries?fields=*`])
    assert.equal((await shipped().request(url)).status, 200, url);
});
