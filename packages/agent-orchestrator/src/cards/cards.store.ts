/**
 * The Card door: the one way a program reads and writes a card of the inbox and the tick's tries of a queued one — an Effect service,
 * `CardDoor`, whose methods take a card's name as `CardName` and answer an Effect failing with a refusal. Its pattern is the Run door's
 * and the Factory door's (`src/door/door.store.ts`).
 *
 * Two layers: the files (`cardFiles`, `<root>/inbox/<name>.md` and `<root>/queue/<name>.json`, so a card is the very bytes a person
 * wrote), and the memory stand-in (`cardDoorMemory`, `memory.store.ts`), which a test gives its program. Both are built by
 * `cardDoorOver`, so each write is checked the one way on both: a new card's name as `CardName.OnCreate` checks it, and its text read as
 * a card (`parseInboxCard`, the reader the model's `Card` says holds its invariants — a queued card names its workflow, `from:` names
 * each run once), or `Invalid` names what is broken and nothing is written; a card already at a new one's name is `Conflict`, and
 * a card written back that is not there `Missing`. A try is written under a name `CardName.OnCreate` checks, and decoded through the
 * model's `MissedStart`. The walks of `test/card-walks.ts` hold both layers to one table.
 *
 * The door's default is rooted (`rootedDoor`): the files at the store's root the program is given (`StoreRoot`), refused where it was
 * given none, since this door reads no root of its own module's (`test/root-given.test.ts`). One run per card is the Run door's to hold,
 * at its create (`cardStartedTwice`, `src/runs/runs.store.ts`): only that door knows whether a run's record stands.
 */
import fs from 'node:fs';
import path from 'node:path';
import { Context, Effect, Layer, Schema } from 'effect';
import { checked, doorOf, fromThrow, rootedDoor, type DoorOf } from '../door/door.store.ts';
import { Conflict, Missing } from '../refusal/refusal.ts';
import { inboxNameOf, parseInboxCard, type MissedStart } from '../inbox/index.ts';
import { CardName, MissedStart as MissedStartModel } from '../inbox/inbox.model.ts';
import { isDirectory } from '../record/record.store.ts';

/**
 * A layer of the Card door, as plain synchronous methods: the inbox's cards (its entries, a card's text, its filing time, filed, written
 * back, dropped, and where a person finds it) and the tick's tries of a queued card's start.
 */
export type CardLayer = {
  readonly cards: {
    /**
     * The inbox's entries, by their file in it, sorted: a folder by its name and a trailing `/`, a markdown file with its text, any other
     * file with none; a hidden one is not listed. None when there is no inbox yet.
     */
    readonly entries: () => Array<{ file: string; text: string }>;
    /** The text of the card `name`, or null when it is not there. */
    readonly read: (name: string) => string | null;
    /** When the card `name` was filed, as an ISO time, kept across a write back. Null when it is gone. */
    readonly filedAt: (name: string) => string | null;
    /** File a person's card, exclusively: where it is filed. A card already at its name is `Conflict`, and left as it is. */
    readonly add: (name: string, text: string) => string;
    /** Write the card `name` whole, so a reader never reads half a card, keeping its filing time. `Missing` when it is not there. */
    readonly rewrite: (name: string, text: string) => void;
    /** Remove the card `name`: false when it is not there. */
    readonly drop: (name: string) => boolean;
    /** Where a person finds the card `name`: the path a message names. */
    readonly where: (name: string) => string;
  };
  readonly tries: {
    /** The tick's tries of a queued card's start that did not happen, by card name. One that does not read as a try is none. */
    readonly list: () => Map<string, MissedStart>;
    /** Write down the tick's try of the card `name`, whole over the one there: the tick's alone. */
    readonly put: (name: string, tried: MissedStart) => void;
    /** Remove the tick's try of the card `name`, there or not: the tick's alone. */
    readonly drop: (name: string) => void;
  };
};

/** The Card door's shape: each method of `CardLayer` answering an Effect, a card's name taken as `CardName`. */
export type CardDoorShape = DoorOf<CardLayer, CardName>;

/** A card already at a new card's name, as a refusal: the files say so by `EEXIST`, the memory by its own. */
export const cardTaken = (name: string, file: string): Conflict =>
  new Conflict({
    message: `a card is filed already at ${file}: file the new one under another name, or drop that one with nemia inbox rm ${name}`,
  });

/** No card at the name a write back names, as a refusal. */
export const noCardToRewrite = (name: string): Missing =>
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
const textChecked = (name: string, text: string) => fromThrow(() => void parseInboxCard(`${name}.md`, text, () => true));

/** A try written: what the model's `MissedStart` refuses of it. */
const tryChecked = (name: string) => checked(MissedStartModel, () => `the try of the card ${name}`);

/** The door over `layer`: each method as `doorOf` makes it, each write's name and text checked before the layer writes. */
export function cardDoorOver(layer: CardLayer): CardDoorShape {
  const door = doorOf<CardLayer, CardName>(layer);
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
  };
}

/** The inbox of the store `home`: where its cards are filed. */
export const inboxAt = (home: string): string => path.join(home, 'inbox');

/** The tick's tries of the store `home`: outside the inbox, which is a person's. */
const queueAt = (home: string): string => path.join(home, 'queue');

/** A try as the tick writes it; any key beside these is left unread. */
const isMissedStart = Schema.is(MissedStartModel);

/**
 * The name of the card `given` is a path to, in the store `home` — any path under its inbox, `<inbox>/<name>.md` or `<inbox>/<name>`,
 * links resolved on the way to both — or null for a path outside it, and for text: the inverse of `where`.
 */
export function cardNameAt(home: string, given: string): string | null {
  const real = (at: string): string => {
    try {
      return fs.realpathSync(at);
    } catch {
      return at;
    }
  };
  const at = path.resolve(given);
  return inboxNameOf(path.join(real(path.dirname(at)), path.basename(at)), real(inboxAt(home)));
}

/** The files of the store `home`, as a layer of the door: the inbox's cards and the queue's tries. */
export function cardFiles(home: string): CardLayer {
  const inbox = inboxAt(home);
  const queue = queueAt(home);
  const fileOf = (name: string) => path.join(inbox, `${name}.md`);
  return {
    cards: {
      entries: () => {
        let names: string[];
        try {
          names = fs.readdirSync(inbox).filter((n) => !n.startsWith('.'));
        } catch {
          return [];
        }
        return names.sort().map((name) => {
          const at = path.join(inbox, name);
          if (isDirectory(at)) return { file: `${name}/`, text: '' };
          try {
            return { file: name, text: name.endsWith('.md') ? fs.readFileSync(at, 'utf8') : '' };
          } catch {
            return { file: name, text: '' };
          }
        });
      },
      read: (name) => {
        try {
          return fs.readFileSync(fileOf(name), 'utf8');
        } catch (err) {
          if ((err as NodeJS.ErrnoException).code === 'ENOENT') return null;
          throw err;
        }
      },
      filedAt: (name) => fs.statSync(fileOf(name), { throwIfNoEntry: false })?.mtime.toISOString() ?? null,
      add: (name, text) => {
        fs.mkdirSync(inbox, { recursive: true });
        try {
          fs.writeFileSync(fileOf(name), text, { flag: 'wx' });
        } catch (err) {
          throw (err as NodeJS.ErrnoException).code === 'EEXIST' ? cardTaken(name, fileOf(name)) : err;
        }
        return fileOf(name);
      },
      rewrite: (name, text) => {
        const at = fileOf(name);
        const filed = fs.statSync(at, { throwIfNoEntry: false })?.mtime;
        if (!filed) throw noCardToRewrite(name);
        const hidden = path.join(inbox, `.${name}.md.${process.pid}`);
        fs.writeFileSync(hidden, text);
        fs.renameSync(hidden, at);
        try {
          fs.utimesSync(at, filed, filed);
        } catch {}
      },
      drop: (name) => {
        try {
          fs.rmSync(fileOf(name));
        } catch (err) {
          if ((err as NodeJS.ErrnoException).code === 'ENOENT') return false;
          throw err;
        }
        return true;
      },
      where: fileOf,
    },
    tries: {
      list: () => {
        const tries = new Map<string, MissedStart>();
        let names: string[];
        try {
          names = fs.readdirSync(queue).filter((n) => n.endsWith('.json'));
        } catch {
          return tries;
        }
        for (const file of names.sort()) {
          try {
            const r: unknown = JSON.parse(fs.readFileSync(path.join(queue, file), 'utf8'));
            if (isMissedStart(r))
              tries.set(file.slice(0, -'.json'.length), { at: r.at, text: r.text, repo: r.repo, why: r.why, refused: r.refused });
          } catch {}
        }
        return tries;
      },
      put: (name, tried) => {
        fs.mkdirSync(queue, { recursive: true });
        fs.writeFileSync(path.join(queue, `${name}.json`), JSON.stringify(tried, null, 2));
      },
      drop: (name) => fs.rmSync(path.join(queue, `${name}.json`), { force: true }),
    },
  };
}

/**
 * The Card door, as the service a program yields: a reference whose default is rooted (`rootedDoor`) — the door over the files at the
 * store's root the program is given, refused `Invalid` where it was given none — and a test gives `cardDoorMemory()` with no root at all
 * (`docs/architecture.md`, *The Card door*).
 */
export const CardDoor = Context.Reference<CardDoorShape>('agent-orchestrator/CardDoor', {
  defaultValue: () => rootedDoor((root) => cardDoorOver(cardFiles(root)), 'Card door'),
});

/** The Card door over the files of the store `root`, as a layer: for a program that names its root by the door, not by `StoreRoot`. */
export const cardDoorFiles = (root: string): Layer.Layer<never> => Layer.succeed(CardDoor)(cardDoorOver(cardFiles(root)));
