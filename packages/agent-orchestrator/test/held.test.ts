/**
 * A step's task held open (thin runtime stage 2 part 4b): a Claude Code job is filed `holdOpen`, so when it signs the runtime leaves it
 * `input-required` with nothing running. The run closes it once nothing waits on a person's word — an ungated step that signed, a gate
 * approved, a run called off — and a person's answer to it — a blocked sign-off answered, a send-back from its gate — is the task's next turn,
 * in the session that signed, under the same id. Everything else is filed as it was: rounds, `--fresh` and `--model` tries, checks.
 *
 * Walked through the runtime itself, `createEngine` over an in-memory journal and a harness the test signs by hand, so what the run reads is
 * what the runtime says: its phase, its turns, its refusals. What `holdsOpen` judges is pure, and lives in run.test.ts.
 */
import { mock, test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import {
  createEngine,
  nameFor,
  type Engine,
  type PromiseJournal,
  type PromiseRunner,
  type PromiseSighting,
  type Sighting,
  type SpawnRequest,
  type TaskView,
} from 'agent-runtime';
import { scratch } from './scratch.ts';

const ROOT = scratch('wf-held-');
fs.mkdirSync(path.join(ROOT, 'runs'), { recursive: true });

// WF_ROOT is read as the module loads, so it is set before the import rather than after it.
process.env.WF_ROOT = ROOT;
// Every run a pass answers from its memo of runs at rest is judged in full as well, and a difference throws (`verifyRest` in tick.ts).
process.env.WF_VERIFY_REST = '1';
const { advance, approve, cancel, decide, forget, list, readAsks, readRun, retry, start } = await import('../src/runner.ts');
const { closeoutAsked, closeoutOf, deniedOf, phaseOfView } = await import('../src/views.ts');

/** A repository with one commit, so `wf start` has a base to record. */
const aRepo = (): string => {
  const repo = fs.mkdtempSync(path.join(ROOT, 'repo-'));
  const git = (...args: string[]) =>
    execFileSync('git', ['-c', 'user.email=t@t', '-c', 'user.name=t', ...args], { cwd: repo, stdio: 'ignore' });
  git('init', '-q');
  git('commit', '-q', '--allow-empty', '-m', 'base');
  return repo;
};

/** A workflow folder of `plan → implement`, each step with the frontmatter lines it is given. */
const folder = (keys: { plan?: string; implement?: string } = {}) => {
  const dir = fs.mkdtempSync(path.join(ROOT, 'wf-'));
  const write = (name: string, after: string | null, lines = '') => {
    const front = [...(after ? [`after: ${after}`] : []), ...(lines ? [lines] : [])];
    fs.writeFileSync(path.join(dir, `${name}.md`), `${front.length ? `---\n${front.join('\n')}\n---\n` : ''}${name} it\n`);
  };
  write('plan', null, keys.plan);
  write('implement', 'plan', keys.implement);
  return dir;
};

/** The engine's store, in memory, as its own tests keep one. */
const memoryJournal = (): PromiseJournal => {
  const tasks = new Map<string, Parameters<PromiseJournal['append']>[1][]>();
  const feed: Awaited<ReturnType<PromiseJournal['feed']>>['entries'] = [];
  return {
    async append(taskId, event) {
      tasks.set(taskId, [...(tasks.get(taskId) ?? []), event]);
      feed.push({ taskId, event });
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
 * The runtime, with a harness the test signs by hand: every session it is asked to start works until `sign` ends it with a closeout, and
 * each has its own native id (`native-<n>`), so a turn that continues one says which. `pass` is what the daemon does: the engine's tick, then
 * the run's.
 */
const engine = () => {
  // A harness's own words (`done`, `stopped`), as a runner written in Promises may still report them: the runtime reads them as A2A's.
  const sessions = new Map<string, PromiseSighting>();
  const spawned: SpawnRequest[] = [];
  /** Names whose spawn the harness refuses, as it refuses a start that ran nothing: the attempt ends `unstartable`. */
  const refusing = new Set<string>();
  const runner: PromiseRunner = {
    async spawn(r) {
      if (refusing.has(r.name)) throw Object.assign(new Error(`${r.name}: refused`), { refused: true });
      spawned.push(r);
      sessions.set(r.name, { sessionId: `s-${spawned.length}`, nativeId: `native-${spawned.length}`, state: 'working', busy: true });
    },
    async observe() {
      return new Map(sessions);
    },
    async stop(id) {
      for (const [name, s] of sessions) if (s.sessionId === id) sessions.set(name, { ...s, state: 'stopped', busy: false });
    },
    async logs() {
      return '';
    },
  };
  const e = createEngine({
    root: fs.mkdtempSync(path.join(ROOT, 'engine-')),
    journal: memoryJournal(),
    harnesses: { claude: runner, codex: runner, check: runner },
    defaultHarness: 'claude',
  });
  /** End attempt `n` of `taskId` signed with `closeout`, and with what it cost, as `claude -p` prints it. */
  const sign = (taskId: string, n: number, closeout: object, usage?: Sighting['usage']) => {
    const name = nameFor(taskId, n);
    assert.ok(sessions.has(name), `${name} was never started: ${[...sessions.keys()].join(', ')}`);
    sessions.set(name, {
      ...sessions.get(name)!,
      state: 'done',
      busy: false,
      closeout: { payload: closeout, at: Date.now() + 60_000 },
      ...(usage ? { usage } : {}),
    });
  };
  const pass = async (id: string) => {
    await e.tick();
    return advance(e, readRun(id));
  };
  return { e, sign, pass, spawned, sessions, refusing };
};

/** Each step's line on `wf ls`, by name. */
const statuses = async (e: Engine, id: string): Promise<Record<string, string>> =>
  Object.fromEntries((await list(e, readRun(id))).steps.map((s) => [s.name, s.status]));

/** What the runtime holds of a task. */
const stateOf = async (e: Engine, taskId: string): Promise<TaskView> => e.view(taskId);

/** A run of `folder(keys)` started in a fresh repository, its plan filed and started, and signed with `closeout`: where each test begins. */
const signedPlan = async (keys: Parameters<typeof folder>[0], closeout: object, gates?: string[], usage?: Sighting['usage']) => {
  const run = start({ brief: 'add a flag', repo: aRepo(), workflowDir: folder(keys), isolate: false, ...(gates ? { gates } : {}) });
  const h = engine();
  assert.deepEqual((await h.pass(run.id)).filed, ['plan']);
  await h.pass(run.id);
  h.sign(`${run.id}-plan`, 1, closeout, usage);
  const signed = await h.pass(run.id);
  return { run, ...h, signed };
};

// ─── what is filed held open ────────────────────────────────────────────────

test('a Claude Code job is filed held open, and one on codex, a background session and a check are not', async () => {
  const { run, e, pass, sign } = await signedPlan({ implement: 'check: true' }, SIGNED);
  assert.equal((await stateOf(e, `${run.id}-plan`)).state.holdOpen, true, 'plan, a claude job');
  await pass(run.id);
  sign(`${run.id}-implement`, 1, SIGNED);
  assert.deepEqual((await pass(run.id)).checked, ['implement']);
  assert.equal((await stateOf(e, `${run.id}-implement-check`)).state.holdOpen, undefined, "a check is the run's own, never held open");

  for (const keys of [{ plan: 'harness: codex' }, { plan: 'background: true\npermissionMode: dontAsk' }]) {
    const other = start({ brief: 'add a flag', repo: aRepo(), workflowDir: folder(keys), isolate: false });
    const h = engine();
    // What the run hands the engine, as it hands it: this harness runs no background session, so the engine is handed the task without it.
    const filed: Array<Parameters<Engine['file']>[0]> = [];
    const file = h.e.file.bind(h.e);
    h.e.file = async (spec) => {
      filed.push(spec);
      return file({ ...spec, config: { ...spec.config, background: undefined } });
    };
    assert.deepEqual((await h.pass(other.id)).filed, ['plan']);
    assert.equal(Object.hasOwn(filed[0], 'holdOpen'), false, Object.values(keys)[0]);
  }
});

// ─── an ungated step that signed ────────────────────────────────────────────

test('an ungated step that signed off is closed on the pass that reads it waiting, and what waits on it is filed on that same pass', async () => {
  const { run, e, signed, pass } = await signedPlan({}, SIGNED);
  assert.equal((await stateOf(e, `${run.id}-plan`)).state.closed, true, 'closed');
  assert.deepEqual(signed.filed, ['implement'], 'and implement filed beside the close, not a pass later');
  await pass(run.id);
  const settled = await stateOf(e, `${run.id}-plan`);
  assert.deepEqual([settled.phase, settled.state.settled], ['succeeded', 'succeeded'], 'the engine settles it as it signed');
  assert.equal(readRun(run.id).steps.plan.taskId, `${run.id}-plan`);
});

// ─── a blocked sign-off, answered ───────────────────────────────────────────

test("a step that signed off blocked stays open, and a person's answer — `wf retry --message` — is its next turn: the same task, in the session that signed, nothing filed", async () => {
  const { run, e, signed, pass, spawned, sign } = await signedPlan({}, BLOCKED);
  const plan = `${run.id}-plan`;
  assert.deepEqual(signed.filed, []);
  assert.equal((await stateOf(e, plan)).phase, 'input-required', 'held open: it waits, and nothing runs');
  assert.equal((await stateOf(e, plan)).state.closed, false, 'not closed');
  const listed = await list(e, readRun(run.id));
  assert.equal(
    listed.steps.find((s) => s.name === 'plan')!.status,
    'input-required · BLOCKED',
    "the engine's word, and the run's beside it",
  );
  assert.deepEqual(listed.waitingOnYou, ['plan']);

  await retry(e, run.id, 'plan', { mode: 'nudge', message: 'the --dry-run flag' });
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
    record.tries?.map((t) => [t.taskId, t.then]),
    [[plan, 'nudge']],
    'the try it was, behind it',
  );
  assert.deepEqual(readAsks(run.id).asks, [], 'the ask is consumed');
  assert.equal(await e.view(`${run.id}-plan-try2`).then((v) => v.state.brief), '', 'no -try2 task');

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
  await retry(under.e, under.run.id, 'plan', { mode: 'nudge', message: 'the --dry-run flag' });
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
  await retry(e, run.id, 'plan', { mode: 'nudge', message: 'the --dry-run flag', budget: 6 });
  assert.deepEqual((await pass(run.id)).tried, ['plan']);
  assert.equal((await stateOf(e, `${run.id}-plan`)).state.inputs[0].config?.budgetUsd, 1, '$6 less the $5 spent');
});

test('a try of a waiting step that is not an answer — `--fresh`, `--model` — closes the task, and files a task of its own as every try was', async () => {
  const { run, e, pass } = await signedPlan({}, BLOCKED);
  await retry(e, run.id, 'plan', { mode: 'fresh', message: 'start again from the README' });
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

test("a held task whose job ended `done` with no statement (`stated: false`) waits as the runtime holds any `done` open, reads `unsigned`, and is closed: the run's sign-off nudge is a `-try2` task, never an answer to it — gated or not", async () => {
  for (const keys of [{}, { plan: 'gate: true' }]) {
    const run = start({ brief: 'add a flag', repo: aRepo(), workflowDir: folder(keys), isolate: false });
    const { e, pass, sessions } = engine();
    const plan = `${run.id}-plan`;
    await pass(run.id);
    await pass(run.id);
    // The job ended and gave no closeout: the runtime records `stated: false`, and holds the task open all the same, since it ended `done`.
    sessions.set(nameFor(plan, 1), { ...sessions.get(nameFor(plan, 1))!, state: 'done', busy: false });
    await e.tick();
    const waiting = await stateOf(e, plan);
    assert.deepEqual(
      [waiting.phase, waiting.state.attempts.at(-1)?.stated],
      ['input-required', false],
      `${JSON.stringify(keys)}: held, and no statement`,
    );
    assert.equal((await statuses(e, run.id)).plan, 'unsigned', `${JSON.stringify(keys)}: the run's word, not the engine's`);

    const nudged = await advance(e, readRun(run.id));
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
  await retry(e, run.id, 'plan', { mode: 'nudge', message: 'the --dry-run flag' });
  // What the pass did before it died: the answer, and nothing on the record.
  await e.answer(plan, 'the --dry-run flag');
  await e.tick();
  assert.match((await stateOf(e, plan)).phase, /^running/);
  const adopted = await advance(e, readRun(run.id));
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

// ─── an answer's turn that does not sign ────────────────────────────────────

/**
 * A plan that signed off blocked and was answered: the answer's turn is attempt 2 of the same task, filed to continue `native-1`, the
 * session that asked. The runtime makes one attempt at a turn (stage 4a part 2), so each end below settles the task `failed`; what follows
 * is the orchestrator's, a try of its own.
 */
const answeredTurn = async () => {
  const h = await signedPlan({}, BLOCKED);
  const plan = `${h.run.id}-plan`;
  await retry(h.e, h.run.id, 'plan', { mode: 'nudge', message: 'the --dry-run flag' });
  assert.deepEqual((await h.pass(h.run.id)).tried, ['plan'], 'answered');
  return { ...h, plan, turn: nameFor(plan, 2) };
};

/**
 * What every end of the turn but a sign-off leaves: the task settled `failed` and the step read `failed`, nothing tried again on its own,
 * and a person's `wf retry --message` filed as a task of its own — `-try3`, the answered turn being try 2 — and the settled task never
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
  const decided = await decide(e, run.id);
  assert.deepEqual(
    decided.decision.kind === 'awaiting' && [decided.decision.outcome, decided.decision.failed],
    ['failed', ['plan']],
    `${end}: the run failed, as any failed step fails it`,
  );
  assert.match(decided.offers.join('\n'), /wf retry \S+ plan/, `${end}: and \`wf decide\` offers the retry`);

  await retry(e, run.id, 'plan', { mode: 'nudge', message: 'the --dry-run flag, again' });
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

test("an answer's turn that FAILED settles its task failed, and a `wf retry --message` is a `-tryN` task continuing the session that failed", async () => {
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

test("an answer's turn that was LOST settles its task failed, and a `wf retry --message` is a `-tryN` task continuing the session that asked, since the lost one was never named", async () => {
  const h = await answeredTurn();
  await h.pass(h.run.id);
  assert.equal(h.spawned.at(-1)!.name, h.turn);
  h.sessions.delete(h.turn);
  // Past the runtime's grace for a session its harness never reports (30 s): the attempt is lost.
  mock.timers.enable({ apis: ['Date'], now: Date.now() + 10 * 60_000 });
  try {
    await h.pass(h.run.id);
  } finally {
    mock.timers.reset();
  }
  const last = (await stateOf(h.e, h.plan)).state.attempts.at(-1)!;
  assert.deepEqual([last.reason, last.nativeId, last.resumeFrom], ['lost', null, 'native-1'], 'lost, with no id of its own');
  await triedAgain(h, 'native-1', 'lost');
});

test("an answer's turn that COULD NOT START settles its task failed, and a `wf retry --message` is a `-tryN` task continuing the session that asked", async () => {
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

// ─── a gate ─────────────────────────────────────────────────────────────────

test('a gated step that signed stays open until `wf approve`, and is closed on the pass that files what waits on it', async () => {
  const { run, e, signed, pass } = await signedPlan({ plan: 'gate: true' }, SIGNED);
  assert.deepEqual(signed.filed, []);
  assert.equal((await statuses(e, run.id)).plan, 'awaiting approval');
  assert.equal((await stateOf(e, `${run.id}-plan`)).phase, 'input-required');
  await pass(run.id);
  assert.equal((await stateOf(e, `${run.id}-plan`)).state.closed, false, 'pass after pass, until a person says');

  await approve(e, run.id, 'plan');
  const approved = await pass(run.id);
  assert.deepEqual(approved.filed, ['implement']);
  assert.equal((await stateOf(e, `${run.id}-plan`)).state.closed, true);
});

test('a gated step closed on its approval reads on `wf ls` as it signed, in the pass before the engine settles it — as the tick, which filed what follows, reads it', async () => {
  const { run, e, pass } = await signedPlan({ plan: 'gate: true' }, SIGNED);
  const plan = `${run.id}-plan`;
  await approve(e, run.id, 'plan');
  assert.deepEqual((await pass(run.id)).filed, ['implement']);
  const closed = await stateOf(e, plan);
  assert.deepEqual(
    [closed.phase, closed.state.closed, closed.state.settled],
    ['between attempts', true, null],
    'the seed: closed, and the engine has not settled it yet',
  );
  assert.equal(phaseOfView(closed), 'succeeded');
  const between = (await statuses(e, run.id)).plan;
  await e.tick();
  assert.equal((await stateOf(e, plan)).state.settled, 'succeeded');
  assert.equal(between, (await statuses(e, run.id)).plan, 'the same line before the engine settles it and after');
  assert.doesNotMatch(between, /between attempts|running/);
  const listed = await list(e, readRun(run.id));
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
  sessions.set(check, { ...sessions.get(check)!, state: 'done', busy: false, exitCode: 0 });
  await pass(run.id);
  assert.equal((await statuses(e, run.id)).plan, 'awaiting approval');
  await retry(e, run.id, 'plan', { mode: 'nudge', message: 'smaller steps, please' });
  const sent = await pass(run.id);
  assert.deepEqual([sent.tried, sent.filed], [['plan'], []]);
  assert.equal((await stateOf(e, plan)).state.inputs.length, 1, 'answered, in the session that signed');
});

test("a send-back from a gate — `wf retry --message` on a signed gated step — is an answer to its task, and the next turn's sign-off waits for an approval of its own", async () => {
  const { run, e, pass, sign } = await signedPlan({}, SIGNED, ['plan']);
  const plan = `${run.id}-plan`;
  await retry(e, run.id, 'plan', { mode: 'nudge', message: 'smaller steps, please' });
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
    (await decide(e, run.id)).closeouts.plan && 'summary' in (await decide(e, run.id)).closeouts.plan!
      ? ((await decide(e, run.id)).closeouts.plan as { summary: string }).summary
      : undefined,
    'the plan, in smaller steps',
    "what is to be approved is the second turn's sign-off",
  );

  await approve(e, run.id, 'plan');
  assert.equal(readRun(run.id).steps.plan.tries?.length, 1);
  assert.deepEqual((await pass(run.id)).filed, ['implement']);
  assert.equal((await stateOf(e, plan)).state.closed, true);
});

// ─── calling a run off ──────────────────────────────────────────────────────

test('`wf cancel` closes a task that waits for a word — nothing runs, so nothing is stopped — and a cancelled run closes one the verb did not', async () => {
  const { run, e, pass } = await signedPlan({ plan: 'gate: true' }, SIGNED);
  const { plan } = await cancel(e, run.id);
  assert.deepEqual(plan.kind === 'cancel' ? plan.stop : plan, []);
  const view = await stateOf(e, `${run.id}-plan`);
  assert.deepEqual([view.state.closed, view.state.stopRequested], [true, false]);
  await pass(run.id);
  assert.equal((await stateOf(e, `${run.id}-plan`)).state.settled, 'succeeded', 'settled as it signed');

  // A run marked cancelled without the verb — the mark written by hand, or the verb's close refused: the pass closes it.
  const other = await signedPlan({}, SIGNED, ['plan']);
  fs.writeFileSync(path.join(ROOT, 'runs', `${other.run.id}.cancelled`), `${new Date().toISOString()}\n`);
  await other.pass(other.run.id);
  assert.equal((await stateOf(other.e, `${other.run.id}-plan`)).state.closed, true);
});

test('`wf rm` of a run whose step waits for a word closes its task: no pass reads the run again to close it', async () => {
  const { run, e } = await signedPlan({}, BLOCKED);
  const forgot = await forget(e, run.id);
  assert.equal(forgot.kind, 'forgotten', forgot.refusal);
  assert.equal((await stateOf(e, `${run.id}-plan`)).state.closed, true);
});

// ─── a refusal is a note ────────────────────────────────────────────────────

test("REFUSED by the engine: a close it will not journal is said on the pass, in the engine's words, and asked again by the next", async () => {
  const { run, e, pass } = await signedPlan({}, BLOCKED);
  await retry(e, run.id, 'plan', { mode: 'fresh' });
  // Between the run's read and its close, something else answered the task: the engine refuses the close.
  const real = e.close.bind(e);
  let refusedOnce = false;
  e.close = async (taskId: string) => {
    if (!refusedOnce) {
      refusedOnce = true;
      await e.answer(taskId, 'said elsewhere');
    }
    return real(taskId);
  };
  const refused = await pass(run.id);
  assert.deepEqual(refused.tried, [], 'nothing filed over a task that did not close');
  assert.ok(
    refused.notes.some((n) => /^plan: close: `.*-plan` has been answered already/.test(n)),
    refused.notes.join('\n'),
  );
  assert.equal(await e.view(`${run.id}-plan-try2`).then((v) => v.state.brief), '');
});

// ─── an old run ─────────────────────────────────────────────────────────────

test('a run whose tasks were filed before tasks were held open is worked as it was: its gate settled at the sign-off, and a send-back is a `-try2` task', async () => {
  const run = start({ brief: 'add a flag', repo: aRepo(), workflowDir: folder({ plan: 'gate: true' }), isolate: false });
  const h = engine();
  // The run's filings as they were: nothing held open.
  const file = h.e.file.bind(h.e);
  h.e.file = async (spec) => {
    const { holdOpen: _, ...old } = spec;
    return file(old);
  };
  await h.pass(run.id);
  await h.pass(run.id);
  h.sign(`${run.id}-plan`, 1, SIGNED);
  const signed = await h.pass(run.id);
  assert.equal((await stateOf(h.e, `${run.id}-plan`)).state.settled, 'succeeded');
  assert.deepEqual([signed.filed, (await statuses(h.e, run.id)).plan], [[], 'awaiting approval']);
  await retry(h.e, run.id, 'plan', { mode: 'nudge', message: 'smaller steps, please' });
  assert.deepEqual((await h.pass(run.id)).tried, ['plan']);
  const sent = await stateOf(h.e, `${run.id}-plan-try2`);
  assert.match(sent.state.brief, /smaller steps, please/);
  assert.equal(sent.state.resumeFrom, 'native-1');
});

// ─── what a turn reads ──────────────────────────────────────────────────────

test("a step's closeout, its denials and whether its closeout was asked for are its current turn's: an answered turn still running reads none of the last turn's", async () => {
  const view = (attempts: object[], inputs: number, phase = 'running (working)') =>
    ({
      id: 't',
      phase,
      sessionId: 's',
      state: {
        brief: 'b',
        closeoutSchema: {},
        holdOpen: true,
        closed: false,
        settled: null,
        stopRequested: false,
        said: [],
        attempts,
        inputs: Array.from({ length: inputs }, () => ({ at: 'x', text: 'go on' })),
      },
    }) as unknown as TaskView;
  const signed = { n: 1, ended: 'done', reason: 'signed', nativeId: 'n', closeout: BLOCKED, denials: [{ tool: 'Skill', what: 'look' }] };
  const unsigned = { n: 1, ended: 'failed', reason: 'unsigned', nativeId: 'n' };
  const run = { id: 'r', steps: { plan: { taskId: 't' } } } as never;
  const answered = new Map([['t', view([signed], 1)]]);
  assert.equal(
    closeoutOf(answered, run, 'plan'),
    undefined,
    "the answered turn has not signed: the last turn's blocked closeout is not its",
  );
  assert.deepEqual(deniedOf(answered)('t'), [], 'nor its denials');
  const waiting = new Map([['t', view([signed], 0, 'input-required')]]);
  const read = closeoutOf(waiting, run, 'plan');
  assert.ok(read && !('error' in read), `the turn that signed is read while it waits: ${JSON.stringify(read)}`);
  assert.equal(read.outcome, 'blocked', 'the turn that signed, read while it waits');
  assert.deepEqual(deniedOf(waiting)('t'), ['Skill(look)']);
  assert.equal(phaseOfView(waiting.get('t')), 'succeeded', 'waiting reads settled, as it signed');
  assert.equal(closeoutAsked(new Map([['t', view([unsigned], 1)]]))('t'), true, "an unsigned attempt of the last turn is not this turn's");
  assert.equal(closeoutAsked(new Map([['t', view([unsigned], 0)]]))('t'), 'unsigned', 'and of this turn, it is');
});
