/** `nemia say`, an entry of the command table: words to a step's session, journalled on its task, or kept for its first try (`sayRun`). */
import { renamed } from '../command/requests.verb.ts';
import { Effect, Schema } from 'effect';
import { RunSay, type SaidAfter } from 'objects';
import type { Speaker } from '../chat/chat.ts';
import { saidLines, type Said } from './say.ts';
import { sayRun } from './say.verb.ts';
import type { Command } from '../command/entry.verb.ts';

/** The run's id and the step's name, as `nemia say` takes them first. */
const RUN_STEP = [
  { key: 'runId', takes: 'required', kind: 'name' },
  { key: 'step', takes: 'required', kind: 'name' },
] as const;

/** Who calls: the person, with no session's token, or a session's agent by its token (`Caller`, `sessionCaller`). */
const SayCaller = Schema.Union([
  Schema.Struct({ kind: Schema.Literal('person') }),
  Schema.Struct({ kind: Schema.Literal('agent'), agent: Schema.String, factory: Schema.NullOr(Schema.String) }),
]);

/**
 * What `nemia say` takes: the run, the step, the words and who they say they are from as the api is sent them (`objects`' `RunSay`),
 * and the caller the request is, which the api reads off the request's token and the CLI off `WF_SESSION_TOKEN` — required, so no path
 * takes the person by default.
 */
export const SayInput = Schema.Struct({ runId: Schema.String, step: Schema.String, caller: SayCaller, ...RunSay.fields });
export type SayInput = typeof SayInput.Type;

/** The engine's `said` entry as the answer says it: when, on which attempt, the words, and what they came after (null where none). */
const pickSaid = ({ at, attempt, text, after }: Said) => ({ at, attempt, text, after: after ?? null });

/**
 * `nemia say`: words to a step's session, journalled on its task, and printed as `nemia decide` prints them; or, to a step not filed yet,
 * kept for its first try (`kept: true`, on no task, `taskId: null`, the attempt its first). It takes every word after the
 * step as one message, so an unquoted sentence is one; empty words are the engine's to refuse.
 */
export const SAY: Command<
  {
    at: string;
    attempt: number;
    text: string;
    after: { kind: SaidAfter; id: string } | null;
    try: number;
    taskId: string | null;
    kept?: true;
    from?: Speaker;
    words?: string;
  },
  SayInput
> = {
  name: 'say',
  served: [{ endpoint: 'runs.say', request: renamed({ runId: 'name' }, ['caller']) }],
  usage: '<runId> <step> [--as <name>] "<words>"',
  help: [
    "tell a step's running session something, through its harness: the",
    "engine journals the words on the step's task, nemia ls notes the step",
    'said to, and nemia decide prints them under it. A try that continues',
    'the session is handed them again, as ## Said to your session.',
    'Words to a step not filed yet (waiting on --after, a hold or an',
    'earlier step) are kept, not delivered: its first try is handed them,',
    'as ## Said before you started, and no try after it.',
    "Words from a session its run filed are its agent's, by its token",
    '(WF_SESSION_TOKEN); an agent with none says --as <name> before its',
    "words, a name the person allowed with nemia chat allow. An agent's",
    'words reach the step under its name, never as yours',
  ],
  spec: {
    positionals: [...RUN_STEP, { key: 'text', takes: 'rest', kind: 'text' }],
    flags: [
      {
        flag: '--as',
        kind: 'name',
        key: 'as',
        takes:
          '--as takes the name an agent with no session token speaks under, one the person allowed: nemia say <runId> <step> --as <name> "<words>".',
      },
    ],
    unknown: (arg) => `nemia say does not take ${arg}.`,
  },
  writes: true,
  class: 'act',
  only: { side: 'cli', why: "the api serves it as the Run's `say` of `objects`' Api, calling this handler" },
  input: SayInput,
  handler: Effect.fnUntraced(function* ({ runId, step, text: given, caller, from }: SayInput) {
    const told = yield* sayRun(runId, step, given, from === undefined ? { caller } : { caller, from });
    const answer =
      'kept' in told
        ? { ...told.kept, attempt: 1, after: null, try: told.try, taskId: null, kept: true as const }
        : { ...pickSaid(told.said), try: told.try, taskId: told.taskId };
    return told.from.kind === 'agent' ? { ...answer, from: told.from, words: given } : answer;
  }),
  print({ at, attempt, text, try: tryNo, taskId, kept }, { runId, step }) {
    return [
      kept
        ? `${runId}  kept for ${step}'s first try, at ${at} — not delivered: no session of ${step} runs yet, and its first try's brief carries the words`
        : `${runId}  said to ${step}, try ${tryNo}${attempt > 1 ? `, attempt ${attempt}` : ''}, at ${at} — journalled on ${taskId}: nemia decide ${runId} prints it under the step`,
      ...saidLines([{ at, attempt, text, try: tryNo }])
        .slice(1)
        .flatMap((l) => l.split('\n'))
        .map((line) => `   ${line}`),
    ];
  },
};
