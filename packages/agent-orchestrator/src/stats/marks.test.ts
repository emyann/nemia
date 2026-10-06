/**
 * The change marks (`frozenOf`, `marksOf`, `marks.ts`) and their way through the stats (`statsOf`) and its words (`statsLines`): an item is
 * marked on the later run's day where its digest is known in both runs and differs, in series by factory and workflow folder and by creation
 * time, never by a name or an order listed.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import type { StepAgent, Workflow } from '../step/step.ts';
import { dayOf, statsOf } from './stats.ts';
import { frozenOf, marksOf, type RunFrozen } from './marks.ts';
import { statsLines } from './stats-words.ts';

const NOW = new Date('2026-09-30T12:00:00.000Z');
const BUILD = '/a/workflows/build';
const SKILL = 'review-a-change';

/** A review step filled by `agent` (agora unless said), resolved as the parser resolves it: the agent's instructions before the step's own note. */
function review(
  more: { agent?: string; instructions?: string | null; note?: string; model?: string; skills?: string[]; added?: string[] } = {},
): Workflow {
  const instructions = more.instructions === undefined ? 'You are Agora.' : more.instructions;
  const note = more.note ?? 'Review it.';
  const own = more.skills ?? [SKILL];
  const added = more.added?.filter((skill) => !own.includes(skill));
  const agent: StepAgent = {
    name: more.agent ?? 'agora',
    keys: more.added ? ['skills'] : [],
    body: note,
    given: {},
    ...(instructions === null ? {} : { instructions }),
    skills: [...own, ...(added ?? [])],
    ...(added && { addedSkills: added }),
  };
  return {
    name: 'review',
    after: [],
    body: instructions === null ? note : `${instructions}\n\n${note}`,
    ...(more.model ? { model: more.model } : {}),
    ...(more.added ? { skills: more.added } : {}),
    agent,
  };
}

const implement: Workflow = { name: 'implement', after: [], body: 'Do it.' };

/** What run `run`, created at `at` in `dir`, froze of `steps`, its review's skill rendered at `version` (none where null). */
function frozen(run: string, at: string, steps: Workflow[], version: string | null = 'v1', dir = BUILD): RunFrozen {
  const head = {
    run,
    factory: 'default',
    workflow: path.basename(dir),
    repo: path.dirname(path.dirname(dir)),
    day: dayOf(at),
    at,
    workflowDir: dir,
  };
  return frozenOf(head, steps, new Map(version === null ? [] : [['review', new Map([[SKILL, version]])]]));
}

/** Each mark as `run kind name since`. */
const said = (runs: RunFrozen[]): string[] => marksOf(runs).map((m) => `${m.run} ${m.kind} ${m.name} since ${m.since}`);

/** `run` as a run of `factory`. */
const inFactory = (factory: string, run: RunFrozen): RunFrozen => ({ ...run, factory });

test('a skill whose rendered copy changed is marked once, on the later run, naming the run before it; the same copy is not', () => {
  const runs = [frozen('r1', '2026-09-10T08:00:00.000Z', [review()], 'v1'), frozen('r2', '2026-09-11T23:59:00.000Z', [review()], 'v2')];
  assert.deepEqual(marksOf(runs), [
    {
      run: 'r2',
      factory: 'default',
      workflow: 'build',
      repo: '/a',
      day: '2026-09-11',
      kind: 'skill',
      name: SKILL,
      steps: ['review'],
      agents: ['agora'],
      since: 'r1',
    },
  ]);
  assert.deepEqual(said([runs[0], frozen('r2', '2026-09-11T23:59:00.000Z', [review()], 'v1')]), []);
});

test('the run before is the one created last before, never the one listed or named last', () => {
  const runs = [
    frozen('a', '2026-09-12T08:00:00.000Z', [review()], 'v2'),
    frozen('c', '2026-09-10T08:00:00.000Z', [review()], 'v1'),
    frozen('b', '2026-09-11T08:00:00.000Z', [review()], 'v2'),
  ];
  assert.deepEqual(said(runs), [`b skill ${SKILL} since c`]);
});

test('runs are compared within their workflow folder as recorded, never across two folders of the same name', () => {
  const one = frozen('r1', '2026-09-10T08:00:00.000Z', [review()], 'v1', '/a/workflows/build');
  assert.deepEqual(said([one, frozen('r2', '2026-09-11T08:00:00.000Z', [review()], 'v2', '/b/workflows/build')]), []);
  assert.deepEqual(said([one, frozen('r2', '2026-09-11T08:00:00.000Z', [review()], 'v2', '/a/workflows/build')]), [
    `r2 skill ${SKILL} since r1`,
  ]);
});

test('two factories that hire different agents into one step of one folder mark nothing as their runs alternate', () => {
  const at = (day: number) => `2026-09-${day}T08:00:00.000Z`;
  const runs = [
    frozen('r1', at(10), [review()]),
    inFactory('pipao', frozen('r2', at(11), [review({ agent: 'ada' })])),
    frozen('r3', at(12), [review()]),
    inFactory('pipao', frozen('r4', at(13), [review({ agent: 'ada' })])),
  ];
  assert.deepEqual(said(runs), []);
});

test("a hire changed within one factory is marked once, since that factory's run before, never another factory's", () => {
  const at = (day: number) => `2026-09-${day}T08:00:00.000Z`;
  const runs = [
    inFactory('pipao', frozen('r1', at(10), [review()])),
    frozen('r2', at(11), [review()]),
    inFactory('pipao', frozen('r3', at(12), [review({ agent: 'ada' })])),
    inFactory('pipao', frozen('r4', at(13), [review({ agent: 'ada' })])),
  ];
  assert.deepEqual(said(runs), ['r3 step review since r1']);
});

test('an item unknown in the run before is not marked, even where an older run knew another digest', () => {
  const runs = [
    frozen('r1', '2026-09-10T08:00:00.000Z', [review()], 'v1'),
    frozen('r2', '2026-09-11T08:00:00.000Z', [review()], null),
    frozen('r3', '2026-09-12T08:00:00.000Z', [review()], 'v2'),
  ];
  assert.deepEqual(said(runs), [], 'the rendered copy of r2 is gone: nothing says what r3 changed');
});

test('an agent whose record carries no instructions is unknown, and a first appearance has nothing to compare with', () => {
  const [agent] = frozen('r1', '2026-09-10T08:00:00.000Z', [review({ instructions: null })]).items.filter((i) => i.kind === 'agent');
  assert.equal(agent.digest, null);
  const runs = [
    frozen('r1', '2026-09-10T08:00:00.000Z', [review({ instructions: null })]),
    frozen('r2', '2026-09-11T08:00:00.000Z', [review({ instructions: 'You are Agora.' })]),
    frozen('r3', '2026-09-12T08:00:00.000Z', [review({ instructions: 'You are Agora, again.' })]),
  ];
  assert.deepEqual(said(runs), ['r3 agent agora since r2']);
  const grown = [
    frozen('r1', '2026-09-10T08:00:00.000Z', [implement], null),
    frozen('r2', '2026-09-11T08:00:00.000Z', [implement, review()]),
  ];
  assert.deepEqual(said(grown), [], 'the review, agora and the skill appear in r2: no mark');
});

test("a step is marked for its own note and keys, its agent for its instructions: neither for the other's", () => {
  const at = (day: number) => `2026-09-${day}T08:00:00.000Z`;
  assert.deepEqual(said([frozen('r1', at(10), [review()]), frozen('r2', at(11), [review({ instructions: 'You are Agora, again.' })])]), [
    'r2 agent agora since r1',
  ]);
  assert.deepEqual(said([frozen('r1', at(10), [review()]), frozen('r2', at(11), [review({ note: 'Review it twice.' })])]), [
    'r2 step review since r1',
  ]);
  assert.deepEqual(said([frozen('r1', at(10), [review({ model: 'a' })]), frozen('r2', at(11), [review({ model: 'b' })])]), [
    'r2 step review since r1',
  ]);
});

test("a skill the step's own line adds is the step's: it marks the step, never its agent, whose own skills still mark it", () => {
  const at = (day: number) => `2026-09-${day}T08:00:00.000Z`;
  const runs = [frozen('r1', at(10), [review()]), frozen('r2', at(11), [review({ added: [SKILL, 'extra'] })])];
  assert.deepEqual(said(runs), ['r2 step review since r1']);
  const extra = runs[1].items.find((i) => i.kind === 'skill' && i.name === 'extra');
  assert.deepEqual(extra && { steps: extra.steps, agents: extra.agents }, { steps: ['review'], agents: [] });
  const own = runs[1].items.find((i) => i.kind === 'skill' && i.name === SKILL);
  assert.deepEqual(own?.agents, ['agora'], "a skill the step names that its agent has is the agent's");
  assert.deepEqual(said([frozen('r1', at(10), [review()]), frozen('r2', at(11), [review({ skills: [SKILL, 'extra'] })])]), [
    'r2 agent agora since r1',
  ]);
});

test('an agent that fills two steps is one item, and a skill two steps give is one item, with every step it belongs to', () => {
  const second: Workflow = { ...review(), name: 'second' };
  const { items } = frozenOf(
    { run: 'r1', factory: 'default', workflow: 'build', repo: '/a', day: '2026-09-10', at: '2026-09-10T08:00:00.000Z', workflowDir: BUILD },
    [review(), second],
    new Map([['second', new Map([[SKILL, 'v1']])]]),
  );
  assert.deepEqual(
    items.map((i) => [i.kind, i.name, i.digest === null ? null : 'known', i.steps]),
    [
      ['step', 'review', 'known', ['review']],
      ['agent', 'agora', 'known', ['review', 'second']],
      ['skill', SKILL, 'known', ['review', 'second']],
      ['step', 'second', 'known', ['second']],
    ],
  );
});

/** Two runs of build in the default factory, agora's skill changed by the second, and between them a run of another factory, listed last. */
const history = (): RunFrozen[] => [
  frozen('r1', '2026-09-10T08:00:00.000Z', [implement, review()], 'v1'),
  frozen('r2', '2026-09-20T08:00:00.000Z', [implement, review()], 'v2'),
  inFactory('other', frozen('o1', '2026-09-15T08:00:00.000Z', [implement, review()], 'v2')),
];

test('stats mark a run in their days against a run before them, filtered and grouped as the facts are', () => {
  const facts = { tries: [], runs: [], frozen: history() };
  const range = statsOf(facts, { from: '2026-09-15', factory: 'default' }, NOW);
  assert.deepEqual(
    range.all.marks.map((m) => [m.day, m.run, m.since]),
    [['2026-09-20', 'r2', 'r1']],
    'r1 is before --from and is still what r2 is compared with; o1, of another factory and between them, is not',
  );
  assert.deepEqual(statsOf(facts, { to: '2026-09-19' }, NOW).all.marks, [], 'a mark after --to is left out');
  assert.equal(statsOf(facts, { step: 'review' }, NOW).all.marks.length, 1, 'the skill is given by review');
  assert.equal(statsOf(facts, { step: 'implement' }, NOW).all.marks.length, 0);
  const byAgent = statsOf(facts, { by: 'agent' }, NOW);
  assert.deepEqual(
    byAgent.groups.map((g) => [g.key, g.marks.length]),
    [['agora', 1]],
  );
  assert.equal(statsOf(facts, {}, NOW).from, '2026-09-20', 'with no fact, the first mark is the first day');
});

test('nemia stats in words prints a changed row per mark, and nothing where there is none', () => {
  const lines = statsLines(statsOf({ tries: [], runs: [], frozen: history() }, {}, NOW));
  assert.match(lines.join('\n'), /^day\s+changed\s+run\s+since$/m);
  assert.match(lines.join('\n'), new RegExp(`^2026-09-20\\s+skill ${SKILL}\\s+r2\\s+r1$`, 'm'));
  const none = statsLines(statsOf({ tries: [], runs: [], frozen: history().slice(1) }, {}, NOW));
  assert.doesNotMatch(none.join('\n'), /changed/);
});
