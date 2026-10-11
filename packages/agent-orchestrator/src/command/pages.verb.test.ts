/**
 * The board's reads of one run as entries of the table, served on the api alone: the run for its page (`RUN`), found among the runs the
 * store lists, and none for an id it does not have. `WF_ROOT` is set before the import, since the store reads it as it loads.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { scratch } from '../../test/scratch.ts';
import { promised } from '../../test/promised.ts';
import { runGiven, runOver } from '../../test/placed.ts';

const ROOT = scratch('wf-pages-');
process.env.WF_ROOT = ROOT;
const { RUN, STEP_ARTIFACT, STEP_FILE } = await import('./pages.verb.ts');
const { startRun, runWith: runEngine, gitPlaceLayer } = await import('../runner.ts');
const runWith = runOver(runEngine, gitPlaceLayer);
const runPlaced = runGiven(gitPlaceLayer);

/** No read here asks the engine anything. */
const NO_ENGINE = promised({});

/** A folder workflow of one step. */
const oneStep = (): string => {
  const dir = scratch('wf-pages-one-');
  fs.writeFileSync(path.join(dir, 'implement.md'), '---\nplace: git\n---\nimplement it\n');
  return dir;
};

/** A repository with one commit on main. */
const aRepo = (): string => {
  const repo = scratch('wf-pages-repo-');
  const git = (...args: string[]) => execFileSync('git', ['-C', repo, ...args], { stdio: ['ignore', 'pipe', 'pipe'] });
  git('init', '-q', '-b', 'main');
  fs.writeFileSync(path.join(repo, 'README.md'), 'readme\n');
  git('add', '-A');
  git('-c', 'user.name=t', '-c', 'user.email=t@t', 'commit', '-q', '-m', 'base');
  return repo;
};

test('a run is read for its page by its id, and an id the store does not have, nor a path, reads none', async () => {
  const started = await runPlaced(startRun({ brief: 'read me', repo: aRepo(), workflowDir: oneStep() }));
  const { run } = await runWith(NO_ENGINE, RUN.handler({ id: started.id }));
  assert.equal(run?.id, started.id);
  assert.equal(run?.brief, 'read me');
  assert.deepEqual(await runWith(NO_ENGINE, RUN.handler({ id: 'r-nowhere' })), { run: null });
  assert.deepEqual(await runWith(NO_ENGINE, RUN.handler({ id: `../runs/${started.id}` })), { run: null });
});

test("a step's file is read off the run the store lists, never off a path made of its id; a repository run's step has no folder", async () => {
  const started = await runPlaced(startRun({ brief: 'files', repo: aRepo(), workflowDir: oneStep() }));
  const dir = path.join(ROOT, 'runs', started.id, 'artifacts', 'implement');
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, 'notes.md'), 'notes');
  const asked = { step: 'implement', name: 'notes.md' };
  assert.equal((await runWith(NO_ENGINE, STEP_ARTIFACT.handler({ id: started.id, ...asked }))).file?.toString(), 'notes');
  assert.deepEqual(await runWith(NO_ENGINE, STEP_ARTIFACT.handler({ id: `x/../${started.id}`, ...asked })), { file: null });
  assert.deepEqual(await runWith(NO_ENGINE, STEP_FILE.handler({ id: started.id, ...asked })), { folder: null, file: null });
});
