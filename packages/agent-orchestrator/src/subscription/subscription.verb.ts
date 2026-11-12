/**
 * `nemia subscribe` and `nemia unsubscribe`: a long-lived task given a subscription to the feed, and one taken away, on
 * `POST /api/subscriptions/:name` and `DELETE /api/subscriptions/:name` too. What a subscription is told, and when, is the daemon's
 * deliverer (`deliver.verb.ts`); its file is put and dropped through the Subscription door (`SubscriptionDoor`), at the store's root the
 * handler is given (`StoreRoot`).
 *
 * A controller: it reads the task off the engine (`EngineService`, `asked`) before it puts the subscription, and the feed's size, where
 * the subscription's news starts.
 */
import { Effect, Schema } from 'effect';
import { SUBSCRIBE_WORDS, SubscriptionWrite, UNSUBSCRIBE_WORDS } from 'objects';
import type { Served } from '../command/entry.verb.ts';
import { FeedDoor } from '../feed/feed.store.ts';
import { Conflict, Invalid, Missing } from '../refusal/refusal.ts';
import { EngineService, asked, type TaskView } from '../runtime-client.ts';
import { SubscriptionDoor } from './subscription.store.ts';
import { SubscriptionName } from '../feed/feed.model.ts';
import { NEMIA_SUBSCRIPTION } from '../nemia/nemia.ts';
import type { Level } from '../level/level.ts';
import { formerHints } from '../former-reason/former-reason.ts';
import {
  DEFAULT_DIGEST_EVERY,
  DEFAULT_SELECTORS,
  SUBSCRIBE_FORM,
  subscribeRefusalOf,
  subscriptionNameRefusal,
  type Subscription,
} from './subscription.ts';

/**
 * What `nemia subscribe` answers: the subscription put, under its name, and a sentence for each former word one of its selectors still
 * says (`formerHints`), none where none does.
 */
export type Subscribed = { name: string; subscription: Subscription; hints?: string[] };

/**
 * What `nemia subscribe`'s handler takes: the subscription's name, and the body `POST /api/subscriptions/:name` takes (objects'
 * `SubscriptionWrite`): the task, the selectors (`-l`), the minutes (`--digest-every`) and the floor (`--at-least`).
 */
export const SubscribeInput = Schema.Struct({ name: Schema.String, ...SubscriptionWrite.fields });
export type SubscribeInput = typeof SubscribeInput.Type;

/** What `nemia unsubscribe`'s handler takes: the subscription's name. */
export const UnsubscribeInput = Schema.Struct({ name: Schema.String });
export type UnsubscribeInput = typeof UnsubscribeInput.Type;

/** How a long-lived task is filed for a subscription, as the refusal of any other says it; Nemia's own is filed by her keeper. */
const FILE_IT = 'file it long-lived: AE_ROOT=$WF_ROOT/engine ae file, with restartPolicy: Always';

/**
 * The refusal (`Conflict`) of a subscription named `name` given or taken away by hand where the name is Nemia's, which her keeper alone
 * puts and drops, or undefined.
 */
const reservedRefusal = (name: string): Conflict | undefined =>
  name === NEMIA_SUBSCRIPTION
    ? new Conflict({
        message: `the subscription ${name} is Nemia's own, put and taken away by her keeper: nemia level semi-auto gives it, nemia level manual takes it away.`,
      })
    : undefined;

/**
 * The words a subscription is asked for in: its name, its task, the selectors given (else the default), its minutes, and the level its
 * runs' factories are at least at (`atLeast`), where given.
 *
 * A list given empty comes to the default too, and never to an empty filter, which `selects` takes every line of the feed for: the api's
 * body schema takes `"selectors": []` as a list of text, and `-l` given no selector is refused before this.
 */
const askedOf = (
  input: Partial<SubscribeInput>,
): { name: string; task: string; selectors: string[]; digestEvery: number; atLeast?: string } => ({
  name: input.name ?? '',
  task: input.task ?? '',
  selectors: input.selectors?.length ? [...input.selectors] : [...DEFAULT_SELECTORS],
  digestEvery: input.digestEvery ?? DEFAULT_DIGEST_EVERY,
  ...(input.atLeast === undefined ? {} : { atLeast: input.atLeast }),
});

/**
 * The refusal of a task no subscription can tell: one never filed (`Missing`), one not long-lived (`Invalid`), whose session ends with its
 * turn, or one settled (`Conflict`), which is told nothing more — or undefined.
 */
function taskRefusal(task: string, state: TaskView['state']): Missing | Invalid | Conflict | undefined {
  if (!state.filedAt)
    return new Missing({ message: `no task ${task} is filed on the store's engine: ${FILE_IT}, then ${SUBSCRIBE_FORM}.` });
  if (state.restartPolicy !== 'Always')
    return new Invalid({
      message: `the task ${task} is not long-lived, so its session ends with its turn and is told nothing: ${FILE_IT}.`,
    });
  if (state.settled)
    return new Conflict({ message: `the task ${task} has settled (${state.settled}) and is told nothing more: ${FILE_IT}.` });
  return undefined;
}

/**
 * Puts the subscription asked for, its news starting at the feed's end, once the engine says its task is long-lived and open. Refused
 * first, as `Invalid`, what `subscribeRefusalOf` refuses of what was asked, whoever asks.
 */
const subscribe = Effect.fn('subscribe')(function* (input: SubscribeInput) {
  const wanted = askedOf(input);
  const wrong = subscribeRefusalOf(wanted);
  if (wrong !== undefined) return yield* Effect.fail(new Invalid({ message: wrong }));
  const { name, task, selectors, digestEvery, atLeast } = wanted;
  const reserved = reservedRefusal(name);
  if (reserved) return yield* Effect.fail(reserved);
  const e = yield* EngineService;
  const refused = taskRefusal(task, (yield* asked('view', e.view(task))).state);
  if (refused) return yield* Effect.fail(refused);
  const subscription: Subscription = {
    task,
    selectors,
    digestEvery,
    from: (yield* (yield* FeedDoor).lines.end())?.cursor ?? 0,
    ...(atLeast === undefined ? {} : { scope: { atLeast: atLeast as Level } }),
  };
  yield* (yield* SubscriptionDoor).subscriptions.put(SubscriptionName.read(name), subscription);
  const hints = selectors.flatMap(formerHints);
  return { name, subscription, ...(hints.length ? { hints } : {}) } satisfies Subscribed;
});

/** `nemia subscribe`: a long-lived task given a subscription to the feed (`subscribe`). */
export const SUBSCRIBE: Served<Subscribed, SubscribeInput> = {
  ...SUBSCRIBE_WORDS,
  input: SubscribeInput,
  handler: (input) => subscribe(input),
};

/**
 * `nemia unsubscribe`: a subscription taken away, its file removed alone (`subscriptions.drop`); the deliverer's next read of the
 * subscriptions stops it and removes its `<name>.state.json` (`reconcile` in `deliver.verb.ts`). Refused (`Invalid`): a name that is no
 * subscription's, whoever asks.
 */
export const UNSUBSCRIBE: Served<{ name: string }, UnsubscribeInput> = {
  ...UNSUBSCRIBE_WORDS,
  input: UnsubscribeInput,
  handler: ({ name }) =>
    Effect.gen(function* () {
      const unnamed = subscriptionNameRefusal(name);
      if (unnamed !== undefined) return yield* Effect.fail(new Invalid({ message: unnamed }));
      const reserved = reservedRefusal(name);
      if (reserved) return yield* Effect.fail(reserved);
      yield* (yield* SubscriptionDoor).subscriptions.drop(SubscriptionName.read(name));
      return { name };
    }),
};
