/**
 * A condition whose eval is a script (`route: { script: <path> }`), on the test engine: filed as a command task under its step's id, run
 * from the run's frozen workflow files with a request and an answer file in its environment, and read off its attempt — its exit and the
 * answer the runtime kept (`terminationMessage`) — as a route, or as the word its step reads instead.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { scratch } from './scratch.ts';

const ROOT = scratch('wf-script-route-');
fs.mkdirSync(path.join(ROOT, 'runs'), { recursive: true });
process.env.WF_ROOT = ROOT;
process.env.WF_VERIFY_REST = '1';
delete process.env.WF_MAX_CONCURRENT;
delete process.env.WF_MAX_RUNS;
process.env.WF_DEFAULT_FACTORY_STARTS = '1';
const { advanceRun, startRun, runWith: runEngine } = await import('../src/runner.ts');
const { readRun, rewriteRun } = await import('../src/record/record.store.ts');
const { main: cli } = await import('../src/cli/main.ts');
const { engineOf, over } = await import('../src/runtime-client.ts');
const { closeoutReader, taskPhasesRead } = await import('../src/views/views.verb.ts');
const { runWords } = await import('../src/route/route-words.ts');
const { staged } = await import('./story.ts');
type Board = ReturnType<typeof stage.board>;
const stage = staged({ runWith: runEngine, main: cli, engineOf });

const SIGNED = { outcome: 'done', summary: 'the plan: a page', artifacts: [], needs: null };

/** plan, then the condition `pick` (a script over web and docs), then web and docs, each on its route. */
const folder = (): string => {
  const dir = fs.mkdtempSync(path.join(ROOT, 'wf-'));
  const write = (name: string, lines: string[]) =>
    fs.writeFileSync(path.join(dir, `${name}.md`), `---\n${['place: git', ...lines].join('\n')}\n---\n${name} it\n`);
  write('plan', []);
  write('pick', ['after: plan', 'routes: [web, docs]', 'route: { script: pick.ts }']);
  write('web', ['after: pick', 'when: [web]']);
  write('docs', ['after: pick', 'when: [docs]']);
  fs.writeFileSync(path.join(dir, 'pick.ts'), "console.log('never run on the test engine');\n");
  return dir;
};

/** A run at its condition: plan signed off, and the pass that files `pick` has run. */
async function atTheCondition() {
  const repo = fs.mkdtempSync(path.join(ROOT, 'repo-'));
  stage.place().world.repository(repo, {});
  const b = stage.board();
  const { id } = await stage.runPlaced(startRun({ brief: 'route it', repo, workflowDir: folder() }));
  const tick = () => stage.runWith(b.e, advanceRun(readRun(id)));
  await tick();
  b.settle(`${id}-plan`, 'succeeded', SIGNED);
  await tick();
  return { id, b, tick };
}

/** Each step's word on a pass now, as the tick reads it (`runWords`, over the closeouts the pass reads). */
const wordsOf = async (b: Board, id: string): Promise<Record<string, string>> => {
  const run = readRun(id);
  const steps = run.workflow ?? [];
  const { views, phaseOf } = await stage.runWith(b.e, taskPhasesRead(run).pipe(over(b.e)));
  return Object.fromEntries(runWords(steps, run, phaseOf, closeoutReader(views, run, steps)));
};

test("a script condition is filed as a command task from the frozen workflow files, told a check's names, its request and its answer", async () => {
  const { id, b } = await atTheCondition();
  const spec = b.specs.find((s) => s.id === `${id}-pick`);
  assert.ok(spec, 'the condition is filed under the id its step would get');
  assert.equal(spec.harness, 'command');
  const run = readRun(id);
  const config = spec.config as { command: string[]; env: Record<string, string>; terminationMessagePath: string };
  assert.equal(config.command[0], 'node');
  assert.ok(run.workflowFiles && config.command[1]?.endsWith(path.join(run.workflowFiles, 'pick.ts')), config.command[1]);
  assert.equal(config.env.WF_RUN, id);
  assert.equal(config.env.WF_STEP, 'pick');
  assert.ok(config.env.WF_WORKFLOW_FILES && config.command[1]?.startsWith(config.env.WF_WORKFLOW_FILES));
  assert.equal(config.terminationMessagePath, config.env.WF_ANSWER);
  assert.ok(path.isAbsolute(config.env.WF_ANSWER ?? ''));
  const request = JSON.parse(fs.readFileSync(config.env.WF_REQUEST ?? '', 'utf8'));
  assert.deepEqual([request.v, request.step, request.routes, Object.keys(request.closeouts)], [1, 'pick', ['web', 'docs'], ['plan']]);
  assert.equal(spec.cwd, run.steps.plan?.workspace ?? run.workspace, "its first parent's workspace");
  assert.equal(run.steps.pick?.taskId, `${id}-pick`);
});

test('exit 0 with an answer naming a declared route takes it: the route is copied onto the record once, and its node is filed', async () => {
  const { id, b, tick } = await atTheCondition();
  b.end(`${id}-pick`, 'succeeded', { exitCode: 0, terminationMessage: '{"route":"web","why":"a page"}' });
  await tick();
  assert.deepEqual(readRun(id).steps.pick?.route, { route: 'web', try: 1, by: 'script' });
  assert.ok(b.filings.includes(`${id}-web`), 'the route taken is filed');
  assert.ok(!b.filings.includes(`${id}-docs`), 'the other is not');
  const kept = readRun(id).steps.pick?.route;
  await tick();
  assert.deepEqual(readRun(id).steps.pick?.route, kept, 'written once for the try');
  const words = await wordsOf(b, id);
  assert.deepEqual([words.pick, words.docs], ['unverified', 'skipped']);
});

const ENDS: [string, Record<string, unknown>, string][] = [
  ['exit 0 with no answer file reads unsigned', { exitCode: 0 }, 'unsigned'],
  ['exit 0 with an answer naming an undeclared route reads unsigned', { exitCode: 0, terminationMessage: '{"route":"api"}' }, 'unsigned'],
  ['exit 0 with an answer that is not one reads unsigned', { exitCode: 0, terminationMessage: '{"route":"web","unsure":"x"}' }, 'unsigned'],
  ['exit 0 with an unsure answer reads blocked', { exitCode: 0, terminationMessage: '{"unsure":"half web, half docs"}' }, 'blocked'],
  ['exit 1 reads failed, whatever it answered', { exitCode: 1, terminationMessage: '{"route":"web"}' }, 'failed'],
];

for (const [name, end, word] of ENDS)
  test(`a script condition: ${name}, and nothing after it is filed`, async () => {
    const { id, b, tick } = await atTheCondition();
    b.end(`${id}-pick`, end.exitCode === 0 ? 'succeeded' : 'failed', end);
    await tick();
    assert.equal(readRun(id).steps.pick?.route, undefined, 'no route on the record');
    assert.ok(!b.filings.some((f) => f === `${id}-web` || f === `${id}-docs`));
    assert.equal((await wordsOf(b, id)).pick, word);
  });

test('a script that never exited (stopped) reads stopped, and routes nothing', async () => {
  const { id, b, tick } = await atTheCondition();
  b.end(`${id}-pick`, 'stopped', { terminationMessage: '{"route":"web"}' });
  await tick();
  assert.equal(readRun(id).steps.pick?.route, undefined);
  assert.equal((await wordsOf(b, id)).pick, 'stopped');
});

test('a restart adopts the task a pass filed and never recorded, by its id, and files it no second time', async () => {
  const { id, b, tick } = await atTheCondition();
  const run = readRun(id);
  delete run.steps.pick;
  rewriteRun(run);
  assert.equal(readRun(id).steps.pick?.taskId, undefined, 'the pass died between the filing and the record');
  await tick();
  assert.equal(readRun(id).steps.pick?.taskId, `${id}-pick`);
  assert.equal(b.filings.filter((f) => f === `${id}-pick`).length, 1);
});
