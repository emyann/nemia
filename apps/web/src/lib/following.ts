/**
 * A step's conversation as a page holds it, and everything about following it that is pure, so a node test proves it without a browser:
 * the followed state (`Following`), what each of the stream's events does to it (`changed`, `stepFollower`, `followStep`), and the
 * cursor a first read is followed from (`followedFrom`).
 *
 * The transport under it — the one EventSource, the frame's worth merged at once, the grace before a close, and the
 * `unreadable` / `readable` / `open` / `error` protocol — is `lib/follow.ts`, which her chat runs on too.
 *
 * Beside the effect in `lib/useStepTranscript.ts`.
 */
import { streamDataOf, type StreamPartial, type TranscriptEvent } from './api/steps.ts';
import { follow, type Followed, type Follower, type Frames, type StreamLike } from './follow.ts';
import { mergeEvents } from './transcript.ts';

/**
 * A step's conversation as a page holds it: the events so far, the message being written (`partial`: its text block's key and its text so
 * far), whether more may come, whether the api pushes it as it is written (`streamed`), whether its first read is in flight (`loading`),
 * why it could not be read at all, if it could not, and why no live stream of it can be had while the api reads it again (`retrying`).
 */
export type Following = Followed & {
  events: TranscriptEvent[];
  partial: { key: string; text: string } | null;
  streamed: boolean;
  loading: boolean;
};

/** What a page holds of a conversation before it is read: nothing, being read when there is one (`loading`). */
export const unread = (loading: boolean): Following => ({
  events: [],
  partial: null,
  live: false,
  streamed: false,
  loading,
  error: null,
  retrying: null,
});

/**
 * What one event of the stream does to the conversation, in the order they came: whole events, a piece of a message, a move, or whether
 * the api pushes the session as it is written.
 */
type Change =
  | { kind: 'events'; events: TranscriptEvent[] }
  | ({ kind: 'partial' } & StreamPartial)
  | { kind: 'moved' }
  | { kind: 'streamed'; streamed: boolean };

/** A whole message of the session's own: what replaces the message being written. */
const wholeText = (event: TranscriptEvent) => event.role === 'assistant' && event.kind === 'text';

/**
 * `s` after the change `c`, `closed` holding each text block written whole: whole events merged in, the message being written dropped, and
 * its block closed, once one of them is the session's own text; a piece added to the message of its block, or begun anew for another
 * block, and the message dropped and its block closed at its `last`; a piece of a closed block ignored; a move to another attempt or
 * task (`moved`) starts the conversation afresh, its history to come; and `streamed` says whether the api pushes the session.
 */
export function changed(s: Following, c: Change, closed: Set<string>): Following {
  if (c.kind === 'streamed') return { ...s, streamed: c.streamed };
  if (c.kind === 'moved') return { ...s, events: [], partial: null };
  if (c.kind === 'events') {
    const whole = c.events.some(wholeText);
    if (whole && s.partial) closed.add(s.partial.key);
    return { ...s, events: mergeEvents(s.events, c.events), partial: whole ? null : s.partial };
  }
  if (closed.has(c.key)) return s;
  if (c.last) {
    closed.add(c.key);
    return { ...s, partial: null };
  }
  return { ...s, partial: { key: c.key, text: s.partial?.key === c.key ? s.partial.text + c.delta : c.delta } };
}

/**
 * The cursor a step's conversation is followed from after its first read (`first`), or null where it is read that once: a task that is
 * not live, unless the step waits on a person (`waiting`) and its next turn is to come; and a read that gave no cursor.
 */
export const followedFrom = (first: { live: boolean; cursor: string | null }, waiting: boolean): string | null =>
  first.live || waiting ? first.cursor : null;

/**
 * What a step's stream means, for `follow`: its events decoded by their schemas (`streamDataOf`), each change taken as `changed` says
 * with the blocks this following has seen written whole, consecutive whole events joined as they queue, `settled` the end, and a
 * following that ends dropping the message being written. A following of its own, since the blocks it closes are its own.
 */
const stepFollower = (): Follower<Following, Change> => {
  const closed = new Set<string>();
  const one = <T>(got: T | null | undefined, of: (said: T) => Change): Change[] => (got ? [of(got)] : []);
  return {
    reads: {
      transcript: (m) => one(streamDataOf('transcript', m.data), (event) => ({ kind: 'events', events: [event] })),
      partial: (m) => one(streamDataOf('partial', m.data), (piece) => ({ kind: 'partial', ...piece })),
      moved: (m) => one(streamDataOf('moved', m.data), () => ({ kind: 'moved' })),
      following: (m) => one(streamDataOf('following', m.data), (said) => ({ kind: 'streamed', streamed: said.streamed })),
    },
    over: ['settled'],
    fold: (s, c) => changed(s, c, closed),
    joined: (last, next) => {
      if (last.kind !== 'events' || next.kind !== 'events') return false;
      last.events.push(...next.events);
      return true;
    },
    ending: (s) => ({ ...s, partial: null }),
    opened: (s) => s,
    unreadable: (m) => streamDataOf('unreadable', m.data) ?? null,
    words: {
      unread: 'The conversation could not be read.',
      refused: 'The api refused to follow this conversation any further. Reload the page to read it again.',
    },
  };
};

/** A step's conversation followed on `stream`, each change written through `update` (`follow`, `stepFollower`). */
export const followStep = (stream: StreamLike, update: (change: (s: Following) => Following) => void, frames: Frames): (() => void) =>
  follow(stream, stepFollower(), update, frames);
