/**
 * `nemia ls` and `nemia stats` and a run's labels, on their handlers: `-l` keeps the runs a selector takes, and `stats -l` sums the facts
 * of the runs it takes alone. The labels `nemia ls` prints beside each run are the client's to print (`apps/cli/test/reads.test.ts`).
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { scratch } from 'test-kit/scratch';
import { testEngine } from 'agent-runtime/testing';
import { testPlace } from '../../place/memory/index.ts';
import { eachTest, runGiven, runOver } from '../../test/placed.ts';
import { names } from '../../test/assessed.ts';
import { COMMANDS } from './commands.verb.ts';
import { LS } from '../list/commands.verb.ts';
import { parseArgv } from './command.ts';
import { advanceRun, startRun, runWith as runEngine } from '../runner.ts';
import { runRecord } from '../record/record.store.ts';
import { Invalid } from '../refusal/refusal.ts';
import { engineOf } from '../runtime-client.ts';
import type { Env } from '../config/config.store.ts';
import { filesStoreAt } from '../record/files.store.ts';

const ROOT = scratch('wf-ls-labels-');
const ENV: Env = { ...process.env, WF_ROOT: ROOT, WF_MAX_RUNS: undefined, WF_MAX_CONCURRENT: undefined };
const filed = filesStoreAt(ROOT);
const stand = eachTest(testPlace);
const runWith = runOver(runEngine, () => stand().layer, ENV);
const runPlaced = runGiven(() => stand().layer, ENV);
const engine = eachTest(testEngine);
const noEngine = () => engineOf(engine().layer);

/** A folder workflow of one step, named `name`. */
const oneStep = (name: string): string => {
  const dir = path.join(scratch('wf-ls-labels-team-'), name);
  fs.mkdirSync(dir);
  fs.writeFileSync(path.join(dir, 'implement.md'), '---\nplace: git\n---\nimplement it\n');
  return dir;
};

/** A run of `build`, in a repository of its own. */
const started = async (brief: string) => {
  const repo = scratch('wf-ls-labels-repo-');
  stand().world.repository(repo, {});
  return await runPlaced(startRun({ brief, repo, workflowDir: oneStep('build') }));
};

/** The runs `nemia ls <argv>` reads, by id, its arguments parsed by its own words. */
const listedBy = async (...argv: string[]): Promise<string[]> => {
  const args = parseArgv(LS.spec, argv) ?? {};
  return (await runWith(noEngine(), LS.handler(args))).runs.map(({ run }) => run.id);
};

test("nemia ls selects by -l, two of them either; the labels it prints beside each run are the client's (apps/cli/test/reads.test.ts)", async () => {
  fs.rmSync(path.join(ROOT, 'runs'), { recursive: true, force: true });
  const core = await started('the core one');
  const bare = await started('the bare one');
  filed.labels.put(core.id, { team: 'core', tier: 'gold' });
  assert.deepEqual((await listedBy()).sort(), [core.id, bare.id].sort(), 'with no -l, every run');
  assert.deepEqual(await listedBy('-l', 'team=core'), [core.id], 'the run the selector takes, and not the one it does not');
  assert.deepEqual(
    (await listedBy('-l', 'team=core', '-l', 'team notin (core)')).sort(),
    [core.id, bare.id].sort(),
    'two selectors are either',
  );
});

test('REFUSED by kind: nemia ls -l of no selector, by its handler, before anything is read', async () => {
  await assert.rejects(runWith(noEngine(), LS.handler({ selector: ['no/pe=x'] })), (err: Error & { exitCode?: number }) => {
    assert.ok(err instanceof Invalid, String(err));
    assert.equal(err.exitCode, 2);
    names(err.message, 'no/pe');
    return true;
  });
});

test('nemia stats -l sums the facts of the runs the selector takes alone', async () => {
  fs.rmSync(path.join(ROOT, 'runs'), { recursive: true, force: true });
  const ended = async (brief: string) => {
    const run = await started(brief);
    await runWith(noEngine(), advanceRun(runRecord(ROOT, run.id)));
    engine().settle(`${run.id}-implement`, 'succeeded', { closeout: { outcome: 'done', summary: 'did it', artifacts: [], needs: null } });
    await runWith(noEngine(), advanceRun(runRecord(ROOT, run.id)));
    return run;
  };
  const core = await ended('the core one');
  await ended('the bare one');
  filed.labels.put(core.id, { team: 'core' });
  const STATS = COMMANDS.find((c) => c.name === 'stats')!;
  const tries = async (args: Record<string, readonly string[]>) =>
    ((await runWith(noEngine(), STATS.handler(args))) as { all: { total: { tries: number } } }).all.total.tries;
  assert.equal(await tries({}), 2, 'every run’s try');
  assert.equal(await tries({ selector: ['team=core'] }), 1, 'the try of the run the selector takes alone');
  assert.equal(await tries({ selector: ['team=infra'] }), 0, 'and none where it takes no run');
});

test("REFUSED by kind: nemia stats -l of no selector, the api's refusal, which the command line exits on", async () => {
  const STATS = COMMANDS.find((c) => c.name === 'stats')!;
  await assert.rejects(runWith(noEngine(), STATS.handler({ selector: 'no/pe=x' })), (err: Error & { exitCode?: number }) => {
    assert.ok(err instanceof Invalid, String(err));
    assert.equal(err.exitCode, 2);
    names(err.message, 'no/pe');
    return true;
  });
});
