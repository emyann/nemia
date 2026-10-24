/**
 * A factory's name, its refusals and what `nemia factory ls` says of the store's factories — pure, as tables: one test per function,
 * its rows subtests. A refusal row asserts that it refused and the facts its words name (the factory, the step, the flag or command of
 * its fix), never its sentence. Which factories hold a folder is kept as three focused tests.
 *
 * The store and a person's walk through it are in `factory.store.test.ts` and `test/factory-start.test.ts`.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import type { ScheduleListed } from '../schedule/schedule.ts';
import { names } from '../../test/assessed.ts';
import {
  ambiguousFactoryRefusal,
  DEFAULT_FACTORY,
  defaultFactoryRefusal,
  defaultStartRefusal,
  factoriesHolding,
  factoryLines,
  factoryNameRefusal,
  factoryRepo,
  fillsOf,
  hireRefusal,
  hireRefusalOf,
  instructionAt,
  instructionPathRefusal,
  noFactoryLine,
  noFactoryRefusal,
  outsideRefusal,
  unattachedHireRefusal,
  unattachedRefusal,
  unfilledRefusal,
  workflowNameRefusal,
} from './factory.ts';

/** A factory on `repos`, attaching and hiring nothing. */
const on = (name: string, ...repos: string[]) => ({ name, repos, workflows: [], hires: {}, schedules: {} });

const DEFAULT_LINE = 'default  every run and card that names no factory — read, never written';

test('factoryNameRefusal: a lowercase slug of up to 40 characters names a factory', async (t) => {
  for (const name of ['Nemia', 'a/b', '.x', '-x', '..', '../x', 'a b', 'é', 'a'.repeat(41)])
    await t.test(`REFUSED: ${JSON.stringify(name).slice(0, 14)}`, () => names(factoryNameRefusal(name), `\`${name}\``));
  await t.test('REFUSED: one not lowercase, naming the lowercase', () => names(factoryNameRefusal('Nemia'), 'nemia'));
  await t.test('REFUSED: one that climbs, naming names that are', () => names(factoryNameRefusal('a/b'), 'pipao', 'nemia-2'));
  await t.test('REFUSED: an empty one, saying so', () => names(factoryNameRefusal(''), 'empty'));
});

test("workflowNameRefusal: a workflow's name is no path, hidden, nor the agents' or the skills' folder", async (t) => {
  for (const name of ['', '.git', 'a/b', 'a\\b', 'agents', 'skills'])
    await t.test(`REFUSED: ${JSON.stringify(name)}`, () => names(workflowNameRefusal(name), name));
  await t.test('REFUSED: skills, naming the folder it is', () => names(workflowNameRefusal('skills'), 'skills/'));
  for (const name of ['build', 'intake', 'dev-planned'])
    await t.test(`taken: ${name}`, () => assert.equal(workflowNameRefusal(name), undefined));
});

test('hireRefusal: a hire names an agent into <workflow>/<step>', async (t) => {
  for (const step of ['build', 'build/a/b', 'build/.x', '/x', 'build/', '.git/x', 'agents/x', 'skills/x', 'build/README'])
    await t.test(`REFUSED: --step ${step}`, () => names(hireRefusal(step, 'ada'), `--step ${step}`));
  await t.test('REFUSED: a step under agents/, naming the folder', () => names(hireRefusal('agents/x', 'ada'), 'agents/'));
  await t.test('REFUSED: a hidden step, naming it', () => names(hireRefusal('build/.x', 'ada'), '`.x`'));
  await t.test('REFUSED: a hidden workflow, naming it', () => names(hireRefusal('.git/x', 'ada'), '--step .git/x', '`.git`'));
  for (const agent of ['', 'a/b', '.ada', 'a b'])
    await t.test(`REFUSED: the agent ${JSON.stringify(agent)}`, () => names(hireRefusal('build/implement', agent), `\`${agent}\``));
  for (const [step, agent] of [
    ['build/implement', 'ada'],
    ['intake/frame-the-idea', 'iris-2'],
  ])
    await t.test(`taken: ${agent} into ${step}`, () => assert.equal(hireRefusal(step, agent), undefined));
});

test('defaultFactoryRefusal: the default factory is read, never written, so no verb that writes a factory takes it', async (t) => {
  await t.test('its name is default', () => assert.equal(DEFAULT_FACTORY, 'default'));
  for (const verb of ['add', 'rm', 'hire', 'fire', 'attach', 'detach', 'instruction', 'instruct'] as const)
    await t.test(`REFUSED: nemia factory ${verb}`, () => names(defaultFactoryRefusal(verb), '`default`', `nemia factory ${verb}`));
});

test('hireRefusalOf: refused for the default factory first, then a workflow not offered, then a step whose file names its agent', async (t) => {
  const pipao = { name: 'pipao', workflows: ['build'] };
  await t.test('REFUSED: no factory named is the default', () =>
    assert.equal(hireRefusalOf(undefined, 'build', null), defaultFactoryRefusal('hire')),
  );
  await t.test('REFUSED: the default named', () =>
    assert.equal(hireRefusalOf({ name: DEFAULT_FACTORY, workflows: ['build'] }, 'build', null), defaultFactoryRefusal('hire')),
  );
  await t.test('REFUSED: the default first, whatever else', () =>
    assert.equal(hireRefusalOf({ name: DEFAULT_FACTORY, workflows: [] }, 'build', 'ada'), defaultFactoryRefusal('hire')),
  );
  await t.test('REFUSED: a workflow it does not offer, naming the attach', () => {
    assert.equal(hireRefusalOf(pipao, 'intake', null), unattachedHireRefusal('pipao', 'intake'));
    names(unattachedHireRefusal('pipao', 'intake'), 'pipao', 'intake', 'nemia factory attach pipao intake');
  });
  await t.test('REFUSED: a workflow not offered before the step naming its agent', () =>
    assert.equal(hireRefusalOf({ name: 'pipao', workflows: [] }, 'build', 'ada'), unattachedHireRefusal('pipao', 'build')),
  );
  await t.test('REFUSED: a step whose own file names its agent, naming the line to delete', () =>
    names(hireRefusalOf(pipao, 'build', 'ada'), '`agent: ada`', '`agent:`'),
  );
  await t.test('taken: a step of a workflow it offers, naming no agent', () => assert.equal(hireRefusalOf(pipao, 'build', null), null));
});

test('what a refused start names: the factory, the workflow, the steps, the folder, and the fix in the words of the start', async (t) => {
  await t.test('unattachedRefusal: taken for a workflow it offers', () =>
    assert.equal(unattachedRefusal({ name: 'pipao', workflows: ['intake', 'build'] }, 'build'), undefined),
  );
  await t.test('unattachedRefusal: REFUSED where it offers none, naming the attach, never the default factory', () => {
    const why = unattachedRefusal({ name: 'pipao', workflows: [] }, 'build');
    names(why, 'build', 'pipao', 'none', 'nemia factory attach pipao build');
    assert.doesNotMatch(why!, /default factory/);
  });
  await t.test('unattachedRefusal: REFUSED naming what it offers, sorted', () => {
    const why = unattachedRefusal({ name: 'pipao', workflows: ['intake', 'dev'] }, 'build');
    names(why, 'build', 'pipao', 'dev, intake', 'nemia factory attach pipao build');
    assert.doesNotMatch(why!, /default factory/);
    names(unattachedRefusal({ name: 'pipao', workflows: ['builder'] }, 'build'), 'builder');
  });
  await t.test(
    'unfilledRefusal: REFUSED naming every step no agent fills, in order, a hire line each; a named or remote step is filled',
    () => {
      const steps = [
        { name: 'implement', harness: undefined, agent: undefined },
        { name: 'review', harness: undefined, agent: { name: 'reviewer', keys: [], body: '', given: {} } },
        { name: 'ask', harness: 'a2a:helper', agent: undefined },
        { name: 'ship', harness: 'claude', agent: undefined },
      ];
      const why = unfilledRefusal(steps, 'pipao', 'build');
      names(why, 'build', 'pipao', '2', 'implement, ship', 'nemia factory hire pipao <agent> --step build/implement');
      names(why, 'nemia factory hire pipao <agent> --step build/ship');
      assert.doesNotMatch(why!, /build\/review|build\/ask|default factory|plain session/);
      assert.ok(why!.indexOf('--step build/implement') < why!.indexOf('--step build/ship'), why);
      assert.equal(unfilledRefusal(steps.slice(1, 3), 'pipao', 'build'), undefined);
      names(unfilledRefusal(steps.slice(0, 1), 'pipao', 'build'), 'pipao', 'implement');
    },
  );
  await t.test('outsideRefusal: taken as path.resolve spells both; REFUSED naming the list, sorted, the --repo and the add', () => {
    const pipao = { name: 'pipao', repos: ['/r/b', '/r/a/'] };
    assert.equal(outsideRefusal(pipao, '/r/a'), undefined);
    assert.equal(outsideRefusal(pipao, '/r/b/'), undefined);
    const why = outsideRefusal(pipao, '/r/c');
    names(why, '/r/c', 'pipao', '/r/a, /r/b', '--repo /r/a', 'nemia factory add <name> --repo /r/c');
    assert.doesNotMatch(why!, /default factory/);
  });
  await t.test(
    'noFactoryRefusal: REFUSED naming the folder, the factories, the fix, the add, the attach and the files that do not read',
    () =>
      names(
        noFactoryRefusal('/s/loose', ['pipao', 'abc'], '--factory <name>', ['broken']),
        '/s/loose',
        '--factory <name>, one of abc, pipao',
        'nemia factory add <name> --repo <root>',
        'nemia factory attach <name> <workflow>',
        'broken',
        'nemia factory ls',
      ),
  );
  await t.test("noFactoryRefusal: with none filed, the api's fix once one is", () =>
    names(noFactoryRefusal('/s/loose', [], '?factory=<name>'), '?factory=<name>', 'nemia factory add <name> --repo <root>'),
  );
  await t.test('ambiguousFactoryRefusal: REFUSED naming each holder with its repository, by name, and the fix for each', () =>
    names(
      ambiguousFactoryRefusal(
        '/s/repo/x',
        [
          { factory: on('b', '/s/repo'), repo: '/s/repo' },
          { factory: on('a', '/s/repo'), repo: '/s/repo' },
        ],
        '--factory <name>',
      ),
      '/s/repo/x',
      '2',
      'a on /s/repo, b on /s/repo',
      '--factory a, or --factory b',
    ),
  );
  await t.test("ambiguousFactoryRefusal: in the api's words", () =>
    names(
      ambiguousFactoryRefusal(
        '/s/repo',
        [
          { factory: on('a', '/s/repo'), repo: '/s/repo' },
          { factory: on('b', '/s/repo'), repo: '/s/repo' },
        ],
        '?factory=<name>',
      ),
      '?factory=a, or ?factory=b',
    ),
  );
  await t.test('defaultStartRefusal: REFUSED naming the default, the fix and the factories', () =>
    names(defaultStartRefusal('--factory <name>', ['pipao']), '`default`', '--factory <name>, one of pipao'),
  );
});

test('noFactoryLine: no factory of that name, naming those there are, or the add when there is none but the default', async (t) => {
  await t.test('some filed', () => names(noFactoryLine('nope', ['pipao', 'abc']), 'nope', 'abc, pipao'));
  await t.test('none filed', () => names(noFactoryLine('nope', []), 'nope', 'nemia factory add <name> --repo <path>'));
});

test("fillsOf: a factory's hires into one workflow's steps, by step, and none of another workflow's", async (t) => {
  const hires = { 'build/implement': 'ada', 'build/review': 'agora', 'other/implement': 'otto', 'builder/implement': 'x' };
  for (const [workflow, fills] of [
    ['build', { implement: 'ada', review: 'agora' }],
    ['other', { implement: 'otto' }],
    ['intake', {}],
  ] as const)
    await t.test(workflow, () => assert.deepEqual(fillsOf(hires, workflow), fills));
});

test("factoryRepo: the repository of a run in a factory: the one named, else the factory's only one, else where it is started from", async (t) => {
  const one = { repos: ['/r/pipao'] };
  const two = { repos: ['/r/b', '/r/a'] };
  await t.test('a named repository over everything', () => assert.equal(factoryRepo(one, '/r/other', '/here'), '/r/other'));
  await t.test('the only repository, wherever it is started from', () => assert.equal(factoryRepo(one, undefined, '/here'), '/r/pipao'));
  await t.test('with two, where it is started from', () => assert.equal(factoryRepo(two, undefined, '/here'), '/here'));
  await t.test('the default factory has no list', () => assert.equal(factoryRepo(undefined, undefined, '/here'), '/here'));
});

test("the factories holding a folder: its repository itself, or an ancestor of it, with that repository as the run's root", () => {
  const a = on('a', '/s/repo', '/s/other');
  assert.deepEqual(factoriesHolding([a], '/s/repo'), [{ factory: a, repo: '/s/repo' }]);
  assert.deepEqual(factoriesHolding([a], '/s/repo/src/deep'), [{ factory: a, repo: '/s/repo' }]);
  assert.deepEqual(factoriesHolding([a], '/s/repo/../other/x'), [{ factory: a, repo: '/s/other' }], 'spelled as path.resolve spells it');
});

test("REFUSED to hold: a sibling whose name starts with the repository's, and a parent of it", () => {
  const a = on('a', '/s/repo');
  assert.deepEqual(factoriesHolding([a], '/s/repo2'), []);
  assert.deepEqual(factoriesHolding([a], '/s/repo-old/x'), []);
  assert.deepEqual(factoriesHolding([a], '/s'), []);
});

test('every factory that holds a folder is returned, none chosen: one repository in two factories, and nested repositories in two', () => {
  const a = on('a', '/s/repo');
  const b = on('b', '/s/repo');
  assert.deepEqual(factoriesHolding([a, b], '/s/repo/x'), [
    { factory: a, repo: '/s/repo' },
    { factory: b, repo: '/s/repo' },
  ]);
  const outer = on('outer', '/s/outer');
  const inner = on('inner', '/s/outer/inner');
  assert.deepEqual(factoriesHolding([outer, inner], '/s/outer/inner/x'), [
    { factory: outer, repo: '/s/outer' },
    { factory: inner, repo: '/s/outer/inner' },
  ]);
  assert.deepEqual(
    factoriesHolding([on('both', '/s/outer', '/s/outer/inner')], '/s/outer/inner/x'),
    [{ factory: on('both', '/s/outer', '/s/outer/inner'), repo: '/s/outer/inner' }],
    "of one factory's two, the deepest",
  );
});

test("instructionAt: a factory's instruction in its first folder as filed, at NEMIA.md or the path its file names, or the store's file", async (t) => {
  const store = '/s/factories/pipao/NEMIA.md';
  await t.test('NEMIA.md, in the first folder', () =>
    assert.deepEqual(instructionAt({ repos: ['/b', '/a'] }, store), { in: 'folder', folder: '/b', path: 'NEMIA.md', file: '/b/NEMIA.md' }),
  );
  await t.test('the path its file names', () =>
    assert.deepEqual(instructionAt({ repos: ['/b', '/a'], instruction: { path: 'docs/X.md' } }, store), {
      in: 'folder',
      folder: '/b',
      path: 'docs/X.md',
      file: '/b/docs/X.md',
    }),
  );
  await t.test("the store's file", () =>
    assert.deepEqual(instructionAt({ repos: ['/b', '/a'], instruction: { store: true } }, store), { in: 'store', file: store }),
  );
});

test("instructionPathRefusal: an instruction's path is a file inside the folder, or the instruction is kept in the store", async (t) => {
  for (const p of ['', '  '])
    await t.test(`REFUSED: ${JSON.stringify(p)}, empty, naming the fix`, () =>
      names(instructionPathRefusal(p), 'empty', 'NEMIA.md', 'store'),
    );
  for (const p of ['/etc/x', '../x', 'docs/../../x', '.', './', '..'])
    await t.test(`REFUSED: ${JSON.stringify(p)}, naming the fix`, () => names(instructionPathRefusal(p), `\`${p}\``, 'NEMIA.md', 'store'));
  await t.test('REFUSED: an absolute one, saying so', () => names(instructionPathRefusal('/etc/x'), '`/etc/x`', 'absolute'));
  await t.test('REFUSED: one that climbs out, saying so', () => names(instructionPathRefusal('docs/../../x'), 'climbs out'));
  for (const p of ['CLAUDE.md', 'docs/../NEMIA.md', 'docs/NEMIA.md', '..x/a.md'])
    await t.test(`taken: ${p}`, () => assert.equal(instructionPathRefusal(p), undefined));
});

test('factoryLines: `nemia factory ls`, the default first, then each factory by name with what it holds under its line', async (t) => {
  await t.test('the default alone', () => assert.deepEqual(factoryLines([]), [DEFAULT_LINE]));
  await t.test('each by name with its repositories, and one that does not read with why', () => {
    const factories = [
      { name: 'pipao', file: '/s/factories/pipao.json', repos: ['/code/pipao'], workflows: [], hires: {}, schedules: {} },
      { name: 'broken', file: '/s/factories/broken.json', error: 'does not read as a factory: `repos` is missing' },
      { name: 'abc', file: '/s/factories/abc.json', repos: ['/code/a', '/code/b'], workflows: [], hires: {}, schedules: {} },
    ];
    assert.deepEqual(factoryLines(factories), [
      DEFAULT_LINE,
      'abc      /code/a, /code/b',
      'broken   /s/factories/broken.json does not read as a factory: `repos` is missing',
      'pipao    /code/pipao',
    ]);
  });
  await t.test('its hires, sorted by step, whatever order its file has them in', () =>
    assert.deepEqual(
      factoryLines([
        {
          name: 'pipao',
          file: '/s/factories/pipao.json',
          repos: ['/code/pipao'],
          workflows: [],
          hires: { 'build/review': 'agora', 'build/implement': 'ada' },
          schedules: {},
        },
      ]),
      [DEFAULT_LINE, 'pipao    /code/pipao', '         build/implement ← ada', '         build/review ← agora'],
    ),
  );
  await t.test('the workflows it offers on one line, by name, before its hires; no such line when it has none', () =>
    assert.deepEqual(
      factoryLines([
        {
          name: 'pipao',
          file: '/s/pipao.json',
          repos: ['/code/pipao'],
          workflows: ['intake', 'build'],
          hires: { 'build/implement': 'ada' },
          schedules: {},
        },
        { name: 'nemia', file: '/s/nemia.json', repos: ['/code/nemia'], workflows: [], hires: {}, schedules: {} },
      ]),
      [DEFAULT_LINE, 'nemia    /code/nemia', 'pipao    /code/pipao', '         workflows: build, intake', '         build/implement ← ada'],
    ),
  );
  await t.test('where its instruction is kept, when its file says', () => {
    const base = { file: '/s/f.json', repos: ['/code/a'], workflows: [], hires: {}, schedules: {} };
    assert.deepEqual(
      factoryLines([
        { ...base, name: 'aa', instruction: { path: 'docs/X.md' } },
        { ...base, name: 'bb', instruction: { store: true } },
        { ...base, name: 'cc' },
      ]).slice(1),
      [
        'aa       /code/a',
        '         instruction: docs/X.md',
        'bb       /code/a',
        '         instruction: kept in the store',
        'cc       /code/a',
      ],
    );
  });
  await t.test("a templated factory's template, applied or not yet, and each condition that is amiss", () => {
    const made = {
      name: 'made',
      file: '/s/factories/made.json',
      repos: ['/code/made'],
      workflows: ['dev'],
      hires: {},
      schedules: {},
      template: { source: '/t/team', version: '0.2.0', params: {} },
    };
    const fine = [
      { type: 'Applied', status: 'True', reason: 'Rendered', message: 'The tree is seeded.' },
      { type: 'ConflictsPending', status: 'False', reason: 'NoUpgrade', message: 'No upgrade.' },
    ] as const;
    assert.deepEqual(factoryLines([{ ...made, status: { applied: null, conditions: [] } }]).slice(1), [
      'made     /code/made',
      '         template: /t/team 0.2.0, not rendered yet: the daemon renders it, nemia up',
      '         workflows: dev',
    ]);
    assert.deepEqual(factoryLines([{ ...made, status: { applied: '0.2.0', conditions: fine } }]).slice(2, 3), [
      '         template: /t/team 0.2.0, applied at 0.2.0',
    ]);
    const drifted = { type: 'Applied', status: 'False', reason: 'VersionDrift', message: 'The template is at 0.3.0.' } as const;
    const pending = { type: 'ConflictsPending', status: 'True', reason: 'Conflicts', message: 'Two files wait.' } as const;
    assert.deepEqual(factoryLines([{ ...made, status: { applied: '0.2.0', conditions: [drifted, pending] } }]).slice(2, 5), [
      '         template: /t/team 0.2.0, applied at 0.2.0',
      '         Applied False, VersionDrift: The template is at 0.3.0.',
      '         ConflictsPending True, Conflicts: Two files wait.',
    ]);
  });
  await t.test(
    "its schedules under its hires, by workflow, with the zone, the repository, the brief's first line, the next fire and last run",
    () => {
      const since = '2026-10-01T00:00:00.000Z';
      const now = Date.parse('2026-10-08T12:00:00.000Z');
      const listed = (workflow: string, over: Partial<ScheduleListed>): ScheduleListed => ({
        factory: 'nemia',
        workflow,
        cron: '',
        tz: null,
        brief: '',
        repo: null,
        next: null,
        last: null,
        refused: null,
        ...over,
      });
      const factories = [
        {
          name: 'nemia',
          file: '/s/nemia.json',
          repos: ['/code/nemia'],
          workflows: ['janitor', 'build'],
          hires: {},
          schedules: {
            janitor: { cron: '0 9 * * 1', brief: 'Read the stats\nand say what moved', tz: 'America/Montreal', since },
            build: { cron: '0 0 1 * *', brief: 'Tidy', repo: '/code/nemia', since },
          },
        },
      ];
      const schedules = [
        listed('janitor', { next: '2026-10-12T13:00:00.000Z', last: { run: 'read-the-stats-ab12', at: '2026-10-05T13:00:02.000Z' } }),
        listed('build', { next: '2026-11-01T00:00:00.000Z', refused: 'build is not attached to nemia' }),
        { ...listed('janitor', { last: { run: 'another-factory-s-run', at: since } }), factory: 'pipao' },
      ];
      assert.deepEqual(factoryLines(factories, schedules, now).slice(1), [
        'nemia    /code/nemia',
        '         workflows: build, janitor',
        '         schedule build  0 0 1 * * on /code/nemia  "Tidy"',
        '           next 2026-11-01T00:00:00.000Z, in 23d12h  last none',
        '           refused: build is not attached to nemia',
        '         schedule janitor  0 9 * * 1 (America/Montreal)  "Read the stats"',
        '           next 2026-10-12T13:00:00.000Z, in 4d01h  last read-the-stats-ab12 (2026-10-05T13:00:02.000Z, 2d22h ago)',
      ]);
    },
  );
});
