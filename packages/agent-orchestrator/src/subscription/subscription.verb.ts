/**
 * `nemia subscribe` and `nemia unsubscribe`: a long-lived task given a subscription to the feed, and one taken away, on
 * `POST /api/subscriptions/:name` and `DELETE /api/subscriptions/:name` too. What a subscription is told, and when, is the daemon's
 * deliverer (`deliver.verb.ts`); its file is `subscription.store.ts`'s.
 *
 * A controller: it reads the task off the engine (`EngineService`, `asked`) before it puts the subscription, and the feed's size, where
 * the subscription's news starts.
 */
import { Effect } from 'effect';
import type { Args } from '../command/command.ts';
import type { Command } from '../command/entry.verb.ts';
import { feedSize } from '../feed/feed.store.ts';
import { Conflict, Invalid, Missing } from '../refusal/refusal.ts';
import { EngineService, asked, tried, type TaskView } from '../runtime-client.ts';
import { dropSubscription, putSubscription } from './subscription.store.ts';
import {
  DEFAULT_DIGEST_EVERY,
  DEFAULT_WAKE,
  SUBSCRIBE_FORM,
  subscribeRefusalOf,
  subscriptionNameRefusal,
  type Subscription,
} from './subscription.ts';

/** What `nemia subscribe` answers: the subscription put, under its name. */
export type Subscribed = { name: string; subscription: Subscription };

/** How a long-lived task is filed for a subscription, as the refusal of any other says it, until Nemia files its own. */
const FILE_IT = 'file it long-lived: AE_ROOT=$WF_ROOT/engine ae file, with restartPolicy: Always and background: true';

/** The words a subscription is asked for in: its name, its task, the wake words given (else the default), and its minutes. */
const askedOf = (args: Args): { name: string; task: string; wake: string[]; digestEvery: number } => ({
  name: String(args.name ?? ''),
  task: String(args.task ?? ''),
  wake: Array.isArray(args.wake) && args.wake.length ? [...(args.wake as readonly string[])] : [...DEFAULT_WAKE],
  digestEvery: typeof args.digestEvery === 'number' ? args.digestEvery : DEFAULT_DIGEST_EVERY,
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

/** Puts the subscription asked for, its news starting at the feed's end, once the engine says its task is long-lived and open. */
const subscribe = Effect.fn('subscribe')(function* (args: Args) {
  const { name, task, wake, digestEvery } = askedOf(args);
  const e = yield* EngineService;
  const refused = taskRefusal(task, (yield* asked('view', e.view(task))).state);
  if (refused) return yield* Effect.fail(refused);
  const subscription: Subscription = { task, wake, digestEvery, from: feedSize() };
  yield* tried(() => putSubscription(name, subscription));
  return { name, subscription } satisfies Subscribed;
});

/** `nemia subscribe`: a long-lived task given a subscription to the feed (`subscribe`). */
export const SUBSCRIBE: Command<Subscribed> = {
  name: 'subscribe',
  usage: '<name> <task> [--wake <word>]... [--digest-every <minutes>]',
  help: [
    "give the engine's long-lived task <task> a subscription to the feed,",
    'named <name>, from its end: a line holding a wake word is said to it at',
    'once, and the rest folded into a digest said with the next wake, or',
    'after --digest-every minutes (default 60) with none.',
    "--wake: a word that wakes it, once for each (default: the feed's words",
    'for a wait on a person). Refused for a task not long-lived.',
  ],
  spec: {
    positionals: [
      { key: 'name', takes: 'required', kind: 'name' },
      { key: 'task', takes: 'required', kind: 'name' },
    ],
    flags: [
      { flag: '--wake', kind: 'text', key: 'wake', many: true, takes: `--wake takes a word that wakes the subscriber: ${SUBSCRIBE_FORM}.` },
      { flag: '--digest-every', kind: 'amount', key: 'digestEvery', takes: 'the minutes a digest waits for a wake', form: SUBSCRIBE_FORM },
    ],
    unknown: (arg) => `nemia subscribe does not take ${arg}: ${SUBSCRIBE_FORM}.`,
    missing: `nemia subscribe takes the subscription's name and the task it tells: ${SUBSCRIBE_FORM}.`,
  },
  check: (args) => subscribeRefusalOf(askedOf(args)) ?? null,
  writes: true,
  route: { method: 'POST', path: '/api/subscriptions/:name', status: 201 },
  handler: subscribe,
  print: ({ name, subscription: s }) => [
    `subscribed ${name}: ${s.task} is told at once of a line holding ${s.wake.join(', ')}, and of the rest in a digest every ` +
      `${s.digestEvery} minute${s.digestEvery === 1 ? '' : 's'} with no wake.`,
  ],
};

/** `nemia unsubscribe`: a subscription taken away, and where its deliverer was with it (`dropSubscription`). */
export const UNSUBSCRIBE: Command<{ name: string }> = {
  name: 'unsubscribe',
  usage: '<name>',
  help: ['take the subscription <name> away: its task is told nothing more of the feed'],
  spec: {
    positionals: [{ key: 'name', takes: 'required', kind: 'name' }],
    flags: [],
    unknown: (arg) => `nemia unsubscribe takes no ${arg}: nemia unsubscribe <name>.`,
  },
  check: (args) => subscriptionNameRefusal(String(args.name ?? '')) ?? null,
  writes: true,
  route: { method: 'DELETE', path: '/api/subscriptions/:name', status: 200 },
  handler: (args) =>
    tried(() => {
      dropSubscription(String(args.name));
      return { name: String(args.name) };
    }),
  print: ({ name }) => [`unsubscribed ${name}: its task is told nothing more of the feed.`],
};
