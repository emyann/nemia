/**
 * The api's own words for each command it serves, keyed by the command's name: the body its route takes,
 * why a body is not one (400), and what a failure that is not a refusal answers (502).
 */
import type { BodyIssue, Words } from '../body.ts';
import type { Guarded } from '../guard.ts';
import { AGENTS_COPY, AGENTS_CUSTOM, POLICY_CONFIRM, POLICY_DROP } from './library.ts';
import { LEVEL, SUBSCRIBE, UNSUBSCRIBE } from './sessions.ts';
import { LABEL_WORDS } from '../labels/index.ts';

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

/** The path of the run a named action is addressed to, in its namespace: `/api/namespaces/<namespace>/runs/<runId>`. */
export const runPath = ({ namespace, runId }: Pick<Named, 'namespace' | 'runId'>): string => `/api/namespaces/${namespace}/runs/${runId}`;

/**
 * A routed command's words: `shape`, its body as a refusal shows it; `issue` and `failed`, each said of what it names; `strict`,
 * where its body is refused a key its schema does not have, named before any it does; `named`, the refusal of a name in its path, 400,
 * before its body is read; `bodyless`, where its route reads no body but none or `{}`, the refusal of the text it was sent, 400; `notJson`,
 * the refusal of a body that is not JSON, 400, where it has words of its own. A route with no `failed` lets a failure that is no refusal
 * through, to `app.onError`, as a 500.
 */
export type RouteWords = {
  readonly shape: string;
  /** No longer read: the write guard is `writeGuard`'s (guard.ts). Left optional for the label edit's words (labels/words.ts). */
  readonly guard?: (at: Named) => Guarded;
  readonly issue: (at: Named) => Words;
  readonly failed?: (at: Named, said: string) => string;
  readonly strict?: true;
  readonly named?: (at: Named) => string | null;
  readonly bodyless?: (at: Named, text: string) => string | null;
  readonly notJson?: (at: Named) => string;
};

/** The body `POST …/retry` takes: `nemia retry`'s flags, as JSON. */
const RETRY_SHAPE =
  '`{ "mode": "continue" | "fresh" | "recheck", "round"?: true, "model"?: "<m>", "message"?: "<answer>", "budget"?: <amount>, "answers"?: [{ "question": "<title>", "chose": ["<label>"], "own"?: "<words>" }] }`';

/** The body `POST …/refresh` takes: `nemia refresh`'s arguments, as JSON — with `base`, the looping step whose work merges its base. */
const REFRESH_SHAPE = '`{ "base"?: true, "step"?: "<looping step>" }`';

/** The body `POST …/approve` takes: `nemia approve`'s `--message`, as JSON. */
const APPROVE_SHAPE =
  '`{ "message"?: "<words>", "answers"?: [{ "question": "<title>", "chose": ["<label>"], "own"?: "<words>" }], "budgets"?: [{ "step": "<step>", "usd": <amount> }] }`';

/** The body `POST …/say` takes: the words, as `nemia say` takes them. */
const SAY_SHAPE = '`{ "text": "<words>" }`';

/**
 * Why a `budget` in a body is not a number, in the api's words: the package's `--budget` is typed as digits, and has no words for JSON. A
 * number not above zero is the package's to refuse.
 */
const budgetWords = (budget: unknown, as: string, shape: string): string =>
  `\`budget\` is the cap to raise to, as \`${as} --budget <amount>\` takes it: dollars, as a JSON number above zero, like 5 or 2.50. This request's was ${JSON.stringify(budget)}: ${shape}.`;

/** Why `POST …/retry`'s body is not an ask (400), by the first key its schema refused. */
const retryWords = ({ path: [key], input }: BodyIssue): string => {
  if (key === 'mode')
    return `\`mode\` is how to try the step again, as \`nemia retry\` takes it: "continue" continues its session, told what happened; "fresh" starts a new session on its branch; "recheck" runs its check again and files no session. This request's was ${JSON.stringify(input) ?? 'left out'}: ${RETRY_SHAPE}.`;
  if (key === 'model')
    return `\`model\` names the model a new session runs on, as \`nemia retry --model <m>\` does: a name, or left out for the step's own. This request's was ${JSON.stringify(input)}.`;
  if (key === 'message')
    return `\`message\` is what to tell the step, as \`nemia retry --message "<answer>"\` takes it: text, or left out. This request's was ${JSON.stringify(input)}.`;
  if (key === 'round')
    return `\`round\` asks for another round of the loop the step closes, as \`nemia retry --round\` does: true, or left out for a try of the step. This request's was ${JSON.stringify(input)}: ${RETRY_SHAPE}.`;
  if (key === 'budget') return budgetWords(input, 'nemia retry', RETRY_SHAPE);
  if (key === 'answers')
    return `\`answers\` are a person's answers to the questions the step asks: a list of { "question": its title, "chose": the labels chosen, "own"?: words of their own }, or left out. This request's was ${JSON.stringify(input)}: ${RETRY_SHAPE}.`;
  return `POST …/retry takes a JSON object: ${RETRY_SHAPE}.`;
};

/** Another try of a step: its body and its failures. */
const RETRY: RouteWords = {
  shape: RETRY_SHAPE,
  issue: () => retryWords,
  failed: ({ runId, step }, said) =>
    `Could not ask for another try of step '${step}': ${said}. \`nemia retry ${runId} ${step}\` asks the same way from the command line.`,
};

/** An approval of a step waiting at its gate: its body and its failures. */
const APPROVE: RouteWords = {
  shape: APPROVE_SHAPE,
  issue:
    ({ runId, step }) =>
    ({ path: [key], input }) => {
      if (key === 'message')
        return `\`message\` is the words to approve with, which every step after the gate is handed, as \`nemia approve ${runId} ${step} --message "<words>"\` takes them: text, or left out. This request's was ${JSON.stringify(input)}: ${APPROVE_SHAPE}.`;
      if (key === 'answers')
        return `\`answers\` are a person's answers to the questions the step asks at its gate: a list of { "question": its title, "chose": the labels chosen, "own"?: words of their own }, or left out. This request's was ${JSON.stringify(input)}: ${APPROVE_SHAPE}.`;
      return `POST …/approve takes a JSON object: ${APPROVE_SHAPE}.`;
    },
  failed: ({ runId, step }, said) =>
    `Could not approve step '${step}': ${said}. \`nemia approve ${runId} ${step}\` approves the same way from the command line.`,
};

/** A run told to take the new revisions of the kinds it resolved: its body and its failures. */
const REFRESH: RouteWords = {
  shape: REFRESH_SHAPE,
  issue:
    ({ runId, namespace }) =>
    ({ path: [key], input }) =>
      key === 'step'
        ? `\`step\` names the looping step whose work merges its base, as \`nemia refresh ${runId} <step> --base\` does: a name, or left out for a run with one loop. This request's was ${JSON.stringify(input)}: ${REFRESH_SHAPE}.`
        : key === 'base'
          ? `\`base\` sends a loop's work back to merge its base branch, as \`nemia refresh ${runId} --base\` does: true, or left out to take the new revisions. This request's was ${JSON.stringify(input)}: ${REFRESH_SHAPE}.`
          : `POST ${runPath({ namespace, runId })}/refresh takes a JSON object: ${REFRESH_SHAPE}.`,
  failed: ({ runId }, said) =>
    `Could not refresh ${runId}: ${said}. \`nemia refresh ${runId}\` takes the new revisions the same way from the command line.`,
};

/** Words for a step's running session: and its body; words the harness did not take are its own. */
const SAY: RouteWords = {
  shape: SAY_SHAPE,
  issue:
    ({ runId, step }) =>
    ({ path: [key], input }) =>
      key === 'text'
        ? `\`text\` is the words to hand the step's session, as \`nemia say ${runId} ${step} "<words>"\` takes them: text. This request's was ${JSON.stringify(input) ?? 'left out'}: ${SAY_SHAPE}.`
        : `POST …/say takes a JSON object: ${SAY_SHAPE}.`,
  failed: (_at, said) => said,
};

/** The body `POST …/hold` takes: `nemia hold`'s `--until`, given once for each run, `--why` and `--by`, as JSON. */
const HOLD_PUT_SHAPE = '`{ "until": ["<runId>", ...], "why"?: "<words>", "by"?: "<name>" }`';

/** The flag of `nemia hold` each key of `POST …/hold`'s body is. */
const HOLD_FLAGS = { until: '--until', why: '--why', by: '--by' } as const;

/**
 * Why `POST /api/namespaces/<namespace>/runs/<runId>/hold`'s body is not one (400), by the first thing its schema refused: every key it
 * does not take, named at once, and `off` pointed at the lift; a key it takes, sent as what it is not.
 */
const holdWords =
  (at: Pick<Named, 'namespace' | 'runId'>) =>
  ({ path: [key], kind, input }: BodyIssue, body: unknown): string => {
    const runId = at.runId;
    const route = `POST ${runPath(at)}/hold`;
    if (kind === 'excess' && typeof body === 'object' && body !== null) {
      const unknown = Object.keys(body).filter((k) => !Object.hasOwn(HOLD_FLAGS, k));
      const off = unknown.includes('off')
        ? ` A hold is lifted with \`DELETE ${runPath(at)}/hold\`, as \`nemia hold ${runId} --off\` lifts it.`
        : '';
      return `${route} does not take ${unknown.map((k) => `\`${k}\``).join(', ')}: it takes ${HOLD_PUT_SHAPE}, as \`nemia hold\` takes --until, --why and --by.${off}`;
    }
    if (key === 'until')
      return `${route} takes \`until\` as a list of run ids, each \`nemia hold\`'s --until, and this request sent ${JSON.stringify(input)}: ${HOLD_PUT_SHAPE}.`;
    if (key === 'why' || key === 'by')
      return `${route} takes \`${key}\` as text — \`nemia hold\`'s ${HOLD_FLAGS[key]} — or left out, and this request sent ${JSON.stringify(input)}: ${HOLD_PUT_SHAPE}.`;
    return `${route} takes a JSON object: ${HOLD_PUT_SHAPE}.`;
  };

/**
 * A person's hold put (`POST`) or lifted (`DELETE`): its body — the put's strict, every key it does not
 * take named; the lift's none — and a failure that is no refusal, naming the `nemia hold` that does the same.
 */
const HOLD: RouteWords = {
  shape: HOLD_PUT_SHAPE,
  issue: ({ runId, method, namespace }) =>
    method === 'DELETE' ? () => 'DELETE …/hold takes no body: `{}`.' : holdWords({ namespace, runId }),
  failed: ({ runId, method, namespace }, said) =>
    method === 'DELETE'
      ? `DELETE ${runPath({ namespace, runId })}/hold: the hold was not lifted — ${said}. Lift it with \`nemia hold ${runId} --off\`.`
      : `POST ${runPath({ namespace, runId })}/hold: ${runId} was not held — ${said}. Hold it with \`nemia hold ${runId} --until <runId>\`.`,
  strict: true,
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

/** A try's run removed; it takes no body, and a failure that is no refusal names `nemia rm`. */
const RM: RouteWords = {
  shape: '`{}`',
  issue: () => () => 'DELETE /api/namespaces/:namespace/runs/:runId takes no body: `{}`.',
  failed: ({ runId, namespace }, said) =>
    `DELETE ${runPath({ namespace, runId })}: ${runId} was not removed — ${said}. Remove it with \`nemia rm ${runId}\`.`,
};

/** The body `POST …/prune` takes: `nemia prune`'s two flags, each a switch; `--yes` is its route's own. */
const PRUNE_SHAPE = '`{ "artifacts"?: boolean, "unmerged"?: boolean }`';

/** The flag of `nemia prune` each key of its body is. */
const PRUNE_FLAGS = { artifacts: '--artifacts', unmerged: '--unmerged' } as const;

/** Why `POST …/prune`'s body is not one (400), by the first thing its schema refused: every key it does not take, named at once. */
function pruneWords({ path: [key], kind, input }: BodyIssue, body: unknown): string {
  if (kind === 'excess' && typeof body === 'object' && body !== null) {
    const unknown = Object.keys(body).filter((k) => !Object.hasOwn(PRUNE_FLAGS, k));
    return `POST …/prune does not take ${unknown.map((k) => `\`${k}\``).join(', ')}: it takes ${PRUNE_SHAPE}, as \`nemia prune\` takes --artifacts and --unmerged.`;
  }
  if (key === 'artifacts' || key === 'unmerged')
    return `POST …/prune takes \`${key}\` as true or false — \`nemia prune\`'s ${PRUNE_FLAGS[key]} — and this request sent ${JSON.stringify(input)}.`;
  return `POST …/prune takes a JSON object: ${PRUNE_SHAPE}.`;
}

/**
 * A finished run pruned: its body — strict, every key it does not take named — and a failure that is no
 * refusal, naming `nemia prune`.
 */
const PRUNE: RouteWords = {
  shape: PRUNE_SHAPE,
  issue: () => pruneWords,
  failed: ({ runId, namespace }, said) =>
    `POST ${runPath({ namespace, runId })}/prune: ${runId} was not pruned — ${said}. Prune it with \`nemia prune ${runId}\`.`,
  strict: true,
};

export const WORDS: Readonly<Record<string, RouteWords>> = {
  retry: RETRY,
  refresh: REFRESH,
  approve: APPROVE,
  say: SAY,
  hold: HOLD,
  pause: PAUSE,
  resume: RESUME,
  subscribe: SUBSCRIBE,
  unsubscribe: UNSUBSCRIBE,
  level: LEVEL,
  'policy confirm': POLICY_CONFIRM,
  'policy rm': POLICY_DROP,
  rm: RM,
  prune: PRUNE,
  ...LABEL_WORDS,
  'agents custom': AGENTS_CUSTOM,
  'agents copy': AGENTS_COPY,
};
