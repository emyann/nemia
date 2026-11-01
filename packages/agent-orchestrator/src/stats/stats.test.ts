/**
 * The flow numbers (`factsOf`, `statsOf`, `stats.ts`) and their words (`stats-words.ts`), off a real timeline (`timeline`) of hand-built
 * views, as one table per function: each number is keyed on a workflow's structure — `loop:` for rounds, `workspace: base` for
 * landings — never on a step's name, and absent, null, never 0, where nothing measured it. `nemia stats` over a store, and its null
 * read through the engine, are the stories of `test/stats.test.ts`.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import type { Run } from '../record/record.ts';
import type { EarlierTry } from '../retry/index.ts';
import type { Workflow } from '../step/step.ts';
import { timeline, type TaskClock } from '../timeline/timeline.ts';
import { Invalid } from '../refusal/refusal.ts';
import {
  dayOf,
  dayPlus,
  factsOf,
  headlineOf,
  keysOf,
  slowLandingsOf,
  statsOf,
  statsQueryOf,
  type CheckVerdict,
  type Facts,
} from './stats.ts';
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
  step('land', ['review'], { by: 'otto', workspace: 'base', gate: true, check: 'npm test' }),
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
        ids[i - 1].cause = 'continue';
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

/** A day after `JOBS_SINCE`, when every `claude` step ran as a job that records its denials, and the moment the stats are read on it. */
const JOBS_DAY = '2026-09-28';
const JOBS_NOW = new Date(`${JOBS_DAY}T20:00:00.000Z`);

/** `r`, its steps' frozen skills declaring the paths `applies`, by step name and then by skill. */
const applying = <R extends ReturnType<typeof readOf>>(r: R, applies: Record<string, Record<string, string[]>>): R => ({
  ...r,
  appliesOf: (s: Workflow) => new Map(Object.entries(applies[s.name] ?? {})),
});

const readWithRead: SkillRule = { id: 'read-with-read', says: 'Read a file with Read', breaks: ['Bash(cat:*)', 'Bash(head:*)'] };
const checksBare: SkillRule = { id: 'checks-bare', says: 'Run a check bare', breaks: ['Bash(cd:*)'] };

/** `r`, its steps' frozen skills declaring `declared`, by step name and then by skill. */
const declaring = <R extends ReturnType<typeof readOf>>(r: R, declared: Record<string, Record<string, SkillRule[]>>): R => ({
  ...r,
  rulesOf: (s: Workflow) => new Map(Object.entries(declared[s.name] ?? {})),
});

const DAY_BEFORE = '2026-09-09';
const TWO_BEFORE = '2026-09-08';

/** A workflow of one step that tallies its issues and the open ones (`tally:`). */
const TRIAGE = [step('triage', [], { by: 'sorter', tally: ['issues', 'issues.open'] })];

/** A run of the team whose ending's one try's check ended `check`, after `checkRan` seconds, its task filed with `deadline` seconds. */
const landingAt = (id: string, check: CheckVerdict, checkRan: number, deadline?: number, steps = TEAM) =>
  readOf(id, steps, {
    design: [{ end: at(1) }],
    implement: [{ end: at(2) }],
    review: [{ end: at(3) }],
    land: [{ end: at(7), check, checkRan, ...(deadline === undefined ? {} : { deadline }) }],
  });

const SLOW_HEADER = /^landing checks over half their deadline: measure .* LANDING_CHECK_DEADLINE_SECONDS/;

/** A row whose body is its claim: the name says it, `check` asserts it. */
type Row = { name: string; check: () => void };

/** Runs `rows` as subtests of `t`, in order. */
const rowsOf = async (t: { test: (name: string, fn: () => void) => Promise<unknown> }, rows: readonly Row[]) => {
  for (const row of rows) await t.test(row.name, row.check);
};

test('`dayOf`, `dayPlus` and `keysOf`: the UTC day of a time, the day n days off, and the keys a run carries', async (t) => {
  await rowsOf(t, [
    { name: '23:59Z is its own day', check: () => assert.equal(dayOf('2026-09-10T23:59:00.000Z'), '2026-09-10') },
    { name: '00:01Z the next morning is the next', check: () => assert.equal(dayOf('2026-09-11T00:01:00.000Z'), '2026-09-11') },
    {
      name: 'a time in another zone falls on its UTC day',
      check: () => assert.equal(dayOf('2026-09-10T23:30:00.000-02:00'), '2026-09-11'),
    },
    { name: 'thirteen days before', check: () => assert.equal(dayPlus('2026-09-30', -13), '2026-09-17') },
    { name: 'across a month, forward', check: () => assert.equal(dayPlus('2026-09-30', 1), '2026-10-01') },
    {
      name: 'a run with no factory is the default one, its workflow is its folder by name, its repository null for a folder run',
      check: () =>
        assert.deepEqual(keysOf({ id: 'r', workflowDir: '/r/workflows/build' } as unknown as Run), {
          run: 'r',
          factory: 'default',
          workflow: 'build',
          repo: null,
        }),
    },
    {
      name: 'a run of a factory and a repository carries both',
      check: () =>
        assert.deepEqual(keysOf({ id: 'r', factory: 'f', repo: '/r', workflowDir: '/r/workflows/check-in' } as unknown as Run), {
          run: 'r',
          factory: 'f',
          workflow: 'check-in',
          repo: '/r',
        }),
    },
  ]);
});

const renamedLoop = TEAM.map((s) => (s.name === 'review' ? { ...s, name: 'critique' } : s));
const noLoop = TEAM.map(({ loop: _loop, rounds: _rounds, ...s }) => s as Workflow);
const noEnding = TEAM.filter((s) => s.workspace !== 'base');
const prose = TEAM.map((s) => (s.workspace === 'base' ? { ...s, check: undefined } : s));
const plain = [step('implement', []), step('document', ['implement'])];
const gated = [step('brief', []), step('design', ['brief'], { gate: true, by: 'seldon' }), step('implement', ['design'], { by: 'ada' })];
const gatedTries = {
  brief: [{ end: at(0) }],
  design: [{ end: at(1), check: 'passed' as const, cause: 'retries' as const }, { end: at(3) }],
  implement: [{ end: at(5) }],
};
const answered = { design: [{ end: at(1) }, { end: at(2), answers: true as const }] };
const proseTries = (land: Try[]) => ({
  design: [{ end: at(1) }],
  implement: [{ end: at(2), cause: 'round' as const }, { end: at(4) }],
  review: [{ end: at(3), cause: 'round' as const }, { end: at(5) }],
  land,
});
/** How many runs of `plain` finish, its last try `last`. */
const finished = (last: Try) => factsOf(readOf('p', plain, { implement: [{ end: at(1) }], document: [last] })).runs.length;
/** A run of the team whose sessions cost `big`, but its design's, which was not measured. */
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
/** A run of `steps` whose landing went to a second try. */
const secondTry = () =>
  withLanded(
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
const declaredSpec = { design: { 'write-a-spec': [readWithRead] } };
const seldon = [step('design', [], { by: 'seldon' })];

test("`factsOf`: one run's timeline and record as a fact per try that ended, and one for the run once it finished", async (t) => {
  await rowsOf(t, [
    {
      name: 'rounds are the rounds of the step with `loop:`',
      check: () => assert.deepEqual(factsOf(twoRounds('r1')).runs[0].rounds, [2]),
    },
    {
      name: 'the looping step is found by its `loop:`, not by the name review',
      check: () => assert.deepEqual(factsOf(twoRounds('r2', renamedLoop)).runs[0].rounds, [2]),
    },
    { name: 'a workflow with no loop has no rounds', check: () => assert.deepEqual(factsOf(twoRounds('r3', noLoop)).runs[0].rounds, []) },
    {
      name: 'a loop that has not ended accepted counts no rounds; an acceptance of the try the loop is on ends it',
      check: () => {
        const r = withLanded(
          readOf(
            'r-open',
            TEAM,
            { design: [{ end: at(1) }], implement: [{ end: at(2) }], review: [{ end: at(3) }], land: [{ end: at(7) }] },
            {},
            true,
          ),
          'land',
          { commit: 'abc' },
        );
        assert.deepEqual(factsOf(r).runs[0].rounds, []);
        r.run.acceptances = [{ step: 'review', try: 1, at: at(4), message: 'enough' }];
        assert.deepEqual(factsOf(r).runs[0].rounds, [1]);
      },
    },
    {
      name: 'an acceptance of an earlier try of the loop counts no rounds: the loop is on another try',
      check: () => {
        const r = withLanded(
          readOf(
            'r-earlier',
            TEAM,
            {
              design: [{ end: at(1) }],
              implement: [{ end: at(2), cause: 'round' }, { end: at(4) }],
              review: [{ end: at(3), cause: 'round' }, { end: at(5) }],
              land: [{ end: at(7) }],
            },
            { acceptances: [{ step: 'review', try: 1, at: at(4), message: 'enough' }] },
            true,
          ),
          'land',
          { commit: 'abc' },
        );
        assert.deepEqual(factsOf(r).runs[0].rounds, []);
      },
    },
    {
      name: 'a landing on try 1 of the `workspace: base` step, whatever its name, is landed and first-try',
      check: () => {
        const [run] = factsOf(
          twoRounds(
            'first',
            TEAM.map((s) => (s.name === 'land' ? { ...s, name: 'ship' } : s)),
          ),
        ).runs;
        assert.deepEqual([run.landed, run.firstTry], [true, true]);
      },
    },
    {
      name: 'a landing on try 2 is landed, not first-try',
      check: () => assert.deepEqual([factsOf(secondTry()).runs[0].landed, factsOf(secondTry()).runs[0].firstTry], [true, false]),
    },
    {
      name: 'no ending: its landing is absent, null',
      check: () => {
        const [run] = factsOf(
          readOf('none', noEnding, { design: [{ end: at(1) }], implement: [{ end: at(2) }], review: [{ end: at(3) }] }),
        ).runs;
        assert.deepEqual([run.landed, run.firstTry], [null, null]);
      },
    },
    {
      name: 'a run with no ending finishes once each step is done: its last check passed',
      check: () => assert.equal(finished({ end: at(2), check: 'passed' }), 1),
    },
    { name: 'a run with no ending finishes once each step is done: no check', check: () => assert.equal(finished({ end: at(2) }), 1) },
    { name: 'a refused check waits for nemia retry', check: () => assert.equal(finished({ end: at(2), check: 'refused' }), 0) },
    {
      name: 'an unfinished check waits for nemia retry --recheck',
      check: () => assert.equal(finished({ end: at(2), check: 'unfinished' }), 0),
    },
    { name: 'a failed session waits for nemia retry', check: () => assert.equal(finished({ end: at(2), failed: true }), 0) },
    {
      name: 'an ending that commits in its own prose finishes once done: its run and rounds counted, its landing unknown',
      check: () => {
        const [old] = factsOf(readOf('old', prose, proseTries([{ end: at(7) }]))).runs;
        assert.deepEqual([old?.day, old?.rounds, old?.landed, old?.firstTry], [DAY, [2], null, null]);
      },
    },
    {
      name: 'an ending in prose that failed waits',
      check: () => assert.equal(factsOf(readOf('old', prose, proseTries([{ end: at(7), failed: true }]))).runs.length, 0),
    },
    {
      name: 'an ending that lands on its check waits for the run to land it, then is landed',
      check: () => {
        const staged = readOf('staged', TEAM, proseTries([{ end: at(7), check: 'passed' }]));
        assert.equal(factsOf(staged).runs.length, 0);
        assert.deepEqual(
          factsOf(withLanded(staged, 'land', { commit: 'abc' })).runs.map((r) => r.landed),
          [true],
        );
      },
    },
    {
      name: 'a step that signed off blocked leaves its run waiting, though its session succeeded',
      check: () => {
        const r = readOf('b', plain, { implement: [{ end: at(1) }], document: [{ end: at(2) }] });
        const blocked = { outcome: 'blocked' as const, summary: 'Which one?', artifacts: [] };
        assert.equal(factsOf(r).runs.length, 1);
        assert.equal(factsOf({ ...r, closeoutOf: (name) => (name === 'document' ? blocked : undefined) }).runs.length, 0);
      },
    },
    {
      name: 'a cancelled run never finishes: its tries are counted, and the run is not',
      check: () => {
        const facts = factsOf(twoRounds('c', TEAM, { commit: 'abc' }, { cancelledAt: at(8) }));
        assert.deepEqual([facts.runs.length, facts.tries.length], [0, 6]);
        assert.equal(factsOf(twoRounds('c')).runs.length, 1, 'the same run, not cancelled, finished');
      },
    },
    {
      name: 'a loop that asked for another round leaves a run with no ending waiting, until a person accepts it',
      check: () => {
        const tries = { design: [{ end: at(1) }], implement: [{ end: at(2) }], review: [{ end: at(3) }] };
        assert.equal(factsOf(readOf('settled', noEnding, tries)).runs.length, 1);
        const r = readOf('asked', noEnding, tries, {}, true);
        assert.equal(factsOf(r).runs.length, 0);
        r.run.acceptances = [{ step: 'review', try: 1, at: at(4), message: 'enough' }];
        assert.deepEqual(
          factsOf(r).runs.map((run) => run.rounds),
          [[1]],
        );
      },
    },
    {
      name: "a landed run's cost is every session's, and absent when one session of it was not measured",
      check: () => {
        assert.equal(factsOf(twoRounds('measured')).runs[0].costUsd, 6, 'six sessions at $1');
        assert.equal(factsOf(partly(1)).runs[0].costUsd, null);
      },
    },
    {
      name: "a gate wait runs from the try's end to its approval; none for a try whose approval was an earlier try's",
      check: () => {
        const approved = readOf('g', gated, gatedTries, { approvals: [{ step: 'design', try: 1, at: minus(at(2), 30 * MIN) }] });
        assert.deepEqual(
          factsOf(approved)
            .tries.filter((x) => x.step === 'design')
            .map((x) => x.gateWaitMs),
          [30 * MIN, null],
        );
      },
    },
    {
      name: 'a gated try with no approval waits nothing',
      check: () => assert.equal(factsOf(readOf('n', gated, gatedTries)).tries.find((x) => x.step === 'design')?.gateWaitMs, null),
    },
    {
      name: 'an ending approved before it is filed waits from the end of what it comes after',
      check: () => {
        const ending = readOf(
          'e',
          TEAM,
          { design: [{ end: at(1) }], implement: [{ end: at(2) }], review: [{ end: at(3) }], land: [{ end: at(9) }] },
          { approvals: [{ step: 'land', try: 1, at: at(5) }] },
        );
        assert.equal(factsOf(ending).tries.find((x) => x.step === 'land')?.gateWaitMs, 2 * 60 * MIN);
      },
    },
    {
      name: "a gate approved on a try that answered a session waits from that answer's end, the try with no time or cost of its own",
      check: () => {
        const approved = readOf('a', [step('design', [], { gate: true, by: 'seldon' })], answered, {
          approvals: [{ step: 'design', try: 2, at: minus(at(3), 30 * MIN) }],
        });
        const [one, two, ...more] = factsOf(approved).tries;
        assert.deepEqual(more, []);
        assert.deepEqual([one.try, one.gateWaitMs, one.costUsd, one.ranMs], [1, null, 1.5, 70 * MIN]);
        assert.deepEqual([two.try, two.gateWaitMs, two.ranMs, two.costUsd, two.day], [2, 30 * MIN, null, null, DAY]);
        assert.deepEqual(
          factsOf(approved).runs.map((r) => r.costUsd),
          [1.5],
          'a run whose last try answered a session finished; one session, its two turns, counted once',
        );
      },
    },
    {
      name: "an approval of the try that owns the answered session waits from the session's end",
      check: () => {
        const owner = readOf('o', [step('design', [], { gate: true, by: 'seldon' })], answered, {
          approvals: [{ step: 'design', try: 1, at: minus(at(3), 30 * MIN) }],
        });
        assert.deepEqual(
          factsOf(owner).tries.map((x) => x.gateWaitMs),
          [30 * MIN, null],
        );
      },
    },
    {
      name: 'a claude try filed before steps ran as jobs has its denials unmeasured; one after has them',
      check: () => {
        const r = readOf('bg', seldon, { design: [{ end: at(1) }, { end: at(1, JOBS_DAY), denied: ['Write(/x)'] }] });
        assert.deepEqual(
          factsOf(r).tries.map((x) => x.denied),
          [null, ['Write(/x)']],
        );
      },
    },
    {
      name: 'a codex try records no denial: null, not []',
      check: () =>
        assert.equal(
          factsOf(
            readOf('codex', [step('design', [], { harness: 'codex' })], { design: [{ end: at(1, JOBS_DAY), denied: ['Write(/x)'] }] }),
          ).tries[0].denied,
          null,
        ),
    },
    {
      name: 'skills loaded per try: the list, an empty list measured, null where its ends do not say',
      check: () =>
        assert.deepEqual(
          factsOf(
            readOf('skills', seldon, { design: [{ end: at(1), skills: ['look', 'effect'] }, { end: at(2), skills: [] }, { end: at(3) }] }),
          ).tries.map((x) => x.skills),
          [['look', 'effect'], [], null],
        ),
    },
    {
      name: 'a skill that declares no path is due on no try, and a try whose files are not measured is due nothing',
      check: () => {
        const r = applying(
          readOf('due', seldon, {
            design: [
              { end: at(1), skills: [], files: ['apps/web/src/a.tsx'] },
              { end: at(3), skills: ['effect'] },
              { end: at(4), files: ['packages/x.ts'] },
            ],
          }),
          { design: { 'change-the-board': ['apps/web/**'], effect: ['packages/**'], shadcn: [] } },
        );
        assert.deepEqual(
          factsOf(r).tries.map((x) => x.due),
          [
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
        );
      },
    },
    {
      name: "a try keeps or breaks each rule its step's skills declare, by the calls it was denied; a skill that declares none gives none",
      check: () => {
        const r = declaring(readOf('rules', seldon, { design: [{ end: at(1, JOBS_DAY), denied: ['Bash(cat)', 'Write(/x)'] }] }), {
          design: { 'write-a-spec': [readWithRead, checksBare], effect: [] },
        });
        assert.deepEqual(factsOf(r).tries[0].rules, [
          { skill: 'write-a-spec', rule: 'read-with-read', says: 'Read a file with Read', broken: true, by: ['Bash(cat)'] },
          { skill: 'write-a-spec', rule: 'checks-bare', says: 'Run a check bare', broken: false, by: [] },
        ]);
      },
    },
    {
      name: 'a recheck has no session of its own: it keeps and breaks no rule',
      check: () => {
        const recheck = declaring(
          readOf('recheck', seldon, {
            design: [
              { end: at(1, JOBS_DAY), denied: ['Bash(cat)'], check: 'unfinished' },
              { end: at(2, JOBS_DAY), recheck: true, check: 'passed' },
            ],
          }),
          declaredSpec,
        );
        assert.deepEqual(
          factsOf(recheck).tries.map((x) => [x.try, x.rules?.map((f) => f.broken) ?? null]),
          [
            [1, [true]],
            [2, null],
          ],
        );
      },
    },
    {
      name: 'a codex try, or one before steps ran as jobs, keeps and breaks no rule',
      check: () => {
        const codex = declaring(
          readOf('codex', [step('design', [], { by: 'seldon', harness: 'codex' })], { design: [{ end: at(1, JOBS_DAY) }] }),
          declaredSpec,
        );
        const before = declaring(readOf('before', seldon, { design: [{ end: at(1) }] }), declaredSpec);
        for (const r of [codex, before]) assert.equal(factsOf(r).tries[0].rules, null, r.run.id);
      },
    },
    {
      name: 'a measured try of a step whose skills declare no rule has none: [], not null',
      check: () => assert.deepEqual(factsOf(readOf('undeclared', seldon, { design: [{ end: at(1, JOBS_DAY) }] })).tries[0].rules, []),
    },
    {
      name: "a try's tallies are its own session's closeout's values: a measured empty list is 0",
      check: () => {
        const r = readOf('tallied', TRIAGE, {
          triage: [
            { end: at(1, TWO_BEFORE), closeout: { issues: [{ open: true }, { open: false }, {}] } },
            { end: at(1, DAY_BEFORE), check: 'refused', closeout: { issues: [] } },
          ],
        });
        assert.deepEqual(
          factsOf(r).tries.map((x) => x.tallies.map((v) => v.value)),
          [
            [3, 1],
            [0, 0],
          ],
        );
      },
    },
    {
      name: 'a recheck shares the try before it, and a session that made no closeout measured nothing: null, never 0',
      check: () => {
        const r = readOf('untallied', TRIAGE, {
          triage: [
            { end: at(1, DAY_BEFORE), check: 'refused', closeout: { issues: [] } },
            { end: at(2, DAY_BEFORE), check: 'passed', recheck: true },
            { end: at(3, DAY_BEFORE) },
          ],
        });
        assert.deepEqual(
          factsOf(r)
            .tries.slice(1)
            .map((x) => x.tallies),
          [
            [
              { tally: 'issues', value: null },
              { tally: 'issues.open', value: null },
            ],
            [
              { tally: 'issues', value: null },
              { tally: 'issues.open', value: null },
            ],
          ],
        );
      },
    },
    {
      name: 'a step that declares no tally gives none, whatever its closeout holds',
      check: () =>
        assert.deepEqual(factsOf(readOf('plain', seldon, { design: [{ end: at(1), closeout: { issues: [1] } }] })).tries[0].tallies, []),
    },
    {
      name: 'a landing check filed with no deadline has none',
      check: () =>
        assert.equal(factsOf(landingAt('unfiled', 'passed', 2430)).tries.find((x) => x.step === 'land')?.landingDeadlineMs, null),
    },
  ]);
});

test('`headlineOf`: the headline numbers of a set of facts, each mean over what was measured and null over nothing', async (t) => {
  const headline = (...reads: ReturnType<typeof readOf>[]) => headlineOf(factsOfAll(...reads));
  const old = (id: string) =>
    readOf(id, prose, { design: [{ end: at(1) }], implement: [{ end: at(2) }], review: [{ end: at(3) }], land: [{ end: at(7) }] });
  const deniedSteps = [step('design', [], { by: 'seldon' }), step('implement', ['design'], { by: 'ada', harness: 'codex' })];
  const deniedTries = {
    design: [
      { end: at(1, JOBS_DAY), denied: ['Write(/x)', 'Bash(git push)'] },
      { end: at(2, JOBS_DAY), denied: [] },
    ],
    implement: [{ end: at(3, JOBS_DAY), denied: ['Write(/x)'] }],
  };
  await rowsOf(t, [
    {
      name: 'the mean rounds to acceptance, whatever the looping step is called',
      check: () => assert.equal(headline(twoRounds('r1'), twoRounds('r2', renamedLoop)).rounds, 2),
    },
    { name: 'a workflow with no loop: rounds null, not 0', check: () => assert.equal(headline(twoRounds('r3', noLoop)).rounds, null) },
    {
      name: 'first-try landings are a share of the landed runs, and a run with no ending is counted, not landed',
      check: () => {
        const none = readOf('none', noEnding, { design: [{ end: at(1) }], implement: [{ end: at(2) }], review: [{ end: at(3) }] });
        const h = headline(twoRounds('first'), secondTry(), none);
        assert.deepEqual([h.firstTry, h.landed, h.runs], [0.5, 2, 3]);
      },
    },
    {
      name: 'the cost of a landed run is a mean over the measured ones only, never diluted by an unmeasured run',
      check: () => {
        for (const big of [1, 1000])
          assert.equal(headline(twoRounds('measured'), partly(big)).costPerLanded, 6, `unmeasured run at ${big}`);
      },
    },
    {
      name: 'runs that never recorded their landing have no landed count: null, never 0',
      check: () =>
        assert.deepEqual(
          [headline(old('o1'), old('o2')).runs, headline(old('o1'), old('o2')).landed, headline(old('o1'), old('o2')).firstTry],
          [2, null, null],
        ),
    },
    {
      name: 'one run of the day that recorded its landing counts it',
      check: () =>
        assert.deepEqual(
          [headline(old('o1'), old('o2'), twoRounds('l')).runs, headline(old('o1'), old('o2'), twoRounds('l')).landed],
          [3, 1],
        ),
    },
    {
      name: 'a run recorded as not landing is counted: 0, not null',
      check: () => assert.equal(headline(twoRounds('aborted', TEAM, { aborted: 'its check refused' })).landed, 0),
    },
    {
      name: 'refused calls are a mean per measured try: three calls over two, the codex try not one of them',
      check: () => assert.equal(headline(readOf('denied', deniedSteps, deniedTries)).deniedPerTry, 1),
    },
    {
      name: 'a codex step records no denial: nothing measured, null, not 0',
      check: () => assert.equal(headline(readOf('codex', deniedSteps, { implement: deniedTries.implement })).deniedPerTry, null),
    },
    {
      name: 'a claude try denied nothing is a measured 0',
      check: () => assert.equal(headline(readOf('none', deniedSteps, { design: [{ end: at(1, JOBS_DAY) }] })).deniedPerTry, 0),
    },
    {
      name: 'skills loaded are a mean per measured try: a try whose ends do not say is left out, never 0',
      check: () =>
        assert.equal(
          headline(
            readOf('skills', seldon, { design: [{ end: at(1), skills: ['look', 'effect'] }, { end: at(2), skills: [] }, { end: at(3) }] }),
          ).skillsPerTry,
          1,
        ),
    },
    {
      name: 'no try measured its skills: null',
      check: () => assert.equal(headline(readOf('unsaid', seldon, { design: [{ end: at(1) }] })).skillsPerTry, null),
    },
    {
      name: 'a session that loaded none is a measured 0',
      check: () => assert.equal(headline(readOf('none', seldon, { design: [{ end: at(1), skills: [] }] })).skillsPerTry, 0),
    },
  ]);
});

const landingOf = (r: ReturnType<typeof readOf>) => slowLandingsOf(factsOf(r).tries);

test('`slowLandingsOf`: each landing check that passed in more than half the deadline its task was filed with', async (t) => {
  await rowsOf(t, [
    {
      name: 'a passed landing check over half its deadline is named, with its time, the deadline and the share',
      check: () => {
        const [slow, ...more] = landingOf(landingAt('slow', 'passed', 1377, 2700));
        assert.deepEqual(more, []);
        const { share, ...rest } = slow;
        assert.deepEqual(rest, {
          run: 'slow',
          factory: 'default',
          workflow: 'build',
          repo: '/r',
          day: DAY,
          step: 'land',
          try: 1,
          checkMs: 1_377_000,
          deadlineMs: 2_700_000,
        });
        assert.equal(Math.round(share * 100), 51);
      },
    },
    { name: 'at 49% it is not named', check: () => assert.deepEqual(landingOf(landingAt('quick', 'passed', 1323, 2700)), []) },
    { name: 'at exactly half it is not named', check: () => assert.deepEqual(landingOf(landingAt('half', 'passed', 1350, 2700)), []) },
    ...(['refused', 'unfinished'] as const).map((verdict) => ({
      name: `a landing check ${verdict} at 90% is not named`,
      check: () => assert.deepEqual(landingOf(landingAt(verdict, verdict, 2430, 2700)), []),
    })),
    {
      name: 'the same 1033 s is judged against the deadline its task was filed with: over half of 1200',
      check: () =>
        assert.deepEqual(
          landingOf(landingAt('old', 'passed', 1033, 1200)).map((x) => [x.run, x.deadlineMs, Math.round(x.share * 100)]),
          [['old', 1_200_000, 86]],
        ),
    },
    { name: 'and under half of 2700, at 38%', check: () => assert.deepEqual(landingOf(landingAt('new', 'passed', 1033, 2700)), []) },
    {
      name: 'a check filed with no deadline is not measured',
      check: () => assert.deepEqual(landingOf(landingAt('unfiled', 'passed', 2430)), []),
    },
    {
      name: "a round's check is no landing, whatever its time",
      check: () => {
        const checked = TEAM.map((s) => (s.name === 'implement' ? { ...s, check: 'npm test' } : s));
        assert.deepEqual(
          landingOf(
            readOf('round', checked, {
              design: [{ end: at(1) }],
              implement: [{ end: at(2), check: 'passed', checkRan: 1080, deadline: 1200 }],
            }),
          ),
          [],
        );
      },
    },
    {
      name: 'a step is a landing by its structure, not its name',
      check: () => {
        const landing = TEAM.map((s) =>
          s.name === 'implement' ? { ...s, check: 'npm test', workspace: 'base' as const, gate: true as const } : s,
        );
        assert.deepEqual(
          landingOf(
            readOf('lands', landing, {
              design: [{ end: at(1) }],
              implement: [{ end: at(2), check: 'passed', checkRan: 1080, deadline: 1200 }],
            }),
          ).map((x) => x.step),
          ['implement'],
        );
      },
    },
  ]);
});

const deniedByCall = {
  design: [
    { end: at(1, JOBS_DAY), denied: ['Write(/z)', 'Write(/a)', 'Bash(git push)'] },
    { end: at(2, JOBS_DAY), denied: ['Bash(git push)', 'Write(/z)', 'Write(/a)', 'Bash(git push)'] },
  ],
};
const skillsBy = {
  design: [{ end: at(1), skills: ['look', 'write-a-spec', 'effect'] }, { end: at(2), skills: ['write-a-spec'] }, { end: at(3) }],
};
const touchedTries = {
  design: [
    { end: at(1), skills: [], files: ['apps/web/src/a.tsx'] },
    { end: at(2), skills: ['change-the-board', 'shadcn'], files: ['apps/web/src/b.tsx'] },
    { end: at(3), skills: ['effect'] },
    { end: at(4), skills: [], files: ['packages/x.ts'] },
  ],
};
const touched = () =>
  applying(readOf('due', seldon, touchedTries), { design: { 'change-the-board': ['apps/web/**'], effect: ['packages/**'], shadcn: [] } });
const ruled = () =>
  declaring(readOf('rules', seldon, { design: [{ end: at(1, JOBS_DAY), denied: ['Bash(cat)', 'Write(/x)'] }] }), {
    design: { 'write-a-spec': [readWithRead, checksBare], effect: [] },
  });
const tallied = () =>
  readOf('per-day', TRIAGE, {
    triage: [
      { end: at(1, TWO_BEFORE), closeout: { issues: [{ open: true }, { open: true }] } },
      { end: at(2, TWO_BEFORE), closeout: { issues: [{ open: false }] } },
      { end: at(1, DAY_BEFORE) },
    ],
  });
const HEALTH = {
  pass: { p50: 12.34, p95: 80 },
  runs: 40,
  reads: 3,
  load: { p95: 0.5, max: 1.25 },
  queued: 2,
  waitMs: 90_000,
  checkLoad: 0.4,
  quota: [{ harness: 'h', window: 'week', latest: 41.6, peak: 50 }],
};

test('`statsOf`: the facts bucketed by UTC day and by a key, filtered, totalled per step, and tiled over the last 14 days', async (t) => {
  await rowsOf(t, [
    {
      name: 'a try falls on the UTC day it ended: 23:59Z and 00:01Z the next morning are two days',
      check: () => {
        const r = readOf('d', [step('implement', [])], {
          implement: [{ end: '2026-09-10T23:59:00.000Z', cause: 'retries' }, { end: '2026-09-11T00:01:00.000Z' }],
        });
        assert.deepEqual(
          statsOf(factsOfAll(r), {}, new Date('2026-09-11T12:00:00.000Z')).all.days.map((d) => [d.day, d.tries]),
          [
            ['2026-09-10', 1],
            ['2026-09-11', 1],
          ],
        );
      },
    },
    {
      name: 'the tiles are the last 14 days to today and the 14 before: a try on today-13 is in the last, one on today-14 in the before',
      check: () => {
        const r = readOf('t', [step('implement', [])], {
          implement: [{ end: at(12, '2026-09-17'), cause: 'retries' }, { end: at(12, '2026-09-16') }],
        });
        const { last, before } = statsOf(factsOfAll(r), {}, new Date('2026-09-30T08:00:00.000Z')).all.tiles;
        assert.deepEqual([last.from, last.to, last.tries], ['2026-09-17', '2026-09-30', 1]);
        assert.deepEqual([before.from, before.to, before.tries], ['2026-09-03', '2026-09-16', 1]);
      },
    },
    {
      name: 'a claude try before steps ran as jobs leaves the tile before at null, and the last tile is not diluted with 0',
      check: () => {
        const r = readOf('bg', seldon, { design: [{ end: at(1) }, { end: at(1, JOBS_DAY), denied: ['Write(/x)'] }] });
        const { all } = statsOf(factsOfAll(r), {}, JOBS_NOW);
        assert.deepEqual([all.tiles.before.deniedPerTry, all.tiles.last.deniedPerTry], [null, 1]);
      },
    },
    {
      name: 'by agent, a step no agent fills is a group of its own, last, never the group of an agent that fills a step of the same name',
      check: () => {
        const filled = readOf('a', [step('implement', [], { by: 'ada' })], { implement: [{ end: at(1) }] });
        const bare = readOf('b', [step('implement', [])], { implement: [{ end: at(2) }] });
        assert.deepEqual(
          statsOf(factsOfAll(filled, bare), { by: 'agent' }, NOW).groups.map((g) => [g.key, g.total.tries]),
          [
            ['ada', 1],
            [null, 1],
          ],
        );
        assert.equal(statsOf(factsOfAll(filled, bare), { agent: 'ada' }, NOW).all.total.tries, 1);
      },
    },
    {
      name: 'a day whose runs never recorded their landing has no landed count',
      check: () => {
        const old = (id: string) =>
          readOf(id, prose, { design: [{ end: at(1) }], implement: [{ end: at(2) }], review: [{ end: at(3) }], land: [{ end: at(7) }] });
        const s = statsOf(factsOfAll(old('old-1'), old('old-2')), { by: 'workflow' }, NOW);
        assert.equal(s.groups[0].days.find((d) => d.day === DAY)?.landed, null);
      },
    },
    {
      name: "a day's refused calls are a mean over its measured tries",
      check: () => {
        const steps = [step('design', [], { by: 'seldon' }), step('implement', ['design'], { by: 'ada', harness: 'codex' })];
        const s = statsOf(
          factsOfAll(
            readOf('denied', steps, {
              design: [
                { end: at(1, JOBS_DAY), denied: ['Write(/x)', 'Bash(git push)'] },
                { end: at(2, JOBS_DAY), denied: [] },
              ],
              implement: [{ end: at(3, JOBS_DAY), denied: ['Write(/x)'] }],
            }),
          ),
          {},
          JOBS_NOW,
        );
        assert.equal(s.all.days.find((d) => d.day === JOBS_DAY)?.deniedPerTry, 1);
      },
    },
    {
      name: "a step's refused calls are counted by call, most first and then by call, over its measured tries",
      check: () => {
        const [row] = statsOf(factsOfAll(readOf('by-call', seldon, deniedByCall)), {}, JOBS_NOW).all.steps;
        assert.deepEqual([row.deniedCalls, row.deniedTries], [7, 2]);
        assert.deepEqual(row.denials, [
          { call: 'Bash(git push)', count: 3 },
          { call: 'Write(/a)', count: 2 },
          { call: 'Write(/z)', count: 2 },
        ]);
      },
    },
    {
      name: "a codex step's refused calls are null over 0 tries, with no call",
      check: () => {
        const [row] = statsOf(
          factsOfAll(readOf('codex', [step('design', [], { by: 'seldon', harness: 'codex' })], deniedByCall)),
          {},
          JOBS_NOW,
        ).all.steps;
        assert.deepEqual([row.deniedCalls, row.deniedTries, row.denials], [null, 0, []]);
      },
    },
    {
      name: "a day's skills loaded are a mean over its measured tries",
      check: () => {
        const s = statsOf(
          factsOfAll(
            readOf('skills', seldon, { design: [{ end: at(1), skills: ['look', 'effect'] }, { end: at(2), skills: [] }, { end: at(3) }] }),
          ),
          {},
          NOW,
        );
        assert.equal(s.all.days.find((d) => d.day === DAY)?.skillsPerTry, 1);
      },
    },
    {
      name: "a step's skills are counted by skill over its measured tries, most first and then by name, and how many tries were measured",
      check: () => {
        const [row] = statsOf(factsOfAll(readOf('by-skill', seldon, skillsBy)), {}, NOW).all.steps;
        assert.deepEqual([row.tries, row.skillLoads, row.skillTries], [3, 4, 2]);
        assert.deepEqual(
          row.skills.map((x) => [x.skill, x.count]),
          [
            ['write-a-spec', 2],
            ['effect', 1],
            ['look', 1],
          ],
        );
      },
    },
    {
      name: "an unmeasured step's skills are null over 0 tries",
      check: () => {
        const [row] = statsOf(factsOfAll(readOf('unsaid', seldon, { design: [{ end: at(1) }] })), {}, NOW).all.steps;
        assert.deepEqual([row.skillLoads, row.skillTries, row.skills], [null, 0, []]);
      },
    },
    {
      name: "a skill's tries that touched its paths are counted, and how many of them loaded it, over the tries whose files were measured",
      check: () =>
        assert.deepEqual(statsOf(factsOfAll(touched()), {}, NOW).all.steps[0].skills, [
          { skill: 'change-the-board', count: 1, tries: 1, touched: 2, loadedWhenTouched: 1 },
          { skill: 'effect', count: 1, tries: 1, touched: 1, loadedWhenTouched: 0 },
          { skill: 'shadcn', count: 1, tries: 1, touched: null, loadedWhenTouched: null },
        ]),
    },
    {
      name: "a step's rules are kept and broken over its measured tries",
      check: () =>
        assert.deepEqual(statsOf(factsOfAll(ruled()), {}, JOBS_NOW).all.steps[0].rules, [
          { skill: 'write-a-spec', rule: 'read-with-read', says: 'Read a file with Read', kept: 0, broken: 1 },
          { skill: 'write-a-spec', rule: 'checks-bare', says: 'Run a check bare', kept: 1, broken: 0 },
        ]),
    },
    {
      name: 'a try whose denials were not measured — on codex, before steps ran as jobs, undeclared — gives no row, never a row of zeros',
      check: () => {
        const codex = declaring(
          readOf('codex', [step('design', [], { by: 'seldon', harness: 'codex' })], { design: [{ end: at(1, JOBS_DAY) }] }),
          declaredSpec,
        );
        const before = declaring(readOf('before', seldon, { design: [{ end: at(1) }] }), declaredSpec);
        const undeclared = readOf('undeclared', seldon, { design: [{ end: at(1, JOBS_DAY) }] });
        for (const r of [codex, before, undeclared])
          assert.deepEqual(statsOf(factsOfAll(r), {}, JOBS_NOW).all.steps[0].rules, [], r.run.id);
      },
    },
    {
      name: "a rule's kept and broken add up to its step and agent's tries whose denials were measured",
      check: () => {
        const steps = [step('design', [], { by: 'seldon' }), step('implement', ['design'], { by: 'ada' })];
        const r = declaring(
          readOf('identity', steps, {
            design: [
              { end: at(1, JOBS_DAY), denied: ['Bash(cat)'] },
              { end: at(2, JOBS_DAY), denied: [] },
              { end: at(3) },
              { end: at(4, JOBS_DAY), denied: ['Bash(head)', 'Bash(cd)'] },
            ],
            implement: [{ end: at(5, JOBS_DAY), denied: ['Bash(cd)'] }],
          }),
          { design: { 'write-a-spec': [readWithRead, checksBare] }, implement: { 'write-a-spec': [checksBare] } },
        );
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
      },
    },
    {
      name: "a step's tallies are summed per day of the range and over it, over measured tries only, and absent where none was measured",
      check: () =>
        assert.deepEqual(statsOf(factsOfAll(tallied()), { from: TWO_BEFORE }, NOW).all.tallies, [
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
        ]),
    },
    {
      name: 'a step that declares no tally gives no row',
      check: () =>
        assert.deepEqual(
          statsOf(factsOfAll(readOf('plain', seldon, { design: [{ end: at(1), closeout: { issues: [1] } }] })), {}, NOW).all.tallies,
          [],
        ),
    },
    {
      name: 'a workflow with other names gets its own tally rows, keyed by its step and its field, and grouped by its agent',
      check: () => {
        const triaged = readOf('t', TRIAGE, { triage: [{ end: at(1), closeout: { issues: [{}] } }] });
        const noted = readOf('c', [step('check-in', [], { tally: ['notes'] })], { 'check-in': [{ end: at(2), closeout: { notes: 4 } }] });
        assert.deepEqual(
          statsOf(factsOfAll(triaged, noted), {}, NOW).all.tallies.map((row) => [row.step, row.tally, row.total]),
          [
            ['triage', 'issues', { sum: 1, tries: 1 }],
            ['triage', 'issues.open', { sum: 0, tries: 1 }],
            ['check-in', 'notes', { sum: 4, tries: 1 }],
          ],
        );
        assert.deepEqual(
          statsOf(factsOfAll(triaged, noted), { by: 'agent' }, NOW).groups.map((g) => [g.key, g.tallies.map((row) => row.tally)]),
          [
            ['sorter', ['issues', 'issues.open']],
            [null, ['notes']],
          ],
        );
      },
    },
    {
      name: "a step's check time is its checks' run time alone, summed over its tries, and absent — null, not 0 — for a step with no check",
      check: () => {
        const { all } = statsOf(factsOfAll(twoRounds('c1')), {}, NOW);
        assert.deepEqual(Object.fromEntries(all.steps.map((s) => [s.step, s.checkMs])), {
          design: null,
          implement: 2 * 60 * MIN,
          review: null,
          land: 60 * MIN,
        });
        const implement = all.steps.find((s) => s.step === 'implement');
        assert.ok(
          implement && implement.ranMs !== null && implement.checkMs !== null && implement.ranMs > implement.checkMs,
          "the step's run time holds its sessions' too",
        );
      },
    },
    {
      name: "the system's health is read over the days the stats answer",
      check: () => {
        const asked: Array<[string | null, string]> = [];
        const s = statsOf(factsOfAll(twoRounds('h1')), { from: '2026-09-01' }, NOW, [], (from, to) => {
          asked.push([from, to]);
          return HEALTH;
        });
        assert.deepEqual(asked, [['2026-09-01', DAY]]);
        assert.deepEqual(s.health, HEALTH);
      },
    },
    {
      name: "the slow landings keep to the query's filters and days, and each group has its own",
      check: () => {
        const facts = factsOfAll(landingAt('slow', 'passed', 2430, 2700));
        assert.deepEqual(statsOf(facts, { factory: 'other' }, NOW).all.slowLandings, []);
        assert.deepEqual(statsOf(facts, { from: '2026-09-11', to: '2026-09-11' }, NOW).all.slowLandings, []);
        assert.deepEqual(
          statsOf(facts, { by: 'step' }, NOW).groups.map((g) => [g.key, g.slowLandings.length]),
          [
            ['design', 0],
            ['implement', 0],
            ['land', 1],
            ['review', 0],
          ],
        );
      },
    },
  ]);
});

/** The words of the stats of `reads`, as of `now`, line by line. */
const wordsOf = (reads: ReturnType<typeof readOf>[], query = {}, now = NOW) => statsLines(statsOf(factsOfAll(...reads), query, now));
/** Whether a line of `words` reads as `line`. */
const hasLine = (words: string[], line: RegExp) =>
  assert.ok(
    words.some((l) => line.test(l)),
    words.join('\n'),
  );

test('`statsLines` and `statsLine`: the stats in words, — where nothing was measured', async (t) => {
  const empty = statsLine(statsOf({ tries: [], runs: [], frozen: [] }, {}, NOW));
  await rowsOf(t, [
    { name: 'the recap line is one line', check: () => assert.equal(empty.split('\n').length, 1) },
    { name: 'it says — where no round was measured', check: () => assert.match(empty, /— \(—\) rounds/) },
    { name: 'a fortnight with no run finished recorded no landing', check: () => assert.match(empty, /— \(—\) landed/) },
    {
      name: 'the day row reads — under landed where no run recorded it, not 0',
      check: () => {
        const old = (id: string) =>
          readOf(id, prose, { design: [{ end: at(1) }], implement: [{ end: at(2) }], review: [{ end: at(3) }], land: [{ end: at(7) }] });
        hasLine(wordsOf([old('old-1'), old('old-2')], { by: 'workflow' }), new RegExp(`^${DAY}\\s+2\\s+—\\s`));
      },
    },
    {
      name: 'refused calls: — where none were measured, a measured 0 as 0/try, a small rate keeps a significant figure',
      check: () => {
        const codex = statsOf(
          factsOfAll(readOf('codex', [step('implement', [], { harness: 'codex' })], { implement: [{ end: at(3, JOBS_DAY) }] })),
          {},
          JOBS_NOW,
        );
        assert.match(statsLine(codex), /— \(—\) calls denied/);
        const none = statsOf(factsOfAll(readOf('none', seldon, { design: [{ end: at(1, JOBS_DAY) }] })), {}, JOBS_NOW);
        assert.match(statsLine(none), /0\/try \(—\) calls denied/);
        none.all.tiles.last.deniedPerTry = 1 / 300;
        assert.match(statsLine(none), / 0\.003\/try \(—\) calls denied/);
      },
    },
    {
      name: 'skills loaded: — where none were measured, 0/try for a measured none',
      check: () => {
        assert.match(
          statsLine(statsOf(factsOfAll(readOf('unsaid', seldon, { design: [{ end: at(1) }] })), {}, NOW)),
          /— \(—\) skills loaded$/,
        );
        assert.match(
          statsLine(statsOf(factsOfAll(readOf('none', seldon, { design: [{ end: at(1), skills: [] }] })), {}, NOW)),
          /0\/try \(—\) skills loaded$/,
        );
      },
    },
    {
      name: 'the step row says how many of its tries had their skills measured, and a skill row under its header',
      check: () => {
        const words = wordsOf([readOf('by-skill', seldon, skillsBy)]);
        hasLine(words, /^design .*\s4 \(2 of 3\)$/);
        hasLine(words, /^step\s+agent\s+skill\s+loads\s+tries\s+when touched$/);
        hasLine(words, /^design\s+seldon\s+write-a-spec\s+2\s+2\s+—$/);
      },
    },
    {
      name: "a skill's row says how many touched tries loaded it, and — where it declares no path",
      check: () => {
        const words = wordsOf([touched()]);
        hasLine(words, /^design\s+seldon\s+change-the-board\s+1\s+1\s+1 of 2$/);
        hasLine(words, /^design\s+seldon\s+shadcn\s+1\s+1\s+—$/);
      },
    },
    {
      name: 'a rule row says kept and broken under its header',
      check: () => {
        const words = wordsOf([ruled()], {}, JOBS_NOW);
        hasLine(words, /^step\s+agent\s+skill\s+rule\s+kept\s+broken$/);
        hasLine(words, /^design\s+seldon\s+write-a-spec\s+read-with-read\s+0\s+1$/);
        hasLine(words, /^design\s+seldon\s+write-a-spec\s+checks-bare\s+1\s+0$/);
      },
    },
    {
      name: 'no rule measured: no rule header',
      check: () =>
        assert.ok(
          !wordsOf([readOf('undeclared', seldon, { design: [{ end: at(1, JOBS_DAY) }] })], {}, JOBS_NOW).some((l) =>
            /^step\s+agent\s+skill\s+rule/.test(l),
          ),
        ),
    },
    {
      name: "a tally's rows per day and over the range: — on a day with a try and no closeout, a day nothing happened on left out",
      check: () => {
        const words = wordsOf([tallied()], { from: TWO_BEFORE });
        assert.ok(words.includes('day         step    tally        sum  tries'), words.join('\n'));
        hasLine(words, /^2026-09-08\s+triage\s+issues\s+3\s+2$/);
        hasLine(words, /^2026-09-09\s+triage\s+issues\.open\s+—\s+0$/);
        assert.ok(!words.some((l) => l.startsWith(`${DAY}  triage`)));
        hasLine(words, /^all\s+triage\s+issues\s+3\s+2$/);
      },
    },
    {
      name: 'a step row says its tries, its time, its check time and its cost',
      check: () => hasLine(wordsOf([twoRounds('c1')]), /^implement\s+ada\s+2\s+4h00m\s+2h00m\s+\$2\.00\s/),
    },
    {
      name: "the system's health is said under `system` where the series kept some, and nothing where none",
      check: () => {
        const lines = statsLines(statsOf(factsOfAll(twoRounds('h1')), { from: '2026-09-01' }, NOW, [], () => HEALTH));
        assert.deepEqual(lines.slice(lines.indexOf('system')), [
          'system',
          '  a pass: 12.3 ms (p50), 80.0 ms (p95)',
          '  runs in the store: 40 at most; journal reads a pass: 3 (p95)',
          '  sessions queued: 2 at most, waiting 1m30s at longest',
          '  load: 0.5 (p95), 1.25 at most; checks filed at 0.4 (p50)',
          '  quota h week: 42% used, 50% at most',
        ]);
        assert.ok(!wordsOf([twoRounds('h1')]).includes('system'));
      },
    },
    {
      name: 'a slow landing is said under its header with its time, the deadline and the share',
      check: () => {
        const words = wordsOf([landingAt('slow', 'passed', 1377, 2700)]);
        hasLine(words, SLOW_HEADER);
        hasLine(words, /\bslow\s+land\s+1\s+22m57s\s+45m00s\s+51%/);
      },
    },
    {
      name: 'no slow landing: no header',
      check: () => assert.ok(!wordsOf([landingAt('quick', 'passed', 1323, 2700)]).some((line) => SLOW_HEADER.test(line))),
    },
    {
      name: 'the recap line counts the slow landings of the last 14 days where there are any',
      check: () => {
        assert.match(
          statsLine(statsOf(factsOfAll(landingAt('slow', 'passed', 1377, 2700)), {}, NOW)),
          /, 1 landing check over half its deadline: measure again$/,
        );
        assert.match(
          statsLine(statsOf(factsOfAll(landingAt('a', 'passed', 1377, 2700), landingAt('b', 'passed', 2000, 2700)), {}, NOW)),
          /, 2 landing checks over half their deadline: measure again$/,
        );
      },
    },
    {
      name: 'and says nothing of them where none, nor of one older than 14 days',
      check: () => {
        const quick = statsLine(statsOf(factsOfAll(landingAt('quick', 'passed', 1323, 2700)), {}, NOW));
        assert.doesNotMatch(quick, /over half/);
        assert.match(quick, /skills loaded$/);
        const later = new Date(Date.parse(NOW.toISOString()) + 20 * 86_400_000);
        assert.doesNotMatch(statsLine(statsOf(factsOfAll(landingAt('slow', 'passed', 1377, 2700)), {}, later)), /over half/);
      },
    },
    {
      name: 'a run left out because a journal of it does not read is named',
      check: () => {
        const words = statsLines(statsOf({ tries: [], runs: [], frozen: [] }, {}, NOW, ['marks-2', 'spoilt'])).join('\n');
        assert.ok(words.includes('left out, a journal of each not reading'), words);
        assert.ok(words.includes('(nemia ls says why): marks-2, spoilt'), words);
      },
    },
  ]);
});

const QUERIES: Array<{ name: string; given: Parameters<typeof statsQueryOf>[0]; query: ReturnType<typeof statsQueryOf> | 'refused' }> = [
  {
    name: 'a key to go by, a day and a filter are taken as given',
    given: { by: 'repo', from: '2026-09-01', agent: 'ada' },
    query: { by: 'repo', from: '2026-09-01', agent: 'ada' },
  },
  { name: 'nothing given is the whole store', given: {}, query: {} },
  {
    name: 'the same day for from and to',
    given: { from: '2026-09-01', to: '2026-09-01' },
    query: { from: '2026-09-01', to: '2026-09-01' },
  },
  { name: 'REFUSED: a key to go by it does not know', given: { by: 'colour' }, query: 'refused' },
  { name: 'REFUSED: a from that is not a day', given: { from: '2026-13-40' }, query: 'refused' },
  { name: 'REFUSED: a to of another shape', given: { to: '2026-9-1' }, query: 'refused' },
  { name: 'REFUSED: a day that does not exist', given: { to: '2026-02-30' }, query: 'refused' },
  { name: 'REFUSED: a from after its to', given: { from: '2026-09-02', to: '2026-09-01' }, query: 'refused' },
  { name: 'REFUSED: an empty filter', given: { factory: '' }, query: 'refused' },
];

test('`statsQueryOf`: a query off what a person gave, refused by its kind where a key, a day or a range is no such thing', async (t) => {
  for (const row of QUERIES)
    await t.test(row.name, () => {
      const read = () => statsQueryOf(row.given, (k) => `--${k}`);
      if (row.query !== 'refused') return assert.deepEqual(read(), row.query);
      assert.throws(read, (err: unknown) => err instanceof Invalid && err._tag === 'Invalid' && err.exitCode === 2);
    });
});
