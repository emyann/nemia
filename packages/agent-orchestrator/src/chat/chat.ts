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
};

/** Words said to the task, as the runtime journals them (`Said`): when, to which attempt, and the transcript event they followed. */
export type SourceSaid = { at: string; attempt: number; text: string; after?: { kind: string; id: string } | null };

/** One attempt's session: its number, when it began, and its transcript's events. */
export type ChatSession = { attempt: number; startedAt: string; events: readonly SourceEvent[] };

/** What the person wrote, as the outbox keeps it. */
export type OutboxEntry = { id: string; at: string; text: string };

/** The keeper's mark of an outbox entry delivered: its `id`, and the said that carried it, by its time and attempt. */
export type DeliveredMark = { id: string; said: string; attempt: number };

/** The last event the person saw (`through`), and when they said so. */
export type ReadMark = { through: string; at: string };

/** Everything a chat is projected from. */
export type ChatSources = {
  sessions: readonly ChatSession[];
  said: readonly SourceSaid[];
  outbox: readonly OutboxEntry[];
  delivered: readonly DeliveredMark[];
  phase: string;
};

/** The words the person's `text` is said to the task in, so it knows who wrote them. Pure. */
export const framedForHer = (text: string): string => `The person writes from the board: ${text}`;

/** The longest text the person may send at once. */
export const CHAT_TEXT_MAX = 8000;

/** How long a keeper's marker is, its words' first line cut there. */
const MARKER_MAX = 120;

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

/** The chat events one transcript event is: the agent's text a message, a tool call a step, everything else none. */
function eventsOf(attempt: number, e: SourceEvent, results: ReadonlyMap<string, SourceEvent>, open: StepState): ChatEvent[] {
  if (e.role === 'assistant' && e.kind === 'text' && (e.text ?? '').trim() !== '')
    return [{ kind: 'message', id: `m:${attempt}:${e.id}`, at: e.at, from: 'agent', text: e.text ?? '' }];
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

/**
 * The chat, oldest first: each session's events, a session line where an attempt began after the first, then each outbox entry no
 * said carries yet, the person's, undelivered. A tool call with no result is `pending`, but the session's last, which is `running`, or
 * `waits` where the phase says the task needs the person. Pure.
 */
export function projectChat(sources: ChatSources): ChatEvent[] {
  const claims = claimsOf(sources);
  const live = sources.phase === 'needs-human' ? 'waits' : 'running';
  const lastAttempt = sources.sessions.at(-1)?.attempt;
  const out: ChatEvent[] = [];
  for (const [i, session] of sources.sessions.entries()) {
    if (i > 0) out.push({ kind: 'session', id: `s:${session.attempt}`, at: session.startedAt, attempt: session.attempt });
    out.push(...sessionEvents(session, sources.said, claims, session.attempt === lastAttempt ? live : 'pending'));
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
export type ChatCursor = { attempts: number; events: number; said: number; outbox: number; delivered: number };

/** The cursor of everything `sources` holds. Pure. */
export const cursorOf = (sources: ChatSources): ChatCursor => ({
  attempts: sources.sessions.length,
  events: sources.sessions.at(-1)?.events.length ?? 0,
  said: sources.said.length,
  outbox: sources.outbox.length,
  delivered: sources.delivered.length,
});

/** A cursor as a stream's event id: its five counts, dot-separated. Pure. */
export const chatCursor = (c: ChatCursor): string => [c.attempts, c.events, c.said, c.outbox, c.delivered].join('.');

/** The words a cursor no read gave is refused with. */
const NOT_A_CURSOR = (text: string) =>
  `${text} is not a cursor a chat read gave: pass the \`cursor\` the last read returned, or the last event's id, or none to read it whole.`;

/** The cursor `text` names. Refused (`Invalid`) where it is not five whole counts. Pure. */
export function readChatCursor(text: string): ChatCursor {
  const parts = text.split('.');
  if (parts.length !== 5 || parts.some((p) => !/^(0|[1-9]\d*)$/.test(p))) throw new Invalid({ message: NOT_A_CURSOR(text) });
  const [attempts, events, said, outbox, delivered] = parts.map(Number) as [number, number, number, number, number];
  return { attempts, events, said, outbox, delivered };
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
    c.delivered > sources.delivered.length;
  if (beyond) throw new Invalid({ message: NOT_A_CURSOR(text) });
  const sessions = sources.sessions.slice(0, c.attempts);
  return {
    ...sources,
    sessions: last === undefined ? sessions : [...sessions.slice(0, -1), { ...last, events: last.events.slice(0, c.events) }],
    said: sources.said.slice(0, c.said),
    outbox: sources.outbox.slice(0, c.outbox),
    delivered: sources.delivered.slice(0, c.delivered),
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

/**
 * Where the task is, off its phase (none where no task is filed), what waits on the person (`waiting`), its chat and the person's read
 * mark: unread the agent's messages after the event it names, every one where there is none or the chat no longer holds it. Pure.
 */
export function presenceOf(phase: string | undefined, waiting: number, events: readonly ChatEvent[], mark: ReadMark | undefined): Presence {
  const up = phase !== undefined && upOf(phase);
  const from = mark === undefined ? -1 : events.findIndex((e) => e.id === mark.through);
  const unread = events.slice(from + 1).filter((e) => e.kind === 'message' && e.from === 'agent').length;
  return { up, answering: up && answeringOf(phase), waitsOnYou: waiting, unread };
}
