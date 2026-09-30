/**
 * The factories as the board splits the machine by them (src/lib/factories.ts): a block a factory, the default one only while it holds
 * runs; each run and queued card in the factory its record or card names, the default factory's naming none; and the menu's sub-items.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import type { Factory, InboxEntry, RunSummary } from '../src/lib/api.ts';
import { factoryBlocks, MENU_SHOWN, menuFactories, queuedIn, runsIn, startRepo, type FactoryRun } from '../src/lib/factories.ts';
import { placeQuery } from '../src/lib/api/workflows.ts';

/** A factory as the api lists it: attached to one repository and one workflow, with one hire. */
const factory = (name: string, extra: Partial<Factory> = {}): Factory => ({
  name,
  default: false,
  repos: ['/code/nemia'],
  workflows: ['build'],
  hires: { 'build/implement': 'ada' },
  error: null,
  ...extra,
});

/** The default factory as the api lists it: on the api's repository, offering every workflow and hiring no one. */
const fallback = factory('default', { default: true, repos: ['/code/app'], workflows: null, hires: {} });

/** A run finished in `factory`, which nothing moves and nobody is asked about; `extra` puts keys over it. */
const run = (id: string, factoryName: string | null, extra: Partial<RunSummary> = {}): FactoryRun & { id: string } => ({
  id,
  factory: factoryName,
  status: 'succeeded',
  moving: false,
  waitingOnYou: [],
  cancelledAt: null,
  waiting: null,
  holding: null,
  ...extra,
});

const names = (xs: readonly { name: string }[]) => xs.map((x) => x.name);
const ids = (xs: readonly { id: string }[]) => xs.map((x) => x.id);

test('the default factory is a block only while a run names no factory, and then the first, whatever the order it is listed in', () => {
  const nemia = factory('nemia');
  assert.deepEqual(names(factoryBlocks([fallback, nemia], [run('r-1', 'nemia')])), ['nemia']);
  assert.deepEqual(names(factoryBlocks([fallback, nemia], [])), ['nemia']);
  assert.deepEqual(names(factoryBlocks([fallback, nemia], [run('r-1', 'nemia'), run('r-2', null)])), ['default', 'nemia']);
  assert.deepEqual(names(factoryBlocks([nemia, factory('pipao'), fallback], [run('r-2', null)])), ['default', 'nemia', 'pipao']);
});

test("each run is in the factory its record names, the default factory's naming none: a pipao run in neither default nor nemia", () => {
  const runs = [run('d', null), run('n', 'nemia'), run('p', 'pipao')];
  assert.deepEqual(ids(runsIn(runs, fallback)), ['d']);
  assert.deepEqual(ids(runsIn(runs, factory('nemia'))), ['n']);
  assert.deepEqual(ids(runsIn(runs, factory('pipao'))), ['p']);
  assert.deepEqual(ids(runsIn(runs, factory('nope'))), []);
});

test("each queued card is in the factory it names, the default factory's naming none", () => {
  const card = (name: string, factoryName: string | null) => ({ name, factory: factoryName }) as InboxEntry;
  const cards = [card('d', null), card('n', 'nemia')];
  assert.deepEqual(names(queuedIn(cards, fallback)), ['d']);
  assert.deepEqual(names(queuedIn(cards, factory('nemia'))), ['n']);
});

test('a block counts its runs in flight as the floor does, a held one and one at its gate among them, those waiting on you, and its workflows', () => {
  const holding = { at: 'x', runs: [], word: 'held until r-0 ships', advice: 'wait', onYou: false };
  const runs = [
    run('working', 'nemia', { status: 'running', moving: true }),
    run('held', 'nemia', { status: 'running', holding }),
    run('gate', 'nemia', { status: 'running', waitingOnYou: ['plan'] }),
    run('done', 'nemia'),
    run('elsewhere', null, { status: 'running', moving: true, waitingOnYou: ['plan'] }),
  ];
  const [def, nemia] = factoryBlocks([fallback, factory('nemia')], runs);
  assert.deepEqual(
    { ...nemia },
    {
      name: 'nemia',
      default: false,
      repos: ['nemia'],
      runs: 4,
      inFlight: 3,
      waitsOnYou: 1,
      workflows: 1,
      hires: 1,
      error: null,
    },
  );
  assert.deepEqual([def.runs, def.inFlight, def.waitsOnYou, def.workflows, def.hires, def.repos], [1, 1, 1, null, 0, ['app']]);
});

test('a factory whose file does not read is still a block, with why, and hides no other', () => {
  const broken = factory('broken', { repos: [], workflows: [], hires: {}, error: '/wf/factories/broken.json is not JSON' });
  const blocks = factoryBlocks([fallback, factory('nemia'), broken, factory('pipao')], []);
  assert.deepEqual(names(blocks), ['nemia', 'broken', 'pipao']);
  assert.deepEqual(
    blocks.map((b) => [b.error, b.runs, b.inFlight, b.waitsOnYou, b.workflows, b.hires]),
    [
      [null, 0, 0, 0, 1, 1],
      ['/wf/factories/broken.json is not JSON', 0, 0, 0, 0, 0],
      [null, 0, 0, 0, 1, 1],
    ],
  );
});

test('the menu shows the first five factories and says how many more there are; all of them once asked', () => {
  assert.equal(MENU_SHOWN, 5);
  const blocks = (n: number) =>
    factoryBlocks(
      Array.from({ length: n }, (_, i) => factory(`f-${i}`)),
      [],
    );
  const seven = menuFactories(blocks(7), false);
  assert.deepEqual([names(seven.shown), seven.hidden], [['f-0', 'f-1', 'f-2', 'f-3', 'f-4'], 2]);
  const all = menuFactories(blocks(7), true);
  assert.deepEqual([all.shown.length, all.hidden], [7, 0]);
  const five = menuFactories(blocks(5), false);
  assert.deepEqual([five.shown.length, five.hidden], [5, 0]);
  const six = menuFactories(blocks(6), false);
  assert.deepEqual([six.shown.length, six.hidden], [5, 1]);
});

test("a card starts on its repo:, else on the factory's one repository; with several and no repo:, on none until a person picks", () => {
  assert.equal(startRepo(factory('solo', { repos: ['/r/a', '/r/b'] }), '/r/b'), '/r/b');
  assert.equal(startRepo(factory('solo'), null), '/code/nemia');
  assert.equal(startRepo(factory('pair', { repos: ['/r/a', '/r/b'] }), null), null);
  assert.equal(startRepo(factory('none', { repos: [] }), null), null);
});

test("a place is named in a request's query, encoded; the default factory and no place name none, as the api answers them alike", () => {
  assert.equal(placeQuery(), '');
  assert.equal(placeQuery(null), '');
  assert.equal(placeQuery({ factory: 'default', repo: '/code/app' }), '');
  assert.equal(placeQuery({ factory: 'hiring', repo: '/r/x' }), '?factory=hiring&repo=%2Fr%2Fx');
});
