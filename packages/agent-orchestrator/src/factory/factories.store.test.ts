/**
 * The Factory door's files layer: the door's walks (`test/factory-walks.ts`) on a fresh scratch store each, what only the files can be
 * asked — a key the model does not name kept by a write, a templated factory's wiring written into its tree, the default door's root —
 * and the seam's debt, the code of `src` still on the stores the door is over (`test/factory-door.baseline.ts`), which only shrinks.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { Effect } from 'effect';
import { scratch } from '../../test/scratch.ts';
import { act, done, doorFrom, walksOn } from '../../test/door-walks.ts';
import { aFactory, FACTORY_WALKS } from '../../test/factory-walks.ts';
import { FactoryDoor, factoryDoorFiles } from './factories.store.ts';
import { FactoryName } from './factory.model.ts';
import { StoreRoot } from '../config/root.store.ts';

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
  done(door.factories.rewrite(aFactory('acme', { workflows: ['build'], hires: { 'build/review': 'agora' } })));
  assert.deepEqual(JSON.parse(fs.readFileSync(file, 'utf8')), { ...planted, hires: { 'build/review': 'agora' } });
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
  const written = done(door.factories.rewrite(aFactory('acme', { template, workflows: ['build'], hires: { 'build/review': 'agora' } })));
  assert.equal(written, path.join(tree, 'factory.json'));
  assert.deepEqual(JSON.parse(fs.readFileSync(written, 'utf8')), { workflows: ['build'], hires: { 'build/review': 'agora' } });
  assert.equal(fs.readFileSync(file, 'utf8'), before, "the factory's own file is left as it was");
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
  'retargetTemplate',
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
  'src/factory/factories.store.ts',
];

/** Every file of `src` but the tests and the stores, by its path from the package. */
function sourcesOfSrc(): Record<string, string> {
  const out: Record<string, string> = {};
  for (const entry of fs.readdirSync(path.join(PKG, 'src'), { recursive: true, withFileTypes: true })) {
    if (!entry.isFile() || !entry.name.endsWith('.ts') || entry.name.endsWith('.test.ts')) continue;
    const file = path.relative(PKG, path.join(entry.parentPath, entry.name)).split(path.sep).join('/');
    if (!OWN.includes(file)) out[file] = fs.readFileSync(path.join(PKG, file), 'utf8');
  }
  return out;
}

/** The seam's calls in each file, comment lines left out: what `FACTORY_DOOR_DEBT` counts. */
function seamUses(sources: Record<string, string>): Map<string, number> {
  const call = new RegExp(`(?<![\\w$.])(?:${SEAM.join('|')})\\s*\\(`, 'g');
  const uses = new Map<string, number>();
  for (const [file, text] of Object.entries(sources)) {
    const code = text
      .split('\n')
      .filter((line) => !/^\s*(\/\/|\/\*|\*)/.test(line))
      .join('\n');
    const n = [...code.matchAll(call)].length;
    if (n) uses.set(file, n);
  }
  return uses;
}

/** Why the uses of `sources` break the baseline `debt`: a file it does not name, a count grown, a count fallen. */
function debtBreaks(sources: Record<string, string>, debt: Readonly<Record<string, number>>): string[] {
  const uses = seamUses(sources);
  const out: string[] = [];
  for (const [file, n] of uses) {
    const owed = debt[file] ?? 0;
    if (n > owed)
      out.push(
        `${file} calls the factories' stores ${n} time(s) where test/factory-door.baseline.ts names ${owed}: yield FactoryDoor (src/factory/factories.store.ts) instead`,
      );
    if (n < owed)
      out.push(
        `${file} calls the factories' stores ${n} time(s): lower its count in test/factory-door.baseline.ts to ${n}, which only shrinks`,
      );
  }
  for (const file of Object.keys(debt))
    if (!uses.has(file)) out.push(`${file} calls the factories' stores no more: take its line out of test/factory-door.baseline.ts`);
  return out;
}

test("no file of src calls the factories' stores but as test/factory-door.baseline.ts counts it, and the count only shrinks", async () => {
  const { FACTORY_DOOR_DEBT } = await import('../../test/factory-door.baseline.ts');
  assert.deepEqual(debtBreaks(sourcesOfSrc(), FACTORY_DOOR_DEBT), []);
});

test('REFUSED: a converted file that calls a store again, and a count the baseline holds above what is left', async () => {
  const { FACTORY_DOOR_DEBT } = await import('../../test/factory-door.baseline.ts');
  const sources = sourcesOfSrc();
  const again = { ...sources, 'src/factory/wire.verb.ts': `${sources['src/factory/wire.verb.ts']}\nconst x = readFactory('a');\n` };
  assert.equal(debtBreaks(again, FACTORY_DOOR_DEBT).length, 1);
  const [first] = Object.keys(FACTORY_DOOR_DEBT);
  assert.equal(debtBreaks(sources, { ...FACTORY_DOOR_DEBT, [first]: (FACTORY_DOOR_DEBT[first] ?? 0) + 1 }).length, 1);
});
