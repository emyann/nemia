/**
 * The Overview's strip (src/lib/strip.ts): the factories' day counted off the two reads it is handed — the light answer of the runs not
 * finished, each in the state the list puts it in, and the runs finished since the day began, each with the outcome the list gives it —
 * on runs that cross midnight: landed and failed either side of it, one called off, one undecided, one waiting on a person, one that moves
 * and waits, and runs the list could not judge; the agents at work, the readout's caps and the quota's line. Each assertion names the
 * line of `stripOf` it guards. `npm run e2e` reads the strip on `/` (`overview-strip`).
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import type { Factory } from '../src/lib/api/factories.ts';
import type { QuotaWindow } from '../src/lib/api/quota.ts';
import type { RunView, UnjudgedRun } from '../src/lib/api/judged.ts';
import type { FinishedRun, OpenRuns, RunOutcome } from '../src/lib/api/runs.ts';
import { atWorkSince, coded, givenAgent, listed, summary, waitingRun } from './run-fixtures.ts';
import { ceilings } from './factory-fixtures.ts';
import { dollars } from '../src/lib/money.ts';
import { dayStartOf, quotaLineOf, readoutOf, runsOutAt, stripOf } from '../src/lib/strip.ts';

const WEB = path.join(import.meta.dirname, '..');
const MIN = 60_000;
const DAY = Date.parse('2026-10-14T04:00:00.000Z');
const NOW = DAY + 10 * 60 * MIN;
const at = (ms: number) => new Date(ms).toISOString();

/**
 * A run the list of the finished answers: its work stopped at `end`, it ended as `outcome` says, costing `usd`. Its status is `succeeded`
 * unless it failed, so a reader of the status in place of the outcome would count one called off or undecided as landed.
 */
const ended = (id: string, outcome: RunOutcome, end: number, usd: number, extra: Partial<RunView> = {}): FinishedRun => ({
  ...summary([['work', 'succeeded']], {
    id,
    status: outcome === 'failed' ? 'failed' : 'succeeded',
    moving: false,
    atWork: { ms: 10 * MIN, since: null, endedAt: at(end) },
    cost: { usd, measured: 1, unmeasured: 0, said: `$${usd}` },
    ...extra,
  }),
  wallMs: 0,
  finishedAt: at(end),
  outcome,
  clock: null,
});

/** A factory of `name` hiring the agents `hires` names. */
const factory = (name: string, hires: Record<string, string>): Factory => ({
  name,
  default: name === 'default',
  repos: [],
  workflows: null,
  hires,
  error: null,
  schedules: [],
  commands: { attach: '', rm: '', add: '', schedule: '', trust: '', volume: '' },
  untrusted: [],
  volumes: [],
  costLines: {},
  workflowRepos: {},
  template: null,
});

/** A step of `run` at work by `agent` since `since`. */
const atWorkBy = (run: RunView, step: string, agent: string, since: number): RunView => ({
  ...run,
  steps: [
    ...run.steps.filter((s) => s.name !== step),
    { ...run.steps[0], name: step, message: 'running', spec: givenAgent(agent), timeline: atWorkSince(at(since)) },
  ],
});

/** A run the list could not judge, of no factory. */
const unjudged = (id: string): UnjudgedRun => ({ id, factory: null, unjudged: 'its journal does not read' });

const landedToday = ended('r-landed', 'succeeded', DAY + 10 * MIN, 6);
const landedYesterday = ended('r-old', 'succeeded', DAY - 10 * MIN, 100);
const failedAtMidnight = ended('r-failed', 'failed', DAY, 3);
const cancelledToday = ended('r-off', 'cancelled', DAY + 60 * MIN, 1, { cancelledAt: at(DAY + 60 * MIN) });
const undecided = ended('r-undecided', 'undecided', DAY + 90 * MIN, 5, {
  toDecide: { kind: 'result', branches: ['wf/r/ship'], said: 'merge or drop wf/r/ship', command: 'git merge wf/r/ship' },
});
const waiting = waitingRun(
  summary([['work', 'awaiting approval']], {
    id: 'r-gate',
    status: 'awaiting approval',
    moving: false,
    atWork: { ms: 10 * MIN, since: null, endedAt: at(DAY + 3 * 60 * MIN) },
    cost: { usd: 2, measured: 1, unmeasured: 0, said: '$2' },
    waitingOnYou: ['plan'],
    waitingOnYouWords: ['approve plan'],
  }),
);
const movesAndWaits = waitingRun(
  summary([['plan', 'needs-human']], {
    id: 'r-both',
    waitingOnYou: ['plan'],
    atWork: { ms: 0, since: at(NOW - 30 * MIN), endedAt: null },
    cost: { usd: 7, measured: 1, unmeasured: 0, said: '$7' },
  }),
);
const flying = listed(
  atWorkBy(
    atWorkBy(
      summary([['implement', 'running']], {
        id: 'r-fly',
        brief: 'The kit batch',
        atWork: { ms: 0, since: at(DAY + 9 * 60 * MIN), endedAt: null },
        cost: { usd: 4, measured: 1, unmeasured: 0, said: '$4' },
      }),
      'implement',
      'ada',
      NOW - 17 * MIN,
    ),
    'review',
    'ada',
    NOW - 5 * MIN,
  ),
);
const kitFlying = listed(
  atWorkBy(summary([['land', 'running']], { id: 'r-kit', factory: 'kit', brief: 'The runs page' }), 'land', 'otto', NOW - 9 * MIN),
);

/** The light answer of `waiting` and `inFlight`, as the list puts each run. */
const open = (waitingRuns: OpenRuns['waiting'] = [], inFlightRuns: OpenRuns['inFlight'] = []): Pick<OpenRuns, 'waiting' | 'inFlight'> => ({
  waiting: waitingRuns,
  inFlight: inFlightRuns,
});

const OPEN = open([waiting, movesAndWaits], [flying, kitFlying]);
const FINISHED = [undecided, cancelledToday, landedToday, failedAtMidnight, landedYesterday];
const FACTORIES = [factory('default', {}), factory('kit', { 'build/land': 'otto', 'build/implement': 'ada', 'build/review': 'ada' })];

/** Of the factory `name` (null the default), as its reads answer it: `openRunsQuery(factory)` and `finishedTodayQuery(factory, …)`. */
const of =
  (name: string | null) =>
  (run: { factory: string | null }): boolean =>
    run.factory === name;

/** The strip off the fixtures' reads: of every factory, or narrowed as the reads of the factory in view are. */
const strip = (factory?: string) => {
  const mine = factory === undefined ? () => true : of(factory === 'default' ? null : factory);
  return stripOf({
    open: open(OPEN.waiting.filter(mine), OPEN.inFlight.filter(mine)),
    finished: FINISHED.filter(mine),
    factories: FACTORIES,
    ceilings: ceilings({ cap: 7, last: { sessions: 50, runs: 7 } }),
    now: NOW,
    dayStart: DAY,
    factory,
  });
};

/** The strip off `given`'s reads alone, with no factory, no caps and no factory in view. */
const bare = (given: { open?: Pick<OpenRuns, 'waiting' | 'inFlight'>; finished?: FinishedRun[]; factories?: Factory[] }) =>
  stripOf({
    open: given.open ?? open(),
    finished: given.finished ?? [],
    factories: given.factories ?? [],
    ceilings: undefined,
    now: NOW,
    dayStart: DAY,
  });

test('stripOf and readoutOf: the factory in view, its agents at work, and the readout', async (t) => {
  await t.test(
    "the numbers are those of the reads handed, the factory in view's when it names one, the default's those of none",
    (guard) => {
      guard.diagnostic(`stripOf: waitsOnYou, inFlight, landed: each counts what its read hands in, never a run of another factory.`);
      const kit = strip('kit');
      assert.deepEqual([kit.inFlight, kit.waitsOnYou, kit.landed], [1, 0, 0]);
      const home = strip('default');
      assert.deepEqual([home.inFlight, home.waitsOnYou, home.landed], [1, 2, 1]);
    },
  );
  await t.test('the agents at work are counted once each against those hired in view, their steps longest at work first', (guard) => {
    guard.diagnostic(
      `stripOf: agents: agentsOf(rows, hiredIn(...)); rows: rows.slice(0, ROWS_SHOWN), rowsOf(open, now) sorted longest first.`,
    );
    const s = strip();
    assert.deepEqual(s.agents, { count: 2, hired: 2 }, 'ada at work on two steps is one agent; hired: ada and otto');
    assert.deepEqual(
      s.rows.map((r) => `${r.agent} · ${r.step} · ${r.title} ${r.atWork}`),
      ['ada · implement · The kit batch 17m', 'otto · land · The runs page 9m', 'ada · review · The kit batch 5m'],
    );
    assert.deepEqual(strip('default').agents, { count: 1, hired: 1 }, 'none hired in the default factory, and ada at work there');
  });
  await t.test('an agent at work that no factory in view hires counts in the total too, so the count is never past it', (guard) => {
    guard.diagnostic(`stripOf: agents: agentsOf, the hired and those at work together.`);
    const kit = (hires: Record<string, string>) => bare({ open: open([], [flying, kitFlying]), factories: [factory('kit', hires)] });
    assert.deepEqual(kit({ 'build/land': 'otto' }).agents, { count: 2, hired: 2 }, 'ada at work by its step file, otto hired');
    assert.deepEqual(kit({ 'build/land': 'otto', 'build/plan': 'iris' }).agents, { count: 2, hired: 3 }, 'and iris hired, idle');
    assert.equal(bare({ factories: [factory('kit', {})] }).agents.hired, null, 'no agent hired and none at work: no total');
  });
  await t.test('three rows are shown, and the rest said as how many more', (guard) => {
    guard.diagnostic(`stripOf: rows: rows.slice(0, ROWS_SHOWN); more: rows.length - ROWS_SHOWN.`);
    const many = Array.from({ length: 5 }, (_, i) =>
      listed(atWorkBy(summary([['s', 'running']], { id: `r-${i}` }), 's', `agent-${i}`, NOW - (i + 1) * MIN)),
    );
    const s = bare({ open: open([], many) });
    assert.deepEqual([s.rows.length, s.more, s.rows[0].agent], [3, 2, 'agent-4']);
  });
  await t.test('the readout says each count against its cap, and drops the cap where the machine has none', (guard) => {
    guard.diagnostic(
      `stripOf: runs: the list's in flight against ceilings.cap; sessions: sessionsOf(open) against ceilings.last.sessions.`,
    );
    const s = strip();
    assert.equal(readoutOf(s), '2 OF 7 RUNS · 3 OF 50 SESSIONS');
    const uncapped = stripOf({
      open: OPEN,
      finished: FINISHED,
      factories: [],
      ceilings: ceilings({ cap: 0, last: null }),
      now: NOW,
      dayStart: DAY,
    });
    assert.equal(readoutOf(uncapped), '2 RUNS · 3 SESSIONS');
  });
  await t.test("a run that waits on a person and still works is in Wait on you, and its session and its agent's row count", (guard) => {
    guard.diagnostic(`stripOf: sessions: sessionsOf(open), open the waiting with the in flight; rows: rowsOf(open, now).`);
    const twoSteps = summary(
      [
        ['design', 'running'],
        ['plan', 'awaiting approval'],
      ],
      { id: 'r-gate-moves', waitingOnYou: ['plan'] },
    );
    const atGate = waitingRun(atWorkBy(twoSteps, 'design', 'iris', NOW - 4 * MIN));
    const s = bare({ open: open([atGate]) });
    assert.deepEqual([s.waitsOnYou, s.inFlight, s.sessions.count, s.rows.map((r) => r.agent)], [1, 0, 1, ['iris']]);
  });
});

test("the day starts at midnight in the process's time zone", () => {
  const script =
    "import('./src/lib/strip.ts').then((m) => console.log(new Date(m.dayStartOf(Date.parse('2026-10-14T02:30:00Z'))).toISOString()))";
  const run = (TZ: string) =>
    spawnSync(process.execPath, ['-e', script], { cwd: WEB, env: { ...process.env, TZ }, encoding: 'utf8' }).stdout.trim();
  assert.equal(run('America/Montreal'), '2026-10-13T04:00:00.000Z', '10:30 PM the evening before, in Montreal');
  assert.equal(run('UTC'), '2026-10-14T00:00:00.000Z');
  assert.equal(new Date(dayStartOf(NOW)).getHours(), 0);
});

/** A window `extra` says, 50% used of five hours, resetting in an hour. */
const win = (extra: Partial<QuotaWindow> = {}): QuotaWindow => ({
  key: 'five_hour',
  label: '5-hour',
  usedPercentage: 50,
  resetsAt: at(NOW + 60 * MIN),
  reset: false,
  marked: false,
  ...extra,
});

test("runsOutAt and quotaLineOf: when a window runs out, and the quota's line", async (t) => {
  await t.test('a window runs out when its pace so far uses it up before it resets, and never after the reset', () => {
    assert.equal(runsOutAt(win(), NOW), null, '50% in four hours: the rest in four more, after the reset');
    assert.equal(
      runsOutAt(win({ usedPercentage: 90 }), NOW),
      NOW + 1_600_000,
      '90% in four hours: the last 10% in 26 minutes 40, before the reset',
    );
    const fast = win({ usedPercentage: 90, resetsAt: at(NOW + 4 * 60 * MIN) });
    assert.equal(runsOutAt(fast, NOW), NOW + (60 * MIN) / 9, '90% in one hour: the last 10% in a ninth of an hour');
    assert.equal(runsOutAt(win({ key: 'other' }), NOW), null, 'a window of no known length');
  });
  await t.test("the quota's line says when the soonest window runs out and when it resets, else when the most used resets", () => {
    const fast = win({ usedPercentage: 90, resetsAt: at(NOW + 4 * 60 * MIN) });
    const line = quotaLineOf([win({ key: 'seven_day', resetsAt: at(NOW + 86_400_000) }), fast], NOW, 'UTC');
    assert.deepEqual(line, { runsOut: 'Runs out about 2:06 PM', resets: 'resets 6:00 PM' });
    assert.deepEqual(quotaLineOf([win({ usedPercentage: 20 }), win({ usedPercentage: 60, key: 'other' })], NOW, 'UTC'), {
      runsOut: null,
      resets: 'resets 3:00 PM',
    });
    assert.equal(quotaLineOf([win({ resetsAt: null })], NOW, 'UTC'), null);
  });
});

/** Tokens of a run: `total` split over the four kinds, `unmeasured` sessions besides. */
const tokensOf = (total: number, unmeasured = 0, more: Partial<NonNullable<RunView['tokens']>> = {}): RunView['tokens'] => ({
  total,
  input: total / 2,
  output: total / 2,
  cacheRead: total / 4,
  cacheWrite: total / 8,
  uncached: total / 8,
  measured: 1,
  unmeasured,
  said: '',
  split: '',
  ...more,
});

test('stripOf: what counts today, landed, failed, waiting and spent', async (t) => {
  await t.test("a run finished at or after the day's start counts today, landed or failed; one before it counts for nothing", (guard) => {
    guard.diagnostic(
      `stripOf: finishedToday: finishedAt >= dayStart; landed: outcome 'succeeded'; failed: outcome 'failed'; perLanding: today's priced landings.`,
    );
    const s = strip();
    assert.equal(s.landed, 1, 'landed 10 minutes after midnight, not 10 minutes before');
    assert.equal(s.failed, 1, 'failed on the stroke of midnight');
    assert.equal(s.perLanding, 6, "the mean of today's landings alone: yesterday's $100 is not in it");
  });
  await t.test('a landing whose cost was not measured is landed, and left out of the mean cost of a landing', (guard) => {
    guard.diagnostic(`stripOf: priced: landed with a cost; perLanding: the mean of the priced.`);
    const unpriced = ended('r-unpriced', 'succeeded', DAY + 20 * MIN, 0, { cost: null });
    const s = bare({ finished: [landedToday, unpriced] });
    assert.deepEqual([s.landed, s.perLanding], [2, 6]);
  });
  await t.test('a step not at work is no row, though its task started: one that asks a person waits on them', (guard) => {
    guard.diagnostic(`stripOf: rows and sessions: working(run, step), by stepState.`);
    const working = atWorkBy(summary([['plan', 'running']], { id: 'r-asks' }), 'plan', 'iris', NOW - 3 * MIN);
    const asks = listed({ ...working, steps: working.steps.map((s) => ({ ...s, ...coded('needs-human') })) });
    const s = bare({ open: open([], [asks]) });
    assert.deepEqual([s.rows.length, s.agents.count, s.sessions.count], [0, 0, 0]);
  });
  await t.test('a run called off or with its result undecided is neither landed nor failed, though its cost is spent today', (guard) => {
    guard.diagnostic(
      `stripOf: landed and failed: by the list's outcome, never the status (both runs say succeeded); spentUsd: finishedToday in worked.`,
    );
    const s = bare({ finished: [cancelledToday, undecided] });
    assert.deepEqual([s.landed, s.failed, s.spentUsd, s.perLanding], [0, 0, 6, null]);
  });
  await t.test('a run counts in Wait on you or In flight as the list puts it, one that moves and waits with the waiting alone', (guard) => {
    guard.diagnostic(`stripOf: waitsOnYou: open.waiting; inFlight: open.inFlight.`);
    const s = strip();
    assert.equal(s.waitsOnYou, 2, 'the run at its gate and the one that moves and waits');
    assert.equal(s.inFlight, 2, 'the two that move and wait on nobody');
  });
  await t.test(
    'a run the list could not judge counts where the list puts it, in Wait on you or In flight and the readout, and in no other number',
    (guard) => {
      guard.diagnostic(
        `stripOf: waitsOnYou: open.waiting.length and inFlight, runs.count: open.inFlight.length, the unjudged among them; open: judged alone.`,
      );
      const s = bare({ open: open([unjudged('u-wait'), waiting], [unjudged('u-fly'), unjudged('u-fly-2'), flying]) });
      assert.deepEqual([s.waitsOnYou, s.inFlight, s.runs.count], [2, 3, 3]);
      assert.deepEqual([s.spentUsd, s.sessions.count, s.rows.length], [2 + 4, 2, 2], 'the judged runs alone are worked and at work');
    },
  );
  await t.test('a run called off that still moves is in flight while the list says so, and its work today is spent', (guard) => {
    guard.diagnostic(
      `stripOf: inFlight: open.inFlight, never the board's own rule (which left a called-off run out); worked: open runs worked today.`,
    );
    const calledOff = listed(
      summary([['work', 'running']], {
        id: 'r-off-moving',
        cancelledAt: at(NOW - MIN),
        atWork: { ms: 0, since: at(NOW - 5 * MIN), endedAt: null },
        cost: { usd: 9, measured: 1, unmeasured: 0, said: '$9' },
      }),
    );
    const s = bare({ open: open([], [calledOff]) });
    assert.deepEqual([s.inFlight, s.runs.count, s.spentUsd], [1, 1, 9]);
  });
  await t.test(
    "Spent is every run worked today, whole, a cost not measured counting nothing; A landing is '—' before the first",
    (guard) => {
      guard.diagnostic(
        `stripOf: spentUsd: open runs workedToday with finishedToday; workedToday: at work now, or its last task ended since dayStart.`,
      );
      assert.equal(strip().spentUsd, 6 + 3 + 1 + 5 + 2 + 7 + 4, "each run worked or stopped today, never yesterday's landing");
      const idleSinceYesterday = waitingRun(
        summary([['work', 'awaiting approval']], {
          id: 'r-idle',
          status: 'awaiting approval',
          moving: false,
          waitingOnYou: ['plan'],
          atWork: { ms: 10 * MIN, since: null, endedAt: at(DAY - 30 * MIN) },
          cost: { usd: 50, measured: 1, unmeasured: 0, said: '$50' },
        }),
      );
      const quiet = bare({ open: open([idleSinceYesterday]) });
      assert.deepEqual([quiet.waitsOnYou, quiet.spentUsd], [1, 0], 'an open run not worked since midnight spends nothing today');
      assert.equal(dollars(null), '—');
      assert.equal(dollars(7.851), '$7.85', 'to the cent');
      assert.equal(dollars(12.684), '$12.68', 'to the cent above $10 too, as every page says an amount');
      assert.equal(dollars(230.4), '$230.40');
    },
  );
  await t.test("REFUSED: Spent's tokens of a run Spent does not count: they are those of exactly the runs worked today", (guard) => {
    guard.diagnostic(`stripOf: spentTokens: tokensOf(worked), the same runs as spentUsd.`);
    const today = { ...landedToday, tokens: tokensOf(800, 1) };
    const yesterday = { ...landedYesterday, tokens: tokensOf(8_000_000) };
    const unmeasured = { ...failedAtMidnight, tokens: null };
    const s = bare({ finished: [today, yesterday, unmeasured] });
    assert.deepEqual(
      s.spentTokens,
      {
        total: 800,
        input: 400,
        output: 400,
        cacheRead: 200,
        cacheWrite: 100,
        uncached: 100,
        unmeasured: 2,
      },
      "yesterday's run is in no count; the run with a cost and no tokens is one session more that measured none",
    );
  });
  await t.test('a part of the day is null where one counted run lacks it, and the day has no tokens where no run measured any', (guard) => {
    guard.diagnostic(`stripOf: spentTokens: tokensOf's partSum and its null where no run measured any.`);
    const parted = { ...landedToday, tokens: tokensOf(800) };
    const whole = { ...cancelledToday, tokens: tokensOf(80, 0, { cacheRead: null, cacheWrite: null, uncached: null }) };
    const s = bare({ finished: [parted, whole] });
    assert.equal(s.spentTokens?.total, 880);
    assert.deepEqual([s.spentTokens?.cacheRead, s.spentTokens?.cacheWrite, s.spentTokens?.uncached], [null, null, null]);
    assert.equal(s.spentTokens?.input, 440);
    assert.equal(bare({ finished: [landedToday] }).spentTokens, null);
  });
});
