/**
 * The flow numbers (`factsOf`, `statsOf`, `stats.ts`), off a real timeline (`timeline`) of hand-built views: each number is keyed on a
 * workflow's structure — `loop:` for rounds, `workspace: main` for landings — never on a step's name, and absent where nothing measured it.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import type { Run } from '../record/record.ts';
import type { EarlierTry } from '../retry/index.ts';
import type { Workflow } from '../step/step.ts';
import { timeline, type TaskClock } from '../timeline/timeline.ts';
import { factsOf, statsOf, statsQueryOf, type CheckVerdict, type Facts } from './stats.ts';
import { statsLine, statsLines } from './stats-words.ts';
import type { SkillRule } from '../skills/skills.ts';

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
 * why the try after it was filed, whether its session failed, the calls its session was refused, the skills it loaded (unmeasured
 * unless given), whether it is a recheck, sharing the try before it's session, or answers that session, held open, as a turn of it
 * that ends at its end, and the fields its session's closeout declared, where it made one; and, for its check, how many seconds it ran
 * (an hour unless given) and the deadline in seconds its task was filed with.
 */
type Try = {
  end: string;
  cost?: number | null;
  check?: CheckVerdict;
  cause?: 'round' | 'retries';
  failed?: true;
  denied?: string[];
  skills?: string[];
  files?: string[];
  recheck?: true;
  answers?: true;
  closeout?: Record<string, unknown>;
  checkRan?: number;
  deadline?: number;
};

/** A session or a check that ran `ranMs`, an hour unless given, and ended at `end`: succeeded, unless `failed`. */
const ended = (end: string, cost: number | null, failed = false, ranMs = 60 * MIN): TaskClock => ({
  phase: failed ? 'failed' : 'succeeded',
  state: {
    brief: 'x',
    settled: failed ? 'failed' : 'succeeded',
    attempts: [
      {
        startedAt: minus(end, ranMs),
        spawnedAt: minus(end, ranMs),
        endedAt: end,
        reason: 'harness',
        usage: cost === null ? null : { costUsd: cost },
      },
    ],
  },
});

/** `view` answered in the same session: its attempts, then a turn more of ten minutes that ended at `end` and cost fifty cents. */
const answeredBy = (view: TaskClock, end: string): TaskClock => {
  const turn = Math.max(...view.state.attempts.map((a) => a.turn ?? 0)) + 1;
  const answer = {
    startedAt: minus(end, 10 * MIN),
    spawnedAt: minus(end, 10 * MIN),
    endedAt: end,
    reason: 'harness',
    usage: { costUsd: 0.5 },
    turn,
  };
  return { ...view, state: { ...view.state, attempts: [...view.state.attempts, answer] } };
};

/**
 * A run's read (`RunRead`) over `steps`, each step's tries as given: a session per try ending at its end, or ten minutes before where it
 * has a check, which ends at the end.
 */
function readOf(id: string, steps: readonly Workflow[], tries: Record<string, Try[]>, more: Partial<Run> = {}, again = false) {
  const views = new Map<string, TaskClock>();
  const filed = new Map<string, string>();
  const verdicts = new Map<string, CheckVerdict>();
  const denied = new Map<string, string[]>();
  const skills = new Map<string, string[]>();
  const files = new Map<string, string[]>();
  const closeouts = new Map<string, Record<string, unknown>>();
  const deadlines = new Map<string, number>();
  const record: Run['steps'] = {};
  for (const [name, list] of Object.entries(tries)) {
    const ids: EarlierTry[] = [];
    list.forEach((t, i) => {
      const own = `${id}-${name}-${i + 1}`;
      const taskId = t.recheck || t.answers ? ids[i - 1].taskId : own;
      const sessionEnd = t.check ? minus(t.end, 10 * MIN) : t.end;
      if (t.answers) {
        ids[i - 1].cause = 'nudge';
        views.set(taskId, answeredBy(views.get(taskId)!, sessionEnd));
      } else {
        views.set(taskId, ended(sessionEnd, t.cost === undefined ? 1 : t.cost, t.failed));
        filed.set(taskId, minus(sessionEnd, 70 * MIN));
      }
      if (t.denied) denied.set(taskId, t.denied);
      if (t.skills) skills.set(taskId, t.skills);
      if (t.files) files.set(taskId, t.files);
      if (t.closeout) closeouts.set(taskId, t.closeout);
      if (t.check) {
        views.set(`${own}-check`, ended(t.end, null, false, t.checkRan === undefined ? 60 * MIN : t.checkRan * 1000));
        if (t.deadline !== undefined) deadlines.set(`${own}-check`, t.deadline);
        filed.set(`${own}-check`, minus(t.end, 9 * MIN));
        verdicts.set(`${own}-check`, t.check);
      }
      ids.push({ taskId, cause: t.cause ?? 'retries', ...(t.check ? { check: { taskId: `${own}-check` } } : {}) });
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
    deniedOf: (taskId: string) => denied.get(taskId) ?? [],
    skillsOf: (taskId: string) => skills.get(taskId) ?? null,
    filesOf: (taskId: string) => files.get(taskId) ?? null,
    rulesOf: (_step: Workflow): ReadonlyMap<string, readonly SkillRule[]> => new Map(),
    appliesOf: (_step: Workflow): ReadonlyMap<string, readonly string[]> => new Map(),
    deadlineOf: (taskId: string) => deadlines.get(taskId) ?? null,
    closeoutOfTask: (taskId: string) => {
      const output = closeouts.get(taskId);
      return output && { outcome: 'done' as const, summary: '', artifacts: [], output };
    },
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
      { end: at(2), check: 'passed' as const, cause: 'round' as const },
      { end: at(4), check: 'passed' as const },
    ],
    [review]: [{ end: at(3), cause: 'round' as const }, { end: at(5) }],
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
  frozen: [],
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
  assert.equal(statsOf({ ...loopless, frozen: [] }, {}, NOW).all.total.rounds, null);
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
        { end: at(5), check: 'refused', cause: 'retries' },
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
  assert.equal(finished({ end: at(2), check: 'refused' }), 0, 'a refused check waits for nemia retry');
  assert.equal(finished({ end: at(2), check: 'unfinished' }), 0, 'an unfinished check waits for nemia retry --recheck');
  assert.equal(finished({ end: at(2), failed: true }), 0, 'a failed session waits for nemia retry');
});

test('an ending that commits in its own prose finishes once done, its landing unknown; one that lands on its check waits to land', () => {
  const prose = TEAM.map((s) => (s.workspace === 'main' ? { ...s, check: undefined } : s));
  const tries = (land: Try[]) => ({
    design: [{ end: at(1) }],
    implement: [{ end: at(2), cause: 'round' as const }, { end: at(4) }],
    review: [{ end: at(3), cause: 'round' as const }, { end: at(5) }],
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
    design: [{ end: at(1), check: 'passed' as const, cause: 'retries' as const }, { end: at(3) }],
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

test("a gate approved on a try that answered a session waits from that answer's end, and the try is a fact with no time or cost of its own", () => {
  const gated = [step('design', [], { gate: true, by: 'seldon' })];
  const tries = { design: [{ end: at(1) }, { end: at(2), answers: true as const }] };
  const approved = readOf('a', gated, tries, { approvals: [{ step: 'design', try: 2, at: minus(at(3), 30 * MIN) }] });
  const [one, two, ...more] = factsOf(approved).tries;
  assert.deepEqual(more, []);
  assert.deepEqual([one.try, one.gateWaitMs, one.costUsd], [1, null, 1.5]);
  assert.deepEqual([two.try, two.gateWaitMs, two.ranMs, two.costUsd, two.day], [2, 30 * MIN, null, null, DAY]);
  assert.equal(one.ranMs, 70 * MIN, 'the session ran its hour and the ten minutes of its answer, on the try that filed it');
  assert.equal(factsOf(approved).runs.length, 1, 'a run whose last try answered a session finished');
  assert.equal(factsOf(approved).runs[0].costUsd, 1.5, 'one session, its two turns, counted once');
  const owner = readOf('o', gated, tries, { approvals: [{ step: 'design', try: 1, at: minus(at(3), 30 * MIN) }] });
  assert.deepEqual(
    factsOf(owner).tries.map((t) => t.gateWaitMs),
    [30 * MIN, null],
    "the opposite order: an approval of the try that owns the session waits from the session's end",
  );
});

test('a try falls on the UTC day it ended: 23:59Z and 00:01Z the next morning are two days', () => {
  const late = '2026-09-10T23:59:00.000Z';
  const early = '2026-09-11T00:01:00.000Z';
  const r = readOf('d', [step('implement', [])], { implement: [{ end: late, cause: 'retries' }, { end: early }] });
  const s = statsOf(factsOfAll(r), {}, new Date('2026-09-11T12:00:00.000Z'));
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
    implement: [{ end: at(12, '2026-09-17'), cause: 'retries' }, { end: at(12, '2026-09-16') }],
  });
  const { last, before } = statsOf(factsOfAll(r), {}, new Date('2026-09-30T08:00:00.000Z')).all.tiles;
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
  const line = statsLine(statsOf({ tries: [], runs: [], frozen: [] }, {}, NOW));
  assert.equal(line.split('\n').length, 1);
  assert.match(line, /— \(—\) rounds/);
  assert.match(line, /— \(—\) landed/, 'a fortnight with no run finished recorded no landing');
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
  assert.equal(statsOf(factsOfAll(aborted), {}, NOW).all.total.landed, 0, 'a run recorded as not landing is counted: 0, not —');
});

/** A day after `JOBS_SINCE`, when every `claude` step ran as a job that records its denials, and the moment the stats are read on it. */
const JOBS_DAY = '2026-09-28';
const JOBS_NOW = new Date(`${JOBS_DAY}T20:00:00.000Z`);

test('refused calls are a mean per measured try, and absent — null, not 0 — where no try was measured', () => {
  const steps = [step('design', [], { by: 'seldon' }), step('implement', ['design'], { by: 'ada', harness: 'codex' })];
  const tries = {
    design: [
      { end: at(1, JOBS_DAY), denied: ['Write(/x)', 'Bash(git push)'] },
      { end: at(2, JOBS_DAY), denied: [] },
    ],
    implement: [{ end: at(3, JOBS_DAY), denied: ['Write(/x)'] }],
  };
  const s = statsOf(factsOfAll(readOf('denied', steps, tries)), {}, JOBS_NOW);
  assert.equal(s.all.total.deniedPerTry, 1, 'three calls over two measured tries: the codex try is not one of them');
  assert.equal(s.all.days.find((d) => d.day === JOBS_DAY)?.deniedPerTry, 1);
  const codex = statsOf(factsOfAll(readOf('codex', steps, { implement: tries.implement })), {}, JOBS_NOW);
  assert.equal(codex.all.total.deniedPerTry, null, 'a codex step records no denial: nothing measured, not 0');
  assert.match(statsLine(codex), /— \(—\) calls denied/);
  const none = statsOf(factsOfAll(readOf('none', steps, { design: [{ end: at(1, JOBS_DAY) }] })), {}, JOBS_NOW);
  assert.equal(none.all.total.deniedPerTry, 0, 'a claude try denied nothing is a measured 0');
  assert.match(statsLine(none), /0\/try \(—\) calls denied/);
  none.all.tiles.last.deniedPerTry = 1 / 300;
  assert.match(statsLine(none), / 0\.003\/try \(—\) calls denied/, 'a rate above 0 under 0.01 keeps a significant figure, never reading 0');
});

test('a claude try filed before steps ran as jobs is unmeasured: the tile before reads —, and the mean is not diluted with 0', () => {
  const steps = [step('design', [], { by: 'seldon' })];
  const r = readOf('bg', steps, { design: [{ end: at(1) }, { end: at(1, JOBS_DAY), denied: ['Write(/x)'] }] });
  const [old, job] = factsOf(r).tries;
  assert.deepEqual([old.denied, job.denied], [null, ['Write(/x)']]);
  const { all } = statsOf(factsOfAll(r), {}, JOBS_NOW);
  assert.deepEqual([all.tiles.before.deniedPerTry, all.tiles.last.deniedPerTry], [null, 1]);
});

test("a step's refused calls are counted by call, most first and then by call, over its measured tries", () => {
  const steps = [step('design', [], { by: 'seldon' })];
  const tries = {
    design: [
      { end: at(1, JOBS_DAY), denied: ['Write(/z)', 'Write(/a)', 'Bash(git push)'] },
      { end: at(2, JOBS_DAY), denied: ['Bash(git push)', 'Write(/z)', 'Write(/a)', 'Bash(git push)'] },
    ],
  };
  const [row] = statsOf(factsOfAll(readOf('by-call', steps, tries)), {}, JOBS_NOW).all.steps;
  assert.deepEqual([row.deniedCalls, row.deniedTries], [7, 2]);
  assert.deepEqual(row.denials, [
    { call: 'Bash(git push)', count: 3 },
    { call: 'Write(/a)', count: 2 },
    { call: 'Write(/z)', count: 2 },
  ]);
  const codex = [step('design', [], { by: 'seldon', harness: 'codex' })];
  const [unmeasured] = statsOf(factsOfAll(readOf('codex', codex, tries)), {}, JOBS_NOW).all.steps;
  assert.deepEqual([unmeasured.deniedCalls, unmeasured.deniedTries, unmeasured.denials], [null, 0, []]);
});

test('skills loaded are a mean per measured try: a try whose ends do not say is left out, never 0, and a measured empty list is 0', () => {
  const steps = [step('design', [], { by: 'seldon' })];
  const tries = { design: [{ end: at(1), skills: ['look', 'effect'] }, { end: at(2), skills: [] }, { end: at(3) }] };
  const r = readOf('skills', steps, tries);
  assert.deepEqual(
    factsOf(r).tries.map((t) => t.skills),
    [['look', 'effect'], [], null],
  );
  const s = statsOf(factsOfAll(r), {}, NOW);
  assert.equal(s.all.total.skillsPerTry, 1, 'two loads over two measured tries: the unmeasured try is not one of them');
  assert.equal(s.all.days.find((d) => d.day === DAY)?.skillsPerTry, 1);
  const unsaid = statsOf(factsOfAll(readOf('unsaid', steps, { design: [{ end: at(1) }] })), {}, NOW);
  assert.equal(unsaid.all.total.skillsPerTry, null, 'nothing measured, not 0');
  assert.match(statsLine(unsaid), /— \(—\) skills loaded$/);
  const none = statsOf(factsOfAll(readOf('none', steps, { design: [{ end: at(1), skills: [] }] })), {}, NOW);
  assert.equal(none.all.total.skillsPerTry, 0, 'a session that loaded none is a measured 0');
  assert.match(statsLine(none), /0\/try \(—\) skills loaded$/);
});

test("a step's skills are counted by skill over its measured tries, most first and then by name, and how many tries were measured", () => {
  const steps = [step('design', [], { by: 'seldon' })];
  const tries = {
    design: [{ end: at(1), skills: ['look', 'write-a-spec', 'effect'] }, { end: at(2), skills: ['write-a-spec'] }, { end: at(3) }],
  };
  const s = statsOf(factsOfAll(readOf('by-skill', steps, tries)), {}, NOW);
  const [row] = s.all.steps;
  assert.deepEqual([row.tries, row.skillLoads, row.skillTries], [3, 4, 2]);
  assert.deepEqual(row.skills, [
    { skill: 'write-a-spec', count: 2, tries: 2, touched: null, loadedWhenTouched: null },
    { skill: 'effect', count: 1, tries: 1, touched: null, loadedWhenTouched: null },
    { skill: 'look', count: 1, tries: 1, touched: null, loadedWhenTouched: null },
  ]);
  const words = statsLines(s);
  assert.match(
    words.find((l) => l.startsWith('design '))!,
    /\s4 \(2 of 3\)$/,
    'the step row says how many of its tries were measured',
  );
  assert.ok(
    words.some((l) => /^step\s+agent\s+skill\s+loads\s+tries\s+when touched$/.test(l)),
    words.join('\n'),
  );
  assert.ok(
    words.some((l) => /^design\s+seldon\s+write-a-spec\s+2\s+2\s+—$/.test(l)),
    words.join('\n'),
  );
  const [unmeasured] = statsOf(factsOfAll(readOf('unsaid', steps, { design: [{ end: at(1) }] })), {}, NOW).all.steps;
  assert.deepEqual([unmeasured.skillLoads, unmeasured.skillTries, unmeasured.skills], [null, 0, []]);
});

/** `r`, its steps' frozen skills declaring the paths `applies`, by step name and then by skill. */
const applying = <R extends ReturnType<typeof readOf>>(r: R, applies: Record<string, Record<string, string[]>>): R => ({
  ...r,
  appliesOf: (s: Workflow) => new Map(Object.entries(applies[s.name] ?? {})),
});

test("a skill's tries that touched its paths are counted, and how many of them loaded it, over the tries whose files were measured", () => {
  const steps = [step('design', [], { by: 'seldon' })];
  const tries = {
    design: [
      { end: at(1), skills: [], files: ['apps/web/src/a.tsx'] },
      { end: at(2), skills: ['change-the-board', 'shadcn'], files: ['apps/web/src/b.tsx'] },
      { end: at(3), skills: ['effect'] },
      { end: at(4), skills: [], files: ['packages/x.ts'] },
    ],
  };
  const r = applying(readOf('due', steps, tries), { design: { 'change-the-board': ['apps/web/**'], effect: ['packages/**'], shadcn: [] } });
  assert.deepEqual(
    factsOf(r).tries.map((t) => t.due),
    [
      [
        { skill: 'change-the-board', touched: true },
        { skill: 'effect', touched: false },
      ],
      [
        { skill: 'change-the-board', touched: true },
        { skill: 'effect', touched: false },
      ],
      null,
      [
        { skill: 'change-the-board', touched: false },
        { skill: 'effect', touched: true },
      ],
    ],
    'a skill that declares no path is due on no try, and a try whose files are not measured is due nothing',
  );
  const s = statsOf(factsOfAll(r), {}, NOW);
  assert.deepEqual(s.all.steps[0].skills, [
    { skill: 'change-the-board', count: 1, tries: 1, touched: 2, loadedWhenTouched: 1 },
    { skill: 'effect', count: 1, tries: 1, touched: 1, loadedWhenTouched: 0 },
    { skill: 'shadcn', count: 1, tries: 1, touched: null, loadedWhenTouched: null },
  ]);
  const words = statsLines(s);
  assert.ok(
    words.some((l) => /^design\s+seldon\s+change-the-board\s+1\s+1\s+1 of 2$/.test(l)),
    words.join('\n'),
  );
  assert.ok(
    words.some((l) => /^design\s+seldon\s+shadcn\s+1\s+1\s+—$/.test(l)),
    words.join('\n'),
  );
  const unloaded = statsOf(
    factsOfAll(applying(readOf('unloaded', steps, { design: [tries.design[0]] }), { design: { look: ['apps/**'] } })),
    {},
    NOW,
  );
  assert.deepEqual(
    unloaded.all.steps[0].skills,
    [{ skill: 'look', count: 0, tries: 0, touched: 1, loadedWhenTouched: 0 }],
    'a skill touched and never loaded has a row',
  );
});

const readWithRead: SkillRule = { id: 'read-with-read', says: 'Read a file with Read', breaks: ['Bash(cat:*)', 'Bash(head:*)'] };
const checksBare: SkillRule = { id: 'checks-bare', says: 'Run a check bare', breaks: ['Bash(cd:*)'] };

/** `r`, its steps' frozen skills declaring `declared`, by step name and then by skill. */
const declaring = <R extends ReturnType<typeof readOf>>(r: R, declared: Record<string, Record<string, SkillRule[]>>): R => ({
  ...r,
  rulesOf: (s: Workflow) => new Map(Object.entries(declared[s.name] ?? {})),
});

test("a try keeps or breaks each rule its step's skills declare, by the calls it was denied; a skill that declares none gives none", () => {
  const steps = [step('design', [], { by: 'seldon' })];
  const r = declaring(readOf('rules', steps, { design: [{ end: at(1, JOBS_DAY), denied: ['Bash(cat)', 'Write(/x)'] }] }), {
    design: { 'write-a-spec': [readWithRead, checksBare], effect: [] },
  });
  const [fact] = factsOf(r).tries;
  assert.deepEqual(fact.rules, [
    { skill: 'write-a-spec', rule: 'read-with-read', says: 'Read a file with Read', broken: true, by: ['Bash(cat)'] },
    { skill: 'write-a-spec', rule: 'checks-bare', says: 'Run a check bare', broken: false, by: [] },
  ]);
  const [row] = statsOf(factsOfAll(r), {}, JOBS_NOW).all.steps;
  assert.deepEqual(row.rules, [
    { skill: 'write-a-spec', rule: 'read-with-read', says: 'Read a file with Read', kept: 0, broken: 1 },
    { skill: 'write-a-spec', rule: 'checks-bare', says: 'Run a check bare', kept: 1, broken: 0 },
  ]);
  const words = statsLines(statsOf(factsOfAll(r), {}, JOBS_NOW));
  assert.ok(
    words.some((l) => /^step\s+agent\s+skill\s+rule\s+kept\s+broken$/.test(l)),
    words.join('\n'),
  );
  assert.ok(
    words.some((l) => /^design\s+seldon\s+write-a-spec\s+read-with-read\s+0\s+1$/.test(l)),
    words.join('\n'),
  );
  assert.ok(
    words.some((l) => /^design\s+seldon\s+write-a-spec\s+checks-bare\s+1\s+0$/.test(l)),
    words.join('\n'),
  );
});

test('a try whose denials were not measured — a recheck, on codex, before steps ran as jobs — keeps and breaks no rule', () => {
  const declared = { design: { 'write-a-spec': [readWithRead] } };
  const recheck = declaring(
    readOf('recheck', [step('design', [], { by: 'seldon' })], {
      design: [
        { end: at(1, JOBS_DAY), denied: ['Bash(cat)'], check: 'unfinished' },
        { end: at(2, JOBS_DAY), recheck: true, check: 'passed' },
      ],
    }),
    declared,
  );
  assert.deepEqual(
    factsOf(recheck).tries.map((t) => [t.try, t.rules?.map((f) => f.broken) ?? null]),
    [
      [1, [true]],
      [2, null],
    ],
  );
  assert.deepEqual(statsOf(factsOfAll(recheck), {}, JOBS_NOW).all.steps[0].rules, [
    { skill: 'write-a-spec', rule: 'read-with-read', says: 'Read a file with Read', kept: 0, broken: 1 },
  ]);
  const codex = declaring(
    readOf('codex', [step('design', [], { by: 'seldon', harness: 'codex' })], { design: [{ end: at(1, JOBS_DAY) }] }),
    declared,
  );
  const before = declaring(readOf('before', [step('design', [], { by: 'seldon' })], { design: [{ end: at(1) }] }), declared);
  for (const r of [codex, before]) {
    assert.equal(factsOf(r).tries[0].rules, null, r.run.id);
    assert.deepEqual(statsOf(factsOfAll(r), {}, JOBS_NOW).all.steps[0].rules, [], `${r.run.id}: no row, never a row of zeros`);
  }
  const undeclared = readOf('undeclared', [step('design', [], { by: 'seldon' })], { design: [{ end: at(1, JOBS_DAY) }] });
  assert.deepEqual(factsOf(undeclared).tries[0].rules, []);
  assert.deepEqual(statsOf(factsOfAll(undeclared), {}, JOBS_NOW).all.steps[0].rules, []);
  assert.ok(!statsLines(statsOf(factsOfAll(undeclared), {}, JOBS_NOW)).some((l) => /^step\s+agent\s+skill\s+rule/.test(l)));
});

test("a rule's kept and broken add up to its step and agent's tries whose denials were measured", () => {
  const steps = [step('design', [], { by: 'seldon' }), step('implement', ['design'], { by: 'ada' })];
  const tries = {
    design: [
      { end: at(1, JOBS_DAY), denied: ['Bash(cat)'] },
      { end: at(2, JOBS_DAY), denied: [] },
      { end: at(3) },
      { end: at(4, JOBS_DAY), denied: ['Bash(head)', 'Bash(cd)'] },
    ],
    implement: [{ end: at(5, JOBS_DAY), denied: ['Bash(cd)'] }],
  };
  const r = declaring(readOf('identity', steps, tries), {
    design: { 'write-a-spec': [readWithRead, checksBare] },
    implement: { 'write-a-spec': [checksBare] },
  });
  const s = statsOf(factsOfAll(r), {}, JOBS_NOW);
  for (const row of s.all.steps) {
    assert.ok(row.rules.length > 0, row.step);
    for (const rule of row.rules) assert.equal(rule.kept + rule.broken, row.deniedTries, `${row.step} ${rule.rule}`);
  }
  assert.deepEqual(
    s.all.steps[0].rules.map((x) => [x.rule, x.kept, x.broken]),
    [
      ['read-with-read', 1, 2],
      ['checks-bare', 2, 1],
    ],
  );
});

const DAY_BEFORE = '2026-09-09';
const TWO_BEFORE = '2026-09-08';

/** A workflow of one step that tallies its issues and the open ones (`tally:`). */
const TRIAGE = [step('triage', [], { by: 'sorter', tally: ['issues', 'issues.open'] })];

test("a try's tallies are its own session's closeout's values, and null — never 0 — for a try with no closeout or no session of its own", () => {
  const r = readOf('tallied', TRIAGE, {
    triage: [
      { end: at(1, TWO_BEFORE), closeout: { issues: [{ open: true }, { open: false }, {}] } },
      { end: at(1, DAY_BEFORE), check: 'refused', closeout: { issues: [] } },
      { end: at(2, DAY_BEFORE), check: 'passed', recheck: true },
      { end: at(3, DAY_BEFORE) },
    ],
  });
  assert.deepEqual(
    factsOf(r).tries.map((t) => t.tallies),
    [
      [
        { tally: 'issues', value: 3 },
        { tally: 'issues.open', value: 1 },
      ],
      [
        { tally: 'issues', value: 0 },
        { tally: 'issues.open', value: 0 },
      ],
      [
        { tally: 'issues', value: null },
        { tally: 'issues.open', value: null },
      ],
      [
        { tally: 'issues', value: null },
        { tally: 'issues.open', value: null },
      ],
    ],
    'a measured empty list is 0; a recheck shares its try before it, and a session that made no closeout measured nothing',
  );
  const plain = readOf('plain', [step('design', [], { by: 'seldon' })], { design: [{ end: at(1), closeout: { issues: [1] } }] });
  assert.deepEqual(factsOf(plain).tries[0].tallies, [], 'a step that declares no tally gives none, whatever its closeout holds');
  assert.deepEqual(statsOf(factsOfAll(plain), {}, NOW).all.tallies, []);
});

test("a step's tallies are summed per day of the range and over it, over measured tries only, and absent where none was measured", () => {
  const r = readOf('per-day', TRIAGE, {
    triage: [
      { end: at(1, TWO_BEFORE), closeout: { issues: [{ open: true }, { open: true }] } },
      { end: at(2, TWO_BEFORE), closeout: { issues: [{ open: false }] } },
      { end: at(1, DAY_BEFORE) },
    ],
  });
  const s = statsOf(factsOfAll(r), { from: TWO_BEFORE }, NOW);
  assert.deepEqual(s.all.tallies, [
    {
      step: 'triage',
      tally: 'issues',
      total: { sum: 3, tries: 2 },
      days: [
        { day: TWO_BEFORE, sum: 3, tries: 2 },
        { day: DAY_BEFORE, sum: null, tries: 0 },
        { day: DAY, sum: null, tries: 0 },
      ],
    },
    {
      step: 'triage',
      tally: 'issues.open',
      total: { sum: 2, tries: 2 },
      days: [
        { day: TWO_BEFORE, sum: 2, tries: 2 },
        { day: DAY_BEFORE, sum: null, tries: 0 },
        { day: DAY, sum: null, tries: 0 },
      ],
    },
  ]);
  const words = statsLines(s);
  assert.ok(words.includes('day         step    tally        sum  tries'), words.join('\n'));
  assert.ok(words.some((l) => /^2026-09-08\s+triage\s+issues\s+3\s+2$/.test(l)));
  assert.ok(
    words.some((l) => /^2026-09-09\s+triage\s+issues\.open\s+—\s+0$/.test(l)),
    'a day with a try and no closeout reads —',
  );
  assert.ok(!words.some((l) => l.startsWith(`${DAY}  triage`)), 'a day nothing happened on is left out of the words');
  assert.ok(words.some((l) => /^all\s+triage\s+issues\s+3\s+2$/.test(l)));
});

test('a workflow with other names gets its own tally rows, keyed by its step and its field', () => {
  const triaged = readOf('t', TRIAGE, { triage: [{ end: at(1), closeout: { issues: [{}] } }] });
  const checkIn = [step('check-in', [], { tally: ['notes'] })];
  const noted = readOf('c', checkIn, { 'check-in': [{ end: at(2), closeout: { notes: 4 } }] });
  const s = statsOf(factsOfAll(triaged, noted), {}, NOW);
  assert.deepEqual(
    s.all.tallies.map((row) => [row.step, row.tally, row.total]),
    [
      ['triage', 'issues', { sum: 1, tries: 1 }],
      ['triage', 'issues.open', { sum: 0, tries: 1 }],
      ['check-in', 'notes', { sum: 4, tries: 1 }],
    ],
  );
  const bySorter = statsOf(factsOfAll(triaged, noted), { by: 'agent' }, NOW);
  assert.deepEqual(
    bySorter.groups.map((g) => [g.key, g.tallies.map((row) => row.tally)]),
    [
      ['sorter', ['issues', 'issues.open']],
      [null, ['notes']],
    ],
  );
});

test("a step's check time is its checks' run time alone, summed over its tries, and absent — null, not 0 — for a step with no check", () => {
  const { all } = statsOf(factsOfAll(twoRounds('c1')), {}, NOW);
  const checkMs = Object.fromEntries(all.steps.map((s) => [s.step, s.checkMs]));
  assert.deepEqual(checkMs, { design: null, implement: 2 * 60 * MIN, review: null, land: 60 * MIN });
  const implement = all.steps.find((s) => s.step === 'implement')!;
  assert.ok(implement.ranMs! > implement.checkMs!, "the step's run time holds its sessions' too");
  assert.match(statsLines(statsOf(factsOfAll(twoRounds('c1')), {}, NOW)).join('\n'), /^implement\s+ada\s+2\s+4h00m\s+2h00m\s+\$2\.00\s/m);
});

test("the system's health is read over the days the stats answer, and said under `system` only where the series kept some", () => {
  const asked: Array<[string | null, string]> = [];
  const health = {
    pass: { p50: 12.34, p95: 80 },
    runs: 40,
    reads: 3,
    load: { p95: 0.5, max: 1.25 },
    queued: 2,
    waitMs: 90_000,
    checkLoad: 0.4,
    quota: [{ harness: 'h', window: 'week', latest: 41.6, peak: 50 }],
  };
  const s = statsOf(factsOfAll(twoRounds('h1')), { from: '2026-09-01' }, NOW, [], (from, to) => {
    asked.push([from, to]);
    return health;
  });
  assert.deepEqual(asked, [['2026-09-01', DAY]]);
  assert.deepEqual(s.health, health);
  const lines = statsLines(s);
  assert.deepEqual(lines.slice(lines.indexOf('system')), [
    'system',
    '  a pass: 12.3 ms (p50), 80.0 ms (p95)',
    '  runs in the store: 40 at most; journal reads a pass: 3 (p95)',
    '  sessions queued: 2 at most, waiting 1m30s at longest',
    '  load: 0.5 (p95), 1.25 at most; checks filed at 0.4 (p50)',
    '  quota h week: 42% used, 50% at most',
  ]);
  assert.ok(!statsLines(statsOf(factsOfAll(twoRounds('h1')), {}, NOW)).includes('system'), 'none kept, none said');
});

/** A run of the team whose ending's one try's check ended `check`, after `checkRan` seconds, its task filed with `deadline` seconds. */
const landingAt = (id: string, check: CheckVerdict, checkRan: number, deadline?: number, steps = TEAM) =>
  readOf(id, steps, {
    design: [{ end: at(1) }],
    implement: [{ end: at(2) }],
    review: [{ end: at(3) }],
    land: [{ end: at(7), check, checkRan, ...(deadline === undefined ? {} : { deadline }) }],
  });

const SLOW_HEADER = /^landing checks over half their deadline: measure .* LANDING_CHECK_DEADLINE_SECONDS/;

test('a passed landing check over half the deadline its task was filed with is named, with its time, the deadline and the share', () => {
  const s = statsOf(factsOfAll(landingAt('slow', 'passed', 1377, 2700)), {}, NOW);
  assert.deepEqual(
    s.all.slowLandings.map(({ share: _share, ...rest }) => rest),
    [
      {
        run: 'slow',
        factory: 'default',
        workflow: 'build',
        repo: '/r',
        day: DAY,
        step: 'land',
        try: 1,
        checkMs: 1_377_000,
        deadlineMs: 2_700_000,
      },
    ],
  );
  assert.equal(Math.round(s.all.slowLandings[0].share * 100), 51);
  const lines = statsLines(s);
  assert.ok(
    lines.some((line) => SLOW_HEADER.test(line)),
    lines.join('\n'),
  );
  assert.ok(
    lines.some((line) => /\bslow\s+land\s+1\s+22m57s\s+45m00s\s+51%/.test(line)),
    lines.join('\n'),
  );
});

test('a passed landing check at half its deadline or less is not named, and neither is a landing check that did not pass', () => {
  const quick = statsOf(factsOfAll(landingAt('quick', 'passed', 1323, 2700)), {}, NOW);
  assert.deepEqual(quick.all.slowLandings, [], 'at 49%');
  assert.ok(!statsLines(quick).some((line) => SLOW_HEADER.test(line)));
  assert.deepEqual(statsOf(factsOfAll(landingAt('half', 'passed', 1350, 2700)), {}, NOW).all.slowLandings, [], 'at exactly half');
  for (const verdict of ['refused', 'unfinished'] as const)
    assert.deepEqual(statsOf(factsOfAll(landingAt(verdict, verdict, 2430, 2700)), {}, NOW).all.slowLandings, [], `${verdict} at 90%`);
});

test('a landing check is judged against the deadline its task was filed with, and not measured where it was filed with none', () => {
  const old = statsOf(factsOfAll(landingAt('old', 'passed', 1033, 1200)), {}, NOW).all.slowLandings;
  assert.deepEqual(
    old.map((x) => [x.run, x.deadlineMs, Math.round(x.share * 100)]),
    [['old', 1_200_000, 86]],
  );
  assert.deepEqual(statsOf(factsOfAll(landingAt('new', 'passed', 1033, 2700)), {}, NOW).all.slowLandings, [], 'at 38% of 2700');
  const [unfiled] = factsOf(landingAt('unfiled', 'passed', 2430)).tries.filter((t) => t.step === 'land');
  assert.equal(unfiled.landingDeadlineMs, null);
  assert.deepEqual(statsOf(factsOfAll(landingAt('unfiled', 'passed', 2430)), {}, NOW).all.slowLandings, []);
});

test("a round's check is no landing, whatever its time, and a step is a landing by its structure, not its name", () => {
  const checked = TEAM.map((s) => (s.name === 'implement' ? { ...s, check: 'npm test' } : s));
  const round = readOf('round', checked, {
    design: [{ end: at(1) }],
    implement: [{ end: at(2), check: 'passed', checkRan: 1080, deadline: 1200 }],
  });
  assert.deepEqual(statsOf(factsOfAll(round), {}, NOW).all.slowLandings, []);
  const landing = checked.map((s) => (s.name === 'implement' ? { ...s, workspace: 'main' as const, gate: true as const } : s));
  const lands = readOf('lands', landing, {
    design: [{ end: at(1) }],
    implement: [{ end: at(2), check: 'passed', checkRan: 1080, deadline: 1200 }],
  });
  assert.deepEqual(
    statsOf(factsOfAll(lands), {}, NOW).all.slowLandings.map((x) => x.step),
    ['implement'],
  );
});

test("the slow landings keep to the query's filters and days, and each group has its own", () => {
  const facts = factsOfAll(landingAt('slow', 'passed', 2430, 2700));
  assert.deepEqual(statsOf(facts, { factory: 'other' }, NOW).all.slowLandings, []);
  assert.deepEqual(statsOf(facts, { from: '2026-09-11', to: '2026-09-11' }, NOW).all.slowLandings, []);
  const byStep = statsOf(facts, { by: 'step' }, NOW).groups;
  assert.deepEqual(
    byStep.map((g) => [g.key, g.slowLandings.length]),
    [
      ['design', 0],
      ['implement', 0],
      ['land', 1],
      ['review', 0],
    ],
  );
});

test('the recap line counts the slow landings of the last 14 days where there are any, and says nothing of them where none', () => {
  const slow = statsLine(statsOf(factsOfAll(landingAt('slow', 'passed', 1377, 2700)), {}, NOW));
  assert.match(slow, /, 1 landing check over half its deadline: measure again$/);
  const two = statsLine(statsOf(factsOfAll(landingAt('a', 'passed', 1377, 2700), landingAt('b', 'passed', 2000, 2700)), {}, NOW));
  assert.match(two, /, 2 landing checks over half their deadline: measure again$/);
  const quick = statsLine(statsOf(factsOfAll(landingAt('quick', 'passed', 1323, 2700)), {}, NOW));
  assert.doesNotMatch(quick, /over half/);
  assert.match(quick, /skills loaded$/);
  const later = new Date(Date.parse(NOW.toISOString()) + 20 * 86_400_000);
  assert.doesNotMatch(
    statsLine(statsOf(factsOfAll(landingAt('slow', 'passed', 1377, 2700)), {}, later)),
    /over half/,
    'older than 14 days',
  );
});
