/**
 * What `startRun` copies of a person's labels, once, at creation: the `--after` and `--from` runs' labels where they agree, the card's
 * over them, the typed `--label` edits over those; a key two runs disagree on left out and said by `nemia start`; a malformed or reserved
 * edit refused before any file is written; and no `.labels` file for a run started with none. On the files, with the test place.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { scratch } from 'test-kit/scratch';
import { testPlace } from '../../place/memory/index.ts';
import { eachTest, runGiven } from '../../test/placed.ts';
import { names } from '../../test/assessed.ts';
import { startRun } from './start.verb.ts';
import { startedFacts } from './commands.verb.ts';
import { filesStoreAt } from '../record/files.store.ts';
import type { Env } from '../config/config.store.ts';

const ROOT = scratch('wf-start-labels-');
const ENV: Env = { ...process.env, WF_ROOT: ROOT };
const RUNS_DIR = path.join(ROOT, 'runs');
const files = filesStoreAt(ROOT);

const stand = eachTest(testPlace);
const runPlaced = runGiven(() => stand().layer, ENV);

/** A workflow folder of one step, in git. */
const folder = (): string => {
  const dir = scratch('wf-start-labels-team-');
  fs.writeFileSync(path.join(dir, 'work.md'), '---\nplace: git\n---\nwork it\n');
  return dir;
};

/** A repository of the test place's, and a run started in it now with `labels` put on it: its id. */
const parent = async (repo: string, labels: Record<string, string>) => {
  const run = await runPlaced(startRun({ brief: 'a parent', repo, workflowDir: folder(), isolate: true }));
  files.labels.put(run.id, labels);
  return run.id;
};

/** A repository the test place knows. */
const aRepo = () => {
  const repo = scratch('wf-start-labels-repo-');
  stand().world.repository(repo, {});
  return repo;
};

const labelsFile = (id: string) => path.join(RUNS_DIR, `${id}.labels`);

test("a start copies the labels its --after and --from runs agree on, the card's over them and its own edits over those", async () => {
  const repo = aRepo();
  const a = await parent(repo, { team: 'core', area: 'inbox', tier: 'one' });
  const b = await parent(repo, { team: 'core', tier: 'one' });
  const run = await runPlaced(
    startRun({
      brief: 'a child',
      repo,
      workflowDir: folder(),
      after: [a],
      context: [b],
      labels: { card: { tier: 'two' }, edits: ['area-', 'kind2=x'] },
    }),
  );
  const want = { team: 'core', tier: 'two', kind2: 'x' };
  assert.deepEqual(run.labels, want, "the card's tier beats the runs', and area- drops an inherited one");
  assert.equal(run.labelsLeftOut, undefined, 'nothing left out');
  assert.deepEqual(JSON.parse(fs.readFileSync(labelsFile(run.id), 'utf8')), want, 'written beside the record');
  assert.equal('labels' in JSON.parse(fs.readFileSync(path.join(RUNS_DIR, `${run.id}.json`), 'utf8')), false, 'never in it');
});

test('a key two named runs disagree on is left out, and `nemia start` answers it, with the runs and their values', async () => {
  const repo = aRepo();
  const a = await parent(repo, { team: 'core', area: 'inbox' });
  const b = await parent(repo, { team: 'infra', area: 'inbox' });
  const run = await runPlaced(startRun({ brief: 'a child', repo, workflowDir: folder(), context: [a, b] }));
  assert.deepEqual(run.labels, { area: 'inbox' });
  assert.deepEqual(run.labelsLeftOut, [
    {
      key: 'team',
      values: [
        { run: a, value: 'core' },
        { run: b, value: 'infra' },
      ],
    },
  ]);
  const facts = startedFacts({ home: ROOT, run });
  assert.deepEqual([facts.labels, facts.labelsLeftOut], [run.labels, run.labelsLeftOut], 'what the api answers the client to say it by');
  const typed = await runPlaced(
    startRun({ brief: 'typed', repo, workflowDir: folder(), context: [a, b], labels: { edits: ['team=ops'] } }),
  );
  assert.deepEqual([typed.labels, typed.labelsLeftOut], [{ area: 'inbox', team: 'ops' }, undefined], 'a typed key settles it');
});

test('a run started with no labels writes no .labels file, and its start answers no label', async () => {
  const run = await runPlaced(startRun({ brief: 'bare', repo: aRepo(), workflowDir: folder() }));
  assert.equal(fs.existsSync(labelsFile(run.id)), false);
  assert.equal(run.labels, undefined);
  const facts = startedFacts({ home: ROOT, run });
  assert.deepEqual([facts.labels, facts.labelsLeftOut], [undefined, undefined], 'nor a key of them in what the api answers');
});

test('REFUSED before any file is written: a reserved key, a closed key and an edit that is neither key=value nor key-', async (t) => {
  const rows: Record<string, [edit: string, facts: string[]]> = {
    'a reserved key': ['reason=x', ['--label', 'reason']],
    'a closed key': ['workflow=x', ['--label', 'workflow']],
    'neither form': ['team', ['--label', '"team"', 'key=value']],
  };
  const repo = aRepo();
  for (const [row, [edit, facts]] of Object.entries(rows))
    await t.test(row, async () => {
      const before = fs.existsSync(RUNS_DIR) ? fs.readdirSync(RUNS_DIR).sort() : [];
      await assert.rejects(
        runPlaced(startRun({ brief: 'refused', repo, workflowDir: folder(), labels: { edits: [edit] } })),
        (err: Error & { _tag?: string; exitCode?: number }) => {
          assert.deepEqual([err._tag, err.exitCode], ['Invalid', 2], err.message);
          names(err.message, ...facts);
          return true;
        },
      );
      assert.deepEqual(fs.existsSync(RUNS_DIR) ? fs.readdirSync(RUNS_DIR).sort() : [], before, 'nothing written');
    });
});
