/**
 * A remote agent's Task in the seam's words, pure: its conversation as transcript events, and what a subscription to it answers
 * as the moments a follow gives (`Followed`).
 *
 * A message is an event under its own id, `assistant` when the agent said it; an artifact is one under `artifact:<id>` (`artifactKey`),
 * its text parts joined, whatever its name: a remote agent's artifact named `transcript` is its words, never this runtime's events.
 * An artifact is whole once its last chunk came, or once the turn that writes it is over (`turnOver`): before, it is a piece of text
 * being written (`partial`), under the same key. A2A gives a message no time, so an event's `at` is the Task's last status time, else
 * when the message was sent.
 */
import { Role, type Artifact, type Message, type Part, type StreamResponse, type Task, type TaskStatus } from '@a2a-js/sdk';
import { atWorkState, type SessionState } from '../core/index.ts';
import type { Followed, Transcript, TranscriptCursor, TranscriptEvent } from '../harness/index.ts';
import { nameOf, sightingOfTask } from './map.ts';

/** The id an artifact's event, and the pieces of its text, go by. */
const artifactKey = (artifactId: string) => `artifact:${artifactId}`;

/**
 * Whether a session in `state` has ended its turn: it no longer works, whether it ended or waits on its caller.
 * @param state The session's state.
 */
export const turnOver = (state: SessionState) => !atWorkState(state);

/** A part's words: its text, or its data as JSON; a file part says none. */
const wordsOfPart = (p: Part) => {
  const c = p.content;
  if (c?.$case === 'text') return c.value;
  if (c?.$case === 'data') return JSON.stringify(c.value);
  return '';
};

const textOf = (parts: readonly Part[], between: string) =>
  parts
    .map(wordsOfPart)
    .filter((w) => w !== '')
    .join(between);

const messageEvent = (m: Message, at: string) =>
  ({
    id: m.messageId,
    at,
    role: m.role === Role.ROLE_AGENT ? 'assistant' : 'user',
    kind: 'text',
    text: textOf(m.parts, '\n'),
  }) satisfies TranscriptEvent;

const artifactEvent = (artifactId: string, text: string, at: string) =>
  ({
    id: artifactKey(artifactId),
    at,
    role: 'assistant',
    kind: 'text',
    text,
  }) satisfies TranscriptEvent;

/** The Task's messages in order: its history, then its status message where the history does not hold it. */
const messagesOf = (t: Task) => {
  const status = t.status?.message;
  return status && !t.history.some((m) => m.messageId === status.messageId) ? [...t.history, status] : t.history;
};

/** When the Task's events say they were written: its last status time, else `sentAt`. */
const atOf = (status: TaskStatus | undefined, sentAt: string) => status?.timestamp || sentAt;

/** The Task's artifacts that are whole: every one once its turn is over, else the first `whole`, which an earlier turn wrote. */
const wholeOf = (t: Task, whole: number) => (turnOver(sightingOfTask(t).state) ? t.artifacts : t.artifacts.slice(0, whole));

const CURSOR = /^remote\.(\d+)\.([\w-]*)$/;

/**
 * Where a remote transcript read stopped: after the message `messageId` (none before the first), and the first `artifacts` whole
 * artifacts.
 * @param messageId The id of the last message read, or empty before the first.
 * @param artifacts How many whole artifacts were read.
 */
export const remoteCursorOf = (messageId: string, artifacts: number) =>
  `remote.${artifacts}.${Buffer.from(messageId).toString('base64url')}`;

/** A cursor `remoteCursorOf` gave, read back; `undefined` for any other. */
const cursorRead = (after: TranscriptCursor | undefined) => {
  const [, artifacts, messageId] = (after === undefined ? null : CURSOR.exec(after)) ?? [];
  return artifacts === undefined || messageId === undefined
    ? undefined
    : { artifacts: Number(artifacts), messageId: Buffer.from(messageId, 'base64url').toString() };
};

/**
 * The Task `t`'s conversation as events after the cursor `after`, and the cursor after them: its messages in order, then its whole
 * artifacts, `whole` of which an earlier turn wrote. A cursor this does not know, or past a message the Task no longer holds, reads
 * from the start: an event given twice is dropped by its id, one never given is lost.
 * @param t The remote Task.
 * @param sentAt When the session was sent, the time its events say where the Task's status gives none.
 * @param whole How many of the Task's artifacts an earlier turn wrote.
 * @param after The cursor a read stopped at, or undefined to read from the start.
 */
export const transcriptOfTask = (t: Task, sentAt: string, whole: number, after?: TranscriptCursor) => {
  const at = atOf(t.status, sentAt);
  const messages = messagesOf(t);
  const artifacts = wholeOf(t, whole);
  const c = cursorRead(after);
  const from = c === undefined ? -1 : c.messageId === '' ? 0 : messages.findIndex((m) => m.messageId === c.messageId) + 1;
  const known = c !== undefined && from >= 0;
  const fromArtifacts = known ? c.artifacts : 0;
  return {
    events: [
      ...messages.slice(known ? from : 0).map((m) => messageEvent(m, at)),
      ...artifacts.slice(fromArtifacts).map((a) => artifactEvent(a.artifactId, textOf(a.parts, ''), at)),
    ],
    cursor: remoteCursorOf(messages.at(-1)?.messageId ?? '', Math.max(artifacts.length, fromArtifacts)),
  } satisfies Transcript;
};

/**
 * What a follow has given of a remote Task: the ids of the events given, or held by the transcript it began on (`said`); the text so
 * far of each artifact written in this turn and not yet whole (`open`); the state last given; the time its events say (`at`); the
 * message and the count of whole artifacts its cursor stands after; and how many artifacts an earlier turn wrote (`whole`).
 */
export type Relay = {
  said: Set<string>;
  open: Map<string, string>;
  state?: SessionState;
  at: string;
  lastMessage: string;
  artifacts: number;
  whole: number;
};

/**
 * A follow that has given nothing, of a session sent at `sentAt` whose Task's first `whole` artifacts an earlier turn wrote.
 * @param sentAt When the session was sent, the time its events say while no status gives one.
 * @param whole How many of the Task's artifacts an earlier turn wrote; none where it is not given.
 */
export const relayOf = (sentAt: string, whole = 0) =>
  ({
    said: new Set<string>(),
    open: new Map<string, string>(),
    at: sentAt,
    lastMessage: '',
    artifacts: 0,
    whole,
  }) satisfies Relay;

/** `events`, as the moment that gives them with the relay's cursor after them; none when there are none. */
const given = (r: Relay, events: TranscriptEvent[]) =>
  (events.length ? [{ kind: 'events', events, cursor: remoteCursorOf(r.lastMessage, r.artifacts) }] : []) satisfies Followed[];

/** The state, where it is not the one last given. */
const stateGiven = (r: Relay, state: SessionState | undefined) => {
  if (state === undefined || state === r.state) return [] satisfies Followed[];
  r.state = state;
  return [{ kind: 'state', state }] satisfies Followed[];
};

/** The message `m` as an event, where it was not given: then said, and the cursor after it. */
const messageGiven = (r: Relay, m: Message) => {
  r.lastMessage = m.messageId;
  if (r.said.has(m.messageId)) return [] satisfies TranscriptEvent[] as TranscriptEvent[];
  r.said.add(m.messageId);
  return [messageEvent(m, r.at)] satisfies TranscriptEvent[] as TranscriptEvent[];
};

/** The artifact `artifactId` whole, its text `text`, where it was not given: then said, and no longer open. */
const artifactGiven = (r: Relay, artifactId: string, text: string) => {
  r.open.delete(artifactId);
  const key = artifactKey(artifactId);
  if (r.said.has(key)) return [] satisfies TranscriptEvent[];
  r.said.add(key);
  r.artifacts += 1;
  return [artifactEvent(artifactId, text, r.at)] satisfies TranscriptEvent[];
};

/** Every artifact still open, whole: the turn that wrote them is over. */
const openGiven = (r: Relay) =>
  [...r.open].flatMap(([id, text]) => artifactGiven(r, id, text)) satisfies TranscriptEvent[] as TranscriptEvent[];

/**
 * The Task `t` as the relay has not given it. The first a follow reads (`first`) is the transcript's to give, which a reader reads once
 * the follow has said its state: its state is given first, and its messages and its whole artifacts are counted said, not given.
 * Then each artifact of this turn not given is its text so far, whole (`append: false`), or whole once the turn is over; each
 * message not given an event; and the state.
 */
const taskGiven = (r: Relay, t: Task, first: boolean) => {
  const state = sightingOfTask(t).state;
  r.at = atOf(t.status, r.at);
  const over = turnOver(state);
  const pieces: Followed[] = [];
  const events: TranscriptEvent[] = [];
  for (const m of messagesOf(t)) {
    if (first) r.said.add(m.messageId);
    events.push(...messageGiven(r, m));
  }
  t.artifacts.forEach((a, i) => {
    const text = textOf(a.parts, '');
    if (first && (over || i < r.whole)) {
      r.said.add(artifactKey(a.artifactId));
      r.artifacts += 1;
    } else if (over) events.push(...artifactGiven(r, a.artifactId, text));
    else if (!r.said.has(artifactKey(a.artifactId)) && r.open.get(a.artifactId) !== text) {
      r.open.set(a.artifactId, text);
      pieces.push({ kind: 'partial', key: artifactKey(a.artifactId), text, append: false, last: false });
    }
  });
  return (first ? [...stateGiven(r, state), ...pieces] : [...pieces, ...given(r, events), ...stateGiven(r, state)]) satisfies Followed[];
};

/** A status: its message where it was not given, the artifacts still open whole where the turn is over, and the state. */
const statusGiven = (r: Relay, status: TaskStatus | undefined) => {
  r.at = atOf(status, r.at);
  const state = nameOf(status?.state ?? 0);
  const events = state !== undefined && turnOver(state) ? openGiven(r) : [];
  if (status?.message) events.push(...messageGiven(r, status.message));
  return [...given(r, events), ...stateGiven(r, state)] satisfies Followed[];
};

/** A chunk of an artifact: the piece of its text, and at its last chunk the artifact whole. */
const chunkGiven = (r: Relay, a: Artifact, append: boolean, last: boolean) => {
  const key = artifactKey(a.artifactId);
  if (r.said.has(key)) return [] satisfies Followed[];
  const piece = textOf(a.parts, '');
  const text = append ? `${r.open.get(a.artifactId) ?? ''}${piece}` : piece;
  r.open.set(a.artifactId, text);
  const partial: Followed = { kind: 'partial', key, text: piece, append, last };
  return (last ? [partial, ...given(r, artifactGiven(r, a.artifactId, text))] : [partial]) satisfies Followed[];
};

/**
 * What one answer of a subscription to a remote Task says that the relay `r` has not given, in order, `r` then holding it given: the
 * Task as it stands (`taskGiven`, `first` for the first a follow reads), a status, a chunk of an artifact, or a message.
 * @param r What the follow has given, updated with what this answer gives.
 * @param answer One answer of the subscription.
 * @param first Whether it is the first answer the follow reads; false where not given.
 */
export const followedOfRemote = (r: Relay, answer: StreamResponse, first = false) => {
  const p = answer.payload;
  if (p?.$case === 'task') return taskGiven(r, p.value, first) satisfies Followed[];
  if (p?.$case === 'statusUpdate') return statusGiven(r, p.value.status) satisfies Followed[];
  if (p?.$case === 'artifactUpdate')
    return (p.value.artifact ? chunkGiven(r, p.value.artifact, p.value.append, p.value.lastChunk) : []) satisfies Followed[];
  if (p?.$case === 'message') return given(r, messageGiven(r, p.value)) satisfies Followed[];
  return [] satisfies Followed[];
};

/**
 * Whether the relay has given a state that ends the turn: a follow has nothing more to give.
 * @param r What the follow has given.
 */
export const relayOver = (r: Relay) => r.state !== undefined && turnOver(r.state);
