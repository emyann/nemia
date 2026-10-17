/**
 * Nemia's chat as the panel holds it, and everything about it that is pure, so a node test proves it without a browser: the followed
 * state (`ChatFollowed`), the merge of the stream's events by their id (`mergeChatEvents`), what each of its frames does
 * (`changedChat`, `followChat`), the one translation of the api's presence and her level into the board's (`presenceOf`), the map from
 * her step's state to a trace line's (`traceStatusOf`), her consecutive steps folded into a turn (`foldChat`), the links read out of
 * her words (`linksOf`), how an ask of hers is drawn (`drawnAsk`) and what is left to answer of one of several questions
 * (`askLeft`, `askAnswered`, `asksOpen`), which of them the composer's own words answer (`askInWords`, `wordsAnswer`), and
 * the words the read-back controls say.
 *
 * Beside the effect in `lib/useNemiaChat.ts`, as `lib/following.ts` sits beside `lib/useStepTranscript.ts`.
 */
import type { AskPick, AskQuestion, ChatEvent, ChatPresence } from './api/chat.ts';
import { chatDataOf } from './api/chat.ts';
import { duration } from './canvas.ts';
import { END_GRACE_MS, type Frames, type StreamLike } from './following.ts';
import type { Presence } from './presence.ts';
import type { Level } from './api/nemia.ts';
import type { TraceStatus } from '@/components/ui/trace';

/** One step of hers, as her chat gives it. */
export type ChatStep = Extract<ChatEvent, { kind: 'step' }>;

/** Her message, the person's, or the keeper's marker. */
export type ChatMessage = Extract<ChatEvent, { kind: 'message' }>;

/** A question of hers or a proposal: a call of hers waiting on the person, until they answer it. */
export type ChatAsk = Extract<ChatEvent, { kind: 'question' | 'proposal' }>;

/** How an ask is drawn: as the action buttons of a proposal, as the radio form of one question, or as the flow of several. */
export type AskDrawn = 'actions' | 'form' | 'many';

/**
 * How the ask `questions` is drawn, the canvas's three boards: `many` for several questions (board 7b, a tab for each and a recap);
 * `actions` for one question whose every choice carries no explanation, which the proposal's buttons say whole (boards 5 and 6); and
 * `form` for one question whose choices explain themselves, which the radio form draws (board 7). Pure, and the same rule the package
 * reads to say whether an ask is a proposal.
 */
export const drawnAsk = (questions: readonly AskQuestion[]): AskDrawn =>
  questions.length > 1 ? 'many' : (questions[0]?.options ?? []).every((option) => option.description.trim() === '') ? 'actions' : 'form';

/** Whether the question `question` is answered by `pick`: a label chosen, or words of their own with something in them. */
export const askAnswered = (pick: AskPick | undefined): boolean =>
  pick === undefined ? false : pick.words === undefined ? (pick.labels ?? []).length > 0 : pick.words.trim() !== '';

/** What the recap says of how many are left: `2 not answered` while any is, `All answered` once none is. */
export const askLeft = (open: number): string => (open > 0 ? `${open} not answered` : 'All answered');

/** The asks of `events` the person has not answered: what the composer's words and the panel's cue are about. */
export const asksOpen = (events: readonly ChatEvent[]): ChatAsk[] =>
  events.filter((event): event is ChatAsk => (event.kind === 'question' || event.kind === 'proposal') && event.chose === undefined);

/**
 * The ask of hers the composer's own words answer, where there is one: exactly one ask waits on the person and it is drawn as the form
 * (board 7), one question whose choices explain themselves. A proposal's choices are said whole by its own buttons and take no words
 * of the person's, and several questions are answered in their own flow, each with a row for their words; so for either, and for two
 * asks at once — where the words would name no question — the composer is what it always is, and this is `undefined`. Pure.
 */
export const askInWords = (events: readonly ChatEvent[]): ChatAsk | undefined => {
  const open = asksOpen(events);
  const one = open.length === 1 ? open[0] : undefined;
  return one !== undefined && drawnAsk(one.questions) === 'form' ? one : undefined;
};

/** The person's own words from the composer as the answer to the one question `ask` waits on: the pick its held call takes. Pure. */
export const wordsAnswer = (ask: ChatAsk, text: string): AskPick[] => [{ question: ask.questions[0]?.question ?? '', words: text }];

/** `EventSource.CLOSED`, named here so a stream is followed where there is no EventSource. */
const CLOSED = 2;

/** A trace line's state for each state one of her steps can be in: done draws plain, so it takes none. */
const TRACE_STATUS: Record<ChatStep['state'], TraceStatus | undefined> = {
  done: undefined,
  running: 'running',
  error: 'error',
  pending: 'pending',
  waits: 'yours',
};

/** How a trace line draws a step in the state `state`: alive at work, failure failed, at rest not begun, yours waiting on a person. */
export const traceStatusOf = (state: ChatStep['state']): TraceStatus | undefined => TRACE_STATUS[state];

/** Where she is before a read answers: down, since nothing says she is up. */
export const CHAT_DOWN: ChatPresence = { up: false, answering: false, waitsOnYou: 0, unread: 0 };

/**
 * Her chat as the panel holds it: the events it knows, oldest first; where she is, as the api last said; the `cursor` a stream resumes
 * from, null before the first read; whether the stream is still open (`live`); whether the first read is in flight (`loading`); and why
 * the chat could not be read, if it could not.
 */
export type ChatFollowed = {
  events: ChatEvent[];
  presence: ChatPresence;
  cursor: string | null;
  live: boolean;
  loading: boolean;
  error: string | null;
};

/** What the panel holds before its first read: nothing, being read when there is one (`loading`). */
export const unreadChat = (loading: boolean): ChatFollowed => ({
  events: [],
  presence: CHAT_DOWN,
  cursor: null,
  live: false,
  loading,
  error: null,
});

/**
 * `known` with `incoming` merged in: an event whose `id` is already known is replaced where it stands, and one that is not is appended.
 * By the id alone, unlike a step's transcript, which pairs a result with its call and so keys on the kind beside it: her chat gives an
 * event one id for its life, and a step whose state moved from running to done is that same step, drawn once.
 */
export function mergeChatEvents(known: readonly ChatEvent[], incoming: readonly ChatEvent[]): ChatEvent[] {
  const merged = [...known];
  if (!incoming.length) return merged;
  const where = new Map(merged.map((event, i) => [event.id, i]));
  for (const event of incoming) {
    const i = where.get(event.id);
    if (i === undefined) {
      where.set(event.id, merged.length);
      merged.push(event);
    } else {
      merged[i] = event;
    }
  }
  return merged;
}

/** What one frame of her chat's stream does to what the panel holds: events, where she is, or a read that failed. */
export type ChatChange =
  | { kind: 'events'; events: ChatEvent[] }
  | { kind: 'presence'; presence: ChatPresence }
  | { kind: 'cursor'; cursor: string };

/** `s` after the change `c`: events merged in by their id, the presence replaced whole, the cursor moved. */
export function changedChat(s: ChatFollowed, c: ChatChange): ChatFollowed {
  if (c.kind === 'events') return { ...s, events: mergeChatEvents(s.events, c.events) };
  if (c.kind === 'presence') return { ...s, presence: c.presence };
  return { ...s, cursor: c.cursor };
}

/**
 * What each event of her chat's stream does to what the panel holds (`update`), apart from React, so it is tested without a browser:
 * `useNemiaChat` opens the stream and hands it here. Each event's data is decoded by its schema (`chatDataOf`), and one that does not
 * decode is ignored; `presence` replaces where she is, `chat` merges one event by its id, and the frames that arrive together are
 * merged once an animation frame, as a stream opened on a long chat sends hundreds at once. A read the api could not make and will try
 * again is said and keeps the stream; one it will not is the end. A dropped connection is the EventSource's to resume — it reconnects
 * with the id of the last event it was sent, which is the cursor — and one it closes, because the api refused it, ends the following.
 * Returns what stops following.
 */
export function followChat(stream: StreamLike, update: (change: (s: ChatFollowed) => ChatFollowed) => void, frames: Frames): () => void {
  let arrived: ChatChange[] = [];
  let frame = 0;
  let grace: ReturnType<typeof setTimeout> | undefined;
  const close = () => {
    if (grace !== undefined) clearTimeout(grace);
    stream.close();
  };
  const flush = () => {
    frame = 0;
    const changes = arrived;
    arrived = [];
    update((s) => changes.reduce(changedChat, s));
  };
  const arrive = (c: ChatChange) => {
    const last = arrived.at(-1);
    if (c.kind === 'events' && last?.kind === 'events') last.events.push(...c.events);
    else arrived.push(c);
    frame ||= frames.request(flush);
  };
  const end = (error: string | null) => {
    grace ??= setTimeout(close, END_GRACE_MS);
    if (frame) {
      frames.cancel(frame);
      flush();
    }
    update((s) => ({ ...s, live: false, error }));
  };
  stream.addEventListener('presence', (message) => {
    const presence = chatDataOf('presence', message.data);
    if (presence) arrive({ kind: 'presence', presence });
    if (message.lastEventId) arrive({ kind: 'cursor', cursor: message.lastEventId });
  });
  stream.addEventListener('chat', (message) => {
    const event = chatDataOf('chat', message.data);
    if (event) arrive({ kind: 'events', events: [event] });
    if (message.lastEventId) arrive({ kind: 'cursor', cursor: message.lastEventId });
  });
  stream.addEventListener('unreadable', (message) => {
    const said = chatDataOf('unreadable', message.data);
    const error = said?.error ?? 'Her chat could not be read.';
    if (said?.retrying) update((s) => ({ ...s, error: `${error} Reading it again every few seconds.` }));
    else end(error);
  });
  stream.addEventListener('open', () => update((s) => ({ ...s, live: true, error: null })));
  stream.addEventListener('error', () => {
    if (grace !== undefined) {
      close();
      return;
    }
    if (stream.readyState === CLOSED) {
      end('The api refused to follow her chat any further. Reload the page to read it again.');
      close();
    }
  });
  return () => {
    close();
    if (frame) frames.cancel(frame);
  };
}

/**
 * Where she is as her face and its cues read it (`lib/presence.ts`), the one writer of it: the api's presence `api`, her `level`, and
 * whether this browser keeps a message the api would not take (`notSent`). She reads as down when her session is not up and when her
 * level is `manual`, at which she has no session to be up.
 */
export const presenceOf = (api: ChatPresence, level: Level | undefined, notSent: boolean): Presence => ({
  waitsOnYou: api.waitsOnYou,
  notSent,
  down: !api.up || level === 'manual',
  answering: api.answering,
  unread: api.unread,
});

/** A block of her talk: one event drawn as itself, or her consecutive steps folded into one turn. */
export type ChatItem = { kind: 'event'; event: ChatEvent } | ChatTurn;

/**
 * Her steps between two of anything else, as one turn: its `id` the first step's, its steps in the order they came, `running` while
 * one of them is at work or waits on the person, and `ms` from the first step to the last.
 */
export type ChatTurn = { kind: 'turn'; id: string; steps: ChatStep[]; running: boolean; ms: number };

/** The milliseconds from the first of `steps` to the last, 0 where either moment does not parse. */
const spanOf = (steps: readonly ChatStep[]): number => {
  const ms = Date.parse(steps[steps.length - 1].at) - Date.parse(steps[0].at);
  return Number.isFinite(ms) && ms > 0 ? ms : 0;
};

/** The steps gathered so far as a turn. */
const turnOf = (steps: ChatStep[]): ChatTurn => ({
  kind: 'turn',
  id: steps[0].id,
  steps,
  running: steps.some((step) => step.state === 'running' || step.state === 'waits'),
  ms: spanOf(steps),
});

/**
 * Her chat drawn as blocks, in the order it came: each run of consecutive steps folded into one turn (`turnOf`), everything else as
 * itself. A turn still running is drawn open, with its last step alive; a finished one folds into its one line (`turnWords`).
 */
export function foldChat(events: readonly ChatEvent[]): ChatItem[] {
  const out: ChatItem[] = [];
  let steps: ChatStep[] = [];
  const close = () => {
    if (steps.length) out.push(turnOf(steps));
    steps = [];
  };
  for (const event of events) {
    if (event.kind === 'step') steps.push(event);
    else {
      close();
      out.push({ kind: 'event', event });
    }
  }
  close();
  return out;
}

/** The one line a finished turn folds into: `Worked for 2m 14s · 9 steps`. */
export const turnWords = (turn: Pick<ChatTurn, 'ms' | 'steps'>): string =>
  `Worked for ${duration(turn.ms)} · ${turn.steps.length === 1 ? '1 step' : `${turn.steps.length} steps`}`;

/**
 * How a message is drawn, by who it is from: the keeper's words as one quiet marker line, since the keeper frames what the person wrote
 * and writes nothing of its own; the person's own words as their bubble; hers as hers. Only an outbox entry is drawn as the person's.
 */
export const drawnAs = (message: ChatMessage): 'marker' | 'person' | 'agent' =>
  message.from === 'keeper' ? 'marker' : message.from === 'person' ? 'person' : 'agent';

/** Whether an event is a message of hers, which is what goes unread. */
const hers = (event: ChatEvent): event is ChatMessage => event.kind === 'message' && event.from === 'agent';

/** The words the pill over the talk says: `2 new · Jump to the latest`. */
export const jumpWords = (unread: number): string => `${unread === 1 ? '1 new' : `${unread} new`} · Jump to the latest`;

/** The words the line between what was read and what is new says: `2 new`. */
export const newWords = (unread: number): string => (unread === 1 ? '1 new' : `${unread} new`);

/**
 * The id of the first of her messages the person has not read, which the `N new` line is drawn over: null where none is unread, and
 * where the page holds fewer of her messages than the api counts unread, so no line is drawn over the wrong one.
 */
export function newFrom(events: readonly ChatEvent[], unread: number): string | null {
  if (unread < 1) return null;
  const mine = events.filter(hers);
  return unread > mine.length ? null : (mine[mine.length - unread]?.id ?? null);
}

/** The id the read mark is posted through: her latest message, since hers alone go unread; null where she has said nothing. */
export const readableFrom = (events: readonly ChatEvent[]): string | null => events.filter(hers).at(-1)?.id ?? null;

/** A link read out of her words: the words it was written on, and where it goes. */
export type ChatLink = { words: string; href: string };

/** A markdown link in her words: its words, then its address. */
const LINK = /\[([^\]\n]+)\]\(([^()\s]+)\)/g;

/**
 * Whether an address is a page of this board, which the look's filled button leads to through the router: one leading slash and not
 * two, since a protocol-relative address (`//evil.test/x`) begins with a slash and the browser resolves it off this board.
 */
const ours = (href: string): boolean => href.startsWith('/') && !href.startsWith('//');

/**
 * Her words with each link to a page of this board taken out of the sentence and named beside it: `text` reads plain, the link's own
 * words in its place, and `links` holds each address in the order she wrote it, which the panel draws as the canvas's filled buttons
 * under her bubble. A link that leaves the board, and one whose address the board would not open at all, is left in her words as she
 * wrote it, for `Markdown` to draw — a button through the router leads to a route, and those are not routes.
 */
export function linksOf(text: string): { text: string; links: ChatLink[] } {
  const links: ChatLink[] = [];
  const plain = text.replace(LINK, (whole: string, words: string, href: string) => {
    if (!ours(href)) return whole;
    links.push({ words, href });
    return words;
  });
  return { text: plain, links };
}
