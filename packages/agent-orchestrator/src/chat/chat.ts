/**
 * A chat with a long-lived task, as the board draws it: one event shape for a turn (`ChatEvent`), its history projected from the task's
 * transcripts across its attempts and what was said to it (`projectChat`), a page of it (`chatPage`), the cursor a stream resumes from
 * (`chatCursor`, `readChatCursor`), and where the task is (`presenceOf`). Nothing of it is stored but the person's words, the marks of
 * their delivery and the person's read mark (`chat.store.ts`): the rest is what the runtime already holds, read again each time.
 *
 * Pure. The files are `chat.store.ts`'s, the reads and the person's writes `chat.verb.ts`, and the delivery the keeper's
 * (`deliver.verb.ts`).
 */
import { Invalid } from '../refusal/refusal.ts';

/** Who a message is from: the task's agent (`agent`), the person, or the keeper, whose words are a quiet marker. */
export type ChatFrom = 'agent' | 'person' | 'keeper';

/** Where a step stands: done, at work, failed, not begun, or waiting on the person. */
export type StepState = 'done' | 'running' | 'error' | 'pending' | 'waits';

/**
 * One event of a chat, unique by its `id`:
 * a `message`, the person's carrying when it was delivered (`delivered`, the said's time, null while it waits in the outbox);
 * a `step`, one tool call, its `sentence`, a `fact` (its duration) and its `state`;
 * a `session` line where one attempt ended and the next began;
 * a `question` and a `proposal`, named in the shape and built by nothing yet.
 */
export type ChatEvent =
  | { kind: 'message'; id: string; at: string; from: ChatFrom; text: string; delivered?: string | null }
  | { kind: 'step'; id: string; at: string; tool: string; sentence: string; fact?: string; state: StepState }
  | { kind: 'session'; id: string; at: string; attempt: number }
  | { kind: 'question'; id: string; at: string; text: string; options: string[] }
  | { kind: 'proposal'; id: string; at: string; text: string };

/**
 * Where the task is: `up`, its session live; `answering`, a turn in progress; `waitsOnYou`, what waits on the person (the runs waiting,
 * and the task's own open questions and proposals); `unread`, the agent's messages after the person's read mark.
 */
export type Presence = { up: boolean; answering: boolean; waitsOnYou: number; unread: number };

/** One event of a session's transcript, as the projection reads it (the runtime's `TranscriptEvent`). */
export type SourceEvent = {
  id: string;
  at: string;
  role: 'assistant' | 'user' | 'system';
  kind: 'text' | 'thinking' | 'tool_use' | 'tool_result' | 'system';
  text?: string;
  tool?: { name: string; input: unknown };
  result?: { text: string; isError: boolean };
  /** Where the words came from, for a `user` event: `human` where a person wrote them into the session's own face. */
  origin?: { kind: string };
};

/** Words said to the task, as the runtime journals them (`Said`): when, to which attempt, and the transcript event they followed. */
export type SourceSaid = { at: string; attempt: number; text: string; after?: { kind: string; id: string } | null };

/** One attempt's session: its number, when it began, and its transcript's events. */
export type ChatSession = { attempt: number; startedAt: string; events: readonly SourceEvent[] };

/** What the person wrote, as the outbox keeps it. */
export type OutboxEntry = { id: string; at: string; text: string };

/** The keeper's mark of an outbox entry delivered: its `id`, and the said that carried it, by its time and attempt. */
export type DeliveredMark = { id: string; said: string; attempt: number };

/** One turn the person stopped: when, and which attempt was answering. */
export type SourceStop = { at: string; attempt: number };

/** The last event the person saw (`through`), and when they said so. */
export type ReadMark = { through: string; at: string };

/** Everything a chat is projected from. */
export type ChatSources = {
  sessions: readonly ChatSession[];
  said: readonly SourceSaid[];
  outbox: readonly OutboxEntry[];
  delivered: readonly DeliveredMark[];
  stops: readonly SourceStop[];
  phase: string;
};

/** The words the person's `text` is said to the task in, so it knows who wrote them. Pure. */
export const framedForHer = (text: string): string => `The person writes from the board: ${text}`;

/** The longest text the person may send at once. */
export const CHAT_TEXT_MAX = 8000;

/** How long a keeper's marker is, its words' first line cut there. */
const MARKER_MAX = 120;

/** What a turn the person stopped is drawn as: the keeper's quiet marker on the record, in the words the board shows. */
export const STOPPED = 'Stopped';

/** The key a said is claimed by: its attempt and its time. */
const saidKey = (attempt: number, at: string): string => `${attempt} ${at}`;

/** A keeper's marker of what it said: its first line, cut. */
const markerOf = (text: string): string => {
  const line = text.trim().split('\n')[0] ?? '';
  return line.length > MARKER_MAX ? `${line.slice(0, MARKER_MAX - 1)}…` : line;
};

/** The sentence a tool call is drawn with: its description, command, file or pattern where it gives one, else its name. */
const sentenceOf = (name: string, input: unknown): string => {
  const given = typeof input === 'object' && input !== null ? (input as Record<string, unknown>) : {};
  const said = ['description', 'command', 'file_path', 'pattern', 'url', 'query']
    .map((key) => given[key])
    .find((v) => typeof v === 'string');
  return typeof said === 'string' ? `${name}: ${markerOf(said)}` : name;
};

/** The time between two moments, as a person reads it, or undefined where either does not parse. */
const durationOf = (from: string, to: string): string | undefined => {
  const ms = Date.parse(to) - Date.parse(from);
  if (!Number.isFinite(ms) || ms < 0) return undefined;
  return ms < 1000 ? `${ms} ms` : ms < 60_000 ? `${(ms / 1000).toFixed(1)} s` : `${Math.round(ms / 60_000)} min`;
};

/** A tool call as a step: done or failed by its result, else at work, or waiting on the person where the task needs one. */
function stepOf(attempt: number, use: SourceEvent, result: SourceEvent | undefined, open: StepState): ChatEvent {
  const name = use.tool?.name ?? 'tool';
  const fact = result === undefined ? undefined : durationOf(use.at, result.at);
  const state: StepState = result === undefined ? open : result.result?.isError ? 'error' : 'done';
  return {
    kind: 'step',
    id: `t:${attempt}:${use.id}`,
    at: use.at,
    tool: name,
    sentence: sentenceOf(name, use.tool?.input),
    ...(fact === undefined ? {} : { fact }),
    state,
  };
}

/**
 * The chat events one transcript event is: the agent's text a message, a tool call a step, words a person wrote into the session's own
 * face (`origin: { kind: 'human' }`, the other face her session gives a person) a message of theirs, so the board reads as one
 * conversation whichever face it was written from; everything else none. Words the host pushed on her input carry no origin and are drawn from the outbox, where
 * they were written, so one sent message is one bubble.
 */
function eventsOf(attempt: number, e: SourceEvent, results: ReadonlyMap<string, SourceEvent>, open: StepState): ChatEvent[] {
  if (e.role === 'assistant' && e.kind === 'text' && (e.text ?? '').trim() !== '')
    return [{ kind: 'message', id: `m:${attempt}:${e.id}`, at: e.at, from: 'agent', text: e.text ?? '' }];
  if (e.role === 'user' && e.kind === 'text' && e.origin?.kind === 'human' && (e.text ?? '').trim() !== '')
    return [{ kind: 'message', id: `h:${attempt}:${e.id}`, at: e.at, from: 'person', text: e.text ?? '' }];
  if (e.kind === 'tool_use') return [stepOf(attempt, e, results.get(e.id), open)];
  return [];
}

/** What claims each said: the outbox entry its delivered mark names, by the said's key. */
const claimsOf = (sources: ChatSources): Map<string, OutboxEntry> => {
  const byId = new Map(sources.outbox.map((entry) => [entry.id, entry]));
  const claims = new Map<string, OutboxEntry>();
  for (const mark of sources.delivered) {
    const entry = byId.get(mark.id);
    if (entry !== undefined) claims.set(saidKey(mark.attempt, mark.said), entry);
  }
  return claims;
};

/** A said as the chat draws it: the person's message where a delivered mark claims it, else the keeper's marker. */
const saidEvent = (said: SourceSaid, claims: ReadonlyMap<string, OutboxEntry>): ChatEvent => {
  const entry = claims.get(saidKey(said.attempt, said.at));
  return entry === undefined
    ? { kind: 'message', id: `k:${said.attempt}:${said.at}`, at: said.at, from: 'keeper', text: markerOf(said.text) }
    : { kind: 'message', id: `p:${entry.id}`, at: entry.at, from: 'person', text: entry.text, delivered: said.at };
};

/** One session's events, each said to it placed after the transcript event it followed, or first where it followed none. */
function sessionEvents(session: ChatSession, said: readonly SourceSaid[], claims: ReadonlyMap<string, OutboxEntry>, open: StepState) {
  const results = new Map(session.events.filter((e) => e.kind === 'tool_result').map((e) => [e.id, e]));
  const ids = new Set(session.events.map((e) => `${e.kind} ${e.id}`));
  const own = said.filter((s) => s.attempt === session.attempt);
  const placed = (mark: string | null) =>
    own.filter((s) => (s.after ? (ids.has(`${s.after.kind} ${s.after.id}`) ? `${s.after.kind} ${s.after.id}` : null) : '') === mark);
  const out: ChatEvent[] = placed('').map((s) => saidEvent(s, claims));
  const last = session.events.filter((e) => e.kind === 'tool_use').at(-1);
  for (const e of session.events) {
    out.push(...eventsOf(session.attempt, e, results, e === last ? open : 'pending'));
    out.push(...placed(`${e.kind} ${e.id}`).map((s) => saidEvent(s, claims)));
  }
  return [...out, ...placed(null).map((s) => saidEvent(s, claims))];
}

/** A turn the person stopped, as the chat draws it: the keeper's quiet marker, placed in time among the session's events. */
const stopEvent = (stop: SourceStop): ChatEvent => ({
  kind: 'message',
  id: `x:${stop.attempt}:${stop.at}`,
  at: stop.at,
  from: 'keeper',
  text: STOPPED,
});

/**
 * The chat, oldest first: each session's events with each turn the person stopped in its place in time, a session line where an attempt
 * began after the first, then each outbox entry no said carries yet, the person's, undelivered. A tool call with no result is
 * `pending`, but the session's last, which is `running`, or `waits` where the phase says the task needs the person. Pure.
 */
export function projectChat(sources: ChatSources): ChatEvent[] {
  const claims = claimsOf(sources);
  const live = sources.phase === 'needs-human' ? 'waits' : 'running';
  const lastAttempt = sources.sessions.at(-1)?.attempt;
  const out: ChatEvent[] = [];
  for (const [i, session] of sources.sessions.entries()) {
    if (i > 0) out.push({ kind: 'session', id: `s:${session.attempt}`, at: session.startedAt, attempt: session.attempt });
    const own = sessionEvents(session, sources.said, claims, session.attempt === lastAttempt ? live : 'pending');
    const stops = sources.stops.filter((stop) => stop.attempt === session.attempt).map(stopEvent);
    out.push(...placedInTime(own, stops));
  }
  const shown = new Set(out.map((e) => e.id));
  const marked = new Map(sources.delivered.map((mark) => [mark.id, mark.said]));
  for (const entry of sources.outbox)
    if (!shown.has(`p:${entry.id}`))
      out.push({
        kind: 'message',
        id: `p:${entry.id}`,
        at: entry.at,
        from: 'person',
        text: entry.text,
        delivered: marked.get(entry.id) ?? null,
      });
  return out;
}

/**
 * The events `own` with each of `marks` where its time puts it: after the last event not later than it, and first where every event is
 * later. A session's own events keep their order among themselves, whatever a clock reads.
 */
function placedInTime(own: readonly ChatEvent[], marks: readonly ChatEvent[]): ChatEvent[] {
  if (marks.length === 0) return [...own];
  const out = [...own];
  for (const mark of marks) {
    let at = out.length;
    while (at > 0 && (out[at - 1]?.at ?? '') > mark.at) at--;
    out.splice(at, 0, mark);
  }
  return out;
}

/** A page of a chat: its events, oldest first, and the id to ask `before` for the page older than it, null where there is none. */
export type ChatPage = { events: ChatEvent[]; before: string | null };

/** The most events a page holds, and how many when none is asked. */
export const PAGE_MAX = 200;
export const PAGE_DEFAULT = 50;

/**
 * The `limit` events before the event `before`, or the last `limit` where none is named. Refused (`Invalid`) for a limit that is no
 * whole number from 1 to `PAGE_MAX`, and for an id the chat does not hold. Pure.
 */
export function chatPage(events: readonly ChatEvent[], before: string | undefined, limit: number = PAGE_DEFAULT): ChatPage {
  if (!Number.isInteger(limit) || limit < 1 || limit > PAGE_MAX)
    throw new Invalid({ message: `limit ${String(limit)} is no page size: ask for a whole number from 1 to ${PAGE_MAX}.` });
  const end = before === undefined ? events.length : events.findIndex((e) => e.id === before);
  if (end < 0) throw new Invalid({ message: `${before} is no event of this chat: pass the \`before\` the last page gave, or none.` });
  const start = Math.max(0, end - limit);
  return { events: events.slice(start, end), before: start > 0 ? (events[start]?.id ?? null) : null };
}

/**
 * How much of each source a stream has sent: its sessions (`attempts`), the last one's transcript events (`events`), the saids, the
 * outbox entries and the delivered marks.
 */
export type ChatCursor = { attempts: number; events: number; said: number; outbox: number; delivered: number; stops: number };

/** The cursor of everything `sources` holds. Pure. */
export const cursorOf = (sources: ChatSources): ChatCursor => ({
  attempts: sources.sessions.length,
  events: sources.sessions.at(-1)?.events.length ?? 0,
  said: sources.said.length,
  outbox: sources.outbox.length,
  delivered: sources.delivered.length,
  stops: sources.stops.length,
});

/** A cursor as a stream's event id: its six counts, dot-separated. Pure. */
export const chatCursor = (c: ChatCursor): string => [c.attempts, c.events, c.said, c.outbox, c.delivered, c.stops].join('.');

/**
 * The words a cursor no read gave is refused with. A chat event's own id is no cursor: what a stream resumes from is the `cursor` a read
 * answered, which the stream also writes as the `id` of each read's last event, so an `EventSource` sends it back as `Last-Event-ID`.
 */
const NOT_A_CURSOR = (text: string) =>
  `${text} is not a cursor a chat read gave: pass the \`cursor\` a read answered, which a stream writes as its last event's \`id\`, or none to read it whole.`;

/**
 * The cursor `text` names. A cursor of five counts, which a tab open across the deploy that added the stops still carries, reads as
 * one that had seen no stop. Refused (`Invalid`) where it is not five or six whole counts. Pure.
 */
export function readChatCursor(text: string): ChatCursor {
  const parts = text.split('.');
  if ((parts.length !== 5 && parts.length !== 6) || parts.some((p) => !/^(0|[1-9]\d*)$/.test(p)))
    throw new Invalid({ message: NOT_A_CURSOR(text) });
  const [attempts, events, said, outbox, delivered, stops = 0] = parts.map(Number) as [number, number, number, number, number, number?];
  return { attempts, events, said, outbox, delivered, stops };
}

/**
 * What `sources` held when the cursor `c` was read: its first sessions, the last of them cut at its count, and the first of each
 * file. Refused (`Invalid`) for a cursor that counts more than the sources hold, which no read of them gave. Pure.
 */
export function sourcesAt(sources: ChatSources, c: ChatCursor, text: string): ChatSources {
  const last = sources.sessions[c.attempts - 1];
  const beyond =
    c.attempts > sources.sessions.length ||
    (last === undefined ? c.events > 0 : c.events > last.events.length) ||
    c.said > sources.said.length ||
    c.outbox > sources.outbox.length ||
    c.delivered > sources.delivered.length ||
    c.stops > sources.stops.length;
  if (beyond) throw new Invalid({ message: NOT_A_CURSOR(text) });
  const sessions = sources.sessions.slice(0, c.attempts);
  return {
    ...sources,
    sessions: last === undefined ? sessions : [...sessions.slice(0, -1), { ...last, events: last.events.slice(0, c.events) }],
    said: sources.said.slice(0, c.said),
    outbox: sources.outbox.slice(0, c.outbox),
    delivered: sources.delivered.slice(0, c.delivered),
    stops: sources.stops.slice(0, c.stops),
  };
}

/** The events of `now` a reader of `then` has not seen as they are: new ones, and those whose state or delivery changed. Pure. */
export function changedSince(then: readonly ChatEvent[], now: readonly ChatEvent[]): ChatEvent[] {
  const seen = new Map(then.map((e) => [e.id, JSON.stringify(e)]));
  return now.filter((e) => seen.get(e.id) !== JSON.stringify(e));
}

/** Whether a runtime phase is a session that is live: one that hears what is said to it. */
export const upOf = (phase: string): boolean =>
  phase === 'idle' ||
  phase === 'needs-human' ||
  phase === 'input-required' ||
  phase === 'working (quiescent)' ||
  phase.startsWith('running (');

/** Whether a runtime phase is a turn in progress. */
const answeringOf = (phase: string): boolean => phase === 'running (working)' || phase === 'working (quiescent)';

/** Whether a chat event is a message of the agent's own, which is what goes unread. */
const hers = (e: ChatEvent): boolean => e.kind === 'message' && e.from === 'agent';

/**
 * How many of the agent's messages the person has not read, off their read `mark`: those after the event it names, every one where
 * there is no mark, and those said after the moment it was set where the chat no longer holds that event — a said drawn as the keeper's
 * marker is drawn as the person's message under another id once a delivered mark claims it, and the mark's own moment outlives the flip.
 */
const unreadOf = (events: readonly ChatEvent[], mark: ReadMark | undefined): number => {
  if (mark === undefined) return events.filter(hers).length;
  const from = events.findIndex((e) => e.id === mark.through);
  if (from >= 0) return events.slice(from + 1).filter(hers).length;
  return events.filter((e) => hers(e) && e.at > mark.at).length;
};

/**
 * Where the task is, off its phase (none where no task is filed), what waits on the person (`waiting`), its chat and the person's read
 * mark: unread the agent's messages the mark leaves unread (`unreadOf`). Pure.
 */
export function presenceOf(phase: string | undefined, waiting: number, events: readonly ChatEvent[], mark: ReadMark | undefined): Presence {
  const up = phase !== undefined && upOf(phase);
  return { up, answering: up && answeringOf(phase), waitsOnYou: waiting, unread: unreadOf(events, mark) };
}
