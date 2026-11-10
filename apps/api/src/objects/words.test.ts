/**
 * What HttpApi answers on its own, in the api's words (src/objects/serve.ts, `inApiWords`): a body its decoding refuses — not JSON, or
 * JSON of another shape — and a query it refuses are each a 400 whose body is `{ error, field }`, the key refused (`decodeRefused`); a
 * path the routes hand it and it serves nothing on is a 404 `{ error }` naming where the paths are listed. Its own refusals keep their
 * status and words. A write whose body is over `OBJECT_BODY_LIMIT` is a 413 `{ error }` naming the limit, and one under it is filed as
 * before. And the inbox's routes the Card's verbs replaced answer 404, so a client still reading them fails.
 */
import { root } from '../../test/harness.ts';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { names } from '../../test/named.ts';
import { app } from '../app.ts';
import { OBJECT_BODY_LIMIT } from './serve.ts';

const JSON_TYPE = { 'content-type': 'application/json' };
const inbox = path.join(root, 'inbox');
fs.mkdirSync(inbox, { recursive: true });
fs.writeFileSync(path.join(inbox, 'kept-card.md'), 'Keep this card.\n');

/** The inbox folder as it is: each file's name and text, to show a refusal wrote nothing. */
const inboxAsIs = (): Array<[string, string]> =>
  fs
    .readdirSync(inbox)
    .sort()
    .map((name) => [name, fs.readFileSync(path.join(inbox, name), 'utf8')]);

/** The status, the `error` and the `field` of a response, which must be a JSON object. */
const refusal = async (res: Response): Promise<{ status: number; error: unknown; field: unknown }> => {
  assert.match(res.headers.get('content-type') ?? '', /application\/json/, `${res.status}: answered as JSON`);
  const body = (await res.json()) as { error?: unknown; field?: unknown };
  return { status: res.status, error: body.error, field: body.field };
};

test('REFUSED: a card verb sent a body HttpApi does not decode — not JSON, or another shape — is a 400 `{ error, field }` naming the key refused and the document, and nothing is written', async () => {
  const before = inboxAsIs();
  for (const [route, body, field] of [
    ['/api/namespaces/default/cards', 'not json', 'payload'],
    ['/api/namespaces/default/cards', '{"body":42}', 'payload.body'],
    ['/api/namespaces/default/cards', '[]', 'payload'],
    ['/api/namespaces/default/cards/kept-card/labels', '{"labels":"team=core"}', 'payload.labels'],
    ['/api/namespaces/default/cards/kept-card/start', '{}', 'payload.workflow'],
  ] as const) {
    const refused = await refusal(await app.request(route, { method: 'POST', headers: JSON_TYPE, body }));
    assert.equal(refused.status, 400, `${route} ${body}`);
    assert.equal(refused.field, field, `${route} ${body}`);
    names(refused.error, route, `\`${field}\``, '/openapi/v3/nemia/v1');
  }
  assert.deepEqual(inboxAsIs(), before);
});

/** A card's file body whose JSON is `bytes` long, all of it the card's text. */
const cardOfBytes = (bytes: number): string => {
  const frame = JSON.stringify({ body: '' }).length;
  return JSON.stringify({ body: 'x'.repeat(bytes - frame) });
};

test('REFUSED: a write whose body is a byte over the limit is a 413 `{ error }` naming the limit and that the object is too large, and nothing is written', async () => {
  const limit = Number(OBJECT_BODY_LIMIT);
  const before = inboxAsIs();
  const body = cardOfBytes(limit + 1);
  assert.equal(Buffer.byteLength(body), limit + 1);
  const { status, error } = await refusal(await app.request('/api/namespaces/default/cards', { method: 'POST', headers: JSON_TYPE, body }));
  assert.equal(status, 413);
  names(error, 'too large', '1 MiB', String(limit));
  assert.deepEqual(inboxAsIs(), before);
});

test('a write whose body is at the limit is answered as before: the card is filed whole', async () => {
  const limit = Number(OBJECT_BODY_LIMIT);
  const body = cardOfBytes(limit);
  const res = await app.request('/api/namespaces/default/cards', { method: 'POST', headers: JSON_TYPE, body });
  assert.equal(res.status, 201, await res.clone().text());
  const filed = inboxAsIs().filter(([, text]) => text.length >= limit - 100);
  assert.equal(filed.length, 1, 'the card is in the inbox');
  for (const [name] of filed) fs.rmSync(path.join(inbox, name));
});

test('REFUSED: a list asked with a query of the wrong shape — a key given twice — is a 400 `{ error, field }` naming the key refused', async () => {
  for (const [at, field] of [
    ['/api/cards?limit=1&limit=2', 'query.limit'],
    ['/api/namespaces/default/cards?continue=a&continue=b', 'query.continue'],
  ] as const) {
    const refused = await refusal(await app.request(at));
    assert.equal(refused.status, 400, at);
    assert.equal(refused.field, field, at);
    names(refused.error, `\`${field}\``, '/openapi/v3/nemia/v1');
  }
});

test('REFUSED: a path the routes hand the objects and they serve nothing on is a 404 `{ error }` naming where the paths are listed', async () => {
  for (const at of ['/api/namespaces/%ZZ/cards', '/api/runs/x/steps/y/tries/%E0']) {
    const { status, error } = await refusal(await app.request(at));
    assert.equal(status, 404, at);
    names(error, '/openapi/v3/nemia/v1');
  }
});

test("the objects' own refusals keep their status and their words: a card not there is the package's 404, a name that is none its 422", async () => {
  const missing = await refusal(await app.request('/api/namespaces/default/cards/no-such-card'));
  assert.equal(missing.status, 404);
  names(missing.error, 'no-such-card', 'nemia inbox');
  const wrong = await refusal(await app.request('/api/namespaces/default/cards/.hidden'));
  assert.equal(wrong.status, 422);
  names(wrong.error, '.hidden');
});

test('REFUSED: each inbox route the Card verbs replaced answers 404, and writes nothing: a client still reading it fails', async () => {
  const before = inboxAsIs();
  for (const [method, at] of [
    ['GET', '/api/inbox'],
    ['GET', '/api/inbox?all=true'],
    ['POST', '/api/inbox'],
    ['DELETE', '/api/inbox/kept-card'],
    ['POST', '/api/inbox/kept-card/queue'],
    ['DELETE', '/api/inbox/kept-card/queue'],
    ['POST', '/api/inbox/kept-card/labels'],
    ['GET', '/api/inbox/kept-card'],
    ['PUT', '/api/inbox/kept-card/from'],
    ['DELETE', '/api/inbox/kept-card/from'],
  ] as const) {
    const res = await app.request(at, { method, headers: JSON_TYPE, ...(method === 'GET' ? {} : { body: '{"body":"An idea"}' }) });
    assert.equal(res.status, 404, `${method} ${at}`);
  }
  assert.deepEqual(inboxAsIs(), before);
});
