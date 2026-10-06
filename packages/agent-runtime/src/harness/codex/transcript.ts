/**
 * A Codex thread's rollout, read: where it is, and its records as events — the counterpart of
 * `harness/claude/transcript.ts`, for the `codex` spec (`harness/codex/codex.ts`).
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import type { TranscriptEvent } from '../seam.ts';
import { isoTime } from '../transcript.ts';
import { type RolloutItem, rolloutRecordOf } from './rollout.ts';

const rollouts = new Map<string, string>();

/**
 * A Codex thread's rollout, where Codex keeps its own record of the conversation:
 * `$CODEX_HOME/sessions/YYYY/MM/DD/rollout-<local time>-<thread id>.jsonl`. Found by the thread
 * id — the `thread_id` of `exec --json`'s first event, which the worker keeps as the run's `nativeId` —
 * newest day first, and remembered once found. An id, not a path: an id with anything but what a thread
 * id is made of (hex digits and `-`) finds none, so nothing else goes into a file name.
 */
export const codexRolloutFile = (threadId: string): string | undefined => {
  if (!/^[0-9a-f-]+$/.test(threadId)) return undefined;
  const known = rollouts.get(threadId);
  if (known && fs.existsSync(known)) return known;
  const sessions = path.join(process.env.CODEX_HOME ?? path.join(os.homedir(), '.codex'), 'sessions');
  const newestFirst = (...dir: string[]) => {
    try {
      return fs
        .readdirSync(path.join(sessions, ...dir))
        .sort()
        .reverse();
    } catch {
      return [];
    }
  };
  for (const y of newestFirst())
    for (const m of newestFirst(y))
      for (const d of newestFirst(y, m)) {
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
const textsOf = (blocks: readonly (string | { readonly text?: string })[] | undefined): string[] =>
  (blocks ?? []).map((b) => (typeof b === 'string' ? b : b.text)).filter((t): t is string => t !== undefined);

/** An item of `type`, as `ROLLOUT` decodes it. */
type ItemOf<T extends string> = Extract<RolloutItem, { type: T }>;

const isItem =
  <T extends string>(type: T) =>
  (item: RolloutItem): item is ItemOf<T> =>
    item.type === type;

/** A completed thread item as events, under `id` and at `at`. */
const itemEvents = (item: RolloutItem, id: string, at: string): TranscriptEvent[] => {
  if (isItem('UserMessage')(item)) return [{ id, at, role: 'user', kind: 'text', text: textsOf(item.content).join('\n') }];
  if (isItem('AgentMessage')(item)) return [{ id, at, role: 'assistant', kind: 'text', text: textsOf(item.content).join('\n') }];
  if (isItem('Reasoning')(item)) {
    const text = [...textsOf(item.summary_text), ...textsOf(item.raw_content)].join('\n');
    return [{ id, at, role: 'assistant', kind: 'thinking', ...(text ? { text } : {}) }];
  }
  if (isItem('CommandExecution')(item)) {
    return [
      { id, at, role: 'assistant', kind: 'tool_use', tool: { name: 'CommandExecution', input: { command: item.command, cwd: item.cwd } } },
      {
        id,
        at,
        role: 'user',
        kind: 'tool_result',
        result: { text: item.aggregated_output ?? '', isError: !(item.status === 'completed' && item.exit_code === 0) },
      },
    ];
  }
  if (isItem('FileChange')(item)) {
    return [
      { id, at, role: 'assistant', kind: 'tool_use', tool: { name: 'FileChange', input: { changes: item.changes } } },
      {
        id,
        at,
        role: 'user',
        kind: 'tool_result',
        result: {
          text: [item.stdout, item.stderr].filter((s) => s !== undefined && s !== '').join('\n'),
          isError: item.status !== 'completed',
        },
      },
    ];
  }
  return [{ id, at, role: 'system', kind: 'system', text: `[${String(item.type)}]` }];
};

/**
 * One record of a Codex rollout as events.
 *
 * A rollout says most things twice: once as the model was given them (`response_item`) and once as the
 * thread items Codex itself shows (`event_msg` / `item_completed`). The items are read, because they are
 * what a person would be shown:
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
 * encrypted, and its summaries are empty), and when a command or a change began — an item is written once
 * it has completed, so its call and its result carry that one time, and one still running is not there.
 * `task_complete` is a system event, its error's message when it has one. An item of a type not read here
 * is a system event naming it, rather than nothing. A record with no time gives nothing.
 *
 * A record of those two kinds is decoded (`rollout.ts`) before anything is read of it, and one that does not decode throws an
 * `Error` naming the line by its offset, in `file` when it is given, its kind, its field and the fix: the rollout is refused, never
 * read as saying nothing. Any other value — another kind, no object — gives nothing, unread.
 */
export const codexRolloutEvents = (entry: unknown, offset: number, file?: string): TranscriptEvent[] => {
  const where = `the line at byte ${offset} of ${file ? `the rollout \`${file}\`` : 'the rollout'}`;
  const read = rolloutRecordOf(entry, where);
  if (read === undefined) return [];
  if ('wrong' in read) throw new Error(read.wrong);
  const at = isoTime(read.record.timestamp);
  if (!at) return [];
  if (read.kind === 'event_msg task_complete') {
    const { turn_id: turn, error } = read.record.payload;
    return [
      {
        id: turn === undefined ? `@${offset}` : `${turn}:complete`,
        at,
        role: 'system',
        kind: 'system',
        text: error?.message ?? 'task_complete',
      },
    ];
  }
  const { item } = read.record.payload;
  return item ? itemEvents(item, item.id || `@${offset}`, at) : [];
};
