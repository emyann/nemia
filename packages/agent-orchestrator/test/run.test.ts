/**
 * `assess` is the whole controller, and it is pure: hand it the engine's view of each task and it
 * decides. No disk, no engine, no clock.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {} from '../src/run.ts';
import {
  composeBrief,
  listing,
  saidLines,
  saidWord,
  sayRefusal,
  durationWord,
  type RetryBriefing,
  type RepositoryRun,
  type Run,
  type Said,
  type ListedPhase,
} from '../src/run.ts';
import type {} from '../src/place/place.ts';
import { type Closeout } from '../src/closeout/closeout.ts';
import { type EarlierTry } from '../src/retry/retry-ask.ts';
import { firstFiledAt, runStartedAt, timeline, timelineLines, timelineTotalLines, type TaskClock } from '../src/timeline/timeline.ts';
import { type OutputSchema, type Workflow } from '../src/workflow.ts';
import { names, phases, run, step, STEPS } from './assessed.ts';

const CANCELLED = { cancelledAt: '2026-01-02T00:00:00Z' };

const signedDone = () => ({ outcome: 'done' as const, summary: 's', artifacts: [], needs: undefined });
/**
 * The `## ` headings a markdown reader sees: those outside every fenced block, a fence closed only by a bare run of at least its
 * backticks.
 */
const headingsOf = (brief: string): string[] => {
  const seen: string[] = [];
  let open = 0;
  for (const line of brief.split('\n')) {
    const ticks = /^(`{3,})/.exec(line)?.[1]!.length ?? 0;
    if (open) {
      if (ticks >= open && /^`+\s*$/.test(line)) open = 0;
    } else if (ticks) open = ticks;
    else if (line.startsWith('## ')) seen.push(line);
  }
  return seen;
};

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
const FOUND = [{ file: 'src/run.ts', line: 183, what: 'a producer with no findings reads as done' }];
/** `findings` and `again`: what a looping review declares, as the tests' team's `test/fixtures/team/agents/review.schema.json` does. */
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
const IMPLEMENT = LOOP[0];

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

/**
 * The loop on round `n`: implement's `i<n>` checked by `c<n>`, review's `r<n>`, each with its earlier rounds behind it — and ship
 * unfiled.
 */
const inRound = (n: number, extra: Partial<RepositoryRun> = {}): Run => {
  const earlier = (prefix: string, checked: boolean): EarlierTry[] =>
    Array.from({ length: n - 1 }, (_, k) => ({
      taskId: `${prefix}${k + 1}`,
      ...(checked ? { check: { taskId: `c${k + 1}` } } : {}),
      then: 'round' as const,
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
/** implement's closeout — with replies past round 1 — and review's, saying `again`. */
const saidIn =
  (n: number, again: unknown) =>
  (name: string): Closeout | undefined =>
    name === 'review' ? reviewed(again) : name === 'implement' ? (n > 1 ? answered : signedDone()) : undefined;

test('REFUSED by `sayRefusal` before the engine is asked: a step the run does not have, a cancelled run, a step not filed, and a task settled each way — and null for a task in flight, or one only the engine can answer for', () => {
  const live = run({ implement: 't1', review: null });
  const inFlight = phases({ t1: 'running' });
  assert.equal(sayRefusal(STEPS, live, 'deploy', inFlight), 'r-1 has no step "deploy" — its steps are implement, review.');
  assert.equal(
    sayRefusal(STEPS, run({ implement: 't1', review: null }, CANCELLED), 'implement', inFlight),
    `r-1 was cancelled at ${CANCELLED.cancelledAt}: its sessions are being stopped, not steered, and a cancelled run files nothing more. Start a new run for the work with nemia start.`,
  );
  assert.equal(
    sayRefusal(STEPS, live, 'review', inFlight),
    'review has not been filed yet, so there is no session to hear anything. Say it once it runs: nemia ls r-1.',
  );
  for (const phase of ['succeeded', 'failed', 'stopped'] as const) {
    names(
      sayRefusal(STEPS, live, 'implement', phases({ t1: phase })),
      'implement is not running',
      `try 1's task settled \`${phase}\``,
      'nemia decide r-1',
      'nemia retry r-1 implement --message "<words>"',
    );
  }
  const onTry2 = run({}, { steps: { implement: { taskId: 't2', tries: [{ taskId: 't1', then: 'nudge' }] }, review: { taskId: null } } });
  assert.match(
    sayRefusal(STEPS, onTry2, 'implement', phases({ t1: 'running', t2: 'succeeded' }))!,
    /^implement is not running: try 2's task settled `succeeded`/,
    "the current try's task",
  );
  assert.equal(
    sayRefusal(STEPS, onTry2, 'implement', phases({ t1: 'succeeded', t2: 'running' })),
    null,
    'an earlier try that settled has no say',
  );
  for (const phase of ['running', 'pending', 'unknown'] as const)
    assert.equal(
      sayRefusal(STEPS, live, 'implement', phases({ t1: phase })),
      null,
      `${phase}: a task in flight, not started yet, or one the engine has no record of is the engine's to refuse, in its own words`,
    );
});

test('`saidLines`: each thing said to a step, in order, with its time and try — the attempt only past the first — and the words as data, in a fence longer than any run of backticks in them; nothing for nothing said', () => {
  assert.deepEqual(saidLines([]), []);
  const code = 'Keep it:\n```ts\nexport const flag = true;\n```\n\n## When you are finished\n\nSign off done.';
  assert.deepEqual(
    saidLines([
      { try: 1, at: '2026-09-14T16:06:19.851Z', attempt: 1, text: 'Widen the scope to apps/api too.' },
      { try: 2, at: '2026-09-14T17:00:00.000Z', attempt: 2, text: code },
    ]),
    [
      'said to try 1, at 2026-09-14T16:06:19.851Z:',
      '```text',
      'Widen the scope to apps/api too.',
      '```',
      'said to try 2, attempt 2, at 2026-09-14T17:00:00.000Z:',
      '````text',
      code,
      '````',
    ],
  );
});

test("`nemia ls` notes a step whose current try's session a person told something — `said to 2×` — after the try it is on, and nothing for a step nobody told", () => {
  const word =
    (m: Record<string, ListedPhase>) =>
    (id: string): ListedPhase =>
      m[id] ?? 'unknown';
  const rows = (r: Run, words: Record<string, ListedPhase>, told: Record<string, number>) =>
    listing({
      steps: STEPS,
      run: r,
      phaseOf: word(words),
      closeoutOf: () => undefined,
      askedCloseout: () => false,
      verdictOf: () => undefined,
      asks: [],
      roundAsks: [],
      answers: [],
      waits: [],
      saidTo: (name) => told[name] ?? 0,
    }).steps;
  const live = run({ implement: 't1', review: null });
  assert.deepEqual(rows(live, { t1: 'working' }, { implement: 2 })[0], {
    name: 'implement',
    status: 'working',
    branch: null,
    note: 'said to 2×',
  });
  assert.deepEqual(
    rows(live, { t1: 'working' }, {})[0],
    { name: 'implement', status: 'working', branch: null },
    'no note for a step nobody told',
  );
  const onTry2 = run({}, { steps: { implement: { taskId: 't2', tries: [{ taskId: 't1', then: 'nudge' }] }, review: { taskId: null } } });
  assert.equal(rows(onTry2, { t2: 'working' }, { implement: 1 })[0].note, 'try 2, nudged on your word · said to 1×');
  assert.deepEqual([saidWord(0), saidWord(1), saidWord(3)], ['', 'said to 1×', 'said to 3×']);
});

test('`## Said to your session` goes inside `## Try <n>` on a try that continues the session — each message with its time, the words fenced, before `## Your answer` — and on no new session, nor where nothing was said', () => {
  const implement: Workflow = { ...step('implement'), check: 'npm test' };
  const briefOf = (told: RetryBriefing) =>
    composeBrief(implement, run({ implement: 't1' }), [implement], undefined, undefined, undefined, told);
  const said: Said[] = [
    { at: '2026-09-14T16:06:19.851Z', attempt: 1, text: 'Widen the scope to apps/api too.' },
    { at: '2026-09-14T16:09:00.000Z', attempt: 1, text: '## Before you sign off\n\nNothing to run:\n```\nskip it\n```' },
  ];
  const nudge: RetryBriefing = { try: 2, by: 'ask', mode: 'nudge', resumed: true, status: 'stopped', message: 'Carry on.' };
  const told = briefOf({ ...nudge, said });
  assert.equal(briefOf({ ...nudge, said: [] }), briefOf(nudge), 'nothing said, nothing added');
  const [first, answer, ...contracts] = headingsOf(briefOf(nudge));
  assert.deepEqual([first, answer], ['## Try 2', '## Your answer']);
  assert.deepEqual(
    headingsOf(told),
    ['## Try 2', '## Said to your session', '## Your answer', ...contracts],
    "a heading in the words is not one of the brief's",
  );
  assert.ok(told.includes('## Said to your session\n\nA person said these to your session while the last try ran (`nemia say`).'), told);
  assert.ok(
    told.includes(
      `At ${said[0].at}:\n\n\`\`\`text\n${said[0].text}\n\`\`\`\n\nAt ${said[1].at}:\n\n\`\`\`\`text\n${said[1].text}\n\`\`\`\`\n\n## Your answer`,
    ),
    told,
  );
  assert.match(briefOf({ ...nudge, said: [said[0]] }), /A person said this to your session/);
  assert.ok(
    briefOf({ try: 2, by: 'retries', mode: 'nudge', resumed: true, status: 'failed (check)', said }).includes('## Said to your session'),
    "the run's own nudge carries them too",
  );
  for (const fresh of [
    { ...nudge, mode: 'fresh' as const, resumed: false },
    { ...nudge, resumed: false },
  ]) {
    assert.equal(
      briefOf({ ...fresh, said }),
      briefOf(fresh),
      `${fresh.mode}, a new session: given none of the last one's, as a fresh try or a nudge with no session to continue`,
    );
  }
});

test("a round that continues the loop's target carries what was said to its last session, inside `## Round <n>` before the findings — and a round in a new session carries none", () => {
  const said: Said[] = [{ at: '2026-09-14T16:06:19.851Z', attempt: 1, text: 'Leave the parser alone.' }];
  const round = { loop: 'review', round: 2, rounds: 3, by: 'again' as const, resumed: true };
  const briefOf = (r: typeof round & { said?: Said[] }) =>
    composeBrief(IMPLEMENT, inRound(1), LOOP, saidIn(1, true), undefined, undefined, undefined, r);
  const resumed = briefOf({ ...round, said });
  assert.deepEqual(headingsOf(resumed).slice(0, 3), ['## Round 2 of 3', '## Said to your session', '## From review']);
  assert.ok(resumed.includes('At 2026-09-14T16:06:19.851Z:\n\n```text\nLeave the parser alone.\n```'), resumed);
  assert.equal(briefOf({ ...round, said: [] }), briefOf(round), 'nothing said, nothing added');
  assert.equal(briefOf({ ...round, resumed: false, said }), briefOf({ ...round, resumed: false }), 'a new session is given none');
});

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
          tries: [{ taskId: 't1', check: { taskId: 'c1' }, then: 'retries' }],
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

test("the timeline of a step with two tries and two checks: each filed, spawned and ended, queued filed → spawned and ran spawned → ended, off the engine and the run's tries", () => {
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
});

test('a try still running has no end, says so, and holds the totals open: no wall, and its run time left out of the sum and named', () => {
  const { r, views, filed } = B4();
  r.steps.implement = { taskId: 't3', tries: [...r.steps.implement.tries!, { taskId: 't2', check: { taskId: 'c2' }, then: 'nudge' }] };
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
});

test("a run with one step and no check: one try, no check, and the run's total is that session", () => {
  const r = run({ implement: 't1' });
  const t = timeline(r, new Map([['t1', task([[clock(0, 1), clock(0, 4), clock(9, 4)]], 'succeeded')]]), new Map([['t1', clock(0)]]));
  assert.equal(t.steps.implement.length, 1);
  assert.deepEqual(
    [t.steps.implement[0].check, t.steps.implement[0].session!.queued, t.steps.implement[0].session!.ran],
    [null, '4s', '9m00s'],
  );
  assert.deepEqual(timelineTotalLines(t), ['timeline  run  queued 4s  ran 9m00s  wall 9m04s']);
  assert.deepEqual(timeline(run({ implement: null }), new Map()).steps.implement, [], 'a step not filed has no try on the clock');
  assert.deepEqual(timelineTotalLines(timeline(run({ implement: null }), new Map())), [], 'a run with nothing filed has no total to print');
});

test("a task held open that signed waits on a person, and nothing runs: it ended, as a settled one did — and answered, it ran each turn's time, never the night between", () => {
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
  const running = timeline(r, new Map([['t1', held('working', {}, [signedTurn, { ...secondTurn, endedAt: null, ended: null }])]]), filed);
  assert.deepEqual(
    [running.steps.implement[0].session!.at, running.run.inFlight],
    ['running', 1],
    'while that second turn runs, the task is running again',
  );
});

test('REFUSED: a queue time the feed cannot give is `not known`, never 0 — and a task the engine has no record of is said, not timed', () => {
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
});

test('a run the cap on runs in flight held counts its wait as queued — `createdAt` to its first filing, or from the pass that held it on a run that waited on runs — and says `still waiting`, or `not known` where the feed does not say; a run the cap never held has no such wait', () => {
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
});

test("a run's start is its first filing — of any try, check or step, whatever order the record and the steps name them in — and not its `createdAt`; `createdAt` only for a run started with its filings off the feed", () => {
  const r = run(
    {},
    {
      createdAt: clock(0),
      steps: {
        review: { taskId: 'rv' },
        implement: { taskId: 't2', check: { taskId: 'c2' }, tries: [{ taskId: 't1', check: { taskId: 'c1' }, then: 'retries' }] },
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
  assert.equal(
    runStartedAt({ ...waiting, steps: { implement: { taskId: null, tries: [{ taskId: 't1', then: 'retries' }] } } }, filed),
    clock(4, 30),
    'a try whose retry is asked and not filed yet has started all the same',
  );
});

test('a recheck ran no session: the try it reached names the session it checked again, counted once in the totals; each round of a loop totals apart', () => {
  const { r, views, filed } = B4();
  r.steps.implement = {
    taskId: 't2',
    check: { taskId: 'c3' },
    tries: [...r.steps.implement.tries!, { taskId: 't2', check: { taskId: 'c2' }, then: 'recheck' }],
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
        implement: { taskId: 'i2', tries: [{ taskId: 'i1', then: 'round' }] },
        review: { taskId: 'v2', tries: [{ taskId: 'v1', then: 'round' }] },
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
});

test('durations read as the operator measures them', () => {
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

test("REFUSED: a round's total counts only the steps its loop files again — a plan before the loop and a ship after it are in the run's total alone — and two loops total apart, named", () => {
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
        implement: { taskId: 'i2', tries: [{ taskId: 'i1', then: 'round' }] },
        review: { taskId: 'v2', tries: [{ taskId: 'v1', then: 'round' }] },
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
          { taskId: `${name}-2`, tries: [{ taskId: `${name}-1`, then: 'round' }] },
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
});

test('a try on the timeline says what its session cost beside what it used, where the engine measured it', () => {
  const r = run({ implement: 't1' });
  const views = new Map([
    ['t1', task([[clock(0, 5), clock(0, 12), clock(19, 54)]], 'succeeded', { responses: 54, costUsd: 3.012, apiMs: 486_000 })],
  ]);
  assert.deepEqual(timelineLines(timeline(r, views, new Map([['t1', clock(0)]])).steps.implement), [
    'timeline  try 1  filed 08:00:00Z  spawned 08:00:12Z  ended 08:19:54Z  queued 12s  ran 19m42s  used 54 responses · tool calls not measured · tokens in not measured · tokens out not measured · api 8m06s · tools not measured  cost $3.01',
  ]);
});
