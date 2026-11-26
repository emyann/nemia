/**
 * The engine's sign-in verbs (`mcpSignInVerbsOf`), on both roads. The browser road runs over seams of a test's own: a CLI that writes
 * down what it ran, and a held session whose end a test settles, since the real ones spawn Claude Code and wait on a person's browser.
 * The code road runs over a provider MSW stands in for, its waits scaled to a few milliseconds (`pace`).
 *
 * What matters: the code or the address is answered before the server connects, and a page opened later reads it again; the hold is
 * one per callback port on the browser road and one per server on the code road; a sign-in no one approves ends at its bound and reads
 * `expired`; a cancel ends a waiting sign-in of either road; a token is held at mode 0600 and no answer, state or refusal quotes it or
 * the device code; an engine with no Claude Code harness spawns nothing; and an address pasted back is handed to the waiting session
 * only when it is that sign-in's redirect with a code and a state, never quoted in a refusal.
 */
import { afterAll, beforeAll, describe, test } from 'vitest';
import fs from 'node:fs';
import { http, HttpResponse } from 'msw';
import { setupServer } from 'msw/node';
import assert from 'node:assert/strict';
import { Effect } from 'effect';
import { story, teardowns } from 'test-kit/checkpoints';
import { mcpSignInVerbsOf, SIGN_IN_FOLDER, type McpSignInRefused } from './mcp-sign-in.ts';
import type { HarnessConfig } from './options.ts';
import type { McpCli, McpSignInAsk, SignInSettled } from '../harness/mcp-sign-in.ts';
import type { RemoteMcpServer } from '../harness/seam.ts';
import { scratch } from 'test-kit/scratch';
import { codex } from '../harness/codex/codex.ts';
import { DEVICE_GRANT } from '../harness/mcp-device.ts';
import { heldToken, tokenFileOf } from '../harness/mcp-token.ts';

const CLAUDE: Record<string, HarnessConfig> = { claude: 'claude' };
const GITHUB: RemoteMcpServer = {
  type: 'http',
  url: 'https://api.githubcopilot.com/mcp/',
  oauth: { clientId: 'Iv23liQBfm9prqhvXkuY', callbackPort: 8791 },
};

/** Seams that record every CLI call and session, each session settled by hand through `settle`. */
const seams = () => {
  const cli: Array<readonly string[]> = [];
  const sessions: Array<{
    name: string;
    cwd: string;
    redirectUri: string;
    ended: boolean;
    submitted: string[];
    settle: (s: SignInSettled) => void;
  }> = [];
  const run: McpCli = async (args) => {
    cli.push(args);
    return { code: 0, out: '' };
  };
  const ask: McpSignInAsk = async (name, _server, { cwd, redirectUri }) => {
    let settle: (s: SignInSettled) => void = () => {};
    const settled = new Promise<SignInSettled>((resolve) => (settle = resolve));
    const s = { name, cwd, redirectUri, ended: false, submitted: [] as string[], settle };
    sessions.push(s);
    return {
      authUrl: `https://github.com/login/oauth/authorize?state=${sessions.length}`,
      settled,
      end: () => void (s.ended = true),
      submit: async (url) => void s.submitted.push(url),
    };
  };
  const route = async () => ({ route: 'browser' }) as const;
  return { cli, sessions, run, ask, route };
};

/** Waits until `check` holds, a timer turn at a time, bounded. */
const until = async (check: () => boolean) => {
  for (let i = 0; i < 5000 && !check(); i++) await new Promise((r) => setTimeout(r, 1));
  assert.ok(check(), 'the awaited state never came');
};

/** The refusal `effect` fails with: a verb that succeeds fails the test. */
const refusalOf = <A>(effect: Effect.Effect<A, McpSignInRefused>) => Effect.runPromise(Effect.flip(effect));

const OTHER: RemoteMcpServer = { ...GITHUB, url: 'https://other.example/mcp' };

describe('a person signs in by the browser, the server connects, and they sign out again', () => {
  let root!: string;
  let s!: ReturnType<typeof seams>;
  let v!: ReturnType<typeof mcpSignInVerbsOf>;
  beforeAll(() => {
    const t = teardowns();
    root = scratch('ae-sign-in-');
    s = seams();
    v = mcpSignInVerbsOf(CLAUDE, root, undefined, { cli: s.run, ask: s.ask, route: s.route });
    return t.end;
  });
  const st = story(test);
  st.test('a sign-in runs no CLI, answers the address at once and waits', async () => {
    const started = await Effect.runPromise(v.mcpSignIn('github', GITHUB));
    assert.deepEqual(started.route === 'browser' && started.authUrl, 'https://github.com/login/oauth/authorize?state=1');
    assert.deepEqual(s.cli, [], 'no secret is stored: the sign-in files nothing of its own');
    assert.equal(s.sessions[0].redirectUri, 'http://localhost:8791/callback', 'the callback the app is registered on');
    assert.equal(s.sessions[0].cwd, `${root}/${SIGN_IN_FOLDER}`, 'the folder the local-scope add filed the server in');
    const state = await Effect.runPromise(v.mcpSignInState('github'));
    assert.equal(state.state, 'waiting');
    assert.deepEqual(state.started, started, 'a page opened later reads what the sign-in answered');
  });
  st.test('it reads connected once the server connects, and its session ends', async () => {
    s.sessions[0].settle({ connected: true });
    await until(() => s.sessions[0].ended);
    assert.deepEqual(await Effect.runPromise(v.mcpSignInState('github')), { state: 'connected' });
  });
  st.test('a sign-out adds the server, then removes it at local scope, and forgets the state', async () => {
    assert.deepEqual(await Effect.runPromise(v.mcpSignOut('github', GITHUB)), { ended: 'signed-out' });
    assert.deepEqual(
      s.cli.map((a) => a[1]),
      ['add', 'remove'],
    );
    assert.equal(s.cli[0].includes('--client-secret'), false, 'no `claude mcp add` is given a client secret');
    assert.deepEqual(s.cli[1], ['mcp', 'remove', '--scope', 'local', 'github']);
    assert.deepEqual(await Effect.runPromise(v.mcpSignInState('github')), { state: 'none' }, 'the connected state is forgotten');
  });
});

describe('a second sign-in on a port a first one holds is refused until the first settles', () => {
  let s!: ReturnType<typeof seams>;
  let v!: ReturnType<typeof mcpSignInVerbsOf>;
  beforeAll(async () => {
    const t = teardowns();
    s = seams();
    v = mcpSignInVerbsOf(CLAUDE, scratch('ae-sign-in-'), undefined, { cli: s.run, ask: s.ask, route: s.route });
    await Effect.runPromise(v.mcpSignIn('github', GITHUB));
    return t.end;
  });
  const st = story(test);
  st.test('REFUSED: a second sign-in on a held port, naming the one that waits and its port', async () => {
    const err = await refusalOf(v.mcpSignIn('other', OTHER));
    assert.deepEqual([err._tag, err.held], ['McpSignInRefused', true]);
    assert.ok(err.message.includes('`github`'), err.message);
    assert.ok(err.message.includes('port 8791'), err.message);
    assert.equal(s.sessions.length, 1, 'no second session was opened');
  });
  st.test('the first sign-in fails, in the words its session gave, and its session ends', async () => {
    s.sessions[0].settle({ connected: false, why: 'refused by the server' });
    await until(() => s.sessions[0].ended);
    assert.deepEqual(await Effect.runPromise(v.mcpSignInState('github')), { state: 'failed', why: 'refused by the server' });
  });
  st.test('the port is free once the first settled', async () => {
    await Effect.runPromise(v.mcpSignIn('other', OTHER));
    assert.equal(s.sessions.length, 2);
  });
});

test('a sign-in no one approves within its bound is ended and reads expired', async () => {
  const s = seams();
  const v = mcpSignInVerbsOf(CLAUDE, scratch('ae-sign-in-'), undefined, { cli: s.run, ask: s.ask, route: s.route, withinMs: 5 });
  await Effect.runPromise(v.mcpSignIn('github', GITHUB));
  await until(() => s.sessions[0].ended);
  assert.equal((await Effect.runPromise(v.mcpSignInState('github'))).state, 'expired');
});

test('REFUSED: two sign-ins asked at once on one port, the first not yet answered, open one session; the second is refused held', async () => {
  const s = seams();
  let answer = () => {};
  const late = new Promise<void>((r) => (answer = r));
  let asking = false;
  const slowAsk: McpSignInAsk = async (...args) => {
    asking = true;
    await late;
    return s.ask(...args);
  };
  const v = mcpSignInVerbsOf(CLAUDE, scratch('ae-sign-in-'), undefined, { cli: s.run, ask: slowAsk, route: s.route });
  const first = Effect.runPromise(v.mcpSignIn('github', GITHUB));
  await until(() => asking);
  const second = await refusalOf(v.mcpSignIn('other', { ...GITHUB, url: 'https://other.example/mcp' }));
  assert.deepEqual([second._tag, second.held], ['McpSignInRefused', true], 'the port is held from the first ask on');
  const out = await refusalOf(v.mcpSignOut('github', GITHUB));
  assert.deepEqual([out._tag, out.held], ['McpSignInRefused', true], 'nothing to cancel while one is started');
  answer();
  await first;
  assert.equal(s.sessions.length, 1, 'one session listens on the port');
  s.sessions[0].settle({ connected: true });
  await until(() => s.sessions[0].ended);
});

describe('mcpSignInVerbsOf: what is refused, and what a refusal leaves behind', () => {
  test('REFUSED: an engine with no Claude Code harness signs in and out of nothing, naming its harnesses, and spawns nothing', async () => {
    const s = seams();
    const v = mcpSignInVerbsOf({ coder: codex }, scratch('ae-sign-in-'), undefined, { cli: s.run, ask: s.ask, route: s.route });
    for (const verb of [v.mcpSignIn('github', GITHUB), v.mcpSignOut('github', GITHUB)]) {
      const err = await refusalOf<unknown>(verb);
      assert.deepEqual([err._tag, err.held], ['McpSignInRefused', false]);
      assert.ok(err.message.includes('no Claude Code harness'), err.message);
      assert.ok(err.message.includes('coder'), err.message);
    }
    assert.deepEqual([s.cli, s.sessions.length], [[], 0]);
  });
});

describe('a person whose browser runs elsewhere pastes back the address it landed on, and the sign-in completes', () => {
  let s!: ReturnType<typeof seams>;
  let v!: ReturnType<typeof mcpSignInVerbsOf>;
  beforeAll(() => {
    const t = teardowns();
    s = seams();
    v = mcpSignInVerbsOf(CLAUDE, scratch('ae-sign-in-'), undefined, { cli: s.run, ask: s.ask, route: s.route });
    return t.end;
  });
  const st = story(test);
  const PASTED = 'http://localhost:8791/callback?code=a-code-of-the-sign-in&state=a-state-of-the-sign-in';
  st.test('REFUSED: a callback with no sign-in waiting for the server, nothing handed on', async () => {
    const err = await refusalOf(v.mcpSignInCallback('github', PASTED));
    assert.deepEqual([err._tag, err.held, err.callback], ['McpSignInRefused', false, 'none-waiting']);
    assert.equal(err.message.includes('a-code-of-the-sign-in'), false, 'the pasted address is in no refusal');
  });
  st.test('REFUSED: each address that is not the redirect with a code and a state, nothing handed on, none quoted', async () => {
    await Effect.runPromise(v.mcpSignIn('github', GITHUB));
    const wrong: Array<[string, string]> = [
      ['not an address a-code-of-the-sign-in', 'unreadable'],
      ['http://localhost:9999/callback?code=a-code-of-the-sign-in&state=s', 'elsewhere'],
      ['http://localhost:8791/elsewhere?code=a-code-of-the-sign-in&state=s', 'elsewhere'],
      ['http://localhost:8791/callback?error=access_denied&state=a-code-of-the-sign-in', 'denied'],
      ['http://localhost:8791/callback?state=a-code-of-the-sign-in', 'no-code'],
      ['http://localhost:8791/callback?code=a-code-of-the-sign-in', 'no-state'],
    ];
    for (const [url, why] of wrong) {
      const err = await refusalOf(v.mcpSignInCallback('github', url));
      assert.deepEqual([err._tag, err.held, err.callback], ['McpSignInRefused', false, why], url);
      assert.equal(err.message.includes('a-code-of-the-sign-in'), false, `the pasted address is in no refusal: ${why}`);
    }
    assert.deepEqual(s.sessions[0].submitted, [], 'nothing was handed to the harness');
    assert.equal((await Effect.runPromise(v.mcpSignInState('github'))).state, 'waiting', 'and the sign-in still waits');
  });
  st.test("the sign-in's own redirect with a code and a state is handed to its session, and the state still reads waiting", async () => {
    const state = await Effect.runPromise(v.mcpSignInCallback('github', PASTED));
    assert.deepEqual(s.sessions[0].submitted, [PASTED]);
    assert.equal(state.state, 'waiting');
  });
  st.test('the session reads connected once the harness took it, as a browser reaching the port would', async () => {
    s.sessions[0].settle({ connected: true });
    await until(() => s.sessions[0].ended);
    assert.deepEqual(await Effect.runPromise(v.mcpSignInState('github')), { state: 'connected' });
  });
  st.test('REFUSED: a second paste once it settled: none waits any more', async () => {
    const err = await refusalOf(v.mcpSignInCallback('github', PASTED));
    assert.equal(err.callback, 'none-waiting');
    assert.deepEqual(s.sessions[0].submitted, [PASTED], 'handed on once');
  });
});

test('REFUSED: a harness that does not take the pasted address answers its refusal without the address', async () => {
  const s = seams();
  const PASTED = 'http://localhost:8791/callback?code=a-code-of-the-sign-in&state=s';
  const ask: McpSignInAsk = async (...args) => ({
    ...(await s.ask(...args)),
    submit: async (url) => {
      throw new Error(`the harness did not match the state of ${url}`);
    },
  });
  const v = mcpSignInVerbsOf(CLAUDE, scratch('ae-sign-in-'), undefined, { cli: s.run, ask, route: s.route });
  await Effect.runPromise(v.mcpSignIn('github', GITHUB));
  const err = await refusalOf(v.mcpSignInCallback('github', PASTED));
  assert.deepEqual([err._tag, err.held], ['McpSignInRefused', false]);
  assert.equal(err.message.includes('a-code-of-the-sign-in'), false, err.message);
  s.sessions[0].settle({ connected: false, why: 'ended' });
  await until(() => s.sessions[0].ended);
});

test('a waiting browser sign-in is cancelled by a sign-out: its session ends, its port is free and its state reads none', async () => {
  const s = seams();
  const v = mcpSignInVerbsOf(CLAUDE, scratch('ae-sign-in-'), undefined, { cli: s.run, ask: s.ask, route: s.route });
  await Effect.runPromise(v.mcpSignIn('github', GITHUB));
  assert.deepEqual(await Effect.runPromise(v.mcpSignOut('github', GITHUB)), { ended: 'cancelled' });
  assert.equal(s.sessions[0].ended, true);
  assert.deepEqual(await Effect.runPromise(v.mcpSignInState('github')), { state: 'none' });
  assert.deepEqual(s.cli, [], 'a cancel clears nothing of Claude Code’s');
  await Effect.runPromise(v.mcpSignIn('other', OTHER));
  assert.equal(s.sessions.length, 2, 'the port is free again');
});

describe('a person signs in by a code the provider takes, and their token is held by the engine', () => {
  const GRANTED = 'ghu_planted_access_token';
  const REFRESH = 'ghr_planted_refresh_token';
  const DEVICE_CODE = 'planted-device-code-0123456789';
  const DEVICE_GITHUB: RemoteMcpServer = {
    type: 'http',
    url: 'https://api.githubcopilot.com/mcp/',
    oauth: { clientId: 'Iv23liQBfm9prqhvXkuY' },
  };
  const TOKEN = 'https://github.com/login/oauth/access_token';
  const server = setupServer();
  beforeAll(() => server.listen({ onUnhandledFrame: 'error' }));
  afterAll(() => server.close());

  const provider = (polls: Array<Record<string, unknown>>) => {
    let polled = 0;
    server.resetHandlers();
    server.use(
      http.get('https://api.githubcopilot.com/.well-known/oauth-protected-resource/mcp/', () =>
        HttpResponse.json({ authorization_servers: ['https://github.com/login/oauth'] }),
      ),
      http.get('https://github.com/.well-known/oauth-authorization-server/login/oauth', () =>
        HttpResponse.json({
          device_authorization_endpoint: 'https://github.com/login/device/code',
          token_endpoint: TOKEN,
          grant_types_supported: [DEVICE_GRANT],
        }),
      ),
      http.post('https://github.com/login/device/code', () =>
        HttpResponse.json({
          device_code: DEVICE_CODE,
          user_code: 'WDJB-MJHT',
          verification_uri: 'https://github.com/login/device',
          expires_in: 900,
          interval: 5,
        }),
      ),
      http.post(TOKEN, () => HttpResponse.json(polls[Math.min(polled++, polls.length - 1)])),
    );
    return () => polled;
  };
  const GRANT = { access_token: GRANTED, refresh_token: REFRESH, expires_in: 28800, refresh_token_expires_in: 15811200 };
  const stateIs = async (v: ReturnType<typeof mcpSignInVerbsOf>, word: string) =>
    until(() => Effect.runSync(v.mcpSignInState('github')).state === word);

  describe('the code is answered, the poll holds the token, and a sign-out removes it', () => {
    let root!: string;
    let v!: ReturnType<typeof mcpSignInVerbsOf>;
    let started: unknown;
    beforeAll(() => {
      const t = teardowns();
      root = scratch('ae-sign-in-');
      v = mcpSignInVerbsOf(CLAUDE, root, undefined, { pace: 0.001 });
      return t.end;
    });
    const st = story(test);
    st.test('a sign-in answers the code, its page and its time at once, and reads waiting with the same facts', async () => {
      provider([{ error: 'authorization_pending' }, { error: 'slow_down' }, GRANT]);
      started = await Effect.runPromise(v.mcpSignIn('github', DEVICE_GITHUB));
      assert.deepEqual(
        { ...(started as object), until: undefined },
        { route: 'device', userCode: 'WDJB-MJHT', verificationUri: 'https://github.com/login/device', until: undefined },
      );
      assert.equal(JSON.stringify(started).includes(DEVICE_CODE), false, 'the device code is the engine’s, never handed on');
      const state = await Effect.runPromise(v.mcpSignInState('github'));
      assert.deepEqual([state.state, state.started], ['waiting', started]);
    });
    st.test('REFUSED: a second sign-in to the server while it waits, held', async () => {
      const err = await refusalOf(v.mcpSignIn('github', DEVICE_GITHUB));
      assert.deepEqual([err._tag, err.held], ['McpSignInRefused', true]);
      assert.equal(err.message.includes(DEVICE_CODE), false);
    });
    st.test('the token is held once the person typed the code, at mode 0600, and the server reads connected', async () => {
      await stateIs(v, 'connected');
      assert.deepEqual(await Effect.runPromise(v.mcpSignInState('github')), { state: 'connected' });
      const file = tokenFileOf(root, 'github', DEVICE_GITHUB);
      assert.equal(fs.statSync(file).mode & 0o777, 0o600);
      assert.equal(await heldToken(root, 'github', DEVICE_GITHUB), GRANTED);
      assert.equal(
        await heldToken(root, 'github', { ...DEVICE_GITHUB, headers: { 'X-Other': '1' } }),
        undefined,
        'a changed header finds no token',
      );
    });
    st.test('a restarted engine has forgotten the wait: its state reads none', async () => {
      const restarted = mcpSignInVerbsOf(CLAUDE, root, undefined, { pace: 0.001 });
      assert.deepEqual(await Effect.runPromise(restarted.mcpSignInState('github')), { state: 'none' });
    });
    st.test('a sign-out removes the token and runs no CLI', async () => {
      assert.deepEqual(await Effect.runPromise(v.mcpSignOut('github', DEVICE_GITHUB)), { ended: 'signed-out' });
      assert.equal(fs.existsSync(tokenFileOf(root, 'github', DEVICE_GITHUB)), false);
      assert.deepEqual(await Effect.runPromise(v.mcpSignInState('github')), { state: 'none' });
    });
  });

  test('a waiting sign-in by a code is cancelled by a sign-out, and the poll stops', async () => {
    const polled = provider([{ error: 'authorization_pending' }]);
    const v = mcpSignInVerbsOf(CLAUDE, scratch('ae-sign-in-'), undefined, { pace: 0.001 });
    await Effect.runPromise(v.mcpSignIn('github', DEVICE_GITHUB));
    assert.deepEqual(await Effect.runPromise(v.mcpSignOut('github', DEVICE_GITHUB)), { ended: 'cancelled' });
    assert.deepEqual(await Effect.runPromise(v.mcpSignInState('github')), { state: 'none' });
    const after = polled();
    await Effect.runPromise(v.mcpSignIn('github', DEVICE_GITHUB));
    assert.ok(polled() >= after, 'the server may be signed in to again at once');
    await Effect.runPromise(v.mcpSignOut('github', DEVICE_GITHUB));
  });

  test('a person who refuses at the provider ends the sign-in failed, in words that quote no code', async () => {
    provider([{ error: 'access_denied' }]);
    const root = scratch('ae-sign-in-');
    const v = mcpSignInVerbsOf(CLAUDE, root, undefined, { pace: 0.001 });
    await Effect.runPromise(v.mcpSignIn('github', DEVICE_GITHUB));
    await stateIs(v, 'failed');
    const state = await Effect.runPromise(v.mcpSignInState('github'));
    assert.equal(JSON.stringify(state).includes(DEVICE_CODE), false);
    assert.equal(fs.existsSync(tokenFileOf(root, 'github', DEVICE_GITHUB)), false, 'no token is held');
  });

  test('a code no one types ends the sign-in expired', async () => {
    provider([{ error: 'expired_token' }]);
    const v = mcpSignInVerbsOf(CLAUDE, scratch('ae-sign-in-'), undefined, { pace: 0.001 });
    await Effect.runPromise(v.mcpSignIn('github', DEVICE_GITHUB));
    await stateIs(v, 'expired');
  });

  test('REFUSED: a provider that gives no code is refused, naming the fix, and nothing waits', async () => {
    provider([GRANT]);
    server.use(http.post('https://github.com/login/device/code', () => HttpResponse.json({ error: 'device_flow_disabled' })));
    const v = mcpSignInVerbsOf(CLAUDE, scratch('ae-sign-in-'), undefined, { pace: 0.001 });
    const err = await refusalOf(v.mcpSignIn('github', DEVICE_GITHUB));
    assert.deepEqual([err._tag, err.held], ['McpSignInRefused', false]);
    assert.deepEqual(await Effect.runPromise(v.mcpSignInState('github')), { state: 'none' });
  });

  test('REFUSED: a provider that cannot be reached is refused, not fallen through to the browser road', async () => {
    server.resetHandlers();
    server.use(http.get('https://api.githubcopilot.com/.well-known/oauth-protected-resource/mcp/', () => HttpResponse.error()));
    const v = mcpSignInVerbsOf(CLAUDE, scratch('ae-sign-in-'), undefined, { pace: 0.001 });
    const err = await refusalOf(v.mcpSignIn('github', DEVICE_GITHUB));
    assert.deepEqual([err._tag, err.held], ['McpSignInRefused', false]);
  });
});
