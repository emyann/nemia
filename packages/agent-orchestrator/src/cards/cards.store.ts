/**
 * The Card door: the one way a program reads and writes a card of the inbox and the tick's tries of a queued one — an Effect service,
 * `CardDoor`, whose methods take a card's name as `CardName` and answer an Effect failing with a refusal.
 *
 * A card is a record of the keyspace, `/registry/cards/<name>`, holding the very text a person wrote and when it was filed (`filedAt`,
 * kept across a write back), and the tick's try of a queued one is a record of its own, `/registry/cardtries/<name>`. The rooted door
 * and the memory stand-in (`cardDoorMemory`, `memory.store.ts`, over a keyspace in memory) are both `cardRecords` under `cardDoorOver`,
 * so each write is checked the one way on both: a new card's name as `CardName.OnCreate` checks it, and its text read as a card
 * (`parseInboxCard`, the reader the model's `Card` says holds its invariants — a queued card names its workflow, `from:` names each run
 * once), or `Invalid` names what is broken and nothing is written; a card already at a new one's name is `Conflict`, and a card written
 * back that is not there `Missing`. A try is written under a name `CardName.OnCreate` checks, and decoded through the model's
 * `MissedStart`. The walks of `test/card-walks.ts` hold both to one table.
 *
 * A store's card files (`<root>/inbox/<name>.md`, filed at the file's change time) and the tick's tries (`<root>/queue/<name>.json`) are
 * imported by the kind's import (`CARD_FILES`, `src/keyspace/import.store.ts`), level-triggered, so a card a person drops into `inbox/`
 * by hand is filed at the next read, and moved aside under `<root>/imported/`; any other entry of the inbox is left where it is. A card
 * is named in a message by the command that shows it (`where`).
 *
 * The door's default is rooted (`rootedDoor`): the keyspace at the store's root the program is given (`StoreRoot`), refused where it
 * was given none (`test/root-given.test.ts`). One run per card is the Run door's to hold, at its create (`cardStartedTwice`,
 * `src/runs/runs.store.ts`): only that door knows whether a run's record stands.
 */
import fs from 'node:fs';
import path from 'node:path';
import { Context, Effect, Layer, Option, Schema } from 'effect';
import { checked, fromThrow, rootedDoor } from '../door/door.store.ts';
import { Conflict, Missing, type Refusal } from '../refusal/refusal.ts';
import { inboxNameOf, parseInboxCard, type MissedStart } from '../inbox/index.ts';
import { CardName, MissedStart as MissedStartModel } from '../inbox/inbox.model.ts';
import { asideOf, entriesIn, kindKeyspace, kindKeyspaceHeld, namesIn, type ImportKind } from '../keyspace/import.store.ts';
import type { KeyRefused, Keyspace, KeyTxn } from '../keyspace/keyspace.store.ts';
import { FILE_ID_PREFIX } from 'objects';

/** The Card door's shape: the inbox's cards and the tick's tries of a queued card's start, each method answering an Effect. */
export type CardDoorShape = {
  readonly cards: {
    /** The inbox's cards, by their name and `.md` (`file`), sorted, each with its text. None when there is no card yet. */
    readonly entries: () => Effect.Effect<Array<{ file: string; text: string }>, Refusal>;
    /** The text of the card `name`, or null when it is not there. */
    readonly read: (name: CardName) => Effect.Effect<string | null, Refusal>;
    /** When the card `name` was filed, as an ISO time, kept across a write back. Null when it is gone. */
    readonly filedAt: (name: CardName) => Effect.Effect<string | null, Refusal>;
    /** When the inbox's entry `file` (as `entries` lists it) was filed, as an ISO time; null when it is gone or names no card. */
    readonly entryAt: (entry: { readonly file: string }) => Effect.Effect<string | null, Refusal>;
    /** The text of the inbox's entry `file` (as `entries` lists it); null when it is gone or names no card. */
    readonly entryText: (entry: { readonly file: string }) => Effect.Effect<string | null, Refusal>;
    /** File a person's card, exclusively: how a message names it (`where`). A card already at its name is `Conflict`, and left as it is. */
    readonly add: (name: CardName, text: string) => Effect.Effect<string, Refusal>;
    /** Write the card `name` whole, keeping its filing time. `Missing` when it is not there. */
    readonly rewrite: (name: CardName, text: string) => Effect.Effect<void, Refusal>;
    /** Remove the card `name`: false when it is not there. */
    readonly drop: (name: CardName) => Effect.Effect<boolean, Refusal>;
    /** How a message names the card `name`: the command that shows it (`nemia get card <name>`). */
    readonly where: (name: CardName) => Effect.Effect<string, Refusal>;
  };
  readonly tries: {
    /** The tick's tries of a queued card's start that did not happen, by card name. One that does not read as a try is none. */
    readonly list: () => Effect.Effect<Map<string, MissedStart>, Refusal>;
    /** Write down the tick's try of the card `name`, whole over the one there: the tick's alone. */
    readonly put: (name: CardName, tried: MissedStart) => Effect.Effect<void, Refusal>;
    /** Remove the tick's try of the card `name`, there or not: the tick's alone. */
    readonly drop: (name: CardName) => Effect.Effect<void, Refusal>;
  };
};

/**
 * A card already at a new card's name, as a refusal.
 * @param name The new card's name, which the fix's command names.
 * @param file How a message names the card filed already (`where`), the command that shows it.
 */
export const cardTaken = (name: string, file: string) =>
  new Conflict({
    message: `a card ${name} is filed already (${file}): file the new one under another name, or drop that one with nemia inbox rm ${name}`,
  });

/**
 * No card at the name a write back names, as a refusal.
 * @param name The card's name the write back names.
 */
export const noCardToRewrite = (name: string) =>
  new Missing({
    message: `there is no card ${name} to write back: file it with nemia inbox add, or name a card nemia inbox lists. Nothing was written.`,
  });

/** A name a card or a try is written under, as `CardName.OnCreate` checks it. */
const nameChecked = checked(CardName.OnCreate, (name: string) => `a card under ${JSON.stringify(name)}`);

/**
 * The text of a card written, read as a card (`parseInboxCard`): refused `Invalid` naming the file and the fix. The reader is where the
 * model's `Card` says its invariants are held — a queued card names its workflow, `from:` names each run once — so no decode through
 * `Card` after it could refuse a text it let through.
 */
const textChecked = (name: string, text: string) => fromThrow(() => void parseInboxCard(`${name}.md`, text));

/** A try written: what the model's `MissedStart` refuses of it. */
const tryChecked = (name: string) => checked(MissedStartModel, () => `the try of the card ${name}`);

/**
 * The door over `door`: each write's name and text checked before it is written.
 * @param door The cards and tries as the door's shape, read and written through.
 */
export function cardDoorOver(door: CardDoorShape) {
  return {
    ...door,
    cards: {
      ...door.cards,
      add: (name, text) =>
        Effect.gen(function* () {
          yield* nameChecked(name);
          yield* textChecked(name, text);
          return yield* door.cards.add(name, text);
        }),
      rewrite: (name, text) => Effect.andThen(textChecked(name, text), door.cards.rewrite(name, text)),
    },
    tries: {
      ...door.tries,
      put: (name, tried) =>
        Effect.gen(function* () {
          yield* nameChecked(name);
          yield* tryChecked(name)(tried);
          return yield* door.tries.put(name, tried);
        }),
    },
  } satisfies CardDoorShape;
}

/**
 * The inbox of the store `home`: where its cards are filed.
 * @param home The store's root folder.
 */
export const inboxAt = (home: string) => path.join(home, 'inbox');

/** The tick's tries of the store `home` before the keyspace: outside the inbox, which is a person's. */
const queueAt = (home: string) => path.join(home, 'queue');

/** The keyspace's prefix of every card, and of every try of one. */
const CARDS = '/registry/cards/';
const TRIES = '/registry/cardtries/';

/**
 * The key of the card `name`.
 * @param name The card's name.
 */
export const cardKey = (name: string) => `${CARDS}${name}`;

/**
 * The key of the tick's try of the card `name`.
 * @param name The card's name.
 */
export const cardTryKey = (name: string) => `${TRIES}${name}`;

/** A card's record: the text a person wrote, and when it was filed. */
const CardRecord = Schema.Struct({ text: Schema.String, filedAt: Schema.String });

/** A card's record as its value reads, or none where it does not. */
const cardIn = Schema.decodeUnknownOption(Schema.fromJsonString(CardRecord));

/** A try as the tick writes it; any key beside these is left unread. */
const missedStartIn = Schema.decodeUnknownOption(Schema.fromJsonString(MissedStartModel));

/**
 * The name of the card `given` is a path to, in the store `home` — any path under its inbox, `<inbox>/<name>.md` or `<inbox>/<name>`,
 * links resolved on the way to both — or null for a path outside it, and for text: the inverse of `where`.
 * @param home The store's root folder.
 * @param given The path, relative to the working folder or absolute.
 */
export function cardNameAt(home: string, given: string) {
  const real = (at: string) => {
    try {
      return fs.realpathSync(at);
    } catch {
      return at;
    }
  };
  const at = path.resolve(given);
  return inboxNameOf(path.join(real(path.dirname(at)), path.basename(at)), real(inboxAt(home)));
}

/** A write raced by another, as a refusal. */
const raced = (err: KeyRefused) =>
  new Conflict({ message: `${err.key} was written by another while it was written here: run again.` }) satisfies Refusal as Refusal;

/** Every File id written in a card's text, as the File door's prune finds a card's. */
const FILE_IDS = new RegExp(`${FILE_ID_PREFIX}[0-9a-f]{32}`, 'g');

/** The keyspace's prefix of every File (`src/start/files.store.ts`). */
const FILES = '/registry/files/';

/** The id of the File a key under `FILES` names, its last piece. */
const idOfFile = (key: string) => key.slice(key.lastIndexOf('/') + 1);

/** The live Files of `tx` whose id `text` names: what a card's record points to, so the keyspace refuses their delete while it stands. */
const filesNamed = (tx: KeyTxn, text: string) => {
  const ids = new Set(text.match(FILE_IDS) ?? []);
  if (ids.size === 0) return Effect.succeed([] satisfies string[]);
  return Effect.map(tx.list(FILES), (records) => records.map((r) => r.key).filter((key) => ids.has(idOfFile(key))));
};

/** How a message names the card `name`: the command that shows it. */
const shownBy = (name: string) => `nemia get card ${name}`;

/** The card's name an entry's `file` names (`<name>.md`), or none. */
const nameOfEntry = (file: string) => (file.endsWith('.md') ? file.slice(0, -'.md'.length) : undefined);

/** The tries of the keyspace `held` holds, as the door's `tries`; a write opens it with `open`. */
const triesOf = (open: Effect.Effect<Keyspace, Refusal>, held: Effect.Effect<Keyspace | undefined, Refusal>) =>
  ({
    list: () =>
      Effect.gen(function* () {
        const tries = new Map<string, MissedStart>();
        const keyspace = yield* held;
        if (keyspace === undefined) return tries;
        for (const record of (yield* keyspace.list(TRIES)).records) {
          const r = missedStartIn(record.value);
          if (Option.isNone(r)) continue;
          const { at, text, repo, why, refused } = r.value;
          tries.set(record.key.slice(TRIES.length), { at, text, repo, why, refused });
        }
        return tries;
      }),
    put: (name, tried) =>
      Effect.gen(function* () {
        const keyspace = yield* open;
        const key = cardTryKey(name);
        yield* keyspace
          .within((tx) =>
            Effect.flatMap(tx.get(key), (there) =>
              tx.write(key, { verb: there === undefined ? 'create' : 'update', expected: null, value: JSON.stringify(tried) }),
            ),
          )
          .pipe(Effect.mapError(raced));
      }),
    drop: (name) =>
      Effect.gen(function* () {
        const keyspace = yield* held;
        if (keyspace === undefined) return;
        const key = cardTryKey(name);
        yield* keyspace
          .within((tx) =>
            Effect.flatMap(tx.get(key), (there) =>
              there === undefined ? Effect.void : Effect.asVoid(tx.write(key, { verb: 'delete', expected: null, value: '' })),
            ),
          )
          .pipe(Effect.mapError(raced));
      }),
  }) satisfies CardDoorShape['tries'];

/**
 * The door's write back of a card over the keyspace `open` opens: its text replaced and its filing time kept, the Files it names pointed
 * to, read and written in one transaction; `Missing` where there is no card.
 * @param open Opens the keyspace the cards are held in.
 * @param now When a card is filed, as an ISO time, for a record that held none.
 */
const rewriteOf = (open: Effect.Effect<Keyspace, Refusal>, now: () => string) =>
  ((name: CardName, text: string) =>
    Effect.gen(function* () {
      const keyspace = yield* open;
      const key = cardKey(name);
      const done = yield* keyspace
        .within((tx) =>
          Effect.gen(function* () {
            const there = yield* tx.get(key);
            const was = there === undefined ? undefined : Option.getOrUndefined(cardIn(there.value));
            if (there === undefined) return false;
            yield* tx.write(key, {
              verb: 'update',
              expected: there.revision,
              value: JSON.stringify({ text, filedAt: was?.filedAt ?? now() }),
              points: yield* filesNamed(tx, text),
            });
            return true;
          }),
        )
        .pipe(Effect.mapError(raced));
      if (!done) return yield* noCardToRewrite(name);
    })) satisfies CardDoorShape['cards']['rewrite'];

/**
 * The cards and tries of the keyspace `open` opens when a method runs, as the door's shape. A read asks `held`, and answers none where it
 * answers no keyspace, so a store read is not a store made.
 * @param open Opens the keyspace the cards are held in, refused as opening it is.
 * @param held The keyspace a read reads, or undefined where the store holds none yet; `open` where every read may make it.
 * @param now When a card is filed, as an ISO time.
 */
export function cardRecords(
  open: Effect.Effect<Keyspace, Refusal>,
  held: Effect.Effect<Keyspace | undefined, Refusal> = open,
  now: () => string = () => new Date().toISOString(),
) {
  const recordOf = (name: string) =>
    Effect.gen(function* () {
      const keyspace = yield* held;
      const record = keyspace === undefined ? undefined : yield* keyspace.get(cardKey(name));
      if (record === undefined) return undefined;
      return Option.getOrUndefined(cardIn(record.value));
    });
  return {
    cards: {
      entries: () =>
        Effect.gen(function* () {
          const keyspace = yield* held;
          if (keyspace === undefined) return [];
          return (yield* keyspace.list(CARDS)).records.flatMap((record) => {
            const card = cardIn(record.value);
            return Option.isNone(card) ? [] : [{ file: `${record.key.slice(CARDS.length)}.md`, text: card.value.text }];
          });
        }),
      read: (name) => Effect.map(recordOf(name), (r) => r?.text ?? null),
      filedAt: (name) => Effect.map(recordOf(name), (r) => r?.filedAt ?? null),
      entryAt: ({ file }) => {
        const name = nameOfEntry(file);
        return name === undefined ? Effect.succeed(null) : Effect.map(recordOf(name), (r) => r?.filedAt ?? null);
      },
      entryText: ({ file }) => {
        const name = nameOfEntry(file);
        return name === undefined ? Effect.succeed(null) : Effect.map(recordOf(name), (r) => r?.text ?? null);
      },
      add: (name, text) =>
        Effect.gen(function* () {
          const keyspace = yield* open;
          const value = JSON.stringify({ text, filedAt: now() });
          yield* keyspace
            .within((tx) =>
              Effect.flatMap(filesNamed(tx, text), (points) => tx.write(cardKey(name), { verb: 'create', expected: null, value, points })),
            )
            .pipe(Effect.mapError((err) => (err.refusal === 'exists' ? cardTaken(name, shownBy(name)) : raced(err))));
          return shownBy(name);
        }),
      rewrite: rewriteOf(open, now),
      drop: (name) =>
        Effect.gen(function* () {
          const keyspace = yield* held;
          if (keyspace === undefined) return false;
          return yield* keyspace.write(cardKey(name), { verb: 'delete', expected: null, value: '' }).pipe(
            Effect.as(true),
            Effect.catchTag('KeyRefused', (err) => (err.refusal === 'missing' ? Effect.succeed(false) : Effect.fail(raced(err)))),
          );
        }),
      where: (name) => Effect.succeed(shownBy(name)),
    },
    tries: triesOf(open, held),
  } satisfies CardDoorShape;
}

/**
 * The keys a card file's text may point to, in the store `home`: each File id it names, in each namespace the store keeps Files in; the
 * import keeps those that are live.
 */
const filesOf = (home: string, text: string) => {
  const ids = [...new Set(text.match(FILE_IDS) ?? [])];
  const kept = path.join(home, 'files');
  if (ids.length === 0 || !fs.existsSync(kept)) return [];
  const namespaces = fs.readdirSync(kept, { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? [e.name] : []));
  return namespaces.flatMap((namespace) => ids.map((id) => `${FILES}${namespace}/${id}`));
};

/**
 * The card files of a store from before the keyspace — and a card a person drops into the inbox by hand — `inbox/<name>.md`, filed at
 * the file's change time, and the tick's tries, `queue/<name>.json`: what the kind's import takes up. A card's text is taken as it is,
 * and checked as a card when it is read; a try that is not JSON stays where it is. An entry of the inbox that is no card — a folder, a
 * file of another kind, an `.md` whose name is no card's — stays where it is, said in the log (`strays`); a hidden file and a README are
 * not.
 */
export const CARD_FILES: ImportKind = {
  name: 'cards',
  folders: (home) => [inboxAt(home), queueAt(home)],
  files: (home) => [
    ...namesIn(inboxAt(home), '.md')
      .filter((name) => Option.isSome(Schema.decodeUnknownOption(CardName.OnCreate)(name)))
      .map((name) => {
        const file = path.join(inboxAt(home), `${name}.md`);
        return {
          file,
          key: cardKey(name),
          aside: asideOf(home, file),
          read: (text: string) => {
            const at = fs.statSync(file, { throwIfNoEntry: false })?.mtime.toISOString() ?? new Date().toISOString();
            return { value: JSON.stringify({ text, filedAt: at }), points: filesOf(home, text) };
          },
        };
      }),
    ...namesIn(queueAt(home), '.json')
      .filter((name) => Option.isSome(Schema.decodeUnknownOption(CardName.OnCreate)(name)))
      .map((name) => {
        const file = path.join(queueAt(home), `${name}.json`);
        return {
          file,
          key: cardTryKey(name),
          aside: asideOf(home, file),
          read: (text: string) => (Option.isSome(missedStartIn(text)) ? { value: text.trim() } : { unreadable: 'it is no try of a card' }),
        };
      }),
  ],
  strays: (home) =>
    entriesIn(inboxAt(home))
      .filter((entry) => !entry.startsWith('.') && entry !== 'README.md')
      .filter((entry) => !(entry.endsWith('.md') && Option.isSome(Schema.decodeUnknownOption(CardName.OnCreate)(entry.slice(0, -3)))))
      .map((entry) => ({
        entry: path.join(inboxAt(home), entry),
        why: 'a card is a file <name>.md whose name a card may take, and this is none: file the idea with nemia inbox add',
      })),
};

/** The Card door over the keyspace at the store `root`. */
const cardsAt = (root: string) => cardDoorOver(cardRecords(kindKeyspace(root, CARD_FILES), kindKeyspaceHeld(root, CARD_FILES)));

/**
 * The Card door, as the service a program yields: a reference whose default is rooted (`rootedDoor`) — the door over the files at the
 * store's root the program is given, refused `Invalid` where it was given none — and a test gives `cardDoorMemory()` with no root at all
 * (`docs/architecture.md`, *The Card door*).
 */
export const CardDoor = Context.Reference<CardDoorShape>('agent-orchestrator/CardDoor', {
  defaultValue: () => rootedDoor(cardsAt, 'Card door'),
});

/**
 * The Card door over the keyspace of the store `root`, as a layer: for a program that names its root by the door, not by `StoreRoot`.
 * @param root The store's root folder.
 */
export const cardDoorAt = (root: string) => Layer.succeed(CardDoor)(cardsAt(root));

/**
 * The inbox's cards written into `dir` as files, `<name>.md` each holding the card's text, replacing what was there: the read-only view a
 * step that reads the inbox (`reads: inbox`) is filed with, now that a card is a record and no file.
 * @param dir The folder the view is written to, absolute.
 */
export const cardsViewed = (dir: string) =>
  Effect.gen(function* () {
    const entries = yield* (yield* CardDoor).cards.entries();
    yield* fromThrow(() => {
      fs.rmSync(dir, { recursive: true, force: true });
      fs.mkdirSync(dir, { recursive: true, mode: 0o700 });
      for (const entry of entries) fs.writeFileSync(path.join(dir, entry.file), entry.text, { mode: 0o400 });
    });
  });
