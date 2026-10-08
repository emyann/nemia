/**
 * The words of the routes that write a factory's schedules: a workflow scheduled (`nemia factory schedule`), its cron and brief in the
 * body, and its schedule taken back (`nemia factory unschedule`), no body; a name that is no factory's is refused before either.
 */
import { factoryNameRefusal } from 'agent-orchestrator';
import { valueAt } from '../body.ts';
import type { Named, RouteWords } from '../commands/words.ts';

const SCHEDULE_PUT_SHAPE = '`{ "cron": "<expr>", "brief": "<text>", "repo"?: "<path>", "tz"?: "<zone>" }`';

/** What each key of a schedule's body is, as a refusal says it. */
const KEYS: Readonly<Record<string, string>> = {
  cron: 'the cron its runs start at, five or six fields',
  brief: 'what each run is asked',
  repo: "the factory's repository its runs work on",
  tz: 'the IANA time zone its cron is read in, such as America/Montreal',
};

/** The route `at` names, as a refusal says it: `PUT /api/factories/<factory>/schedules/<workflow>`. */
const scheduleRoute = ({ method, path }: Named): string => `${method} ${path}`;

/** A name in a schedule's route that is no factory's, in the package's words, before anything is read. */
const scheduleFactoryNamed = (at: Named): string | null => {
  const wrong = factoryNameRefusal(at.factory);
  return wrong === undefined ? null : `${scheduleRoute(at)}: ${wrong}`;
};

/**
 * A workflow of a factory scheduled, as the guard's refusals word it: a name that is no factory's is refused in the package's words, a
 * key that is no string in the api's, by the first key its schema refused.
 */
export const FACTORY_SCHEDULE: RouteWords = {
  shape: SCHEDULE_PUT_SHAPE,
  guard: (at) => ({
    route: scheduleRoute(at),
    does: "schedules a factory's workflow",
    forAnother: 'schedule one',
    why: 'the daemon starts a run of the workflow in the factory at each fire of its cron, at every level',
    reach: 'schedule it with `nemia factory schedule <factory> <workflow> --cron <expr> --brief <text>`',
    instead: 'Schedule it with `nemia factory schedule <factory> <workflow> --cron <expr> --brief <text>`',
    shape: SCHEDULE_PUT_SHAPE,
  }),
  issue:
    (at) =>
    ({ path: [key] }, body) =>
      `${scheduleRoute(at)}: \`${String(key)}\` is ${KEYS[String(key)] ?? 'a key it does not take'}, a string: ${SCHEDULE_PUT_SHAPE}. This request's was ${JSON.stringify(valueAt(body, [String(key)])) ?? 'left out'}.`,
  named: scheduleFactoryNamed,
  notJson: (at) => `${scheduleRoute(at)} takes a JSON body: ${SCHEDULE_PUT_SHAPE}.`,
};

/** A workflow's schedule taken back, as the guard's refusals word it: a name that is no factory's is refused in the package's words. */
export const FACTORY_UNSCHEDULE: RouteWords = {
  shape: '`{}`',
  guard: (at) => ({
    route: scheduleRoute(at),
    does: "takes a workflow's schedule back",
    forAnother: 'take it back',
    why: 'the daemon starts no more runs of the workflow in the factory',
    reach: 'take it back with `nemia factory unschedule <factory> <workflow>`',
    instead: 'Take it back with `nemia factory unschedule <factory> <workflow>`',
    shape: '`{}`',
  }),
  issue: (at) => () => `${scheduleRoute(at)} takes no body.`,
  named: scheduleFactoryNamed,
};
