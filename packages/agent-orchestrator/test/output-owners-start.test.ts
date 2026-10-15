/**
 * `nemia start` of a folder whose step declares a field its agent's `output:` declares too: refused with exit 2, naming the field and
 * both declarers, and no run is written. `WF_ROOT` is set before the import, since the module reads it as it loads, and a start
 * outside a factory is allowed, with no daemon started, whether or not the test setup's preload ran.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { scratch } from './scratch.ts';

const ROOT = scratch('wf-owners-start-');
process.env.WF_ROOT = ROOT;
process.env.WF_VERIFY_REST = '1';
delete process.env.WF_MAX_RUNS;
process.env.WF_DEFAULT_FACTORY_STARTS = '1';
process.env.NEMIA_DAEMON_START = 'off';
const BIN = scratch('wf-owners-start-bin-');
for (const name of ['claude', 'codex']) fs.writeFileSync(path.join(BIN, name), '#!/bin/sh\nexit 1\n', { mode: 0o755 });
process.env.PATH = `${BIN}${path.delimiter}${process.env.PATH}`;
const { main } = await import('../src/cli/main.ts');

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
  fs.writeFileSync(path.join(dir, 'judge.schema.json'), fields('findings', 'mutants'));
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
    await assert.rejects(main(['start', 'judge it', '--workflows', dir]), (err: Error & { exitCode?: number }) => {
      assert.equal(err.exitCode, 2);
      assert.ok(
        err.message.includes(
          'judge: `findings` is declared by agent judger (agents/judger.md, `output: judger.schema.json`) and by step judge ' +
            '(judge.md, `output: judge.schema.json`): a field has one owner. Delete it from one of the two.',
        ),
        err.message,
      );
      return true;
    });
  } finally {
    process.chdir(cwd);
    console.error = error;
  }
  assert.equal(runsWritten(), runs, 'no run was written');
});
