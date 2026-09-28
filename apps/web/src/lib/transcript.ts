/**
 * A step's conversation as the board draws it: the engine's transcript events, folded into turns.
 *
 * Pure, so the rules are held by tests without a browser (test/transcript.test.ts). The events are the engine's
 * (`TranscriptEvent`, via GET …/transcript), in the order its reads gave them; the turns are what the session page
 * and the inspector's Activity tab draw, in the same order.
 *
 * Folding follows Claude Code web: the tool calls between two things said fold into one line — "Ran 3 commands,
 * searched code, read 3 files" — that opens to the calls. A thought or a system line between two calls rides in the fold;
 * one before the first call or after the last is drawn on its own. A lone call is drawn as itself. The closeout — the
 * `StructuredOutput` call — is never folded: it is named, on its own, and it ends a fold as words do.
 */
import type { Said, TranscriptEvent } from './api';

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
/** Words a person said to the session (`wf say`, or the session page's prompt box), off the engine's journal of the step's task: "you said" — and when the session's transcript shows them reaching it (`heardIn`). */
export type ToldTurn = { kind: 'told'; key: string; at: string; attempt: number; text: string; arrived: string | null };
/** What a fold holds, in order: its calls, and the thoughts and system lines between them. */
export type FoldedTurn = ToolTurn | ThinkingTurn | SystemTurn;
/** Two or more calls with nothing said between them. `failed` counts results that are errors; `waiting`, calls with no result yet. */
export type ToolsTurn = {
  kind: 'tools';
  key: string;
  summary: string;
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

/** The events as turns. See the file's comment for the rules. */
export function foldTranscript(events: readonly TranscriptEvent[]): Turn[] {
  const turns: Turn[] = [];
  const calls = new Map<string, ToolCall>();
  // Everything since the last thing said: calls, and the thoughts and system lines around them. Drawn once it ends.
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
        // A result whose call is not in what was read — a transcript cut short at its start — is still shown.
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
        // Nothing said is not a pause between calls.
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
    const { kind } = turns[i]!;
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
      return timeOf(turn.turns[0]!);
    default:
      return Date.parse(turn.at);
  }
};

/** What was said to a session (`Said`), with when the session's own transcript shows its words reaching it — null until it does. */
export type Heard = Said & { arrived: string | null };

/** How long before its entry the transcript may show words said: the engine hands the words over first, and journals them after. */
const ARRIVAL_SLACK_MS = 5_000;

/**
 * Whether a transcript event is the session's own record of `said` reaching it: a system line whose text is the words, as a working session
 * writes them when it reads them between calls — or ends with them, after Claude Code's line saying another session sent them ("Another Claude
 * session sent a message:"), as an idle one starts its next turn with them — written no earlier than the words were handed over.
 */
const arrivalOf = (event: TranscriptEvent, said: Said): boolean => {
  if (!(event.kind === 'system' || (event.kind === 'text' && event.role === 'system'))) return false;
  if (!(Date.parse(event.at) >= Date.parse(said.at) - ARRIVAL_SLACK_MS)) return false;
  const text = (event.text ?? '').trim();
  const words = said.text.trim();
  return text === words || text.endsWith(`\n${words}`);
};

/**
 * What was said to a session, each with the first of the session's events that shows its words reaching it (`arrived`), and the events without
 * those. The session's line for words it was handed is the same words, so a person reads them once, as what they said (`withSaid`), where they
 * reached the session. Matched in the order said, each thing said to one event at most: words said twice are two arrivals. Words the transcript
 * does not show — queued behind a prompt nobody answers (agent-runtime's open issue 16), or set aside (issue 12) — have none, and every other
 * line stays the session's. Nothing said leaves the events as they were.
 */
export function heardIn(events: readonly TranscriptEvent[], said: readonly Said[]): { events: TranscriptEvent[]; said: Heard[] } {
  const taken = new Set<number>();
  const heard = [...said]
    .sort((a, b) => Date.parse(a.at) - Date.parse(b.at))
    .map((s): Heard => {
      const i = events.findIndex((event, j) => !taken.has(j) && arrivalOf(event, s));
      if (i === -1) return { ...s, arrived: null };
      taken.add(i);
      return { ...s, arrived: events[i]!.at };
    });
  return { events: events.filter((_, i) => !taken.has(i)), said: heard };
}

/**
 * The turns, with what a person said to the session laid in among them (off the engine's journal of the step's task, through `heardIn`): each a
 * turn of its own, "you said", placed where its words reached the session when its transcript shows that, and otherwise when they were said —
 * before the first turn that came after, and after a fold that began before, since a fold is one line. Words after everything the transcript has
 * are last. Nothing said leaves the turns as they were.
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
    while (next < told.length && placed(told[next]!) < timeOf(turn)) out.push(told[next++]!);
    out.push(turn);
  }
  return [...out, ...told.slice(next)];
}

/** A stretch as it is drawn: what comes before its first call and after its last on its own, and between them one fold — or the call itself, when there is one. */
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
    key: `tools:${calls[0]!.id}`,
    summary: summaryOf(calls),
    turns: folded,
    calls: calls.length,
    failed: calls.filter((call) => call.result?.isError).length,
    waiting: calls.filter((call) => !call.result).length,
  };
  return [...stretch.slice(0, first), tools, ...stretch.slice(last + 1)];
}

/** How a kind of call is counted and said: `one` for a count of one, `many` for more. */
type Verb = { group: string; one: string; many: (n: number) => string; subject?: (input: Record<string, unknown>) => string[] };

const onePath = (input: Record<string, unknown>) => {
  const file = input.file_path ?? input.notebook_path;
  return typeof file === 'string' ? [file] : [];
};

const VERBS: Record<string, Verb> = {
  Bash: { group: 'command', one: 'ran a command', many: (n) => `ran ${n} commands` },
  Read: { group: 'read', one: 'read a file', many: (n) => `read ${n} files`, subject: onePath },
  Grep: { group: 'search', one: 'searched code', many: (n) => `searched code ${n} times` },
  Edit: { group: 'edit', one: 'edited a file', many: (n) => `edited ${n} files`, subject: onePath },
  WebSearch: { group: 'web', one: 'searched the web', many: (n) => `searched the web ${n} times` },
  WebFetch: { group: 'fetch', one: 'fetched a page', many: (n) => `fetched ${n} pages` },
  Task: { group: 'agent', one: 'ran an agent', many: (n) => `ran ${n} agents` },
  TodoWrite: { group: 'todo', one: 'updated its plan', many: (n) => `updated its plan ${n} times` },
};
// The same act under another name: Claude Code's other search and edit tools, and Codex's two items.
VERBS.Glob = VERBS.Grep!;
VERBS.Write = VERBS.Edit!;
VERBS.MultiEdit = VERBS.Edit!;
VERBS.NotebookEdit = VERBS.Edit!;
VERBS.Agent = VERBS.Task!;
VERBS.CommandExecution = VERBS.Bash!;
VERBS.FileChange = {
  ...VERBS.Edit!,
  subject: (input) => (input.changes && typeof input.changes === 'object' ? Object.keys(input.changes) : []),
};

/** An MCP tool by its server — `mcp__playwright__browser_click` is `playwright` — and any other by its name. */
const verbOf = (name: string): Verb => {
  if (Object.hasOwn(VERBS, name)) return VERBS[name]!;
  const used = /^mcp__(.+?)__/.exec(name)?.[1] ?? name;
  return { group: `use:${used}`, one: `used ${used}`, many: (n) => `used ${used} ${n} times` };
};

/**
 * What a run of calls did, in the words Claude Code web uses — "Ran 3 commands, searched code, read 3 files" — each kind
 * in the order it first came. Files are counted once each, however often they were read or edited; a call that names no
 * file counts once.
 */
export function summaryOf(calls: readonly ToolCall[]): string {
  const counted = new Map<string, { verb: Verb; calls: number; subjects: Set<string> }>();
  for (const call of calls) {
    const verb = verbOf(call.name);
    const seen = counted.get(verb.group) ?? { verb, calls: 0, subjects: new Set<string>() };
    counted.set(verb.group, seen);
    const subjects = verb.subject?.(inputOf(call)) ?? [];
    if (subjects.length) subjects.forEach((s) => seen.subjects.add(s));
    else seen.calls += 1;
  }
  const said = [...counted.values()]
    .map(({ verb, calls: n, subjects }) => (n + subjects.size === 1 ? verb.one : verb.many(n + subjects.size)))
    .join(', ');
  return said.charAt(0).toUpperCase() + said.slice(1);
}

const inputOf = (call: ToolCall): Record<string, unknown> =>
  call.input && typeof call.input === 'object' && !Array.isArray(call.input) ? (call.input as Record<string, unknown>) : {};

/** The one thing a call was about, for its line — a command, a file, a pattern, an address — on one line. Null when its input names none. */
export function detailOf(call: ToolCall): string | null {
  const input = inputOf(call);
  // Codex gives a command as its argv: `['/bin/bash', '-lc', 'npm test']`.
  const command = Array.isArray(input.command) ? input.command.at(-1) : input.command;
  const said = [command, input.file_path, input.notebook_path, input.pattern, input.url, input.query, input.description, input.path].find(
    (value): value is string => typeof value === 'string' && value.trim() !== '',
  );
  if (said !== undefined) return said.trim().split('\n')[0]!;
  if (call.name === 'FileChange' && input.changes && typeof input.changes === 'object')
    return Object.keys(input.changes).join(', ') || null;
  return null;
}

/** A closeout in the shape every step's is asked for, or null for a statement in any other. */
export type Closeout = { outcome: string; summary: string; needs: string | null; artifacts: string[] };

export function closeoutOf(call: ToolCall): Closeout | null {
  const input = inputOf(call);
  if (typeof input.outcome !== 'string' || typeof input.summary !== 'string') return null;
  return {
    outcome: input.outcome,
    summary: input.summary,
    needs: typeof input.needs === 'string' && input.needs ? input.needs : null,
    artifacts: Array.isArray(input.artifacts) ? input.artifacts.filter((a): a is string => typeof a === 'string') : [],
  };
}
