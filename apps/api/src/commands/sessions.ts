/**
 * The words of the routes that give a long-lived session the feed: a subscription given or taken away, and Nemia's level, which her
 * keeper acts on.
 */
import { subscriptionNameRefusal } from 'agent-orchestrator';
import type { RouteWords } from './words.ts';

/** The body `POST /api/subscriptions/:name` takes: `nemia subscribe`'s task and flags, as JSON. */
const SUBSCRIBE_SHAPE = '`{ "task": "<task>", "selectors"?: ["<selector>"], "digestEvery"?: <minutes>, "atLeast"?: "<level>" }`';

/** What `issue` says of a key of `POST /api/subscriptions/:name`'s body sent wrong, `input` what the request sent. */
const subscribeKeyWords = (key: unknown, input: unknown): string => {
  const was = `This request's was ${JSON.stringify(input) ?? 'left out'}: ${SUBSCRIBE_SHAPE}.`;
  if (key === 'task')
    return `\`task\` names the engine's long-lived task the feed is said to, as \`nemia subscribe <name> <task>\` takes it. ${was}`;
  if (key === 'selectors')
    return `\`selectors\` is what wakes the task, as \`nemia subscribe -l <selector>\` takes each: a list of text, one selector of the feed's lines each, or left out for waits=person, the lines that wait on a person. ${was}`;
  if (key === 'digestEvery')
    return `\`digestEvery\` is the minutes a digest waits for a wake, as \`nemia subscribe --digest-every <minutes>\` takes it: a JSON number, or left out for 60. ${was}`;
  if (key === 'atLeast')
    return (
      "`atLeast` is the level a run's factory is at least at for its lines to be carried, as " +
      `\`nemia subscribe --at-least <level>\` takes it: a level by name, or left out for every line, whatever its factory is at. ${was}`
    );
  return `POST /api/subscriptions/:name takes a JSON object: ${SUBSCRIBE_SHAPE}.`;
};

/** A subscription given: and its body; a name that names no file of its own is refused before it. */
export const SUBSCRIBE: RouteWords = {
  shape: SUBSCRIBE_SHAPE,
  issue:
    () =>
    ({ path: [key], input }) =>
      subscribeKeyWords(key, input),
  named: ({ name }) => subscriptionNameRefusal(name) ?? null,
};

/** A subscription taken away; it takes no body. */
export const UNSUBSCRIBE: RouteWords = {
  shape: '`{}`',
  issue: () => () => 'DELETE /api/subscriptions/:name takes no body: `{}`.',
  named: ({ name }) => subscriptionNameRefusal(name) ?? null,
};

/** The body `PUT /api/level` takes: `nemia level`'s level, as JSON. */
const LEVEL_SHAPE = '`{ "level": "manual" | "semi-auto" | "auto" }`';

/** Nemia's level set: and its body; a level that is none is the package's 422. */
export const LEVEL: RouteWords = {
  shape: LEVEL_SHAPE,
  issue:
    () =>
    ({ input }) =>
      `\`level\` is the level Nemia is set to, as \`nemia level <level>\` takes it: manual, semi-auto or auto. This request's was ${JSON.stringify(input) ?? 'left out'}: ${LEVEL_SHAPE}.`,
};
