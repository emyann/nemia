/**
 * The Factory door's files layer: the door's walks (`test/factory-walks.ts`) on a fresh scratch store each, what only the files can be
 * asked — a key the model does not name kept by a write, a templated factory's wiring written into its tree, the default door's root —
 * and the seam's debt, the code of `src` still on the stores the door is over (`test/factory-door.baseline.ts`), which only shrinks.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { debtBreaks as heldTo, seamUses as usesOf, sourcesUnder } from 'test-kit/debt';
import { Effect } from 'effect';
import { scratch } from 'test-kit/scratch';
import { act, done, doorFrom, walksOn } from '../../test/door-walks.ts';
import { aFactory, FACTORY_WALKS } from '../../test/factory-walks.ts';
import { FactoryDoor, factoryDoorFiles } from '../factories/factories.store.ts';
import { FactoryName } from '../factory/factory.model.ts';
import { StoreRoot } from '../config/root.store.ts';
import { generationOf } from './generation.ts';

const PKG = path.join(import.meta.dirname, '..', '..');

for (const [name, body] of walksOn(FACTORY_WALKS, () => {
  const root = scratch('wf-factory-door-');
  return { door: doorFrom(FactoryDoor, factoryDoorFiles(root)), root, layer: 'files' };
}))
  test(name, body);

/** A fresh store, its Factory door over the files, and the file of the factory `acme` in it. */
const store = () => {
  const root = scratch('wf-factory-door-');
  return { root, door: doorFrom(FactoryDoor, factoryDoorFiles(root)), file: path.join(root, 'factories', 'acme.json') };
};

test('a key the model does not name is kept, where it was, by a write back', () => {
  const { door, file } = store();
  done(door.factories.create(aFactory('acme', { workflows: ['build'] })));
  const planted = { ...(JSON.parse(fs.readFileSync(file, 'utf8')) as object), later: 1 };
  fs.writeFileSync(file, `${JSON.stringify(planted, null, 2)}\n`);
  done(door.factories.rewrite(aFactory('acme', { workflows: ['build'], hires: { 'build/review': 'reviewer' } })));
  assert.deepEqual(JSON.parse(fs.readFileSync(file, 'utf8')), { ...planted, hires: { 'build/review': 'reviewer' }, generation: 2 });
});

test('a file written before the counter reads as generation 1, and a change of its spec writes 2', () => {
  const { door, file } = store();
  done(door.factories.create(aFactory('acme', { workflows: ['build'] })));
  const { generation: _filed, ...old } = JSON.parse(fs.readFileSync(file, 'utf8')) as { generation?: number };
  fs.writeFileSync(file, `${JSON.stringify(old, null, 2)}\n`);
  assert.equal(generationOf(done(door.factories.read(FactoryName.read('acme')))), 1);
  done(door.factories.rewrite(aFactory('acme', { workflows: ['build'], hires: { 'build/review': 'reviewer' } })));
  assert.equal((JSON.parse(fs.readFileSync(file, 'utf8')) as { generation?: number }).generation, 2);
});

test("a templated factory's workflows and hires are written into its tree, and refused Conflict before the tree is rendered", () => {
  const { root, door, file } = store();
  const template = { source: '/templates/shop', version: '1', params: {} };
  done(door.factories.create(aFactory('acme', { template })));
  const before = fs.readFileSync(file, 'utf8');
  assert.deepEqual(act(door.factories.rewrite(aFactory('acme', { template, workflows: ['build'] }))), { refused: 'Conflict' });
  const tree = path.join(root, 'factories', 'acme', 'tree');
  fs.mkdirSync(tree, { recursive: true });
  fs.writeFileSync(path.join(tree, 'factory.json'), `${JSON.stringify({ workflows: [], hires: {} })}\n`);
  const written = done(door.factories.rewrite(aFactory('acme', { template, workflows: ['build'], hires: { 'build/review': 'reviewer' } })));
  assert.equal(written, path.join(tree, 'factory.json'));
  assert.deepEqual(JSON.parse(fs.readFileSync(written, 'utf8')), { workflows: ['build'], hires: { 'build/review': 'reviewer' } });
  assert.deepEqual(
    JSON.parse(fs.readFileSync(file, 'utf8')),
    { ...(JSON.parse(before) as object), generation: 2 },
    "the factory's own file is left as it was but for its generation, counted for the hire its tree took",
  );
});

test('the default door reads the files at the store root the program is given, and refuses Invalid where it was given none', () => {
  const { root, door } = store();
  done(door.factories.create(aFactory('acme')));
  const list = Effect.gen(function* () {
    return yield* (yield* FactoryDoor).factories.list();
  });
  const read = Effect.gen(function* () {
    return yield* (yield* FactoryDoor).factories.read(FactoryName.read('acme'));
  });
  assert.deepEqual(act(Effect.provideService(list, StoreRoot, root)), ['acme']);
  assert.deepEqual(act(list), { refused: 'Invalid' });
  assert.deepEqual(act(read), { refused: 'Invalid' });
});

/** The functions of the stores the Factory door is over that `src`'s code still calls rather than yielding the door. */
const SEAM = [
  'readFactory',
  'readFactories',
  'addFactory',
  'removeFactory',
  'hireAgent',
  'fireAgent',
  'attachWorkflow',
  'detachWorkflow',
  'setInstruction',
  'setRevisions',
  'setSchedule',
  'clearSchedule',
  'factoryNames',
  'startFactory',
  'templatedTree',
  'treeOf',
  'readFactoryLevel',
  'writeFactoryLevel',
  'rulesAt',
  'writeRules',
  'clearRules',
  'factoryServers',
  'readFactoryServers',
  'writeFactoryServers',
];

/** The stores themselves, which define the seam, and the door's files layer over them: not counted. */
const OWN = [
  'src/factory/factory.store.ts',
  'src/level/level.store.ts',
  'src/rules/rules.store.ts',
  'src/servers/servers.store.ts',
  'src/factories/factories.store.ts',
];

/** Every file of `src` but the tests and the stores, by its path from the package. */
const sourcesOfSrc = (): Record<string, string> => sourcesUnder(PKG, 'src', OWN);

/** The seam's calls in each file, comment lines left out: what `FACTORY_DOOR_DEBT` counts. */
const seamUses = (sources: Record<string, string>): Map<string, number> =>
  usesOf(sources, new RegExp(`(?<![\\w$.])(?:${SEAM.join('|')})\\s*\\(`, 'g'));

/** Why the uses of `sources` break the baseline `debt`: a file it does not name, a count grown, a count fallen. */
function debtBreaks(sources: Record<string, string>, debt: Readonly<Record<string, number>>): string[] {
  return heldTo(seamUses(sources), debt).map(({ file, uses: n, owed, kind }) =>
    kind === 'grown'
      ? `${file} calls the factories' stores ${n} time(s) where test/factory-door.baseline.ts names ${owed}: yield FactoryDoor (src/factories/factories.store.ts) instead`
      : kind === 'fallen'
        ? `${file} calls the factories' stores ${n} time(s): lower its count in test/factory-door.baseline.ts to ${n}, which only shrinks`
        : `${file} calls the factories' stores no more: take its line out of test/factory-door.baseline.ts`,
  );
}

test("no file of src calls the factories' stores but as test/factory-door.baseline.ts counts it, and the count only shrinks", async () => {
  const { FACTORY_DOOR_DEBT } = await import('../../test/factory-door.baseline.ts');
  assert.deepEqual(debtBreaks(sourcesOfSrc(), FACTORY_DOOR_DEBT), []);
});

test('REFUSED: a converted file that calls a store again, and a count the baseline holds above what is left', async () => {
  const { FACTORY_DOOR_DEBT } = await import('../../test/factory-door.baseline.ts');
  const sources = sourcesOfSrc();
  const again = { ...sources, 'src/wiring/wire.verb.ts': `${sources['src/wiring/wire.verb.ts']}\nconst x = readFactory('a');\n` };
  assert.equal(debtBreaks(again, FACTORY_DOOR_DEBT).length, 1);
  const [first] = Object.keys(FACTORY_DOOR_DEBT);
  assert.equal(debtBreaks(sources, { ...FACTORY_DOOR_DEBT, [first]: (FACTORY_DOOR_DEBT[first] ?? 0) + 1 }).length, 1);
});

/** How many changes `write` counts on the file of `acme`, a factory filed with a level file at manual. */
const after = (write: (door: ReturnType<typeof store>['door']) => void): number => {
  const { door, file } = store();
  done(door.factories.create(aFactory('acme', { workflows: ['build'] })));
  done(door.level.write(FactoryName.read('acme'), { level: 'manual', since: '2026-11-01T00:00:00.000Z' }));
  const held = (): number => (JSON.parse(fs.readFileSync(file, 'utf8')) as { generation: number }).generation;
  const before = held();
  write(door);
  return held() - before;
};

test("which writes count a change of the spec: the door's, row by row", async (t) => {
  await t.test('a schedule written keeps it', () => {
    const schedules = { build: { cron: '0 9 * * 1', brief: 'The weekly build', since: '2026-11-01T00:00:00.000Z' } };
    assert.equal(
      after((door) => done(door.factories.rewrite(aFactory('acme', { workflows: ['build'], schedules })))),
      0,
    );
  });
  await t.test("the instruction's place written keeps it", () => {
    const instruction = { store: true } as const;
    assert.equal(
      after((door) => done(door.factories.rewrite(aFactory('acme', { workflows: ['build'], instruction })))),
      0,
    );
  });
  await t.test('a level written with a new value counts one more', () => {
    assert.equal(
      after((door) => done(door.level.write(FactoryName.read('acme'), { level: 'auto', since: '2026-11-02T00:00:00.000Z' }))),
      1,
    );
  });
  await t.test('the same level written again keeps it', () => {
    assert.equal(
      after((door) => done(door.level.write(FactoryName.read('acme'), { level: 'manual', since: '2026-11-02T00:00:00.000Z' }))),
      0,
    );
  });
  await t.test('a raise, which the spec does not hold, keeps it', () => {
    const raise = { level: 'auto' as const, until: '2026-11-03T00:00:00.000Z' };
    assert.equal(
      after((door) => done(door.level.write(FactoryName.read('acme'), { level: 'manual', since: '2026-11-02T00:00:00.000Z', raise }))),
      0,
    );
  });
});
