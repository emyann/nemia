/**
 * The words the client prints of the api's answers, on answers built by hand: `nemia passes`' (`passesLines`), `nemia series`'
 * (`seriesLines`), `nemia quota`'s (`quotaLines`), `nemia stats`' (`statsLines`, `statsLine`, `healthLines`), whose numbers the
 * orchestrator's stats tests hold on a store, and `nemia level`'s (`levelLines`), whose data the orchestrator's `nemia-keeper.test.ts`
 * holds. A number nothing measured reads `—`, never 0.
 */
import { beforeAll, describe, test } from 'vitest';
import assert from 'node:assert/strict';
import type { NemiaLevel, PassesRead, Quota, QuotaWindow, StatsGroup, StatsHeadline, StatsHealth, StatsStepRow } from 'objects';
import { passesLines, seriesLines } from '../src/commands/rest/meters.ts';
import { levelLines } from '../src/commands/rest/nemia.ts';
import { quotaLines } from '../src/commands/rest/quota.ts';
import { healthLines, statsLine, statsLines, type StatsRead } from '../src/commands/rest/stats-lines.ts';

/** A headline with nothing measured, `more` over it. */
const headline = (more: Partial<StatsHeadline> = {}) =>
  ({
    runs: 0,
    merged: null,
    rounds: null,
    firstTry: null,
    costPerMerged: null,
    timePerMerged: null,
    tries: 0,
    refused: 0,
    gateWaitMs: null,
    deniedPerTry: null,
    skillsPerTry: null,
    ...more,
  }) satisfies StatsHeadline;

/** A step row of `tries` tries with nothing measured, `more` over it. */
const stepRow = (step: string, more: Partial<StatsStepRow> = {}) =>
  ({
    step,
    agent: 'planner',
    tries: 1,
    ranMs: null,
    checkMs: null,
    costUsd: null,
    costTries: 0,
    checks: { passed: 0, refused: 0, unfinished: 0 },
    gateWaitMs: null,
    deniedCalls: null,
    deniedTries: 0,
    denials: [],
    skillLoads: null,
    skillTries: 0,
    skills: [],
    rules: [],
    ...more,
  }) satisfies StatsStepRow;

/** A group with nothing in it, `more` over it. */
const group = (more: Partial<StatsGroup> = {}) =>
  ({
    total: headline(),
    days: [],
    steps: [],
    tiles: {
      last: { ...headline(), from: '2026-09-17', to: '2026-09-30' },
      before: { ...headline(), from: '2026-09-03', to: '2026-09-16' },
    },
    marks: [],
    tallies: [],
    slowLandings: [],
    ...more,
  }) satisfies StatsGroup;

/** Health with nothing kept. */
const NO_HEALTH: StatsHealth = {
  pass: { p50: null, p95: null },
  runs: null,
  reads: null,
  load: { p95: null, max: null },
  queued: null,
  waitMs: null,
  checkLoad: null,
  quota: [],
};

/** Stats of `all`, nothing else, `more` over it. */
const stats = (all: StatsGroup = group(), more: Partial<StatsRead> = {}) =>
  ({
    from: null,
    to: '2026-09-30',
    by: null,
    filters: {},
    all,
    groups: [],
    unreadable: [],
    health: NO_HEALTH,
    ...more,
  }) satisfies StatsRead;

/** Whether a line of `words` reads as `line`. */
const hasLine = (words: readonly string[], line: RegExp) =>
  assert.ok(
    words.some((l) => line.test(l)),
    words.join('\n'),
  );

test("`nemia passes`' lines: the summary, a row a bucket from the first with passes to the last, and the parts; none kept said so", () => {
  const read: PassesRead = {
    recent: [
      {
        at: '2026-09-30T10:00:00.000Z',
        ms: 30,
        records: 1,
        rested: 0,
        reads: 2,
        runs: 1,
        tasks: 0,
        queued: 0,
        admitted: 0,
        phases: { act: 30 },
      },
      {
        at: '2026-09-30T10:00:05.000Z',
        ms: 80,
        records: 1,
        rested: 0,
        reads: 2,
        runs: 1,
        tasks: 0,
        queued: 0,
        admitted: 0,
        phases: { place: 80 },
      },
    ],
    histogram: [
      { le: 10, count: 0 },
      { le: 50, count: 1 },
      { le: 100, count: 1 },
      { le: null, count: 0 },
    ],
    parts: [
      { phase: 'place', ms: 40, share: 80 / 110 },
      { phase: 'act', ms: 15, share: 30 / 110 },
    ],
    summary: {
      passes: 2,
      medianMs: 55,
      slowestMs: 80,
      reads: 2,
      at: '2026-09-30T10:00:05.000Z',
      runs: 1,
      tasks: 0,
      queued: 0,
      admitted: 0,
    },
    bounds: [10, 50, 100],
  };
  const lines = passesLines(read);
  assert.match(lines[0] ?? '', /^2 passes since .*: 55\.0 ms a pass \(median\), slowest 80\.0$/);
  assert.equal(lines.filter((l) => /^ +≤ \d+ ms /.test(l)).length, 2, lines.join('\n'));
  assert.ok(lines.includes('  place       40.0 ms  73%'), lines.join('\n'));
  assert.match(passesLines({ ...read, recent: [], summary: null })[0] ?? '', /^no pass is kept yet/);
});

test("`nemia series`' lines: the range, then a series and its labels a line, its latest and highest; none kept said so", () => {
  const point = { t: '2026-09-30T10:00:00.000Z', n: 1, mean: 3, min: 3, max: 3, last: 3 };
  const lines = seriesLines({
    range: '24h',
    span: 'minute',
    from: '2026-09-29T10:00:00.000Z',
    to: '2026-09-30T10:00:00.000Z',
    series: [{ s: 'pass.ms', l: { phase: 'place' }, points: [point, { ...point, max: 250, last: 12.5, p50: 10, p95: 120 }] }],
  });
  assert.deepEqual(lines, [
    '24h, a point a minute, from 2026-09-29T10:00:00.000Z to 2026-09-30T10:00:00.000Z:',
    '  pass.ms phase=place: 2 points, latest 120, highest 250',
  ]);
  assert.match(seriesLines({ range: '7d', span: 'hour', from: '', to: '', series: [] })[0] ?? '', /^nothing is kept for 7d yet/);
});

/** A window of the quota as the api answers it, `over` what the row means. */
const quotaWindow = (over: Partial<QuotaWindow>) =>
  ({
    key: 'five_hour',
    label: '5-hour',
    usedPercentage: 38.4,
    resetsAt: '2026-11-20T14:00:00.000Z',
    reset: false,
    marked: false,
    ...over,
  }) satisfies QuotaWindow;

/** The quota as the api answers it, `over` what the row means. */
const quota = (over: Partial<Quota>) =>
  ({
    state: 'fresh',
    askedAt: '2026-11-20T10:00:00.000Z',
    ageMs: 1000,
    againAt: '2026-11-20T10:05:00.000Z',
    subscription: 'max',
    windows: [],
    last: null,
    keepMs: 300000,
    markAt: 80,
    said: null,
    ...over,
  }) satisfies Quota;

describe("`nemia quota`'s lines", () => {
  const windows = [quotaWindow({}), quotaWindow({ key: 'seven_day', label: 'week', usedPercentage: 86, resetsAt: null, marked: true })];

  test('fresh: a line a window, its label, its used share and its reset, the mark on the marked one alone', () => {
    const lines = quotaLines(quota({ windows }));
    const five = lines.find((l) => l.includes('5-hour'));
    const week = lines.find((l) => l.includes('week'));
    assert.ok(five !== undefined && week !== undefined, lines.join('\n'));
    assert.match(five, /38%/);
    assert.match(five, /2026-11-20T14:00:00\.000Z/);
    assert.match(week, /86%/);
    assert.ok(!week.includes('null'), week);
    assert.ok(week.includes('80%') && !five.includes('80%'), lines.join('\n'));
    assert.ok(!lines.some((l) => l.includes('38.4')), 'the share is whole');
  });

  test("a window that reset since the reading is said not read since, its share the window before's, and is not marked", () => {
    const lines = quotaLines(
      quota({
        windows: [quotaWindow({ label: 'week', usedPercentage: 86, resetsAt: '2026-11-19T09:00:00.000Z', reset: true, marked: true })],
      }),
    );
    const week = lines.find((l) => l.includes('week'));
    assert.ok(week !== undefined, lines.join('\n'));
    assert.match(week, /not read since/);
    assert.match(week, /2026-11-19T09:00:00\.000Z/);
    assert.ok(!week.includes('80%'), week);
    assert.ok(!/^ {2}week: 86% used/.test(week), week);
  });

  test("not fresh: the api's own sentence first, and no window line where it held none", () => {
    const lines = quotaLines(quota({ state: 'no-claude', windows: [], said: 'PLANTED SAID', askedAt: null, ageMs: null }));
    assert.equal(lines[0], 'PLANTED SAID');
    assert.equal(lines.length, 1, lines.join('\n'));
  });

  test('not fresh with a last reading: its windows after the sentence, under the time it was asked', () => {
    const lines = quotaLines(
      quota({ state: 'timeout', said: 'PLANTED SAID', windows: [], last: { askedAt: '2026-11-19T09:00:00.000Z', windows } }),
    );
    assert.equal(lines[0], 'PLANTED SAID');
    assert.ok(lines[1]?.includes('2026-11-19T09:00:00.000Z'), lines.join('\n'));
    assert.ok(!lines.slice(1).some((l) => l.includes('2026-11-20T10:00:00.000Z')), 'the last reading is not said as now');
    assert.equal(lines.filter((l) => l.includes('5-hour') || l.includes('week')).length, 2, lines.join('\n'));
  });
});

describe('`statsLines` and `statsLine`: the stats in words, — where nothing was measured', () => {
  let empty!: string;
  beforeAll(() => {
    empty = statsLine(stats());
  });
  test('the recap line is one line, — where no round or landing was measured', () => {
    assert.equal(empty.split('\n').length, 1);
    assert.match(empty, /— \(—\) rounds/);
    assert.match(empty, /— \(—\) merged/);
    assert.match(empty, /— \(—\) skills loaded$/);
  });
  test('an empty store says nothing has ended, and no recap line', () => {
    const words = statsLines(stats());
    assert.ok(words.includes('no try has ended, and no run has finished'), words.join('\n'));
    assert.ok(!words.some((l) => l.includes('runs finished')));
  });
  test('the day row reads — under merged where no run recorded it, not 0', () => {
    const day = { ...headline({ runs: 2, tries: 2 }), day: '2026-09-28' };
    hasLine(statsLines(stats(group({ days: [day] }), { from: '2026-09-28' })), /^2026-09-28\s+2\s+—\s/);
  });
  test('refused calls: — where none were measured, a measured 0 as 0/try, a small rate keeps a significant figure', () => {
    const last = (deniedPerTry: number | null) =>
      stats(group({ tiles: { ...group().tiles, last: { ...group().tiles.last, deniedPerTry } } }));
    assert.match(statsLine(last(null)), /— \(—\) calls denied/);
    assert.match(statsLine(last(0)), /0\/try \(—\) calls denied/);
    assert.match(statsLine(last(1 / 300)), / 0\.003\/try \(—\) calls denied/);
  });
  test('the step row says its tries, time, check time and cost, and how many tries had their skills measured', () => {
    const words = statsLines(
      stats(
        group({
          steps: [
            stepRow('implement', {
              agent: 'implementer',
              tries: 2,
              ranMs: 4 * 3_600_000,
              checkMs: 2 * 3_600_000,
              costUsd: 2,
              costTries: 2,
            }),
            stepRow('design', { tries: 3, skillLoads: 4, skillTries: 2 }),
          ],
        }),
      ),
    );
    hasLine(words, /^implement\s+implementer\s+2\s+4h00m\s+2h00m\s+\$2\.00\s/);
    hasLine(words, /^design .*\s4 \(2 of 3\)$/);
  });
  test("a skill's row says how many touched tries loaded it, and — where it declares no path; a rule row its kept and broken", () => {
    const words = statsLines(
      stats(
        group({
          steps: [
            stepRow('design', {
              skills: [
                { skill: 'change-the-board', count: 1, tries: 1, touched: 2, loadedWhenTouched: 1 },
                { skill: 'shadcn', count: 1, tries: 1, touched: null, loadedWhenTouched: null },
              ],
              rules: [{ skill: 'write-a-spec', rule: 'read-with-read', kept: 0, broken: 1 }],
            }),
          ],
        }),
      ),
    );
    hasLine(words, /^step\s+agent\s+skill\s+loads\s+tries\s+when touched$/);
    hasLine(words, /^design\s+planner\s+change-the-board\s+1\s+1\s+1 of 2$/);
    hasLine(words, /^design\s+planner\s+shadcn\s+1\s+1\s+—$/);
    hasLine(words, /^step\s+agent\s+skill\s+rule\s+kept\s+broken$/);
    hasLine(words, /^design\s+planner\s+write-a-spec\s+read-with-read\s+0\s+1$/);
    assert.ok(!statsLines(stats(group({ steps: [stepRow('design')] }))).some((l) => /^step\s+agent\s+skill\s+rule/.test(l)));
  });
  test('a day row says the calls refused and the skills loaded a try, — where none was measured; a call refused a row', () => {
    const days = [
      { ...headline({ tries: 2, deniedPerTry: 2, skillsPerTry: 3 }), day: '2026-09-26' },
      { ...headline({ tries: 1, deniedPerTry: 0, skillsPerTry: 0 }), day: '2026-09-25' },
      { ...headline({ tries: 1 }), day: '2026-09-24' },
    ];
    const steps = [
      stepRow('write', { agent: 'implementer', tries: 3, deniedCalls: 4, deniedTries: 2, denials: [{ call: 'Write(/x)', count: 2 }] }),
    ];
    const words = statsLines(stats(group({ days, steps }), { from: '2026-09-24' }));
    hasLine(words, /^2026-09-26\s.*\s2\/try\s+3\/try$/);
    hasLine(words, /^2026-09-25\s.*\s0\/try\s+0\/try$/);
    hasLine(words, /^2026-09-24\s.*\s—\s+—$/);
    hasLine(words, /^write\s+implementer\s+3\s.*\s4 \(2 of 3\)\s+—$/);
    hasLine(words, /^write\s+implementer\s+Write\(\/x\)\s+2$/);
  });
  test('a change to what the runs froze is a row under its header: its day, what changed, its run and the run before', () => {
    const marks = [
      { day: '2026-09-21', kind: 'skill' as const, name: 'review-a-change', run: 'marks-2', since: 'marks-1' },
      { day: '2026-09-23', kind: 'agent' as const, name: 'reviewer', run: 'marks-5', since: 'marks-4' },
    ];
    const words = statsLines(stats(group({ marks })));
    hasLine(words, /^day\s+changed\s+run\s+since$/);
    hasLine(words, /^2026-09-21\s+skill review-a-change\s+marks-2\s+marks-1$/);
    hasLine(words, /^2026-09-23\s+agent reviewer\s+marks-5\s+marks-4$/);
    assert.ok(!statsLines(stats()).some((l) => /^day\s+changed/.test(l)), 'no change, no header');
  });
  test("a tally's rows per day and over the range: — on a day with a try and no measure", () => {
    const days = [
      { ...headline({ tries: 2 }), day: '2026-09-08' },
      { ...headline({ tries: 1 }), day: '2026-09-09' },
      { ...headline(), day: '2026-09-10' },
    ];
    const tallies = [
      { step: 'triage', tally: 'issues', total: { sum: 3, tries: 2 }, days: [{ day: '2026-09-08', sum: 3, tries: 2 }] },
      { step: 'triage', tally: 'issues.open', total: { sum: null, tries: 0 }, days: [] },
    ];
    const words = statsLines(stats(group({ days, tallies }), { from: '2026-09-08' }));
    assert.ok(words.includes('day         step    tally        sum  tries'), words.join('\n'));
    hasLine(words, /^2026-09-08\s+triage\s+issues\s+3\s+2$/);
    hasLine(words, /^2026-09-09\s+triage\s+issues\.open\s+—\s+0$/);
    assert.ok(!words.some((l) => l.startsWith('2026-09-10  triage')), 'a day nothing happened on is left out');
    hasLine(words, /^all\s+triage\s+issues\s+3\s+2$/);
  });
  test('a slow landing is said under its header, and counted on the recap line within the last 14 days', () => {
    const slow = { day: '2026-09-28', run: 'slow', step: 'land', try: 1, checkMs: 1_377_000, deadlineMs: 2_700_000, share: 1377 / 2700 };
    const one = stats(group({ slowLandings: [slow] }));
    hasLine(statsLines(one), /^landing checks over half their deadline: measure .* LANDING_CHECK_DEADLINE_SECONDS/);
    hasLine(statsLines(one), /\bslow\s+land\s+1\s+22m57s\s+45m00s\s+51%/);
    assert.match(statsLine(one), /, 1 landing check over half its deadline: measure again$/);
    assert.match(statsLine(stats(group({ slowLandings: [slow, { ...slow, run: 'b' }] }))), /, 2 landing checks over half their deadline/);
    assert.doesNotMatch(statsLine(stats(group({ slowLandings: [{ ...slow, day: '2026-09-01' }] }))), /over half/);
    assert.ok(!statsLines(stats()).some((l) => l.startsWith('landing checks over half')));
  });
  test("each workflow step's memory peaks are said as quantities, — where none was measured, with when a peak is kept", () => {
    const MI = 1024 ** 2;
    const GI = 1024 * MI;
    const row = { workflow: 'build', tries: 4, measured: 3, medianBytes: 812 * MI, p90Bytes: 1.2 * GI, maxBytes: 3 * GI };
    const memory = [
      { ...row, step: 'implement', askedBytes: 2 * GI, aboveAsked: 1 },
      { ...row, step: 'land', tries: 2, measured: 0, medianBytes: null, p90Bytes: null, maxBytes: null, askedBytes: null, aboveAsked: 0 },
    ];
    const words = statsLines(stats(group({ memory })));
    hasLine(words, /^memory each step peaked at/);
    hasLine(words, /^build\s+implement\s+4\s+3\s+812Mi\s+1\.2Gi\s+3Gi\s+2Gi\s+1 of 3$/);
    hasLine(words, /^build\s+land\s+2\s+0\s+—\s+—\s+—\s+—\s+—$/);
    hasLine(words, /^a peak is kept only for a session run under a memory limit/);
    const all = statsLines(stats(group({ memory: [{ ...row, step: 'implement', tries: 3, askedBytes: 2 * GI, aboveAsked: 1 }] })));
    assert.ok(!all.some((l) => l.startsWith('a peak is kept only')), 'every try measured: no line on when a peak is kept');
    assert.ok(!statsLines(stats()).some((l) => l.startsWith('memory each step')), 'no memory rows, no table');
  });
  test("the system's health is said under `system` where the series kept some, and nothing where none", () => {
    const health: StatsHealth = {
      pass: { p50: 12.3, p95: 80 },
      runs: 40,
      reads: 3,
      load: { p95: 0.5, max: 1.25 },
      queued: 2,
      waitMs: 90_000,
      checkLoad: 0.4,
      quota: [{ harness: 'h', window: 'week', latest: 42, peak: 50 }],
    };
    assert.deepEqual(healthLines(health), [
      'system',
      '  a pass: 12.3 ms (p50), 80.0 ms (p95)',
      '  runs in the store: 40 at most; journal reads a pass: 3 (p95)',
      '  sessions queued: 2 at most, waiting 1m30s at longest',
      '  load: 0.5 (p95), 1.25 at most; checks filed at 0.4 (p50)',
      '  quota h week: 42% used, 50% at most',
    ]);
    assert.ok(!statsLines(stats()).includes('system'));
  });
  test('a run left out because a journal of it does not read is named; a filter and a group by key are said', () => {
    const words = statsLines(
      stats(group(), {
        unreadable: ['marks-2', 'spoilt'],
        filters: { agent: 'planner' },
        by: 'factory',
        groups: [{ ...group(), key: 'mill' }],
      }),
    );
    hasLine(words, /^left out, .*\bnemia ls\b.*: marks-2, spoilt$/);
    assert.equal(words[0], 'only agent planner');
    assert.ok(words.includes('factory mill'), words.join('\n'));
  });
});

/** Where Nemia is with nothing filed, `more` over it. */
const where = (more: Partial<typeof NemiaLevel.Type> = {}) =>
  ({
    level: 'manual',
    since: null,
    task: null,
    phase: null,
    sessionId: null,
    reach: [],
    bridge: null,
    stopped: false,
    rests: true,
    spend: null,
    allows: [],
    factories: [{ factory: 'default', level: 'manual', default: 'manual', own: null, raise: null }],
    untrusted: null,
    ...more,
  }) satisfies typeof NemiaLevel.Type;

test("`nemia level`'s lines: the store, each factory and its raise, her session, why her folder could not be trusted, her spend and how to reach her", () => {
  assert.deepEqual(levelLines(where()), [
    'Nemia: the store at manual',
    'factories (a raise ends by itself, read as it passes):',
    "  default: manual (the store's level, for runs in no factory)",
    'she rests: a message in her chat wakes her',
  ]);
  assert.ok(!levelLines(where({ rests: false })).some((line) => line.startsWith('she rests')), 'her session open: she does not rest');
  const stopped = levelLines(where({ stopped: true }));
  hasLine(stopped, /^it was stopped from outside/);
  assert.ok(!stopped.some((line) => line.startsWith('she rests')), 'stopped from outside: said as stopped, not as resting');
  const raise = { level: 'semi-auto' as const, until: '2026-11-12T12:00:00.000Z' };
  const words = levelLines(
    where({
      level: 'semi-auto',
      since: '2026-11-12T10:00:00.000Z',
      task: 'nemia',
      phase: 'working',
      reach: ['nemia chat'],
      rests: false,
      spend: { usd: 0.004, measured: 1, unmeasured: 2 },
      untrusted: 'the file did not read: fix it',
      factories: [{ factory: 'mill', level: 'semi-auto', default: 'manual', own: null, raise }],
    }),
  );
  hasLine(words, /^Nemia: the store at semi-auto since 2026-11-12T10:00:00\.000Z$/);
  hasLine(words, /^ {2}mill: semi-auto until 2026-11-12T12:00:00\.000Z, then manual \(the store's\)$/);
  hasLine(words, /^her session nemia: working$/);
  hasLine(words, /^her folder could not be trusted.*the file did not read: fix it$/);
  assert.ok(!levelLines(where({ level: 'semi-auto' })).some((line) => line.includes('trusted')), 'no refusal: nothing said of her trust');
  hasLine(words, /^spent \$0\.004 over 1 session ended, 2 not measured;/);
  assert.deepEqual(words.slice(words.indexOf('reach her:')), ['reach her:', '  nemia chat']);
});
