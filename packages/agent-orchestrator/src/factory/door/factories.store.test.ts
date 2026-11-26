/**
 * The Factory door over the keyspace: the door's walks (`test/factory-walks.ts`) on a fresh scratch store each, what only a store on
 * disk can be asked — a key the model does not name kept by a write, a templated factory's wiring written into its tree, the default
 * door's root, a folder placed leaving no staging folder behind, the files of a store from before the keyspace imported and moved aside,
 * the records one transaction writes or removes together — and the seam: no file of `src` but the door's imports the factories' store or
 * calls a store the door is over, with no baseline.
 */
import { describe, test } from 'vitest';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { seamUses, sourcesUnder } from 'test-kit/debt';
import { importsIn, resolved } from 'test-kit/imports';
import { Effect } from 'effect';
import { scratch } from 'test-kit/scratch';
import { act, done, doorFrom, walksOn } from '../../../test/door-walks.ts';
import { aFactory, FACTORY_WALKS, readFiled } from '../../../test/factory-walks.ts';
import { factoryText, plantFactory, recordText } from '../../../testing.ts';
import { FactoryDoor, factoryDoorAt } from './factories.store.ts';
import { appliedKey, levelKey, serversKey } from './factory-keys.ts';
import { FactoryName } from '../factory.model.ts';
import { StoreRoot } from '../../config/root.store.ts';
import { generationOf } from './generation.ts';

const PKG = path.join(import.meta.dirname, '..', '..', '..');

for (const [name, body] of walksOn(FACTORY_WALKS, () => {
  const root = scratch('wf-factory-door-');
  return { door: doorFrom(FactoryDoor, factoryDoorAt(root)), root, layer: 'keyspace' };
}))
  test(name, body);

/** A fresh store and its Factory door over its keyspace. */
const store = () => {
  const root = scratch('wf-factory-door-');
  return { root, door: doorFrom(FactoryDoor, factoryDoorAt(root)) };
};

/** The record of the factory `acme` in `root`, parsed. */
const acme = (root: string) => JSON.parse(factoryText(root, 'acme') ?? '{}') as Record<string, unknown>;

test('a key the model does not name is kept, where it was, by a write back', () => {
  const { root, door } = store();
  done(door.factories.create(aFactory('acme', { workflows: ['build'] })));
  const planted = { ...acme(root), later: 1 };
  plantFactory(root, 'acme', `${JSON.stringify(planted, null, 2)}\n`);
  done(door.factories.rewrite(aFactory('acme', { workflows: ['build'], hires: { 'build/review': 'reviewer' } })));
  assert.deepEqual(acme(root), { ...planted, hires: { 'build/review': 'reviewer' }, generation: 2 });
});

test('a record written before the counter reads as generation 1, and a change of its spec writes 2', () => {
  const { root, door } = store();
  done(door.factories.create(aFactory('acme', { workflows: ['build'] })));
  const { generation: _filed, ...old } = acme(root);
  plantFactory(root, 'acme', `${JSON.stringify(old, null, 2)}\n`);
  assert.equal(generationOf(readFiled(door, 'acme')), 1);
  done(door.factories.rewrite(aFactory('acme', { workflows: ['build'], hires: { 'build/review': 'reviewer' } })));
  assert.equal(acme(root).generation, 2);
});

test("a templated factory's workflows and hires are written into its tree, and refused Conflict before the tree is rendered", () => {
  const { root, door } = store();
  const template = { source: '/templates/shop', version: '1', params: {} };
  done(door.factories.create(aFactory('acme', { template })));
  const before = factoryText(root, 'acme') ?? '';
  assert.deepEqual(act(door.factories.rewrite(aFactory('acme', { template, workflows: ['build'] }))), { refused: 'Conflict' });
  const tree = path.join(root, 'factories', 'acme', 'tree');
  fs.mkdirSync(tree, { recursive: true });
  fs.writeFileSync(path.join(tree, 'factory.json'), `${JSON.stringify({ workflows: [], hires: {} })}\n`);
  const written = done(door.factories.rewrite(aFactory('acme', { template, workflows: ['build'], hires: { 'build/review': 'reviewer' } })));
  assert.equal(written, path.join(tree, 'factory.json'));
  assert.deepEqual(JSON.parse(fs.readFileSync(written, 'utf8')), { workflows: ['build'], hires: { 'build/review': 'reviewer' } });
  assert.deepEqual(
    acme(root),
    { ...(JSON.parse(before) as object), generation: 2 },
    "the factory's own record is left as it was but for its generation, counted for the hire its tree took",
  );
});

test('the default door reads the records at the store root the program is given, and refuses Invalid where it was given none', () => {
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

describe('the files of a store from before the keyspace', () => {
  const FILES = path.join('factories');
  const plant = (root: string, file: string, text: string) => {
    fs.mkdirSync(path.dirname(path.join(root, file)), { recursive: true });
    fs.writeFileSync(path.join(root, file), text);
  };
  test('are imported once: the factory, its level, servers and status each a record of the text it held, each file moved aside', () => {
    const root = scratch('wf-factory-import-');
    const level = `${JSON.stringify({ level: 'semi-auto', since: '2026-11-01T00:00:00.000Z' })}\n`;
    const servers = `${JSON.stringify({ servers: { docs: { type: 'sse', url: 'https://docs.example/mcp' } } })}\n`;
    const status = `${JSON.stringify({ version: '1', digest: null, params: {}, conditions: [] })}\n`;
    plant(root, path.join(FILES, 'acme.json'), `${JSON.stringify({ volumes: [{ path: '/repo', readOnly: false }] })}\n`);
    plant(root, path.join(FILES, 'acme', 'level.json'), level);
    plant(root, path.join(FILES, 'acme', 'servers.json'), servers);
    plant(root, path.join(FILES, 'acme', 'status.json'), status);
    const door = doorFrom(FactoryDoor, factoryDoorAt(root));
    assert.deepEqual(done(door.factories.list()), ['default', 'acme']);
    assert.deepEqual(
      [recordText(root, levelKey('acme')), recordText(root, serversKey('acme')), recordText(root, appliedKey('acme'))],
      [level, servers, status],
    );
    assert.deepEqual(
      ['acme.json', path.join('acme', 'level.json'), path.join('acme', 'servers.json'), path.join('acme', 'status.json')].map((f) =>
        fs.existsSync(path.join(root, 'imported', FILES, f)),
      ),
      [true, true, true, true],
    );
    assert.deepEqual(
      ['acme.json', path.join('acme', 'level.json')].map((f) => fs.existsSync(path.join(root, FILES, f))),
      [false, false],
      'no file is left where it was',
    );
    assert.equal(done(door.level.read(FactoryName.read('acme')))?.level, 'semi-auto');
  });
  test("whose names are no factory's, and the default factory's, stay where they are and list none", () => {
    const root = scratch('wf-factory-import-');
    plant(root, path.join(FILES, 'default.json'), '{"volumes": []}\n');
    plant(root, path.join(FILES, 'Nemia.json'), '{"volumes": []}\n');
    const door = doorFrom(FactoryDoor, factoryDoorAt(root));
    assert.deepEqual(done(door.factories.list()), ['default']);
    assert.deepEqual(fs.readdirSync(path.join(root, FILES)).sort(), ['Nemia.json', 'default.json']);
  });
  test('where a record is filed already are not written over it, and are moved aside beside the first', () => {
    const root = scratch('wf-factory-import-');
    const door = doorFrom(FactoryDoor, factoryDoorAt(root));
    done(door.factories.create(aFactory('acme')));
    const before = factoryText(root, 'acme');
    plant(root, path.join(FILES, 'acme.json'), '{"volumes": []}\n');
    assert.deepEqual(done(door.factories.list()), ['default', 'acme']);
    assert.equal(factoryText(root, 'acme'), before);
  });
});

describe('the records one transaction writes together', () => {
  test("a factory removed takes its level, servers and status with it, and a factory it is not removes none of another's", () => {
    const { root, door } = store();
    for (const name of ['acme', 'other']) {
      done(door.factories.create(aFactory(name)));
      done(door.level.write(FactoryName.read(name), { level: 'manual', since: '2026-11-01T00:00:00.000Z' }));
      done(door.servers.write(FactoryName.read(name), { docs: { type: 'sse', url: 'https://docs.example/mcp' } }));
    }
    done(door.factories.remove(FactoryName.read('acme')));
    assert.deepEqual(
      [factoryText(root, 'acme'), recordText(root, levelKey('acme')), recordText(root, serversKey('acme'))],
      [undefined, undefined, undefined],
    );
    assert.deepEqual(
      [factoryText(root, 'other'), recordText(root, levelKey('other')), recordText(root, serversKey('other'))].map((t) => t !== undefined),
      [true, true, true],
    );
  });
  test('a level written beside the generation it counts: the level record and the factory record move together', () => {
    const { root, door } = store();
    done(door.factories.create(aFactory('acme')));
    done(door.level.write(FactoryName.read('acme'), { level: 'manual', since: '2026-11-01T00:00:00.000Z' }));
    const generation = acme(root).generation;
    done(door.level.write(FactoryName.read('acme'), { level: 'auto', since: '2026-11-02T00:00:00.000Z' }));
    assert.deepEqual(
      [acme(root).generation, JSON.parse(recordText(root, levelKey('acme')) ?? '{}').level],
      [Number(generation) + 1, 'auto'],
    );
  });
});

/**
 * The functions of the stores the Factory door is over, which `src`'s code calls only through the door: each module-root spelling, and
 * each spelling that takes the store's root (`…At`), which a caller that names its root reaches through the door at that root instead
 * (`doorAt`).
 */
const SEAM = [
  'doorAtOnce',
  'listedAtOnce',
  'filedAtOnce',
  'readFactoryAtOnce',
  'startFactoryAtOnce',
  'templatedAtOnce',
  'templatedTreeOf',
  'factoryAtOnce',
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
  'src/factory/door/records.store.ts',
];

/** The seam's calls in a file, comment lines left out. */
const SEAM_CALL = new RegExp(`(?<![\\w$.])(?:${SEAM.join('|')})\\s*\\(`, 'g');

/** The factories' store, by its path from the package: what no file of `src` but the door's imports. */
const STORE = 'src/factory/factory.store.ts';

/**
 * Each file of `sources` that imports the factories' store or calls a store the door is over, in the words a break says: the door is
 * the only way to the factories, so a file that reaches past it is refused with no baseline to hold it.
 */
const seamBreaks = (sources: Readonly<Record<string, string>>) => [
  ...Object.entries(sources)
    .filter(([file, text]) => importsIn(text).some(({ spec }) => resolved(file, spec) === STORE))
    .map(([file]) => `${file} imports ${STORE}: import from src/factory/door/factories.store.ts, the Factory door, instead`),
  ...[...seamUses(sources, SEAM_CALL, { bindings: true })].map(
    ([file, n]) => `${file} calls the factories' stores ${n} time(s): yield FactoryDoor`,
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
  const atOnce = {
    ...sources,
    'src/workflows/workflows.verb.ts': `${sources['src/workflows/workflows.verb.ts']}\nconst z = listedAtOnce(home);\n`,
  };
  assert.equal(seamBreaks(atOnce).length, 1, 'the spellings that ran the door at once are gone, and a call of one is refused');
});

test('a folder placed, refused or failing, leaves no hidden staging folder beside the factories, and a failing one no folder', () => {
  const { root, door } = store();
  const file = (at: string) => ({ path: at, mode: 0o644, bytes: new TextEncoder().encode('words\n') });
  done(door.folder.place(FactoryName.read('acme'), [file('tree/a.md')]));
  assert.deepEqual(act(door.folder.place(FactoryName.read('acme'), [file('tree/b.md')])), { refused: 'Conflict' });
  assert.throws(() => act(door.folder.place(FactoryName.read('other'), [file('tree'), file('tree/a.md')])));
  assert.deepEqual(fs.readdirSync(path.join(root, 'factories')), ['acme']);
});

/** How many changes `write` counts on the record of `acme`, a factory filed with a level record at manual. */
const after = (write: (door: ReturnType<typeof store>['door']) => void) => {
  const { root, door } = store();
  done(door.factories.create(aFactory('acme', { workflows: ['build'] })));
  done(door.level.write(FactoryName.read('acme'), { level: 'manual', since: '2026-11-01T00:00:00.000Z' }));
  const held = () => Number(acme(root).generation);
  const before = held();
  write(door);
  return held() - before;
};

describe("which writes count a change of the spec: the door's, row by row", () => {
  test('a schedule written keeps it', () => {
    const schedules = { build: { cron: '0 9 * * 1', brief: 'The weekly build', since: '2026-11-01T00:00:00.000Z' } };
    assert.equal(
      after((door) => done(door.factories.rewrite(aFactory('acme', { workflows: ['build'], schedules })))),
      0,
    );
  });
  test("the instruction's place written keeps it", () => {
    const instruction = { store: true } as const;
    assert.equal(
      after((door) => done(door.factories.rewrite(aFactory('acme', { workflows: ['build'], instruction })))),
      0,
    );
  });
  test('a level written with a new value counts one more', () => {
    assert.equal(
      after((door) => done(door.level.write(FactoryName.read('acme'), { level: 'auto', since: '2026-11-02T00:00:00.000Z' }))),
      1,
    );
  });
  test('the same level written again keeps it', () => {
    assert.equal(
      after((door) => done(door.level.write(FactoryName.read('acme'), { level: 'manual', since: '2026-11-02T00:00:00.000Z' }))),
      0,
    );
  });
  test('a raise, which the spec does not hold, keeps it', () => {
    const raise = { level: 'auto' as const, until: '2026-11-03T00:00:00.000Z' };
    assert.equal(
      after((door) => done(door.level.write(FactoryName.read('acme'), { level: 'manual', since: '2026-11-02T00:00:00.000Z', raise }))),
      0,
    );
  });
});
