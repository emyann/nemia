/**
 * The Overview's strip (src/lib/strip.ts): the factories' day counted from a start handed in, on runs that cross it — landed and failed
 * either side of midnight, one called off, one undecided, one waiting on a person, one that moves and waits — the agents at work, the
 * readout's caps and the quota's line. `npm run e2e` reads the strip on `/` (`overview-strip`).
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import type { Factory, QuotaWindow, RunSummary } from '../src/lib/api.ts';
import { summary } from './run-fixtures.ts';
import { ceilings } from './factory-fixtures.ts';
import { dayStartOf, dollars, quotaLineOf, readoutOf, runsOutAt, stripOf } from '../src/lib/strip.ts';

const WEB = path.join(import.meta.dirname, '..');
const MIN = 60_000;
const DAY = Date.parse('2026-10-14T04:00:00.000Z');
const NOW = DAY + 10 * 60 * MIN;
const at = (ms: number) => new Date(ms).toISOString();

/** A run whose work stopped at `end`, as `status` says, costing `usd`. */
const ended = (id: string, status: RunSummary['status'], end: number, usd: number, extra: Partial<RunSummary> = {}): RunSummary =>
  summary([['work', status === 'awaiting approval' ? 'awaiting approval' : 'succeeded']], {
    id,
    status,
    moving: false,
    atWork: { ms: 10 * MIN, since: null, endedAt: at(end) },
    cost: { usd, measured: 1, unmeasured: 0, said: `$${usd}` },
    ...extra,
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
  commands: { attach: '', rm: '', add: '', schedule: '', trust: '' },
  untrusted: [],
  template: null,
});

/** A step of `run` at work by `agent` since `since`. */
const atWorkBy = (run: RunSummary, step: string, agent: string, since: number): RunSummary => ({
  ...run,
  steps: [...run.steps.filter((s) => s.name !== step), { ...run.steps[0], name: step, status: 'running', agent, since: at(since) }],
});

const landedToday = ended('r-landed', 'succeeded', DAY + 10 * MIN, 6);
const landedYesterday = ended('r-old', 'succeeded', DAY - 10 * MIN, 100);
const failedAtMidnight = ended('r-failed', 'failed', DAY, 3);
const cancelledToday = ended('r-off', 'cancelled', DAY + 60 * MIN, 1, { cancelledAt: at(DAY + 60 * MIN) });
const undecided = ended('r-undecided', 'succeeded', DAY + 90 * MIN, 5, {
  toDecide: { kind: 'result', branches: ['wf/r/ship'], said: 'merge or drop wf/r/ship', command: 'git merge wf/r/ship' },
});
const waiting = ended('r-gate', 'awaiting approval', DAY + 3 * 60 * MIN, 2, { waitingOnYou: ['plan'], onYou: ['approve plan'] });
const movesAndWaits = summary([['plan', 'needs-human']], {
  id: 'r-both',
  waitingOnYou: ['plan'],
  atWork: { ms: 0, since: at(NOW - 30 * MIN), endedAt: null },
  cost: { usd: 7, measured: 1, unmeasured: 0, said: '$7' },
});
const flying = atWorkBy(
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
);
const kitFlying = atWorkBy(
  summary([['land', 'running']], { id: 'r-kit', factory: 'kit', brief: 'The runs page' }),
  'land',
  'otto',
  NOW - 9 * MIN,
);

const RUNS = [landedToday, landedYesterday, failedAtMidnight, cancelledToday, undecided, waiting, movesAndWaits, flying, kitFlying];
const FACTORIES = [factory('default', {}), factory('kit', { 'build/land': 'otto', 'build/implement': 'ada', 'build/review': 'ada' })];

const strip = (factory?: string) =>
  stripOf({
    runs: RUNS,
    factories: FACTORIES,
    ceilings: ceilings({ cap: 7, last: { sessions: 50, runs: 7 } }),
    now: NOW,
    dayStart: DAY,
    factory,
  });

test("a run's work that stopped at or after the day's start counts today, landed or failed; one before it counts for nothing", () => {
  const s = strip();
  assert.equal(s.landed, 1, 'landed 10 minutes after midnight, not 10 minutes before');
  assert.equal(s.failed, 1, 'failed on the stroke of midnight');
  assert.equal(s.perLanding, 6, "the mean of today's landings alone: yesterday's $100 is not in it");
});

test('a run called off or with its result undecided is neither landed nor failed, though its cost is spent today', () => {
  const s = stripOf({ runs: [cancelledToday, undecided], factories: [], ceilings: undefined, now: NOW, dayStart: DAY });
  assert.deepEqual([s.landed, s.failed, s.spentUsd, s.perLanding], [0, 0, 6, null]);
});

test('a run that waits on a person counts in Wait on you alone, one that moves and waits too; In flight is the rest of the open runs', () => {
  const s = strip();
  assert.equal(s.waitsOnYou, 2, 'the run at its gate and the one that moves and waits');
  assert.equal(s.inFlight, 2, 'the two that move and wait on nobody');
});

test("Spent is every run worked today, whole, a cost not measured counting nothing; A landing is '—' before the first", () => {
  assert.equal(strip().spentUsd, 6 + 3 + 1 + 5 + 2 + 7 + 4, "each run worked or stopped today, never yesterday's landing");
  assert.equal(dollars(null), '—');
  assert.equal(dollars(12.184), '$12.18');
  assert.equal(dollars(230.4), '$230');
});

test('the factory in view keeps its own runs, and the default factory those whose record names none', () => {
  const kit = strip('kit');
  assert.deepEqual([kit.inFlight, kit.waitsOnYou, kit.landed], [1, 0, 0]);
  const home = strip('default');
  assert.deepEqual([home.inFlight, home.waitsOnYou, home.landed], [1, 2, 1]);
});

test('the agents at work are counted once each against those hired in view, their steps longest at work first', () => {
  const s = strip();
  assert.deepEqual(s.agents, { count: 2, hired: 2 }, 'ada at work on two steps is one agent; hired: ada and otto');
  assert.deepEqual(
    s.rows.map((r) => `${r.agent} · ${r.step} · ${r.title} ${r.atWork}`),
    ['ada · implement · The kit batch 17m', 'otto · land · The runs page 9m', 'ada · review · The kit batch 5m'],
  );
  assert.equal(strip('default').agents.hired, null, 'none hired in the default factory');
});

test('three rows are shown, and the rest said as how many more', () => {
  const many = Array.from({ length: 5 }, (_, i) =>
    atWorkBy(summary([['s', 'running']], { id: `r-${i}` }), 's', `agent-${i}`, NOW - (i + 1) * MIN),
  );
  const s = stripOf({ runs: many, factories: [], ceilings: undefined, now: NOW, dayStart: DAY });
  assert.deepEqual([s.rows.length, s.more, s.rows[0].agent], [3, 2, 'agent-4']);
});

test('the readout says each count against its cap, and drops the cap where the machine has none', () => {
  const s = strip();
  assert.equal(readoutOf(s), '2 OF 7 RUNS · 3 OF 50 SESSIONS');
  const bare = stripOf({ runs: RUNS, factories: [], ceilings: ceilings({ cap: 0, last: null }), now: NOW, dayStart: DAY });
  assert.equal(readoutOf(bare), '2 RUNS · 3 SESSIONS');
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

test('a window runs out when its pace so far uses it up before it resets, and never after the reset', () => {
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

test("the quota's line says when the soonest window runs out and when it resets, else when the most used resets", () => {
  const fast = win({ usedPercentage: 90, resetsAt: at(NOW + 4 * 60 * MIN) });
  const line = quotaLineOf([win({ key: 'seven_day', resetsAt: at(NOW + 86_400_000) }), fast], NOW, 'UTC');
  assert.deepEqual(line, { runsOut: 'Runs out about 2:06 PM', resets: 'resets 6:00 PM' });
  assert.deepEqual(quotaLineOf([win({ usedPercentage: 20 }), win({ usedPercentage: 60, key: 'other' })], NOW, 'UTC'), {
    runsOut: null,
    resets: 'resets 3:00 PM',
  });
  assert.equal(quotaLineOf([win({ resetsAt: null })], NOW, 'UTC'), null);
});
