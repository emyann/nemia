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
import { activityOf } from '../src/lib/atWork.ts';
import type { KeyForm } from '../src/lib/api/builder.ts';
import type { SkillPlace } from '../src/lib/api/skills.ts';
import {
  editedDayOf,
  historyOf,
  lastEndedOf,
  permissionsOf,
  plateOf,
  serverGroupsOf,
  skillGroupsOf,
  wordsOf,
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
    { step: 'review', added: ['git', 'look'], skillsFrom: [{ name: 'look', from: 'user', foundIn: '/skills/look' }], mcp: ['playwright'] },
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
    const groups = skillGroupsOf(given, steps, places);
    assert.deepEqual(
      groups.map((g) => [g.title, g.tiles.map((t) => t.name)]),
      [
        ['In its file', ['git']],
        ['From its review step', ['look']],
      ],
    );
    assert.equal(groups[1]?.tiles[0]?.description, 'Looks at a page.');
  });

  test('the servers group the same way, leaving out those the file names', () => {
    assert.deepEqual(
      serverGroupsOf('docs, playwright', steps).map((g) => [g.title, g.tiles.map((t) => t.name)]),
      [['In its file', ['docs', 'playwright']]],
    );
    assert.deepEqual(
      serverGroupsOf(null, steps).map((g) => [g.title, g.tiles.map((t) => t.name)]),
      [['From its review step', ['playwright']]],
    );
  });
});

describe("an agent page's small counts", () => {
  test('words are the runs of characters between spaces and lines', () => {
    assert.equal(wordsOf('one two\n\nthree   four\n'), 4);
    assert.equal(wordsOf(''), 0);
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

  test('every session of an agent is listed, the longest first, and another agent is left out', () => {
    const rows = [row('a', '1', 3), row('b', '9', 99), row('a', '2', 40)];
    const activity = activityOf(rows, 'a');
    assert.equal(activity.kind, 'many');
    assert.deepEqual(activity.kind === 'many' ? activity.rows.map((r) => r.run) : [], ['2', '1']);
    assert.equal(activityOf(rows, 'b').kind, 'one');
    assert.equal(activityOf(rows, 'c').kind, 'none');
  });
});
