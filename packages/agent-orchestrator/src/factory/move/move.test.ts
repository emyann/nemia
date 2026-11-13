/**
 * A factory moved to another store, pure, as tables: the factory's file rewritten for the target (`factoryOnTarget`), its file's text as
 * the export carries it (`fileTextOf`), its tree's wiring renamed (`folderOnTarget`), and a card that follows it (`cardMoved`). What the
 * target is given of each repository and volume is proved by its contract (`contracts/factory-move.contract.ts`), not tabled here.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import type { Factory } from '../factory.ts';
import type { TreeFile } from '../../archive/archive.ts';
import { parseInboxCard } from '../../inbox/inbox.ts';
import { cardMoved, factoryOnTarget, fileTextOf, folderOnTarget, volumeKey, type OnTarget } from './move.ts';

const SINCE = '2026-11-01T00:00:00.000Z';

/** A factory of the source's store on two repositories, one a clone of its origin, scheduled, wired and mounting two volumes. */
const SOURCE: Factory = {
  name: 'shop',
  repos: ['/src/clones/github.com/acme/shop', '/home/ann/notes'],
  workflows: ['build'],
  hires: { 'build/review': 'reviewer' },
  schedules: { build: { cron: '0 9 * * 1', brief: 'weekly', since: SINCE, repo: 'notes' } },
  origins: { '/src/clones/github.com/acme/shop': 'https://git.example/acme/shop.git' },
  workflowRepos: { build: 'notes' },
  volumes: [
    { path: '/home/ann/data', readOnly: true, name: 'data' },
    { path: '/home/ann/out', readOnly: false },
  ],
  harnessSettings: { model: 'big' },
  costLines: { build: 5 },
  revisions: 'follow',
  instruction: { path: 'docs/NEMIA.md' },
  generation: 7,
};

/** Where the target puts each: the clone under its own store, the notes typed as a folder of its own, a volume moved. */
const TARGET: OnTarget = {
  repos: { '/src/clones/github.com/acme/shop': '/dst/clones/github.com/acme/shop', '/home/ann/notes': '/srv/journal' },
  origins: { '/dst/clones/github.com/acme/shop': 'https://git.example/acme/shop.git' },
  volumes: { data: '/srv/data' },
  instructionKept: false,
};

test('factoryOnTarget: the factory as the target files it', async (t) => {
  await t.test('a templated one runs from the target’s tree, and its generation is gone, counted again by the door', () => {
    const template = { source: 'shop-template', version: '1.2.0', params: { team: 'ann' } };
    const moved = factoryOnTarget(
      { ...SOURCE, template, tree: '/src/factories/shop/tree' },
      { ...TARGET, tree: '/dst/factories/shop/tree' },
    );
    assert.equal(moved.tree, '/dst/factories/shop/tree');
    assert.equal('generation' in moved, false);
  });
  await t.test('a repository followed by its origin keeps its URL under the target’s clone folder', () => {
    const moved = factoryOnTarget(SOURCE, TARGET);
    assert.deepEqual(moved.repos, ['/dst/clones/github.com/acme/shop', '/srv/journal']);
    assert.deepEqual(moved.origins, { '/dst/clones/github.com/acme/shop': 'https://git.example/acme/shop.git' });
  });
  await t.test('a whole path typed enters its repositories with no origin', () => {
    const moved = factoryOnTarget(SOURCE, { ...TARGET, origins: {} });
    assert.equal(moved.repos.includes('/srv/journal'), true);
    assert.equal('origins' in moved, false);
  });
  await t.test('the workflows’ repositories and a schedule’s follow a repository whose folder name changed', () => {
    const moved = factoryOnTarget(SOURCE, TARGET);
    assert.deepEqual(moved.workflowRepos, { build: 'journal' });
    assert.equal(moved.schedules.build?.repo, 'journal');
  });
  await t.test('an instruction kept in the first folder stays there, under the folder the target gives it', () => {
    assert.deepEqual(factoryOnTarget(SOURCE, TARGET).instruction, { path: 'docs/NEMIA.md' });
  });
  await t.test('an instruction whose words the export carried, from a folder that does not follow, is kept in the target’s store', () => {
    assert.deepEqual(factoryOnTarget(SOURCE, { ...TARGET, instructionKept: true }).instruction, { store: true });
  });
  await t.test('a builtin template’s source is unchanged; a sent one’s is the place the target kept it at', () => {
    const builtin = { source: 'shop-template', version: '1.2.0', params: {} };
    assert.deepEqual(factoryOnTarget({ ...SOURCE, template: builtin }, { ...TARGET, template: 'shop-template' }).template, builtin);
    const sent = { source: '/src/templates/shop', version: '1.2.0', params: { team: 'ann' } };
    assert.deepEqual(
      factoryOnTarget({ ...SOURCE, template: sent }, { ...TARGET, template: '/dst/templates-sent/shop-ab12.tgz' }).template,
      {
        ...sent,
        source: '/dst/templates-sent/shop-ab12.tgz',
      },
    );
  });
  await t.test('volumes at their decided paths, their names and marks kept', () => {
    assert.deepEqual(factoryOnTarget(SOURCE, { ...TARGET, volumes: { data: '/srv/data', '/home/ann/out': '/srv/out' } }).volumes, [
      { path: '/srv/data', readOnly: true, name: 'data' },
      { path: '/srv/out', readOnly: false },
    ]);
  });
  await t.test('hires, workflows, schedules, cost lines, harness settings and revisions are carried as read', () => {
    const { hires, workflows, schedules, costLines, harnessSettings, revisions } = factoryOnTarget(SOURCE, TARGET);
    assert.deepEqual(
      { hires, workflows, cron: schedules.build?.cron, costLines, harnessSettings, revisions },
      {
        hires: SOURCE.hires,
        workflows: SOURCE.workflows,
        cron: '0 9 * * 1',
        costLines: SOURCE.costLines,
        harnessSettings: SOURCE.harnessSettings,
        revisions: 'follow',
      },
    );
  });
});

test('volumeKey: a volume by its name where it has one, else by its path on the source', async (t) => {
  await t.test('named', () => assert.equal(volumeKey({ path: '/a', name: 'data' }), 'data'));
  await t.test('unnamed', () => assert.equal(volumeKey({ path: '/a' }), '/a'));
});

test('fileTextOf: the factory as its file holds it, and no more', async (t) => {
  await t.test('a hand-made one: every key of its spec but its name', () => {
    const read = JSON.parse(fileTextOf(SOURCE)) as Record<string, unknown>;
    assert.equal('name' in read, false);
    assert.deepEqual(read.workflowRepos, { build: 'notes' });
  });
  await t.test('a templated one: no tree, nor the wiring its tree holds', () => {
    const template = { source: 'shop-template', version: '1.2.0', params: {} };
    const read = JSON.parse(fileTextOf({ ...SOURCE, template, tree: '/src/factories/shop/tree' })) as Record<string, unknown>;
    assert.deepEqual(
      ['tree', 'workflows', 'hires', 'revisions', 'workflowRepos'].filter((key) => key in read),
      [],
    );
    assert.deepEqual(read.template, template);
  });
});

/** A file of a folder holding `text`. */
const fileOf = (path: string, text: string): TreeFile => ({ path, mode: 0o644, bytes: new TextEncoder().encode(text) });

test('folderOnTarget: the folder as the target places it', async (t) => {
  await t.test('its tree’s wiring follows a repository whose folder name changed', () => {
    const files = folderOnTarget(
      [fileOf('tree/factory.json', JSON.stringify({ workflows: ['build'], hires: {}, workflowRepos: { build: 'notes' } }))],
      {
        renamed: { notes: 'journal' },
      },
    );
    assert.deepEqual(JSON.parse(new TextDecoder().decode(files[0]?.bytes)), {
      workflows: ['build'],
      hires: {},
      workflowRepos: { build: 'journal' },
    });
  });
  await t.test('an instruction’s words carried are the store’s file', () => {
    const files = folderOnTarget([fileOf('level.json', '{}\n')], { renamed: {}, instruction: 'Ship small.\n' });
    assert.deepEqual(
      files.map((f) => [f.path, new TextDecoder().decode(f.bytes)]),
      [
        ['level.json', '{}\n'],
        ['NEMIA.md', 'Ship small.\n'],
      ],
    );
  });
  await t.test('every other file as it was', () => {
    const files = [fileOf('tree/agents/a.md', 'notes\n'), fileOf('RULES.md', 'Be brief.\n')];
    assert.deepEqual(folderOnTarget(files, { renamed: { notes: 'journal' } }), files);
  });
});

test('cardMoved: a card that follows its factory', async (t) => {
  const card = [
    '---',
    'workflow: build',
    'repo: /home/ann/notes',
    'queued: 2026-11-02T10:00:00.000Z',
    'gate: review',
    'model: review=big',
    'factory: shop',
    'from: run-a1b2',
    'labels:',
    '  team: ann',
    '---',
    'Add a flag',
    '',
  ].join('\n');
  const moved = parseInboxCard('add-a-flag-c3d4.md', cardMoved(card, { name: 'add-a-flag-c3d4', factory: 'shop', from: 'laptop' }));
  await t.test('its repo:, from: and queued: are gone', () => {
    assert.deepEqual([moved.repo, moved.from, moved.queued], [undefined, undefined, undefined]);
  });
  await t.test('its workflow, gate, model, factory and labels are kept', () => {
    assert.deepEqual(
      { workflow: moved.workflow, gate: moved.gate, model: moved.model, factory: moved.factory, labels: moved.labels },
      { workflow: 'build', gate: 'review', model: { review: 'big' }, factory: 'shop', labels: { team: 'ann' } },
    );
  });
  await t.test('its body ends with the line that says where it came from, naming its old name', () => {
    const last = moved.body.trimEnd().split('\n').at(-1) ?? '';
    assert.equal(moved.body.startsWith('Add a flag'), true);
    assert.equal(last.includes('laptop') && last.includes('add-a-flag-c3d4') && last.includes('shop'), true);
  });
});
