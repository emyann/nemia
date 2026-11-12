/**
 * `nemia start` of a folder whose step declares a field its agent's `output:` declares too: refused with exit 2, naming the field and
 * both declarers, and no run is written. The test's store is its own, at `ROOT`, handed to `main` as `ENV`, and a start
 * outside a factory is allowed, with no daemon started, whether or not the test setup's preload ran.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { scratch } from 'test-kit/scratch';
import { typed } from './typed.ts';
import type { Env } from '../src/config/config.store.ts';

const ROOT = scratch('wf-owners-start-');
process.env.NEMIA_DAEMON_START = 'off';
const BIN = scratch('wf-owners-start-bin-');
for (const name of ['claude', 'codex']) fs.writeFileSync(path.join(BIN, name), '#!/bin/sh\nexit 1\n', { mode: 0o755 });
process.env.PATH = `${BIN}${path.delimiter}${process.env.PATH}`;
const ENV: Env = {
  ...process.env,
  WF_ROOT: ROOT,
  WF_VERIFY_REST: '1',
  WF_MAX_RUNS: undefined,
  WF_DEFAULT_FACTORY_STARTS: '1',
};

/** A JSON Schema of an object whose `names` are each a required string. */
const fields = (...names: string[]): string =>
  JSON.stringify({
    type: 'object',
    properties: Object.fromEntries(names.map((n) => [n, { type: 'string' }])),
    required: names,
    additionalProperties: false,
  });

/** A folder `twice` beside an `agents/` whose `judger` declares `findings`, with one step `judge` hiring it that declares it too. */
function twice(): string {
  const workflows = path.join(ROOT, 'workflows');
  const dir = path.join(workflows, 'twice');
  fs.mkdirSync(path.join(workflows, 'agents'), { recursive: true });
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(workflows, 'agents', 'judger.md'), '---\noutput: judger.schema.json\n---\nYou judge.\n');
  fs.writeFileSync(path.join(workflows, 'agents', 'judger.schema.json'), fields('findings'));
  fs.writeFileSync(path.join(dir, 'judge.md'), '---\nworkspace: folder\nagent: judger\noutput: judge.schema.json\n---\n');
  fs.writeFileSync(path.join(dir, 'judge.schema.json'), fields('findings', 'severity'));
  return dir;
}

const runsWritten = () => (fs.existsSync(path.join(ROOT, 'runs')) ? fs.readdirSync(path.join(ROOT, 'runs')).length : 0);

test('REFUSED: nemia start of a step declaring a field its agent declares exits 2, naming the field and both declarers, and writes no run', async () => {
  const dir = twice();
  const runs = runsWritten();
  const { error } = console;
  const cwd = process.cwd();
  console.error = () => undefined;
  process.chdir(ROOT);
  try {
    await assert.rejects(
      typed(['start', 'judge it', '--workflows', dir, '--repo', ROOT], undefined, undefined, undefined, ENV),
      (err: Error & { exitCode?: number; _tag?: string }) => {
        assert.deepEqual([err._tag, err.exitCode], ['Invalid', 2]);
        for (const fact of [
          'judge: `findings` is declared by agent judger',
          '(agents/judger.md, `output: judger.schema.json`)',
          'step judge (judge.md, `output: judge.schema.json`)',
          'Delete it from one of the two.',
        ])
          assert.ok(err.message.includes(fact), `${fact} — in: ${err.message}`);
        return true;
      },
    );
  } finally {
    process.chdir(cwd);
    console.error = error;
  }
  assert.equal(runsWritten(), runs, 'no run was written');
});
