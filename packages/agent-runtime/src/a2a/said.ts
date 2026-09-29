/**
 * What the remote harness says, told apart from what another party said: the errors it throws in its own words, the A2A errors that
 * are an agent's refusal of a send, and the words of any error, quoted to `WORDS_QUOTE` characters when they are not the runtime's.
 */
import {
  ContentTypeNotSupportedError,
  ExtensionSupportRequiredError,
  RequestMalformedError,
  TaskNotFoundError,
  UnsupportedOperationError,
  VersionNotSupportedError,
} from '@a2a-js/sdk/errors';
import { quote, WORDS_QUOTE } from '../core/index.ts';

/** The agent answered a request without taking it: nothing it was asked was done. */
class Untaken extends Error {}

/** The agent refused a request's authentication (HTTP 401 or 403). */
export class AuthRefused extends Untaken {}

/** The agent answered with a redirect, which is not followed. */
export class Redirected extends Untaken {}

/** A spawn that nothing started, in words: the attempt ends `unstartable`. */
export class Refusal extends Error {}

/** A request the agent did not answer within its bound: whether it was taken is not known. */
export class Late extends Error {}

/** A send whose answer was never recorded, in the runtime's own words: whether the agent made a Task of it is not known. */
export class Doubt extends Error {}

/** An A2A error an agent answers before it has done anything with a message: the send was refused, not lost. */
const REFUSALS = [
  ContentTypeNotSupportedError,
  ExtensionSupportRequiredError,
  RequestMalformedError,
  UnsupportedOperationError,
  VersionNotSupportedError,
  TaskNotFoundError,
];

export const untaken = (e: unknown): boolean => e instanceof Untaken || (e instanceof Error && e.cause instanceof Untaken);
export const late = (e: unknown): boolean => e instanceof Late || (e instanceof Error && e.cause instanceof Late);
export const sendRefused = (e: unknown): boolean => untaken(e) || REFUSALS.some((E) => e instanceof E);

export const messageOf = (e: unknown): string => (e instanceof Error ? e.message : String(e));

/** What `e` says: whole when the runtime said it, else another party's words, quoted to `WORDS_QUOTE` characters. */
export const wordsOf = (e: unknown): string =>
  untaken(e) || late(e) || e instanceof Doubt ? messageOf(e) : quote(messageOf(e), WORDS_QUOTE);
