/**
 * What a judgment is the judgment OF, as a key: the pinned model, the question's words and options, and the state.
 *
 * Plain code, no Effect. The key is a sha256 over exact JSON, not canonical JSON: the order of a question's options and
 * of the state's fields reaches the model as written, so two orders are two keys. The cost is a question paid for twice,
 * never an answer re-used for words it was not given. The question's id is not in the key: ids are never sent.
 */
import crypto from 'node:crypto';
import type { EntryType, Question } from '@typesafe-ai/sdk';

/** A refusal: a bad argument, a record that cannot be read. Not weather; the message says what to do. */
export class Refusal extends Error {
  readonly exitCode = 2;
}

export const refuse = (message: string): never => {
  throw new Refusal(message);
};

/** The shape of the key. A change to what goes into it is a new version, so no old record is read under new rules. */
export const KEY_VERSION = 1;

/** State as the SDK takes it: text, a JSON object or array. */
export type State = Exclude<EntryType, null>;

export const sha256 = (text: string) => crypto.createHash('sha256').update(text).digest('hex');

/**
 * A model id that names one version, such as `jev-1.13.0`. An alias — `jev-latest`, `jev-preview`, anything not ending in
 * a version number — moves under a threshold without a word, so it is refused.
 */
export const pinnedModel = (model: unknown): string => {
  if (typeof model !== 'string' || !/^[a-z][\w-]*-\d+(?:\.\d+)+$/.test(model)) {
    refuse(
      `judge: the model must be pinned to one version, such as \`jev-1.13.0\`; ${JSON.stringify(model)} is not. ` +
        'An alias such as `jev-latest` moves under your thresholds without a word.',
    );
  }
  return model as string;
};

/** The state's hash. JSON that does not survive a round trip — `undefined`, a function, a cycle — is refused. */
export const stateHash = (state: State): string => {
  let text: string | undefined;
  try {
    text = JSON.stringify(state);
  } catch (e) {
    refuse(`judge: the state is not JSON (${(e as Error).message}); pass text, an object or an array.`);
  }
  if (text === undefined || state === null) refuse('judge: the state is empty; pass text, an object or an array.');
  return `sha256:${sha256(text!)}`;
};

/** The question as it is keyed: its type, words and options, in that order whatever order the caller built it in. */
export const questionOf = (q: Question) => ({ type: q.type, instructions: q.instructions ?? null, criteria: q.criteria ?? null });

export const keyOf = (model: string, question: Question, state: State): string =>
  sha256(JSON.stringify({ v: KEY_VERSION, model, question: questionOf(question), state: stateHash(state) }));
