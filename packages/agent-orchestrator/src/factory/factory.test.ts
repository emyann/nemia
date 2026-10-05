/**
 * A factory's name and what `nemia factory ls` says of the store's factories — pure, as data.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
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

test('REFUSED: a name that is empty, not lowercase, climbs, is hidden, starts with a dash or is past 40 characters', () => {
  for (const name of ['', 'Nemia', 'a/b', '.x', '-x', '..', '../x', 'a b', 'é', 'a'.repeat(41)])
    assert.ok(factoryNameRefusal(name), `refused: ${JSON.stringify(name)}`);
  assert.match(factoryNameRefusal('Nemia')!, /— nemia, say\.$/);
  assert.match(factoryNameRefusal('a/b')!, /^`a\/b` is not a factory's name: .* pipao or nemia-2, say\.$/);
  assert.match(factoryNameRefusal('')!, /this name is empty/);
});

test('a lowercase slug of up to 40 characters names a factory', () => {
  for (const name of ['pipao', 'nemia', 'nemia-2', '2x', 'a'.repeat(40)]) assert.equal(factoryNameRefusal(name), undefined, name);
});

test('the default factory is refused to add and rm in words of its own', () => {
  assert.equal(DEFAULT_FACTORY, 'default');
  assert.match(
    defaultFactoryRefusal('add'),
    /^`default` is the default factory: .* read, never written, so nemia factory add does not take it/,
  );
  assert.match(defaultFactoryRefusal('rm'), /nemia factory rm does not take it/);
});

test('nemia factory ls: the default first, then each factory by name with its repositories, and one that does not read with why', () => {
  assert.deepEqual(factoryLines([]), ['default  every run and card that names no factory — read, never written']);
  assert.deepEqual(
    factoryLines([
      { name: 'pipao', file: '/s/factories/pipao.json', repos: ['/code/pipao'], workflows: [], hires: {} },
      { name: 'broken', file: '/s/factories/broken.json', error: 'does not read as a factory: `repos` is missing' },
      { name: 'abc', file: '/s/factories/abc.json', repos: ['/code/a', '/code/b'], workflows: [], hires: {} },
    ]),
    [
      'default  every run and card that names no factory — read, never written',
      'abc      /code/a, /code/b',
      'broken   /s/factories/broken.json does not read as a factory: `repos` is missing',
      'pipao    /code/pipao',
    ],
  );
});

test('no factory of that name: which there are, or that there is none but the default', () => {
  assert.equal(noFactoryLine('nope', ['pipao', 'abc']), 'no factory nope in the store. Its factories are: abc, pipao.');
  assert.match(noFactoryLine('nope', []), /It has none but the default: file one with nemia factory add <name> --repo <path>\.$/);
});

test("nemia factory ls: a factory's hires under its line, sorted by step, whatever order its file has them in", () => {
  assert.deepEqual(
    factoryLines([
      {
        name: 'pipao',
        file: '/s/factories/pipao.json',
        repos: ['/code/pipao'],
        workflows: [],
        hires: { 'build/review': 'agora', 'build/implement': 'ada' },
      },
    ]),
    [
      'default  every run and card that names no factory — read, never written',
      'pipao    /code/pipao',
      '         build/implement ← ada',
      '         build/review ← agora',
    ],
  );
});

test('REFUSED: a hire whose step is not <workflow>/<step>, or whose agent is no name', () => {
  for (const step of ['build', 'build/a/b', 'build/.x', '/x', 'build/', '.git/x', 'agents/x', 'skills/x', 'build/README'])
    assert.ok(hireRefusal(step, 'ada'), `refused: ${step}`);
  for (const agent of ['', 'a/b', '.ada', 'a b']) assert.ok(hireRefusal('build/implement', agent), `refused: ${JSON.stringify(agent)}`);
  assert.match(hireRefusal('build', 'ada')!, /^--step build names a step as <workflow>\/<step>/);
  assert.match(hireRefusal('build/a/b', 'ada')!, /^--step build\/a\/b names a step as <workflow>\/<step>/);
  assert.match(hireRefusal('agents/x', 'ada')!, /agents\/ holds the agents/);
  assert.match(hireRefusal('build/.x', 'ada')!, /`\.x` is not a step's name/);
  assert.match(hireRefusal('build/implement', 'a/b')!, /^`a\/b` is not an agent's name/);
});

test('a hire of a named agent into <workflow>/<step> is taken', () => {
  for (const [step, agent] of [
    ['build/implement', 'ada'],
    ['intake/frame-the-idea', 'iris-2'],
  ])
    assert.equal(hireRefusal(step, agent), undefined, `${step} ${agent}`);
});

test("a factory's fills for one workflow: its hires into that workflow's steps, by step, and none of another workflow's", () => {
  const hires = { 'build/implement': 'ada', 'build/review': 'agora', 'other/implement': 'otto', 'builder/implement': 'x' };
  assert.deepEqual(fillsOf(hires, 'build'), { implement: 'ada', review: 'agora' });
  assert.deepEqual(fillsOf(hires, 'other'), { implement: 'otto' });
  assert.deepEqual(fillsOf(hires, 'intake'), {});
});

test('REFUSED: every step no agent fills, naming the factory and hiring as the way, a hire line for each; a step that names its agent or a remote one is filled', () => {
  const steps = [
    { name: 'implement', harness: undefined, agent: undefined },
    { name: 'review', harness: undefined, agent: { name: 'reviewer', keys: [], body: '', given: {} } },
    { name: 'ask', harness: 'a2a:helper', agent: undefined },
    { name: 'ship', harness: 'claude', agent: undefined },
  ];
  const why = unfilledRefusal(steps, 'pipao', 'build');
  assert.ok(why);
  assert.match(why, /^build: in the factory pipao, 2 steps name no agent, and pipao hires none into them: implement, ship\./);
  assert.match(why, /nemia factory hire pipao <agent> --step build\/implement/);
  assert.match(why, /nemia factory hire pipao <agent> --step build\/ship/);
  assert.doesNotMatch(why, /build\/review|build\/ask/);
  assert.ok(
    why.endsWith(
      '. Hire an agent into each — nemia factory hire pipao <agent> --step build/implement; nemia factory hire pipao <agent> --step build/ship. Nothing was started.',
    ),
    why,
  );
  assert.doesNotMatch(why, /default factory|plain session/);
  assert.equal(unfilledRefusal(steps.slice(1, 3), 'pipao', 'build'), undefined);
  assert.match(unfilledRefusal(steps.slice(0, 1), 'pipao', 'build')!, /^build: in the factory pipao, the step implement names no agent/);
});

test('the default factory is refused to hire and fire, since it is never written', () => {
  assert.match(defaultFactoryRefusal('hire'), /nemia factory hire does not take it/);
  assert.match(defaultFactoryRefusal('fire'), /nemia factory fire does not take it/);
});

test('nemia factory ls: the workflows a factory offers on one line under its own, by name, before its hires; no such line when it has none', () => {
  assert.deepEqual(
    factoryLines([
      { name: 'pipao', file: '/s/pipao.json', repos: ['/code/pipao'], workflows: ['intake', 'build'], hires: { 'build/implement': 'ada' } },
      { name: 'nemia', file: '/s/nemia.json', repos: ['/code/nemia'], workflows: [], hires: {} },
    ]),
    [
      'default  every run and card that names no factory — read, never written',
      'nemia    /code/nemia',
      'pipao    /code/pipao',
      '         workflows: build, intake',
      '         build/implement ← ada',
    ],
  );
});

test("REFUSED: a workflow's name that is empty, hidden, holds a slash, or is the agents' or the skills' folder", () => {
  for (const name of ['', '.git', 'a/b', 'a\\b', 'agents', 'skills'])
    assert.ok(workflowNameRefusal(name), `refused: ${JSON.stringify(name)}`);
  assert.match(workflowNameRefusal('.git')!, /^`\.git` is not a workflow's name/);
  assert.match(workflowNameRefusal('skills')!, /^skills\/ holds the agents or the skills/);
  for (const name of ['build', 'intake', 'dev-planned']) assert.equal(workflowNameRefusal(name), undefined, name);
  assert.match(hireRefusal('.git/x', 'ada')!, /^--step \.git\/x: `\.git` is not a workflow's name/);
});

test('REFUSED: a start of a workflow its factory has not attached, saying what it offers, or that it offers none yet', () => {
  assert.equal(unattachedRefusal({ name: 'pipao', workflows: ['intake', 'build'] }, 'build'), undefined);
  assert.equal(
    unattachedRefusal({ name: 'pipao', workflows: [] }, 'build'),
    'build: the factory pipao does not offer this workflow — it offers none yet. Attach it: nemia factory attach pipao build. Nothing was started.',
  );
  assert.equal(
    unattachedRefusal({ name: 'pipao', workflows: ['intake', 'dev'] }, 'build'),
    'build: the factory pipao does not offer this workflow — it offers: dev, intake. Attach it: nemia factory attach pipao build. Nothing was started.',
  );
  for (const workflows of [[], ['intake', 'dev']])
    assert.doesNotMatch(unattachedRefusal({ name: 'pipao', workflows }, 'build')!, /default factory/, "only the factory's own fix");
  assert.match(unattachedRefusal({ name: 'pipao', workflows: ['builder'] }, 'build')!, /it offers: builder\./);
});

test('the default factory is refused to attach and detach, since it offers every workflow and is never written', () => {
  assert.match(defaultFactoryRefusal('attach'), /nemia factory attach does not take it\. It offers every workflow found already/);
  assert.match(defaultFactoryRefusal('detach'), /nemia factory detach does not take it\. It offers every workflow found/);
});

test("the repository of a run in a factory: the one named, else the factory's only one, else where it is started from", () => {
  const one = { repos: ['/r/pipao'] };
  const two = { repos: ['/r/b', '/r/a'] };
  assert.equal(factoryRepo(one, '/r/other', '/here'), '/r/other', 'a named repository over everything');
  assert.equal(factoryRepo(one, undefined, '/here'), '/r/pipao', 'the only repository, wherever it is started from');
  assert.equal(factoryRepo(two, undefined, '/here'), '/here', 'with two, where it is started from');
  assert.equal(factoryRepo(undefined, undefined, '/here'), '/here', 'the default factory has no list');
});

test('REFUSED: a repository outside the factory, naming its list, sorted, the --repo that starts it in one, and the add that files one on it', () => {
  const pipao = { name: 'pipao', repos: ['/r/b', '/r/a/'] };
  assert.equal(outsideRefusal(pipao, '/r/a'), undefined, 'compared as path.resolve spells both');
  assert.equal(outsideRefusal(pipao, '/r/b/'), undefined);
  assert.equal(
    outsideRefusal(pipao, '/r/c'),
    '/r/c: the factory pipao works on /r/a, /r/b, and this repository is not one of them. Name one of them — --repo /r/a — or file a factory on this one: nemia factory add <name> --repo /r/c. Nothing was started.',
  );
  assert.doesNotMatch(outsideRefusal(pipao, '/r/c')!, /default factory/, "only the factory's own fix");
});

/** A factory on `repos`, attaching and hiring nothing. */
const on = (name: string, ...repos: string[]) => ({ name, repos, workflows: [], hires: {} });

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

test("REFUSED: a start no factory holds, naming the folder, the factories, the fix in the start's words, the add, and the files that do not read", () => {
  assert.equal(
    noFactoryRefusal('/s/loose', ['pipao', 'abc'], '--factory <name>', ['broken']),
    "/s/loose: no factory works on this folder, and every run is started in a factory. Name the factory — --factory <name>, one of abc, pipao — or file one on this repository and attach the workflow to it: nemia factory add <name> --repo <root>, then nemia factory attach <name> <workflow>. These factories' files do not read, and were not looked at: broken (nemia factory ls). Nothing was started.",
  );
  assert.match(
    noFactoryRefusal('/s/loose', [], '?factory=<name>'),
    / — \?factory=<name>, once one is filed: nemia factory add <name> --repo <root> — /,
  );
});

test('REFUSED: a start two factories hold, naming the folder, each with the repository that holds it, and the fix for each', () => {
  assert.equal(
    ambiguousFactoryRefusal(
      '/s/repo/x',
      [
        { factory: on('b', '/s/repo'), repo: '/s/repo' },
        { factory: on('a', '/s/repo'), repo: '/s/repo' },
      ],
      '--factory <name>',
    ),
    '/s/repo/x: 2 factories work on this folder — a on /s/repo, b on /s/repo — and a start that names none is started in a factory only when one alone works on its folder. Name the one: --factory a, or --factory b. Nothing was started.',
  );
  assert.match(
    ambiguousFactoryRefusal(
      '/s/repo',
      [
        { factory: on('a', '/s/repo'), repo: '/s/repo' },
        { factory: on('b', '/s/repo'), repo: '/s/repo' },
      ],
      '?factory=<name>',
    ),
    /Name the one: \?factory=a, or \?factory=b\./,
  );
});

test('REFUSED: a start that names the default factory, which holds history only, naming the fix and the factories', () => {
  assert.equal(
    defaultStartRefusal('--factory <name>', ['pipao']),
    '`default` is the default factory: it holds the history of the runs and cards that named no factory, and no run is started in it. Name a factory — --factory <name>, one of pipao. Nothing was started.',
  );
});

test("a factory's instruction resolves in its first folder as filed, to NEMIA.md or the path its file names, or to the store's file", () => {
  const store = '/s/factories/pipao/NEMIA.md';
  assert.deepEqual(instructionAt({ repos: ['/b', '/a'] }, store), {
    in: 'folder',
    folder: '/b',
    path: 'NEMIA.md',
    file: '/b/NEMIA.md',
  });
  assert.deepEqual(instructionAt({ repos: ['/b', '/a'], instruction: { path: 'docs/X.md' } }, store), {
    in: 'folder',
    folder: '/b',
    path: 'docs/X.md',
    file: '/b/docs/X.md',
  });
  assert.deepEqual(instructionAt({ repos: ['/b', '/a'], instruction: { store: true } }, store), { in: 'store', file: store });
});

test("REFUSED: an instruction's path that is empty, absolute, the folder itself, or climbs out of it — each naming the fix", () => {
  for (const p of ['', '  ', '/etc/x', '../x', 'docs/../../x', '.', './', '..']) {
    const why = instructionPathRefusal(p);
    assert.ok(why, `refused: ${JSON.stringify(p)}`);
    assert.match(why, /Name a file inside the folder by its path from it .* or keep the instruction in the store\.$/);
  }
  assert.match(instructionPathRefusal('/etc/x')!, /^`\/etc\/x` is absolute/);
  assert.match(instructionPathRefusal('docs/../../x')!, /climbs out of the factory's first folder/);
  for (const p of ['CLAUDE.md', 'docs/../NEMIA.md', 'docs/NEMIA.md', '..x/a.md'])
    assert.equal(instructionPathRefusal(p), undefined, `allowed: ${p}`);
});

test("nemia factory ls: where a factory's instruction is kept, under its line, when its file says", () => {
  const base = { file: '/s/f.json', repos: ['/code/a'], workflows: [], hires: {} };
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

test('the default factory keeps no instruction: both verbs refuse it, saying what to do instead', () => {
  assert.match(defaultFactoryRefusal('instruction'), /nemia factory instruction does not take it\. It keeps no instruction/);
  assert.match(defaultFactoryRefusal('instruct'), /nemia factory instruct does not take it\. It keeps no instruction/);
});

test('REFUSED before anyone hires: the default factory, a workflow the factory does not offer, and a step whose file names its agent', () => {
  const pipao = { name: 'pipao', workflows: ['build'] };
  assert.equal(hireRefusalOf(undefined, 'build', null), defaultFactoryRefusal('hire'), 'no factory named is the default');
  assert.equal(hireRefusalOf({ name: DEFAULT_FACTORY, workflows: ['build'] }, 'build', null), defaultFactoryRefusal('hire'));
  assert.equal(hireRefusalOf(pipao, 'intake', null), unattachedHireRefusal('pipao', 'intake'));
  assert.equal(
    unattachedHireRefusal('pipao', 'intake'),
    'pipao does not offer the workflow intake, so it hires no one into its steps. Attach it first — nemia factory attach pipao intake — then hire.',
  );
  assert.equal(
    hireRefusalOf(pipao, 'build', 'ada'),
    "The step's own file names its agent, `agent: ada`, which fills it in every factory, and a start refuses a hire beside it. To hire into this step, delete its `agent:` line.",
  );
  assert.equal(hireRefusalOf(pipao, 'build', null), null, 'a step of a workflow it offers, naming no agent, takes a hire');
});

test('a hire is refused for the default factory first, then the workflow not offered, then the step naming its agent', () => {
  assert.equal(hireRefusalOf({ name: DEFAULT_FACTORY, workflows: [] }, 'build', 'ada'), defaultFactoryRefusal('hire'));
  assert.equal(hireRefusalOf({ name: 'pipao', workflows: [] }, 'build', 'ada'), unattachedHireRefusal('pipao', 'build'));
});
