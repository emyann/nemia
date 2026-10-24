/**
 * The pure functions of a try: what a try of a step continues and records (`continuesFrom`, `nextTry`), the model it runs on
 * (`sessionModel`), the ask `nemia pause --now` writes and when it is due or void, what `nemia retry` refuses (`retryRefusal`,
 * `messageRefusal`), what a try is told of why it was filed (`retrySection`), and the words a step waiting on a harness or denied a call
 * is shown with (`waitingWords`, `answerIn`, `harnessWaitLine`, `deniedWords`, `deniedOffer`). One table per function; what `assess`,
 * `listing` and `decision` make of tries is in `test/assess-retries.test.ts`.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import type { Run, StepRecord, TaskPhase } from '../record/record.ts';
import type { Workflow } from '../step/step.ts';
import type { SpendOf } from '../status/status.ts';
import type { Closeout } from '../closeout/closeout.ts';
import type { Verdict } from '../check/check.ts';
import {
  continuesFrom,
  dueNote,
  messageRefusal,
  nextTry,
  sessionModel,
  type EarlierTry,
  type Retry,
  type RetryAsk,
  type RetryHow,
  type RetryMode,
} from './retry-ask.ts';
import { deniedOffer, pauseAskVoid, pauseAsksVoid, retriesDue, tryNote } from './retry.ts';
import { retryRefusal } from './retry-refusal.ts';
import { retrySection } from '../brief/brief-sections.ts';
import { answerIn, deniedWords, harnessWaitLine, waitingWords } from '../list/list.ts';
import { names, phases, run, step, STEPS } from '../../test/assessed.ts';

const CANCELLED = { cancelledAt: '2026-01-02T00:00:00Z' };
const signedDone = (): Closeout => ({ outcome: 'done', summary: 's', artifacts: [], needs: undefined });
const signedBlocked = (): Closeout => ({ outcome: 'blocked', summary: 's', artifacts: [], needs: 'which flag name ships' });
/** Every task here was filed asking for a closeout — which is what the runner does. */
const asked = () => true;
/** `implement` checked, with `retries: 2`; `review` waits on it. */
const RETRIED: Workflow[] = [{ ...step('implement'), check: 'npm test', retries: 2 }, step('review', ['implement'])];
/** `implement` on the try after `tries`: its task `t1`, its check `check`. `review` not filed. */
const onTry = (tries: EarlierTry[] = [], check: string | null = 'c1', extra: Partial<Run> = {}): Run =>
  run(
    {},
    {
      steps: {
        implement: { taskId: 't1', ...(check ? { check: { taskId: check } } : {}), ...(tries.length ? { tries } : {}) },
        review: { taskId: null },
      },
      ...(extra as object),
    },
  );
/** A person's ask for implement's try `n`. */
const askFor = (n: number, mode: RetryMode = 'nudge', model?: string): RetryAsk => ({
  step: 'implement',
  try: n,
  mode,
  ...(model ? { model } : {}),
  at: '2026-09-13T10:00:00.000Z',
});
/** Two tries `retries: 2` filed. */
const SPENT: EarlierTry[] = [
  { taskId: 't-a', check: { taskId: 'c-a' }, cause: 'retries' },
  { taskId: 't-b', check: { taskId: 'c-b' }, cause: 'retries' },
];

test('continuesFrom: the session a try continues (open issue 5)', async (t) => {
  const attempt = (nativeId: string | null, reason: string | null, resumeFrom?: string) => ({
    nativeId,
    reason,
    ...(resumeFrom ? { resumeFrom } : {}),
  });
  const rows: Array<{ name: string; attempts: Parameters<typeof continuesFrom>[0]; continues: string | undefined }> = [
    { name: 'its own id first, even when it continued another', attempts: [attempt('s-2', 'harness', 's-1')], continues: 's-2' },
    { name: 'refused before a session ran: the chain it was handed', attempts: [attempt(null, 'unstartable', 's-1')], continues: 's-1' },
    { name: 'lost with no id: the session it continued', attempts: [attempt(null, 'lost', 's-1')], continues: 's-1' },
    { name: 'lost on a fresh session: a fresh one again', attempts: [attempt(null, 'lost')], continues: undefined },
    { name: 'ended on its harness before it said its id', attempts: [attempt(null, 'harness', 's-1')], continues: 's-1' },
    { name: 'unstartable on a fresh session: a fresh one again', attempts: [attempt(null, 'unstartable')], continues: undefined },
    {
      name: 'the last attempt is read, not the first',
      attempts: [attempt('s-9', 'harness'), attempt(null, 'unstartable', 's-1')],
      continues: 's-1',
    },
    { name: 'no attempt continues nothing', attempts: [], continues: undefined },
    { name: 'no attempts read continue nothing', attempts: undefined, continues: undefined },
  ];
  for (const { name, attempts, continues } of rows) await t.test(name, () => assert.equal(continuesFrom(attempts), continues));
});

test("sessionModel: a continued try runs on the model its session was started on, and a `--fresh` one goes back to the step's", async (t) => {
  const OPUS: Workflow = { ...step('implement'), model: 'opus' };
  const on = (...tries: EarlierTry[]): StepRecord => ({ taskId: 'now', tries });
  const rows: Array<[string, Workflow, StepRecord | undefined, string | undefined]> = [
    ["the first try: the step's model", OPUS, undefined, 'opus'],
    ['a step with no model: the harness default, every try', step('implement'), on({ taskId: 'a', cause: 'nudge' }), undefined],
    ["a `--model` try's model", OPUS, on({ taskId: 'a', cause: 'fresh', model: 'sonnet' }), 'sonnet'],
    [
      "a `--model` try's, past nudges, rounds, retries and rechecks",
      OPUS,
      on(
        { taskId: 'a', cause: 'fresh', model: 'sonnet' },
        { taskId: 'b', cause: 'nudge' },
        { taskId: 'c', cause: 'round' },
        { taskId: 'd', cause: 'retries' },
        { taskId: 'e', cause: 'recheck' },
      ),
      'sonnet',
    ],
    [
      "a bare `--fresh` after it goes back to the step's",
      OPUS,
      on({ taskId: 'a', cause: 'fresh', model: 'sonnet' }, { taskId: 'b', cause: 'fresh' }, { taskId: 'c', cause: 'nudge' }),
      'opus',
    ],
  ];
  for (const [name, workflow, record, model] of rows) await t.test(name, () => assert.equal(sessionModel(workflow, record), model));
});

test('nextTry: the try a step moves behind', async (t) => {
  const record: StepRecord = {
    taskId: 'r-1-implement',
    workspace: '/wt',
    branch: 'wf/r-1/implement',
    check: { taskId: 'r-1-implement-check' },
  };
  await t.test('a nudge files a new task behind the old: the step keeps its workspace and branch', () => {
    assert.deepEqual(nextTry(record, { step: 'implement', try: 2, mode: 'nudge', by: 'retries' }, 'r-1-implement-try2'), {
      taskId: 'r-1-implement-try2',
      workspace: '/wt',
      branch: 'wf/r-1/implement',
      tries: [{ taskId: 'r-1-implement', check: { taskId: 'r-1-implement-check' }, cause: 'retries' }],
    });
  });
  await t.test('a recheck keeps its task, and a fresh try after it keeps its model; the record given is not written into', () => {
    const rechecked = nextTry(record, { step: 'implement', try: 2, mode: 'recheck', by: 'ask' });
    assert.deepEqual(rechecked, {
      taskId: 'r-1-implement',
      workspace: '/wt',
      branch: 'wf/r-1/implement',
      tries: [{ taskId: 'r-1-implement', check: { taskId: 'r-1-implement-check' }, cause: 'recheck' }],
    });
    const fresh = nextTry(rechecked, { step: 'implement', try: 3, mode: 'fresh', model: 'opus', by: 'ask' }, 'r-1-implement-try3');
    assert.deepEqual(
      fresh.tries?.map((x) => [x.cause, x.model]),
      [
        ['recheck', undefined],
        ['fresh', 'opus'],
      ],
    );
    assert.equal(record.tries, undefined, 'the record it was given is not written into');
  });
  await t.test('the try a pause filed keeps its mode, is marked paused, and is said as the pause', () => {
    const paused = nextTry(pauseRun('t1').steps.implement, { step: 'implement', try: 2, mode: 'nudge', by: 'pause' }, 't2');
    assert.deepEqual(paused.tries, [{ taskId: 't1', cause: 'nudge', paused: true }]);
    assert.equal(tryNote(IMPLEMENT, paused), 'try 2, continued after nemia pause --now');
  });
});

const IMPLEMENT: Workflow = { name: 'implement', after: [], body: 'do it', check: 'npm test' };

/** A run whose implement is on its first try: its session `taskId`, and its check's where one is given. */
const pauseRun = (taskId: string, check?: string): Run => ({
  id: 'r-1',
  repo: '/repo',
  workspace: '/wt',
  baseRef: 'abc',
  branch: 'main',
  isolate: true,
  brief: 'b',
  workflowDir: '/wf',
  createdAt: '2026-10-04T00:00:00Z',
  steps: { implement: { taskId, ...(check ? { check: { taskId: check } } : {}) } },
});

/** The ask a pause writes for try 2 of implement: a nudge of the session it stopped, or a recheck of the check. */
const pauseAsk = (interrupted: string, mode: 'nudge' | 'recheck' = 'nudge'): RetryAsk => ({
  step: 'implement',
  try: 2,
  mode,
  interrupted,
  at: '2026-10-04T12:00:00Z',
});

/** A person's ask of the same try and mode: what is due where a pause's is not, so each fixture refuses on the rule alone. */
const ownAsk = (mode: 'nudge' | 'recheck' = 'nudge'): RetryAsk => ({ step: 'implement', try: 2, mode, at: '2026-10-04T12:00:00Z' });

const pauseDue = (r: Run, phaseOf: (id: string) => TaskPhase, ask: RetryAsk, spendOf?: SpendOf, verdict?: number) =>
  retriesDue(
    [IMPLEMENT],
    r,
    phaseOf,
    undefined,
    undefined,
    () => verdict,
    [ask],
    () => false,
    spendOf,
  );

/** Implement's session over its budget of 1: $2 spent. */
const overOne: SpendOf = (id) => (id === 't1' ? { usd: 2, measured: 1, unmeasured: 0, budgetEnded: false } : undefined);

test('a pause ask (retriesDue, pauseAskVoid): due only on the very task it stopped, void once it ended otherwise', async (t) => {
  await t.test('due on the session it stopped, once settled stopped, on the pause word and with no stop first', () => {
    const p = phases({ t1: 'stopped' });
    assert.deepEqual(pauseDue(pauseRun('t1'), p, pauseAsk('t1')), [{ step: 'implement', try: 2, mode: 'nudge', by: 'pause' }]);
    assert.equal(pauseAskVoid(IMPLEMENT, pauseRun('t1'), pauseAsk('t1'), p), false);
  });
  await t.test('not due while its session still runs, and not void: a person ask would stop it first', () => {
    const p = phases({ t1: 'running' });
    assert.equal(pauseDue(pauseRun('t1'), p, ownAsk())[0]?.stopFirst, true, 'the fixture: a person ask is due with a stop first');
    assert.deepEqual(pauseDue(pauseRun('t1'), p, pauseAsk('t1')), []);
    assert.equal(pauseAskVoid(IMPLEMENT, pauseRun('t1'), pauseAsk('t1'), p), false);
  });
  await t.test('on a session that failed on its own: not due, and void', () => {
    const p = phases({ t1: 'failed' });
    assert.equal(pauseDue(pauseRun('t1'), p, ownAsk()).length, 1, 'the fixture: a person nudge of a failed session is due');
    assert.deepEqual(pauseDue(pauseRun('t1'), p, pauseAsk('t1')), []);
    assert.equal(pauseAskVoid(IMPLEMENT, pauseRun('t1'), pauseAsk('t1'), p), true);
  });
  await t.test('on a session that succeeded on its own: void', () => {
    assert.equal(pauseAskVoid(IMPLEMENT, pauseRun('t1', 'c1'), pauseAsk('t1'), phases({ t1: 'succeeded', c1: 'succeeded' })), true);
  });
  await t.test('whose task is no longer the step current one: not due, and void', () => {
    const p = phases({ t1: 'stopped', t2: 'stopped' });
    assert.equal(pauseDue(pauseRun('t2'), p, ownAsk()).length, 1, 'the fixture: a person nudge of a stopped session is due');
    assert.deepEqual(pauseDue(pauseRun('t2'), p, pauseAsk('t1')), []);
    assert.equal(pauseAskVoid(IMPLEMENT, pauseRun('t2'), pauseAsk('t1'), p), true);
    assert.deepEqual(pauseAsksVoid([IMPLEMENT], pauseRun('t2'), [pauseAsk('t1'), ownAsk()], p), [pauseAsk('t1')]);
  });
  await t.test('rechecks the check it stopped, and is void once that check exited with a number', () => {
    const stopped = phases({ t1: 'succeeded', c1: 'stopped' });
    assert.deepEqual(pauseDue(pauseRun('t1', 'c1'), stopped, pauseAsk('c1', 'recheck')), [
      { step: 'implement', try: 2, mode: 'recheck', by: 'pause' },
    ]);
    const refused = phases({ t1: 'succeeded', c1: 'failed' });
    assert.equal(pauseDue(pauseRun('t1', 'c1'), refused, ownAsk('recheck'), undefined, 1).length, 1, 'the fixture: a person recheck');
    assert.deepEqual(pauseDue(pauseRun('t1', 'c1'), refused, pauseAsk('c1', 'recheck'), undefined, 1), []);
    assert.equal(pauseAskVoid(IMPLEMENT, pauseRun('t1', 'c1'), pauseAsk('c1', 'recheck'), refused), true);
  });
  await t.test('on a step its stopped session took over its budget: void', () => {
    const capped: Workflow = { ...IMPLEMENT, budget: 1 };
    const p = phases({ t1: 'stopped' });
    assert.equal(pauseAskVoid(capped, pauseRun('t1'), pauseAsk('t1'), p, overOne), true);
    assert.equal(pauseAskVoid(capped, pauseRun('t1'), pauseAsk('t1'), p), false, 'under its budget, the same ask stands');
  });
});

test('dueNote: what `nemia ls` says of a try due, by who asked for it', async (t) => {
  const r = run({ implement: 't1', review: null });
  const lacking = run({}, { steps: { implement: { taskId: 't1', filesRead: { taskId: 't1', lacked: { 'notes.md': 'missing' } } } } });
  const checked: Workflow = { ...step('implement'), retries: 2 };
  const rows: Array<[string, Workflow, Run, Retry, string[]]> = [
    [
      'a person ask',
      IMPLEMENT,
      r,
      { step: 'implement', try: 2, mode: 'fresh', by: 'ask' },
      ['try 2 asked', '--fresh', 'the next tick files it'],
    ],
    [
      'the run sign-off nudge',
      IMPLEMENT,
      r,
      { step: 'implement', try: 2, mode: 'nudge', by: 'signoff' },
      ['try 2 due', 'ended without its closeout'],
    ],
    [
      'the sign-off nudge of a closeout that named a file the run lacks',
      IMPLEMENT,
      lacking,
      { step: 'implement', try: 2, mode: 'nudge', by: 'signoff' },
      ['named a file the run does not have'],
    ],
    ['a pause ask', IMPLEMENT, r, { step: 'implement', try: 2, mode: 'nudge', by: 'pause' }, ['try 2 due', 'nemia pause --now']],
    [
      'a try `retries:` files',
      checked,
      r,
      { step: 'implement', try: 2, mode: 'nudge', by: 'retries' },
      ['try 2 due', 'retries: 2, 0 spent'],
    ],
  ];
  for (const [name, s, x, due, facts] of rows) await t.test(name, () => namesFor(name, dueNote(s, x, due), facts));
});

/** What `nemia retry r-1 implement` says over a pause's `asks`: null where it writes its ask. */
const refusalOverPause = (r: Run, phaseOf: (id: string) => TaskPhase, asks: readonly RetryAsk[], budget?: number, spendOf?: SpendOf) =>
  retryRefusal(
    [{ ...IMPLEMENT, ...(spendOf ? { budget: 1 } : {}) }],
    r,
    'implement',
    { mode: 'nudge', ...(budget !== undefined ? { budget } : {}) },
    phaseOf,
    undefined,
    undefined,
    () => (phaseOf('c1') === 'failed' ? 1 : undefined),
    asks,
    () => false,
    spendOf,
  );

/** `retryRefusal` over RETRIED, its verdict `unfinished` unless given. */
const refusalOf = (
  r: Run,
  p: Record<string, TaskPhase>,
  how: RetryHow = { mode: 'nudge' },
  asks: RetryAsk[] = [],
  name = 'implement',
  verdict: Verdict | undefined = 'unfinished',
  steps: Workflow[] = RETRIED,
) => retryRefusal(steps, r, name, how, phases(p), signedDone, asked, () => verdict, asks);

const remote: Workflow[] = [{ ...step('implement'), harness: 'a2a:reviewer' }, step('review', ['implement'])];
const failedRun = () => run({ implement: 't1', review: null });
const waiting = { t1: 'succeeded', c1: 'stopped' } as const;

test('retryRefusal: what `nemia retry` refuses, and what it says to do instead', async (t) => {
  await t.test('a step still running', () => {
    assert.match(refusalOf(failedRun(), { t1: 'running' })!, /^implement is still running.*nemia ls r-1/);
  });
  await t.test('a cancelled run', () => {
    assert.match(refusalOf(onTry([], 'c1', CANCELLED), waiting)!, /^r-1 was cancelled at .*never be honoured/);
    names(refusalOf(onTry([], 'c1', CANCELLED), waiting), 'r-1 was cancelled at 2026-01-02T00:00:00Z', 'nemia start');
  });
  await t.test('a try already asked for', () => {
    assert.match(
      refusalOf(onTry(), waiting, { mode: 'fresh' }, [askFor(2, 'recheck')])!,
      /^try 2 of implement is already asked for \(--recheck, at /,
    );
  });
  await t.test('a step the run tries again itself', () => {
    const said = refusalOf(onTry(), { t1: 'succeeded', c1: 'failed' }, { mode: 'nudge' }, [], 'implement', 1);
    names(said, 'the run tries implement', '`retries: 2` has 2 left', 'try 2', 'nemia ls r-1');
    names(said, 'the run tries implement again itself');
  });
  await t.test('a step the run nudges to sign off itself', () => {
    const said = retryRefusal(
      STEPS,
      failedRun(),
      'implement',
      { mode: 'nudge' },
      phases({ t1: 'failed' }),
      () => undefined,
      () => 'unsigned',
    );
    names(said, 'the run nudges implement itself', 'try 2', 'nemia ls r-1');
  });
  await t.test('a check still due or running', () => {
    assert.match(refusalOf(onTry(), { t1: 'succeeded', c1: 'running' })!, /check is still due or running/);
    names(refusalOf(onTry(), { t1: 'succeeded', c1: 'running' }), "implement's check is still due or running", 'nemia ls r-1');
  });
  await t.test('a verified step', () => assert.match(refusalOf(onTry(), { t1: 'succeeded', c1: 'succeeded' })!, /is verified/));
  await t.test('--recheck of a failed step with no check', () => {
    names(refusalOf(failedRun(), { t1: 'failed' }, { mode: 'recheck' }), 'implement is failed', 'nemia retry r-1 implement (or --fresh)');
  });
  await t.test('--recheck of a step its harness blocked, or denied a call: no check of it failed', () => {
    const blocked = retryRefusal(
      STEPS,
      failedRun(),
      'implement',
      { mode: 'recheck' },
      phases({ t1: 'running' }),
      () => undefined,
      asked,
      undefined,
      [],
      () => true,
    );
    names(blocked, '--recheck', 'blocked by its harness', 'nemia retry r-1 implement (or --fresh)');
    const DENYING: Workflow[] = [{ ...step('implement'), check: 'npm test', denials: 'fail' }, step('review', ['implement'])];
    const deniedOf: SpendOf = (id) =>
      id === 't1' ? { usd: 0, measured: 0, unmeasured: 0, budgetEnded: false, denied: ['Bash(pytest)'] } : undefined;
    const denied = retryRefusal(
      DENYING,
      failedRun(),
      'implement',
      { mode: 'recheck' },
      phases({ t1: 'succeeded' }),
      signedDone,
      asked,
      undefined,
      [],
      () => false,
      deniedOf,
    );
    names(denied, '--recheck', 'implement was denied a call', 'nemia retry r-1 implement (or --fresh)');
  });
  await t.test('a step the workflow does not have', () => {
    assert.match(refusalOf(onTry(), waiting, { mode: 'nudge' }, [], 'deploy')!, /no step "deploy" — its steps are implement, review/);
  });
  await t.test('a step not filed yet', () => {
    names(
      refusalOf(failedRun(), { t1: 'running' }, { mode: 'nudge' }, [], 'review', 'unfinished', STEPS),
      'review has not been filed yet',
      'nemia ls r-1',
    );
  });
  await t.test('a step that signed off blocked whose session has not ended', () => {
    const said = retryRefusal(RETRIED, failedRun(), 'implement', { mode: 'nudge' }, phases({ t1: 'running' }), signedBlocked, asked);
    assert.match(said!, /signed off blocked and its session has not ended/);
  });
  await t.test('a `--model` an `auto` step would drop', () => {
    names(
      refusalOf(failedRun(), { t1: 'failed' }, { mode: 'nudge', model: 'haiku' }, [], 'implement', 'unfinished', STEPS),
      '`--model haiku`',
      'no `permissionMode:`',
      'nemia retry r-1 implement --model sonnet',
      '`permissionMode: acceptEdits`',
      '`permissionMode: dontAsk`',
      '`allowedTools:`',
    );
  });
  await t.test('a `--model` or a `--budget` on a remote step', () => {
    names(
      refusalOf(failedRun(), { t1: 'failed' }, { mode: 'fresh', model: 'opus' }, [], 'implement', 'unfinished', remote),
      '`--model opus`',
      '`harness: a2a:reviewer`',
      'without --model: nemia retry r-1 implement.',
    );
    names(
      refusalOf(failedRun(), { t1: 'failed' }, { mode: 'nudge', budget: 5 }, [], 'implement', 'unfinished', remote),
      '`--budget 5`',
      '`harness: a2a:reviewer`',
      'without --budget: nemia retry r-1 implement.',
    );
  });
  await t.test('a `--budget` on a step with no `budget:`, after an ask already waiting', () => {
    names(
      refusalOf(onTry(), waiting, { mode: 'nudge', budget: 5 }),
      'implement has no `budget:`',
      'without --budget: nemia retry r-1 implement.',
    );
    const waited = refusalOf(onTry(), waiting, { mode: 'nudge', budget: 5 }, [askFor(2)]);
    names(waited, 'try 2 of implement is already asked for', '(--continue, at 2026-09-13T10:00:00.000Z)', 'nemia ls r-1');
    assert.ok(!waited!.includes('`budget:`'), 'an ask already waiting is said first, before the --budget the step would refuse');
  });
  await t.test('let through: each way a step waiting on you can be tried', () => {
    for (const mode of ['nudge', 'fresh', 'recheck'] as const)
      assert.equal(refusalOf(onTry(), waiting, { mode }), null, `${mode}: waiting on you, it may be asked each way it can be tried`);
  });
  await t.test('let through: a refusal past retries, a stopped session, a blocked and settled step', () => {
    assert.equal(refusalOf(onTry(SPENT), { t1: 'succeeded', c1: 'failed' }, { mode: 'nudge' }, [], 'implement', 1), null);
    assert.equal(refusalOf(failedRun(), { t1: 'stopped' }), null, 'a session the harness stopped');
    const settled = retryRefusal(RETRIED, failedRun(), 'implement', { mode: 'fresh' }, phases({ t1: 'succeeded' }), signedBlocked, asked);
    assert.equal(settled, null, 'blocked, and settled');
  });
});

test('retryRefusal of a `--message`: refused by name before anything about the run', async (t) => {
  const p = { t1: 'succeeded', c1: 'stopped' } as const;
  const refusal = (how: RetryHow, r: Run = onTry()) =>
    retryRefusal(RETRIED, r, 'implement', how, phases(p), signedDone, asked, () => 'unfinished');
  await t.test('an empty answer', () => {
    for (const message of ['', '   ', '\n\t'])
      names(refusal({ mode: 'nudge', message }), '--message is empty', 'nemia retry r-1 implement --message "<answer>"');
  });
  await t.test('one on --recheck', () => {
    names(
      refusal({ mode: 'recheck', message: 'the suite is fixed on main' }),
      '--recheck files no session',
      '(nemia retry r-1 implement --recheck)',
    );
  });
  await t.test('before the run: a cancelled one, or a step it lacks, is refused otherwise', () => {
    assert.match(refusal({ mode: 'fresh', message: '' }, onTry([], 'c1', CANCELLED))!, /^--message is empty/);
    const lacks = retryRefusal(RETRIED, onTry(), 'deploy', { mode: 'recheck', message: 'x' }, phases(p), signedDone, asked);
    assert.match(lacks!, /^--message carries your answer/);
  });
  await t.test('messageRefusal: the word the CLI refuses with, before it reads a run', () => {
    assert.equal(messageRefusal({ mode: 'recheck' }), null);
    assert.match(messageRefusal({ mode: 'recheck', message: 'x' })!, /\(nemia retry <runId> <step> --recheck\)/);
  });
  await t.test('let through: each way that files a session takes a message, on a step that did not sign off blocked', () => {
    for (const how of [{ mode: 'nudge' }, { mode: 'fresh' }, { mode: 'fresh', model: 'opus' }] as const)
      assert.equal(refusal({ ...how, message: 'main has the fix for the flake' }), null, JSON.stringify(how));
  });
});

test('retryRefusal over a pause ask of the same try', async (t) => {
  await t.test('void, ended on its own or over its budget: refused as set aside by the next pass', () => {
    const ended = [
      { name: 'a session that failed on its own', r: pauseRun('t1'), p: phases({ t1: 'failed' }) },
      { name: 'a session that succeeded, its check refused', r: pauseRun('t1', 'c1'), p: phases({ t1: 'succeeded', c1: 'failed' }) },
    ];
    const setAside = [
      'try 2 of implement is held by the ask',
      'nemia pause --now',
      'the next pass sets it aside',
      'nemia retry r-1 implement',
    ];
    for (const { name, r, p } of ended) {
      assert.equal(refusalOverPause(r, p, []), null, `the fixture: ${name} may be retried`);
      namesFor(name, refusalOverPause(r, p, [pauseAsk('t1')]), setAside);
    }
    const stopped = phases({ t1: 'stopped' });
    assert.equal(refusalOverPause(pauseRun('t1'), stopped, [], 5, overOne), null, 'the fixture: a stopped session over its budget, raised');
    namesFor('over its budget', refusalOverPause(pauseRun('t1'), stopped, [pauseAsk('t1')], 5, overOne), setAside);
  });
  await t.test('still due — its task the current one, stopped, under its budget: refused', () => {
    const stopped = phases({ t1: 'stopped' });
    assert.equal(refusalOverPause(pauseRun('t1'), stopped, []), null, 'the fixture: a stopped session may be retried');
    assert.match(refusalOverPause(pauseRun('t1'), stopped, [pauseAsk('t1')]) ?? '', /^try 2 of implement is asked by nemia pause --now/);
  });
});

/** `names` of each of `facts`, where `why` says which row. */
const namesFor = (why: string, said: string | null, facts: string[]) => {
  assert.equal(typeof said, 'string', why);
  for (const fact of facts) assert.ok(said!.includes(fact), `${why}: names ${fact}`);
};

test('retrySection: what a try is told of why it was filed', async (t) => {
  await t.test('a try the pause filed: the pause stopped its session and the run filed the try, never a person', () => {
    const brief = retrySection(IMPLEMENT, { try: 2, by: 'pause', mode: 'nudge', resumed: true, status: 'stopped' });
    assert.match(
      brief,
      /The store was paused at once \(`nemia pause --now`\), which stopped this session before it signed off; once resumed, the run filed/,
    );
    assert.doesNotMatch(brief, /A person asked for this try/);
  });
  await t.test('a try of a denied step: what its session was denied, as data, and that it will be denied again', () => {
    const brief = retrySection(step('implement'), {
      try: 2,
      by: 'ask',
      mode: 'fresh',
      resumed: false,
      status: 'denied',
      denied: ['Write(/tmp/w/notes.md)', 'Bash(pytest)'],
    });
    assert.match(
      brief,
      /denials: fail`, so nothing that waits on it started and its check did not run\. This try runs with the same permissions, and the same call will be denied again/,
    );
    assert.match(brief, /## What your session was denied\n\n```text\nWrite\(\/tmp\/w\/notes\.md\)\nBash\(pytest\)\n```/);
    assert.doesNotMatch(
      retrySection(step('implement'), { try: 2, by: 'ask', mode: 'fresh', resumed: false, status: 'unsigned', denied: ['Bash(pytest)'] }),
      /What your session was denied/,
      'only when it is why',
    );
  });
});

test("waitingWords: the harness's own word, with an article only where English wants one, and capped", async (t) => {
  const rows: Array<[string, string, string]> = [
    ['a noun takes `a`', 'permission prompt', 'waiting for a permission prompt'],
    ['trimmed, as the harness spaced it', '   permission prompt  ', 'waiting for a permission prompt'],
    ['a vowel takes `an`', 'input', 'waiting for an input'],
    ['a word that determines itself takes none', 'the workspace trust dialog', 'waiting for the workspace trust dialog'],
    ['an article given is kept', 'an answer', 'waiting for an answer'],
    ['nor a plural', 'tool approvals', 'waiting for tool approvals'],
    ['cut at 60, on a character and not on a space', 'x'.repeat(80), `waiting for a ${'x'.repeat(59)}…`],
    ['cut before the words after 58', `${'x'.repeat(58)} and a great deal more`, `waiting for a ${'x'.repeat(58)}…`],
    [
      'a newline the harness put in the word is a space',
      'permission prompt\nfor Bash(rm -rf /)',
      'waiting for a permission prompt for Bash(rm -rf /)',
    ],
    ['every run of whitespace, to one space', 'permission\t prompt\r\n  for a tool', 'waiting for a permission prompt for a tool'],
    ['collapsed before it is measured', `${'x'.repeat(58)}\n\n\nyy`, `waiting for a ${'x'.repeat(58)}…`],
  ];
  for (const [name, word, said] of rows) await t.test(name, () => assert.equal(waitingWords(word), said));
});

test('answerIn and harnessWaitLine: where a person answers it, alone and after the word', async (t) => {
  const remoteAsk = { run: 'r-1', step: 'ask' };
  const rows: Array<[string, () => string, string]> = [
    ['a session on the record', () => answerIn('ae/t1/1'), 'answer it in Claude Code: claude agents, session ae/t1/1'],
    ['no session on the record: the command still says where', () => answerIn(null), 'answer it in Claude Code: claude agents'],
    [
      'one line, for a screen with room for it',
      () => harnessWaitLine('permission prompt', 'ae/t1/1'),
      'waiting for a permission prompt — answer it in Claude Code: claude agents, session ae/t1/1',
    ],
    ['the line with no session', () => harnessWaitLine('permission prompt', null), `waiting for a permission prompt — ${answerIn(null)}`],
    [
      'a step on a remote A2A agent is answered with nemia say',
      () => answerIn('ae/t1/1', remoteAsk),
      'read its question with nemia logs r-1 ask, and answer it with nemia say r-1 ask "<your answer>"',
    ],
    ["a remote step's line", () => harnessWaitLine('input', 'ae/t1/1', remoteAsk), `waiting for an input — ${answerIn(null, remoteAsk)}`],
  ];
  for (const [name, said, expected] of rows) await t.test(name, () => assert.equal(said(), expected));
});

test('deniedWords: each denied call as a rule names it, one line, the rest counted', async (t) => {
  const rows: Array<[string, string[], string]> = [
    ['two calls', ['Skill(look)', 'Bash(pytest)'], 'denied: Skill(look), Bash(pytest)'],
    ['one call', ['WebFetch'], 'denied: WebFetch'],
    ['none denied, or none recorded: no words at all', [], ''],
    ['a newline or a tab in a path is a space', ['Edit(/tmp/a\nb)', 'Bash(rm\t-rf)'], 'denied: Edit(/tmp/a b), Bash(rm -rf)'],
    ['one long path is cut at 60', [`Read(${'x'.repeat(80)})`], `denied: Read(${'x'.repeat(54)}…`],
    ['five named, the rest counted', ['A', 'B', 'C', 'D', 'E', 'F', 'G'], 'denied: A, B, C, D, E and 2 more'],
    ['five named, none counted', ['A', 'B', 'C', 'D', 'E'], 'denied: A, B, C, D, E'],
  ];
  for (const [name, denied, said] of rows) await t.test(name, () => assert.equal(deniedWords(denied), said));
  await t.test('nothing in the words a padded line cannot hold', () => {
    assert.doesNotMatch(deniedWords(['Edit(/tmp/a\nb)', 'Bash(rm\t-rf)']), /\s\s|[\n\r\t]/);
  });
});

test('deniedOffer: each rule once, one line, the first five named and the rest counted', async (t) => {
  await t.test('one rule, which allows it', () => {
    assert.match(deniedOffer(['Skill(look)']), /its try a call, .* add Skill\(look\) to the folder's allowedTools:, which allows it\./);
  });
  await t.test('each rule once, five named and the rest counted', () => {
    const many = deniedOffer(['Bash(a)', 'Bash(b)', 'Bash(c)', 'Bash(d)', 'Bash(e)', 'Bash(f)', 'Bash(a)']);
    assert.match(many, /add Bash\(a:\*\), Bash\(b:\*\), Bash\(c:\*\), Bash\(d:\*\), Bash\(e:\*\) and 1 more \(nemia logs\) to/);
  });
  await t.test("the harness's words made one line", () => assert.doesNotMatch(deniedOffer(['Bash(rm\n-rf)']), /[\n\t]/));
  await t.test('every call its own deny: nothing to add, and which rule is said', () => {
    const only = deniedOffer(['SendMessage'], { disallowedTools: ['SendMessage'] });
    assert.doesNotMatch(only, /add .* to the folder's allowedTools:/);
    assert.match(
      only,
      /its try a call, .* SendMessage may be its own disallowedTools: at work \(SendMessage\), which beats any allowedTools:, so no rule is offered for it\./,
    );
  });
  await t.test('calls its own deny beside one it does not: the rule for that one, and which rules are at work for them', () => {
    const mixed = deniedOffer(['Bash(npm)', 'SendMessage', 'Bash(pytest)'], { disallowedTools: ['Bash(npm run build)', 'SendMessage'] });
    names(mixed, 'Bash(pytest:*)', 'Bash(npm), SendMessage', '(Bash(npm run build), SendMessage)', 'no rule is offered for them');
  });
});
