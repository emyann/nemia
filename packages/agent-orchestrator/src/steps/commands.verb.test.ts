/**
 * The board's reads of a run's steps as entries of the table, served on the api alone: a step's file, read off the run the store lists,
 * and none for an id it does not have. On a store of its own at `ROOT`, given as `ENV`.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { scratch } from 'test-kit/scratch';
import { testEngine } from 'agent-runtime/testing';
import { testPlace } from '../../place/memory/index.ts';
import { eachTest, runGiven, runOver } from '../../test/placed.ts';
import { heldUnasked } from '../../test/unasked.ts';
import { STEP_ARTIFACT, STEP_FILE } from './commands.verb.ts';
import { startRun, runWith as runEngine } from '../runner.ts';
import { engineOf } from '../runtime-client.ts';
import type { Env } from '../config/config.store.ts';

const ROOT = scratch('wf-pages-');
const ENV: Env = { ...process.env, WF_ROOT: ROOT };
const stand = eachTest(testPlace);
const runWith = runOver(runEngine, () => stand().layer, ENV);
const runPlaced = runGiven(() => stand().layer, ENV);

const engine = eachTest(testEngine);
heldUnasked(engine);

/** The engine of this test: the stand-in, which no command here files on, stops, says to or forgets from (`heldUnasked`). */
const noEngine = () => engineOf(engine().layer);

/** A folder workflow of one step. */
const oneStep = (): string => {
  const dir = scratch('wf-pages-one-');
  fs.writeFileSync(path.join(dir, 'implement.md'), '---\nplace: git\n---\nimplement it\n');
  return dir;
};

/** A repository with one commit on main. */
const aRepo = (): string => {
  const repo = scratch('wf-pages-repo-');
  fs.writeFileSync(path.join(repo, 'README.md'), 'readme\n');
  stand().world.repository(repo, {});
  stand().world.commit(repo, 'base');
  return repo;
};

test("a step's file is read off the run the store lists, never off a path made of its id; a repository run's step has no folder", async () => {
  const started = await runPlaced(startRun({ brief: 'files', repo: aRepo(), workflowDir: oneStep() }));
  const dir = path.join(ROOT, 'runs', started.id, 'artifacts', 'implement');
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, 'notes.md'), 'notes');
  const asked = { step: 'implement', name: 'notes.md' };
  assert.equal((await runWith(noEngine(), STEP_ARTIFACT.handler({ runId: started.id, ...asked }))).file?.toString(), 'notes');
  assert.deepEqual(await runWith(noEngine(), STEP_ARTIFACT.handler({ runId: `x/../${started.id}`, ...asked })), { file: null });
  assert.deepEqual(await runWith(noEngine(), STEP_FILE.handler({ runId: started.id, ...asked })), { folder: null, file: null });
});
