/**
 * The page a person starts to browse and try an api (`browseApp`): its document names the page itself as its one server and says the
 * api takes a bearer token, so a request tried on it is sent to the page and crosses no origin; its request client is on, where the
 * api's own page keeps it off; and it loads its script from itself, naming no host but its own and the api it was started against.
 */
import '../../test/harness.ts';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { browseApp } from './browse.ts';
import { OPENAPI_PATH, REFERENCE_PATH, REFERENCE_SCRIPT_PATH } from './index.ts';

const BROWSED = { page: 'http://127.0.0.1:8790', target: 'https://nemia.example' };
const app = () => browseApp(() => Promise.resolve('createApiReference'), BROWSED);

test('the document names the page as its one server and a bearer token as what the api takes, and says where a request is sent on', async () => {
  const doc = (await (await app().request(OPENAPI_PATH)).json()) as {
    info: { description: string };
    servers: { url: string }[];
    security: unknown;
    components: { securitySchemes: unknown };
  };
  assert.deepEqual(
    doc.servers.map((server) => server.url),
    [BROWSED.page],
  );
  assert.deepEqual(doc.security, [{ token: [] }]);
  assert.deepEqual(doc.components.securitySchemes, { token: { type: 'http', scheme: 'bearer' } });
  assert.ok(doc.info.description.includes(BROWSED.target), 'a person reads which api a request reaches before sending one');
});

test("the page's request client is on, its script its own, and it keeps no token", async () => {
  const page = await (await app().request(REFERENCE_PATH)).text();
  assert.ok(page.includes('"hideTestRequestButton": false'), 'a request is tried from the page');
  assert.ok(page.includes('"persistAuth": false'), 'the token typed is kept nowhere');
  const sources = [...page.matchAll(/<script[^>]*\bsrc="([^"]*)"/g)].map(([, src]) => src);
  assert.deepEqual(sources, [REFERENCE_SCRIPT_PATH]);
  assert.equal((await app().request('/')).headers.get('location'), REFERENCE_PATH, 'the root is sent to the page');
});
