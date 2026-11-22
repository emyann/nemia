/**
 * A try's check's output read through its entry of the command table (`CHECK_OUTPUT`, `stepCheckOutput`), on runs started and advanced over
 * the stand-ins: each try reads its own check's task, a check not settled answers `running`, a stream the runtime did not keep answers the
 * log's lines as `partial`, a check not filed answers no line, and a step with no `check:` or a page asked wrong is refused by its kind.
 * How a page is cut is the contract's (contracts/check-output-page.contract.ts), and how lines are numbered and matched check-output.ts's:
 * here, only that the door hands them what it was asked.
 *
 * The store is the file's own, at `ROOT`, given as `ENV`; each test empties the store's runs first.
 */
import { runRecord } from '../../testing.ts';
import { beforeEach, test } from 'vitest';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { Schema } from 'effect';
import { CheckOutput } from 'objects';
import { testEngine } from 'agent-runtime/testing';
import { scratch } from 'test-kit/scratch';
import { testPlace } from '../../place/memory/index.ts';
import { eachTest, runGiven, runOver } from '../../test/placed.ts';
import { engineOf } from '../runtime-client.ts';
import { CHECK_OUTPUT, type CheckOutputInput } from '../object/commands.verb.ts';
import { advanceRun, startRun, runWith as runEngine } from '../runner.ts';
import { Invalid, Missing } from '../refusal/refusal.ts';
import type { Env } from '../config/config.store.ts';

const ROOT = scratch('wf-check-output-');
const RUNS_DIR = path.join(ROOT, 'runs');
const ENV: Env = { ...process.env, WF_ROOT: ROOT, WF_DEFAULT_FACTORY_STARTS: '1', WF_MAX_CONCURRENT: undefined, WF_MAX_RUNS: undefined };

const stand = eachTest(testPlace);
const runWith = runOver(runEngine, () => stand().layer, ENV);
const runPlaced = runGiven(() => stand().layer, ENV);
const engine = eachTest(testEngine);
const e = () => engineOf(engine().layer);

beforeEach(() => {
  fs.rmSync(RUNS_DIR, { recursive: true, force: true });
  fs.mkdirSync(RUNS_DIR, { recursive: true });
});

const SIGNED = { outcome: 'done', summary: 'did it', artifacts: [], needs: null };

/** A run of one step, `work`, its frontmatter's lines `keys`, started in a repository of its own and advanced one pass. */
const started = async (keys: string[]) => {
  const dir = scratch('wf-check-output-team-');
  fs.writeFileSync(path.join(dir, 'work.md'), `---\nplace: git\n${keys.map((k) => `${k}\n`).join('')}---\nwork it\n`);
  const repo = scratch('wf-check-output-repo-');
  stand().world.repository(repo, {});
  const run = await runPlaced(startRun({ brief: 'check me', repo, workflowDir: dir }));
  await advanced(run.id);
  return run.id;
};

const advanced = (id: string) => runWith(e(), advanceRun(runRecord(ROOT, id)));

/** What the entry answers for `input`, decoded whole through the api's `CheckOutput`. */
const read = async (input: CheckOutputInput) => {
  const answer = await runWith(e(), CHECK_OUTPUT.handler(input));
  assert.deepEqual(Schema.decodeUnknownSync(CheckOutput)(answer), answer, 'the answer decodes whole through CheckOutput');
  return answer;
};

/** What a promise rejects with. */
const refusal = async (p: Promise<unknown>) => {
  try {
    await p;
  } catch (err) {
    return err;
  }
  assert.fail('it answered where it should have refused');
};

/** A run whose `work` signed off and whose check refused, then its try 2 signed off and was checked again, settled or not. */
const twoTries = async (second: 'failed' | 'running') => {
  const id = await started(['check: npm test', 'retries: 1']);
  engine().settle(`${id}-work`, 'succeeded', { closeout: SIGNED });
  await advanced(id);
  engine().settle(`${id}-work-check`, 'failed', {
    exitCode: 1,
    printed: { stdout: 'ok 1 - one\nnot ok 2 - two\n# fail 1\n', stderr: 'npm error Test failed.\n' },
  });
  await advanced(id);
  engine().settle(`${id}-work-try2`, 'succeeded', { closeout: SIGNED });
  await advanced(id);
  if (second === 'failed') engine().settle(`${id}-work-try2-check`, 'failed', { exitCode: 1, printed: { stdout: 'not ok 3 - three\n' } });
  else engine().settle(`${id}-work-try2-check`, 'working', { printed: { stdout: 'ok 1 - one\n' } });
  return id;
};

test("each try reads its own check's task, the latest where none is asked, stdout by default and stderr when asked", async () => {
  const id = await twoTries('failed');
  const first = await read({ runId: id, step: 'work', try: '1' });
  assert.deepEqual([first.try, first.taskId, first.stream, first.running, first.partial], [1, `${id}-work-check`, 'stdout', false, false]);
  assert.deepEqual(
    first.lines.map((l) => l.text),
    ['ok 1 - one', 'not ok 2 - two', '# fail 1'],
  );
  assert.equal(first.total, 3);
  const latest = await read({ runId: id, step: 'work' });
  assert.deepEqual([latest.try, latest.taskId], [2, `${id}-work-try2-check`]);
  assert.deepEqual(latest.lines, [{ n: 1, text: 'not ok 3 - three' }]);
  const stderr = await read({ runId: id, step: 'work', try: '1', stream: 'stderr' });
  assert.deepEqual(stderr.lines, [{ n: 1, text: 'npm error Test failed.' }]);
});

test('a page reads on from its next, the last lines end the stream, and a match keeps its lines under their numbers', async () => {
  const id = await twoTries('failed');
  const page = await read({ runId: id, step: 'work', try: '1', limit: '2' });
  assert.deepEqual([page.lines.map((l) => l.n), page.next], [[1, 2], 3]);
  const on = await read({ runId: id, step: 'work', try: '1', from: String(page.next) });
  assert.deepEqual([on.lines.map((l) => l.n), on.next], [[3], undefined]);
  const last = await read({ runId: id, step: 'work', try: '1', last: '2' });
  assert.deepEqual(
    last.lines.map((l) => l.n),
    [2, 3],
  );
  const found = await read({ runId: id, step: 'work', try: '1', match: 'NOT OK' });
  assert.deepEqual([found.lines, found.matched, found.total], [[{ n: 2, text: 'not ok 2 - two' }], 1, 3]);
});

test('a page back from a line holds as many held lines as one forward, matches and not line numbers under a match', async () => {
  const id = await started(['check: npm test']);
  engine().settle(`${id}-work`, 'succeeded', { closeout: SIGNED });
  await advanced(id);
  const stdout = Array.from({ length: 10 }, (_, i) => (i % 2 === 1 ? `FAIL ${i + 1}` : `ok ${i + 1}`)).join('\n');
  engine().settle(`${id}-work-check`, 'failed', { exitCode: 1, printed: { stdout: `${stdout}\n` } });
  const pages: number[][] = [];
  const befores: (number | undefined)[] = [];
  let at = await read({ runId: id, step: 'work', match: 'fail', last: '2' });
  pages.push(at.lines.map((l) => l.n));
  befores.push(at.before);
  while (at.before !== undefined) {
    at = await read({ runId: id, step: 'work', match: 'fail', before: String(at.before), limit: '2' });
    pages.push(at.lines.map((l) => l.n));
    befores.push(at.before);
  }
  assert.deepEqual(pages, [[8, 10], [4, 6], [2]], 'each page back holds two matches, down to the first');
  assert.deepEqual(befores, [8, 4, undefined]);
  const first = await read({ runId: id, step: 'work', match: 'fail', before: '2' });
  assert.deepEqual([first.lines, first.next, first.before], [[], 2, undefined], 'nothing is held before the first match');
  const whole = await read({ runId: id, step: 'work', before: '4', limit: '2' });
  assert.deepEqual([whole.lines.map((l) => l.n), whole.before, whole.next], [[2, 3], 2, 4]);
});

test('a check still running answers what it printed so far, running', async () => {
  const id = await twoTries('running');
  const answer = await read({ runId: id, step: 'work' });
  assert.deepEqual([answer.try, answer.running, answer.lines], [2, true, [{ n: 1, text: 'ok 1 - one' }]]);
});

test("a stdout the runtime did not keep answers the log's lines, partial", async () => {
  const id = await started(['check: npm test']);
  engine().settle(`${id}-work`, 'succeeded', { closeout: SIGNED });
  await advanced(id);
  engine().settle(`${id}-work-check`, 'failed', { exitCode: 1 });
  const answer = await read({ runId: id, step: 'work' });
  assert.equal(answer.partial, true);
  assert.ok(answer.lines.length > 0, "the log's lines are answered");
  const stderr = await read({ runId: id, step: 'work', stream: 'stderr' });
  assert.deepEqual([stderr.partial, stderr.lines], [false, []], 'stderr kept none, and nothing stands in for it');
});

test('a try whose check is not filed answers no line, and a step with no check: is refused as missing', async () => {
  const checked = await started(['check: npm test']);
  const none = await read({ runId: checked, step: 'work' });
  assert.deepEqual([none.taskId, none.lines, none.total], [null, [], 0]);
  const unchecked = await started([]);
  assert.ok((await refusal(read({ runId: unchecked, step: 'work' }))) instanceof Missing);
  assert.ok((await refusal(read({ runId: checked, step: 'work', try: '9' }))) instanceof Missing, 'a try it lacks');
});

test('a page asked wrong is refused as invalid, before the engine is read', async () => {
  const id = await twoTries('failed');
  for (const asked of [
    { from: '0' },
    { from: 'x' },
    { last: '2', from: '1' },
    { last: '2', limit: '2' },
    { limit: '0' },
    { last: '-1' },
    { before: '0' },
    { before: 'x' },
    { before: '3', from: '1' },
    { before: '3', last: '2' },
  ])
    assert.ok((await refusal(read({ runId: id, step: 'work', ...asked }))) instanceof Invalid, JSON.stringify(asked));
});
