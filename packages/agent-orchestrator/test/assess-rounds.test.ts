/**
 * `assess`, `listing` and `decision` on a loop's rounds: `again: true` with rounds left files the next, at the cap a person decides —
 * `nemia round` once more, or `nemia accept` the work as it stands — and from round 2 the target owes its replies. Pure: no disk, no
 * engine, no clock.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  acceptedLines,
  assess,
  cancelPlan,
  decision,
  listing,
  retryLines,
  retryRefusal,
  roundFiled,
  roundLines,
  stepStatus,
  stepTaskId,
  tryNote,
  type RepositoryRun,
  type RoundAsk,
  type Run,
  type TaskPhase,
} from '../src/run.ts';
import type { Closeout } from '../src/closeout/closeout.ts';
import { retriesSpent, type EarlierTry } from '../src/retry/retry-ask.ts';
import { tryOf } from '../src/record/record.ts';
import type { OutputSchema, Workflow } from '../src/workflow.ts';
import { names, phases, run, step } from './assessed.ts';

const asked = () => true;
const signedDone = () => ({ outcome: 'done' as const, summary: 's', artifacts: [], needs: undefined });
const nothingShipped = () => false;
const CANCELLED = { cancelledAt: '2026-01-02T00:00:00Z' };
/** `findings`, strict — as the tests' team's `test/fixtures/team/agents/review.schema.json` declares it. */
const FINDINGS: OutputSchema = {
  type: 'object',
  properties: {
    findings: {
      type: 'array',
      items: {
        type: 'object',
        properties: { file: { type: 'string' }, line: { type: ['integer', 'null'] }, what: { type: 'string' } },
        required: ['file', 'line', 'what'],
        additionalProperties: false,
      },
    },
  },
  required: ['findings'],
  additionalProperties: false,
};
/** `findings` and `again`: what a looping review declares. */
const LOOPING: OutputSchema = {
  ...FINDINGS,
  properties: { ...FINDINGS.properties, again: { type: 'boolean' } },
  required: ['findings', 'again'],
};
/** implement, checked → review, looping back to it with `rounds: 3` as the parser sets it — and ship, after the loop. */
const LOOP: Workflow[] = [
  { ...step('implement'), check: 'npm test' },
  { ...step('review', ['implement']), output: { file: 'review.schema.json', schema: LOOPING }, loop: 'implement', rounds: 3 },
  step('ship', ['review']),
];
const [IMPLEMENT, LOOPING_REVIEW] = [LOOP[0], LOOP[1]];
const FOUND = [{ file: 'src/run.ts', line: 183, what: 'a producer with no findings reads as done' }];
/** How review signed off: its findings, whether to go round again, and a summary that must travel nowhere. */
const reviewed = (again: unknown): Closeout => ({
  outcome: 'done',
  summary: 'REVIEWER-SUMMARY',
  artifacts: [],
  needs: undefined,
  output: { findings: FOUND, again },
});
const REPLIES = [{ finding: 'src/run.ts:183', answer: "won't fix", why: 'an empty list is a review with nothing worth changing' }];
/** How implement signed off past round 1: its replies, and a summary that must travel nowhere. */
const answered: Closeout = {
  outcome: 'done',
  summary: 'IMPLEMENTER-SUMMARY',
  artifacts: [],
  needs: undefined,
  output: { replies: REPLIES },
};
/** The loop on round `n`: implement's `i<n>` checked by `c<n>`, review's `r<n>`, each with its earlier rounds behind it — ship unfiled. */
const inRound = (n: number, extra: Partial<RepositoryRun> = {}): Run => {
  const earlier = (prefix: string, checked: boolean): EarlierTry[] =>
    Array.from({ length: n - 1 }, (_, k) => ({
      taskId: `${prefix}${k + 1}`,
      ...(checked ? { check: { taskId: `c${k + 1}` } } : {}),
      then: 'round' as const,
    }));
  const tries = (t: EarlierTry[]) => (t.length ? { tries: t } : {});
  const steps = {
    implement: { taskId: `i${n}`, check: { taskId: `c${n}` }, ...tries(earlier('i', true)) },
    review: { taskId: `r${n}`, ...tries(earlier('r', false)) },
    ship: { taskId: null },
  };
  return run({}, { steps, ...extra });
};
/** Round `n` with review not filed yet: implement's try is the one at work. */
const reviewDue = (n: number): Run => {
  const r = inRound(n);
  return { ...r, steps: { ...r.steps, review: { taskId: null, tries: r.steps.review.tries } } };
};
const ALL_SUCCEEDED = (): TaskPhase => 'succeeded';
/** implement's closeout — with replies past round 1 — and review's, saying `again`. */
const saidIn =
  (n: number, again: unknown) =>
  (name: string): Closeout | undefined =>
    name === 'review' ? reviewed(again) : name === 'implement' ? (n > 1 ? answered : signedDone()) : undefined;
const roundAskFor = (round: number): RoundAsk => ({ step: 'review', round, at: '2026-09-13T12:00:00.000Z' });
/** Why a person judged a loop's findings later work rather than this run's. */
const ENOUGH = 'the findings are cases no shipped team has: follow-up work, not this run.';
/** Try `t` of review, accepted as it stands at a known time. */
const acceptedTry = (t: number, message: string = ENOUGH): Partial<RepositoryRun> => ({
  acceptances: [{ step: 'review', try: t, at: '2026-09-20T14:05:00.000Z', message }],
});
/** The engine's own phase words, which are free text — `running (working)`. */
const shown = (m: Record<string, string>) => (id: string) => m[id] ?? 'unknown';
/** The loop on round `n`, listed as `nemia ls` lists it, with `more` of the listing's inputs. */
const listed = (r: Run, said: (name: string) => Closeout | undefined, more: Partial<Parameters<typeof listing>[0]> = {}) =>
  listing({ steps: LOOP, run: r, phaseOf: ALL_SUCCEEDED, closeoutOf: said, askedCloseout: asked, ...more });

test('`again: true` with rounds left: a round is due, and what waits on the loop waits on nobody', async (t) => {
  const said = saidIn(1, true);
  await t.test('assess: implement goes again, nothing filed after the loop, the run running', () => {
    const a = assess(LOOP, inRound(1), ALL_SUCCEEDED, said, asked);
    assert.deepEqual(a.round, [{ step: 'review', target: 'implement', round: 2, by: 'again' }]);
    assert.deepEqual([a.ready, a.blocked, a.retry, a.status], [[], [], [], 'running']);
  });
  await t.test("listing: review's word says the round is due, and nobody is waited on", () => {
    const l = listed(inRound(1), said);
    assert.deepEqual(l.steps[1], {
      name: 'review',
      status: 'unverified · done',
      branch: null,
      note: 'round 2 of 3 due — review asked again, and the next tick files implement',
      roundDue: true,
    });
    assert.deepEqual(l.waitingOnYou, []);
  });
  await t.test('decision: still running; a cancel plan stops nothing, since a tick would still file something', () => {
    assert.deepEqual(decision(LOOP, inRound(1), ALL_SUCCEEDED, nothingShipped, said, asked), { kind: 'running', waiting: ['review'] });
    assert.deepEqual(cancelPlan(LOOP, inRound(1), ALL_SUCCEEDED, said, asked), { kind: 'cancel', stop: [] });
  });
  await t.test('`again: false` ends the loop: what waits on it is filed, and with nothing after, the run succeeded', () => {
    const done = assess(LOOP, inRound(2), ALL_SUCCEEDED, saidIn(2, false), asked);
    assert.deepEqual([done.round, done.ready], [[], ['ship']]);
    assert.equal(assess(LOOP.slice(0, 2), inRound(2), ALL_SUCCEEDED, saidIn(2, false), asked).status, 'succeeded');
  });
  await t.test('a cancelled run goes round no more', () => {
    assert.deepEqual(assess(LOOP, inRound(1, CANCELLED), ALL_SUCCEEDED, said, asked).round, []);
  });
});

test('REFUSED at the cap: `again: true` on round 3 of 3 files nothing and reads exhausted, waiting on a person', async (t) => {
  const r = inRound(3);
  const said = saidIn(3, true);
  await t.test('blocked and not failed: nothing filed, ship never will be, and the run is not finished', () => {
    assert.equal(stepStatus(LOOPING_REVIEW, r, ALL_SUCCEEDED, said, asked, LOOP), 'exhausted');
    const a = assess(LOOP, r, ALL_SUCCEEDED, said, asked);
    assert.deepEqual([a.round, a.ready, a.blocked, a.status], [[], [], ['ship'], 'blocked']);
    assert.deepEqual(cancelPlan(LOOP, r, ALL_SUCCEEDED, said, asked), { kind: 'cancel', stop: [] });
  });
  await t.test('listing: rounds exhausted, offering once more, and waiting on you', () => {
    const l = listed(r, said);
    assert.deepEqual(
      l.steps.map((s) => [s.status, s.note]),
      [
        ['verified ✓', 'round 3 of 3'],
        ['rounds exhausted', 'round 3 of 3, and it asked again — once more: nemia round r-1 review'],
        ['waiting', undefined],
      ],
    );
    assert.deepEqual(l.waitingOnYou, ['review']);
  });
  await t.test('decision: awaiting, exhausted; `nemia decide` offers another round, then the work as it stands', () => {
    const d = decision(LOOP, r, ALL_SUCCEEDED, nothingShipped, said, asked);
    assert.ok(d.kind === 'awaiting', d.kind);
    assert.deepEqual([d.outcome, d.exhausted, d.failed, d.stuck, d.unsigned], ['blocked', ['review'], [], [], []]);
    assert.deepEqual(roundLines(LOOP, r, d), [
      'review: it asked for round 4, and `rounds: 3` are spent. Its findings are below. Once more — implement continued, then a new review:  nemia round r-1 review',
      'review: enough — go on with what is there; its findings stay on the record, and ship is filed and handed them with your words:  nemia accept r-1 review --message "<why>"',
    ]);
    assert.deepEqual(retryLines(LOOP, r, d, ALL_SUCCEEDED, said, asked), [], 'not a try: its work is signed');
  });
  await t.test('REFUSED: a try of an exhausted loop, naming the round and the acceptance', () => {
    const tried = retryRefusal(LOOP, r, 'review', { mode: 'fresh' }, ALL_SUCCEEDED, said, asked);
    names(
      tried,
      'review asked for another round on the last one `rounds: 3` allows',
      'nemia round r-1 review',
      'nemia accept r-1 review --message "<why>"',
    );
  });
  await t.test('`rounds: 1`: the first round is the last', () => {
    const once = LOOP.map((s) => (s.loop ? { ...s, rounds: 1 } : s));
    assert.deepEqual(assess(once, inRound(1), ALL_SUCCEEDED, saidIn(1, true), asked).round, []);
    assert.equal(stepStatus(once[1], inRound(1), ALL_SUCCEEDED, saidIn(1, true), asked, once), 'exhausted');
  });
});

test("a person's `nemia round` takes an exhausted loop once more, once", async (t) => {
  const said = saidIn(3, true);
  const none = () => undefined;
  await t.test('the ask for the next round files it, and nobody is waited on', () => {
    assert.deepEqual(assess(LOOP, inRound(3), ALL_SUCCEEDED, said, asked, none, [], [roundAskFor(4)]).round, [
      { step: 'review', target: 'implement', round: 4, by: 'ask' },
    ]);
    const l = listed(inRound(3), said, { verdictOf: none, asks: [], roundAsks: [roundAskFor(4)] });
    assert.deepEqual([l.steps[1].note, l.waitingOnYou], ['round 4 asked (nemia round) — the next tick files implement', []]);
  });
  await t.test('not the next round, or a loop not out of rounds: nothing is due', () => {
    assert.deepEqual(assess(LOOP, inRound(3), ALL_SUCCEEDED, said, asked, none, [], [roundAskFor(5)]).round, []);
    assert.deepEqual(assess(LOOP, inRound(2), ALL_SUCCEEDED, saidIn(2, false), asked, none, [], [roundAskFor(3)]).round, []);
  });
  await t.test('the round past the cap reads as on your word', () => {
    assert.deepEqual(
      listed(inRound(4), saidIn(4, false)).steps.map((s) => s.note),
      ['round 4, past rounds: 3, on your word', 'round 4, past rounds: 3, on your word', undefined],
    );
  });
});

test("a person's `nemia accept` ends a loop out of rounds on their word, as if it had said `again: false`", async (t) => {
  const said = saidIn(3, true);
  const r = inRound(3, acceptedTry(3));
  await t.test('keyed by the try it was given on; the loop reads over, the step after it filed, the run running', () => {
    assert.equal(tryOf(r, 'review'), 3);
    assert.equal(stepStatus(LOOPING_REVIEW, r, ALL_SUCCEEDED, said, asked, LOOP), 'unverified');
    const a = assess(LOOP, r, ALL_SUCCEEDED, said, asked);
    assert.deepEqual([a.round, a.ready, a.blocked, a.status], [[], ['ship'], [], 'running']);
  });
  await t.test('listing: accepted as it stands, its findings open, and nobody waited on', () => {
    const l = listed(r, said);
    assert.deepEqual(
      l.steps.map((s) => [s.status, s.note]),
      [
        ['verified ✓', 'round 3 of 3'],
        ['unverified · done', 'round 3 of 3, and it asked again — accepted as it stands at 2026-09-20T14:05:00.000Z, its findings open'],
        ['waiting', undefined],
      ],
    );
    assert.deepEqual(l.waitingOnYou, []);
  });
  await t.test('decision: running, and `nemia decide` offers the round no more', () => {
    const d = decision(LOOP, r, ALL_SUCCEEDED, nothingShipped, said, asked);
    assert.equal(d.kind, 'running');
    assert.deepEqual(roundLines(LOOP, r, d), []);
  });
  await t.test('a gated ending goes to its gate; a gate on the looping step holds once accepted, not while asking', () => {
    const GATED: Workflow[] = [IMPLEMENT, LOOPING_REVIEW, { ...LOOP[2], gate: true }];
    const filed: Run = { ...r, steps: { ...r.steps, ship: { taskId: 's1' } } };
    const saidShip = (name: string) => (name === 'ship' ? signedDone() : said(name));
    assert.deepEqual(assess(GATED, r, ALL_SUCCEEDED, said, asked).ready, ['ship']);
    assert.equal(stepStatus(GATED[2], filed, ALL_SUCCEEDED, saidShip, asked, GATED), 'awaiting approval');
    const GATED_LOOP: Workflow[] = [IMPLEMENT, { ...LOOPING_REVIEW, gate: true }, LOOP[2]];
    assert.equal(stepStatus(GATED_LOOP[1], r, ALL_SUCCEEDED, said, asked, GATED_LOOP), 'awaiting approval');
    assert.equal(stepStatus(GATED_LOOP[1], inRound(3), ALL_SUCCEEDED, said, asked, GATED_LOOP), 'exhausted');
  });
  await t.test('acceptedLines: their words for `nemia decide`, none unaccepted, none once a later try spent it', () => {
    assert.deepEqual(acceptedLines(LOOP, r), { review: `accepted as it stands 14:05Z, its findings open — "${ENOUGH}"` });
    assert.deepEqual(acceptedLines(LOOP, inRound(3)), {});
    assert.deepEqual(acceptedLines(LOOP, inRound(4, acceptedTry(3))), {});
  });
});

test('a round moves the loop: round 2 goes as round 1 went', async (t) => {
  const chain: Workflow[] = [IMPLEMENT, step('test', ['implement']), { ...LOOPING_REVIEW, after: ['test'] }];
  const steps = {
    implement: { taskId: 'r-1-implement', check: { taskId: 'r-1-implement-check' } },
    test: { taskId: 'r-1-test' },
    review: { taskId: 'r-1-review' },
  };
  const r = run({}, { steps });
  const next: Run = {
    ...r,
    steps: roundFiled(chain, r, { step: 'review', target: 'implement', round: 2, by: 'again' }, stepTaskId(r, 'implement', 2)),
  };
  const replied = (name: string) => (name === 'implement' ? answered : signedDone());
  await t.test("implement's try runs, and nothing is due twice", () => {
    const running = assess(chain, next, phases({ 'r-1-implement-try2': 'running' }), replied, asked);
    assert.deepEqual([running.ready, running.round, running.status], [[], [], 'running']);
  });
  await t.test('the rest are filed once what they wait on is verified', () => {
    const checked: Run = {
      ...next,
      steps: { ...next.steps, implement: { ...next.steps.implement, check: { taskId: 'r-1-implement-try2-check' } } },
    };
    const p = phases({ 'r-1-implement-try2': 'succeeded', 'r-1-implement-try2-check': 'succeeded' });
    assert.deepEqual(assess(chain, checked, p, replied, asked).ready, ['test']);
  });
  await t.test('every step of the loop reads its round', () => {
    const l = listing({
      steps: chain,
      run: next,
      phaseOf: shown({ 'r-1-implement-try2': 'running (working)' }),
      closeoutOf: replied,
      askedCloseout: asked,
    });
    assert.deepEqual(
      l.steps.map((s) => s.note),
      ['round 2 of 3', 'round 2 of 3', 'round 2 of 3'],
    );
  });
});

test("UNSIGNED: from round 2 a loop's target owes `replies`, and a looping step's `again` is a yes or a no", async (t) => {
  const saying = (replies: unknown) => (name: string) =>
    name === 'implement'
      ? { outcome: 'done' as const, summary: 'IMPLEMENTER-SUMMARY', artifacts: [], needs: undefined, output: { replies } }
      : undefined;
  await t.test('round 2: none, or an empty list, is unsigned and blocks the looping step; replies verify it', () => {
    assert.equal(
      stepStatus(IMPLEMENT, reviewDue(2), ALL_SUCCEEDED, () => signedDone(), asked, LOOP),
      'unsigned',
    );
    assert.deepEqual(assess(LOOP, reviewDue(2), ALL_SUCCEEDED, () => signedDone(), asked).blocked, ['review']);
    assert.equal(stepStatus(IMPLEMENT, reviewDue(2), ALL_SUCCEEDED, saying([]), asked, LOOP), 'unsigned');
    assert.deepEqual(assess(LOOP, reviewDue(2), ALL_SUCCEEDED, saying([]), asked).blocked, ['review']);
    assert.equal(
      stepStatus(IMPLEMENT, reviewDue(2), ALL_SUCCEEDED, () => answered, asked, LOOP),
      'verified',
    );
    assert.equal(stepStatus(IMPLEMENT, reviewDue(2), ALL_SUCCEEDED, saying(REPLIES), asked, LOOP), 'verified');
  });
  await t.test('round 3 too', () => {
    assert.equal(stepStatus(IMPLEMENT, reviewDue(3), ALL_SUCCEEDED, saying([]), asked, LOOP), 'unsigned');
  });
  await t.test('round 1 had nothing to answer: none, or an empty list, verifies', () => {
    assert.equal(
      stepStatus(IMPLEMENT, inRound(1), ALL_SUCCEEDED, () => signedDone(), asked, LOOP),
      'verified',
    );
    assert.equal(stepStatus(IMPLEMENT, inRound(1), ALL_SUCCEEDED, saying([]), asked, LOOP), 'verified');
  });
  for (const again of ['yes', null, undefined, 1]) {
    await t.test(`\`again: ${String(again)}\` is no answer: unsigned`, () => {
      assert.equal(stepStatus(LOOPING_REVIEW, inRound(1), ALL_SUCCEEDED, saidIn(1, again), asked, LOOP), 'unsigned');
    });
  }
});

test('`retries:` counts within a round: a round is new work, and its check may refuse it afresh', async (t) => {
  const record = (...then: EarlierTry['then'][]) => ({ taskId: 't', tries: then.map((th, k) => ({ taskId: `t${k}`, then: th })) });
  for (const [name, tries, spent] of [
    ['two tries by retries: 2 spent', ['retries', 'retries'], 2],
    ['a round after a retry: none spent', ['retries', 'round'], 0],
    ['a retry after a round, then a nudge: 1 spent', ['round', 'retries', 'nudge'], 1],
  ] as const) {
    await t.test(`retriesSpent: ${name}`, () => assert.equal(retriesSpent(record(...tries)), spent));
  }
  await t.test("tryNote: the round, then the try, by the step's `retries:`", () => {
    assert.equal(tryNote({ ...IMPLEMENT, retries: 1 }, record('round', 'retries'), LOOP), 'round 2 of 3, try 3, by retries: 1');
  });
});
