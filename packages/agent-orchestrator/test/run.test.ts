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
  type RetryBriefing,
  type RepositoryRun,
  type Run,
  type Said,
  type ListedPhase,
} from '../src/run.ts';
import type {} from '../src/place/place.ts';
import { type Closeout } from '../src/closeout/closeout.ts';
import { type EarlierTry } from '../src/retry/retry-ask.ts';
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
  const onTry2 = run(
    {},
    { steps: { implement: { taskId: 't2', tries: [{ taskId: 't1', cause: 'continue' }] }, review: { taskId: null } } },
  );
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
    reason: 'Running',
    phase: 'running',
    branch: null,
    note: 'said to 2×',
  });
  assert.deepEqual(
    rows(live, { t1: 'working' }, {})[0],
    { name: 'implement', status: 'working', reason: 'Running', phase: 'running', branch: null },
    'no note for a step nobody told',
  );
  const onTry2 = run(
    {},
    { steps: { implement: { taskId: 't2', tries: [{ taskId: 't1', cause: 'continue' }] }, review: { taskId: null } } },
  );
  assert.equal(rows(onTry2, { t2: 'working' }, { implement: 1 })[0].note, 'try 2, continued on your word · said to 1×');
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
  const nudge: RetryBriefing = { try: 2, by: 'ask', mode: 'continue', resumed: true, status: 'stopped', message: 'Carry on.' };
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
    briefOf({ try: 2, by: 'retries', mode: 'continue', resumed: true, status: 'failed (check)', said }).includes('## Said to your session'),
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
