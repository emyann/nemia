/**
 * A step's task held open: a Claude Code job is filed `holdOpen`, so when it signs the runtime leaves it `input-required` with nothing
 * running. The run closes it once nothing waits on a person's word — an ungated step that signed, a gate approved, a run called off — and a
 * person's answer to it — a blocked sign-off answered, a send-back from its gate — is the task's next turn, in the session that signed,
 * under the same id. Everything else is filed as it was: rounds, `--fresh` and `--model` tries, checks.
 *
 * Walked through the runtime itself, `plainEngine` over an in-memory journal and a harness the test signs by hand, so what the run reads
 * is what the runtime says: its phase, its turns, its refusals. The engine's stand-in neither closes nor answers a task, so every walk
 * here is the runtime's own. What the run files held open is told on the stand-in in `retry.test.ts`, and what a held task reads of its
 * current turn is pure, in `assess-retries.test.ts`.
 *
 * `WF_ROOT` is set before the runner is imported: it is read as the module loads. `WF_VERIFY_REST` judges in full every run a pass answers
 * from its memo of runs at rest as well, and throws on a difference (`verifyRest` in tick.verb.ts).
 */
import { mock, test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { nameFor, type Sighting, type SpawnRequest, type TaskView, Engine as EngineService } from 'agent-runtime';
import { asyncStore, type AsyncJournal, asyncOps, type AsyncRunner } from './promised.ts';
import type { Engine } from '../src/runtime-client.ts';
import { scratch } from './scratch.ts';
import { Effect } from 'effect';
import { plainEngine } from './promised.ts';
import { testPlace } from '../place/memory/index.ts';
import { eachTest, runGiven, runOver } from './placed.ts';

const ROOT = scratch('wf-held-');
fs.mkdirSync(path.join(ROOT, 'runs'), { recursive: true });

process.env.WF_ROOT = ROOT;
process.env.WF_VERIFY_REST = '1';
const {
  advanceRun,
  approveRun,
  cancelRun,
  decideRun,
  forgetRun,
  list,
  retryRun,
  startRun,
  runWith: runEngine,
} = await import('../src/runner.ts');
const stand = eachTest(testPlace);
const runWith = runOver(runEngine, () => stand().layer);
const runPlaced = runGiven(() => stand().layer);
const { artifactsDir, readAsks, readRun } = await import('../src/record/record.store.ts');
const { phaseOfView } = await import('../src/views/views-words.ts');
const { lackedOf } = await import('../src/record/record.ts');

/** A repository with one commit, so `nemia start` has a base to record. */
const aRepo = (): string => {
  const repo = fs.mkdtempSync(path.join(ROOT, 'repo-'));
  stand().world.repository(repo, {});
  return repo;
};

/** A workflow folder of `plan → implement`, each step with the frontmatter lines it is given. */
const folder = (keys: { plan?: string; implement?: string } = {}) => {
  const dir = fs.mkdtempSync(path.join(ROOT, 'wf-'));
  const write = (name: string, after: string | null, lines = '') => {
    const front = [...(after ? [`after: ${after}`] : []), 'place: git', ...(lines ? [lines] : [])];
    fs.writeFileSync(path.join(dir, `${name}.md`), `---\n${front.join('\n')}\n---\n${name} it\n`);
  };
  write('plan', null, keys.plan);
  write('implement', 'plan', keys.implement);
  return dir;
};

/** The engine's store, in memory, as its own tests keep one, noting in `starts` when each attempt began, by its session's name. */
const memoryJournal = (starts: Map<string, number>): AsyncJournal => {
  const tasks = new Map<string, Parameters<AsyncJournal['append']>[1][]>();
  const feed: Awaited<ReturnType<AsyncJournal['feed']>>['entries'] = [];
  return {
    async append(taskId, event) {
      tasks.set(taskId, [...(tasks.get(taskId) ?? []), event]);
      feed.push({ taskId, event });
      if (event.kind === 'starting') starts.set(nameFor(taskId, event.attempt), Date.parse(event.at));
    },
    async read(taskId) {
      return [...(tasks.get(taskId) ?? [])];
    },
    async list() {
      return [...tasks.keys()].sort();
    },
    async feed(after) {
      return { entries: feed.slice(after), cursor: feed.length };
    },
  };
};

const SIGNED = { outcome: 'done', summary: 'the plan: parse the flag, then store it', artifacts: [], needs: null };
const BLOCKED = { outcome: 'blocked', summary: 'two flags could be meant', artifacts: [], needs: 'which flag: --dry-run or --force?' };

/**
 * The runtime, with a harness the test signs by hand: every session it is asked to start works until `sign` ends attempt `n` of a task with
 * a closeout, stamped a millisecond after the journal says the attempt began, and with what it cost, as a job prints it; each has
 * its own native id (`native-<n>`), so a turn that continues one says which. A session ends in a harness's own words (`done`,
 * `stopped`), as a runner written in Promises may still report them: the runtime reads them as A2A's. A name in `refusing` is a spawn the
 * harness refuses, as it refuses a start that ran nothing: the attempt ends `unstartable`. A check's harness keeps streams, as the
 * runtime's command harness does, and none was printed. `pass` is what the daemon does: the engine's tick, then the run's.
 */
const engine = () => {
  const sessions = new Map<string, Sighting>();
  const spawned: SpawnRequest[] = [];
  const refusing = new Set<string>();
  const starts = new Map<string, number>();
  const runner: AsyncRunner = {
    async spawn(r) {
      if (refusing.has(r.name)) throw Object.assign(new Error(`${r.name}: refused`), { refused: true });
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
  const e = plainEngine(
    EngineService.layer({
      root: fs.mkdtempSync(path.join(ROOT, 'engine-')),
      journal: asyncStore(memoryJournal(starts)),
      harnesses: { claude: asyncOps(runner), codex: asyncOps(runner), check: asyncOps({ ...runner, output: async () => undefined }) },
      defaultHarness: 'claude',
    }),
  );
  const sign = (taskId: string, n: number, closeout: object, usage?: Sighting['usage']) => {
    const name = nameFor(taskId, n);
    assert.ok(sessions.has(name), `${name} was never started: ${[...sessions.keys()].join(', ')}`);
    sessions.set(name, {
      ...sessions.get(name)!,
      state: 'completed',
      busy: false,
      closeout: { payload: closeout, at: starts.get(name)! + 1 },
      ...(usage ? { usage } : {}),
    });
  };
  const pass = async (id: string) => {
    await Effect.runPromise(e.tick());
    return runWith(e, advanceRun(readRun(id)));
  };
  return { e, sign, pass, spawned, sessions, refusing };
};

/** Each step's line on `nemia ls`, by name. */
const statuses = async (e: Engine, id: string): Promise<Record<string, string>> =>
  Object.fromEntries((await runWith(e, list(e, readRun(id)))).steps.map((s) => [s.name, s.status]));

/** What the runtime holds of a task. */
const stateOf = async (e: Engine, taskId: string): Promise<TaskView> => Effect.runPromise(e.view(taskId));

/**
 * A run of `folder(keys)` started in a fresh repository, its plan filed and started, and signed with `closeout`: where each test begins.
 */
const signedPlan = async (keys: Parameters<typeof folder>[0], closeout: object, gates?: string[], usage?: Sighting['usage']) => {
  const run = await runPlaced(
    startRun({ brief: 'add a flag', repo: aRepo(), workflowDir: folder(keys), isolate: false, ...(gates ? { gates } : {}) }),
  );
  const h = engine();
  assert.deepEqual((await h.pass(run.id)).filed, ['plan']);
  await h.pass(run.id);
  h.sign(`${run.id}-plan`, 1, closeout, usage);
  const signed = await h.pass(run.id);
  return { run, ...h, signed };
};

test('an ungated step that signed off is closed on the pass that reads it waiting, and what waits on it is filed on that same pass', async () => {
  const { run, e, signed, pass } = await signedPlan({}, SIGNED);
  assert.equal((await stateOf(e, `${run.id}-plan`)).state.closed, true, 'closed');
  assert.deepEqual(signed.filed, ['implement'], 'and implement filed beside the close, not a pass later');
  await pass(run.id);
  const settled = await stateOf(e, `${run.id}-plan`);
  assert.deepEqual([settled.phase, settled.state.settled], ['succeeded', 'succeeded'], 'the engine settles it as it signed');
  assert.equal(readRun(run.id).steps.plan.taskId, `${run.id}-plan`);
});

test("a step that signed off blocked stays open, and a person's answer — `nemia retry --message` — is its next turn: the same task, in the session that signed, nothing filed", async () => {
  const { run, e, signed, pass, spawned, sign } = await signedPlan({}, BLOCKED);
  const plan = `${run.id}-plan`;
  assert.deepEqual(signed.filed, []);
  assert.equal((await stateOf(e, plan)).phase, 'input-required', 'held open: it waits, and nothing runs');
  assert.equal((await stateOf(e, plan)).state.closed, false, 'not closed');
  const listed = await runWith(e, list(e, readRun(run.id)));
  assert.equal(
    listed.steps.find((s) => s.name === 'plan')!.status,
    'input-required · BLOCKED',
    "the engine's word, and the run's beside it",
  );
  assert.deepEqual(listed.waitingOnYou, ['plan']);

  await runWith(e, retryRun(run.id, 'plan', { mode: 'continue', message: 'the --dry-run flag' }));
  const answered = await pass(run.id);
  assert.deepEqual(answered.tried, ['plan']);
  assert.deepEqual(answered.filed, []);
  const view = await stateOf(e, plan);
  assert.equal(view.state.inputs.length, 1, 'answered, once');
  assert.match(view.state.inputs[0].text, /the --dry-run flag/, "the person's words, in the turn's brief");
  assert.match(view.state.inputs[0].text, /This is the last try's session, continued/, 'the brief of a nudge that continues the session');
  const record = readRun(run.id).steps.plan;
  assert.equal(record.taskId, plan, 'the same task');
  assert.deepEqual(
    record.tries?.map((t) => [t.taskId, t.cause]),
    [[plan, 'continue']],
    'the try it was, behind it',
  );
  assert.deepEqual(readAsks(run.id).asks, [], 'the ask is consumed');
  assert.equal((await Effect.runPromise(e.view(`${run.id}-plan-try2`))).state.brief, '', 'no -try2 task');

  await pass(run.id);
  assert.equal(spawned.at(-1)!.name, nameFor(plan, 2), 'its next attempt');
  assert.equal(spawned.at(-1)!.resumeFrom, 'native-1', 'continuing the session that signed blocked');
  sign(plan, 2, SIGNED);
  const next = await pass(run.id);
  assert.deepEqual(next.filed, ['implement'], 'signed done on its second turn: closed, and what waits on it filed');
  assert.equal((await stateOf(e, plan)).state.closed, true);
});

test('an answer carries what is left of the cap in force; over it, the task stays open, and a `--budget` answer carries what is left of the cap raised', async () => {
  const under = await signedPlan({ plan: 'budget: 4' }, BLOCKED, undefined, { costUsd: 1.5 });
  await runWith(under.e, retryRun(under.run.id, 'plan', { mode: 'continue', message: 'the --dry-run flag' }));
  await under.pass(under.run.id);
  assert.equal(
    (await stateOf(under.e, `${under.run.id}-plan`)).state.inputs[0].config?.budgetUsd,
    2.5,
    '$4 less the $1.50 its first turn cost',
  );

  const { run, e, pass } = await signedPlan({ plan: 'budget: 4' }, BLOCKED, undefined, { costUsd: 5 });
  assert.match((await statuses(e, run.id)).plan, /^over budget \$5\.00 of \$4/);
  await pass(run.id);
  assert.equal(
    (await stateOf(e, `${run.id}-plan`)).phase,
    'input-required',
    'a blocked step over its budget waits for a person all the same',
  );
  await runWith(e, retryRun(run.id, 'plan', { mode: 'continue', message: 'the --dry-run flag', budget: 6 }));
  assert.deepEqual((await pass(run.id)).tried, ['plan']);
  assert.equal((await stateOf(e, `${run.id}-plan`)).state.inputs[0].config?.budgetUsd, 1, '$6 less the $5 spent');
});

test('a try of a waiting step that is not an answer — `--fresh`, `--model` — closes the task, and files a task of its own as every try was', async () => {
  const { run, e, pass } = await signedPlan({}, BLOCKED);
  await runWith(e, retryRun(run.id, 'plan', { mode: 'fresh', message: 'start again from the README' }));
  const tried = await pass(run.id);
  assert.deepEqual(tried.tried, ['plan']);
  const old = await stateOf(e, `${run.id}-plan`);
  assert.deepEqual([old.state.closed, old.state.inputs.length], [true, 0], 'closed, never answered');
  const fresh = await stateOf(e, `${run.id}-plan-try2`);
  assert.match(fresh.state.brief, /start again from the README/);
  assert.equal(fresh.state.resumeFrom, undefined, 'a new session');
  assert.equal(fresh.state.holdOpen, true, 'itself held open');
  assert.equal(readRun(run.id).steps.plan.taskId, `${run.id}-plan-try2`);
});

test("a held task whose job ended `done` with no statement (`closedOut: false`) waits as the runtime holds any `done` open, reads `unsigned`, and is closed: the run's sign-off nudge is a `-try2` task, never an answer to it — gated or not", async () => {
  for (const keys of [{}, { plan: 'gate: true' }]) {
    const run = await runPlaced(startRun({ brief: 'add a flag', repo: aRepo(), workflowDir: folder(keys), isolate: false }));
    const { e, pass, sessions } = engine();
    const plan = `${run.id}-plan`;
    await pass(run.id);
    await pass(run.id);
    sessions.set(nameFor(plan, 1), { ...sessions.get(nameFor(plan, 1))!, state: 'completed', busy: false });
    await Effect.runPromise(e.tick());
    const waiting = await stateOf(e, plan);
    assert.deepEqual(
      [waiting.phase, waiting.state.attempts.at(-1)?.closedOut],
      ['input-required', false],
      `${JSON.stringify(keys)}: the job ended done with no closeout, so no statement, and the runtime holds it open all the same`,
    );
    assert.equal((await statuses(e, run.id)).plan, 'unsigned', `${JSON.stringify(keys)}: the run's word, not the engine's`);

    const nudged = await runWith(e, advanceRun(readRun(run.id)));
    assert.deepEqual(nudged.tried, ['plan'], `${JSON.stringify(keys)}: the sign-off nudge`);
    const old = await stateOf(e, plan);
    assert.deepEqual([old.state.closed, old.state.inputs.length], [true, 0], `${JSON.stringify(keys)}: closed, never answered`);
    const next = await stateOf(e, `${plan}-try2`);
    assert.match(next.state.brief, /StructuredOutput/, `${JSON.stringify(keys)}: filed as a task of its own, told to sign off`);
    assert.equal(next.state.resumeFrom, 'native-1', `${JSON.stringify(keys)}: continuing the session that ended`);
    assert.equal(readRun(run.id).steps.plan.taskId, `${plan}-try2`);
  }
});

test('a pass that answered and died before writing the run down is adopted: the turn is the try it is, nothing is stopped and nothing is filed again', async () => {
  const { run, e, pass } = await signedPlan({}, BLOCKED);
  const plan = `${run.id}-plan`;
  await runWith(e, retryRun(run.id, 'plan', { mode: 'continue', message: 'the --dry-run flag' }));
  await Effect.runPromise(e.answer(plan, 'the --dry-run flag'));
  await Effect.runPromise(e.tick());
  assert.equal((await stateOf(e, plan)).phase, 'working', 'what the pass did before it died: the answer, and nothing on the record');
  const adopted = await runWith(e, advanceRun(readRun(run.id)));
  assert.deepEqual([adopted.tried, adopted.filed], [[], []]);
  const view = await stateOf(e, plan);
  assert.deepEqual([view.state.inputs.length, view.state.stopRequested], [1, false], 'answered once, and not asked to stop');
  assert.deepEqual(
    readRun(run.id).steps.plan.tries?.map((t) => t.taskId),
    [plan],
    'written down as the turn it was',
  );
  assert.deepEqual(readAsks(run.id).asks, [], 'and the ask consumed');
  await pass(run.id);
  assert.equal((await stateOf(e, plan)).state.inputs.length, 1, 'never answered twice');
});

/**
 * A plan that signed off blocked and was answered: the answer's turn is attempt 2 of the same task, filed to continue `native-1`, the
 * session that asked. The runtime makes one attempt at a turn, so each end below settles the task `failed`; what follows is the
 * orchestrator's, a try of its own.
 */
const answeredTurn = async () => {
  const h = await signedPlan({}, BLOCKED);
  const plan = `${h.run.id}-plan`;
  await runWith(h.e, retryRun(h.run.id, 'plan', { mode: 'continue', message: 'the --dry-run flag' }));
  assert.deepEqual((await h.pass(h.run.id)).tried, ['plan'], 'answered');
  return { ...h, plan, turn: nameFor(plan, 2) };
};

/**
 * What every end of the turn but a sign-off leaves: the task settled `failed` and the step read `failed`, nothing tried again on its own,
 * and a person's `nemia retry --message` filed as a task of its own — `-try3`, the answered turn being try 2 — and the settled task never
 * answered again, continuing `from`.
 */
const triedAgain = async (h: Awaited<ReturnType<typeof answeredTurn>>, from: string, end: string) => {
  const { run, e, pass, plan, spawned } = h;
  const settled = await stateOf(e, plan);
  assert.deepEqual([settled.phase, settled.state.settled], ['failed', 'failed'], `${end}: one attempt at the turn, and the task settled`);
  assert.equal(settled.state.attempts.length, 2, `${end}: nothing tried again inside the task`);
  assert.equal((await statuses(e, run.id)).plan, 'failed', `${end}: the step reads failed`);
  const idle = await pass(run.id);
  assert.deepEqual([idle.tried, idle.filed], [[], []], `${end}: nothing filed until a person says`);
  const decided = await runWith(e, decideRun(run.id));
  assert.deepEqual(
    decided.decision.kind === 'awaiting' && [decided.decision.outcome, decided.decision.failed],
    ['failed', ['plan']],
    `${end}: the run failed, as any failed step fails it`,
  );
  assert.match(decided.offers.join('\n'), /nemia retry \S+ plan/, `${end}: and \`nemia decide\` offers the retry`);

  await runWith(e, retryRun(run.id, 'plan', { mode: 'continue', message: 'the --dry-run flag, again' }));
  assert.deepEqual((await pass(run.id)).tried, ['plan'], `${end}: the nudge`);
  assert.equal((await stateOf(e, plan)).state.inputs.length, 1, `${end}: the settled task is not answered again`);
  const next = await stateOf(e, `${plan}-try3`);
  assert.match(next.state.brief, /the --dry-run flag, again/, `${end}: a task of its own, with the answer in its brief`);
  assert.equal(next.state.holdOpen, true, `${end}: held open itself`);
  assert.equal(next.state.resumeFrom, from, `${end}: continuing ${from}`);
  assert.equal(readRun(run.id).steps.plan.taskId, `${plan}-try3`, `${end}: the step's try now`);
  await pass(run.id);
  assert.deepEqual(
    [spawned.at(-1)!.name, spawned.at(-1)!.resumeFrom],
    [nameFor(`${plan}-try3`, 1), from],
    `${end}: started, continuing ${from}`,
  );
};

test("an answer's turn that FAILED settles its task failed, and a `nemia retry --message` is a `-tryN` task continuing the session that failed", async () => {
  const h = await answeredTurn();
  await h.pass(h.run.id);
  assert.deepEqual(
    [h.spawned.at(-1)!.name, h.spawned.at(-1)!.resumeFrom],
    [h.turn, 'native-1'],
    'the turn, continuing the session that asked',
  );
  h.sessions.set(h.turn, { ...h.sessions.get(h.turn)!, state: 'failed', busy: false });
  await h.pass(h.run.id);
  assert.equal((await stateOf(h.e, h.plan)).state.attempts.at(-1)!.nativeId, 'native-2');
  await triedAgain(h, 'native-2', 'failed');
});

test("an answer's turn that was LOST settles its task failed, and a `nemia retry --message` is a `-tryN` task continuing the session that asked, since the lost one was never named", async () => {
  const h = await answeredTurn();
  await h.pass(h.run.id);
  assert.equal(h.spawned.at(-1)!.name, h.turn);
  h.sessions.delete(h.turn);
  const read = process.hrtime.bigint.bind(process.hrtime);
  mock.timers.enable({ apis: ['Date'], now: Date.now() + 10 * 60_000 });
  const later = mock.method(process.hrtime, 'bigint', () => read() + 10n * 60_000_000_000n);
  try {
    await h.pass(h.run.id);
  } finally {
    mock.timers.reset();
    later.mock.restore();
  }
  const last = (await stateOf(h.e, h.plan)).state.attempts.at(-1)!;
  assert.deepEqual(
    [last.reason, last.nativeId, last.resumeFrom],
    ['lost', null, 'native-1'],
    "lost past the runtime's grace for a session its harness never reports (30 s), with no id of its own",
  );
  await triedAgain(h, 'native-1', 'lost');
});

test("an answer's turn that COULD NOT START settles its task failed, and a `nemia retry --message` is a `-tryN` task continuing the session that asked", async () => {
  const h = await answeredTurn();
  h.refusing.add(h.turn);
  await h.pass(h.run.id);
  assert.notEqual(h.spawned.at(-1)!.name, h.turn, 'never started');
  const last = (await stateOf(h.e, h.plan)).state.attempts.at(-1)!;
  assert.deepEqual(
    [last.n, last.reason, last.nativeId, last.resumeFrom],
    [2, 'unstartable', null, 'native-1'],
    'refused, with the session it was to continue',
  );
  await triedAgain(h, 'native-1', 'unstartable');
});

test('a gated step that signed stays open until `nemia approve`, and is closed on the pass that files what waits on it', async () => {
  const { run, e, signed, pass } = await signedPlan({ plan: 'gate: true' }, SIGNED);
  assert.deepEqual(signed.filed, []);
  assert.equal((await statuses(e, run.id)).plan, 'awaiting approval');
  assert.equal((await stateOf(e, `${run.id}-plan`)).phase, 'input-required');
  await pass(run.id);
  assert.equal((await stateOf(e, `${run.id}-plan`)).state.closed, false, 'pass after pass, until a person says');

  await runWith(e, approveRun(run.id, 'plan'));
  const approved = await pass(run.id);
  assert.deepEqual(approved.filed, ['implement']);
  assert.equal((await stateOf(e, `${run.id}-plan`)).state.closed, true);
});

test('a gated step closed on its approval reads on `nemia ls` as it signed, in the pass before the engine settles it — as the tick, which filed what follows, reads it', async () => {
  const { run, e, pass } = await signedPlan({ plan: 'gate: true' }, SIGNED);
  const plan = `${run.id}-plan`;
  await runWith(e, approveRun(run.id, 'plan'));
  assert.deepEqual((await pass(run.id)).filed, ['implement']);
  const closed = await stateOf(e, plan);
  assert.deepEqual(
    [closed.phase, closed.state.closed, closed.state.settled],
    ['between-attempts', true, null],
    'the seed: closed, and the engine has not settled it yet',
  );
  assert.equal(phaseOfView(closed), 'succeeded');
  const between = (await statuses(e, run.id)).plan;
  await Effect.runPromise(e.tick());
  assert.equal((await stateOf(e, plan)).state.settled, 'succeeded');
  assert.equal(between, (await statuses(e, run.id)).plan, 'the same line before the engine settles it and after');
  assert.doesNotMatch(between, /between-attempts|running/);
  const listed = await runWith(e, list(e, readRun(run.id)));
  assert.deepEqual(listed.waitingOnYou, []);
});

test('a gated step stays open while its check runs, so a send-back once the check passes is still an answer to it', async () => {
  const { run, e, signed, pass, sessions } = await signedPlan({ plan: 'gate: true\ncheck: true' }, SIGNED);
  const plan = `${run.id}-plan`;
  assert.deepEqual(signed.checked, ['plan']);
  assert.equal((await statuses(e, run.id)).plan, 'checking');
  await pass(run.id);
  assert.equal((await stateOf(e, plan)).state.closed, false, 'not closed while the check that decides whether it reaches its gate runs');

  const check = nameFor(`${plan}-check`, 1);
  sessions.set(check, { ...sessions.get(check)!, state: 'completed', busy: false, exitCode: 0 });
  await pass(run.id);
  assert.equal((await statuses(e, run.id)).plan, 'awaiting approval');
  await runWith(e, retryRun(run.id, 'plan', { mode: 'continue', message: 'smaller steps, please' }));
  const sent = await pass(run.id);
  assert.deepEqual([sent.tried, sent.filed], [['plan'], []]);
  assert.equal((await stateOf(e, plan)).state.inputs.length, 1, 'answered, in the session that signed');
});

test("a send-back from a gate — `nemia retry --message` on a signed gated step — is an answer to its task, and the next turn's sign-off waits for an approval of its own", async () => {
  const { run, e, pass, sign } = await signedPlan({}, SIGNED, ['plan']);
  const plan = `${run.id}-plan`;
  await runWith(e, retryRun(run.id, 'plan', { mode: 'continue', message: 'smaller steps, please' }));
  const sent = await pass(run.id);
  assert.deepEqual([sent.tried, sent.filed], [['plan'], []]);
  assert.match((await stateOf(e, plan)).state.inputs[0].text, /smaller steps, please/);
  await pass(run.id);
  sign(plan, 2, { ...SIGNED, summary: 'the plan, in smaller steps' });
  const again = await pass(run.id);
  assert.deepEqual(again.filed, [], 'its second turn waits at the gate too');
  assert.equal((await statuses(e, run.id)).plan, 'awaiting approval');
  assert.equal((await stateOf(e, plan)).phase, 'input-required');
  assert.equal(
    (await runWith(e, decideRun(run.id))).closeouts.plan && 'summary' in (await runWith(e, decideRun(run.id))).closeouts.plan!
      ? ((await runWith(e, decideRun(run.id))).closeouts.plan as { summary: string }).summary
      : undefined,
    'the plan, in smaller steps',
    "what is to be approved is the second turn's sign-off",
  );

  await runWith(e, approveRun(run.id, 'plan'));
  assert.equal(readRun(run.id).steps.plan.tries?.length, 1);
  assert.deepEqual((await pass(run.id)).filed, ['implement']);
  assert.equal((await stateOf(e, plan)).state.closed, true);
});

test('`nemia cancel` closes a task that waits for a word — nothing runs, so nothing is stopped — and a cancelled run closes one the verb did not', async () => {
  const { run, e, pass } = await signedPlan({ plan: 'gate: true' }, SIGNED);
  const { plan } = await runWith(e, cancelRun(run.id));
  assert.deepEqual(plan.kind === 'cancel' ? plan.stop : plan, []);
  const view = await stateOf(e, `${run.id}-plan`);
  assert.deepEqual([view.state.closed, view.state.stopRequested], [true, false]);
  await pass(run.id);
  assert.equal((await stateOf(e, `${run.id}-plan`)).state.settled, 'succeeded', 'settled as it signed');

  const other = await signedPlan({}, SIGNED, ['plan']);
  fs.writeFileSync(path.join(ROOT, 'runs', `${other.run.id}.cancelled`), `${new Date().toISOString()}\n`);
  await other.pass(other.run.id);
  assert.equal(
    (await stateOf(other.e, `${other.run.id}-plan`)).state.closed,
    true,
    "a run marked cancelled without the verb, the mark written by hand or the verb's close refused: the pass closes it",
  );
});

test('`nemia cancel` calls off a run whose step signed off blocked, with no gate: it writes the mark, closes the task without stopping it, and nothing waits on you', async () => {
  const { run, e } = await signedPlan({}, BLOCKED);
  assert.deepEqual((await runWith(e, list(e, readRun(run.id)))).waitingOnYou, ['plan']);
  const before = readRun(run.id).steps;
  const { plan } = await runWith(e, cancelRun(run.id));
  assert.deepEqual(plan, { kind: 'cancel', stop: [] }, 'a blocked run is not finished: a person is asked of it');
  const view = await stateOf(e, `${run.id}-plan`);
  assert.deepEqual([view.state.closed, view.state.stopRequested], [true, false]);
  assert.ok(readRun(run.id).cancelledAt);
  assert.deepEqual(readRun(run.id).steps, before, "the record's steps stand as they were");
  assert.deepEqual((await runWith(e, list(e, readRun(run.id)))).waitingOnYou, []);
  assert.equal((await runWith(e, decideRun(run.id))).decision.kind, 'cancelled');
});

test('`nemia cancel` reads a closeout that does not read as the run does: an unsigned step waiting on you, so the run is called off', async () => {
  const { run, e } = await signedPlan({}, ['not a closeout']);
  assert.deepEqual(await statuses(e, run.id), { plan: 'unsigned · closeout unreadable', implement: 'pending' });
  assert.deepEqual((await runWith(e, list(e, readRun(run.id)))).waitingOnYou, ['plan']);
  const { plan } = await runWith(e, cancelRun(run.id));
  assert.deepEqual(plan, { kind: 'cancel', stop: [] });
  assert.ok(readRun(run.id).cancelledAt);
});

test('`nemia rm` of a run whose step waits for a word closes its task: no pass reads the run again to close it', async () => {
  const { run, e } = await signedPlan({}, BLOCKED);
  const forgot = await runWith(e, forgetRun(run.id));
  assert.equal(forgot.kind, 'forgotten', forgot.refusal);
  assert.equal((await stateOf(e, `${run.id}-plan`)).state.closed, true);
});

test("REFUSED by the engine: a close it will not journal is said on the pass, in the engine's words, and asked again by the next", async () => {
  const { run, e, pass } = await signedPlan({}, BLOCKED);
  await runWith(e, retryRun(run.id, 'plan', { mode: 'fresh' }));
  const real = e.close.bind(e);
  let refusedOnce = false;
  Object.assign(e, {
    close: (taskId: string) =>
      Effect.gen(function* () {
        if (!refusedOnce) {
          refusedOnce = true;
          yield* e.answer(taskId, 'said elsewhere');
        }
        return yield* real(taskId);
      }),
  });
  const refused = await pass(run.id);
  assert.deepEqual(refused.tried, [], 'answered between read and close: nothing filed over it');
  assert.ok(
    refused.notes.some((n) => /^plan: close: `.*-plan` has been answered already/.test(n)),
    refused.notes.join('\n'),
  );
  assert.equal((await Effect.runPromise(e.view(`${run.id}-plan-try2`))).state.brief, '');
});

test('a run whose tasks were filed before tasks were held open is worked as it was: its gate settled at the sign-off, and a send-back is a `-try2` task', async () => {
  const run = await runPlaced(
    startRun({ brief: 'add a flag', repo: aRepo(), workflowDir: folder({ plan: 'gate: true' }), isolate: false }),
  );
  const h = engine();
  const file = h.e.file.bind(h.e);
  Object.assign(h.e, {
    file: (spec: Parameters<Engine['file']>[0]) => {
      const { holdOpen: _, ...old } = spec;
      return file(old);
    },
  });
  await h.pass(run.id);
  await h.pass(run.id);
  h.sign(`${run.id}-plan`, 1, SIGNED);
  const signed = await h.pass(run.id);
  assert.equal(
    (await stateOf(h.e, `${run.id}-plan`)).state.settled,
    'succeeded',
    "the run's filings as they were, nothing held open: its gate settled at the sign-off",
  );
  assert.deepEqual([signed.filed, (await statuses(h.e, run.id)).plan], [[], 'awaiting approval']);
  await runWith(h.e, retryRun(run.id, 'plan', { mode: 'continue', message: 'smaller steps, please' }));
  assert.deepEqual((await h.pass(run.id)).tried, ['plan']);
  const sent = await stateOf(h.e, `${run.id}-plan-try2`);
  assert.match(sent.state.brief, /smaller steps, please/);
  assert.equal(sent.state.resumeFrom, 'native-1');
});

test('the files a task held open named are read once: one removed after its closeout was accepted, under its check or at its gate, unsigns nothing', async () => {
  for (const [check, gates] of [['check: true'], ['check: true', ['plan']], [undefined, ['plan']]] as const) {
    const how = `${check ? 'checked' : 'no check'}, ${gates ? 'gated' : 'ungated'}`;
    const workflowDir = folder(check ? { plan: check } : {});
    const run = await runPlaced(
      startRun({ brief: 'add a flag', repo: aRepo(), workflowDir, isolate: false, ...(gates ? { gates: [...gates] } : {}) }),
    );
    const { e, pass, sign } = engine();
    await pass(run.id);
    await pass(run.id);
    const shot = path.join(artifactsDir(run, 'plan'), 'shot.png');
    fs.mkdirSync(path.dirname(shot), { recursive: true });
    fs.writeFileSync(shot, 'png');
    sign(`${run.id}-plan`, 1, { ...SIGNED, artifacts: [shot] });
    assert.deepEqual((await pass(run.id)).checked, check ? ['plan'] : [], `${how}: its closeout is accepted`);
    assert.equal((await stateOf(e, `${run.id}-plan`)).state.settled, null, `${how}: held open, and not settled as the next pass reads it`);

    fs.rmSync(shot);
    for (let n = 0; n < 3; n++) {
      assert.deepEqual((await pass(run.id)).tried, [], `${how}: no nudge for a file gone since`);
      assert.deepEqual(lackedOf(readRun(run.id).steps.plan), [], `${how}: and nothing is kept as lacked`);
      assert.doesNotMatch((await statuses(e, run.id)).plan, /unsigned/, how);
    }
  }
});
