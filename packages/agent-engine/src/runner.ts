/**
 * The compute seam — the ONLY file that knows what runs an agent.
 *
 * Four verbs the engine cannot run without: spawn one, observe all, stop one, read one's logs. A
 * fifth, `release`, is optional — letting go of a session whose end is on the record, for a harness
 * whose registry would otherwise keep it for ever. So is a sixth, `transcript`: the same session's
 * conversation as events, for a person to follow, and nothing the engine acts on. And a seventh, `say`:
 * a person's words handed to a session while it runs, which the engine journals and never acts on. And an eighth,
 * `find`: one session by its name, without observing every other, for a read that needs only which session it is. Swap the layer and the same engine drives a
 * different harness; `Runner.test()` drives nothing at all, which is how the engine's tests cost zero
 * dollars.
 *
 * The Claude layer shells out on purpose. `claude --bg` hands the session to the harness, which
 * already owns resume, stop, cross-session messaging and a registry that outlives us — the thing
 * a scheduler on someone's laptop should be leaning on rather than rebuilding.
 */
import { Context, Effect, Layer, Schema } from 'effect';
import { execFile } from 'node:child_process';
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import net from 'node:net';
import os from 'node:os';
import path from 'node:path';
import { getSessionInfo, getSessionMessages } from '@anthropic-ai/claude-agent-sdk';
import type { Observed, Sighting, Usage } from './domain.ts';

export class RunnerError extends Schema.TaggedError<RunnerError>()('RunnerError', {
  verb: Schema.String,
  message: Schema.String,
  /**
   * The harness vouches that nothing started: no session can exist under the name. Set by a spawn,
   * and only when that is certain — the OS would not create the process, or a detached worker was
   * never launched. Absent, a failed spawn may still have left a session running.
   */
  refused: Schema.optionalKey(Schema.Boolean),
}) {}

export type SpawnRequest = {
  /** The join key, ours, chosen before the session exists. */
  name: string;
  brief: string;
  cwd: string;
  model?: string;
  permissionMode?: string;
  /** Which harness should run it. The composite runner dispatches on this; others ignore it. */
  harness?: string;
  /** A previous session of this harness to continue instead of starting cold. */
  resumeFrom?: string;
  /** Isolation: true for a harness-named git worktree, a string to name it. */
  worktree?: string | boolean;
  /** A JSON Schema the workload's final answer must satisfy. Passed through; never interpreted. */
  closeoutSchema?: object;
  /** The only tools the session may have, in this harness's names. Absent: the harness's own set. */
  tools?: string[];
  /** What the session may not have, in this harness's permission rules, one per entry. Absent or empty: nothing denied. */
  disallowedTools?: string[];
  /** How hard the harness should think, in its own words. */
  effort?: string;
  /** MCP servers the session may have, by name, beside its checkout's `.mcp.json`. Absent: only those. */
  mcp?: Record<string, McpServer>;
  /** The most the session may spend, in dollars. Absent: no cap. */
  budgetUsd?: number;
  /** The context window the session is given, in tokens: past about it, the harness compacts. Absent: the harness's own. */
  contextTokens?: number;
  /** Bridge the session to claude.ai, where it can be seen and driven. Absent or false: not bridged. */
  remoteControl?: boolean;
};

/**
 * One MCP server — a process the harness starts beside the session, or an address it connects to —
 * in the shape a `.mcp.json` entry gives it: Claude Code's own, so a task's servers are written for
 * it as they are. Harness vocabulary: carried on the task, read by a runner, never by `decide`. A
 * `url` needs its `type`, because Claude Code loads nothing from one without it.
 */
export type McpServer =
  | { type?: 'stdio'; command: string; args?: string[]; env?: Record<string, string> }
  | { type: 'http' | 'sse'; url: string; headers?: Record<string, string> };

/**
 * One thing that happened in a session's conversation, in the same shape for every harness.
 *
 * `id` is the harness's own, so the same record read again gives the same id. A `tool_result` carries
 * its call's `id`: that is how a result pairs to its call, and why an event is unique by `id` and
 * `kind` together, not by `id` alone. `at` is the time on the harness's own record, never the time it
 * was read — so a resumed Claude session's inherited conversation keeps its parent's times, and the
 * caller decides what to show. A tool result is `user`, as the model receives it.
 */
export type TranscriptEvent = {
  id: string;
  /** ISO 8601, from the harness's record. */
  at: string;
  role: 'assistant' | 'user' | 'system';
  kind: 'text' | 'thinking' | 'tool_use' | 'tool_result' | 'system';
  text?: string;
  tool?: { name: string; input: unknown };
  result?: { text: string; isError: boolean };
};

/**
 * Where a transcript read stopped, to hand back to the next: the byte offset after the last whole line
 * read, and a hash of the bytes just before it. The offset alone cannot tell a file that was replaced
 * and has grown past it from the same file grown longer; the hash can, and so can it a file cut shorter.
 */
export type TranscriptCursor = string;

/** A read of a session's conversation: the events from the cursor asked with, and the cursor to ask again with. */
export type Transcript = { events: TranscriptEvent[]; cursor: TranscriptCursor };

/**
 * The seam itself, as a plain value.
 *
 * Four verbs. A harness that cannot do one of them is not a harness this engine can drive, and a
 * harness that needs another to be driven is asking the engine to learn something about it — which is
 * the line this type exists to hold. `release` does not cross it: optional, told only what the record
 * already says, and answering nothing the engine acts on. Nor does `transcript`: optional, and read
 * for a person, never by `decide`. Nor does `say`: optional, a person's words carried in, and nothing
 * the engine decides on. Nor does `find`: optional, a cheaper way to one session's id than `observe`, and never
 * its state.
 */
export type RunnerOps = {
  readonly spawn: (r: SpawnRequest) => Effect.Effect<void, RunnerError>;
  /** Every session this runner knows about, BY NAME. One call per pass, never per task. */
  readonly observe: Effect.Effect<Map<string, Sighting>, RunnerError>;
  /**
   * The one session running under `name`, found without observing every other: which session it is, and nothing of
   * its state. Optional — for a harness that can answer by name for less than `observe` costs (Claude Code: the
   * session's registration file, where `observe` runs `claude agents`). Resolves `undefined` when none runs under the
   * name. A read that needs a session's state asks `observe`, and where the two differ, `observe`'s word is taken.
   */
  readonly find?: (name: string) => Effect.Effect<{ sessionId: string } | undefined, RunnerError>;
  readonly stop: (sessionId: string) => Effect.Effect<void, RunnerError>;
  readonly logs: (sessionId: string) => Effect.Effect<string, RunnerError>;
  /**
   * Let go of a session whose attempt's end the engine has written down: stop it if it still runs,
   * and take it out of the harness's registry. Optional — a harness whose registry is the record
   * (a detached runner's run files, which `logs` reads) has nothing to let go of.
   *
   * Asked on every pass that still observes such a session, so it must be idempotent and needs no
   * memory: one that fails is asked again next pass. Given the session as observed, to tell a live one
   * from one that has exited, and the task's `worktree`, since a harness may remove the one it cut.
   *
   * Resolves with what the session consumed, read once this call has stopped it, for a harness that writes part of that
   * only as a session's process exits — after its end was written (Claude Code's cost). The engine records it on the
   * attempt. Nothing when it stopped nothing.
   */
  readonly release?: (session: Sighting, task: { worktree?: string | boolean }) => Effect.Effect<Usage | void, RunnerError>;
  /**
   * The session's conversation as events, from `after` on, and the cursor to ask again with. Optional:
   * a harness that keeps no record of its conversation has `logs`, and that is all. Pull-only and
   * level-triggered — a caller polls with the cursor it was given, nothing is pushed, and nothing is
   * remembered between reads that the cursor does not carry.
   */
  readonly transcript?: (sessionId: string, after?: TranscriptCursor) => Effect.Effect<Transcript, RunnerError>;
  /**
   * Hand `text` to a session that is running, as a person's words: optional, for a harness with a channel
   * into a live session. Given the session as the engine knows it — the name it chose, and the id `observe`
   * listed it under on the pass just made — and resolves once the harness has taken the words; rejects when
   * it did not, and then nothing was said. What the session does with them is its own affair: the engine
   * journals that they were said, and `decide` never reads that.
   */
  readonly say?: (session: { name: string; sessionId: string }, text: string) => Effect.Effect<void, RunnerError>;
};

export class Runner extends Context.Service<Runner, RunnerOps>()('engine/Runner') {
  /** Any implementation becomes a Layer. This is the only way a runner reaches the engine. */
  static layer = (ops: RunnerOps) => Layer.succeed(Runner)(Runner.of(ops));

  static claude = (options?: ClaudeOptions) => Runner.layer(claudeOps(options));

  static test = (control?: { sessions: Map<string, Sighting>; spawned?: SpawnRequest[] }) => Runner.layer(testOps(control));
}

/**
 * How long a `working` session must write nothing before this harness reports it quiet — stopped, rather than
 * paused (`Sighting.quietMs`). The floor under both quiet rules: on its own for a session the registry lists
 * idle, and beside its own closeout being the last word in the conversation for one the registry lists busy
 * (issue 24). What quiet means for the attempt is `decide`'s.
 *
 * 90 seconds. Long enough that a pause between self-driven steps resumes first — the docs are
 * explicit that `working` also covers "between steps of work it drives on its own" — and short
 * enough that a fleet is not waiting on a session that has already written its last word.
 */
export const QUIESCENT_AFTER_MS = 90_000;

/**
 * How far a transcript's mtime may trail `Date.now()` for the same instant. The kernel may stamp a
 * file from a coarser clock, so a line written just after a read can carry a time just before it. A
 * read of a finished session is kept only while its transcript is older than the read by more than
 * this: one more read at the end of a session, and never a line missed.
 */
const MTIME_SLOP_MS = 1_000;

const FINAL: ReadonlySet<Observed> = new Set(['done', 'failed', 'stopped']);

/** Where a Claude Code session's transcript is, found once and remembered. */
const PROJECTS = path.join(process.env.CLAUDE_CONFIG_DIR ?? path.join(os.homedir(), '.claude'), 'projects');
const transcripts = new Map<string, string>();
const transcriptFile = (sessionId: string): string | undefined => {
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

/**
 * How much of a file, before a cursor's offset, its hash covers. Past the end of what every line of one
 * session repeats — its cwd, session id, version and branch come to a few hundred bytes — so the hash
 * covers the line's own id and time.
 */
const CURSOR_TAIL_BYTES = 4096;
const cursorAt = (offset: number, tail: Uint8Array): TranscriptCursor =>
  `${offset}.${createHash('sha256').update(tail).digest('hex').slice(0, 16)}`;
const START: TranscriptCursor = cursorAt(0, new Uint8Array());

/** Whether `after` is a cursor a transcript read could have given. */
export const isTranscriptCursor = (after: string): boolean => /^(0|[1-9]\d*)\.[0-9a-f]{16}$/.test(after);

/** No conversation to read yet: no events, and a cursor that reads from the start. */
export const noTranscript = (): Transcript => ({ events: [], cursor: START });

/** A record's own time as ISO 8601, or `undefined` when it has none that parses. */
export const isoTime = (t: unknown): string | undefined => {
  const ms = typeof t === 'string' ? Date.parse(t) : NaN;
  return Number.isFinite(ms) ? new Date(ms).toISOString() : undefined;
};

/**
 * The events in a JSONL file from `after` on, and where to ask again. The one reader behind every
 * harness's `transcript`; what a line means is `eventsOf`'s, given the line parsed and the byte offset
 * it starts at (an id for a record that has none).
 *
 * Only whole lines are read: a line still being written waits for the next read, and the cursor stops
 * before it. A cursor is taken only while the file still holds, just before its offset, the bytes it
 * was given at — so a file that shrank, or was replaced, is read again from the start, rather than from
 * the middle of something else or as nothing for ever. A line that is not JSON is passed over. No file
 * is no events and a cursor at the start. A cursor no read gave is refused: it is somebody's bug.
 */
export const readTranscript = async (
  file: string | undefined,
  after: TranscriptCursor | undefined,
  eventsOf: (entry: unknown, offset: number) => TranscriptEvent[],
): Promise<Transcript> => {
  if (after !== undefined && !isTranscriptCursor(after)) {
    throw new Error(`\`${after}\` is not a cursor a transcript read gave. Pass the \`cursor\` the last read returned, or none to read from the start.`);
  }
  if (!file) return noTranscript();
  let handle: fs.promises.FileHandle;
  try { handle = await fs.promises.open(file, 'r'); } catch (e) {
    if ((e as NodeJS.ErrnoException).code === 'ENOENT') return noTranscript();
    throw e;
  }
  try {
    const { size } = await handle.stat();
    const bytes = async (from: number, to: number) => {
      const buf = Buffer.alloc(Math.max(0, to - from));
      let got = 0;
      while (got < buf.length) {
        const { bytesRead } = await handle.read(buf, got, buf.length - got, from + got);
        if (bytesRead === 0) break;
        got += bytesRead;
      }
      return buf.subarray(0, got);
    };
    const tailBefore = (offset: number) => bytes(Math.max(0, offset - CURSOR_TAIL_BYTES), offset);
    const asked = after === undefined ? 0 : Number(after.slice(0, after.indexOf('.')));
    const from = asked > 0 && asked <= size && cursorAt(asked, await tailBefore(asked)) === after ? asked : 0;
    const chunk = await bytes(from, size);
    const events: TranscriptEvent[] = [];
    // Line by line while a newline ends one: what follows the last is still being written. A newline
    // byte never occurs inside a UTF-8 character, so cutting at one never splits a character.
    let read = 0;
    for (let end = chunk.indexOf(0x0a); end !== -1; end = chunk.indexOf(0x0a, read)) {
      let entry: unknown;
      try { entry = JSON.parse(chunk.toString('utf8', read, end)); } catch { entry = undefined; }
      if (entry !== undefined) events.push(...eventsOf(entry, from + read));
      read = end + 1;
    }
    const offset = from + read;
    return { events, cursor: offset === 0 ? START : cursorAt(offset, await tailBefore(offset)) };
  } finally {
    await handle.close();
  }
};

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
 */
export const claudeTranscriptEvents = (entry: unknown, offset: number): TranscriptEvent[] => {
  const line = entry as {
    type?: unknown; uuid?: unknown; timestamp?: unknown; subtype?: unknown; content?: unknown;
    isMeta?: unknown; isSidechain?: unknown; message?: { content?: unknown } | null;
    attachment?: { type?: unknown; prompt?: unknown; origin?: { kind?: unknown } | null } | null;
  } | null;
  const at = isoTime(line?.timestamp);
  if (!line || !at || line.isSidechain === true) return [];
  const id = typeof line.uuid === 'string' && line.uuid ? line.uuid : `@${offset}`;
  if (line.type === 'system') {
    return [{ id, at, role: 'system', kind: 'system', text: typeof line.content === 'string' ? line.content : String(line.subtype ?? 'system') }];
  }
  if (line.type === 'attachment') {
    const a = line.attachment;
    return a?.type === 'queued_command' && a.origin?.kind === 'peer' && typeof a.prompt === 'string'
      ? [{ id, at, role: 'system', kind: 'system', text: a.prompt }]
      : [];
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

/**
 * The permission modes Claude Code takes. Harness vocabulary, so it lives beside the runner that
 * speaks it and never in `domain.ts`.
 *
 * As the CLI checks them on 2.1.270: `--permission-mode` refuses any other word while it parses its
 * arguments, and still takes `default`, which its help no longer lists. `file()` asks before a task
 * is journalled. Refused at spawn instead, a bad mode failed the whole tick, on every pass.
 */
export const CLAUDE_PERMISSION_MODES: readonly string[] = ['acceptEdits', 'auto', 'bypassPermissions', 'default', 'dontAsk', 'manual', 'plan'];

/**
 * The efforts Claude Code takes. Refused here rather than left to the CLI, because the CLI does not
 * refuse one: 2.1.270 prints a warning for an unknown `--effort` and runs at its default effort —
 * a knob that silently does nothing.
 */
export const CLAUDE_EFFORTS: readonly string[] = ['low', 'medium', 'high', 'xhigh', 'max'];

/**
 * The context windows Claude Code takes, in tokens: `--autocompact`'s range, both ends included. The CLI refuses any other
 * value while it parses its arguments ("It must be 'auto', or between 100k and 1M"), so a `--bg` spawn given one would fail
 * on every pass; `file()` asks first. Measured on 2.1.278: 99999 and 1000001 refused, 100000 and 1000000 taken. A value is
 * handed over as its digits, never `200k` — and never below 1000, which the CLI reads as thousands (`200` is 200k).
 */
export const CLAUDE_CONTEXT_TOKENS: { least: number; most: number } = { least: 100_000, most: 1_000_000 };

/**
 * The pool Claude Code's sessions are counted in under the concurrency ceiling, whichever of the engine's runners starts
 * them: `claude --bg` and `claude -p` run on one subscription, under one rate limit. The name is the harness the engine
 * configures by default, so a board that names no pools reads the same as before.
 */
export const CLAUDE_POOL = 'claude';

/** What Claude Code cannot be asked for, as a sentence that says what to write instead. */
export const claudeRefuses = (task: Omit<SpawnRequest, 'name'>): string | undefined => {
  if (task.permissionMode !== undefined && !CLAUDE_PERMISSION_MODES.includes(task.permissionMode)) {
    return `\`permissionMode: ${task.permissionMode}\` is not a mode Claude Code has. Its modes are: ${CLAUDE_PERMISSION_MODES.join(', ')}.`;
  }
  if (task.effort !== undefined && !CLAUDE_EFFORTS.includes(task.effort)) {
    return `\`effort: ${task.effort}\` is not an effort Claude Code has. Its efforts are: ${CLAUDE_EFFORTS.join(', ')}.`;
  }
  return undefined;
};

/**
 * What a Claude Code background session cannot be asked for, beyond what Claude Code cannot (`claudeRefuses`): a spend
 * cap. `claude --bg` takes `--max-budget-usd` and keeps nothing of it — its help says the flag "only works with --print",
 * and a `--bg` session given a $0.01 cap read a file 42 times, spent $0.19 and ended `done` (measured on 2.1.272, and by
 * `test/live.test.ts`). A cap that caps nothing is refused rather than carried; `claude -p` keeps one.
 */
export const claudeBgRefuses = (task: Omit<SpawnRequest, 'name'>): string | undefined => claudeRefuses(task) ?? (task.budgetUsd === undefined ? undefined
  : `\`budgetUsd: ${task.budgetUsd}\` is a spend cap, and a \`claude --bg\` session does not keep one: Claude Code takes \`--max-budget-usd\` only with \`--print\`, and a background session given a $0.01 cap spent $0.19 (2.1.272, measured). File the task on \`claude-detached\`, which runs \`claude -p\` and ends the session at its cap, or leave \`budgetUsd\` off.`);

/**
 * The longest line Claude Code's inbox reads, in characters. A longer one drops the connection and
 * delivers nothing, and says so to nobody (`Ftt` in 2.1.270's inbox), so `say` refuses it first.
 */
export const CLAUDE_INBOX_LINE_MAX = 1_048_576;

/**
 * The one line a person's words are posted as, to a session's inbox: a `user` message, as Claude Code's
 * own inbox documents it, naming the session it is for. The inbox drops a line whose `session_id` is not
 * its session's, so a socket that has passed to another session since it was observed hears nothing.
 */
export const claudeInboxLine = (sessionId: string, text: string): string =>
  `${JSON.stringify({ type: 'user', session_id: sessionId, message: { role: 'user', content: text } })}\n`;

/**
 * What cannot be said to a Claude Code task's session, as a sentence that says what to do instead — or `undefined`.
 *
 * `bypassPermissions`: Claude Code holds a message from outside for a person to approve when the session it
 * reaches bypasses permission prompts, and a background session nobody has attached to keeps that approval
 * open for ever (the cross-session messaging docs, and 2.1.270's inbound gate). Words sent there reach nobody.
 */
export const claudeSayRefuses = (task: { permissionMode?: string }, text: string): string | undefined => {
  if (task.permissionMode === 'bypassPermissions') {
    return "the task runs in `permissionMode: bypassPermissions`, and Claude Code holds a message sent into such a session for a person to approve — in a background session nobody has attached to, for ever. Nothing said would reach it. Continue its session with a new task that carries the words (`resumeFrom`), as `wf retry --message` does.";
  }
  const length = claudeInboxLine('00000000-0000-0000-0000-000000000000', text).length;
  if (length > CLAUDE_INBOX_LINE_MAX) {
    return `\`text\` makes a line of ${length} characters, and Claude Code's inbox drops a line over ${CLAUDE_INBOX_LINE_MAX} without delivering it. Say less: put the rest in a file, and name the file.`;
  }
  return undefined;
};

/**
 * A running session's inbox, as Claude Code registered it: `<sessions>/<pid>.json`, whose
 * `messagingSocketPath` is the socket it listens on. The pid is the one `claude agents` lists for the
 * session. Refused rather than guessed — the path is the process's, and a pid outlives nothing:
 *
 * - a registration that is not a file this user owns, or that is now another session's;
 * - no absolute `messagingSocketPath`: the session runs without an inbox (Claude Code could not set one up);
 * - a path that is not a socket — a symlink, or anything else put in its place — or one this user does not
 *   own. Claude Code refuses the same before it sends, and so does this.
 *
 * `uid` is who "this user" is: the process's own, passed only by a test, which cannot make a file another's.
 */
export const claudeInbox = async (sessionsDir: string, pid: number, sessionId: string, uid = process.getuid?.()): Promise<string> => {
  const file = path.join(sessionsDir, `${pid}.json`);
  let registration: { sessionId?: unknown; messagingSocketPath?: unknown };
  try {
    const stat = await fs.promises.lstat(file);
    if (!stat.isFile() || (uid !== undefined && stat.uid !== uid)) throw new Error('not a file of yours');
    registration = JSON.parse(await fs.promises.readFile(file, 'utf8'));
  } catch (e) {
    throw new Error(`the session's registration, ${file}, cannot be read (${e instanceof Error ? e.message : String(e)}): it has exited, or runs somewhere this process cannot see.`);
  }
  if (registration?.sessionId !== sessionId) {
    throw new Error(`pid ${pid} is registered to ${String(registration?.sessionId)} now, not ${sessionId}: the session has exited.`);
  }
  const socket = registration.messagingSocketPath;
  if (typeof socket !== 'string' || !path.isAbsolute(socket)) {
    throw new Error(`session ${sessionId} has no inbox (its registration names no socket): Claude Code could not set one up for it, and \`/status\` in the session says why.`);
  }
  let stat: fs.Stats;
  try { stat = await fs.promises.lstat(socket); } catch (e) {
    throw new Error(`session ${sessionId}'s inbox, ${socket}, is not there (${e instanceof Error ? e.message : String(e)}): it has exited.`);
  }
  const refused = inboxSocketRefuses(socket, stat, uid);
  if (refused) throw new Error(refused);
  return socket;
};

/**
 * Why a session's inbox is not a socket to send to, as a sentence — or `undefined`: a path that is not a socket
 * (`lstat` does not follow a symlink, so a link to a real socket is refused too), or one another user owns. Given
 * what `lstat` said and who "this user" is, and pure, so a test can hand it a socket of another user's, which no
 * test can make without root.
 */
export const inboxSocketRefuses = (socket: string, stat: { isSocket(): boolean; uid: number }, uid: number | undefined): string | undefined => {
  if (!stat.isSocket()) return `${socket} is not a socket — a symlink, or something else in its place. Refusing to send.`;
  if (uid !== undefined && stat.uid !== uid) return `${socket} is owned by uid ${stat.uid}, not by you. Refusing to send.`;
  return undefined;
};

/** Whether a process runs under `pid` that this one may signal. One another user's process holds (EPERM) counts as none. */
const signalable = (pid: number): boolean => {
  try { process.kill(pid, 0); return true; } catch { return false; }
};

/**
 * When a process started, as `/proc/<pid>/stat` counts it (its 22nd field): what Claude Code writes in a session's
 * registration as `procStart` (measured on the live `--bg` sessions of 2.1.271). `undefined` where there is no `/proc`.
 */
export const processStart = (pid: number): string | undefined => {
  let stat: string;
  try { stat = fs.readFileSync(`/proc/${pid}/stat`, 'utf8'); } catch { return undefined; }
  // The second field is the command's name in parentheses, which may hold spaces and parentheses: count from the last.
  return stat.slice(stat.lastIndexOf(')') + 2).split(' ')[19];
};

/**
 * The running background session Claude Code has registered under `name` — from `<sessionsDir>/<pid>.json`, which the
 * session writes for itself (`pid`, `sessionId`, `name`, `kind`) and `say` reads an inbox from — or `undefined`. A few
 * milliseconds, where `claude agents --json` takes a third of a second (2.1.271).
 *
 * Which session it is, and nothing of its state: the file does not say whether a session is working, idle or blocked,
 * and that stays the registry's. And a running session only, because a registration outlives its process (18 of the
 * 21 on the machine this was written on had none). So a file is taken only when:
 *
 * - it is a file this user owns, named for the `pid` it holds, of a `bg` session: an interactive one is never ours;
 * - a process this user may signal runs under that pid;
 * - where the system says when a process started (`/proc`), it started when the registration says (`procStart`): a pid
 *   another process has taken since is not the session. Without `/proc` (macOS) that check is not made.
 *
 * `uid` is who "this user" is, and `startOf` when a process started: both passed only by a test.
 */
export const claudeRegistered = async (
  sessionsDir: string,
  name: string,
  { uid = process.getuid?.(), startOf = processStart }: { uid?: number; startOf?: (pid: number) => string | undefined } = {},
): Promise<{ sessionId: string; pid: number } | undefined> => {
  let files: string[];
  try { files = await fs.promises.readdir(sessionsDir); } catch { return undefined; }
  for (const f of files) {
    const pid = Number(/^([1-9]\d*)\.json$/.exec(f)?.[1]);
    if (!pid) continue;
    let r: { pid?: unknown; sessionId?: unknown; name?: unknown; kind?: unknown; procStart?: unknown } | null;
    try {
      const file = path.join(sessionsDir, f);
      const stat = await fs.promises.lstat(file);
      if (!stat.isFile() || (uid !== undefined && stat.uid !== uid)) continue;
      r = JSON.parse(await fs.promises.readFile(file, 'utf8'));
    } catch { continue; } // gone since the directory was read, or read mid-write: not found this time
    if (r?.name !== name || r.kind !== 'bg' || r.pid !== pid || typeof r.sessionId !== 'string' || !r.sessionId) continue;
    if (!signalable(pid)) continue;
    const started = startOf(pid);
    if (started !== undefined && String(r.procStart) !== started) continue;
    return { sessionId: r.sessionId, pid };
  }
  return undefined;
};

/** How long a post to a session's inbox may take. The inbox answers nothing, so this bounds a connection that hangs. */
const SAY_TIMEOUT_MS = 5_000;

/**
 * One line, written to a session's inbox socket and the connection ended.
 *
 * Resolves once the whole line is written: from then on it is in the socket's queue, and Claude Code reads it
 * when its loop comes back to the connection. So an inbox slow to close its end — a process busy past the
 * deadline — has still been given the words, and this says so, rather than reporting words it handed over as
 * words it did not (found in review). Rejects when the line was not all written: the connection refused or
 * reset, or still being written at the deadline. An inbox drops a line cut short, so then nothing was given.
 */
export const claudeInboxPost = (socket: string, line: string, timeoutMs = SAY_TIMEOUT_MS) => new Promise<void>((resolve, reject) => {
  let written = false;
  let done = false;
  const finish = (error?: Error) => {
    if (done) return;
    done = true;
    clearTimeout(timer);
    if (error) reject(error); else resolve();
  };
  const c = net.createConnection({ path: socket });
  const timer = setTimeout(() => {
    c.destroy();
    finish(written ? undefined : new Error(`${socket} took only part of the line within ${timeoutMs} ms, and an inbox drops a line cut short`));
  }, timeoutMs);
  c.on('connect', () => c.end(line, () => { written = true; }));
  c.on('data', () => { /* the inbox answers nothing; anything it did say is not ours to read */ });
  c.on('error', (e) => finish(e));
  c.on('close', () => finish(written ? undefined : new Error(`${socket} closed the connection before the words were written`)));
});

const isMap = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);
const isStringMap = (v: unknown) => isMap(v) && Object.values(v).every((s) => typeof s === 'string');

/**
 * Why a task's `mcp` is not a map of MCP servers, as a sentence that says what to write — or
 * `undefined`. Closed, like a brief's keys, because Claude Code does not refuse an entry it cannot
 * use: on 2.1.270 a `url` with no `type` loads no server and says nothing.
 */
export const mcpRefuses = (mcp: unknown): string | undefined => {
  const shape = 'An entry is { "command": "npx", "args": [...], "env": {...} }, or { "type": "http", "url": "https://...", "headers": {...} }, as in a `.mcp.json`.';
  if (!isMap(mcp)) return `\`mcp: ${JSON.stringify(mcp)}\` is not a map of MCP servers by name. ${shape}`;
  for (const [name, server] of Object.entries(mcp)) {
    const at = `\`mcp.${name}\``;
    if (!/^[\w-]+$/.test(name)) return `\`mcp: ${JSON.stringify(name)}\` is not a server name. Use letters, digits, - and _.`;
    if (!isMap(server)) return `${at} is not a server. ${shape}`;
    const local = 'command' in server;
    if (local === ('url' in server)) return `${at} has ${local ? 'both `command` and `url`' : 'neither `command` nor `url`'}. ${shape}`;
    const stray = Object.keys(server).find((k) => !(local ? ['type', 'command', 'args', 'env'] : ['type', 'url', 'headers']).includes(k));
    if (stray) return `${at} has \`${stray}\`, which a server with a \`${local ? 'command' : 'url'}\` does not take. ${shape}`;
    if (local) {
      if (typeof server.command !== 'string' || !server.command) return `\`mcp.${name}.command\` is not a program to run. Give it as a string, like "npx".`;
      if (server.type !== undefined && server.type !== 'stdio') return `${at} has a \`command\` and \`type: ${JSON.stringify(server.type)}\`. Leave \`type\` out, or give "stdio".`;
      if (server.args !== undefined && !(Array.isArray(server.args) && server.args.every((a) => typeof a === 'string'))) {
        return `\`mcp.${name}.args\` is not a list of strings. Give one argument per entry, like ["-y", "@playwright/mcp"].`;
      }
      if (server.env !== undefined && !isStringMap(server.env)) return `\`mcp.${name}.env\` is not a map of strings. Quote every value, like { "PORT": "3000" }.`;
    } else {
      if (typeof server.url !== 'string' || !server.url) return `\`mcp.${name}.url\` is not an address. Give it as a string, like "https://example.com/mcp".`;
      if (server.type !== 'http' && server.type !== 'sse') {
        return `${at} has a \`url\` and ${server.type === undefined ? 'no `type`' : `\`type: ${JSON.stringify(server.type)}\``}. Give "type": "http", or "sse": Claude Code loads no server from a url without one.`;
      }
      if (server.headers !== undefined && !isStringMap(server.headers)) return `\`mcp.${name}.headers\` is not a map of strings. Quote every value, like { "Authorization": "Bearer ..." }.`;
    }
  }
  return undefined;
};

/**
 * The checkout's own `.mcp.json`, when it has one: the repository's servers, named so that
 * `--strict-mcp-config` keeps them. One that is not JSON is refused here, before anything runs —
 * named, it stops the CLI before a session exists ("MCP config is not a valid JSON", 2.1.270).
 */
export const checkoutMcpConfig = (cwd: string): string | undefined => {
  // Absolute: Claude Code resolves the flag's path from inside the cwd, so `repo` would name repo/repo.
  const file = path.resolve(cwd, '.mcp.json');
  let text: string;
  try {
    if (!fs.statSync(file).isFile()) return undefined;
    text = fs.readFileSync(file, 'utf8');
  } catch { return undefined; }
  try { JSON.parse(text); } catch (e) {
    throw new Error(`${file} is not valid JSON (${(e as Error).message}), and Claude Code starts no session with it named. Fix the file, or remove it from the checkout.`);
  }
  return file;
};

/**
 * A task's `mcp`, written to `file` as an MCP config (`{"mcpServers": …}`) — or `file` cleared when
 * the task names none, so a re-spawn never finds servers it was not given. Owner-only: an `env` or
 * `headers` value may be a secret.
 */
export const writeMcpConfig = (file: string, mcp: SpawnRequest['mcp']): string | undefined => {
  if (!mcp || !Object.keys(mcp).length) { fs.rmSync(file, { force: true }); return undefined; }
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, JSON.stringify({ mcpServers: mcp }), { mode: 0o600 });
  // Absolute for the same reason as the checkout's: a root given relative is relative to the engine.
  return path.resolve(file);
};

/**
 * Claude Code's MCP flags: the configs given, then `--strict-mcp-config` and `--no-chrome`, always.
 *
 * Strict loads those configs and nothing else — but not every server comes from a config. Claude in
 * Chrome, which drives the operator's own browser and whatever they are signed in to there, is
 * switched on by a user setting (`claudeInChromeDefaultEnabled`), and it was still connecting in a
 * `--bg` session spawned strict (2.1.270). So it is switched off by its own flag; a step that needs a
 * browser names one in `mcp` or its checkout's `.mcp.json`. Strict comes straight after the configs
 * because `--mcp-config` is variadic.
 */
export const claudeMcpArgs = (configs: ReadonlyArray<string | undefined>): string[] => {
  const named = configs.filter((c): c is string => c !== undefined);
  return [...(named.length ? ['--mcp-config', ...named] : []), '--strict-mcp-config', '--no-chrome'];
};

/**
 * A session's closing statement as this runner reads it: what it said, when it said it, and whether its conversation
 * ends with the statement's own result (`lastWord`). The first two go to the engine, which decides whose statement it
 * is; the third never leaves the runner — it is how a session held by something that is not the work is told from one
 * still doing it (issue 24).
 */
type Statement = { payload: unknown; at: number; lastWord?: boolean };

export type ClaudeOptions = {
  quiescentAfterMs?: number;
  now?: () => number;
  /** When the session's transcript was last written. Injectable so tests need no harness. */
  transcriptTime?: (sessionId: string) => Promise<number | undefined>;
  /** The session's closing statement, as above. Injectable for the same reason. */
  closeoutFrom?: (sessionId: string) => Promise<Statement | undefined>;
  /** What the session consumed since `since`, its own start. Injectable for the same reason. */
  usageFrom?: (sessionId: string, since: number) => Promise<Usage | undefined>;
  /** Where the runner writes what it hands the CLI by path — a task's MCP config. Default `~/.agent-engine`. */
  root?: string;
  /**
   * Where Claude Code registers each running session, by pid: `find` finds a session there by its name, and `say` its inbox. Default
   * `sessions` under `$CLAUDE_CONFIG_DIR`, or under `~/.claude`, read when the runner is made.
   */
  sessionsDir?: string;
};

/**
 * Claude Code, through its CLI: the harness owns the session, so nothing here owns a process.
 *
 * ## What "done" means for this harness, and why it is decided here
 *
 * `state: done` is not reliable for the work a fleet actually runs. Measured, three times: a short
 * single-deliverable task reached `done` in 67 seconds, while every long multi-step task stopped
 * at `working` and stayed there — 14 minutes in one case, with its transcript frozen and its files
 * written. Whether anyone was attached made no difference (a controlled pair says so).
 *
 * `status` is the signal that does hold. It flipped to `idle` at the exact second the transcript
 * took its final write, in every probe. Claude Code's own web UI tracks `status` for its liveness
 * dot rather than `state`, which is the same conclusion arrived at independently.
 *
 * So this harness reports a session that has stopped in one of two ways:
 *
 *     done   ⟸  state = done
 *     quiet  ⟸  state = working AND not busy AND nothing written for QUIESCENT_AFTER_MS, counted from its
 *               last write or its own start, whichever is later: `quietMs`, with `working` left as it is
 *     quiet  ⟸  state = working AND busy AND the last word in its conversation is its OWN closeout's tool
 *               result, nothing written since for QUIESCENT_AFTER_MS — its process is held by something that
 *               is not the work: a background shell the session left running (issue 24)
 *
 * Telling a quiet session from one between steps lives HERE, in the runner, and not in `decide`: `working`
 * and `idle` are this harness's vocabulary; the engine's is `working | blocked | done | failed | stopped`,
 * and translating one into the other is the whole job of a runner. What quiet MEANS does not live here. It
 * was `done`, and a task that had asked for a closing statement and was told none settled `succeeded` (bug 1,
 * `docs/open-issues.md`); only the journal knows whether one was asked for, so `decide` says. A harness that
 * ends by exiting — `codex exec` — answers the same question by exit code and needs none of this.
 */
export const claudeOps = (options: ClaudeOptions = {}): RunnerOps => {
  const quiescentAfterMs = options.quiescentAfterMs ?? QUIESCENT_AFTER_MS;
  const now = options.now ?? (() => Date.now());
  const root = options.root ?? path.join(os.homedir(), '.agent-engine');
  const sessionsDir = options.sessionsDir ?? path.join(process.env.CLAUDE_CONFIG_DIR ?? path.join(os.homedir(), '.claude'), 'sessions');
  /** A task's MCP config, kept outside the workspace: a file in a step's worktree travels down its branch. */
  const mcpFile = (name: string) => path.join(root, 'mcp', `${name.replace(/[^a-zA-Z0-9]+/g, '_')}.json`);
  const transcriptTime = options.transcriptTime ?? (async (sessionId: string) => {
    try { return (await getSessionInfo(sessionId))?.lastModified; } catch { return undefined; }
  });
  const closeoutFrom = options.closeoutFrom ?? (async (sessionId: string) => {
    const file = transcriptFile(sessionId);
    if (!file) return undefined;
    try { return lastStructuredOutput(await fs.promises.readFile(file, 'utf8')); } catch { return undefined; }
  });
  const usageFrom = options.usageFrom ?? (async (sessionId: string, since: number) => {
    const file = transcriptFile(sessionId);
    if (!file) return undefined;
    try { return transcriptUsage(await fs.promises.readFile(file, 'utf8'), since); } catch { return undefined; }
  });

  /**
   * What a finished attempt said and consumed, as read from its transcript — kept for THAT attempt,
   * and only while the transcript has not been written since. A working session is read on every
   * idle pass instead, because that is when it may just have spoken. Losing this only re-reads.
   *
   * `keep` says which reads are worth keeping, and the caller decides: an attempt whose session the registry
   * lists FINAL, and a busy session read over a transcript cold for the quiescence floor (issue 24), which is
   * reached only while nothing has been written and so answers the same until something is. Without that
   * second one, a session in any tool call longer than ninety seconds — `npm ci`, a build, this repository's
   * own suite — was read in full on every pass of `wf up`, for the length of the call: measured on a 39.5 MB
   * transcript, 174–282 ms a read against 17–60 ms for the mtime that gates it (found in review).
   *
   * Both conditions are what reading again would find, so no driver answers differently for having
   * seen the session before. Kept by session id, for good, it failed twice on one step
   * (`let-a-step-say-which-tools-i-v27t-implement`, 2026-09-13). The registry listed the session
   * final to a `view` — which observes without stepping — at least ten seconds before it gave its (the reading the evidence allows, not a measurement)
   * StructuredOutput, so "nothing said" was kept, and the end the tick later wrote had no closeout and
   * that earlier moment's usage. Then the nudged retry `--resume`d the same id and was handed both, to
   * the byte. An attempt is the row's name, its session, and the start `claude agents` gave it.
   */
  type Kept<T> = { value: T; readAt: number };
  const keptStatements = new Map<string, Kept<Statement | undefined>>();
  const keptUsage = new Map<string, Kept<Usage | undefined>>();
  const attemptOf = (name: string, s: Sighting, startedAt: number | undefined) => JSON.stringify([name, s.sessionId, startedAt ?? null]);
  const keptRead = async <T>(
    kept: Map<string, Kept<T>>, attempt: string, keep: boolean,
    writtenAt: () => Promise<number | undefined>, read: () => Promise<T>,
  ): Promise<T> => {
    if (!keep) return read();
    const pin = kept.get(attempt);
    if (pin) {
      const written = await writtenAt();
      if (written !== undefined && written < pin.readAt - MTIME_SLOP_MS) return pin.value;
    }
    const readAt = now();
    const value = await read();
    kept.set(attempt, { value, readAt });
    return value;
  };
  const statementOf = (attempt: string, s: Sighting, writtenAt: () => Promise<number | undefined>, keep = FINAL.has(s.state)) =>
    keptRead(keptStatements, attempt, keep, writtenAt, () => closeoutFrom(s.sessionId));
  /**
   * No start in the registry, no usage — without one, a resumed session's inherited conversation
   * cannot be told from its own, and a wrong count is worse than none.
   */
  const usageOf = async (attempt: string, s: Sighting, since: number | undefined, writtenAt: () => Promise<number | undefined>, keep = FINAL.has(s.state)) =>
    since === undefined ? undefined : keptRead(keptUsage, attempt, keep, writtenAt, () => usageFrom(s.sessionId, since));

  /**
   * Each of our sessions' state as `claude agents` itself last listed it: what `release` stops on, whatever
   * the sighting it is handed says. A session whose end is on the record — quiet, or idle after its closeout —
   * is still running on Claude Code, and `release` must stop that one. Rebuilt by every `observe`, which a
   * pass always makes before it releases anything.
   */
  const listed = new Map<string, Observed>();
  /**
   * The process `claude agents` last listed for each of our sessions, by session id: how `say` finds the
   * session's registration, and so its inbox. Rebuilt by every `observe`, which `say` is always handed a
   * session from; a session listed with no process — one that has exited — has none.
   */
  const pids = new Map<string, number>();
  /** When `claude agents` last listed each of our sessions as started, by session id: what `release` reads usage from. */
  const starts = new Map<string, number>();

  return ({
    spawn: (r) => Effect.try({
      // Found and written before the CLI runs, so whatever throws here started nothing.
      try: () => claudeMcpArgs([checkoutMcpConfig(r.cwd), writeMcpConfig(mcpFile(r.name), r.mcp)]),
      catch: (cause) => new RunnerError({ verb: 'spawn', message: `claude --bg: ${cause instanceof Error ? cause.message : String(cause)}`, refused: true }),
    }).pipe(Effect.flatMap((mcpArgs) => sh('claude', [
      '--bg',
      '--name', r.name,
      // The fence. `--tools`, not `--allowedTools`: a tool the session does not have beats one it
      // may not use, and `--allowedTools` only pre-approves. VARIADIC — directly before the prompt
      // it would take the prompt as a tool name, the `--worktree` trap — so it goes here, and the
      // `--permission-mode` that always comes next ends the list. An empty list is no tools at all.
      ...(r.tools ? ['--tools', r.tools.join(',')] : []),
      // The deny list, the other half of the fence: a tool the session has, or a command it may run, that it
      // must not use — `Bash(npm run build)`, which the checkout's settings allow for another step's sake. A deny
      // beats every allow. Variadic as `--tools` is, and ended the same way. Claude Code splits it on commas and
      // spaces outside a rule's parentheses (its help's own example is "Bash(git *) Edit"), so one argument holds them.
      ...(r.disallowedTools?.length ? ['--disallowedTools', r.disallowedTools.join(',')] : []),
      // Remote Control, only when the task asks: the session bridged to claude.ai and listed in its agents view, where it
      // can be driven from a browser or a phone, not only seen. A `--bg` session gets a `bridgeSessionId` only with this
      // flag (measured on 2.1.273). `--remote-control [name]` takes an OPTIONAL value — the `--worktree` trap, the prompt
      // taken as its name — so it goes here, where the `--permission-mode` that always follows cannot be taken for one.
      ...(r.remoteControl ? ['--remote-control'] : []),
      // `auto` rather than `acceptEdits`, and the difference decides whether a fleet works.
      // `acceptEdits` approves edits and `mkdir`/`mv`/`cp` — but NOT `npm test`, so the first
      // session that wants to run its own tests stops and waits for a person who is not there.
      // `auto` approves everything with background safety checks, which the docs recommend for
      // exactly this: long tasks, no prompt fatigue. Overridable per task; never silently.
      '--permission-mode', r.permissionMode ?? 'auto',
      // MCP servers: the ones named here and no others. Without `--strict-mcp-config` a session loads
      // every server the operator has — user scope, and their claude.ai connectors (mail, calendar,
      // drive), measured on 2.1.270 — so it is on every spawn. Strict alone drops the checkout's
      // `.mcp.json` as well, so that file is named when there is one, beside the task's own `mcp`.
      // Claude in Chrome is not in any config and survives strict, so `--no-chrome` goes with it.
      ...mcpArgs,
      ...(r.model ? ['--model', r.model] : []),
      ...(r.effort ? ['--effort', r.effort] : []),
      // The context window: past about it, the session compacts its conversation and carries on — on `--bg` too, and it still
      // signs off (measured on 2.1.278, open issue 26). Takes a required value, so it can neither swallow the prompt nor be taken
      // for a `--tools` entry, which the `--permission-mode` above has ended. The same window on every attempt: a resumed
      // copy keeps only the flags it is given, so a continuation given none would run on the model's whole window again.
      ...(r.contextTokens !== undefined ? ['--autocompact', String(r.contextTokens)] : []),
      // `--resume` continues that conversation in the background. The NAME is still ours and
      // still new, so a resumed attempt is a distinct row on the board from the one it continues.
      ...(r.resumeFrom ? ['--resume', r.resumeFrom] : []),
      // The harness cuts and cleans the worktree; the engine only declares that it wants one.
      // This is the Pod/volume split: a workload asks for storage, the kubelet provisions it.
      //
      // ALWAYS with a name, even when the task did not choose one. `--worktree [name]` takes an
      // OPTIONAL value, so a bare `--worktree` immediately before the prompt eats the prompt as
      // the worktree's name and the session runs with nothing to do. Measured, not theorised.
      ...(r.worktree ? ['--worktree', worktreeName(r)] : []),
      // The closing statement's shape. Claude Code gives the session a StructuredOutput tool for
      // it, which works under `--bg` as well as `-p` — verified on 2.1.270, though documented only
      // for `-p`. Takes a required value, so unlike `--worktree` it cannot swallow the prompt.
      ...(r.closeoutSchema ? ['--json-schema', JSON.stringify(r.closeoutSchema)] : []),
      // The spend cap, as asked. Claude Code keeps it only with `--print`, so `file()` refuses a budget on this harness
      // (`claudeBgRefuses`); a task that reaches the runner with one anyway is not given less than it asked for.
      ...(r.budgetUsd !== undefined ? ['--max-budget-usd', String(r.budgetUsd)] : []),
      r.brief,
    ], { cwd: r.cwd, verb: 'spawn' }))).pipe(Effect.asVoid),

    observe: sh('claude', ['agents', '--all', '--json'], { verb: 'observe' }).pipe(
      Effect.map((out) => {
        const rows = JSON.parse(out) as Array<{ sessionId?: string; name?: string; state?: string; status?: string; startedAt?: unknown; pid?: unknown }>;
        const m = new Map<string, { sighting: Sighting; startedAt?: number }>();
        listed.clear();
        pids.clear();
        starts.clear();
        for (const row of rows) {
          // `state` and `status` answer different questions and are NOT a fallback chain. `state`
          // is the session's lifecycle; `status` is whether its process is busy this instant. A
          // row with no `state` is an interactive session — never one of ours — and reading its
          // `status` as a state is how `idle` once became a recorded failure.
          const state = row.state as Observed | undefined;
          // Only sessions WE named are ours. Everything else on the machine is somebody else's.
          // For this harness the session id IS the native id — `--resume` takes exactly it.
          if (row.name?.startsWith('ae/') && row.sessionId && state) {
            listed.set(row.sessionId, state);
            if (Number.isInteger(row.pid) && (row.pid as number) > 0) pids.set(row.sessionId, row.pid as number);
            if (typeof row.startedAt === 'number') starts.set(row.sessionId, row.startedAt);
            m.set(row.name, {
              sighting: { sessionId: row.sessionId, state, busy: row.status === 'busy', nativeId: row.sessionId },
              // When THIS session started, as the harness recorded it: what usage is counted from.
              startedAt: typeof row.startedAt === 'number' ? row.startedAt : undefined,
            });
          }
        }
        return m;
      }),
      // Second pass: apply this harness's own definition of finished to whatever is still
      // `working`. Only quiescent candidates cost a transcript READ — a session whose process is busy costs
      // its transcript's mtime and nothing more until that has been cold for the floor, and one read then,
      // kept for as long as it stays cold.
      //
      // The clock is the TRANSCRIPT'S, not ours. An earlier version remembered when each session
      // was first seen idle, which made the verdict depend on the observer surviving long enough
      // to reach it — true of `wf up`, false of anything that ticks once per process and exits.
      // Measured, with a one-second window and a month-cold transcript: one long-lived process
      // said `done`; three consecutive one-shot processes each said `working`, forever. The
      // transcript's mtime already answers "how long has this been quiet", so nothing needs
      // remembering and every driver gets the same answer.
      Effect.flatMap((m) => {
        // What was kept for an attempt no longer listed goes with it: a released session is not read again.
        const attempts = new Set([...m].map(([name, { sighting, startedAt }]) => attemptOf(name, sighting, startedAt)));
        for (const kept of [keptStatements, keptUsage]) for (const key of kept.keys()) if (!attempts.has(key)) kept.delete(key);
        return Effect.forEach(
          [...m],
          ([name, { sighting, startedAt }]) =>
            Effect.promise(async () => {
              const attempt = attemptOf(name, sighting, startedAt);
              // When the transcript was last written: asked once a pass at most, and only if needed.
              let written: Promise<number | undefined> | undefined;
              const writtenAt = () => (written ??= transcriptTime(sighting.sessionId));
              /**
               * How long it has been quiet: from its last write or its own start, whichever is later — a
               * session resumed over a transcript cold for an hour has been quiet only since it began, and
               * measured by the transcript alone it would end the moment the registry listed it idle. No
               * transcript, no measure: the deadline is for sessions nobody reads.
               */
              const quietFor = async () => {
                const lastWrite = await writtenAt();
                return lastWrite === undefined ? undefined : now() - Math.max(lastWrite, startedAt ?? lastWrite);
              };
              // Busy right now: nothing it has said is final and nothing about it is quiet. A long tool
              // call writes nothing for minutes, and `busy` is what keeps that from reading as silence.
              //
              // Unless the last word in its conversation is its own closeout and nothing has followed it for
              // the floor. Then the work is over and something else is holding the process: a background shell
              // the session left running held one for seventy-seven minutes, its closeout unread, and only a
              // person ending the shell let it go (issue 24). Both halves are needed — a session in a long turn
              // has said nothing since its last tool call, and one whose closeout is its parent's has said
              // nothing of its own at all.
              //
              // Both reads here are KEPT while the transcript stays as they found it (`keep`), because this branch
              // is reached only over a transcript nothing has written for the floor: a tool call that runs for
              // minutes would otherwise be a full read of a multi-megabyte file on every pass, always answering the
              // same (found in review).
              if (sighting.busy) {
                const quiet = sighting.state === 'working' ? await quietFor() : undefined;
                if (quiet === undefined || quiet < quiescentAfterMs || startedAt === undefined) return [name, sighting] as const;
                const said = await statementOf(attempt, sighting, writtenAt, true);
                if (!said?.lastWord || said.at < startedAt) return [name, sighting] as const;
                // Over, so what it consumed is final too — read here as it is for any session that has stopped.
                const used = await usageOf(attempt, sighting, startedAt, writtenAt, true);
                return [name, { ...sighting, closeout: { payload: said.payload, at: said.at }, ...(used ? { usage: used } : {}), quietMs: quiet }] as const;
              }
              // What the workload SAID, if it said anything — reported with when it was said.
              // Whether it belongs to this attempt is the engine's call, not ours: a resumed
              // session carries its parent's statements too, and only the journal knows when
              // the attempt began.
              const said = await statementOf(attempt, sighting, writtenAt);
              // And what it has consumed since its own start — reported as measured, or not at all.
              const used = await usageOf(attempt, sighting, startedAt, writtenAt);
              const reported: Sighting = { ...sighting, ...(said ? { closeout: { payload: said.payload, at: said.at } } : {}), ...(used ? { usage: used } : {}) };
              if (reported.state !== 'working') return [name, reported] as const;
              // The floor underneath, statement or not: how long it has been quiet, once that is long
              // enough to be stopped rather than paused — reported, not concluded (`decide` says what it
              // means). Kept even when there IS a statement, because an inherited one is discarded
              // upstream.
              const quiet = await quietFor();
              return quiet !== undefined && quiet >= quiescentAfterMs
                ? [name, { ...reported, quietMs: quiet }] as const
                : [name, reported] as const;
            }),
          { concurrency: 'unbounded' },
        ).pipe(Effect.map((entries) => new Map(entries)));
      }),
    ),

    /**
     * The session running under `name`, from its registration (`claudeRegistered`) rather than `claude agents`: about
     * 2 ms here, where the CLI took about 330 ms (2.1.271, 231 rows). Which session it is, never its state. Every live
     * registration on the machine this was measured on named the same session, under the same name, as `claude agents`
     * listed for its pid.
     */
    find: (name) => Effect.tryPromise({
      try: async () => {
        const found = await claudeRegistered(sessionsDir, name);
        return found && { sessionId: found.sessionId };
      },
      catch: (cause) => new RunnerError({ verb: 'find', message: `claude --bg: ${cause instanceof Error ? cause.message : String(cause)}` }),
    }),

    // `claude stop` takes the short id, which is the uuid's first block.
    stop: (sessionId) => sh('claude', ['stop', short(sessionId)], { verb: 'stop' }).pipe(Effect.asVoid),

    /**
     * A session whose end is on the record, let go: `claude stop` if it still runs, then `claude rm`.
     * Without this it stayed in `claude agents` for good — one that gave its closeout sat `working/idle`
     * there — and every run's sessions were cleared by hand. Measured before relying on it
     * (`test/live.test.ts`, 2.1.270): once removed, `ae logs` still reads the session's transcript and
     * `--resume <id>` still continues it.
     *
     * Only stopped when the task asked for a worktree: `claude rm` deletes "a background session and its
     * worktree", and the task's work is in that worktree.
     *
     * And what the session consumed, read again once it is stopped: Claude Code writes a session's cost into its
     * transcript only as the process exits, and `claude stop` returns once it has (measured on 2.1.272: 0.6 s, both
     * `cost-state` lines there as it returned). The end on the record was read before that, with no cost in it.
     */
    release: (session, task) => Effect.gen(function* () {
      // The registry's word, not the sighting's: a session whose end is on the record — quiet, or idle
      // after its closeout — is still running (found in review, when quiet was reported `done`). A session
      // this runner has not listed — no `observe` made here — has only its sighting to go by. A process listed
      // for it runs whatever its state says: a session `done` keeps its process until it is stopped (2.1.272).
      const running = listed.get(session.sessionId) ?? session.state;
      const alive = running === 'working' || running === 'blocked' || pids.has(session.sessionId);
      if (alive) {
        // Failing only if it exited since it was observed — which leaves `rm` exactly as able to go on.
        yield* sh('claude', ['stop', short(session.sessionId)], { verb: 'release' }).pipe(
          Effect.catchTag('RunnerError', () => Effect.succeed('')),
        );
      }
      // Read before `rm`: one that fails leaves the session listed, and the next pass's sighting carries the same read.
      const since = starts.get(session.sessionId);
      const measured = alive && since !== undefined
        ? yield* Effect.promise(() => usageFrom(session.sessionId, since).catch(() => undefined))
        : undefined;
      if (!task.worktree) yield* sh('claude', ['rm', short(session.sessionId)], { verb: 'release' });
      return measured;
    }),

    // The one verb where the Agent SDK is simply better than the CLI: `getSessionMessages` reads
    // the stored transcript as TYPED messages, and it works on sessions it never started — the
    // `claude --bg` ones included. Measured, not assumed.
    logs: (sessionId) =>
      Effect.tryPromise({
        try: () => getSessionMessages(sessionId),
        catch: (cause) => new RunnerError({ verb: 'logs', message: String(cause) }),
      }).pipe(Effect.map(renderTranscript)),

    // Read from the raw JSONL rather than through `getSessionMessages`, as the closeout is: the SDK's
    // messages carry no timestamp, and a board needs to know when each thing was said.
    transcript: (sessionId, after) =>
      Effect.tryPromise({
        try: () => readTranscript(transcriptFile(sessionId), after, claudeTranscriptEvents),
        catch: (cause) => new RunnerError({ verb: 'transcript', message: cause instanceof Error ? cause.message : String(cause) }),
      }),

    /**
     * A person's words, posted verbatim to the session's own inbox socket — the one Claude Code documents for a
     * script to post into a session, and the one another session's `SendMessage` reaches. No token: on macOS
     * and Linux the inbox takes a connection without one (it requires one only on native Windows, whose inbox
     * is a named pipe and is refused as not a socket), and the token beside the registration is another
     * session's credential, not this engine's to read. Measured on 2.1.270, by hand on a busy session and an idle
     * one, and end to end by `test/live.test.ts` (`docs/open-issues.md`, verified live): a busy session reads the
     * words between tool calls; an idle one starts a turn with them. One blocked on a permission prompt queues them
     * and never reads them (open issue 16).
     *
     * The inbox writes nothing back, so this resolves on the words being taken, not on their being read: a
     * `crossSessionInbound` of `hold` or `refuse` in the operator's settings, a rate limit, or an identical
     * repeat inside Claude Code's window, drops them where nothing here can see.
     */
    say: (session, text) =>
      Effect.tryPromise({
        try: async () => {
          const pid = pids.get(session.sessionId);
          if (pid === undefined) {
            throw new Error(`\`claude agents\` lists no process for ${session.name} (${session.sessionId}): it has exited, or this runner has not observed it.`);
          }
          await claudeInboxPost(await claudeInbox(sessionsDir, pid, session.sessionId), claudeInboxLine(session.sessionId, text));
        },
        catch: (cause) => new RunnerError({ verb: 'say', message: `claude --bg: ${cause instanceof Error ? cause.message : String(cause)}` }),
      }),
  });
};

/** A harness that costs nothing: sessions are a map, and a test moves them by hand. */
export const testOps = (control?: { sessions: Map<string, Sighting>; spawned?: SpawnRequest[] }): RunnerOps => {
  const sessions = control?.sessions ?? new Map<string, Sighting>();
  /** Every spawn request, so a test can assert what the harness was actually asked for. */
  const spawned = control?.spawned ?? [];
  let n = 0;
  return {
      spawn: (r) => Effect.sync(() => {
        const id = `fake-${++n}`;
        sessions.set(r.name, { sessionId: id, state: 'working', nativeId: id });
        spawned.push(r);
      }),
      observe: Effect.sync(() => new Map(sessions)),
      stop: (id) => Effect.sync(() => {
        for (const [name, s] of sessions) if (s.sessionId === id) sessions.set(name, { ...s, state: 'stopped' });
      }),
    logs: () => Effect.succeed('(fake runner: no logs)'),
  };
};

const short = (sessionId: string) => sessionId.split('-')[0]!;

const sh = (cmd: string, args: string[], o: { cwd?: string; verb: string }) =>
  Effect.callback<string, RunnerError>((resume) => {
    const child = execFile(cmd, args, { cwd: o.cwd, maxBuffer: 8 * 1024 * 1024 }, (err, stdout, stderr) => {
      resume(err
        ? Effect.fail(new RunnerError({
            verb: o.verb, message: `${cmd} ${args[0]}: ${stderr || err.message}`.trim(),
            // The OS never created the process — no binary, no cwd — so nothing ran and nothing
            // started. Any other failure ran the command, and whether it registered a session first
            // is not something its exit code says.
            ...((err as NodeJS.ErrnoException).syscall?.startsWith('spawn') ? { refused: true } : {}),
          }))
        : Effect.succeed(stdout));
    });
    return Effect.sync(() => child.kill());
  });

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
      return `${(msg.type ?? '?').padEnd(9)} ${String(text).replace(/\s+/g, ' ').slice(0, 160)}`;
    })
    .join('\n');

/**
 * A worktree name for this attempt. Derived from the session name when the task did not pick one,
 * so it is stable, greppable, and — the point — never absent.
 */
export const worktreeName = (r: SpawnRequest): string =>
  typeof r.worktree === 'string' ? r.worktree : r.name.replace(/[^a-zA-Z0-9]+/g, '-').replace(/^-|-$/g, '');
