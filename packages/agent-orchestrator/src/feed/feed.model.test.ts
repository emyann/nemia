/**
 * The feed model: a cursor is a whole byte from 0, a subscription's name refuses what `subscriptionNameRefusal` refuses and takes what
 * `nemia subscribe` is given, a subscription decodes as its store reads one, a delivery as the deliverer writes one, and each kind of line
 * decodes as the feed's writers write it.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Option, Schema } from 'effect';
import { DaemonLine, Delivery, FeedCursor, FeedLine, feedModel, RunLine, StoreLine, Subscription, SubscriptionName } from './feed.model.ts';
import { DAEMON_STARTED, startedLine, STORE, upgraded } from './feed.ts';
import { DEFAULT_DIGEST_EVERY, DEFAULT_SELECTORS } from '../subscription/subscription.ts';

const AT = '2026-09-16T10:00:00.000Z';

/** Nemia's own subscription, as `nemia subscribe` files it and `listSubscriptions` lists it. */
const NEMIA = {
  name: 'nemia',
  task: 'nemia-1',
  selectors: [...DEFAULT_SELECTORS],
  digestEvery: DEFAULT_DIGEST_EVERY,
  from: 120,
  scope: { atLeast: 'semi-auto' },
};

test("a feed's cursor is a whole byte from 0, checked on create and read as any number", async (t) => {
  await t.test('REFUSED: below 0, or not whole', () => {
    for (const n of [-1, 1.5, Number.NaN]) assert.equal(Option.isNone(FeedCursor.create.option(n)), true, String(n));
  });
  await t.test('takes the start and a byte a read handed out', () => {
    for (const n of [0, 120]) assert.equal(Schema.is(FeedCursor.OnCreate)(n), true, String(n));
  });
  await t.test('reads one written before the check', () => assert.equal(Schema.is(FeedCursor.OnRead)(-1), true));
});

test("a subscription's name is checked on create by subscriptionNameRefusal's rule and read as any string", async (t) => {
  await t.test('refuses what subscriptionNameRefusal refuses', () => {
    for (const name of ['', '../x', 'a b', 'x.state', '-x'])
      assert.equal(Option.isNone(SubscriptionName.create.option(name)), true, JSON.stringify(name));
  });
  await t.test('takes what nemia subscribe is given', () => {
    for (const name of ['nemia', 'watch', 'a_b-2']) assert.equal(Schema.is(SubscriptionName.OnCreate)(name), true, name);
  });
  await t.test('reads a name written before the check', () => assert.equal(Schema.is(SubscriptionName.OnRead)('a b'), true));
});

test('a subscription decodes as its store lists one, and one its writer would refuse is refused', async (t) => {
  await t.test('scoped', () => assert.equal(Schema.decodeUnknownResult(Subscription)(NEMIA)._tag, 'Success'));
  await t.test('unscoped', () => {
    const { scope: _, ...unscoped } = NEMIA;
    assert.equal(Schema.is(Subscription)(unscoped), true);
  });
  const rows: Record<string, object> = {
    'no selector': { ...NEMIA, selectors: [] },
    'a digest not above zero minutes': { ...NEMIA, digestEvery: 0 },
    'a floor that is no level': { ...NEMIA, scope: { atLeast: 'never' } },
  };
  for (const [row, sub] of Object.entries(rows)) await t.test(`REFUSED: ${row}`, () => assert.equal(Schema.is(Subscription)(sub), false));
});

test('a delivery decodes as the deliverer writes one, a stored one read as it is, and one the deliverer would not write is refused', async (t) => {
  const kept = {
    name: 'nemia',
    of: { task: 'nemia-1', from: 120 },
    cursor: 300,
    digest: [upgraded({ at: AT, run: 'r-1', word: 'running' }), startedLine(5151, { kind: 'none' }, AT, 0)],
    since: { at: 1_000, mono: { boot: 'b', ms: 5 } },
  };
  await t.test('with a digest and its time', () => assert.equal(Schema.decodeUnknownResult(Delivery)(kept)._tag, 'Success'));
  await t.test('as a file of today holds one, a cursor cut back to 0 under its from, an empty digest and no time', () =>
    assert.equal(Schema.is(Delivery)({ name: 'nemia', of: { task: 'nemia-1', from: 120 }, cursor: 0, digest: [] }), true),
  );
  await t.test('nominal on read: a cursor written before the check', () =>
    assert.equal(Schema.is(Delivery)({ ...kept, cursor: -1 }), true),
  );
  const rows: Record<string, object> = {
    'no subscription it was written for': { ...kept, of: undefined },
    'a digest of what is no line': { ...kept, digest: [{ word: 'running' }] },
    'a time that is no instant': { ...kept, since: { at: 'now' } },
  };
  for (const [row, delivery] of Object.entries(rows))
    await t.test(`REFUSED: ${row}`, () => assert.equal(Schema.is(Delivery)(delivery), false));
});

test('each kind of line decodes as the feed’s writers write it, and as a line of the feed', async (t) => {
  const rows: Record<string, [Schema.Constraint, unknown]> = {
    "a run's": [RunLine, upgraded({ at: AT, run: 'r-1', word: 'running' })],
    "a step's, with its try": [RunLine, { ...upgraded({ at: AT, run: 'r-1', step: 'review', word: 'blocked', note: 'x' }), try: 1 }],
    "a daemon's": [DaemonLine, startedLine(5151, { kind: 'none' }, AT, 0)],
    "the store's": [StoreLine, upgraded({ at: AT, store: STORE, word: 'store paused', note: `since ${AT}` })],
  };
  for (const [row, [schema, line]] of Object.entries(rows))
    await t.test(row, () => {
      assert.equal(Schema.is(schema)(line), true);
      assert.equal(Schema.is(FeedLine)(line), true);
    });
  await t.test('REFUSED: a daemon line of another word', () =>
    assert.equal(Schema.is(DaemonLine)({ at: AT, daemon: 1, word: `not ${DAEMON_STARTED}` }), false),
  );
  await t.test('the model', () => {
    assert.deepEqual(feedModel.ids, { SubscriptionName: 'Subscription' });
    assert.deepEqual(feedModel.entities, [Subscription, Delivery, RunLine, DaemonLine, StoreLine]);
  });
});
