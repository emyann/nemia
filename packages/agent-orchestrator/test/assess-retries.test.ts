/**
 * What `assess`, `stepStatus`, `listing`, `decision`, `cancelPlan` and a brief make of a step's check, of a step that ended without
 * its closeout (UNSIGNED), and of the tries `retries:` and the run's own sign-off nudge file. Pure: each row hands them the engine's
 * view of each task and reads what they decide. A person's asks, answers, a harness's wait and a denied call are in
 * `assess-asks.test.ts`; the functions of a try alone in `src/retry/retry.test.ts`.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import type { TaskView } from 'agent-runtime';
import {
  assess,
  cancelPlan,
  composeBrief,
  decision,
  listing,
  retriesDue,
  retryLines,
  retryRefusal,
  retrySection,
  SIGNOFF,
  stepStatus,
  tryNote,
  type RepositoryRun,
  type RetryBriefing,
  type Run,
  type SpendOf,
  type TaskPhase,
} from '../src/run.ts';
import { dueNote, nextTry, signoffsSpent, type EarlierTry, type RetryHow } from '../src/retry/retry-ask.ts';
import { PRECEDENCE } from '../src/brief/index.ts';
import { CLOSEOUT_SCHEMA, type Closeout } from '../src/closeout/closeout.ts';
import { closeoutAsked } from '../src/views/views.verb.ts';
import { endWords } from '../src/views/views-words.ts';
import type { Verdict } from '../src/check/check.ts';
import type { Workflow } from '../src/workflow.ts';
import { names, phases, run, signedOffOnce, step, STEPS } from './assessed.ts';

const CANCELLED = { cancelledAt: '2026-01-02T00:00:00Z' };
const nothingShipped = () => false;
/** The engine's own phase words, which are free text — `running (working)`, `needs-human`. */
const shown = (m: Record<string, string>) => (id: string) => m[id] ?? 'unknown';
/** How each step signed off, by name. A step not named left no closeout. */
const signedOff = (m: Record<string, Closeout | { error: string }>) => (name: string) => m[name];
const said = (outcome: Closeout['outcome']): Closeout => ({
  outcome,
  summary: 'rewrote the parser\nand the three tests that pinned it',
  artifacts: [],
  needs: outcome === 'blocked' ? 'which flag name ships' : undefined,
});
const statuses = (l: ReturnType<typeof listing>) => l.steps.map((s) => s.status);
/** A run whose two steps are done and whose result sits on a branch. */
const finished = (extra: Partial<RepositoryRun> = {}) =>
  run(
    { implement: 't1', review: 't2' },
    {
      steps: { implement: { taskId: 't1', branch: 'wf/r-1/implement' }, review: { taskId: 't2', branch: 'wf/r-1/review' } },
      ...extra,
    },
  );
const SETTLED = shown({ t1: 'succeeded', t2: 'succeeded' });
/** `implement` declares a check; `review` waits on it. */
const CHECKED: Workflow[] = [{ ...step('implement'), check: 'npm test' }, step('review', ['implement'])];
const signedDone = () => ({ outcome: 'done' as const, summary: 's', artifacts: [], needs: undefined });
/** Every task here was filed asking for a closeout — which is what the runner does. */
const asked = () => true;
/** `implement` filed and settled as the phases say; its check filed under `checkId`, if given. */
const withCheck = (checkId: string | null, extra: Partial<RepositoryRun> = {}) =>
  run(
    {},
    {
      steps: { implement: { taskId: 't1', ...(checkId ? { check: { taskId: checkId } } : {}) }, review: { taskId: null } },
      ...extra,
    },
  );
/** `implement` checked, with `retries: 2`; `review` waits on it. */
const RETRIED: Workflow[] = [{ ...step('implement'), check: 'npm test', retries: 2 }, step('review', ['implement'])];
/** `implement` on the try after `tries`: its task `t1`, its check `check`. `review` not filed. */
const onTry = (tries: EarlierTry[] = [], check: string | null = 'c1', extra: Partial<RepositoryRun> = {}) =>
  run(
    {},
    {
      steps: {
        implement: { taskId: 't1', ...(check ? { check: { taskId: check } } : {}), ...(tries.length ? { tries } : {}) },
        review: { taskId: null },
      },
      ...extra,
    },
  );
/** Two tries `retries: 2` filed. */
const SPENT: EarlierTry[] = [
  { taskId: 't-a', check: { taskId: 'c-a' }, then: 'retries' },
  { taskId: 't-b', check: { taskId: 'c-b' }, then: 'retries' },
];
/** The JSON a brief carries in a fenced block, however long its fence. */
const dataIn = (brief: string) => JSON.parse(/\n(`{3,})json\n([\s\S]*?)\n\1/.exec(brief)![2]);
/** What each task cost, and which its harness cut at its cap. */
const spends =
  (usd: Record<string, number>, budgetEnded: string[] = []): SpendOf =>
  (id) =>
    id in usd || budgetEnded.includes(id)
      ? { usd: usd[id] ?? 0, measured: id in usd ? 1 : 0, unmeasured: id in usd ? 0 : 1, budgetEnded: budgetEnded.includes(id) }
      : undefined;

test("assess and stepStatus of a step's check", async (t) => {
  await t.test('a step without `check:` gets no check, and its follower is filed on its word — it reads unverified', () => {
    const p = phases({ t1: 'succeeded' });
    const a = assess(STEPS, run({ implement: 't1', review: null }), p, signedDone, asked);
    assert.deepEqual(a.check, []);
    assert.deepEqual(a.ready, ['review']);
    assert.equal(stepStatus(STEPS[0], run({ implement: 't1' }), p, signedDone, asked), 'unverified');
  });
  await t.test("a signed step with `check:` is due its check, and its follower is NOT filed on the engine's succeeded", () => {
    const a = assess(CHECKED, withCheck(null), phases({ t1: 'succeeded' }), signedDone, asked);
    assert.deepEqual(a.check, ['implement']);
    assert.deepEqual(a.ready, [], 'succeeded is the session ending, not the work passing');
    assert.equal(a.status, 'running');
  });
  for (const c of ['pending', 'running', 'unknown'] as const)
    await t.test(`a check already filed is checking, and is never due a second time: ${c}`, () => {
      const r = withCheck('c1');
      const p = phases({ t1: 'succeeded', c1: c });
      const a = assess(CHECKED, r, p, signedDone, asked);
      assert.deepEqual([a.check, a.ready, a.status], [[], [], 'running']);
      assert.equal(stepStatus(CHECKED[0], r, p, signedDone, asked), 'checking');
    });
  await t.test('a check that exits 0 verifies the step, and only then is its follower filed', () => {
    const p = phases({ t1: 'succeeded', c1: 'succeeded' });
    assert.deepEqual(assess(CHECKED, withCheck('c1'), p, signedDone, asked).ready, ['review']);
    assert.equal(stepStatus(CHECKED[0], withCheck('c1'), p, signedDone, asked), 'verified');
  });
  for (const c of ['failed', 'stopped'] as const)
    await t.test(`a check that does not exit 0 fails the step, whatever the agent said: ${c}`, () => {
      const p = phases({ t1: 'succeeded', c1: c });
      const a = assess(CHECKED, withCheck('c1'), p, signedDone, asked);
      assert.deepEqual([a.ready, a.blocked, a.status], [[], ['review'], 'failed']);
      assert.equal(stepStatus(CHECKED[0], withCheck('c1'), p, signedDone, asked), 'failed (check)');
    });
  await t.test('a cancelled run files no check, however due', () => {
    const a = assess(CHECKED, withCheck(null, CANCELLED), phases({ t1: 'succeeded' }), signedDone, asked);
    assert.deepEqual(a.check, []);
  });
  await t.test('a task that was never asked for a closeout is not held to one — a run from before closeouts still flows', () => {
    const a = assess(
      STEPS,
      run({ implement: 't1', review: null }),
      phases({ t1: 'succeeded' }),
      () => undefined,
      () => false,
    );
    assert.deepEqual(a.ready, ['review']);
  });
});

test('cancelPlan and decision of a step with a check', async (t) => {
  await t.test('cancelling stops a check in flight', () => {
    const live = cancelPlan(CHECKED, withCheck('c1'), phases({ t1: 'succeeded', c1: 'running' }), signedDone, asked);
    assert.deepEqual(live, { kind: 'cancel', stop: [{ name: 'implement (check)', taskId: 'c1' }] });
  });
  await t.test('a run with a check still due is cancelled rather than called finished', () => {
    const fan: Workflow[] = [{ ...step('a'), check: 'npm test' }, step('b')];
    const r = run({}, { steps: { a: { taskId: 't1' }, b: { taskId: 't2' } } });
    assert.deepEqual(
      cancelPlan(fan, r, phases({ t1: 'succeeded', t2: 'failed' }), signedDone, asked),
      { kind: 'cancel', stop: [] },
      "two roots, one failed: the run reads failed, and a tick would still file a's check",
    );
  });
  await t.test('`nemia decide` names every step that did not earn a follower, each in its own word', () => {
    const four: Workflow[] = [{ ...step('a'), check: 'npm test' }, step('b'), step('c'), step('d')];
    const r = run(
      {},
      {
        steps: {
          a: { taskId: 't1', branch: 'wf/r-1/a', check: { taskId: 'c1' } },
          b: { taskId: 't2', branch: 'wf/r-1/b' },
          c: { taskId: 't3', branch: 'wf/r-1/c' },
          d: { taskId: 't4', branch: 'wf/r-1/d' },
        },
      },
    );
    const p = phases({ t1: 'succeeded', c1: 'failed', t2: 'succeeded', t3: 'succeeded', t4: 'failed' });
    const closeoutOf = (name: string) => (name === 'c' ? undefined : signedDone());
    const d = decision(four, r, p, nothingShipped, closeoutOf, asked, (name) => (name === 'a' ? 1 : undefined));
    assert.equal(d.kind, 'awaiting');
    if (d.kind !== 'awaiting') return;
    assert.deepEqual(
      { failedCheck: d.failedCheck, unfinishedCheck: d.unfinishedCheck, unverified: d.unverified, unsigned: d.unsigned, failed: d.failed },
      { failedCheck: ['a'], unfinishedCheck: [], unverified: ['b'], unsigned: ['c'], failed: ['d'] },
      "a's check exited 1: it refused",
    );
    assert.equal(d.outcome, 'failed');
    const unread = decision(four, r, p, nothingShipped, closeoutOf, asked);
    assert.deepEqual(
      unread.kind === 'awaiting' && [unread.failedCheck, unread.unfinishedCheck, unread.outcome],
      [[], ['a'], 'failed'],
      'with no exit code to read, the same check did not finish, and the run is failed all the same',
    );
  });
  await t.test('a run whose check is still running has nothing to decide yet, and names the step', () => {
    const d = decision(CHECKED, withCheck('c1'), phases({ t1: 'succeeded', c1: 'running' }), nothingShipped, signedDone, asked);
    assert.deepEqual(d, { kind: 'running', waiting: ['implement'] });
  });
});

test("listing of a step's check: what the run established, not only what the engine settled", async (t) => {
  await t.test('verified, checking, refused with its exit, unverified and unsigned; the refused and the unsigned wait on you', () => {
    const five: Workflow[] = [...['a', 'b', 'c'].map((n) => ({ ...step(n), check: 'npm test' })), step('d'), step('e')];
    const r = run(
      {},
      {
        steps: {
          a: { taskId: 't1', branch: 'wf/r-1/a', check: { taskId: 'c1' } },
          b: { taskId: 't2', branch: 'wf/r-1/b', check: { taskId: 'c2' } },
          c: { taskId: 't3', branch: 'wf/r-1/c', check: { taskId: 'c3' } },
          d: { taskId: 't4', branch: 'wf/r-1/d' },
          e: { taskId: 't5', branch: 'wf/r-1/e' },
        },
      },
    );
    const words = shown({
      t1: 'succeeded',
      c1: 'succeeded',
      t2: 'succeeded',
      c2: 'running (working)',
      t3: 'succeeded',
      c3: 'failed',
      t4: 'succeeded',
      t5: 'succeeded',
    });
    const l = listing({
      steps: five,
      run: r,
      phaseOf: words,
      closeoutOf: signedOff({ a: said('done'), b: said('done'), c: said('done'), d: said('done') }),
      askedCloseout: asked,
      verdictOf: (name) => (name === 'c' ? 1 : undefined),
    });
    assert.deepEqual(statuses(l), ['verified ✓', 'checking', 'failed ✗ check (exit 1)', 'unverified · done', 'unsigned']);
    assert.deepEqual(l.waitingOnYou, ['c', 'e'], 'the check that refused and the step that never signed');
  });
  await t.test('a check stopped before it printed its exit code reads unfinished, never a number', () => {
    const l = listing({
      steps: CHECKED,
      run: withCheck('c1'),
      phaseOf: shown({ t1: 'succeeded', c1: 'failed' }),
      closeoutOf: signedOff({ implement: said('done') }),
      askedCloseout: asked,
    });
    assert.deepEqual(statuses(l), ['failed ✗ check (unfinished)', 'waiting']);
  });
});

test('UNSIGNED: a step asked for a closeout that ended without one', async (t) => {
  await t.test('satisfies nothing, and is not checked; without a check the same holds', () => {
    const p = phases({ t1: 'succeeded' });
    const none = () => undefined;
    const a = assess(CHECKED, withCheck(null), p, none, asked);
    assert.deepEqual([a.ready, a.check, a.blocked, a.status], [[], [], ['review'], 'blocked'], 'no signed work to check');
    assert.equal(stepStatus(CHECKED[0], withCheck(null), p, none, asked), 'unsigned');
    assert.deepEqual(
      assess(STEPS, run({ implement: 't1', review: null }), p, none, asked).ready,
      [],
      'without a check the same holds: going quiet is not saying done',
    );
  });
  const r = signedOffOnce(run({ implement: 't1', review: null }));
  const failed = phases({ t1: 'failed' });
  const none = () => undefined;
  const quiet = () => 'unsigned' as const;
  await t.test('settled `failed` and quiet, its nudge spent: unsigned; failed otherwise, stopped, running, or blocked as it signed', () => {
    assert.equal(stepStatus(STEPS[0], r, failed, none, quiet), 'unsigned');
    assert.equal(stepStatus(STEPS[0], r, failed, none, asked), 'failed', 'its attempt ended for another reason');
    assert.equal(stepStatus(STEPS[0], r, phases({ t1: 'stopped' }), none, quiet), 'stopped', 'a person stopped it');
    assert.equal(stepStatus(STEPS[0], r, phases({ t1: 'running' }), none, quiet), 'running', 'nudged, and not settled');
    assert.equal(
      stepStatus(STEPS[0], r, failed, () => said('blocked'), quiet),
      'blocked',
    );
  });
  const brief = (askedCloseout: typeof asked | typeof quiet) =>
    composeBrief(STEPS[0], r, STEPS, undefined, undefined, undefined, {
      try: 2,
      by: 'ask',
      mode: 'nudge',
      resumed: true,
      status: stepStatus(STEPS[0], r, failed, none, askedCloseout),
    });
  await t.test('gone quiet, it waits on you and blocks the run, and a nudge is told it gave none', () => {
    const quietly = decision(STEPS, r, failed, nothingShipped, none, quiet);
    assert.deepEqual(quietly.kind === 'awaiting' && [quietly.outcome, quietly.unsigned, quietly.failed], ['blocked', ['implement'], []]);
    assert.deepEqual(
      listing({ steps: STEPS, run: r, phaseOf: shown({ t1: 'failed' }), closeoutOf: none, askedCloseout: quiet }).waitingOnYou,
      ['implement'],
    );
    assert.match(brief(quiet), /The last try ended without the closeout the run asked for/);
  });
  await t.test('failed for another reason, it reads failed, waits on nobody, and a nudge is told it failed', () => {
    const broke = decision(STEPS, r, failed, nothingShipped, none, asked);
    assert.deepEqual(broke.kind === 'awaiting' && [broke.outcome, broke.unsigned, broke.failed], ['failed', [], ['implement']]);
    assert.deepEqual(
      listing({ steps: STEPS, run: r, phaseOf: shown({ t1: 'failed' }), closeoutOf: none, askedCloseout: asked }).waitingOnYou,
      [],
    );
    assert.match(brief(asked), /session ended `failed` before it signed off/);
  });
});

/** The engine's view of `t1`, settled `settled`, one attempt per end given; asked for a closeout unless `closeout` is false. */
const viewed = (settled: string, ends: Array<Record<string, unknown>>, closeout = true) =>
  new Map([
    [
      't1',
      {
        id: 't1',
        phase: settled,
        sessionId: 's',
        state: {
          taskId: 't1',
          brief: 'filed',
          cwd: '/wt',
          closeoutSchema: closeout ? CLOSEOUT_SCHEMA : undefined,
          settled,
          stopRequested: false,
          attempts: ends.map((end, i) => ({
            n: i + 1,
            startedAt: `2026-09-16T10:0${i * 2}:00.000Z`,
            spawnedAt: `2026-09-16T10:0${i * 2}:00.000Z`,
            endedAt: `2026-09-16T10:0${i * 2 + 1}:00.000Z`,
            nativeId: 'native-t1',
            resumeFrom: null,
            usage: null,
            exitCode: null,
            ...end,
          })),
        },
      } as unknown as TaskView,
    ],
  ]);

test("closeoutAsked and endWords: UNSIGNED is the LAST attempt's word, off what the runtime reports", async (t) => {
  const r = signedOffOnce(run({ implement: 't1', review: null }));
  const none = () => undefined;
  const failed = phases({ t1: 'failed' });
  const lsOf = (phase: string, askedCloseout: (id: string) => boolean | 'unsigned') =>
    listing({ steps: STEPS, run: r, phaseOf: shown({ t1: phase }), closeoutOf: none, askedCloseout }).waitingOnYou;
  await t.test('a journal from before stage 4a part 2: quiet then lost reads failed and is not waited on you', () => {
    const lostLast = closeoutAsked(
      viewed('failed', [
        { ended: 'failed', reason: 'unsigned' },
        { ended: 'failed', reason: 'lost' },
      ]),
    );
    assert.equal(lostLast('t1'), true, 'asked, and of two attempts in order, the last ended for another reason');
    assert.equal(stepStatus(STEPS[0], r, failed, none, lostLast), 'failed');
    const broke = decision(STEPS, r, failed, nothingShipped, none, lostLast);
    assert.deepEqual(broke.kind === 'awaiting' && [broke.outcome, broke.unsigned, broke.failed], ['failed', [], ['implement']]);
    assert.deepEqual(lsOf('failed', lostLast), []);
  });
  await t.test('the other way round, lost then quiet, it reads unsigned; quiet twice is quiet', () => {
    const quietLast = closeoutAsked(
      viewed('failed', [
        { ended: 'failed', reason: 'lost' },
        { ended: 'failed', reason: 'unsigned' },
      ]),
    );
    assert.equal(quietLast('t1'), 'unsigned');
    assert.equal(stepStatus(STEPS[0], r, failed, none, quietLast), 'unsigned');
    assert.deepEqual(lsOf('failed', quietLast), ['implement']);
    const twice = viewed('failed', [
      { ended: 'failed', reason: 'unsigned' },
      { ended: 'failed', reason: 'unsigned' },
    ]);
    assert.equal(closeoutAsked(twice)('t1'), 'unsigned', 'quiet twice is quiet');
  });
  const unstated = { ended: 'done', reason: 'harness', stated: false };
  const endingsOf = (v: ReturnType<typeof viewed>) => v.get('t1')!.state.attempts.map((a) => endWords(v.get('t1')!.state, a));
  await t.test('since stage 4a: `done` with `stated: false` reads unsigned, and `failed · unsigned` on endWords', () => {
    const quiet = viewed('succeeded', [unstated]);
    assert.equal(closeoutAsked(quiet)('t1'), 'unsigned');
    assert.equal(stepStatus(STEPS[0], r, phases({ t1: 'succeeded' }), none, closeoutAsked(quiet)), 'unsigned');
    assert.deepEqual(lsOf('succeeded', closeoutAsked(quiet)), ['implement']);
    assert.equal(closeoutAsked(viewed('succeeded', [{ ended: 'failed', reason: 'lost' }, unstated]))('t1'), 'unsigned', 'the LAST');
    assert.deepEqual(endingsOf(quiet), [{ ended: 'failed', reason: 'unsigned' }]);
  });
  await t.test("an old journal's `reason: 'unsigned'` reads the same words", () => {
    const legacy = viewed('failed', [{ ended: 'failed', reason: 'unsigned' }]);
    assert.deepEqual([closeoutAsked(legacy)('t1'), endingsOf(legacy)], ['unsigned', [{ ended: 'failed', reason: 'unsigned' }]]);
  });
  await t.test('a `done` with no `stated` key, or with a statement, is neither; nor a task asked for no statement', () => {
    const before = viewed('succeeded', [{ ended: 'done', reason: 'harness' }]);
    assert.deepEqual([closeoutAsked(before)('t1'), endingsOf(before)], [true, [{ ended: 'done', reason: 'harness' }]]);
    const signed = viewed('succeeded', [
      { ended: 'done', reason: 'harness', stated: true, closeout: { outcome: 'done', summary: 'did it', artifacts: [], needs: null } },
    ]);
    assert.deepEqual([closeoutAsked(signed)('t1'), endingsOf(signed)], [true, [{ ended: 'done', reason: 'harness' }]]);
    const unasked = viewed('succeeded', [unstated], false);
    assert.deepEqual([closeoutAsked(unasked)('t1'), endingsOf(unasked)], [false, [{ ended: 'done', reason: 'harness' }]]);
  });
  type Attempt = TaskView['state']['attempts'][number];
  const state = { closeoutSchema: CLOSEOUT_SCHEMA } as unknown as TaskView['state'];
  const attempt = (end: object) =>
    ({ n: 1, startedAt: 'a', spawnedAt: 'a', endedAt: 'b', nativeId: 'n', usage: null, exitCode: 1, ...end }) as unknown as Attempt;
  const budgetRows: Array<[string, object, { ended: string; reason: string }]> = [
    [
      'BUDGET since stage 4b: cut at its cap is `failed · budget`',
      { ended: 'failed', reason: 'harness', limit: 'budget' },
      { ended: 'failed', reason: 'budget' },
    ],
    [
      'BUDGET: cut while its harness called it done, with no statement — the cap is why, before unsigned',
      { ended: 'done', reason: 'harness', stated: false, limit: 'budget' },
      { ended: 'failed', reason: 'budget' },
    ],
    ["no limit is the runtime's words", { ended: 'failed', reason: 'harness' }, { ended: 'failed', reason: 'harness' }],
    [
      "a limit that is not the budget is the runtime's words",
      { ended: 'failed', reason: 'harness', limit: 'turns' },
      { ended: 'failed', reason: 'harness' },
    ],
  ];
  for (const [name, end, words] of budgetRows) await t.test(name, () => assert.deepEqual(endWords(state, attempt(end)), words));
});

test('`retries:`: the tries the run files on its own when a check refuses', async (t) => {
  const checkFailed = phases({ t1: 'succeeded', c1: 'failed' });
  const lsOf = (r: Run, phase: TaskPhase, verdict: Verdict | undefined) =>
    listing({
      steps: RETRIED,
      run: r,
      phaseOf: shown({ t1: 'succeeded', c1: phase }),
      closeoutOf: signedOff({ implement: said('done') }),
      askedCloseout: asked,
      verdictOf: () => verdict,
    });
  await t.test("a check that checkFailed, with `retries:` left, is due another try on the run's word, waiting on nobody", () => {
    const a = assess(RETRIED, onTry(), checkFailed, signedDone, asked, () => 1);
    assert.deepEqual(a.retry, [{ step: 'implement', try: 2, mode: 'nudge', by: 'retries' }]);
    assert.deepEqual([a.ready, a.blocked, a.status], [[], [], 'running'], 'what waits on it waits; nothing is final yet');
    const l = lsOf(onTry(), 'failed', 1);
    assert.deepEqual(l.steps[0], {
      name: 'implement',
      status: 'failed ✗ check (exit 1)',
      branch: null,
      note: 'try 2 due — retries: 2, 0 spent',
    });
    assert.deepEqual(l.waitingOnYou, [], 'the run is about to try it, so it is not waiting on you');
    assert.deepEqual(
      decision(RETRIED, onTry(), checkFailed, nothingShipped, signedDone, asked, () => 1),
      { kind: 'running', waiting: ['implement'] },
    );
    assert.deepEqual(
      cancelPlan(RETRIED, onTry(), checkFailed, signedDone, asked, () => 1),
      { kind: 'cancel', stop: [] },
      'a tick would still file',
    );
  });
  await t.test('REFUSED past `retries:`: no try is due, and the step waits on you as it did before retries', () => {
    const a = assess(RETRIED, onTry(SPENT), checkFailed, signedDone, asked, () => 1);
    assert.deepEqual([a.retry, a.blocked, a.status], [[], ['review'], 'failed']);
    assert.deepEqual(lsOf(onTry(SPENT), 'failed', 1).waitingOnYou, ['implement']);
    assert.deepEqual(assess(CHECKED, withCheck('c1'), checkFailed, signedDone, asked, () => 1).retry, [], 'nor at all, with no `retries:`');
    assert.deepEqual(
      cancelPlan(CHECKED, withCheck('c1'), checkFailed, signedDone, asked, () => 1),
      { kind: 'cancel', stop: [] },
      'a refused check with no try due waits on a person, so the run is not finished',
    );
  });
  await t.test("a person's tries do not spend what the run may spend on its own", () => {
    const yours: EarlierTry[] = [
      { ...SPENT[0], then: 'nudge' },
      { ...SPENT[1], then: 'fresh' },
    ];
    assert.deepEqual(
      assess(RETRIED, onTry(yours), checkFailed, signedDone, asked, () => 1).retry.map((r) => [r.try, r.by]),
      [[4, 'retries']],
    );
  });
  const unfinished: Array<[TaskPhase, Verdict | undefined, string]> = [
    ['stopped', undefined, 'stopped: killed, or never started'],
    ['stopped', 1, 'stopped, whatever it printed'],
    ['failed', 'unfinished', 'failed with no exit code: stopped at its deadline, or lost'],
  ];
  for (const [phase, verdict, why] of unfinished)
    await t.test(`a check that did not finish is no refusal, spends no retry, and is offered --recheck: ${why}`, () => {
      const p = phases({ t1: 'succeeded', c1: phase });
      const a = assess(RETRIED, onTry(), p, signedDone, asked, () => verdict);
      assert.deepEqual([a.retry, a.blocked, a.status], [[], ['review'], 'failed']);
      assert.deepEqual(lsOf(onTry(), phase, verdict).waitingOnYou, ['implement']);
      const d = decision(RETRIED, onTry(), p, nothingShipped, signedDone, asked, () => verdict);
      assert.deepEqual(d.kind === 'awaiting' && [d.failedCheck, d.unfinishedCheck, d.outcome], [[], ['implement'], 'failed']);
      const lines = retryLines(RETRIED, onTry(), d, p, signedDone, asked);
      assert.equal(lines.length, 1);
      names(lines[0], 'implement:', 'no retry was spent', 'nemia retry r-1 implement --recheck');
    });
  await t.test('a check that did not finish on a step over its budget: --recheck offered, and a new session needs --budget', () => {
    const capped: Workflow[] = [{ ...RETRIED[0], budget: 3 }, RETRIED[1]];
    const over: SpendOf = (id) => (id === 't1' ? { usd: 4, measured: 1, unmeasured: 0, budgetEnded: false } : undefined);
    const p = phases({ t1: 'succeeded', c1: 'stopped' });
    const d = decision(
      capped,
      onTry(),
      p,
      nothingShipped,
      signedDone,
      asked,
      () => undefined,
      [],
      [],
      () => false,
      over,
    );
    assert.deepEqual(d.kind === 'awaiting' && d.unfinishedCheck, ['implement']);
    names(retryLines(capped, onTry(), d, p, signedDone, asked, over)[0], 'nemia retry r-1 implement --recheck', '--budget above $4.00');
    const refusal = (how: RetryHow) =>
      retryRefusal(
        capped,
        onTry(),
        'implement',
        how,
        p,
        signedDone,
        asked,
        () => undefined,
        [],
        () => false,
        over,
      );
    assert.equal(refusal({ mode: 'recheck' }), null, 'its check again needs no --budget');
    names(refusal({ mode: 'nudge' }), 'nemia retry r-1 implement --recheck', 'nemia retry r-1 implement --budget <amount>');
  });
  await t.test('a caller that gives no verdict reads a check stopped at its deadline as the tick does', () => {
    const unread = assess(RETRIED, onTry(), checkFailed, signedDone, asked);
    assert.deepEqual([unread.retry, unread.blocked, unread.status], [[], ['review'], 'failed']);
    assert.deepEqual(
      assess(RETRIED, onTry(), checkFailed, signedDone, asked, () => 'unfinished'),
      unread,
      'the same as the tick',
    );
    assert.deepEqual(cancelPlan(RETRIED, onTry(), checkFailed, signedDone, asked), { kind: 'cancel', stop: [] }, 'not finished');
    const told = decision(RETRIED, onTry(), checkFailed, nothingShipped, signedDone, asked);
    assert.deepEqual(told.kind === 'awaiting' && [told.failedCheck, told.unfinishedCheck], [[], ['implement']]);
  });
  await t.test('a refusal with no tries left is offered the other way', () => {
    const d = decision(RETRIED, onTry(SPENT), checkFailed, nothingShipped, signedDone, asked, () => 1);
    assert.deepEqual(d.kind === 'awaiting' && [d.failedCheck, d.unfinishedCheck], [['implement'], []]);
    assert.match(
      retryLines(RETRIED, onTry(SPENT), d, checkFailed, signedDone, asked)[0],
      /^implement: failed \(check\)\. Continue its session.*nemia retry r-1 implement .*retries: 2, 2 spent/,
    );
  });
  await t.test("the current try decides the step: try 2 verified files what waits on it, and the step's line says which try", () => {
    const r = onTry([{ taskId: 't0', check: { taskId: 'c0' }, then: 'retries' }], 'c1');
    const p = phases({ t0: 'succeeded', c0: 'failed', t1: 'succeeded', c1: 'succeeded' });
    assert.deepEqual(assess(RETRIED, r, p, signedDone, asked, () => 0).ready, ['review']);
    assert.deepEqual(lsOf(r, 'succeeded', undefined).steps[0], {
      name: 'implement',
      status: 'verified ✓',
      branch: null,
      note: 'try 2, by retries: 2',
    });
    assert.equal(
      tryNote(RETRIED[0], { taskId: 't', tries: [{ taskId: 'a', then: 'fresh', model: 'opus' }] }),
      'try 2, fresh on opus, on your word',
    );
    assert.deepEqual(
      listing({ steps: STEPS, run: finished(), phaseOf: SETTLED, closeoutOf: signedOff({}) }).steps.map((s) => 'note' in s),
      [false, false],
      'a first try has no note at all',
    );
  });
});

test('UNSIGNED: the run nudges a step to sign off ITSELF, once a round, before it waits on you', async (t) => {
  const failed = phases({ t1: 'failed' });
  const none = () => undefined;
  const unsignedEnd = () => 'unsigned' as const;
  const r = run({ implement: 't1', review: null });
  const due = (
    x: Run,
    asks: Parameters<typeof retriesDue>[6] = [],
    askedCloseout: (id: string) => boolean | 'unsigned' = unsignedEnd,
    spendOf: SpendOf = () => undefined,
    steps = STEPS,
  ) =>
    retriesDue(
      steps,
      x,
      failed,
      none,
      askedCloseout,
      () => undefined,
      asks,
      () => false,
      spendOf,
    );
  const nudged = { ...r, steps: { ...r.steps, implement: nextTry(r.steps.implement, due(r)[0], 't2') } };
  const lsOf = (x: Run, phase: Record<string, string>) =>
    listing({ steps: STEPS, run: x, phaseOf: shown(phase), closeoutOf: none, askedCloseout: unsignedEnd });
  await t.test('due on its own: the run is moving, waiting on nobody, and says the nudge is due', () => {
    assert.deepEqual(due(r), [{ step: 'implement', try: 2, mode: 'nudge', by: 'signoff' }]);
    const a = assess(STEPS, r, failed, none, unsignedEnd);
    assert.deepEqual([a.retry.map((x) => x.by), a.status], [['signoff'], 'running']);
    assert.deepEqual(lsOf(r, { t1: 'failed' }).waitingOnYou, [], 'nor does nemia ls put it on you');
    assert.equal(dueNote(STEPS[0], r, due(r)[0]), 'try 2 due — a nudge to sign off, once a round: its session ended without its closeout');
  });
  await t.test('`nemia retry` is refused: the run nudges it itself', () => {
    names(
      retryRefusal(STEPS, r, 'implement', { mode: 'nudge' }, failed, none, unsignedEnd),
      'the run nudges implement itself',
      'try 2',
      'nemia ls r-1',
    );
  });
  await t.test('filed, the try is behind it as signoff, and the run says a nudge was tried', () => {
    assert.deepEqual(nudged.steps.implement.tries, [{ taskId: 't1', then: 'signoff' }]);
    assert.equal(signoffsSpent(nudged.steps.implement), 1);
    assert.equal(tryNote(STEPS[0], nudged.steps.implement), 'try 2, nudged to sign off by the run');
  });
  await t.test('never twice in a round: the nudge ended unsigned too, and the step is yours', () => {
    assert.deepEqual(retriesDue(STEPS, nudged, phases({ t2: 'failed' }), none, unsignedEnd), []);
    assert.deepEqual(lsOf(nudged, { t2: 'failed' }).waitingOnYou, ['implement']);
    assert.equal(lsOf(nudged, { t2: 'failed' }).steps[0].note, 'try 2, nudged to sign off by the run');
  });
  const after = (then: 'nudge' | 'round') => ({
    ...nudged,
    steps: {
      implement: {
        taskId: 't3',
        tries: [
          { taskId: 't1', then: 'signoff' as const },
          { taskId: 't2', then },
        ],
      },
      review: { taskId: null },
    },
  });
  await t.test("a person's try in between spends nothing, and does not free another; a round is new work", () => {
    assert.deepEqual(retriesDue(STEPS, after('nudge'), phases({ t3: 'failed' }), none, unsignedEnd), []);
    assert.deepEqual(
      retriesDue(STEPS, after('round'), phases({ t3: 'failed' }), none, unsignedEnd).map((x) => [x.by, x.try]),
      [['signoff', 4]],
    );
  });
  await t.test("a person's ask first; not when the engine did not end it unsigned; never over its budget, nor on a cancelled run", () => {
    assert.deepEqual(
      due(r, [{ step: 'implement', try: 2, mode: 'fresh', at: 'now' }]).map((x) => [x.by, x.mode]),
      [['ask', 'fresh']],
    );
    assert.deepEqual(due(r, [], asked), [], "failed for another reason: a person's");
    assert.deepEqual(retriesDue(STEPS, r, phases({ t1: 'succeeded' }), none, asked), [], "a journal's `done` without a statement");
    const capped: Workflow[] = [{ ...step('implement'), budget: 3 }, step('review', ['implement'])];
    assert.deepEqual(due(r, [], unsignedEnd, spends({ t1: 4 }), capped), [], 'over budget');
    assert.deepEqual(
      due(r, [], unsignedEnd, spends({ t1: 2 }), capped).map((x) => x.by),
      ['signoff'],
      'under it, nudged',
    );
    assert.deepEqual(assess(STEPS, { ...r, ...CANCELLED }, failed, none, unsignedEnd).retry, [], 'a cancelled run files nothing');
  });
});

test("composeBrief of a step's check and of its tries", async (t) => {
  await t.test('a step with `check:` is told the command before it is judged by it — resumed, merged or not — the closeout last', () => {
    const implement: Workflow = { ...step('implement'), check: 'npm test && npm run typecheck' };
    const respond: Workflow = { name: 'respond', after: ['implement'], body: 'answer', resume: 'implement', check: 'npm test' };
    const integrate: Workflow = { name: 'integrate', after: ['a', 'b'], body: 'combine', check: 'npm run build' };
    const cases: Array<[Workflow, Workflow[]]> = [
      [implement, [implement]],
      [{ ...step('review', ['implement']), check: 'npm test' }, STEPS],
      [respond, [implement, respond]],
      [integrate, [step('a'), step('b'), integrate]],
    ];
    for (const [s, steps] of cases) {
      const brief = composeBrief(s, run({ implement: 't1', a: 't2', b: 't3' }), steps);
      assert.ok(brief.includes(`must exit 0 in this workspace: \`${s.check}\``), s.name);
      assert.match(brief, /comes from the run, not from this checkout/);
      assert.ok(brief.indexOf('## Before you sign off') < brief.indexOf('## When you are finished'), `${s.name}: the closeout is last`);
    }
  });
  await t.test('a step without `check:` is told of no check — no command the run will not run', () => {
    for (const s of [step('implement'), step('review', ['implement'])])
      assert.doesNotMatch(composeBrief(s, run({ implement: 't1', review: null }), STEPS), /Before you sign off|must exit 0/);
  });
  const implement: Workflow = { ...step('implement'), check: 'npm test && npm run typecheck', retries: 1 };
  const refusal = {
    command: 'npm test && npm run typecheck',
    verdict: 1 as Verdict,
    stdout: 'not ok 3 - parses a trailing comma',
    stderr: 'npm error Test failed.',
  };
  await t.test('a try continued is told what became of the last, that and no more — and what the check said, as data', () => {
    const nudged = composeBrief(
      implement,
      run({ implement: 't1' }),
      [implement],
      undefined,
      '/wf/runs/r-1/artifacts/implement',
      undefined,
      {
        try: 2,
        by: 'retries',
        mode: 'nudge',
        resumed: true,
        status: 'failed (check)',
        refusal,
      },
    );
    assert.match(nudged, /^## Try 2\n/);
    assert.doesNotMatch(nudged, /do implement|## What was asked for/, 'the session already has its prose and the spec');
    assert.match(nudged, /`retries: 1`/);
    assert.deepEqual(dataIn(nudged), { command: 'npm test && npm run typecheck', exit: 1, stdout: refusal.stdout, stderr: refusal.stderr });
    assert.match(nudged, /Do not weaken the check to pass it/);
    const at = (h: string) => nudged.indexOf(h);
    assert.ok(
      at('## What the check said') < at('## Before you sign off') &&
        at('## Files for the steps after you') < at('## When you are finished'),
      'the contracts stay last',
    );
  });
  await t.test('a new session is told the whole brief, even for a step that resumes another', () => {
    const respond: Workflow = { name: 'respond', after: ['implement'], resume: 'implement', body: 'answer the review', check: 'npm test' };
    const fresh = composeBrief(
      respond,
      run({ implement: 't1', respond: 't2' }),
      [step('implement'), respond],
      undefined,
      undefined,
      undefined,
      {
        try: 2,
        by: 'ask',
        mode: 'fresh',
        model: 'opus',
        resumed: false,
        status: 'failed (check)',
        refusal: { ...refusal, command: 'npm test', verdict: 'unfinished' },
      },
    );
    assert.ok(fresh.startsWith(`${PRECEDENCE}\n\nanswer the review\n\n## What was asked for\n\nadd a flag`));
    assert.match(fresh, /This is a new session/);
    assert.match(fresh, /`nemia retry --model opus`/);
    assert.match(fresh, /It did not finish/);
    assert.equal(dataIn(fresh).exit, 'unfinished');
    assert.ok(fresh.indexOf('## Try 2') < fresh.indexOf('## Before you sign off'));
  });
  await t.test('a stopped step with no check is told it was stopped, and nothing a check said', () => {
    const stopped = composeBrief(step('implement'), run({ implement: 't1' }), STEPS, undefined, undefined, undefined, {
      try: 2,
      by: 'ask',
      mode: 'nudge',
      resumed: true,
      status: 'stopped',
    });
    assert.match(stopped, /was stopped before it signed off/);
    assert.match(stopped, /`nemia retry --nudge`/);
    assert.doesNotMatch(stopped, /What the check said/, 'no check, nothing it said');
  });
  await t.test("the run's sign-off nudge is told in its owner's words, pinned; a new session is told who filed it", () => {
    assert.equal(
      SIGNOFF,
      [
        'Your last turn ended without calling `StructuredOutput`, and this step asks for a closing statement: nothing that waits',
        'on it can start without one.',
        '',
        'The work you did stands. Change nothing, and sign off now: call `StructuredOutput` with your closeout. If the work is not',
        'finished, finish it first and then sign off. If it cannot be finished, sign off anyway, saying what stops it.',
      ].join('\n'),
    );
    const r = run({ implement: 't1', review: null });
    const briefing = (resumed: boolean): RetryBriefing => ({ try: 2, by: 'signoff', mode: 'nudge', resumed, status: 'unsigned' });
    const brief = composeBrief(STEPS[0], r, STEPS, undefined, undefined, undefined, briefing(true));
    assert.ok(brief.startsWith(`## Try 2\n\n${SIGNOFF}\n`), brief);
    assert.match(brief, /## When you are finished/, 'with the closeout contract after it, as on every try');
    const fresh = retrySection(STEPS[0], briefing(false));
    assert.ok(!fresh.includes(SIGNOFF), `with no session to continue, a new one has no last turn to be told of:\n${fresh}`);
    assert.match(
      fresh,
      /The last try ended without the closeout the run asked for[^\n]*\nThe run filed this try itself, once in a round, before it waits on a person\.\n\nThis is a new session\./,
    );
  });
});
