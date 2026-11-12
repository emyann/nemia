/**
 * The run's named actions, as the api is sent them and answers them: a run started (`RunStart`, `RunStarted`), a step tried again or a
 * loop sent round (`RunRetry`, `RunAsked`), a step approved at its gate (`RunApprove`, `RunApproved`), words said to a step's session
 * (`RunSay`, `RunSaid`), the run pinned to new revisions or its loop sent to merge its base (`RunRefresh`, `RunRefreshed`), a hold put
 * and lifted (`RunHold`, `RunHeld`), a condition routed by hand (`RunRoute`, `RunRouted`), a try's run removed (`RunRemoved`) and a
 * finished run pruned (`RunPrune`, `RunPruned`). Each body is what its endpoint decodes (run-api.ts), a 400 naming the key it refuses,
 * and what the orchestrator's typed entry takes beside the path's names (`RetryInput`, `ApproveInput`, …); each answer the keys the
 * entry answers. A run's labels are edited with the card's `LabelEdit`, answered `Labelled` (labels.ts).
 *
 * Plain Schemas of JSON, as every object of this package is: a body's shape is checked here, what it asks of a run by the entry, in its
 * words.
 */
import { Schema } from 'effect';
import { ChatSpeaker } from './nemia.ts';
import { RunDrift } from './run.ts';
import { Paused } from './server-api.ts';
import { RETRY_MODES, SAID_AFTER } from './words.ts';

/** Strings, given many times. */
const Strings = Schema.Array(Schema.String);

/** A text that is not blank: a name, an id, a label's edit. */
const NotBlank = Schema.String.check(Schema.makeFilter((text: string) => text.trim() !== ''));

/** A person's answers to the questions a step's closeout asks: the question, the options chosen, and their own words. */
const Answers = Schema.Array(Schema.Struct({ question: Schema.String, chose: Strings, own: Schema.optionalKey(Schema.String) }));

/**
 * A file handed to a run's steps (`nemia start --input <file>`), read where the start is typed and sent by its name, never its path: its
 * `text` where its bytes are UTF-8 text, else its bytes in `base64` (a picture); one of the two. Its name is a file's own, no folder in it.
 */
export const RunInput = Schema.Struct({
  name: NotBlank,
  text: Schema.optionalKey(Schema.String),
  base64: Schema.optionalKey(Schema.String),
}).annotate({ identifier: 'RunInput' });
export type RunInput = typeof RunInput.Type;

/**
 * What a start takes beside its workflow and brief, a brief's and a card's alike: each step's model for this run alone (`models`, step
 * to model, as `--model <step>=<model>` gives it), the steps gated (`gates`), a run with no worktree of its own (`noWorktree`), and the
 * files handed to its steps (`inputs`).
 */
export const startExtras = {
  models: Schema.optionalKey(Schema.Record(Schema.String, Schema.String)),
  gates: Schema.optionalKey(Schema.Array(NotBlank)),
  noWorktree: Schema.optionalKey(Schema.Boolean),
  inputs: Schema.optionalKey(Schema.Array(RunInput)),
};

/**
 * A run started, as `nemia start` starts one: the workflow, where it is read from when both the repository and your library have it,
 * the runs it waits on (`after`) and is handed as context (`context`), the inbox cards it is handed by name (`cards`), its brief, the
 * labels it is started with (`key=value`), and what `startExtras` adds.
 * An inbox card is started at its own path (`CardStart`): a `card` sent here is refused, its message naming that path.
 */
export const RunStart = Schema.Struct({
  ...startExtras,
  workflow: NotBlank,
  from: Schema.optionalKey(Schema.Literals(['repo', 'yours'])),
  after: Schema.optionalKey(Schema.Array(NotBlank)),
  context: Schema.optionalKey(Schema.Array(NotBlank)),
  cards: Schema.optionalKey(Schema.Array(NotBlank)),
  brief: Schema.optionalKey(Schema.String),
  label: Schema.optionalKey(Schema.Array(NotBlank)),
  card: Schema.optionalKey(
    Schema.Never.annotate({
      message: 'a card is started at its own path, POST /api/namespaces/:namespace/cards/:name/start, with the workflow and the brief',
    }),
  ),
}).annotate({ identifier: 'RunStart' });
export type RunStart = typeof RunStart.Type;

/**
 * What a start answers: the run's name; and what `nemia start` prints of it, where the api says it: the store's pause as it stood once
 * the run was written (`paused`), the runs handed as context that had landed (`landed`), a line for each file of its folder that still
 * writes a former spelling (`hints`), the factory's repositories and volumes left out of its mounts, being no directory (`notMounted`,
 * `notVolumes`), and the lines the command line prints of it (`lines`). Of an inbox card's start, the card, why its `queued:` line is
 * still on it (`queueLeft`), and a `repo:` the start did not take (`ignoredRepo`).
 */
export const RunStarted = Schema.Struct({
  id: Schema.String,
  card: Schema.optionalKey(Schema.String),
  queueLeft: Schema.optionalKey(Schema.String),
  ignoredRepo: Schema.optionalKey(Schema.String),
  paused: Schema.optionalKey(Paused),
  landed: Schema.optionalKey(Strings),
  hints: Schema.optionalKey(Strings),
  notMounted: Schema.optionalKey(Strings),
  notVolumes: Schema.optionalKey(Strings),
  lines: Schema.optionalKey(Strings),
}).annotate({ identifier: 'RunStarted' });
export type RunStarted = typeof RunStarted.Type;

/** What an inbox card's start answers (the Card's `start`): what a start answers (`RunStarted`), the card's name always among it. */
export const CardStarted = Schema.Struct({ ...RunStarted.fields, card: Schema.String }).annotate({ identifier: 'CardStarted' });
export type CardStarted = typeof CardStarted.Type;

/**
 * The ways a try is asked for, and the former spelling the api still takes and answers with a `hint` (`nudge`, now `continue`): the
 * orchestrator's `FORMER_MODES`.
 */
export const RETRY_ASKED_MODES = [...RETRY_MODES, 'nudge'] as const;

/**
 * Another try of a step, as `nemia retry` asks for one: its way (`mode`), the model a fresh one runs on, the words it is told, a raise of
 * its cap (`budget`), a person's `answers` to its questions; or, with `round`, another round of the loop it closes.
 */
export const RunRetry = Schema.Struct({
  mode: Schema.Literals(RETRY_ASKED_MODES),
  model: Schema.optionalKey(Schema.String),
  round: Schema.optionalKey(Schema.Boolean),
  message: Schema.optionalKey(Schema.String),
  budget: Schema.optionalKey(Schema.Finite),
  answers: Schema.optionalKey(Answers),
}).annotate({ identifier: 'RunRetry' });
export type RunRetry = typeof RunRetry.Type;

/**
 * What an ask of a try answers, taken and not yet done: the try asked for, the ask's file and whether the tick stops a blocked session
 * first; or, of a round, the looping step and the round. `hint` names the spelling to send where the body said a former one.
 */
export const RunAsked = Schema.Struct({
  try: Schema.optionalKey(Schema.Finite),
  file: Schema.String,
  stopFirst: Schema.optionalKey(Schema.Boolean),
  step: Schema.optionalKey(Schema.String),
  round: Schema.optionalKey(Schema.Finite),
  budget: Schema.optionalKey(Schema.Finite),
  hint: Schema.optionalKey(Schema.String),
}).annotate({ identifier: 'RunAsked' });
export type RunAsked = typeof RunAsked.Type;

/** An approval of a step at its gate, as `nemia approve` makes one: the words with it, the answers to its questions, the caps it sets. */
export const RunApprove = Schema.Struct({
  message: Schema.optionalKey(Schema.String),
  answers: Schema.optionalKey(Answers),
  budgets: Schema.optionalKey(Schema.Array(Schema.Struct({ step: Schema.String, usd: Schema.Finite }))),
}).annotate({ identifier: 'RunApprove' });
export type RunApprove = typeof RunApprove.Type;

/**
 * What an approval answers: the step, the try approved, when, the words, and the approval's file; and, as `nemia approve` prints it,
 * whether it ended a loop out of rounds (`loop`), what the next tick files because of it (`next`), and each cap it set (`caps`), above
 * the step's own budget in the workflow or not.
 */
export const RunApproved = Schema.Struct({
  step: Schema.String,
  try: Schema.Finite,
  at: Schema.String,
  message: Schema.NullOr(Schema.String),
  file: Schema.String,
  loop: Schema.optionalKey(Schema.Boolean),
  next: Schema.optionalKey(Schema.Literals(['step', 'waiting', 'nothing'])),
  caps: Schema.optionalKey(
    Schema.Array(Schema.Struct({ step: Schema.String, usd: Schema.Finite, above: Schema.Boolean, workflow: Schema.NullOr(Schema.Finite) })),
  ),
}).annotate({ identifier: 'RunApproved' });
export type RunApproved = typeof RunApproved.Type;

/**
 * Words said to a step's running session, as `nemia say` says them, and who wrote them (`from`): none is the caller the request is —
 * the person with no session's token, a session by its own.
 */
export const RunSay = Schema.Struct({ text: Schema.String, from: Schema.optionalKey(ChatSpeaker) }).annotate({
  identifier: 'RunSay',
});
export type RunSay = typeof RunSay.Type;

/**
 * What the session's harness took and the engine journalled: when, on which attempt, the words as said (`text`, an agent's in its
 * frame), and what they came after; where an agent wrote them, which (`from`) and its words without the frame (`words`). Or, for a step
 * not filed yet, the words kept for its first try and not delivered (`kept: true`): when they were kept, its first attempt, and nothing
 * they came after.
 */
export const RunSaid = Schema.Struct({
  at: Schema.String,
  attempt: Schema.Finite,
  text: Schema.String,
  after: Schema.NullOr(Schema.Struct({ kind: Schema.Literals(SAID_AFTER), id: Schema.String })),
  kept: Schema.optionalKey(Schema.Literal(true)),
  from: Schema.optionalKey(ChatSpeaker),
  words: Schema.optionalKey(Schema.String),
  try: Schema.optionalKey(Schema.Finite),
  taskId: Schema.optionalKey(Schema.NullOr(Schema.String)),
}).annotate({ identifier: 'RunSaid' });
export type RunSaid = typeof RunSaid.Type;

/** The run pinned to the new revisions, as `nemia refresh` pins it; with `base`, its loop's work sent to merge its base (`step`). */
export const RunRefresh = Schema.Struct({
  step: Schema.optionalKey(Schema.String),
  base: Schema.optionalKey(Schema.Boolean),
}).annotate({ identifier: 'RunRefresh' });
export type RunRefresh = typeof RunRefresh.Type;

/**
 * What a refresh answers: the kinds the run was behind (`drift`); or, of a merge of the base, the looping step, the branch merged and onto
 * what, the commit, the round and the ask's file.
 */
export const RunRefreshed = Schema.Struct({
  drift: Schema.optionalKey(Schema.Array(RunDrift)),
  step: Schema.optionalKey(Schema.String),
  target: Schema.optionalKey(Schema.String),
  onto: Schema.optionalKey(Schema.String),
  sha: Schema.optionalKey(Schema.String),
  round: Schema.optionalKey(Schema.Finite),
  file: Schema.optionalKey(Schema.String),
  said: Schema.optionalKey(Schema.String),
}).annotate({ identifier: 'RunRefreshed' });
export type RunRefreshed = typeof RunRefreshed.Type;

/** A run held until other runs land, as `nemia hold <run> --until <run>…` holds it: the runs, why, and who holds it. */
export const RunHold = Schema.Struct({
  until: Schema.optionalKey(Strings),
  why: Schema.optionalKey(Schema.String),
  by: Schema.optionalKey(Schema.String),
}).annotate({ identifier: 'RunHold' });
export type RunHold = typeof RunHold.Type;

/** A person's hold on a run, as written: when, the runs it waits on to land, why and by whom. */
export const RunHoldWritten = Schema.Struct({
  at: Schema.String,
  until: Strings,
  why: Schema.optionalKey(Schema.String),
  by: Schema.optionalKey(Schema.String),
}).annotate({ identifier: 'RunHoldWritten' });
export type RunHoldWritten = typeof RunHoldWritten.Type;

/** What a hold put or lifted answers: the run, whether it was lifted, and the hold. */
export const RunHeld = Schema.Struct({ id: Schema.String, lifted: Schema.Boolean, hold: RunHoldWritten }).annotate({
  identifier: 'RunHeld',
});
export type RunHeld = typeof RunHeld.Type;

/** A task of a run's that a cancel asked to stop: its step's name and the engine's task. */
const CancelStopped = Schema.Struct({ name: Schema.String, taskId: Schema.String });

/**
 * What a cancel did (`CancelPlan`, the orchestrator's): `cancel`, the run cancelled now and what was asked to stop; `already-cancelled`,
 * when it was cancelled before; `finished`, a run already over, whose status it says.
 */
export const RunCancelPlan = Schema.Union([
  Schema.Struct({ kind: Schema.Literal('cancel'), stop: Schema.Array(CancelStopped) }),
  Schema.Struct({ kind: Schema.Literal('already-cancelled'), at: Schema.String, stop: Schema.Array(CancelStopped) }),
  Schema.Struct({ kind: Schema.Literal('finished'), status: Schema.Literals(['succeeded', 'failed']) }),
]);
export type RunCancelPlan = typeof RunCancelPlan.Type;

/** What a cancel answers: the run and the plan it followed (`nemia cancel`). */
export const RunCancelled = Schema.Struct({ id: Schema.String, plan: RunCancelPlan }).annotate({ identifier: 'RunCancelled' });
export type RunCancelled = typeof RunCancelled.Type;

/** A condition routed by hand, as `nemia route` routes one: the route, one of the condition's `routes:`. */
export const RunRoute = Schema.Struct({ route: Schema.String }).annotate({ identifier: 'RunRoute' });
export type RunRoute = typeof RunRoute.Type;

/**
 * What a route answers: the condition, the try of it the route is for, the route, when it was written and the file it is in. The next
 * pass files the steps whose `when:` names it.
 */
export const RunRouted = Schema.Struct({
  step: Schema.String,
  try: Schema.Finite,
  route: Schema.String,
  at: Schema.String,
  file: Schema.String,
}).annotate({ identifier: 'RunRouted' });
export type RunRouted = typeof RunRouted.Type;

/** What the engine forgot of a removed run's tasks, and what waits to be forgotten until it settles (`EngineForgetting`). */
const EngineForgetting = Schema.Struct({
  forgotten: Strings,
  waiting: Strings,
  why: Strings,
  refused: Strings,
  refusedWhy: Strings,
  left: Strings,
  refusal: Schema.optionalKey(Schema.String),
  journalBytes: Schema.Finite,
  feedLines: Schema.Finite,
  marker: Schema.optionalKey(Schema.String),
});

/**
 * What a removal answers: the run, that it was removed, what the engine forgot of its tasks (null with none), and the line `nemia rm`
 * prints of it (`line`): what it removed, handed off and left.
 */
export const RunRemoved = Schema.Struct({
  id: Schema.String,
  removed: Schema.Boolean,
  engine: Schema.NullOr(EngineForgetting),
  line: Schema.optionalKey(Schema.String),
}).annotate({ identifier: 'RunRemoved' });
export type RunRemoved = typeof RunRemoved.Type;

/**
 * A finished run pruned, as `nemia prune <run> --yes` prunes it: its files with `artifacts`, a run nobody merged with `unmerged`; with
 * `preview`, judged and listed with what it would free, and nothing removed, as `nemia prune` lists it before it asks.
 */
export const RunPrune = Schema.Struct({
  unmerged: Schema.optionalKey(Schema.Boolean),
  artifacts: Schema.optionalKey(Schema.Boolean),
  preview: Schema.optionalKey(Schema.Boolean),
}).annotate({ identifier: 'RunPrune' });
export type RunPrune = typeof RunPrune.Type;

/** A folder and the bytes it held. */
const Sized = Schema.Struct({ path: Schema.String, bytes: Schema.Finite });

/**
 * What a prune answers: the run, that it was pruned, `nemia prune`'s lines, the worktrees removed, its files where removed (null where
 * not), and what was left, each with why: git's word and its fix, a folder that did not read, or the files a worktree holds; and of a
 * preview, the bytes a prune would free (`bytes`).
 */
export const RunPruned = Schema.Struct({
  id: Schema.String,
  pruned: Schema.Boolean,
  lines: Strings,
  worktrees: Schema.Array(Sized),
  artifacts: Schema.NullOr(Sized),
  left: Schema.Array(
    Schema.Union([
      Schema.Struct({ path: Schema.String, git: Schema.String, fix: Schema.optionalKey(Schema.String) }),
      Schema.Struct({ path: Schema.String, unread: Schema.String }),
      Schema.Struct({ path: Schema.String, files: Schema.String }),
    ]),
  ),
  bytes: Schema.optionalKey(Schema.Finite),
}).annotate({ identifier: 'RunPruned' });
export type RunPruned = typeof RunPruned.Type;
