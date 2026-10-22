/**
 * Run by `leaks.test.ts` alone, under a TMPDIR of its own: two tests that each start a detached worker and fail before
 * they stop it — one on a harness that reads its stdin for ever, and one on a harness that ignores SIGTERM, which only the
 * last resort ends, after a stop grace shorter than the shipped one. `scratch` must leave nothing behind.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { Effect } from 'effect';
import { detachedOps, type HarnessSpec } from '../../src/harness/detached/detached.ts';
import { scratch } from '../scratch.ts';
import { until, WAITED, type Waiter } from '../../src/waits/index.ts';

const started = (t: Waiter, file: string) => until(t, () => fs.existsSync(file), `started: ${file}`, { everyMs: 25 });

test('a worker whose harness reads its stdin for ever, and a test that fails before it stops it', WAITED, async (t) => {
  const dir = scratch('ae-detached-');
  const script = path.join(dir, 'listener.cjs');
  fs.writeFileSync(script, "require('node:fs').writeFileSync('started', ''); process.stdin.resume();\n");
  const spec: HarnessSpec = {
    name: 'in', command: () => ({ cmd: process.execPath, args: [script] }),
    input: { line: (text) => JSON.stringify({ said: text }), closesOn: { key: 'kind', value: 'end' } },
  };
  await Effect.runPromise(detachedOps(spec, dir, { stopGraceMs: 300 }).spawn({ name: 'ae/leak/1', brief: 'b', cwd: dir }));
  await started(t, path.join(dir, 'started'));
  assert.fail('failed with its worker running');
});

test('a worker whose harness ignores SIGTERM, and a test that fails before it stops it', WAITED, async (t) => {
  const dir = scratch('ae-detached-');
  const spec: HarnessSpec = { name: 'sh', command: () => ({ cmd: 'sh', args: ['-c', "trap '' TERM; : > started; while :; do sleep 1; done"] }) };
  await Effect.runPromise(detachedOps(spec, dir, { stopGraceMs: 300 }).spawn({ name: 'ae/leak/2', brief: 'b', cwd: dir }));
  await started(t, path.join(dir, 'started'));
  assert.fail('failed with its worker running');
});
