/**
 * The api answers no CORS: no preflight is granted and no answer carries an `Access-Control-Allow-*` header. The write guard rests on it
 * (src/guard.ts): a page of another origin cannot send `Authorization`, nor `objects`' `SCRIPTED_HEADER` that lets the board's cookie
 * upload a form of files, without the browser asking the api first, and the api says yes to no such question. A change that adds CORS
 * fails here before it opens the store's writes to another origin's page. Each endpoint is asked a preflight; each write is sent too, by
 * a page of another site, which the guard refuses before any handler runs, and a read of the cards is answered.
 */
import './harness.ts';
import { test } from 'vitest';
import assert from 'node:assert/strict';
import { Api, SCRIPTED_HEADER, TOKEN_COOKIE } from 'objects';
import { app } from '../src/app.ts';
import { PERSON_TOKEN } from './harness.ts';

/** Every endpoint of the `Api`, by its method and its path with every name filled in by one no object has. */
const ENDPOINTS = Object.values(Api.groups).flatMap((group) =>
  Object.values(group.endpoints).map((e) => ({ method: e.method, path: e.path.replace(/:[A-Za-z]+/g, 'nothing-here') })),
);

/** A page of another origin: another port of this host. */
const ORIGIN = 'http://127.0.0.1:9999';

/** The `Access-Control-*` headers an answer carries, each `name: value`. */
const corsOf = (res: Response) =>
  [...res.headers.entries()].filter(([name]) => name.toLowerCase().startsWith('access-control-')).map(([n, v]) => `${n}: ${v}`);

test(`REFUSED: no preflight is granted and no answer allows another origin, on which ${SCRIPTED_HEADER} (SCRIPTED_HEADER) letting the board's cookie upload a form relies`, async () => {
  assert.ok(ENDPOINTS.length >= 60, `${ENDPOINTS.length} endpoints read off the Api`);
  const open: string[] = [];
  for (const { method, path } of ENDPOINTS) {
    const preflight = await app.request(path, {
      method: 'OPTIONS',
      headers: {
        origin: ORIGIN,
        'access-control-request-method': method,
        'access-control-request-headers': `${SCRIPTED_HEADER}, content-type`,
      },
    });
    for (const line of corsOf(preflight)) open.push(`OPTIONS ${path}: ${line}`);
    if (method === 'GET') continue;
    const asked = await app.request(path, {
      method,
      headers: {
        origin: ORIGIN,
        'sec-fetch-site': 'cross-site',
        cookie: `${TOKEN_COOKIE}=${PERSON_TOKEN}`,
        [SCRIPTED_HEADER]: 'XMLHttpRequest',
        'content-type': 'application/json',
      },
      body: '{}',
    });
    for (const line of corsOf(asked)) open.push(`${method} ${path}: ${line}`);
  }
  const read = await app.request('/api/cards', { headers: { origin: ORIGIN } });
  assert.equal(read.status, 200);
  for (const line of corsOf(read)) open.push(`GET /api/cards: ${line}`);
  assert.deepEqual(open, []);
});
