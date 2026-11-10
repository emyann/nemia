/**
 * The one recipe of a digest `resourceVersion` (`versionDigest`, digest.ts): sixteen hex characters of a text's sha256, the same for the
 * same text and another for another; a value's the digest of its JSON (`valueVersion`); and the kinds that stamp one take it here — a
 * card's text and a proposal's spec and status.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { cardVersion } from '../card-write/card-write.verb.ts';
import { proposalVersion } from '../proposal/proposal.store.ts';
import { valueVersion, versionDigest } from './digest.ts';

test("a digest is the first sixteen hex characters of the text's sha256, the same text's the same, another's another", () => {
  assert.equal(versionDigest('a'), createHash('sha256').update('a').digest('hex').slice(0, 16));
  assert.match(versionDigest(''), /^[0-9a-f]{16}$/);
  assert.equal(versionDigest('x'), versionDigest('x'));
  assert.notEqual(versionDigest('x'), versionDigest('y'));
});

test("a value's digest is its JSON's, so a value that encodes the same is the same version", () => {
  assert.equal(valueVersion({ spec: 1, status: null }), versionDigest('{"spec":1,"status":null}'));
  assert.notEqual(valueVersion({ spec: 1 }), valueVersion({ spec: 2 }));
});

test("a card's version and a proposal's are taken by the one recipe", () => {
  assert.equal(cardVersion('---\nworkflow: build\n---\nDo it.\n'), versionDigest('---\nworkflow: build\n---\nDo it.\n'));
  const spec = { objects: [] } as never;
  const status = { phase: 'Pending' } as never;
  assert.equal(proposalVersion({ spec, status }), valueVersion({ spec, status }));
});
