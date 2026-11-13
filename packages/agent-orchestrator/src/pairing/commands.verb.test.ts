/**
 * `nemia pairings ls`, `nemia pairings approve` and `nemia board link` at the server's shell, each run on its entry's handler
 * (`test/typed.ts`) on a scratch store: a pairing a client asked for is approved by the code it shows and claimed after, a link is
 * minted under the board's address or `--base`, and nothing answered holds a token. What the client prints of them is `apps/cli`'s
 * `rest.test.ts`'s. Refusals are asserted by their kind, never by their sentence.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { scratch } from 'test-kit/scratch';
import { typed } from '../../test/typed.ts';
import type { Env } from '../config/config.store.ts';
import { personTokens } from '../token/token.store.ts';
import { pairingAsked } from './pairing.store.ts';
import { boardBase, linkClaimed, pairingClaimed } from './commands.verb.ts';

const ROOT = scratch('wf-pairing-verbs-');
const ENV: Env = { ...process.env, WF_ROOT: ROOT };

/** `argv` run on its entry's handler over this file's store: what it answers, as JSON. */
const answered = async (argv: readonly string[]): Promise<string> =>
  JSON.stringify(await typed(argv, undefined, undefined, undefined, ENV));

test('nemia pairings approve <code> approves the pairing the client shows, which it claims after; ls lists it by client', async () => {
  const asked = pairingAsked(ROOT, 'approved-laptop', Date.now());
  assert.equal(pairingClaimed(ROOT, asked.id, asked.secret, Date.now()).phase, 'waiting');
  const listed = await answered(['pairings', 'ls']);
  assert.match(listed, /approved-laptop/);
  assert.match(listed, /waiting/);
  assert.ok(!listed.includes(asked.code) && !listed.includes(asked.secret), 'neither the code nor the secret is listed');
  await answered(['pairings', 'approve', asked.code]);
  const claimed = pairingClaimed(ROOT, asked.id, asked.secret, Date.now());
  assert.equal(claimed.phase, 'claimed');
  assert.equal(claimed.name, 'approved-laptop');
  await assert.rejects(typed(['pairings', 'approve', asked.code], undefined, undefined, undefined, ENV), (err: unknown) => {
    const refused = err as { _tag?: string; exitCode?: number };
    return refused._tag === 'Conflict' && refused.exitCode === 2;
  });
  await assert.rejects(typed(['pairings', 'approve', 'ZZZZ-ZZZZ'], undefined, undefined, undefined, ENV), (err: unknown) => {
    const refused = err as { _tag?: string; exitCode?: number };
    return refused._tag === 'Missing' && refused.exitCode === 2;
  });
});

test('nemia board link mints a link of the board under its address, or under --base, which the browser claims once; no token', async () => {
  const printed = await answered(['board', 'link']);
  const url = new URL((JSON.parse(printed) as { url: string }).url);
  assert.ok(url.searchParams.has('link'));
  assert.equal(`${url.origin}/`, new URL(boardBase(undefined, process.env)).href, "no api ticks this store: the process's bind and port");
  const based = await answered(['board', 'link', '--base', 'http://box.tailnet:9000']);
  const other = new URL((JSON.parse(based) as { url: string }).url);
  assert.equal(other.origin, 'http://box.tailnet:9000');
  const claimed = linkClaimed(ROOT, other.searchParams.get('link') ?? '', Date.now());
  assert.ok(personTokens(ROOT).some((p) => p.name === claimed.name));
  assert.ok(![printed, based].some((answer) => answer.includes(claimed.token)), 'no answer holds a token');
});

test("the board's address: the lease's url where an api ticks, else NEMIA_BIND's address and PORT, a wildcard as the loopback", () => {
  assert.equal(boardBase('http://100.64.0.7:8790', {}), 'http://100.64.0.7:8790');
  assert.equal(boardBase(undefined, {}), 'http://127.0.0.1:8787');
  assert.equal(boardBase(undefined, { NEMIA_BIND: '100.64.0.7', PORT: '9000' }), 'http://100.64.0.7:9000');
  assert.equal(boardBase(undefined, { NEMIA_BIND: '0.0.0.0' }), 'http://127.0.0.1:8787');
  assert.equal(boardBase(undefined, { NEMIA_BIND: 'fd7a::1' }), 'http://[fd7a::1]:8787');
});
