/**
 * The store's pause on the api, as `wf pause` and `wf resume` put and lift it, through their entries of the package's command table:
 * `POST /api/pause` pauses the store, `GET /api/pause` reads it back with what finishes and the landings it holds staged, a second
 * pause is the package's 409, `DELETE /api/pause` lifts it, and a second lift is its 404; the cordon's former route is gone; a body
 * that is not a pause, and words `wf pause` refuses, are refused before the store is written; and a page on another site is refused by
 * the guard. `GET /api/pause/now` says what a pause at once would stop, and `POST /api/pause` with `now` stops it, keeping a pause that
 * stands.
 *
 * At shipped defaults: the api's own engine over the harness's scratch store (`root`); the pause at once, an engine of the test's own
 * over one run it seeds and removes.
 */
import { root } from './harness.ts';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { Layer } from 'effect';
import { engine, runStore } from 'agent-orchestrator';
import { app, appOf, liveOf } from '../src/app.ts';
import { Engine } from '../src/store.ts';
import type { PauseNowRead } from '../src/factory/pause.ts';

const BOARD = { 'content-type': 'application/json', 'sec-fetch-site': 'same-origin' };

/** The api's answer to `method` on `/api/pause` with `body`, as the board sends it unless `headers` say otherwise. */
async function asked(method: string, body?: unknown, headers: Record<string, string> = BOARD, on: typeof app = app) {
  const res = await on.request('/api/pause', {
    method,
    headers,
    ...(body === undefined ? {} : { body: typeof body === 'string' ? body : JSON.stringify(body) }),
  });
  return { status: res.status, body: (await res.json()) as Record<string, unknown> };
}

const FILE = path.join(root, 'cordon');

test('the board pauses the store, reads the pause back, is refused a second, lifts it, and is refused a second lift', async () => {
  assert.deepEqual(await asked('GET'), { status: 200, body: { pause: null, finishing: [], staged: [] } });
  const put = await asked('POST', { why: 'merging by hand', by: 'ann' });
  assert.equal(put.status, 200);
  const pause = put.body.pause as { at: string; by: string; why: string };
  assert.deepEqual({ ...pause, at: typeof pause.at }, { at: 'string', by: 'ann', why: 'merging by hand' });
  assert.deepEqual(JSON.parse(fs.readFileSync(FILE, 'utf8')), pause, "the store's pause file holds it");
  assert.deepEqual(await asked('GET'), { status: 200, body: { pause, finishing: [], staged: [] } });
  assert.deepEqual(await asked('POST', {}), {
    status: 409,
    body: {
      error: `the store is already paused by ann since ${pause.at}: wf resume lifts it first, and wf pause --now stops what still finishes under it.`,
    },
  });
  assert.deepEqual(await asked('DELETE'), { status: 200, body: { pause } });
  assert.equal(fs.existsSync(FILE), false, 'the file removed');
  assert.deepEqual(await asked('GET'), { status: 200, body: { pause: null, finishing: [], staged: [] } });
  assert.deepEqual(await asked('DELETE'), {
    status: 404,
    body: { error: 'the store is not paused: there is nothing to resume (wf pause puts one).' },
  });
});

test('REFUSED: a body that is not a pause, words wf pause refuses, and a page on another site, before the store is written', async () => {
  const shape = '`{ "why"?: "<words>", "by"?: "<name>", "now"?: true }`';
  assert.deepEqual(await asked('POST', 'not json'), { status: 400, body: { error: `POST …/pause takes a JSON body: ${shape}.` } });
  assert.deepEqual(await asked('POST', { why: 7 }), {
    status: 400,
    body: {
      error: `\`why\` is why the store is paused, as \`wf pause --why "<words>"\` takes it: text, or left out. This request's was 7: ${shape}.`,
    },
  });
  assert.deepEqual(await asked('POST', { by: ' ' }), {
    status: 422,
    body: { error: '--by takes who pauses it, by a name, and was given only blanks: give it words, or leave --by out.' },
  });
  assert.deepEqual(await asked('POST', { now: 'yes' }), {
    status: 400,
    body: {
      error: `\`now\` stops what still finishes, as \`wf pause --now --yes\` does: true, or left out. This request's was "yes": ${shape}.`,
    },
  });
  const refused = await asked('POST', {}, { ...BOARD, 'sec-fetch-site': 'cross-site' });
  assert.equal(refused.status, 403);
  assert.match(String(refused.body.error), /refuses a request made by a page on another site/);
  assert.equal((await asked('DELETE', undefined, { ...BOARD, 'sec-fetch-site': 'cross-site' })).status, 403);
  assert.equal(fs.existsSync(FILE), false, 'nothing paused the store');
});

test('the cordon routes are gone: /api/cordon answers 404 and pauses nothing', async () => {
  for (const method of ['GET', 'POST', 'DELETE']) {
    const res = await app.request('/api/cordon', { method, headers: BOARD, ...(method === 'POST' ? { body: '{}' } : {}) });
    assert.equal(res.status, 404, method);
  }
  assert.equal(fs.existsSync(FILE), false, 'nothing paused the store');
});

/** An app over an engine whose task `working` is at work, recording each stop it is asked. */
function appAtWork(working: string) {
  const stops: string[] = [];
  const own = {
    ...engine(),
    list: async (ids: string[]) => ({
      views: ids
        .filter((id) => id === working)
        .map((id) => ({ id, phase: 'running (working)', state: { brief: 'b', settled: null, attempts: [{ startedAt: 'x' }] } })),
    }),
    stop: async (taskId: string) => {
      stops.push(taskId);
    },
  } as never;
  return { on: appOf(Layer.merge(liveOf(), Layer.succeed(Engine)(own))).app, stops };
}

test('the board reads what a pause at once would stop, pauses at once, and a second keeps the pause that stands as it was', async () => {
  const id = 'r-pause-now';
  fs.mkdirSync(path.join(root, 'runs'), { recursive: true });
  fs.writeFileSync(
    path.join(root, 'runs', `${id}.json`),
    JSON.stringify({
      id,
      workspace: root,
      brief: 'Pause me.',
      createdAt: '2026-10-04T12:00:00.000Z',
      workflowDir: path.join(root, 'no-such-workflow'),
      place: { kind: 'folder' },
      workflow: [{ name: 'implement', after: [], body: 'Implement it.' }],
      steps: { implement: { taskId: 't-now' } },
    }),
  );
  const { on, stops } = appAtWork('t-now');
  const read = await on.request('/api/pause/now');
  assert.equal(read.status, 200);
  const answer = (await read.json()) as PauseNowRead;
  assert.deepEqual(answer, {
    interrupts: [{ run: id, step: 'implement', kind: 'session', taskId: 't-now' }],
    cost: 'An interrupted step redoes its unfinished work and reads its context again.',
  });
  assert.deepEqual(stops, [], 'a read stops nothing');
  assert.equal(fs.existsSync(FILE), false, 'a read pauses nothing');
  const put = await asked('POST', { now: true, why: 'the bill', by: 'ann' }, BOARD, on);
  assert.equal(put.status, 200);
  const pause = put.body.pause as { at: string; by: string; why: string };
  assert.deepEqual(put.body, {
    pause,
    kept: false,
    interrupted: [{ run: id, step: 'implement', kind: 'session', taskId: 't-now' }],
    skipped: [],
  });
  assert.deepEqual({ by: pause.by, why: pause.why }, { by: 'ann', why: 'the bill' });
  assert.deepEqual(stops, ['t-now']);
  assert.deepEqual(
    runStore.asks.read(id).asks.map((a) => ({ mode: a.mode, interrupted: a.interrupted })),
    [{ mode: 'nudge', interrupted: 't-now' }],
  );
  assert.equal((await asked('POST', { why: 'again' }, BOARD, on)).status, 409, 'a plain pause on one that stands');
  const again = await asked('POST', { now: true, why: 'again' }, BOARD, on);
  assert.equal(again.status, 200);
  assert.deepEqual({ pause: again.body.pause, kept: again.body.kept }, { pause, kept: true }, 'the pause kept as it was put');
  assert.deepEqual(JSON.parse(fs.readFileSync(FILE, 'utf8')), pause);
  assert.deepEqual(await asked('DELETE', undefined, BOARD, on), { status: 200, body: { pause } });
  fs.rmSync(path.join(root, 'runs', `${id}.asks`), { recursive: true });
  fs.rmSync(path.join(root, 'runs', `${id}.json`));
});
