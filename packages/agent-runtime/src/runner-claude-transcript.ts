/**
 * A Claude Code session's transcript, read: where it is, the closeout it gave, its lines as events, and what it
 * consumed. Read by both runners that run Claude Code — `claude --bg` (`runner.ts`) and `claude -p`
 * (`runner-claude-detached.ts`) — and `renderTranscript` by the Agent SDK's (`runner-sdk.ts`).
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import type { Usage } from './domain.ts';
import type { TranscriptEvent } from './runner.ts';
import { isoTime } from './runner-transcript.ts';

/** Where a Claude Code session's transcript is, found once and remembered. */
const PROJECTS = path.join(process.env.CLAUDE_CONFIG_DIR ?? path.join(os.homedir(), '.claude'), 'projects');
const transcripts = new Map<string, string>();
export const transcriptFile = (sessionId: string): string | undefined => {
  const known = transcripts.get(sessionId);
  if (known && fs.existsSync(known)) return known;
  let dirs: string[];
  try { dirs = fs.readdirSync(PROJECTS); } catch { return undefined; }
  for (const d of dirs) {
    const f = path.join(PROJECTS, d, `${sessionId}.jsonl`);
    if (fs.existsSync(f)) { transcripts.set(sessionId, f); return f; }
  }
  return undefined;
};

/**
 * The LAST StructuredOutput call in a transcript, when it was made, and whether the conversation ends
 * with its result — `lastWord`: the session gave its closeout and has said nothing since.
 *
 * Read from the raw JSONL rather than through `getSessionMessages`, because the SDK's messages
 * carry no timestamp, and the timestamp is the only thing that tells this session's statement from
 * one it inherited: a resumed transcript holds its parent's whole conversation, parent's calls
 * included, under the child's own session id.
 *
 * `lastWord` is what tells a session held by something other than the work from one still doing it
 * (issue 24), so it is read here, off the same file, rather than by a second pass over it.
 */
export const lastStructuredOutput = (jsonl: string): { payload: unknown; at: number; lastWord: boolean } | undefined => {
  const lines = jsonl.split('\n');
  let found: { payload: unknown; at: number; id?: string } | undefined;
  for (const line of lines) {
    // Most lines are not it, and the tool's own definition mentions the name too.
    if (!line.includes('StructuredOutput')) continue;
    let entry: { type?: string; timestamp?: string; message?: { content?: unknown } };
    try { entry = JSON.parse(line); } catch { continue; }
    const content = entry.message?.content;
    if (entry.type !== 'assistant' || !Array.isArray(content)) continue;
    for (const block of content as Array<{ type?: string; id?: unknown; name?: string; input?: unknown }>) {
      if (block?.type !== 'tool_use' || block.name !== 'StructuredOutput') continue;
      const at = Date.parse(entry.timestamp ?? '');
      if (Number.isFinite(at)) found = { payload: block.input, at, ...(typeof block.id === 'string' ? { id: block.id } : {}) };
    }
  }
  if (!found) return undefined;
  return { payload: found.payload, at: found.at, lastWord: found.id !== undefined && endsWithResultOf(lines, found.id) };
};

/**
 * Whether a conversation ends with the result of the call `id`: the last `user` or `assistant` line is a
 * `tool_result` naming it.
 *
 * Only those two line types are the conversation. Claude Code writes bookkeeping around the closing turn —
 * the structured output's own `attachment` line, then a `system` line carrying the turn's duration — and a
 * check that took the very last line would therefore never fire on a real session. Measured on the
 * transcript issue 24 was written from: `assistant`(tool_use) · `attachment` · `user`(tool_result) ·
 * `system`, and nothing else for seventy minutes.
 *
 * Backwards, because only the end matters and a transcript runs to tens of megabytes.
 */
const endsWithResultOf = (lines: readonly string[], id: string): boolean => {
  for (let i = lines.length - 1; i >= 0; i--) {
    const line = lines[i]!;
    if (!line.trim() || !line.includes('"type"')) continue;
    let entry: { type?: string; message?: { content?: unknown } };
    try { entry = JSON.parse(line); } catch { continue; } // a line still being written, or one that is not JSON
    if (entry?.type !== 'user' && entry?.type !== 'assistant') continue;
    const content = entry.message?.content;
    return Array.isArray(content) && content.some((b) => {
      const block = b as { type?: unknown; tool_use_id?: unknown } | null;
      return block?.type === 'tool_result' && block.tool_use_id === id;
    });
  }
  return false;
};

/** A Claude Code session's transcript file, for the other runner that reads one: `claude -p`'s. */
export const claudeTranscriptFile = (sessionId: string): string | undefined => transcriptFile(sessionId);

/** A tool result's content as text: a string as it is, a list of blocks as their text, naming any that is not text. */
const resultText = (content: unknown): string =>
  typeof content === 'string' ? content
    : Array.isArray(content) ? content.map((b) => {
        const block = b as { type?: unknown; text?: unknown } | null;
        return block?.type === 'text' && typeof block.text === 'string' ? block.text : `[${String(block?.type)}]`;
      }).join('\n')
    : '';

/**
 * One line of a Claude Code transcript as events. A `user` or `assistant` line gives one per content
 * block, a `system` line one of its own, a message another process sent while the session was working
 * one `system` event, and any other line — a title, another attachment, a file-history snapshot — none.
 * Pure, so both runners that read Claude Code's transcripts share it.
 *
 * Read as Claude Code writes them (measured on the 150 transcripts last written on this machine, up to
 * 2.1.270): every conversation line carries a `uuid` and a `timestamp`; a line nearly always holds one
 * block, so a block's id is the line's `uuid` and its place in it; a `tool_result` sits in a `user`
 * line and names its call by `tool_use_id`; and thinking is often written with its text empty, which
 * gives a thinking event with no `text` rather than an invented one. A line the harness itself put into
 * the conversation (`isMeta`, like "Continue from where you left off.") is `system`. A subagent's line
 * (`isSidechain`) is left out, as the SDK's reading leaves it. A block of a type not read here is a
 * `text` event naming it, as `renderTranscript` names one. A line with no time gives nothing: none has
 * been seen, and a time made up for one would be a lie about when it was said.
 *
 * Words another process put into the session — a peer's `SendMessage`, or `say` — are written two ways
 * (measured on 2.1.270, posting to a `--bg` session's inbox). Arriving while it works, as an `attachment`
 * line whose `queued_command` carries the words as `prompt` and a `peer` origin: read here as a `system`
 * event with those words, since the model is handed them as a reminder, not as its user's. Arriving while it
 * is idle, as the `isMeta` user line that starts its next turn, wrapped in Claude Code's own sentence about
 * where it came from: read as any `isMeta` line is.
 *
 * Words the session's own user said while it worked are the same attachment with the user's origin: `human` for a person
 * typing into it, and none at all for a job's next message on its stdin (`-p --input-format stream-json`, measured on
 * 2.1.280, which renders it to the model as "The user sent a new message while you were working"). Read as a `user`
 * text event, as the words that started the turn are. A queued command that is not a prompt — Claude Code's notice that
 * a task it ran in the background ended (`task-notification`) — gives nothing.
 */
export const claudeTranscriptEvents = (entry: unknown, offset: number): TranscriptEvent[] => {
  const line = entry as {
    type?: unknown; uuid?: unknown; timestamp?: unknown; subtype?: unknown; content?: unknown;
    isMeta?: unknown; isSidechain?: unknown; message?: { content?: unknown } | null;
    attachment?: { type?: unknown; prompt?: unknown; commandMode?: unknown; origin?: { kind?: unknown } | null } | null;
  } | null;
  const at = isoTime(line?.timestamp);
  if (!line || !at || line.isSidechain === true) return [];
  const id = typeof line.uuid === 'string' && line.uuid ? line.uuid : `@${offset}`;
  if (line.type === 'system') {
    return [{ id, at, role: 'system', kind: 'system', text: typeof line.content === 'string' ? line.content : typeof line.subtype === 'string' ? line.subtype : 'system' }];
  }
  if (line.type === 'attachment') {
    const a = line.attachment;
    if (a?.type !== 'queued_command' || typeof a.prompt !== 'string') return [];
    const from = a.origin?.kind;
    if (from === 'peer') return [{ id, at, role: 'system', kind: 'system', text: a.prompt }];
    return a.commandMode === 'prompt' && (from === 'human' || from === undefined) ? [{ id, at, role: 'user', kind: 'text', text: a.prompt }] : [];
  }
  if (line.type !== 'user' && line.type !== 'assistant') return [];
  const role = line.isMeta === true ? 'system' : line.type;
  const said = (i: number, text: string): TranscriptEvent => ({ id: `${id}:${i}`, at, role, kind: role === 'system' ? 'system' : 'text', text });
  const content = line.message?.content;
  if (typeof content === 'string') return [said(0, content)];
  if (!Array.isArray(content)) return [];
  return content.flatMap((b: unknown, i): TranscriptEvent[] => {
    const block = b as {
      type?: unknown; text?: unknown; thinking?: unknown; id?: unknown; name?: unknown; input?: unknown;
      tool_use_id?: unknown; content?: unknown; is_error?: unknown;
    } | null;
    switch (block?.type) {
      case 'text':
        return [said(i, typeof block.text === 'string' ? block.text : '')];
      case 'thinking':
      case 'redacted_thinking':
        return [{ id: `${id}:${i}`, at, role, kind: 'thinking', ...(typeof block.thinking === 'string' && block.thinking ? { text: block.thinking } : {}) }];
      case 'tool_use':
        return [{ id: typeof block.id === 'string' ? block.id : `${id}:${i}`, at, role, kind: 'tool_use', tool: { name: String(block.name), input: block.input } }];
      case 'tool_result':
        return [{
          id: typeof block.tool_use_id === 'string' ? block.tool_use_id : `${id}:${i}`, at, role, kind: 'tool_result',
          result: { text: resultText(block.content), isError: block.is_error === true },
        }];
      default:
        return [said(i, `[${String(block?.type)}]`)];
    }
  });
};

/**
 * One `cost-state` line: the session's totals as its process exited, and when that count began. Its tokens are every model's
 * in `modelUsage` together, input as a response's are counted (`transcriptUsage`): uncached, cache writes and cache reads.
 */
type CostState = {
  costUsd?: number; apiMs?: number; toolMs?: number; startTime?: number; unpriced: boolean;
} & Tokens;

/** An attempt's tokens: its input in three classes and in their sum, and its output. */
type Tokens = { inputTokens?: number; uncachedTokens?: number; cacheWriteTokens?: number; cacheReadTokens?: number; outputTokens?: number };

/** The tokens of a `cost-state`'s `modelUsage`, every model's together — or none, when any model's count is not all there. */
const tokensOf = (modelUsage: unknown): Tokens => {
  if (typeof modelUsage !== 'object' || modelUsage === null || Array.isArray(modelUsage)) return {};
  const sum = { uncachedTokens: 0, cacheReadTokens: 0, cacheWriteTokens: 0, outputTokens: 0 };
  for (const m of Object.values(modelUsage as Record<string, unknown>)) {
    const n = (key: string) => {
      const v = (m as Record<string, unknown> | null)?.[key];
      return typeof v === 'number' && Number.isFinite(v) ? v : undefined;
    };
    const counts = [n('inputTokens'), n('cacheReadInputTokens'), n('cacheCreationInputTokens'), n('outputTokens')];
    if (counts.some((c) => c === undefined)) return {};
    sum.uncachedTokens += counts[0]!;
    sum.cacheReadTokens += counts[1]!;
    sum.cacheWriteTokens += counts[2]!;
    sum.outputTokens += counts[3]!;
  }
  return { inputTokens: sum.uncachedTokens + sum.cacheReadTokens + sum.cacheWriteTokens, ...sum };
};

const costStateOf = (line: string): CostState | undefined => {
  let e: Record<string, unknown> | null;
  try { e = JSON.parse(line); } catch { return undefined; }
  if (e?.type !== 'cost-state') return undefined;
  const n = (key: string) => (typeof e[key] === 'number' && Number.isFinite(e[key]) ? (e[key] as number) : undefined);
  return {
    costUsd: n('totalCostUSD'), apiMs: n('totalAPIDuration'), toolMs: n('totalToolDuration'), ...tokensOf(e.modelUsage),
    startTime: n('startTime'), unpriced: e.hasUnknownModelCost === true,
  };
};

/**
 * How far before the session's start in the registry a `cost-state`'s `startTime` may be and still be the count this
 * session began. Claude Code starts counting a moment before or after it registers the session — 10 to 440 ms either
 * way, measured on 2.1.272 — and a count carried on from an earlier process of the session began minutes before.
 */
const COST_START_SLACK_MS = 5_000;

/**
 * An attempt's cost, from the `cost-state` lines around it: the last written after its first line, less the one the
 * session had written before that, when its count was carried on from it.
 *
 * Measured on the `--bg` transcripts on this machine (2.1.246 to 2.1.272), and by stopping a session by hand: Claude
 * Code writes the line twice as a session's process exits — `claude stop` returns once it has — never per turn, and
 * with no time of its own, so a line belongs to the attempt whose lines it follows. And `--resume` carries the count
 * on: one session continued twice wrote $28.32, $43.04 and $47.21, all three under its first process's `startTime`. So
 * a continuation's own cost is its total less its session's total when it began — the difference is recorded, not the
 * session's total, so an attempt's cost is its own, as its tokens are, and as a resumed `claude -p` reports its own.
 *
 * Absent, never 0: while no line has been written since the attempt began (its process has not exited); when the count
 * was carried on from a total this transcript does not show; and, for `costUsd`, when the harness could not price a
 * model the session used — a total too low reads as the whole cost, so none is given, and `unpricedModel` says why.
 *
 * `tokens`: its tokens too, the same way — for an attempt whose transcript cannot count them (`transcriptUsage`).
 */
const costOf = (before: CostState | undefined, after: CostState | undefined, since: number, tokens = false): Usage => {
  if (after?.startTime === undefined) return {};
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
    ? { inputTokens: own('inputTokens'), uncachedTokens: own('uncachedTokens'), cacheWriteTokens: own('cacheWriteTokens'), cacheReadTokens: own('cacheReadTokens'), outputTokens: own('outputTokens') }
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
 * `since` is the session's own start, from the harness's registry. A resumed transcript holds its
 * parent's whole conversation under the child's id, with the parent's timestamps, so counted whole
 * a continuation would report its parent's work as its own. A response is written as one line per
 * content block, each repeating its `message.id` and `usage` (measured: 160 lines, 85 responses),
 * so responses are counted once, by id. Tokens are given only when every counted response carried
 * them.
 *
 * The attempt's lines begin at the first line whose own time is at or after `since`, and end where the session was
 * continued under another name (an `agent-name` line naming another): a session its registry still lists after it
 * ended can have been resumed by a later task since, and what that task spent is not this attempt's.
 *
 * An attempt that compacted its conversation — a `compact_boundary` among its lines — made a call for each summary that
 * writes no `assistant` line, so its responses undercount it: 408,348 input tokens counted against the 601,367 its
 * `cost-state` said, over three compactions (2.1.278, open issue 26). Its tokens are the `cost-state`'s instead, its own
 * share as its cost is, and none until one is written.
 *
 * The input is counted in its three classes — `input_tokens` uncached, `cache_creation_input_tokens` written to the
 * cache, `cache_read_input_tokens` read from it — and `inputTokens` is their sum. The peak is the largest of the three
 * together on any one of the attempt's responses, or on the summary call of any of its compactions, whose context Claude
 * Code writes on the boundary (`compactMetadata.preTokens`: on 25 boundaries read, at or a few thousand past the last
 * response before it). A resumed attempt's first response reads its parent's conversation, and its peak keeps that.
 *
 * `compactions` counts the attempt's own boundaries: a session compacts well short of its window (173,584 and 173,254
 * under a 200k one, open issue 26), so its peak never says it reached it. And the attempt's first response is kept
 * apart — its context and its cache write — since that is where a continuation either reads its parent's conversation
 * from the cache or writes it there again.
 */
export const transcriptUsage = (jsonl: string, since: number): Usage => {
  const responses = new Map<string, { uncached: number; write: number; read: number; output: number } | null>();
  const toolCalls = new Set<string>();
  let before: CostState | undefined;
  let after: CostState | undefined;
  let begun = false;
  let compactions = 0;
  // The context each of the attempt's compactions summarised, as Claude Code counted it (`compactMetadata.preTokens`).
  let summarised = 0;
  let name: string | undefined;
  for (const line of jsonl.split('\n')) {
    if (line.includes('"cost-state"')) {
      const state = costStateOf(line);
      if (state) {
        if (begun) after = state; else before = state;
        continue;
      }
    }
    if (line.includes('"agent-name"')) {
      let entry: { type?: unknown; agentName?: unknown } | null = null;
      try { entry = JSON.parse(line); } catch { /* not a line */ }
      if (entry?.type === 'agent-name' && typeof entry.agentName === 'string') {
        if (begun && name !== undefined && entry.agentName !== name) break;
        name = entry.agentName;
        continue;
      }
    }
    if (!begun && line.includes('"timestamp"')) {
      try { begun = Date.parse((JSON.parse(line) as { timestamp?: unknown } | null)?.timestamp as string) >= since; } catch { /* not a line */ }
    }
    // A resumed transcript carries its parent's last boundary, before this attempt began: that summary is not this attempt's.
    if (begun && line.includes('"compact_boundary"')) {
      try {
        const entry = JSON.parse(line) as { subtype?: unknown; compactMetadata?: { preTokens?: unknown } } | null;
        if (entry?.subtype === 'compact_boundary') {
          compactions += 1;
          const pre = entry.compactMetadata?.preTokens;
          if (typeof pre === 'number' && Number.isFinite(pre)) summarised = Math.max(summarised, pre);
        }
      } catch { /* not a line */ }
    }
    if (!line.includes('"assistant"')) continue;
    let entry: { type?: string; timestamp?: string; message?: { id?: string; usage?: Record<string, unknown>; content?: unknown } };
    try { entry = JSON.parse(line); } catch { continue; }
    const message = entry.message;
    if (entry.type !== 'assistant' || !message?.id || !(Date.parse(entry.timestamp ?? '') >= since)) continue;
    const u = message.usage;
    const n = (key: string) => (typeof u?.[key] === 'number' ? (u[key] as number) : 0);
    responses.set(message.id, typeof u?.input_tokens === 'number' && typeof u?.output_tokens === 'number'
      ? { uncached: n('input_tokens'), write: n('cache_creation_input_tokens'), read: n('cache_read_input_tokens'), output: n('output_tokens') }
      : null);
    if (Array.isArray(message.content)) {
      for (const block of message.content as Array<{ type?: string; id?: string }>) {
        if (block?.type === 'tool_use' && block.id) toolCalls.add(block.id);
      }
    }
  }
  const counted = [...responses.values()];
  const measured = counted.filter((c) => c !== null);
  const all = measured.length === counted.length;
  const total = (key: 'uncached' | 'write' | 'read' | 'output') => measured.reduce((t, c) => t + c[key], 0);
  const peak = measured.reduce((most, c) => Math.max(most, c.uncached + c.write + c.read), summarised);
  const compacted = compactions > 0;
  const first = counted[0];
  return {
    turns: responses.size,
    toolCalls: toolCalls.size,
    ...(all && !compacted
      ? {
          inputTokens: total('uncached') + total('write') + total('read'),
          uncachedTokens: total('uncached'), cacheWriteTokens: total('write'), cacheReadTokens: total('read'),
          outputTokens: total('output'),
        }
      : {}),
    ...(all && peak > 0 ? { peakContextTokens: peak } : {}),
    ...(first ? { firstContextTokens: first.uncached + first.write + first.read, firstCacheWriteTokens: first.write } : {}),
    ...(compacted ? { compactions } : {}),
    ...costOf(before, after, since, compacted),
  };
};

/** One line per message. The SDK's shapes vary by CLI version, so this reads defensively. */
export const renderTranscript = (messages: readonly unknown[]): string =>
  messages
    .map((m) => {
      const msg = m as { type?: string; message?: { content?: unknown } };
      const content = msg.message?.content;
      const text = Array.isArray(content)
        ? content.map((b) => {
            const block = b as { type?: string; text?: string; name?: string };
            return block.type === 'text' ? block.text : block.type === 'tool_use' ? `[${block.name}]` : `[${block.type}]`;
          }).join(' ')
        : typeof content === 'string' ? content : '';
      return `${(msg.type ?? '?').padEnd(9)} ${text.replace(/\s+/g, ' ').slice(0, 160)}`;
    })
    .join('\n');
