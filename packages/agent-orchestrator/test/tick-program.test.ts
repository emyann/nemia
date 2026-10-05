/**
 * The tick as an Effect program (`tickRun`, over `EngineService`) beside its plain face (`tick`): the face runs the program over the engine
 * it is handed and adds nothing, a refusal is the program's typed failure and the face's rejection, and anything else is a defect the
 * program dies of and the face rethrows as it was thrown. Walked through the runtime itself, `promiseEngine` over an in-memory journal
 * and a harness the test signs by hand, as unreadable-journal.test.ts does.
 *
 * `WF_ROOT` is set before the runner is imported, which reads it as the module loads. `WF_VERIFY_REST=1` judges in full every run a pass
 * answers from its memo, sessions enough are admitted for the one run, and no cap is set on runs.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { nameFor, type Engine, type PromiseJournal, type PromiseRunner, type PromiseSighting } from 'agent-runtime';
import { Engine as RuntimeEngine, promiseEngine } from 'agent-runtime/effect';
import { Effect } from 'effect';
import type { Effect as EffectOf } from 'effect/Effect';
import type { Refusal } from '../src/refusal/refusal.ts';
import type { EngineService as Service } from '../src/runtime-client.ts';
import type { Pass } from '../src/tick/tick.verb.ts';
import { scratch } from './scratch.ts';

const ROOT = scratch('wf-tick-program-');
fs.mkdirSync(path.join(ROOT, 'runs'), { recursive: true });

process.env.WF_ROOT = ROOT;
process.env.WF_MAX_CONCURRENT = '10';
process.env.WF_VERIFY_REST = '1';
delete process.env.WF_MAX_RUNS;
const { start } = await import('../src/runner.ts');
const { freshRestMemo, tick, tickRun } = await import('../src/tick/tick.verb.ts');
const { EngineService } = await import('../src/runtime-client.ts');
const { Invalid } = await import('../src/refusal/refusal.ts');
const { PHASES, passCost } = await import('../src/meter/meter.ts');
const { recentPasses, recordRecentPass } = await import('../src/daemon/daemon.store.ts');

const git = (repo: string, ...args: string[]) =>
  execFileSync('git', ['-c', 'user.email=t@t', '-c', 'user.name=t', ...args], {
    cwd: repo,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  }).trim();

const REPO = fs.mkdtempSync(path.join(ROOT, 'repo-'));
git(REPO, 'init', '-q');
git(REPO, 'commit', '-q', '--allow-empty', '-m', 'base');

const FOLDER = fs.mkdtempSync(path.join(ROOT, 'wf-'));
fs.writeFileSync(path.join(FOLDER, 'work.md'), '---\nharness: codex\n---\nwork it\n');

const tasks = new Map<string, Awaited<ReturnType<PromiseJournal['read']>>>();
/** When the journal says each attempt began, in milliseconds, by its session's name: a closeout counts only when made after it. */
const starts = new Map<string, number>();
const journal: PromiseJournal = {
  async append(taskId, event) {
    tasks.set(taskId, [...(tasks.get(taskId) ?? []), event]);
    if (event.kind === 'starting') starts.set(nameFor(taskId, event.attempt), Date.parse(event.at));
  },
  async read(taskId) {
    return [...(tasks.get(taskId) ?? [])];
  },
  async list() {
    return [...tasks.keys()].sort();
  },
  async feed() {
    return { entries: [], cursor: 0 };
  },
};

const sessions = new Map<string, PromiseSighting>();
const runner: PromiseRunner = {
  async spawn(r) {
    sessions.set(r.name, { sessionId: `s-${sessions.size + 1}`, nativeId: `n-${sessions.size + 1}`, state: 'working', busy: true });
  },
  async observe() {
    return new Map(sessions);
  },
  async stop() {},
  async logs() {
    return '';
  },
};
const e = promiseEngine(
  RuntimeEngine.layer({
    root: fs.mkdtempSync(path.join(ROOT, 'engine-')),
    journal,
    harnesses: { claude: runner, codex: runner, check: runner },
    defaultHarness: 'claude',
  }),
);
const signAll = () => {
  for (const [name, s] of sessions)
    if (s.state === 'working')
      sessions.set(name, {
        ...s,
        state: 'done',
        busy: false,
        closeout: { payload: { outcome: 'done', summary: 'did it', artifacts: [], needs: null }, at: starts.get(name)! + 1 },
      });
};

/** `tickRun`, given `engine` as the service, run to a Promise as the face runs it. */
const programOn = (engine: Engine, options: Parameters<typeof tickRun>[0] = {}) =>
  Effect.runPromise(tickRun(options).pipe(Effect.provide(EngineService.layer(engine))));

/** The engine, but for a runtime pass that rejects with `err`. */
const failingWith = (err: unknown): Engine => ({
  ...e,
  tick: async () => {
    throw err;
  },
});

test("the tick's program, given the engine as a service, answers what its plain face answers: the face runs the program and adds nothing", async () => {
  const run = start({ brief: 'one run', repo: REPO, workflowDir: FOLDER });
  for (let k = 0; k < 3; k++) await tick(e, { repo: ROOT });
  signAll();
  const status = async () => (await tick(e, { repo: ROOT })).runs.find((a) => a.run.id === run.id)?.status;
  let now = await status();
  for (let k = 0; k < 4 && now !== 'succeeded'; k++) now = await status();
  assert.equal(now, 'succeeded', 'the run finished before the two are compared');

  const { cost: faceCost, ...face } = await tick(e, { repo: ROOT, memo: freshRestMemo() });
  const { cost: programCost, ...program } = await programOn(e, { repo: ROOT, memo: freshRestMemo() });
  assert.deepEqual(
    face.runs.map((a) => [a.run.id, a.status]),
    [[run.id, 'succeeded']],
  );
  assert.deepStrictEqual(program, face);
  assert.deepEqual(Object.keys(programCost?.phases ?? {}), [...PHASES], 'the program meters its pass as the face does');
  assert.deepEqual(Object.keys(faceCost?.phases ?? {}), [...PHASES]);
});

test("REFUSED: the tick's refusal is its program's typed failure, picked out by its tag, and its face's rejection: an `Invalid`, exit code 2, in its words", async () => {
  const was = process.env.WF_MAX_CONCURRENT;
  process.env.WF_MAX_CONCURRENT = '-3';
  try {
    const recovered = await Effect.runPromise(
      tickRun({ repo: ROOT }).pipe(
        Effect.catchTag('Invalid', (r) => Effect.succeed(r.message)),
        Effect.provide(EngineService.layer(e)),
      ),
    );
    assert.match(String(recovered), /^WF_MAX_CONCURRENT=-3 is not a count from 1/);
    const err = await tick(e, { repo: ROOT }).then(
      () => assert.fail('a pass under a ceiling that does not read resolved'),
      (x: unknown) => x,
    );
    assert.ok(err instanceof Invalid, `an Invalid, not ${String(err)}`);
    assert.equal(err.exitCode, 2);
    assert.equal(err.message, recovered);
  } finally {
    process.env.WF_MAX_CONCURRENT = was;
  }
});

test("REFUSED: what is not a refusal is a defect the tick's program dies of, recovered by no catch, and its face rethrows it as it was thrown", async () => {
  const boom = new Error('boom');
  const caught = await Effect.runPromise(
    tickRun({ repo: ROOT }).pipe(
      Effect.catch(() => Effect.succeed('caught')),
      Effect.provide(EngineService.layer(failingWith(boom))),
    ),
  ).then(
    (x) => x,
    (x: unknown) => x,
  );
  assert.equal(caught, boom, 'the catch of failures left the defect alone');
  const err = await tick(failingWith(boom), { repo: ROOT }).then(
    () => assert.fail('a pass whose runtime rejected resolved'),
    (x: unknown) => x,
  );
  assert.equal(err, boom, 'the very object the runtime rejected with');
  assert.deepEqual(await programOn(e, { repo: ROOT }).then((p) => p.runs.length), 1, 'the next pass reads the store as before');
});

test("the tick's program says in its type what it needs and what it refuses: run without the engine, it does not typecheck, and a refusal is its failure", () => {
  const typed: EffectOf<Pass, Refusal, Service> = tickRun();
  // @ts-expect-error -- a refusal is its failure, so it is not an Effect that cannot fail
  const infallible: EffectOf<Pass, never, Service> = tickRun();
  const unprovided = () =>
    // @ts-expect-error -- tickRun requires EngineService, and runPromise takes no requirement
    Effect.runPromise(tickRun());
  assert.deepEqual([typeof typed, typeof infallible, typeof unprovided], ['object', 'object', 'function']);
});

test('a pass whose series cannot be written keeps its own cost and says so: the series are lost, never the pass; the quota read rides on it', async (t) => {
  const old = new Date(Date.now() - 3_600_000).toISOString();
  recordRecentPass(
    passCost({
      at: old,
      ms: 5,
      phases: Object.fromEntries(PHASES.map((p) => [p, { ms: 0, calls: 0, bytes: 0, reads: 0, spawned: 0 }])) as never,
      harnesses: {},
      records: 0,
      overheadMs: 0,
      rested: 0,
      runs: 0,
      tasks: 0,
      queued: 0,
      admitted: 0,
      waitMs: 0,
      load: 0,
    }),
  );
  fs.rmSync(path.join(ROOT, 'metrics'), { recursive: true, force: true });
  fs.writeFileSync(path.join(ROOT, 'metrics'), 'not a folder');
  const said: string[] = [];
  t.mock.method(process.stderr, 'write', (text: string) => said.push(text) > 0);
  const pass = await tick(e, { repo: ROOT, quota: () => ({ h: { w: 12 } }) });
  t.mock.restoreAll();
  fs.rmSync(path.join(ROOT, 'metrics'), { force: true });
  assert.ok(pass.cost, 'the pass answered with its cost');
  assert.ok(
    said.some((x) => x.startsWith('nemia: the series were not kept on this pass: ')),
    said.join(''),
  );
  const last = recentPasses().at(-1)!;
  assert.deepEqual([last.at, last.quota], [pass.cost.at, { h: { w: 12 } }]);
});
