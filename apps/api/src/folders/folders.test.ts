/**
 * The folders routes, on the stand-ins (the runtime's test engine, the test place), with `WF_FOLDER_ROOTS` a scratch root: the person's
 * listing names the folders planted there, a path outside the roots is refused 422, a folder is made a repository, and an agent's session
 * token is refused 403 `person-only` on all three routes. Statuses and fields are asserted, never a sentence.
 */
import '../../test/harness.ts';
import { test } from 'vitest';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { Effect, Layer } from 'effect';
import { testEngine } from 'agent-runtime/testing';
import { testPlace } from 'agent-orchestrator/testing';
import { TokenDoor, tokenDoorAt } from 'agent-orchestrator';
import type { FolderNames, RepositoryMade } from 'objects';
import { scratch } from 'test-kit/scratch';
import { appOf, liveOf } from '../app.ts';
import { Engine } from '../store.ts';
import { eachTest, engineFor } from '../../test/placed.ts';
import { root } from '../../test/harness.ts';

const stand = eachTest(testPlace);
const engine = eachTest(testEngine);
/** The roots the listing reads: one scratch folder, holding the folders `alpha` and `beta` and a file. */
const ROOTS = eachTest(() => {
  const at = fs.realpathSync(scratch('nemia-api-folders-'));
  fs.mkdirSync(path.join(at, 'alpha'));
  fs.mkdirSync(path.join(at, 'beta'));
  fs.writeFileSync(path.join(at, 'file.txt'), 'a file\n');
  return at;
});
const app = eachTest(
  () => appOf(Layer.mergeAll(liveOf({ ...process.env, WF_FOLDER_ROOTS: ROOTS() }), Engine.over(engine().layer), stand().layer)).app,
);

/** A request of `method` to `url`, as the board sends one: JSON, from its own page. */
const send = (method: 'GET' | 'POST', url: string, body?: unknown, bearer?: string) =>
  app().request(url, {
    method,
    headers: {
      'content-type': 'application/json',
      'sec-fetch-site': 'same-origin',
      ...(bearer === undefined ? {} : { authorization: `Bearer ${bearer}` }),
    },
    ...(method === 'POST' ? { body: JSON.stringify(body ?? {}) } : {}),
  });

test("GET /api/folders names the person's folders under the root, never a file", async () => {
  const res = await send('GET', `/api/folders?path=${encodeURIComponent(`${ROOTS()}/`)}`);
  assert.equal(res.status, 200, await res.clone().text());
  const read = (await res.json()) as FolderNames;
  assert.deepEqual([read.path, read.names, read.more], [ROOTS(), ['alpha', 'beta'], false]);
});

test('REFUSED: a path outside the roots is a 422', async () => {
  const elsewhere = scratch('nemia-api-folders-elsewhere-');
  assert.equal((await send('GET', `/api/folders?path=${encodeURIComponent(`${elsewhere}/`)}`)).status, 422);
});

test('POST /api/folders/repository makes a folder under the root a repository', async () => {
  const res = await send('POST', '/api/folders/repository', { path: path.join(ROOTS(), 'alpha') });
  assert.equal(res.status, 200, await res.clone().text());
  assert.deepEqual((await res.json()) as RepositoryMade, { path: path.join(ROOTS(), 'alpha'), made: true });
});

test("REFUSED: a session's token is refused 403 person-only on all three routes, and nothing is made", async () => {
  const task = 't-folders-session';
  const token = Effect.runSync(
    Effect.gen(function* () {
      return yield* (yield* TokenDoor).tokens.mint({ agent: 'nemia', factory: null, run: null, step: null, attempt: 1, task });
    }).pipe(Effect.provide(tokenDoorAt(root))),
  );
  Effect.runSync(engineFor(engine()).file({ id: task, brief: 'Be on.', cwd: root, harness: 'claude' }));
  engine().settle(task, 'working');
  const refused = [
    await send('GET', `/api/folders?path=${encodeURIComponent(`${ROOTS()}/`)}`, undefined, token),
    await send('POST', '/api/folders/repository', { path: path.join(ROOTS(), 'beta') }, token),
    await send('POST', '/api/repositories', { name: 'acme' }, token),
  ];
  assert.deepEqual(
    refused.map((r) => r.status),
    [403, 403, 403],
  );
  const reasons = await Promise.all(refused.map(async (r) => ((await r.json()) as { reason?: string }).reason));
  assert.deepEqual(reasons, ['person-only', 'person-only', 'person-only']);
  assert.equal(fs.existsSync(path.join(root, 'repositories', 'acme')), false, 'no repository made');
});
