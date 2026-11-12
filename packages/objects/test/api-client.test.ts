/**
 * The one typed client of the `Api` (`apiClient`), against a stand-in api that records what it is sent: every bodiless write the `Api`
 * declares sent as `{}` in JSON, as the write guard takes it; the token presented as a bearer and the caller's headers beside it; a call
 * the api takes and never answers given up at its bound, as a timeout; and a status the `Api` declares no error for decoded into
 * `Answered`, with the api's own words. The shipped bound, `READ_BOUND_MS`, is not waited out: the test shortens it at the seam the
 * constructor gives for it (`boundMs`), and floors the wait there.
 */
import { after, test } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import type { AddressInfo } from 'node:net';
import { Cause, Effect, Exit, Option } from 'effect';
import { FetchHttpClient } from 'effect/http';
import { Answered, Api, apiClient, type ApiClientOptions, endpointKeysOf, timedOut } from 'objects';

/** What the stand-in was sent: each request's method, path, headers and body. */
type Sent = { readonly method: string; readonly path: string; readonly headers: http.IncomingHttpHeaders; readonly body: string };

const sent: Sent[] = [];

/** What the stand-in answers every request: a status and a JSON body; none, to take the request and never answer. */
let answer: { readonly status: number; readonly body: unknown } | 'none' = { status: 404, body: { error: 'none here' } };

const standIn = http.createServer((req, res) => {
  let body = '';
  req.on('data', (chunk: Buffer) => (body += chunk.toString()));
  req.on('end', () => {
    sent.push({ method: req.method ?? '', path: req.url ?? '', headers: req.headers, body });
    if (answer === 'none') return;
    res.writeHead(answer.status, { 'content-type': 'application/json' });
    res.end(JSON.stringify(answer.body));
  });
});
await new Promise<void>((resolve) => standIn.listen(0, '127.0.0.1', resolve));
after(() => {
  standIn.closeAllConnections();
  standIn.close();
});
const base = `http://127.0.0.1:${(standIn.address() as AddressInfo).port}`;

/** The typed client, as this test calls it: each group's endpoints by name, a call taking its path and query. */
type Calls = Readonly<Record<string, Readonly<Record<string, (parts: object) => Effect.Effect<unknown, unknown>>>>>;

/** The endpoint `name` (`<group>.<endpoint>`) called with each key of its path and query filled, on a client made with `options`. */
const called = (name: string, options: Partial<ApiClientOptions> = {}) => {
  const keys = endpointKeysOf(Api, name);
  const fill = (ks: readonly string[]) => Object.fromEntries(ks.map((k) => [k, k === 'try' ? 1 : `a-${k}`]));
  const [group = '', endpoint = ''] = name.split('.');
  return Effect.runPromiseExit(
    apiClient({ baseUrl: base, ...options }).pipe(
      Effect.flatMap((client) => {
        const call = (client as unknown as Calls)[group]?.[endpoint];
        assert.ok(call, `${name} is a call of the typed client`);
        return call({ params: fill(keys.pathKeys), query: fill(keys.queryKeys) });
      }),
      Effect.provide(FetchHttpClient.layer),
    ),
  );
};

/** The failure `exit` ended with. */
const failureOf = (exit: Exit.Exit<unknown, unknown>): unknown =>
  Exit.isFailure(exit) ? Option.getOrUndefined(Cause.findErrorOption(exit.cause)) : undefined;

/** Every endpoint of the `Api` by `<group>.<endpoint>` that writes (no GET, no HEAD) and whose payload takes no key. */
const BODILESS_WRITES = Object.values(Api.groups)
  .flatMap((group) => Object.values(group.endpoints).map((endpoint) => `${group.identifier}.${endpoint.identifier}`))
  .filter((name) => {
    const keys = endpointKeysOf(Api, name);
    return !['GET', 'HEAD'].includes(keys.method) && keys.payloadKeys.length === 0;
  });

test('the bodiless writes hold nemia proposals approve and decline, which the client sends, and chat allow, which the CLI forwards', () => {
  assert.ok(BODILESS_WRITES.includes('proposals.approve'));
  assert.ok(BODILESS_WRITES.includes('proposals.decline'));
  assert.ok(BODILESS_WRITES.some((name) => name.startsWith('nemia.')));
});

test('REFUSED by the write guard until mapped: every bodiless write carries `{}` as `content-type: application/json`', async () => {
  answer = { status: 404, body: { error: 'none here' } };
  for (const name of BODILESS_WRITES) {
    sent.length = 0;
    await called(name);
    assert.equal(sent.length, 1, `${name} reached the stand-in once`);
    assert.match(sent[0]?.headers['content-type'] ?? '', /^application\/json\b/, `${name} sent its body as JSON`);
    assert.deepEqual(JSON.parse(sent[0]?.body || 'null'), {}, `${name} sent \`{}\``);
  }
});

test('the token is presented as a bearer, the caller’s headers beside it; none where there is no token', async () => {
  answer = { status: 200, body: { resources: [] } };
  sent.length = 0;
  await called('discovery.resources', { token: 'tok', headers: { accept: 'application/json;as=Table' } });
  await called('discovery.resources');
  assert.equal(sent[0]?.headers.authorization, 'Bearer tok');
  assert.equal(sent[0]?.headers.accept, 'application/json;as=Table');
  assert.equal(sent[1]?.headers.authorization, undefined);
});

test('a status the Api declares no error for is decoded into Answered: its status, its path and the api’s words', async () => {
  answer = { status: 502, body: { error: 'the api’s words' } };
  const failed = failureOf(await called('discovery.resources'));
  assert.ok(failed instanceof Answered, `failed with ${String(failed)}`);
  assert.equal(failed.status, 502);
  assert.equal(failed.path, '/api');
  assert.equal(failed.said, 'the api’s words');
  answer = { status: 502, body: 'not an object' };
  const wordless = failureOf(await called('discovery.resources'));
  assert.ok(wordless instanceof Answered);
  assert.equal(wordless.said, undefined);
});

/** The bound the test gives a call, in place of the shipped one. */
const SHORT_MS = 200;

/** What a floor at `SHORT_MS` forgives: a timer fires up to a millisecond before a clock read around it says its delay is gone. */
const TIMER_SLACK_MS = 5;

test('REFUSED: a call the api takes and never answers gives up at its bound, a write as a read, as a timeout', async () => {
  answer = 'none';
  for (const name of ['discovery.resources', 'proposals.approve']) {
    const started = performance.now();
    const failed = failureOf(await called(name, { boundMs: SHORT_MS }));
    assert.ok(timedOut(failed), `${name} failed with ${String(failed)}`);
    assert.ok(performance.now() - started >= SHORT_MS - TIMER_SLACK_MS, `${name} waited its bound`);
  }
  answer = { status: 404, body: {} };
});
