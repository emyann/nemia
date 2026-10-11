/**
 * A closeout that names a file the run does not have is refused, at shipped defaults: the step reads `unsigned` before any check of it
 * is filed, the run nudges it once a round with each file, why and what to do, and past that nudge it waits on a person, whose
 * `nemia decide` names the files. A closeout whose files are all there, and one that names none, pass as before. The step after is told
 * the named files that are there, and no name with no file. A task an earlier pass read settled is never read back into a refusal.
 *
 * Walked on the test place and the engine's stand-in, over a folder of two steps, `implement` with a `check:` and `review` after it.
 * `WF_ROOT` is set before the runner is imported, which reads it as it loads.
 */
import { test, type TestContext } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { testEngine } from 'agent-runtime/testing';
import { testPlace } from '../place/memory/index.ts';
import { eachTest, runGiven, runOver } from './placed.ts';
import { scratch } from './scratch.ts';
import type { Run, StepRecord } from '../src/run.ts';
import type { Workflow } from '../src/workflow.ts';

const ROOT = scratch('wf-closeout-files-');
fs.mkdirSync(path.join(ROOT, 'runs'), { recursive: true });

process.env.WF_ROOT = ROOT;
process.env.WF_VERIFY_REST = '1';
process.env.WF_DEFAULT_FACTORY_STARTS = '1';
process.env.NEMIA_DAEMON_START = 'off';
delete process.env.WF_MAX_CONCURRENT;
delete process.env.WF_MAX_RUNS;
const { main } = await import('../src/cli/main.ts');
const { engineOf } = await import('../src/runtime-client.ts');
const { advanceRun, startRun, runWith: runEngine } = await import('../src/runner.ts');
const { readRun, rewriteRun, artifactsDir } = await import('../src/record/record.store.ts');
const { filesDue } = await import('../src/workspace/workspace.ts');
const { nextTry } = await import('../src/retry/index.ts');
const { roundFiled } = await import('../src/round/round.ts');
const { sentBack } = await import('../src/status/status.ts');
const { lackedOf } = await import('../src/record/record.ts');
const { nearName } = await import('../src/artifacts/artifacts.ts');

const stand = eachTest(testPlace);
const engine = eachTest(testEngine);
const runWith = runOver(runEngine, () => stand().layer);
const runPlaced = runGiven(() => stand().layer);

/** One pass over the run `id`, on this test's engine and place: what it filed, checked and tried. */
const advanced = (id: string) => runWith(engineOf(engine().layer), advanceRun(readRun(id)));

/** `implement`, with a check, then `review` after it. */
function folder(): string {
  const dir = fs.mkdtempSync(path.join(ROOT, 'wf-'));
  fs.writeFileSync(path.join(dir, 'implement.md'), '---\nplace: git\ncheck: npm test\n---\nimplement it\n');
  fs.writeFileSync(path.join(dir, 'review.md'), '---\nafter: implement\nplace: git\n---\nreview it\n');
  return dir;
}

/** A run of `folder` started on a repository of the test place, its first pass made: `implement` is filed. */
async function started(): Promise<{ id: string; files: string; task: string }> {
  const repo = fs.mkdtempSync(path.join(ROOT, 'repo-'));
  stand().world.repository(repo, { 'a.txt': 'one\n' });
  const run = await runPlaced(startRun({ brief: 'add a flag', repo, workflowDir: folder() }));
  assert.deepEqual((await advanced(run.id)).filed, ['implement']);
  return { id: run.id, files: artifactsDir(run, 'implement'), task: `${run.id}-implement` };
}

/** A flat closeout, as a harness writes one, naming `artifacts`. */
const signed = (...artifacts: string[]) => ({ closeout: { outcome: 'done', summary: 'did the work', artifacts, needs: null } });

/** The brief the task `id` was filed with. */
const briefOf = (id: string): string => String(engine().tasks.get(id)?.spec.brief ?? '');

/** `nemia`, typed with `argv` on this test's engine and place: what it printed. */
async function typed(t: TestContext, ...argv: string[]): Promise<string> {
  const printed: string[] = [];
  const log = t.mock.method(console, 'log', (...args: unknown[]) => {
    printed.push(args.join(' '));
  });
  try {
    await main(argv, engineOf(engine().layer), undefined, stand().place);
  } finally {
    log.mock.restore();
  }
  return printed.join('\n');
}

test('REFUSED: a closeout naming a file that is there and one that is not is unsigned before any check, and its nudge names the file', async () => {
  const { id, files, task } = await started();
  fs.writeFileSync(path.join(files, 'report.md'), 'what was done');
  fs.writeFileSync(path.join(files, 'Shot-Dark.png'), 'a picture under a near name');
  const gone = path.join(files, 'shot-dark.png');
  engine().settle(task, 'succeeded', signed(path.join(files, 'report.md'), gone));

  const pass = await advanced(id);
  assert.deepEqual(pass.checked, [], 'no check is filed for a closeout the run does not accept');
  assert.deepEqual(pass.tried, ['implement'], 'the run nudges the step itself');
  assert.equal(engine().tasks.has(`${task}-check`), false);
  const record = readRun(id).steps.implement;
  assert.equal(record.tries?.at(-1)?.then, 'signoff');
  assert.equal(record.taskId, `${task}-try2`);
  assert.equal(readRun(id).steps.review?.taskId ?? null, null, 'nothing that waits on it is filed');

  const brief = briefOf(`${task}-try2`);
  assert.ok(brief.includes(`- \`${gone}\`: it is not a file in \`${files}\`.`), brief);
  assert.ok(brief.includes(`There is \`${path.join(files, 'Shot-Dark.png')}\`.`), `the near name is said\n${brief}`);
  assert.ok(brief.includes('either write the file where this brief says'), brief);
  assert.ok(brief.includes('take\nits name off `artifacts`'), brief);
  assert.ok(!brief.includes(`\`${path.join(files, 'report.md')}\`:`), 'the file that is there is not named as lacked');
  assert.ok(!brief.includes('ended without calling `StructuredOutput`'), 'it is not told it gave no closeout: it gave one');
});

test('the refusal is answered as a refused check is: a next closeout whose files are all there is checked, and the step goes on', async () => {
  const { id, files, task } = await started();
  engine().settle(task, 'succeeded', signed(path.join(files, 'shot.png')));
  assert.deepEqual((await advanced(id)).tried, ['implement']);

  fs.writeFileSync(path.join(files, 'shot.png'), 'png');
  engine().settle(`${task}-try2`, 'succeeded', signed(path.join(files, 'shot.png')));
  const pass = await advanced(id);
  assert.deepEqual(pass.checked, ['implement'], 'its check is filed');
  assert.deepEqual(pass.tried, []);
  assert.equal(readRun(id).steps.implement.lacks, undefined, 'and the record holds nothing of the first closeout');

  engine().settle(`${task}-try2-check`, 'succeeded', { exitCode: 0 });
  assert.deepEqual((await advanced(id)).filed, ['review']);
});

test('REFUSED once a round: a nudged try that names the missing file again leaves the step unsigned on a person, and nemia decide names the file', async (t) => {
  const { id, files, task } = await started();
  const gone = path.join(files, 'shot.png');
  engine().settle(task, 'succeeded', signed(gone));
  assert.deepEqual((await advanced(id)).tried, ['implement']);
  engine().settle(`${task}-try2`, 'succeeded', signed(gone));

  const pass = await advanced(id);
  assert.deepEqual([pass.tried, pass.checked, pass.filed], [[], [], []], 'no second nudge in the round, no check, nothing after it');
  assert.deepEqual(readRun(id).steps.implement.lacks, [{ taskId: `${task}-try2`, path: gone, why: 'missing' }]);

  for (let n = 0; n < 3; n++) assert.deepEqual((await advanced(id)).tried, [], 'nor on a later pass');
  assert.equal(engine().tasks.has(`${task}-try3`), false);
  assert.equal(engine().tasks.has(`${task}-try2-check`), false);

  const screen = await typed(t, 'decide', id);
  assert.match(screen, /UNSIGNED: implement \(nudged to sign off once by the run, and unsigned again\)/);
  assert.ok(screen.includes("implement's closeout named a file the run does not have:"), screen);
  assert.ok(screen.includes(`- \`${gone}\`: it is not a file in \`${files}\`.`), screen);
  assert.ok(screen.includes(`nemia retry ${id} implement`), screen);
});

test('a closeout whose files are all there, and one that names none, pass as before: the check is filed and no try', async () => {
  for (const artifacts of [['report.md', 'in-files'], []]) {
    const { id, files, task } = await started();
    const workspace = readRun(id).steps.implement.workspace!;
    if (artifacts.length) {
      fs.writeFileSync(path.join(workspace, 'report.md'), 'left in the workspace, and collected');
      fs.writeFileSync(path.join(files, 'in-files'), 'put in the files directory');
    }
    const before = JSON.stringify(readRun(id).steps.implement);
    engine().settle(task, 'succeeded', signed(...artifacts.map((name) => (name === 'in-files' ? path.join(files, name) : name))));
    const pass = await advanced(id);
    assert.deepEqual([pass.checked, pass.tried], [['implement'], []]);
    assert.equal(readRun(id).steps.implement.lacks, undefined, 'no mark is kept where nothing lacks');
    assert.equal(JSON.parse(before).taskId, readRun(id).steps.implement.taskId);
  }
});

test('a task an earlier pass read settled is not read back into a refusal: its settle is counted, or the record counts none', async () => {
  for (const counted of [(task: string) => [task], () => undefined]) {
    const { id, files, task } = await started();
    engine().settle(task, 'succeeded', signed(path.join(files, 'gone.png')));
    const run = readRun(id);
    const settlesCounted = counted(task);
    if (settlesCounted) run.settlesCounted = settlesCounted;
    else delete run.settlesCounted;
    rewriteRun(run);

    const pass = await advanced(id);
    assert.deepEqual([pass.checked, pass.tried], [['implement'], []], 'it goes on to its check, as it would have');
    assert.equal(readRun(id).steps.implement.lacks, undefined);
  }
});

test('the step after is told the named files that are there by absolute path, and never the name of one that is gone', async () => {
  const { id, files, task } = await started();
  const kept = path.join(files, 'kept-dark.png');
  const removed = path.join(files, 'removed-dark.png');
  for (const file of [kept, removed]) fs.writeFileSync(file, 'png');
  engine().settle(task, 'succeeded', signed(kept, removed));
  assert.deepEqual((await advanced(id)).checked, ['implement']);

  fs.rmSync(removed);
  engine().settle(`${task}-check`, 'succeeded', { exitCode: 0 });
  assert.deepEqual((await advanced(id)).filed, ['review']);
  const brief = briefOf(`${id}-review`);
  assert.ok(
    brief.includes(`The files implement named that are there: \`${kept}\`. 1 file it named is not there, and is not listed.`),
    brief,
  );
  assert.ok(!brief.includes('removed-dark.png'), `a name with no file is handed to no one\n${brief}`);
  assert.equal(readRun(id).steps.implement.lacks, undefined, 'and the step that named it, verified since, is not unsigned for it');
});

const STEPS = [
  { name: 'implement', after: [] },
  { name: 'review', after: ['implement'], loop: 'implement' },
] as unknown as Workflow[];

/** A run whose `implement` is on task `t1`, with `settlesCounted` as given. */
const runOf = (record: Partial<StepRecord> = {}, counted: string[] | null = []): Run =>
  ({ id: 'r-1', steps: { implement: { taskId: 't1', ...record } }, ...(counted ? { settlesCounted: counted } : {}) }) as unknown as Run;

test('the files of a step are read once, on the pass that first reads its task settled, and never of a remote step or a pruned run', () => {
  const naming = () => ({ artifacts: ['a.md'] });
  const succeeded = (): 'succeeded' => 'succeeded';
  assert.deepEqual(filesDue(STEPS, runOf(), succeeded, naming), ['implement']);
  assert.deepEqual(
    filesDue(STEPS, runOf(), () => 'running', naming),
    [],
  );
  assert.deepEqual(
    filesDue(STEPS, runOf(), () => 'failed', naming),
    [],
  );
  assert.deepEqual(
    filesDue(STEPS, runOf(), succeeded, () => ({ artifacts: [] })),
    [],
    'a closeout that names none',
  );
  assert.deepEqual(
    filesDue(STEPS, runOf(), succeeded, () => undefined),
    [],
    'no closeout',
  );
  assert.deepEqual(filesDue(STEPS, runOf({}, ['t1']), succeeded, naming), [], 'a settle an earlier pass counted');
  assert.deepEqual(filesDue(STEPS, runOf({}, null), succeeded, naming), [], 'a record that counts no settle');
  assert.deepEqual(filesDue(STEPS, runOf({ lacks: [{ taskId: 't1', path: 'a.md', why: 'not there' }] }), succeeded, naming), []);
  assert.deepEqual(filesDue(STEPS, { ...runOf(), pruned: { at: '2026-01-01T00:00:00Z' } } as unknown as Run, succeeded, naming), []);
  const remote: Workflow[] = [{ ...STEPS[0], harness: 'a2a:elsewhere' }, STEPS[1]];
  assert.deepEqual(filesDue(remote, runOf(), succeeded, naming), [], 'a step on a remote agent has no local file');
});

test('a new try, a new round and a send-back drop what the closeout before lacked, and another task’s mark unsigns nothing', () => {
  const record: StepRecord = { taskId: 't1', lacks: [{ taskId: 't1', path: 'a.md', why: 'not there' }] };
  assert.equal(lackedOf(record).length, 1);
  assert.deepEqual(lackedOf({ ...record, taskId: 't2' }), [], 'a mark of another task is inert');
  assert.equal(nextTry(record, { step: 'implement', try: 2, mode: 'nudge', by: 'signoff' }, 't2').lacks, undefined);
  assert.equal(nextTry(record, { step: 'implement', try: 2, mode: 'fresh', by: 'ask' }, 't2').lacks, undefined);
  assert.equal(sentBack(record).lacks, undefined);
  const round = { step: 'review', target: 'implement', round: 2, by: 'loop' } as unknown as Parameters<typeof roundFiled>[2];
  const next = roundFiled(STEPS, runOf(record), round, 't1-try2');
  assert.equal(next.implement.lacks, undefined);
});

test('a near name is one with the same last name, letter case aside, in the folder named or in another', () => {
  const there = ['/files/builder-dark.png', '/files/shots/factory-dark.png'];
  assert.equal(nearName('/files/Builder-Dark.png', there), '/files/builder-dark.png');
  assert.equal(nearName('/files/factory-dark.png', there), '/files/shots/factory-dark.png');
  assert.equal(nearName('/files/builder-agent-dark.png', there), undefined, 'an unrelated name gives none');
  assert.equal(nearName('/files/builder-dark.png', there), undefined, 'nor the file itself');
});
