/**
 * The api's own words for each command it serves, keyed by the command's name: the body its route takes,
 * why a body is not one (400), and what a failure that is not a refusal answers (502).
 */
import type { Words } from '../body.ts';
import { AGENTS_COPY, AGENTS_CUSTOM, POLICY_CONFIRM, POLICY_DROP } from './library.ts';
import { LEVEL, SUBSCRIBE, UNSUBSCRIBE } from './sessions.ts';

/**
 * What a route's path names: the run and the step — `step` empty on a route that names none, `runId` on a route of the store's own, where
 * `step` is a factory's hire's — the `name` of what else it names, a card or an agent, the `factory` a hire or an instruction names, the
 * `namespace` a run's named action is addressed in (empty on a route that names none), and the request's `method` and `path`, as a
 * refusal says the route — a server a factory's route names is read off the path.
 */
export type Named = {
  readonly runId: string;
  readonly step: string;
  readonly name: string;
  readonly factory: string;
  readonly namespace: string;
  readonly method: string;
  readonly path: string;
};

/**
 * A routed command's words: `shape`, its body as a refusal shows it; `issue` and `failed`, each said of what it names; `strict`,
 * where its body is refused a key its schema does not have, named before any it does; `named`, the refusal of a name in its path, 400,
 * before its body is read; `bodyless`, where its route reads no body but none or `{}`, the refusal of the text it was sent, 400; `notJson`,
 * the refusal of a body that is not JSON, 400, where it has words of its own. A route with no `failed` lets a failure that is no refusal
 * through, to `app.onError`, as a 500.
 */
export type RouteWords = {
  readonly shape: string;
  readonly issue: (at: Named) => Words;
  readonly failed?: (at: Named, said: string) => string;
  readonly strict?: true;
  readonly named?: (at: Named) => string | null;
  readonly bodyless?: (at: Named, text: string) => string | null;
  readonly notJson?: (at: Named) => string;
};

/** The body `POST /api/pause` takes: `nemia pause`'s flags, as JSON, `now` its `--now`, which the route acts on as `--yes` does. */
const PAUSE_SHAPE = '`{ "why"?: "<words>", "by"?: "<name>", "timeout"?: "<d>", "now"?: true }`';

/** What `issue` says of a key of `POST /api/pause`'s body sent wrong, `input` what the request sent. */
const pauseKeyWords = (key: unknown, input: unknown): string => {
  const was = `This request's was ${JSON.stringify(input)}: ${PAUSE_SHAPE}.`;
  if (key === 'now') return `\`now\` cuts what still finishes, as \`nemia pause --now --yes\` does: true, or left out. ${was}`;
  if (key === 'why' || key === 'by' || key === 'timeout')
    return `\`${key}\` is ${key === 'why' ? 'why the store is paused' : key === 'by' ? 'who pauses it' : 'how long a call in flight is given'}, as \`nemia pause --${key} ${key === 'timeout' ? '10m' : '"<words>"'}\` takes it: text, or left out. ${was}`;
  return `POST /api/pause takes a JSON object: ${PAUSE_SHAPE}.`;
};

/** The store paused: its body and its failures; a pause that stands is the package's 409. */
const PAUSE: RouteWords = {
  shape: PAUSE_SHAPE,
  issue:
    () =>
    ({ path: [key], input }) =>
      pauseKeyWords(key, input),
  failed: (_at, said) => `POST /api/pause: the store was not paused — ${said}. Pause it with \`nemia pause\`.`,
};

/** The store resumed; it takes no body, and none standing is the package's 404. */
const RESUME: RouteWords = {
  shape: '`{}`',
  issue: () => () => 'DELETE /api/pause takes no body: `{}`.',
  failed: (_at, said) => `DELETE /api/pause: the store was not resumed — ${said}. Resume it with \`nemia resume\`.`,
};

export const WORDS: Readonly<Record<string, RouteWords>> = {
  pause: PAUSE,
  resume: RESUME,
  subscribe: SUBSCRIBE,
  unsubscribe: UNSUBSCRIBE,
  level: LEVEL,
  'policy confirm': POLICY_CONFIRM,
  'policy rm': POLICY_DROP,
  'agents custom': AGENTS_CUSTOM,
  'agents copy': AGENTS_COPY,
};
