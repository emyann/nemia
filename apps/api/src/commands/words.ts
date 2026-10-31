/**
 * The api's own words for each command it serves, keyed by the command's name: the write guard's (guard.ts), the body its route takes,
 * why a body is not one (400), and what a failure that is not a refusal answers (502).
 */
import { Schema } from 'effect';
import { factoryNameRefusal, inboxNameRefusal } from 'agent-orchestrator';
import { decodeBody, valueAt, type BodyIssue, type Words } from '../body.ts';
import type { Guarded } from '../guard.ts';
import { AGENTS_COPY, AGENTS_CUSTOM, POLICY_CONFIRM, POLICY_DROP } from './library.ts';
import { LEVEL, SUBSCRIBE, UNSUBSCRIBE } from './sessions.ts';
import { FACTORY_RULES_WORDS } from '../factories/rules.ts';
import { FACTORY_SCHEDULE, FACTORY_UNSCHEDULE } from '../factories/schedules.ts';
import { FACTORY_SERVER_WORDS } from '../servers/index.ts';

/**
 * What a route's path names: the run and the step — `step` empty on a route that names none, `runId` on a route of the store's own, where
 * `step` is a factory's hire's — the `name` of what else it names, a card or an agent, the `factory` a hire or an instruction names,
 * and the request's `method` and `path`, as a refusal says the route — a server a factory's route names is read off the path.
 */
export type Named = {
  readonly runId: string;
  readonly step: string;
  readonly name: string;
  readonly factory: string;
  readonly method: string;
  readonly path: string;
};

/**
 * A routed command's words: `shape`, its body as a refusal shows it; `guard`, `issue` and `failed`, each said of what it names; `strict`,
 * where its body is refused a key its schema does not have, named before any it does; `named`, the refusal of a name in its path, 400,
 * before its body is read; `bodyless`, where its route reads no body but none or `{}`, the refusal of the text it was sent, 400; `notJson`,
 * the refusal of a body that is not JSON, 400, where it has words of its own; `on`, the words of a path the command serves besides its own,
 * kept from a command it absorbed, by the path's last fixed word (`wordsAt` in routes.ts) — a kept path takes no key on the api alone, as
 * the command it was did not. A route with no `failed` lets a failure that is no refusal through, to `app.onError`, as a 500.
 */
export type RouteWords = {
  readonly shape: string;
  readonly guard: (at: Named) => Guarded;
  readonly issue: (at: Named) => Words;
  readonly failed?: (at: Named, said: string) => string;
  readonly strict?: true;
  readonly named?: (at: Named) => string | null;
  readonly bodyless?: (at: Named, text: string) => string | null;
  readonly notJson?: (at: Named) => string;
  readonly on?: Readonly<Record<string, RouteWords>>;
};

/** The body `POST …/retry` takes: `nemia retry`'s flags, as JSON. */
const RETRY_SHAPE =
  '`{ "mode": "continue" | "fresh" | "recheck", "model"?: "<m>", "message"?: "<answer>", "budget"?: <amount>, "answers"?: [{ "question": "<title>", "chose": ["<label>"], "own"?: "<words>" }] }`';

/** The body `POST …/round` takes: `nemia retry --round`'s arguments, as JSON. */
const ROUND_SHAPE = '`{ "step"?: "<looping step>", "budget"?: <amount> }`';

/** The body `POST …/merge` takes: `nemia refresh --base`'s argument, as JSON. */
const MERGE_SHAPE = '`{ "step"?: "<looping step>" }`';

/** The body `POST …/approve` takes: `nemia approve`'s `--message`, as JSON. */
const APPROVE_SHAPE = '`{ "message"?: "<words>", "answers"?: [{ "question": "<title>", "chose": ["<label>"], "own"?: "<words>" }] }`';

/**
 * The body `POST …/accept` takes: `nemia approve`'s `--message` of a loop out of rounds, as JSON — required, as the command line requires
 * it, in the package's words: the schema types it only.
 */
const ACCEPT_SHAPE = '`{ "message": "<why>" }`';

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
  if (key === 'budget') return budgetWords(input, 'nemia retry', RETRY_SHAPE);
  if (key === 'answers')
    return `\`answers\` are a person's answers to the questions the step asks: a list of { "question": its title, "chose": the labels chosen, "own"?: words of their own }, or left out. This request's was ${JSON.stringify(input)}: ${RETRY_SHAPE}.`;
  return `POST …/retry takes a JSON object: ${RETRY_SHAPE}.`;
};

/**
 * Why `POST …/round`'s body is not an ask (400), by the first key its schema refused: the looping step, which `nemia retry --round` takes
 * when the run has more than one loop, and `--budget`, the cap each step of the loop over its budget is raised to.
 */
const roundWords =
  (id: string) =>
  ({ path: [key], input }: BodyIssue): string => {
    if (key === 'step')
      return `\`step\` names the looping step whose loop goes round again, as \`nemia retry ${id} <step> --round\` does: a name, or left out for a run with one loop. This request's was ${JSON.stringify(input)}: ${ROUND_SHAPE}.`;
    if (key === 'budget') return budgetWords(input, `nemia retry ${id} --round`, ROUND_SHAPE);
    return `POST …/round takes a JSON object: ${ROUND_SHAPE}.`;
  };

/** Another try of a step, as the guard's refusals word it, its body and its failures. */
const RETRY: RouteWords = {
  shape: RETRY_SHAPE,
  guard: ({ runId, step }) => ({
    route: `POST /api/runs/${runId}/steps/${step}/retry`,
    does: 'asks for another try of a step',
    forAnother: 'ask for one',
    why: 'the next tick files the try a person asks for, and the answer it carries goes into the brief an agent acts on in this repository',
    reach: "answer the step from the run's page on the board",
    instead: `Answer it from the run's page on the board, or with \`nemia retry ${runId} ${step}\``,
    shape: RETRY_SHAPE,
  }),
  issue: () => retryWords,
  failed: ({ runId, step }, said) =>
    `Could not ask for another try of step '${step}': ${said}. \`nemia retry ${runId} ${step}\` asks the same way from the command line.`,
};

/**
 * Another round of a run's loop, on `POST …/round`, a path of `retry` (`nemia retry --round`), as the guard's refusals word it, its body
 * and its failures.
 */
const ROUND: RouteWords = {
  shape: ROUND_SHAPE,
  guard: ({ runId }) => ({
    route: `POST /api/runs/${runId}/round`,
    does: "asks for another round of a run's loop",
    forAnother: 'ask for one',
    why: "the next tick files the round a person asks for, which runs the loop's steps again in this repository, past the cap a budget carried where it raises one",
    reach: "raise it from the run's page on the board",
    instead: `Raise it from the run's page on the board, or with \`nemia retry ${runId} [<step>] --round --budget <amount>\``,
    shape: ROUND_SHAPE,
  }),
  issue: ({ runId }) => roundWords(runId),
  failed: ({ runId }, said) =>
    `Could not ask for another round of ${runId}'s loop: ${said}. \`nemia retry ${runId} --round\` asks the same way from the command line.`,
};

/**
 * A merge of the base into a loop's work, on `POST …/merge`, a path of `refresh` (`nemia refresh --base`), as the guard's refusals word
 * it, its body and its failures.
 */
const MERGE: RouteWords = {
  shape: MERGE_SHAPE,
  guard: ({ runId }) => ({
    route: `POST /api/runs/${runId}/merge`,
    does: "sends a loop's work back to merge its base branch",
    forAnother: 'ask for one',
    why: "the next tick files the merge a person asks for, which runs the loop's target again in this repository to merge the base into its work",
    reach: "ask it from the run's page on the board",
    instead: `Ask it from the run's page on the board, or with \`nemia refresh ${runId} [<step>] --base\``,
    shape: MERGE_SHAPE,
  }),
  issue:
    ({ runId }) =>
    ({ path: [key], input }) =>
      key === 'step'
        ? `\`step\` names the looping step whose work merges, as \`nemia refresh ${runId} <step> --base\` does: a name, or left out for a run with one loop. This request's was ${JSON.stringify(input)}: ${MERGE_SHAPE}.`
        : `POST …/merge takes a JSON object: ${MERGE_SHAPE}.`,
  failed: ({ runId }, said) =>
    `Could not ask for a merge of ${runId}'s base: ${said}. \`nemia refresh ${runId} --base\` asks the same way from the command line.`,
};

/** An approval of a step waiting at its gate, as the guard's refusals word it, its body and its failures. */
const APPROVE: RouteWords = {
  shape: APPROVE_SHAPE,
  guard: ({ runId, step }) => ({
    route: `POST /api/runs/${runId}/steps/${step}/approve`,
    does: 'approves a step waiting at its gate',
    forAnother: 'approve one',
    why: 'the next tick files what waits on a step a person approves, and the words given with it go into the brief of every step after the gate, which an agent acts on in this repository',
    reach: "approve it from the run's page on the board",
    instead: `Approve it from the run's page on the board, or with \`nemia approve ${runId} ${step}\``,
    shape: APPROVE_SHAPE,
  }),
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

/**
 * An acceptance of a loop out of rounds, on `POST …/accept`, a path of `approve` (`nemia approve` of a loop out of rounds), as the guard's
 * refusals word it, its body and its failures.
 */
const ACCEPT: RouteWords = {
  shape: ACCEPT_SHAPE,
  guard: ({ runId, step }) => ({
    route: `POST /api/runs/${runId}/steps/${step}/accept`,
    does: 'accepts the work of a loop out of rounds as it stands',
    forAnother: 'accept one',
    why: 'the next tick files what waits on a loop a person accepts, and the words given with it go into the brief of every step after the loop, which an agent acts on in this repository',
    reach: "accept it from the run's page on the board",
    instead: `Accept it from the run's page on the board, or with \`nemia approve ${runId} ${step} --message "<why>"\``,
    shape: ACCEPT_SHAPE,
  }),
  issue:
    ({ runId, step }) =>
    ({ path: [key], input }) =>
      key === 'message'
        ? `\`message\` is why the work is good enough with its findings open, which every step after the loop is handed, as \`nemia approve ${runId} ${step} --message "<why>"\` takes it: text. This request's was ${JSON.stringify(input)}: ${ACCEPT_SHAPE}.`
        : `POST …/accept takes a JSON object: ${ACCEPT_SHAPE}.`,
  failed: ({ runId, step }, said) =>
    `Could not accept ${step}'s loop as it stands: ${said}. \`nemia approve ${runId} ${step} --message "<why>"\` accepts the same way from the command line.`,
};

/** A run told to take the new revisions of the kinds it resolved, as the guard's refusals word it, its body and its failures. */
const REFRESH: RouteWords = {
  shape: '`{}`',
  guard: ({ runId }) => ({
    route: `POST /api/runs/${runId}/refresh`,
    does: 'tells a run to take the new revisions of the kinds it resolved',
    forAnother: 'refresh one',
    why: "every filing after it — a new step, a retry, a round — is filed on the newest revision of the run's workflow, its agents, their skills and its factory's rules, which an agent acts on in this repository",
    reach: `take them with \`nemia refresh ${runId}\``,
    instead: `Take them with \`nemia refresh ${runId}\`: the run's page on the board shows the drift and prints that verb, and has no button for it`,
    shape: '`{}`',
  }),
  issue: (at) => () => `POST /api/runs/${at.runId}/refresh takes no body.`,
  failed: ({ runId }, said) =>
    `Could not refresh ${runId}: ${said}. \`nemia refresh ${runId}\` takes the new revisions the same way from the command line.`,
};

/** Words for a step's running session, as the guard's refusals word them, and its body; words the harness did not take are its own. */
const SAY: RouteWords = {
  shape: SAY_SHAPE,
  guard: ({ runId, step }) => ({
    route: `POST /api/runs/${runId}/steps/${step}/say`,
    does: "hands a person's words to a step's running session",
    forAnother: 'hand it any',
    why: "the words go into the session of a step at work in this repository, as a person's, and its agent acts on them",
    reach: "say it from the step's session page on the board",
    instead: `Say it from the step's session page on the board, or with \`nemia say ${runId} ${step} "<words>"\``,
    shape: SAY_SHAPE,
  }),
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
 * Why `POST /api/runs/<runId>/hold`'s body is not one (400), by the first thing its schema refused: every key it does not take, named at
 * once, and `off` pointed at the lift; a key it takes, sent as what it is not.
 */
const holdWords =
  (runId: string) =>
  ({ path: [key], kind, input }: BodyIssue, body: unknown): string => {
    const route = `POST /api/runs/${runId}/hold`;
    if (kind === 'excess' && typeof body === 'object' && body !== null) {
      const unknown = Object.keys(body).filter((k) => !Object.hasOwn(HOLD_FLAGS, k));
      const off = unknown.includes('off')
        ? ` A hold is lifted with \`DELETE /api/runs/${runId}/hold\`, as \`nemia hold ${runId} --off\` lifts it.`
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
 * A person's hold put (`POST`) or lifted (`DELETE`), as the guard's refusals word each, its body — the put's strict, every key it does not
 * take named; the lift's none — and a failure that is no refusal, naming the `nemia hold` that does the same.
 */
const HOLD: RouteWords = {
  shape: HOLD_PUT_SHAPE,
  guard: ({ runId, method }) =>
    method === 'DELETE'
      ? {
          route: `DELETE /api/runs/${runId}/hold`,
          does: "lifts a run's hold",
          forAnother: 'lift one',
          why: 'a hold lifted lets the run go on at the next tick, its steps filed and what they asked asked again',
          reach: "lift it on the board's run page",
          instead: "Lift it on the board's run page, or with `nemia hold <run> --off`",
          shape: '`{}`',
        }
      : {
          route: `POST /api/runs/${runId}/hold`,
          does: 'holds a run until other runs land',
          forAnother: 'hold one',
          why: 'a held run has nothing more of it filed, and nothing of it asked of a person, until every run it waits on has landed',
          reach: "put it on the board's run page",
          instead: "Put it on the board's run page, or with `nemia hold <run> --until <runId>`",
          shape: HOLD_PUT_SHAPE,
        },
  issue: ({ runId, method }) => (method === 'DELETE' ? () => 'DELETE …/hold takes no body: `{}`.' : holdWords(runId)),
  failed: ({ runId, method }, said) =>
    method === 'DELETE'
      ? `DELETE /api/runs/${runId}/hold: the hold was not lifted — ${said}. Lift it with \`nemia hold ${runId} --off\`.`
      : `POST /api/runs/${runId}/hold: ${runId} was not held — ${said}. Hold it with \`nemia hold ${runId} --until <runId>\`.`,
  strict: true,
};

/** The body `POST /api/pause` takes: `nemia pause`'s flags, as JSON, `now` its `--now`, which the route acts on as `--yes` does. */
const PAUSE_SHAPE = '`{ "why"?: "<words>", "by"?: "<name>", "now"?: true }`';

/** What `issue` says of a key of `POST /api/pause`'s body sent wrong, `input` what the request sent. */
const pauseKeyWords = (key: unknown, input: unknown): string => {
  const was = `This request's was ${JSON.stringify(input)}: ${PAUSE_SHAPE}.`;
  if (key === 'now') return `\`now\` stops what still finishes, as \`nemia pause --now --yes\` does: true, or left out. ${was}`;
  if (key === 'why' || key === 'by')
    return `\`${key}\` is ${key === 'why' ? 'why the store is paused' : 'who pauses it'}, as \`nemia pause --${key} "<words>"\` takes it: text, or left out. ${was}`;
  return `POST /api/pause takes a JSON object: ${PAUSE_SHAPE}.`;
};

/** The store paused, as the guard's refusals word it, its body and its failures; a pause that stands is the package's 409. */
const PAUSE: RouteWords = {
  shape: PAUSE_SHAPE,
  guard: () => ({
    route: 'POST /api/pause',
    does: 'pauses the store',
    forAnother: 'pause it',
    why: 'a pause stops every pass from starting new work in every repository the store runs in, until a person resumes it, and a pause at once stops what is at work',
    reach: "pause it from the board's bottom bar",
    instead: 'Pause it from the board\'s bottom bar, or with `nemia pause --why "<words>"`',
    shape: PAUSE_SHAPE,
  }),
  issue:
    () =>
    ({ path: [key], input }) =>
      pauseKeyWords(key, input),
  failed: (_at, said) => `POST /api/pause: the store was not paused — ${said}. Pause it with \`nemia pause\`.`,
};

/** The store resumed, as the guard's refusals word it; it takes no body, and none standing is the package's 404. */
const RESUME: RouteWords = {
  shape: '`{}`',
  guard: () => ({
    route: 'DELETE /api/pause',
    does: 'resumes the store',
    forAnother: 'resume it',
    why: 'a store resumed lets the next pass file every step, try and check that waits, in every repository the store runs in',
    reach: "resume it from the board's bottom bar",
    instead: "Resume it from the board's bottom bar, or with `nemia resume`",
    shape: '`{}`',
  }),
  issue: () => () => 'DELETE /api/pause takes no body: `{}`.',
  failed: (_at, said) => `DELETE /api/pause: the store was not resumed — ${said}. Resume it with \`nemia resume\`.`,
};

/** A try's run removed, as the guard's refusals word it; it takes no body, and a failure that is no refusal names `nemia rm`. */
const RM: RouteWords = {
  shape: '`{}`',
  guard: ({ runId }) => ({
    route: `DELETE /api/runs/${runId}`,
    does: 'removes a run',
    forAnother: 'remove one',
    why: "a run removed takes its record, every folder it worked in and the engine's journals and session files of its tasks with it, and nothing brings them back",
    reach: "remove it on the board's run page",
    instead: "Remove it on the board's run page, or with `nemia rm`",
    shape: '`{}`',
  }),
  issue: () => () => 'DELETE /api/runs/:id takes no body: `{}`.',
  failed: ({ runId }, said) => `DELETE /api/runs/${runId}: ${runId} was not removed — ${said}. Remove it with \`nemia rm ${runId}\`.`,
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
 * A finished run pruned, as the guard's refusals word it, its body — strict, every key it does not take named — and a failure that is no
 * refusal, naming `nemia prune`.
 */
const PRUNE: RouteWords = {
  shape: PRUNE_SHAPE,
  guard: ({ runId }) => ({
    route: `POST /api/runs/${runId}/prune`,
    does: 'prunes a run',
    forAnother: 'prune one',
    why: 'a run pruned has its worktrees removed, and its files with `artifacts`, and none of its steps can be tried again, sent round or approved',
    reach: "prune it on the board's run page",
    instead: "Prune it on the board's run page, or with `nemia prune <run>`",
    shape: PRUNE_SHAPE,
  }),
  issue: () => pruneWords,
  failed: ({ runId }, said) => `POST /api/runs/${runId}/prune: ${runId} was not pruned — ${said}. Prune it with \`nemia prune ${runId}\`.`,
  strict: true,
};

/** A drop of the card `name`, as the guard's refusals word it. */
/** A card dropped, as the guard's refusals word it; a name that would leave the inbox is refused in the package's words. */
const INBOX_RM: RouteWords = {
  shape: '`{}`',
  guard: ({ name }): Guarded => ({
    route: `DELETE /api/inbox/${name}`,
    does: 'drops a card',
    forAnother: 'drop one',
    why: 'a card dropped is an idea gone, and nothing keeps a copy',
    reach: 'drop the card from the board',
    instead: `Drop it from the board's Inbox page, or with \`nemia inbox rm ${name}\``,
    shape: 'no body, or `{}`: the card is named in the path',
  }),
  issue: () => () => 'DELETE /api/inbox/:name takes no body: `{}`.',
  named: ({ name }) => inboxNameRefusal(name) ?? null,
};

const QUEUE_SHAPE = 'no body, or `{}`: the card is named in the path, and queued on the workflow it names';

/** A queue of the card `name`, or its taking back (`off`), as the guard's refusals word it. */
const queueGuard = (name: string, off: boolean): Guarded =>
  off
    ? {
        route: `DELETE /api/inbox/${name}/queue`,
        does: 'takes a card off the queue',
        forAnother: 'take one off',
        why: 'a card taken off the queue is an idea the tick no longer starts, and its place is lost',
        reach: 'take the card off the queue from the board',
        instead: `Take it off from the board's Inbox page, or with \`nemia inbox queue ${name} --off\``,
        shape: QUEUE_SHAPE,
      }
    : {
        route: `POST /api/inbox/${name}/queue`,
        does: 'queues a card',
        forAnother: 'queue one',
        why: 'a queued card is started by the tick when a run slot frees, and its body is what the run is asked to do, in the repository it names',
        reach: 'queue the card from the board',
        instead: `Queue it from the board's Inbox page, or with \`nemia inbox queue ${name}\``,
        shape: QUEUE_SHAPE,
      };

/** The one JSON body a queue takes: `{}`, an object with no key. */
const QUEUE_BODY = Schema.Record(Schema.String, Schema.Never);

/**
 * Why a queue's body is refused, or null: it takes none, or `{}`. `nemia inbox queue --workflow <w>` writes a workflow with the mark, and
 * the api does not: a card is queued from the board on the workflow it names, and one that names none is the package's to refuse — so a
 * `workflow` sent is refused by name rather than read as nothing.
 */
function queueBodyRefusal(route: string, text: string): string | null {
  if (!text.trim()) return null;
  let body: unknown;
  try {
    body = JSON.parse(text);
  } catch {
    return `${route} takes ${QUEUE_SHAPE}, and this request's body is not JSON.`;
  }
  const decoded = decodeBody(QUEUE_BODY, body, () => {
    const named =
      valueAt(body, ['workflow']) !== undefined
        ? ' A card is queued on the workflow it names: file it with one, or queue it with `nemia inbox queue <name> --workflow <w>`, which writes both.'
        : '';
    return `${route} takes ${QUEUE_SHAPE}, and this request sent ${JSON.stringify(body)}.${named}`;
  });
  return 'status' in decoded ? decoded.error : null;
}

/**
 * A card queued, or taken off the queue, as the guard's refusals word it: a name that would leave the inbox is refused in the package's
 * words, and a body but none or `{}` in the queue's (`queueBodyRefusal`), each before the card is read.
 */
const INBOX_QUEUE: RouteWords = {
  shape: QUEUE_SHAPE,
  guard: ({ name, method }) => queueGuard(name, method === 'DELETE'),
  issue: () => () => `the queue takes ${QUEUE_SHAPE}.`,
  named: ({ name }) => inboxNameRefusal(name) ?? null,
  bodyless: ({ name, method }, text) => queueBodyRefusal(queueGuard(name, method === 'DELETE').route, text),
};

const FROM_SHAPE = '`{ "runs": ["<runId>", ...] }`: the runs the card is handed as context, by id';

/** A card's `from:` set (`PUT`), or taken off (`DELETE`), as the guard's refusals word it. */
const fromGuard = (name: string, off: boolean): Guarded => ({
  route: `${off ? 'DELETE' : 'PUT'} /api/inbox/${name}/from`,
  does: off ? "takes a card's from: off" : "sets a card's from:",
  forAnother: off ? 'take one off' : 'set one',
  why: "a card's from: is what its run is handed as context, read into every root step's brief",
  reach: "set it on the card's page on the board",
  instead: off
    ? `Take it off on the card's page on the board, or with \`nemia inbox from ${name} --off\``
    : `Set it on the card's page on the board, or with \`nemia inbox from ${name} <run>...\``,
  shape: off ? 'no body, or `{}`: the card is named in the path' : FROM_SHAPE,
});

/**
 * A card's `from:` set, or taken off, as the guard's refusals word it: a name that would leave the inbox is refused in the package's words,
 * before the card is read, and a body whose `runs` is not a list of ids in the api's.
 */
const INBOX_FROM: RouteWords = {
  shape: FROM_SHAPE,
  guard: ({ name, method }) => fromGuard(name, method === 'DELETE'),
  issue: () => (_issue, body) =>
    `PUT /api/inbox/:name/from takes ${FROM_SHAPE}, each an id that is not blank. This request's was ${JSON.stringify(valueAt(body, ['runs']))}.`,
  named: ({ name }) => inboxNameRefusal(name) ?? null,
  strict: true,
};

const INSTRUCTION_PUT_SHAPE = '`{ "path": "<path in the factory\'s first folder>" }` or `{ "store": true }`';

const INSTRUCT_PUT_SHAPE = '`{ "words": "<what Nemia is to know about the factory>" }`';

/**
 * The route of a factory's instruction `at` names, as a refusal says it: `PUT /api/factories/<name>/instruction`, and `…/words` for its
 * text.
 */
const instructionRoute = ({ method, factory }: Named, words: boolean): string =>
  `${method} /api/factories/${factory}/instruction${words ? '/words' : ''}`;

/** A name in a factory's instruction's route that is no factory's, in the package's words, before anything is read. */
const factoryNamed =
  (words: boolean) =>
  (at: Named): string | null => {
    const wrong = factoryNameRefusal(at.factory);
    return wrong === undefined ? null : `${instructionRoute(at, words)}: ${wrong}`;
  };

/**
 * Where a factory's instruction is kept, put or cleared, as the guard's refusals word it: a name that is no factory's is refused in the
 * package's words, a path or a store that is no string or `true` in the api's.
 */
const FACTORY_INSTRUCTION: RouteWords = {
  shape: INSTRUCTION_PUT_SHAPE,
  guard: (at) => ({
    route: instructionRoute(at, false),
    does: "says where a factory's instruction is kept",
    forAnother: 'move it',
    why: 'Nemia reads the instruction kept there before she acts in the factory',
    reach: "choose where it is kept on the factory's settings page on the board",
    instead: "Choose where it is kept on the factory's settings page on the board",
    shape: at.method === 'DELETE' ? '`{}`' : INSTRUCTION_PUT_SHAPE,
  }),
  issue: (at) => (_issue, body) =>
    `${instructionRoute(at, false)}: a factory's instruction is kept at a \`path\` in its first folder, a string, or in the store, \`"store": true\`: ${INSTRUCTION_PUT_SHAPE}. This request sent ${JSON.stringify(body)}.`,
  named: factoryNamed(false),
  notJson: (at) => `${instructionRoute(at, false)} takes a JSON body: ${INSTRUCTION_PUT_SHAPE}.`,
};

/**
 * The text the store keeps as a factory's instruction, written or cleared, as the guard's refusals word it: a name that is no factory's
 * is refused in the package's words, words that are not a string in the api's.
 */
const FACTORY_INSTRUCT: RouteWords = {
  shape: INSTRUCT_PUT_SHAPE,
  guard: (at) => ({
    route: instructionRoute(at, true),
    does: "writes a factory's instruction",
    forAnother: 'write it',
    why: 'Nemia reads it before she acts in the factory',
    reach: "write it on the factory's settings page on the board",
    instead: "Write it on the factory's settings page on the board",
    shape: at.method === 'DELETE' ? '`{}`' : INSTRUCT_PUT_SHAPE,
  }),
  issue: (at) => (_issue, body) =>
    `${instructionRoute(at, true)}: \`words\` are what Nemia is to know about the factory, a string: ${INSTRUCT_PUT_SHAPE}. This request's was ${JSON.stringify(valueAt(body, ['words']))}.`,
  named: factoryNamed(true),
  notJson: (at) => `${instructionRoute(at, true)} takes a JSON body: ${INSTRUCT_PUT_SHAPE}.`,
};

const HIRE_PUT_SHAPE = '`{ "agent": "<the agent\'s name>" }`';

/** The route of the hire into a step `at` names, as a refusal says it, the step encoded as the path carries it. */
const hireRoute = ({ method, factory, step }: Named): string => `${method} /api/factories/${factory}/hires/${encodeURIComponent(step)}`;

/** A name in a hire's route that is no factory's, in the package's words, before anything is read. */
const hireFactoryNamed = (at: Named): string | null => {
  const wrong = factoryNameRefusal(at.factory);
  return wrong === undefined ? null : `${hireRoute(at)}: ${wrong}`;
};

/**
 * An agent hired into a step of a factory's workflow, as the guard's refusals word it: a name that is no factory's is refused in the
 * package's words, an agent that is no string in the api's.
 */
const FACTORY_HIRE: RouteWords = {
  shape: HIRE_PUT_SHAPE,
  guard: (at) => ({
    route: hireRoute(at),
    does: 'hires an agent into a step of a factory',
    forAnother: 'hire one',
    why: 'every run of the workflow started in the factory after runs the step as that agent, in its repositories',
    reach: "hire it on the step's page on the board",
    instead: "Hire it on the step's page on the board",
    shape: HIRE_PUT_SHAPE,
  }),
  issue: (at) => (_issue, body) =>
    `${hireRoute(at)}: \`agent\` names the agent to hire, a string, its file's name without .md: ${HIRE_PUT_SHAPE}. This request's was ${JSON.stringify(valueAt(body, ['agent'])) ?? 'left out'}.`,
  named: hireFactoryNamed,
  notJson: (at) => `${hireRoute(at)} takes a JSON body: ${HIRE_PUT_SHAPE}.`,
};

/** A step's hire taken back, as the guard's refusals word it: a name that is no factory's is refused in the package's words. */
const FACTORY_FIRE: RouteWords = {
  shape: '`{}`',
  guard: (at) => ({
    route: hireRoute(at),
    does: "takes a step's hire back",
    forAnother: 'take it back',
    why: 'every run of the workflow started in the factory after runs the step with no agent hired, and a start refuses a step left with none',
    reach: "fire it on the step's page on the board",
    instead: "Fire it on the step's page on the board",
    shape: '`{}`',
  }),
  issue: (at) => () => `${hireRoute(at)} takes no body.`,
  named: hireFactoryNamed,
};

/** The api's words for each routed command, by its name, with those of the paths it keeps from a command it absorbed (`on`). */
export const WORDS: Readonly<Record<string, RouteWords>> = {
  retry: { ...RETRY, on: { round: ROUND } },
  refresh: { ...REFRESH, on: { merge: MERGE } },
  approve: { ...APPROVE, on: { accept: ACCEPT } },
  say: SAY,
  hold: HOLD,
  pause: PAUSE,
  resume: RESUME,
  subscribe: SUBSCRIBE,
  unsubscribe: UNSUBSCRIBE,
  level: LEVEL,
  'policy confirm': POLICY_CONFIRM,
  'policy drop': POLICY_DROP,
  rm: RM,
  prune: PRUNE,
  'inbox queue': INBOX_QUEUE,
  'inbox from': INBOX_FROM,
  'inbox rm': INBOX_RM,
  'agents custom': AGENTS_CUSTOM,
  'agents copy': AGENTS_COPY,
  'factory rules': FACTORY_RULES_WORDS,
  'factory instruction': FACTORY_INSTRUCTION,
  'factory instruct': FACTORY_INSTRUCT,
  'factory hire': FACTORY_HIRE,
  'factory fire': FACTORY_FIRE,
  'factory schedule': FACTORY_SCHEDULE,
  'factory unschedule': FACTORY_UNSCHEDULE,
  ...FACTORY_SERVER_WORDS,
};
