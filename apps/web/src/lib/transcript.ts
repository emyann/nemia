/**
 * A step's conversation as the board draws it: the engine's transcript events, folded into turns.
 *
 * Pure, so the rules are held by tests without a browser (test/transcript.test.ts). The events are the engine's
 * (`TranscriptEvent`, via GET …/transcript), in the order its reads gave them; the turns are what the session page
 * and the inspector's Activity tab draw, in the same order.
 *
 * Folding follows Claude Code web: the tool calls between two things said fold into one turn that opens to the calls. A
 * thought or a system line between two calls rides in the fold; one before the first call or after the last is drawn on
 * its own. A lone call is drawn as itself. The closeout — the `StructuredOutput` call — is never folded: it is named, on
 * its own, and it ends a fold as words do.
 *
 * Beside it, `lib/sessionItems.ts` maps these turns onto the one shape both of the board's conversations are drawn by
 * (`lib/conversation.ts`), as `chatItems` is hers: a file of its own, since the two together pass the 500 lines a file is
 * held to.
 */
import type { RunDetail, Said, StepTry, TranscriptEvent } from './api';

/**
 * The task whose conversation a step has to read: its current try's, once an attempt of it has started — on its current turn, or on a
 * turn before it under the same id, as a task held open and answered is, whose answer waits for a slot with no attempt on its turn yet.
 * Null for a step not filed, and for one filed whose session has not started — waiting for a slot, or a task the engine has no record
 * of — which has none to read. `tries` are the step's, each with its own turn's attempts.
 */
export const sessionToRead = (
  step: Pick<RunDetail['steps'][number], 'taskId' | 'attempts'> & { tries: readonly Pick<StepTry, 'taskId' | 'attempts'>[] },
): string | null =>
  step.attempts.count > 0 || step.tries.some((t) => t.taskId === step.taskId && t.attempts.count > 0) ? step.taskId : null;

/** The tool a Claude Code session gives its closeout with. Codex gives its closeout as its last words, which are said. */
export const CLOSEOUT_TOOL = 'StructuredOutput';

/** A tool call and, once the transcript has it, its result: paired by the call's id, which its result carries. */
export type ToolCall = {
  id: string;
  at: string;
  name: string;
  input: unknown;
  result: { text: string; isError: boolean } | null;
};

export type SaidTurn = { kind: 'said'; key: string; at: string; role: 'user' | 'assistant'; text: string };
/** `text` is null when the harness kept none: Claude Code often writes a thought with its text empty. */
export type ThinkingTurn = { kind: 'thinking'; key: string; at: string; text: string | null };
export type ToolTurn = { kind: 'tool'; key: string; call: ToolCall };
export type SystemTurn = { kind: 'system'; key: string; at: string; text: string };
export type CloseoutTurn = { kind: 'closeout'; key: string; call: ToolCall };
/**
 * Words a person said to the session (the CLI's `say`, or the session page's prompt box), off the engine's journal of the step's task: "you
 * said" — and when the session's transcript shows them reaching it (`heardIn`).
 */
export type ToldTurn = { kind: 'told'; key: string; at: string; attempt: number; text: string; arrived: string | null };
/** What a fold holds, in order: its calls, and the thoughts and system lines between them. */
export type FoldedTurn = ToolTurn | ThinkingTurn | SystemTurn;
/** Two or more calls with nothing said between them. `failed` counts results that are errors; `waiting`, calls with no result yet. */
export type ToolsTurn = {
  kind: 'tools';
  key: string;
  turns: FoldedTurn[];
  calls: number;
  failed: number;
  waiting: number;
};

/** One thing the page draws. `key` stays the same while the conversation grows, so React keeps what a reader opened. */
export type Turn = SaidTurn | ThinkingTurn | ToolTurn | ToolsTurn | CloseoutTurn | SystemTurn | ToldTurn;

/** An event is unique by its `id` and `kind` together: a tool result carries its call's id. */
const keyOf = (event: TranscriptEvent) => `${event.kind}:${event.id}`;

/**
 * `known` with `incoming` added: an event already known is replaced where it stands, and a new one goes on the end.
 *
 * The stream sends an event again when a reader reconnects partway through a read, and the engine reads a transcript
 * that was replaced from its start; either way each event is kept once.
 */
export function mergeEvents(known: readonly TranscriptEvent[], incoming: readonly TranscriptEvent[]): TranscriptEvent[] {
  const merged = [...known];
  if (!incoming.length) return merged;
  const where = new Map(merged.map((event, i) => [keyOf(event), i]));
  for (const event of incoming) {
    const i = where.get(keyOf(event));
    if (i === undefined) {
      where.set(keyOf(event), merged.length);
      merged.push(event);
    } else {
      merged[i] = event;
    }
  }
  return merged;
}

/**
 * The events as turns, by the rules the file's head gives. A result whose call is not in what was read — a transcript cut short at its
 * start — is still shown, as a call of an unknown tool; a `text` event that says nothing is no pause between calls.
 */
export function foldTranscript(events: readonly TranscriptEvent[]): Turn[] {
  const turns: Turn[] = [];
  const calls = new Map<string, ToolCall>();
  let stretch: FoldedTurn[] = [];
  const end = () => {
    turns.push(...drawn(stretch));
    stretch = [];
  };

  for (const event of events) {
    switch (event.kind) {
      case 'tool_use': {
        const call: ToolCall = {
          id: event.id,
          at: event.at,
          name: event.tool?.name ?? 'unknown tool',
          input: event.tool?.input,
          result: null,
        };
        calls.set(event.id, call);
        if (call.name === CLOSEOUT_TOOL) {
          end();
          turns.push({ kind: 'closeout', key: `closeout:${event.id}`, call });
        } else {
          stretch.push({ kind: 'tool', key: `tool:${event.id}`, call });
        }
        break;
      }
      case 'tool_result': {
        const result = { text: event.result?.text ?? '', isError: event.result?.isError ?? false };
        const call = calls.get(event.id);
        if (call) call.result = result;
        else
          stretch.push({
            kind: 'tool',
            key: `tool:${event.id}`,
            call: { id: event.id, at: event.at, name: 'unknown tool', input: undefined, result },
          });
        break;
      }
      case 'thinking':
        stretch.push({ kind: 'thinking', key: `thinking:${event.id}`, at: event.at, text: event.text?.trim() ? event.text : null });
        break;
      case 'system':
        stretch.push({ kind: 'system', key: `system:${event.id}`, at: event.at, text: event.text ?? '' });
        break;
      case 'text':
        if (!event.text?.trim()) break;
        end();
        if (event.role === 'system') turns.push({ kind: 'system', key: `system:${event.id}`, at: event.at, text: event.text });
        else turns.push({ kind: 'said', key: `said:${event.id}`, at: event.at, role: event.role, text: event.text });
        break;
    }
  }
  end();
  return turns;
}

/**
 * Where the conversation's tail begins: the first turn after the last thing said — words, or the closeout — and 0 when nothing
 * has been. A call in the tail with no result may still be answered while the session is live: Claude Code writes a batch of
 * parallel calls a line each, and their results after all of them, so every call of a batch waits at once. Before the tail,
 * the session has moved on, and a call with no result had none.
 */
export function tailStart(turns: readonly Turn[]): number {
  for (let i = turns.length - 1; i >= 0; i--) {
    const { kind } = turns[i];
    if (kind === 'said' || kind === 'closeout') return i + 1;
  }
  return 0;
}

/** When a turn happened: its own time, its call's, or its fold's first. `NaN` for a time that does not parse. */
const timeOf = (turn: Turn): number => {
  switch (turn.kind) {
    case 'tool':
    case 'closeout':
      return Date.parse(turn.call.at);
    case 'tools':
      return timeOf(turn.turns[0]);
    default:
      return Date.parse(turn.at);
  }
};

/** What was said to a session (`Said`), with when the session's own transcript shows its words reaching it — null until it does. */
export type Heard = Said & { arrived: string | null };

/**
 * Whether a transcript event is the session's own record of `said` reaching it: a system line whose text is the words, as a working session
 * writes them when it reads them between calls — or ends with them, after Claude Code's line saying another session sent them ("Another
 * Claude session sent a message:"), as an idle one starts its next turn with them. Where it stands is `heardIn`'s to judge, never its time.
 */
const arrivalOf = (event: TranscriptEvent, said: Said): boolean => {
  if (!(event.kind === 'system' || (event.kind === 'text' && event.role === 'system'))) return false;
  const text = (event.text ?? '').trim();
  const words = said.text.trim();
  return text === words || text.endsWith(`\n${words}`);
};

/**
 * The first of `events` that may show `said`'s words reaching the session: the one after its mark (`after`, the transcript's last event
 * before the words were handed over), the first when it has none, and none — the length of `events` — while the mark is not among them.
 */
const firstAfter = (events: readonly TranscriptEvent[], said: Said): number => {
  if (said.after === null) return 0;
  const { kind, id } = said.after;
  const mark = events.findIndex((event) => event.kind === kind && event.id === id);
  return mark === -1 ? events.length : mark + 1;
};

/**
 * What was said to a session, each with the first of the session's events after its mark (`firstAfter`) that shows its words reaching it
 * (`arrived`), and the events without those. The session's line for words it was handed is the same words, so a person reads them once, as
 * what they said (`withSaid`), where they reached the session. Judged by the transcript's order alone, since `at` is the api's clock and an
 * event's the session's: a line before the mark was there before the words, whenever it is stamped. Matched in the order said, each thing
 * said to one event at most: words said twice are two arrivals. Words the transcript does not show — queued behind a prompt nobody answers,
 * or set aside — have none, and every other line stays the session's. Nothing said leaves the events as they were.
 */
export function heardIn(events: readonly TranscriptEvent[], said: readonly Said[]): { events: TranscriptEvent[]; said: Heard[] } {
  const taken = new Set<number>();
  const heard = [...said]
    .sort((a, b) => Date.parse(a.at) - Date.parse(b.at))
    .map((s): Heard => {
      const from = firstAfter(events, s);
      const i = events.findIndex((event, j) => j >= from && !taken.has(j) && arrivalOf(event, s));
      if (i === -1) return { ...s, arrived: null };
      taken.add(i);
      return { ...s, arrived: events[i].at };
    });
  return { events: events.filter((_, i) => !taken.has(i)), said: heard };
}

/**
 * The turns, with what a person said to the session laid in among them (off the engine's journal of the step's task, through `heardIn`):
 * each a turn of its own, "you said", placed where its words reached the session when its transcript shows that, and otherwise when they
 * were said — before the first turn that came after, and after a fold that began before, since a fold is one line. Words after everything
 * the transcript has are last. Nothing said leaves the turns as they were. Placed by time, since a turn holds no mark to stand after: an
 * arrival by the session's own clock, as its turns are, and only words not seen yet by the api's.
 */
export function withSaid(turns: readonly Turn[], said: ReadonlyArray<Said & { arrived?: string | null }>): Turn[] {
  const placed = (s: { at: string; arrived?: string | null }) => Date.parse(s.arrived ?? s.at);
  const told: ToldTurn[] = [...said]
    .sort((a, b) => placed(a) - placed(b))
    .map((s) => ({
      kind: 'told',
      key: `told:${s.attempt}:${s.at}`,
      at: s.at,
      attempt: s.attempt,
      text: s.text,
      arrived: s.arrived ?? null,
    }));
  const out: Turn[] = [];
  let next = 0;
  for (const turn of turns) {
    while (next < told.length && placed(told[next]) < timeOf(turn)) out.push(told[next++]);
    out.push(turn);
  }
  return [...out, ...told.slice(next)];
}

/**
 * A stretch as it is drawn: what comes before its first call and after its last on its own, and between them one fold — or the call itself,
 * when there is one.
 */
function drawn(stretch: FoldedTurn[]): Turn[] {
  let first = -1;
  let last = -1;
  stretch.forEach((turn, i) => {
    if (turn.kind !== 'tool') return;
    if (first === -1) first = i;
    last = i;
  });
  if (first === -1 || first === last) return stretch;
  const folded = stretch.slice(first, last + 1);
  const calls = folded.flatMap((turn) => (turn.kind === 'tool' ? [turn.call] : []));
  const tools: ToolsTurn = {
    kind: 'tools',
    key: `tools:${calls[0].id}`,
    turns: folded,
    calls: calls.length,
    failed: calls.filter((call) => call.result?.isError).length,
    waiting: calls.filter((call) => !call.result).length,
  };
  return [...stretch.slice(0, first), tools, ...stretch.slice(last + 1)];
}

const inputOf = (call: ToolCall): Record<string, unknown> =>
  call.input && typeof call.input === 'object' && !Array.isArray(call.input) ? (call.input as Record<string, unknown>) : {};

/**
 * The one thing a call was about, for its line — a command, a file, a pattern, an address — on one line. Null when its input names none. A
 * command Codex gives as its argv, `['/bin/bash', '-lc', 'npm test']`, is its last word.
 */
export function detailOf(call: ToolCall): string | null {
  const input = inputOf(call);
  const command = Array.isArray(input.command) ? input.command.at(-1) : input.command;
  const said = [command, input.file_path, input.notebook_path, input.pattern, input.url, input.query, input.description, input.path].find(
    (value): value is string => typeof value === 'string' && value.trim() !== '',
  );
  if (said !== undefined) return said.trim().split('\n')[0];
  if (call.name === 'FileChange' && input.changes && typeof input.changes === 'object')
    return Object.keys(input.changes).join(', ') || null;
  return null;
}

/** The longest summary a reader shows, an ellipsis included: the api's rule, said again here since the board imports no package. */
export const SUMMARY_MAX = 120;

/**
 * A summary's one line as the board draws it, as text: a markdown heading's marks dropped, since a closeout given before v1 opens its
 * summary with its body's first line, often a heading, which its body draws as one beneath it.
 */
export const summaryShown = (summary: string): string => summary.replace(/^#{1,6}\s+/, '');

/**
 * Whether `body` opens with `summary`: its first non-empty line, a heading's marks dropped, begins with the summary as drawn, a cut one
 * up to its ellipsis. A reader that draws the body whole then draws no summary line above it, which would say the line twice.
 */
export function bodyLeadsWith(summary: string, body: string | null): boolean {
  if (!body) return false;
  const first = summaryShown(
    body
      .split('\n')
      .map((line) => line.trim())
      .find(Boolean) ?? '',
  );
  const shown = summaryShown(summary.trim());
  const lead = shown.endsWith('…') ? shown.slice(0, -1).trimEnd() : shown;
  return lead !== '' && first.startsWith(lead);
}

/**
 * A summary as every reader shows it: its first non-empty line, trimmed, and when that is longer than `SUMMARY_MAX` it is cut at the
 * last space that leaves room for an ellipsis, or hard where it has none, and ends `…`.
 */
export function summaryLine(text: string): string {
  const line =
    text
      .split('\n')
      .map((l) => l.trim())
      .find(Boolean) ?? '';
  if (line.length <= SUMMARY_MAX) return line;
  const room = line.slice(0, SUMMARY_MAX - 1);
  const space = room.lastIndexOf(' ');
  return `${(space > 0 ? room.slice(0, space) : room).trimEnd()}…`;
}

/**
 * A closeout in the shape every step's is asked for, either version, or null for a statement in any other: its summary one line
 * (`summaryLine`), its body the markdown beneath, led by the whole summary where the cut changed it; its files by path and its values by
 * name. One given before the envelope was versioned has no body of its own.
 */
export type Closeout = {
  outcome: string;
  summary: string;
  body: string | null;
  needs: string | null;
  artifacts: string[];
  values: Array<{ name: string; value: string }>;
};

export function closeoutOf(call: ToolCall): Closeout | null {
  const input = inputOf(call);
  if (typeof input.outcome !== 'string' || typeof input.summary !== 'string') return null;
  const summary = summaryLine(input.summary);
  const lead = input.summary.trim() !== summary ? input.summary.trim() : '';
  const given = input.apiVersion !== undefined && typeof input.body === 'string' ? input.body.trim() : '';
  const list: unknown[] = Array.isArray(input.artifacts) ? input.artifacts : [];
  const files = list.flatMap((a) => (typeof a === 'string' ? [a] : isPath(a) ? [a.path] : []));
  return {
    outcome: input.outcome,
    summary,
    body: [lead, given].filter(Boolean).join('\n\n') || null,
    needs: typeof input.needs === 'string' && input.needs ? input.needs : null,
    artifacts: files,
    values: list.filter(isValue).map((a) => ({ name: a.name, value: a.value })),
  };
}

/** Whether an artifact is a file by its path, `{path}`. */
const isPath = (a: unknown): a is { path: string } =>
  typeof a === 'object' && a !== null && typeof (a as { path?: unknown }).path === 'string';

/** Whether an artifact is a value by its name, `{name, value}`, and no file. */
const isValue = (a: unknown): a is { name: string; value: string } =>
  !isPath(a) &&
  typeof a === 'object' &&
  a !== null &&
  typeof (a as { name?: unknown }).name === 'string' &&
  typeof (a as { value?: unknown }).value === 'string';
