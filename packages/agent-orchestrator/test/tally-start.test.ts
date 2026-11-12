/**
 * `nemia start` of a folder whose step declares a `tally:`: one the step's closeout cannot hold is refused with exit 2, naming the step's
 * file, its schema's and the field, and no run is written; one it can hold is frozen on the run record with the step, which is what
 * `nemia stats` counts the run by. Its store is its own at `ROOT`, given as `ENV`.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { scratch } from 'test-kit/scratch';
import { Invalid } from '../src/refusal/refusal.ts';
import { runRecord } from '../src/record/record.store.ts';
import { typed } from './typed.ts';
import type { Env } from '../src/config/config.store.ts';

const ROOT = scratch('wf-tally-start-');
const BIN = scratch('wf-tally-start-bin-');
for (const name of ['claude', 'codex']) fs.writeFileSync(path.join(BIN, name), '#!/bin/sh\nexit 1\n', { mode: 0o755 });
process.env.PATH = `${BIN}${path.delimiter}${process.env.PATH}`;
const ENV: Env = { ...process.env, WF_ROOT: ROOT, WF_VERIFY_REST: '1', WF_MAX_RUNS: undefined };

/** A folder of one step `triage`, closing out the issues it sorted, that declares `tally`. */
function triage(name: string, tally: string): string {
  const dir = path.join(ROOT, 'workflows', name);
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(
    path.join(dir, 'triage.md'),
    `---\nworkspace: folder\noutput: triage.schema.json\ntally: ${tally}\n---\nSort the issues.\n`,
  );
  fs.writeFileSync(
    path.join(dir, 'triage.schema.json'),
    JSON.stringify({
      type: 'object',
      properties: {
        issues: {
          type: 'array',
          items: { type: 'object', properties: { open: { type: 'boolean' } }, required: ['open'], additionalProperties: false },
        },
      },
      required: ['issues'],
      additionalProperties: false,
    }),
  );
  return dir;
}

/** `nemia start` of `dir`, on the store's own folder, as the api runs it (`typed`): the run's id. */
async function started(dir: string): Promise<string> {
  const { id } = (await typed(['start', 'sort the issues', '--workflows', dir, '--repo', ROOT], undefined, undefined, undefined, ENV)) as {
    id: string;
  };
  return id;
}

const runsWritten = () => (fs.existsSync(path.join(ROOT, 'runs')) ? fs.readdirSync(path.join(ROOT, 'runs')).length : 0);

test('nemia start of a step that declares a tally: refused where its closeout cannot hold it, frozen on the run where it can', async (t) => {
  await t.test(
    'REFUSED: a tally its closeout cannot hold exits 2, naming the file, the schema and the field, and writes no run',
    async () => {
      const runs = runsWritten();
      await assert.rejects(started(triage('unheld', 'issues, issues.closed')), (err: unknown) => {
        assert.ok(err instanceof Invalid, String(err));
        assert.equal(err.exitCode, 2);
        assert.ok(err.message.includes('triage: `tally: issues, issues.closed` in triage.md'), err.message);
        assert.ok(err.message.includes('`output: triage.schema.json`'), err.message);
        assert.ok(err.message.includes('no boolean `closed` on the items of an array `issues`'), err.message);
        return true;
      });
      assert.equal(runsWritten(), runs, 'no run was written');
    },
  );

  await t.test('a tally its closeout holds is frozen with the step on the run record', async () => {
    const id = await started(triage('held', 'issues, issues.open'));
    assert.deepEqual(runRecord(ROOT, id).workflow?.find((s) => s.name === 'triage')?.tally, ['issues', 'issues.open']);
  });
});
