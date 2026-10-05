/**
 * The store's subscriptions on disk: the person's file put once and removed with the deliverer's, the deliverer's written whole and read
 * back, and a file that does not read left out and said, never a stop. `WF_ROOT` is read as the module loads, so it is set before the
 * import.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { scratch } from '../../test/scratch.ts';

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

const SUB = { task: 'nemia-1', wake: ['blocked'], digestEvery: 60, from: 120 };

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
  const delivery = {
    of: { task: SUB.task, from: SUB.from },
    cursor: 300,
    digest: [{ at: '2026-10-05T12:00:00.000Z', run: 'r-1', step: 'plan', word: 'running' }],
    since: { at: 1_000, mono: { boot: 'b', ms: 5 } },
  };
  writeDelivery('round', delivery);
  assert.deepEqual(readDelivery('round'), delivery);
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
