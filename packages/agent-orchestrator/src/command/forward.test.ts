/**
 * The command line forwarded to another machine's api, as the table holds it: every key an entry's input says reaches the endpoint the
 * link it calls names — its path, its query or its payload — where the link sends the input as it is (`unsentOf`), so no word a person
 * typed is dropped on the way; which link an input calls (`linkOf`); how a request is split (`partsOf`); and where the environment
 * forwards it (`forwardedOf`); and a status the `Api` declares no error for refused in the api's own words (`forwardedCall`).
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import type { AddressInfo } from 'node:net';
import { Effect, Exit } from 'effect';
import { Schema } from 'effect';
import { CLI_VERBS } from './command.ts';
import { TABLE } from './commands.verb.ts';
import { forwardedCall, forwardedOf, linkOf, partsOf, refusalOfStatus, unsentOf } from './forward.verb.ts';
import { Api, endpointKeysOf } from 'objects';

/** The entries a command line runs, so forwards: every one but those the api alone serves, which no line reaches. */
const RUN_HERE = [...TABLE.filter((c) => c.only?.side !== 'api'), ...CLI_VERBS];

test('every key of an entry linked with no request reaches the endpoint the link calls: its path, its query or its payload', () => {
  const unsent = RUN_HERE.flatMap(unsentOf);
  assert.deepEqual(
    unsent.map((u) => `${u.entry} -> ${u.endpoint}: ${u.keys.join(', ')}`),
    [],
    'give the link a request that maps the input to the keys its endpoint takes',
  );
});

test('REFUSED: an entry whose input says runId, linked with no request to an endpoint whose path says name, as the key it drops', () => {
  const input = Schema.Struct({ runId: Schema.String });
  const planted = { name: 'cancel planted', input, served: [{ endpoint: 'runs.cancel' }] } as const;
  assert.deepEqual(unsentOf(planted), [{ entry: 'cancel planted', endpoint: 'runs.cancel', keys: ['runId'] }]);
  const mapped = { ...planted, served: [{ endpoint: 'runs.cancel', request: () => null as never }] } as const;
  assert.deepEqual(unsentOf(mapped), []);
});

test('an input calls the first link whose takes holds, else the last', () => {
  const links = [
    { endpoint: 'runs.hold', takes: (i: Readonly<Record<string, unknown>>) => i.off !== true },
    { endpoint: 'runs.unhold', as: 'unhold' },
  ] as const;
  assert.equal(linkOf(links, {}).endpoint, 'runs.hold');
  assert.equal(linkOf(links, { off: true }).endpoint, 'runs.unhold');
});

test("a request is split by where its endpoint takes each key, a link's query default sent where the request gives none", () => {
  const keys = endpointKeysOf(Api, 'steps.try');
  assert.deepEqual(partsOf(keys, { runId: 'r', step: 's', try: 2, unknown: 'x' }, { fields: '' }), {
    params: { runId: 'r', step: 's', try: 2 },
    query: { fields: '' },
    payload: {},
  });
  assert.deepEqual(partsOf(keys, { runId: 'r', step: 's', try: 2, fields: 'a' }, { fields: '' }).query, { fields: 'a' });
});

test('the environment forwards the command line where NEMIA_SERVER names a daemon, and not where it is unset or empty', () => {
  assert.equal(forwardedOf({}), undefined);
  assert.equal(forwardedOf({ NEMIA_SERVER: '' }), undefined);
  assert.deepEqual(forwardedOf({ NEMIA_SERVER: 'http://host:8787/', NEMIA_SERVER_TOKEN: 't' }), { server: 'http://host:8787', token: 't' });
  assert.deepEqual(forwardedOf({ NEMIA_SERVER: 'http://host:8787' }), { server: 'http://host:8787', token: undefined });
});

test("an answered status is the package's refusal of its kind, exit 2, as the api's map answers it", () => {
  const kinds = [400, 401, 403, 404, 409, 422].map((status) => refusalOfStatus(status, 'w'));
  assert.deepEqual(
    kinds.map((k) => k?._tag),
    ['Invalid', 'Forbidden', 'Forbidden', 'Missing', 'Conflict', 'Invalid'],
  );
  for (const k of kinds) assert.equal(k?.exitCode, 2);
  assert.equal(refusalOfStatus(500, 'w'), undefined);
});

test("REFUSED: a body past the api's bound is Invalid, exit 2, in the api's words that name the bound, never told to compare releases", async () => {
  const words = 'POST /api/factories: a body may be 1 MiB at most. Send a smaller one.';
  const server = http.createServer((_req, res) => {
    res.writeHead(413, { 'content-type': 'application/json' });
    res.end(JSON.stringify({ error: words }));
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  try {
    const { port } = server.address() as AddressInfo;
    const exit = await Effect.runPromiseExit(
      forwardedCall(
        { server: `http://127.0.0.1:${port}`, token: 't' },
        { name: 'factory add', served: [{ endpoint: 'factories.create' }] },
        { name: 'mill', repos: ['/srv/mill'] },
      ),
    );
    assert.ok(Exit.isFailure(exit), 'the forwarded call is refused');
    const refused = exit.cause.reasons.find((r) => r._tag === 'Fail');
    const error = refused !== undefined && 'error' in refused ? refused.error : undefined;
    assert.equal((error as { _tag?: string } | undefined)?._tag, 'Invalid', "a body past the bound is the caller's to change");
    assert.equal((error as { exitCode?: number } | undefined)?.exitCode, 2);
    assert.equal((error as { message?: string } | undefined)?.message, words, 'the api names the bound; the CLI hands its words on');
  } finally {
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
});

/**
 * The bodiless writes a forwarded command line makes: each endpoint a link of an entry it runs calls, by any method but GET and HEAD, whose
 * payload takes no key — the writes the typed client gives no body of its own.
 */
const BODILESS_WRITES = [...new Set(RUN_HERE.flatMap((c) => (c.served ?? []).map((l) => l.endpoint)))].filter((endpoint) => {
  const keys = endpointKeysOf(Api, endpoint);
  return !['GET', 'HEAD'].includes(keys.method) && keys.payloadKeys.length === 0;
});

test("every bodiless write a forwarded command line makes sends `{}` as JSON, with that content-type, as the api's write guard takes it", async () => {
  const seen = new Map<string, { readonly contentType: string | undefined; readonly body: string }>();
  const server = http.createServer((req, res) => {
    let body = '';
    req.on('data', (chunk: Buffer) => (body += chunk.toString()));
    req.on('end', () => {
      if (req.method !== 'GET') seen.set(`${req.method} ${req.url}`, { contentType: req.headers['content-type'], body });
      res.writeHead(404, { 'content-type': 'application/json' });
      res.end(JSON.stringify({ error: 'none here' }));
    });
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  try {
    const { port } = server.address() as AddressInfo;
    for (const endpoint of BODILESS_WRITES) {
      const keys = endpointKeysOf(Api, endpoint);
      const input = {
        ...Object.fromEntries([...keys.pathKeys, ...keys.queryKeys].map((k) => [k, k === 'try' ? 1 : `a-${k}`])),
        namespace: 'default',
      };
      seen.clear();
      await Effect.runPromiseExit(
        forwardedCall({ server: `http://127.0.0.1:${port}`, token: 't' }, { name: endpoint, served: [{ endpoint }] }, input),
      );
      const sent = [...seen.values()];
      assert.equal(sent.length, 1, `${endpoint} reached the server once`);
      const [one] = sent;
      assert.match(one?.contentType ?? '', /^application\/json\b/, `${endpoint} sent its body as JSON`);
      assert.deepEqual(JSON.parse(one?.body || 'null'), {}, `${endpoint} sent \`{}\``);
    }
  } finally {
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
});

test('the bodiless writes the test above reads hold nemia chat allow, the write met without a content-type, and its disallow', () => {
  assert.ok(BODILESS_WRITES.includes('nemia.allowSpeaker'));
  assert.ok(BODILESS_WRITES.includes('nemia.disallowSpeaker'));
});
