/**
 * Every write the client's typed client (`clientAt`) can send whose endpoint takes no payload — `nemia proposals approve` and `decline`
 * among them — is sent as `{}` with `content-type: application/json`, as the api's write guard takes it: one test over every bodiless
 * write the `Api` declares, each called against a stand-in that records what it was sent and answers 404.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import type { AddressInfo } from 'node:net';
import { Effect } from 'effect';
import { FetchHttpClient } from 'effect/http';
import { Api, endpointKeysOf } from 'objects';
import { clientAt } from '../src/objects.ts';

/** Every endpoint of the `Api` by `<group>.<endpoint>` that writes (no GET, no HEAD) and whose payload takes no key. */
const BODILESS_WRITES = Object.values(Api.groups)
  .flatMap((group) => Object.values(group.endpoints).map((endpoint) => `${group.identifier}.${endpoint.identifier}`))
  .filter((name) => {
    const keys = endpointKeysOf(Api, name);
    return !['GET', 'HEAD'].includes(keys.method) && keys.payloadKeys.length === 0;
  });

/** The typed client, as this test calls it: each group's endpoints by name, a call taking its path and query. */
type Calls = Readonly<Record<string, Readonly<Record<string, (parts: object) => Effect.Effect<unknown, unknown>>>>>;

test('the bodiless writes hold nemia proposals approve and decline, which the client sends itself', () => {
  assert.ok(BODILESS_WRITES.includes('proposals.approve'));
  assert.ok(BODILESS_WRITES.includes('proposals.decline'));
});

test('every bodiless write the client sends carries `{}` as `content-type: application/json`, as the write guard takes it', async () => {
  const seen: { contentType: string | undefined; body: string }[] = [];
  const server = http.createServer((req, res) => {
    let body = '';
    req.on('data', (chunk: Buffer) => (body += chunk.toString()));
    req.on('end', () => {
      seen.push({ contentType: req.headers['content-type'], body });
      res.writeHead(404, { 'content-type': 'application/json' });
      res.end(JSON.stringify({ error: 'none here' }));
    });
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  try {
    const { port } = server.address() as AddressInfo;
    for (const name of BODILESS_WRITES) {
      const keys = endpointKeysOf(Api, name);
      const fill = (ks: readonly string[]) => Object.fromEntries(ks.map((k) => [k, k === 'try' ? 1 : `a-${k}`]));
      const [group = '', endpoint = ''] = name.split('.');
      seen.length = 0;
      await Effect.runPromiseExit(
        clientAt(`http://127.0.0.1:${port}`, {}).pipe(
          Effect.flatMap((client) => {
            const call = (client as unknown as Calls)[group]?.[endpoint];
            assert.ok(call, `${name} is a call of the typed client`);
            return call({ params: fill(keys.pathKeys), query: fill(keys.queryKeys) });
          }),
          Effect.provide(FetchHttpClient.layer),
        ),
      );
      assert.equal(seen.length, 1, `${name} reached the stand-in once`);
      assert.match(seen[0]?.contentType ?? '', /^application\/json\b/, `${name} sent its body as JSON`);
      assert.deepEqual(JSON.parse(seen[0]?.body || 'null'), {}, `${name} sent \`{}\``);
    }
  } finally {
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
});
