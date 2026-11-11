/** `nemia say`, an entry of the command table: words to a step's session, journalled on its task (`sayRun`). */
import { Effect, Schema } from 'effect';
import { RunSay, type SaidAfter } from 'objects';
import { saidLines } from './say.ts';
import { sayRun } from './say.verb.ts';
import type { Command } from '../command/entry.verb.ts';

/** The run's id and the step's name, as `nemia say` takes them first. */
const RUN_STEP = [
  { key: 'runId', takes: 'required', kind: 'name' },
  { key: 'step', takes: 'required', kind: 'name' },
] as const;

/** What `nemia say` takes: the run, the step, and the words as the api is sent them (`objects`' `RunSay`). */
export const SayInput = Schema.Struct({ runId: Schema.String, step: Schema.String, ...RunSay.fields });
export type SayInput = typeof SayInput.Type;

/**
 * `nemia say`: words to a step's session, journalled on its task, and printed as `nemia decide` prints them. It takes every word after the
 * step as one message, so an unquoted sentence is one; empty words are the engine's to refuse.
 */
export const SAY: Command<
  {
    at: string;
    attempt: number;
    text: string;
    after: { kind: SaidAfter; id: string } | null;
    try: number;
    taskId: string;
  },
  SayInput
> = {
  name: 'say',
  served: [{ endpoint: 'runs.say' }],
  usage: '<runId> <step> "<words>"',
  help: [
    "tell a step's running session something, through its harness: the",
    "engine journals the words on the step's task, nemia ls notes the step",
    'said to, and nemia decide prints them under it. A try that continues',
    'the session is handed them again, as ## Said to your session',
  ],
  spec: {
    positionals: [...RUN_STEP, { key: 'text', takes: 'rest', kind: 'text' }],
    flags: [],
    unknown: (arg) => `nemia say does not take ${arg}.`,
  },
  writes: true,
  class: 'act',
  only: { side: 'cli', why: "the api serves it as the Run's `say` of `objects`' Api, calling this handler" },
  input: SayInput,
  handler: Effect.fnUntraced(function* ({ runId, step, text: words }: SayInput) {
    const told = yield* sayRun(runId, step, words);
    const { at, attempt, text, after } = told.said;
    return { at, attempt, text, after: after ?? null, try: told.try, taskId: told.taskId };
  }),
  print({ at, attempt, text, try: tryNo, taskId }, { runId, step }) {
    return [
      `${runId}  said to ${step}, try ${tryNo}${attempt > 1 ? `, attempt ${attempt}` : ''}, at ${at} — journalled on ${taskId}: nemia decide ${runId} prints it under the step`,
      ...saidLines([{ at, attempt, text, try: tryNo }])
        .slice(1)
        .flatMap((l) => l.split('\n'))
        .map((line) => `   ${line}`),
    ];
  },
};
