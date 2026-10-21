/**
 * A step's session on the one shape both of the board's conversations are drawn by (`lib/conversation.ts`): its adapter onto that
 * shape, as `chatItems` (`lib/chatFollowing.ts`) is Nemia's chat's.
 *
 * Beside the fold it reads (`lib/transcript.ts`), and a file of its own because the two together pass the 500 lines a file is held to.
 * Pure, so a node test proves the whole mapping without a browser (test/transcript.test.ts).
 */
import type { ConversationItem, ConversationLine } from './conversation.ts';
import { detailOf, tailStart, type FoldedTurn, type SystemTurn, type ThinkingTurn, type ToolCall, type Turn } from './transcript.ts';

/**
 * What a step's session has that the family's turn shape has no arm for, carried on its `own` arm and drawn by the step's own parts
 * (`components/session/SessionOwn.tsx`): the brief it was told, folded to a line that opens; the words a person said to it while it ran;
 * and its closeout.
 */
export type SessionOwn =
  | { what: 'brief'; text: string }
  | { what: 'told'; at: string; attempt: number; text: string; arrived: string | null }
  | { what: 'closeout'; call: ToolCall };

/** The tool name a thought's line carries, and a line from the harness's: the two lines of a turn that called nothing. */
export const [THOUGHT_TOOL, HARNESS_TOOL] = ['Thinking', 'Harness'];

/** What a call asked, as the line draws it: its input as JSON, indented, so a long one reads as more than one line. */
const askedIn = (call: ToolCall): string | undefined => (call.input === undefined ? undefined : JSON.stringify(call.input, null, 2));

/**
 * One call as a line of a turn: the tool's glyph and name, the one thing it was about beside it (`detailOf`), and what it asked and what
 * came back, which the line opens to. Failed where its result says so, done where it has one, and otherwise running while the session may
 * still answer it (`running`) — at rest once it cannot.
 */
const callLine = (call: ToolCall, running: boolean): ConversationLine => {
  const fact = detailOf(call);
  const asked = askedIn(call);
  return {
    id: call.id,
    tool: call.name,
    sentence: call.name,
    ...(fact === null ? {} : { fact }),
    state: call.result ? (call.result.isError ? 'error' : 'done') : running ? 'running' : 'pending',
    ...(asked === undefined ? {} : { input: asked }),
    ...(call.result === null ? {} : { result: call.result.text }),
  };
};

/** A thought as a line of a turn: what it says is behind the line, as a call's result is, and a thought with no text kept says so. */
const thoughtLine = (turn: ThinkingTurn): ConversationLine => ({
  id: turn.key,
  tool: THOUGHT_TOOL,
  sentence: turn.text === null ? 'Thought, with no text kept' : 'Thought',
  state: 'done',
  ...(turn.text === null ? {} : { result: turn.text }),
});

/** A line the harness wrote between two calls, as a line of the turn it rides in: its words behind the line. */
const harnessLine = (turn: SystemTurn): ConversationLine => ({
  id: turn.key,
  tool: HARNESS_TOOL,
  sentence: 'A line from the harness',
  state: 'done',
  result: turn.text,
});

/** When a line of a fold happened: its call's time, or its own. */
const foldedAt = (turn: FoldedTurn): number => Date.parse(turn.kind === 'tool' ? turn.call.at : turn.at);

/** How long a fold took, first line to last: 0 where either moment does not parse, as a fold of one line is. */
const spanOf = (turns: readonly FoldedTurn[]): number => {
  const ms = foldedAt(turns[turns.length - 1]) - foldedAt(turns[0]);
  return Number.isFinite(ms) && ms > 0 ? ms : 0;
};

/** A fold's lines, in the order they came: its calls, the thoughts among them, and the harness's lines. */
const linesOf = (turns: readonly FoldedTurn[], running: boolean): ConversationLine[] =>
  turns.map((turn) =>
    turn.kind === 'tool' ? callLine(turn.call, running) : turn.kind === 'thinking' ? thoughtLine(turn) : harnessLine(turn),
  );

/** A turn of work on the family's shape: open while one of its calls may still be answered, folded into one line once none may. */
const workOf = (key: string, turns: readonly FoldedTurn[], running: boolean): ConversationItem<SessionOwn> => ({
  kind: 'work',
  id: key,
  lines: linesOf(turns, running),
  running: running && turns.some((turn) => turn.kind === 'tool' && turn.call.result === null),
  ms: spanOf(turns),
});

/**
 * A step's session on the one shape the family draws (`lib/conversation.ts`), its adapter onto it, `who` naming whoever says its words:
 * its calls, the thoughts among them and the lines the harness wrote into `work` turns a line each; its own words into `said`, drawn as
 * markdown; a line the harness wrote between two things said into a `note`; and its brief, the words a person told it and its closeout
 * onto the shape's `own` arm, which `components/session/` draws.
 *
 * `live` is whether the session may still add to it: a call with no result in the conversation's tail (`tailStart`) may still be answered
 * while it is, since a batch of parallel calls is answered after all of it, and had no answer once it is not. Pure: a node test proves the
 * whole mapping without a browser.
 */
export function sessionItems(turns: readonly Turn[], who: string, live: boolean): ConversationItem<SessionOwn>[] {
  const tail = tailStart(turns);
  const own = (key: string, what: SessionOwn): ConversationItem<SessionOwn> => ({ kind: 'own', id: key, own: what });
  return turns.map((turn, i) => {
    const running = live && i >= tail;
    switch (turn.kind) {
      case 'said':
        return turn.role === 'user'
          ? own(turn.key, { what: 'brief', text: turn.text })
          : { kind: 'said', id: turn.key, who, at: turn.at, text: turn.text, markdown: true, yours: false, links: [] };
      case 'told':
        return own(turn.key, { what: 'told', at: turn.at, attempt: turn.attempt, text: turn.text, arrived: turn.arrived });
      case 'closeout':
        return own(turn.key, { what: 'closeout', call: turn.call });
      case 'system':
        return { kind: 'note', id: turn.key, what: 'system', words: turn.text };
      case 'tools':
        return workOf(turn.key, turn.turns, running);
      default:
        return workOf(turn.key, [turn], running);
    }
  });
}
