/**
 * The Subscription door's contract (`SubscriptionDoor`, `src/subscription/subscription.store.ts`), as walks (`door-walks.ts`): every
 * method's rows, run on the files by `src/subscription/subscription.store.test.ts` and on the memory stand-in by
 * `src/subscription/memory.store.test.ts`. A subscription put is listed, dropped and gone, its deliverer's file apart from it; a delivery
 * written is listed, read back whole, written over and removed. And the write check: a subscription under a name that is none, at a
 * name taken, with minutes not above zero, no selector, a selector the feed does not take or a cursor below 0, a drop of none, and a
 * delivery under a bad name or with a cursor below 0, are refused and nothing is written.
 *
 * Each walk is on a side of its own: a fresh store, or a fresh stand-in.
 */
import type { DoorWalk } from './door-walks.ts';
import { act, done } from './door-walks.ts';
import type { SubscriptionDoorShape } from '../src/subscription/subscription.store.ts';
import { SubscriptionName } from '../src/feed/feed.model.ts';
import { upgraded, type FeedLine } from '../src/feed/feed.ts';
import type { KeptDelivery, Subscription } from '../src/subscription/subscription.ts';

type Walk = DoorWalk<SubscriptionDoorShape>;
type Door = SubscriptionDoorShape;

const nameOf = (name: string): SubscriptionName => SubscriptionName.read(name);

/** A subscription as `nemia subscribe` puts one. */
export const aSubscription = (task = 'nemia-1', more: Partial<Subscription> = {}): Subscription => ({
  task,
  selectors: ['reason=Blocked'],
  digestEvery: 60,
  from: 120,
  ...more,
});

const AT = '2026-10-05T12:00:00.000Z';

/** A delivery as the deliverer keeps one: a run's line and a step's folded, from the time the first was. */
export const aDelivery = (cursor = 300, task = 'nemia-1'): KeptDelivery => ({
  of: { task, from: 120 },
  cursor,
  digest: [
    upgraded({ at: AT, run: 'r-1', word: 'running' }),
    upgraded({ at: AT, run: 'r-1', step: 'plan', word: 'awaiting approval' }),
  ] as FeedLine[],
  since: { at: 1_000, mono: { boot: 'b', ms: 5 } },
});

/** `name` put on `door`. */
const put = (door: Door, name: string, subscription = aSubscription()): void => done(door.subscriptions.put(nameOf(name), subscription));

/** The names of the subscriptions `door` lists. */
const listed = (door: Door): string[] => done(door.subscriptions.list()).listed.map((s) => s.name);

/** The names of the deliveries `door` holds. */
const delivered = (door: Door): string[] => done(door.deliveries.list());

export const SUBSCRIPTION_WALKS: Readonly<Record<string, readonly Walk[]>> = {
  'subscriptions.list': [
    { name: 'none in an empty store', walk: ({ door }) => done(door.subscriptions.list()), says: { listed: [], left: [] } },
    {
      name: 'each put, by its name, sorted, a scope kept',
      walk: ({ door }) => {
        put(door, 'zeta');
        put(door, 'alpha', aSubscription('nemia-2', { scope: { atLeast: 'semi-auto' } }));
        return done(door.subscriptions.list());
      },
      says: {
        listed: [
          { name: 'alpha', subscription: aSubscription('nemia-2', { scope: { atLeast: 'semi-auto' } }) },
          { name: 'zeta', subscription: aSubscription() },
        ],
        left: [],
      },
    },
  ],
  'subscriptions.put': [
    { name: 'put, then listed', walk: ({ door }) => (put(door, 'watch'), listed(door)), says: ['watch'] },
    {
      name: 'REFUSED: a name taken is a Conflict, the first kept',
      walk: ({ door }) => {
        put(door, 'watch');
        return {
          again: act(door.subscriptions.put(nameOf('watch'), aSubscription('other'))),
          listed: done(door.subscriptions.list()).listed,
        };
      },
      says: { again: { refused: 'Conflict' }, listed: [{ name: 'watch', subscription: aSubscription() }] },
    },
    {
      name: "REFUSED: a name that is no subscription's is Invalid, nothing put",
      walk: ({ door }) => ({
        made: ['../x', 'x.state', '-x', ''].map((name) => act(door.subscriptions.put(nameOf(name), aSubscription()))),
        listed: listed(door),
      }),
      says: { made: [{ refused: 'Invalid' }, { refused: 'Invalid' }, { refused: 'Invalid' }, { refused: 'Invalid' }], listed: [] },
    },
    {
      name: 'REFUSED: minutes not above zero, no selector, a selector the feed does not take, a cursor below 0 or no task are Invalid, nothing put',
      walk: ({ door }) => ({
        made: [
          aSubscription('nemia-1', { digestEvery: 0 }),
          aSubscription('nemia-1', { selectors: [] }),
          aSubscription('nemia-1', { selectors: ['message=boom'] }),
          aSubscription('nemia-1', { from: -1 }),
          aSubscription(''),
        ].map((subscription) => act(door.subscriptions.put(nameOf('watch'), subscription))),
        listed: listed(door),
      }),
      says: {
        made: [{ refused: 'Invalid' }, { refused: 'Invalid' }, { refused: 'Invalid' }, { refused: 'Invalid' }, { refused: 'Invalid' }],
        listed: [],
      },
    },
    {
      name: "a subscription put again under a name leaves the deliverer's file left from the last",
      walk: ({ door }) => {
        done(door.deliveries.write(nameOf('again'), aDelivery(900, 'another')));
        put(door, 'again');
        return done(door.deliveries.read(nameOf('again')));
      },
      says: { kept: aDelivery(900, 'another') },
    },
  ],
  'subscriptions.drop': [
    {
      name: "gone from the list, the deliverer's file left for the deliverer to drop",
      walk: ({ door }) => {
        put(door, 'gone');
        done(door.deliveries.write(nameOf('gone'), aDelivery()));
        done(door.subscriptions.drop(nameOf('gone')));
        return { listed: listed(door), delivered: delivered(door) };
      },
      says: { listed: [], delivered: ['gone'] },
    },
    {
      name: 'REFUSED: a name no subscription has is Missing',
      walk: ({ door }) => act(door.subscriptions.drop(nameOf('never'))),
      says: { refused: 'Missing' },
    },
  ],
  'deliveries.list': [
    { name: 'none in an empty store', walk: ({ door }) => delivered(door), says: [] },
    {
      name: "each written, sorted, whatever the subscriptions, and a deliverer's file is no subscription",
      walk: ({ door }) => {
        put(door, 'round');
        done(door.deliveries.write(nameOf('round'), aDelivery()));
        done(door.deliveries.write(nameOf('orphan'), aDelivery()));
        return { delivered: delivered(door), listed: listed(door) };
      },
      says: { delivered: ['orphan', 'round'], listed: ['round'] },
    },
  ],
  'deliveries.read': [
    { name: 'none written is null', walk: ({ door }) => done(door.deliveries.read(nameOf('never'))), says: null },
    {
      name: 'what was written, whole',
      walk: ({ door }) => {
        done(door.deliveries.write(nameOf('round'), aDelivery()));
        return done(door.deliveries.read(nameOf('round')));
      },
      says: { kept: aDelivery() },
    },
  ],
  'deliveries.write': [
    {
      name: 'the latest of two is kept, an empty digest with no time',
      walk: ({ door }) => {
        done(door.deliveries.write(nameOf('round'), aDelivery()));
        done(door.deliveries.write(nameOf('round'), { of: { task: 'nemia-1', from: 120 }, cursor: 0, digest: [] }));
        return done(door.deliveries.read(nameOf('round')));
      },
      says: { kept: { of: { task: 'nemia-1', from: 120 }, cursor: 0, digest: [] } },
    },
    {
      name: 'REFUSED: a cursor below 0 is Invalid, the last kept',
      walk: ({ door }) => {
        done(door.deliveries.write(nameOf('round'), aDelivery()));
        return { written: act(door.deliveries.write(nameOf('round'), aDelivery(-1))), read: done(door.deliveries.read(nameOf('round'))) };
      },
      says: { written: { refused: 'Invalid' }, read: { kept: aDelivery() } },
    },
    {
      name: "REFUSED: a name that is no subscription's is Invalid, nothing written",
      walk: ({ door }) => ({ written: act(door.deliveries.write(nameOf('../x'), aDelivery())), delivered: delivered(door) }),
      says: { written: { refused: 'Invalid' }, delivered: [] },
    },
  ],
  'deliveries.drop': [
    {
      name: 'gone, and a delivery not there is no refusal',
      walk: ({ door }) => {
        done(door.deliveries.write(nameOf('round'), aDelivery()));
        done(door.deliveries.drop(nameOf('round')));
        done(door.deliveries.drop(nameOf('never')));
        return { delivered: delivered(door), read: done(door.deliveries.read(nameOf('round'))) };
      },
      says: { delivered: [], read: null },
    },
  ],
};
