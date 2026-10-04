/**
 * The api's own words for each command it serves, keyed by the command's name: the write guard's (guard.ts), the body its route takes,
 * why a body is not one (400), and what a failure that is not a refusal answers (502).
 */
import type { BodyIssue, Words } from '../body.ts';
import type { Guarded } from '../guard.ts';

/** The run and the step a route's path names: `step` is empty on a route that names none. */
export type Named = { readonly runId: string; readonly step: string };

/**
 * A routed command's words: `shape`, its body as a refusal shows it; `guard`, `issue` and `failed`, each said of the run it names; and
 * `strict`, where its body is refused a key its schema does not have, named before any it does.
 */
export type RouteWords = {
  readonly shape: string;
  readonly guard: (at: Named) => Guarded;
  readonly issue: (at: Named) => Words;
  readonly failed: (at: Named, said: string) => string;
  readonly strict?: true;
};

/** The body `POST …/retry` takes: `wf retry`'s flags, as JSON. */
const RETRY_SHAPE =
  '`{ "mode": "nudge" | "fresh" | "recheck", "model"?: "<m>", "message"?: "<answer>", "budget"?: <amount>, "answers"?: [{ "question": "<title>", "chose": ["<label>"], "own"?: "<words>" }] }`';

/** The body `POST …/round` takes: `wf round`'s arguments, as JSON. */
const ROUND_SHAPE = '`{ "step"?: "<looping step>", "budget"?: <amount> }`';

/** The body `POST …/approve` takes: `wf approve`'s `--message`, as JSON. */
const APPROVE_SHAPE = '`{ "message"?: "<words>" }`';

/**
 * The body `POST …/accept` takes: `wf accept`'s `--message`, as JSON — required, as the command line requires it, in the package's words
 * (`acceptWordsRefusal`): the schema types it only.
 */
const ACCEPT_SHAPE = '`{ "message": "<why>" }`';

/** The body `POST …/say` takes: the words, as `wf say` takes them. */
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
    return `\`mode\` is how to try the step again, as \`wf retry\` takes it: "nudge" continues its session, told what happened; "fresh" starts a new session on its branch; "recheck" runs its check again and files no session. This request's was ${JSON.stringify(input) ?? 'left out'}: ${RETRY_SHAPE}.`;
  if (key === 'model')
    return `\`model\` names the model a new session runs on, as \`wf retry --model <m>\` does: a name, or left out for the step's own. This request's was ${JSON.stringify(input)}.`;
  if (key === 'message')
    return `\`message\` is what to tell the step, as \`wf retry --message "<answer>"\` takes it: text, or left out. This request's was ${JSON.stringify(input)}.`;
  if (key === 'budget') return budgetWords(input, 'wf retry', RETRY_SHAPE);
  if (key === 'answers')
    return `\`answers\` are a person's answers to the questions the step asks: a list of { "question": its title, "chose": the labels chosen, "own"?: words of their own }, or left out. This request's was ${JSON.stringify(input)}: ${RETRY_SHAPE}.`;
  return `POST …/retry takes a JSON object: ${RETRY_SHAPE}.`;
};

/**
 * Why `POST …/round`'s body is not an ask (400), by the first key its schema refused: the looping step, which `wf round` takes when the run
 * has more than one loop, and `--budget`, the cap each step of the loop over its budget is raised to.
 */
const roundWords =
  (id: string) =>
  ({ path: [key], input }: BodyIssue): string => {
    if (key === 'step')
      return `\`step\` names the looping step whose loop goes round again, as \`wf round ${id} <step>\` does: a name, or left out for a run with one loop. This request's was ${JSON.stringify(input)}: ${ROUND_SHAPE}.`;
    if (key === 'budget') return budgetWords(input, `wf round ${id}`, ROUND_SHAPE);
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
    instead: `Answer it from the run's page on the board, or with \`wf retry ${runId} ${step}\``,
    shape: RETRY_SHAPE,
  }),
  issue: () => retryWords,
  failed: ({ runId, step }, said) =>
    `Could not ask for another try of step '${step}': ${said}. \`wf retry ${runId} ${step}\` asks the same way from the command line.`,
};

/** Another round of a run's loop, as the guard's refusals word it, its body and its failures. */
const ROUND: RouteWords = {
  shape: ROUND_SHAPE,
  guard: ({ runId }) => ({
    route: `POST /api/runs/${runId}/round`,
    does: "asks for another round of a run's loop",
    forAnother: 'ask for one',
    why: "the next tick files the round a person asks for, which runs the loop's steps again in this repository, past the cap a budget carried where it raises one",
    reach: "raise it from the run's page on the board",
    instead: `Raise it from the run's page on the board, or with \`wf round ${runId} [<step>] --budget <amount>\``,
    shape: ROUND_SHAPE,
  }),
  issue: ({ runId }) => roundWords(runId),
  failed: ({ runId }, said) =>
    `Could not ask for another round of ${runId}'s loop: ${said}. \`wf round ${runId}\` asks the same way from the command line.`,
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
    instead: `Approve it from the run's page on the board, or with \`wf approve ${runId} ${step}\``,
    shape: APPROVE_SHAPE,
  }),
  issue:
    ({ runId, step }) =>
    ({ path: [key], input }) =>
      key === 'message'
        ? `\`message\` is the words to approve with, which every step after the gate is handed, as \`wf approve ${runId} ${step} --message "<words>"\` takes them: text, or left out. This request's was ${JSON.stringify(input)}: ${APPROVE_SHAPE}.`
        : `POST …/approve takes a JSON object: ${APPROVE_SHAPE}.`,
  failed: ({ runId, step }, said) =>
    `Could not approve step '${step}': ${said}. \`wf approve ${runId} ${step}\` approves the same way from the command line.`,
};

/** An acceptance of a loop out of rounds, as the guard's refusals word it, its body and its failures. */
const ACCEPT: RouteWords = {
  shape: ACCEPT_SHAPE,
  guard: ({ runId, step }) => ({
    route: `POST /api/runs/${runId}/steps/${step}/accept`,
    does: 'accepts the work of a loop out of rounds as it stands',
    forAnother: 'accept one',
    why: 'the next tick files what waits on a loop a person accepts, and the words given with it go into the brief of every step after the loop, which an agent acts on in this repository',
    reach: "accept it from the run's page on the board",
    instead: `Accept it from the run's page on the board, or with \`wf accept ${runId} ${step} --message "<why>"\``,
    shape: ACCEPT_SHAPE,
  }),
  issue:
    ({ runId, step }) =>
    ({ path: [key], input }) =>
      key === 'message'
        ? `\`message\` is why the work is good enough with its findings open, which every step after the loop is handed, as \`wf accept ${runId} ${step} --message "<why>"\` takes it: text. This request's was ${JSON.stringify(input)}: ${ACCEPT_SHAPE}.`
        : `POST …/accept takes a JSON object: ${ACCEPT_SHAPE}.`,
  failed: ({ runId, step }, said) =>
    `Could not accept ${step}'s loop as it stands: ${said}. \`wf accept ${runId} ${step} --message "<why>"\` accepts the same way from the command line.`,
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
    instead: `Say it from the step's session page on the board, or with \`wf say ${runId} ${step} "<words>"\``,
    shape: SAY_SHAPE,
  }),
  issue:
    ({ runId, step }) =>
    ({ path: [key], input }) =>
      key === 'text'
        ? `\`text\` is the words to hand the step's session, as \`wf say ${runId} ${step} "<words>"\` takes them: text. This request's was ${JSON.stringify(input) ?? 'left out'}: ${SAY_SHAPE}.`
        : `POST …/say takes a JSON object: ${SAY_SHAPE}.`,
  failed: (_at, said) => said,
};

/** A person's hold lifted, as the guard's refusals word it; it takes no body, and a failure that is no refusal names `wf hold --off`. */
const HOLD: RouteWords = {
  shape: '`{}`',
  guard: ({ runId }) => ({
    route: `DELETE /api/runs/${runId}/hold`,
    does: "lifts a run's hold",
    forAnother: 'lift one',
    why: 'a hold lifted lets the run go on at the next tick, its steps filed and what they asked asked again',
    reach: "lift it on the board's run page",
    instead: "Lift it on the board's run page, or with `wf hold <run> --off`",
    shape: '`{}`',
  }),
  issue: () => () => 'DELETE …/hold takes no body: `{}`.',
  failed: ({ runId }, said) =>
    `DELETE /api/runs/${runId}/hold: the hold was not lifted — ${said}. Lift it with \`wf hold ${runId} --off\`.`,
};

/** The body `POST /api/pause` takes: `wf pause`'s flags, as JSON. */
const PAUSE_SHAPE = '`{ "why"?: "<words>", "by"?: "<name>" }`';

/** The store paused, as the guard's refusals word it, its body and its failures; a pause that stands is the package's 409. */
const PAUSE: RouteWords = {
  shape: PAUSE_SHAPE,
  guard: () => ({
    route: 'POST /api/pause',
    does: 'pauses the store',
    forAnother: 'pause it',
    why: 'a pause stops every pass from starting new work in every repository the store runs in, until a person lifts it',
    reach: "pause it from the board's header",
    instead: 'Pause it from the board\'s header, or with `wf pause --why "<words>"`',
    shape: PAUSE_SHAPE,
  }),
  issue:
    () =>
    ({ path: [key], input }) =>
      key === 'why' || key === 'by'
        ? `\`${key}\` is ${key === 'why' ? 'why the store is paused' : 'who pauses it'}, as \`wf pause --${key} "<words>"\` takes it: text, or left out. This request's was ${JSON.stringify(input)}: ${PAUSE_SHAPE}.`
        : `POST /api/pause takes a JSON object: ${PAUSE_SHAPE}.`,
  failed: (_at, said) => `POST /api/pause: the store was not paused — ${said}. Pause it with \`wf pause\`.`,
};

/** The store's pause lifted, as the guard's refusals word it; it takes no body, and none standing is the package's 404. */
const RESUME: RouteWords = {
  shape: '`{}`',
  guard: () => ({
    route: 'DELETE /api/pause',
    does: "lifts the store's pause",
    forAnother: 'lift it',
    why: 'a pause lifted lets the next pass file every step, try and check that waits, in every repository the store runs in',
    reach: "lift it from the board's header",
    instead: "Lift it from the board's header, or with `wf resume`",
    shape: '`{}`',
  }),
  issue: () => () => 'DELETE /api/pause takes no body: `{}`.',
  failed: (_at, said) => `DELETE /api/pause: the pause was not lifted — ${said}. Lift it with \`wf resume\`.`,
};

/** A try's run removed, as the guard's refusals word it; it takes no body, and a failure that is no refusal names `wf rm`. */
const RM: RouteWords = {
  shape: '`{}`',
  guard: ({ runId }) => ({
    route: `DELETE /api/runs/${runId}`,
    does: 'removes a run',
    forAnother: 'remove one',
    why: 'a run removed takes its record and every folder it worked in with it, and nothing brings them back',
    reach: "remove it on the board's run page",
    instead: "Remove it on the board's run page, or with `wf rm`",
    shape: '`{}`',
  }),
  issue: () => () => 'DELETE /api/runs/:id takes no body: `{}`.',
  failed: ({ runId }, said) => `DELETE /api/runs/${runId}: ${runId} was not removed — ${said}. Remove it with \`wf rm ${runId}\`.`,
};

/** The body `POST …/prune` takes: `wf prune`'s two flags, each a switch; `--yes` is its route's own. */
const PRUNE_SHAPE = '`{ "artifacts"?: boolean, "unmerged"?: boolean }`';

/** The flag of `wf prune` each key of its body is. */
const PRUNE_FLAGS = { artifacts: '--artifacts', unmerged: '--unmerged' } as const;

/** Why `POST …/prune`'s body is not one (400), by the first thing its schema refused: every key it does not take, named at once. */
function pruneWords({ path: [key], kind, input }: BodyIssue, body: unknown): string {
  if (kind === 'excess' && typeof body === 'object' && body !== null) {
    const unknown = Object.keys(body).filter((k) => !Object.hasOwn(PRUNE_FLAGS, k));
    return `POST …/prune does not take ${unknown.map((k) => `\`${k}\``).join(', ')}: it takes ${PRUNE_SHAPE}, as \`wf prune\` takes --artifacts and --unmerged.`;
  }
  if (key === 'artifacts' || key === 'unmerged')
    return `POST …/prune takes \`${key}\` as true or false — \`wf prune\`'s ${PRUNE_FLAGS[key]} — and this request sent ${JSON.stringify(input)}.`;
  return `POST …/prune takes a JSON object: ${PRUNE_SHAPE}.`;
}

/**
 * A finished run pruned, as the guard's refusals word it, its body — strict, every key it does not take named — and a failure that is no
 * refusal, naming `wf prune`.
 */
const PRUNE: RouteWords = {
  shape: PRUNE_SHAPE,
  guard: ({ runId }) => ({
    route: `POST /api/runs/${runId}/prune`,
    does: 'prunes a run',
    forAnother: 'prune one',
    why: 'a run pruned has its worktrees removed, and its files with `artifacts`, and none of its steps can be tried again, sent round or approved',
    reach: "prune it on the board's run page",
    instead: "Prune it on the board's run page, or with `wf prune <run>`",
    shape: PRUNE_SHAPE,
  }),
  issue: () => pruneWords,
  failed: ({ runId }, said) => `POST /api/runs/${runId}/prune: ${runId} was not pruned — ${said}. Prune it with \`wf prune ${runId}\`.`,
  strict: true,
};

/** The api's words for each routed command, by its name. */
export const WORDS: Readonly<Record<string, RouteWords>> = {
  retry: RETRY,
  round: ROUND,
  approve: APPROVE,
  accept: ACCEPT,
  say: SAY,
  hold: HOLD,
  pause: PAUSE,
  resume: RESUME,
  rm: RM,
  prune: PRUNE,
};
