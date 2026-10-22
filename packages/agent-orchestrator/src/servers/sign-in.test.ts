/**
 * A factory's server signed in to and out of (`sign-in.verb.ts`), over the runtime's stand-in, which records whether a secret was
 * handed and never its value.
 *
 * The rule the card rests on is the secret's: a server of the client Nemia ships is handed its secret, and the fixture that breaks it is
 * the same server under a foreign client id, which is handed none. And each refusal by its kind: a server the record does not hold is
 * `Missing`, a callback port another sign-in waits on is `Conflict`.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { testEngine } from 'agent-runtime/testing';
import { scratch } from '../../test/scratch.ts';

const ROOT = scratch('wf-sign-in-');
process.env.WF_ROOT = ROOT;
const { engineOf, runWith } = await import('../runtime-client.ts');
const { serverSignIn, serverSignInState, serverSignOut } = await import('./sign-in.verb.ts');
const { writeFactoryServers } = await import('./servers.store.ts');
const { SHIPPED_CLIENT_SECRETS, shippedSecretOf } = await import('./clients.ts');
const { DEFAULT_FACTORY } = await import('../factory/factory.ts');

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

test("Nemia's own client is shipped with a secret, and a client Nemia does not ship has none", () => {
  assert.equal(typeof SHIPPED_CLIENT_SECRETS[NEMIA], 'string');
  assert.ok(shippedSecretOf(NEMIA)!.length > 0);
  assert.equal(shippedSecretOf('Iv23liSomeoneElse'), undefined);
  assert.equal(shippedSecretOf(undefined), undefined);
  assert.equal(shippedSecretOf('toString'), undefined, "a name on Object's prototype is no client");
});

test('a sign-in to the shipped server hands the engine its secret; the same server under a foreign client hands none', async () => {
  const engine = testEngine();
  writeFactoryServers(ROOT, DEFAULT_FACTORY, {
    github: GITHUB,
    other: { ...GITHUB, oauth: { clientId: 'Iv23liForeign', callbackPort: 8792 } },
  });
  const started = await runWith(engineOf(engine.layer), serverSignIn(DEFAULT_FACTORY, 'github', ROOT));
  assert.match(started.authUrl, /client_id=Iv23liQBfm9prqhvXkuY/);
  await runWith(engineOf(engine.layer), serverSignIn(DEFAULT_FACTORY, 'other', ROOT));
  assert.deepEqual(engine.signIns, [
    { name: 'github', secret: true },
    { name: 'other', secret: false },
  ]);
  assert.equal(JSON.stringify(started).includes(SHIPPED_CLIENT_SECRETS[NEMIA]), false, 'no answer carries the secret');
  const state = await runWith(engineOf(engine.layer), serverSignInState(DEFAULT_FACTORY, 'github', ROOT));
  assert.equal(state.state, 'waiting');
});

test('REFUSED: a server the record does not hold is Missing, and a port another sign-in waits on is a Conflict', async () => {
  const engine = testEngine();
  writeFactoryServers(ROOT, DEFAULT_FACTORY, { github: GITHUB, twin: { ...GITHUB, url: 'https://twin.example/mcp' } });
  const missing = await refusal(runWith(engineOf(engine.layer), serverSignIn(DEFAULT_FACTORY, 'gitlab', ROOT)));
  assert.equal(missing._tag, 'Missing');
  assert.match(missing.message, /records no server `gitlab`.*nemia factory server add/);
  await runWith(engineOf(engine.layer), serverSignIn(DEFAULT_FACTORY, 'github', ROOT));
  const held = await refusal(runWith(engineOf(engine.layer), serverSignIn(DEFAULT_FACTORY, 'twin', ROOT)));
  assert.equal(held._tag, 'Conflict');
  const noClient = await refusal(
    (async () => {
      writeFactoryServers(ROOT, DEFAULT_FACTORY, { docs: { type: 'http', url: 'https://docs.example/mcp' } });
      return runWith(engineOf(engine.layer), serverSignIn(DEFAULT_FACTORY, 'docs', ROOT));
    })(),
  );
  assert.equal(noClient._tag, 'Invalid', 'a server with no OAuth client signs in to nothing');
});

test('a sign-out asks the engine to clear the server, and is refused while its sign-in waits', async () => {
  const engine = testEngine();
  writeFactoryServers(ROOT, DEFAULT_FACTORY, { github: GITHUB });
  await runWith(engineOf(engine.layer), serverSignIn(DEFAULT_FACTORY, 'github', ROOT));
  const waiting = await refusal(runWith(engineOf(engine.layer), serverSignOut(DEFAULT_FACTORY, 'github', ROOT)));
  assert.equal(waiting._tag, 'Conflict');
  engine.settleSignIn('github', { state: 'connected' });
  assert.deepEqual(await runWith(engineOf(engine.layer), serverSignOut(DEFAULT_FACTORY, 'github', ROOT)), { signedOut: true });
  assert.deepEqual(engine.signOuts, ['github']);
});
