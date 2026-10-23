/**
 * The store's pause on the api, as `nemia pause` and `nemia resume` put and lift it, through their entries of the package's command table:
 * `POST /api/pause` pauses the store, `GET /api/pause` reads it back with what finishes and the landings it holds staged, a second
 * pause is the package's 409, `DELETE /api/pause` lifts it, and a second lift is its 404; the cordon's former route is gone; a body
 * that is not a pause, and words `nemia pause` refuses, are refused before the store is written; and a page on another site is refused by
 * the guard. `GET /api/pause/now` says what a pause at once would stop, and `POST /api/pause` with `now` stops it, keeping a pause that
 * stands.
 *
 * At shipped defaults: the api's own engine over the harness's scratch store (`root`); the pause at once, an engine of the test's own
 * over one run it seeds and removes.
 */
import { root } from './harness.ts';
import { test } from 'node:test';
import { story } from './checkpoints.ts';
import { names } from './named.ts';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { Effect, Layer } from 'effect';
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

/** That `answer` is a refusal of `status` and nothing else, naming each of `facts`. */
function refused(answer: { status: number; body: Record<string, unknown> }, status: number, ...facts: string[]): void {
  assert.equal(answer.status, status, JSON.stringify(answer.body));
  assert.deepEqual(Object.keys(answer.body), ['error'], 'the refusal and nothing else');
  names(answer.body.error, ...facts);
}

test('POST /api/pause refuses, before the store is written: a body that is not a pause, words nemia pause refuses, a page on another site, the cordon gone', async (t) => {
  const shape = '`{ "why"?: "<words>", "by"?: "<name>", "now"?: true }`';
  const ROWS: { name: string; ask: () => Promise<{ status: number; body: Record<string, unknown> }>; status: number; facts: string[] }[] = [
    { name: 'a body that is not JSON: 400, with the shape', ask: () => asked('POST', 'not json'), status: 400, facts: [shape] },
    {
      name: 'a `why` that is no text: 400, naming it and its value',
      ask: () => asked('POST', { why: 7 }),
      status: 400,
      facts: ['`why`', 'nemia pause --why', '7', shape],
    },
    { name: "a `by` of blanks: the package's 422, naming --by", ask: () => asked('POST', { by: ' ' }), status: 422, facts: ['--by'] },
    {
      name: 'a `now` that is not true: 400, naming it and its value',
      ask: () => asked('POST', { now: 'yes' }),
      status: 400,
      facts: ['`now`', 'nemia pause --now --yes', '"yes"', shape],
    },
    {
      name: 'a pause asked by a page on another site: 403',
      ask: () => asked('POST', {}, { ...BOARD, 'sec-fetch-site': 'cross-site' }),
      status: 403,
      facts: ['another site'],
    },
    {
      name: 'a lift asked by a page on another site: 403',
      ask: () => asked('DELETE', undefined, { ...BOARD, 'sec-fetch-site': 'cross-site' }),
      status: 403,
      facts: [],
    },
  ];
  for (const row of ROWS)
    await t.test(row.name, async () => {
      const answer = await row.ask();
      if (row.facts.length) refused(answer, row.status, ...row.facts);
      else assert.equal(answer.status, row.status);
      assert.equal(fs.existsSync(FILE), false, 'nothing paused the store');
    });
  await t.test('the cordon routes are gone: /api/cordon answers 404 to every verb and pauses nothing', async () => {
    for (const method of ['GET', 'POST', 'DELETE']) {
      const res = await app.request('/api/cordon', { method, headers: BOARD, ...(method === 'POST' ? { body: '{}' } : {}) });
      assert.equal(res.status, 404, method);
    }
    assert.equal(fs.existsSync(FILE), false, 'nothing paused the store');
  });
});

/** An app over an engine whose task `working` is at work, recording each stop it is asked. */
function appAtWork(working: string) {
  const stops: string[] = [];
  const own = {
    ...engine(),
    list: (ids: string[]) =>
      Effect.succeed({
        views: ids
          .filter((id) => id === working)
          .map((id) => ({ id, phase: 'running (working)', state: { brief: 'b', settled: null, attempts: [{ startedAt: 'x' }] } })),
      }),
    stop: (taskId: string) =>
      Effect.sync(() => {
        stops.push(taskId);
      }),
  } as never;
  return { on: appOf(Layer.merge(liveOf(), Layer.succeed(Engine)(own))).app, stops };
}

test('the board pauses the store and lifts it, refused a second of each; then reads what a pause at once would stop, pauses at once, and keeps the pause that stands', async (t) => {
  const s = story(t);
  await s.test(
    'the board pauses the store, reads the pause back, is refused a second, lifts it, and is refused a second lift',
    async () => {
      assert.deepEqual(await asked('GET'), { status: 200, body: { pause: null, finishing: [], staged: [], held: [] } });
      const put = await asked('POST', { why: 'merging by hand', by: 'ann' });
      assert.equal(put.status, 200);
      const pause = put.body.pause as { at: string; by: string; why: string };
      assert.deepEqual({ ...pause, at: typeof pause.at }, { at: 'string', by: 'ann', why: 'merging by hand' });
      assert.deepEqual(JSON.parse(fs.readFileSync(FILE, 'utf8')), pause, "the store's pause file holds it");
      assert.deepEqual(await asked('GET'), { status: 200, body: { pause, finishing: [], staged: [], held: [] } });
      refused(await asked('POST', {}), 409, 'ann', pause.at, 'nemia resume', 'nemia pause --now');
      assert.deepEqual(await asked('DELETE'), { status: 200, body: { pause } });
      assert.equal(fs.existsSync(FILE), false, 'the file removed');
      assert.deepEqual(await asked('GET'), { status: 200, body: { pause: null, finishing: [], staged: [], held: [] } });
      refused(await asked('DELETE'), 404, 'nemia pause');
    },
  );
  await s.test(
    'the board reads what a pause at once would stop, pauses at once, and a second keeps the pause that stands as it was',
    async () => {
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
    },
  );
});
