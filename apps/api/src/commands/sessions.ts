/**
 * The words of the routes that give a long-lived session the feed: a subscription given or taken away, and Nemia's level, which her
 * keeper acts on.
 */
import { subscriptionNameRefusal } from 'agent-orchestrator';
import type { Guarded } from '../guard.ts';
import type { RouteWords } from './words.ts';

/** The body `POST /api/subscriptions/:name` takes: `nemia subscribe`'s task and flags, as JSON. */
const SUBSCRIBE_SHAPE = '`{ "task": "<task>", "wake"?: ["<word>"], "digestEvery"?: <minutes>, "atLeast"?: "<level>" }`';

/** What `issue` says of a key of `POST /api/subscriptions/:name`'s body sent wrong, `input` what the request sent. */
const subscribeKeyWords = (key: unknown, input: unknown): string => {
  const was = `This request's was ${JSON.stringify(input) ?? 'left out'}: ${SUBSCRIBE_SHAPE}.`;
  if (key === 'task')
    return `\`task\` names the engine's long-lived task the feed is said to, as \`nemia subscribe <name> <task>\` takes it. ${was}`;
  if (key === 'wake')
    return `\`wake\` is the words that wake the task, as \`nemia subscribe --wake <word>\` takes each: a list of text, or left out for the feed's words for a wait on a person. ${was}`;
  if (key === 'digestEvery')
    return `\`digestEvery\` is the minutes a digest waits for a wake, as \`nemia subscribe --digest-every <minutes>\` takes it: a JSON number, or left out for 60. ${was}`;
  if (key === 'atLeast')
    return (
      "`atLeast` is the level a run's factory is at least at for its lines to be carried, as " +
      `\`nemia subscribe --at-least <level>\` takes it: a level by name, or left out for every line, whatever its factory is at. ${was}`
    );
  return `POST /api/subscriptions/:name takes a JSON object: ${SUBSCRIBE_SHAPE}.`;
};

/** A subscription to the feed, the guard's words of the route at `name`. */
const subscriptionGuard = (name: string, off: boolean): Guarded => ({
  route: `${off ? 'DELETE' : 'POST'} /api/subscriptions/${name}`,
  does: off ? 'takes a subscription away' : 'gives a task a subscription to the feed',
  forAnother: off ? 'take one away' : 'give one',
  why: off
    ? 'a subscription taken away leaves its task told nothing more of the feed, and where its deliverer was is lost'
    : "a subscription says the feed's lines to a long-lived task's session, which acts on what it is told",
  reach: off ? 'take it away with `nemia unsubscribe`' : 'give it with `nemia subscribe`',
  instead: off ? `Take it away with \`nemia unsubscribe ${name}\`` : `Give it with \`nemia subscribe ${name} <task>\``,
  shape: off ? '`{}`' : SUBSCRIBE_SHAPE,
});

/** A subscription given, as the guard's refusals word it, and its body; a name that names no file of its own is refused before it. */
export const SUBSCRIBE: RouteWords = {
  shape: SUBSCRIBE_SHAPE,
  guard: ({ name }) => subscriptionGuard(name, false),
  issue:
    () =>
    ({ path: [key], input }) =>
      subscribeKeyWords(key, input),
  named: ({ name }) => subscriptionNameRefusal(name) ?? null,
};

/** A subscription taken away, as the guard's refusals word it; it takes no body. */
export const UNSUBSCRIBE: RouteWords = {
  shape: '`{}`',
  guard: ({ name }) => subscriptionGuard(name, true),
  issue: () => () => 'DELETE /api/subscriptions/:name takes no body: `{}`.',
  named: ({ name }) => subscriptionNameRefusal(name) ?? null,
};

/** The body `PUT /api/level` takes: `nemia level`'s level, as JSON. */
const LEVEL_SHAPE = '`{ "level": "manual" | "semi-auto" | "auto" }`';

/** Nemia's level set, as the guard's refusals word it, and its body; a level that is none is the package's 422. */
export const LEVEL: RouteWords = {
  shape: LEVEL_SHAPE,
  guard: () => ({
    route: 'PUT /api/level',
    does: "sets Nemia's level",
    forAnother: 'set it',
    why: "at semi-auto Nemia's session is kept, reading every factory's folders and told the feed's waits on a person; at auto she also gives the answers the person's confirmed list allows; at manual it is stopped",
    reach: 'set it with `nemia level`',
    instead: 'Set it with `nemia level auto`, `nemia level semi-auto` or `nemia level manual`',
    shape: LEVEL_SHAPE,
  }),
  issue:
    () =>
    ({ input }) =>
      `\`level\` is the level Nemia is set to, as \`nemia level <level>\` takes it: manual, semi-auto or auto. This request's was ${JSON.stringify(input) ?? 'left out'}: ${LEVEL_SHAPE}.`,
};
