/**
 * The Factory door's files layer: the door's walks (`test/factory-walks.ts`) on a fresh scratch store each, what only the files can be
 * asked — a key the model does not name kept by a write, a templated factory's wiring written into its tree, the default door's root, a
 * folder placed leaving no staging folder behind —
 * and the seam: no file of `src` but the door's imports the factories' store or calls a store the door is over, with no baseline.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { seamUses, sourcesUnder } from 'test-kit/debt';
import { importsIn, resolved } from 'test-kit/imports';
import { Effect } from 'effect';
import { scratch } from 'test-kit/scratch';
import { act, done, doorFrom, walksOn } from '../../../test/door-walks.ts';
import { aFactory, FACTORY_WALKS, readFiled } from '../../../test/factory-walks.ts';
import { FactoryDoor, factoryDoorFiles } from './factories.store.ts';
import { FactoryName } from '../factory.model.ts';
import { StoreRoot } from '../../config/root.store.ts';
import { generationOf } from './generation.ts';

const PKG = path.join(import.meta.dirname, '..', '..', '..');

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
  assert.equal(generationOf(readFiled(door, 'acme')), 1);
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
  assert.deepEqual(act(Effect.provideService(list, StoreRoot, root)), ['default', 'acme']);
  assert.deepEqual(act(list), { refused: 'Invalid' });
  assert.deepEqual(act(read), { refused: 'Invalid' });
});

/**
 * The functions of the stores the Factory door is over, which `src`'s code calls only through the door: each module-root spelling, and
 * each spelling that takes the store's root (`…At`), which a caller that names its root reaches through the door at that root instead
 * (`doorAt`, `doorAtOnce`).
 */
const SEAM = [
  'readFactoriesAt',
  'readFactoryAt',
  'addFactoryAt',
  'createFactoryAt',
  'removeFactoryAt',
  'rewriteFactoryAt',
  'templatedTreeAt',
  'treeOfAt',
  'factoryNamesAt',
  'startFactoryAt',
  'hireAgentAt',
  'fireAgentAt',
  'attachWorkflowAt',
  'setInstructionAt',
  'setScheduleAt',
  'clearScheduleAt',
  'readFactoryLevel',
  'writeFactoryLevel',
  'rulesWritten',
  'rulesCleared',
  'readInstructionAt',
  'writeInstructionText',
  'clearInstructionText',
  'readFactory',
  'readFactories',
  'addFactory',
  'removeFactory',
  'hireAgent',
  'fireAgent',
  'attachWorkflow',
  'setInstruction',
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
  'src/factory/rules/rules.store.ts',
  'src/factory/servers/servers.store.ts',
  'src/factory/instruction.store.ts',
  'src/factory/door/factories.store.ts',
];

/** The seam's calls in a file, comment lines left out. */
const SEAM_CALL = new RegExp(`(?<![\\w$.])(?:${SEAM.join('|')})\\s*\\(`, 'g');

/** The factories' store, by its path from the package: what no file of `src` but the door's imports. */
const STORE = 'src/factory/factory.store.ts';

/**
 * Each file of `sources` that imports the factories' store or calls a store the door is over, in the words a break says: the door is
 * the only way to the factories, so a file that reaches past it is refused with no baseline to hold it.
 */
const seamBreaks = (sources: Readonly<Record<string, string>>): string[] => [
  ...Object.entries(sources)
    .filter(([file, text]) => importsIn(text).some(({ spec }) => resolved(file, spec) === STORE))
    .map(([file]) => `${file} imports ${STORE}: import from src/factory/door/factories.store.ts, the Factory door, instead`),
  ...[...seamUses(sources, SEAM_CALL, { bindings: true })].map(
    ([file, n]) => `${file} calls the factories' stores ${n} time(s): yield FactoryDoor, or doorAtOnce(home, …) where no Effect runs`,
  ),
];

test("no file of src but the door's imports the factories' store or calls a store the door is over", () => {
  assert.deepEqual(seamBreaks(sourcesUnder(PKG, 'src', OWN)), []);
});

test("REFUSED: a planted import of the factories' store, a module spelling and a rooted spelling, each by its file", () => {
  const sources = sourcesUnder(PKG, 'src', OWN);
  const imported = {
    ...sources,
    'src/factory/wiring/wire.verb.ts': `import { factoriesDirAt } from '../factory.store.ts';\n${sources['src/factory/wiring/wire.verb.ts']}`,
  };
  assert.equal(seamBreaks(imported).length, 1, 'an import of the store, however little it takes, is refused');
  const again = {
    ...sources,
    'src/factory/wiring/wire.verb.ts': `${sources['src/factory/wiring/wire.verb.ts']}\nconst x = readFactory('a');\n`,
  };
  assert.equal(seamBreaks(again).length, 1);
  const rootedAgain = {
    ...sources,
    'src/workflows/workflows.verb.ts': `${sources['src/workflows/workflows.verb.ts']}\nconst y = readFactoryAt(home, 'a');\n`,
  };
  assert.equal(seamBreaks(rootedAgain).length, 1, 'a rooted spelling is a bypass too');
});

test('a folder placed, refused or failing, leaves no hidden staging folder beside the factories, and a failing one no folder', () => {
  const { root, door } = store();
  const file = (at: string) => ({ path: at, mode: 0o644, bytes: new TextEncoder().encode('words\n') });
  done(door.folder.place(FactoryName.read('acme'), [file('tree/a.md')]));
  assert.deepEqual(act(door.folder.place(FactoryName.read('acme'), [file('tree/b.md')])), { refused: 'Conflict' });
  assert.throws(() => act(door.folder.place(FactoryName.read('other'), [file('tree'), file('tree/a.md')])));
  assert.deepEqual(fs.readdirSync(path.join(root, 'factories')), ['acme']);
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
