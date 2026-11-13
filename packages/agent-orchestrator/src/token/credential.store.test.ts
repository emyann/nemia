/**
 * The store's credential, as the daemon puts it in place at its start: the file written 0600 holding a token the store keeps as the
 * person's under `local`; a live one left as it is; and a new one minted where the file's token was retired, is an agent's, or the file
 * holds no token at all.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { scratch } from 'test-kit/scratch';
import { credentialFile, credentialKept } from './credential.store.ts';
import { holderOf, mintPersonToken, personTokenOf, personTokens, revokePersonToken, tokenDigest } from './token.store.ts';

const ROOT = scratch('wf-credential-');

/** A store of its own under the scratch root. */
const aStore = (): string => fs.mkdtempSync(path.join(ROOT, 'store-'));

/** The token the credential file holds. */
const held = (home: string): string => fs.readFileSync(credentialFile(home), 'utf8').trim();

/** The name and holder of the kept token whose value is `token`, or null where the store keeps none. */
const keptAs = (home: string, token: string) => {
  const record = personTokenOf(home, tokenDigest(token));
  return record === null ? null : { name: record.name, holder: holderOf(record).kind };
};

test("the credential is written 0600, holding a token the store keeps as the person's under local, and no hidden file is left", () => {
  const home = aStore();
  assert.deepEqual(credentialKept(home), { kind: 'minted', name: 'local' });
  assert.equal(fs.statSync(credentialFile(home)).mode & 0o777, 0o600, 'the file is its owner alone');
  assert.deepEqual(keptAs(home, held(home)), { name: 'local', holder: 'person' });
  assert.deepEqual(
    fs.readdirSync(home).filter((f) => f.startsWith('.')),
    [],
    'the hidden file was renamed over the credential',
  );
});

test('a credential whose token is kept is left alone, and no token is minted', () => {
  const home = aStore();
  credentialKept(home);
  const first = held(home);
  assert.deepEqual(credentialKept(home), { kind: 'kept' });
  assert.equal(held(home), first);
  assert.deepEqual(
    personTokens(home).map((t) => t.name),
    ['local'],
  );
});

test('a credential whose token was retired with nemia token rm local is minted again at the next start, under local', () => {
  const home = aStore();
  credentialKept(home);
  const retired = held(home);
  revokePersonToken(home, 'local');
  assert.deepEqual(credentialKept(home), { kind: 'minted', name: 'local' });
  assert.notEqual(held(home), retired);
  assert.deepEqual(keptAs(home, held(home)), { name: 'local', holder: 'person' });
});

test('a file of garbage, an empty one, or one holding an agent-held token is replaced by a person-held token', () => {
  for (const written of ['not a token at all\n', '', 'agent']) {
    const home = aStore();
    const value =
      written === 'agent'
        ? mintPersonToken(home, 'ops', new Date(), { kind: 'agent', agent: 'operator', factory: null, narrowed: null })
        : written;
    fs.writeFileSync(credentialFile(home), value, { mode: 0o644 });
    assert.equal(credentialKept(home).kind, 'minted', `replaced: ${JSON.stringify(written)}`);
    assert.deepEqual(keptAs(home, held(home)), { name: 'local', holder: 'person' });
    assert.equal(fs.statSync(credentialFile(home)).mode & 0o777, 0o600, 'the file replaced is its owner alone');
  }
});

test('where a token of the person is already named local, the credential is minted under the first free name after it', () => {
  const home = aStore();
  mintPersonToken(home, 'local');
  assert.deepEqual(credentialKept(home), { kind: 'minted', name: 'local-2' });
  assert.deepEqual(keptAs(home, held(home)), { name: 'local-2', holder: 'person' });
});
