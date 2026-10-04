/**
 * The store's cordon on the api, as `wf cordon` and `wf uncordon` put and lift it, through their entries of the package's command table:
 * `POST /api/cordon` cordons the store, `GET /api/cordon` reads it back with the landings it holds staged, a second cordon is the package's
 * 409, `DELETE /api/cordon` lifts it, and a second lift is its 404; a body that is not a cordon, and words `wf cordon` refuses, are refused
 * before the store is written; and a page on another site is refused by the guard.
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

/** The api's answer to `method` on `/api/cordon` with `body`, as the board sends it unless `headers` say otherwise. */
async function asked(method: string, body?: unknown, headers: Record<string, string> = BOARD) {
  const res = await app.request('/api/cordon', {
    method,
    headers,
    ...(body === undefined ? {} : { body: typeof body === 'string' ? body : JSON.stringify(body) }),
  });
  return { status: res.status, body: (await res.json()) as Record<string, unknown> };
}

const FILE = path.join(root, 'cordon');

test('the board cordons the store, reads the cordon back, is refused a second, lifts it, and is refused a second lift', async () => {
  assert.deepEqual(await asked('GET'), { status: 200, body: { cordon: null, staged: [] } });
  const put = await asked('POST', { why: 'merging by hand', by: 'ann' });
  assert.equal(put.status, 200);
  const cordon = put.body.cordon as { at: string; by: string; why: string };
  assert.deepEqual({ ...cordon, at: typeof cordon.at }, { at: 'string', by: 'ann', why: 'merging by hand' });
  assert.deepEqual(JSON.parse(fs.readFileSync(FILE, 'utf8')), cordon, "the store's cordon file holds it");
  assert.deepEqual(await asked('GET'), { status: 200, body: { cordon, staged: [] } });
  assert.deepEqual(await asked('POST', {}), {
    status: 409,
    body: { error: `the store is already cordoned by ann since ${cordon.at}: wf uncordon lifts it first.` },
  });
  assert.deepEqual(await asked('DELETE'), { status: 200, body: { cordon } });
  assert.equal(fs.existsSync(FILE), false, 'the file removed');
  assert.deepEqual(await asked('GET'), { status: 200, body: { cordon: null, staged: [] } });
  assert.deepEqual(await asked('DELETE'), {
    status: 404,
    body: { error: 'the store is not cordoned: there is nothing to lift (wf cordon puts one).' },
  });
});

test('REFUSED: a body that is not a cordon, words wf cordon refuses, and a page on another site, before the store is written', async () => {
  const shape = '`{ "why"?: "<words>", "by"?: "<name>" }`';
  assert.deepEqual(await asked('POST', 'not json'), { status: 400, body: { error: `POST …/cordon takes a JSON body: ${shape}.` } });
  assert.deepEqual(await asked('POST', { why: 7 }), {
    status: 400,
    body: {
      error: `\`why\` is why the store is cordoned, as \`wf cordon --why "<words>"\` takes it: text, or left out. This request's was 7: ${shape}.`,
    },
  });
  assert.deepEqual(await asked('POST', { by: ' ' }), {
    status: 422,
    body: { error: '--by takes who cordons it, by a name, and was given only blanks: give it words, or leave --by out.' },
  });
  const refused = await asked('POST', {}, { ...BOARD, 'sec-fetch-site': 'cross-site' });
  assert.equal(refused.status, 403);
  assert.match(String(refused.body.error), /refuses a request made by a page on another site/);
  assert.equal((await asked('DELETE', undefined, { ...BOARD, 'sec-fetch-site': 'cross-site' })).status, 403);
  assert.equal(fs.existsSync(FILE), false, 'nothing cordoned the store');
});
