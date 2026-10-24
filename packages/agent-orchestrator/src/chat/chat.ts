/**
 * A chat with a long-lived task, as the board draws it: one event shape for a turn (`ChatEvent`), its history projected from the task's
 * transcripts across its attempts and what was said to it (`projectChat`), a page of it (`chatPage`), the cursor a stream resumes from
 * (`chatCursor`, `readChatCursor`), and where the task is (`presenceOf`). Nothing of it is stored but the person's words, the marks of
 * their delivery, the person's read mark and the turns they asked to end (`chat.store.ts`): the rest is what the runtime already holds,
 * read again each time.
 *
 * Pure. The files are `chat.store.ts`'s, the reads and the person's writes `chat.verb.ts`, and the delivery the keeper's
 * (`deliver.verb.ts`).
 */
import { Invalid } from '../refusal/refusal.ts';
import type { EnginePhase } from '../views/views-words.ts';

/** Who a message is from: the task's agent (`agent`), the person, or the keeper, whose words are a quiet marker. */
export type ChatFrom = 'agent' | 'person' | 'keeper';

/** Where a tool call stands: done, at work, failed, not begun, or waiting on the person. */
export type CallState = 'done' | 'running' | 'error' | 'pending' | 'waits';

/**
 * One event of a chat, unique by its `id`:
 * a `message`, the person's carrying when it was delivered (`delivered`, the said's time, null while it waits in the outbox);
 * a `call`, one tool call, its `sentence`, a `fact` (its duration) and its `state`;
 * a `session` line where one attempt ended and the next began;
 * a `question` and a `proposal`, named in the shape and built by nothing yet.
 */
export type ChatEvent =
  | { kind: 'message'; id: string; at: string; from: ChatFrom; text: string; delivered?: string | null }
  | { kind: 'call'; id: string; at: string; tool: string; sentence: string; fact?: string; state: CallState }
  | { kind: 'session'; id: string; at: string; attempt: number }
  | ({ kind: 'question' } & AskEvent)
  | ({ kind: 'proposal' } & AskEvent);

/**
 * A question of hers waiting on the person, or a proposal, which is one question whose choices explain nothing (`drawnAsk`): the
 * event's own id, when she asked it, `call` the id of the call of hers an answer is filed against, `text` the first question's words,
 * and every question as she asked it. `chose` is the person's answer once
 * they gave it, each question's by the question's own words, with `choseAt` when they did; both absent while it waits on them.
 * `cutAt` is when the call that asked it stopped waiting with nothing answered — her session was let go, or died, between the ask
 * and the answer — and says the board draws it as a question that is nobody's to answer now; absent while a call of its words is
 * waiting, and absent once the person answered it, an answer being what it means either way.
 */
export type AskEvent = {
  id: string;
  at: string;
  call: string;
  text: string;
  questions: AskQuestion[];
  chose?: Record<string, string>;
  choseAt?: string;
  cutAt?: string;
};

/** One choice of a question: what it reads as, what it means, and whether she recommended it. */
export type AskOption = { label: string; description: string; recommended: boolean };

/** One question of an ask: what it asks, the short word it is labelled by, its choices, and whether the person may pick several. */
export type AskQuestion = { question: string; header: string; options: AskOption[]; multiSelect: boolean };

/** An ask of hers as the chat keeps it: its own id, when she asked it, and its questions. */
export type Ask = { id: string; at: string; questions: AskQuestion[] };

/** The person's answer to an ask: which ask, when they answered, and each question's answer by the question's own words. */
export type AskAnswer = { id: string; at: string; answers: Record<string, string> };

/** The keeper's mark of an answer owed no longer: which ask, and how it reached her (`AnswerOwed`). */
export type AnswerMark = { id: string; how: AnswerOwed; at: string };

/**
 * The keeper's mark of what became of an ask's call: `cut`, no call of its words waits on the person any more, so the ask is
 * nobody's to answer; `again`, a call of hers is asking those words afresh, so it waits once more, and `call` is that call's own id,
 * which her restarted session gave it. The latest mark of an ask holds, which is how a question cut and asked again is drawn as the
 * one question it is without any line being rewritten, and how the answer to it finds the call that is waiting for it now.
 */
export type AskClose = { id: string; how: 'cut' | 'again'; at: string; call?: string };

/**
 * Where the task is: `up`, its session live; `answering`, a turn in progress; `waitsOnYou`, what waits on the person (the runs waiting,
 * and the task's own questions and proposals they have not answered); `unread`, the agent's messages after the person's read mark.
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
  asks: readonly Ask[];
  answers: readonly AskAnswer[];
  closed: readonly AskClose[];
  /** The task's phase in the engine's words, null where no task is filed. */
  phase: EnginePhase | null;
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

/** A tool call: done or failed by its result, else at work, or waiting on the person where the task needs one. */
function callOf(attempt: number, use: SourceEvent, result: SourceEvent | undefined, open: CallState): ChatEvent {
  const name = use.tool?.name ?? 'tool';
  const fact = result === undefined ? undefined : durationOf(use.at, result.at);
  const state: CallState = result === undefined ? open : result.result?.isError ? 'error' : 'done';
  return {
    kind: 'call',
    id: `t:${attempt}:${use.id}`,
    at: use.at,
    tool: name,
    sentence: sentenceOf(name, use.tool?.input),
    ...(fact === undefined ? {} : { fact }),
    state,
  };
}

/**
 * The chat events one transcript event is: the agent's text a message, a tool call a `call`, words a person wrote into the session's own
 * face (`origin: { kind: 'human' }`, the other face her session gives a person) a message of theirs, so the board reads as one
 * conversation whichever face it was written from; everything else none. Words the host pushed on her input carry no origin and are
 * drawn from the outbox, where they were written, so one sent message is one bubble.
 */
function eventsOf(attempt: number, e: SourceEvent, results: ReadonlyMap<string, SourceEvent>, open: CallState): ChatEvent[] {
  if (e.role === 'assistant' && e.kind === 'text' && (e.text ?? '').trim() !== '')
    return [{ kind: 'message', id: `m:${attempt}:${e.id}`, at: e.at, from: 'agent', text: e.text ?? '' }];
  if (e.role === 'user' && e.kind === 'text' && e.origin?.kind === 'human' && (e.text ?? '').trim() !== '')
    return [{ kind: 'message', id: `h:${attempt}:${e.id}`, at: e.at, from: 'person', text: e.text ?? '' }];
  if (e.kind === 'tool_use') return [callOf(attempt, e, results.get(e.id), open)];
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
function sessionEvents(session: ChatSession, said: readonly SourceSaid[], claims: ReadonlyMap<string, OutboxEntry>, open: CallState) {
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
  const answered = new Map(sources.answers.map((a) => [a.id, a]));
  const cut = cutOf(sources.closed);
  const asks = sources.asks.map((ask) => askEvent(ask, answered.get(ask.id), cut.get(ask.id)));
  const withAsks = placedInTime(out, asks);
  out.length = 0;
  out.push(...withAsks);
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

/** The suffix a recommended choice's label carries, as the question tool's own words tell her to write it. */
const RECOMMENDED = /\s*\(recommended\)\s*$/i;

/** One choice as the board draws it: its label without the suffix she marked it with, and `recommended` where it carried one. */
const optionOf = (o: { label: string; description: string }): AskOption => {
  const label = o.label.replace(RECOMMENDED, '');
  return { label, description: o.description, recommended: label !== o.label };
};

/**
 * An ask as the chat keeps it, off what the runtime says of the call her session holds open: each question as she asked it, each
 * choice's recommendation read out of its label (`RECOMMENDED`), since that is where the question tool's own words put it. Pure.
 */
export const askOf = (raw: {
  id: string;
  at: string;
  questions: readonly {
    question: string;
    header: string;
    options: readonly { label: string; description: string }[];
    multiSelect: boolean;
  }[];
}): Ask => ({
  id: raw.id,
  at: raw.at,
  questions: raw.questions.map((q) => ({
    question: q.question,
    header: q.header,
    options: q.options.map(optionOf),
    multiSelect: q.multiSelect,
  })),
});

/** The questions of an ask as one key: each question's own words, in order, so two asks of the same words key the same. Pure. */
export const askKey = (ask: Pick<Ask, 'questions'>): string => JSON.stringify(ask.questions.map((q) => q.question));

/** The id of the ask among `asks` asking the same questions as `ask` under another id, where there is one. Pure. */
export const sameWords = (asks: readonly Ask[], ask: Pick<Ask, 'id' | 'questions'>): string | undefined => {
  const key = askKey(ask);
  return asks.find((one) => one.id !== ask.id && askKey(one) === key)?.id;
};

/**
 * The answer already recorded for an ask of the same questions as `ask` under another id, the latest where there are several: what a
 * question she asks again — a restart cut her session between the ask and the answer, so she asks it afresh under a new call — is
 * answered from, rather than put to the person a second time. `undefined` where no earlier ask of those words was answered. Pure.
 */
export const answeredBefore = (
  asks: readonly Ask[],
  answers: readonly AskAnswer[],
  ask: Pick<Ask, 'id' | 'questions'>,
): AskAnswer | undefined => {
  const key = askKey(ask);
  const same = new Set(asks.filter((one) => one.id !== ask.id && askKey(one) === key).map((one) => one.id));
  return answers.filter((answer) => same.has(answer.id)).at(-1);
};

/** How the board draws an ask. */
export type AskDrawn = 'actions' | 'form' | 'many';

/**
 * Which drawing an ask takes: `many`, a tab per question and a Submit, for more than one question; `actions`, her proposal's buttons,
 * for one question whose every choice explains nothing — a description she deliberately left empty; `form`, the radio fieldset, for
 * every other one question. Pure.
 */
export const drawnAsk = (ask: Pick<Ask, 'questions'>): AskDrawn => {
  if (ask.questions.length !== 1) return 'many';
  const one = ask.questions[0];
  return one !== undefined && one.options.every((o) => o.description.trim() === '') ? 'actions' : 'form';
};

/** The event kind an ask is drawn as: a proposal where its drawing is her action buttons, a question otherwise. */
const kindOfAsk = (ask: Pick<Ask, 'questions'>): 'question' | 'proposal' => (drawnAsk(ask) === 'actions' ? 'proposal' : 'question');

/** An ask as the chat draws it, with the person's answer where they have given one. Pure. */
export const askEvent = (ask: Ask, answer: AskAnswer | undefined, cutAt?: string): ChatEvent => ({
  kind: kindOfAsk(ask),
  id: `q:${ask.id}`,
  at: ask.at,
  call: ask.id,
  text: ask.questions[0]?.question ?? '',
  questions: ask.questions,
  ...(answer === undefined ? {} : { chose: answer.answers, choseAt: answer.at }),
  ...(answer === undefined && cutAt !== undefined ? { cutAt } : {}),
});

/**
 * When each ask's call stopped waiting on the person, by the ask's id, off the keeper's marks: the latest mark of an ask is the one
 * that holds, so an ask marked `cut` and then `again` is waiting once more and is in no entry of this. Pure.
 */
export const cutOf = (closed: readonly AskClose[]): Map<string, string> => {
  const cut = new Map<string, string>();
  for (const mark of closed) {
    if (mark.how === 'cut') cut.set(mark.id, mark.at);
    else cut.delete(mark.id);
  }
  return cut;
};

/**
 * The call each ask's words are being asked by now, by the ask's id, off the keeper's marks: the `call` of the latest `again` mark of
 * an ask, which a later `cut` takes away. Her restarted session asks a cut question afresh under a call id of its own, and the chat
 * keeps the one ask under the first call's: this is what says where the person's answer to it goes, and whose taking of it to read.
 * Pure.
 */
export const callsOf = (closed: readonly AskClose[]): Map<string, string> => {
  const calls = new Map<string, string>();
  for (const mark of closed) {
    if (mark.how === 'again' && mark.call !== undefined) calls.set(mark.id, mark.call);
    else calls.delete(mark.id);
  }
  return calls;
};

/** What the person chose for one question: the question by its own words, the labels they ticked, or the words they wrote instead. */
export type AskPick = { question: string; labels?: readonly string[]; words?: string };

/**
 * The person's picks as the answer her held call takes: each question's answer by the question's own words, a multi-select's labels
 * joined with `", "`, and words of their own carried as the answer's value rather than any word of ours. Refused (`Invalid`) for a
 * question of the ask left out, a label that is no choice of it, words that are blank, and several labels for a question that takes
 * one. Pure.
 */
export function answerFor(ask: Pick<Ask, 'questions'>, picks: readonly AskPick[]): Record<string, string> {
  const answers: Record<string, string> = {};
  for (const q of ask.questions) {
    const pick = picks.find((p) => p.question === q.question);
    if (pick === undefined) throw new Invalid({ message: `\`${q.question}\` is not answered: answer every question of the ask.` });
    answers[q.question] = answerOne(q, pick);
  }
  return answers;
}

/** One question's answer, off the person's pick: their own words where they wrote some, else the labels they ticked. */
function answerOne(q: AskQuestion, pick: AskPick): string {
  if (pick.words !== undefined) {
    if (pick.words.trim() === '')
      throw new Invalid({ message: `the words answering \`${q.question}\` are empty: write something, or pick a choice.` });
    return pick.words;
  }
  const labels = pick.labels ?? [];
  if (labels.length === 0) throw new Invalid({ message: `\`${q.question}\` is not answered: pick a choice, or answer in your own words.` });
  if (labels.length > 1 && !q.multiSelect)
    throw new Invalid({ message: `\`${q.question}\` takes one choice, and ${labels.length} were picked: pick one.` });
  const stray = labels.find((label) => !q.options.some((o) => o.label === label));
  if (stray !== undefined)
    throw new Invalid({
      message: `\`${stray}\` is no choice of \`${q.question}\`: pick one of ${q.options.map((o) => `\`${o.label}\``).join(', ')}, or answer in your own words.`,
    });
  return labels.join(', ');
}

/** What an answer of the person's is owed: back through the call she holds open, said to her as words, or marked and nothing else. */
export type AnswerOwed = 'return' | 'words' | 'mark';

/**
 * What an answer is owed, off the two facts the runtime reports of its ask: `taken`, its held call took an answer already, so the
 * answer reached her and nothing is owed but the mark; `open`, its call is still waiting, so the answer goes back through it; neither,
 * so no call of it is waiting any more — a turn ended, a holder let go — and the answer is said to her as words. Pure.
 */
export const askDue = (open: boolean, taken: boolean): AnswerOwed => (taken ? 'mark' : open ? 'return' : 'words');

/**
 * The words an answer whose call was cut is said to her in, naming each question and what the person answered: she was asking, the
 * call did not wait for the answer, and this is it.
 */
export const askWords = (ask: Pick<Ask, 'questions'>, answers: Record<string, string>): string =>
  [
    'The person answered on the board a question of yours whose call did not wait for them.',
    ...ask.questions.map((q) => `You asked: ${q.question} They answered: ${answers[q.question] ?? '(nothing)'}`),
  ].join(' ');

/** Whether a chat event is an ask of hers, which the board draws as a proposal or a question. */
const asked = (e: ChatEvent): e is ChatEvent & { kind: 'question' | 'proposal' } => e.kind === 'question' || e.kind === 'proposal';

/**
 * How many asks of hers wait on the person: what joins the count her face shows. An ask whose call was cut with nothing answered
 * (`cutAt`) waits on nobody — nothing of hers is held open for it, and she has been told as much — so it is not counted, or a
 * session let go between a question and its answer would leave the count wrong for as long as the chat lasts. Pure.
 */
export const asksWaiting = (events: readonly ChatEvent[]): number =>
  events.filter((e) => asked(e) && e.chose === undefined && e.cutAt === undefined).length;

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
export type ChatCursor = {
  attempts: number;
  events: number;
  said: number;
  outbox: number;
  delivered: number;
  stops: number;
  asks: number;
  answers: number;
  closed: number;
};

/** The cursor of everything `sources` holds. Pure. */
export const cursorOf = (sources: ChatSources): ChatCursor => ({
  attempts: sources.sessions.length,
  events: sources.sessions.at(-1)?.events.length ?? 0,
  said: sources.said.length,
  outbox: sources.outbox.length,
  delivered: sources.delivered.length,
  stops: sources.stops.length,
  asks: sources.asks.length,
  answers: sources.answers.length,
  closed: sources.closed.length,
});

/** A cursor as a stream's event id: its counts, dot-separated. Pure. */
export const chatCursor = (c: ChatCursor): string =>
  [c.attempts, c.events, c.said, c.outbox, c.delivered, c.stops, c.asks, c.answers, c.closed].join('.');

/** How many counts a cursor holds, and the fewest a tab open across a deploy that added one still carries. */
const [COUNTS, COUNTS_LEAST] = [9, 5];

/**
 * The words a cursor no read gave is refused with. A chat event's own id is no cursor: what a stream resumes from is the `cursor` a read
 * answered, which the stream also writes as the `id` of each read's last event, so an `EventSource` sends it back as `Last-Event-ID`.
 */
const NOT_A_CURSOR = (text: string) =>
  `${text} is not a cursor a chat read gave: pass the \`cursor\` a read answered, which a stream writes as its last event's \`id\`, or none to read it whole.`;

/**
 * The cursor `text` names. A cursor of fewer counts than today's, which a tab open across the deploy that added one still carries,
 * reads as one that had seen none of what it does not count. Refused (`Invalid`) where it is not `COUNTS_LEAST` to `COUNTS` whole
 * counts. Pure.
 */
export function readChatCursor(text: string): ChatCursor {
  const parts = text.split('.');
  if (parts.length < COUNTS_LEAST || parts.length > COUNTS || parts.some((p) => !/^(0|[1-9]\d*)$/.test(p)))
    throw new Invalid({ message: NOT_A_CURSOR(text) });
  const [attempts = 0, events = 0, said = 0, outbox = 0, delivered = 0, stops = 0, asks = 0, answers = 0, closed = 0] = parts.map(Number);
  return { attempts, events, said, outbox, delivered, stops, asks, answers, closed };
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
    c.stops > sources.stops.length ||
    c.asks > sources.asks.length ||
    c.answers > sources.answers.length ||
    c.closed > sources.closed.length;
  if (beyond) throw new Invalid({ message: NOT_A_CURSOR(text) });
  const sessions = sources.sessions.slice(0, c.attempts);
  return {
    ...sources,
    sessions: last === undefined ? sessions : [...sessions.slice(0, -1), { ...last, events: last.events.slice(0, c.events) }],
    said: sources.said.slice(0, c.said),
    outbox: sources.outbox.slice(0, c.outbox),
    delivered: sources.delivered.slice(0, c.delivered),
    stops: sources.stops.slice(0, c.stops),
    asks: sources.asks.slice(0, c.asks),
    answers: sources.answers.slice(0, c.answers),
    closed: sources.closed.slice(0, c.closed),
  };
}

/** The events of `now` a reader of `then` has not seen as they are: new ones, and those whose state or delivery changed. Pure. */
export function changedSince(then: readonly ChatEvent[], now: readonly ChatEvent[]): ChatEvent[] {
  const seen = new Map(then.map((e) => [e.id, JSON.stringify(e)]));
  return now.filter((e) => seen.get(e.id) !== JSON.stringify(e));
}

/**
 * Which runtime phases are a session that is live, one that hears what is said to it: a session waiting (`idle`, `needs-human`,
 * `input-required`), at work (`working`, `quiescent`) or ending. Total, so a phase the runtime adds fails the typecheck until it is said.
 */
const UP: Record<EnginePhase, boolean> = {
  pending: false,
  starting: false,
  working: true,
  quiescent: true,
  'needs-human': true,
  'input-required': true,
  idle: true,
  restarting: false,
  'between-attempts': false,
  ending: true,
  succeeded: false,
  failed: false,
  stopped: false,
};

/** Which runtime phases are a turn in progress: a session at work, quiet or not. Total, as `UP` is. */
const ANSWERING: Record<EnginePhase, boolean> = {
  pending: false,
  starting: false,
  working: true,
  quiescent: true,
  'needs-human': false,
  'input-required': false,
  idle: false,
  restarting: false,
  'between-attempts': false,
  ending: false,
  succeeded: false,
  failed: false,
  stopped: false,
};

/** Whether a runtime phase is a session that is live: one that hears what is said to it (`UP`). */
export const upOf = (phase: EnginePhase): boolean => UP[phase];

/** Whether a runtime phase is a turn in progress (`ANSWERING`). */
const answeringOf = (phase: EnginePhase): boolean => ANSWERING[phase];

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
 * Where the task is, off its phase (none where no task is filed), the runs that wait on the person (`waiting`), its chat and the
 * person's read mark: `waitsOnYou` the runs waiting and the asks of its own the person has not answered (`asksWaiting`), unread the
 * agent's messages the mark leaves unread (`unreadOf`). Pure.
 */
export function presenceOf(
  phase: EnginePhase | undefined,
  waiting: number,
  events: readonly ChatEvent[],
  mark: ReadMark | undefined,
): Presence {
  const up = phase !== undefined && upOf(phase);
  return {
    up,
    answering: up && answeringOf(phase),
    waitsOnYou: waiting + asksWaiting(events),
    unread: unreadOf(events, mark),
  };
}
