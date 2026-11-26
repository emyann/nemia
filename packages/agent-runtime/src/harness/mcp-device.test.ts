/**
 * The device road's I/O against a provider that MSW stands in for: the metadata read to choose a road, the code asked, a poll's answer,
 * and a refresh. What matters, each with the request that breaks it: no request carries a client secret, a poll and a refresh ask for
 * JSON and read a form-encoded answer too, a provider that publishes no metadata is the browser road, and a network failure is
 * refused rather than fallen through to it. The three decisions are proved by `contracts/mcp-device.contract.ts`, and not here.
 */
import { afterAll, afterEach, beforeAll, describe, test } from 'vitest';
import assert from 'node:assert/strict';
import { http, HttpResponse } from 'msw';
import { setupServer } from 'msw/node';
import { deviceCodeOf, DEVICE_GRANT, pollOnce, refreshOnce, routeOf } from './mcp-device.ts';
import type { RemoteMcpServer } from './seam.ts';

const server = setupServer();
beforeAll(() => server.listen({ onUnhandledFrame: 'error' }));
afterEach(() => server.resetHandlers());
afterAll(() => server.close());

const GITHUB: RemoteMcpServer = {
  type: 'http',
  url: 'https://api.githubcopilot.com/mcp/',
  oauth: { clientId: 'Iv23liQBfm9prqhvXkuY' },
};

const RESOURCE = 'https://api.githubcopilot.com/.well-known/oauth-protected-resource/mcp/';
const AUTHORIZATION = 'https://github.com/.well-known/oauth-authorization-server/login/oauth';
const TOKEN = 'https://github.com/login/oauth/access_token';

/** What a provider received at `url`: the body of each request as a form, in order. */
const received = (url: string, answer: () => Response) => {
  const forms: URLSearchParams[] = [];
  server.use(
    http.post(url, async ({ request }) => {
      forms.push(new URLSearchParams(await request.text()));
      return answer();
    }),
  );
  return forms;
};

const provider = (grants: string[] = [DEVICE_GRANT]) => {
  server.use(
    http.get(RESOURCE, () => HttpResponse.json({ resource: GITHUB.url, authorization_servers: ['https://github.com/login/oauth'] })),
    http.get(AUTHORIZATION, () =>
      HttpResponse.json({
        device_authorization_endpoint: 'https://github.com/login/device/code',
        token_endpoint: TOKEN,
        grant_types_supported: ['authorization_code', 'refresh_token', ...grants],
      }),
    ),
  );
};

describe('routeOf: the road is chosen from what the provider advertises', () => {
  test('a server whose provider advertises the device grant signs in by a code, at the provider’s own endpoints', async () => {
    provider();
    assert.deepEqual(await routeOf(GITHUB), {
      route: 'device',
      deviceAuthorizationEndpoint: 'https://github.com/login/device/code',
      tokenEndpoint: TOKEN,
    });
  });

  test('a provider that does not list the device grant is the browser road', async () => {
    provider([]);
    assert.deepEqual(await routeOf(GITHUB), { route: 'browser' });
  });

  test('a server that publishes no protected resource metadata is the browser road', async () => {
    server.use(http.get(RESOURCE, () => new HttpResponse(null, { status: 404 })));
    assert.deepEqual(await routeOf(GITHUB), { route: 'browser' });
  });

  test('an authorization server that publishes no metadata is the browser road', async () => {
    server.use(
      http.get(RESOURCE, () => HttpResponse.json({ authorization_servers: ['https://github.com/login/oauth'] })),
      http.get(AUTHORIZATION, () => new HttpResponse(null, { status: 404 })),
    );
    assert.deepEqual(await routeOf(GITHUB), { route: 'browser' });
  });

  test('a server naming no OAuth client is the browser road, and asks nothing', async () => {
    assert.deepEqual(await routeOf({ type: 'http', url: GITHUB.url }), { route: 'browser' });
  });

  test('a network failure is refused, never read as the browser road', async () => {
    server.use(http.get(RESOURCE, () => HttpResponse.error()));
    await assert.rejects(routeOf(GITHUB));
  });
});

describe('deviceCodeOf: the code is asked with the client id alone', () => {
  test('posts client_id and no client_secret, and answers the code, its link, its life and its pace', async () => {
    const forms = received('https://github.com/login/device/code', () =>
      HttpResponse.json({
        device_code: 'dc-1',
        user_code: 'WDJB-MJHT',
        verification_uri: 'https://github.com/login/device',
        expires_in: 900,
        interval: 5,
      }),
    );
    const code = await deviceCodeOf('https://github.com/login/device/code', 'Iv23liQBfm9prqhvXkuY');
    assert.deepEqual(code, {
      deviceCode: 'dc-1',
      userCode: 'WDJB-MJHT',
      verificationUri: 'https://github.com/login/device',
      expiresInSeconds: 900,
      intervalSeconds: 5,
    });
    assert.deepEqual([...(forms[0] ?? [])], [['client_id', 'Iv23liQBfm9prqhvXkuY']]);
  });

  test('an answer with no code is refused', async () => {
    received('https://github.com/login/device/code', () => HttpResponse.json({ error: 'device_flow_disabled' }));
    await assert.rejects(deviceCodeOf('https://github.com/login/device/code', 'x'));
  });
});

describe('pollOnce: a poll sends the device grant and no secret, and reads JSON or a form', () => {
  test('a token answer holds the token and its refresh', async () => {
    const forms = received(TOKEN, () =>
      HttpResponse.json({ access_token: 'at-1', refresh_token: 'rt-1', expires_in: 28800, refresh_token_expires_in: 15811200 }),
    );
    const polled = await pollOnce(TOKEN, 'cid', 'dc-1');
    assert.equal(polled.outcome, 'token');
    assert.deepEqual(polled.grant, {
      accessToken: 'at-1',
      refreshToken: 'rt-1',
      expiresInSeconds: 28800,
      refreshExpiresInSeconds: 15811200,
    });
    assert.deepEqual(Object.fromEntries(forms[0] ?? []), { client_id: 'cid', device_code: 'dc-1', grant_type: DEVICE_GRANT });
  });

  test('a form-encoded answer reads like a JSON one', async () => {
    received(
      TOKEN,
      () => new HttpResponse('access_token=at-2&expires_in=60&token_type=bearer', { headers: { 'content-type': 'text/plain' } }),
    );
    const polled = await pollOnce(TOKEN, 'cid', 'dc-1');
    assert.equal(polled.outcome, 'token');
    assert.equal(polled.grant?.accessToken, 'at-2');
    assert.equal(polled.grant?.expiresInSeconds, 60);
  });

  test('a pending answer waits and holds no token', async () => {
    received(TOKEN, () => new HttpResponse('error=authorization_pending', { headers: { 'content-type': 'text/plain' } }));
    assert.deepEqual(await pollOnce(TOKEN, 'cid', 'dc-1'), { outcome: 'wait', grant: undefined });
  });
});

describe('refreshOnce: a refresh sends the refresh grant and the client id, and no secret', () => {
  test('answers the new grant', async () => {
    const forms = received(TOKEN, () => HttpResponse.json({ access_token: 'at-3', refresh_token: 'rt-3', expires_in: 28800 }));
    const grant = await refreshOnce(TOKEN, 'cid', 'rt-2');
    assert.notEqual(grant, 'refused');
    assert.deepEqual(Object.fromEntries(forms[0] ?? []), { client_id: 'cid', grant_type: 'refresh_token', refresh_token: 'rt-2' });
  });

  test('a spent refresh token is refused', async () => {
    received(TOKEN, () => HttpResponse.json({ error: 'invalid_grant' }));
    assert.equal(await refreshOnce(TOKEN, 'cid', 'rt-2'), 'refused');
  });

  test('a network failure throws, so a held token is not taken for spent', async () => {
    server.use(http.post(TOKEN, () => HttpResponse.error()));
    await assert.rejects(refreshOnce(TOKEN, 'cid', 'rt-2'));
  });
});
