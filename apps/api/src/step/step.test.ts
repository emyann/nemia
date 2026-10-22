/**
 * A step's page, read now (step.ts): the address of a run's workflow page, a step's recent runs, and the factories that hire into it —
 * each a pure reading of what it is handed, so each fixture breaks the rule it holds.
 */
import '../../test/harness.ts';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { hireRefusalOf, skillsFor, type FactoryListing } from 'agent-orchestrator';
import type { Run, ToldLayers } from 'agent-orchestrator/run';
import { scratch } from '../../test/scratch.ts';
import { hiredInOf, hiringOf, RECENT_RUNS, recentRunsOf, skillsFromOf, unreadAgentsRefusal, workflowPageOf } from './step.ts';

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
    { name: 'nemia', file: 'nemia.json', repos: ['/r'], workflows: ['build'], hires: { 'build/implement': 'ada' }, schedules: {} },
    { name: 'loose', file: 'loose.json', repos: ['/r'], workflows: [], hires: { 'build/implement': 'bob' }, schedules: {} },
    { name: 'far', file: 'far.json', repos: ['/s'], workflows: ['build'], hires: { 'build/implement': 'cy' }, schedules: {} },
    { name: 'idle', file: 'idle.json', repos: ['/r'], workflows: ['build'], hires: { 'build/review': 'dee' }, schedules: {} },
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

/** A reader of `agents` that counts how often it is read. */
function readerOf(agents: readonly ReturnType<typeof agentOf>[]): { read: () => Promise<typeof agents>; reads: () => number } {
  let reads = 0;
  return {
    read: async () => {
      reads += 1;
      return agents;
    },
    reads: () => reads,
  };
}

test("a step's hiring: the agents beside its workflow that read, by name — the same name of the other place, and a broken one, left out", async () => {
  const mill = { name: 'mill', workflows: ['build'] };
  const { read } = readerOf([
    agentOf('zed', 'repo'),
    agentOf('ada', 'yours'),
    agentOf('ada', 'repo'),
    agentOf('bad', 'repo', 'no front matter'),
  ]);
  assert.deepEqual(await hiringOf(mill, 'build', {}, null, 'repo', read), {
    refused: null,
    agents: [
      { name: 'ada', description: 'ada, of repo' },
      { name: 'zed', description: 'zed, of repo' },
    ],
  });
  assert.deepEqual(await hiringOf(mill, 'build', {}, null, 'yours', read), {
    refused: null,
    agents: [{ name: 'ada', description: 'ada, of yours' }],
  });
});

test("REFUSED: a step's hiring in the default factory, and for a step whose file names its agent, with no agents to pick — but a hired step takes another", async () => {
  const mill = { name: 'mill', workflows: ['build'] };
  const { read } = readerOf([agentOf('ada', 'repo')]);
  const own = { agent: { name: 'agora' } } as never;
  assert.deepEqual(await hiringOf(undefined, 'build', {}, null, 'repo', read), {
    refused: hireRefusalOf(undefined, 'build', null),
    agents: [],
  });
  assert.match((await hiringOf(undefined, 'build', {}, null, 'repo', read)).refused ?? '', /is the default factory/);
  assert.deepEqual(await hiringOf(mill, 'build', own, null, 'repo', read), { refused: hireRefusalOf(mill, 'build', 'agora'), agents: [] });
  assert.match((await hiringOf(mill, 'build', own, null, 'repo', read)).refused ?? '', /`agent: agora`/);
  assert.deepEqual(
    await hiringOf(mill, 'build', { agent: { name: 'ada' } } as never, 'ada', 'repo', read),
    { refused: null, agents: [{ name: 'ada', description: 'ada, of repo' }] },
    'a hired step is resolved with its hire as its agent: its file names none of its own',
  );
});

test('REFUSED before the agents are read: a step with no factory, in the default, in a factory not offering it, or naming its agent reads none', async () => {
  const mill = { name: 'mill', workflows: ['build'] };
  const reader = readerOf([agentOf('ada', 'repo')]);
  await hiringOf(undefined, 'build', {}, null, 'repo', reader.read);
  await hiringOf({ name: 'default', workflows: ['build'] }, 'build', {}, null, 'repo', reader.read);
  await hiringOf({ name: 'mill', workflows: [] }, 'build', {}, null, 'repo', reader.read);
  await hiringOf(mill, 'build', { agent: { name: 'agora' } } as never, null, 'repo', reader.read);
  assert.equal(reader.reads(), 0, 'a refused hire never reads the agents');
  await hiringOf(mill, 'build', {}, null, 'repo', reader.read);
  assert.equal(reader.reads(), 1, 'one that can be hired reads them once');
});

test("REFUSED: agents that cannot be read offer none to hire, and say why in the listing's words, the step's page still answering", async () => {
  const mill = { name: 'mill', workflows: ['build'] };
  const unread = () => Promise.reject(new Error('agents/ada.md is not a file'));
  assert.deepEqual(await hiringOf(mill, 'build', {}, null, 'repo', unread), {
    refused: unreadAgentsRefusal('agents/ada.md is not a file'),
    agents: [],
  });
});

test("each skill of a step's layers, the agent's then its own: one named with its folder as written, with where the repository has it", () => {
  const [repo, store] = [scratch('nemia-api-step-repo-'), scratch('nemia-api-step-store-')];
  const skill = (dir: string, name: string): void => {
    fs.mkdirSync(path.join(dir, name), { recursive: true });
    fs.writeFileSync(path.join(dir, name, 'SKILL.md'), `---\ndescription: Does ${name}.\n---\nDo it.\n`);
  };
  skill(path.join(repo, '.claude', 'skills'), 'review');
  skill(path.join(repo, 'apps', 'site', '.claude', 'skills'), 'lay-out');
  skill(path.join(repo, 'apps', 'site', '.claude', 'skills'), 'set-type');
  const layers = { agentSkills: ['apps/site:lay-out', 'review'], addedSkills: ['apps/site:set-type', 'gone', 'review'] } as ToldLayers;
  const found = skillsFor(path.join(store, 'workflows', 'typeset'), { repo, home: store });
  assert.deepEqual(skillsFromOf(layers, found, repo, store), [
    { name: 'apps/site:lay-out', from: null, foundIn: 'apps/site/.claude/skills/lay-out' },
    { name: 'review', from: 'repo', foundIn: null },
    { name: 'apps/site:set-type', from: null, foundIn: 'apps/site/.claude/skills/set-type' },
    { name: 'gone', from: null, foundIn: null },
  ]);
});
