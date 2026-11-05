/**
 * The step machine held to `stepStatus` (`step-machine.ts`): a replay of a step's record moved by hand from one fact to the next — a
 * filing, a sign-off, a session settled, a check filed and ended, an approval, a try, a round, a send-back — reading the step's word
 * before and after each move. Every consecutive pair must be a move `stepMove` does not refuse, and every edge of `STEP_EDGES` must be
 * walked by some walk: so the table grows by what `stepStatus` does, never past it. Pure: no disk, no engine, no clock.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { roundFiled, sentBack, type CloseoutAsked, type Run, type StepStatus, type TaskPhase, type TaskSpend } from '../run.ts';
import { nextTry, type RetryMode } from '../retry/retry-ask.ts';
import type { Closeout } from '../closeout/index.ts';
import type { Verdict } from '../check/check.ts';
import type { OutputSchema, Workflow } from '../workflow.ts';
import { run, step } from '../../test/assessed.ts';
import { STEP_EDGES, stepDiagram, stepMachineGraph, stepMove } from './step-machine.ts';
import { runWords } from '../route/route-words.ts';

/** Every fact `stepStatus` reads: the workflow, the run's record, and what the engine, the closeouts and the checks say. */
type World = {
  steps: Workflow[];
  run: Run;
  /** The engine's phase of each task, by its id. */
  phase: Record<string, TaskPhase>;
  /** The closeout of each step's current try, by the step's name. */
  said: Record<string, Closeout | undefined>;
  /** Whether each task was asked for its closeout, by its id. */
  asked: Record<string, CloseoutAsked>;
  /** What each task's sessions cost, by its id. */
  spend: Record<string, TaskSpend>;
  /** What each step's current check exited with, by the step's name. */
  verdict: Record<string, Verdict | undefined>;
};

/** A move of one fact, named as the replay's refusal names it. */
type Move = [string, (w: World) => World];

/** A walk: the step it reads, and each world from the first, each with the move that made it. */
type Walk = { name: string; step: string; worlds: Array<[string, World]> };

const AT = '2026-11-04T09:00:00.000Z';

const world = (steps: Workflow[]): World => ({
  steps,
  run: run(Object.fromEntries(steps.map((s) => [s.name, null]))),
  phase: {},
  said: {},
  asked: {},
  spend: {},
  verdict: {},
});

const walk = (name: string, of: string, steps: Workflow[], ...moves: Move[]): Walk => {
  const worlds: Array<[string, World]> = [['before anything is filed', world(steps)]];
  for (const [label, move] of moves) {
    const last = worlds[worlds.length - 1];
    assert.ok(last, `${name}: a walk starts from a world`);
    worlds.push([label, move(last[1])]);
  }
  return { name, step: of, worlds };
};

const wordOf = (w: World, name: string): StepStatus => {
  const def = w.steps.find((s) => s.name === name);
  assert.ok(def, `the walk reads ${name}, which its workflow has`);
  const words = runWords(
    w.steps,
    w.run,
    (id) => w.phase[id] ?? 'unknown',
    (s) => w.said[s],
    (id) => w.asked[id] ?? false,
    (id) => w.spend[id],
    (s) => w.verdict[s],
  );
  return words.get(def.name) ?? 'pending';
};

const recordOf = (w: World, name: string) => w.run.steps[name] ?? { taskId: null };
const withRecord = (w: World, name: string, record: Run['steps'][string]): World => ({
  ...w,
  run: { ...w.run, steps: { ...w.run.steps, [name]: record } },
});

/** A step filed for the first time: its task running, no closeout yet. */
const file = (name: string, taskId: string): Move => [
  `${name} filed as ${taskId}`,
  (w) => ({
    ...withRecord(w, name, { ...recordOf(w, name), taskId }),
    phase: { ...w.phase, [taskId]: 'running' },
    said: { ...w.said, [name]: undefined },
  }),
];
const settle = (taskId: string, phase: TaskPhase, facts: { asked?: CloseoutAsked; spend?: Partial<TaskSpend> } = {}): Move => [
  `${taskId} settled ${phase}`,
  (w) => ({
    ...w,
    phase: { ...w.phase, [taskId]: phase },
    ...(facts.asked !== undefined ? { asked: { ...w.asked, [taskId]: facts.asked } } : {}),
    ...(facts.spend ? { spend: { ...w.spend, [taskId]: { ...spent(0), ...facts.spend } } } : {}),
  }),
];
const sign = (name: string, said: Closeout): Move => [
  `${name} signed ${said.outcome}`,
  (w) => ({ ...w, said: { ...w.said, [name]: said } }),
];
const fileCheck = (name: string, checkId: string): Move => [
  `${name}'s check filed as ${checkId}`,
  (w) => ({ ...withRecord(w, name, { ...recordOf(w, name), check: { taskId: checkId } }), phase: { ...w.phase, [checkId]: 'running' } }),
];
const checkEnds = (name: string, checkId: string, phase: TaskPhase, verdict: Verdict): Move => [
  `${name}'s check ${checkId} ended ${phase}, ${verdict}`,
  (w) => ({ ...w, phase: { ...w.phase, [checkId]: phase }, verdict: { ...w.verdict, [name]: verdict } }),
];
const approve = (name: string, n: number): Move => [
  `${name} approved, try ${n}`,
  (w) => ({ ...w, run: { ...w.run, approvals: [...(w.run.approvals ?? []), { step: name, try: n, at: AT }] } }),
];
const accept = (name: string, n: number): Move => [
  `${name} accepted at its cap, try ${n}`,
  (w) => ({ ...w, run: { ...w.run, acceptances: [...(w.run.acceptances ?? []), { step: name, try: n, at: AT, message: 'enough' }] } }),
];
/** A try filed (`nextTry`): a new session, or for a recheck the same task with its check to file again. */
const retry = (name: string, n: number, mode: RetryMode, taskId?: string, budget?: number): Move => [
  `${name} tried again (${mode}${budget === undefined ? '' : `, --budget ${budget}`})`,
  (w) => {
    const record = nextTry(recordOf(w, name), { step: name, try: n, mode, by: 'ask', ...(budget === undefined ? {} : { budget }) }, taskId);
    const moved = withRecord(w, name, record);
    return taskId === undefined
      ? { ...moved, verdict: { ...w.verdict, [name]: undefined } }
      : {
          ...moved,
          phase: { ...w.phase, [taskId]: 'running' },
          said: { ...w.said, [name]: undefined },
          verdict: { ...w.verdict, [name]: undefined },
        };
  },
];
/** A round filed (`roundFiled`): the target filed again as `taskId`, every other step of the loop unfiled. */
const round = (looping: string, target: string, n: number, taskId: string, by: 'again' | 'ask'): Move => [
  `${looping}'s round ${n} filed (${by}), ${target} as ${taskId}`,
  (w) => ({
    ...w,
    run: { ...w.run, steps: roundFiled(w.steps, w.run, { step: looping, target, round: n, by }, taskId) },
    phase: { ...w.phase, [taskId]: 'running' },
    said: {},
    verdict: {},
  }),
];
/** The work sent back from an ending that stopped (`Retry.back`): the work tried again, and the ending's try moved behind (`sentBack`). */
const sendBack = (work: string, n: number, taskId: string, ending: string): Move => [
  `${work} tried again, ${ending} sent back with it`,
  (w) => {
    const tried = retry(work, n, 'continue', taskId)[1](w);
    return {
      ...withRecord(tried, ending, sentBack(recordOf(tried, ending))),
      said: { ...tried.said, [ending]: undefined },
      verdict: { ...tried.verdict, [ending]: undefined },
    };
  },
];
/** A person names a condition's route for a try (`nemia route`), as `readRun` composes their file onto its record. */
const routeNamed = (name: string, route: string, n: number): Move => [
  `${name} routed ${route} by a person, try ${n}`,
  (w) => withRecord(w, name, { ...recordOf(w, name), route: { route, try: n, by: 'person' } }),
];
/** A workflow node's card filed (`StepRecord.sent`). */
const cardSent = (name: string): Move => [
  `${name}'s card filed`,
  (w) => withRecord(w, name, { ...recordOf(w, name), sent: { card: `r-1-${name}`, at: AT } }),
];
const landed = (name: string, how: { commit: string } | { aborted: string }): Move => [
  `${name}'s landing ${'commit' in how ? 'committed' : 'aborted'}`,
  (w) => withRecord(w, name, { ...recordOf(w, name), landed: how }),
];

const spent = (usd: number): TaskSpend => ({ usd, measured: 1, unmeasured: 0, budgetEnded: false });
const done = (output?: Record<string, unknown>): Closeout => ({
  outcome: 'done',
  summary: 'did it',
  artifacts: [],
  ...(output ? { output } : {}),
});
const BLOCKED: Closeout = { outcome: 'blocked', summary: 'stuck', artifacts: [], needs: 'a decision' };

/** A step with no check and no gate. */
const PLAIN = [step('implement')];
const CHECKED: Workflow[] = [{ ...step('implement'), check: 'npm test' }];
const GATED: Workflow[] = [{ ...step('implement'), gate: true }];
const GATED_CHECKED: Workflow[] = [{ ...step('implement'), gate: true, check: 'npm test' }];
const DENYING: Workflow[] = [{ ...step('implement'), denials: 'fail' }];
const BUDGETED: Workflow[] = [{ ...step('implement'), budget: 1 }];
const BUDGETED_CHECKED: Workflow[] = [{ ...step('implement'), budget: 1, check: 'npm test' }];
const LOOPING: OutputSchema = {
  type: 'object',
  properties: { findings: { type: 'array' }, again: { type: 'boolean' } },
  required: ['findings', 'again'],
  additionalProperties: false,
};
const loop = (rounds: number): Workflow[] => [
  { ...step('implement'), check: 'npm test' },
  { ...step('review', ['implement']), output: { file: 'review.schema.json', schema: LOOPING }, loop: 'implement', rounds },
];
/** A loop with a checked step between its target and its looping step. */
const LOOP_THROUGH_TEST: Workflow[] = [
  step('implement'),
  { ...step('test', ['implement']), check: 'npm test' },
  { ...step('review', ['test']), output: { file: 'review.schema.json', schema: LOOPING }, loop: 'implement', rounds: 3 },
];
/** A loop whose looping step has a budget of its own. */
const BUDGETED_LOOP: Workflow[] = [step('implement'), { ...loop(3)[1], budget: 1 }];
/** An ending approved before it is filed: on the base branch, gated, landing on its check. */
const ENDING: Workflow[] = [step('implement'), { ...step('land', ['implement']), workspace: 'base', gate: true, check: 'landing receipt' }];

/** One step's work to a sign-off: filed, signed, and its session settled. */
const works = (name: string, taskId: string, said: Closeout = done()): Move[] => [
  file(name, taskId),
  sign(name, said),
  settle(taskId, 'succeeded'),
];

const SURFACE: OutputSchema = {
  type: 'object',
  properties: { surface: { type: 'string', enum: ['web', 'backend'] } },
  required: ['surface'],
  additionalProperties: false,
};
/** plan → triage, a condition whose table reads plan's surface → build-web | build-backend. */
const routed = (route: Workflow['route'] = { kind: 'table', from: 'plan.surface', table: { web: 'web', backend: 'backend' } }) => [
  { ...step('plan'), output: { file: 'plan.schema.json', schema: SURFACE } },
  { ...step('triage', ['plan']), input: ['plan'], routes: ['web', 'backend'], route },
  { ...step('build-web', ['triage']), when: ['web'] },
  { ...step('build-backend', ['triage']), when: ['backend'] },
];
const ROUTED: Workflow[] = routed();
/** The same, with build-backend a route to the workflow `build`. */
const ROUTED_TO_BUILD: Workflow[] = ROUTED.map((s) => (s.name === 'build-backend' ? { ...s, workflow: 'build' } : s));

const WALKS: Walk[] = [
  walk('a table condition answered', 'triage', ROUTED, ...works('plan', 'p1', done({ surface: 'web' }))),
  walk(
    'a table nobody closed: its producer said a value with no row',
    'triage',
    ROUTED,
    ...works('plan', 'p1', done({ surface: 'mobile' })),
  ),
  walk(
    'a node off its route, re-routed by a person before any follower is filed',
    'build-backend',
    ROUTED,
    ...works('plan', 'p1', done({ surface: 'web' })),
    routeNamed('triage', 'backend', 1),
  ),
  walk(
    'a workflow node sending its card',
    'build-backend',
    ROUTED_TO_BUILD,
    ...works('plan', 'p1', done({ surface: 'backend' })),
    cardSent('build-backend'),
  ),
  walk(
    'a script condition unsure',
    'triage',
    routed({ kind: 'script', script: 'routes/pick.ts' }),
    ...works('plan', 'p1', done({ surface: 'web' })),
    file('triage', 's1'),
    sign('triage', BLOCKED),
    settle('s1', 'succeeded'),
  ),
  walk('plain', 'implement', PLAIN, ...works('implement', 'i1')),
  walk(
    'checked, passed',
    'implement',
    CHECKED,
    ...works('implement', 'i1'),
    fileCheck('implement', 'c1'),
    checkEnds('implement', 'c1', 'succeeded', 0),
  ),
  walk(
    'checked, refused, then tried and rechecked',
    'implement',
    CHECKED,
    ...works('implement', 'i1'),
    fileCheck('implement', 'c1'),
    checkEnds('implement', 'c1', 'failed', 1),
    retry('implement', 2, 'continue', 'i2'),
    sign('implement', done()),
    settle('i2', 'succeeded'),
    fileCheck('implement', 'c2'),
    checkEnds('implement', 'c2', 'failed', 1),
    retry('implement', 3, 'recheck'),
    fileCheck('implement', 'c3'),
    checkEnds('implement', 'c3', 'succeeded', 0),
  ),
  walk(
    'checked, the check did not finish',
    'implement',
    CHECKED,
    ...works('implement', 'i1'),
    fileCheck('implement', 'c1'),
    checkEnds('implement', 'c1', 'stopped', 'unfinished'),
    retry('implement', 2, 'recheck'),
    fileCheck('implement', 'c2'),
    checkEnds('implement', 'c2', 'succeeded', 0),
  ),
  walk(
    'gated, sent back, then approved',
    'implement',
    GATED,
    ...works('implement', 'i1'),
    retry('implement', 2, 'continue', 'i2'),
    sign('implement', done()),
    settle('i2', 'succeeded'),
    approve('implement', 2),
  ),
  walk(
    'gated and checked, approved',
    'implement',
    GATED_CHECKED,
    ...works('implement', 'i1'),
    fileCheck('implement', 'c1'),
    checkEnds('implement', 'c1', 'succeeded', 0),
    approve('implement', 1),
  ),
  walk(
    'blocked, then tried',
    'implement',
    PLAIN,
    file('implement', 'i1'),
    sign('implement', BLOCKED),
    settle('i1', 'succeeded'),
    retry('implement', 2, 'continue', 'i2'),
    ...works('implement', 'i2').slice(1),
  ),
  walk(
    'unsigned, then tried',
    'implement',
    PLAIN,
    file('implement', 'i1'),
    settle('i1', 'failed', { asked: 'unsigned' }),
    retry('implement', 2, 'continue', 'i2'),
    settle('i2', 'succeeded', { asked: true }),
    retry('implement', 3, 'continue', 'i3'),
    sign('implement', done()),
    settle('i3', 'succeeded'),
  ),
  walk(
    'denied a call, then tried',
    'implement',
    DENYING,
    ...works('implement', 'i1').slice(0, 2),
    settle('i1', 'succeeded', { spend: { denied: ['Bash(git push)'] } }),
    retry('implement', 2, 'fresh', 'i2'),
  ),
  walk(
    'budget exhausted, then tried with more',
    'implement',
    PLAIN,
    file('implement', 'i1'),
    settle('i1', 'failed', { spend: { usd: 3, budgetEnded: true } }),
    retry('implement', 2, 'continue', 'i2', 10),
  ),
  walk(
    'blocked over budget, then tried with more',
    'implement',
    BUDGETED,
    file('implement', 'i1'),
    sign('implement', BLOCKED),
    settle('i1', 'succeeded', { spend: { usd: 2 } }),
    retry('implement', 2, 'continue', 'i2', 10),
  ),
  walk('failed over budget', 'implement', BUDGETED, file('implement', 'i1'), settle('i1', 'failed', { spend: { usd: 2 } })),
  walk(
    'checked, refused over budget',
    'implement',
    BUDGETED_CHECKED,
    file('implement', 'i1'),
    sign('implement', done()),
    settle('i1', 'succeeded', { spend: { usd: 2 } }),
    fileCheck('implement', 'c1'),
    checkEnds('implement', 'c1', 'failed', 1),
  ),
  walk('failed, then tried', 'implement', PLAIN, file('implement', 'i1'), settle('i1', 'failed'), retry('implement', 2, 'continue', 'i2')),
  walk(
    'stopped, then tried',
    'implement',
    PLAIN,
    file('implement', 'i1'),
    settle('i1', 'stopped'),
    retry('implement', 2, 'continue', 'i2'),
  ),
  ...(['implement', 'review'] as const).map((of) =>
    walk(
      `a loop's round, read at ${of}`,
      of,
      loop(3),
      ...works('implement', 'i1'),
      fileCheck('implement', 'c1'),
      checkEnds('implement', 'c1', 'succeeded', 0),
      ...works('review', 'r1', done({ findings: ['a'], again: true })),
      round('review', 'implement', 2, 'i2', 'again'),
      sign('implement', done({ replies: [{ finding: 'a', reply: 'fixed' }] })),
      settle('i2', 'succeeded'),
      fileCheck('implement', 'c2'),
      checkEnds('implement', 'c2', 'succeeded', 0),
      ...works('review', 'r2', done({ findings: [], again: false })),
    ),
  ),
  walk(
    'a loop at its cap, accepted',
    'review',
    loop(1),
    ...works('implement', 'i1'),
    fileCheck('implement', 'c1'),
    checkEnds('implement', 'c1', 'succeeded', 0),
    ...works('review', 'r1', done({ findings: ['a'], again: true })),
    accept('review', 1),
  ),
  walk(
    'a loop at its cap, a round on your word',
    'review',
    loop(1),
    ...works('implement', 'i1'),
    fileCheck('implement', 'c1'),
    checkEnds('implement', 'c1', 'succeeded', 0),
    ...works('review', 'r1', done({ findings: ['a'], again: true })),
    round('review', 'implement', 2, 'i2', 'ask'),
  ),
  walk(
    "a loop's round, read at a checked step between",
    'test',
    LOOP_THROUGH_TEST,
    ...works('implement', 'i1'),
    ...works('test', 't1'),
    fileCheck('test', 'c1'),
    checkEnds('test', 'c1', 'succeeded', 0),
    ...works('review', 'r1', done({ findings: ['a'], again: true })),
    round('review', 'implement', 2, 'i2', 'again'),
  ),
  walk(
    'a loop held over its budget, a round on your word with a budget',
    'review',
    BUDGETED_LOOP,
    ...works('implement', 'i1'),
    file('review', 'r1'),
    sign('review', done({ findings: ['a'], again: true })),
    settle('r1', 'succeeded', { spend: { usd: 2 } }),
    round('review', 'implement', 2, 'i2', 'ask'),
  ),
  walk(
    'an ending approved before it is filed, landed',
    'land',
    ENDING,
    ...works('implement', 'i1'),
    approve('land', 1),
    file('land', 'l1'),
    sign('land', done()),
    settle('l1', 'succeeded'),
    landed('land', { commit: 'abc' }),
  ),
  walk(
    'an ending whose landing aborted, sent back with its work',
    'land',
    ENDING,
    ...works('implement', 'i1'),
    approve('land', 1),
    ...works('land', 'l1'),
    fileCheck('land', 'c1'),
    checkEnds('land', 'c1', 'failed', 1),
    landed('land', { aborted: 'a conflict' }),
    sendBack('implement', 2, 'i2', 'land'),
    sign('implement', done()),
    settle('i2', 'succeeded'),
  ),
  walk("an ending's work sent back from its gate", 'land', ENDING, ...works('implement', 'i1'), retry('implement', 2, 'continue', 'i2')),
];

/** Each walk's words, and the move that made each. */
const READ = WALKS.map((w) => ({ ...w, words: w.worlds.map(([label, at]) => [label, wordOf(at, w.step)] as const) }));

/** Every pair a walk makes, `from → to`, each with the walk and move that made it. */
const PAIRS = READ.flatMap((w) =>
  w.words.slice(1).map(([label, to], i) => ({ walk: w.name, label, from: w.words[i]?.[1] ?? 'pending', to })),
);

const key = (from: StepStatus, to: StepStatus): string => `${from} → ${to}`;

test('every pair of words a walk reads through stepStatus is a move the step machine draws', () => {
  for (const p of PAIRS) {
    assert.notEqual(
      stepMove(p.from, p.to).kind,
      'refused',
      `${p.walk}, on ${p.label}: ${key(p.from, p.to)} is no edge of STEP_EDGES — add it with the event that makes it`,
    );
  }
});

test('a step reads unverified or unsigned unfiled only as a condition its table answered', () => {
  for (const p of PAIRS.filter((x) => x.from === 'pending' && (x.to === 'unverified' || x.to === 'unsigned'))) {
    const walked = READ.find((w) => w.name === p.walk);
    const def = WALKS.find((w) => w.name === p.walk)?.worlds[0]?.[1].steps.find((s) => s.name === walked?.step);
    assert.equal(def?.route?.kind, 'table', `${p.walk}, on ${p.label}: ${key(p.from, p.to)} of a step no table answers`);
  }
});

test('every edge of the step machine is walked', () => {
  const walked = new Set(PAIRS.map((p) => key(p.from, p.to)));
  for (const e of STEP_EDGES)
    assert.ok(walked.has(key(e.from, e.to)), `${key(e.from, e.to)} (${e.event}) is walked by no walk — add the walk, or drop the edge`);
});

test("every word a step is said in is read by some walk, and the machine's states are its words", () => {
  const read = new Set(PAIRS.flatMap((p) => [p.from, p.to]));
  const graph = stepMachineGraph();
  for (const s of graph.states) assert.ok(read.has(s), `${s} is read by no walk — add the walk that reaches it`);
  assert.equal(graph.initial, 'pending');
});

test('the step machine draws each move once, between two of its states', () => {
  const graph = stepMachineGraph();
  const pairs = STEP_EDGES.map((e) => key(e.from, e.to));
  assert.deepEqual(pairs, [...new Set(pairs)], 'an edge drawn twice');
  for (const e of STEP_EDGES) {
    assert.ok(graph.states.includes(e.from) && graph.states.includes(e.to), `${key(e.from, e.to)} is between its states`);
    assert.notEqual(e.from, e.to, `${key(e.from, e.to)} is a stay, which the machine answers without an edge`);
    assert.deepEqual(stepMove(e.from, e.to), { kind: 'edge', event: e.event });
  }
  assert.deepEqual(stepMove('running', 'running'), { kind: 'stays' });
});

test('stepDiagram draws each edge of stepMachineGraph, from its initial state', () => {
  const lines = stepDiagram().split('\n');
  const graph = stepMachineGraph();
  assert.equal(lines[0], 'stateDiagram-v2');
  assert.equal(lines.length, 2 + graph.states.length + graph.edges.length + graph.final.length);
});
