/**
 * The words and groupings of a factory agent's page (src/lib/agentPage.ts) and the order of the steps at work (src/lib/longestFirst.ts):
 * the plate's rows, the permission counts, the history merged per day, the skills and servers by where they come from, and what the
 * contract of `activityOf` assumes of the sort, held on real rows.
 */
import { describe, test } from 'vitest';
import assert from 'node:assert/strict';
import { brokenOn } from '@emyann/tsverify';
import type { HarnessModels } from 'objects';
import { longestFirstOf, type AtWorkRow } from '../contracts/agent-activity.contract.ts';
import type { KeyForm } from '../src/lib/api/builder.ts';
import type { SkillPlace } from '../src/lib/api/skills.ts';
import type { SkillSource } from '../src/lib/api/library.ts';
import {
  editedDayOf,
  historyOf,
  lastEndedOf,
  permissionsOf,
  modelWords,
  plateOf,
  serversOf,
  skillGroupsOf,
  whereOf,
  wordsOf,
  workflowsSelector,
  type Mark,
  type StepGives,
} from '../src/lib/agentPage.ts';
import { atWorkSince, givenAgent, summary } from './run.fixture.ts';

const field = (key: string, meaning: string, choices: string[] | null = null) => ({ key, meaning, kind: 'text', choices, byHarness: null });

const keyForm = {
  keys: [
    field('harness', 'Which harness runs it.'),
    field('model', 'Which model.'),
    field('effort', 'How hard it thinks.', ['low', 'medium', 'high']),
    field('permissionMode', 'How it asks.'),
    field('context', 'How much it holds.'),
  ],
  defaultHarness: 'claude',
  roleKeys: [],
  policyKeys: [],
  agents: {},
  remote: { prefix: 'a2a:', refuses: [] },
} as unknown as KeyForm;

const models: HarnessModels = {
  harnesses: [
    {
      harness: 'claude',
      at: '2026-11-27T00:00:00Z',
      models: [{ id: 'claude-opus-5-5', aliases: [], name: 'Opus 5.5', keepsAuto: null, efforts: ['low', 'medium', 'high', 'xhigh'] }],
    },
  ],
};

const row = (agent: string, run: string, minutes: number) =>
  ({
    agent,
    run,
    title: run,
    workflow: 'build',
    step: 'review',
    try: 1,
    round: 1,
    minutes,
  }) satisfies AtWorkRow;

describe("an agent page's plate and permissions", () => {
  test("the model is the list's name with its exact id as the note, and the effort fills its pips through the effort", () => {
    const [, model, effort] = plateOf({ model: 'claude-opus-5-5', effort: 'high' }, keyForm, models);
    assert.equal(model?.value, 'Opus 5.5');
    assert.equal(model?.note, 'claude-opus-5-5');
    assert.deepEqual(effort?.pips, { total: 4, filled: 3 });
  });

  test("the model's name says its version where the harness's name does not, the name alone where it says more", () => {
    assert.equal(modelWords('claude-opus-5-5', 'Opus'), 'Opus 5.5');
    assert.equal(modelWords('claude-sonnet-5-5', 'Default (recommended)'), 'Default (recommended)');
    assert.equal(modelWords('gpt-x', 'Pro'), 'Pro');
    assert.equal(modelWords('unlisted', undefined), 'unlisted');
  });

  test('each note the board has is one short line in plain words', () => {
    const rows = plateOf({ model: 'claude-opus-5-5', effort: 'high', context: '400k' }, keyForm, models);
    assert.deepEqual(
      rows.map((r) => r.note),
      [null, 'claude-opus-5-5', 'How hard it thinks per turn', null, 'Its context window, in tokens'],
    );
  });

  test("a model the harness does not list reads as its id, and the effort key's choices give the pips where the model lists none", () => {
    const [, model, effort] = plateOf({ model: 'unlisted', effort: 'medium' }, keyForm, undefined);
    assert.equal(model?.value, 'unlisted');
    assert.deepEqual(effort?.pips, { total: 3, filled: 2 });
  });

  test('the permissions count each line as the skills line is counted', () => {
    assert.deepEqual(
      permissionsOf({ tools: 'Read, Grep,', allowedTools: 'Bash(git *)' }).map((p) => p.count),
      [2, 1, 0],
    );
  });
});

describe("an agent page's history", () => {
  const marks: Mark[] = [
    { day: '2026-11-26', kind: 'agent', name: 'reviewer' },
    { day: '2026-11-27', kind: 'step', name: 'review' },
    { day: '2026-11-27', kind: 'step', name: 'review' },
    { day: '2026-11-27', kind: 'skill', name: 'git' },
  ];

  test('two marks of one day, kind and name are one sentence, the newest day first, in plain words', () => {
    assert.deepEqual(
      historyOf(marks).map((h) => [h.day, h.sentence]),
      [
        ['27 Nov', 'The review step was edited'],
        ['27 Nov', 'Skill git was edited'],
        ['26 Nov', 'Its file was edited'],
      ],
    );
  });

  test('the edited day is the newest mark of its file, null with none', () => {
    assert.equal(editedDayOf(marks), '26 Nov');
    assert.equal(editedDayOf([]), null);
  });
});

describe("an agent page's skills and servers", () => {
  const given = [
    {
      name: 'git',
      from: 'repo',
      foundIn: null,
      entry: { id: 'git', name: 'git', description: 'Reads the repository.', tags: [] },
      error: null,
      preload: false,
      cost: null,
    },
  ] satisfies Parameters<typeof skillGroupsOf>[0];
  const steps: StepGives[] = [
    {
      step: 'review',
      added: ['git', 'look'],
      skillsFrom: [{ name: 'look', from: 'user', foundIn: '/skills/look', description: null }],
      mcp: ['playwright'],
    },
    { step: 'review', added: ['look'], skillsFrom: [], mcp: ['playwright'] },
  ];
  const places: SkillPlace[] = [
    {
      from: 'user',
      dir: null,
      skills: [
        {
          name: 'look',
          from: 'user',
          dir: '/skills/look',
          entry: { id: 'look', name: 'look', description: 'Looks at a page.', tags: [] },
          error: null,
          preload: false,
          cost: null,
          usedBy: [],
          found: null,
        },
      ],
    },
  ];

  test("the file's skills come first and a step's add only those the file does not give, one group for a step name across workflows", () => {
    const groups = skillGroupsOf(given, steps, places, 'acme');
    assert.deepEqual(
      groups.map((g) => [g.title, g.tiles.map((t) => t.name)]),
      [
        ['In its file · 1', ['git']],
        ['From its review step · 1', ['look']],
      ],
    );
    assert.equal(groups[1]?.tiles[0]?.description, 'Looks at a page.');
  });

  test('the servers are each said with where they come from, a step adding only those the file does not name', () => {
    assert.deepEqual(
      serversOf('docs, playwright', steps).map((t) => [t.name, t.where]),
      [
        ['docs', 'In its file'],
        ['playwright', 'In its file'],
      ],
    );
    assert.deepEqual(
      serversOf(null, steps).map((t) => [t.name, t.where]),
      [['playwright', 'From its review step']],
    );
  });
});

describe('where a skill on an agent page comes from', () => {
  const skill = (name: string, from: SkillSource | null, foundIn: string | null) =>
    ({ name, from, foundIn, entry: null, error: null, preload: false, cost: null }) satisfies Parameters<typeof skillGroupsOf>[0][number];
  const tiles = (given: Parameters<typeof skillGroupsOf>[0]) =>
    skillGroupsOf(given, [], [], 'nemia').flatMap((g) => g.tiles.map((t) => [t.name, t.where]));

  test("the skill of Nemia's builtin place is built into Nemia", () => {
    assert.deepEqual(tiles([skill('git', 'builtin', null)]), [['git', 'Built into Nemia']]);
  });

  test('a skill named with its folder is shown by its own name, from the repository and that folder of skills', () => {
    assert.deepEqual(tiles([skill('apps/web:ds-build', null, 'apps/web/.claude/skills/ds-build')]), [
      ['ds-build', 'From the repository, apps/web/.claude/skills'],
    ]);
  });

  test("a skill of the repository's own place says that folder of skills", () => {
    assert.deepEqual(tiles([skill('shadcn', 'repo', '.claude/skills/shadcn')]), [['shadcn', 'From the repository, .claude/skills']]);
  });

  test("a skill of the factory's own is the factory's, by its name", () => {
    assert.deepEqual(tiles([skill('review-a-change', 'factory', null)]), [['review-a-change', 'Factory nemia']]);
  });

  test("a step's skill is said the same way, and one found nowhere says so", () => {
    const step: StepGives = {
      step: 'review',
      added: ['apps/web:ds-spec', 'gone'],
      skillsFrom: [
        { name: 'apps/web:ds-spec', from: null, foundIn: 'apps/web/.claude/skills/ds-spec', description: 'Reads the spec.' },
        { name: 'gone', from: null, foundIn: null, description: null },
      ],
      mcp: [],
    };
    assert.deepEqual(
      skillGroupsOf([], [step], [], 'nemia').flatMap((g) => g.tiles.map((t) => [t.name, t.where])),
      [
        ['ds-spec', 'From the repository, apps/web/.claude/skills'],
        ['gone', 'Not found'],
      ],
    );
    assert.deepEqual(
      skillGroupsOf([], [step], [], 'nemia').flatMap((g) => g.tiles.map((t) => t.description)),
      ['Reads the spec.', null],
      'a skill no library lists says what it is for as the step page serves it',
    );
    assert.equal(whereOf('user', null, 'nemia'), 'From your library');
  });
});

describe("an agent page's small counts", () => {
  test('words are the runs of characters between spaces and lines', () => {
    assert.equal(wordsOf('one two\n\nthree   four\n'), 4);
    assert.equal(wordsOf(''), 0);
  });

  test('the finished runs read for its last session are those of the workflows it is in, once each', () => {
    const fill = (workflow: string) => ({ from: 'factory' as const, workflow, step: 'review', hired: true });
    assert.equal(workflowsSelector({ usedBy: [], fills: [fill('quick'), fill('build'), fill('quick')] }), 'workflow in (build,quick)');
    assert.equal(workflowsSelector({ usedBy: [], fills: [] }), undefined);
  });

  test('the last session ended is the latest end of a step given to the agent, null with none', () => {
    const at = '2026-11-27T10:00:00.000Z';
    const [open] = atWorkSince(at);
    const run = summary([['review', 'running']], { id: 'r1' });
    const step = { ...run.steps[0], spec: givenAgent('reviewer'), timeline: [{ ...open, session: { ...open.session, endedAt: at } }] };
    assert.equal(lastEndedOf([{ ...run, steps: [step] }], 'reviewer'), Date.parse(at));
    assert.equal(lastEndedOf([{ ...run, steps: [step] }], 'other'), null);
  });
});

describe('what the contract of an activity assumes of the sort', () => {
  test('the real sort keeps each row and puts the longest first', () => {
    const rows = [row('a', '1', 3), row('a', '2', 40), row('a', '3', 3), row('a', '4', 0)];
    assert.deepEqual(
      brokenOn(longestFirstOf, [[rows]]).map((broken) => broken.law),
      [],
    );
  });
});
