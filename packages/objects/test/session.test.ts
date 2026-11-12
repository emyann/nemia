/**
 * The server's version and session answers (`src/server-api.ts`): a version with and without the newest release decodes and encodes
 * back equal, and a session answer says only what it did to the board's cookie, `TOKEN_COOKIE`.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Schema } from 'effect';
import { SessionAnswer, TOKEN_COOKIE, VersionAnswer } from 'objects';

const release = { kind: 'install', root: '/r', tag: 'v1.2.0', commit: 'abc' };

test('a version answer decodes with the newest release and without one, each encoding back equal', () => {
  for (const answer of [
    { version: '1.2.0', release },
    { version: '1.2.0', release, latest: { version: '1.3.0', newer: true } },
  ]) {
    assert.deepEqual(Schema.encodeSync(VersionAnswer)(Schema.decodeUnknownSync(VersionAnswer)(answer)), answer);
  }
});

test('a session answer is set or cleared, and nothing else', () => {
  assert.deepEqual(Schema.decodeUnknownSync(SessionAnswer)({ cookie: 'set' }), { cookie: 'set' });
  assert.throws(() => Schema.decodeUnknownSync(SessionAnswer)({ cookie: 'token' }));
  assert.equal(typeof TOKEN_COOKIE, 'string');
});
