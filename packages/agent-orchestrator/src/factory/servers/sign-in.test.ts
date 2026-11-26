/**
 * A factory's server signed in to and out of (`sign-in.verb.ts`), over the runtime's stand-in, which records the road each sign-in took
 * and is handed no secret by anyone.
 *
 * The rules: the engine is asked with the server alone — no secret is handed, since Nemia ships none; a server with no callback port
 * is answered a code, one with a port an address; and each refusal by its kind: a server the record does not hold is `Missing`, a
 * callback port another sign-in waits on is `Conflict`, as is a callback pasted where none waits, and a pasted address that is not the
 * sign-in's redirect is `Invalid`. A sign-out of a waiting sign-in cancels it.
 */
import { test } from 'vitest';
import assert from 'node:assert/strict';
import { testEngine } from 'agent-runtime/testing';
import { scratch } from 'test-kit/scratch';
import { engineOf, runWith } from '../../runtime-client.ts';
import { serverSignIn, serverSignInCallback, serverSignInState, serverSignOut } from './sign-in.verb.ts';
import { writeFactoryServers } from '../../../testing.ts';
import { DEFAULT_NAMESPACE } from '../factory.ts';
import { libraryAddsFile, writeLibraryAdds } from '../../library/library.store.ts';
import { writeFileSync } from 'node:fs';

const ROOT = scratch('wf-sign-in-');

const NEMIA = 'Iv23liQBfm9prqhvXkuY';
const GITHUB = {
  type: 'http',
  url: 'https://api.githubcopilot.com/mcp/',
  headers: { 'X-MCP-Toolsets': 'context,repos,issues,pull_requests,users,actions' },
  oauth: { clientId: NEMIA, callbackPort: 8791 },
} as const;

/** What a refused program failed with: its tag and its message. */
const refusal = (p: Promise<unknown>) =>
  p.then(
    (v) => assert.fail(`resolved with ${JSON.stringify(v)}`),
    (e: { _tag?: string; message: string }) => e,
  );

test('a sign-in is asked of the engine with the server alone, and answers a code where the server names no callback port', async () => {
  const engine = testEngine();
  writeFactoryServers(ROOT, DEFAULT_NAMESPACE, {
    github: { ...GITHUB, oauth: { clientId: NEMIA } },
    other: { ...GITHUB, oauth: { clientId: 'Iv23liForeign', callbackPort: 8792 } },
  });
  const started = await runWith(engineOf(engine.layer), serverSignIn(DEFAULT_NAMESPACE, 'github', ROOT));
  assert.equal(started.route, 'device');
  assert.equal(started.route === 'device' && started.userCode.length > 0, true);
  const browser = await runWith(engineOf(engine.layer), serverSignIn(DEFAULT_NAMESPACE, 'other', ROOT));
  assert.equal(browser.route === 'browser' && /client_id=Iv23liForeign/.test(browser.authUrl), true);
  assert.deepEqual(engine.signIns, [
    { name: 'github', route: 'device' },
    { name: 'other', route: 'browser' },
  ]);
  const state = await runWith(engineOf(engine.layer), serverSignInState(DEFAULT_NAMESPACE, 'github', ROOT));
  assert.deepEqual([state.state, state.started], ['waiting', started], 'a page opened later reads what the sign-in answered');
});

test('REFUSED: a server the record does not hold is Missing, and a port another sign-in waits on is a Conflict', async () => {
  const engine = testEngine();
  writeFactoryServers(ROOT, DEFAULT_NAMESPACE, { github: GITHUB, twin: { ...GITHUB, url: 'https://twin.example/mcp' } });
  const missing = await refusal(runWith(engineOf(engine.layer), serverSignIn(DEFAULT_NAMESPACE, 'gitlab', ROOT)));
  assert.equal(missing._tag, 'Missing');
  assert.match(missing.message, /records no server `gitlab`.*nemia factory server add/);
  await runWith(engineOf(engine.layer), serverSignIn(DEFAULT_NAMESPACE, 'github', ROOT));
  const held = await refusal(runWith(engineOf(engine.layer), serverSignIn(DEFAULT_NAMESPACE, 'twin', ROOT)));
  assert.equal(held._tag, 'Conflict');
  const noClient = await refusal(
    (async () => {
      writeFactoryServers(ROOT, DEFAULT_NAMESPACE, { docs: { type: 'http', url: 'https://docs.example/mcp' } });
      return runWith(engineOf(engine.layer), serverSignIn(DEFAULT_NAMESPACE, 'docs', ROOT));
    })(),
  );
  assert.equal(noClient._tag, 'Invalid', 'a server with no OAuth client signs in to nothing');
});

test('a sign-out cancels a waiting sign-in, and signs a settled one out', async () => {
  const engine = testEngine();
  writeFactoryServers(ROOT, DEFAULT_NAMESPACE, { github: GITHUB });
  await runWith(engineOf(engine.layer), serverSignIn(DEFAULT_NAMESPACE, 'github', ROOT));
  assert.deepEqual(await runWith(engineOf(engine.layer), serverSignOut(DEFAULT_NAMESPACE, 'github', ROOT)), { ended: 'cancelled' });
  await runWith(engineOf(engine.layer), serverSignIn(DEFAULT_NAMESPACE, 'github', ROOT));
  engine.settleSignIn('github', { state: 'connected' });
  assert.deepEqual(await runWith(engineOf(engine.layer), serverSignOut(DEFAULT_NAMESPACE, 'github', ROOT)), { ended: 'signed-out' });
  assert.deepEqual(engine.signOuts, ['github', 'github']);
});

test('a pasted callback completes a waiting sign-in; refused by kind where none waits or the address is not its redirect', async () => {
  const engine = testEngine();
  writeFactoryServers(ROOT, DEFAULT_NAMESPACE, { github: GITHUB });
  const PASTED = 'http://localhost:8791/callback?code=a-code&state=a-state';
  const none = await refusal(runWith(engineOf(engine.layer), serverSignInCallback(DEFAULT_NAMESPACE, 'github', PASTED, ROOT)));
  assert.equal(none._tag, 'Conflict', 'no sign-in waits');
  const missing = await refusal(runWith(engineOf(engine.layer), serverSignInCallback(DEFAULT_NAMESPACE, 'gitlab', PASTED, ROOT)));
  assert.equal(missing._tag, 'Missing');
  await runWith(engineOf(engine.layer), serverSignIn(DEFAULT_NAMESPACE, 'github', ROOT));
  const elsewhere = 'http://localhost:9999/callback?code=a-code&state=a-state';
  const wrong = await refusal(runWith(engineOf(engine.layer), serverSignInCallback(DEFAULT_NAMESPACE, 'github', elsewhere, ROOT)));
  assert.equal(wrong._tag, 'Invalid');
  assert.equal(wrong.message.includes('a-code'), false, 'the pasted address is in no refusal');
  assert.deepEqual(engine.callbacks, [], 'nothing handed on');
  const state = await runWith(engineOf(engine.layer), serverSignInCallback(DEFAULT_NAMESPACE, 'github', PASTED, ROOT));
  assert.equal(state.state, 'waiting');
  assert.deepEqual(engine.callbacks, [{ name: 'github', url: PASTED }]);
  engine.settleSignIn('github', { state: 'connected' });
  assert.deepEqual(await runWith(engineOf(engine.layer), serverSignInState(DEFAULT_NAMESPACE, 'github', ROOT)), { state: 'connected' });
});

test('a server the factory added from the library is signed in to by its name', async () => {
  const home = scratch('wf-sign-in-added-');
  const engine = testEngine();
  writeLibraryAdds(home, DEFAULT_NAMESPACE, [{ kind: 'McpServer', name: 'github' }]);
  await runWith(engineOf(engine.layer), serverSignIn(DEFAULT_NAMESPACE, 'github', home));
  assert.deepEqual(engine.signIns, [{ name: 'github', route: 'device' }], 'the builtin names no callback port');
  writeLibraryAdds(home, DEFAULT_NAMESPACE, []);
  const gone = await refusal(runWith(engineOf(engine.layer), serverSignIn(DEFAULT_NAMESPACE, 'github', home)));
  assert.equal(gone._tag, 'Missing', 'the add taken off, nothing holds the server');
  writeFileSync(libraryAddsFile(home, DEFAULT_NAMESPACE), '{ not json');
  const broken = await refusal(runWith(engineOf(engine.layer), serverSignIn(DEFAULT_NAMESPACE, 'github', home)));
  assert.equal(broken._tag, 'Invalid', 'a broken record of the adds is said, never read as no adds');
  assert.deepEqual(engine.signIns, [{ name: 'github', route: 'device' }], 'and nothing more is signed in');
});
