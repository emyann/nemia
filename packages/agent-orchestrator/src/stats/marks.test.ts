/**
 * The change marks (`frozenOf`, `marksOf`, `marks.ts`) and their way through the stats (`statsOf`), as one table: an item is marked on
 * the later run's day where its digest is known in both runs and differs, in series by factory and workflow folder and by creation
 * time, never by a name or an order listed. That a change is marked once, on the later run, and that `nemia stats` prints it as a
 * changed row, is the story "A change is marked once" of `test/stats.test.ts`.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import type { StepAgent, Workflow } from '../step/step.ts';
import { dayOf, statsOf } from './stats.ts';
import { frozenOf, marksOf, type RunFrozen } from './marks.ts';

const NOW = new Date('2026-09-30T12:00:00.000Z');
const BUILD = '/a/workflows/dev';
const SKILL = 'review-a-change';

/** A review step filled by reviewer, or the agent `more` names, as the parser resolves it: its instructions before the step's own note. */
function review(
  more: { agent?: string; instructions?: string | null; note?: string; model?: string; skills?: string[]; added?: string[] } = {},
): Workflow {
  const instructions = more.instructions === undefined ? 'You are Reviewer.' : more.instructions;
  const note = more.note ?? 'Review it.';
  const own = more.skills ?? [SKILL];
  const added = more.added?.filter((skill) => !own.includes(skill));
  const agent: StepAgent = {
    name: more.agent ?? 'reviewer',
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

/** A morning of September 2026. */
const at = (day: number) => `2026-09-${day}T08:00:00.000Z`;

/** Two runs of build in the default factory, reviewer's skill changed by the second, and between them one of another factory, listed last. */
const history = (): RunFrozen[] => [
  frozen('r1', '2026-09-10T08:00:00.000Z', [implement, review()], 'v1'),
  frozen('r2', '2026-09-20T08:00:00.000Z', [implement, review()], 'v2'),
  inFactory('other', frozen('o1', '2026-09-15T08:00:00.000Z', [implement, review()], 'v2')),
];

/** A row: what the runs froze, and each mark `marksOf` gives them, as `said` says it. */
type MarkRow = { name: string; runs: () => RunFrozen[]; marks: string[] };

const MARKS: MarkRow[] = [
  {
    name: 'a skill whose rendered copy changed is marked on the later run, naming the run before it',
    runs: () => [frozen('r1', '2026-09-10T08:00:00.000Z', [review()], 'v1'), frozen('r2', '2026-09-11T23:59:00.000Z', [review()], 'v2')],
    marks: [`r2 skill ${SKILL} since r1`],
  },
  {
    name: 'the same copy is not marked',
    runs: () => [frozen('r1', '2026-09-10T08:00:00.000Z', [review()], 'v1'), frozen('r2', '2026-09-11T23:59:00.000Z', [review()], 'v1')],
    marks: [],
  },
  {
    name: 'the run before is the one created last before, never the one listed or named last',
    runs: () => [
      frozen('a', '2026-09-12T08:00:00.000Z', [review()], 'v2'),
      frozen('c', '2026-09-10T08:00:00.000Z', [review()], 'v1'),
      frozen('b', '2026-09-11T08:00:00.000Z', [review()], 'v2'),
    ],
    marks: [`b skill ${SKILL} since c`],
  },
  {
    name: 'runs are compared within their workflow folder as recorded, never across two folders of the same name',
    runs: () => [frozen('r1', at(10), [review()], 'v1', '/a/workflows/dev'), frozen('r2', at(11), [review()], 'v2', '/b/workflows/dev')],
    marks: [],
  },
  {
    name: 'two runs of the one folder as recorded are compared',
    runs: () => [frozen('r1', at(10), [review()], 'v1', '/a/workflows/dev'), frozen('r2', at(11), [review()], 'v2', '/a/workflows/dev')],
    marks: [`r2 skill ${SKILL} since r1`],
  },
  {
    name: 'two factories that hire different agents into one step of one folder mark nothing as their runs alternate',
    runs: () => [
      frozen('r1', at(10), [review()]),
      inFactory('pipao', frozen('r2', at(11), [review({ agent: 'implementer' })])),
      frozen('r3', at(12), [review()]),
      inFactory('pipao', frozen('r4', at(13), [review({ agent: 'implementer' })])),
    ],
    marks: [],
  },
  {
    name: "a hire changed within one factory is marked once, since that factory's run before, never another factory's",
    runs: () => [
      inFactory('pipao', frozen('r1', at(10), [review()])),
      frozen('r2', at(11), [review()]),
      inFactory('pipao', frozen('r3', at(12), [review({ agent: 'implementer' })])),
      inFactory('pipao', frozen('r4', at(13), [review({ agent: 'implementer' })])),
    ],
    marks: ['r3 step review since r1'],
  },
  {
    name: 'an item unknown in the run before is not marked, even where an older run knew another digest',
    runs: () => [frozen('r1', at(10), [review()], 'v1'), frozen('r2', at(11), [review()], null), frozen('r3', at(12), [review()], 'v2')],
    marks: [],
  },
  {
    name: 'an agent whose record carries no instructions is unknown: its next instructions are compared from the run after',
    runs: () => [
      frozen('r1', at(10), [review({ instructions: null })]),
      frozen('r2', at(11), [review({ instructions: 'You are Reviewer.' })]),
      frozen('r3', at(12), [review({ instructions: 'You are Reviewer, again.' })]),
    ],
    marks: ['r3 agent reviewer since r2'],
  },
  {
    name: 'a first appearance has nothing to compare with: the review, reviewer and the skill appear in r2',
    runs: () => [frozen('r1', at(10), [implement], null), frozen('r2', at(11), [implement, review()])],
    marks: [],
  },
  {
    name: 'an agent is marked for its instructions, never its step',
    runs: () => [frozen('r1', at(10), [review()]), frozen('r2', at(11), [review({ instructions: 'You are Reviewer, again.' })])],
    marks: ['r2 agent reviewer since r1'],
  },
  {
    name: 'a step is marked for its own note, never its agent',
    runs: () => [frozen('r1', at(10), [review()]), frozen('r2', at(11), [review({ note: 'Review it twice.' })])],
    marks: ['r2 step review since r1'],
  },
  {
    name: 'a step is marked for its own keys',
    runs: () => [frozen('r1', at(10), [review({ model: 'a' })]), frozen('r2', at(11), [review({ model: 'b' })])],
    marks: ['r2 step review since r1'],
  },
  {
    name: "a skill the step's own line adds is the step's: it marks the step, never its agent",
    runs: () => [frozen('r1', at(10), [review()]), frozen('r2', at(11), [review({ added: [SKILL, 'extra'] })])],
    marks: ['r2 step review since r1'],
  },
  {
    name: "the agent's own skills still mark it",
    runs: () => [frozen('r1', at(10), [review()]), frozen('r2', at(11), [review({ skills: [SKILL, 'extra'] })])],
    marks: ['r2 agent reviewer since r1'],
  },
];

/** A row read off one run's items (`frozenOf`), or off the stats of a history (`statsOf`). */
const ITEMS: Array<{ name: string; check: () => void }> = [
  {
    name: 'an agent whose record carries no instructions has no digest',
    check: () => {
      const [agent] = frozen('r1', at(10), [review({ instructions: null })]).items.filter((i) => i.kind === 'agent');
      assert.equal(agent.digest, null);
    },
  },
  {
    name: "a skill the step's line adds belongs to the step and to no agent; one its agent has is the agent's",
    check: () => {
      const { items } = frozen('r2', at(11), [review({ added: [SKILL, 'extra'] })]);
      const extra = items.find((i) => i.kind === 'skill' && i.name === 'extra');
      assert.deepEqual(extra && { steps: extra.steps, agents: extra.agents }, { steps: ['review'], agents: [] });
      assert.deepEqual(items.find((i) => i.kind === 'skill' && i.name === SKILL)?.agents, ['reviewer']);
    },
  },
  {
    name: 'an agent that fills two steps is one item, and a skill two steps give is one item, with every step it belongs to',
    check: () => {
      const second: Workflow = { ...review(), name: 'second' };
      const { items } = frozenOf(
        { run: 'r1', factory: 'default', workflow: 'dev', repo: '/a', day: '2026-09-10', at: at(10), workflowDir: BUILD },
        [review(), second],
        new Map([['second', new Map([[SKILL, 'v1']])]]),
      );
      assert.deepEqual(
        items.map((i) => [i.kind, i.name, i.digest === null ? null : 'known', i.steps]),
        [
          ['step', 'review', 'known', ['review']],
          ['agent', 'reviewer', 'known', ['review', 'second']],
          ['skill', SKILL, 'known', ['review', 'second']],
          ['step', 'second', 'known', ['second']],
        ],
      );
    },
  },
  {
    name: 'stats compare a run in their days with one before --from, never one of another factory between them',
    check: () =>
      assert.deepEqual(
        statsOf({ tries: [], runs: [], frozen: history() }, { from: '2026-09-15', factory: 'default' }, NOW).all.marks.map((m) => [
          m.day,
          m.run,
          m.since,
        ]),
        [['2026-09-20', 'r2', 'r1']],
      ),
  },
  {
    name: 'a mark after --to is left out',
    check: () => assert.deepEqual(statsOf({ tries: [], runs: [], frozen: history() }, { to: '2026-09-19' }, NOW).all.marks, []),
  },
  {
    name: 'a mark is filtered by the steps it belongs to: the skill is given by review, not implement',
    check: () => {
      const facts = { tries: [], runs: [], frozen: history() };
      assert.equal(statsOf(facts, { step: 'review' }, NOW).all.marks.length, 1);
      assert.equal(statsOf(facts, { step: 'implement' }, NOW).all.marks.length, 0);
    },
  },
  {
    name: 'a mark is grouped by the agents it belongs to',
    check: () =>
      assert.deepEqual(
        statsOf({ tries: [], runs: [], frozen: history() }, { by: 'agent' }, NOW).groups.map((g) => [g.key, g.marks.length]),
        [['reviewer', 1]],
      ),
  },
  {
    name: 'with no fact, the first mark is the first day',
    check: () => assert.equal(statsOf({ tries: [], runs: [], frozen: history() }, {}, NOW).from, '2026-09-20'),
  },
];

test('`marksOf` and `frozenOf`: what a run froze, and each change marked against the run before it in its factory and folder', async (t) => {
  for (const row of MARKS) await t.test(row.name, () => assert.deepEqual(said(row.runs()), row.marks));
  for (const row of ITEMS) await t.test(row.name, row.check);
});
