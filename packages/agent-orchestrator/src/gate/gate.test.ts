/**
 * A gate's pure facts, as tables: which steps a run is gated at (`gatesOf`, `hasGate`), the approval of the try a step is on
 * (`approvalOf`) and those it is past (`spentApprovals`), whether a step's task stays held open for a person's word (`holdsOpen`,
 * `holdsOpenOn`), what `--gate` and a card's `gate:` refuse (`gateRefusal`), what `nemia approve` refuses (`approvalRefusal`,
 * `approvalWordsRefusal`) and what `nemia decide` prints under a gated step (`gateLines`). The functions of `status/`, `ending/` and
 * `brief/` that a gate turns on are held here, beside the verb that reads them; a gate on disk is `test/gate.test.ts`.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  approvalOf,
  approvalRefusal,
  approvalWordsRefusal,
  gateLines,
  gateRefusal,
  gatesOf,
  hasGate,
  holdsOpen,
  holdsOpenOn,
  retryRefusal,
  spentApprovals,
  type RepositoryRun,
  type Run,
  type TaskPhase,
} from '../run.ts';
import type { Closeout } from '../closeout/closeout.ts';
import type { RetryAsk } from '../retry/retry-ask.ts';
import type { Workflow } from '../workflow.ts';
import { names, phases, run, step } from '../../test/assessed.ts';

/** `plan → implement → review`, as dev-planned is. */
const PLANNED: Workflow[] = [step('plan'), step('implement', ['plan']), step('review', ['implement'])];
/** Plan signed off done, implement and review not filed; gated at plan by `--gate plan` unless told otherwise. */
const atPlan = (extra: Partial<RepositoryRun> = {}) => run({ plan: 't1', implement: null, review: null }, { gates: ['plan'], ...extra });
const PLAN_DONE = phases({ t1: 'succeeded' });
const approval = (name: string, n: number, message?: string) => ({
  step: name,
  try: n,
  at: '2026-09-16T23:10:00.000Z',
  ...(message ? { message } : {}),
});
const signedDone = () => ({ outcome: 'done' as const, summary: 's', artifacts: [], needs: undefined });
const blocked = () => ({ outcome: 'blocked' as const, summary: 's', artifacts: [], needs: 'which reading?' });
/** Every task here was filed asking for a closeout — which is what the runner does. */
const asked = () => true;
const CANCELLED = { cancelledAt: '2026-01-02T00:00:00Z' };
/** Plan on its second try, sent back from its first. */
const onTry2 = (approvals: ReturnType<typeof approval>[]) =>
  atPlan({
    steps: {
      plan: { taskId: 't1-try2', tries: [{ taskId: 't1', cause: 'nudge' }] },
      implement: { taskId: null },
      review: { taskId: null },
    },
    approvals,
  });

test('gatesOf, hasGate', async (t) => {
  const steps: Workflow[] = [step('plan'), step('implement', ['plan']), { ...step('review', ['implement']), gate: true }];
  await t.test("a step is gated by its own `gate: true` or by the run's --gate", () => {
    assert.deepEqual(gatesOf(steps, { gates: ['plan'] }), ['plan', 'review']);
  });
  await t.test("the folder's own, on a run given none", () => {
    assert.deepEqual(gatesOf(steps, {}), ['review']);
  });
  await t.test('a step neither gates is not gated', () => {
    assert.equal(hasGate(steps[1], { gates: ['plan'] }), false);
  });
});

test('approvalOf, spentApprovals', async (t) => {
  await t.test('the approval of the try a step is on, never another step’s', () => {
    const r = atPlan({ approvals: [approval('plan', 1, 'ship the second reading'), approval('implement', 1)] });
    assert.deepEqual(approvalOf(r, 'plan'), approval('plan', 1, 'ship the second reading'));
  });
  await t.test("try 2 is not approved by try 1's approval", () => {
    assert.equal(approvalOf(onTry2([approval('plan', 1)]), 'plan'), undefined);
  });
  await t.test('nor try 1 by an approval of try 2', () => {
    assert.equal(approvalOf(atPlan({ approvals: [approval('plan', 2)] }), 'plan'), undefined);
  });
  await t.test('spent: the approvals of a try the step is past, of no other step', () => {
    assert.deepEqual(spentApprovals(onTry2([approval('plan', 1), approval('plan', 2), approval('implement', 1)])), [approval('plan', 1)]);
  });
});

const PLAN = step('plan');
const CHECKED_PLAN = { ...PLAN, check: 'npm test' };
const at = (extra: Partial<RepositoryRun> = {}) => run({ plan: 't1', implement: null }, extra);
const CHECKING = at({ gates: ['plan'], steps: { plan: { taskId: 't1', check: { taskId: 'c1' } }, implement: { taskId: null } } });
const said = (outcome: Closeout['outcome']): Closeout => ({
  outcome,
  summary: 'rewrote the parser',
  artifacts: [],
  needs: outcome === 'blocked' ? 'which flag name ships' : undefined,
});

/** Each standing `holdsOpen` reads: the step, its run, its phase, its closeout, its check's phase, and whether it holds. */
const HOLDS: Array<[string, Workflow, Run, TaskPhase, Closeout | undefined, TaskPhase | undefined, boolean]> = [
  ['signed off blocked', PLAN, at(), 'succeeded', said('blocked'), undefined, true],
  ['at its gate', PLAN, at({ gates: ['plan'] }), 'succeeded', signedDone(), undefined, true],
  ['gated, its check running: the gate is where it goes next', CHECKED_PLAN, CHECKING, 'succeeded', signedDone(), 'running', true],
  ['REFUSED ungated, signed off done', PLAN, at(), 'succeeded', signedDone(), undefined, false],
  ['REFUSED approved', PLAN, at({ gates: ['plan'], approvals: [approval('plan', 1)] }), 'succeeded', signedDone(), undefined, false],
  ['REFUSED ungated, its check running', CHECKED_PLAN, { ...CHECKING, gates: undefined }, 'succeeded', signedDone(), 'running', false],
  ['REFUSED gated, its check refused: a try of it is its own task', CHECKED_PLAN, CHECKING, 'succeeded', signedDone(), 'failed', false],
  ['REFUSED unsigned', PLAN, at({ gates: ['plan'] }), 'succeeded', undefined, undefined, false],
  ['REFUSED a run called off', PLAN, at({ ...CANCELLED }), 'succeeded', said('blocked'), undefined, false],
  [
    'REFUSED a run pruned',
    PLAN,
    at({ gates: ['plan'], pruned: { at: '2026-01-02T00:00:00Z', worktrees: [] } }),
    'succeeded',
    signedDone(),
    undefined,
    false,
  ],
];

test('holdsOpen', async (t) => {
  for (const [row, w, r, phase, closeout, checkPhase, expected] of HOLDS) {
    await t.test(row, () => {
      const p = phases({ t1: phase, ...(checkPhase ? { c1: checkPhase } : {}) });
      assert.equal(
        holdsOpen(
          w,
          r,
          p,
          () => closeout,
          asked,
          [w, step('implement', [w.name])],
          () => undefined,
        ),
        expected,
      );
    });
  }
});

test('holdsOpenOn', async (t) => {
  for (const [row, given, expected] of [
    ['the default harness, claude', {}, true],
    ['claude', { harness: 'claude' }, true],
    ['REFUSED a codex step', { harness: 'codex' }, false],
  ] as Array<[string, Parameters<typeof holdsOpenOn>[0], boolean]>) {
    await t.test(row, () => assert.equal(holdsOpenOn(given), expected));
  }
});

test('gateRefusal', async (t) => {
  await t.test('steps the workflow has, each once, are no refusal', () => {
    assert.equal(gateRefusal(['plan', 'review'], PLANNED), null);
  });
  await t.test('REFUSED a step the workflow does not have, naming the steps it has', () => {
    names(gateRefusal(['desing'], PLANNED), '--gate desing', 'no step "desing"', 'plan, implement, review');
  });
  await t.test('REFUSED a step given twice', () => {
    names(gateRefusal(['plan', 'plan'], PLANNED), '--gate plan', 'twice', 'one --gate');
  });
  await t.test('REFUSED in the words of what gave it: a card', () => {
    const refusal = gateRefusal(['desing'], PLANNED, (s) => `idea.md: \`gate: ${s}\``);
    names(refusal, 'no step "desing"');
    assert.ok(refusal?.startsWith('idea.md: `gate: desing`'), refusal ?? '');
  });
});

test('gateLines', async (t) => {
  for (const [row, r, p, expected] of [
    [
      'awaiting approval, with the two commands',
      atPlan(),
      PLAN_DONE,
      {
        plan: 'awaiting approval:  nemia approve r-1 plan [--message "<words>"]  — or send it back:  nemia retry r-1 plan --message "<objection>"',
      },
    ],
    [
      'approved, with its words',
      atPlan({ approvals: [approval('plan', 1, 'ship the second reading')] }),
      PLAN_DONE,
      { plan: 'approved 23:10Z — "ship the second reading"' },
    ],
    ['approved, with none', atPlan({ approvals: [approval('plan', 1)] }), PLAN_DONE, { plan: 'approved 23:10Z' }],
    ['nothing for a step not signed off', atPlan(), phases({ t1: 'running' }), {}],
    ['nothing for a step with no gate', atPlan({ gates: undefined }), PLAN_DONE, {}],
    [
      'at its gate on a held run: no command, its approval asked once the hold lifts',
      atPlan({ hold: { at: '2026-09-17T01:00:00.000Z', until: ['r-0'] } }),
      PLAN_DONE,
      { plan: 'awaiting approval:  held until r-0 ships; its approval is asked once the hold lifts' },
    ],
    [
      'at its gate on a pruned run: never approved, and no command offered',
      atPlan({ pruned: { at: '2026-09-17T01:00:00.000Z', worktrees: [] } }),
      PLAN_DONE,
      { plan: 'not approved, and never can be: the run was pruned at 2026-09-17T01:00:00.000Z — its worktrees were removed (nemia prune)' },
    ],
  ] as Array<[string, Run, (id: string) => TaskPhase, Record<string, string>]>) {
    await t.test(row, () => assert.deepEqual(gateLines(PLANNED, r, p, signedDone, asked), expected));
  }
});

/** `nemia approve <run> <name>` of `PLANNED` on `r`, as the verb asks it. */
const refused = (
  r: Run,
  name: string,
  p: (id: string) => TaskPhase,
  closeoutOf: (step: string) => Closeout | undefined = signedDone,
  message?: string,
  asks: RetryAsk[] = [],
) => approvalRefusal(PLANNED, r, name, message, p, closeoutOf, asked, () => undefined, asks);

const WORDLESS: RetryAsk = { step: 'plan', try: 2, mode: 'nudge', at: '2026-09-16T23:00:00.000Z' };

test('approvalRefusal: what may be approved, and what is refused before the gate is read', async (t) => {
  await t.test('a step at its gate may be approved', () => assert.equal(refused(atPlan(), 'plan', PLAN_DONE), null));
  await t.test('with words too', () => assert.equal(refused(atPlan(), 'plan', PLAN_DONE, signedDone, 'ship the second reading'), null));
  await t.test('REFUSED empty words', () => {
    names(
      refused(atPlan(), 'plan', PLAN_DONE, signedDone, ' \n'),
      '--message is empty',
      'nemia approve r-1 plan --message "<words>"',
      'leave --message out',
    );
  });
  await t.test('the CLI refuses empty words in the same words (approvalWordsRefusal)', () => {
    assert.equal(approvalWordsRefusal(''), approvalWordsRefusal(' ', 'nemia approve <runId> <step>'));
  });
  await t.test('REFUSED a step the run does not have', () => {
    names(refused(atPlan(), 'desing', PLAN_DONE), 'r-1 has no step "desing"', 'plan, implement, review');
  });
  await t.test('REFUSED a pruned run', () => {
    names(
      refused(atPlan({ pruned: { at: '2026-09-17T01:00:00.000Z', worktrees: [] } }), 'plan', PLAN_DONE),
      'r-1 was pruned at 2026-09-17T01:00:00.000Z',
      'nemia prune',
      'nemia start',
    );
  });
  await t.test('REFUSED a cancelled run', () => {
    names(refused(atPlan(CANCELLED), 'plan', PLAN_DONE), `r-1 was cancelled at ${CANCELLED.cancelledAt}`, 'nemia start');
  });
  await t.test('REFUSED a step not gated, naming the gates there are', () => {
    const r = run({ plan: 't1', implement: 't2', review: null }, { gates: ['plan'] });
    names(
      refused(r, 'implement', phases({ t1: 'succeeded', t2: 'succeeded' })),
      'implement has no gate',
      'r-1 is gated at plan',
      '`gate: true`',
      'nemia start --gate <step>',
    );
  });
  await t.test('REFUSED a step of a run gated at no step', () => {
    names(refused(atPlan({ gates: undefined }), 'plan', PLAN_DONE), 'plan has no gate', 'r-1 is gated at no step');
  });
});

test('approvalRefusal: a step that has not signed off, each in its own words', async (t) => {
  const unfiled = atPlan({ steps: { plan: { taskId: null }, implement: { taskId: null }, review: { taskId: null } } });
  for (const [row, r, p, closeoutOf, facts] of [
    ['not filed', unfiled, phases({}), signedDone, ['plan has not signed off yet', 'not been filed', 'nemia ls r-1']],
    ['still running', atPlan(), phases({ t1: 'running' }), signedDone, ['plan has not signed off yet', 'still running']],
    [
      'signed off blocked',
      atPlan(),
      PLAN_DONE,
      blocked,
      ['plan has not signed off its work', 'signed off blocked', 'nemia retry r-1 plan --message "<answer>"'],
    ],
    ['ended without its closeout', atPlan(), PLAN_DONE, () => undefined, ['plan has not signed off', 'without its closeout']],
    ['its session failed first', atPlan(), phases({ t1: 'failed' }), () => undefined, ['plan has not signed off', 'session failed first']],
  ] as Array<[string, Run, (id: string) => TaskPhase, (s: string) => Closeout | undefined, string[]]>) {
    await t.test(`REFUSED ${row}`, () => names(refused(r, 'plan', p, closeoutOf), ...facts));
  }
  const checked: Workflow[] = [{ ...step('plan'), check: 'test -f PLAN.md' }, ...PLANNED.slice(1)];
  const withPlanCheck = (phase: TaskPhase) =>
    approvalRefusal(
      checked,
      atPlan({ steps: { plan: { taskId: 't1', check: { taskId: 'c1' } }, implement: { taskId: null }, review: { taskId: null } } }),
      'plan',
      undefined,
      phases({ t1: 'succeeded', c1: phase }),
      signedDone,
      asked,
      () => 1,
    );
  await t.test('REFUSED its check still due or running: a gated step is verified first, then held', () => {
    names(withPlanCheck('running'), 'plan has signed off', 'check is still due or running');
  });
  await t.test('REFUSED its check refused: nothing to approve', () => names(withPlanCheck('failed'), 'plan has not passed its check'));
  await t.test('its check passed, it may be approved', () => assert.equal(withPlanCheck('succeeded'), null));
});

test('approvalRefusal: approved already, and a send-back asked', async (t) => {
  await t.test('REFUSED the try already approved, while it may still be sent back: the send-back is offered', () => {
    names(
      refused(atPlan({ approvals: [approval('plan', 1, 'yes')] }), 'plan', PLAN_DONE),
      'try 1 of plan is already approved',
      '2026-09-16T23:10:00.000Z',
      'nemia retry r-1 plan --message "<objection>"',
    );
    names(refused(atPlan({ approvals: [approval('plan', 1)] }), 'plan', PLAN_DONE), 'on the next tick', 'nemia retry r-1 plan');
  });
  await t.test('REFUSED approved, with words, and handed on: no send-back offered, and the one it no longer offers is refused', () => {
    const filed = run({ plan: 't1', implement: 't2', review: 't3' }, { gates: ['plan'], approvals: [approval('plan', 1, 'yes')] });
    const all = phases({ t1: 'succeeded', t2: 'succeeded', t3: 'succeeded' });
    const refusal = refused(filed, 'plan', all);
    names(refusal, 'try 1 of plan is already approved', 'with words', 'has been filed', 'nemia ls r-1');
    assert.ok(!refusal?.includes('nemia retry'), refusal ?? '');
    const sendBack = retryRefusal(PLANNED, filed, 'plan', { mode: 'nudge', message: 'x' }, all, signedDone, asked);
    assert.ok(sendBack?.startsWith('plan signed off done'), sendBack ?? '');
  });
  await t.test('REFUSED approved, and nothing waits on it: its run goes on without it', () => {
    const one: Workflow[] = [step('implement')];
    const r = run({ implement: 't1' }, { gates: ['implement'], approvals: [approval('implement', 1)] });
    const refusal = approvalRefusal(one, r, 'implement', undefined, phases({ t1: 'succeeded' }), signedDone, asked);
    names(refusal, 'try 1 of implement is already approved', 'nothing waits on it', 'nemia ls r-1');
    assert.ok(!refusal?.includes('nemia retry'), refusal ?? '');
  });
  await t.test('REFUSED a send-back already asked for, of the try after', () => {
    const sendBack: RetryAsk = { ...WORDLESS, message: 'store it first' };
    names(
      refused(atPlan(), 'plan', PLAN_DONE, signedDone, undefined, [sendBack]),
      'try 2 of plan is already asked for',
      '(--nudge, at 2026-09-16T23:00:00.000Z)',
      'try 1',
      'the next tick sends it back',
    );
  });
  await t.test("an ask of another step's try is not this step's: it may be approved", () => {
    assert.equal(refused(atPlan(), 'plan', PLAN_DONE, signedDone, undefined, [{ ...WORDLESS, step: 'review', try: 1 }]), null);
  });
  await t.test('REFUSED a wordless ask at its gate, which no tick honours: delete it, then approve', () => {
    names(
      refused(atPlan(), 'plan', PLAN_DONE, signedDone, undefined, [WORDLESS]),
      'try 2 of plan is asked for',
      '(--nudge, at 2026-09-16T23:00:00.000Z)',
      'with no words',
      'plan is at its gate',
      'retry-plan-2',
      '.asks',
      'nemia retry r-1 plan --message "<objection>"',
    );
  });
});
