/**
 * `nemia pairings ls`, `nemia pairings approve` and `nemia board link` at the server's shell, through the CLI on a scratch store: a
 * pairing a client asked for is approved by the code it shows and claimed after, a link is printed under the board's address or
 * `--base`, and no line printed holds a token. Refusals are asserted by their kind, never by their sentence.
 */
import { test, type TestContext } from 'node:test';
import assert from 'node:assert/strict';
import { scratch } from 'test-kit/scratch';
import { main } from '../cli/main.ts';
import type { Env } from '../config/config.store.ts';
import { personTokens } from '../token/token.store.ts';
import { pairingAsked } from './pairing.store.ts';
import { boardBase, linkClaimed, pairingClaimed } from './commands.verb.ts';

const ROOT = scratch('wf-pairing-verbs-');
const ENV: Env = { ...process.env, WF_ROOT: ROOT };

/** What `argv` printed on stdout through the CLI, line by line. */
const printedBy = async (t: TestContext, argv: string[]): Promise<string[]> => {
  const lines: string[] = [];
  const log = t.mock.method(console, 'log', (...args: unknown[]) => {
    lines.push(args.join(' '));
  });
  try {
    await main(argv, undefined, undefined, undefined, ENV);
  } finally {
    log.mock.restore();
  }
  return lines;
};

test('nemia pairings approve <code> approves the pairing the client shows, which it claims after; ls lists it by client', async (t) => {
  const asked = pairingAsked(ROOT, 'approved-laptop', Date.now());
  assert.equal(pairingClaimed(ROOT, asked.id, asked.secret, Date.now()).phase, 'waiting');
  const listed = (await printedBy(t, ['pairings', 'ls'])).join('\n');
  assert.match(listed, /approved-laptop/);
  assert.match(listed, /waiting/);
  assert.ok(!listed.includes(asked.code) && !listed.includes(asked.secret), 'neither the code nor the secret is listed');
  await printedBy(t, ['pairings', 'approve', asked.code]);
  const claimed = pairingClaimed(ROOT, asked.id, asked.secret, Date.now());
  assert.equal(claimed.phase, 'claimed');
  assert.equal(claimed.name, 'approved-laptop');
  await assert.rejects(main(['pairings', 'approve', asked.code], undefined, undefined, undefined, ENV), (err: unknown) => {
    const refused = err as { _tag?: string; exitCode?: number };
    return refused._tag === 'Conflict' && refused.exitCode === 2;
  });
  await assert.rejects(main(['pairings', 'approve', 'ZZZZ-ZZZZ'], undefined, undefined, undefined, ENV), (err: unknown) => {
    const refused = err as { _tag?: string; exitCode?: number };
    return refused._tag === 'Missing' && refused.exitCode === 2;
  });
});

test('nemia board link prints a link of the board under its address, or under --base, which the browser claims once; no token', async (t) => {
  const printed = await printedBy(t, ['board', 'link']);
  const url = new URL(printed.find((line) => line.includes('?link=')) ?? '');
  assert.equal(`${url.origin}/`, new URL(boardBase(undefined, process.env)).href, "no api ticks this store: the process's bind and port");
  const based = await printedBy(t, ['board', 'link', '--base', 'http://box.tailnet:9000']);
  const other = new URL(based.find((line) => line.includes('?link=')) ?? '');
  assert.equal(other.origin, 'http://box.tailnet:9000');
  const claimed = linkClaimed(ROOT, other.searchParams.get('link') ?? '', Date.now());
  assert.ok(personTokens(ROOT).some((p) => p.name === claimed.name));
  assert.ok(!printed.concat(based).some((line) => line.includes(claimed.token)), 'no line holds a token');
});

test("the board's address: the lease's url where an api ticks, else NEMIA_BIND's address and PORT, a wildcard as the loopback", () => {
  assert.equal(boardBase('http://100.64.0.7:8790', {}), 'http://100.64.0.7:8790');
  assert.equal(boardBase(undefined, {}), 'http://127.0.0.1:8787');
  assert.equal(boardBase(undefined, { NEMIA_BIND: '100.64.0.7', PORT: '9000' }), 'http://100.64.0.7:9000');
  assert.equal(boardBase(undefined, { NEMIA_BIND: '0.0.0.0' }), 'http://127.0.0.1:8787');
  assert.equal(boardBase(undefined, { NEMIA_BIND: 'fd7a::1' }), 'http://[fd7a::1]:8787');
});
