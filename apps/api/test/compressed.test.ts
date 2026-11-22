/**
 * Every answer of the app is compressed where the request accepts it (`compress`, mounted first in `appOf`, src/app.ts), with its
 * defaults: the run list gzipped for a request that accepts gzip, its body the identity answer once gunzipped, and the identity answer
 * with no `Content-Encoding` for a request that accepts none; a watched list a live `text/event-stream`, never compressed, its first
 * event read while the stream is open; and a built file of the board gzipped too.
 */
import { root } from './harness.ts';
import { test } from 'vitest';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { gunzipSync } from 'node:zlib';
import { Layer } from 'effect';
import { scratch } from 'test-kit/scratch';
import { app, appOf, liveOf } from '../src/app.ts';
import { ApiConfig } from '../src/layer.ts';
import { plantRecord, runKey } from 'agent-orchestrator/testing';

const RUNS = Array.from({ length: 5 }, (_, i) => `r-gz-${i}`);
for (const id of RUNS) {
  fs.mkdirSync(path.join(root, 'runs'), { recursive: true });
  plantRecord(root, runKey(id), JSON.stringify({
      id,
      repo: '/code/app',
      workspace: '/code/app',
      baseRef: 'abc123',
      branch: 'main',
      isolate: true,
      brief: `Compress ${id}`,
      workflowDir: path.join(root, 'no-such-workflow'),
      createdAt: '2026-11-14T22:10:00.000Z',
      workflow: [{ name: 'implement', after: [], body: 'Implement it.', harness: 'claude' }],
      steps: { implement: { taskId: null } },
    }));
}

test('the run list is gzipped where the request accepts gzip, its body the identity answer once gunzipped, and Vary names it', async () => {
  const plain = await app.request('/api/runs');
  assert.equal(plain.status, 200);
  assert.equal(plain.headers.get('content-encoding'), null, 'no Accept-Encoding, no Content-Encoding');
  const identity = await plain.text();
  assert.ok(
    RUNS.every((id) => identity.includes(id)),
    'the identity answer lists every planted run',
  );

  const zipped = await app.request('/api/runs', { headers: { 'accept-encoding': 'gzip, deflate' } });
  assert.equal(zipped.status, 200);
  assert.equal(zipped.headers.get('content-encoding'), 'gzip');
  assert.match(zipped.headers.get('vary') ?? '', /accept-encoding/i);
  assert.match(zipped.headers.get('content-type') ?? '', /^application\/json/);
  const bytes = new Uint8Array(await zipped.arrayBuffer());
  assert.deepEqual(JSON.parse(gunzipSync(bytes).toString('utf8')), JSON.parse(identity));
});

test('a watched list stays a live stream: text/event-stream, never compressed, its first event read before the stream ends', async () => {
  const gone = new AbortController();
  const res = await app.request('/api/runs?watch=true', { headers: { 'accept-encoding': 'gzip' }, signal: gone.signal });
  try {
    assert.equal(res.status, 200);
    assert.match(res.headers.get('content-type') ?? '', /^text\/event-stream/);
    assert.equal(res.headers.get('content-encoding'), null);
    const reader = res.body?.getReader();
    assert.ok(reader, 'the stream has a body');
    const first = await reader.read();
    assert.equal(first.done, false, 'an event arrived while the stream is open');
    assert.match(new TextDecoder().decode(first.value), /data:/);
    await reader.cancel();
  } finally {
    gone.abort();
  }
});

test('a built file of the board is gzipped where the request accepts gzip, and sent as it is where it accepts none', async () => {
  const dist = scratch('nemia-api-gz-board-');
  const script = `export const board = ${JSON.stringify('x'.repeat(4096))};\n`;
  fs.mkdirSync(path.join(dist, 'assets'), { recursive: true });
  fs.writeFileSync(path.join(dist, 'index.html'), '<!doctype html><title>board</title>');
  fs.writeFileSync(path.join(dist, 'assets', 'index-abc.js'), script);
  const { app: boarded } = appOf(Layer.merge(liveOf(), ApiConfig.layer({ ...process.env, NEMIA_BOARD_DIR: dist })));

  const zipped = await boarded.request('/assets/index-abc.js', { headers: { 'accept-encoding': 'gzip' } });
  assert.equal(zipped.status, 200);
  assert.equal(zipped.headers.get('content-encoding'), 'gzip');
  const bytes = new Uint8Array(await zipped.arrayBuffer());
  assert.ok(bytes.length < script.length, 'fewer bytes on the wire');
  assert.equal(gunzipSync(bytes).toString('utf8'), script);

  const plain = await boarded.request('/assets/index-abc.js');
  assert.equal(plain.headers.get('content-encoding'), null);
  assert.equal(await plain.text(), script);
});
