/**
 * A person's tokens in the store's keyspace: minted once under a name and answered once, kept as the record its digest names and never in
 * the clear, in a keyspace readable by its owner alone in a folder only its owner opens; listed by name and date, never by digest; two
 * mints of one name at once making one token and one `Conflict`; removed by name; and a token file of before the keyspace imported.
 * Refusals are asserted by their kind and exit code, never by their sentence. Who a request presenting one is, before and after its
 * removal, is `test/session-token.test.ts`'s. And the store's credential, as the daemon puts it in place at its start: the file
 * written 0600 holding a token the store keeps as the person's under `local`; a live one left as it is; and a new one minted where the
 * file's token was retired, is an agent's, or the file holds no token at all.
 */
import { test } from 'vitest';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { scratch } from 'test-kit/scratch';
import { seamUses, sourcesUnder } from 'test-kit/debt';
import { Effect } from 'effect';
import { Conflict, Invalid, Missing } from '../refusal/refusal.ts';
import { keyspaceFile } from '../keyspace/keyspace.store.ts';
import { acted } from '../../test/door-walks.ts';
import { keysUnder, recordText } from '../../testing.ts';
import {
  credentialFile,
  credentialKeptNow,
  holderOf,
  mintPersonToken,
  personTokenOf,
  personTokens,
  revokePersonToken,
  tokenDigest,
  TokenDoor,
  tokenDoorAt,
} from './token.store.ts';

const ROOT = scratch('wf-person-tokens-');

/** A store of its own under the scratch root, so each test reads only the tokens it minted. */
const aStore = () => fs.mkdtempSync(path.join(ROOT, 'store-'));

/** Whether `act` throws the refusal `kind`, exit 2. */
const refusedAs = (act: () => unknown, kind: typeof Conflict | typeof Missing | typeof Invalid) =>
  assert.throws(act, (err: unknown) => err instanceof kind && err.exitCode === 2);

test("a person's token is answered once, and its record holds no byte of it, in a keyspace readable by its owner alone", () => {
  const home = aStore();
  const token = mintPersonToken(home, 'laptop');
  assert.match(token, /^[A-Za-z0-9_-]{43}$/, '32 random bytes in base64url');
  assert.deepEqual(
    keysUnder(home, '/registry/persontokens/'),
    [`/registry/persontokens/${tokenDigest(token)}`],
    'one record, by its digest',
  );
  const text = recordText(home, `/registry/persontokens/${tokenDigest(token)}`) ?? '';
  assert.ok(!text.includes(token), 'the record holds no byte of the token');
  const record = JSON.parse(text) as { name: string; createdAt: string };
  assert.deepEqual(Object.keys(record).sort(), ['createdAt', 'name']);
  assert.equal(record.name, 'laptop');
  assert.ok(!Number.isNaN(Date.parse(record.createdAt)), 'createdAt is a date');
  assert.equal(fs.statSync(keyspaceFile(home)).mode & 0o777, 0o600, 'the keyspace is its owner alone');
  assert.equal(fs.statSync(path.dirname(keyspaceFile(home))).mode & 0o777, 0o700, 'the folder is opened by its owner alone');
  assert.deepEqual(personTokenOf(home, tokenDigest(token)), record, 'read again by its digest');
  assert.equal(personTokenOf(home, tokenDigest('never-minted')), null, 'a digest the store holds no record of is none');
});

test('REFUSED: a name already used is a Conflict, and a name that is no name is Invalid; neither writes', () => {
  const home = aStore();
  mintPersonToken(home, 'laptop');
  refusedAs(() => mintPersonToken(home, 'laptop'), Conflict);
  for (const name of ['', ' ', '-x', 'a b', 'a/b', 'x'.repeat(64)]) refusedAs(() => mintPersonToken(home, name), Invalid);
  assert.equal(keysUnder(home, '/registry/persontokens/').length, 1, 'only the first token was written');
});

test('two mints of one name at once make one token, and the other is a Conflict', async () => {
  const home = aStore();
  const door = Effect.runSync(Effect.provide(TokenDoor, tokenDoorAt(home)));
  const both = await Promise.all([acted(door.persons.mint('laptop')), acted(door.persons.mint('laptop'))]);
  assert.deepEqual(
    both.filter((one) => typeof one !== 'string'),
    [{ refused: 'Conflict' }],
  );
  assert.deepEqual(
    personTokens(home).map((t) => t.name),
    ['laptop'],
  );
});

test('a token file of before the keyspace is imported, read by its digest, and moved aside', () => {
  const home = aStore();
  const digest = tokenDigest('an-old-token');
  fs.mkdirSync(path.join(home, 'person-tokens'), { recursive: true });
  fs.writeFileSync(
    path.join(home, 'person-tokens', `${digest}.json`),
    JSON.stringify({ name: 'old', createdAt: '2026-01-01T00:00:00.000Z' }),
  );
  assert.equal(personTokenOf(home, digest)?.name, 'old');
  assert.deepEqual(fs.readdirSync(path.join(home, 'person-tokens')), []);
  assert.ok(fs.existsSync(path.join(home, 'imported', 'person-tokens', `${digest}.json`)));
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

const CREDENTIAL_ROOT = scratch('wf-credential-');

/** A store of its own under the scratch root. */
const aCredentialStore = () => fs.mkdtempSync(path.join(CREDENTIAL_ROOT, 'store-'));

/** The token the credential file holds. */
const held = (home: string) => fs.readFileSync(credentialFile(home), 'utf8').trim();

/** The name and holder of the kept token whose value is `token`, or null where the store keeps none. */
const keptAs = (home: string, token: string) => {
  const record = personTokenOf(home, tokenDigest(token));
  return record === null ? null : { name: record.name, holder: holderOf(record).kind };
};

test("the credential is written 0600, holding a token the store keeps as the person's under local, and no hidden file is left", () => {
  const home = aCredentialStore();
  assert.deepEqual(credentialKeptNow(home), { kind: 'minted', name: 'local' });
  assert.equal(fs.statSync(credentialFile(home)).mode & 0o777, 0o600, 'the file is its owner alone');
  assert.deepEqual(keptAs(home, held(home)), { name: 'local', holder: 'person' });
  assert.deepEqual(
    fs.readdirSync(home).filter((f) => f.startsWith('.')),
    [],
    'the hidden file was renamed over the credential',
  );
});

test('a credential whose token is kept is left alone, and no token is minted', () => {
  const home = aCredentialStore();
  credentialKeptNow(home);
  const first = held(home);
  assert.deepEqual(credentialKeptNow(home), { kind: 'kept' });
  assert.equal(held(home), first);
  assert.deepEqual(
    personTokens(home).map((t) => t.name),
    ['local'],
  );
});

test('a credential whose token was retired with nemia token rm local is minted again at the next start, under local', () => {
  const home = aCredentialStore();
  credentialKeptNow(home);
  const retired = held(home);
  revokePersonToken(home, 'local');
  assert.deepEqual(credentialKeptNow(home), { kind: 'minted', name: 'local' });
  assert.notEqual(held(home), retired);
  assert.deepEqual(keptAs(home, held(home)), { name: 'local', holder: 'person' });
});

test('a file of garbage, an empty one, or one holding an agent-held token is replaced by a person-held token', () => {
  for (const written of ['not a token at all\n', '', 'agent']) {
    const home = aCredentialStore();
    const value =
      written === 'agent'
        ? mintPersonToken(home, 'ops', new Date(), { kind: 'agent', agent: 'operator', factory: null, narrowed: null })
        : written;
    fs.writeFileSync(credentialFile(home), value, { mode: 0o644 });
    assert.equal(credentialKeptNow(home).kind, 'minted', `replaced: ${JSON.stringify(written)}`);
    assert.deepEqual(keptAs(home, held(home)), { name: 'local', holder: 'person' });
    assert.equal(fs.statSync(credentialFile(home)).mode & 0o777, 0o600, 'the file replaced is its owner alone');
  }
});

test('where a token of the person is already named local, the credential is minted under the first free name after it', () => {
  const home = aCredentialStore();
  mintPersonToken(home, 'local');
  assert.deepEqual(credentialKeptNow(home), { kind: 'minted', name: 'local-2' });
  assert.deepEqual(keptAs(home, held(home)), { name: 'local-2', holder: 'person' });
});

/** The package's root, whose `src` the seam's refusal reads. */
const PKG = path.join(import.meta.dirname, '..', '..');

/** The door's synchronous spellings, each the door run at once over the keyspace: a test's. */
const SEAM = [
  'mintToken',
  'readToken',
  'mintPersonToken',
  'mintPersonTokenFree',
  'personTokenOf',
  'personTokens',
  'revokePersonToken',
  'credentialKeptNow',
];

/** The door's own files: where the seam is defined, not a use. */
const OWN = ['src/token/token.store.ts'];

/** The seam's uses in each file — a call, or the function handed on — comment lines and bindings left out. */
const SEAM_USE = new RegExp(`(?<![\\w$.])(?:${SEAM.join('|')})(?![\\w$])`, 'g');

/** Each file of `sources` that uses a synchronous spelling of the Token door rather than yielding it, as a refusal. */
const seamRefusals = (sources: Record<string, string>) =>
  [...seamUses(sources, SEAM_USE, { bindings: true })].map(
    ([file, n]) => `${file} uses the Token door's synchronous spellings ${n} time(s): yield TokenDoor (src/token/token.store.ts) instead`,
  );

test("no file of src uses the Token door's synchronous spellings: every caller yields TokenDoor", () => {
  assert.deepEqual(seamRefusals(sourcesUnder(PKG, 'src', OWN)), []);
});

test('REFUSED: a file of src that uses one again', () => {
  const sources = sourcesUnder(PKG, 'src', OWN);
  const again = {
    ...sources,
    'src/token/caller.verb.ts': `${sources['src/token/caller.verb.ts']}\nconst x = personTokens('/s');\n`,
  };
  assert.equal(seamRefusals(again).length, 1);
});
