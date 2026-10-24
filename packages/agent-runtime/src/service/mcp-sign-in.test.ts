/**
 * The engine's sign-in verbs (`mcpSignInVerbsOf`) over seams of a test's own: a CLI that writes down what it ran, and a held session
 * whose end a test settles. The real ones spawn Claude Code and wait on a person's browser, which no node test does.
 *
 * What matters: the address is answered before the server connects; the hold is one per callback port, a second refused while the
 * first waits; a sign-in no one approves ends at its bound and reads `expired`; and an engine with no Claude Code harness spawns
 * nothing.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Effect, Exit } from 'effect';
import { story } from '../../test/checkpoints.ts';
import { mcpSignInVerbsOf, SIGN_IN_FOLDER, type McpSignInRefused } from './mcp-sign-in.ts';
import type { HarnessConfig } from './options.ts';
import type { McpCli, McpSignInAsk, SignInSettled } from '../harness/mcp-sign-in.ts';
import type { RemoteMcpServer } from '../harness/seam.ts';
import { scratch } from '../../test/scratch.ts';
import { codex } from '../harness/codex/codex.ts';

const CLAUDE: Record<string, HarnessConfig> = { claude: 'claude' };
const GITHUB: RemoteMcpServer = {
  type: 'http',
  url: 'https://api.githubcopilot.com/mcp/',
  oauth: { clientId: 'Iv23liQBfm9prqhvXkuY', callbackPort: 8791 },
};

/** Seams that record every CLI call and session, each session settled by hand through `settle`. */
const seams = () => {
  const cli: Array<readonly string[]> = [];
  const sessions: Array<{ name: string; cwd: string; redirectUri: string; ended: boolean; settle: (s: SignInSettled) => void }> = [];
  const run: McpCli = async (args) => {
    cli.push(args);
    return { code: 0, out: '' };
  };
  const ask: McpSignInAsk = async (name, _server, { cwd, redirectUri }) => {
    let settle: (s: SignInSettled) => void = () => {};
    const settled = new Promise<SignInSettled>((resolve) => (settle = resolve));
    const s = { name, cwd, redirectUri, ended: false, settle };
    sessions.push(s);
    return { authUrl: `https://github.com/login/oauth/authorize?state=${sessions.length}`, settled, end: () => void (s.ended = true) };
  };
  return { cli, sessions, run, ask };
};

/** Waits until `check` holds, a timer turn at a time, bounded. */
const until = async (check: () => boolean) => {
  for (let i = 0; i < 5000 && !check(); i++) await new Promise((r) => setTimeout(r, 1));
  assert.ok(check(), 'the awaited state never came');
};

/** The refusal `effect` fails with: a verb that succeeds fails the test. */
const refusalOf = <A>(effect: Effect.Effect<A, McpSignInRefused>): Promise<McpSignInRefused> => Effect.runPromise(Effect.flip(effect));

const OTHER: RemoteMcpServer = { ...GITHUB, url: 'https://other.example/mcp' };
const LINEAR: RemoteMcpServer = { ...GITHUB, url: 'https://mcp.linear.app/mcp' };

test('a person signs in with a secret, the server connects, and they sign out again', async (t) => {
  const st = story(t);
  const root = scratch('ae-sign-in-');
  const s = seams();
  const v = mcpSignInVerbsOf(CLAUDE, root, undefined, { cli: s.run, ask: s.ask });

  await st.test('a sign-in stores the secret, answers the address at once and waits', async () => {
    const started = await Effect.runPromise(v.mcpSignIn('github', GITHUB, 'secret'));
    assert.equal(started.authUrl, 'https://github.com/login/oauth/authorize?state=1');
    assert.deepEqual(
      s.cli.map((a) => a[1]),
      ['remove', 'add'],
    );
    assert.equal(s.sessions[0].redirectUri, 'http://localhost:8791/callback', 'the callback the app is registered on');
    assert.equal(s.sessions[0].cwd, `${root}/${SIGN_IN_FOLDER}`, 'the folder the local-scope add filed the server in');
    assert.equal((await Effect.runPromise(v.mcpSignInState('github'))).state, 'waiting');
  });

  await st.test('it reads connected once the server connects, and its session ends', async () => {
    s.sessions[0].settle({ connected: true });
    await until(() => s.sessions[0].ended);
    assert.deepEqual(await Effect.runPromise(v.mcpSignInState('github')), { state: 'connected' });
  });

  await st.test('a sign-out adds the server with no secret, then removes it at local scope, and forgets the state', async () => {
    s.cli.length = 0;
    assert.deepEqual(await Effect.runPromise(v.mcpSignOut('github', GITHUB)), { signedOut: true });
    assert.deepEqual(
      s.cli.map((a) => a[1]),
      ['add', 'remove'],
    );
    assert.equal(s.cli[0].includes('--client-secret'), false, 'the add stores no secret');
    assert.deepEqual(s.cli[1], ['mcp', 'remove', '--scope', 'local', 'github']);
    assert.deepEqual(await Effect.runPromise(v.mcpSignInState('github')), { state: 'none' }, 'the connected state is forgotten');
  });
});

test('a server signed in with no secret runs no CLI, connects, and is signed out by an add then a remove', async (t) => {
  const st = story(t);
  const s = seams();
  const v = mcpSignInVerbsOf(CLAUDE, scratch('ae-sign-in-'), undefined, { cli: s.run, ask: s.ask });

  await st.test('a sign-in handed no secret runs no CLI: the secret of a foreign client is the person’s to store', async () => {
    await Effect.runPromise(v.mcpSignIn('linear', LINEAR));
    assert.deepEqual(s.cli, []);
  });

  await st.test('it connects, and the sign-in filed nothing under the name', async () => {
    s.sessions[0].settle({ connected: true });
    await until(() => s.sessions[0].ended);
    assert.deepEqual(await Effect.runPromise(v.mcpSignInState('linear')), { state: 'connected' });
    assert.equal(s.cli.length, 0, 'the sign-in filed nothing under the name');
  });

  await st.test('a server signed in with no secret, whose sign-in ran no CLI, is signed out by an add then a remove', async () => {
    assert.deepEqual(await Effect.runPromise(v.mcpSignOut('linear', LINEAR)), { signedOut: true });
    assert.deepEqual(
      s.cli.map((a) => [a[1], a.at(-1)]),
      [
        ['add', 'https://mcp.linear.app/mcp'],
        ['remove', 'linear'],
      ],
    );
  });
});

test('a second sign-in on a port a first one holds is refused until the first settles', async (t) => {
  const st = story(t);
  const s = seams();
  const v = mcpSignInVerbsOf(CLAUDE, scratch('ae-sign-in-'), undefined, { cli: s.run, ask: s.ask });
  await Effect.runPromise(v.mcpSignIn('github', GITHUB, 'secret'));

  await st.test('REFUSED: a second sign-in on a held port, naming the one that waits and its port', async () => {
    const err = await refusalOf(v.mcpSignIn('other', OTHER, 'secret'));
    assert.deepEqual([err._tag, err.held], ['McpSignInRefused', true]);
    assert.ok(err.message.includes('`github`'), err.message);
    assert.ok(err.message.includes('port 8791'), err.message);
    assert.equal(s.sessions.length, 1, 'no second session was opened');
  });

  await st.test('REFUSED: a sign-out of a server whose sign-in waits: nothing to sign out of yet', async () => {
    const err = await refusalOf(v.mcpSignOut('github', GITHUB));
    assert.deepEqual([err._tag, err.held], ['McpSignInRefused', true]);
    assert.ok(err.message.includes('`github`'), err.message);
  });

  await st.test('the first sign-in fails, in the words its session gave, and its session ends', async () => {
    s.sessions[0].settle({ connected: false, why: 'refused by the server' });
    await until(() => s.sessions[0].ended);
    assert.deepEqual(await Effect.runPromise(v.mcpSignInState('github')), { state: 'failed', why: 'refused by the server' });
  });

  await st.test('the port is free once the first settled', async () => {
    await Effect.runPromise(v.mcpSignIn('other', OTHER, 'secret'));
    assert.equal(s.sessions.length, 2);
  });
});

test('a sign-in no one approves within its bound is ended and reads expired', async () => {
  const s = seams();
  const v = mcpSignInVerbsOf(CLAUDE, scratch('ae-sign-in-'), undefined, { cli: s.run, ask: s.ask, withinMs: 5 });
  await Effect.runPromise(v.mcpSignIn('github', GITHUB, 'secret'));
  await until(() => s.sessions[0].ended);
  assert.equal((await Effect.runPromise(v.mcpSignInState('github'))).state, 'expired');
});

test('REFUSED: two sign-ins asked at once on one port, the first not yet answered, open one session; the second is refused held', async () => {
  const s = seams();
  let answer = () => {};
  const late = new Promise<void>((r) => (answer = r));
  const slowCli: McpCli = async (args) => {
    s.cli.push(args);
    if (s.cli.length === 1) await late;
    return { code: 0, out: '' };
  };
  const v = mcpSignInVerbsOf(CLAUDE, scratch('ae-sign-in-'), undefined, { cli: slowCli, ask: s.ask });
  const first = Effect.runPromise(v.mcpSignIn('github', GITHUB, 'secret'));
  await until(() => s.cli.length > 0);
  const second = await refusalOf(v.mcpSignIn('other', { ...GITHUB, url: 'https://other.example/mcp' }, 'secret'));
  assert.deepEqual([second._tag, second.held], ['McpSignInRefused', true], 'the port is held from the first child on');
  const out = await refusalOf(v.mcpSignOut('github', GITHUB));
  assert.deepEqual([out._tag, out.held], ['McpSignInRefused', true], 'nothing to sign out of while one is started');
  answer();
  await first;
  assert.equal(s.sessions.length, 1, 'one session listens on the port');
  s.sessions[0].settle({ connected: true });
  await until(() => s.sessions[0].ended);
});

test('mcpSignInVerbsOf: what is refused, and what a refusal leaves behind', async (t) => {
  await t.test('a sign-in whose secret is not stored lets its port go', async () => {
    const s = seams();
    const refusing: McpCli = async (args) => (args[1] === 'add' ? { code: 1, out: 'bad' } : { code: 0, out: '' });
    const v = mcpSignInVerbsOf(CLAUDE, scratch('ae-sign-in-'), undefined, { cli: refusing, ask: s.ask });
    const err = await refusalOf(v.mcpSignIn('github', GITHUB, 'secret'));
    assert.deepEqual([err._tag, err.held], ['McpSignInRefused', false]);
    assert.ok(
      Exit.isSuccess(await Effect.runPromiseExit(v.mcpSignIn('github', GITHUB))),
      'the port was let go, so a sign-in with no secret starts',
    );
  });

  await t.test(
    'REFUSED: an engine with no Claude Code harness signs in and out of nothing, naming its harnesses, and spawns nothing',
    async () => {
      const s = seams();
      const v = mcpSignInVerbsOf({ coder: codex }, scratch('ae-sign-in-'), undefined, { cli: s.run, ask: s.ask });
      for (const verb of [v.mcpSignIn('github', GITHUB, 'secret'), v.mcpSignOut('github', GITHUB)]) {
        const err = await refusalOf<unknown>(verb);
        assert.deepEqual([err._tag, err.held], ['McpSignInRefused', false]);
        assert.ok(err.message.includes('no Claude Code harness'), err.message);
        assert.ok(err.message.includes('coder'), err.message);
      }
      assert.deepEqual([s.cli, s.sessions.length], [[], 0]);
    },
  );
});
