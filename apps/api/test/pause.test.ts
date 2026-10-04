/**
 * The store's pause on the api, as `wf pause` and `wf resume` put and lift it, through their entries of the package's command table:
 * `POST /api/pause` pauses the store, `GET /api/pause` reads it back with what finishes and the landings it holds staged, a second
 * pause is the package's 409, `DELETE /api/pause` lifts it, and a second lift is its 404; the cordon's former route is gone; a body
 * that is not a pause, and words `wf pause` refuses, are refused before the store is written; and a page on another site is refused by
 * the guard.
 *
 * At shipped defaults: the api's own engine over the harness's scratch store (`root`), which no run of this file seeds.
 */
import { root } from './harness.ts';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { app } from '../src/app.ts';

const BOARD = { 'content-type': 'application/json', 'sec-fetch-site': 'same-origin' };

/** The api's answer to `method` on `/api/pause` with `body`, as the board sends it unless `headers` say otherwise. */
async function asked(method: string, body?: unknown, headers: Record<string, string> = BOARD) {
  const res = await app.request('/api/pause', {
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
    body: { error: `the store is already paused by ann since ${pause.at}: wf resume lifts it first.` },
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
  const shape = '`{ "why"?: "<words>", "by"?: "<name>" }`';
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
