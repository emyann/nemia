/**
 * A factory moved between two stores, on the doors' memory stand-ins and the test place: each store a root of its own with its own
 * Factory, Card and Run doors. The export reads the source whole — its file, its folder packed but what stays, its template as a request
 * gives one, the cards that follow and those a run keeps — and the import files it on the target, the api's way (`withTemplateTaken`, the
 * template kept where the factory is made): all or nothing, every refusal before a write, and what it wrote taken back on a failure after.
 */
import { beforeAll, describe, test } from 'vitest';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { Cause, Effect, Exit, Layer } from 'effect';
import type { FactoryExport } from 'objects';
import { scratch } from 'test-kit/scratch';
import { testPlace } from '../../../place/memory/index.ts';
import { eachTest } from '../../../test/placed.ts';
import { doorFrom, done } from '../../../test/door-walks.ts';
import { aCard } from '../../../test/card-walks.ts';
import { aRun } from '../../../test/run-walks.ts';
import { StoreRoot } from '../../config/root.store.ts';
import { PlaceService } from '../../place/place.store.ts';
import { FactoryDoor, type FactoryDoorShape } from '../door/factories.store.ts';
import { factoryDoorMemory } from '../door/memory.store.ts';
import { CardDoor, type CardDoorShape } from '../../cards/cards.store.ts';
import { cardDoorMemory } from '../../cards/memory.store.ts';
import { RunDoor, type RunDoorShape } from '../../runs/runs.store.ts';
import { runDoorMemory } from '../../runs/memory.store.ts';
import { FactoryName, isDefaultFactory } from '../factory.model.ts';
import { CardName } from '../../inbox/inbox.model.ts';
import { parseInboxCard } from '../../inbox/inbox.ts';
import { unpackArchive } from '../../archive/archive.ts';
import { withTemplateTaken } from '../../template/given.store.ts';
import type { Factory } from '../factory.ts';
import { factoryExported, factoryImported } from './move.verb.ts';

const stand = eachTest(testPlace);
const SINCE = '2026-11-01T00:00:00.000Z';
const NAME = FactoryName.read('shop');

/** One store: its root and its doors, each over memory. */
type Side = {
  readonly root: string;
  readonly layer: Layer.Layer<never>;
  readonly factories: FactoryDoorShape;
  readonly cards: CardDoorShape;
  readonly runs: RunDoorShape;
};

/** A store of its own, `cards` the Card door's layer where a test gives one. */
function side(prefix: string, cards: Layer.Layer<never> = cardDoorMemory()): Side {
  const factories = factoryDoorMemory();
  const runs = runDoorMemory();
  return {
    root: scratch(prefix),
    layer: Layer.mergeAll(factories, cards, runs),
    factories: doorFrom(FactoryDoor, factories),
    cards: doorFrom(CardDoor, cards),
    runs: doorFrom(RunDoor, runs),
  };
}

/** `program` run on the store `s` and this test's place: how it ended. */
const on = <A, E>(s: Side, program: Effect.Effect<A, E, StoreRoot | PlaceService>): Promise<Exit.Exit<A, E>> =>
  Effect.runPromiseExit(program.pipe(Effect.provide(s.layer), Effect.provide(stand().layer), Effect.provideService(StoreRoot, s.root)));

/** What `exit` answered; its failure fails the test. */
const answer = <A, E>(exit: Exit.Exit<A, E>): A => {
  if (Exit.isSuccess(exit)) return exit.value;
  return assert.fail(Cause.pretty(exit.cause));
};

/** The kind and the words of the refusal `exit` failed with. */
const refusal = <A, E>(exit: Exit.Exit<A, E>): { kind: string; message: string } => {
  if (Exit.isSuccess(exit)) return assert.fail('it was not refused');
  const failed = exit.cause.reasons.find(Cause.isFailReason);
  const error = failed?.error as { _tag?: string; message?: string } | undefined;
  return { kind: error?._tag ?? 'none', message: error?.message ?? '' };
};

/** A file of a folder holding `text`. */
const fileOf = (at: string, text: string) => ({ path: at, mode: 0o644, bytes: new TextEncoder().encode(text) });

/** A template's folder, as `nemia template pack` packs one. */
function templateFolder(): string {
  const at = path.join(scratch('wf-move-template-'), 'shop-template');
  fs.mkdirSync(path.join(at, 'workflows', 'press'), { recursive: true });
  fs.writeFileSync(path.join(at, 'nemia.yaml'), 'kind: FactoryTemplate\nmetadata:\n  name: shop-template\n');
  fs.writeFileSync(path.join(at, 'workflows', 'press', 'implement.md'), '---\n---\nBuild it.\n');
  return at;
}

/**
 * The source's factory `shop`: made from a template kept at a folder of the source's machine, on one repository it cloned from its origin
 * (a repository of the test place), its folder with its tree, its base, a proposal and a delegation, its level, and three cards: one to
 * follow, one a run was started from, one of another factory.
 */
function planted(src: Side, template = templateFolder()): { factory: Factory; origin: string } {
  const originDir = path.join(scratch('wf-move-origin-'), 'acme', 'shop');
  fs.mkdirSync(originDir, { recursive: true });
  stand().world.repository(originDir, { 'README.md': 'shop\n' });
  const origin = pathToFileURL(originDir).href;
  const clone = path.join(src.root, 'clones', 'localhost', 'acme', 'shop');
  const factory: Factory = {
    name: 'shop',
    repos: [clone],
    workflows: [],
    hires: {},
    schedules: {},
    origins: { [clone]: origin },
    template: { source: template, version: '1.0.0', params: { team: 'ann' } },
    tree: path.join(src.root, 'factories', 'shop', 'tree'),
  };
  done(src.factories.factories.create(factory));
  done(
    src.factories.folder.place(NAME, [
      fileOf('tree/factory.json', '{"workflows":["press"],"hires":{}}\n'),
      fileOf('tree/workflows/press/implement.md', '---\n---\nBuild it, edited.\n'),
      fileOf('applied/factory.json', '{"workflows":["press"],"hires":{}}\n'),
      fileOf('proposals/p-1.json', '{}\n'),
      fileOf('delegations/d-1.json', '{}\n'),
    ]),
  );
  done(src.factories.level.write(NAME, { level: 'auto', since: SINCE }));
  done(src.cards.cards.add(CardName.read('add-a-flag-c3d4'), aCard('Add a flag', { workflow: 'build', factory: 'shop', queued: SINCE })));
  done(src.cards.cards.add(CardName.read('started-e5f6'), aCard('Started already', { workflow: 'build', factory: 'shop' })));
  done(src.cards.cards.add(CardName.read('elsewhere-a1b2'), aCard('Not this one', { workflow: 'build', factory: 'other' })));
  done(src.runs.runs.create({ ...aRun('run-a1b2'), from: { inbox: 'started-e5f6' } }));
  return { factory, origin };
}

/** The export of `shop` from `src`, cards as `cards` says. */
const exported = async (src: Side, cards?: 'follow' | 'stay'): Promise<FactoryExport> =>
  answer(await on(src, factoryExported('shop', cards === undefined ? {} : { cards })));

/** The import of `exp` into `dst`, as the api calls it: the template sent taken under the store, kept where the factory is made. */
const imported = (dst: Side, exp: FactoryExport, more: { repos?: Record<string, string>; volumes?: Record<string, string> } = {}) => {
  const write = { export: exp, from: 'laptop', ...more };
  return on(
    dst,
    exp.template === undefined
      ? factoryImported('shop', write, undefined)
      : withTemplateTaken(exp.template, 'made', (source) => factoryImported('shop', write, source)),
  );
};

/** What `dst` holds of a move: its factories but the default, its folder's files, and its cards. */
const held = (dst: Side) => ({
  factories: done(dst.factories.factories.list()).filter((name) => name !== 'default'),
  folder: done(dst.factories.folder.read(NAME)).files.map((f) => f.path),
  cards: done(dst.cards.cards.entries()).map((e) => e.file),
});

const NOTHING = { factories: [], folder: [], cards: [] };

describe('the export reads the source whole and writes nothing of it', () => {
  let src!: Side;
  let exp!: {
    readonly name: string;
    readonly cards: readonly { readonly name: string; readonly source: string }[];
    readonly folder: { readonly archive: string };
    readonly file: string;
    readonly left: readonly { readonly name: string; readonly why: string }[];
    readonly stays: readonly string[];
    readonly instruction?: { readonly path: string; readonly words: string } | undefined;
    readonly template?: { readonly name: string } | { readonly archive: string } | { readonly path: string } | undefined;
  };
  beforeAll(async () => {
    src = side('wf-move-src-');
    planted(src);
    exp = await exported(src);
  });
  test('the cards that follow are those of the factory no run was started from; one a run keeps is left, with why', () => {
    assert.deepEqual(
      exp.cards.map((c) => c.name),
      ['add-a-flag-c3d4'],
    );
    assert.deepEqual(
      exp.left.map((l) => l.name),
      ['started-e5f6'],
    );
    assert.equal(exp.left[0]?.why.includes('run-a1b2'), true);
  });
  test('its folder is packed but its proposals and delegations, which are named as staying', () => {
    assert.deepEqual(exp.stays, ['proposals', 'delegations']);
    assert.deepEqual(
      unpackArchive(Buffer.from(exp.folder.archive, 'base64')).files.map((f) => f.path),
      ['applied/factory.json', 'level.json', 'tree/factory.json', 'tree/workflows/press/implement.md'],
    );
  });
  test('a template kept at a folder of the source travels packed, and a builtin one by its name', async () => {
    assert.equal(exp.template !== undefined && 'archive' in exp.template, true);
    const builtin = side('wf-move-src-');
    planted(builtin, 'shop-template');
    assert.deepEqual((await exported(builtin)).template, { name: 'shop-template' });
  });
  test('its cards stay where they are told to, none left behind named', async () => {
    const kept = await exported(src, 'stay');
    assert.deepEqual([kept.cards, kept.left], [[], []]);
  });
  test('the file it carries holds no tree, generation counted as read', () => {
    const file = JSON.parse(exp.file) as Record<string, unknown>;
    assert.equal('tree' in file || 'name' in file, false);
  });
  test('nothing of the source is written', () => {
    assert.deepEqual(done(src.cards.cards.entries()).length, 3);
    assert.equal(done(src.factories.folder.read(NAME)).stays.length, 2);
  });
  test('REFUSED: the default factory, which has no folder to move, is a Conflict', async () => {
    assert.equal(refusal(await on(src, factoryExported('default', {}))).kind, 'Conflict');
  });
});

describe('the import files the factory on the target, clones its repositories, and trusts none of them', () => {
  let src!: Side;
  let origin!: string;
  let exp!: {
    readonly name: string;
    readonly cards: readonly { readonly name: string; readonly source: string }[];
    readonly folder: { readonly archive: string };
    readonly file: string;
    readonly left: readonly { readonly name: string; readonly why: string }[];
    readonly stays: readonly string[];
    readonly instruction?: { readonly path: string; readonly words: string } | undefined;
    readonly template?: { readonly name: string } | { readonly archive: string } | { readonly path: string } | undefined;
  };
  let dst!: Side;
  let answered!: {
    name: string;
    file: string;
    repos: string[];
    cloned: string[];
    volumes: { name: string; path: string }[];
    cards: { name: string; was: string }[];
    untrusted: string[];
  };
  let record!: import('../factory.model.ts').FactoryRecord;
  beforeAll(async () => {
    src = side('wf-move-src-');
    ({ origin } = planted(src));
    exp = await exported(src);
    dst = side('wf-move-dst-');
    answered = answer(await imported(dst, exp));
    record = done(dst.factories.factories.read(NAME));
    if (isDefaultFactory(record)) return assert.fail('read as the default');
  });
  test('its repository is the target’s clone of its origin, cloned there', () => {
    assert.deepEqual(record.repos, [path.join(dst.root, 'clones', 'localhost', ...new URL(origin).pathname.split('/').filter(Boolean))]);
    assert.deepEqual(answered.cloned, [origin]);
    assert.equal(fs.existsSync(record.repos[0] ?? ''), true, 'the place cloned it there');
  });
  test('its template, version and parameters, the template kept under the target’s store', () => {
    assert.equal(record.template?.source.startsWith(path.join(dst.root, 'templates-sent')), true);
    assert.deepEqual([record.template?.version, record.template?.params], ['1.0.0', { team: 'ann' }]);
    assert.equal(record.tree, path.join(dst.root, 'factories', 'shop', 'tree'));
  });
  test('its tree’s edits and its level, and none of what stays', () => {
    const { files } = done(dst.factories.folder.read(NAME));
    const implement = files.find((f) => f.path === 'tree/workflows/press/implement.md');
    assert.equal(new TextDecoder().decode(implement?.bytes), '---\n---\nBuild it, edited.\n');
    assert.deepEqual(done(dst.factories.level.read(NAME)), { level: 'auto', since: SINCE });
    assert.deepEqual(done(dst.factories.folder.read(NAME)).stays, []);
  });
  test('its places are all untrusted, for the person to trust', () => {
    assert.deepEqual(answered.untrusted, record.repos);
  });
  test('its card is filed under its old name, not queued, and says where it came from', () => {
    assert.deepEqual(answered.cards, [{ name: 'add-a-flag-c3d4', was: 'add-a-flag-c3d4' }]);
    const text = done(dst.cards.cards.read(CardName.read('add-a-flag-c3d4'))) ?? '';
    const card = parseInboxCard('add-a-flag-c3d4.md', text);
    assert.deepEqual([card.queued, card.factory], [undefined, 'shop']);
    assert.equal(card.body.includes('laptop'), true);
  });
  test('a card whose name the target holds is filed under a new one, its old name answered', async () => {
    const other = side('wf-move-dst-');
    done(other.cards.cards.add(CardName.read('add-a-flag-c3d4'), aCard('Mine already')));
    const cards = answer(await imported(other, exp)).cards;
    assert.equal(cards.length, 1);
    assert.equal(cards[0]?.was, 'add-a-flag-c3d4');
    assert.notEqual(cards[0]?.name, 'add-a-flag-c3d4');
  });
});

describe('REFUSED: the import refuses before anything is written, and writes nothing', () => {
  let src!: Side;
  let exp!: {
    readonly name: string;
    readonly cards: readonly { readonly name: string; readonly source: string }[];
    readonly folder: { readonly archive: string };
    readonly file: string;
    readonly left: readonly { readonly name: string; readonly why: string }[];
    readonly stays: readonly string[];
    readonly instruction?: { readonly path: string; readonly words: string } | undefined;
    readonly template?: { readonly name: string } | { readonly archive: string } | { readonly path: string } | undefined;
  };
  let local!: FactoryExport;
  beforeAll(async () => {
    src = side('wf-move-src-');
    planted(src);
    exp = await exported(src);
    local = {
      ...exp,
      file: JSON.stringify({
        ...(JSON.parse(exp.file) as object),
        repos: ['/work/notes'],
        origins: undefined,
        volumes: [{ path: '/work/data', readOnly: true, name: 'data' }],
      }),
    };
  });
  test('a name the target holds is a Conflict', async () => {
    const dst = side('wf-move-dst-');
    planted(dst);
    const before = held(dst);
    assert.equal(refusal(await imported(dst, exp)).kind, 'Conflict');
    assert.deepEqual(held(dst), before);
  });
  test('a repository with no origin and nothing typed is Invalid, naming the flag that gives it one', async () => {
    const dst = side('wf-move-dst-');
    const refused = refusal(await imported(dst, local, { volumes: { data: scratch('wf-move-volume-') } }));
    assert.equal(refused.kind, 'Invalid');
    assert.equal(refused.message.includes('--repo /work/notes='), true);
    assert.deepEqual(held(dst), NOTHING);
  });
  test('a volume whose path the target refuses is Invalid, naming the flag that gives it another', async () => {
    const dst = side('wf-move-dst-');
    const refused = refusal(await imported(dst, local, { repos: { '/work/notes': scratch('wf-move-notes-') } }));
    assert.equal(refused.kind, 'Invalid');
    assert.equal(refused.message.includes('--volume data='), true);
    assert.deepEqual(held(dst), NOTHING);
  });
  test('both at once, each named in one refusal', async () => {
    const dst = side('wf-move-dst-');
    const refused = refusal(await imported(dst, local));
    assert.equal(refused.kind, 'Invalid');
    assert.equal(refused.message.includes('--repo /work/notes=') && refused.message.includes('--volume data='), true);
    assert.deepEqual(held(dst), NOTHING);
  });
  test('a folder sent that does not unpack is Invalid', async () => {
    const dst = side('wf-move-dst-');
    assert.equal(refusal(await imported(dst, { ...exp, folder: { archive: 'bm90IGFuIGFyY2hpdmU=' } })).kind, 'Invalid');
    assert.deepEqual(held(dst), NOTHING);
  });
});

test('a failure after a write takes back what the import wrote: its cards, its file and its folder', async () => {
  const src = side('wf-move-src-');
  planted(src);
  done(src.cards.cards.add(CardName.read('second-b2c3'), aCard('A second', { workflow: 'build', factory: 'shop' })));
  const exp = await exported(src);
  assert.equal(exp.cards.length, 2);
  const memory = cardDoorMemory();
  const door = doorFrom(CardDoor, memory);
  let adds = 0;
  const refusing = Layer.succeed(CardDoor)({
    ...door,
    cards: { ...door.cards, add: (name, text) => (++adds === 2 ? Effect.die(new Error('the disk is full')) : door.cards.add(name, text)) },
  });
  const dst = side('wf-move-dst-', refusing);
  const ended = await imported(dst, exp);
  assert.equal(Exit.isFailure(ended), true);
  assert.deepEqual(held(dst), NOTHING);
  assert.deepEqual(fs.existsSync(path.join(dst.root, 'templates-sent')) ? fs.readdirSync(path.join(dst.root, 'templates-sent')) : [], []);
  assert.deepEqual(done(dst.runs.runs.list(() => {})).length, 0, 'no run is made by a move');
});
