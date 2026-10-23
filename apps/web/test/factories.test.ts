/**
 * The factories as the board splits the machine by them (src/lib/factories.ts): a block a factory, the default one only while no factory
 * is filed and it holds runs; each run and queued card in the factory its record or card names, the default factory's naming none; where a
 * floor starts a run; and, for the pages that list the whole machine, the factory each run or card is tagged with, what the factory picked
 * keeps, the factories a workflow listed with no factory is in and where the address's place reads a list of workflows.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import type { Factory, InboxEntry, RunSummary } from '../src/lib/api.ts';
import {
  conditionAmiss,
  blockOf,
  untrustedFor,
  factoriesShown,
  factoryBlocks,
  openBlockOf,
  runsOf,
  factoryOf,
  factorySearch,
  floorPlace,
  hireOnCreate,
  hirePlaceOf,
  listPlace,
  fromWord,
  queuedIn,
  runsIn,
  shownIn,
  startRepo,
  whyNotStarted,
  workflowFactories,
  type FactoryRun,
} from '../src/lib/factories.ts';
import { placeQuery } from '../src/lib/api/workflows.ts';

/** A factory as the api lists it: attached to one repository and one workflow, with one hire. */
const factory = (name: string, extra: Partial<Factory> = {}): Factory => ({
  name,
  default: false,
  repos: ['/code/nemia'],
  workflows: ['build'],
  hires: { 'build/implement': 'ada' },
  error: null,
  schedules: [],
  commands: {
    attach: `nemia factory attach ${name} <workflow>`,
    rm: `nemia factory rm ${name}`,
    add: `nemia factory add ${name} --repo <path>`,
    schedule: `nemia factory schedule ${name} <workflow> --cron <expr> --brief <text>`,
    trust: `nemia factory trust ${name}`,
  },
  untrusted: [],
  template: null,
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

/** A run or a card of each factory, in the order a page lists them: one of the default factory names none, one names it as `default`. */
const tagged = [
  { id: 'q-1', factory: 'quay' },
  { id: 'd-1', factory: null },
  { id: 'n-1', factory: 'nemia' },
  { id: 'd-2', factory: 'default' },
  { id: 'n-2', factory: 'nemia' },
];

test('factoryBlocks, blockOf, factoriesShown: the machine split into a block a factory, and what each counts', async (t) => {
  await t.test(
    'the default factory is a block only while no factory is filed and a run names none, whatever the order it is listed in',
    () => {
      const nemia = factory('nemia');
      const broken = factory('broken', { repos: [], workflows: [], hires: {}, error: '/wf/factories/broken.json is not JSON' });
      assert.deepEqual(names(factoryBlocks([fallback], [run('r-2', null)])), ['default']);
      assert.deepEqual(names(factoryBlocks([fallback], [run('r-1', 'gone')])), []);
      assert.deepEqual(names(factoryBlocks([fallback], [])), []);
      assert.deepEqual(names(factoryBlocks([fallback, nemia], [run('r-1', 'nemia')])), ['nemia']);
      assert.deepEqual(names(factoryBlocks([fallback, nemia], [run('r-1', 'nemia'), run('r-2', null)])), ['nemia']);
      assert.deepEqual(names(factoryBlocks([nemia, factory('pipao'), fallback], [run('r-2', null)])), ['nemia', 'pipao']);
      assert.deepEqual(names(factoryBlocks([fallback, broken], [run('r-2', null)])), ['broken']);
    },
  );
  await t.test(
    "each run is in the factory its record names, the default factory's naming none: a pipao run in neither default nor nemia",
    () => {
      const runs = [run('d', null), run('n', 'nemia'), run('p', 'pipao')];
      assert.deepEqual(ids(runsIn(runs, fallback)), ['d']);
      assert.deepEqual(ids(runsIn(runs, factory('nemia'))), ['n']);
      assert.deepEqual(ids(runsIn(runs, factory('pipao'))), ['p']);
      assert.deepEqual(ids(runsIn(runs, factory('nope'))), []);
    },
  );
  await t.test("each queued card is in the factory it names, the default factory's naming none", () => {
    const card = (name: string, factoryName: string | null) => ({ name, factory: factoryName }) as InboxEntry;
    const cards = [card('d', null), card('n', 'nemia')];
    assert.deepEqual(names(queuedIn(cards, fallback)), ['d']);
    assert.deepEqual(names(queuedIn(cards, factory('nemia'))), ['n']);
  });
  await t.test(
    'a block counts its runs in flight as the floor does, a held one and one at its gate among them, those waiting on you, and its workflows',
    () => {
      const holding = { at: 'x', runs: [], word: 'held until r-0 ships', advice: 'wait', onYou: false };
      const runs = [
        run('working', 'nemia', { status: 'running', moving: true }),
        run('held', 'nemia', { status: 'running', holding }),
        run('gate', 'nemia', { status: 'running', waitingOnYou: ['plan'] }),
        run('done', 'nemia'),
        run('elsewhere', null, { status: 'running', moving: true, waitingOnYou: ['plan'] }),
      ];
      const [nemia] = factoryBlocks([fallback, factory('nemia')], runs);
      const [def] = factoryBlocks([fallback], runs);
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
    },
  );
  await t.test('a factory whose file does not read is still a block, with why, and hides no other', () => {
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
  await t.test(
    "REFUSED: a factory's bar off its light answer counts every run, those waiting and those in flight by the api's counts",
    () => {
      const holding = { at: 'x', runs: [], word: 'held until r-0 ships', advice: 'wait', onYou: false };
      const working = run('working', 'nemia', { status: 'running', moving: true });
      const held = run('held', 'nemia', { status: 'running', holding });
      const gate = run('gate', 'nemia', { status: 'running', waitingOnYou: ['plan'] });
      const stopped = run('stopped', 'nemia', { status: 'failed', waitingOnYou: ['plan'] });
      const done = run('done', 'nemia');
      const open = { counts: { waiting: 2, inFlight: 2, finished: 1 }, waiting: [gate, stopped], inFlight: [working, held] };
      const block = openBlockOf(factory('nemia'), open);
      assert.equal(runsOf(block), '2 in flight · 2 waiting on you · 5 runs');
      assert.equal(
        blockOf(factory('nemia'), [working, held, gate, stopped, done]).inFlight,
        3,
        'the whole list still counts a running run at its gate in flight: the pages that read it keep that rule',
      );
      assert.equal(openBlockOf(factory('nemia'), { ...open, counts: { waiting: 4, inFlight: 2, finished: 30 } }).runs, 36);
      assert.equal(openBlockOf(factory('nemia'), { ...open, counts: { waiting: 4, inFlight: 2, finished: 30 } }).waitsOnYou, 4);
      assert.equal(openBlockOf(factory('nemia'), { ...open, counts: { waiting: 4, inFlight: 6, finished: 30 } }).inFlight, 6);
      assert.equal(runsOf(openBlockOf(factory('nemia'), { counts: { waiting: 0, inFlight: 0, finished: 0 } })), 'No runs yet');
    },
  );
  await t.test('REFUSED: the default factory is shown only while no factory is named and it holds a run', () => {
    const nemia = factory('nemia');
    assert.deepEqual(names(factoriesShown([fallback], true)), ['default']);
    assert.deepEqual(names(factoriesShown([fallback], false)), []);
    assert.deepEqual(names(factoriesShown([fallback, nemia], true)), ['nemia']);
    assert.deepEqual(names(factoriesShown([nemia, fallback], false)), ['nemia']);
  });
});

test('startRepo, floorPlace, whyNotStarted, untrustedFor: where a card or a floor starts a run, and why it cannot', async (t) => {
  await t.test(
    "a card starts on its repo:, else on the factory's one repository; with several and no repo:, on none until a person picks",
    () => {
      assert.equal(startRepo(factory('solo', { repos: ['/r/a', '/r/b'] }), '/r/b'), '/r/b');
      assert.equal(startRepo(factory('solo'), null), '/code/nemia');
      assert.equal(startRepo(factory('pair', { repos: ['/r/a', '/r/b'] }), null), null);
      assert.equal(startRepo(factory('none', { repos: [] }), null), null);
    },
  );
  await t.test(
    "a place is named in a request's query, encoded; the default factory and no place name none, as the api answers them alike",
    () => {
      assert.equal(placeQuery(), '');
      assert.equal(placeQuery(null), '');
      assert.equal(placeQuery({ factory: 'default', repo: '/code/app' }), '');
      assert.equal(placeQuery({ factory: 'hiring', repo: '/r/x' }), '?factory=hiring&repo=%2Fr%2Fx');
    },
  );
  await t.test('the default floor starts no run: every run started from a floor names its factory', () => {
    assert.equal(floorPlace(fallback), null);
  });
  await t.test(
    'a named floor starts on its one repository, on none until a person picks among several, and says why when it cannot start',
    () => {
      assert.deepEqual(floorPlace(factory('nemia')), { factory: 'nemia', repos: ['/code/nemia'], repo: '/code/nemia' });
      assert.deepEqual(floorPlace(factory('pair', { repos: ['/r/a', '/r/b'] })), { factory: 'pair', repos: ['/r/a', '/r/b'], repo: null });
      const broken = floorPlace(factory('broken', { repos: ['/r/a'], error: '/wf/factories/broken.json is not JSON' }));
      assert.ok(broken && 'why' in broken, 'a factory whose file does not read cannot start');
      assert.match(broken.why, /broken[\s\S]*\/wf\/factories\/broken\.json is not JSON/);
      const none = floorPlace(factory('bare', { repos: [] }));
      assert.ok(none && 'why' in none, 'a factory on no repository cannot start');
      assert.match(none.why, /bare/);
    },
  );
  await t.test("a workflow that cannot start says why: its folder's error before the steps its hires leave unfilled", () => {
    assert.equal(whyNotStarted({ error: null, unfilled: null }), null);
    assert.equal(whyNotStarted({ error: 'no steps', unfilled: null }), 'no steps');
    assert.equal(whyNotStarted({ error: null, unfilled: 'hire dev/review' }), 'hire dev/review');
    assert.equal(whyNotStarted({ error: 'no steps', unfilled: 'hire dev/review' }), 'no steps');
  });
  await t.test(
    "a run's untrusted place: a factory's untrusted place that is its repository, whichever factory lists it; nothing for another",
    () => {
      const place = { place: '/code/nemia', harness: 'A harness', withheld: 'its allow rules', never: null };
      const lacking = factory('nemia', { untrusted: [place] });
      const trusting = factory('pipao', { repos: ['/code/pipao'] });
      const found = { factory: 'nemia', trust: 'nemia factory trust nemia', place };
      assert.deepEqual(untrustedFor([trusting, lacking], { repo: '/code/nemia' }), found);
      assert.equal(untrustedFor([trusting, lacking], { repo: '/code/pipao' }), undefined, 'another repository');
      assert.equal(untrustedFor([trusting, lacking], { repo: '/code/nemia/sub' }), undefined, 'a path beside it');
      assert.equal(untrustedFor([trusting, lacking], { repo: null }), undefined, 'a run on no repository');
      assert.equal(untrustedFor([trusting, factory('nemia')], { repo: '/code/nemia' }), undefined, 'a trusted place');
    },
  );
});

test('factoryOf, shownIn, workflowFactories, listPlace, hirePlaceOf: which factory a run, a card or a workflow is in, and what an address reads', async (t) => {
  await t.test('a run or a card is tagged with the factory it names, and with default when it names none or names default', () => {
    assert.equal(factoryOf({ factory: null }), 'default');
    assert.equal(factoryOf({ factory: 'default' }), 'default');
    assert.equal(factoryOf({ factory: 'nemia' }), 'nemia');
  });
  await t.test(
    "a filter keeps the runs or cards of its factory in their order — the default's naming none or naming default — and no filter keeps all",
    () => {
      assert.deepEqual(ids(shownIn(tagged, undefined)), ['q-1', 'd-1', 'n-1', 'd-2', 'n-2']);
      assert.deepEqual(ids(shownIn(tagged, 'nemia')), ['n-1', 'n-2']);
      assert.deepEqual(ids(shownIn(tagged, 'default')), ['d-1', 'd-2']);
      assert.deepEqual(ids(shownIn(tagged, 'gone')), []);
    },
  );
  await t.test(
    "REFUSED: a workflow is tagged only with the factories that attach it where it is found — the repository's on its repository, yours on any — never the default or a factory whose file does not read",
    () => {
      const factories = [
        factory('default', { default: true, repos: ['/r'], workflows: null, hires: {} }),
        factory('b-other', { repos: ['/elsewhere'], workflows: ['dev'] }),
        factory('a-here', { repos: ['/r'], workflows: ['dev'] }),
        factory('c-broken', { repos: ['/r'], workflows: ['dev'], hires: {}, error: '/wf/factories/c-broken.json is not JSON' }),
        factory('d-here', { repos: ['/r'], workflows: ['build'] }),
      ];
      assert.deepEqual(workflowFactories({ name: 'dev', from: 'repo' }, factories), ['a-here']);
      assert.deepEqual(workflowFactories({ name: 'dev', from: 'yours' }, factories), ['a-here', 'b-other']);
      assert.deepEqual(workflowFactories({ name: 'build', from: 'repo' }, factories), ['d-here']);
      assert.deepEqual(workflowFactories({ name: 'intake', from: 'yours' }, factories), []);
      assert.deepEqual(workflowFactories({ name: 'dev', from: 'repo' }, []), [], 'with no factories read, a workflow is in none');
    },
  );
  await t.test(
    "REFUSED: a named factory's workflows are read in it, on its own repository — never judged against the default factory's",
    () => {
      const factories = [fallback, factory('pipao', { repos: ['/code/pipao'], workflows: ['dev'] })];
      assert.deepEqual(listPlace({ factory: 'pipao' }, factories), {
        kind: 'in',
        place: { factory: 'pipao', repo: '/code/pipao' },
        repos: ['/code/pipao'],
      });
      assert.deepEqual(
        listPlace({ factory: 'pipao' }, factories.slice(1)),
        listPlace({ factory: 'pipao' }, factories),
        'default read or not',
      );
    },
  );
  await t.test(
    'REFUSED: the address reads every workflow with no factory or the default; a factory on several repositories is read on the one named, and asks which when none is',
    () => {
      const two = factory('quay', { repos: ['/a', '/b'] });
      const factories = [fallback, factory('nemia'), two];
      assert.deepEqual(listPlace({}, factories), { kind: 'every' });
      assert.deepEqual(listPlace({ repo: '/a' }, factories), { kind: 'every' });
      assert.deepEqual(listPlace({ factory: 'default' }, factories), { kind: 'every' });
      assert.deepEqual(listPlace({ factory: 'quay', repo: '/b' }, factories), {
        kind: 'in',
        place: { factory: 'quay', repo: '/b' },
        repos: ['/a', '/b'],
      });
      assert.deepEqual(listPlace({ factory: 'quay' }, factories), { kind: 'pick', factory: 'quay', repos: ['/a', '/b'] });
    },
  );
  await t.test(
    'REFUSED: a factory of no such name, one whose file does not read and one on no repository list nothing, and say why',
    () => {
      const broken = factory('broken', { error: '/wf/factories/broken.json is not JSON' });
      const homeless = factory('homeless', { repos: [] });
      const factories = [fallback, broken, homeless];
      assert.deepEqual(listPlace({ factory: 'gone' }, factories), { kind: 'refused', factory: 'gone', why: 'No factory is named gone.' });
      assert.deepEqual(listPlace({ factory: 'gone' }, []), { kind: 'refused', factory: 'gone', why: 'No factory is named gone.' });
      const why = (name: string, of: Factory) => {
        const floor = floorPlace(of);
        assert.ok(floor && 'why' in floor);
        assert.deepEqual(listPlace({ factory: name, repo: '/x' }, factories), { kind: 'refused', factory: name, why: floor.why });
      };
      why('broken', broken);
      why('homeless', homeless);
    },
  );
  await t.test(
    "REFUSED: a workflow read in a named factory is the factory's, never said to be this repository's; yours is yours anywhere",
    () => {
      assert.equal(fromWord('yours'), 'yours');
      assert.equal(fromWord('yours', 'pipao'), 'yours');
      assert.equal(fromWord('repo'), 'this repository');
      assert.equal(fromWord('repo', 'default'), 'this repository');
      assert.equal(fromWord('repo', 'pipao'), "the factory's");
    },
  );
  await t.test(
    "REFUSED: New agent's address names the step it hires into only whole — a factory, a workflow and a step, each a string not empty",
    () => {
      const whole = { factory: 'nemia', workflow: 'dev', step: 'implement' };
      assert.deepEqual(hirePlaceOf(whole), whole);
      assert.deepEqual(hirePlaceOf({ ...whole, other: 'x' }), whole);
      assert.deepEqual(hirePlaceOf({}), {});
      assert.deepEqual(hirePlaceOf({ ...whole, step: '' }), {}, 'a step named with nothing');
      assert.deepEqual(hirePlaceOf({ ...whole, factory: undefined }), {}, 'no factory');
      assert.deepEqual(hirePlaceOf({ ...whole, workflow: 3 }), {}, 'a workflow that is no string');
    },
  );
  await t.test("a page's address filters by the factory it names, and by none when it names none, an empty one or not one string", () => {
    assert.deepEqual(factorySearch({ factory: 'nemia' }), { factory: 'nemia' });
    assert.deepEqual(factorySearch({ factory: 'default', step: 'x' }), { factory: 'default' });
    for (const none of [{}, { factory: '' }, { factory: ['nemia'] }, { factory: 7 }])
      assert.equal(Object.hasOwn(factorySearch(none), 'factory'), false);
  });
  await t.test(
    'REFUSED: an agent made from New agent is hired only when the api takes the hire — a refusal is said, in its words, never passed over',
    async () => {
      const place = { factory: 'mill', workflow: 'mine', step: 'plan' };
      const sent: string[] = [];
      const taken = async (factory: string, step: string, agent: string) => {
        sent.push(`${factory} ${step} ${agent}`);
      };
      assert.deepEqual(await hireOnCreate(place, 'scribe', taken), { hired: true });
      assert.deepEqual(sent, ['mill mine/plan scribe'], 'the step is sent as <workflow>/<step>');
      const words = 'mill does not offer the workflow mine, so it hires no one into its steps.';
      assert.deepEqual(await hireOnCreate(place, 'scribe', () => Promise.reject(new Error(words))), { hired: false, why: words });
    },
  );
  await t.test("a template's condition is amiss when Applied is not true, or ConflictsPending is: the others are as they should be", () => {
    assert.equal(conditionAmiss({ type: 'Applied', status: 'True' }), false);
    assert.equal(conditionAmiss({ type: 'Applied', status: 'False' }), true);
    assert.equal(conditionAmiss({ type: 'ConflictsPending', status: 'False' }), false);
    assert.equal(conditionAmiss({ type: 'ConflictsPending', status: 'True' }), true);
  });
});
