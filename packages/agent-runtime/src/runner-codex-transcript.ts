/**
 * A Codex thread's rollout, read: where it is, and its records as events — the counterpart of
 * `runner-claude-transcript.ts`, for the `codex` spec (`runner-codex.ts`).
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import type { TranscriptEvent } from './runner.ts';
import { isoTime } from './runner-transcript.ts';

/**
 * A Codex thread's rollout, where Codex keeps its own record of the conversation:
 * `$CODEX_HOME/sessions/YYYY/MM/DD/rollout-<local time>-<thread id>.jsonl` (0.154.0). Found by the thread
 * id — the `thread_id` of `exec --json`'s first event, which the worker keeps as the run's `nativeId` —
 * newest day first, and remembered once found.
 */
const rollouts = new Map<string, string>();
export const codexRolloutFile = (threadId: string): string | undefined => {
  // An id, not a path: nothing but what a thread id is made of goes into a file name.
  if (!/^[0-9a-f-]+$/.test(threadId)) return undefined;
  const known = rollouts.get(threadId);
  if (known && fs.existsSync(known)) return known;
  const sessions = path.join(process.env.CODEX_HOME ?? path.join(os.homedir(), '.codex'), 'sessions');
  const newestFirst = (...dir: string[]) => { try { return fs.readdirSync(path.join(sessions, ...dir)).sort().reverse(); } catch { return []; } };
  for (const y of newestFirst()) for (const m of newestFirst(y)) for (const d of newestFirst(y, m)) {
    const name = newestFirst(y, m, d).find((f) => f.startsWith('rollout-') && f.endsWith(`-${threadId}.jsonl`));
    if (name) {
      const file = path.join(sessions, y, m, d, name);
      rollouts.set(threadId, file);
      return file;
    }
  }
  return undefined;
};

/** The text of a list of content blocks, as far as each has any. */
const textsOf = (blocks: unknown): string[] =>
  Array.isArray(blocks)
    ? blocks.map((b) => (typeof b === 'string' ? b : (b as { text?: unknown } | null)?.text)).filter((t): t is string => typeof t === 'string')
    : [];

/**
 * One record of a Codex rollout as events.
 *
 * A rollout says most things twice: once as the model was given them (`response_item`) and once as the
 * thread items Codex itself shows (`event_msg` / `item_completed`). The items are read, because they are
 * what a person would be shown (measured on the 34 rollouts on this machine, codex-cli 0.154.0):
 *
 * - `UserMessage` is the prompt alone. As the model is given it, it comes among instructions and context
 *   Codex injects — developer messages, plugin lists — which are no more the conversation than Claude
 *   Code's system prompt, which its transcript does not hold either.
 * - `CommandExecution` is the command that ran, with its exit code and status. The model's own call is an
 *   `exec` tool whose input is a script that runs commands, and its output says "Script completed" when a
 *   command in it exited 2 — so it could not say whether a result was an error.
 * - `FileChange` is the files a patch changed, with its status.
 *
 * What the records do not allow, and so is not given: the text of any thinking (reasoning is written
 * encrypted, and every summary was empty), and when a command or a change began — an item is written once
 * it has completed, so its call and its result carry that one time, and one still running is not there.
 * `task_complete` is a system event, its error's message when it has one. An item of a type not measured
 * is a system event naming it, rather than nothing. A record with no time gives nothing; none was seen.
 */
export const codexRolloutEvents = (entry: unknown, offset: number): TranscriptEvent[] => {
  const record = entry as { timestamp?: unknown; type?: unknown; payload?: { type?: unknown; item?: unknown; turn_id?: unknown; error?: unknown } | null } | null;
  const at = isoTime(record?.timestamp);
  const payload = record?.payload;
  if (!at || record?.type !== 'event_msg' || !payload) return [];
  if (payload.type === 'task_complete') {
    const error = (payload.error as { message?: unknown } | null | undefined)?.message;
    return [{
      id: typeof payload.turn_id === 'string' ? `${payload.turn_id}:complete` : `@${offset}`, at, role: 'system', kind: 'system',
      text: typeof error === 'string' ? error : 'task_complete',
    }];
  }
  const item = payload.type === 'item_completed' ? payload.item as Record<string, unknown> | null | undefined : undefined;
  if (!item) return [];
  const id = typeof item.id === 'string' && item.id ? item.id : `@${offset}`;
  switch (item.type) {
    case 'UserMessage':
      return [{ id, at, role: 'user', kind: 'text', text: textsOf(item.content).join('\n') }];
    case 'AgentMessage':
      return [{ id, at, role: 'assistant', kind: 'text', text: textsOf(item.content).join('\n') }];
    case 'Reasoning': {
      const text = [...textsOf(item.summary_text), ...textsOf(item.raw_content)].join('\n');
      return [{ id, at, role: 'assistant', kind: 'thinking', ...(text ? { text } : {}) }];
    }
    case 'CommandExecution':
      return [
        { id, at, role: 'assistant', kind: 'tool_use', tool: { name: 'CommandExecution', input: { command: item.command, cwd: item.cwd } } },
        {
          id, at, role: 'user', kind: 'tool_result',
          result: { text: typeof item.aggregated_output === 'string' ? item.aggregated_output : '', isError: !(item.status === 'completed' && item.exit_code === 0) },
        },
      ];
    case 'FileChange':
      return [
        { id, at, role: 'assistant', kind: 'tool_use', tool: { name: 'FileChange', input: { changes: item.changes } } },
        {
          id, at, role: 'user', kind: 'tool_result',
          result: { text: [item.stdout, item.stderr].filter((s): s is string => typeof s === 'string' && s !== '').join('\n'), isError: item.status !== 'completed' },
        },
      ];
    default:
      return [{ id, at, role: 'system', kind: 'system', text: `[${String(item.type)}]` }];
  }
};
