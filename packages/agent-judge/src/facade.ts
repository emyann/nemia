/**
 * The judge, without Effect.
 *
 * Effect is how this package is written, not how it is used: everything here takes and returns plain values and
 * Promises. The Effect API is at `agent-judge/effect` for anyone who wants its layers.
 *
 *   const j = judge({ model: 'jev-1.13.0', record: dir });
 *   const { answers } = await j.ask(state, { web: noul('…', { true: '…', false: '…' }) });
 *   switch (decide(answers.web, { yes: 0.8, no: 0.2 })) { case 'yes': …; case 'no': …; case 'unsure': … }
 *
 * `ask` rejects only on a bug or a bad argument — a replay with no record, a record it cannot read or write, an alias for
 * a model — with an `exitCode` of 2 and a message that says what to do. Weather — no key, a refusal, a rate limit, a
 * timeout — is a fact on the record, and reads as `unsure`.
 */
import { Effect, Layer } from 'effect';
import type { Fetch, Questions } from '@typesafe-ai/sdk';
import { Asker, Judge, recorded, replay, type Asked, type AskOptions } from './judge.ts';
import { pinnedModel, refuse, Refusal, type State } from './key.ts';

export { choice, noul, score } from '@typesafe-ai/sdk';
export type { ChoiceQuestion, NoulQuestion, Question, Questions, ScoreQuestion, Usage } from '@typesafe-ai/sdk';
export {
  decide,
  why,
  FAILURE_KINDS,
  type Answered,
  type Failed,
  type FailureKind,
  type Judgment,
  type Thresholds,
  type Verdict,
} from './decide.ts';
export type { Asked, Answers, AskOptions } from './judge.ts';
export type { State } from './key.ts';

export type JudgeOptions = {
  /** A pinned model id, such as `jev-1.13.0`. An alias is refused. */
  readonly model: string;
  /** The record's directory. There is no default: the caller says where its facts live. */
  readonly record: string;
  /** `replay` answers from the record alone and never asks: for tests. `recorded` otherwise. */
  readonly mode?: 'recorded' | 'replay';
  /** Where the key is read from: the process's environment unless a test hands it another. */
  readonly env?: Readonly<Record<string, string | undefined>>;
  /** A `fetch` for tests. */
  readonly fetch?: Fetch;
  /** One attempt, in ms. Default 5000. */
  readonly attemptMs?: number;
  /** Every attempt and the waits between them, in ms. Default 20000. */
  readonly deadlineMs?: number;
  /** The SDK's retries after the first attempt. Default 2. */
  readonly retries?: number;
};

const OPTIONS = ['model', 'record', 'mode', 'env', 'fetch', 'attemptMs', 'deadlineMs', 'retries'];

export type Judgement = {
  readonly model: string;
  readonly ask: <const Q extends Questions>(state: State, questions: Q, options?: AskOptions) => Promise<Asked<Q>>;
};

export const judge = (options: JudgeOptions): Judgement => {
  const unknown = Object.keys(options ?? {}).filter((k) => !OPTIONS.includes(k));
  if (unknown.length > 0) {
    refuse(
      `judge: unknown option ${unknown.map((k) => `\`${k}\``).join(', ')}. ` +
        (unknown.includes('apiKey')
          ? 'The key is read from TYPESAFE_API_KEY in the environment, and never passed.'
          : `It takes ${OPTIONS.join(', ')}.`),
    );
  }
  const model = pinnedModel(options.model);
  if (typeof options.record !== 'string' || options.record === '')
    refuse('judge: `record` names the directory its facts are kept in; there is no default.');
  const { record, mode = 'recorded' } = options;
  if (mode !== 'recorded' && mode !== 'replay') refuse(`judge: \`mode\` is recorded or replay, not ${JSON.stringify(mode)}.`);
  const layer = mode === 'replay' ? replay({ model, record }) : recorded({ model, record }).pipe(Layer.provide(Asker.live(options)));
  return {
    model,
    ask: async (state, questions, opts) => {
      const asking = Effect.gen(function* () {
        const j = yield* Judge;
        return yield* j.ask(state, questions, opts);
      });
      const result = await Effect.runPromise(Effect.result(asking.pipe(Effect.provide(layer))));
      if (result._tag === 'Failure') throw new Refusal(result.failure.message);
      return result.success;
    },
  };
};

const KEY = 'TYPESAFE_API_KEY';

/**
 * Whether the judge can ask here: a key is in the environment. It builds no client and makes no request; it does not
 * say whether the key is good. Without one, every question reads `unsure`.
 */
export const available = (env: Readonly<Record<string, string | undefined>> = process.env): boolean => Boolean(env[KEY]?.trim());

/** `ready`, or `off` and why, as `judge status` prints it. */
export const status = (env: Readonly<Record<string, string | undefined>> = process.env): string =>
  available(env) ? 'ready' : `off: no ${KEY} in the environment`;
