/**
 * `nemia rm` forgets the engine's tasks of the run it removes, through the runtime's `forget`: every task its record names, earlier tries
 * and checks among them, gone from the engine's list, of a repository run and of a folder run; a task it closed and the engine has not
 * settled waits, with the run's marker (`runStore.forgetting`), until a pass of the daemon forgets it, or `nemia rm` again; a settled task
 * the engine refuses by name is said refused, on rm and each pass, and the rest forgotten; a refusal writes no marker and asks nothing; and
 * `nemia prune` counts what rm would forget, in one dry call over every run it prunes, and forgets nothing.
 *
 * Walked through the runtime itself, `plainEngine` over its files store under a scratch root and a harness the test signs by hand, so the
 * journals, the feed and the list are the runtime's own. One engine serves the file, since a pass reads every run of the store, but for
 * `lacking`, the runtime's engine over the same store without a harness a task ran on.
 *
 * `WF_ROOT` is set before the runner is imported: it is read as the module loads. `WF_VERIFY_REST` judges in full every run a pass answers
 * from its memo of runs at rest, and throws on a difference; `WF_MAX_CONCURRENT` admits sessions enough, and no cap is set on runs.
 */
import { test, type TestContext } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { Effect } from 'effect';
import { ForgetRefused, nameFor, Engine as EngineService, type RunnerOps, type Sighting, type SpawnRequest } from 'agent-runtime';
import { asyncOps, plainEngine, type AsyncRunner } from './promised.ts';
import type { Engine } from '../src/runtime-client.ts';
import { scratch } from './scratch.ts';
import { runGiven, runOver } from './placed.ts';

const ROOT = scratch('wf-forget-engine-');
fs.mkdirSync(path.join(ROOT, 'runs'), { recursive: true });

process.env.WF_ROOT = ROOT;
process.env.WF_VERIFY_REST = '1';
process.env.WF_MAX_CONCURRENT = '10';
delete process.env.WF_MAX_RUNS;
const { advanceRun, forgetRun, retryRun, runsForgetting, startRun, runWith: runEngine, gitPlaceLayer } = await import('../src/runner.ts');
const runWith = runOver(runEngine, gitPlaceLayer);
const runPlaced = runGiven(gitPlaceLayer);
const { readRun } = await import('../src/record/record.store.ts');
const { runTasks } = await import('../src/record/record.ts');
const { runStore } = await import('../src/record/files.store.ts');
const { tickRun } = await import('../src/tick/tick.verb.ts');
const { filingsRead } = await import('../src/views/views.verb.ts');
const { main } = await import('../src/cli/main.ts');

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
/** The words the engine's `forget` refuses every call in, naming no task, while set: a refusal that does not clear. */
let refusing: string | undefined;
/** The task the engine's `forget` refuses by name, in the runtime's words, while set, every call that asks it: a refusal of its own. */
let refusingTask: { taskId: string; message: string } | undefined;
const e: Engine = {
  ...real,
  forget: (taskIds, options) => {
    forgets.push({ taskIds: [...taskIds], yes: options?.yes === true });
    if (refusing !== undefined) return Effect.fail(new ForgetRefused({ message: refusing }));
    if (refusingTask && taskIds.includes(refusingTask.taskId)) return Effect.fail(new ForgetRefused(refusingTask));
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

/** Sign attempt `n` of `taskId` with `closeout`, after the attempt began, as the session's harness reports it. */
const sign = (taskId: string, n: number, closeout: object) => {
  const name = nameFor(taskId, n);
  assert.ok(sessions.has(name), `${name} was never started: ${[...sessions.keys()].join(', ')}`);
  sessions.set(name, { ...sessions.get(name)!, state: 'completed', busy: false, closeout: { payload: closeout, at: Date.now() + 1 } });
};

/** What the daemon does: the engine's tick, then the run's pass. */
const pass = async (id: string) => {
  await Effect.runPromise(e.tick());
  return runWith(e, advanceRun(readRun(id)));
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
  await runWith(e, retryRun(run.id, 'implement', { mode: 'nudge', message: 'the --dry-run flag' }));
  await pass(run.id);
  await pass(run.id);
  sign(`${run.id}-implement-try2`, 1, SIGNED);
  assert.deepEqual((await pass(run.id)).checked, ['implement']);
  await pass(run.id);
  const check = nameFor(`${run.id}-implement-try2-check`, 1);
  sessions.set(check, { ...sessions.get(check)!, state: 'completed', busy: false, exitCode: 0 });
  await pass(run.id);
  assert.equal((await pass(run.id)).status, 'succeeded');
  const tasks = runTasks(readRun(run.id));
  assert.deepEqual(
    [...tasks].sort(),
    [`${run.id}-implement`, `${run.id}-implement-try2`, `${run.id}-implement-try2-check`],
    'the first try, the second and its check',
  );
  return { run, tasks };
};

const markerOf = (id: string) => path.join(ROOT, 'forgetting', `${id}.json`);

/** `nemia <args>`, through the CLI, as a person types it: the lines it printed, and the error it ended with, if it did. */
const typed = (t: TestContext, ...args: string[]) => typedOn(t, e, ...args);

/** `nemia <args>` through the CLI over the engine `engine`: the lines it printed, and the error it ended with, if it did. */
const typedOn = async (t: TestContext, engine: Engine, ...args: string[]) => {
  const printed: string[] = [];
  const log = t.mock.method(console, 'log', (...a: unknown[]) => {
    printed.push(a.join(' '));
  });
  try {
    await main(args, engine);
    return { printed, error: undefined };
  } catch (err) {
    return { printed, error: err as Error & { exitCode?: number } };
  } finally {
    log.mock.restore();
  }
};

test("`nemia rm` of a repository run that is over forgets every task of it on the engine, its earlier try and its check among them, says so, and leaves no marker; the feed's filings then read with the lines forgotten counted", async () => {
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

  const read = await runWith(e, filingsRead(0));
  assert.ok(read.forgotten > 0, `the lines forgotten are counted (${read.forgotten})`);
  assert.ok(read.filed.has(`${kept.id}-implement`) && !tasks.some((id) => read.filed.has(id)), "the kept run's filings, and none of its");
});

test('`nemia rm` of a folder run forgets its task on the engine as it removes its folders', async () => {
  const notARepo = fs.mkdtempSync(path.join(ROOT, 'plain-'));
  const run = await signed(oneStep('harness: codex\nplace: folder\npermissionMode: workspace-write'), SIGNED, notARepo);
  assert.equal(readRun(run.id).steps.implement.workspace?.startsWith(path.join(ROOT, 'runs', run.id)), true, 'a folder run');
  const forgot = await runWith(e, forgetRun(run.id));
  assert.deepEqual([forgot.kind, forgot.folder, forgot.engine?.forgotten], ['forgotten', true, [`${run.id}-implement`]]);
  assert.ok(!(await listed()).includes(`${run.id}-implement`));
  assert.ok(!fs.existsSync(markerOf(run.id)));
});

test('REFUSED at shipped defaults: `nemia rm` of a run whose step is in flight writes no marker and asks the engine to forget nothing', async () => {
  const run = await runPlaced(startRun({ brief: 'still running', repo: aRepo(), workflowDir: oneStep('harness: codex') }));
  await pass(run.id);
  await pass(run.id);
  const before = forgets.length;
  const forgot = await runWith(e, forgetRun(run.id));
  assert.equal(forgot.kind, 'refused');
  assert.equal(forgot.engine, undefined);
  assert.equal(forgets.length, before, 'no forget asked');
  assert.ok(!fs.existsSync(markerOf(run.id)), 'and no marker written');
  assert.ok((await listed()).includes(`${run.id}-implement`));
});

test('REFUSED at shipped defaults: `nemia rm` of a run with a directory in its worktrees git does not know is held: it asks the engine to forget nothing, lifts its marker and keeps its record', async () => {
  const run = await signed(oneStep('harness: codex'), SIGNED);
  const stray = path.join(ROOT, 'worktrees', run.id, 'stray');
  fs.mkdirSync(stray, { recursive: true });
  fs.writeFileSync(path.join(stray, 'notes.txt'), 'mine');
  const before = forgets.length;
  const forgot = await runWith(e, forgetRun(run.id));
  assert.equal(forgot.kind, 'held', forgot.refusal);
  assert.ok(
    forgot.left.some((l) => l.path.endsWith(`${path.sep}stray`)),
    JSON.stringify(forgot.left),
  );
  assert.equal(forgot.engine, undefined);
  assert.equal(forgets.length, before, 'no forget asked');
  assert.ok(!fs.existsSync(markerOf(run.id)), 'its marker lifted');
  assert.ok(fs.existsSync(path.join(ROOT, 'runs', `${run.id}.json`)), 'its record kept');
  assert.ok((await listed()).includes(`${run.id}-implement`), "its task the engine's still");
  fs.rmSync(stray, { recursive: true });
  assert.equal((await runWith(e, forgetRun(run.id))).kind, 'forgotten');
});

test("`nemia rm` of a run whose step waits for a word closes its task, which has not settled: it waits, with the run's marker, and a pass of the daemon forgets it once it settles and lifts the marker", async (t) => {
  const run = await signed(oneStep('harness: claude'), BLOCKED);
  const task = `${run.id}-implement`;
  const forgot = await runWith(e, forgetRun(run.id));
  assert.equal(forgot.kind, 'forgotten', forgot.refusal);
  assert.deepEqual([forgot.engine?.forgotten, forgot.engine?.waiting], [[], [task]]);
  assert.equal(forgot.engine?.marker, markerOf(run.id));
  assert.deepEqual(runStore.forgetting.read(run.id), [task], 'the marker keeps its id');
  const said = await typed(t, 'rm', run.id);
  assert.equal(said.error, undefined, 'a second rm, the record gone, exits 0');
  const waits = `1 task of it waits — ${task} has not settled yet`;
  assert.match(said.printed[0], new RegExp(`^${run.id}  no such run — nothing to forget; .*${waits}`));
  assert.ok(fs.existsSync(markerOf(run.id)), 'it is still not settled: the marker stands');

  await Effect.runPromise(e.tick());
  const done = await runWith(e, tickRun({ repo: ROOT }));
  const [line, ...more] = done.forgetting ?? [];
  assert.deepEqual(more, [], JSON.stringify(done.forgetting));
  assert.match(line.text, new RegExp(`^${run.id} \\(removed\\): the engine forgot 1 task of it \\(`));
  assert.equal(line.warn, undefined);
  assert.ok(!(await listed()).includes(task), 'forgotten on the engine');
  assert.ok(!fs.existsSync(markerOf(run.id)), 'and the marker lifted');
  const quiet = await runWith(e, tickRun({ repo: ROOT }));
  assert.equal(quiet.forgetting, undefined, 'a pass with no marker says nothing of it');
});

test('a marker whose task settles is finished by `nemia rm` again, the record gone, as by a pass', async () => {
  const run = await signed(oneStep('harness: claude'), BLOCKED);
  const task = `${run.id}-implement`;
  assert.deepEqual((await runWith(e, forgetRun(run.id))).engine?.waiting, [task]);
  await Effect.runPromise(e.tick());
  const again = await runWith(e, forgetRun(run.id));
  assert.deepEqual([again.kind, again.engine?.forgotten, again.engine?.waiting], ['missing', [task], []]);
  assert.ok(!(await listed()).includes(task) && !fs.existsSync(markerOf(run.id)));
});

test("a marker beside the run's record is a `nemia rm` not finished: a pass forgets nothing of it", async () => {
  const run = await signed(oneStep('harness: codex'), SIGNED);
  runStore.forgetting.write(run.id, runTasks(readRun(run.id)));
  const before = forgets.length;
  const done = await runWith(e, tickRun({ repo: ROOT }));
  assert.equal(done.forgetting, undefined);
  assert.equal(forgets.length, before, 'the engine is not asked');
  assert.ok((await listed()).includes(`${run.id}-implement`));
  runStore.forgetting.lift(run.id);
});

test('a marker that does not read is said on each pass, with how a person removes it, and nothing is forgotten', async () => {
  fs.mkdirSync(path.join(ROOT, 'forgetting'), { recursive: true });
  fs.writeFileSync(markerOf('garbled-a1b2'), '{ not json');
  const done = await runWith(e, tickRun({ repo: ROOT }));
  assert.deepEqual(done.forgetting, [
    {
      text: `${markerOf('garbled-a1b2')} does not read as the tasks nemia rm forgets of garbled-a1b2: nothing of it is forgotten; a person removes it: rm ${markerOf('garbled-a1b2')}`,
      warn: true,
    },
  ]);
  fs.rmSync(markerOf('garbled-a1b2'));
});

test('`nemia prune` of N runs asks the engine once, dry, over all their tasks together, says what rm would forget of each, and forgets nothing', async (t) => {
  const runs = [await signed(oneStep('harness: codex'), SIGNED), await signed(oneStep('harness: codex'), SIGNED)];
  const tasks = runs.map((r) => `${r.id}-implement`);
  const before = forgets.length;
  const { counted } = await runWith(e, runsForgetting(runs.map((r) => r.id)));
  assert.deepEqual(forgets.slice(before), [{ taskIds: tasks, yes: false }], 'one dry call, over the union');
  for (const [i, r] of runs.entries()) assert.deepEqual(counted.get(r.id)?.forgotten, [tasks[i]], 'each run its own share');

  const dry = await typed(t, 'prune', ...runs.map((r) => r.id));
  assert.equal(dry.error, undefined);
  assert.equal(forgets.length, before + 2, 'the CLI asks once more, for both');
  for (const r of runs)
    assert.ok(
      dry.printed.some((l) => new RegExp(`^   the engine keeps 1 task of it \\(.+\\): nemia rm ${r.id} forgets them$`).test(l)),
      dry.printed.join('\n'),
    );
  assert.deepEqual(
    tasks.filter((id) => !forgets.at(-1)!.taskIds.includes(id)),
    [],
  );
  const left = await listed();
  assert.deepEqual(
    tasks.filter((id) => !left.includes(id)),
    [],
    'the engine keeps them all',
  );
});

test('`nemia prune` counts the tasks `nemia rm` forgets of a run as rm reads it, a step a pass filed and never wrote down among them', async () => {
  const run = await runPlaced(startRun({ brief: 'add a flag', repo: aRepo(), workflowDir: oneStep('harness: codex') }));
  const record = path.join(ROOT, 'runs', `${run.id}.json`);
  const unfiled = fs.readFileSync(record, 'utf8');
  assert.deepEqual((await pass(run.id)).filed, ['implement']);
  await pass(run.id);
  sign(`${run.id}-implement`, 1, SIGNED);
  await pass(run.id);
  fs.writeFileSync(record, unfiled);
  assert.deepEqual(runTasks(readRun(run.id)), [], 'the record names no task');
  const { counted } = await runWith(e, runsForgetting([run.id]));
  assert.deepEqual(counted.get(run.id)?.forgotten, [`${run.id}-implement`], 'prune counts the step adopted');
  const forgot = await runWith(e, forgetRun(run.id));
  assert.equal(forgot.kind, 'forgotten', forgot.refusal);
  assert.deepEqual(forgot.engine?.forgotten, counted.get(run.id)?.forgotten, 'what rm forgets is what prune counted');
});

test('`nemia prune` says of a run whose record does not read that it was not counted, and why, and counts the other runs', async () => {
  const run = await signed(oneStep('harness: codex'), SIGNED);
  const garbled = 'garbled-c3d4';
  const file = path.join(ROOT, 'runs', `${garbled}.json`);
  fs.writeFileSync(file, '{ not json');
  try {
    const { counted, uncounted } = await runWith(e, runsForgetting([garbled, run.id]));
    assert.deepEqual([...counted.keys()], [run.id]);
    assert.deepEqual(counted.get(run.id)?.forgotten, [`${run.id}-implement`]);
    const [line, ...others] = uncounted;
    assert.deepEqual(others, []);
    const said = `${garbled}: what nemia rm would forget of the engine's tasks of it was not counted: `;
    assert.ok(line.text.startsWith(said) && line.text.length > said.length, line.text);
  } finally {
    fs.rmSync(file);
  }
});

test('an engine that refuses to forget: `nemia rm` removes the run, exits 0 and says so, the marker kept; each pass asks again and warns; only a person removes the marker, and it says how', async (t) => {
  const run = await signed(oneStep('harness: codex'), SIGNED);
  const task = `${run.id}-implement`;
  refusing = 'forget: the store is read-only.';
  try {
    const said = await typed(t, 'rm', run.id);
    assert.equal(said.error, undefined, 'exit 0: the run is removed');
    const marker = markerOf(run.id);
    const words = `the engine refused to forget its tasks: forget: the store is read-only. ${marker} keeps their ids and the daemon asks again each pass`;
    assert.ok(said.printed[0].startsWith(`${run.id}  `) && said.printed[0].includes(words), said.printed.join('\n'));
    assert.ok(said.printed[0].endsWith(`only a person removes it, once nothing of them is wanted: rm ${marker}`), said.printed[0]);
    assert.ok(!fs.existsSync(path.join(ROOT, 'runs', `${run.id}.json`)), 'the record is gone');
    assert.deepEqual(runStore.forgetting.read(run.id), [task], 'the marker keeps its id');
    const before = forgets.length;
    const done = await runWith(e, tickRun({ repo: ROOT }));
    assert.equal(forgets.length, before + 1, 'a pass asks again');
    const [line, ...more] = done.forgetting ?? [];
    assert.deepEqual([more, line.warn], [[], true]);
    assert.ok(
      line.text.startsWith(`${run.id} (removed): the engine refused to forget its tasks: `) && line.text.endsWith(`rm ${marker}`),
      line.text,
    );
    assert.ok(fs.existsSync(marker), 'the marker stands');
  } finally {
    refusing = undefined;
  }
  await runWith(e, tickRun({ repo: ROOT }));
  assert.ok(!fs.existsSync(markerOf(run.id)) && !(await listed()).includes(task), 'once the engine forgets, a pass lifts it');
});

test('a settled task the engine refuses to forget by name is said refused, not waiting, and the rest forgotten in a second call; the marker keeps it, each pass warns and asks again, and a pass lifts it once the refusal clears', async (t) => {
  const { run, tasks } = await finished();
  const [refused, ...rest] = tasks;
  const message = `task ${refused}'s harness, \`codex\`, still holds session s-1; the next pass lets a finished session go.`;
  refusingTask = { taskId: refused, message };
  try {
    const before = forgets.length;
    const said = await typed(t, 'rm', run.id);
    assert.equal(said.error, undefined, 'exit 0: the run is removed');
    assert.deepEqual(
      forgets.slice(before),
      [
        { taskIds: tasks, yes: true },
        { taskIds: rest, yes: true },
      ],
      'all of them, then the rest',
    );
    const marker = markerOf(run.id);
    const words = `the engine refused to forget 1 task of it: ${message} ${marker} keeps their ids and the daemon asks again each pass`;
    assert.ok(said.printed[0].includes(`the engine forgot 2 tasks of it (`) && said.printed[0].includes(words), said.printed.join('\n'));
    assert.ok(said.printed[0].endsWith(`only a person removes it, once nothing of them is wanted: rm ${marker}`), said.printed[0]);
    assert.ok(!said.printed[0].includes('waits'), said.printed[0]);
    const left = await listed();
    assert.deepEqual([left.includes(refused), rest.filter((id) => left.includes(id))], [true, []], 'the rest forgotten');
    assert.deepEqual(runStore.forgetting.read(run.id), tasks, 'the marker keeps their ids');

    const done = await runWith(e, tickRun({ repo: ROOT }));
    const [line, ...more] = done.forgetting ?? [];
    assert.deepEqual([more, line?.warn], [[], true], JSON.stringify(done.forgetting));
    assert.ok(line.text.startsWith(`${run.id} (removed): ${words}`) && line.text.endsWith(`rm ${marker}`), line.text);
    assert.ok(fs.existsSync(marker), 'the marker stands');
  } finally {
    refusingTask = undefined;
  }
  const cleared = await runWith(e, tickRun({ repo: ROOT }));
  const [line] = cleared.forgetting ?? [];
  assert.match(line?.text ?? '', new RegExp(`^${run.id} \\(removed\\): the engine forgot 1 task of it \\(`));
  assert.equal(line.warn, undefined);
  assert.ok(!(await listed()).includes(refused) && !fs.existsSync(markerOf(run.id)), 'once the refusal clears, a pass lifts it');
});

test("an engine without the harness a task ran on refuses it by name: `nemia rm` says it refused, in the runtime's words, the marker kept; each pass on that engine warns of it with how a person removes the marker", async (t) => {
  const run = await signed(oneStep('harness: codex'), SIGNED);
  const task = `${run.id}-implement`;
  const said = await typedOn(t, lacking, 'rm', run.id);
  assert.equal(said.error, undefined, 'exit 0: the run is removed');
  const marker = markerOf(run.id);
  const words = `the engine refused to forget 1 task of it: task ${task} ran on the \`codex\` harness, which this engine does not have`;
  assert.ok(said.printed[0].includes(words), said.printed.join('\n'));
  assert.ok(said.printed[0].endsWith(`only a person removes it, once nothing of them is wanted: rm ${marker}`), said.printed[0]);
  assert.ok(!said.printed[0].includes('waits'), said.printed[0]);
  assert.deepEqual(runStore.forgetting.read(run.id), [task], 'the marker keeps its id');

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
