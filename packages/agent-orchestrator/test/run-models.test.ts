/**
 * A step's model for one run alone: `nemia start --model <step>=<model>` and an inbox card's `model:` freeze it on the run's record
 * (`models`) and on the step it names, which the tick files on it, while the run's other steps and every other run keep their agents'; a
 * revision the run takes keeps it; and a model the step cannot run on is refused before a run is written.
 */
import { mock, test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { testEngine } from 'agent-runtime/testing';
import { scratch } from 'test-kit/scratch';
import { unasked } from './unasked.ts';
import { advanceRun, inboxDir, runWith, startFromInbox, startRun } from '../src/runner.ts';
import { runRecord } from '../src/record/record.store.ts';
import { resolvedNow } from '../src/revisions/pin.verb.ts';
import { main as cli } from '../src/cli/main.ts';
import { engineOf, type Engine } from '../src/runtime-client.ts';
import { story, staged } from './story.ts';
import type { Env } from '../src/config/config.store.ts';

const ROOT = scratch('wf-run-models-');
fs.mkdirSync(path.join(ROOT, 'runs'), { recursive: true });

const ENV: Env = {
  ...process.env,
  WF_ROOT: ROOT,
  WF_VERIFY_REST: '1',
  WF_MAX_CONCURRENT: undefined,
  WF_MAX_RUNS: undefined,
  WF_DEFAULT_FACTORY_STARTS: '1',
};
const stage = staged({ runWith, main: cli, engineOf, env: ENV });
const { runPlaced } = stage;

/** A repository with one commit, so `nemia start` has a base to record. */
const aRepo = (): string => {
  const repo = fs.mkdtempSync(path.join(ROOT, 'repo-'));
  stage.place().world.repository(repo, {});
  return repo;
};

/** A workflow folder of `plan → implement → review`, each step on `opus` unless given other frontmatter lines. */
const planned = (keys: { plan?: string; implement?: string; review?: string } = {}) => {
  const dir = fs.mkdtempSync(path.join(ROOT, 'wf-'));
  const write = (name: string, after: string | null, lines = 'model: opus') => {
    const front = [...(after ? [`after: ${after}`] : []), 'place: git', lines];
    fs.writeFileSync(path.join(dir, `${name}.md`), `---\n${front.join('\n')}\n---\n${name} it\n`);
  };
  write('plan', null, keys.plan);
  write('implement', 'plan', keys.implement);
  write('review', 'implement', keys.review);
  return dir;
};

/** An inbox card of `planned()`'s workflow, its frontmatter given `model:` as `model` says. */
const card = (name: string, workflowDir: string, model: string) => {
  fs.mkdirSync(inboxDir(ROOT), { recursive: true });
  fs.writeFileSync(path.join(inboxDir(ROOT), `${name}.md`), `---\nworkflow: ${workflowDir}\nmodel: ${model}\n---\nPlan the flag.\n`);
  return name;
};

const SIGNED = { outcome: 'done', summary: 'the plan', artifacts: [], needs: null };

/** The model each step is frozen on in the run `id`'s record, by name. */
const frozenModels = (id: string) => Object.fromEntries((runRecord(ROOT, id).workflow ?? []).map((s) => [s.name, s.model]));

/** What `nemia argv` printed, line by line, over an engine of its own that is asked nothing. */
const printedBy = async (argv: string[]): Promise<string[]> => {
  const printed: string[] = [];
  const log = mock.method(console, 'log', (...args: unknown[]) => {
    printed.push(args.join(' '));
  });
  const own = testEngine();
  try {
    await stage.main(argv, engineOf(own.layer));
  } finally {
    log.mock.restore();
  }
  unasked(own);
  return printed.join('\n').split('\n');
};

/** Refused `Invalid`, exit 2, its words naming each of `facts`. */
const refusedWith =
  (...facts: string[]) =>
  (err: Error & { exitCode?: number; _tag?: string }) => {
    assert.deepEqual([err._tag, err.exitCode], ['Invalid', 2], err.message);
    for (const fact of facts) assert.ok(err.message.includes(fact), `${err.message} does not name ${fact}`);
    return true;
  };
const runsWritten = () => fs.readdirSync(path.join(ROOT, 'runs')).filter((f) => f.endsWith('.json')).length;

test("a step's model named at start, from `nemia start --model` to the step filed on it", async (t) => {
  const s = story(t);
  const repo = aRepo();
  const dir = planned();
  let id = '';
  await s.test('`nemia start --model implement=fable` freezes it on the record and on implement alone, and says so', async () => {
    const printed = await printedBy([
      'start',
      'plan the flag',
      '--workflows',
      dir,
      '--repo',
      repo,
      '--no-worktree',
      '--model',
      'implement=fable',
    ]);
    id = printed[0].split(' ')[0];
    assert.deepEqual(runRecord(ROOT, id).models, { implement: 'fable' });
    assert.deepEqual(frozenModels(id), { plan: 'opus', implement: 'fable', review: 'opus' });
    assert.ok(
      printed.some((line) => line.startsWith('models: implement=fable')),
      printed.join('\n'),
    );
  });
  await s.test('another run of the same folder keeps its agents’ models, and its record has no `models`', async () => {
    const other = await runPlaced(startRun({ brief: 'plan the flag', repo, workflowDir: dir, isolate: false }));
    assert.deepEqual(frozenModels(other.id), { plan: 'opus', implement: 'opus', review: 'opus' });
    assert.equal(Object.hasOwn(runRecord(ROOT, other.id), 'models'), false);
  });
  await s.test('the tick files plan on its own model and implement on the run’s', async () => {
    const b = stage.board();
    const tick = (e: Engine) => stage.runWith(e, advanceRun(runRecord(ROOT, id)));
    assert.deepEqual((await tick(b.e)).filed, ['plan']);
    assert.equal(b.tasks.get(`${id}-plan`)?.spec.config?.model, 'opus');
    b.settle(`${id}-plan`, 'succeeded', SIGNED);
    assert.deepEqual((await tick(b.e)).filed, ['implement']);
    assert.equal(b.tasks.get(`${id}-implement`)?.spec.config?.model, 'fable');
  });
  await s.test('a revision the run takes of its folder keeps the model it was started with', async () => {
    const resolved = await runPlaced(resolvedNow(runRecord(ROOT, id), '2026-11-12T00:00:00.000Z'));
    assert.ok(resolved && 'steps' in resolved, 'the folder resolves');
    assert.deepEqual(Object.fromEntries(resolved.steps.map((st) => [st.name, st.model])), {
      plan: 'opus',
      implement: 'fable',
      review: 'opus',
    });
  });
});

test("a card's `model:` runs its run's step on it, and a start's `--model` for the same step over it", async (t) => {
  const repo = aRepo();
  const dir = planned();
  await t.test("the card's alone", async () => {
    const { run } = await runPlaced(
      startFromInbox({ name: card('plan-the-flag-m1a1', dir, 'review=fable'), callerRepo: repo, isolate: false }),
    );
    assert.deepEqual(runRecord(ROOT, run.id).models, { review: 'fable' });
    assert.deepEqual(frozenModels(run.id), { plan: 'opus', implement: 'opus', review: 'fable' });
  });
  await t.test('with a --model for the same step and another', async () => {
    const { run } = await runPlaced(
      startFromInbox({
        name: card('plan-the-flag-m2b2', dir, 'review=fable'),
        callerRepo: repo,
        isolate: false,
        models: { review: 'sonnet', plan: 'fable' },
      }),
    );
    assert.deepEqual(runRecord(ROOT, run.id).models, { review: 'sonnet', plan: 'fable' });
    assert.deepEqual(frozenModels(run.id), { plan: 'fable', implement: 'opus', review: 'sonnet' });
  });
});

test('a step’s model at start, REFUSED before a run is written', async (t) => {
  const repo = aRepo();
  const dir = planned();
  const typed = (...flags: string[]) =>
    stage.main(['start', 'plan the flag', '--workflows', dir, '--repo', repo, '--no-worktree', ...flags]);
  const starting = (models: Record<string, string>, workflowDir = dir) =>
    runPlaced(startRun({ brief: 'plan the flag', repo, workflowDir, isolate: false, models }));
  for (const [row, refusing, facts] of [
    [
      'a step the workflow does not have, naming its steps',
      () => starting({ desing: 'fable' }),
      ['--model desing=fable', 'plan, implement, review'],
    ],
    ["`inherit`, a subagent's word", () => starting({ plan: 'inherit' }), ['--model plan=inherit']],
    [
      'a model that drops the step’s `auto`, naming the models that keep it',
      () => starting({ implement: 'claude-haiku-4-5' }),
      ['--model implement=claude-haiku-4-5', 'sonnet, or opus, or fable'],
    ],
    ['the CLI: a pair with no model', () => typed('--model', 'implement='), ['implement=']],
    ['the CLI: a step named twice', () => typed('--model', 'implement=fable', '--model', 'implement=opus'), ['implement twice']],
    ['`nemia start <folder> --model`', () => stage.main(['start', ROOT, '--model', 'plan=fable']), ['--model']],
    [
      "a card's `model:` the step cannot run on, in the card's words",
      () =>
        runPlaced(startFromInbox({ name: card('plan-the-flag-m3c3', dir, 'review=claude-sonnet-4-5'), callerRepo: repo, isolate: false })),
      ['plan-the-flag-m3c3.md: `model: review=claude-sonnet-4-5`'],
    ],
  ] as Array<[string, () => Promise<unknown>, string[]]>) {
    await t.test(`REFUSED ${row}, no run written`, async () => {
      const before = runsWritten();
      await assert.rejects(refusing(), refusedWith(...facts));
      assert.equal(runsWritten(), before);
    });
  }
  await t.test('taken: a model that drops `auto`, on a step that names a mode the model keeps', async () => {
    const run = await starting({ implement: 'claude-haiku-4-5' }, planned({ implement: 'model: opus\npermissionMode: acceptEdits' }));
    assert.deepEqual(frozenModels(run.id).implement, 'claude-haiku-4-5');
  });
});
