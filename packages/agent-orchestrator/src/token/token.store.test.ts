/**
 * A person's tokens on the store's disk: minted once under a name and answered once, kept as the record its digest names and never in
 * the clear, readable by its owner alone in a folder only its owner opens; listed by name and date, never by digest; and removed by
 * name. Refusals are asserted by their kind and exit code, never by their sentence. Who a request presenting one is, before and after
 * its removal, is `test/session-token.test.ts`'s.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { scratch } from 'test-kit/scratch';
import { Conflict, Invalid, Missing } from '../refusal/refusal.ts';
import { mintPersonToken, personTokenOf, personTokens, personTokensDir, revokePersonToken, tokenDigest } from './token.store.ts';

const ROOT = scratch('wf-person-tokens-');

/** A store of its own under the scratch root, so each test reads only the tokens it minted. */
const aStore = (): string => fs.mkdtempSync(path.join(ROOT, 'store-'));

/** Whether `act` throws the refusal `kind`, exit 2. */
const refusedAs = (act: () => unknown, kind: typeof Conflict | typeof Missing | typeof Invalid) =>
  assert.throws(act, (err: unknown) => err instanceof kind && err.exitCode === 2);

test("a person's token is answered once, and its file holds no byte of it, readable by its owner alone", () => {
  const home = aStore();
  const token = mintPersonToken(home, 'laptop');
  assert.match(token, /^[A-Za-z0-9_-]{43}$/, '32 random bytes in base64url');
  const dir = personTokensDir(home);
  const files = fs.readdirSync(dir);
  assert.deepEqual(files, [`${tokenDigest(token)}.json`], 'one record, named by its digest, and no hidden file left');
  const text = fs.readFileSync(path.join(dir, files[0] ?? ''), 'utf8');
  assert.ok(!text.includes(token), 'the record holds no byte of the token');
  const record = JSON.parse(text) as { name: string; createdAt: string };
  assert.deepEqual(Object.keys(record).sort(), ['createdAt', 'name']);
  assert.equal(record.name, 'laptop');
  assert.ok(!Number.isNaN(Date.parse(record.createdAt)), 'createdAt is a date');
  assert.equal(fs.statSync(path.join(dir, files[0] ?? '')).mode & 0o777, 0o600, 'the record is its owner alone');
  assert.equal(fs.statSync(dir).mode & 0o777, 0o700, 'the folder is opened by its owner alone');
  assert.deepEqual(personTokenOf(home, tokenDigest(token)), record, 'read again by its digest');
  assert.equal(personTokenOf(home, tokenDigest('never-minted')), null, 'a digest the store holds no record of is none');
});

test('REFUSED: a name already used is a Conflict, and a name that is no name is Invalid; neither writes', () => {
  const home = aStore();
  mintPersonToken(home, 'laptop');
  refusedAs(() => mintPersonToken(home, 'laptop'), Conflict);
  for (const name of ['', ' ', '-x', 'a b', 'a/b', 'x'.repeat(64)]) refusedAs(() => mintPersonToken(home, name), Invalid);
  assert.equal(fs.readdirSync(personTokensDir(home)).length, 1, 'only the first token was written');
});

test('the tokens are listed by name and date, never by digest', () => {
  const home = aStore();
  assert.deepEqual(personTokens(home), [], 'a store that minted none lists none');
  const first = mintPersonToken(home, 'phone');
  const second = mintPersonToken(home, 'laptop');
  const listed = personTokens(home);
  assert.deepEqual(
    listed.map((t) => t.name),
    ['laptop', 'phone'],
    'by name',
  );
  for (const entry of listed) assert.deepEqual(Object.keys(entry).sort(), ['createdAt', 'name']);
  const text = JSON.stringify(listed);
  for (const token of [first, second]) {
    assert.ok(!text.includes(token), 'no token');
    assert.ok(!text.includes(tokenDigest(token)), 'no digest');
  }
});

test('a token removed by its name is gone; REFUSED: a name the store holds no token under is Missing', () => {
  const home = aStore();
  const token = mintPersonToken(home, 'laptop');
  const kept = mintPersonToken(home, 'phone');
  assert.equal(revokePersonToken(home, 'laptop').name, 'laptop');
  assert.equal(personTokenOf(home, tokenDigest(token)), null);
  assert.equal(personTokenOf(home, tokenDigest(kept))?.name, 'phone', 'the other token stands');
  refusedAs(() => revokePersonToken(home, 'laptop'), Missing);
  refusedAs(() => revokePersonToken(aStore(), 'laptop'), Missing);
  assert.equal(mintPersonToken(home, 'laptop').length, 43, 'a name removed may be used again');
});
