/**
 * A gate on disk: a step's handoff that waits for a person, as `nemia start --gate`, a card's `gate:` and a step's `gate: true` freeze it
 * on a run, and as the tick holds it. What a gate means to `assess`, `listing`, `decision` and a brief is pure, and lives in run.test.ts.
 * This is the part that is not: the record `nemia start` writes, the files a person writes beside it, and a tick that reads both on every
 * pass.
 *
 * `WF_ROOT` is set before the runner is imported, which reads it as it loads, and `WF_DEFAULT_FACTORY_STARTS` beside it: its runs start
 * in scratch repositories no factory holds.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import type { Engine } from '../src/runtime-client.ts';
import { testEngine } from 'agent-runtime/testing';
import { scratch } from './scratch.ts';
import { Effect } from 'effect';
import { testPlace } from '../place/memory/index.ts';
import { eachTest, runGiven, runOver } from './placed.ts';
import { unasked } from './unasked.ts';

const ROOT = scratch('wf-gate-');
fs.mkdirSync(path.join(ROOT, 'runs'), { recursive: true });

process.env.WF_ROOT = ROOT;
delete process.env.WF_MAX_CONCURRENT;
delete process.env.WF_MAX_RUNS;
process.env.WF_DEFAULT_FACTORY_STARTS = '1';
const {
  advanceRun,
  approveRun,
  cancelRun,
  forgetRun,
  inboxDir,
  list,
  parentRead,
  retryRun,
  startRun,
  startFromInbox,
  runWith: runEngine,
  standingLiveOf,
} = await import('../src/runner.ts');
const stand = eachTest(testPlace);
const runWith = runOver(runEngine, () => stand().layer);
const runPlaced = runGiven(() => stand().layer);
/** A run as one waiting on it reads it, where its branches stand asked now, as a person's verb asks them (`standingLiveOf`). */
const parentNow = (id: string) => standingLiveOf([id]).pipe(Effect.flatMap((git) => parentRead(id, git)));
const { listRuns, markCancelled, readRun } = await import('../src/record/record.store.ts');
const { passStanding } = await import('../src/standing/standing.verb.ts');
/** A pass's read of where every run's branches stand, written to `standing.json` as the tick writes it: what `nemia ls` reads. */
const aPass = (e: Engine) => runWith(e, passStanding(listRuns()));
const { main: cli } = await import('../src/cli/main.ts');
/** `nemia`, as a person types it, its commands given this test's place. */
const main = (argv: string[], e?: Engine) => cli(argv, e, undefined, stand().place);
const { engineOf } = await import('../src/runtime-client.ts');

/** Refused by name: exit 2, and the message — never `String(err)`, which starts with `Error: `. */
const refusedWith = (pattern: RegExp) => (err: Error & { exitCode?: number }) => err.exitCode === 2 && pattern.test(err.message);

/** A repository with one commit, so `nemia start` has a base to record. */
const aRepo = (): string => {
  const repo = fs.mkdtempSync(path.join(ROOT, 'repo-'));
  stand().world.repository(repo, {});
  return repo;
};

/** A workflow folder of `plan → implement → review`, each step with the frontmatter lines it is given. */
const planned = (keys: { plan?: string; implement?: string; review?: string } = {}) => {
  const dir = fs.mkdtempSync(path.join(ROOT, 'wf-'));
  const write = (name: string, after: string | null, lines = '') => {
    const front = [...(after ? [`after: ${after}`] : []), 'place: git', ...(lines ? [lines] : [])];
    fs.writeFileSync(path.join(dir, `${name}.md`), `---\n${front.join('\n')}\n---\n${name} it\n`);
  };
  write('plan', null, keys.plan);
  write('implement', 'plan', keys.implement);
  write('review', 'implement', keys.review);
  return dir;
};

/**
 * The engine's stand-in (`testEngine`), the engine the controllers take over it, as `nemia` builds one over the runtime, and `settle`
 * taking what the attempt ended with as its closeout and its exit code.
 */
const engine = eachTest(testEngine);
const board = () => {
  const b = engine();
  const settle = (id: string, phase: string, closeout?: unknown, exitCode?: number) =>
    b.settle(id, phase, { ...(closeout === undefined ? {} : { closeout }), ...(exitCode === undefined ? {} : { exitCode }) });
  return { ...b, settle, e: engineOf(b.layer) };
};

const SIGNED = { outcome: 'done', summary: 'the plan: parse the flag, then store it', artifacts: [], needs: null };

const asksDir = (id: string) => path.join(ROOT, 'runs', `${id}.asks`);
/** An approval, written as a person's file beside the retry asks — what `nemia approve` writes. */
const approveByHand = (id: string, step: string, n: number, held: unknown = { step, try: n, at: '2026-09-16T23:10:00.000Z' }) => {
  fs.mkdirSync(asksDir(id), { recursive: true });
  fs.writeFileSync(path.join(asksDir(id), `approve-${step}-${n}`), typeof held === 'string' ? held : `${JSON.stringify(held, null, 2)}\n`);
};

const runsWritten = () => fs.readdirSync(path.join(ROOT, 'runs')).filter((f) => f.endsWith('.json')).length;

/**
 * What `main` printed, line by line: given no engine, it is handed one of its own, which it is to file on, stop, say to or forget from
 * nothing.
 */
const printedBy = async (
  t: { mock: { method: (o: object, m: string, f: (...a: unknown[]) => void) => { mock: { restore: () => void } } } },
  argv: string[],
  e?: Engine,
): Promise<string[]> => {
  const printed: string[] = [];
  const log = t.mock.method(console, 'log', (...args: unknown[]) => {
    printed.push(args.join(' '));
  });
  const own = testEngine();
  try {
    await main(argv, e ?? engineOf(own.layer));
  } finally {
    log.mock.restore();
  }
  unasked(own);
  return printed.join('\n').split('\n');
};

test("`nemia start --gate <step>` freezes `gates` on the record, once per step; a step's own `gate: true` is frozen with its workflow; a run given none has no `gates`", async (t) => {
  const repo = aRepo();
  const run = await runPlaced(
    startRun({ brief: 'plan the flag', repo, workflowDir: planned({ review: 'gate: true' }), isolate: false, gates: ['plan'] }),
  );
  assert.deepEqual(readRun(run.id).gates, ['plan']);
  assert.equal(readRun(run.id).workflow?.find((s) => s.name === 'review')?.gate, true, "the folder's own gate, frozen with the step");
  const bare = await runPlaced(startRun({ brief: 'plan the flag', repo, workflowDir: planned(), isolate: false }));
  assert.equal(Object.hasOwn(JSON.parse(fs.readFileSync(path.join(ROOT, 'runs', `${bare.id}.json`), 'utf8')), 'gates'), false);

  const printed = await printedBy(t, [
    'start',
    'plan the flag',
    '--workflows',
    planned({ review: 'gate: true' }),
    '--repo',
    repo,
    '--no-worktree',
    '--gate',
    'plan',
    '--gate=implement',
  ]);
  const id = printed[0].split(' ')[0];
  assert.deepEqual(readRun(id).gates, ['plan', 'implement']);
  assert.ok(
    printed.includes(
      `gated at: plan, implement, review — nothing after each is filed until nemia approve ${id} <step>, once it has signed off`,
    ),
    printed.join('\n'),
  );
});

test('REFUSED at `nemia start`, before a run is written: a --gate naming a step the workflow does not have — naming the steps it has — and one given twice; the CLI refuses --gate with no step, and `nemia plan --gate` by name', async () => {
  const repo = aRepo();
  const before = runsWritten();
  const starting =
    (...gates: string[]) =>
    async () =>
      await runPlaced(startRun({ brief: 'plan the flag', repo, workflowDir: planned(), isolate: false, gates }));
  await assert.rejects(
    starting('plan', 'desing'),
    refusedWith(
      /^--gate desing: the workflow has no step "desing", so nothing would ever wait at it\. Its steps are: plan, implement, review — gate one of them by its name\.$/,
    ),
  );
  await assert.rejects(
    starting('plan', 'plan'),
    refusedWith(/^--gate plan is given twice, and a run is gated at a step once\. Give each step one --gate\.$/),
  );
  assert.equal(runsWritten(), before, 'no run written');

  const typed = (...flags: string[]) =>
    main(['start', 'plan the flag', '--workflows', planned(), '--repo', repo, '--no-worktree', ...flags]);
  await assert.rejects(
    typed('--gate'),
    refusedWith(/^--gate takes the step whose closeout waits for a person before anything after it is filed/),
  );
  await assert.rejects(typed('--gate', '--no-worktree'), refusedWith(/^--gate takes the step/));
  await assert.rejects(typed('--gate', 'reveiw'), refusedWith(/^--gate reveiw: the workflow has no step "reveiw"/));
  await assert.rejects(
    main(['plan', ROOT, '--gate', 'plan']),
    refusedWith(/^nemia plan does not take --gate: a plan's cards are gated by their workflows' own gate: true\./),
  );
  assert.equal(runsWritten(), before, 'nor by the CLI');
});

test("an inbox card's `gate:` is frozen on the run it starts, beside a start's --gate — a step both name once — and REFUSED in the card's words when it names no step of the workflow, with nothing written and the card left in the inbox", async () => {
  const repo = aRepo();
  const card = (name: string, gate: string) => {
    fs.mkdirSync(inboxDir(), { recursive: true });
    fs.writeFileSync(path.join(inboxDir(), `${name}.md`), `---\nworkflow: ${planned()}\ngate: ${gate}\n---\nPlan the flag.\n`);
  };
  card('plan-the-flag-a1b2', 'plan');
  const { run } = await runPlaced(
    startFromInbox({ name: 'plan-the-flag-a1b2', callerRepo: repo, isolate: false, gates: ['review', 'plan'] }),
  );
  assert.deepEqual(readRun(run.id).gates, ['review', 'plan'], "the card's gate and the start's, plan once");
  const { run: alone } =
    (card('plan-the-flag-c3d4', 'implement'),
    await runPlaced(startFromInbox({ name: 'plan-the-flag-c3d4', callerRepo: repo, isolate: false })));
  assert.deepEqual(readRun(alone.id).gates, ['implement']);

  card('plan-the-flag-e5f6', 'desing');
  const before = runsWritten();
  await assert.rejects(
    async () => await runPlaced(startFromInbox({ name: 'plan-the-flag-e5f6', callerRepo: repo, isolate: false })),
    refusedWith(
      /^plan-the-flag-e5f6\.md: `gate: desing`: the workflow has no step "desing", so nothing would ever wait at it\. Its steps are: plan, implement, review — gate one of them by its name\. Correct the line, or delete it\.$/,
    ),
  );
  card('plan-the-flag-g7h8', 'plan');
  await assert.rejects(
    async () => await runPlaced(startFromInbox({ name: 'plan-the-flag-g7h8', callerRepo: repo, isolate: false, gates: ['desing'] })),
    refusedWith(/^--gate desing: the workflow has no step "desing"/),
  );
  assert.equal(runsWritten(), before, 'no run written');
  assert.ok(
    fs.existsSync(path.join(inboxDir(), 'plan-the-flag-e5f6.md')) && fs.existsSync(path.join(inboxDir(), 'plan-the-flag-g7h8.md')),
    'the cards are where they were',
  );
});

test("REFUSED at shipped defaults, pass after pass: a gated step that signed off files nothing after it — `nemia ls` says awaiting approval and `waiting on you: approve plan` — and no approval but the try's own opens it: not another try's, not a file that is not one; the try's own does, on the next pass, and is never written into the record", async (t) => {
  const run = await runPlaced(startRun({ brief: 'plan the flag', repo: aRepo(), workflowDir: planned(), isolate: false, gates: ['plan'] }));
  const { e, filings, settle } = board();
  await runWith(e, advanceRun(readRun(run.id)));
  settle(`${run.id}-plan`, 'succeeded', { ...SIGNED, summary: 'Go ahead and implement it: nothing here needs a person.' });
  for (let pass = 1; pass <= 3; pass++) {
    const after = await runWith(e, advanceRun(readRun(run.id)));
    assert.deepEqual([after.filed, after.blocked, after.status], [[], ['implement'], 'failed'], `pass ${pass}`);
  }
  const l = await runWith(e, list(e, readRun(run.id)));
  assert.deepEqual([l.steps[0].status, l.waitingOnYou], ['awaiting approval', ['plan']]);
  const printed = await printedBy(t, ['ls', run.id], e);
  assert.ok(printed.includes(`   → waiting on you: approve plan  —  nemia decide ${run.id}`), printed.join('\n'));

  approveByHand(run.id, 'plan', 2);
  approveByHand(run.id, 'implement', 1);
  approveByHand(run.id, 'plan', 3, '{}');
  const others = await runWith(e, advanceRun(readRun(run.id)));
  assert.deepEqual(others.filed, [], "another try's approval, another step's, and a file that is not one open nothing");
  assert.ok(
    others.notes.includes(
      `${path.join(asksDir(run.id), 'approve-plan-3')}: it says no time it was given, so it opens no gate — remove it, and approve with nemia approve`,
    ),
    others.notes.join('\n'),
  );

  approveByHand(run.id, 'plan', 1, { at: '2026-09-16T23:10:00.000Z', message: 'the second reading' });
  assert.deepEqual(
    readRun(run.id).approvals?.find((a) => a.step === 'plan' && a.try === 1),
    { step: 'plan', try: 1, at: '2026-09-16T23:10:00.000Z', message: 'the second reading' },
    'composed on read',
  );
  const opened = await runWith(e, advanceRun(readRun(run.id)));
  assert.deepEqual(opened.filed, ['implement']);
  assert.equal(
    Object.hasOwn(JSON.parse(fs.readFileSync(path.join(ROOT, 'runs', `${run.id}.json`), 'utf8')), 'approvals'),
    false,
    'the record the tick wrote keeps no approval',
  );
  assert.ok(
    fs.existsSync(path.join(asksDir(run.id), 'approve-plan-1')),
    'and the approval stays where a person wrote it, opening the gate on every pass',
  );
  await runWith(e, advanceRun(readRun(run.id)));
  assert.equal(filings.filter((f) => f === `${run.id}-implement`).length, 1, 'filed once');
});

test('a gated step with `check:` is checked before it is held: its check filed on the pass after it signs off, nothing after it while the check runs, and awaiting approval once it passes', async () => {
  const run = await runPlaced(
    startRun({
      brief: 'plan the flag',
      repo: aRepo(),
      workflowDir: planned({ plan: 'check: test -f PLAN.md\ngate: true' }),
      isolate: false,
    }),
  );
  const { e, filings, specs, settle } = board();
  await runWith(e, advanceRun(readRun(run.id)));
  settle(`${run.id}-plan`, 'succeeded', SIGNED);
  assert.deepEqual((await runWith(e, advanceRun(readRun(run.id)))).checked, ['plan']);
  settle(`${run.id}-plan-check`, 'running');
  assert.equal((await runWith(e, list(e, readRun(run.id)))).steps[0].status, 'checking');
  settle(`${run.id}-plan-check`, 'succeeded', undefined, 0);
  assert.deepEqual((await runWith(e, advanceRun(readRun(run.id)))).filed, []);
  assert.equal((await runWith(e, list(e, readRun(run.id)))).steps[0].status, 'awaiting approval');
  assert.deepEqual(filings, [`${run.id}-plan`, `${run.id}-plan-check`]);
  assert.deepEqual(
    specs.map((s) => s.queued),
    [true, true],
    'every filing goes out queued, for the tick to admit',
  );
});

test("every filing of a pass goes out with its brief cut where its sections open, the parts joining into it: a step's and its check's", async () => {
  const run = await runPlaced(
    startRun({ brief: 'plan the flag', repo: aRepo(), workflowDir: planned({ plan: 'check: test -f PLAN.md' }), isolate: false }),
  );
  const { e, specs, settle } = board();
  await runWith(e, advanceRun(readRun(run.id)));
  settle(`${run.id}-plan`, 'succeeded', SIGNED);
  await runWith(e, advanceRun(readRun(run.id)));
  const [step, check] = specs;
  assert.ok(step.briefParts!.length > 1, `the step's brief has sections: ${JSON.stringify(step.brief.slice(0, 200))}`);
  assert.equal(step.briefParts!.join(''), step.brief);
  assert.deepEqual(check.briefParts, ['test -f PLAN.md']);
});

test("REFUSED at shipped defaults: a parent whose last step waits at its gate has not shipped, though a person merged its branch — a run `--after` it files nothing — and once that step is approved, it has, and the child's next tick files its roots", async () => {
  const repo = aRepo();
  const b = board();
  const oneStep = fs.mkdtempSync(path.join(ROOT, 'one-'));
  fs.writeFileSync(path.join(oneStep, 'implement.md'), '---\nplace: git\n---\nimplement it\n');
  const parent = await runPlaced(startRun({ brief: 'the parent', repo, workflowDir: oneStep, gates: ['implement'] }));
  await runWith(b.e, advanceRun(readRun(parent.id)));
  const wt = readRun(parent.id).steps.implement.workspace!;
  fs.writeFileSync(path.join(wt, 'parent.txt'), 'parent\n');
  stand().world.commit(wt, 'add parent.txt');
  b.settle(`${parent.id}-implement`, 'succeeded', SIGNED);
  await runWith(b.e, advanceRun(readRun(parent.id)));
  stand().world.stage(repo, `wf/${parent.id}/implement`);
  stand().world.commit(repo, 'merge the parent');

  const child = await runPlaced(startRun({ brief: 'the child', repo, workflowDir: planned(), isolate: false, after: [parent.id] }));
  assert.equal((await runWith(b.e, parentNow(parent.id))).shipped, false, 'merged, and at its gate');
  for (let pass = 1; pass <= 2; pass++) assert.deepEqual((await runWith(b.e, advanceRun(readRun(child.id)))).filed, [], `pass ${pass}`);
  await aPass(b.e);
  assert.deepEqual((await runWith(b.e, list(b.e, readRun(child.id)))).steps[0].status, `waiting on ${parent.id}`);

  approveByHand(parent.id, 'implement', 1);
  assert.equal((await runWith(b.e, parentNow(parent.id))).shipped, true);
  assert.deepEqual((await runWith(b.e, advanceRun(readRun(child.id)))).filed, ['plan']);

  await assert.rejects(
    runWith(b.e, retryRun(parent.id, 'implement', { mode: 'nudge', message: 'one more thing' })),
    refusedWith(/^implement signed off done and declares no check: what waits on it has been filed, and there is nothing to try again\.$/),
    'approved, its one step has handed on: nothing waits on it, and a send-back would file a session on a run a person merged',
  );
  assert.ok(!fs.existsSync(path.join(asksDir(parent.id), 'retry-implement-2')), 'no ask written');
  assert.deepEqual(
    (await runWith(b.e, advanceRun(readRun(parent.id)))).filed.concat((await runWith(b.e, advanceRun(readRun(parent.id)))).tried),
    [],
  );
  assert.equal((await runWith(b.e, parentNow(parent.id))).shipped, true, 'still shipped');
});

/**
 * `nemia start --gate plan` on `plan → implement → review`, the steps in the checkout, run until plan has signed off and waits at its gate.
 */
const atItsGate = async (keys: Parameters<typeof planned>[0] = {}) => {
  const run = await runPlaced(
    startRun({ brief: 'plan the flag', repo: aRepo(), workflowDir: planned(keys), isolate: false, gates: ['plan'] }),
  );
  const b = board();
  await runWith(b.e, advanceRun(readRun(run.id)));
  b.settle(`${run.id}-plan`, 'succeeded', SIGNED);
  assert.deepEqual((await runWith(b.e, advanceRun(readRun(run.id)))).filed, []);
  return { run, ...b };
};

/** The files in a run's asks directory, `done/` among them, by name. */
const asksOf = (id: string, dir = '') =>
  fs.existsSync(path.join(asksDir(id), dir))
    ? fs
        .readdirSync(path.join(asksDir(id), dir))
        .filter((f) => !f.startsWith('.') && f !== 'done')
        .sort()
    : [];

test("`nemia approve` writes the person's approval beside the retry asks — the try it approves, the time and the words — and nothing else; the next tick files what waits on the step, once, and the approval stays where it was written", async (t) => {
  const { run, e, filings } = await atItsGate();
  const record = fs.readFileSync(path.join(ROOT, 'runs', `${run.id}.json`), 'utf8');
  const printed = await printedBy(t, ['approve', run.id, 'plan', '--message', 'ship the second reading'], e);
  const file = path.join(asksDir(run.id), 'approve-plan-1');
  const held = JSON.parse(fs.readFileSync(file, 'utf8'));
  assert.deepEqual(held, { step: 'plan', try: 1, at: held.at, message: 'ship the second reading' });
  assert.ok(!Number.isNaN(Date.parse(held.at)), 'with the time');
  assert.deepEqual(printed, [`${run.id}  approved: try 1 of plan, with your words — the next tick files what waits on it`, `   ${file}`]);
  assert.equal(fs.readFileSync(path.join(ROOT, 'runs', `${run.id}.json`), 'utf8'), record, 'the verb writes no record');

  assert.deepEqual((await runWith(e, advanceRun(readRun(run.id)))).filed, ['implement']);
  await runWith(e, advanceRun(readRun(run.id)));
  assert.equal(filings.filter((f) => f === `${run.id}-implement`).length, 1);
  assert.deepEqual(asksOf(run.id), ['approve-plan-1'], 'not consumed: it opens the gate on every pass');

  const bare = await atItsGate();
  const { approval } = await runWith(bare.e, approveRun(bare.run.id, 'plan'));
  assert.deepEqual(Object.keys(approval).sort(), ['at', 'step', 'try'], 'with no words, the approval has none');
});

test('REFUSED at shipped defaults: `nemia approve` on a step not gated, one not signed off yet, one already approved, a cancelled run, a run not there, a step the run does not have, empty words, and while a send-back is asked for — exit 2, by name, nothing written; the CLI refuses a flag it does not take, --message with no words or twice, before it reads a run', async () => {
  const gate = await atItsGate();
  const id = gate.run.id;
  await assert.rejects(
    runWith(gate.e, approveRun(id, 'implement')),
    refusedWith(
      new RegExp(
        `^implement has no gate: what waits on it is filed once it has signed off, with nobody's approval, so there is nothing to approve\\. ${id} is gated at plan\\.`,
      ),
    ),
  );
  await assert.rejects(
    runWith(gate.e, approveRun(id, 'desing')),
    refusedWith(new RegExp(`^${id} has no step "desing" — its steps are plan, implement, review\\.$`)),
  );
  await assert.rejects(runWith(gate.e, approveRun(id, 'plan', '')), refusedWith(/^--message is empty/));
  await assert.rejects(
    runWith(gate.e, approveRun('no-such-run-zz9z', 'plan')),
    refusedWith(/^no such run: no-such-run-zz9z\. nemia approve takes a run by its id, as nemia ls lists it/),
  );
  assert.deepEqual(asksOf(id), []);

  const running = await runPlaced(
    startRun({ brief: 'plan the flag', repo: aRepo(), workflowDir: planned(), isolate: false, gates: ['plan'] }),
  );
  const b = board();
  await runWith(b.e, advanceRun(readRun(running.id)));
  b.settle(`${running.id}-plan`, 'running');
  await assert.rejects(
    runWith(b.e, approveRun(running.id, 'plan')),
    refusedWith(/^plan has not signed off yet: it is still running\. Its gate holds once it has signed off: approve it then/),
  );
  assert.deepEqual(asksOf(running.id), []);

  await runWith(gate.e, approveRun(id, 'plan', 'yes'));
  await assert.rejects(
    runWith(gate.e, approveRun(id, 'plan', 'yes, again')),
    refusedWith(/^try 1 of plan is already approved, at .*, with words: what waits on it is filed on the next tick, once\./),
  );
  assert.equal(JSON.parse(fs.readFileSync(path.join(asksDir(id), 'approve-plan-1'), 'utf8')).message, 'yes', 'the first approval stands');

  const sentBack = await atItsGate();
  await runWith(sentBack.e, retryRun(sentBack.run.id, 'plan', { mode: 'nudge', message: 'store it first' }));
  await assert.rejects(
    runWith(sentBack.e, approveRun(sentBack.run.id, 'plan')),
    refusedWith(
      /^try 2 of plan is already asked for \(--nudge, at .*\): the next tick sends it back, and an approval of try 1 would be spent by it at once\./,
    ),
  );
  assert.deepEqual(asksOf(sentBack.run.id), ['retry-plan-2']);

  const called = await atItsGate();
  markCancelled(called.run.id);
  await assert.rejects(
    runWith(called.e, approveRun(called.run.id, 'plan')),
    refusedWith(/was cancelled at .*, and a cancelled run files nothing, so an approval would never be honoured\./),
  );
  assert.deepEqual(asksOf(called.run.id), []);

  const stray = await atItsGate();
  fs.mkdirSync(asksDir(stray.run.id), { recursive: true });
  fs.writeFileSync(path.join(asksDir(stray.run.id), 'approve-plan-1'), 'yes please');
  await assert.rejects(
    runWith(stray.e, approveRun(stray.run.id, 'plan')),
    refusedWith(
      /^try 1 of plan cannot be approved: .*approve-plan-1 is already there, and it is not an approval — unreadable .*Delete it \(rm .*\), then approve again/,
    ),
    "a file at the approval's name that is not one is named, with how to clear it, and never read as already approved",
  );

  const typed = (...flags: string[]) => main(['approve', 'no-such-run-zz9z', 'plan', ...flags]);
  await assert.rejects(
    typed('--mesage', 'yes'),
    refusedWith(/^nemia approve does not take --mesage\. It takes the run, the step, and --message "<words>"/),
  );
  await assert.rejects(typed('--message'), refusedWith(/^--message takes the words that go with your approval, quoted/));
  await assert.rejects(typed('--message='), (err: Error & { exitCode?: number }) => {
    assert.equal(err.exitCode, 2);
    assert.equal(
      err.message,
      "--message is empty, and an approval's words are handed to every step after the gate: empty, they tell them nothing. " +
        'Say what you approve, or on what terms — nemia approve no-such-run-zz9z plan --message "<words>" — or leave --message out.',
    );
    return true;
  });
  await assert.rejects(typed('--message', 'a', '--message', 'b'), refusedWith(/^nemia approve takes --message once/));
  await assert.rejects(typed('yes'), refusedWith(/^nemia approve does not take yes\./));
});

test("REFUSED at shipped defaults: a send-back spends the approval given before it — `nemia approve`, then `nemia retry --message` before the tick — the step's session continues with the objection and nothing after it is filed; it signs off anew and its gate holds again, pass after pass, until that try is approved", async () => {
  const { run, e, tasks, filings, settle } = await atItsGate();
  await runWith(e, approveRun(run.id, 'plan', 'go ahead'));
  await runWith(e, retryRun(run.id, 'plan', { mode: 'nudge', message: 'Store the flag before you parse it.' }));

  const back = await runWith(e, advanceRun(readRun(run.id)));
  const try2 = `${run.id}-plan-try2`;
  assert.deepEqual([back.tried, back.filed], [['plan'], []], 'sent back, and nothing after it');
  const brief = tasks.get(try2)!.spec.brief;
  assert.match(
    brief,
    /^## Try 2\n\nThe last try signed off, and its handoff waited at this step's gate for a person, who sent it back rather than let it go on/,
  );
  assert.ok(brief.includes('## Your answer\n\n```text\nStore the flag before you parse it.\n```'), brief);
  assert.equal(tasks.get(try2)!.spec.resumeFrom, `native-${run.id}-plan`, 'its session continued');
  assert.deepEqual([asksOf(run.id), asksOf(run.id, 'done')], [[], ['approve-plan-1', 'retry-plan-2']], 'the approval spent with the ask');

  settle(try2, 'succeeded', { ...SIGNED, summary: 'stored, then parsed' });
  for (let pass = 1; pass <= 3; pass++)
    assert.deepEqual((await runWith(e, advanceRun(readRun(run.id)))).filed, [], `pass ${pass}: held again`);
  const l = await runWith(e, list(e, readRun(run.id)));
  assert.deepEqual([l.steps[0].status, l.waitingOnYou], ['awaiting approval', ['plan']]);
  assert.match(l.steps[0].note ?? '', /^try 2, nudged on your word, answered · approve it: nemia approve /);

  fs.copyFileSync(path.join(asksDir(run.id), 'done', 'approve-plan-1'), path.join(asksDir(run.id), 'approve-plan-1'));
  assert.deepEqual(
    (await runWith(e, advanceRun(readRun(run.id)))).filed,
    [],
    'the approval moved into done/ opens nothing, put back by hand or not: it names try 1',
  );

  const { approval } = await runWith(e, approveRun(run.id, 'plan'));
  assert.equal(approval.try, 2);
  assert.deepEqual((await runWith(e, advanceRun(readRun(run.id)))).filed, ['implement']);
  assert.equal(filings.filter((f) => f === `${run.id}-implement`).length, 1);
});

test('REFUSED at shipped defaults: `nemia cancel` calls a run waiting at its gate off as any run — marked, not `already failed` — and it files nothing after, approval or not; `nemia rm` refuses a run at its gate, naming the approval it waits for, and forgets it once it is called off', async (t) => {
  const gate = await atItsGate();
  const refusal = await runWith(gate.e, forgetRun(gate.run.id));
  assert.equal(refusal.kind, 'refused');
  assert.equal(
    refusal.refusal,
    `plan waits at its gate for your approval, and what waits on it is filed once it is approved: nemia approve ${gate.run.id} plan. Forgetting is not cancelling: nemia cancel ${gate.run.id} files nothing more, then nemia rm ${gate.run.id}.`,
  );
  assert.ok(fs.existsSync(path.join(ROOT, 'runs', `${gate.run.id}.json`)), 'nothing of it removed');
  await assert.rejects(main(['rm', gate.run.id], gate.e), refusedWith(/not forgotten/));

  const printed = await printedBy(t, ['cancel', gate.run.id], gate.e);
  assert.deepEqual(printed, [`${gate.run.id}  cancelled`, '   nothing was in flight — no further steps will be filed']);
  assert.ok(readRun(gate.run.id).cancelledAt);
  approveByHand(gate.run.id, 'plan', 1);
  assert.deepEqual((await runWith(gate.e, advanceRun(readRun(gate.run.id)))).filed, [], 'an approval on a cancelled run files nothing');
  assert.equal((await runWith(gate.e, cancelRun(gate.run.id))).plan.kind, 'already-cancelled');
  assert.equal((await runWith(gate.e, forgetRun(gate.run.id))).kind, 'forgotten');
});

test('`nemia decide` at a gate says AWAITING APPROVAL and, under the step, the approval and the send-back to give; approved with words, the tick hands them to implement and to review after it under `## Approved`, as data, and `nemia decide` prints the gate `approved <time> — "<words>"`', async (t) => {
  const { run, e, tasks, settle } = await atItsGate();
  const atGate = await printedBy(t, ['decide', run.id], e);
  assert.ok(
    atGate.includes(
      '  AWAITING APPROVAL, waiting on you: plan  — signed off at its gate; nothing after it is filed until you approve it, or send it back',
    ),
    atGate.join('\n'),
  );
  const under = atGate.indexOf('  plan');
  assert.ok(
    under > 0 &&
      atGate[under + 1] ===
        `    gate  awaiting approval:  nemia approve ${run.id} plan [--message "<words>"]  — or send it back:  nemia retry ${run.id} plan --message "<objection>"`,
    atGate.join('\n'),
  );

  const { approval } = await runWith(e, approveRun(run.id, 'plan', 'Ship the second reading.'));
  assert.deepEqual((await runWith(e, advanceRun(readRun(run.id)))).filed, ['implement']);
  const told = (id: string) => tasks.get(id)!.spec.brief;
  const words = `plan, try 1, approved at ${approval.at}:\n\n\`\`\`text\nShip the second reading.\n\`\`\``;
  assert.ok(
    told(`${run.id}-implement`).includes(`\n## Approved\n\n`) && told(`${run.id}-implement`).includes(words),
    told(`${run.id}-implement`),
  );
  assert.ok(!told(`${run.id}-plan`).includes('## Approved'), 'not the step before the gate');

  settle(`${run.id}-implement`, 'succeeded', SIGNED);
  assert.deepEqual((await runWith(e, advanceRun(readRun(run.id)))).filed, ['review']);
  assert.ok(told(`${run.id}-review`).includes(words), 'the reviewer after it reads the approval too');
  settle(`${run.id}-review`, 'succeeded', SIGNED);
  await runWith(e, advanceRun(readRun(run.id)));

  const decided = await printedBy(t, ['decide', run.id], e);
  assert.ok(!decided.some((l) => l.startsWith('  AWAITING APPROVAL')), decided.join('\n'));
  const plan = decided.indexOf('  plan');
  assert.equal(decided[plan + 1], `    gate  approved ${approval.at.slice(11, 16)}Z — "Ship the second reading."`);
});

test("REFUSED at shipped defaults: a wordless `nemia retry` taken while a gated step's harness blocked its session, whose session then signs off before any tick, is not filed at the gate — pass after pass nothing is tried or filed, `nemia ls` says awaiting approval, `nemia approve` names the ask to delete — and with it deleted, the approval files what follows", async () => {
  const run = await runPlaced(startRun({ brief: 'plan the flag', repo: aRepo(), workflowDir: planned(), isolate: false, gates: ['plan'] }));
  const { e, tasks, filings, stopped, settle } = board();
  await runWith(e, advanceRun(readRun(run.id)));
  settle(`${run.id}-plan`, 'needs-human');
  const { ask, stopFirst } = await runWith(e, retryRun(run.id, 'plan', { mode: 'nudge' }, { stopBlocked: true }));
  assert.deepEqual([ask.try, ask.message, stopFirst], [2, undefined, true], 'a wordless try of a blocked session is allowed');

  settle(`${run.id}-plan`, 'succeeded', SIGNED);
  for (let pass = 1; pass <= 3; pass++) {
    const after = await runWith(e, advanceRun(readRun(run.id)));
    assert.deepEqual([after.tried, after.filed], [[], []], `pass ${pass}: the session worked again and settled before any tick stopped it`);
  }
  assert.deepEqual([filings, stopped], [[`${run.id}-plan`], []], 'no try filed, no session stopped');
  assert.equal(tasks.has(`${run.id}-plan-try2`), false);
  const l = await runWith(e, list(e, readRun(run.id)));
  assert.deepEqual([l.steps[0].status, l.waitingOnYou], ['awaiting approval', ['plan']]);
  assert.match(l.steps[0].note ?? '', /^approve it: /, 'no try said to be due');

  const file = path.join(asksDir(run.id), 'retry-plan-2');
  await assert.rejects(
    runWith(e, approveRun(run.id, 'plan')),
    refusedWith(
      /^try 2 of plan is asked for \(--nudge, at .*\) with no words, and plan is at its gate, so no tick honours it: .*Delete that ask — retry-plan-2, in the run's \.asks directory — then approve it/,
    ),
  );
  await assert.rejects(
    runWith(e, retryRun(run.id, 'plan', { mode: 'nudge', message: 'store it first' })),
    refusedWith(/^try 2 of plan is asked for \(--nudge, at .*\) with no words, and plan is awaiting approval, so no tick honours it/),
  );
  assert.ok(fs.existsSync(file), 'left where it is, for a person to take back');

  fs.rmSync(file);
  await runWith(e, approveRun(run.id, 'plan'));
  assert.deepEqual((await runWith(e, advanceRun(readRun(run.id)))).filed, ['implement']);

  await assert.rejects(
    runWith(e, approveRun(run.id, 'plan')),
    refusedWith(
      new RegExp(
        `^try 1 of plan is already approved, at .*, and it has handed on: what waits on it has been filed, so there is nothing to approve, nor to send back\\. See where the run stands: nemia ls ${run.id}\\.$`,
      ),
    ),
    'handed on, a second approval says so, and offers no send-back that would be refused',
  );
});
