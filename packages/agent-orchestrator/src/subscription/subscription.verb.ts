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
import { NEMIA_SUBSCRIPTION } from '../nemia/nemia.ts';
import { LEVELS, type Level } from '../level/level.ts';
import { SELECTOR_FORM } from '../watch/selector.ts';
import { retiredWakeRefusal } from './former-wake.ts';
import {
  DEFAULT_DIGEST_EVERY,
  DEFAULT_SELECTORS,
  SUBSCRIBE_FORM,
  subscribeRefusalOf,
  subscriptionNameRefusal,
  type Subscription,
} from './subscription.ts';

/** The refusal of a `-l` given no selector, or one of the command's own flags for it. */
const SUBSCRIBE_SELECTOR_TAKES = `nemia subscribe -l takes a selector of the feed's lines: ${SELECTOR_FORM}`;

/** What `nemia subscribe` answers: the subscription put, under its name. */
export type Subscribed = { name: string; subscription: Subscription };

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
const askedOf = (args: Args): { name: string; task: string; selectors: string[]; digestEvery: number; atLeast?: string } => ({
  name: String(args.name ?? ''),
  task: String(args.task ?? ''),
  selectors: Array.isArray(args.selectors) && args.selectors.length ? [...(args.selectors as readonly string[])] : [...DEFAULT_SELECTORS],
  digestEvery: typeof args.digestEvery === 'number' ? args.digestEvery : DEFAULT_DIGEST_EVERY,
  ...(typeof args.atLeast === 'string' ? { atLeast: args.atLeast } : {}),
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
  const { name, task, selectors, digestEvery, atLeast } = askedOf(args);
  const reserved = reservedRefusal(name);
  if (reserved) return yield* Effect.fail(reserved);
  const e = yield* EngineService;
  const refused = taskRefusal(task, (yield* asked('view', e.view(task))).state);
  if (refused) return yield* Effect.fail(refused);
  const subscription: Subscription = {
    task,
    selectors,
    digestEvery,
    from: feedSize(),
    ...(atLeast === undefined ? {} : { scope: { atLeast: atLeast as Level } }),
  };
  yield* tried(() => putSubscription(name, subscription));
  return { name, subscription } satisfies Subscribed;
});

/** `nemia subscribe`: a long-lived task given a subscription to the feed (`subscribe`). */
export const SUBSCRIBE: Command<Subscribed> = {
  name: 'subscribe',
  usage: '<name> <task> [-l <selector>]... [--digest-every <minutes>] [--at-least <level>]',
  help: [
    "give the engine's long-lived task <task> a subscription to the feed,",
    'named <name>, from its end: a line one of its selectors takes is said to',
    'it at once, and the rest folded into a digest said with the next wake,',
    'or after --digest-every minutes (default 60) with none.',
    '-l: the lines a selector takes, given again for another (default:',
    'waits=person, the lines that wait on a person). Refused for a task not',
    'long-lived.',
    "--at-least: only the lines of runs whose factory's level is at least",
    `this (${LEVELS.join(', ')}), read as each line is delivered.`,
  ],
  spec: {
    positionals: [
      { key: 'name', takes: 'required', kind: 'name' },
      { key: 'task', takes: 'required', kind: 'name' },
    ],
    flags: [
      { flag: '-l', kind: 'text', key: 'selectors', many: true, takes: SUBSCRIBE_SELECTOR_TAKES },
      { flag: '--digest-every', kind: 'amount', key: 'digestEvery', takes: 'the minutes a digest waits for a wake', form: SUBSCRIBE_FORM },
      {
        flag: '--at-least',
        kind: 'name',
        key: 'atLeast',
        takes: `--at-least takes a level, one of ${LEVELS.join(', ')}: ${SUBSCRIBE_FORM}.`,
      },
    ],
    unknown: (arg) => retiredWakeRefusal('nemia subscribe', arg) ?? `nemia subscribe does not take ${arg}: ${SUBSCRIBE_FORM}.`,
    missing: `nemia subscribe takes the subscription's name and the task it tells: ${SUBSCRIBE_FORM}.`,
  },
  check: (args) => subscribeRefusalOf(askedOf(args)) ?? null,
  writes: true,
  class: 'act',
  route: { method: 'POST', path: '/api/subscriptions/:name', status: 201 },
  handler: subscribe,
  print: ({ name, subscription: s }) => [
    `subscribed ${name}: ${s.task} is told at once of a line taken by ${s.selectors.join(' or ')}, and of the rest in a digest every ` +
      `${s.digestEvery} minute${s.digestEvery === 1 ? '' : 's'} with no wake.`,
  ],
};

/**
 * `nemia unsubscribe`: a subscription taken away, its file removed alone (`dropSubscription`); the deliverer's next read of the
 * subscriptions stops it and removes its `<name>.state.json` (`reconcile` in `deliver.verb.ts`).
 */
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
  class: 'act',
  route: { method: 'DELETE', path: '/api/subscriptions/:name', status: 200 },
  handler: (args) =>
    tried(() => {
      const reserved = reservedRefusal(String(args.name));
      if (reserved) throw reserved;
      dropSubscription(String(args.name));
      return { name: String(args.name) };
    }),
  print: ({ name }) => [`unsubscribed ${name}: its task is told nothing more of the feed.`],
};
