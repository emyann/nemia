/**
 * The store's subscriptions on disk: the person's file put once and removed with the deliverer's, the deliverer's written whole and read
 * back, a scope's floor kept, a stored wake list converted on read (`selectorsOfWake`), and a file that does not read — or whose filter
 * does not — left out and said, never a stop. `WF_ROOT` is read as the module loads, so it is set before the import.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { scratch } from '../../test/scratch.ts';
import { upgraded } from '../feed/index.ts';
import { FORMER_NEMIA_WAKE } from './former-wake.ts';

process.env.WF_ROOT = scratch('wf-subscription-store-');
const store = await import('./subscription.store.ts');
const {
  deliveryFile,
  dropSubscription,
  listDeliveries,
  listSubscriptions,
  putSubscription,
  readDelivery,
  subscriptionFile,
  writeDelivery,
} = store;

const SUB = { task: 'nemia-1', selectors: ['reason=Blocked'], digestEvery: 60, from: 120 };

/** Every line said, for a test to read. */
const saying = (): { said: string[]; say: (line: string) => void } => {
  const said: string[] = [];
  return { said, say: (line) => said.push(line) };
};

test('a subscription put is listed by its name, and its name taken again is refused naming nemia unsubscribe', () => {
  putSubscription('watch', SUB);
  assert.deepEqual(listSubscriptions(), [{ name: 'watch', subscription: SUB }]);
  assert.throws(
    () => putSubscription('watch', { ...SUB, task: 'other' }),
    (err: Error & { exitCode?: number }) => {
      assert.match(err.message, /already named watch: nemia unsubscribe watch removes it first/);
      assert.equal(err.exitCode, 2);
      return true;
    },
  );
  assert.equal(JSON.parse(fs.readFileSync(subscriptionFile('watch'), 'utf8')).task, 'nemia-1', 'the first is kept');
  dropSubscription('watch');
});

test("the deliverer's file is written whole and read back, the deliverer's own files listed apart from the subscriptions", () => {
  putSubscription('round', SUB);
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
  const delivery = {
    of: { task: SUB.task, from: SUB.from },
    cursor: 300,
    digest: [signed, shot],
    since: { at: 1_000, mono: { boot: 'b', ms: 5 } },
  };
  writeDelivery('round', delivery);
  assert.deepEqual(
    readDelivery('round'),
    delivery,
    'every field of a signed line survives the round trip, a one-shot’s call and try included',
  );

  const newer = { at, run: 'r-1', word: 'running', apiVersion: 'nemia/v9', aKeyThisNemiaDoesNotName: 'kept' };
  const v0 = { at, run: 'r-1', step: 'plan', word: 'awaiting approval' };
  writeDelivery('round', { ...delivery, digest: [newer, v0] as typeof delivery.digest });
  assert.deepEqual(
    readDelivery('round')?.digest,
    [newer, upgraded(v0)],
    'a key a newer nemia wrote is kept, and a line written before the feed was signed reads back upgraded',
  );
  assert.deepEqual(listDeliveries(), ['round']);
  assert.deepEqual(
    listSubscriptions().map((s) => s.name),
    ['round'],
    "a deliverer's file is no subscription",
  );
  assert.ok(!fs.readdirSync(store.subscriptionsDir()).some((f) => f.startsWith('.')), 'no hidden file left behind');
  dropSubscription('round');
});

test("an unsubscribe removes the person's file, not the deliverer's; a name with none is refused, naming nemia subscribe", () => {
  putSubscription('gone', SUB);
  writeDelivery('gone', { of: { task: SUB.task, from: SUB.from }, cursor: 10, digest: [] });
  dropSubscription('gone');
  assert.equal(fs.existsSync(subscriptionFile('gone')), false);
  assert.equal(fs.existsSync(deliveryFile('gone')), true, "the deliverer's file is its own to drop");
  fs.rmSync(deliveryFile('gone'));
  assert.throws(
    () => dropSubscription('gone'),
    (err: Error & { exitCode?: number }) => {
      assert.match(err.message, /^no subscription is named gone: nemia subscribe gone <task> puts one/);
      assert.equal(err.exitCode, 2);
      return true;
    },
  );
});

test("a subscription put again under a name leaves the deliverer's file left from the last, stamped with the last one", () => {
  const left = { of: { task: 'another', from: 0 }, cursor: 900, digest: [] };
  writeDelivery('again', left);
  putSubscription('again', SUB);
  assert.deepEqual(readDelivery('again'), left);
  dropSubscription('again');
  fs.rmSync(deliveryFile('again'));
});

test('a subscription that does not read is left out and said, naming its file and its first wrong field; the others are listed', () => {
  putSubscription('good', SUB);
  fs.writeFileSync(subscriptionFile('bad'), JSON.stringify({ ...SUB, digestEvery: 0 }));
  fs.writeFileSync(subscriptionFile('torn'), '{"task":');
  const { said, say } = saying();
  assert.deepEqual(
    listSubscriptions(say).map((s) => s.name),
    ['good'],
  );
  assert.equal(said.length, 2);
  assert.ok(
    said.some((l) => l.includes(subscriptionFile('bad')) && l.includes('its digestEvery is 0')),
    said.join('\n'),
  );
  assert.ok(
    said.some((l) => l.includes(subscriptionFile('torn')) && l.includes('is not JSON')),
    said.join('\n'),
  );
  fs.rmSync(subscriptionFile('bad'));
  fs.rmSync(subscriptionFile('torn'));
  dropSubscription('good');
});

test("a deliverer's file that does not read is said and read as not begun, so the subscription starts again from its from", () => {
  fs.mkdirSync(store.subscriptionsDir(), { recursive: true });
  fs.writeFileSync(deliveryFile('odd'), JSON.stringify({ of: { task: 'nemia', from: 0 }, cursor: -1, digest: [] }));
  const { said, say } = saying();
  assert.equal(readDelivery('odd', say), undefined);
  assert.match(said.join('\n'), /its cursor is -1/);
  assert.equal(readDelivery('never'), undefined, 'none written is none begun, and nothing said');
  fs.rmSync(deliveryFile('odd'));
});

test('REFUSED: a scope whose floor is no level leaves the subscription out, said; a floor that is one round-trips', () => {
  putSubscription('floored', { ...SUB, scope: { atLeast: 'semi-auto' } });
  assert.deepEqual(listSubscriptions(), [{ name: 'floored', subscription: { ...SUB, scope: { atLeast: 'semi-auto' } } }]);
  fs.writeFileSync(subscriptionFile('unfloored'), JSON.stringify({ ...SUB, scope: { atLeast: 'on' } }));
  const { said, say } = saying();
  assert.deepEqual(
    listSubscriptions(say).map((s) => s.name),
    ['floored'],
  );
  assert.ok(
    said.some((l) => l.includes(subscriptionFile('unfloored')) && l.includes('scope.atLeast')),
    said.join('\n'),
  );
  fs.rmSync(subscriptionFile('unfloored'));
  dropSubscription('floored');
});

test('a record that holds the former wake key is converted on read, its file left as it is', () => {
  const file = subscriptionFile('former');
  fs.mkdirSync(store.subscriptionsDir(), { recursive: true });
  const stored = { task: 'nemia-1', wake: [...FORMER_NEMIA_WAKE], digestEvery: 1440, from: 0 };
  fs.writeFileSync(file, JSON.stringify(stored));
  assert.deepEqual(listSubscriptions(), [
    { name: 'former', subscription: { task: 'nemia-1', selectors: ['waits=person', 'reason=ToolDenied'], digestEvery: 1440, from: 0 } },
  ]);
  assert.deepEqual(JSON.parse(fs.readFileSync(file, 'utf8')), stored, 'the file is never rewritten: nothing of where its deliverer is moves');
  fs.rmSync(file);
});

test('a wake word the table does not know is said once and the rest of its list still delivers', () => {
  fs.writeFileSync(subscriptionFile('partly'), JSON.stringify({ ...SUB, selectors: undefined, wake: ['blocked', 'verified'] }));
  const { said, say } = saying();
  assert.deepEqual(listSubscriptions(say).map((s) => s.subscription.selectors), [['reason=Blocked']]);
  assert.equal(said.length, 1);
  assert.match(said[0], /the subscription partly was asked for with the word "verified", which names no selector of a feed line/);
  assert.match(said[0], /it is delivered by reason=Blocked alone/);
  fs.rmSync(subscriptionFile('partly'));
});

test('REFUSED: a record with no selector at all is left out and said, never delivered against an empty filter that takes every line', () => {
  const fixtures: Array<[string, object, RegExp]> = [
    ['empty', { ...SUB, selectors: [] }, /its selectors /],
    ['neither', { task: 'nemia-1', digestEvery: 60, from: 0 }, /names no selectors/],
    ['nokey', { ...SUB, selectors: ['message=boom'] }, /holds a selector the feed does not take — "message" is no key of a feed line/],
    ['nowords', { task: 'nemia-1', digestEvery: 60, from: 0, wake: ['verified'] }, /with "verified" alone, which names no selector/],
  ];
  for (const [name, record] of fixtures) fs.writeFileSync(subscriptionFile(name), JSON.stringify(record));
  const { said, say } = saying();
  assert.deepEqual(listSubscriptions(say), [], 'not one of them is delivered');
  for (const [name, , why] of fixtures) {
    const line = said.find((l) => l.includes(subscriptionFile(name)));
    assert.ok(line, `${name} said: ${said.join('\n')}`);
    assert.match(line, why);
    assert.ok(line.includes(`nemia unsubscribe ${name} removes it`), line);
  }
  assert.ok(
    said.every((l) => l.includes('nemia subscribe') || l.includes('its selectors ')),
    'each names how a person puts it again',
  );
  for (const [name] of fixtures) fs.rmSync(subscriptionFile(name));
});
