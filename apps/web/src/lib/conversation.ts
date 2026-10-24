/**
 * The one turn shape both of the board's conversations draw — Nemia's chat and a step's session — and everything about it that is
 * pure, so a node test proves it without a browser: the item the family's list holds (`ConversationItem`, one of four kinds), the line
 * of a turn (`ConversationLine`), the state a line can be in (`ConversationState`) and the map from it to a trace line's
 * (`traceStatusOf`), the words a folded turn, a jump pill and a new line say (`turnWords`, `jumpWords`, `newWords`), how much of a
 * conversation is drawn, which is what a talk follows its latest by (`drawnCount`), and `mark`, the one writer of a family part's
 * data attribute.
 *
 * It knows nothing of either conversation's events: each maps its own onto this shape through an adapter of its own — hers is
 * `chatItems` in `lib/chatFollowing.ts` — so the family in `components/conversation/` draws one thing and names neither.
 */
import { duration } from './canvas.ts';
import type { TraceStatus } from '@/components/ui/trace';

/** What a line of a turn is doing: done draws plain, the other four each in their own state. */
export type ConversationState = 'done' | 'running' | 'error' | 'pending' | 'waits';

/** A trace line's state for each state a line can be in: done draws plain, so it takes none. */
const TRACE_STATUS: Record<ConversationState, TraceStatus | undefined> = {
  done: undefined,
  running: 'running',
  error: 'error',
  pending: 'pending',
  waits: 'yours',
};

/** How a trace line draws a line in the state `state`: alive at work, failure failed, at rest not begun, yours waiting on a person. */
export const traceStatusOf = (state: ConversationState): TraceStatus | undefined => TRACE_STATUS[state];

/**
 * One line of a turn: the tool it called, drawn by the tool's glyph, one sentence, a quiet fact beside it where there is one, the state
 * it is in, and what it asked and what came back where the conversation's adapter has either — a line with neither is drawn plain, and
 * one with either opens to show them.
 */
export type ConversationLine = {
  id: string;
  tool: string;
  sentence: string;
  fact?: string;
  state: ConversationState;
  input?: string;
  result?: string;
};

/** A link under what was said: the words it was written on, and the page of this board it leads to. */
export type ConversationLink = { words: string; href: string };

/**
 * One block of a conversation, as the family's list draws it. `said` is a bubble — `who` and `at` over it, `yours` for the person's
 * own at the right, `markdown` for words drawn as markdown rather than as they stand, and `links` for the buttons under them; `note`
 * is one quiet line, `what` saying which; `work` is a turn, open while one of its lines is at work and folded into `turnWords` once
 * none is, its lines counted as `counts`; and `own` is the family's one escape hatch, carrying whatever the caller draws itself (`Own`).
 */
export type ConversationItem<Own = never> =
  | {
      kind: 'said';
      id: string;
      who: string;
      at: string;
      text: string;
      markdown: boolean;
      yours: boolean;
      links: readonly ConversationLink[];
    }
  | { kind: 'note'; id: string; what: string; words: string }
  | { kind: 'work'; id: string; lines: readonly ConversationLine[]; running: boolean; ms: number; counts: Counted }
  | { kind: 'own'; id: string; own: Own };

/**
 * The one data attribute a family part writes: `what`, under the prefix its caller named, carrying `value` where there is one. A part
 * writes no `data-chat-` of its own, so each conversation keeps the names its pages read — hers `chat`, a step's session `session`.
 * A mark with no value is the attribute React writes for a bare one, which a page selects on its presence.
 */
export const mark = (prefix: string, what: string, value?: string): Record<string, string | true> => ({
  [`data-${prefix}-${what}`]: value ?? true,
});

/**
 * How much of `items` is drawn, counting a turn by its lines: the number a talk follows its latest by. A turn's lines are folded into
 * one item, so the count of the items alone stands still while a turn grows — and a talk that watched it would follow the first line
 * of a turn and then stand where it was for every line after, the growing turn pushing its foot off the screen.
 */
export const drawnCount = (items: readonly ConversationItem<unknown>[]): number =>
  items.reduce((drawn, item) => drawn + (item.kind === 'work' ? item.lines.length : 1), 0);

/**
 * What a turn's lines are, which its folded line counts them as: `call` where every line is a tool call (her chat), `step` where a line
 * may be a call, a thought or the harness's own (a step's session).
 */
export type Counted = 'call' | 'step';

/** The one line a folded turn says: `Worked for 2m 14s · 9 calls`, over `ms` and how many `lines` it holds, counted as `counts`. */
export const turnWords = (ms: number, lines: number, counts: Counted): string =>
  `Worked for ${duration(ms)} · ${lines === 1 ? `1 ${counts}` : `${lines} ${counts}s`}`;

/** The words the line between what was read and what is new says: `2 new`. */
export const newWords = (unread: number): string => (unread === 1 ? '1 new' : `${unread} new`);

/**
 * The words the pill over the talk says: `2 new · Jump to the latest`, and `Jump to the latest` alone where nothing is unread — a
 * conversation nothing is counted unread in (a step's session, which a person reads by opening it) still offers the way back.
 */
export const jumpWords = (unread: number): string => (unread === 0 ? 'Jump to the latest' : `${newWords(unread)} · Jump to the latest`);
