/**
 * The store's subscriptions on disk, under `$WF_ROOT/subscriptions/`: a person's file per subscription, `<name>.json`, put by
 * `nemia subscribe` and deleted by `nemia unsubscribe`, and the deliverer's beside it, `<name>.state.json`, written and removed by the
 * daemon alone, after each line it delivers or folds and once the person's file is gone, stamped with the subscription it is for. A name
 * holds no `.`, so no subscription is named after a deliverer's file.
 *
 * Beneath the controllers, beside `pause.store.ts`: it imports no store of runs.
 */
import fs from 'node:fs';
import path from 'node:path';
import { Result, Schema } from 'effect';
import { wfRoot } from '../config/config.store.ts';
import { firstRefusal } from '../record/record.store.ts';
import { countRead } from '../meter/tally.store.ts';
import { FeedLineSchema } from '../feed/feed.store.ts';
import { lineAsRead } from '../feed/index.ts';
import { Conflict, Missing } from '../refusal/refusal.ts';
import type { KeptDelivery, Subscription } from './subscription.ts';
import { selectorsOfWake } from './former-wake.ts';
import { SELECTOR_FORM, selectorsRefusal } from '../watch/selector.ts';
import { LEVELS } from '../level/level.ts';

/** The store whose subscriptions these are, read once as the package loads, as `record.store.ts` reads its `HOME`. */
const ROOT = wfRoot();

/** The folder of the store's subscriptions. */
export const subscriptionsDir = (): string => path.join(ROOT, 'subscriptions');

/** A subscription's file, the person's. */
export const subscriptionFile = (name: string): string => path.join(subscriptionsDir(), `${name}.json`);

/** Where the deliverer is with a subscription, its own file. */
export const deliveryFile = (name: string): string => path.join(subscriptionsDir(), `${name}.state.json`);

/** What the deliverer's file ends on. */
const STATE = '.state.json';

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

/** Each unreadable file said once a process: the daemon lists the subscriptions every pass. */
const saidAlready = new Set<string>();
const sayOnce = (line: string): void => {
  if (!saidAlready.has(line)) process.stderr.write(`${line}\n`);
  saidAlready.add(line);
};

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

/** The names the folder holds files for, each once, the person's and the deliverer's apart. */
function namesIn(): { subscriptions: string[]; deliveries: string[] } {
  let files: string[];
  try {
    files = fs.readdirSync(subscriptionsDir());
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
 * The selectors the record `read` is delivered by, or undefined where it is left out of the listing and said once (`said`): a record
 * naming neither `selectors` nor the former `wake`, one whose `selectors` the grammar does not take, and one whose whole wake list
 * converts to nothing. Never an empty list: that would take every line of the feed, where an empty wake list took none.
 *
 * A record holding `selectors` is taken as it is; one holding only `wake` is converted on every read (`selectorsOfWake`), its file left as
 * it is, and each word of it that names no selector said once beside the subscription.
 */
function selectorsOf(name: string, read: { selectors?: readonly string[]; wake?: readonly string[] }, said: (line: string) => void) {
  const left = (why: string): undefined => {
    said(`nemia: the subscription ${subscriptionFile(name)} ${why}: it is not delivered (${retype(name)}).`);
    return undefined;
  };
  if (read.selectors !== undefined) {
    const refusal = selectorsRefusal(read.selectors);
    return refusal === undefined ? [...read.selectors] : left(`holds a selector the feed does not take — ${refusal}`);
  }
  const wake = read.wake ?? [];
  if (wake.length === 0) return left('names no selectors');
  const { selectors, unconverted } = selectorsOfWake(wake);
  if (selectors.length === 0)
    return left(`was asked for with ${wake.map((w) => JSON.stringify(w)).join(', ')} alone, which names no selector of a feed line`);
  if (unconverted.length > 0)
    said(
      `nemia: the subscription ${name} was asked for with the word ${unconverted.map((w) => JSON.stringify(w)).join(', ')}, which names ` +
        `no selector of a feed line: it is delivered by ${selectors.join(' and ')} alone — ${retype(name)}.`,
    );
  return selectors;
}

/**
 * The store's subscriptions, by name. A file that does not read as one is left out and said once on stderr, naming the file and its first
 * wrong field, so one bad file stops no other subscription; so is one whose filter does not read (`selectorsOf`).
 */
export function listSubscriptions(said: (line: string) => void = sayOnce): Array<{ name: string; subscription: Subscription }> {
  return namesIn().subscriptions.flatMap((name) => {
    const text = textOf(subscriptionFile(name));
    if (text === undefined) return [];
    const read = decoded(SubscriptionSchema, text);
    if ('error' in read) {
      said(`nemia: the subscription ${subscriptionFile(name)} ${read.error}: it is not delivered (nemia unsubscribe ${name} removes it).`);
      return [];
    }
    const { task, digestEvery, from, scope } = read.value;
    const selectors = selectorsOf(name, read.value, said);
    if (selectors === undefined) return [];
    return [{ name, subscription: { task, selectors, digestEvery, from, ...(scope ? { scope: { atLeast: scope.atLeast } } : {}) } }];
  });
}

/** The names of the deliverer's files, whatever the subscriptions: one whose subscription is gone is the deliverer's to drop. */
export const listDeliveries = (): string[] => namesIn().deliveries;

/**
 * Puts a subscription: writes its file, created only where none is. Refuses (`Conflict`) a name a subscription already has, naming
 * `nemia unsubscribe`.
 */
export function putSubscription(name: string, subscription: Subscription): void {
  fs.mkdirSync(subscriptionsDir(), { recursive: true });
  try {
    fs.writeFileSync(subscriptionFile(name), `${JSON.stringify(subscription)}\n`, { flag: 'wx' });
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code !== 'EEXIST') throw err;
    throw new Conflict({
      message: `a subscription is already named ${name}: nemia unsubscribe ${name} removes it first, or name this one otherwise.`,
    });
  }
}

/** Removes a subscription; its deliverer stops and drops its own file. Refuses (`Missing`) a name no subscription has. */
export function dropSubscription(name: string): void {
  try {
    fs.unlinkSync(subscriptionFile(name));
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code !== 'ENOENT') throw err;
    throw new Missing({ message: `no subscription is named ${name}: nemia subscribe ${name} <task> puts one.` });
  }
}

/**
 * Where the deliverer is with a subscription, or undefined where it has not begun. A file that does not read is said once on stderr and
 * read as not begun: the subscription starts again from its `from`.
 *
 * A line kept in the digest is read as the feed's own are (`lineAsRead`): one written before the feed's lines were signed reads back
 * upgraded, so the deliverer says of it what it would say of a line read now.
 */
export function readDelivery(name: string, said: (line: string) => void = sayOnce): KeptDelivery | undefined {
  const text = textOf(deliveryFile(name));
  if (text === undefined) return undefined;
  const read = decoded(DeliverySchema, text);
  if ('error' in read) {
    said(`nemia: the delivery ${deliveryFile(name)} ${read.error}: the subscription starts again from where it was asked for.`);
    return undefined;
  }
  const { of, cursor, digest, since } = read.value;
  return { of: { task: of.task, from: of.from }, cursor, digest: digest.map(lineAsRead), ...(since ? { since } : {}) };
}

/** Writes where the deliverer is with a subscription, whole, through a hidden file renamed over it, so a reader never reads half of it. */
export function writeDelivery(name: string, delivery: KeptDelivery): void {
  fs.mkdirSync(subscriptionsDir(), { recursive: true });
  const hidden = path.join(subscriptionsDir(), `.${name}${STATE}.${process.pid}`);
  fs.writeFileSync(hidden, `${JSON.stringify(delivery)}\n`);
  fs.renameSync(hidden, deliveryFile(name));
}

/** Removes the deliverer's file of a subscription, where there is one. */
export function dropDelivery(name: string): void {
  fs.rmSync(deliveryFile(name), { force: true });
}
