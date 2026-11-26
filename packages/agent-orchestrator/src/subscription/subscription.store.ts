/**
 * The Subscription door: the one way a program reads and writes the store's subscriptions and where the deliverer is with each — an
 * Effect service, `SubscriptionDoor`, whose methods take a subscription's name as `SubscriptionName` and answer an Effect failing with a
 * refusal.
 *
 * Each is a record of the keyspace (`src/keyspace/keyspace.store.ts`): a person's subscription at `/registry/subscriptions/<name>`, put
 * by `nemia subscribe` and deleted by `nemia unsubscribe`, stamped with when it was made (`createdAt`), and the deliverer's at
 * `/registry/deliveries/<name>`, written and removed by the daemon alone, stamped with the subscription it is for. Its cursor is still a
 * byte of the feed, until the feed's own records. The rooted door and the memory stand-in (`subscriptionDoorMemory`, `memory.store.ts`,
 * over a keyspace in memory) are both `subscriptionRecords` under `subscriptionDoorOver`, so each write is checked the one way on both: a
 * name as `SubscriptionName.OnCreate` checks it, a subscription as the model's `Subscription` with its task named, a cursor from 0 and
 * selectors the feed takes, a delivery as the model's `Delivery` with cursors from 0, or `Invalid` names what is broken and nothing is
 * written; a name taken is `Conflict`, checked and created in one transaction, and a drop of none `Missing`. A delivery's cursor is not
 * held at or above its `from`: a feed cut under it sets it to 0 (`deliver.verb.ts`). The walks of `test/subscription-walks.ts` hold both
 * to one table.
 *
 * A record that does not read is no stop: the listing answers it in `left`, with its words, and the deliverer says each once; the store
 * writes nothing to stderr. A record a former nemia wrote still reads: its `wake` list is converted on every read (`selectorsOfWake`).
 * A store's files of before the keyspace (`<root>/subscriptions/<name>.json` and `<name>.state.json`) are imported once by the kind's
 * import (`SUBSCRIPTION_FILES`, `src/keyspace/import.store.ts`), as they were, and moved aside under `<root>/imported/`.
 *
 * The door's default is rooted (`rootedDoor`). The synchronous spellings (`listSubscriptions`, `putSubscription`, …) are the door at the
 * root `home` they are handed, run at once, for a test that is no program; no file of `src` calls them
 * (`src/subscription/subscription.store.test.ts`).
 */
import fs from 'node:fs';
import path from 'node:path';
import { Context, Effect, Layer, Option, Result, Schema } from 'effect';
import { firstRefusal } from '../record/record.store.ts';
import { countRead } from '../meter/tally.store.ts';
import { FeedLineSchema } from '../feed/feed.store.ts';
import { lineAsRead } from '../feed/index.ts';
import { checked, fromThrow, rootedDoor } from '../door/door.store.ts';
import { Conflict, Invalid, Missing, type Refusal } from '../refusal/refusal.ts';
import { asideOf, kindKeyspace, kindKeyspaceHeld, type ImportKind } from '../keyspace/import.store.ts';
import type { KeyRefused, Keyspace } from '../keyspace/keyspace.store.ts';
import { Delivery, FeedCursor, Subscription as SubscriptionModel, SubscriptionName } from '../feed/feed.model.ts';
import type { KeptDelivery, Subscription } from './subscription.ts';
import { selectorsOfWake } from './former-wake.ts';
import { SELECTOR_FORM, selectorsRefusal } from '../watch/selector.ts';
import { LEVELS } from '../level/level.ts';

/** A subscription listed: its name, what its record holds, and when it was made, where its record says (`born`, an ISO timestamp). */
export type Listed = { name: string; subscription: Subscription; born?: string };

/**
 * A subscription's file left out of the listing, or one listed by less than it was asked for: its name and the words a person reads,
 * which name the file and the fix.
 */
export type Left = { name: string; words: string };

/** Where the deliverer is with a subscription: what its file keeps, or the words of why it does not read; null where it has not begun. */
export type DeliveryRead = { kept: KeptDelivery } | { unread: string } | null;

/** The Subscription door's shape: the person's subscriptions and the deliverer's records, each method answering an Effect. */
export type SubscriptionDoorShape = {
  readonly subscriptions: {
    /** The subscriptions that read, sorted by name, and each record left out, or read by less than it asked for, with its words. */
    readonly list: () => Effect.Effect<{ listed: Listed[]; left: Left[] }, Refusal>;
    /** Put the subscription `name`, created only where none is: a name taken is `Conflict`, and left as it is. */
    readonly put: (name: SubscriptionName, subscription: Subscription) => Effect.Effect<void, Refusal>;
    /** Remove the subscription `name`, never its deliverer's record: `Missing` where there is none. */
    readonly drop: (name: SubscriptionName) => Effect.Effect<void, Refusal>;
  };
  readonly deliveries: {
    /** The names of the deliverer's records, sorted, whatever the subscriptions: one whose subscription is gone is its to drop. */
    readonly list: () => Effect.Effect<string[], Refusal>;
    /** Where the deliverer is with the subscription `name` (`DeliveryRead`). */
    readonly read: (name: SubscriptionName) => Effect.Effect<DeliveryRead, Refusal>;
    /** Write where the deliverer is with `name`, whole, over what was. */
    readonly write: (name: SubscriptionName, delivery: KeptDelivery) => Effect.Effect<void, Refusal>;
    /** Remove the deliverer's record of `name`, there or not. */
    readonly drop: (name: SubscriptionName) => Effect.Effect<void, Refusal>;
  };
};

/**
 * A name a subscription already has, as a refusal.
 * @param name The subscription's name that is taken.
 */
export const subscriptionTaken = (name: string) =>
  new Conflict({
    message: `a subscription is already named ${name}: nemia unsubscribe ${name} removes it first, or name this one otherwise.`,
  });

/**
 * A name no subscription has, as the refusal of its drop.
 * @param name The name the drop asked for.
 */
export const noSubscription = (name: string) =>
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

/**
 * The door over `door`: each write's name and value checked before it is written.
 * @param door The subscriptions and deliveries as the door's shape, read and written through.
 */
export function subscriptionDoorOver(door: SubscriptionDoorShape) {
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
  } satisfies SubscriptionDoorShape;
}

/** What the deliverer's file ended on, beside the person's, before the keyspace. */
const STATE = '.state.json';

/** The keyspace's prefix of every subscription, and of every delivery. */
const SUBSCRIPTIONS = '/registry/subscriptions/';
const DELIVERIES = '/registry/deliveries/';

/**
 * The key of the subscription `name`'s record.
 * @param name The subscription's name.
 */
export const subscriptionKey = (name: string) => `${SUBSCRIPTIONS}${name}`;

/**
 * The key of the deliverer's record of the subscription `name`.
 * @param name The subscription's name.
 */
export const deliveryKey = (name: string) => `${DELIVERIES}${name}`;

const Rest = [Schema.Record(Schema.String, Schema.Unknown)] as const;
const Bytes = Schema.Natural;

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
    createdAt: Schema.optionalKey(Schema.String),
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

/** `text` decoded by `schema`, or why it does not read: not JSON, or its first field that is not what nemia writes. */
function decoded<S extends Schema.ConstraintDecoder<unknown>>(schema: S, text: string) {
  const json = Schema.decodeUnknownOption(Schema.fromJsonString(Schema.Unknown))(text);
  if (Option.isNone(json)) return { error: 'is not JSON' };
  const raw = json.value;
  const read = Schema.decodeUnknownResult(schema)(raw);
  if (Result.isSuccess(read)) return { value: read.success };
  const { path: at, words } = firstRefusal(schema, raw);
  return { error: `${at.length ? `its ${at.join('.')} ` : ''}${words}` };
}

/** How a person puts a subscription again once one of theirs was left out, and what a selector takes. */
const retype = (name: string) =>
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
  const out = (why: string) => {
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

/** A record's value, counted as read. */
const counted = (value: string) => {
  countRead(Buffer.byteLength(value));
  return value;
};

/** A write raced by another between its read and its write, as a refusal. */
const raced = (err: KeyRefused) =>
  new Conflict({ message: `${err.key} was written by another while it was written here: run again.` }) satisfies Refusal as Refusal;

/**
 * The subscription a record holds, listed, or the words of why it is left out, told to `left`.
 * @param name The subscription's name.
 * @param value The record's value.
 * @param left Told the words of a record left out, or read by less than it asked for.
 */
function listedOf(name: string, value: string, left: (words: string) => void) {
  const where = `${SUBSCRIPTIONS}${name}`;
  const read = decoded(SubscriptionSchema, value);
  if ('error' in read) {
    left(`nemia: the subscription ${where} ${read.error}: it is not delivered (nemia unsubscribe ${name} removes it).`);
    return [];
  }
  const { task, digestEvery, from, scope, createdAt } = read.value;
  const selectors = selectorsOf(name, where, read.value, left);
  if (selectors === undefined) return [];
  return [
    {
      name,
      subscription: { task, selectors, digestEvery, from, ...(scope ? { scope: { atLeast: scope.atLeast } } : {}) },
      ...(createdAt !== undefined ? { born: createdAt } : {}),
    } satisfies Listed,
  ];
}

/**
 * Where the deliverer is with `name`, as its record holds it. A record that does not read is answered with its words, and the
 * subscription starts again from its `from`. A line kept in the digest is read as the feed's own are (`lineAsRead`): one written before
 * the feed's lines were signed reads back upgraded, so the deliverer says of it what it would say of a line read now.
 */
function deliveryOf(name: string, value: string) {
  const read = decoded(DeliverySchema, value);
  if ('error' in read)
    return {
      unread: `nemia: the delivery ${DELIVERIES}${name} ${read.error}: the subscription starts again from where it was asked for.`,
    } satisfies DeliveryRead;
  const { of, cursor, digest, since } = read.value;
  return {
    kept: { of: { task: of.task, from: of.from }, cursor, digest: digest.map(lineAsRead), ...(since ? { since } : {}) },
  } satisfies DeliveryRead;
}

/**
 * The subscriptions and deliveries of the keyspace `open` opens when a method runs, as the door's shape. A read asks `held`, and answers
 * none where it answers no keyspace, so a store read is not a store made.
 * @param open Opens the keyspace they are held in, refused as opening it is.
 * @param held The keyspace a read reads, or undefined where the store holds none yet; `open` where every read may make it.
 * @param now When a subscription put is made, as an ISO timestamp.
 */
export function subscriptionRecords(
  open: Effect.Effect<Keyspace, Refusal>,
  held: Effect.Effect<Keyspace | undefined, Refusal> = open,
  now: () => string = () => new Date().toISOString(),
) {
  const nameOf = (key: string, prefix: string) => key.slice(prefix.length);
  return {
    subscriptions: {
      list: () =>
        Effect.gen(function* () {
          const keyspace = yield* held;
          const left: Left[] = [];
          if (keyspace === undefined) return { listed: [], left };
          const { records } = yield* keyspace.list(SUBSCRIPTIONS);
          const listed = records.flatMap((record) => {
            const name = nameOf(record.key, SUBSCRIPTIONS);
            return listedOf(name, counted(record.value), (words) => left.push({ name, words }));
          });
          return { listed, left };
        }),
      put: (name, subscription) =>
        Effect.gen(function* () {
          const keyspace = yield* open;
          const value = JSON.stringify({ ...subscription, createdAt: now() });
          yield* keyspace
            .write(`${SUBSCRIPTIONS}${name}`, { verb: 'create', expected: null, value })
            .pipe(Effect.mapError((err) => (err.refusal === 'exists' ? subscriptionTaken(name) : raced(err))));
        }),
      drop: (name) =>
        Effect.gen(function* () {
          const keyspace = yield* held;
          if (keyspace === undefined) return yield* noSubscription(name);
          yield* keyspace
            .write(`${SUBSCRIPTIONS}${name}`, { verb: 'delete', expected: null, value: '' })
            .pipe(Effect.mapError((err) => (err.refusal === 'missing' ? noSubscription(name) : raced(err))));
        }),
    },
    deliveries: {
      list: () =>
        Effect.gen(function* () {
          const keyspace = yield* held;
          if (keyspace === undefined) return [];
          return (yield* keyspace.keys(DELIVERIES)).map((key) => nameOf(key, DELIVERIES));
        }),
      read: (name) =>
        Effect.gen(function* () {
          const keyspace = yield* held;
          const record = keyspace === undefined ? undefined : yield* keyspace.get(`${DELIVERIES}${name}`);
          return record === undefined ? null : deliveryOf(name, counted(record.value));
        }),
      write: (name, delivery) =>
        Effect.gen(function* () {
          const keyspace = yield* open;
          const key = `${DELIVERIES}${name}`;
          const value = JSON.stringify(delivery);
          yield* keyspace
            .within((tx) =>
              Effect.flatMap(tx.get(key), (there) =>
                tx.write(key, { verb: there === undefined ? 'create' : 'update', expected: null, value }),
              ),
            )
            .pipe(Effect.mapError(raced));
        }),
      drop: (name) =>
        Effect.gen(function* () {
          const keyspace = yield* held;
          if (keyspace === undefined) return;
          const key = `${DELIVERIES}${name}`;
          yield* keyspace
            .within((tx) =>
              Effect.flatMap(tx.get(key), (there) =>
                there === undefined ? Effect.void : Effect.asVoid(tx.write(key, { verb: 'delete', expected: null, value: '' })),
              ),
            )
            .pipe(Effect.mapError(raced));
        }),
    },
  } satisfies SubscriptionDoorShape;
}

/** When `file` was made, as an ISO timestamp, or undefined where it cannot be read. */
const bornOf = (file: string) => {
  const stat = fs.statSync(file, { throwIfNoEntry: false });
  if (stat === undefined) return undefined;
  return new Date(stat.birthtimeMs > 0 ? stat.birthtimeMs : stat.mtimeMs).toISOString();
};

/**
 * The subscription files of a store from before the keyspace, `subscriptions/<name>.json` and the deliverer's `<name>.state.json`: what
 * the kind's import takes up as they are, a subscription stamped with its file's birth. A file that is no JSON stays where it is.
 */
export const SUBSCRIPTION_FILES: ImportKind = {
  name: 'subscriptions',
  folders: (home) => [path.join(home, 'subscriptions')],
  files: (home) => {
    const dir = path.join(home, 'subscriptions');
    let names: string[];
    try {
      names = fs.readdirSync(dir).sort();
    } catch {
      return [];
    }
    return names
      .filter((f) => f.endsWith('.json') && !f.startsWith('.'))
      .flatMap((f) => {
        const delivery = f.endsWith(STATE);
        const name = f.slice(0, -(delivery ? STATE.length : '.json'.length));
        if (Option.isNone(Schema.decodeUnknownOption(SubscriptionName.OnCreate)(name))) return [];
        const file = path.join(dir, f);
        return [
          {
            file,
            key: `${delivery ? DELIVERIES : SUBSCRIPTIONS}${name}`,
            aside: asideOf(home, file),
            read: (text: string) => {
              const json = Schema.decodeUnknownOption(Schema.fromJsonString(Schema.Record(Schema.String, Schema.Unknown)))(text);
              if (Option.isNone(json)) return { unreadable: 'it is no JSON object' };
              if (delivery) return { value: JSON.stringify(json.value) };
              const born = bornOf(file);
              const raw = json.value;
              return { value: JSON.stringify(born === undefined || 'createdAt' in raw ? raw : { ...raw, createdAt: born }) };
            },
          },
        ];
      });
  },
};

/**
 * The Subscription door, as the service a program yields: a reference whose default is rooted (`rootedDoor`) — the door over the
 * keyspace at the store's root the program is given, refused `Invalid` where it was given none — and a test gives
 * `subscriptionDoorMemory()` with no root at all.
 */
export const SubscriptionDoor = Context.Reference<SubscriptionDoorShape>('agent-orchestrator/SubscriptionDoor', {
  defaultValue: () =>
    rootedDoor(
      (root) =>
        subscriptionDoorOver(subscriptionRecords(kindKeyspace(root, SUBSCRIPTION_FILES), kindKeyspaceHeld(root, SUBSCRIPTION_FILES))),
      'Subscription door',
    ),
});

/**
 * The Subscription door at the store `root`, as a layer: for a program that names its root by the door.
 * @param root The store's root folder.
 */
export const subscriptionDoorAt = (root: string) =>
  Layer.succeed(SubscriptionDoor)(
    subscriptionDoorOver(subscriptionRecords(kindKeyspace(root, SUBSCRIPTION_FILES), kindKeyspaceHeld(root, SUBSCRIPTION_FILES))),
  );

/** An act of the door at the root `home`, run at once: a refusal is thrown as it is. A test's, never a program's. */
const atRoot = <A>(home: string, act: (door: SubscriptionDoorShape) => Effect.Effect<A, unknown>) =>
  Effect.runSync(
    act(subscriptionDoorOver(subscriptionRecords(kindKeyspace(home, SUBSCRIPTION_FILES), kindKeyspaceHeld(home, SUBSCRIPTION_FILES)))),
  );

const named = SubscriptionName.read;

/**
 * The module's subscriptions, by name (`subscriptions.list`): the words of each file left out told to `said`, where one is given, and to
 * nothing where not.
 * @param home The store's root folder.
 * @param said Told the words of each file left out, or undefined to tell them to nothing.
 */
export function listSubscriptions(home: string, said?: (line: string) => void) {
  const { listed, left } = atRoot(home, (door) => door.subscriptions.list());
  for (const one of left) said?.(one.words);
  return listed;
}

/**
 * The names of the deliverer's files at the root `home` (`deliveries.list`).
 * @param home The store's root folder.
 */
export const listDeliveries = (home: string) => atRoot(home, (door) => door.deliveries.list());

/**
 * Puts a subscription at the root `home` (`subscriptions.put`).
 * @param home The store's root folder.
 * @param name The subscription's name.
 * @param subscription The subscription to write.
 */
export const putSubscription = (home: string, name: string, subscription: Subscription) =>
  atRoot(home, (door) => door.subscriptions.put(named(name), subscription));

/**
 * Removes a subscription at the root `home` (`subscriptions.drop`).
 * @param home The store's root folder.
 * @param name The subscription's name.
 */
export const dropSubscription = (home: string, name: string) => atRoot(home, (door) => door.subscriptions.drop(named(name)));

/**
 * Where the deliverer is with a subscription at the root `home`, or undefined; a file that does not read told to `said`.
 * @param home The store's root folder.
 * @param name The subscription's name.
 * @param said Told the words of a file that does not read, or undefined to tell them to nothing.
 */
export function readDelivery(home: string, name: string, said?: (line: string) => void) {
  const read = atRoot(home, (door) => door.deliveries.read(named(name)));
  if (read !== null && 'unread' in read) said?.(read.unread);
  return read !== null && 'kept' in read ? read.kept : undefined;
}

/**
 * Writes where the deliverer is with a subscription at the root `home` (`deliveries.write`).
 * @param home The store's root folder.
 * @param name The subscription's name.
 * @param delivery Where the deliverer is with it: its cursor, its digest and whose it is.
 */
export const writeDelivery = (home: string, name: string, delivery: KeptDelivery) =>
  atRoot(home, (door) => door.deliveries.write(named(name), delivery));

/**
 * Removes the deliverer's file of a subscription at the root `home` (`deliveries.drop`).
 * @param home The store's root folder.
 * @param name The subscription's name.
 */
export const dropDelivery = (home: string, name: string) => atRoot(home, (door) => door.deliveries.drop(named(name)));
