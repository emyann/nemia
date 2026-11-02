/**
 * The Subscription door's files layer: the door's walks (`test/subscription-walks.ts`) on a fresh scratch store each, and what only the
 * files can be asked — a delivery written today read back whole, every field of its lines kept and a v0 line upgraded, with no hidden
 * file left; a deliverer's file that does not read; a subscription file that does not read, or whose filter does not, left out with its
 * words, never a stop; a scope's floor; a stored wake list converted on read (`selectorsOfWake`); the default door's root; and the
 * debt of `src` still on the module's spellings (`test/subscription-door.baseline.ts`).
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { Effect } from 'effect';
import { names } from '../../test/assessed.ts';
import { scratch } from '../../test/scratch.ts';
import { act, done, doorFrom, walksOn } from '../../test/door-walks.ts';
import { aSubscription, SUBSCRIPTION_WALKS } from '../../test/subscription-walks.ts';
import { upgraded } from '../feed/index.ts';
import { SubscriptionName } from '../feed/feed.model.ts';
import { StoreRoot } from '../config/root.store.ts';
import { FORMER_NEMIA_WAKE } from './former-wake.ts';
import { deliveryFileAt, SubscriptionDoor, subscriptionDoorFiles, subscriptionFileAt, subscriptionsAt } from './subscription.store.ts';
import type { KeptDelivery } from './subscription.ts';

for (const [name, body] of walksOn(SUBSCRIPTION_WALKS, () => {
  const root = scratch('wf-subscription-door-');
  return { door: doorFrom(SubscriptionDoor, subscriptionDoorFiles(root)), root, layer: 'files' };
}))
  test(name, body);

/** A fresh store, its Subscription door over the files, and where its files are. */
const store = () => {
  const root = scratch('wf-subscription-door-');
  fs.mkdirSync(subscriptionsAt(root), { recursive: true });
  return {
    root,
    door: doorFrom(SubscriptionDoor, subscriptionDoorFiles(root)),
    file: (name: string) => subscriptionFileAt(root, name),
    state: (name: string) => deliveryFileAt(root, name),
  };
};
const nameOf = (name: string): SubscriptionName => SubscriptionName.read(name);

const SUB = aSubscription();

test("a delivery written today reads back whole: every field of a signed line, a newer nemia's key, a v0 line upgraded, no hidden file", () => {
  const { root, door } = store();
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
  assert.deepEqual(
    fs.readdirSync(subscriptionsAt(root)).filter((f) => f.startsWith('.')),
    [],
    'no hidden file left behind',
  );
});

test("a deliverer's file that does not read is read with its words, so the subscription starts again from its from", () => {
  const { door, state } = store();
  fs.writeFileSync(state('odd'), JSON.stringify({ of: { task: 'nemia', from: 0 }, cursor: -1, digest: [] }));
  const read = done(door.deliveries.read(nameOf('odd')));
  assert.ok(read !== null && 'unread' in read, JSON.stringify(read));
  names(read.unread, state('odd'), 'its cursor is -1');
});

/** The names `door` lists, and the words of each it left. */
const listing = (door: ReturnType<typeof store>['door']) => {
  const { listed, left } = done(door.subscriptions.list());
  return { listed: listed.map((s) => s.name), left };
};

test('a subscription that does not read is left out with its words, naming its file and its first wrong field; the others are listed', () => {
  const { door, file } = store();
  done(door.subscriptions.put(nameOf('good'), SUB));
  fs.writeFileSync(file('bad'), JSON.stringify({ ...SUB, digestEvery: 0 }));
  fs.writeFileSync(file('torn'), '{"task":');
  const { listed, left } = listing(door);
  assert.deepEqual(listed, ['good']);
  assert.deepEqual(
    left.map((l) => l.name),
    ['bad', 'torn'],
  );
  names(left[0]?.words, file('bad'), 'its digestEvery is 0', 'nemia unsubscribe bad');
  names(left[1]?.words, file('torn'), 'is not JSON');
});

test('REFUSED: a scope whose floor is no level leaves the subscription out, with its words; a floor that is one round-trips', () => {
  const { door, file } = store();
  done(door.subscriptions.put(nameOf('floored'), { ...SUB, scope: { atLeast: 'semi-auto' } }));
  fs.writeFileSync(file('unfloored'), JSON.stringify({ ...SUB, scope: { atLeast: 'on' } }));
  const { listed, left } = done(door.subscriptions.list());
  assert.deepEqual(listed, [{ name: 'floored', subscription: { ...SUB, scope: { atLeast: 'semi-auto' } } }]);
  names(left[0]?.words, file('unfloored'), 'scope.atLeast');
});

test('a record that holds the former wake key is converted on read, its file left as it is', () => {
  const { door, file } = store();
  const stored = { task: 'nemia-1', wake: [...FORMER_NEMIA_WAKE], digestEvery: 1440, from: 0 };
  fs.writeFileSync(file('former'), JSON.stringify(stored));
  assert.deepEqual(done(door.subscriptions.list()), {
    listed: [
      { name: 'former', subscription: { task: 'nemia-1', selectors: ['waits=person', 'reason=ToolDenied'], digestEvery: 1440, from: 0 } },
    ],
    left: [],
  });
  assert.deepEqual(JSON.parse(fs.readFileSync(file('former'), 'utf8')), stored, 'the file is never rewritten');
});

test('a wake word the table does not know is told beside the subscription, and the rest of its list still delivers', () => {
  const { door, file } = store();
  fs.writeFileSync(file('partly'), JSON.stringify({ ...SUB, selectors: undefined, wake: ['blocked', 'verified'] }));
  const { listed, left } = done(door.subscriptions.list());
  assert.deepEqual(
    listed.map((s) => s.subscription.selectors),
    [['reason=AwaitingAnswer']],
  );
  assert.equal(left.length, 1);
  names(left[0]?.words, 'the subscription partly', '"verified"', 'reason=AwaitingAnswer alone');
});

test('REFUSED: a record with no selector at all is left out with its words, never delivered against an empty filter that takes every line', () => {
  const { door, file } = store();
  const fixtures: Array<[string, object, string]> = [
    ['empty', { ...SUB, selectors: [] }, 'its selectors '],
    ['neither', { task: 'nemia-1', digestEvery: 60, from: 0 }, 'names no selectors'],
    ['nokey', { ...SUB, selectors: ['message=boom'] }, '"message"'],
    ['nowords', { task: 'nemia-1', digestEvery: 60, from: 0, wake: ['verified'] }, '"verified" alone'],
  ];
  for (const [name, record] of fixtures) fs.writeFileSync(file(name), JSON.stringify(record));
  const { listed, left } = done(door.subscriptions.list());
  assert.deepEqual(listed, [], 'not one of them is delivered');
  for (const [name, , why] of fixtures) {
    const words = left.find((l) => l.name === name)?.words;
    names(words, file(name), why, `nemia unsubscribe ${name} removes it`);
  }
});

test('the default door reads the files at the store root the program is given, and refuses Invalid where it was given none', () => {
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
function sourcesOfSrc(): Record<string, string> {
  const out: Record<string, string> = {};
  for (const entry of fs.readdirSync(path.join(PKG, 'src'), { recursive: true, withFileTypes: true })) {
    if (!entry.isFile() || !entry.name.endsWith('.ts') || entry.name.endsWith('.test.ts')) continue;
    const file = path.relative(PKG, path.join(entry.parentPath, entry.name)).split(path.sep).join('/');
    if (!OWN.includes(file)) out[file] = fs.readFileSync(path.join(PKG, file), 'utf8');
  }
  return out;
}

/** The seam's calls in each file, comment lines left out: what `SUBSCRIPTION_DOOR_DEBT` counts. */
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
        `${file} calls the subscriptions' module spellings ${n} time(s) where test/subscription-door.baseline.ts names ${owed}: yield SubscriptionDoor (src/subscription/subscription.store.ts) instead`,
      );
    if (n < owed)
      out.push(
        `${file} calls the subscriptions' module spellings ${n} time(s): lower its count in test/subscription-door.baseline.ts to ${n}, which only shrinks`,
      );
  }
  for (const file of Object.keys(debt))
    if (!uses.has(file))
      out.push(`${file} calls the subscriptions' module spellings no more: take its line out of test/subscription-door.baseline.ts`);
  return out;
}

test("no file of src calls the subscriptions' module spellings but as test/subscription-door.baseline.ts counts it, and the count only shrinks", async () => {
  const { SUBSCRIPTION_DOOR_DEBT } = await import('../../test/subscription-door.baseline.ts');
  assert.deepEqual(debtBreaks(sourcesOfSrc(), SUBSCRIPTION_DOOR_DEBT), []);
});

test('REFUSED: a converted file that calls a module spelling again, and a count the baseline holds above what is left', async () => {
  const { SUBSCRIPTION_DOOR_DEBT } = await import('../../test/subscription-door.baseline.ts');
  const sources = sourcesOfSrc();
  const again = {
    ...sources,
    'src/subscription/deliver.verb.ts': `${sources['src/subscription/deliver.verb.ts']}\nconst x = listSubscriptions();\n`,
  };
  assert.equal(debtBreaks(again, SUBSCRIPTION_DOOR_DEBT).length, 1);
  assert.equal(debtBreaks(sources, { ...SUBSCRIPTION_DOOR_DEBT, 'src/subscription/deliver.verb.ts': 1 }).length, 1);
});
