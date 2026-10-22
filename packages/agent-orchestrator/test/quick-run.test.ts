/**
 * A run of the shipped quick workflow (`workflows/quick`) on the stand-ins: `implement → land`, with no spec before and no review
 * between. Implement signs off its plan, its check answers, and the run waits at the landing's gate with land not filed; the gate shows
 * the plan and sends the work back to implement, the one step there is to send it to. A check that refuses leaves the run to a person:
 * the step declares no `retries:`, so a size refusal is never answered by a try that trims the work to fit, which a copy given one shows.
 *
 * The repository the run works on holds the checkout's skill folders, as a start in this checkout finds them.
 *
 * `WF_ROOT` is set before the runner is imported: the module reads it as it loads.
 */
import { test, type TestContext } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { testPlace } from '../place/memory/index.ts';
import { testEngine } from 'agent-runtime/testing';
import { eachTest, runGiven, runOver } from './placed.ts';
import { scratch } from './scratch.ts';
import { decideScreen } from './screens.ts';
import { REPO } from './team.ts';

const ROOT = scratch('wf-quick-run-');
fs.mkdirSync(path.join(ROOT, 'runs'), { recursive: true });

process.env.WF_ROOT = ROOT;
process.env.WF_VERIFY_REST = '1';
delete process.env.WF_MAX_CONCURRENT;
delete process.env.WF_MAX_RUNS;

const { advanceRun, decideRun, sendBackTo, startRun, runWith: runEngine } = await import('../src/runner.ts');
const { engineOf } = await import('../src/runtime-client.ts');
const { readRun } = await import('../src/record/record.store.ts');

const stand = eachTest(testPlace);
const engine = eachTest(testEngine);
const runWith = runOver(runEngine, () => stand().layer);
const runPlaced = runGiven(() => stand().layer);

/** A copy of the shipped team, which `edit` may change: its `quick` folder. */
function quickFolder(edit: (dir: string) => void = () => {}): string {
  const root = fs.mkdtempSync(path.join(ROOT, 'team-'));
  fs.cpSync(path.join(REPO, 'workflows'), root, { recursive: true });
  edit(path.join(root, 'quick'));
  return path.join(root, 'quick');
}

/** A repository of the test place that holds the checkout's skill folders, where a start looks for the skills a step names. */
function repository(): string {
  const repo = fs.mkdtempSync(path.join(ROOT, 'repo-'));
  for (const skills of ['.claude/skills', 'apps/web/.claude/skills'])
    fs.cpSync(path.join(REPO, skills), path.join(repo, skills), { recursive: true, dereference: true });
  stand().world.repository(repo, { 'a.ts': 'export const a = 1;\n' });
  return repo;
}

/** A closeout of quick's implement, flat, with every field its schema requires. */
const SIGNED = {
  outcome: 'done',
  summary: 'removed the rule',
  artifacts: [],
  needs: null,
  plan: 'Remove the rule beside each plate in Section; the runs page proves it.',
  pages: ['runs'],
  replies: [],
};

/** A run of the quick folder `dir`, its implement signed off and its check asked: the run's id and the engine it is on. */
async function toTheCheck(dir: string) {
  const b = engine();
  const e = engineOf(b.layer);
  const run = await runPlaced(startRun({ brief: 'remove the dividers', repo: repository(), workflowDir: dir }));
  assert.deepEqual(
    (readRun(run.id).workflow ?? []).map((step) => [step.name, step.agent?.name, step.gate === true]),
    [
      ['implement', 'ada', false],
      ['land', 'otto', true],
    ],
  );
  assert.deepEqual((await runWith(e, advanceRun(readRun(run.id)))).filed, ['implement']);
  const work = readRun(run.id).steps.implement.workspace!;
  fs.appendFileSync(path.join(work, 'a.ts'), 'export const b = 2;\n');
  stand().world.commit(work, 'add b');
  b.settle(`${run.id}-implement`, 'succeeded', { closeout: SIGNED });
  assert.deepEqual((await runWith(e, advanceRun(readRun(run.id)))).checked, ['implement']);
  return { id: run.id, b, e };
}

test('a quick run within the bound reaches the landing gate: land is not filed, and the gate sends the work back to implement', async (t: TestContext) => {
  const { id, b, e } = await toTheCheck(quickFolder());
  b.settle(`${id}-implement-check`, 'succeeded', { exitCode: 0 });
  const waiting = await runWith(e, advanceRun(readRun(id)));
  assert.deepEqual(waiting.filed, []);
  assert.deepEqual(b.filings, [`${id}-implement`, `${id}-implement-check`], 'land waits at its gate');
  const run = readRun(id);
  const land = (run.workflow ?? []).find((step) => step.name === 'land')!;
  assert.deepEqual(sendBackTo(land, run), ['implement']);
  const { decision } = await runWith(e, decideRun(id));
  assert.deepEqual(decision.kind === 'awaiting' && decision.awaitingApproval, ['land']);
  const screen = await decideScreen(t, e, [id], { '<id>': id }, stand().place);
  for (const line of [
    '    plan: Remove the rule beside each plate in Section; the runs page proves it.',
    '  approve it    nemia approve <id> land [--message "<words>"]',
    '  send it back  nemia retry <id> implement --message "<objection>"',
  ])
    assert.ok(screen.includes(line), `the gate's screen says ${line}:\n${screen.join('\n')}`);
});

test('REFUSED: a quick run whose check refuses files no land and no second try; a copy given retries: files one', async () => {
  const { id, b, e } = await toTheCheck(quickFolder());
  b.settle(`${id}-implement-check`, 'failed', { exitCode: 1 });
  for (let pass = 0; pass < 3; pass += 1) {
    const { filed, tried } = await runWith(e, advanceRun(readRun(id)));
    assert.deepEqual([filed, tried], [[], []]);
  }
  assert.deepEqual(b.filings, [`${id}-implement`, `${id}-implement-check`]);
  const { decision } = await runWith(e, decideRun(id));
  assert.deepEqual(
    decision.kind === 'awaiting' && [decision.failedCheck, decision.awaitingApproval],
    [['implement'], []],
    'it waits on a person',
  );

  const retried = quickFolder((dir) => {
    const file = path.join(dir, 'implement.md');
    fs.writeFileSync(file, fs.readFileSync(file, 'utf8').replace(/^budget: 20$/m, 'budget: 20\nretries: 1'));
  });
  const again = await toTheCheck(retried);
  again.b.settle(`${again.id}-implement-check`, 'failed', { exitCode: 1 });
  assert.deepEqual((await runWith(again.e, advanceRun(readRun(again.id)))).tried, ['implement']);
  assert.equal(again.b.filings.at(-1), `${again.id}-implement-try2`);
});
