/**
 * Run by `leaks.test.ts` alone, under a TMPDIR of its own: two tests that each start a detached worker and fail before
 * they stop it — one on a harness that reads its stdin for ever, as the test harness a failed test left for hours did,
 * and one on a harness that ignores SIGTERM, which only the last resort ends. `scratch` must leave nothing behind.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { Effect } from 'effect';
import { detachedOps, type HarnessSpec } from '../../src/runner-detached.ts';
import { scratch } from '../scratch.ts';

const started = async (file: string) => {
  for (const bound = performance.now() + 15_000; !fs.existsSync(file);) {
    if (performance.now() > bound) assert.fail(`never started: ${file}`);
    await new Promise((r) => setTimeout(r, 25));
  }
};

test('a worker whose harness reads its stdin for ever, and a test that fails before it stops it', async () => {
  const dir = scratch('ae-detached-');
  const script = path.join(dir, 'listener.cjs');
  fs.writeFileSync(script, "require('node:fs').writeFileSync('started', ''); process.stdin.resume();\n");
  const spec: HarnessSpec = {
    name: 'in', command: () => ({ cmd: process.execPath, args: [script] }),
    input: { line: (text) => JSON.stringify({ said: text }), closesOn: { key: 'kind', value: 'end' } },
  };
  await Effect.runPromise(detachedOps(spec, dir).spawn({ name: 'ae/leak/1', brief: 'b', cwd: dir }));
  await started(path.join(dir, 'started'));
  assert.fail('failed with its worker running');
});

test('a worker whose harness ignores SIGTERM, and a test that fails before it stops it', async () => {
  const dir = scratch('ae-detached-');
  const spec: HarnessSpec = { name: 'sh', command: () => ({ cmd: 'sh', args: ['-c', "trap '' TERM; : > started; while :; do sleep 1; done"] }) };
  await Effect.runPromise(detachedOps(spec, dir).spawn({ name: 'ae/leak/2', brief: 'b', cwd: dir }));
  await started(path.join(dir, 'started'));
  assert.fail('failed with its worker running');
});
