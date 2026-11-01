/**
 * `nemia rm`'s pure half (`forget.ts`), as tables: why a run is not forgotten (`forgetRefusal`), and the one order its reasons and fixes
 * are said in; which worktrees are a run's (`runWorktrees`), which of them a removal leaves (`heldWorktree`) and what becomes of each
 * branch (`branchFates`); what is taken as a run's id (`idRefusal`); and the line that says what was done (`forgetLine`). A refusal is
 * read by the facts it names — the step, the run, the command its fix names — in the order it names them, never by its sentence.
 * `nemia rm` over a store, a place and the engine's stand-in is told in `test/forget.test.ts`.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { branchFates, forgetLine, forgetRefusal, heldWorktree, idRefusal, runWorktrees, type AskName, type Forgot } from './forget.ts';
import type { RepositoryRun, Run, RoundAsk, StepRecord, TaskPhase } from '../run.ts';
import type { Held } from '../place/place.ts';
import type { Closeout } from '../closeout/closeout.ts';
import type { EarlierTry, RetryAsk, RetryMode } from '../retry/retry-ask.ts';
import type { OutputSchema, Workflow } from '../workflow.ts';
import { names, phases, run, step, STEPS } from '../../test/assessed.ts';

const CANCELLED = { cancelledAt: '2026-01-02T00:00:00Z' };
const DONE = phases({ t1: 'succeeded', t2: 'succeeded' });
/** `implement` declares a check; `review` waits on it. */
const CHECKED: Workflow[] = [{ ...step('implement'), check: 'npm test' }, step('review', ['implement'])];
const signedDone = () => ({ outcome: 'done' as const, summary: 's', artifacts: [], needs: undefined });
/** Every task here was filed asking for a closeout — which is what the runner does. */
const asked = () => true;
const none = () => undefined;
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
/** A person's ask for implement's try `n`. */
const askFor = (n: number, mode: RetryMode = 'continue'): RetryAsk => ({ step: 'implement', try: n, mode, at: '2026-09-13T10:00:00.000Z' });
const roundAskFor = (round: number): RoundAsk => ({ step: 'review', round, at: '2026-09-13T12:00:00.000Z' });
/** Where an ask's file is, as the store says it. */
/** The file each ask is named by, as the store names it: a try's `retry-…`, a round's `round-…`, a merge of the base's `merge-…`. */
const FILE_OF = { try: 'retry', round: 'round', base: 'merge' } as const;
const at = (a: AskName) => `/wf/runs/r-1.asks/${FILE_OF[a.of]}-${a.step}-${a.n}`;
const until = (id: string) => ({ hold: { at: '2026-01-01T01:00:00Z', until: [id] } });
/** A run held until r-1 lands. */
const heldBy = (id: string) => run({ implement: 't9' }, { id, ...until('r-1') });
/** A run waiting on r-1 that has not started. */
const child = (id: string, rest: Partial<RepositoryRun> = {}) => run({ implement: null, review: null }, { id, after: ['r-1'], ...rest });

/** `findings` and `again`: what a looping review declares. */
const LOOPING: OutputSchema = {
  type: 'object',
  properties: {
    findings: { type: 'array', items: { type: 'object' } },
    again: { type: 'boolean' },
  },
  required: ['findings', 'again'],
  additionalProperties: false,
};
/** implement, checked → review, looping back to it with `rounds: 3` — and ship, after the loop. */
const LOOP: Workflow[] = [
  { ...step('implement'), check: 'npm test' },
  { ...step('review', ['implement']), output: { file: 'review.schema.json', schema: LOOPING }, loop: 'implement', rounds: 3 },
  step('ship', ['review']),
];
/** The loop on round `n`: implement's `i<n>` checked by `c<n>`, review's `r<n>`, each with its earlier rounds behind it; ship unfiled. */
const inRound = (n: number, extra: Partial<RepositoryRun> = {}): Run => {
  const earlier = (prefix: string, checked: boolean): EarlierTry[] =>
    Array.from({ length: n - 1 }, (_, k) => ({
      taskId: `${prefix}${k + 1}`,
      ...(checked ? { check: { taskId: `c${k + 1}` } } : {}),
      cause: 'round' as const,
    }));
  const tries = (t: EarlierTry[]) => (t.length ? { tries: t } : {});
  return run(
    {},
    {
      steps: {
        implement: { taskId: `i${n}`, check: { taskId: `c${n}` }, ...tries(earlier('i', true)) },
        review: { taskId: `r${n}`, ...tries(earlier('r', false)) },
        ship: { taskId: null },
      },
      ...extra,
    },
  );
};
const ALL_SUCCEEDED = (): TaskPhase => 'succeeded';
/** implement's closeout and review's, saying `again`. */
const saidIn =
  (n: number, again: unknown) =>
  (name: string): Closeout | undefined =>
    name === 'review'
      ? { outcome: 'done', summary: 'REVIEWER-SUMMARY', artifacts: [], needs: undefined, output: { findings: [], again } }
      : name === 'implement'
        ? n > 1
          ? { outcome: 'done', summary: 'IMPLEMENTER-SUMMARY', artifacts: [], needs: undefined, output: { replies: [] } }
          : signedDone()
        : undefined;

/** `implement → ship`, the ending gated, in the repository's checkout, with a check (`landsOnCheck`). */
const SHIP: Workflow = { name: 'ship', after: ['review'], workspace: 'main', gate: true, body: 'Ship it.' };
const LANDER: Workflow = { name: 'ship', after: ['implement'], body: 'land it', workspace: 'main', gate: true, check: 'npm test' };
const LANDING_STEPS = [step('implement'), LANDER];
/** ship filed, signed, its check filed: every phase given, the checkout's state given. */
const atLanding = (rest: Partial<RepositoryRun> = {}, ship: Partial<StepRecord> = {}): Run => ({
  ...run({ implement: 't-impl' }, { approvals: [{ step: 'ship', try: 1, at: '2026-01-01T00:30:00Z' }], ...rest }),
  steps: {
    implement: { taskId: 't-impl', branch: 'wf/r-1/implement' },
    ship: { taskId: 't-ship', check: { taskId: 't-ship-check' }, ...ship },
  },
});

/** That `said` names each of `facts`, each after the one before it: the order a refusal says its reasons, then its fixes, in. */
const inOrder = (said: string | null | undefined, ...facts: string[]): void => {
  names(said, ...facts);
  let from = 0;
  for (const fact of facts) {
    const found = said!.indexOf(fact, from);
    assert.ok(found >= 0, `${JSON.stringify(said)} names ${JSON.stringify(fact)} out of its order`);
    from = found + fact.length;
  }
};
/** That `said` names none of `facts`. */
const lacks = (said: string | null | undefined, ...facts: string[]): void => {
  for (const fact of facts) assert.ok(!said?.includes(fact), `${JSON.stringify(said)} names ${JSON.stringify(fact)}`);
};

test('`forgetRefusal`: which runs `nemia rm` forgets, and what holds each other one, with the fix it names', async (t) => {
  await t.test('a run that is over is forgotten: finished, failed, cancelled settled or never filed, its tasks forgotten', () => {
    assert.equal(forgetRefusal(STEPS, run({ implement: 't1', review: 't2' }), DONE, [], signedDone, asked), null);
    assert.equal(forgetRefusal(STEPS, run({ implement: 't1', review: null }), phases({ t1: 'failed' })), null, 'review is never filed');
    assert.equal(forgetRefusal(STEPS, run({ implement: 't1', review: null }, CANCELLED), phases({ t1: 'stopped' })), null);
    assert.equal(
      forgetRefusal(STEPS, run({ implement: null, review: null }, CANCELLED), phases({})),
      null,
      'a cancelled run files nothing',
    );
    assert.equal(
      forgetRefusal(STEPS, run({ implement: 't-forgotten', review: null }), phases({})),
      null,
      'a task the engine has no record of reads unknown: in flight nowhere, and nothing after it is ready',
    );
  });

  await t.test('REFUSED: a task in flight — steps running and queued, a check running — each named; cancelled, wait for them', () => {
    const fan = [step('a'), step('b'), step('merge', ['a', 'b'])];
    const both = forgetRefusal(fan, run({ a: 't1', b: 't2', merge: null }), phases({ t1: 'running', t2: 'pending' }));
    inOrder(both, 'a is running', 'b is pending', 'nemia cancel r-1', 'nemia rm r-1', '(nemia ls r-1)');
    const check = forgetRefusal(CHECKED, withCheck('c1'), phases({ t1: 'succeeded', c1: 'running' }), [], signedDone, asked);
    inOrder(check, "implement's check is running", 'nemia cancel r-1');
    const cancelled = forgetRefusal(STEPS, run({ implement: 't1', review: null }, CANCELLED), phases({ t1: 'running' }));
    inOrder(cancelled, 'implement is running', '2026-01-02T00:00:00Z', 'nemia rm r-1', '(nemia ls r-1)');
    lacks(cancelled, 'nemia cancel');
  });

  await t.test('REFUSED: anything a pass would file — a step ready, a check, a try or a round due, roots waiting; cancelled, none', () => {
    const ready = run({ implement: 't1', review: null });
    const filing = forgetRefusal(STEPS, ready, phases({ t1: 'succeeded' }), [], signedDone, asked);
    inOrder(filing, 'review is ready to be filed', 'nemia cancel r-1', 'nemia rm r-1');
    lacks(filing, 'nemia ls');
    names(forgetRefusal(STEPS, run({ implement: null, review: null }), phases({})), 'implement is ready to be filed');
    names(forgetRefusal(CHECKED, withCheck(null), phases({ t1: 'succeeded' }), [], signedDone, asked), "implement's check is due");
    names(
      forgetRefusal(RETRIED, onTry(), phases({ t1: 'succeeded', c1: 'failed' }), [], signedDone, asked, () => 1),
      'try 2 of implement is due',
      '(retries: 2)',
    );
    names(forgetRefusal(LOOP, inRound(1), ALL_SUCCEEDED, [], saidIn(1, true), asked), "round 2 of review's loop is due", '(again: true)');
    inOrder(
      forgetRefusal(STEPS, run({ implement: null, review: null }, { after: ['p-1', 'p-2'] }), phases({})),
      'waits on p-1 and p-2',
      'files implement',
      'nemia cancel r-1',
      'nemia rm r-1',
    );

    assert.equal(forgetRefusal(STEPS, { ...ready, ...CANCELLED }, phases({ t1: 'succeeded' }), [], signedDone, asked), null);
    assert.equal(forgetRefusal(CHECKED, withCheck(null, CANCELLED), phases({ t1: 'succeeded' }), [], signedDone, asked), null);
    assert.equal(
      forgetRefusal(RETRIED, onTry([], 'c1', CANCELLED), phases({ t1: 'succeeded', c1: 'failed' }), [], signedDone, asked, () => 1),
      null,
    );
    assert.equal(forgetRefusal(LOOP, inRound(1, CANCELLED), ALL_SUCCEEDED, [], saidIn(1, true), asked), null);
    assert.equal(forgetRefusal(STEPS, run({ implement: null, review: null }, { after: ['p-1'], ...CANCELLED }), phases({})), null);
  });

  await t.test("REFUSED: a person's ask no pass has spent, filed next or taken back by its file; spent, or cancelled, none", () => {
    const unsigned = run({ implement: 't1', review: null });
    const p = phases({ t1: 'succeeded' });
    inOrder(
      forgetRefusal(STEPS, unsigned, p, [], none, asked, undefined, [askFor(2)]),
      'try 2 of implement is due',
      '(nemia retry --continue)',
      'nemia cancel r-1',
    );
    const recheck = forgetRefusal(STEPS, unsigned, p, [], none, asked, undefined, [askFor(2, 'recheck')], [], undefined, at);
    inOrder(recheck, 'try 2 of implement is asked for', 'nemia rm r-1', 'rm /wf/runs/r-1.asks/retry-implement-2');
    lacks(recheck, 'nemia cancel');
    const loop = LOOP.slice(0, 2);
    inOrder(
      forgetRefusal(loop, inRound(1), ALL_SUCCEEDED, [], saidIn(1, false), asked, undefined, [], [roundAskFor(2)], undefined, at),
      "round 2 of review's loop is asked for",
      'rm /wf/runs/r-1.asks/round-review-2',
    );

    const tried = run(
      {},
      { steps: { implement: { taskId: 't1', tries: [{ taskId: 't0', cause: 'continue' }] }, review: { taskId: 't2' } } },
    );
    assert.equal(forgetRefusal(STEPS, tried, DONE, [], signedDone, asked, undefined, [askFor(2)]), null, 'spent: the record holds try 2');
    assert.equal(
      forgetRefusal(loop, inRound(2), ALL_SUCCEEDED, [], saidIn(2, false), asked, undefined, [], [roundAskFor(2)]),
      null,
      'spent: the record is on round 2',
    );
    assert.equal(
      forgetRefusal(STEPS, { ...unsigned, ...CANCELLED }, p, [], none, asked, undefined, [askFor(2), askFor(3, 'recheck')]),
      null,
      'a cancelled run honours no ask',
    );
  });

  await t.test(
    'REFUSED: a run others wait on that have not started names them and how to free it; a child started or called off, none',
    () => {
      const parent = run({ implement: 't1', review: 't2' });
      inOrder(
        forgetRefusal(STEPS, parent, DONE, [child('c-2'), child('c-1')], signedDone, asked),
        'c-1 and c-2 wait on it',
        'waiting on r-1 (no such run)',
        'nemia decide says r-1 has landed',
        'nemia cancel c-1, nemia cancel c-2',
      );
      names(forgetRefusal(STEPS, parent, DONE, [child('c-1', { after: ['p-0', 'r-1'] })], signedDone, asked), 'c-1 waits on it');
      const started = run({ implement: 'x1', review: null }, { id: 'c-1', after: ['r-1'] });
      assert.equal(
        forgetRefusal(STEPS, parent, DONE, [started, child('c-2', CANCELLED), child('c-3', { after: ['r-9'] })], signedDone, asked),
        null,
      );
    },
  );

  await t.test('every reason at once; a record whose folder no longer reads is judged on its tasks, its asks and its children', () => {
    const both = forgetRefusal(STEPS, run({ implement: 't1', review: null }), phases({ t1: 'running' }), [
      run({ implement: null }, { id: 'c-1', after: ['r-1'] }),
    ]);
    inOrder(both, 'implement is running', 'c-1 waits on it', 'nemia cancel r-1', '(nemia ls r-1)', 'nemia cancel c-1');
    assert.ok(both!.endsWith('nemia cancel c-1.'), both!);

    const unfrozen = run({ implement: 't1', review: null });
    assert.equal(forgetRefusal(undefined, unfrozen, phases({ t1: 'succeeded' })), null, 'review is never filed without the folder');
    names(forgetRefusal(undefined, unfrozen, phases({ t1: 'running' })), 'implement is running', 'nemia cancel r-1');
    names(
      forgetRefusal(undefined, unfrozen, phases({ t1: 'succeeded' }), [], undefined, undefined, undefined, [askFor(2)]),
      'try 2 of implement is asked for',
    );
    names(
      forgetRefusal(undefined, unfrozen, phases({ t1: 'succeeded' }), [run({ implement: null }, { id: 'c-1', after: ['r-1'] })]),
      'c-1 waits on it',
    );
  });
});

test('`forgetRefusal` says its reasons in one order — in flight, a merge staged, the gates, what is due, the asks, the runs stranded, the runs held — then each fix in the same order, and each in its plural', async (t) => {
  const unsigned = run({ implement: 't1', review: null });
  const signed = phases({ t1: 'succeeded', t2: 'succeeded' });
  const fan = [step('plan'), step('design'), step('a'), step('b')];
  const gatedRun = run({ plan: 't1', design: 't2', a: null, b: null }, { gates: ['plan', 'design'] });
  const pair = [step('a'), step('b')];

  await t.test('in flight, an ask, a child and a hold: the reasons, then their four fixes, in that order', () => {
    inOrder(
      forgetRefusal(
        STEPS,
        unsigned,
        phases({ t1: 'running' }),
        [heldBy('h-1'), child('c-1')],
        none,
        asked,
        undefined,
        [askFor(2, 'recheck')],
        [],
        undefined,
        at,
      ),
      'implement is running',
      'try 2 of implement is asked for',
      'c-1 waits on it',
      'h-1 is held until it lands',
      'nemia cancel r-1',
      '(nemia ls r-1)',
      'rm /wf/runs/r-1.asks/retry-implement-2',
      'nemia cancel c-1',
      'nemia hold h-1 --off',
    );
  });

  await t.test('the gates before what is due, two steps ready said as them; and the prune its fixes end in, as asked', () => {
    inOrder(
      forgetRefusal(fan, gatedRun, signed, [], signedDone, asked),
      'plan and design wait at their gates',
      'nemia approve r-1 plan, nemia approve r-1 design',
      'a and b are ready to be filed',
      'nemia cancel r-1',
      'nemia rm r-1',
    );
    const ready = forgetRefusal(pair, run({ a: null, b: null }), signed, [], signedDone, asked);
    inOrder(ready, 'a and b are ready to be filed', 'nemia cancel r-1', 'nemia rm r-1');
    lacks(ready, 'gate');
    const pruned = forgetRefusal(
      pair,
      run({ a: null, b: null }),
      signed,
      [],
      signedDone,
      asked,
      undefined,
      [],
      [],
      undefined,
      undefined,
      [],
      'prune',
    );
    inOrder(pruned, 'a and b are ready to be filed', 'Pruning', 'nemia cancel r-1', 'nemia prune r-1');
    lacks(pruned, 'nemia rm', 'Forgetting');
  });

  await t.test('a run held is read as it will stand once its hold lifts, its gates and what is due each said so', () => {
    inOrder(
      forgetRefusal(fan, { ...gatedRun, ...until('p-9') }, signed, [], signedDone, asked),
      'plan and design wait at their gates',
      'held until p-9 lands',
      'a and b are ready to be filed',
      'held until p-9 lands',
      'nemia rm r-1',
    );
  });

  await t.test('a step ready and a check due are one line of what is due; a round asked for is due by `nemia retry --round`', () => {
    const checked = [step('a'), { ...step('b'), check: 'npm test' }];
    inOrder(forgetRefusal(checked, run({ a: null, b: 't2' }), signed, [], signedDone, asked), 'a is ready to be filed', "b's check is due");
    names(
      forgetRefusal(LOOP, inRound(3), ALL_SUCCEEDED, [], saidIn(3, true), asked, undefined, [], [roundAskFor(4)]),
      "round 4 of review's loop is due",
      '(nemia retry --round)',
    );
  });

  await t.test('ending gates are filed themselves once approved; beside a gate of a step, each of the two said', () => {
    const two = [step('implement'), { ...SHIP, after: ['implement'] }, { ...SHIP, name: 'land', after: ['implement'] }];
    const endings = forgetRefusal(
      two,
      run({ implement: 't1', ship: null, land: null }),
      phases({ t1: 'succeeded' }),
      [],
      signedDone,
      asked,
    );
    inOrder(endings, 'ship and land wait at their gates', 'each is filed', 'nemia approve r-1 ship, nemia approve r-1 land');
    lacks(endings, 'what waits on them');
    const mixed: Workflow[] = [step('plan'), step('implement'), { ...SHIP, after: ['implement'] }];
    inOrder(
      forgetRefusal(mixed, run({ plan: 't1', implement: 't2', ship: null }, { gates: ['plan'] }), signed, [], signedDone, asked),
      'plan and ship wait at their gates',
      'or what waits on it',
      'nemia approve r-1 plan, nemia approve r-1 ship',
    );
  });

  await t.test(
    'in its plural: two asks taken back by one rm, two holds lifted each; cancelled, a hold is lifted and nothing waited for',
    () => {
      inOrder(
        forgetRefusal(
          STEPS,
          unsigned,
          phases({ t1: 'succeeded' }),
          [],
          none,
          asked,
          undefined,
          [askFor(2, 'recheck'), askFor(3, 'recheck')],
          [],
          undefined,
          at,
        ),
        'try 2 of implement and try 3 of implement are asked for',
        'those asks',
        'rm /wf/runs/r-1.asks/retry-implement-2 /wf/runs/r-1.asks/retry-implement-3',
      );
      const holders = [heldBy('h-2'), heldBy('h-1')];
      inOrder(
        forgetRefusal(STEPS, run({ implement: 't1', review: 't2' }), DONE, holders, signedDone, asked),
        'h-1 and h-2 are held until it lands',
        'nemia decide says r-1 has landed',
        'nemia hold h-1 --off, nemia hold h-2 --off',
      );
      const cancelled = forgetRefusal(STEPS, run({ implement: 't1', review: 't2' }, CANCELLED), DONE, holders, signedDone, asked);
      inOrder(cancelled, 'h-1 and h-2 are held until it lands', 'nemia hold h-1 --off, nemia hold h-2 --off');
      lacks(cancelled, 'nemia decide');
    },
  );

  const landed = phases({ 't-impl': 'succeeded', 't-ship': 'succeeded', 't-ship-check': 'succeeded', 't-x': 'succeeded' });
  const closeoutOf = (): Closeout => ({ ...signedDone(), output: { message: 'Add a flag' } });
  const forget = (steps: readonly Workflow[], r: Run, others: readonly Run[], asks: readonly RetryAsk[]) =>
    forgetRefusal(steps, r, landed, others, closeoutOf, () => false, none, asks, [], none, at, [], 'rm', 'ours');

  await t.test('a merge staged and not landed before an ask, a child and a hold, and its fix before theirs', () => {
    inOrder(
      forget(LANDING_STEPS, atLanding(), [child('c-1'), heldBy('h-1')], [askFor(5)]),
      "ship's merge is staged in the repository's checkout (/repo)",
      'try 5 of implement is asked for',
      'c-1 waits on it',
      'h-1 is held until it lands',
      'rm /wf/runs/r-1.asks/retry-implement-5',
      'The next tick lands it',
      "what became of ship's merge",
      'nemia cancel c-1',
      'nemia hold h-1 --off',
    );
  });

  await t.test('a merge staged before a gate; a task in flight before a gate; a wait on runs and what is due before an ask', () => {
    const x: Workflow = { ...step('x', ['implement']), gate: true };
    const r = atLanding({ gates: ['x'] });
    inOrder(
      forget([...LANDING_STEPS, x], { ...r, steps: { ...r.steps, x: { taskId: 't-x' } } }, [], []),
      "ship's merge is staged",
      'x waits at its gate',
      'nemia approve r-1 x',
      'nemia cancel r-1',
      'The next tick lands it',
    );
    const fanIn = [step('plan'), step('design'), step('a', ['plan', 'design'])];
    inOrder(
      forgetRefusal(
        fanIn,
        run({ plan: 't1', design: 't2', a: null }, { gates: ['plan'] }),
        phases({ t1: 'succeeded', t2: 'running' }),
        [],
        signedDone,
        asked,
      ),
      'design is running',
      'plan waits at its gate',
      'nemia approve r-1 plan',
      'nemia cancel r-1',
      '(nemia ls r-1)',
    );
    inOrder(
      forgetRefusal(
        STEPS,
        run({ implement: null, review: null }, { after: ['p-1'] }),
        phases({}),
        [],
        none,
        asked,
        undefined,
        [askFor(5)],
        [],
        undefined,
        at,
      ),
      'it waits on p-1',
      'try 5 of implement is asked for',
      'nemia cancel r-1',
      'rm /wf/runs/r-1.asks/retry-implement-5',
    );
    inOrder(
      forgetRefusal(
        CHECKED,
        withCheck(null),
        phases({ t1: 'succeeded' }),
        [],
        signedDone,
        asked,
        undefined,
        [askFor(5)],
        [],
        undefined,
        at,
      ),
      "implement's check is due",
      'try 5 of implement is asked for',
      'nemia cancel r-1',
      'rm /wf/runs/r-1.asks/retry-implement-5',
    );
  });
});

test("`runWorktrees`, `heldWorktree` and `branchFates`: a run's worktrees, which a removal leaves, and what becomes of each branch", async (t) => {
  const atHeld = (p: string, more: Partial<Held> = {}): Held => ({
    path: p,
    tip: 'def',
    removable: 'yes',
    clean: true,
    onBranch: true,
    ...more,
  });
  await t.test(
    "a run's worktrees are those its place lists inside its own directory — never the repository, nor a run's whose id starts with this one's — each with its step",
    () => {
      const listed: Held[] = [
        atHeld('/repo', { branch: 'main' }),
        atHeld('/wf/worktrees/r-1/implement', { branch: 'wf/r-1/implement' }),
        atHeld('/wf/worktrees/r-1/cut', { branch: 'wf/r-1/cut', removable: 'held', heldBy: 'a person holds it', clean: null }),
        atHeld('/wf/worktrees/r-1/lost', { removable: 'gone', onBranch: false, clean: null }),
        atHeld('/wf/worktrees/r-1-x2/implement', { branch: 'wf/r-1-x2/implement' }),
      ];
      const r = run(
        {},
        {
          steps: {
            implement: { taskId: 't1', workspace: '/wf/worktrees/r-1/implement', branch: 'wf/r-1/implement' },
            review: { taskId: 't2', workspace: '/wf/worktrees/r-1/implement', branch: 'wf/r-1/implement' },
            fixup: { taskId: 't3', workspace: '/wf/worktrees/r-1/fixup', branch: 'wf/r-1/fixup' },
          },
        },
      );
      const { worktrees, unlisted } = runWorktrees(r, ['implement', 'review', 'fixup'], '/wf/worktrees/r-1', listed);
      assert.deepEqual(
        worktrees.map((w) => [w.path, w.step]),
        [
          ['/wf/worktrees/r-1/implement', 'review'],
          ['/wf/worktrees/r-1/cut', 'cut'],
          ['/wf/worktrees/r-1/lost', 'lost'],
        ],
        "review inherits implement's directory; cut was cut by a pass that died before filing it",
      );
      assert.deepEqual(unlisted, ['/wf/worktrees/r-1/fixup']);
      const direct = run({}, { isolate: false, steps: { implement: { taskId: 't1', workspace: '/repo', branch: 'main' } } });
      assert.deepEqual(
        runWorktrees(direct, ['implement'], '/wf/worktrees/r-1', [...listed, atHeld('/wf/worktrees/r-1')]).worktrees.map((w) => w.path),
        ['/wf/worktrees/r-1/implement', '/wf/worktrees/r-1/cut', '/wf/worktrees/r-1/lost'],
        "never the repository, nor the run's directory itself",
      );
      assert.deepEqual(runWorktrees(direct, ['implement'], '/wf/worktrees/r-1', listed.slice(0, 1)), { worktrees: [], unlisted: [] });
    },
  );

  await t.test('REFUSED: `heldWorktree` leaves a worktree someone holds, and one its place reads off its branch, named by its tip', () => {
    const on: Held = { ...atHeld('/wf/worktrees/r-1/implement'), tip: 'abc', branch: 'wf/r-1/implement', clean: false };
    assert.equal(heldWorktree(on), null, 'what it holds uncommitted is handed off onto its branch');
    assert.deepEqual(heldWorktree({ ...on, removable: 'held', heldBy: '', clean: null }), { heldBy: '' });
    assert.deepEqual(heldWorktree({ ...on, removable: 'held', heldBy: 'mine', onBranch: false }), { heldBy: 'mine' }, 'held first');
    assert.deepEqual(
      heldWorktree({ ...on, branch: undefined, onBranch: false }),
      { offBranch: 'abc' },
      'a hand-off would commit onto no branch',
    );
    assert.deepEqual(heldWorktree({ ...on, tip: undefined, onBranch: false }), { offBranch: '' }, 'its tip unread: still held');
    assert.equal(
      heldWorktree({ ...on, branch: undefined, clean: true }),
      null,
      'on its branch as its place reads it: nothing a removal loses',
    );
  });

  await t.test(
    '`branchFates` keeps every branch its place lists for the run unless asked; asked, deletes one merged and keeps one not unless forced — never the base',
    () => {
      const listed = ['main', 'wf/r-1/review', 'wf/r-1/implement'];
      const merged = (b: string) => b !== 'wf/r-1/review';
      const r = { branch: 'main' };
      assert.deepEqual(branchFates(r, listed, merged), [
        { branch: 'wf/r-1/implement', deleted: false, why: 'default' },
        { branch: 'wf/r-1/review', deleted: false, why: 'default' },
      ]);
      assert.deepEqual(branchFates(r, listed, merged, { deleteBranches: true }), [
        { branch: 'wf/r-1/implement', deleted: true, why: 'merged' },
        { branch: 'wf/r-1/review', deleted: false, why: 'unmerged' },
      ]);
      assert.deepEqual(branchFates(r, listed, merged, { deleteBranches: true, forceUnmerged: true }), [
        { branch: 'wf/r-1/implement', deleted: true, why: 'merged' },
        { branch: 'wf/r-1/review', deleted: true, why: 'forced' },
      ]);
      assert.deepEqual(
        branchFates(r, listed, merged, { forceUnmerged: true }).map((b) => b.deleted),
        [false, false],
        '--force-unmerged alone deletes nothing',
      );
    },
  );
});

test("`idRefusal` takes only what `runId` mints — lowercase letters, digits and dashes — and tells an id with a file's suffix the id to give", async (t) => {
  await t.test('an id `runId` mints is taken', () => {
    for (const id of ['add-a-flag-x1y2', 'r-1', '0abc']) assert.equal(idRefusal(id), null, id);
  });
  for (const suffix of ['.json', '.cancelled', '.asks', '.pruned', '.hold'])
    await t.test(`REFUSED: r-xyz${suffix}, the name of one of its files, is told the id`, () => {
      const said = idRefusal(`r-xyz${suffix}`);
      names(said, `"r-xyz${suffix}"`, suffix, 'runs/', 'nemia rm r-xyz.');
      lacks(said, 'add-a-flag');
    });
  await t.test('REFUSED: any other name, a path or a dot among them, is told what an id is made of', () => {
    for (const id of ['..', '.', '', '-r', 'R-XYZ', 'r_xyz', 'r.xyz', 'r xyz', 'runs/r-1', 'r-xyz.json.json'])
      names(idRefusal(id), JSON.stringify(id), 'WF_ROOT', 'nemia rm add-a-flag-x1y2');
  });
  await t.test('REFUSED: the verb it is asked for is the command it names', () => {
    for (const id of ['../x', 'r-1.pruned']) names(idRefusal(id, 'prune'), 'nemia prune');
    names(idRefusal('../x', 'hold'), 'nemia hold');
    names(idRefusal('../x', 'read', 'nemia ls'), 'nemia ls');
  });
});

test('`forgetLine` says in one line what happened to each run: forgotten, with what was handed off and became of each branch; not forgotten, with why and what to do; no such run', async (t) => {
  const forgotten: Forgot = {
    id: 'r-1',
    kind: 'forgotten',
    repo: '/repo',
    base: 'main',
    isolate: true,
    removed: ['/wf/worktrees/r-1/implement', '/wf/worktrees/r-1/review'],
    handedOff: [{ step: 'review', branch: 'wf/r-1/review', commit: '1a2b3c4d5e6f' }],
    gone: [],
    left: [],
    files: ['runs/r-1.json', 'runs/r-1/', 'checks/r-1-implement-check.stderr'],
    branches: [
      { branch: 'wf/r-1/implement', deleted: false, why: 'default' },
      { branch: 'wf/r-1/review', deleted: false, why: 'default' },
    ],
  };
  await t.test('forgotten: its worktrees, the hand-off by its short commit, its files, and each branch kept unless asked', () => {
    const line = forgetLine(forgotten);
    inOrder(
      line,
      'r-1  forgotten: ',
      'removed 2 worktrees',
      'review',
      'wf/r-1/review as 1a2b3c4',
      'removed runs/r-1.json, runs/r-1/, checks/r-1-implement-check.stderr',
      'kept wf/r-1/implement, wf/r-1/review',
      '--delete-branches',
      'main',
    );
    lacks(line, '1a2b3c4d');
  });
  await t.test("forgotten: each branch's fate — merged, forced, unmerged, git's words, a remove unread — and a folder never frozen", () => {
    const gitSaid = 'error: it is checked out elsewhere';
    const unfrozen = 'no workflow folder at /wf/dev';
    const fates = forgetLine({
      ...forgotten,
      removed: [],
      handedOff: [],
      gone: ['/wf/worktrees/r-1/implement'],
      branches: [
        { branch: 'wf/r-1/implement', deleted: true, why: 'merged' },
        { branch: 'wf/r-1/fix', deleted: true, why: 'forced' },
        { branch: 'wf/r-1/review', deleted: false, why: 'unmerged' },
        { branch: 'wf/r-1/odd', deleted: false, why: { git: gitSaid } },
        { branch: 'wf/r-1/plan', deleted: false, why: { unread: 'it exited 1' } },
      ],
      unfrozen,
    });
    assert.ok(fates.startsWith('r-1  forgotten: 1 worktree was already gone; '), fates);
    names(fates, 'removed runs/r-1.json', 'runs/r-1/', 'checks/r-1-implement-check.stderr');
    names(fates, 'deleted wf/r-1/implement (merged into main)', 'wf/r-1/fix (not merged into main, forced)');
    names(fates, 'kept wf/r-1/review: not merged into main', '--force-unmerged');
    names(fates, 'kept wf/r-1/odd:', gitSaid, 'kept wf/r-1/plan:', 'it exited 1', 'nemia rm r-1 again');
    names(fates, 'never frozen', unfrozen);
  });
  await t.test('forgotten: a run that worked in its repository itself had no worktree and no branch of its own', () => {
    inOrder(
      forgetLine({ ...forgotten, isolate: false, removed: [], handedOff: [], branches: [], files: ['runs/r-1.json'] }),
      'r-1  forgotten: ',
      'no worktrees',
      '/repo',
      'removed runs/r-1.json',
      'no branch of its own',
    );
  });
  await t.test("not forgotten: a worktree held, one git would not remove, a stray, each with its fix; and the record's fate", () => {
    const line = forgetLine({
      ...forgotten,
      kind: 'held',
      handedOff: [],
      removed: ['/wf/worktrees/r-1/review'],
      files: [],
      left: [
        {
          path: '/wf/worktrees/r-1/implement',
          heldBy: 'a person holds it',
          fix: 'git -C /repo worktree unlock /wf/worktrees/r-1/implement',
        },
        {
          path: '/wf/worktrees/r-1/fix',
          git: "fatal: '/wf/worktrees/r-1/fix' contains modified or untracked files",
          fix: 'git -C /wf/worktrees/r-1/fix status',
        },
        { path: '/wf/worktrees/r-1/stray', unknown: true },
      ],
    });
    inOrder(
      line,
      'r-1  not forgotten: ',
      '/wf/worktrees/r-1/implement is held (a person holds it)',
      'git -C /repo worktree unlock /wf/worktrees/r-1/implement',
      "fatal: '/wf/worktrees/r-1/fix' contains modified or untracked files",
      'git -C /wf/worktrees/r-1/fix status',
      '/wf/worktrees/r-1/stray',
      'removed 1 worktree',
      'nemia rm r-1 again',
    );
  });
  await t.test('not forgotten: one on no branch at its short commit, a hand-off refused in its words, a handoff unread', () => {
    const line = forgetLine({
      ...forgotten,
      kind: 'held',
      handedOff: [],
      removed: [],
      files: [],
      left: [
        {
          path: '/wf/worktrees/r-1/implement',
          offBranch: '9d2bd34db7ead0116fa7062827675f3a801e940d',
          fix: 'git -C /wf/worktrees/r-1/implement switch -c <branch>',
        },
        {
          path: '/wf/worktrees/r-1/review',
          step: 'review',
          uncommitted: 'lint: src/x.ts:1 unexpected any',
          fix: 'git -C /wf/worktrees/r-1/review commit',
        },
        { path: '/wf/worktrees/r-1/fix', step: 'fix', unread: { verb: 'handoff', said: 'it did not answer within 120s' } },
      ],
    });
    inOrder(
      line,
      '/wf/worktrees/r-1/implement',
      '9d2bd34',
      'git -C /wf/worktrees/r-1/implement switch -c <branch>',
      'nemia rm r-1 again',
      '/wf/worktrees/r-1/review',
      'review',
      'lint: src/x.ts:1 unexpected any',
      'git -C /wf/worktrees/r-1/review commit',
      'nemia rm r-1 again',
      '/wf/worktrees/r-1/fix',
      'handoff',
      'it did not answer within 120s',
      'nemia rm r-1 again',
    );
    lacks(line, '9d2bd34d');
  });
  await t.test('not forgotten: refused, in the words of its refusal', () => {
    const refusedFor = 'implement is running. Forgetting is not cancelling: …';
    const refused: Forgot = {
      id: 'r-1',
      kind: 'refused',
      refusal: refusedFor,
      removed: [],
      handedOff: [],
      gone: [],
      left: [],
      branches: [],
      files: [],
    };
    assert.equal(forgetLine(refused), `r-1  not forgotten: ${refusedFor}`);
  });
  await t.test('no such run: nothing, or what was left under its id removed, or its orphaned worktrees named with what to do', () => {
    const missing: Forgot = { id: 'r-9', kind: 'missing', removed: [], handedOff: [], gone: [], left: [], branches: [], files: [] };
    assert.equal(forgetLine(missing), 'r-9  no such run — nothing to forget');
    inOrder(
      forgetLine({ ...missing, files: ['runs/r-9.asks/', 'runs/r-9.cancelled'] }),
      'r-9  no such run',
      'removed runs/r-9.asks/, runs/r-9.cancelled',
    );
    inOrder(
      forgetLine({
        ...missing,
        left: [{ path: '/wf/worktrees/r-9', orphaned: true, fix: 'git worktree list, and git worktree remove each' }],
      }),
      'r-9  no such run',
      '/wf/worktrees/r-9',
      'git worktree list, and git worktree remove each',
    );
  });
});
