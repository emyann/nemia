/**
 * `nemia quota` against a served store (`served.ts`) whose api is told of a Claude Code that is not there, so the quota cannot be asked
 * for: the verb reaches `GET /api/quota` with the person's token (the gate refuses a call with none), decodes the `Quota` it answers,
 * and prints the api's own sentence. Its own store, so the environment that leaves the quota unanswered touches no other test's.
 */
import { afterAll, test } from 'vitest';
import assert from 'node:assert/strict';
import path from 'node:path';
import { Schema } from 'effect';
import { Quota, QUOTA_STATES } from 'objects';
import { scratch } from 'test-kit/scratch';
import { servedStore } from './served.ts';

const store = await servedStore('nemia-quota-', () => {}, {
  AE_CLAUDE_EXECUTABLE: path.join(scratch('nemia-quota-none-'), 'claude'),
});
afterAll(() => store.stop());

test("`nemia quota --json` exits 0 with the api's `Quota`: a state it declares, not fresh, and the sentence why", async () => {
  const said = await store.nemia(['quota', '--json']);
  assert.equal(said.code, 0, said.err);
  const read = Schema.decodeUnknownSync(Quota)(JSON.parse(said.out));
  assert.ok((QUOTA_STATES as readonly string[]).includes(read.state), read.state);
  assert.notEqual(read.state, 'fresh');
  assert.ok(typeof read.said === 'string' && read.said.length > 0, said.out);
});

test("`nemia quota` exits 0 and opens on the api's own sentence", async () => {
  const json = await store.nemia(['quota', '--json']);
  const read = Schema.decodeUnknownSync(Quota)(JSON.parse(json.out));
  const said = await store.nemia(['quota']);
  assert.equal(said.code, 0, said.err);
  const sentence = (read.said ?? '').split('.')[0] ?? '';
  assert.ok(sentence.length > 0 && (said.out.split('\n')[0] ?? '').startsWith(sentence), said.out);
});

test('REFUSED: `nemia quota extra` exits 2 naming the verb', async () => {
  const refused = await store.nemia(['quota', 'extra']);
  assert.equal(refused.code, 2, refused.err);
  assert.match(refused.err, /\bquota\b/);
  assert.equal(refused.out, '');
});
