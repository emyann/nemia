/**
 * The Card door over the keyspace: the door's walks (`test/card-walks.ts`) on a fresh scratch store each, and what only a store on disk
 * can be asked — a card file dropped into the inbox imported and moved aside, an entry that is no card left, a write back's time, a try
 * file that does not read, the card a path names, the default door's root.
 */
import { test } from 'vitest';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { Effect, Logger } from 'effect';
import { scratch } from 'test-kit/scratch';
import { act, done, doorFrom, walksOn } from '../../test/door-walks.ts';
import { aCard, CARD_WALKS } from '../../test/card-walks.ts';
import { CardDoor, cardDoorAt, cardNameAt } from './cards.store.ts';
import { CardName } from '../inbox/inbox.model.ts';
import { StoreRoot } from '../config/root.store.ts';

for (const [name, body] of walksOn(CARD_WALKS, () => {
  const root = scratch('wf-card-door-');
  return { door: doorFrom(CardDoor, cardDoorAt(root)), root, layer: 'keyspace' };
}))
  test(name, body);

/** A fresh store, its Card door over its keyspace, and its inbox. */
const store = () => {
  const root = scratch('wf-card-door-');
  return { root, door: doorFrom(CardDoor, cardDoorAt(root)), inbox: path.join(root, 'inbox') };
};
const nameOf = (name: string) => CardName.read(name);

test("a card file dropped into the inbox is filed at its file's time and moved aside; an entry that is no card is left where it is", () => {
  const { root, door, inbox } = store();
  fs.mkdirSync(path.join(inbox, 'a-folder'), { recursive: true });
  fs.writeFileSync(path.join(inbox, 'an-idea.md'), 'an idea\n');
  const filed = new Date('2026-01-01T00:00:00.000Z');
  fs.utimesSync(path.join(inbox, 'an-idea.md'), filed, filed);
  fs.writeFileSync(path.join(inbox, 'notes.txt'), 'not a card');
  assert.deepEqual(done(door.cards.entries()), [{ file: 'an-idea.md', text: 'an idea\n' }]);
  assert.equal(done(door.cards.filedAt(nameOf('an-idea'))), filed.toISOString());
  assert.deepEqual(fs.readdirSync(inbox).sort(), ['a-folder', 'notes.txt']);
  assert.equal(fs.readFileSync(path.join(root, 'imported', 'inbox', 'an-idea.md'), 'utf8'), 'an idea\n');
  fs.writeFileSync(path.join(inbox, 'an-idea.md'), 'again\n');
  assert.equal(done(door.cards.read(nameOf('an-idea'))), 'an idea\n', 'a file at a card filed already does not write over it');
  assert.ok(fs.existsSync(path.join(root, 'imported', 'inbox', 'an-idea.md.2')), 'and is moved aside beside the first');
});

test('an entry of the inbox that is no card is said in the log as the import passes over it; a hidden file and a README are not', () => {
  const { root, door, inbox } = store();
  fs.mkdirSync(path.join(inbox, 'a-folder'), { recursive: true });
  fs.writeFileSync(path.join(inbox, 'notes.txt'), 'not a card');
  fs.writeFileSync(path.join(inbox, 'Not A Card.md'), 'not a name');
  fs.writeFileSync(path.join(inbox, '.idea.md.swp'), 'x');
  fs.writeFileSync(path.join(inbox, 'README.md'), '# ideas\n');
  fs.writeFileSync(path.join(inbox, 'an-idea.md'), 'an idea\n');
  const warned: string[] = [];
  const keeper = Logger.make(({ message }) => void warned.push((Array.isArray(message) ? message : [message]).join(' ')));
  const entries = Effect.runSync(door.cards.entries().pipe(Effect.provide(Logger.layer([keeper]))));
  assert.deepEqual(
    entries.map((e) => e.file),
    ['an-idea.md'],
  );
  const named = ['a-folder', 'notes.txt', 'Not A Card.md'].map((entry) => path.join(inbox, entry));
  assert.deepEqual(
    named.map((entry) => warned.some((line) => line.startsWith(`${entry} was not imported`))),
    [true, true, true],
    warned.join('\n'),
  );
  assert.equal(warned.length, 3, warned.join('\n'));
  assert.deepEqual(fs.readdirSync(inbox).sort(), ['.idea.md.swp', 'Not A Card.md', 'README.md', 'a-folder', 'notes.txt']);
  assert.ok(fs.existsSync(path.join(root, 'imported', 'inbox', 'an-idea.md')));
});

test('a card written back keeps its filing time, and no card file is made', () => {
  const { door, inbox } = store();
  done(door.cards.add(nameOf('c-rewrite'), aCard('Before')));
  const filed = done(door.cards.filedAt(nameOf('c-rewrite')));
  done(door.cards.rewrite(nameOf('c-rewrite'), aCard('After')));
  assert.equal(done(door.cards.read(nameOf('c-rewrite'))), aCard('After'));
  assert.equal(done(door.cards.filedAt(nameOf('c-rewrite'))), filed);
  assert.equal(fs.existsSync(inbox), false);
});

test('a try file of before the keyspace is imported; one that does not read as a try is left where it is', () => {
  const { root, door } = store();
  const kept = { at: '2026-11-01T00:00:00.000Z', text: 'x', repo: '/repo', why: 'gone', refused: true };
  fs.mkdirSync(path.join(root, 'queue'), { recursive: true });
  fs.writeFileSync(path.join(root, 'queue', 'kept.json'), JSON.stringify(kept));
  fs.writeFileSync(path.join(root, 'queue', 'torn.json'), '{"at": "2026');
  fs.writeFileSync(path.join(root, 'queue', 'other.json'), JSON.stringify({ at: 1 }));
  assert.deepEqual([...done(door.tries.list())], [['kept', kept]]);
  assert.deepEqual(fs.readdirSync(path.join(root, 'queue')).sort(), ['other.json', 'torn.json']);
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

test('the default door reads the keyspace at the store root the program is given, and refuses Invalid where it was given none', () => {
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
