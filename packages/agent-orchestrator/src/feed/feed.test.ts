/**
 * The feed on disk (`nemia watch`): what the tick judged of each run and each step, a line each time it changed, in a store
 * of its own.
 *
 * A file of its own, since `tick` reads every run under `WF_ROOT` and writes the store's one feed: the runs of the other store tests would
 * be in it. The fold and the diff are pure, and are tested here beside the file, since what matters of them is what the file ends up
 * saying. `WF_ROOT` is read as the module loads, so it is set before the import; `WF_VERIFY_REST=1` judges in full every run a pass answers
 * from its memo of runs at rest, and a difference throws (`verifyRest` in tick.verb.ts).
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { Cause, Effect, Exit, Fiber } from 'effect';
import type { Engine } from '../runtime-client.ts';
import { tryOf, type Run } from '../record/record.ts';
import { listing } from '../list/list.ts';
import {
  feedChanges,
  feedPhase,
  feedWords,
  FEED_VERSION,
  foldFeed,
  freshFold,
  isRunLine,
  publishedOf,
  REMOVED,
  upgraded,
  type FeedLine,
  type FeedWords,
  type RunLine,
} from './feed.ts';
import { DEFAULT_FACTORY } from '../factory/factory.ts';
import { runLabels, stepLabels } from '../telemetry/telemetry.ts';
import { nodeChild } from '../../test/child.ts';
import { scratch } from '../../test/scratch.ts';
import { promised } from '../../test/promised.ts';
import { bell, until, WAITED } from '../../test/waits.ts';
import { runGiven, runOver } from '../../test/placed.ts';

const ROOT = scratch('wf-feed-');
const RUNS = path.join(ROOT, 'runs');
const FEED = path.join(ROOT, 'feed.jsonl');

process.env.WF_ROOT = ROOT;
process.env.WF_VERIFY_REST = '1';
delete process.env.WF_MAX_RUNS;
delete process.env.WF_MAX_CONCURRENT;
const {
  approveRun,
  cancelRun,
  feedCursorRefusal,
  feedFile,
  freshFeedMemo,
  readFeed,
  startRun,
  tickRun,
  watchFeed,
  runWith: runEngine,
  gitPlaceLayer,
} = await import('../runner.ts');
const runWith = runOver(runEngine, gitPlaceLayer);
const runPlaced = runGiven(gitPlaceLayer);
const store = await import('./feed.store.ts');
/** The lines the feed's writer wrote (`recordFeed`), as a pass hands it what it judged. */
const recordFeed = (...args: Parameters<typeof store.recordFeed>) => store.recordFeed(...args).lines;
const { readRun, rewriteRun, stepsOf } = await import('../record/record.store.ts');
const { freshRestMemo } = await import('../tick/tick.verb.ts');
const { main, watchPrinted, watching } = await import('../cli/main.ts');

const SIGNED = { outcome: 'done', summary: 'did it', artifacts: [], needs: null };

/** Refused by name: exit 2, and the message — never `String(err)`, which starts with `Error: `. */
const refusedWith = (pattern: RegExp) => (err: Error & { exitCode?: number }) => err.exitCode === 2 && pattern.test(err.message);

/**
 * An engine board a test settles by hand, as queue-store.test.ts's: a task filed is `pending`, one given a live word (`running (working)`)
 * is running with it, and a settled one carries the closeout it is given. A task denied calls has its attempt ended, or running with
 * them (`live`). It counts its reads, so a test can say the feed asked for none.
 */
const board = () => {
  const tasks = new Map<
    string,
    { spec: { id: string; brief: string; closeoutSchema?: object }; phase: string; closeout?: unknown; denials?: object[]; live?: boolean }
  >();
  const settledPhase = (p: string) => ['succeeded', 'failed', 'stopped'].includes(p);
  let views = 0;
  const e = promised({
    tick: async () => ({ tasks: 0, actions: [], running: {}, views: [] }),
    admit: async () => [],
    view: async (id: string) => {
      views++;
      const t = tasks.get(id);
      return {
        id,
        phase: t?.phase ?? 'pending',
        sessionId: t ? 's' : null,
        state: {
          brief: t?.spec.brief ?? '',
          closeoutSchema: t?.spec.closeoutSchema,
          settled: t && settledPhase(t.phase) ? t.phase : null,
          stopRequested: false,
          said: [],
          attempts:
            !t || t.phase === 'pending'
              ? []
              : [
                  {
                    n: 1,
                    ended: t.denials && !t.live ? { at: '2026-09-22T10:05:00.000Z' } : null,
                    ...(t.denials ? { denials: t.denials } : {}),
                    nativeId: `native-${id}`,
                    closeout: t.closeout,
                    exitCode: null,
                    usage: null,
                    startedAt: '2026-09-22T10:00:00.000Z',
                    spawnedAt: '2026-09-22T10:00:00.000Z',
                    endedAt: null,
                    reason: null,
                  },
                ],
        },
      };
    },
    file: async (spec: { id: string; brief: string }) => {
      tasks.set(spec.id, { spec, phase: 'pending' });
      return spec.id;
    },
    stop: async (id: string) => {
      const t = tasks.get(id);
      if (t && !settledPhase(t.phase)) t.phase = 'stopped';
    },
    logs: async () => '(no output yet)',
    feed: async () => ({ entries: [], cursor: 0 }),
  });
  const set = (id: string, phase: string, closeout?: unknown) => Object.assign(tasks.get(id)!, { phase, closeout });
  const deny = (id: string, denials: object[], live = false) => Object.assign(tasks.get(id)!, { denials, live });
  return { e, set, deny, views: () => views };
};

/** A store with no runs and no feed. */
const emptyStore = () => {
  for (const dir of [RUNS, FEED, path.join(ROOT, 'tick.json')]) fs.rmSync(dir, { recursive: true, force: true });
  fs.mkdirSync(RUNS, { recursive: true });
};

/** A repository with one commit, so a start has a base to record. */
const aRepo = (): string => {
  const repo = fs.mkdtempSync(path.join(ROOT, 'repo-'));
  const git = (...args: string[]) =>
    execFileSync('git', ['-c', 'user.email=t@t', '-c', 'user.name=t', ...args], { cwd: repo, stdio: 'ignore' });
  git('init', '-q');
  git('commit', '-q', '--allow-empty', '-m', 'base');
  return repo;
};

/** A workflow of `plan → implement`, whose plan waits at its gate for a person. */
const gated = (() => {
  const dir = fs.mkdtempSync(path.join(ROOT, 'wf-'));
  fs.writeFileSync(path.join(dir, 'plan.md'), '---\nplace: git\ngate: true\n---\nplan it\n');
  fs.writeFileSync(path.join(dir, 'implement.md'), '---\nafter: plan\nplace: git\n---\nimplement it\n');
  return dir;
})();

const started = async (brief: string): Promise<Run> =>
  await runPlaced(startRun({ brief, repo: aRepo(), workflowDir: gated, isolate: false }));

/** Every line in the feed, read off the file as a reader with cursor 0 would. */
const lines = (): RunLine[] => readFeed(0).lines.filter(isRunLine);
const size = (): number => fs.statSync(FEED, { throwIfNoEntry: false })?.size ?? 0;
/** The lines about one run, or one step of it, and their words in order. */
const words = (run: string, step?: string): string[] =>
  lines()
    .filter((l) => l.run === run && l.step === step)
    .map((l) => l.word);

/** What `main` printed, line by line, for one verb. */
const printedBy = async (
  t: { mock: { method: (o: object, m: string, f: (...a: unknown[]) => void) => { mock: { restore: () => void } } } },
  e: Engine,
  ...argv: string[]
): Promise<string[]> => {
  const printed: string[] = [];
  const log = t.mock.method(console, 'log', (...args: unknown[]) => {
    printed.push(args.join(' '));
  });
  try {
    await main(argv, e);
  } finally {
    log.mock.restore();
  }
  return printed.join('\n').split('\n');
};

/** The pass's words for every run, as `tick` hands them to the feed: what a restarted daemon's first pass would judge. */
const judged = (pass: Effect.Success<ReturnType<typeof tickRun>>) => new Map(pass.runs.map((a) => [a.run.id, a.feed]));

test('a transition is written once, not on every pass: the gate a step reaches, the approval that opens it, and the run done, each a line', async () => {
  emptyStore();
  const b = board();
  const run = await started('the gate');

  await runWith(b.e, tickRun());
  assert.deepEqual(words(run.id), ['running'], 'the run says it is running, once');
  assert.equal(words(run.id, 'plan').length, 1, 'and each step says its first word, once');

  for (let i = 0; i < 3; i++) await runWith(b.e, tickRun());
  assert.deepEqual(
    words(run.id, 'plan').slice(1),
    ['pending'],
    'filed on that pass, it reads as filed on the next, since the feed words what the pass read before it filed, and then says nothing more',
  );
  const quiet = size();
  await runWith(b.e, tickRun());
  assert.equal(size(), quiet, 'a pass that judged nothing new writes nothing');

  b.set(`${run.id}-plan`, 'succeeded', SIGNED);
  for (let i = 0; i < 4; i++) await runWith(b.e, tickRun());
  assert.deepEqual(
    words(run.id, 'plan').filter((w) => w === 'awaiting approval'),
    ['awaiting approval'],
    'the gate reached is one line over four passes',
  );
  const onYou = lines().filter((l) => l.run === run.id && l.step === undefined && l.note);
  assert.deepEqual(
    onYou.map((l) => l.note),
    ['waiting on you: approve plan'],
    'and the run says, once, that it waits on a person',
  );
  assert.deepEqual(
    onYou.map((l) => l.word),
    ['awaiting approval'],
    'at its gate, in the word nemia decide says it in: nothing failed',
  );

  await runWith(b.e, approveRun(run.id, 'plan'));
  for (let i = 0; i < 3; i++) await runWith(b.e, tickRun());
  const plan = words(run.id, 'plan');
  assert.notEqual(
    plan.at(-1),
    'awaiting approval',
    `the approval is a file of its own, and the next pass's line is what it changed: ${plan.join(' → ')}`,
  );
  assert.equal(new Set(plan).size, plan.length, `no word said twice in a row: ${plan.join(' → ')}`);
  const runLines = lines().filter((l) => l.run === run.id && l.step === undefined);
  assert.equal(runLines.at(-1)!.note, undefined, 'the run no longer waits on you');
  assert.deepEqual(words(run.id, 'implement').at(-1), 'pending');

  b.set(`${run.id}-implement`, 'succeeded', SIGNED);
  for (let i = 0; i < 3; i++) await runWith(b.e, tickRun());
  assert.deepEqual(
    words(run.id).filter((w) => w === 'succeeded'),
    ['succeeded'],
  );

  for (const l of lines())
    assert.ok(
      typeof l.at === 'string' && l.run && l.word,
      `every line carries its time, its run, and its word, the shape a reader parses: ${JSON.stringify(l)}`,
    );
});

/** A workflow of `implement → ship`, whose ending waits at its gate for a person before it is filed: as the shipped `dev` ends. */
const ending = (() => {
  const dir = fs.mkdtempSync(path.join(ROOT, 'wf-'));
  fs.writeFileSync(path.join(dir, 'implement.md'), '---\nplace: git\n---\nimplement it\n');
  fs.writeFileSync(path.join(dir, 'ship.md'), '---\nafter: implement\nplace: git\nworkspace: main\ngate: true\n---\nship it\n');
  return dir;
})();

test("a run waiting at its ending's gate reads `awaiting approval` in the feed, as nemia decide says it — never `failed`, since nothing failed", async (t) => {
  emptyStore();
  const b = board();
  const repo = aRepo();
  const run = await runPlaced(startRun({ brief: 'the ship gate', repo, workflowDir: ending }));
  await runWith(b.e, tickRun());
  const branch = readRun(run.id).steps.implement.branch!;
  const git = (...args: string[]) =>
    execFileSync('git', ['-c', 'user.email=t@t', '-c', 'user.name=t', ...args], { cwd: repo, encoding: 'utf8' }).trim();
  git('update-ref', `refs/heads/${branch}`, git('commit-tree', `${branch}^{tree}`, '-p', branch, '-m', 'the work'));
  b.set(`${run.id}-implement`, 'succeeded', SIGNED);
  for (let i = 0; i < 3; i++) await runWith(b.e, tickRun());

  assert.equal(
    words(run.id, 'ship').at(-1),
    'awaiting approval',
    "the ship step waits at its gate, with work on the step's branch as a session leaves it: a branch that never moved is read by git as merged already",
  );
  const last = lines()
    .filter((l) => l.run === run.id && l.step === undefined)
    .at(-1)!;
  assert.deepEqual({ word: last.word, note: last.note }, { word: 'awaiting approval', note: 'waiting on you: approve ship' });
  assert.equal(words(run.id).includes('failed'), false, `no line of the run says failed: ${words(run.id).join(' → ')}`);
  const decided = (await printedBy(t, b.e, 'decide', run.id)).join('\n');
  assert.match(decided, /AWAITING APPROVAL, waiting on you: ship/, 'nemia decide says the same run awaits approval');
  assert.doesNotMatch(decided, /FAILED/, 'and that nothing failed');

  const broke = await runPlaced(startRun({ brief: 'the break', repo: aRepo(), workflowDir: ending }));
  await runWith(b.e, tickRun());
  b.set(`${broke.id}-implement`, 'failed');
  for (let i = 0; i < 2; i++) await runWith(b.e, tickRun());
  assert.equal(
    words(broke.id).at(-1),
    'failed',
    'a run in which a step did break says so: a word that fits a gate is not a word that hides a failure',
  );
});

/** What a pass judged of a step at work, with the calls `denials` says it was denied, and the labels a filing gives it. */
const atWork = (denials: readonly { step: string; try: number; call: string }[]): FeedWords => ({
  run: { word: 'running' },
  labels: { run: 'r-1', factory: 'nemia', workflow: 'build' },
  steps: [{ name: 'plan', word: 'running', labels: { run: 'r-1', factory: 'nemia', workflow: 'build', step: 'plan', agent: 'ada' } }],
  denials,
});

/** Every one-shot the feed holds, in order, with the fields a selector matches one by. */
const shots = () =>
  lines()
    .filter((l) => l.reason === 'ToolDenied')
    .map((l) => ({ step: l.step, word: l.word, note: l.note, call: l.call, try: l.try, type: l.type, source: l.source, waits: l.waits }));

test('a denial journalled once writes one one-shot line over ten passes, counted by the step and the try alone — and a restart writes it neither again nor never', () => {
  emptyStore();
  const push = { step: 'plan', try: 1, call: 'Bash(git push)' };
  const memo = freshFeedMemo();
  const at = '2026-10-16T04:00:00.000Z';
  for (let i = 0; i < 10; i++) recordFeed(new Map([['r-1', atWork([push])]]), { at, memo });
  assert.deepEqual(
    shots(),
    [
      {
        step: 'plan',
        word: 'denied: Bash(git push)',
        note: 'try 1',
        call: 'Bash(git push)',
        try: 1,
        type: 'Warning',
        source: 'runtime',
        waits: undefined,
      },
    ],
    'one denial the runtime journalled is one line, however many passes read it',
  );
  assert.equal(
    lines().find((l) => l.reason === 'ToolDenied')!.message,
    'denied: Bash(git push) · try 1',
    "the message a person reads is the owner's wording",
  );

  recordFeed(new Map([['r-1', atWork([push, push])]]), { at, memo });
  recordFeed(new Map([['r-1', atWork([push, push])]]), { at, memo });
  assert.equal(shots().length, 2, 'the same call denied a second time in the same try is one more line, and no repeat of the first');

  const restarted = freshFeedMemo();
  recordFeed(new Map([['r-1', atWork([push, push])]]), { at, memo: restarted });
  assert.equal(shots().length, 2, 'a daemon with no fold reads the feed and writes neither of them again');
  recordFeed(new Map([['r-1', atWork([push, push, push])]]), { at, memo: restarted });
  assert.equal(shots().length, 3, 'nor misses the third');
});

test('REFUSED: a one-shot is counted by the step and the try, not by what it reads back as a message', () => {
  emptyStore();
  const memo = freshFeedMemo();
  const at = '2026-10-16T04:00:00.000Z';
  const first = { step: 'plan', try: 1, call: 'Bash(ls)' };
  recordFeed(new Map([['r-1', atWork([first])]]), { at, memo });
  assert.equal(shots().length, 1);
  const reworded = freshFeedMemo();
  recordFeed(new Map([['r-1', atWork([{ ...first, call: 'Bash(ls) — reworded by a newer nemia' }])]]), { at, memo: reworded });
  assert.equal(shots().length, 1, 'a denial of the same step and try, worded anew, is the one the feed holds — not a second');
  recordFeed(new Map([['r-1', atWork([first, { ...first, try: 2 }])]]), { at, memo: freshFeedMemo() });
  assert.equal(shots().length, 2, 'and the same call on another try is its own line');
});

test('REFUSED: a one-shot holds no entry in the fold — the step says its own word once, however many denials it carries', () => {
  emptyStore();
  const memo = freshFeedMemo();
  const at = '2026-10-16T04:00:00.000Z';
  const denied = { step: 'plan', try: 1, call: 'Bash(git push)' };
  const state = () =>
    lines()
      .filter((l) => l.step === 'plan' && l.reason !== 'ToolDenied')
      .map((l) => l.word);
  for (let i = 0; i < 3; i++) recordFeed(new Map([['r-1', atWork([denied])]]), { at, memo });
  assert.deepEqual(state(), ['running'], "the step's word is said once");
  const done = { ...atWork([denied]), steps: [{ name: 'plan', word: 'unverified · done' }] };
  for (let i = 0; i < 10; i++) recordFeed(new Map([['r-1', done]]), { at, memo });
  assert.deepEqual(state(), ['running', 'unverified · done'], 'and its next word once — never again on every pass');
  assert.equal(shots().length, 1, 'and its denial stays one line');
});

test('a step denied a call writes a one-shot of the runtime and leaves the step’s own note alone', async () => {
  emptyStore();
  const b = board();
  const run = await started('the denial');
  await runWith(b.e, tickRun());
  b.deny(`${run.id}-plan`, [
    { tool: 'Bash', what: 'git push' },
    { tool: 'Bash', what: 'git push' },
  ]);
  b.set(`${run.id}-plan`, 'running (working)');
  for (let i = 0; i < 3; i++) await runWith(b.e, tickRun());
  const denied = lines().filter((l) => l.run === run.id && l.reason === 'ToolDenied');
  assert.deepEqual(
    denied.map((l) => [l.step, l.word, l.note]),
    [
      ['plan', 'denied: Bash(git push)', 'try 1'],
      ['plan', 'denied: Bash(git push)', 'try 1'],
    ],
    'two denials of the runtime are two lines, over three passes',
  );
  assert.deepEqual(
    denied.map((l) => l.labels),
    Array(2).fill(denied[0].labels),
    'each carries the step’s labels',
  );
  assert.equal(denied[0].labels?.step, 'plan');
  assert.equal(denied[0].labels?.run, run.id);
  assert.deepEqual(
    lines().filter((l) => l.note?.includes('denied:')),
    [],
    'and no step’s note says a word of it: the denial is a signal of its own',
  );
});

test('a line’s labels are the ones stepLabels and runLabels give, so no second writer decides what a label is', async () => {
  emptyStore();
  const b = board();
  const run = await started('the labels');
  await runWith(b.e, tickRun());
  b.deny(`${run.id}-plan`, [{ tool: 'Bash', what: 'git push' }]);
  b.set(`${run.id}-plan`, 'running (working)');
  await runWith(b.e, tickRun());

  const record = readRun(run.id);
  const plan = stepsOf(record).find((s) => s.name === 'plan')!;
  assert.deepEqual(
    stepLabels(record, plan),
    { run: run.id, factory: DEFAULT_FACTORY, workflow: path.basename(record.workflowDir), step: 'plan', agent: 'none' },
    'the one source of a label gives the five of a step',
  );
  const ofPlan = lines().filter((l) => l.run === run.id && l.step === 'plan');
  assert.ok(ofPlan.length >= 2, 'the step said a word of its own');
  assert.ok(
    ofPlan.some((l) => l.reason === 'ToolDenied'),
    'and carries a one-shot, whose labels are filled where it is written',
  );
  for (const l of ofPlan) assert.deepEqual(l.labels, stepLabels(record, plan), `${l.word} carries the labels of the step’s filing, whole`);

  const ofRun = lines().filter((l) => l.run === run.id && l.step === undefined);
  assert.ok(ofRun.length > 0, 'the run said a word of its own');
  for (const l of ofRun) assert.deepEqual(l.labels, runLabels(record), `${l.word} carries the labels the run is known by, whole`);
});

test('REFUSED: a recheck says a step’s denials again — a one-shot is counted by the try its task was filed for, not the try the step has reached', async () => {
  emptyStore();
  const b = board();
  const run = await started('the recheck');
  await runWith(b.e, tickRun());
  b.deny(`${run.id}-plan`, [{ tool: 'Bash', what: 'git push' }]);
  b.set(`${run.id}-plan`, 'running (working)');
  await runWith(b.e, tickRun());
  const shots = () => lines().filter((l) => l.run === run.id && l.reason === 'ToolDenied');
  assert.deepEqual(
    shots().map((l) => [l.try, l.note]),
    [[1, 'try 1']],
    'the denial was written once, on the try its task was filed for',
  );

  const before = readRun(run.id);
  const plan = before.steps.plan;
  rewriteRun({ ...before, steps: { ...before.steps, plan: { ...plan, tries: [{ taskId: plan.taskId!, then: 'recheck' }] } } });
  assert.equal(tryOf(readRun(run.id), 'plan'), 2, 'the step is on a second try, on the task it was already on');
  for (let i = 0; i < 3; i++) await runWith(b.e, tickRun());
  assert.deepEqual(
    shots().map((l) => [l.try, l.note]),
    [[1, 'try 1']],
    'and the recheck says it neither again nor under a try the runtime never journalled it on',
  );
});

/** A workflow of `plan → implement`, with no gate: a run on it finishes once both steps sign off. */
const ungated = (() => {
  const dir = fs.mkdtempSync(path.join(ROOT, 'wf-'));
  fs.writeFileSync(path.join(dir, 'plan.md'), '---\nplace: git\n---\nplan it\n');
  fs.writeFileSync(path.join(dir, 'implement.md'), '---\nafter: plan\nplace: git\n---\nimplement it\n');
  return dir;
})();

/** The run's last word in the feed, and each step's. */
const lastSaid = (run: string): string[] => [words(run).at(-1)!, ...['plan', 'implement'].map((s) => words(run, s).at(-1)!)];

test('REFUSED: a finished run writes no state line for a denial read late — the one-shot alone, once, and a restarted daemon judges the run at rest', async () => {
  emptyStore();
  const b = board();
  const runs = await Promise.all(
    ['one', 'two', 'three'].map(async (brief) => await runPlaced(startRun({ brief, repo: aRepo(), workflowDir: ungated, isolate: false }))),
  );
  await runWith(b.e, tickRun());
  for (const r of runs) b.set(`${r.id}-plan`, 'succeeded', SIGNED);
  for (let i = 0; i < 3; i++) await runWith(b.e, tickRun());
  for (const r of runs) b.set(`${r.id}-implement`, 'succeeded', SIGNED);
  for (let i = 0; i < 3; i++) await runWith(b.e, tickRun());
  for (const r of runs)
    assert.deepEqual(lastSaid(r.id), ['succeeded', 'unverified · done', 'unverified · done'], 'each run finished, and the feed said so');

  for (const r of runs) b.deny(`${r.id}-plan`, [{ tool: 'Bash', what: 'git push' }]);
  for (const r of runs) rewriteRun({ ...readRun(r.id), deniedCounted: [{ task: `${r.id}-plan`, attempts: 1 }] });
  const quiet = lines().filter((l) => l.reason !== 'ToolDenied').length;
  for (let i = 0; i < 2; i++) {
    const pass = await runWith(b.e, tickRun({ memo: freshRestMemo() }));
    for (const r of runs) {
      const said = judged(pass).get(r.id)!;
      assert.equal(said.atRest, true, 'the pass found the run at rest');
      assert.deepEqual(
        said.denials,
        [{ step: 'plan', try: 1, call: 'Bash(git push)' }],
        'and read the denial its plan carries, which is no part of the step\u2019s word',
      );
    }
  }
  assert.equal(
    lines().filter((l) => l.reason !== 'ToolDenied').length,
    quiet,
    'no state line is written for a run nothing happened to, at rest',
  );
  assert.deepEqual(
    lines()
      .filter((l) => l.reason === 'ToolDenied')
      .map((l) => [l.step, l.word]),
    runs.map(() => ['plan', 'denied: Bash(git push)']),
    'one one-shot for each run\u2019s one denial, over two passes',
  );
  assert.deepEqual(
    lines().filter((l) => l.note?.includes('denied:')),
    [],
    'and no step\u2019s note says it',
  );
});

test("a step whose attempt ends with a new denial says it on the pass that reads it ended, as the run finishes: no rest hides a step's own end", async () => {
  emptyStore();
  const b = board();
  const run = await runPlaced(startRun({ brief: 'the late denial', repo: aRepo(), workflowDir: ungated, isolate: false }));
  await runWith(b.e, tickRun());
  b.set(`${run.id}-plan`, 'succeeded', SIGNED);
  for (let i = 0; i < 3; i++) await runWith(b.e, tickRun());
  assert.equal(words(run.id, 'implement').at(-1), 'pending', 'implement is filed');

  b.deny(`${run.id}-implement`, [{ tool: 'Bash', what: 'git push' }]);
  b.set(`${run.id}-implement`, 'succeeded', SIGNED);
  for (let i = 0; i < 2; i++) await runWith(b.e, tickRun({ memo: freshRestMemo() }));
  const implement = lines().filter((l) => l.run === run.id && l.step === 'implement');
  assert.deepEqual(
    implement.map((l) => [l.word, l.note]),
    [
      ['waiting', undefined],
      ['pending', undefined],
      ['unverified · done', undefined],
      ['denied: Bash(git push)', 'try 1'],
    ],
    'the denial of the step that ended is its own line, once, beside the word it ended on',
  );
  assert.equal(words(run.id).at(-1), 'succeeded', 'and the run says it finished');
});

test('a step at work that is denied a call says it while its word stands at running: a run in flight owes a line for a note that moved', async () => {
  emptyStore();
  const b = board();
  const run = await started('the live denial');
  await runWith(b.e, tickRun());
  b.set(`${run.id}-plan`, 'running (working)');
  for (let i = 0; i < 2; i++) await runWith(b.e, tickRun());
  assert.equal(words(run.id, 'plan').at(-1), 'running', 'the step is at work, and the feed said so');

  b.deny(`${run.id}-plan`, [{ tool: 'Bash', what: 'git push' }]);
  const pass = await runWith(b.e, tickRun({ memo: freshRestMemo() }));
  assert.equal(judged(pass).get(run.id)!.atRest, undefined, 'a run with a step at work is not at rest');
  const plan = lines().filter((l) => l.run === run.id && l.step === 'plan');
  assert.deepEqual(
    { word: plan.at(-1)!.word, note: plan.at(-1)!.note, reason: plan.at(-1)!.reason, source: plan.at(-1)!.source },
    { word: 'denied: Bash(git push)', note: 'try 1', reason: 'ToolDenied', source: 'runtime' },
    'the denial of a step at work is its own line, of the runtime, while the step\u2019s word stands',
  );
  assert.deepEqual(
    plan.filter((l) => l.reason !== 'ToolDenied').map((l) => l.word),
    ['waiting', 'running'],
    'and the step\u2019s own word is said once, not again beside the denial',
  );
});

test('a running step’s every denial is a one-shot of its own, as the runtime journals it: a call denied twice is two lines', async () => {
  emptyStore();
  const b = board();
  const run = await started('the live denial');
  await runWith(b.e, tickRun());
  const [ls, glob] = [{ tool: 'Bash', what: 'ls' }, { tool: 'Glob' }];
  const id = `${run.id}-plan`;
  b.set(id, 'running (working)');
  const denied = () => lines().filter((l) => l.run === run.id && l.step === 'plan' && l.reason === 'ToolDenied');
  b.deny(id, [ls], true);
  await runWith(b.e, tickRun());
  assert.deepEqual(
    denied().map((l) => l.call),
    ['Bash(ls)'],
    'said while the attempt runs, and not held until it ends',
  );
  b.deny(id, [ls, ls], true);
  await runWith(b.e, tickRun());
  assert.deepEqual(
    denied().map((l) => l.call),
    ['Bash(ls)', 'Bash(ls)'],
    'the same call denied again is a denial of its own, and one more line',
  );
  b.deny(id, [ls, ls, glob], true);
  await runWith(b.e, tickRun());
  b.deny(id, [ls, ls, glob]);
  for (let i = 0; i < 2; i++) await runWith(b.e, tickRun());
  assert.deepEqual(
    denied().map((l) => [l.call, l.try]),
    [
      ['Bash(ls)', 1],
      ['Bash(ls)', 1],
      ['Glob', 1],
    ],
    'each denial once, in the order the runtime journalled them, each on the step\u2019s first try — and the attempt ending adds none',
  );
});

test('a step that signed off blocked says what it needs on its line in the feed, made one line, beside BLOCKED — and the run says blocked, not failed', async () => {
  emptyStore();
  const b = board();
  const run = await started('the question');
  await runWith(b.e, tickRun());
  const needs = 'Which colour —\n  red, or\tblue?\n\nThe brief says both.';
  b.set(`${run.id}-plan`, 'succeeded', { outcome: 'blocked', summary: 'stopped', artifacts: [], needs });
  for (let i = 0; i < 3; i++) await runWith(b.e, tickRun());

  const plan = lines()
    .filter((l) => l.run === run.id && l.step === 'plan')
    .at(-1)!;
  assert.match(plan.word, /BLOCKED/);
  assert.equal(plan.note, 'needs: Which colour — red, or blue? The brief says both.');
  assert.equal(
    lines().filter((l) => l.run === run.id && l.step === 'plan' && l.note?.startsWith('needs:')).length,
    1,
    'said once, over three passes',
  );
  const said = lines()
    .filter((l) => l.run === run.id && l.step === undefined)
    .at(-1)!;
  assert.deepEqual({ word: said.word, note: said.note }, { word: 'blocked', note: 'waiting on you: plan' });

  const long = await started('the long question');
  const other = await started('the done');
  await runWith(b.e, tickRun());
  b.set(`${long.id}-plan`, 'succeeded', { outcome: 'blocked', summary: 'stopped', artifacts: [], needs: 'why '.repeat(100) });
  b.set(`${other.id}-plan`, 'succeeded', { ...SIGNED, needs: 'nothing, really' });
  for (let i = 0; i < 2; i++) await runWith(b.e, tickRun());
  const clipped = lines()
    .filter((l) => l.run === long.id && l.step === 'plan')
    .at(-1)!.note!;
  assert.ok(
    clipped.startsWith('needs: why why') && clipped.endsWith('…') && clipped.length <= 'needs: '.length + 200,
    `long, it is clipped, and nemia decide has it whole: ${clipped}`,
  );
  assert.equal(
    lines().some((l) => l.run === other.id && l.note?.includes('needs:')),
    false,
    'a step that signed off done says nothing it needs, whatever its closeout holds',
  );
});

test('nothing is written when nothing changed, across a restart: a daemon with no fold of its own reads the feed, and says nothing again', async () => {
  emptyStore();
  const b = board();
  const run = await started('the restart');
  for (let i = 0; i < 3; i++) await runWith(b.e, tickRun());
  const pass = await runWith(b.e, tickRun());
  const before = fs.readFileSync(FEED, 'utf8');

  assert.deepEqual(
    recordFeed(judged(pass), { memo: freshFeedMemo() }),
    [],
    'a restarted daemon, with nothing in memory and the same world, folds the feed from the start on its first pass and owes it no line',
  );
  assert.equal(fs.readFileSync(FEED, 'utf8'), before);

  b.set(`${run.id}-plan`, 'succeeded', SIGNED);
  const moved = await runWith(b.e, tickRun());
  const after = size();
  assert.ok(after > before.length, 'the pass wrote the gate');
  assert.deepEqual(
    recordFeed(judged(moved), { memo: freshFeedMemo() }),
    [],
    'the same after the world did change, then was written: the new process said what changed, once, and a second new one nothing',
  );
  assert.equal(size(), after);

  fs.rmSync(FEED);
  assert.ok(
    recordFeed(judged(moved), { memo: freshFeedMemo() }).length > 0,
    'a fold that is not the feed, a daemon that remembered nothing and read nothing, says every word again: what makes the restart quiet is reading the feed, not the memo',
  );
});

test("a step's live word moving — `running (working)` to `running (idle)` and back — writes nothing: the feed says running, once", async () => {
  emptyStore();
  const b = board();
  const run = await started('the flicker');
  await runWith(b.e, tickRun());
  await runWith(b.e, tickRun());
  b.set(`${run.id}-plan`, 'running (working)');
  await runWith(b.e, tickRun());
  const once = size();
  for (const live of ['running (idle)', 'working (quiescent)', 'running (working)', 'between attempts']) {
    b.set(`${run.id}-plan`, live);
    await runWith(b.e, tickRun());
  }
  assert.equal(
    size(),
    once,
    lines()
      .slice(-3)
      .map((l) => JSON.stringify(l))
      .join('\n'),
  );
  assert.equal(words(run.id, 'plan').at(-1), 'running');

  b.set(`${run.id}-plan`, 'needs-human');
  await runWith(b.e, tickRun());
  assert.equal(
    words(run.id, 'plan').at(-1)!.startsWith('needs-human'),
    true,
    `a word the tick decides on is not folded: a session its harness blocked is a person's to answer: ${words(run.id, 'plan').join(' → ')}`,
  );
});

test('a person calling the run off writes one line, and a run gone from the store writes one `removed`, then nothing', async () => {
  emptyStore();
  const b = board();
  const stays = await started('the one that stays');
  const goes = await started('the one that goes');
  for (let i = 0; i < 2; i++) await runWith(b.e, tickRun());

  await runWith(b.e, cancelRun(stays.id));
  for (let i = 0; i < 3; i++) await runWith(b.e, tickRun());
  assert.deepEqual(
    words(stays.id).filter((w) => w === 'cancelled'),
    ['cancelled'],
  );

  fs.rmSync(path.join(RUNS, `${goes.id}.json`));
  const before = lines().length;
  for (let i = 0; i < 3; i++) await runWith(b.e, tickRun());
  const said = lines().slice(before);
  assert.deepEqual(
    said.map((l) => [l.run, l.step, l.word]),
    [[goes.id, undefined, 'removed']],
    "`nemia rm` removes the record, and the feed keeps the run's lines: the next pass says it is gone, once, with no line for its steps",
  );
  assert.deepEqual(
    recordFeed(judged(await runWith(b.e, tickRun())), { memo: freshFeedMemo() }),
    [],
    'a restarted daemon reads it as gone: nothing said of it again',
  );
});

test("a pruned run's word says so, once: `nemia prune`'s marker is a person's fact, and the run's line gains it", async () => {
  emptyStore();
  const b = board();
  const run = await started('the pruned');
  await runWith(b.e, tickRun());
  fs.writeFileSync(path.join(RUNS, `${run.id}.pruned`), JSON.stringify({ at: '2026-09-22T10:00:00.000Z', worktrees: [] }));
  for (let i = 0; i < 3; i++) await runWith(b.e, tickRun());
  assert.equal(readRun(run.id).pruned !== undefined, true);
  assert.deepEqual(
    words(run.id).filter((w) => w.endsWith('(pruned)')),
    ['running (pruned)'],
  );
});

test('REFUSED: a cursor inside a line is refused by name, by the read and by `nemia watch` — and one past the end, and one that is not a number', async (t) => {
  emptyStore();
  const b = board();
  await started('the cursor');
  await runWith(b.e, tickRun());
  const { cursor } = readFeed(0);
  assert.equal(cursor, size());
  const inside = cursor - 2;

  assert.throws(() => readFeed(inside), refusedWith(new RegExp(`^cursor ${inside} falls inside a line of the feed, not after one`)));
  const log = t.mock.method(console, 'log', () => {});
  try {
    await assert.rejects(main(['watch', String(inside)], b.e), refusedWith(/^cursor \d+ falls inside a line/));
    assert.equal(log.mock.callCount(), 0, 'refused before it says it is watching');
  } finally {
    log.mock.restore();
  }
  assert.throws(() => watchFeed({ from: inside, onLine: () => {} }), refusedWith(/falls inside a line/));

  assert.throws(
    () => readFeed(cursor + 10),
    refusedWith(new RegExp(`^cursor ${cursor + 10} is past the end of the feed \\(${cursor} bytes, .*nemia watch --once 0$`)),
  );
  await assert.rejects(main(['watch', 'twelve'], b.e), refusedWith(/^nemia watch takes one cursor at most, a whole number of bytes/));
  await assert.rejects(main(['watch', '0', '1'], b.e), refusedWith(/^nemia watch does not take 1: nemia watch \[cursor\]/));
  assert.throws(() => readFeed(-1), refusedWith(/^a feed cursor is a whole number of bytes/));

  let at = 0;
  for (const line of fs.readFileSync(FEED, 'utf8').split('\n').slice(0, -1)) {
    at += Buffer.byteLength(line) + 1;
    assert.doesNotThrow(
      () => readFeed(at),
      `every cursor a read hands out is one the next read takes: 0, each line's end (${at}), and the end`,
    );
  }
  assert.equal(at, cursor);
  emptyStore();
  assert.deepEqual(readFeed(0), { lines: [], cursor: 0 }, 'a feed not written yet reads as nothing, at 0, where every reader starts');
});

test('the cursor never passes a partial line: a line being written is not read, nor stepped over, and is read once it ends', () => {
  emptyStore();
  const whole = JSON.stringify({ at: '2026-09-22T10:00:00.000Z', run: 'r-a', word: 'running' });
  const next = JSON.stringify({ at: '2026-09-22T10:00:04.000Z', run: 'r-a', step: 'plan', word: 'pending' });
  fs.writeFileSync(FEED, `${whole}\n${next.slice(0, 20)}`);

  const first = readFeed(0);
  assert.deepEqual(
    first.lines.map((l) => l.word),
    ['running'],
  );
  assert.equal(first.cursor, Buffer.byteLength(whole) + 1, 'the cursor stops where the partial line starts');
  assert.deepEqual(
    readFeed(first.cursor),
    { lines: [], cursor: first.cursor },
    'and reading from there again reads nothing, and moves nothing',
  );

  fs.appendFileSync(FEED, `${next.slice(20)}\n`);
  const second = readFeed(first.cursor);
  assert.deepEqual(
    second.lines.map((l) => l.word),
    ['pending'],
    'the line is read once it ends',
  );
  assert.equal(second.cursor, size());
});

test('a line whose step or note is not text is read by nobody, and the lines after it are read', () => {
  emptyStore();
  const at = '2026-09-22T10:00:00.000Z';
  const bad = [
    { at, run: 'r-a', step: 3, word: 'running' },
    { at, run: 'r-a', word: 'blocked', note: { needs: 'a key' } },
  ];
  const good = { at, run: 'r-a', step: 'plan', word: 'pending', note: 'waits on you' };
  fs.writeFileSync(FEED, [...bad, good].map((l) => `${JSON.stringify(l)}\n`).join(''));
  const read = readFeed(0);
  assert.deepEqual(read.lines, [upgraded(good)], 'the one line that reads is read, upgraded to a v1 signal');
  assert.equal(read.cursor, size());
});

test('a v1 line only half signed is read all the same, and every key it lacks is filled in from its word and its note', () => {
  emptyStore();
  const at = '2026-09-22T10:00:00.000Z';
  const half = [
    { at, run: 'r-a', step: 'plan', word: 'awaiting approval', involved: { kind: 'Step', name: 'r-a/plan' } },
    { at, run: 'r-a', step: 'plan', word: 'denied: Bash(ls)', note: 'try 1', call: 'Bash(ls)' },
    { at, run: 'r-a', word: 'running', reason: 'ReasonANewerNemiaNamed', apiVersion: 'nemia/v2' },
  ];
  fs.writeFileSync(FEED, half.map((l) => `${JSON.stringify(l)}\n`).join(''));
  const read = readFeed(0).lines;
  assert.equal(read.length, 3, 'no line is dropped for a key it lacks, or for one this nemia does not know');
  assert.deepEqual(
    { reason: read[0].reason, waits: read[0].waits, source: read[0].source },
    { reason: 'AwaitingApproval', waits: 'person', source: 'tick' },
    'a line with an involved and no reason is read by its word',
  );
  assert.deepEqual(
    { reason: read[1].reason, call: read[1].call, try: read[1].try, source: read[1].source },
    { reason: 'ToolDenied', call: 'Bash(ls)', try: undefined, source: 'runtime' },
    'a one-shot with no try is a one-shot, and the try it lacks is not invented',
  );
  assert.equal(read[2].reason, 'ReasonANewerNemiaNamed', 'a line a newer nemia signed is passed on as its writer judged it');
  const fold = foldFeed(freshFold(), read);
  assert.deepEqual([...fold.said.keys()], ['Step/r-a/plan', 'Run/r-a'], 'and the fold reads each by what it is about');
  assert.deepEqual([...fold.shots.entries()], [['r-a/plan#0', 1]], 'the one-shot with no try is counted under none');
});

test('a line a writer died in the middle of is ended by the next pass, and costs that line alone', async () => {
  emptyStore();
  const b = board();
  const run = await started('the torn');
  await runWith(b.e, tickRun());
  const good = lines().length;
  fs.appendFileSync(FEED, '{"at":"2026-09-22T10:00:00.000Z","run":"r-torn","wo');

  b.set(`${run.id}-plan`, 'succeeded', SIGNED);
  await runWith(b.e, tickRun());
  await runWith(b.e, tickRun());
  const text = fs.readFileSync(FEED, 'utf8');
  assert.ok(text.endsWith('\n'));
  assert.ok(text.includes('"wo\n{'), 'the torn line is ended before the pass writes');
  const after = lines();
  assert.ok(after.length > good, 'the pass after it is read whole');
  assert.equal(
    after.some((l) => l.run === 'r-torn'),
    false,
    'and the torn line is read by nobody',
  );
  const plan = after.filter((l) => l.run === run.id && l.step === 'plan').map((l) => l.word);
  assert.equal(new Set(plan).size, plan.length, `nothing after it is said twice: ${plan.join(' → ')}`);
});

test(
  '`nemia watch --once` prints each line and the cursor to read on from; `nemia watch` follows the lines as they are written, until stopped',
  WAITED,
  async (t) => {
    emptyStore();
    const b = board();
    const run = await started('the watch');
    await runWith(b.e, tickRun());
    const printed = await printedBy(t, b.e, 'watch', '--once');
    assert.equal(printed.at(-1), `cursor: ${size()}`);
    assert.ok(
      printed.some((l) => l.includes(run.id) && l.endsWith('running')),
      printed.join('\n'),
    );
    assert.deepEqual(
      await printedBy(t, b.e, 'watch', '--once', String(size())),
      [`cursor: ${size()}`],
      'from the end, nothing but the cursor',
    );

    const got: FeedLine[] = [];
    const arrived = bell();
    const from = size();
    const watch = watchFeed({
      from,
      intervalMs: 20,
      onLine: (l) => {
        got.push(l);
        arrived.ring();
      },
    });
    try {
      b.set(`${run.id}-plan`, 'succeeded', SIGNED);
      await runWith(b.e, tickRun());
      await until(
        t,
        () => got.length >= 2,
        () => `two lines handed by the watch; it handed ${got.length}`,
        { bell: arrived },
      );
      assert.deepEqual(got, readFeed(from).lines.slice(0, got.length), 'the lines, in order, as the feed has them');
    } finally {
      watch.stop();
    }
    const stopped = got.length;
    await runWith(b.e, tickRun());
    fs.appendFileSync(FEED, `${JSON.stringify({ at: '2026-09-22T10:00:00.000Z', run: 'r-after', word: 'running' })}\n`);
    await new Promise((r) => setTimeout(r, 100));
    assert.equal(got.length, stopped, 'a watch stopped delivers nothing more');
  },
);

test(
  'a watch hands each line on with its own cursor: the byte after it, in bytes not characters, where a reader resumes with the lines after it and no other',
  WAITED,
  async (t) => {
    emptyStore();
    const line = (run: string, word: string, note?: string) =>
      JSON.stringify({ at: '2026-09-22T10:00:00.000Z', run, word, ...(note ? { note } : {}) });
    fs.writeFileSync(
      FEED,
      [
        line('r-a', 'running'),
        line('r-a', 'awaiting approval', 'round 2 — asked — approve it'),
        '{"at":"2026-09-22T10:00:00.000Z","run":"r-torn","wo',
        line('r-b', 'running'),
        line('r-a', 'done'),
      ]
        .map((l) => `${l}\n`)
        .join(''),
    );
    const whole = readFeed(0);
    assert.equal(
      whole.lines.length,
      4,
      'a note of three-byte dashes, then a line a writer died in, ended by the next: its bytes move the cursor and it is handed on to nobody',
    );

    const got: { line: FeedLine; cursor: number }[] = [];
    const arrived = bell();
    const watch = watchFeed({
      intervalMs: 20,
      onLine: (l, cursor) => {
        got.push({ line: l, cursor });
        arrived.ring();
      },
    });
    try {
      await until(
        t,
        () => got.length >= whole.lines.length,
        () => `all ${whole.lines.length} lines handed by the watch; it handed ${got.length}`,
        { bell: arrived },
      );
    } finally {
      watch.stop();
    }

    assert.deepEqual(
      got.map((g) => g.line),
      whole.lines,
      'every line, once, in order',
    );
    for (const [i, { cursor }] of got.entries()) {
      assert.equal(feedCursorRefusal(cursor), undefined, `line ${i}'s cursor is one the feed takes`);
      assert.deepEqual(readFeed(cursor).lines, whole.lines.slice(i + 1), `from line ${i}'s cursor, the lines after it and no other`);
    }
    assert.equal(got.at(-1)!.cursor, whole.cursor, "the last line's cursor is the end a read hands out");
    assert.equal(
      got[2].cursor - got[1].cursor > Buffer.byteLength(line('r-b', 'running')) + 1,
      true,
      "the torn line's bytes are counted into the next line's cursor",
    );
  },
);

test('`nemia watch` survives a feed cut under it: truncated, deleted or replaced, it says so once and delivers the next transition', async () => {
  emptyStore();
  const b = board();
  const run = await started('the cut');
  await runWith(b.e, tickRun());
  const cli = new URL('../cli/main.ts', import.meta.url).href;
  const w = nodeChild(`const { main } = await import(${JSON.stringify(cli)}); await main(['watch', '${size()}'], {});`, {
    ...process.env,
    WF_ROOT: ROOT,
  });
  const cuts = () =>
    w
      .err()
      .split('\n')
      .filter((l) => l.includes('under this watch'));
  try {
    await w.until(
      () => w.out().includes('watching from'),
      'a real `nemia watch`, in a process killed at the end since it never returns, its engine never asked anything, starts',
    );

    fs.truncateSync(FEED, 0);
    await w.until(() => cuts().length >= 1, 'truncated to nothing: the truncation is said');
    assert.equal(cuts().length, 1, 'the truncation is said once');
    assert.match(cuts()[0], /^nemia watch: the feed was truncated under this watch at cursor \d+, and is 0 bytes now .*from its start/);
    b.set(`${run.id}-plan`, 'succeeded', SIGNED);
    await runWith(b.e, tickRun());
    await runWith(b.e, tickRun());
    await w.until(
      () => /\splan\s+awaiting approval/.test(w.out()),
      'the watch reads the feed the tick writes again from its start: the gate reached after the cut is delivered',
    );

    const before = w.out().length;
    fs.rmSync(FEED);
    await w.until(() => cuts().length >= 2, 'deleted: the same, the deletion is said');
    assert.equal(cuts().length, 2, 'the deletion is said once');
    assert.match(cuts()[1], /the feed was deleted under this watch/);
    await runWith(b.e, approveRun(run.id, 'plan'));
    for (let i = 0; i < 2; i++) await runWith(b.e, tickRun());
    await w.until(() => /\splan\s+(?!awaiting)/.test(w.out().slice(before)), 'the approval after the deletion is delivered');

    const at = w.out().length;
    const next = `${FEED}.next`;
    fs.writeFileSync(
      next,
      `${fs.readFileSync(FEED, 'utf8')}${JSON.stringify({ at: '2026-09-22T10:00:00.000Z', run: 'r-new', word: 'running' })}\n`,
    );
    fs.renameSync(next, FEED);
    await w.until(
      () => cuts().length >= 3 && w.out().slice(at).includes('r-new'),
      'replaced by another file of the same bytes and more: its inode tells, not its size; the replacement is said on stderr and read',
    );
    assert.equal(cuts().length, 3, 'the replacement is said once');
    assert.match(cuts()[2], /the feed was replaced under this watch/);

    const quiet = w.err();
    fs.appendFileSync(FEED, `${JSON.stringify({ at: '2026-09-22T10:00:01.000Z', run: 'r-last', word: 'running' })}\n`);
    await w.until(() => w.out().includes('r-last'), 'each cut said once: every beat after reads on, and the line after is delivered');
    assert.equal(w.err(), quiet, 'nothing more said, and no `past the end`, ever');
    assert.doesNotMatch(w.err(), /past the end|falls inside a line/);
  } finally {
    w.child.kill();
  }
});

test(
  '`nemia watch` says it is watching only once it holds its cursor: a feed cut the moment the banner is read is said, not refused',
  WAITED,
  async (t) => {
    emptyStore();
    const line = JSON.stringify({ at: '2026-09-22T10:00:00.000Z', run: 'r-a', word: 'running' });
    fs.writeFileSync(FEED, `${line}\n${line}\n`);
    const from = size();
    const out: string[] = [];
    const err: string[] = [];
    const said = bell();
    t.mock.method(console, 'log', (...a: unknown[]) => {
      out.push(a.join(' '));
      if (a.join(' ').startsWith('watching from')) fs.truncateSync(FEED, 0);
    });
    t.mock.method(console, 'error', (...a: unknown[]) => {
      err.push(a.join(' '));
      said.ring();
    });
    const watch = watchPrinted(from);
    try {
      assert.deepEqual(
        out,
        [`watching from ${from}, ^C to stop`],
        "a reader acts on the banner at once, as fast as it can: in this process, before the next line of the watch's own start",
      );
      await until(t, () => err.length > 0, 'the truncation said on stderr', { bell: said });
      assert.match(err[0], /^nemia watch: the feed was truncated under this watch at cursor \d+, and is 0 bytes now .*from its start/);
    } finally {
      watch.stop();
    }
  },
);

test('`nemia watch` interrupted in the process, as a signal interrupts it, leaves no watcher and no timer behind, and prints nothing more', async (t) => {
  emptyStore();
  const line = (run: string) => `${JSON.stringify({ at: '2026-09-22T10:00:00.000Z', run, word: 'running' })}\n`;
  fs.writeFileSync(FEED, line('r-before'));
  const from = size();
  const out: string[] = [];
  let banner: () => void = () => {};
  const bannered = new Promise<void>((resolve) => {
    banner = resolve;
  });
  t.mock.method(console, 'log', (...a: unknown[]) => {
    out.push(a.join(' '));
    if (a.join(' ').startsWith('watching from')) banner();
  });
  t.mock.method(console, 'error', () => {});
  const closes: { mock: { callCount(): number } }[] = [];
  const watch = fs.watch;
  t.mock.method(fs, 'watch', (...args: Parameters<typeof fs.watch>) => {
    const made = watch(...args);
    closes.push(t.mock.method(made, 'close'));
    return made;
  });
  const timers: NodeJS.Timeout[] = [];
  const every = setInterval;
  t.mock.method(globalThis, 'setInterval', (...args: Parameters<typeof setInterval>) => {
    const made = every(...args);
    timers.push(made);
    return made;
  });
  const cleared: unknown[] = [];
  const clear = clearInterval;
  t.mock.method(globalThis, 'clearInterval', (timer: NodeJS.Timeout) => {
    cleared.push(timer);
    clear(timer);
  });
  const fiber = Effect.runFork(watching(from));
  await bannered;
  assert.equal(closes.length, 1, 'the watch holds one watcher of the feed');
  assert.equal(timers.length, 1, 'and one timer');
  assert.equal(closes[0].mock.callCount(), 0);
  await Effect.runPromise(Fiber.interrupt(fiber));
  assert.equal(closes[0].mock.callCount(), 1, 'its watcher closed as it was interrupted');
  assert.deepEqual(cleared, timers, 'and its timer cleared');
  const exit = await Effect.runPromise(Fiber.await(fiber));
  assert.ok(Exit.isFailure(exit) && Cause.hasInterruptsOnly(exit.cause), 'interrupted, never ended of itself');

  const printed = out.length;
  const got: string[] = [];
  let arrived: () => void = () => {};
  const other = watchFeed({
    from,
    intervalMs: 20,
    onLine: (l) => {
      if (isRunLine(l)) got.push(l.run);
      arrived();
    },
  });
  try {
    const delivered = new Promise<void>((resolve) => {
      arrived = resolve;
    });
    fs.appendFileSync(FEED, line('r-after'));
    await delivered;
  } finally {
    other.stop();
  }
  assert.deepEqual(got, ['r-after'], 'a watch still running is handed the line');
  assert.equal(out.length, printed, 'the interrupted watch printed nothing of it');
});

test(
  'REFUSED: a watch not told what to do about a cut feed refuses to read it, on every beat — the api ends its stream on that',
  WAITED,
  async (t) => {
    emptyStore();
    const line = JSON.stringify({ at: '2026-09-22T10:00:00.000Z', run: 'r-a', word: 'running' });
    fs.writeFileSync(FEED, `${line}\n${line}\n`);
    const errors: Error[] = [];
    const refused = bell();
    const watch = watchFeed({
      from: size(),
      intervalMs: 20,
      onLine: () => {},
      onError: (e) => {
        errors.push(e as Error);
        refused.ring();
      },
    });
    try {
      fs.truncateSync(FEED, 0);
      await until(
        t,
        () => errors.length >= 2,
        () => `the cut feed refused on two beats; refused ${errors.length} times`,
        { bell: refused },
      );
      assert.ok(errors.every(refusedWith(/is past the end of the feed/)), errors.map((e) => e.message).join('\n'));
    } finally {
      watch.stop();
    }
  },
);

test(
  'a watch says each read that works, before the lines it found and whether or not it found any, and no read that fails',
  WAITED,
  async (t) => {
    if (process.getuid?.() === 0) return t.skip('a mode of 000 does not keep root from reading');
    emptyStore();
    fs.writeFileSync(FEED, `${JSON.stringify({ at: '2026-09-22T10:00:00.000Z', run: 'r-a', word: 'running' })}\n`);
    const said: string[] = [];
    const spoke = bell();
    const heard = (ok: () => boolean, what: string) =>
      until(t, ok, () => `${what}; the watch said ${said.join(', ') || 'nothing'}`, { bell: spoke });
    const count = (word: string) => said.filter((w) => w === word).length;
    const watch = watchFeed({
      intervalMs: 20,
      onLine: () => {
        said.push('line');
        spoke.ring();
      },
      onRead: () => {
        said.push('read');
        spoke.ring();
      },
      onError: () => {
        said.push('error');
        spoke.ring();
      },
    });
    try {
      await heard(() => count('read') >= 4, 'reads that find nothing are said too');
      assert.deepEqual(said.slice(0, 2), ['read', 'line'], 'the read, then the line it found');
      assert.equal(count('line'), 1);

      fs.chmodSync(FEED, 0o000);
      try {
        await heard(() => count('error') >= 1, 'a read that fails goes to onError');
        const at = said.lastIndexOf('error');
        await heard(() => said.slice(at + 1).includes('error'), 'and so does the next');
        assert.deepEqual(
          said.slice(at).filter((w) => w !== 'error'),
          [],
          'no read is said while reads fail',
        );
      } finally {
        fs.chmodSync(FEED, 0o644);
      }
      const back = said.length;
      await heard(() => said.slice(back).includes('read'), 'the first read that works is said, with nothing new written');
      assert.equal(count('line'), 1);
    } finally {
      watch.stop();
    }
  },
);

test('`wf --help` names nemia watch whole, and says which feed is whose', async (t) => {
  const printed = (await printedBy(t, board().e, '--help')).join('\n');
  assert.equal(/^ {2}nemia feed\b/m.test(printed), false, 'nemia feed is retired: nemia watch --once reads once');
  assert.match(
    printed,
    /^ {2}nemia watch \[cursor\] \[--once\] \[-l <selector>\]\.\.\. \[--cursor-file <path>\] \[--json\]$/m,
  );
  assert.match(printed, /nemia watch follows what the workflow decides/);
  assert.match(printed, /ae watch/);
});

test('the feed asks the engine nothing of its own: a pass reads each task as many times with the feed as the judgement did', async () => {
  emptyStore();
  const b = board();
  await started('the reads');
  await runWith(b.e, tickRun());
  await runWith(b.e, tickRun());
  const before = b.views();
  await runWith(b.e, tickRun());
  const perPass = b.views() - before;
  assert.equal(
    perPass,
    1,
    "one read per task filed, the plan's, per pass: what `advance` reads for its own judgement, and nothing for the feed",
  );
  assert.equal(feedFile(), FEED);
});

test("feedPhase folds the engine's live words into running, and keeps every word a decision reads", () => {
  for (const live of ['running (working)', 'running (idle)', 'working (quiescent)', 'starting', 'between attempts'])
    assert.equal(feedPhase(live), 'running', live);
  for (const kept of ['pending', 'needs-human', 'succeeded', 'failed', 'stopped', 'unknown']) assert.equal(feedPhase(kept), kept);
});

test('feedWords says the run with its prune, what waits on a person as a note, and a slot wait without its count', () => {
  const steps = [{ name: 'plan', after: [], brief: 'plan it' }] as unknown as Parameters<typeof listing>[0]['steps'];
  const run = {
    id: 'r-1',
    brief: 'b',
    createdAt: '2026-09-22T10:00:00.000Z',
    steps: {},
    repo: '/r',
    branch: 'wf/r-1',
    base: 'main',
  } as unknown as Run;
  const held = listing({
    steps,
    run,
    phaseOf: () => 'unknown',
    closeoutOf: () => undefined,
    asks: [],
    roundAsks: [],
    answers: [],
    waits: [],
    slot: { inFlight: 2, cap: 2 },
  });
  const a = feedWords(held, run, { status: 'running' });
  assert.deepEqual(a.run, { word: 'running' });
  assert.deepEqual(
    a.steps.map((s) => s.word),
    ['waiting for a run slot'],
  );
  const other = listing({
    steps,
    run,
    phaseOf: () => 'unknown',
    closeoutOf: () => undefined,
    asks: [],
    roundAsks: [],
    answers: [],
    waits: [],
    slot: { inFlight: 3, cap: 3 },
  });
  assert.deepEqual(feedWords(other, run, { status: 'running' }), a, 'the count in flight moving is not a change');
  assert.deepEqual(feedWords(held, { pruned: { at: '', worktrees: [] } }, { status: 'succeeded' }).run, { word: 'succeeded (pruned)' });
  assert.deepEqual(
    feedWords(held, run, { status: 'awaiting approval' }).run,
    { word: 'awaiting approval' },
    "a run stopped on a person's word, and not on anything that broke, says what it stopped on",
  );
  assert.deepEqual(
    feedWords(held, { pruned: { at: '', worktrees: [] } }, { status: 'blocked' }).run,
    { word: 'blocked (pruned)' },
    'pruned too',
  );
  assert.deepEqual(feedWords(held, run, { status: 'failed' }).run, { word: 'failed' }, 'and one that broke says failed');
});

test("the feed's word for a step waiting on a person is the word `nemia ls` prints, with what its harness waits for", () => {
  const steps = [{ name: 'plan', after: [], brief: 'plan it' }] as unknown as Parameters<typeof listing>[0]['steps'];
  const run = {
    id: 'r-1',
    brief: 'b',
    createdAt: '2026-09-22T10:00:00.000Z',
    steps: { plan: { taskId: 't1' } },
    repo: '/r',
    branch: 'wf/r-1',
    base: 'main',
  } as unknown as Run;
  const blockedWith = (waitingOf: (id: string) => string | undefined) =>
    listing({
      steps,
      run,
      phaseOf: (id) => (id === 't1' ? 'needs-human' : 'unknown'),
      closeoutOf: () => undefined,
      asks: [],
      roundAsks: [],
      answers: [],
      waits: [],
      waitingOf,
    });
  const waiting = blockedWith((id) => (id === 't1' ? 'permission prompt' : undefined));
  assert.deepEqual(
    [waiting.steps[0].status, waiting.steps[0].waits],
    ['needs-human', 'waiting for a permission prompt'],
    "the listing's status keeps the bare word, and the wait beside it",
  );
  assert.equal(
    feedWords(waiting, run, { status: 'running' }).steps[0].word,
    'needs-human: waiting for a permission prompt',
    'the feed gives the word as `nemia ls` prints it, the wait included',
  );
  assert.equal(
    feedWords(
      blockedWith(() => undefined),
      run,
      { status: 'running' },
    ).steps[0].word,
    'needs-human',
    'a step whose harness says nothing of its wait is the bare word',
  );
});

test('the fold keeps the last word of each run and step, forgets a removed run, and the diff owes a line only for what moved', () => {
  const at = '2026-09-22T10:00:00.000Z';
  const fold = foldFeed(freshFold(), [
    { at, run: 'r-1', word: 'running' },
    { at, run: 'r-1', step: 'plan', word: 'pending' },
    { at, run: 'r-1', step: 'plan', word: 'running' },
    { at, run: 'r-2', word: 'running' },
    { at, run: 'r-2', word: 'removed' },
    { at, run: 'r-3', word: 'running', note: 'waiting on you: approve plan' },
  ]);
  assert.deepEqual([...fold.said.keys()], ['Run/r-1', 'Step/r-1/plan', 'Run/r-3']);
  const now = new Map([
    [
      'r-1',
      {
        run: { word: 'running' },
        steps: [
          { name: 'plan', word: 'running' },
          { name: 'implement', word: 'waiting' },
        ],
      },
    ],
    ['r-3', { run: { word: 'running' }, steps: [] }],
    ['r-2', { run: { word: 'running' }, steps: [] }],
  ]);
  assert.deepEqual(
    feedChanges(fold, now, at),
    [
      { at, run: 'r-1', step: 'implement', word: 'waiting' },
      { at, run: 'r-3', word: 'running' },
      { at, run: 'r-2', word: 'running' },
    ].map(upgraded),
    'a new step, a note gone, and a run back under an id it had',
  );
  assert.deepEqual(
    feedChanges(fold, new Map(), at),
    [
      { at, run: 'r-1', word: 'removed' },
      { at, run: 'r-3', word: 'removed' },
    ].map(upgraded),
  );
});

test('a feed written before the signature and one written after fold to the same state, and a removal of either shape forgets the run', () => {
  const at = '2026-10-16T04:00:00.000Z';
  const v0: FeedLine[] = [
    { at, run: 'r-1', word: 'running' },
    { at, run: 'r-1', step: 'plan', word: 'pending' },
    { at, run: 'r-1', step: 'plan', word: 'running', note: 'waiting on you: approve the plan' },
    { at, run: 'r-2', word: 'succeeded' },
    { at, run: 'r-2', step: 'plan', word: 'unverified · done' },
  ];
  const v1: FeedLine[] = [
    {
      at,
      run: 'r-1',
      word: 'running',
      apiVersion: FEED_VERSION,
      involved: { kind: 'Run', name: 'r-1' },
      labels: { run: 'r-1', factory: 'nemia', workflow: 'build' },
      reason: 'Running',
      type: 'Normal',
      source: 'tick',
      message: 'running',
    },
    {
      at,
      run: 'r-1',
      step: 'plan',
      word: 'pending',
      apiVersion: FEED_VERSION,
      involved: { kind: 'Step', name: 'r-1/plan' },
      labels: { run: 'r-1', factory: 'nemia', workflow: 'build', step: 'plan', agent: 'ada' },
      reason: 'Pending',
      type: 'Normal',
      source: 'tick',
      message: 'pending',
    },
    {
      at,
      run: 'r-1',
      step: 'plan',
      word: 'running',
      note: 'waiting on you: approve the plan',
      apiVersion: FEED_VERSION,
      involved: { kind: 'Step', name: 'r-1/plan' },
      labels: { run: 'r-1', factory: 'nemia', workflow: 'build', step: 'plan', agent: 'ada' },
      reason: 'Running',
      type: 'Normal',
      waits: 'person',
      source: 'tick',
      message: 'running · waiting on you: approve the plan',
    },
    {
      at,
      run: 'r-2',
      word: 'succeeded',
      apiVersion: FEED_VERSION,
      involved: { kind: 'Run', name: 'r-2' },
      labels: { run: 'r-2', factory: 'nemia', workflow: 'build' },
      reason: 'Succeeded',
      type: 'Normal',
      source: 'tick',
      message: 'succeeded',
    },
    {
      at,
      run: 'r-2',
      step: 'plan',
      word: 'unverified · done',
      apiVersion: FEED_VERSION,
      involved: { kind: 'Step', name: 'r-2/plan' },
      labels: { run: 'r-2', factory: 'nemia', workflow: 'build', step: 'plan', agent: 'ada' },
      reason: 'Succeeded',
      type: 'Normal',
      source: 'tick',
      message: 'unverified · done',
    },
  ];

  assert.deepEqual(
    [...foldFeed(freshFold(), v0).said.keys()],
    ['Run/r-1', 'Step/r-1/plan', 'Run/r-2', 'Step/r-2/plan'],
    'a line of a step keys on the step, never on the run it belongs to',
  );
  assert.deepEqual(
    foldFeed(freshFold(), v0),
    foldFeed(freshFold(), v1),
    'the same events in the two shapes fold to the same state: what each is about is derived the one way',
  );

  const fromSigned = foldFeed(freshFold(), v1);
  foldFeed(fromSigned, [{ at, run: 'r-1', word: REMOVED }]);
  assert.deepEqual(
    [...fromSigned.said.keys()],
    ['Run/r-2', 'Step/r-2/plan'],
    'a removal written before the signature forgets a run folded from signed lines, and its steps with it',
  );

  const fromUnsigned = foldFeed(freshFold(), v0);
  foldFeed(fromUnsigned, [
    {
      at,
      run: 'r-2',
      word: REMOVED,
      apiVersion: FEED_VERSION,
      involved: { kind: 'Run', name: 'r-2' },
      labels: { run: 'r-2', factory: 'nemia', workflow: 'build' },
      reason: 'Removed',
      type: 'Normal',
      source: 'person',
      message: 'removed',
    },
  ]);
  assert.deepEqual(
    [...fromUnsigned.said.keys()],
    ['Run/r-1', 'Step/r-1/plan'],
    'and a signed removal forgets a run folded from lines written before the signature',
  );
});

test('REFUSED: a run at rest whose words stand owes no line for a note reworded — a word moved, a step new to the fold and a run gone still do', () => {
  const at = '2026-10-05T19:29:00.000Z';
  const fold = foldFeed(freshFold(), [
    { at, run: 'r-1', word: 'succeeded' },
    { at, run: 'r-1', step: 'plan', word: 'done' },
    { at, run: 'r-2', word: 'succeeded' },
  ]);
  const reworded = {
    run: { word: 'succeeded', note: 'a note it never had' },
    steps: [{ name: 'plan', word: 'done', note: 'said to 2 times' }],
  };
  assert.deepEqual(
    feedChanges(fold, new Map([['r-1', { ...reworded, atRest: true as const }]]), at, new Set(['r-2'])),
    [],
    'at rest, the same words with new notes are a change of wording, not of the run',
  );
  assert.deepEqual(
    feedChanges(fold, new Map([['r-1', reworded]]), at, new Set(['r-2'])),
    [
      { at, run: 'r-1', word: 'succeeded', note: 'a note it never had' },
      { at, run: 'r-1', step: 'plan', word: 'done', note: 'said to 2 times' },
    ].map(upgraded),
    'in flight, a note that moved is a line',
  );
  const moved = { ...reworded, atRest: true as const, steps: [{ name: 'plan', word: 'failed', note: 'said to 2 times' }] };
  assert.deepEqual(
    feedChanges(fold, new Map([['r-1', moved]]), at, new Set(['r-2'])),
    [upgraded({ at, run: 'r-1', step: 'plan', word: 'failed', note: 'said to 2 times' })],
    'at rest, a word that moved is a line, with its note',
  );
  const added = { ...reworded, atRest: true as const, steps: [...reworded.steps, { name: 'ship', word: 'done' }] };
  assert.deepEqual(
    feedChanges(fold, new Map([['r-1', added]]), at, new Set(['r-2'])),
    [upgraded({ at, run: 'r-1', step: 'ship', word: 'done' })],
    'at rest, a step the feed never named says its word',
  );
  assert.deepEqual(
    feedChanges(fold, new Map([['r-1', { ...reworded, atRest: true as const }]]), at),
    [upgraded({ at, run: 'r-2', word: 'removed' })],
    'a run gone from the store is removed, at rest or not',
  );
});

test('each line written is published with the bytes it was written at: after the newline that ended a torn line, in bytes not characters', () => {
  const at = '2026-09-22T10:00:00.000Z';
  const lines: FeedLine[] = [
    { at, run: 'r-1', word: 'running' },
    { at, run: 'r-1', step: 'plan', word: 'waiting', note: 'on you — approve' },
  ];
  const sizes = lines.map((l) => Buffer.byteLength(`${JSON.stringify(l)}\n`));
  assert.notEqual(sizes[1], `${JSON.stringify(lines[1])}\n`.length, 'the second line holds a character of more than one byte');
  const written = sizes[0] + sizes[1];
  assert.deepEqual(publishedOf({ lines, before: 100, after: 100 + written, leading: '' }), [
    { from: 100, to: 100 + sizes[0], line: lines[0] },
    { from: 100 + sizes[0], to: 100 + written, line: lines[1] },
  ]);
  assert.deepEqual(
    publishedOf({ lines, before: 100, after: 101 + written, leading: '\n' }).map(({ from, to }) => [from, to]),
    [
      [101, 101 + sizes[0]],
      [101 + sizes[0], 101 + written],
    ],
    'a newline written first to end a line a writer died in the middle of is no line of its own',
  );
});

test('REFUSED: lines another writer appended among are published with no bytes — the file is grown by more than they are, so its readers read it', () => {
  const lines: FeedLine[] = [{ at: '2026-09-22T10:00:00.000Z', run: 'r-1', word: 'running' }];
  const size = Buffer.byteLength(`${JSON.stringify(lines[0])}\n`);
  assert.equal(publishedOf({ lines, before: 0, after: size, leading: '' }).length, 1);
  assert.deepEqual(publishedOf({ lines, before: 0, after: size + 40, leading: '' }), []);
  assert.deepEqual(publishedOf({ lines: [], before: 7, after: 7, leading: '' }), []);
});
