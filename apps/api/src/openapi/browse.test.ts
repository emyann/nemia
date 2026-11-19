/**
 * The page a person starts to browse and try an api (`browseApp`): its document names one server, an address set on the page that starts
 * on the api given, and says the api takes a bearer token; its request client is on, where the api's own page keeps it off, and sends
 * each request through the page; and it loads its script from itself.
 */
import '../../test/harness.ts';
import { test } from 'vitest';
import assert from 'node:assert/strict';
import { browseApp } from './browse.ts';
import { OPENAPI_PATH, REFERENCE_PATH, REFERENCE_SCRIPT_PATH } from './index.ts';
import { REFERENCE_PROXY_PATH } from './reference.ts';

const BROWSED = { target: 'https://nemia.example' };
const app = () => browseApp(() => Promise.resolve('createApiReference'), BROWSED);

test('the document names one server, an address set on the page that starts on the api given, and a bearer token as what the api takes', async () => {
  const doc = (await (await app().request(OPENAPI_PATH)).json()) as {
    info: { description: string };
    servers: { url: string; variables: { api: { default: string } } }[];
    security: unknown;
    components: { securitySchemes: unknown };
  };
  assert.deepEqual(
    doc.servers.map((server) => [server.url, server.variables.api.default]),
    [['{api}', BROWSED.target]],
  );
  assert.deepEqual(doc.security, [{ token: [] }]);
  assert.deepEqual(doc.components.securitySchemes, { token: { type: 'http', scheme: 'bearer' } });
  assert.ok(doc.info.description.includes('under Server'), 'a person reads where the address is set before sending a request');
});

test("the page's request client is on, its script its own, and a token typed once is sent with every request", async () => {
  const page = await (await app().request(REFERENCE_PATH)).text();
  assert.ok(page.includes('"hideTestRequestButton": false'), 'a request is tried from the page');
  assert.ok(page.includes('"persistAuth": true'), 'the token typed is kept by the browser for the page, so it is typed once');
  assert.ok(page.includes('"preferredSecurityScheme": "token"'), 'and its scheme is selected for every request tried');
  assert.ok(
    page.includes(`"proxyUrl": "${REFERENCE_PROXY_PATH}"`),
    'and each request is sent through the page, whatever address it is for',
  );
  const sources = [...page.matchAll(/<script[^>]*\bsrc="([^"]*)"/g)].map(([, src]) => src);
  assert.deepEqual(sources, [REFERENCE_SCRIPT_PATH]);
  assert.equal((await app().request('/')).headers.get('location'), REFERENCE_PATH, 'the root is sent to the page');
});
