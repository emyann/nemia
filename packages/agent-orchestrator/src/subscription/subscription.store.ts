/**
 * The Subscription door: the one way a program reads and writes the store's subscriptions and where the deliverer is with each — an
 * Effect service, `SubscriptionDoor`, whose methods take a subscription's name as `SubscriptionName` and answer an Effect failing with a
 * refusal. Its pattern is the Card door's (`src/door/door.store.ts`).
 *
 * Two layers: the files (`subscriptionFiles`, under `<root>/subscriptions/`: a person's file per subscription, `<name>.json`, put by
 * `nemia subscribe` and deleted by `nemia unsubscribe`, and the deliverer's beside it, `<name>.state.json`, written and removed by the
 * daemon alone, stamped with the subscription it is for), and the memory stand-in (`subscriptionDoorMemory`, `memory.store.ts`), which a
 * test gives its program. Both are built by `subscriptionDoorOver`, so each write is checked the one way on both: a name as
 * `SubscriptionName.OnCreate` checks it, a subscription as the model's `Subscription` with its task named, a cursor from 0 and selectors
 * the feed takes, a delivery as the model's `Delivery` with cursors from 0, or `Invalid` names what is broken and nothing is written; a
 * name taken is `Conflict`, and a drop of none `Missing`. A name holds no `.`, so no subscription is named after a deliverer's file. A
 * delivery's cursor is not held at or above its `from`: a feed cut under it sets it to 0 (`deliver.verb.ts`). The walks of
 * `test/subscription-walks.ts` hold both layers to one table.
 *
 * A file that does not read is no stop: the listing answers it in `left`, with its words, and the deliverer says each once; the store
 * writes nothing to stderr. A file a former nemia wrote still reads: its `wake` list is converted on every read (`selectorsOfWake`).
 *
 * The door's default is rooted (`rootedDoor`). The module's spellings (`listSubscriptions`, `putSubscription`, …) are the door over the
 * files at the module's root, run at once, for a caller that is no program (`test/subscription-door.baseline.ts`).
 */
import fs from 'node:fs';
import path from 'node:path';
import { Context, Effect, Layer, Result, Schema } from 'effect';
import { wfRoot } from '../config/config.store.ts';
import { firstRefusal } from '../record/record.store.ts';
import { countRead } from '../meter/tally.store.ts';
import { FeedLineSchema } from '../feed/feed.store.ts';
import { lineAsRead } from '../feed/index.ts';
import { checked, doorOf, fromThrow, rootedDoor, type DoorOf } from '../door/door.store.ts';
import { Conflict, Invalid, Missing } from '../refusal/refusal.ts';
import { Delivery, FeedCursor, Subscription as SubscriptionModel, SubscriptionName } from '../feed/feed.model.ts';
import type { KeptDelivery, Subscription } from './subscription.ts';
import { selectorsOfWake } from './former-wake.ts';
import { SELECTOR_FORM, selectorsRefusal } from '../watch/selector.ts';
import { LEVELS } from '../level/level.ts';

/** A subscription listed: its name and what its file holds. */
export type Listed = { name: string; subscription: Subscription };

/**
 * A subscription's file left out of the listing, or one listed by less than it was asked for: its name and the words a person reads,
 * which name the file and the fix.
 */
export type Left = { name: string; words: string };

/** Where the deliverer is with a subscription: what its file keeps, or the words of why it does not read; null where it has not begun. */
export type DeliveryRead = { kept: KeptDelivery } | { unread: string } | null;

/** A layer of the Subscription door, as plain synchronous methods: the person's subscriptions and the deliverer's files. */
export type SubscriptionLayer = {
  readonly subscriptions: {
    /** The subscriptions that read, sorted by name, and each file left out, or read by less than it asked for, with its words. */
    readonly list: () => { listed: Listed[]; left: Left[] };
    /** Put the subscription `name`, created only where none is: a name taken is `Conflict`, and left as it is. */
    readonly put: (name: string, subscription: Subscription) => void;
    /** Remove the subscription `name`, never its deliverer's file: `Missing` where there is none. */
    readonly drop: (name: string) => void;
  };
  readonly deliveries: {
    /** The names of the deliverer's files, sorted, whatever the subscriptions: one whose subscription is gone is its to drop. */
    readonly list: () => string[];
    /** Where the deliverer is with the subscription `name` (`DeliveryRead`). */
    readonly read: (name: string) => DeliveryRead;
    /** Write where the deliverer is with `name`, whole, over what was. */
    readonly write: (name: string, delivery: KeptDelivery) => void;
    /** Remove the deliverer's file of `name`, there or not. */
    readonly drop: (name: string) => void;
  };
};

/** The Subscription door's shape: each method of `SubscriptionLayer` answering an Effect, a name taken as `SubscriptionName`. */
export type SubscriptionDoorShape = DoorOf<SubscriptionLayer, SubscriptionName>;

/** A name a subscription already has, as a refusal: the files say so by `EEXIST`, the memory by its own. */
export const subscriptionTaken = (name: string): Conflict =>
  new Conflict({
    message: `a subscription is already named ${name}: nemia unsubscribe ${name} removes it first, or name this one otherwise.`,
  });

/** A name no subscription has, as the refusal of its drop. */
export const noSubscription = (name: string): Missing =>
  new Missing({ message: `no subscription is named ${name}: nemia subscribe ${name} <task> puts one.` });

/** A name a subscription or a delivery is written under, as `SubscriptionName.OnCreate` checks it. */
const nameChecked = checked(SubscriptionName.OnCreate, (name: string) => `a subscription under ${JSON.stringify(name)}`);

/** A subscription put: the model's, its task named and its news from a byte of the feed from 0. */
const SubscriptionPut = Schema.Struct({
  ...SubscriptionModel.fields,
  task: Schema.String.check(Schema.isNonEmpty()),
  from: FeedCursor.OnCreate,
});

/** A delivery written: the model's, its cursors from 0. */
const DeliveryWrite = Schema.Struct({
  ...Delivery.fields,
  of: Schema.Struct({ task: Schema.String, from: FeedCursor.OnCreate }),
  cursor: FeedCursor.OnCreate,
});

/** The selectors of a subscription put, as the feed's grammar takes them: a record holding one it refuses is never delivered. */
const selectorsChecked = (name: string, selectors: readonly string[]) =>
  fromThrow(() => {
    const refusal = selectorsRefusal(selectors);
    if (refusal !== undefined) throw new Invalid({ message: `the subscription ${name} is not written: ${refusal}` });
  });

/** The door over `layer`: each method as `doorOf` makes it, each write's name and value checked before the layer writes. */
export function subscriptionDoorOver(layer: SubscriptionLayer): SubscriptionDoorShape {
  const door = doorOf<SubscriptionLayer, SubscriptionName>(layer);
  return {
    ...door,
    subscriptions: {
      ...door.subscriptions,
      put: (name, subscription) =>
        Effect.gen(function* () {
          yield* nameChecked(name);
          yield* checked(SubscriptionPut, () => `the subscription ${name}`)({ name, ...subscription });
          yield* selectorsChecked(name, subscription.selectors);
          return yield* door.subscriptions.put(name, subscription);
        }),
    },
    deliveries: {
      ...door.deliveries,
      write: (name, delivery) =>
        Effect.gen(function* () {
          yield* nameChecked(name);
          yield* checked(DeliveryWrite, () => `the delivery of ${name}`)({ name, ...delivery });
          return yield* door.deliveries.write(name, delivery);
        }),
    },
  };
}

/** What the deliverer's file ends on. */
const STATE = '.state.json';

/** The folder of the subscriptions of the store `home`. */
export const subscriptionsAt = (home: string): string => path.join(home, 'subscriptions');

/** A subscription's file in the store `home`, the person's. */
export const subscriptionFileAt = (home: string, name: string): string => path.join(subscriptionsAt(home), `${name}.json`);

/** Where the deliverer is with a subscription in the store `home`, its own file. */
export const deliveryFileAt = (home: string, name: string): string => path.join(subscriptionsAt(home), `${name}${STATE}`);

const Rest = [Schema.Record(Schema.String, Schema.Unknown)] as const;
const Bytes = Schema.Int.check(Schema.isGreaterThanOrEqualTo(0));

/** A word of a subscription's file that is text and not empty: a selector as a person typed it, or a wake word a former nemia wrote. */
const Word = Schema.String.check(Schema.isNonEmpty());

/**
 * A subscription's file as `nemia subscribe` writes it. `selectors` is optional on the file and never empty — a record holding none takes
 * every line, where a subscription asked for with none holds `DEFAULT_SELECTORS` — and `wake` is the former key a store written before
 * this slice holds, converted on read (`selectorsOfWake`) and never rewritten.
 */
const SubscriptionSchema = Schema.StructWithRest(
  Schema.Struct({
    task: Schema.String.check(Schema.isNonEmpty()),
    selectors: Schema.optionalKey(Schema.Array(Word).check(Schema.isNonEmpty())),
    wake: Schema.optionalKey(Schema.Array(Word)),
    digestEvery: Schema.Finite.check(Schema.isGreaterThan(0)),
    from: Bytes,
    scope: Schema.optionalKey(Schema.Struct({ atLeast: Schema.Literals(LEVELS) })),
  }),
  Rest,
);

/** A moment as the deliverer stamps a digest's first line: the wall clock, and the boot's monotonic reading where the machine has one. */
const InstantSchema = Schema.Struct({
  at: Schema.Finite,
  mono: Schema.optionalKey(Schema.Struct({ boot: Schema.String.check(Schema.isNonEmpty()), ms: Schema.Finite })),
});

/** The deliverer's file as it writes it. */
const DeliverySchema = Schema.StructWithRest(
  Schema.Struct({
    of: Schema.Struct({ task: Schema.String, from: Bytes }),
    cursor: Bytes,
    digest: Schema.Array(FeedLineSchema),
    since: Schema.optionalKey(InstantSchema),
  }),
  Rest,
);

/** The file's text, counted as read, or undefined where there is none. */
const textOf = (file: string): string | undefined => {
  try {
    const text = fs.readFileSync(file, 'utf8');
    countRead(Buffer.byteLength(text));
    return text;
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === 'ENOENT') return undefined;
    throw err;
  }
};

/** `text` decoded by `schema`, or why it does not read: not JSON, or its first field that is not what nemia writes. */
function decoded<S extends Schema.ConstraintDecoder<unknown>>(schema: S, text: string): { value: S['Type'] } | { error: string } {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    return { error: 'is not JSON' };
  }
  const read = Schema.decodeUnknownResult(schema)(raw);
  if (Result.isSuccess(read)) return { value: read.success };
  const { path: at, words } = firstRefusal(raw, read.failure);
  return { error: `${at.length ? `its ${at.join('.')} ` : ''}${words}` };
}

/** The names the folder `dir` holds files for, each once and sorted, the person's and the deliverer's apart. */
function namesIn(dir: string): { subscriptions: string[]; deliveries: string[] } {
  let files: string[];
  try {
    files = fs.readdirSync(dir).sort();
  } catch {
    return { subscriptions: [], deliveries: [] };
  }
  return {
    subscriptions: files.filter((f) => f.endsWith('.json') && !f.endsWith(STATE) && !f.startsWith('.')).map((f) => f.slice(0, -5)),
    deliveries: files.filter((f) => f.endsWith(STATE) && !f.startsWith('.')).map((f) => f.slice(0, -STATE.length)),
  };
}

/** How a person puts a subscription again once one of theirs was left out, and what a selector takes. */
const retype = (name: string): string =>
  `nemia unsubscribe ${name} removes it, and nemia subscribe ${name} <task> -l <selector> puts it again — ${SELECTOR_FORM}`;

/**
 * The selectors the record `read` of the file `file` is delivered by, or undefined where it is left out of the listing, its words told
 * (`left`): a record naming neither `selectors` nor the former `wake`, one whose `selectors` the grammar does not take, and one whose
 * whole wake list converts to nothing. Never an empty list: that would take every line of the feed, where an empty wake list took none.
 *
 * A record holding `selectors` is taken as it is; one holding only `wake` is converted on every read (`selectorsOfWake`), its file left as
 * it is, and each word of it that names no selector told beside the subscription.
 */
function selectorsOf(
  name: string,
  file: string,
  read: { selectors?: readonly string[]; wake?: readonly string[] },
  left: (words: string) => void,
) {
  const out = (why: string): undefined => {
    left(`nemia: the subscription ${file} ${why}: it is not delivered (${retype(name)}).`);
    return undefined;
  };
  if (read.selectors !== undefined) {
    const refusal = selectorsRefusal(read.selectors);
    return refusal === undefined ? [...read.selectors] : out(`holds a selector the feed does not take — ${refusal}`);
  }
  const wake = read.wake ?? [];
  if (wake.length === 0) return out('names no selectors');
  const { selectors, unconverted } = selectorsOfWake(wake);
  if (selectors.length === 0)
    return out(`was asked for with ${wake.map((w) => JSON.stringify(w)).join(', ')} alone, which names no selector of a feed line`);
  if (unconverted.length > 0)
    left(
      `nemia: the subscription ${name} was asked for with the word ${unconverted.map((w) => JSON.stringify(w)).join(', ')}, which names ` +
        `no selector of a feed line: it is delivered by ${selectors.join(' and ')} alone — ${retype(name)}.`,
    );
  return selectors;
}

/** The files of the store `home`, as a layer of the door: the subscriptions' folder, the person's files and the deliverer's. */
export function subscriptionFiles(home: string): SubscriptionLayer {
  const dir = subscriptionsAt(home);
  const fileOf = (name: string) => subscriptionFileAt(home, name);
  const stateOf = (name: string) => deliveryFileAt(home, name);
  return {
    subscriptions: {
      list: () => {
        const left: Left[] = [];
        const listed = namesIn(dir).subscriptions.flatMap((name): Listed[] => {
          const text = textOf(fileOf(name));
          if (text === undefined) return [];
          const read = decoded(SubscriptionSchema, text);
          if ('error' in read) {
            const words = `nemia: the subscription ${fileOf(name)} ${read.error}: it is not delivered (nemia unsubscribe ${name} removes it).`;
            left.push({ name, words });
            return [];
          }
          const { task, digestEvery, from, scope } = read.value;
          const selectors = selectorsOf(name, fileOf(name), read.value, (words) => left.push({ name, words }));
          if (selectors === undefined) return [];
          return [{ name, subscription: { task, selectors, digestEvery, from, ...(scope ? { scope: { atLeast: scope.atLeast } } : {}) } }];
        });
        return { listed, left };
      },
      put: (name, subscription) => {
        fs.mkdirSync(dir, { recursive: true });
        try {
          fs.writeFileSync(fileOf(name), `${JSON.stringify(subscription)}\n`, { flag: 'wx' });
        } catch (err) {
          throw (err as NodeJS.ErrnoException).code === 'EEXIST' ? subscriptionTaken(name) : err;
        }
      },
      drop: (name) => {
        try {
          fs.unlinkSync(fileOf(name));
        } catch (err) {
          throw (err as NodeJS.ErrnoException).code === 'ENOENT' ? noSubscription(name) : err;
        }
      },
    },
    deliveries: {
      list: () => namesIn(dir).deliveries,
      /**
       * A file that does not read is answered with its words, and the subscription starts again from its `from`. A line kept in the
       * digest is read as the feed's own are (`lineAsRead`): one written before the feed's lines were signed reads back upgraded, so the
       * deliverer says of it what it would say of a line read now.
       */
      read: (name) => {
        const text = textOf(stateOf(name));
        if (text === undefined) return null;
        const read = decoded(DeliverySchema, text);
        if ('error' in read)
          return {
            unread: `nemia: the delivery ${stateOf(name)} ${read.error}: the subscription starts again from where it was asked for.`,
          };
        const { of, cursor, digest, since } = read.value;
        return { kept: { of: { task: of.task, from: of.from }, cursor, digest: digest.map(lineAsRead), ...(since ? { since } : {}) } };
      },
      /** Through a hidden file renamed over it, so a reader never reads half of it. */
      write: (name, delivery) => {
        fs.mkdirSync(dir, { recursive: true });
        const hidden = path.join(dir, `.${name}${STATE}.${process.pid}`);
        fs.writeFileSync(hidden, `${JSON.stringify(delivery)}\n`);
        fs.renameSync(hidden, stateOf(name));
      },
      drop: (name) => fs.rmSync(stateOf(name), { force: true }),
    },
  };
}

/**
 * The Subscription door, as the service a program yields: a reference whose default is rooted (`rootedDoor`) — the door over the files
 * at the store's root the program is given, refused `Invalid` where it was given none — and a test gives `subscriptionDoorMemory()` with
 * no root at all.
 */
export const SubscriptionDoor = Context.Reference<SubscriptionDoorShape>('agent-orchestrator/SubscriptionDoor', {
  defaultValue: () => rootedDoor((root) => subscriptionDoorOver(subscriptionFiles(root)), 'Subscription door'),
});

/** The Subscription door over the files of the store `root`, as a layer: for a program that names its root by the door. */
export const subscriptionDoorFiles = (root: string): Layer.Layer<never> =>
  Layer.succeed(SubscriptionDoor)(subscriptionDoorOver(subscriptionFiles(root)));

/** The store the module's spellings read, read once as the package loads, as `record.store.ts` reads its own. */
const ROOT = wfRoot();

/** An act of the door over the files at the module's root, run at once: a refusal is thrown as it is. */
const atModule = <A>(act: (door: SubscriptionDoorShape) => Effect.Effect<A, unknown>): A =>
  Effect.runSync(act(subscriptionDoorOver(subscriptionFiles(ROOT))));

const named = SubscriptionName.read;

/**
 * The module's subscriptions, by name (`subscriptions.list`): the words of each file left out told to `said`, where one is given, and to
 * nothing where not.
 */
export function listSubscriptions(said?: (line: string) => void): Listed[] {
  const { listed, left } = atModule((door) => door.subscriptions.list());
  for (const one of left) said?.(one.words);
  return listed;
}

/** The names of the deliverer's files at the module's root (`deliveries.list`). */
export const listDeliveries = (): string[] => atModule((door) => door.deliveries.list());

/** Puts a subscription at the module's root (`subscriptions.put`). */
export const putSubscription = (name: string, subscription: Subscription): void =>
  atModule((door) => door.subscriptions.put(named(name), subscription));

/** Removes a subscription at the module's root (`subscriptions.drop`). */
export const dropSubscription = (name: string): void => atModule((door) => door.subscriptions.drop(named(name)));

/** Where the deliverer is with a subscription at the module's root, or undefined; a file that does not read told to `said`. */
export function readDelivery(name: string, said?: (line: string) => void): KeptDelivery | undefined {
  const read = atModule((door) => door.deliveries.read(named(name)));
  if (read !== null && 'unread' in read) said?.(read.unread);
  return read !== null && 'kept' in read ? read.kept : undefined;
}

/** Writes where the deliverer is with a subscription at the module's root (`deliveries.write`). */
export const writeDelivery = (name: string, delivery: KeptDelivery): void =>
  atModule((door) => door.deliveries.write(named(name), delivery));

/** Removes the deliverer's file of a subscription at the module's root (`deliveries.drop`). */
export const dropDelivery = (name: string): void => atModule((door) => door.deliveries.drop(named(name)));
