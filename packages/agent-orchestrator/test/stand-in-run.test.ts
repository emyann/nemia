/**
 * A whole run on the test place: `implement → ship` from `startRun` to landed, as `landing-walk.boundary.test.ts` walks it on git, with
 * the session's commit and the shipper's staged merge done through the place's handle (`world`), and no git process started. A `git`
 * planted first on `PATH` before the package is imported records every call it is given, and its record is read empty.
 *
 * The engine is the runtime's stand-in, new for each test as the place is (`eachTest`), which the last two tests show.
 *
 * `WF_ROOT` and `PATH` are set before the runner is imported: the module reads the first as it loads.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { Effect } from 'effect';
import { testPlace } from '../place/memory/index.ts';
import { testEngine } from 'agent-runtime/testing';
import { eachTest, runGiven, runOver } from './placed.ts';
import { plantedGit } from './planted-git.ts';
import { scratch } from './scratch.ts';
import { TEAM, TEAM_DEV } from './team.ts';

const ROOT = scratch('wf-stand-in-run-');
fs.mkdirSync(path.join(ROOT, 'runs'), { recursive: true });

process.env.WF_ROOT = ROOT;
process.env.WF_VERIFY_REST = '1';
delete process.env.WF_MAX_CONCURRENT;
delete process.env.WF_MAX_RUNS;
const PLANTED = plantedGit(process.env);
process.env.PATH = PLANTED.env.PATH;

const { advanceRun, approveRun, decideRun, startRun, runWith: runEngine } = await import('../src/runner.ts');
const { engineOf } = await import('../src/runtime-client.ts');
const { readRun } = await import('../src/record/record.store.ts');

const stand = eachTest(testPlace);
const engine = eachTest(testEngine);
const runWith = runOver(runEngine, () => stand().layer);
const runPlaced = runGiven(() => stand().layer);

fs.cpSync(path.join(TEAM, 'agents'), path.join(ROOT, 'agents'), { recursive: true });
fs.cpSync(path.join(TEAM, 'skills'), path.join(ROOT, 'skills'), { recursive: true });

/** `implement → ship`, the tests' team's ending with its `after:` on implement, as `ship.test.ts` has it. */
const folder = (): string => {
  const dir = fs.mkdtempSync(path.join(ROOT, 'wf-'));
  fs.writeFileSync(path.join(dir, 'implement.md'), '---\nplace: git\n---\nimplement it\n');
  const ship = fs.readFileSync(path.join(TEAM_DEV, 'ship.md'), 'utf8');
  assert.match(ship, /^after: review$/m);
  fs.writeFileSync(path.join(dir, 'ship.md'), ship.replace(/^after: review$/m, 'after: implement'));
  return dir;
};

const SIGNED = { outcome: 'done', summary: 'did the work', artifacts: [], needs: null };
const MESSAGE = 'Add sub\n\nadd.ts exports sub beside add.\n';

test('a run from start to landed on the test place: the merge committed after the base and the result, and no git process started', async () => {
  const { world } = stand();
  const repo = fs.mkdtempSync(path.join(ROOT, 'repo-'));
  const base = world.repository(repo, { 'add.ts': 'export const add = (a, b) => a + b;\n' });
  const b = engine();
  const e = engineOf(b.layer);

  const run = await runPlaced(startRun({ brief: 'add sub', repo, workflowDir: folder() }));
  assert.deepEqual((await runWith(e, advanceRun(readRun(run.id)))).filed, ['implement']);
  const work = readRun(run.id).steps.implement;
  assert.equal(fs.readFileSync(path.join(work.workspace!, 'add.ts'), 'utf8'), 'export const add = (a, b) => a + b;\n', 'a real folder');
  fs.appendFileSync(path.join(work.workspace!, 'add.ts'), 'export const sub = (a, b) => a - b;\n');
  const tip = world.commit(work.workspace!, 'add sub');
  b.settle(`${run.id}-implement`, 'succeeded', { closeout: SIGNED });
  await runWith(e, advanceRun(readRun(run.id)));
  assert.deepEqual(b.filings, [`${run.id}-implement`], 'the ending waits at its gate');

  await runWith(e, approveRun(run.id, 'ship', 'Merge it.'));
  assert.deepEqual((await runWith(e, advanceRun(readRun(run.id)))).filed, ['ship']);
  world.stage(repo, work.branch!);
  b.settle(`${run.id}-ship`, 'succeeded', { closeout: { ...SIGNED, message: MESSAGE } });
  assert.deepEqual((await runWith(e, advanceRun(readRun(run.id)))).checked, ['ship']);
  assert.equal(world.head(repo), base, 'nothing lands while the check runs');

  b.settle(`${run.id}-ship-check`, 'succeeded', { exitCode: 0 });
  const landed = await runWith(e, advanceRun(readRun(run.id)));
  const head = world.head(repo);
  assert.notEqual(head, base, 'the base branch has moved');
  assert.deepEqual(world.read(repo, head), { parents: [base, tip], message: MESSAGE.trim() }, 'a merge of the base and the result');
  assert.equal(
    fs.readFileSync(path.join(repo, 'add.ts'), 'utf8'),
    'export const add = (a, b) => a + b;\nexport const sub = (a, b) => a - b;\n',
    'the checkout holds the merged file',
  );
  assert.deepEqual(readRun(run.id).steps.ship.landed, { commit: head });
  assert.equal(landed.status, 'succeeded');
  assert.equal((await runWith(e, decideRun(run.id))).decision.kind, 'landed');
  assert.deepEqual(PLANTED.said(), [], 'no git was asked anything');
});

test('the planted git counts a call: one git run by this test is one line of its record', () => {
  const before = PLANTED.said().length;
  execFileSync('git', ['--version'], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
  assert.deepEqual(PLANTED.said().slice(before), ['--version']);
});

/** What the test before the one running now was given, and filed on it. */
const before: { engine?: ReturnType<typeof testEngine>; task?: string } = {};

test('the engine is new for each test: one test files a task, settles it at work and says a word to it', async () => {
  const b = engine();
  assert.equal(engine(), b, 'one engine for the whole test');
  const e = engineOf(b.layer);
  const task = await Effect.runPromise(e.file({ id: 'kept-by-one-test', brief: 'do it', cwd: ROOT }));
  b.settle(task, 'working');
  await Effect.runPromise(e.say(task, 'hello'));
  await Effect.runPromise(e.stop(task));
  assert.deepEqual([b.tasks.size, b.filings, b.said, b.stopped], [1, [task], [{ taskId: task, text: 'hello' }], [task]]);
  Object.assign(before, { engine: b, task });
});

test('and the test after it is given another, with no task, no filing and no word said', async () => {
  const b = engine();
  assert.ok(before.engine && before.task, 'the test before this one ran');
  assert.notEqual(b, before.engine);
  assert.deepEqual([b.tasks.size, b.filings, b.specs, b.said, b.stopped, b.forgets], [0, [], [], [], [], []]);
  assert.equal((await Effect.runPromise(engineOf(b.layer).view(before.task))).state.brief, '', 'the task filed before is not on it');
  assert.equal(before.engine.tasks.size, 1, 'and the first keeps its own');
});
