/**
 * A step's page, read now (step.ts): the address of a run's workflow page, a step's recent runs, and the factories that hire into it —
 * each a pure reading of what it is handed, so each fixture breaks the rule it holds.
 */
import '../../test/harness.ts';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { hireRefusalOf, type FactoryListing } from 'agent-orchestrator';
import type { Run } from 'agent-orchestrator/run';
import { hiredInOf, hiringOf, RECENT_RUNS, recentRunsOf, workflowPageOf } from './step.ts';

const home = '/store';
const served = '/own';

/** A run of the folder `dir` made at `createdAt`, holding the step `implement`, in `factory` where one is given: the keys these read. */
const runOf = (id: string, dir: string, createdAt: string, factory?: string, taskId: string | null = null): Run =>
  ({
    id,
    brief: `Brief ${id}`,
    createdAt,
    workflowDir: dir,
    steps: { implement: { taskId } },
    ...(factory && { factory }),
  }) as unknown as Run;

test("a run's workflow page: yours in its factory, its repository's in its factory or on the api's own, and none for a folder the board does not page", () => {
  assert.deepEqual(workflowPageOf({ workflowDir: '/store/workflows/build', repo: '/r', factory: 'nemia' }, served, home), {
    from: 'yours',
    workflow: 'build',
    factory: 'nemia',
    repo: '/r',
  });
  assert.deepEqual(workflowPageOf({ workflowDir: '/store/workflows/build', repo: '/r' }, served, home), {
    from: 'yours',
    workflow: 'build',
    factory: null,
    repo: null,
  });
  assert.deepEqual(workflowPageOf({ workflowDir: '/r/workflows/build', repo: '/r', factory: 'nemia' }, served, home), {
    from: 'repo',
    workflow: 'build',
    factory: 'nemia',
    repo: '/r',
  });
  assert.deepEqual(
    workflowPageOf({ workflowDir: '/own/workflows/build', repo: '/own', factory: 'default' }, served, home),
    { from: 'repo', workflow: 'build', factory: null, repo: null },
    "the default factory, on the api's own repository",
  );
  assert.equal(
    workflowPageOf({ workflowDir: '/r/workflows/build', repo: '/r' }, served, home),
    null,
    "another repository's folder in the default factory: the board pages it on no address",
  );
  assert.equal(
    workflowPageOf({ workflowDir: '/r/elsewhere/build', repo: '/r', factory: 'nemia' }, served, home),
    null,
    'a folder given by path',
  );
  assert.equal(workflowPageOf({ workflowDir: '/r/workflows/build' }, served, home), null, 'a run with no repository');
});

test("a step's recent runs: its folder's only, newest first, at most RECENT_RUNS, in the factory named — and whether the step was filed", () => {
  const dir = '/r/workflows/build';
  const runs = [
    ...Array.from({ length: RECENT_RUNS + 1 }, (_, i) => runOf(`n${i}`, dir, `2026-10-0${i + 1}T00:00:00Z`, 'nemia')),
    runOf('other', '/r/workflows/review', '2026-10-09T00:00:00Z', 'nemia'),
    runOf('plain', dir, '2026-10-08T00:00:00Z', undefined, 'task-1'),
  ];
  const every = recentRunsOf(runs, dir, 'implement', null);
  assert.deepEqual(
    every.map((r) => r.id),
    ['plain', 'n5', 'n4', 'n3', 'n2'],
    'newest first, of the folder alone, cut at RECENT_RUNS',
  );
  assert.deepEqual(every[0], {
    id: 'plain',
    brief: 'Brief plain',
    createdAt: '2026-10-08T00:00:00Z',
    factory: null,
    filed: true,
  });
  assert.deepEqual(
    recentRunsOf(runs, dir, 'implement', 'nemia').map((r) => r.id),
    ['n5', 'n4', 'n3', 'n2', 'n1'],
    "in a factory, that factory's runs alone",
  );
  assert.deepEqual(recentRunsOf(runs, dir, 'review', null), [], 'a step none of them holds has none');
});

test('the factories that hire into a step: those that attach its workflow and, for a repository workflow, work on the repository', () => {
  const factories: FactoryListing[] = [
    { name: 'nemia', file: 'nemia.json', repos: ['/r'], workflows: ['build'], hires: { 'build/implement': 'ada' } },
    { name: 'loose', file: 'loose.json', repos: ['/r'], workflows: [], hires: { 'build/implement': 'bob' } },
    { name: 'far', file: 'far.json', repos: ['/s'], workflows: ['build'], hires: { 'build/implement': 'cy' } },
    { name: 'idle', file: 'idle.json', repos: ['/r'], workflows: ['build'], hires: { 'build/review': 'dee' } },
    { name: 'broken', file: 'broken.json', error: 'does not read' },
  ];
  assert.deepEqual(hiredInOf(factories, 'build', 'implement', 'repo', '/r'), [{ factory: 'nemia', agent: 'ada' }]);
  assert.deepEqual(
    hiredInOf(factories, 'build', 'implement', 'yours', '/r'),
    [
      { factory: 'nemia', agent: 'ada' },
      { factory: 'far', agent: 'cy' },
    ],
    'a workflow of yours is read in every factory that attaches it',
  );
});

/** An agent as the listing reads it, the keys `hiringOf` reads: of `from`, broken where `error` says. */
const agentOf = (name: string, from: 'repo' | 'yours', error: string | null = null) => ({
  name,
  from,
  description: error ? null : `${name}, of ${from}`,
  error,
});

test("a step's hiring: the agents beside its workflow that read, by name — the same name of the other place, and a broken one, left out", () => {
  const mill = { name: 'mill', workflows: ['build'] };
  const agents = [agentOf('zed', 'repo'), agentOf('ada', 'yours'), agentOf('ada', 'repo'), agentOf('bad', 'repo', 'no front matter')];
  assert.deepEqual(hiringOf(mill, 'build', {}, null, 'repo', agents), {
    refused: null,
    agents: [
      { name: 'ada', description: 'ada, of repo' },
      { name: 'zed', description: 'zed, of repo' },
    ],
  });
  assert.deepEqual(hiringOf(mill, 'build', {}, null, 'yours', agents), {
    refused: null,
    agents: [{ name: 'ada', description: 'ada, of yours' }],
  });
});

test("REFUSED: a step's hiring in the default factory, and for a step whose file names its agent, with no agents to pick — but a hired step takes another", () => {
  const mill = { name: 'mill', workflows: ['build'] };
  const agents = [agentOf('ada', 'repo')];
  const own = { agent: { name: 'agora' } } as never;
  assert.deepEqual(hiringOf(undefined, 'build', {}, null, 'repo', agents), {
    refused: hireRefusalOf(undefined, 'build', null),
    agents: [],
  });
  assert.match(hiringOf(undefined, 'build', {}, null, 'repo', agents).refused ?? '', /is the default factory/);
  assert.deepEqual(hiringOf(mill, 'build', own, null, 'repo', agents), { refused: hireRefusalOf(mill, 'build', 'agora'), agents: [] });
  assert.match(hiringOf(mill, 'build', own, null, 'repo', agents).refused ?? '', /`agent: agora`/);
  assert.deepEqual(
    hiringOf(mill, 'build', { agent: { name: 'ada' } } as never, 'ada', 'repo', agents),
    { refused: null, agents: [{ name: 'ada', description: 'ada, of repo' }] },
    'a hired step is resolved with its hire as its agent: its file names none of its own',
  );
});
