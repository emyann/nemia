/**
 * `nemia ls` and `nemia stats` and a run's labels, in process: `-l` keeps the runs a selector takes, `--show-labels` and `-L <key>` add
 * segments to each run's head line, and with neither the lines are as they were; `stats -l` sums the facts of the runs it takes alone.
 * `WF_ROOT` is set before the import, since the store reads it as it loads.
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

const ROOT = scratch('wf-ls-labels-');
process.env.WF_ROOT = ROOT;
delete process.env.WF_MAX_RUNS;
delete process.env.WF_MAX_CONCURRENT;
const { COMMANDS } = await import('./commands.verb.ts');
const { parseArgv } = await import('./command.ts');
const { advanceRun, startRun, runWith: runEngine } = await import('../runner.ts');
const { runRecord } = await import('../record/record.store.ts');
const { filesStore: runStore } = await import('../record/files.store.ts');
const { Invalid } = await import('../refusal/refusal.ts');
const { engineOf } = await import('../runtime-client.ts');
const stand = eachTest(testPlace);
const runWith = runOver(runEngine, () => stand().layer);
const runPlaced = runGiven(() => stand().layer);
const engine = eachTest(testEngine);
const noEngine = () => engineOf(engine().layer);
const LS = COMMANDS.find((c) => c.name === 'ls')!;

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

/** What `nemia ls <argv>` prints, its arguments parsed as the CLI parses them. */
const printed = async (...argv: string[]): Promise<string[]> => {
  const args = parseArgv(LS.spec, argv) ?? {};
  return [...LS.print(await runWith(noEngine(), LS.handler(args)), args)];
};

/** The head line of the run `id` among `lines`. */
const headOf = (lines: readonly string[], id: string): string => lines.find((l) => l.startsWith(`${id}  `)) ?? '';

test('nemia ls selects by -l, and adds the labels to each run’s head line by --show-labels and -L, the lines as before with neither', async () => {
  fs.rmSync(path.join(ROOT, 'runs'), { recursive: true, force: true });
  const core = await started('the core one');
  const bare = await started('the bare one');
  const before = await printed();
  runStore.labels.put(core.id, { team: 'core', tier: 'gold' });
  const plain = await printed();
  assert.deepEqual(plain, before, 'with neither flag, a labelled run prints its lines byte for byte as before');
  const shown = await printed('--show-labels', '-L', 'team', '-L', 'workflow');
  assert.equal(
    headOf(shown, core.id),
    `${headOf(plain, core.id)}  labels: factory=default,team=core,tier=gold,workflow=build  team: core  workflow: build`,
    'the whole map, then each column in the order given',
  );
  assert.equal(headOf(shown, bare.id), `${headOf(plain, bare.id)}  labels: factory=default,workflow=build  team: <none>  workflow: build`);
  assert.deepEqual(
    shown.filter((l) => !l.startsWith(`${core.id}  `) && !l.startsWith(`${bare.id}  `)),
    plain.filter((l) => !l.startsWith(`${core.id}  `) && !l.startsWith(`${bare.id}  `)),
    'no other line changes',
  );
  const selected = await printed('-l', 'team=core');
  assert.ok(headOf(selected, core.id), 'the run the selector takes is listed');
  assert.equal(headOf(selected, bare.id), '', 'and the one it does not take is not');
  const either = await printed('-l', 'team=core', '-l', 'team notin (core)');
  assert.ok(headOf(either, core.id) && headOf(either, bare.id), 'two selectors are either');
});

test('REFUSED by kind: nemia ls -l of no selector, before anything is read', async () => {
  const check = LS.check?.({ selector: ['no/pe=x'] });
  assert.ok(check, 'the command line refuses it');
  names(check, 'no/pe');
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
    await runWith(noEngine(), advanceRun(runRecord(run.id)));
    engine().settle(`${run.id}-implement`, 'succeeded', { closeout: { outcome: 'done', summary: 'did it', artifacts: [], needs: null } });
    await runWith(noEngine(), advanceRun(runRecord(run.id)));
    return run;
  };
  const core = await ended('the core one');
  await ended('the bare one');
  runStore.labels.put(core.id, { team: 'core' });
  const STATS = COMMANDS.find((c) => c.name === 'stats')!;
  const tries = async (args: Record<string, readonly string[]>) =>
    ((await runWith(noEngine(), STATS.handler(args))) as { all: { total: { tries: number } } }).all.total.tries;
  assert.equal(await tries({}), 2, 'every run’s try');
  assert.equal(await tries({ selector: ['team=core'] }), 1, 'the try of the run the selector takes alone');
  assert.equal(await tries({ selector: ['team=infra'] }), 0, 'and none where it takes no run');
});

test('REFUSED by kind: nemia stats -l of no selector, on the command line and from the api', async () => {
  const STATS = COMMANDS.find((c) => c.name === 'stats')!;
  names(STATS.check?.({ selector: ['no/pe=x'] }), 'no/pe');
  await assert.rejects(runWith(noEngine(), STATS.handler({ selector: 'no/pe=x' })), (err: Error & { exitCode?: number }) => {
    assert.ok(err instanceof Invalid, String(err));
    assert.equal(err.exitCode, 2);
    names(err.message, 'no/pe');
    return true;
  });
});
