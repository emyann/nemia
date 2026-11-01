/**
 * The Card door's files layer: the door's walks (`test/card-walks.ts`) on a fresh scratch store each, and what only the files can be
 * asked — an entry that is no card, a write back's time and temp file, a try that does not read, the card a path names, the default
 * door's root.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { Effect } from 'effect';
import { scratch } from '../../test/scratch.ts';
import { act, done, doorFrom, walksOn } from '../../test/door-walks.ts';
import { aCard, CARD_WALKS } from '../../test/card-walks.ts';
import { CardDoor, cardDoorFiles, cardNameAt } from './cards.store.ts';
import { CardName } from '../inbox/inbox.model.ts';
import { StoreRoot } from '../config/root.store.ts';

for (const [name, body] of walksOn(CARD_WALKS, () => {
  const root = scratch('wf-card-door-');
  return { door: doorFrom(CardDoor, cardDoorFiles(root)), root, layer: 'files' };
}))
  test(name, body);

/** A fresh store, its Card door over the files, and its inbox. */
const store = () => {
  const root = scratch('wf-card-door-');
  return { root, door: doorFrom(CardDoor, cardDoorFiles(root)), inbox: path.join(root, 'inbox') };
};
const nameOf = (name: string): CardName => CardName.read(name);

test("the inbox's entries: a folder by its name and a trailing slash, any other file with no text, a hidden one not listed", () => {
  const { door, inbox } = store();
  fs.mkdirSync(path.join(inbox, 'a-folder'), { recursive: true });
  fs.writeFileSync(path.join(inbox, 'an-idea.md'), 'an idea\n');
  fs.writeFileSync(path.join(inbox, 'notes.txt'), 'not a card');
  fs.writeFileSync(path.join(inbox, '.an-idea.md.123'), 'half a card');
  assert.deepEqual(done(door.cards.entries()), [
    { file: 'a-folder/', text: '' },
    { file: 'an-idea.md', text: 'an idea\n' },
    { file: 'notes.txt', text: '' },
  ]);
});

test('a card that is there and cannot be read is not read as gone: reading it dies of what the disk said', () => {
  const { door, inbox } = store();
  fs.mkdirSync(path.join(inbox, 'c-folder.md'), { recursive: true });
  assert.throws(
    () => act(door.cards.read(nameOf('c-folder'))),
    (err: NodeJS.ErrnoException) => err.code === 'EISDIR',
  );
});

test('a card filed makes the inbox; a write back keeps its time and leaves no hidden file', () => {
  const { door, inbox } = store();
  assert.equal(fs.existsSync(inbox), false);
  done(door.cards.add(nameOf('c-rewrite'), aCard('Before')));
  const filed = new Date('2026-01-01T00:00:00.000Z');
  fs.utimesSync(path.join(inbox, 'c-rewrite.md'), filed, filed);
  done(door.cards.rewrite(nameOf('c-rewrite'), aCard('After')));
  assert.equal(fs.readFileSync(path.join(inbox, 'c-rewrite.md'), 'utf8'), aCard('After'));
  assert.equal(done(door.cards.filedAt(nameOf('c-rewrite'))), filed.toISOString());
  assert.deepEqual(fs.readdirSync(inbox), ['c-rewrite.md']);
});

test('a card that cannot be removed is not read as gone: the drop dies of what the disk said', () => {
  const { door, inbox } = store();
  fs.mkdirSync(path.join(inbox, 'c-stuck.md'), { recursive: true });
  assert.throws(() => act(door.cards.drop(nameOf('c-stuck'))));
});

test('a try file that does not read as a try is none', () => {
  const { root, door } = store();
  const kept = { at: '2026-11-01T00:00:00.000Z', text: 'x', repo: '/repo', why: 'gone', refused: true };
  done(door.tries.put(nameOf('kept'), kept));
  fs.writeFileSync(path.join(root, 'queue', 'torn.json'), '{"at": "2026');
  fs.writeFileSync(path.join(root, 'queue', 'other.json'), JSON.stringify({ at: 1 }));
  assert.deepEqual([...done(door.tries.list())], [['kept', kept]]);
});

test('the card a path names: any path under the inbox, links resolved on the way to it and to the inbox, else null', () => {
  const root = scratch('wf-card-door-');
  const inbox = path.join(root, 'inbox');
  fs.mkdirSync(inbox, { recursive: true });
  assert.equal(cardNameAt(root, path.join(inbox, 'c-named.md')), 'c-named');
  assert.equal(cardNameAt(root, path.join(inbox, 'c-named')), 'c-named');
  const linked = path.join(root, 'linked');
  fs.symlinkSync(inbox, linked);
  assert.equal(cardNameAt(root, path.join(linked, 'c-named.md')), 'c-named');
  assert.equal(cardNameAt(root, path.join(root, 'elsewhere', 'c-named.md')), null);
  assert.equal(cardNameAt(root, 'add a flag'), null);
  const real = path.join(root, 'real-inbox');
  const other = scratch('wf-card-door-');
  fs.mkdirSync(real);
  fs.symlinkSync(real, path.join(other, 'inbox'));
  assert.equal(cardNameAt(other, path.join(real, 'c-named.md')), 'c-named', 'an inbox that is itself a link');
});

test('the default door reads the files at the store root the program is given, and refuses Invalid where it was given none', () => {
  const { root, door } = store();
  done(door.cards.add(nameOf('an-idea'), aCard('Rooted')));
  const list = Effect.gen(function* () {
    return yield* (yield* CardDoor).cards.entries();
  });
  assert.deepEqual(
    Effect.runSync(Effect.provideService(list, StoreRoot, root)).map((e) => e.file),
    ['an-idea.md'],
  );
  assert.deepEqual(act(list), { refused: 'Invalid' });
});

const PKG = path.join(import.meta.dirname, '..', '..');

/** Every file of `src` but the tests and the Card door's own folder, by its path from the package. */
function sourcesOfSrc(): Record<string, string> {
  const out: Record<string, string> = {};
  for (const entry of fs.readdirSync(path.join(PKG, 'src'), { recursive: true, withFileTypes: true })) {
    if (!entry.isFile() || !entry.name.endsWith('.ts') || entry.name.endsWith('.test.ts')) continue;
    const file = path.relative(PKG, path.join(entry.parentPath, entry.name)).split(path.sep).join('/');
    if (!file.startsWith('src/cards/')) out[file] = fs.readFileSync(path.join(PKG, file), 'utf8');
  }
  return out;
}

/** The files of `sources` that call the door's files layer by hand, comment lines left out, rather than yielding `CardDoor`. */
const byHand = (sources: Record<string, string>): string[] =>
  Object.entries(sources)
    .filter(([, text]) =>
      /(?<![\w$.])cardFiles\s*\(/.test(
        text
          .split('\n')
          .filter((line) => !/^\s*(\/\/|\/\*|\*)/.test(line))
          .join('\n'),
      ),
    )
    .map(([file]) => file);

test("no file of src but the Card door's reads the inbox's files by hand (`cardFiles`): each yields CardDoor", () => {
  assert.deepEqual(byHand(sourcesOfSrc()), []);
});

test('REFUSED: a file of src that calls cardFiles', () => {
  const sources = sourcesOfSrc();
  const again = { ...sources, 'src/cli/start.ts': `${sources['src/cli/start.ts'] ?? ''}\nconst x = cardFiles(home).cards.entries();\n` };
  assert.deepEqual(byHand(again), ['src/cli/start.ts']);
});
