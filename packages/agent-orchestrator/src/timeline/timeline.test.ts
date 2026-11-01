/**
 * A run's timeline (`timeline`), as one table: each try of each step filed, spawned and ended, its queue and its run, the run's totals
 * and each round's, said as the operator reads them (`timelineLines`, `timelineTotalLines`, `durationWord`), and its start
 * (`firstFiledAt`, `runStartedAt`). Pure: a hand-built record, the engine's views of its tasks and their filing times, no disk, no
 * engine. Its rows were the timeline's cases of `test/run.test.ts`, copied whole.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { durationWord } from '../status/status.ts';
import type { Workflow } from '../step/step.ts';
import { run, step } from '../../test/assessed.ts';
import { firstFiledAt, runStartedAt, timeline, timelineLines, timelineTotalLines, type TaskClock } from './timeline.ts';

/** An instant `m` minutes and `s` seconds after 08:00 on the fixtures' day. */
const clock = (m: number, s = 0) => new Date(Date.UTC(2026, 8, 13, 8, m, s)).toISOString();

/**
 * A task's view as the engine has it: one attempt per triple of started, spawned and ended, settled as `settled` says, with `usage` on
 * its last attempt.
 */
const task = (
  attempts: Array<[string, string | null, string | null]>,
  settled: 'succeeded' | 'failed' | 'stopped' | null,
  usage: object | null = null,
): TaskClock => ({
  state: {
    brief: 'filed',
    settled,
    attempts: attempts.map(([startedAt, spawnedAt, endedAt], i) => ({
      startedAt,
      spawnedAt,
      endedAt,
      reason: endedAt ? 'harness' : null,
      usage: i === attempts.length - 1 ? usage : null,
    })),
  },
});

/** A run of implement alone: its check refused try 1, and `retries: 1` filed try 2, which passed; with each task's view and filing. */
const B4 = () => {
  const r = run(
    {},
    {
      steps: {
        implement: {
          taskId: 't2',
          check: { taskId: 'c2' },
          tries: [{ taskId: 't1', check: { taskId: 'c1' }, cause: 'retries' }],
        },
      },
    },
  );
  const views = new Map<string, TaskClock>([
    [
      't1',
      task([[clock(0, 5), clock(0, 12), clock(19, 54)]], 'succeeded', {
        responses: 54,
        toolCalls: 146,
        inputTokens: 17_000_000,
        outputTokens: 210_000,
      }),
    ],
    ['c1', task([[clock(19, 57), clock(19, 57), clock(20, 55)]], 'failed')],
    ['t2', task([[clock(21, 1), clock(21, 3), clock(26, 38)]], 'succeeded')],
    ['c2', task([[clock(26, 40), clock(26, 40), clock(27, 37)]], 'succeeded')],
  ]);
  const filed = new Map([
    ['t1', clock(0)],
    ['c1', clock(19, 56)],
    ['t2', clock(21)],
    ['c2', clock(26, 40)],
  ]);
  return { r, views, filed };
};

test("`timeline`: a run's tries on the clock, each filed, spawned and ended, its totals and its rounds, and the lines an operator reads", async (t) => {
  await t.test(
    "the timeline of a step with two tries and two checks: each filed, spawned and ended, queued filed → spawned and ran spawned → ended, off the engine and the run's tries",
    () => {
      const { r, views, filed } = B4();
      const t = timeline(r, views, filed);
      const [first, second] = t.steps.implement;
      assert.deepEqual([first.try, first.round, first.sessionOf, second.try, second.round], [1, 1, null, 2, 1]);
      const times = (s: typeof first.session) =>
        s && { at: s.at, filedAt: s.filedAt, spawnedAt: s.spawnedAt, endedAt: s.endedAt, queued: s.queued, ran: s.ran };
      assert.deepEqual(times(first.session), {
        at: 'ended',
        filedAt: clock(0),
        spawnedAt: clock(0, 12),
        endedAt: clock(19, 54),
        queued: '12s',
        ran: '19m42s',
      });
      assert.deepEqual(times(first.check), {
        at: 'ended',
        filedAt: clock(19, 56),
        spawnedAt: clock(19, 57),
        endedAt: clock(20, 55),
        queued: '1s',
        ran: '58s',
      });
      assert.deepEqual(times(second.session), {
        at: 'ended',
        filedAt: clock(21),
        spawnedAt: clock(21, 3),
        endedAt: clock(26, 38),
        queued: '3s',
        ran: '5m35s',
      });
      assert.deepEqual(times(second.check), {
        at: 'ended',
        filedAt: clock(26, 40),
        spawnedAt: clock(26, 40),
        endedAt: clock(27, 37),
        queued: '0s',
        ran: '57s',
      });
      assert.equal(first.session!.queuedMs, 12_000);
      assert.equal(first.session!.ranMs, 1_182_000);
      assert.deepEqual(
        first.used,
        { responses: 54, toolCalls: 146, inputTokens: 17_000_000, outputTokens: 210_000 },
        'what each session used, beside it',
      );
      assert.equal(second.used, undefined, 'a try whose session measured nothing has none');

      assert.deepEqual(t.rounds, [], 'no loop: no round is totalled, and the run is');
      assert.deepEqual(
        { ...t.run },
        {
          loop: null,
          round: null,
          tasks: 4,
          inFlight: 0,
          queuedMs: 16_000,
          ranMs: 1_632_000,
          wallMs: 1_657_000,
          queued: '16s',
          ran: '27m12s',
          wall: '27m37s',
        },
        "the run's total is its sums (12s + 1s + 3s + 0s queued; 19m42s + 58s + 5m35s + 57s ran) and its wall, first filed to last ended",
      );

      assert.deepEqual(timelineLines(t.steps.implement), [
        'timeline  try 1        filed 08:00:00Z  spawned 08:00:12Z  ended 08:19:54Z  queued 12s  ran 19m42s  used 54 responses · 146 tool calls · 17M in · 210k out',
        '          try 1 check  filed 08:19:56Z  spawned 08:19:57Z  ended 08:20:55Z  queued 1s  ran 58s',
        '          try 2        filed 08:21:00Z  spawned 08:21:03Z  ended 08:26:38Z  queued 3s  ran 5m35s  used not measured',
        '          try 2 check  filed 08:26:40Z  spawned 08:26:40Z  ended 08:27:37Z  queued 0s  ran 57s',
      ]);
      assert.deepEqual(timelineTotalLines(t), ['timeline  run  queued 16s  ran 27m12s  wall 27m37s'], "one round: the run's line alone");
    },
  );
  await t.test(
    'a try still running has no end, says so, and holds the totals open: no wall, and its run time left out of the sum and named',
    () => {
      const { r, views, filed } = B4();
      r.steps.implement = {
        taskId: 't3',
        tries: [...r.steps.implement.tries!, { taskId: 't2', check: { taskId: 'c2' }, cause: 'continue' }],
      };
      views.set('t3', task([[clock(30, 2), clock(30, 5), null]], null));
      filed.set('t3', clock(30));
      const t = timeline(r, views, filed);
      const running = t.steps.implement.at(-1)!;
      assert.deepEqual(
        {
          at: running.session!.at,
          endedAt: running.session!.endedAt,
          ranMs: running.session!.ranMs,
          queued: running.session!.queued,
          ran: running.session!.ran,
        },
        { at: 'running', endedAt: null, ranMs: null, queued: '5s', ran: 'still running, no end yet' },
      );
      assert.equal(running.check, null, 'a try whose check was never filed has no check on the clock');
      assert.equal(
        timelineLines(t.steps.implement).at(-1),
        '          try 3        filed 08:30:00Z  spawned 08:30:05Z  no end yet, still running  queued 5s  used not measured',
      );
      assert.deepEqual([t.run.inFlight, t.run.wallMs, t.run.ran, t.run.wall], [1, null, '27m12s, 1 still running', 'still going']);

      views.set('t3', { state: { brief: 'filed', settled: null, attempts: [] } });
      assert.deepEqual(
        (({ at, queued, ran, queuedMs }) => ({ at, queued, ran, queuedMs }))(timeline(r, views, filed).steps.implement.at(-1)!.session!),
        { at: 'queued', queued: 'waiting for a slot', ran: '—', queuedMs: null },
        'filed and waiting for a slot: no queue time yet, and not 0',
      );
      views.set('t3', task([[clock(30, 2), null, null]], null));
      assert.deepEqual(
        (({ at, queued, queuedMs }) => ({ at, queued, queuedMs }))(timeline(r, views, filed).steps.implement.at(-1)!.session!),
        { at: 'starting', queued: 'not spawned yet', queuedMs: null },
        'a slot taken and not spawned: no queue time yet, and not 0',
      );
    },
  );
  await t.test("a run with one step and no check: one try, no check, and the run's total is that session", () => {
    const r = run({ implement: 't1' });
    const t = timeline(r, new Map([['t1', task([[clock(0, 1), clock(0, 4), clock(9, 4)]], 'succeeded')]]), new Map([['t1', clock(0)]]));
    assert.equal(t.steps.implement.length, 1);
    assert.deepEqual(
      [t.steps.implement[0].check, t.steps.implement[0].session!.queued, t.steps.implement[0].session!.ran],
      [null, '4s', '9m00s'],
    );
    assert.deepEqual(timelineTotalLines(t), ['timeline  run  queued 4s  ran 9m00s  wall 9m04s']);
    assert.deepEqual(timeline(run({ implement: null }), new Map()).steps.implement, [], 'a step not filed has no try on the clock');
    assert.deepEqual(
      timelineTotalLines(timeline(run({ implement: null }), new Map())),
      [],
      'a run with nothing filed has no total to print',
    );
  });
  await t.test(
    "a task held open that signed waits on a person, and nothing runs: it ended, as a settled one did — and answered, it ran each turn's time, never the night between",
    () => {
      const r = run({ implement: 't1' });
      const filed = new Map([['t1', clock(0)]]);
      const signedTurn = {
        startedAt: clock(0, 1),
        spawnedAt: clock(0, 4),
        endedAt: clock(9, 4),
        reason: 'harness',
        usage: null,
        ended: 'succeeded' as const,
      };
      const held = (phase: string, extra: object = {}, attempts: object[] = [signedTurn]): TaskClock =>
        ({ phase, state: { brief: 'filed', settled: null, attempts, ...extra } }) as TaskClock;
      for (const [said, view] of [
        ['waiting', held('input-required')],
        ['closed', held('between-attempts', { closed: true })],
      ] as const) {
        const t = timeline(r, new Map([['t1', view]]), filed);
        const session = t.steps.implement[0].session!;
        assert.deepEqual(
          [session.at, session.endedAt, session.ran],
          ['ended', clock(9, 4), '9m00s'],
          `${said}: one turn signed at 08:09:04 ended there, whether waiting on a person's word or closed on it and not yet settled`,
        );
        assert.deepEqual([t.run.inFlight, t.run.ran, t.run.wall], [0, '9m00s', '9m04s'], `${said}: nothing of the run in flight`);
      }
      assert.equal(
        timeline(r, new Map([['t1', held('between-attempts')]]), filed).steps.implement[0].session!.at,
        'running',
        'signed and not held open, between-attempts: the engine starts another, so it is still running',
      );

      const secondTurn = {
        startedAt: clock(600),
        spawnedAt: clock(600, 3),
        endedAt: clock(605, 3),
        reason: 'harness',
        usage: null,
        ended: 'succeeded' as const,
        turn: 1,
      };
      const answered = timeline(
        r,
        new Map([
          [
            't1',
            {
              ...held('succeeded', {}, [signedTurn, secondTurn]),
              state: { brief: 'filed', settled: 'succeeded', attempts: [signedTurn, secondTurn] },
            },
          ],
        ]),
        filed,
      );
      assert.deepEqual(
        [answered.steps.implement[0].session!.ranMs, answered.run.ran, answered.run.wall],
        [14 * 60_000, '14m00s', '10h05m'],
        'a person answered at 18:00, ten hours on, and the second turn ran 5 minutes: ran 9 minutes and 5, not ten hours',
      );
      const running = timeline(
        r,
        new Map([['t1', held('working', {}, [signedTurn, { ...secondTurn, endedAt: null, ended: null }])]]),
        filed,
      );
      assert.deepEqual(
        [running.steps.implement[0].session!.at, running.run.inFlight],
        ['running', 1],
        'while that second turn runs, the task is running again',
      );
    },
  );
  await t.test(
    'REFUSED: a queue time the feed cannot give is `not known`, never 0 — and a task the engine has no record of is said, not timed',
    () => {
      const { r, views } = B4();
      const t = timeline(r, views);
      const session = t.steps.implement[0].session!;
      assert.deepEqual(
        [session.queuedMs, session.queued, session.ran],
        [null, 'not known', '19m42s'],
        'the run time is still known: it is off the attempts',
      );
      assert.deepEqual([t.run.queued, t.run.wallMs, t.run.wall], ['not known', null, 'not known']);
      assert.ok(!timelineTotalLines(t).some((line) => /queued 0s/.test(line)), timelineTotalLines(t).join('\n'));

      views.delete('c2');
      const lost = timeline(r, views, B4().filed).steps.implement[1].check!;
      assert.deepEqual([lost.at, lost.queued, lost.ran], ['unknown', 'not on the record', 'not on the record']);
      assert.equal(
        timelineLines(timeline(r, views, B4().filed).steps.implement).at(-1),
        '          try 2 check  the engine has no record of c2',
      );
    },
  );
  await t.test(
    'a run the cap on runs in flight held counts its wait as queued — `createdAt` to its first filing, or from the pass that held it on a run that waited on runs — and says `still waiting`, or `not known` where the feed does not say; a run the cap never held has no such wait',
    () => {
      const { r, views, filed } = B4();
      const held = {
        ...r,
        createdAt: new Date(Date.UTC(2026, 8, 13, 7, 48)).toISOString(),
        slotHeldAt: new Date(Date.UTC(2026, 8, 13, 7, 48, 3)).toISOString(),
      };
      const t = timeline(held, views, filed);
      assert.deepEqual(
        t.slot,
        { from: held.createdAt, filedAt: clock(0), ms: 720_000, queued: '12m00s' },
        'started at 07:48, held from 07:48:03, first filed at 08:00',
      );
      assert.deepEqual(
        [t.run.queuedMs, t.run.queued, t.run.wall],
        [736_000, '12m16s', '27m37s'],
        "the run's queue is the tasks' 16s and the 12m wait for a slot; the wall is still first filed to last ended",
      );
      assert.deepEqual(timelineTotalLines(t), [
        'timeline  run slot  queued 12m00s',
        '          run       queued 12m16s  ran 27m12s  wall 27m37s',
      ]);
      assert.deepEqual(
        timeline({ ...held, after: ['a-1x2y'] }, views, filed).slot,
        { from: held.slotHeldAt, filedAt: clock(0), ms: 717_000, queued: '11m57s' },
        'the wait before it for runs it waited on is not a wait for a slot: counted from when the cap first held it',
      );

      const unknown = timeline(held, views);
      assert.deepEqual(
        [unknown.slot, unknown.run.queued],
        [{ from: held.createdAt, filedAt: null, ms: null, queued: 'not known' }, 'not known'],
        'no filing on the feed: not known, never 0',
      );
      assert.equal(timelineTotalLines(unknown)[0], 'timeline  run slot  queued not known');
      const waiting = timeline({ ...run({ implement: null }), slotHeldAt: held.slotHeldAt }, new Map());
      assert.deepEqual([waiting.slot?.queued, waiting.run.queued], ['still waiting', '1 waiting']);

      const never = timeline(r, views, filed);
      assert.equal(never.slot, null);
      assert.deepEqual(
        [never.run.queued, timelineTotalLines(never)],
        ['16s', ['timeline  run  queued 16s  ran 27m12s  wall 27m37s']],
        'as before',
      );
    },
  );
  await t.test(
    "a run's start is its first filing — of any try, check or step, whatever order the record and the steps name them in — and not its `createdAt`; `createdAt` only for a run started with its filings off the feed",
    () => {
      const r = run(
        {},
        {
          createdAt: clock(0),
          steps: {
            review: { taskId: 'rv' },
            implement: { taskId: 't2', check: { taskId: 'c2' }, tries: [{ taskId: 't1', check: { taskId: 'c1' }, cause: 'retries' }] },
          },
        },
      );
      const filed = new Map([
        ['rv', clock(40)],
        ['t2', clock(21)],
        ['c2', clock(26)],
        ['c1', clock(19, 56)],
        ['t1', clock(4, 30)],
      ]);
      assert.equal(
        firstFiledAt(r, filed),
        clock(4, 30),
        "review, named first on the record, was filed last; implement's try 1 before its try 2, and try 1's check before try 2's session",
      );
      assert.equal(
        runStartedAt(r, filed),
        clock(4, 30),
        'four and a half minutes after it was created: the wait before it is not time at work',
      );
      assert.equal(
        firstFiledAt(r, new Map([...filed, ['c1', clock(2)]])),
        clock(2),
        "a check filed before any session, a recheck say, is still the run's first filing",
      );

      assert.equal(firstFiledAt(r, new Map([['other', clock(1)]])), null, 'started, and none of its tasks on the feed: no filing');
      assert.equal(runStartedAt(r, new Map()), clock(0), 'and the start is the only time the record has');
      const waiting = run({ implement: null }, { createdAt: clock(0) });
      assert.deepEqual(
        [firstFiledAt(waiting, filed), runStartedAt(waiting, filed)],
        [null, null],
        'nothing filed, waiting on runs or held for a slot: no start, whatever the feed holds for other runs',
      );
      const asked = { ...waiting, steps: { implement: { taskId: null, tries: [{ taskId: 't1', cause: 'retries' as const }] } } };
      assert.equal(runStartedAt(asked, filed), clock(4, 30), 'a try whose retry is asked and not filed yet has started all the same');
    },
  );
  await t.test(
    'a recheck ran no session: the try it reached names the session it checked again, counted once in the totals; each round of a loop totals apart',
    () => {
      const { r, views, filed } = B4();
      r.steps.implement = {
        taskId: 't2',
        check: { taskId: 'c3' },
        tries: [...r.steps.implement.tries!, { taskId: 't2', check: { taskId: 'c2' }, cause: 'recheck' }],
      };
      views.set('c3', task([[clock(40, 1), clock(40, 1), clock(41)]], 'succeeded'));
      filed.set('c3', clock(40));
      const t = timeline(r, views, filed);
      const rechecked = t.steps.implement.at(-1)!;
      assert.deepEqual(
        [rechecked.try, rechecked.session, rechecked.sessionOf, rechecked.check!.ran, rechecked.used],
        [3, null, 2, '59s', undefined],
        "try 2's check did not finish, and a person rechecked it: try 3 is try 2's session with a check of its own",
      );
      assert.equal(t.run.tasks, 5, "t1, c1, t2, c2 and c3: try 2's session once");
      assert.equal(timelineLines(t.steps.implement)[4], "          try 3        its session is try 2's, checked again");

      const looped = run(
        {},
        {
          steps: {
            implement: { taskId: 'i2', tries: [{ taskId: 'i1', cause: 'round' }] },
            review: { taskId: 'v2', tries: [{ taskId: 'v1', cause: 'round' }] },
          },
        },
      );
      const loopViews = new Map<string, TaskClock>([
        ['i1', task([[clock(0), clock(0, 10), clock(10)]], 'succeeded')],
        ['v1', task([[clock(11), clock(11, 20), clock(15)]], 'succeeded')],
        ['i2', task([[clock(16), clock(16, 30), clock(20)]], 'succeeded')],
        ['v2', task([[clock(21), clock(21, 40), clock(25)]], 'succeeded')],
      ]);
      const loopFiled = new Map([
        ['i1', clock(0)],
        ['v1', clock(11)],
        ['i2', clock(16)],
        ['v2', clock(21)],
      ]);
      const lt = timeline(looped, loopViews, loopFiled, [
        step('implement'),
        { ...step('review', ['implement']), loop: 'implement', rounds: 3 },
      ]);
      assert.deepEqual(
        lt.steps.review.map((x) => x.round),
        [1, 2],
      );
      assert.deepEqual(
        lt.rounds.map((x) => [x.round, x.queued, x.ran, x.wall]),
        [
          [1, '30s', '13m30s', '15m00s'],
          [2, '1m10s', '6m50s', '9m00s'],
        ],
        "review loops back to implement: round 2's tries total apart from round 1's",
      );
      assert.deepEqual(
        timelineTotalLines(lt),
        [
          'timeline  round 1  queued 30s  ran 13m30s  wall 15m00s',
          '          round 2  queued 1m10s  ran 6m50s  wall 9m00s',
          '          run      queued 1m40s  ran 20m20s  wall 25m00s',
        ],
        "and the run's is both",
      );
      assert.equal(timelineLines(lt.steps.review)[1].startsWith('timeline'), false);
      assert.match(timelineLines(lt.steps.review)[1], /^ {10}try 2 · round 2  filed 08:21:00Z/);
    },
  );
  await t.test('durations read as the operator measures them', () => {
    assert.deepEqual([0, 999, 58_000, 60_000, 1_182_000, 3_900_000, 90_061_000, -5].map(durationWord), [
      '0s',
      '0s',
      '58s',
      '1m00s',
      '19m42s',
      '1h05m',
      '1d01h',
      '0s',
    ]);
  });
  await t.test(
    "REFUSED: a round's total counts only the steps its loop files again — a plan before the loop and a ship after it are in the run's total alone — and two loops total apart, named",
    () => {
      const once = (from: number, to: number) => task([[clock(from), clock(from), clock(to)]], 'succeeded');
      const steps: Workflow[] = [
        step('plan'),
        step('implement', ['plan']),
        { ...step('review', ['implement']), loop: 'implement', rounds: 3 },
        step('ship', ['review']),
      ];
      const r = run(
        {},
        {
          steps: {
            plan: { taskId: 'p' },
            implement: { taskId: 'i2', tries: [{ taskId: 'i1', cause: 'round' }] },
            review: { taskId: 'v2', tries: [{ taskId: 'v1', cause: 'round' }] },
            ship: { taskId: 's' },
          },
        },
      );
      const views = new Map<string, TaskClock>([
        ['p', once(0, 10)],
        ['i1', once(11, 20)],
        ['v1', once(21, 25)],
        ['i2', once(26, 30)],
        ['v2', once(31, 35)],
        ['s', once(40, 100)],
      ]);
      const filed = new Map([
        ['p', clock(0)],
        ['i1', clock(11)],
        ['v1', clock(21)],
        ['i2', clock(26)],
        ['v2', clock(31)],
        ['s', clock(40)],
      ]);
      const t = timeline(r, views, filed, steps);
      assert.deepEqual(
        t.rounds.map((x) => [x.loop, x.round, x.tasks, x.ran, x.wall]),
        [
          ['review', 1, 2, '13m00s', '14m00s'],
          ['review', 2, 2, '8m00s', '9m00s'],
        ],
        "round 1's wall runs from implement at 08:11 to review at 08:25: not from plan's 08:00, and not to ship's 09:40",
      );
      assert.deepEqual([t.run.tasks, t.run.ran, t.run.wall], [6, '1h31m', '1h40m'], "plan and ship are in the run's");
      assert.deepEqual(timelineTotalLines(t), [
        'timeline  round 1  queued 0s  ran 13m00s  wall 14m00s',
        '          round 2  queued 0s  ran 8m00s  wall 9m00s',
        '          run      queued 0s  ran 1h31m  wall 1h40m',
      ]);
      assert.deepEqual(
        timeline(r, views, filed, []).rounds,
        [],
        'given no steps, as a record with no frozen workflow and no folder: no round is totalled at all, rather than a guess',
      );

      const two: Workflow[] = [
        step('implement'),
        { ...step('review', ['implement']), loop: 'implement', rounds: 3 },
        step('docs', ['review']),
        { ...step('proofread', ['docs']), loop: 'docs', rounds: 3 },
      ];
      const both = run(
        {},
        {
          steps: Object.fromEntries(
            ['implement', 'review', 'docs', 'proofread'].map((name) => [
              name,
              { taskId: `${name}-2`, tries: [{ taskId: `${name}-1`, cause: 'round' }] },
            ]),
          ),
        },
      );
      const bothViews = new Map<string, TaskClock>(
        ['implement', 'review', 'docs', 'proofread'].flatMap((name, i) =>
          [1, 2].map((n) => [`${name}-${n}`, once(i * 10 + n, i * 10 + n + 1)] as [string, TaskClock]),
        ),
      );
      const bt = timeline(
        both,
        bothViews,
        new Map([...bothViews.keys()].map((id) => [id, bothViews.get(id)!.state.attempts[0].startedAt])),
        two,
      );
      assert.deepEqual(
        bt.rounds.map((x) => [x.loop, x.round, x.tasks]),
        [
          ['review', 1, 2],
          ['review', 2, 2],
          ['proofread', 1, 2],
          ['proofread', 2, 2],
        ],
        'two loops, implement and review then docs and proofread: their rounds are not the same rounds, and total apart',
      );
      assert.deepEqual(
        timelineTotalLines(bt).map((line) => line.slice(10).split('  ')[0]),
        ['review round 1', 'review round 2', 'proofread round 1', 'proofread round 2', 'run'],
        'each named by its looping step',
      );
    },
  );
  await t.test('a try on the timeline says what its session cost beside what it used, where the engine measured it', () => {
    const r = run({ implement: 't1' });
    const views = new Map([
      ['t1', task([[clock(0, 5), clock(0, 12), clock(19, 54)]], 'succeeded', { responses: 54, costUsd: 3.012, apiMs: 486_000 })],
    ]);
    assert.deepEqual(timelineLines(timeline(r, views, new Map([['t1', clock(0)]])).steps.implement), [
      'timeline  try 1  filed 08:00:00Z  spawned 08:00:12Z  ended 08:19:54Z  queued 12s  ran 19m42s  used 54 responses · tool calls not measured · tokens in not measured · tokens out not measured · api 8m06s · tools not measured  cost $3.01',
    ]);
  });
});
