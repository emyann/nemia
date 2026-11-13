/**
 * `nemia rm` on the runtime itself, for what only the runtime says: what it removed of a run's tasks — their journals and their lines in
 * the feed, counted, and the feed read after with the lines forgotten counted — and its own words for a task that ran on a
 * harness the engine does not have, which it refuses by name, the marker kept and each pass on that engine warning of it. Everything
 * else of `nemia rm` and the engine is told on the engine's stand-in in `forget.test.ts`.
 *
 * Walked through `plainEngine` over the runtime's files store under a scratch root and a harness the test signs by hand, on the git
 * place. One engine serves the file, since a pass reads every run of the store, but for `lacking`, the runtime's engine over the same
 * store without a harness a task ran on.
 *
 * The test's store is its own, at `ROOT`, given as `ENV`. `WF_VERIFY_REST` judges in full every run a pass answers
 * from its memo of runs at rest, and throws on a difference; `WF_MAX_CONCURRENT` admits sessions enough, and no cap is set on runs.
 */
import { test, type TestContext } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { Effect } from 'effect';
import { nameFor, Engine as EngineService, type RunnerOps, type Sighting, type SpawnRequest } from 'agent-runtime';
import { asyncOps, plainEngine, type AsyncRunner } from './promised.ts';
import type { Engine } from '../src/runtime-client.ts';
import { scratch } from 'test-kit/scratch';
import { runGiven, runOver } from './placed.ts';
import { advanceRun, forgetRun, retryRun, startRun, runWith as runEngine, gitPlaceLayer } from '../src/runner.ts';
import { runRecord } from '../src/record/record.store.ts';
import { runTasks } from '../src/record/record.ts';
import { tickRun } from '../src/tick/tick.verb.ts';
import { forgetTyped } from './forgetting.ts';
import { filesStoreAt } from '../src/record/files.store.ts';
import type { Env } from '../src/config/config.store.ts';

const ROOT = scratch('wf-forget-runtime-');
fs.mkdirSync(path.join(ROOT, 'runs'), { recursive: true });

const ENV: Env = { ...process.env, WF_ROOT: ROOT, WF_VERIFY_REST: '1', WF_MAX_CONCURRENT: '10', WF_MAX_RUNS: undefined };
const runWith = runOver(runEngine, gitPlaceLayer, ENV);
const runPlaced = runGiven(gitPlaceLayer, ENV);
const files = filesStoreAt(ROOT);

/** A repository with one commit, so `nemia start` has a base to record. */
const aRepo = (): string => {
  const repo = fs.mkdtempSync(path.join(ROOT, 'repo-'));
  const git = (...args: string[]) =>
    execFileSync('git', ['-c', 'user.email=t@t', '-c', 'user.name=t', ...args], { cwd: repo, stdio: 'ignore' });
  git('init', '-q');
  git('commit', '-q', '--allow-empty', '-m', 'base');
  return repo;
};

/** A workflow folder of one step, `implement`, with the frontmatter lines it is given. */
const oneStep = (lines: string): string => {
  const dir = fs.mkdtempSync(path.join(ROOT, 'wf-'));
  fs.writeFileSync(path.join(dir, 'implement.md'), `---\n${/^place:/m.test(lines) ? '' : 'place: git\n'}${lines}\n---\nimplement it\n`);
  return dir;
};

const SIGNED = { outcome: 'done', summary: 'did it', artifacts: [], needs: null };
const BLOCKED = { outcome: 'blocked', summary: 'two flags could be meant', artifacts: [], needs: 'which flag: --dry-run or --force?' };

const sessions = new Map<string, Sighting>();
const spawned: SpawnRequest[] = [];
const runner: AsyncRunner = {
  async spawn(r) {
    spawned.push(r);
    sessions.set(r.name, { sessionId: `s-${spawned.length}`, nativeId: `native-${spawned.length}`, state: 'working', busy: true });
  },
  async observe() {
    return new Map(sessions);
  },
  async stop(id) {
    for (const [name, s] of sessions) if (s.sessionId === id) sessions.set(name, { ...s, state: 'canceled', busy: false });
  },
  async logs() {
    return '';
  },
};
/** The harness: the hand runner, keeping no file of a session that `forget` would remove. */
const harness: RunnerOps = { ...asyncOps(runner), forget: () => Effect.succeed({ files: [], left: [] }) };
const ENGINE_ROOT = fs.mkdtempSync(path.join(ROOT, 'engine-'));
const checks: RunnerOps = { ...asyncOps({ ...runner, output: async () => undefined }), forget: harness.forget };
const real = plainEngine(
  EngineService.layer({ root: ENGINE_ROOT, harnesses: { claude: harness, codex: harness, check: checks }, defaultHarness: 'claude' }),
);
/** Every call of the engine's `forget`, its tasks and whether it removed them. */
const forgets: { taskIds: string[]; yes: boolean }[] = [];
const e: Engine = {
  ...real,
  forget: (taskIds, options) => {
    forgets.push({ taskIds: [...taskIds], yes: options?.yes === true });
    return real.forget(taskIds, options);
  },
};
/** Every call of `lacking`'s `forget`, its tasks and whether it removed them. */
const lackingForgets: { taskIds: string[]; yes: boolean }[] = [];
const lackingReal = plainEngine(
  EngineService.layer({ root: ENGINE_ROOT, harnesses: { claude: harness, check: checks }, defaultHarness: 'claude' }),
);
/** The runtime's engine over the same store without the `codex` harness: a task that ran on it is one it refuses to forget, by name. */
const lacking: Engine = {
  ...lackingReal,
  forget: (taskIds, options) => {
    lackingForgets.push({ taskIds: [...taskIds], yes: options?.yes === true });
    return lackingReal.forget(taskIds, options);
  },
};

/** When a closeout here was written: any moment after its attempt began, which is now. */
const SIGNED_AT = Date.parse('2999-01-01T00:00:00.000Z');

/** Sign attempt `n` of `taskId` with `closeout`, after the attempt began, as the session's harness reports it. */
const sign = (taskId: string, n: number, closeout: object) => {
  const name = nameFor(taskId, n);
  assert.ok(sessions.has(name), `${name} was never started: ${[...sessions.keys()].join(', ')}`);
  sessions.set(name, { ...sessions.get(name)!, state: 'completed', busy: false, closeout: { payload: closeout, at: SIGNED_AT } });
};

/** What the daemon does: the engine's tick, then the run's pass. */
const pass = async (id: string) => {
  await Effect.runPromise(e.tick());
  return runWith(e, advanceRun(runRecord(ROOT, id)));
};

/** The ids of the tasks the engine has a record of. */
const listed = async (): Promise<string[]> => (await Effect.runPromise(e.list())).views.map((v) => v.id);

/** A run of `workflowDir` on `repo` started, its step filed and started, and signed with `closeout`. */
const signed = async (workflowDir: string, closeout: object, repo = aRepo()) => {
  const run = await runPlaced(startRun({ brief: 'add a flag', repo, workflowDir }));
  assert.deepEqual((await pass(run.id)).filed, ['implement']);
  await pass(run.id);
  sign(`${run.id}-implement`, 1, closeout);
  await pass(run.id);
  return run;
};

/**
 * A repository run whose step signed blocked, was tried again with a word, signed done on its second try and passed its check: over, with
 * three tasks.
 */
const finished = async () => {
  const run = await signed(oneStep('harness: codex\ncheck: true'), BLOCKED);
  await runWith(e, retryRun(run.id, 'implement', { mode: 'continue', message: 'the --dry-run flag' }));
  await pass(run.id);
  await pass(run.id);
  sign(`${run.id}-implement-try2`, 1, SIGNED);
  assert.deepEqual((await pass(run.id)).checked, ['implement']);
  await pass(run.id);
  const check = nameFor(`${run.id}-implement-try2-check`, 1);
  sessions.set(check, { ...sessions.get(check)!, state: 'completed', busy: false, exitCode: 0 });
  await pass(run.id);
  assert.equal((await pass(run.id)).status, 'succeeded');
  const tasks = runTasks(runRecord(ROOT, run.id));
  assert.deepEqual(
    [...tasks].sort(),
    [`${run.id}-implement`, `${run.id}-implement-try2`, `${run.id}-implement-try2-check`],
    'the first try, the second and its check',
  );
  return { run, tasks };
};

const markerOf = (id: string) => path.join(ROOT, 'forgetting', `${id}.json`);

/** `nemia rm <args>`, as the client runs it over the api, on the engine `engine`: what it answered of each run, and its error. */
const typedOn = (_t: TestContext, engine: Engine, ...args: string[]) => forgetTyped((effect) => runWith(engine, effect), ROOT, args);

test("`nemia rm` of a repository run that is over forgets every task of it on the engine, its earlier try and its check among them, says so, and leaves no marker; the feed then read with the lines forgotten counted, the kept run's filings on it", async () => {
  const { run, tasks } = await finished();
  const kept = await signed(oneStep('harness: codex'), SIGNED);
  const before = forgets.length;

  const forgot = await runWith(e, forgetRun(run.id));
  assert.equal(forgot.kind, 'forgotten', forgot.refusal);
  assert.deepEqual([...(forgot.engine?.forgotten ?? [])].sort(), [...tasks].sort());
  assert.deepEqual([forgot.engine?.waiting, forgot.engine?.refusal, forgot.engine?.marker], [[], undefined, undefined]);
  assert.ok(forgot.engine!.journalBytes > 0 && forgot.engine!.feedLines > 0, 'what it removed is counted');
  assert.deepEqual(forgets.slice(before), [{ taskIds: tasks, yes: true }], 'one call, over its tasks');
  const left = await listed();
  assert.deepEqual(
    tasks.filter((id) => left.includes(id)),
    [],
    'the engine lists none of them',
  );
  assert.ok(left.includes(`${kept.id}-implement`), "another run's task is the engine's still");
  assert.ok(!fs.existsSync(markerOf(run.id)), 'no marker is left');

  const read = await Effect.runPromise(e.feed(0));
  const filed = new Set(read.entries.flatMap(({ taskId, event }) => (event.kind === 'filed' ? [taskId] : [])));
  assert.ok((read.forgotten ?? 0) > 0, `the lines forgotten are counted (${read.forgotten})`);
  assert.ok(
    filed.has(`${kept.id}-implement`) && !tasks.some((id) => filed.has(id)),
    "the feed keeps the kept run's filings, and none of its",
  );
});

test("an engine without the harness a task ran on refuses it by name: `nemia rm` says it refused, in the runtime's words, the marker kept; each pass on that engine warns of it with how a person removes the marker", async (t) => {
  const run = await signed(oneStep('harness: codex'), SIGNED);
  const task = `${run.id}-implement`;
  const said = await typedOn(t, lacking, 'rm', run.id);
  assert.equal(said.error, undefined, 'exit 0: the run is removed');
  const marker = markerOf(run.id);
  const why = `task ${task} ran on the \`codex\` harness, which this engine does not have`;
  const words = `the engine refused to forget 1 task of it: ${why}`;
  const engine = said.forgot[0]?.engine;
  assert.deepEqual(
    [said.forgot.length, engine?.refused, engine?.refusedWhy.length, engine?.marker, engine?.waiting],
    [1, [task], 1, marker, []],
  );
  assert.ok(engine?.refusedWhy[0]?.startsWith(why), `in the runtime's words: ${engine?.refusedWhy[0]}`);
  assert.deepEqual(files.forgetting.read(run.id), [task], 'the marker keeps its id');

  const before = lackingForgets.length;
  const done = await runWith(lacking, tickRun({ repo: ROOT }));
  assert.equal(lackingForgets.length, before + 1, 'a pass asks again');
  const [line, ...more] = done.forgetting ?? [];
  assert.deepEqual([more, line?.warn], [[], true], JSON.stringify(done.forgetting));
  assert.ok(line.text.startsWith(`${run.id} (removed): ${words}`) && line.text.endsWith(`rm ${marker}`), line.text);
  assert.ok(fs.existsSync(marker) && (await listed()).includes(task), "the marker stands, and the task is the engine's");

  await runWith(e, tickRun({ repo: ROOT }));
  assert.ok(!fs.existsSync(marker) && !(await listed()).includes(task), 'the engine with the harness forgets it, and a pass lifts it');
});
