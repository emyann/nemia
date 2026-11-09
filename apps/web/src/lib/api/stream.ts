/**
 * The one decoder of a followed stream's events, which a step's conversation (`steps.ts`) and her chat (`chat.ts`) both read theirs
 * with, and the one schema of the `unreadable` event both streams send. A sibling that imports no sibling but the reads every file
 * shares.
 */
import { Schema } from 'effect';
import { decodes } from './decodes.ts';
import { decoded, UnreadAnswer } from './read.ts';

/** What a stream's `unreadable` event says: why the api could not read it, and whether it reads it again on its own beat. */
export type StreamUnreadable = { error: string; retrying: boolean };

/** Decodes a `StreamUnreadable`. */
export const UnreadableSchema = decodes<StreamUnreadable>()(Schema.Struct({ error: Schema.String, retrying: Schema.Boolean }));

/**
 * The data `data` of a stream event named `event`, decoded by its schema in `schemas`; an `UnreadAnswer` for data that is no JSON or not
 * of the event's shape, its `route` the event's name and its message naming the key that is wrong, so the follower says it rather than
 * drop it.
 */
export function streamDataOf<D, K extends keyof D & string>(
  schemas: { readonly [E in keyof D]: Schema.Decoder<D[E]> },
  event: K,
  data: string,
): D[K] | UnreadAnswer {
  let parsed: unknown;
  try {
    parsed = JSON.parse(data);
  } catch {
    return new UnreadAnswer(
      event,
      `${event} sent what this board does not read: its data is no JSON. The board and the api were built apart: restart the api (npm run dev) and rebuild the board (npm run build), then reload the page.`,
    );
  }
  try {
    return decoded(event, schemas[event], parsed);
  } catch (error) {
    if (error instanceof UnreadAnswer) return error;
    throw error;
  }
}
