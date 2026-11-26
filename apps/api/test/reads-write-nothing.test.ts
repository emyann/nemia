/**
 * A GET writes nothing to the keyspace once a sweep keeps the definition index (`sweepBegun`, which the api's main calls): reads of the
 * indexed kinds, the factories among them, leave the store's head where it stood, so a read is no revision for a watcher to replay.
 * A file of its own, since the flag is the process's.
 */
import './harness.ts';
import { keyspaceHead, sweepBegun } from 'agent-orchestrator';
import { test } from 'vitest';
import assert from 'node:assert/strict';
import { app, runtime } from '../src/app.ts';

test('GET of the indexed kinds leaves the keyspace head where it was', async () => {
  sweepBegun();
  const before = await runtime.runPromise(keyspaceHead());
  for (const url of ['/api/agents', '/api/skills', '/api/workflows', '/api/factories']) {
    const res = await app.request(url);
    assert.ok(res.status < 500, `${url} answered ${res.status}`);
  }
  const after = await runtime.runPromise(keyspaceHead());
  assert.equal(after, before);
});
