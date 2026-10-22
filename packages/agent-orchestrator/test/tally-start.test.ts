/**
 * `nemia start` of a folder whose step declares a `tally:`: one the step's closeout cannot hold is refused with exit 2, naming the step's
 * file, its schema's and the field, and no run is written; one it can hold is frozen on the run record with the step, which is what
 * `nemia stats` counts the run by. This repository's build workflow declares a real count. `WF_ROOT` is set before the import, since the
 * module reads it as it loads.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { scratch } from './scratch.ts';
import { placesOf, REPO } from './team.ts';

const ROOT = scratch('wf-tally-start-');
process.env.WF_ROOT = ROOT;
process.env.WF_VERIFY_REST = '1';
delete process.env.WF_MAX_RUNS;
const BIN = scratch('wf-tally-start-bin-');
for (const name of ['claude', 'codex']) fs.writeFileSync(path.join(BIN, name), '#!/bin/sh\nexit 1\n', { mode: 0o755 });
process.env.PATH = `${BIN}${path.delimiter}${process.env.PATH}`;
const { readRun } = await import('../src/record/record.store.ts');
const { main } = await import('../src/cli/main.ts');
const { loadWorkflows } = await import('../src/folder/folder.store.ts');

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

/** `nemia start` of `dir`, from the store, and the run's id. */
async function started(dir: string): Promise<string> {
  const out: string[] = [];
  const { log, error } = console;
  const cwd = process.cwd();
  console.log = (...args: unknown[]) => void out.push(args.join(' '));
  console.error = () => undefined;
  process.chdir(ROOT);
  try {
    await main(['start', 'sort the issues', '--workflows', dir]);
  } finally {
    process.chdir(cwd);
    Object.assign(console, { log, error });
  }
  return out.join('\n').split(/\s+/)[0];
}

const runsWritten = () => (fs.existsSync(path.join(ROOT, 'runs')) ? fs.readdirSync(path.join(ROOT, 'runs')).length : 0);

test('REFUSED: nemia start of a step whose tally its closeout cannot hold exits 2, naming the file, the schema and the field, and writes no run', async () => {
  const runs = runsWritten();
  await assert.rejects(started(triage('unheld', 'issues, issues.closed')), (err: Error & { exitCode?: number }) => {
    assert.equal(err.exitCode, 2);
    assert.ok(
      err.message.includes(
        'triage: `tally: issues, issues.closed` in triage.md: `output: triage.schema.json` declares no boolean `closed` on the items of an array `issues`',
      ),
      err.message,
    );
    return true;
  });
  assert.equal(runsWritten(), runs, 'no run was written');
});

test('nemia start of a step whose tally its closeout holds freezes the tally with the step on the run record', async () => {
  const id = await started(triage('held', 'issues, issues.open'));
  assert.deepEqual(readRun(id).workflow?.find((s) => s.name === 'triage')?.tally, ['issues', 'issues.open']);
});

test("this repository's build workflow counts its review's findings and its placement findings, and loads", () => {
  const build = path.join(REPO, 'workflows', 'build');
  const review = loadWorkflows(build, placesOf(build)).find((s) => s.name === 'review');
  assert.deepEqual(review?.tally, ['findings', 'findings.kind=placement']);
});
