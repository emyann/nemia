/**
 * The Capabilities page per factory (`pageRead`, page.ts): one table of which repository it reads, or why none, and a story of an
 * install unpacked from a published archive, whose `release.json` gives the address it was downloaded from as its source — the page
 * reads no path built from it, says what to do while the store has no factory, and reads a factory's repository once one is filed.
 */
import '../../test/harness.ts';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { Layer } from 'effect';
import { scratch } from 'test-kit/scratch';
import { story } from 'test-kit/checkpoints';
import { addFactory } from 'agent-orchestrator/testing';
import { appOf, liveOf } from '../app.ts';
import { ApiConfig } from '../layer.ts';
import { pageRead, FILE_FACTORY } from './page.ts';

type CapabilitiesWithSteps = import('objects').CapabilitiesWithSteps;
type Factory = import('agent-orchestrator').Factory;
type FactoryListing = import('agent-orchestrator').FactoryListing;
type Running = import('agent-orchestrator').Running;

/** A factory as `placeFor` gives it, on `repos`. */
const factoryOn = (name: string, repos: string[]): Factory => ({ name, repos, workflows: [], hires: {} }) as unknown as Factory;

/** A listing of the store's factory `name` on `repos`, as `listedAtOnce` gives it. */
const listedOn = (name: string, repos: string[]): FactoryListing => ({ name, repos }) as unknown as FactoryListing;

test('pageRead: the repository the page reads, or why none', async (t) => {
  const rows: Array<{
    name: string;
    place: Parameters<typeof pageRead>[0];
    own: string | undefined;
    listings: FactoryListing[];
    read: string | { reason: string; factory?: string | null; repos?: string[] };
  }> = [
    {
      name: 'a factory named, on one repository: that one',
      place: { repo: '/r', factory: factoryOn('solo', ['/r']), named: true },
      own: '/own',
      listings: [listedOn('solo', ['/r']), listedOn('other', ['/o'])],
      read: '/r',
    },
    {
      name: 'a factory named on several, none of them named: several-repositories, each named',
      place: { repo: undefined, factory: factoryOn('pair', ['/s', '/r']), named: true },
      own: '/own',
      listings: [],
      read: { reason: 'several-repositories', factory: 'pair', repos: ['/r', '/s'] },
    },
    {
      name: "the default factory, a ?repo= named that is not the api's own: that one",
      place: { repo: '/r', factory: undefined, named: true },
      own: '/own',
      listings: [listedOn('solo', ['/r']), listedOn('other', ['/o'])],
      read: '/r',
    },
    {
      name: "the default factory named, ?factory=default: the api's own, though factories stand beside it",
      place: { repo: '/own', factory: undefined, named: true },
      own: '/own',
      listings: [listedOn('solo', ['/r']), listedOn('other', ['/o'])],
      read: '/own',
    },
    {
      name: 'the default factory named on an api with no repository: read as with none named',
      place: { repo: undefined, factory: undefined, named: true },
      own: undefined,
      listings: [listedOn('solo', ['/r'])],
      read: '/r',
    },
    {
      name: "nothing named, no factory filed, the api's own repository: its own",
      place: { repo: '/own', factory: undefined, named: false },
      own: '/own',
      listings: [],
      read: '/own',
    },
    {
      name: 'nothing named, an api with no repository and one factory on one: that one',
      place: { repo: undefined, factory: undefined, named: false },
      own: undefined,
      listings: [listedOn('solo', ['/r'])],
      read: '/r',
    },
    {
      name: "nothing named, every factory and the api's own on one repository: that one",
      place: { repo: '/r', factory: undefined, named: false },
      own: '/r',
      listings: [listedOn('solo', ['/r'])],
      read: '/r',
    },
    {
      name: 'nothing named, an api with no repository and one factory on several: several-repositories',
      place: { repo: undefined, factory: undefined, named: false },
      own: undefined,
      listings: [listedOn('pair', ['/r', '/s'])],
      read: { reason: 'several-repositories', factory: 'pair', repos: ['/r', '/s'] },
    },
    {
      name: "nothing named, a factory beside the api's own on another repository: several-factories",
      place: { repo: '/own', factory: undefined, named: false },
      own: '/own',
      listings: [listedOn('solo', ['/r'])],
      read: { reason: 'several-factories' },
    },
    {
      name: 'nothing named, an api with no repository and no factory: no-factory',
      place: { repo: undefined, factory: undefined, named: false },
      own: undefined,
      listings: [],
      read: { reason: 'no-factory' },
    },
    {
      name: 'a factory whose file does not read is no candidate',
      place: { repo: undefined, factory: undefined, named: false },
      own: undefined,
      listings: [listedOn('solo', ['/r']), { name: 'broken', file: '/f', error: 'does not read' }],
      read: '/r',
    },
  ];
  for (const row of rows)
    await t.test(row.name, () => {
      const read = pageRead(row.place, row.own, row.listings);
      if (typeof row.read === 'string') {
        assert.deepEqual(read, { repo: row.read });
        return;
      }
      assert.ok('unread' in read, JSON.stringify(read));
      assert.equal(read.unread.reason, row.read.reason);
      if (row.read.factory !== undefined) assert.equal(read.unread.factory, row.read.factory);
      if (row.read.repos !== undefined) assert.deepEqual(read.unread.repos, row.read.repos);
      assert.deepEqual(
        read.unread.commands,
        row.read.reason === 'no-factory' ? FILE_FACTORY : [],
        'the lines to file one, for no-factory alone',
      );
    });
});

const write = (file: string, text: string): void => {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, text);
};

/** A repository folder with one skill, `<name>-skill`. */
const repoWithSkill = (name: string): string => {
  const repo = scratch(`nemia-api-page-${name}-`);
  write(
    path.join(repo, '.claude', 'skills', `${name}-skill`, 'SKILL.md'),
    `---\nname: ${name}-skill\ndescription: ${name}'s\n---\nDo it.\n`,
  );
  return repo;
};

test('an install unpacked from an archive, its source an address: the page reads no path built from it, and a factory once filed', async (t) => {
  const s = story(t);
  const SOURCE = 'https://github.com/emyann/nemia/releases';
  const release = scratch('nemia-api-release-');
  write(
    path.join(release, 'release.json'),
    JSON.stringify({ tag: 'v1.5.0', commit: 'abcdef1234567890', source: SOURCE, builtAt: '2026-11-12T00:00:00.000Z', from: 'archive' }),
  );
  const file = JSON.parse(fs.readFileSync(path.join(release, 'release.json'), 'utf8')) as Omit<
    Extract<Running, { kind: 'install' }>,
    'kind' | 'root'
  >;
  const running: Running = { kind: 'install', root: release, ...file };
  const { HKB_REPO: _noRepoOfItsOwn, WF_EXPOSED: _notExposed, ...env } = process.env;
  const { app } = appOf(Layer.merge(liveOf(env), ApiConfig.layer(env, running)));
  const page = async (query = ''): Promise<CapabilitiesWithSteps> => {
    const res = await app.request(`/api/capabilities${query}`);
    assert.equal(res.status, 200, await res.clone().text());
    return (await res.json()) as CapabilitiesWithSteps;
  };
  const namesNoAddress = (answer: unknown): void =>
    assert.ok(!JSON.stringify(answer).includes('https:'), `the source's address is never a path: ${JSON.stringify(answer)}`);

  await s.test('with no factory, the page reads no repository, says so, and names the lines that file one', async () => {
    const answer = await page();
    assert.equal(answer.repo, undefined, 'no repository is read');
    assert.equal(answer.unread?.reason, 'no-factory');
    assert.deepEqual(answer.unread?.commands, FILE_FACTORY);
    assert.ok(
      FILE_FACTORY.some((line) => line.startsWith('nemia factory add')) &&
        FILE_FACTORY.some((line) => line.startsWith('nemia factory apply')),
    );
    assert.equal(answer.skills.length + answer.agents.length + answer.mcp.length + answer.steps.length, 0, 'no list under a path');
    namesNoAddress(answer);
  });

  await s.test('the default factory is on no repository, and a read that needs one is refused, naming the fix', async () => {
    const factories = (await (await app.request('/api/factories')).json()) as {
      items: Array<{ metadata: { name: string }; spec: { repos: string[] } }>;
    };
    const fallback = factories.items.find((f) => f.metadata.name === 'default');
    assert.deepEqual(fallback?.spec.repos, [], 'the default factory lists no repository, never the address');
    const refused = await app.request('/api/repository');
    assert.equal(refused.status, 422);
    namesNoAddress(await refused.json());
  });

  const repoA = repoWithSkill('a');
  await s.test('one factory filed on one repository: the page reads it, with no factory named', async () => {
    addFactory({ name: 'alpha', repos: [repoA] });
    const answer = await page();
    assert.equal(answer.repo, repoA);
    assert.equal(answer.unread, undefined);
    assert.deepEqual(
      (answer.skills as Array<{ name: string }>).map((skill) => skill.name),
      ['a-skill'],
    );
  });

  const repoB = repoWithSkill('b');
  const repoC = repoWithSkill('c');
  await s.test(
    'a second factory, on two repositories: pick a factory; named, pick one of its repositories; each read by ?repo=',
    async () => {
      addFactory({ name: 'beta', repos: [repoB, repoC] });
      assert.equal((await page()).unread?.reason, 'several-factories');
      assert.equal((await page('?factory=alpha')).repo, repoA, 'the factory the picker names');
      const pick = (await page('?factory=beta')).unread;
      assert.equal(pick?.reason, 'several-repositories');
      assert.equal(pick?.factory, 'beta');
      assert.deepEqual(pick?.repos, [repoB, repoC].sort());
      const read = await page(`?factory=beta&repo=${encodeURIComponent(repoC)}`);
      assert.equal(read.repo, repoC);
      assert.deepEqual(
        (read.skills as Array<{ name: string }>).map((skill) => skill.name),
        ['c-skill'],
      );
    },
  );
});
