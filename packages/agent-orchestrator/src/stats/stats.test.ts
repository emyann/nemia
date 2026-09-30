/**
 * The flow numbers (`factsOf`, `statsOf`, `stats.ts`), off a real timeline (`timeline`) of hand-built views: each number is keyed on a
 * workflow's structure — `loop:` for rounds, `workspace: main` for landings — never on a step's name, and absent where nothing measured it.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import type { Run } from '../record/record.ts';
import type { Workflow } from '../step/step.ts';
import { timeline, type TaskClock } from '../timeline/timeline.ts';
import { factsOf, statsOf, statsQueryOf, type CheckVerdict, type Facts } from './stats.ts';
import { statsLine, statsLines } from './stats-words.ts';

const MIN = 60_000;
const minus = (at: string, ms: number): string => new Date(Date.parse(at) - ms).toISOString();

/** A step of a fixture workflow, filled by `agent` where one is named. */
const step = (name: string, after: string[], more: Partial<Workflow> & { by?: string } = {}): Workflow => {
  const { by, ...keys } = more;
  return { name, after, body: '', ...(by ? { agent: { name: by, keys: [], body: '', given: {} } } : {}), ...keys };
};

/** The team's shape: a design, the work, a review that loops back to it, and an ending in the checkout. */
const TEAM = [
  step('design', [], { by: 'seldon' }),
  step('implement', ['design'], { by: 'ada' }),
  step('review', ['implement'], { by: 'agora', loop: 'implement', rounds: 3 }),
  step('land', ['review'], { by: 'otto', workspace: 'main', gate: true, check: 'npm test' }),
];

/**
 * One try of a fixture: when it ended, what its session cost (1 unless given; null for unmeasured), its check's verdict if it has one,
 * why the try after it was filed, and whether its session failed.
 */
type Try = { end: string; cost?: number | null; check?: CheckVerdict; then?: 'round' | 'retries'; failed?: true };

/** A session or a check that ran an hour, filed ten minutes before, and ended at `end`: succeeded, unless `failed`. */
const ended = (end: string, cost: number | null, failed = false): TaskClock => ({
  phase: failed ? 'failed' : 'succeeded',
  state: {
    brief: 'x',
    settled: failed ? 'failed' : 'succeeded',
    attempts: [
      {
        startedAt: minus(end, 60 * MIN),
        spawnedAt: minus(end, 60 * MIN),
        endedAt: end,
        reason: 'harness',
        usage: cost === null ? null : { costUsd: cost },
      },
    ],
  },
});

/**
 * A run's read (`RunRead`) over `steps`, each step's tries as given: a session per try ending at its end, or ten minutes before where it
 * has a check, which ends at the end.
 */
function readOf(id: string, steps: readonly Workflow[], tries: Record<string, Try[]>, more: Partial<Run> = {}, again = false) {
  const views = new Map<string, TaskClock>();
  const filed = new Map<string, string>();
  const verdicts = new Map<string, CheckVerdict>();
  const record: Run['steps'] = {};
  for (const [name, list] of Object.entries(tries)) {
    const ids = list.map((t, i) => {
      const taskId = `${id}-${name}-${i + 1}`;
      const sessionEnd = t.check ? minus(t.end, 10 * MIN) : t.end;
      views.set(taskId, ended(sessionEnd, t.cost === undefined ? 1 : t.cost, t.failed));
      filed.set(taskId, minus(sessionEnd, 70 * MIN));
      if (t.check) {
        views.set(`${taskId}-check`, ended(t.end, null));
        filed.set(`${taskId}-check`, minus(t.end, 9 * MIN));
        verdicts.set(`${taskId}-check`, t.check);
      }
      return { taskId, then: t.then ?? 'retries', ...(t.check ? { check: { taskId: `${taskId}-check` } } : {}) };
    });
    const last = ids.at(-1)!;
    record[name] = { taskId: last.taskId, ...(last.check ? { check: last.check } : {}), tries: ids.slice(0, -1) };
  }
  const run = { id, workflowDir: '/r/workflows/build', repo: '/r', workflow: [...steps], steps: record, ...more } as unknown as Run;
  return {
    run,
    steps,
    timeline: timeline(run, views, filed, steps),
    succeeded: (taskId: string) => views.get(taskId)?.phase === 'succeeded',
    verdictOf: (taskId: string) => verdicts.get(taskId) ?? null,
    closeoutOf: (name: string) =>
      steps.find((s) => s.name === name)?.loop ? { outcome: 'done' as const, summary: '', artifacts: [], output: { again } } : undefined,
  };
}

const DAY = '2026-09-10';
const at = (hour: number, day = DAY): string => `${day}T${String(hour).padStart(2, '0')}:00:00.000Z`;
const NOW = new Date(`${DAY}T20:00:00.000Z`);

/** A run of the team that went round its loop twice and landed on the ending's first try. */
const twoRounds = (id: string, steps = TEAM, landed: object = { commit: 'abc' }, more: Partial<Run> = {}) => {
  const [design, implement, review, land] = steps.map((s) => s.name);
  const tries = {
    [design]: [{ end: at(1) }],
    [implement]: [
      { end: at(2), check: 'passed' as const, then: 'round' as const },
      { end: at(4), check: 'passed' as const },
    ],
    [review]: [{ end: at(3), then: 'round' as const }, { end: at(5) }],
    [land]: [{ end: at(7), check: 'passed' as const }],
  };
  return withLanded(readOf(id, steps, tries, more), land, landed);
};

/** `r` with its ending's record saying what the run did with its merge. */
function withLanded<R extends ReturnType<typeof readOf>>(r: R, ending: string, landed: object): R {
  r.run.steps[ending] = { ...r.run.steps[ending], landed } as Run['steps'][string];
  return r;
}

const factsOfAll = (...reads: ReturnType<typeof readOf>[]): Facts => ({
  tries: reads.flatMap((r) => factsOf(r).tries),
  runs: reads.flatMap((r) => factsOf(r).runs),
});

test('rounds are the rounds of the step with `loop:`, whatever it is called, and absent — null, not 0 — in a workflow with no loop', () => {
  const [run] = factsOf(twoRounds('r1')).runs;
  assert.deepEqual(run.rounds, [2]);
  const renamed = TEAM.map((s) => (s.name === 'review' ? { ...s, name: 'critique' } : s));
  const [critiqued] = factsOf(twoRounds('r2', renamed)).runs;
  assert.deepEqual(critiqued.rounds, [2], 'the looping step is found by its `loop:`, not by the name review');
  const noLoop = TEAM.map(({ loop: _loop, rounds: _rounds, ...s }) => s as Workflow);
  const loopless = factsOf(twoRounds('r3', noLoop));
  assert.deepEqual(loopless.runs[0].rounds, []);
  assert.equal(statsOf(loopless, {}, NOW).all.total.rounds, null);
  assert.equal(statsOf(factsOfAll(twoRounds('r1'), twoRounds('r2', renamed)), {}, NOW).all.total.rounds, 2);
});

test('a loop that has not ended accepted counts no rounds: its reviewer asked again, and nobody accepted it', () => {
  const r = readOf(
    'r-open',
    TEAM,
    { design: [{ end: at(1) }], implement: [{ end: at(2) }], review: [{ end: at(3) }], land: [{ end: at(7) }] },
    {},
    true,
  );
  withLanded(r, 'land', { commit: 'abc' });
  assert.deepEqual(factsOf(r).runs[0].rounds, []);
  r.run.acceptances = [{ step: 'review', try: 1, at: at(4), message: 'enough' }];
  assert.deepEqual(factsOf(r).runs[0].rounds, [1], 'an acceptance of the try the loop is on ends it');
});

test('first-try landings read the `workspace: main` step: landed on try 1 counts both, on try 2 only landed, and no ending is absent', () => {
  const first = twoRounds(
    'first',
    TEAM.map((s) => (s.name === 'land' ? { ...s, name: 'ship' } : s)),
  );
  const second = withLanded(
    readOf('second', TEAM, {
      design: [{ end: at(1) }],
      implement: [{ end: at(2) }],
      review: [{ end: at(3) }],
      land: [
        { end: at(5), check: 'refused', then: 'retries' },
        { end: at(7), check: 'passed' },
      ],
    }),
    'land',
    { commit: 'def' },
  );
  const noEnding = TEAM.filter((s) => s.workspace !== 'main');
  const folderish = readOf('none', noEnding, { design: [{ end: at(1) }], implement: [{ end: at(2) }], review: [{ end: at(3) }] });
  const facts = factsOfAll(first, second, folderish);
  const byId = new Map(facts.runs.map((r) => [r.run, r]));
  assert.deepEqual(
    [byId.get('first')?.landed, byId.get('first')?.firstTry],
    [true, true],
    'the ending is found by `workspace: main`, not by its name',
  );
  assert.deepEqual([byId.get('second')?.landed, byId.get('second')?.firstTry], [true, false]);
  assert.deepEqual([byId.get('none')?.landed, byId.get('none')?.firstTry], [null, null]);
  const total = statsOf(facts, {}, NOW).all.total;
  assert.equal(total.firstTry, 0.5);
  assert.equal(total.landed, 2);
  assert.equal(total.runs, 3);
});

test('a run with no ending finishes once each step is done; a check refused or unfinished, or a session failed, leaves it waiting', () => {
  const plain = [step('implement', []), step('document', ['implement'])];
  const finished = (last: Try) => factsOf(readOf('p', plain, { implement: [{ end: at(1) }], document: [last] })).runs.length;
  assert.equal(finished({ end: at(2), check: 'passed' }), 1);
  assert.equal(finished({ end: at(2) }), 1);
  assert.equal(finished({ end: at(2), check: 'refused' }), 0, 'a refused check waits for wf retry');
  assert.equal(finished({ end: at(2), check: 'unfinished' }), 0, 'an unfinished check waits for wf retry --recheck');
  assert.equal(finished({ end: at(2), failed: true }), 0, 'a failed session waits for wf retry');
});

test('an ending that commits in its own prose finishes once done, its landing unknown; one that lands on its check waits to land', () => {
  const prose = TEAM.map((s) => (s.workspace === 'main' ? { ...s, check: undefined } : s));
  const tries = (land: Try[]) => ({
    design: [{ end: at(1) }],
    implement: [{ end: at(2), then: 'round' as const }, { end: at(4) }],
    review: [{ end: at(3), then: 'round' as const }, { end: at(5) }],
    land,
  });
  const [old] = factsOf(readOf('old', prose, tries([{ end: at(7) }]))).runs;
  assert.deepEqual(
    [old?.day, old?.rounds, old?.landed, old?.firstTry],
    [DAY, [2], null, null],
    'a record with no landing counts the run and its rounds, and says nothing of its landing',
  );
  assert.equal(factsOf(readOf('old', prose, tries([{ end: at(7), failed: true }]))).runs.length, 0, 'an ending that failed waits');
  const staged = readOf('staged', TEAM, tries([{ end: at(7), check: 'passed' }]));
  assert.equal(factsOf(staged).runs.length, 0, 'a merge staged and checked waits for the run to land it');
  assert.deepEqual(
    factsOf(withLanded(staged, 'land', { commit: 'abc' })).runs.map((r) => r.landed),
    [true],
  );
});

test('a step that signed off blocked leaves its run waiting, though its session succeeded', () => {
  const plain = [step('implement', []), step('document', ['implement'])];
  const r = readOf('b', plain, { implement: [{ end: at(1) }], document: [{ end: at(2) }] });
  const blocked = { outcome: 'blocked' as const, summary: 'Which one?', artifacts: [] };
  assert.equal(factsOf(r).runs.length, 1);
  assert.equal(factsOf({ ...r, closeoutOf: (name) => (name === 'document' ? blocked : undefined) }).runs.length, 0);
});

test('a cancelled run never finishes: its tries are counted, and the run is not', () => {
  const cancelled = twoRounds('c', TEAM, { commit: 'abc' }, { cancelledAt: at(8) });
  const facts = factsOf(cancelled);
  assert.equal(facts.runs.length, 0);
  assert.equal(facts.tries.length, 6);
  assert.equal(factsOf(twoRounds('c')).runs.length, 1, 'the same run, not cancelled, finished');
});

test("a landed run's cost is absent when one session of it was not measured, and the mean is taken over the others only", () => {
  const measured = twoRounds('measured');
  const partly = (big: number) =>
    withLanded(
      readOf('partly', TEAM, {
        design: [{ end: at(1), cost: null }],
        implement: [{ end: at(2), cost: big }],
        review: [{ end: at(3), cost: big }],
        land: [{ end: at(7), cost: big }],
      }),
      'land',
      { commit: 'x' },
    );
  assert.equal(factsOf(partly(1)).runs[0].costUsd, null);
  assert.equal(factsOf(measured).runs[0].costUsd, 6, 'six sessions at $1');
  for (const big of [1, 1000])
    assert.equal(statsOf(factsOfAll(measured, partly(big)), {}, NOW).all.total.costPerLanded, 6, `unmeasured run at ${big}`);
});

test("a gate wait runs from the try's end to its approval; none without one, none for a try whose approval was an earlier try's", () => {
  const gated = [step('brief', []), step('design', ['brief'], { gate: true, by: 'seldon' }), step('implement', ['design'], { by: 'ada' })];
  const tries = {
    brief: [{ end: at(0) }],
    design: [{ end: at(1), check: 'passed' as const, then: 'retries' as const }, { end: at(3) }],
    implement: [{ end: at(5) }],
  };
  const approved = readOf('g', gated, tries, { approvals: [{ step: 'design', try: 1, at: minus(at(2), 30 * MIN) }] });
  const [one, two] = factsOf(approved).tries.filter((t) => t.step === 'design');
  assert.equal(one.gateWaitMs, 30 * MIN);
  assert.equal(two.gateWaitMs, null, 'try 1 was approved, not try 2, though the brief it comes after ended before the approval');
  assert.equal(factsOf(readOf('n', gated, tries)).tries.find((t) => t.step === 'design')?.gateWaitMs, null);
  const ending = readOf(
    'e',
    TEAM,
    { design: [{ end: at(1) }], implement: [{ end: at(2) }], review: [{ end: at(3) }], land: [{ end: at(9) }] },
    { approvals: [{ step: 'land', try: 1, at: at(5) }] },
  );
  assert.equal(
    factsOf(ending).tries.find((t) => t.step === 'land')?.gateWaitMs,
    2 * 60 * MIN,
    'an ending approved before it is filed waits from the end of what it comes after',
  );
});

test('a try falls on the UTC day it ended: 23:59Z and 00:01Z the next morning are two days', () => {
  const late = '2026-09-10T23:59:00.000Z';
  const early = '2026-09-11T00:01:00.000Z';
  const r = readOf('d', [step('implement', [])], { implement: [{ end: late, then: 'retries' }, { end: early }] });
  const s = statsOf(factsOf(r), {}, new Date('2026-09-11T12:00:00.000Z'));
  assert.deepEqual(
    s.all.days.map((d) => [d.day, d.tries]),
    [
      ['2026-09-10', 1],
      ['2026-09-11', 1],
    ],
  );
});

test('the tiles are the last 14 days to today and the 14 before: a try on today-13 is in the last, one on today-14 in the before', () => {
  const r = readOf('t', [step('implement', [])], {
    implement: [{ end: at(12, '2026-09-17'), then: 'retries' }, { end: at(12, '2026-09-16') }],
  });
  const { last, before } = statsOf(factsOf(r), {}, new Date('2026-09-30T08:00:00.000Z')).all.tiles;
  assert.deepEqual([last.from, last.to, last.tries], ['2026-09-17', '2026-09-30', 1]);
  assert.deepEqual([before.from, before.to, before.tries], ['2026-09-03', '2026-09-16', 1]);
});

test('by agent, a step no agent fills is a group of its own, never the group of an agent that fills a step of the same name', () => {
  const filled = readOf('a', [step('implement', [], { by: 'ada' })], { implement: [{ end: at(1) }] });
  const plain = readOf('b', [step('implement', [])], { implement: [{ end: at(2) }] });
  const s = statsOf(factsOfAll(filled, plain), { by: 'agent' }, NOW);
  assert.deepEqual(
    s.groups.map((g) => [g.key, g.total.tries]),
    [
      ['ada', 1],
      [null, 1],
    ],
  );
  assert.equal(statsOf(factsOfAll(filled, plain), { agent: 'ada' }, NOW).all.total.tries, 1);
});

test('a query refuses a key to go by it does not know, a day that is not one, and a from after its to, naming what it takes', () => {
  const name = (k: string) => `--${k}`;
  const refused = (given: object) => {
    try {
      statsQueryOf(given, name);
    } catch (err) {
      return (err as Error).message;
    }
    return 'not refused';
  };
  assert.match(refused({ by: 'colour' }), /--by takes one of agent, step, factory, workflow, repo/);
  assert.match(refused({ from: '2026-13-40' }), /--from takes a day as YYYY-MM-DD/);
  assert.match(refused({ from: '2026-09-02', to: '2026-09-01' }), /--from 2026-09-02 is after --to 2026-09-01/);
  assert.deepEqual(statsQueryOf({ by: 'repo', from: '2026-09-01' }, name), { by: 'repo', from: '2026-09-01' });
});

test('the recap line is one line, and says — where nothing was measured', () => {
  const line = statsLine(statsOf({ tries: [], runs: [] }, {}, NOW));
  assert.equal(line.split('\n').length, 1);
  assert.match(line, /— \(—\) rounds/);
});

test('a loop that asked for another round leaves a run with no ending waiting, until a person accepts it', () => {
  const noEnding = TEAM.filter((s) => s.workspace !== 'main');
  const tries = { design: [{ end: at(1) }], implement: [{ end: at(2) }], review: [{ end: at(3) }] };
  assert.equal(factsOf(readOf('settled', noEnding, tries)).runs.length, 1, 'the same run, its loop signed off again: false, finished');
  const r = readOf('asked', noEnding, tries, {}, true);
  assert.equal(factsOf(r).runs.length, 0, 'a loop out of rounds that asked again waits on a person');
  r.run.acceptances = [{ step: 'review', try: 1, at: at(4), message: 'enough' }];
  assert.deepEqual(
    factsOf(r).runs.map((run) => run.rounds),
    [[1]],
    'an acceptance of the try the loop is on finishes the run',
  );
});

test('a day whose runs never recorded their landing has no landed count, printed —; a day with one recorded counts it', () => {
  const prose = TEAM.map((s) => (s.workspace === 'main' ? { ...s, check: undefined } : s));
  const old = (id: string) =>
    readOf(id, prose, { design: [{ end: at(1) }], implement: [{ end: at(2) }], review: [{ end: at(3) }], land: [{ end: at(7) }] });
  const unknown = factsOfAll(old('old-1'), old('old-2'));
  const s = statsOf(unknown, { by: 'workflow' }, NOW);
  assert.deepEqual(
    [s.all.total.runs, s.all.total.landed, s.all.total.firstTry],
    [2, null, null],
    'two runs finished, and no record says whether either landed',
  );
  assert.equal(s.groups[0].days.find((d) => d.day === DAY)?.landed, null);
  const row = statsLines(s).find((line) => line.startsWith(`${DAY}  `));
  assert.match(row ?? '', new RegExp(`^${DAY}\\s+2\\s+—\\s`), 'the day row reads — under landed, not 0');
  const mixed = statsOf(factsOfAll(old('old-1'), old('old-2'), twoRounds('landed')), {}, NOW);
  assert.deepEqual([mixed.all.total.runs, mixed.all.total.landed], [3, 1], 'one run of the day recorded its landing');
  const aborted = twoRounds('aborted', TEAM, { aborted: 'its check refused' });
  assert.equal(statsOf(factsOf(aborted), {}, NOW).all.total.landed, 0, 'a run recorded as not landing is counted: 0, not —');
});
