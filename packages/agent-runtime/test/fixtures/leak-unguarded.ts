/**
 * Run by `leaks.test.ts` alone, under a TMPDIR of its own: a test written without `scratch`, whose root is made under the
 * temp directory by hand and whose worker is never stopped. It passes, and leaves both behind: the case the guard must see.
 * The one file under `test/` but `scratch.ts` allowed to call `tmpdir()` (`scratch.test.ts`). Its listener exits on its own
 * after two minutes, should the guard's reaping ever fail, so the fixture never leaks for real.
 */
import { test } from 'node:test';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { Effect } from 'effect';
import { detachedOps, type HarnessSpec } from '../../src/harness/detached/detached.ts';
import { until, WAITED } from '../../src/waits/index.ts';

test('a worker started in a root made by hand, and never stopped', WAITED, async (t) => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ae-detached-'));
  const script = path.join(dir, 'listener.cjs');
  fs.writeFileSync(script, "require('node:fs').writeFileSync('started', ''); process.stdin.resume(); setTimeout(() => process.exit(0), 120_000).unref();\n");
  const spec: HarnessSpec = {
    name: 'in', command: () => ({ cmd: process.execPath, args: [script] }),
    input: { line: (text) => JSON.stringify({ said: text }), closesOn: { key: 'kind', value: 'end' } },
  };
  await Effect.runPromise(detachedOps(spec, dir).spawn({ name: 'ae/leak/3', brief: 'b', cwd: dir }));
  await until(t, () => fs.existsSync(path.join(dir, 'started')), `started: ${dir}`, { everyMs: 25 });
});
