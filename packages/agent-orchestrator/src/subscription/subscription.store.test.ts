/**
 * The Subscription door at a store's root: the door's walks (`test/subscription-walks.ts`) on a fresh scratch store each, and what only a
 * store's keyspace can be asked — a delivery written today read back whole, every field of its lines kept and a v0 line upgraded; a
 * deliverer's record that does not read; a subscription record that does not read, or whose filter does not, left out with its words,
 * never a stop; a scope's floor; a stored wake list converted on read (`selectorsOfWake`); the files of before the keyspace imported; the
 * default door's root; and no file of `src` on the module's spellings, refused.
 */
import { test } from 'vitest';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { seamUses as usesOf, sourcesUnder } from 'test-kit/debt';
import { Effect } from 'effect';
import { names } from '../../test/assessed.ts';
import { scratch } from 'test-kit/scratch';
import { act, done, rootedOn, walksOn } from '../../test/door-walks.ts';
import { plantRecord, recordText } from '../../testing.ts';
import { aSubscription, SUBSCRIPTION_WALKS } from '../../test/subscription-walks.ts';
import { upgraded } from '../feed/index.ts';
import { SubscriptionName } from '../feed/feed.model.ts';
import { StoreRoot } from '../config/root.store.ts';
import { FORMER_NEMIA_WAKE } from './former-wake.ts';
import { deliveryKey, SubscriptionDoor, subscriptionKey } from './subscription.store.ts';
import type { KeptDelivery } from './subscription.ts';

for (const [name, body] of walksOn(SUBSCRIPTION_WALKS, () => {
  const root = scratch('wf-subscription-door-');
  return { door: rootedOn(Effect.runSync(SubscriptionDoor), root), root, layer: 'keyspace' };
}))
  test(name, body);

/** A fresh store, its Subscription door at its root, and a record planted raw at a subscription's key or at its delivery's. */
const store = () => {
  const root = scratch('wf-subscription-door-');
  return {
    root,
    door: rootedOn(Effect.runSync(SubscriptionDoor), root),
    plant: (name: string, text: string) => plantRecord(root, subscriptionKey(name), text),
    plantState: (name: string, text: string) => plantRecord(root, deliveryKey(name), text),
  };
};
const nameOf = (name: string) => SubscriptionName.read(name);

const SUB = aSubscription();

test("a delivery written today reads back whole: every field of a signed line, a newer nemia's key, a v0 line upgraded", () => {
  const { door } = store();
  const at = '2026-10-05T12:00:00.000Z';
  const signed = upgraded({ at, run: 'r-1', step: 'plan', word: 'running' });
  const shot = upgraded({
    at,
    run: 'r-1',
    step: 'plan',
    word: 'denied: Bash(git push)',
    note: 'try 2',
    involved: { kind: 'Step', name: 'r-1/plan' },
    labels: { run: 'r-1', factory: 'nemia', workflow: 'build', step: 'plan', agent: 'ada' },
    call: 'Bash(git push)',
    try: 2,
  });
  const delivery: KeptDelivery = {
    of: { task: SUB.task, from: SUB.from },
    cursor: 300,
    digest: [signed, shot],
    since: { at: 1_000, mono: { boot: 'b', ms: 5 } },
  };
  done(door.deliveries.write(nameOf('round'), delivery));
  assert.deepEqual(done(door.deliveries.read(nameOf('round'))), { kept: delivery }, 'a one-shot’s call and try included');

  const newer = { at, run: 'r-1', word: 'running', apiVersion: 'nemia/v9', aKeyThisNemiaDoesNotName: 'kept' };
  const v0 = { at, run: 'r-1', step: 'plan', word: 'awaiting approval' };
  done(door.deliveries.write(nameOf('round'), { ...delivery, digest: [newer, v0] as KeptDelivery['digest'] }));
  const read = done(door.deliveries.read(nameOf('round')));
  assert.deepEqual(read && 'kept' in read ? read.kept.digest : read, [newer, upgraded(v0)]);
});

test("a deliverer's record that does not read is read with its words, so the subscription starts again from its from", () => {
  const { door, plantState } = store();
  plantState('odd', JSON.stringify({ of: { task: 'nemia', from: 0 }, cursor: -1, digest: [] }));
  const read = done(door.deliveries.read(nameOf('odd')));
  assert.ok(read !== null && 'unread' in read, JSON.stringify(read));
  names(read.unread, deliveryKey('odd'), 'its cursor is -1');
});

/** The names `door` lists, and the words of each it left. */
const listing = (door: ReturnType<typeof store>['door']) => {
  const { listed, left } = done(door.subscriptions.list());
  return { listed: listed.map((s) => s.name), left };
};

test('a subscription that does not read is left out with its words, naming its key and its first wrong field; the others are listed', () => {
  const { door, plant } = store();
  done(door.subscriptions.put(nameOf('good'), SUB));
  plant('bad', JSON.stringify({ ...SUB, digestEvery: 0 }));
  plant('torn', '{"task":');
  const { listed, left } = listing(door);
  assert.deepEqual(listed, ['good']);
  assert.deepEqual(
    left.map((l) => l.name),
    ['bad', 'torn'],
  );
  names(left[0]?.words, subscriptionKey('bad'), 'its digestEvery is 0', 'nemia unsubscribe bad');
  names(left[1]?.words, subscriptionKey('torn'), 'is not JSON');
});

test('REFUSED: a scope whose floor is no level leaves the subscription out, with its words; a floor that is one round-trips', () => {
  const { door, plant } = store();
  done(door.subscriptions.put(nameOf('floored'), { ...SUB, scope: { atLeast: 'semi-auto' } }));
  plant('unfloored', JSON.stringify({ ...SUB, scope: { atLeast: 'on' } }));
  const { listed, left } = done(door.subscriptions.list());
  assert.deepEqual(
    listed.map(({ name, subscription }) => ({ name, subscription })),
    [{ name: 'floored', subscription: { ...SUB, scope: { atLeast: 'semi-auto' } } }],
  );
  names(left[0]?.words, subscriptionKey('unfloored'), 'scope.atLeast');
});

test('a record that holds the former wake key is converted on read, the record left as it is', () => {
  const { root, door, plant } = store();
  const stored = { task: 'nemia-1', wake: [...FORMER_NEMIA_WAKE], digestEvery: 1440, from: 0 };
  plant('former', JSON.stringify(stored));
  assert.deepEqual(done(door.subscriptions.list()), {
    listed: [
      { name: 'former', subscription: { task: 'nemia-1', selectors: ['waits=person', 'reason=ToolDenied'], digestEvery: 1440, from: 0 } },
    ],
    left: [],
  });
  assert.deepEqual(JSON.parse(recordText(root, subscriptionKey('former')) ?? ''), stored, 'the record is never rewritten');
});

test('a wake word the table does not know is told beside the subscription, and the rest of its list still delivers', () => {
  const { door, plant } = store();
  plant('partly', JSON.stringify({ ...SUB, selectors: undefined, wake: ['blocked', 'verified'] }));
  const { listed, left } = done(door.subscriptions.list());
  assert.deepEqual(
    listed.map((s) => s.subscription.selectors),
    [['reason=AwaitingAnswer']],
  );
  assert.equal(left.length, 1);
  names(left[0]?.words, 'the subscription partly', '"verified"', 'reason=AwaitingAnswer alone');
});

test('REFUSED: a record with no selector at all is left out with its words, never delivered against an empty filter that takes every line', () => {
  const { door, plant } = store();
  const fixtures: Array<[string, object, string]> = [
    ['empty', { ...SUB, selectors: [] }, 'its selectors '],
    ['neither', { task: 'nemia-1', digestEvery: 60, from: 0 }, 'names no selectors'],
    ['nokey', { ...SUB, selectors: ['message=boom'] }, 'message'],
    ['nowords', { task: 'nemia-1', digestEvery: 60, from: 0, wake: ['verified'] }, '"verified" alone'],
  ];
  for (const [name, record] of fixtures) plant(name, JSON.stringify(record));
  const { listed, left } = done(door.subscriptions.list());
  assert.deepEqual(listed, [], 'not one of them is delivered');
  for (const [name, , why] of fixtures) {
    const words = left.find((l) => l.name === name)?.words;
    names(words, subscriptionKey(name), why, `nemia unsubscribe ${name} removes it`);
  }
});

test('a store’s subscription files of before the keyspace are imported as they were, the former wake key still read, and moved aside', () => {
  const root = scratch('wf-subscription-import-');
  const dir = path.join(root, 'subscriptions');
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, 's.json'), JSON.stringify({ task: 'nemia-1', wake: [...FORMER_NEMIA_WAKE], digestEvery: 1440, from: 0 }));
  fs.writeFileSync(path.join(dir, 's.state.json'), JSON.stringify({ of: { task: 'nemia-1', from: 0 }, cursor: 12, digest: [] }));
  const door = rootedOn(Effect.runSync(SubscriptionDoor), root);
  const { listed } = done(door.subscriptions.list());
  assert.deepEqual(
    listed.map((one) => [one.name, one.subscription.selectors, typeof one.born]),
    [['s', ['waits=person', 'reason=ToolDenied'], 'string']],
  );
  const read = done(door.deliveries.read(nameOf('s')));
  assert.equal(read !== null && 'kept' in read ? read.kept.cursor : read, 12);
  assert.deepEqual(fs.readdirSync(dir), []);
  assert.deepEqual(fs.readdirSync(path.join(root, 'imported', 'subscriptions')).sort(), ['s.json', 's.state.json']);
});

test('the default door reads the keyspace at the store root the program is given, and refuses Invalid where it was given none', () => {
  const { root, door } = store();
  done(door.subscriptions.put(nameOf('rooted'), SUB));
  const list = Effect.gen(function* () {
    return (yield* (yield* SubscriptionDoor).subscriptions.list()).listed.map((s) => s.name);
  });
  assert.deepEqual(Effect.runSync(Effect.provideService(list, StoreRoot, root)), ['rooted']);
  assert.deepEqual(act(list), { refused: 'Invalid' });
});

const PKG = path.join(import.meta.dirname, '..', '..');

/** The module's spellings the door is over, which `src`'s code still calls rather than yielding the door. */
const SEAM = [
  'listSubscriptions',
  'putSubscription',
  'dropSubscription',
  'readDelivery',
  'writeDelivery',
  'dropDelivery',
  'listDeliveries',
];

/** The door's own files: where the seam is defined, not a debt. */
const OWN = ['src/subscription/subscription.store.ts', 'src/subscription/memory.store.ts'];

/** Every file of `src` but the tests and the door's, by its path from the package. */
const sourcesOfSrc = () => sourcesUnder(PKG, 'src', OWN);

/** The seam's calls in each file, comment lines left out: what `seamRefusals` refuses. */
const seamUses = (sources: Record<string, string>) => usesOf(sources, new RegExp(`(?<![\\w$.])(?:${SEAM.join('|')})\\s*\\(`, 'g'));

/**
 * Each file of `sources` that calls the module's spellings rather than yielding the door, with how many times: a refusal, since every
 * caller is converted and none may come back.
 */
const seamRefusals = (sources: Record<string, string>) =>
  [...seamUses(sources)].map(
    ([file, n]) =>
      `${file} calls the subscriptions' module spellings ${n} time(s): yield SubscriptionDoor (src/subscription/subscription.store.ts) instead`,
  );

test("no file of src calls the subscriptions' module spellings: every caller yields SubscriptionDoor", () => {
  assert.deepEqual(seamRefusals(sourcesOfSrc()), []);
});

test('REFUSED: a file that calls a module spelling again', () => {
  const sources = sourcesOfSrc();
  const again = {
    ...sources,
    'src/subscription/deliver.verb.ts': `${sources['src/subscription/deliver.verb.ts']}\nconst x = listSubscriptions();\n`,
  };
  assert.equal(seamRefusals(again).length, 1);
});
