/**
 * The tickets on the store's disk: a pairing asked, approved by its code and claimed with its secret, and a first-visit link minted and
 * claimed, each answering a person's token once, minted at the claim and named after its client. No file holds a code, a secret or a
 * token. The clock is seeded (`nowMs`), never waited on. Refusals are asserted by their kind and exit code, never by their sentence.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { scratch } from 'test-kit/scratch';
import { Conflict, Invalid, Missing } from '../refusal/refusal.ts';
import { mintPersonToken, personTokenOf, personTokens, tokenDigest } from '../token/token.store.ts';
import { linkMinted, linksDir, pairingApproved, pairingAsked, pairingsDir, pairingsListed } from './pairing.store.ts';
import { linkClaimed, pairingClaimed } from './commands.verb.ts';
import { LINK_TTL_MS, PAIRING_TTL_MS } from './ticket.ts';

const ROOT = scratch('wf-pairings-');

/** A store of its own under the scratch root, so each test reads only the tickets it made. */
const aStore = (): string => fs.mkdtempSync(path.join(ROOT, 'store-'));

/** A moment of the clock, a whole number of ms. */
const T0 = Date.parse('2026-11-12T09:00:00.000Z');

/** Whether `act` throws the refusal `kind`, exit 2. */
const refusedAs = (act: () => unknown, kind: typeof Conflict | typeof Missing | typeof Invalid) =>
  assert.throws(act, (err: unknown) => err instanceof kind && err.exitCode === 2);

/** Every file's text under `dir`, hidden ones included. */
const textsUnder = (dir: string): string[] =>
  fs.existsSync(dir) ? fs.readdirSync(dir).map((name) => fs.readFileSync(path.join(dir, name), 'utf8')) : [];

test('a pairing asked, approved by its code and claimed answers a token of the person, named after its client, once', () => {
  const home = aStore();
  const asked = pairingAsked(home, 'laptop', T0);
  assert.match(asked.code, /^[2-9A-HJKMNP-Z]{4}-[2-9A-HJKMNP-Z]{4}$/, 'XXXX-XXXX, of an alphabet with no 0, O, 1, I or L');
  assert.equal(asked.expiresAt, new Date(T0 + PAIRING_TTL_MS).toISOString());
  const atRest = (): string[] => [...textsUnder(pairingsDir(home)), ...textsUnder(linksDir(home))];
  assert.ok(!atRest().some((t) => t.includes(asked.secret) || t.includes(asked.code.replace('-', ''))), 'no code nor secret at rest');
  assert.deepEqual(pairingClaimed(home, asked.id, asked.secret, T0 + 1), { phase: 'waiting' }, 'unapproved, it waits');
  assert.deepEqual(
    pairingsListed(home, T0 + 1).pairings.map((p) => [p.id, p.client, p.phase]),
    [[asked.id, 'laptop', 'waiting']],
  );
  const approved = pairingApproved(home, asked.code.toLowerCase().replace('-', ''), T0 + 2);
  assert.equal(approved.phase, 'claimable', 'matched in lower case and with no dash');
  const claimed = pairingClaimed(home, asked.id, asked.secret, T0 + 3);
  assert.equal(claimed.phase, 'claimed');
  assert.equal(claimed.name, 'laptop');
  assert.deepEqual(personTokenOf(home, tokenDigest(claimed.token ?? '')), { name: 'laptop', createdAt: new Date(T0 + 3).toISOString() });
  refusedAs(() => pairingClaimed(home, asked.id, asked.secret, T0 + 4), Conflict);
  assert.deepEqual(
    personTokens(home).map((t) => t.name),
    ['laptop'],
    'one token for one pairing',
  );
  assert.equal(pairingsListed(home, T0 + 5).pairings[0]?.phase, 'claimed');
  for (const text of atRest()) {
    assert.ok(!text.includes(asked.secret), 'no secret at rest');
    assert.ok(!text.includes(asked.code) && !text.includes(asked.code.replace('-', '')), 'no code at rest');
    assert.ok(!text.includes(claimed.token ?? '-'), 'no token at rest');
  }
});

test("a client's name already a token's is made unique with -2, -3", () => {
  const home = aStore();
  mintPersonToken(home, 'laptop');
  const names = [1, 2].map((i) => {
    const asked = pairingAsked(home, 'laptop', T0 + i);
    pairingApproved(home, asked.code, T0 + i);
    return pairingClaimed(home, asked.id, asked.secret, T0 + i).name;
  });
  assert.deepEqual(names, ['laptop-2', 'laptop-3']);
});

test('REFUSED: an unknown pairing, a wrong secret, a claim past its time, an approval past it or of no code, a name no token takes', () => {
  const home = aStore();
  const asked = pairingAsked(home, 'laptop', T0);
  refusedAs(() => pairingClaimed(home, 'nosuch', asked.secret, T0), Missing);
  refusedAs(() => pairingClaimed(home, '../x', asked.secret, T0), Missing);
  refusedAs(() => pairingClaimed(home, asked.id, `${asked.secret}x`, T0), Missing);
  refusedAs(() => pairingApproved(home, 'AAAA-AAAA', T0), Missing);
  refusedAs(() => pairingApproved(home, 'not a code', T0), Missing);
  refusedAs(() => pairingApproved(home, asked.code, T0 + PAIRING_TTL_MS), Conflict);
  assert.equal(pairingsListed(home, T0 + PAIRING_TTL_MS).pairings[0]?.phase, 'expired');

  const late = pairingAsked(home, 'phone', T0);
  pairingApproved(home, late.code, T0 + 1);
  refusedAs(() => pairingClaimed(home, late.id, late.secret, T0 + PAIRING_TTL_MS), Conflict);
  for (const name of ['', 'a b', '-x', 'x'.repeat(57)]) refusedAs(() => pairingAsked(home, name, T0), Invalid);
  assert.deepEqual(personTokens(home), [], 'no token was minted');
});

test('a first-visit link is claimed once within its time, its token named board-<day>; the store keeps its digest alone', () => {
  const home = aStore();
  const minted = linkMinted(home, 'http://100.64.0.7:8787/', T0);
  const url = new URL(minted.url);
  assert.equal(url.origin, 'http://100.64.0.7:8787');
  const secret = url.searchParams.get('link') ?? '';
  assert.match(secret, /^[A-Za-z0-9_-]{43}$/);
  assert.equal(minted.expiresAt, new Date(T0 + LINK_TTL_MS).toISOString());
  assert.ok(!textsUnder(linksDir(home)).some((t) => t.includes(secret)), 'no secret at rest');
  refusedAs(() => linkClaimed(home, 'nosuch', T0), Missing);
  for (const base of ['box:8787', 'ftp://box', 'not a url']) refusedAs(() => linkMinted(home, base, T0), Invalid);
  const claimed = linkClaimed(home, secret, T0 + 1);
  assert.equal(claimed.name, 'board-2026-11-12');
  assert.equal(personTokenOf(home, tokenDigest(claimed.token))?.name, 'board-2026-11-12');
  assert.ok(!textsUnder(linksDir(home)).some((t) => t.includes(claimed.token)), 'no token at rest');
  refusedAs(() => linkClaimed(home, secret, T0 + 2), Conflict);
  const lapsed = new URL(linkMinted(home, 'http://127.0.0.1:8787', T0).url).searchParams.get('link') ?? '';
  refusedAs(() => linkClaimed(home, lapsed, T0 + LINK_TTL_MS), Conflict);
  assert.deepEqual(
    personTokens(home).map((t) => t.name),
    ['board-2026-11-12'],
  );
});

test('a ticket past its time by more than a day is swept as the next is made', () => {
  const home = aStore();
  pairingAsked(home, 'old', T0);
  linkMinted(home, 'http://127.0.0.1:8787', T0);
  const later = T0 + PAIRING_TTL_MS + 24 * 60 * 60_000;
  pairingAsked(home, 'new', later);
  linkMinted(home, 'http://127.0.0.1:8787', later);
  assert.deepEqual(
    pairingsListed(home, later).pairings.map((p) => p.client),
    ['new'],
  );
  assert.equal(fs.readdirSync(linksDir(home)).length, 1);
});
