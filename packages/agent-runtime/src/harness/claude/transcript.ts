/**
 * A Claude Code session's transcript, read: where it is, the closeout it gave, its lines as events, and what it
 * consumed. Read by both runners that run Claude Code — `claude --bg` (`harness/claude/bg.ts`) and `claude -p`
 * (`harness/claude/code.ts`) — and `renderTranscript` by the Agent SDK's (`harness/sdk.ts`).
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import type { Usage } from '../../core/index.ts';
import type { TranscriptEvent } from '../seam.ts';
import { readTextAsync } from '../../core/engine/tally.ts';
import { isoTime } from '../transcript.ts';
import { type ContentBlock, decodeLine, type Line, lineOf, writtenAt } from './lines.ts';

/** The folder Claude Code writes its transcripts under, one folder per project: `projects` in `CLAUDE_CONFIG_DIR` or `~/.claude`. */
const PROJECTS = path.join(process.env.CLAUDE_CONFIG_DIR ?? path.join(os.homedir(), '.claude'), 'projects');
const transcripts = new Map<string, string>();

/** Where a Claude Code session's transcript is, found once and remembered — or `undefined` while no project folder holds it. */
export const transcriptFile = (sessionId: string): string | undefined => {
  const known = transcripts.get(sessionId);
  if (known && fs.existsSync(known)) return known;
  let dirs: string[];
  try {
    dirs = fs.readdirSync(PROJECTS);
  } catch {
    return undefined;
  }
  for (const d of dirs) {
    const f = path.join(PROJECTS, d, `${sessionId}.jsonl`);
    if (fs.existsSync(f)) {
      transcripts.set(sessionId, f);
      return f;
    }
  }
  return undefined;
};

/**
 * Claude Code's record of each session of `sessionIds`, by id: its transcript, and the folder beside it named by the same id
 * where it keeps one. Found in one pass over the project folders, each listed once, whatever the count of ids; an id no folder
 * holds has no key, and a record under an id not asked is never named.
 */
export const transcriptRecords = (sessionIds: readonly string[]): Map<string, string[]> => {
  const asked = new Set(sessionIds);
  const found = new Map<string, string[]>();
  if (!asked.size) return found;
  let dirs: string[];
  try {
    dirs = fs.readdirSync(PROJECTS);
  } catch {
    return found;
  }
  for (const d of dirs) {
    let names: string[];
    try {
      names = fs.readdirSync(path.join(PROJECTS, d));
    } catch {
      continue;
    }
    for (const name of names) {
      const id = name.endsWith('.jsonl') ? name.slice(0, -6) : name;
      if (asked.has(id)) found.set(id, [...(found.get(id) ?? []), path.join(PROJECTS, d, name)]);
    }
  }
  return found;
};

/**
 * When a Claude Code session's transcript was last written: its file's mtime in whole milliseconds, as the Agent SDK's
 * `getSessionInfo` gives it, read by a stat that reads none of its bytes; `undefined` while no project folder holds it, or when
 * the stat fails.
 */
export const transcriptWrittenAt = async (sessionId: string): Promise<number | undefined> => {
  const file = transcriptFile(sessionId);
  if (!file) return undefined;
  try {
    return Math.trunc((await fs.promises.stat(file)).mtimeMs);
  } catch {
    return undefined;
  }
};

/**
 * A transcript found and then not read: the OS refused the read (`code`, as `EACCES`, `EIO`, or `ENOENT` for a file gone since it
 * was found). Never no transcript: what it says is unknown until a later look reads it.
 */
export class TranscriptUnread extends Error {
  readonly file: string;
  readonly code: string | undefined;
  constructor(file: string, cause: unknown) {
    const code = (cause as { code?: unknown } | null)?.code;
    super(
      `the transcript \`${file}\` was found and cannot be read (${cause instanceof Error ? cause.message : String(cause)}); the next look` +
        ' reads it again',
      { cause },
    );
    this.name = 'TranscriptUnread';
    this.file = file;
    this.code = typeof code === 'string' ? code : undefined;
  }
}

/**
 * A session's transcript, found (`transcriptFile`) and read, with where it is; `undefined` only when no project folder holds it.
 * Throws a `TranscriptUnread` when one found cannot be read, whatever the OS says, a file gone since it was found included.
 */
export const readSessionTranscript = async (sessionId: string): Promise<{ file: string; text: string } | undefined> => {
  const file = transcriptFile(sessionId);
  if (!file) return undefined;
  try {
    return { file, text: await readTextAsync(file) };
  } catch (cause) {
    throw new TranscriptUnread(file, cause);
  }
};

/** Where line `i` of a transcript is, in a refusal's words: in `file` when it is given. */
const lineAt = (i: number, file?: string) => `line ${i + 1} of ${file ? `the transcript \`${file}\`` : 'the transcript'}`;

type BlockOf<T extends string> = Extract<ContentBlock, { type: T }>;

/** Whether a content block is of `type`, as its schema decoded it. */
const isBlock =
  <T extends string>(type: T) =>
  (block: ContentBlock): block is BlockOf<T> =>
    block.type === type;

/**
 * The last StructuredOutput call an `assistant` line makes, with the line's time and the call's id; `undefined` with no such call or no
 * time.
 */
const callOf = (line: Line<'assistant'>): { payload: unknown; at: number; id?: string } | undefined => {
  const at = Date.parse(line.timestamp ?? '');
  const content = line.message.content;
  if (!Number.isFinite(at) || !Array.isArray(content)) return undefined;
  const call = content
    .filter(isBlock('tool_use'))
    .filter((b) => b.name === 'StructuredOutput')
    .at(-1);
  return call && { payload: call.input, at, ...(call.id !== undefined ? { id: call.id } : {}) };
};

/**
 * The LAST StructuredOutput call in a transcript, when it was made, its `tool_use` id when the block has one, and whether the
 * conversation ends with its result — `lastWord`: the session gave its closeout and has said nothing since.
 *
 * Read from the raw JSONL rather than through `getSessionMessages`, because the SDK's messages carry no timestamp and no call id.
 * A resumed transcript holds its parent's whole conversation, parent's calls included, under the child's own session id, each
 * call under the id and the time the parent made it. The id tells the session's own statement from one it inherited, where the
 * runner recorded the parent's last call when it spawned the session (`harness/claude/parent.ts`); the time tells them apart
 * where it did not.
 *
 * `lastWord` is what tells a session held by something other than the work from one still doing it,
 * so it is read here, off the same file, rather than by a second pass over it. Only a line that names
 * `StructuredOutput` is parsed: most lines are not it, and the tool's own definition names it too, so
 * only an `assistant` line's `tool_use` block counts.
 *
 * Backwards, from the end: the `assistant` lines that name it are decoded (`lines.ts`) from the last until one makes the call,
 * and none before it, so a resumed transcript's inherited calls are not read. Throws an `Error` naming the line, in `file` when it
 * is given, its field and the fix, when a line read here does not decode: never read as no statement.
 */
export const lastStructuredOutput = (
  jsonl: string,
  file?: string,
): { payload: unknown; at: number; lastWord: boolean; id?: string } | undefined => {
  const lines = jsonl.split('\n');
  for (let i = lines.length - 1; i >= 0; i--) {
    const text = lines[i];
    if (text === undefined || !text.includes('StructuredOutput')) continue;
    const line = lineOf(text, ['assistant'], lineAt(i, file));
    const found = line && callOf(line);
    if (found) {
      const { payload, at, id } = found;
      return { payload, at, lastWord: id !== undefined && endsWithResultOf(lines, id, file), ...(id !== undefined ? { id } : {}) };
    }
  }
  return undefined;
};

/**
 * Whether a conversation ends with the result of the call `id`: the last `user` or `assistant` line is a
 * `tool_result` naming it.
 *
 * Only those two line types are the conversation. Claude Code writes bookkeeping around the closing turn —
 * the structured output's own `attachment` line, then a `system` line carrying the turn's duration — and a
 * check that took the very last line would therefore never fire on a real session: a closing turn is
 * written `assistant`(tool_use) · `attachment` · `user`(tool_result) · `system`.
 *
 * Backwards, because only the end matters and a transcript runs to tens of megabytes. A line still
 * being written, or one that is not JSON, is skipped; the last conversation line is decoded, and throws when it does not.
 */
const endsWithResultOf = (lines: readonly string[], id: string, file?: string): boolean => {
  for (let i = lines.length - 1; i >= 0; i--) {
    const text = lines[i];
    if (text === undefined || !text.includes('"type"')) continue;
    const line = lineOf(text, ['user', 'assistant'], lineAt(i, file));
    if (!line) continue;
    const content = line.message.content;
    return Array.isArray(content) && content.filter(isBlock('tool_result')).some((b) => b.tool_use_id === id);
  }
  return false;
};

/** A Claude Code session's transcript file, for the other runner that reads one: `claude -p`'s. */
export const claudeTranscriptFile = (sessionId: string): string | undefined => transcriptFile(sessionId);

/** A detached spec's `transcript.records` for Claude Code: `transcriptRecords`. */
export const claudeTranscriptRecords = (sessionIds: readonly string[]): Map<string, string[]> => transcriptRecords(sessionIds);

/** A tool result's content as text: a string as it is, a list of blocks as their text, naming any that is not text. */
const resultText = (content: BlockOf<'tool_result'>['content']): string =>
  typeof content === 'string'
    ? content
    : Array.isArray(content)
      ? content.map((b) => (b.type === 'text' && 'text' in b && typeof b.text === 'string' ? b.text : `[${b.type}]`)).join('\n')
      : '';

/**
 * One content block of a conversation line said by `role` at `at` as events, its id the line's `id` and its place `i` when it has none.
 * `origin` is where the line said its words came from, carried onto the text events of a `user` line and no other.
 */
const blockEvents = (
  block: ContentBlock,
  i: number,
  id: string,
  at: string,
  role: TranscriptEvent['role'],
  origin?: { kind: string },
): TranscriptEvent[] => {
  const said = (text: string): TranscriptEvent => ({
    id: `${id}:${i}`,
    at,
    role,
    kind: role === 'system' ? 'system' : 'text',
    text,
    ...(origin ? { origin } : {}),
  });
  if (isBlock('text')(block)) return [said(block.text ?? '')];
  if (isBlock('thinking')(block) || isBlock('redacted_thinking')(block)) {
    return [{ id: `${id}:${i}`, at, role, kind: 'thinking', ...(block.thinking ? { text: block.thinking } : {}) }];
  }
  if (isBlock('tool_use')(block)) {
    return [{ id: block.id ?? `${id}:${i}`, at, role, kind: 'tool_use', tool: { name: String(block.name), input: block.input } }];
  }
  if (isBlock('tool_result')(block)) {
    return [
      {
        id: block.tool_use_id ?? `${id}:${i}`,
        at,
        role,
        kind: 'tool_result',
        result: { text: resultText(block.content), isError: block.is_error === true },
      },
    ];
  }
  return [said(`[${block.type}]`)];
};

/** A `queued_command` attachment as events: words sent in by a peer as `system`, the session's own user's as `user`, anything else none. */
const queuedEvents = (line: Line<'attachment'>, id: string, at: string): TranscriptEvent[] => {
  const a = line.attachment;
  if (a === undefined || !isQueued(a) || typeof a.prompt !== 'string') return [];
  const from = a.origin?.kind;
  if (from === 'peer') return [{ id, at, role: 'system', kind: 'system', text: a.prompt }];
  return a.commandMode === 'prompt' && (from === 'human' || from === undefined)
    ? [{ id, at, role: 'user', kind: 'text', text: a.prompt }]
    : [];
};

type Attached = NonNullable<Line<'attachment'>['attachment']>;

/** Whether an attachment is a queued command, as its schema decoded it. */
const isQueued = (a: Attached): a is Extract<Attached, { type: 'queued_command' }> => a.type === 'queued_command';

/**
 * One line of a Claude Code transcript as events. A `user` or `assistant` line gives one per content
 * block, a `system` line one of its own, a message another process sent while the session was working
 * one `system` event, and any other line — a title, another attachment, a file-history snapshot — none.
 * Pure, so both runners that read Claude Code's transcripts share it.
 *
 * Read as Claude Code writes them: every conversation line carries a `uuid` and a `timestamp`; a line nearly always holds one
 * block, so a block's id is the line's `uuid` and its place in it; a `tool_result` sits in a `user`
 * line and names its call by `tool_use_id`; and thinking is often written with its text empty, which
 * gives a thinking event with no `text` rather than an invented one. A line the harness itself put into
 * the conversation (`isMeta`, like "Continue from where you left off.") is `system`. A subagent's line
 * (`isSidechain`) is left out, as the SDK's reading leaves it. A block of a type not read here is a
 * `text` event naming it, as `renderTranscript` names one. A line with no time gives nothing: a time
 * made up for one would be a lie about when it was said.
 *
 * Words another process put into the session — a peer's `SendMessage`, or `say` to a `--bg` session's
 * inbox — are written two ways. Arriving while it works, as an `attachment`
 * line whose `queued_command` carries the words as `prompt` and a `peer` origin: read here as a `system`
 * event with those words, since the model is handed them as a reminder, not as its user's. Arriving while it
 * is idle, as the `isMeta` user line that starts its next turn, wrapped in Claude Code's own sentence about
 * where it came from: read as any `isMeta` line is.
 *
 * A `user` line's own `origin` is carried onto its text events (`kind: 'human'` for a person writing into the session itself, a
 * claude.ai bridge among them), and onto no other line's: words the host pushed on the session's input carry none, so a caller that
 * pushed them knows which words are the session's own user's.
 *
 * Words the session's own user said while it worked are the same attachment with the user's origin: `human` for a person
 * typing into it, and none at all for a job's next message on its stdin (`-p --input-format stream-json`, which Claude
 * Code renders to the model as "The user sent a new message while you were working"). Read as a `user`
 * text event, as the words that started the turn are. A queued command that is not a prompt — Claude Code's notice that
 * a task it ran in the background ended (`task-notification`) — gives nothing.
 *
 * A line of those four types is decoded (`lines.ts`) before anything is read of it, a subagent's included, and one that does not
 * decode throws an `Error` naming the line by its offset, in `file` when it is given, its field and the fix: the transcript is refused,
 * never read as saying nothing. Any other value — another type, no object — gives nothing, unread.
 */
export const claudeTranscriptEvents = (entry: unknown, offset: number, file?: string): TranscriptEvent[] => {
  const where = `the line at byte ${offset} of ${file ? `the transcript \`${file}\`` : 'the transcript'}`;
  const read = decodeLine(entry, ['user', 'assistant', 'system', 'attachment'], where);
  if (read === undefined) return [];
  if ('wrong' in read) throw new Error(read.wrong);
  const { line } = read;
  const at = isoTime(line.timestamp);
  if (!at || line.isSidechain === true) return [];
  const id = line.uuid || `@${offset}`;
  if (line.type === 'system') return [{ id, at, role: 'system', kind: 'system', text: line.content ?? line.subtype ?? 'system' }];
  if (line.type === 'attachment') return queuedEvents(line, id, at);
  const role = line.isMeta === true ? 'system' : line.type;
  const from = line.type === 'user' && role === 'user' && typeof line.origin?.kind === 'string' ? { kind: line.origin.kind } : undefined;
  const content = line.message.content;
  if (typeof content === 'string')
    return [{ id: `${id}:0`, at, role, kind: role === 'system' ? 'system' : 'text', text: content, ...(from ? { origin: from } : {}) }];
  return (content ?? []).flatMap((block, i) => blockEvents(block, i, id, at, role, from));
};

/**
 * One `cost-state` line: the session's totals as its process exited, and when that count began. Its tokens are every model's
 * in `modelUsage` together, input as a response's are counted (`transcriptUsage`): uncached, cache writes and cache reads.
 */
type CostState = {
  costUsd?: number;
  apiMs?: number;
  toolMs?: number;
  startTime?: number;
  unpriced: boolean;
} & Tokens;

/** An attempt's tokens: its input in three classes and in their sum, and its output. */
type Tokens = { inputTokens?: number; uncachedTokens?: number; cacheWriteTokens?: number; cacheReadTokens?: number; outputTokens?: number };

/** The tokens of a `cost-state`'s `modelUsage`, every model's together — or none, when any model's count is not all there. */
const tokensOf = (modelUsage: Line<'cost-state'>['modelUsage']): Tokens => {
  if (modelUsage === undefined) return {};
  const sum = { uncachedTokens: 0, cacheReadTokens: 0, cacheWriteTokens: 0, outputTokens: 0 };
  for (const m of Object.values(modelUsage)) {
    if (m.inputTokens === undefined || m.cacheReadInputTokens === undefined) return {};
    if (m.cacheCreationInputTokens === undefined || m.outputTokens === undefined) return {};
    sum.uncachedTokens += m.inputTokens;
    sum.cacheReadTokens += m.cacheReadInputTokens;
    sum.cacheWriteTokens += m.cacheCreationInputTokens;
    sum.outputTokens += m.outputTokens;
  }
  return { inputTokens: sum.uncachedTokens + sum.cacheReadTokens + sum.cacheWriteTokens, ...sum };
};

/** A decoded `cost-state` line as what it says the session cost. */
const costStateOf = (line: Line<'cost-state'>): CostState => ({
  costUsd: line.totalCostUSD,
  apiMs: line.totalAPIDuration,
  toolMs: line.totalToolDuration,
  ...tokensOf(line.modelUsage),
  startTime: line.startTime,
  unpriced: line.hasUnknownModelCost === true,
});

/**
 * How far a `cost-state`'s `startTime` may be before the attempt's start, or after its first line, and still be the count this
 * attempt began. Claude Code starts counting a moment before or after it registers the session, and before its first line —
 * however late the process started — a count carried on from an earlier process of the session began minutes before, and a
 * process Claude Code respawned a long-lived attempt in starts a count of its own, ten seconds or more after that first line.
 */
const COST_START_SLACK_MS = 5_000;

/**
 * An attempt's cost, from the `cost-state` lines around it: the last written after its first line, less the one the
 * session had written before that, when its count was carried on from it.
 *
 * Claude Code writes the line twice as a session's process exits — `claude stop` returns once it has — never per turn,
 * and with no time of its own, so a line belongs to the attempt whose lines it follows. And `--resume` carries the count
 * on: every continuation of a session writes its running total under its first process's `startTime`. So
 * a continuation's own cost is its total less its session's total when it began — the difference is recorded, not the
 * session's total, so an attempt's cost is its own, as its tokens are, and as a resumed `claude -p` reports its own.
 *
 * Absent, never 0: while no line has been written since the attempt began (its process has not exited); when the count
 * was carried on from a total this transcript does not show; when the count began after the attempt's first line — a process Claude
 * Code respawned the attempt in counts its own turns alone, and its predecessor, killed, wrote none — so a cost too low is
 * never read as the attempt's; and, for `costUsd`, when the harness could not price a
 * model the session used — a total too low reads as the whole cost, so none is given, and `unpricedModel` says why.
 *
 * `since` is when the attempt began, `begunAt` when its first line was written; `tokens`: its tokens too, the same way — for an
 * attempt whose transcript cannot count them (`transcriptUsage`).
 */
const costOf = ({ before, after, begunAt }: Pick<Attempt, 'before' | 'after' | 'begunAt'>, since: number, tokens = false): Usage => {
  if (after?.startTime === undefined || !(after.startTime <= begunAt + COST_START_SLACK_MS)) return {};
  const carried = after.startTime < since - COST_START_SLACK_MS;
  const base = carried && before?.startTime === after.startTime ? before : undefined;
  if (carried && !base) return {};
  const own = (key: 'costUsd' | 'apiMs' | 'toolMs' | keyof Tokens) => {
    const total = after[key];
    const was = base ? base[key] : 0;
    if (total === undefined || was === undefined || total < was) return undefined;
    return base ? Number((total - was).toFixed(6)) : total;
  };
  const unpriced = after.unpriced || base?.unpriced === true;
  const [costUsd, apiMs, toolMs] = [own('costUsd'), own('apiMs'), own('toolMs')];
  const counts = tokens
    ? {
        inputTokens: own('inputTokens'),
        uncachedTokens: own('uncachedTokens'),
        cacheWriteTokens: own('cacheWriteTokens'),
        cacheReadTokens: own('cacheReadTokens'),
        outputTokens: own('outputTokens'),
      }
    : undefined;
  return {
    ...(counts && Object.values(counts).every((c) => c !== undefined) ? counts : {}),
    ...(costUsd !== undefined && !unpriced ? { costUsd } : {}),
    ...(apiMs !== undefined ? { apiMs } : {}),
    ...(toolMs !== undefined ? { toolMs } : {}),
    ...(unpriced ? { unpricedModel: true as const } : {}),
  };
};

/**
 * What a session consumed, read from its transcript: the responses made at or after `since`, and what Claude Code said
 * the attempt cost (`costOf`).
 *
 * `since` is the session's own start, from the harness's registry, or a long-lived attempt's, as its journal gives it: the
 * responses of every process Claude Code respawned it in are its own. A resumed transcript holds its
 * parent's whole conversation under the child's id, with the parent's timestamps, so counted whole
 * a continuation would report its parent's work as its own. A response is written as one line per
 * content block, each repeating its `message.id` and `usage`, so responses are counted once, by id. Tokens are given only when every
 * counted response carried them.
 *
 * The attempt's lines begin at the first line whose own time is at or after `since`, and end where the session was
 * continued under another name (an `agent-name` line naming another): a session its registry still lists after it
 * ended can have been resumed by a later task since, and what that task spent is not this attempt's.
 *
 * An attempt that compacted its conversation — a `compact_boundary` among its lines — made a call for each summary that
 * writes no `assistant` line, so its responses undercount it. Its tokens are the
 * `cost-state`'s instead, its own share as its cost is, and none until one is written.
 *
 * The input is counted in its three classes — `input_tokens` uncached, `cache_creation_input_tokens` written to the
 * cache, `cache_read_input_tokens` read from it — and `inputTokens` is their sum. The peak is the largest of the three
 * together on any one of the attempt's responses, or on the summary call of any of its compactions, whose context Claude
 * Code writes on the boundary (`compactMetadata.preTokens`: at or a few thousand past the last response before it). A
 * resumed attempt's first response reads its parent's conversation, and its peak keeps that. Only a boundary after the
 * attempt began counts: a resumed transcript carries its parent's last boundary, and that summary is not this attempt's.
 *
 * `compactions` counts the attempt's own boundaries: a session compacts well short of its window, so its peak never
 * says it reached it. And the attempt's first response is kept apart — its context and its cache write — since that is
 * where a continuation either reads its parent's conversation from the cache or writes it there again.
 *
 * A line that is not JSON is skipped. Each line read here of a kind `lines.ts` decodes — a `cost-state`, an `agent-name`, a
 * `compact_boundary`, an attempt's `assistant` line, and the `timestamp` of a line before the attempt begins — is decoded, and one
 * that does not decode throws an `Error` naming the line, in `file` when it is given, its field and the fix: never read as nothing.
 */
export const transcriptUsage = (jsonl: string, since: number, file?: string): Usage => {
  const attempt = attemptIn(jsonl, since, file);
  const { responses, toolCalls, compactions, summarised } = attempt;
  const counted = [...responses.values()];
  const measured = counted.filter((c) => c !== null);
  const all = measured.length === counted.length;
  const total = (key: 'uncached' | 'write' | 'read' | 'output') => measured.reduce((t, c) => t + c[key], 0);
  const peak = measured.reduce((most, c) => Math.max(most, c.uncached + c.write + c.read), summarised);
  const compacted = compactions > 0;
  const first = counted[0];
  return {
    responses: responses.size,
    toolCalls: toolCalls.size,
    ...(all && !compacted
      ? {
          inputTokens: total('uncached') + total('write') + total('read'),
          uncachedTokens: total('uncached'),
          cacheWriteTokens: total('write'),
          cacheReadTokens: total('read'),
          outputTokens: total('output'),
        }
      : {}),
    ...(all && peak > 0 ? { peakContextTokens: peak } : {}),
    ...(first ? { firstContextTokens: first.uncached + first.write + first.read, firstCacheWriteTokens: first.write } : {}),
    ...(compacted ? { compactions } : {}),
    ...costOf(attempt, since, compacted),
  };
};

/** One response's counts, or `null` when it was written without its input and output tokens. */
type Response = { uncached: number; write: number; read: number; output: number } | null;

/** The counts of a decoded `assistant` line's response (`Response`). */
const responseOf = ({ message: { usage: u } }: Line<'assistant'>): Response =>
  u?.input_tokens !== undefined && u.output_tokens !== undefined
    ? { uncached: u.input_tokens, write: u.cache_creation_input_tokens ?? 0, read: u.cache_read_input_tokens ?? 0, output: u.output_tokens }
    : null;

/**
 * What `transcriptUsage` reads of an attempt: its responses by id and its tool calls by id, the `cost-state` lines before and after
 * it began, whether it has begun and when its first line was written (`NaN` until one is), its compactions with the largest context
 * one of them summarised, and the name it runs under.
 */
type Attempt = {
  responses: Map<string, Response>;
  toolCalls: Set<string>;
  before?: CostState;
  after?: CostState;
  begun: boolean;
  begunAt: number;
  compactions: number;
  summarised: number;
  name?: string;
};

/** What `transcriptUsage` reads of an attempt (`Attempt`), in one pass over its transcript, from its first line to its last. */
const attemptIn = (jsonl: string, since: number, file?: string): Attempt => {
  const attempt: Attempt = { responses: new Map(), toolCalls: new Set(), begun: false, begunAt: NaN, compactions: 0, summarised: 0 };
  for (const [i, text] of jsonl.split('\n').entries()) if (!took(attempt, text, since, () => lineAt(i, file))) break;
  return attempt;
};

/**
 * One transcript line taken into `a`, `where` it is: `false` when it says the session was continued under another name, which
 * ends the attempt, and `true` otherwise.
 */
const took = (a: Attempt, text: string, since: number, where: () => string): boolean => {
  const state = text.includes('"cost-state"') ? lineOf(text, ['cost-state'], where()) : undefined;
  if (state) {
    if (a.begun) a.after = costStateOf(state);
    else a.before = costStateOf(state);
    return true;
  }
  const named = text.includes('"agent-name"') ? lineOf(text, ['agent-name'], where())?.agentName : undefined;
  if (named !== undefined) {
    if (a.begun && a.name !== undefined && named !== a.name) return false;
    a.name = named;
    return true;
  }
  if (!a.begun && text.includes('"timestamp"')) {
    a.begunAt = writtenAt(text, where()) ?? NaN;
    a.begun = a.begunAt >= since;
  }
  if (a.begun) tookSaid(a, text, since, where);
  return true;
};

/** A line of a begun attempt taken into `a`, `where` it is: a `compact_boundary`, or a response made at or after `since`. */
const tookSaid = (a: Attempt, text: string, since: number, where: () => string): void => {
  const boundary = text.includes('"compact_boundary"') ? lineOf(text, ['system'], where()) : undefined;
  if (boundary?.subtype === 'compact_boundary') {
    a.compactions += 1;
    a.summarised = Math.max(a.summarised, boundary.compactMetadata?.preTokens ?? 0);
  }
  const response = text.includes('"assistant"') ? lineOf(text, ['assistant'], where()) : undefined;
  if (!response?.message.id || !(Date.parse(response.timestamp ?? '') >= since)) return;
  a.responses.set(response.message.id, responseOf(response));
  const content = response.message.content;
  for (const call of Array.isArray(content) ? content.filter(isBlock('tool_use')) : []) if (call.id) a.toolCalls.add(call.id);
};

/** One line per message of the Agent SDK's. Its messages vary in shape, so every field is read as one that may be absent. */
export const renderTranscript = (messages: readonly unknown[]): string =>
  messages
    .map((m) => {
      const msg = m as { type?: string; message?: { content?: unknown } };
      const content = msg.message?.content;
      const text = Array.isArray(content)
        ? content
            .map((b) => {
              const block = b as { type?: string; text?: string; name?: string };
              return block.type === 'text' ? block.text : block.type === 'tool_use' ? `[${block.name}]` : `[${block.type}]`;
            })
            .join(' ')
        : typeof content === 'string'
          ? content
          : '';
      return `${(msg.type ?? '?').padEnd(9)} ${text.replace(/\s+/g, ' ').slice(0, 160)}`;
    })
    .join('\n');
