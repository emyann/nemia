/**
 * One attached Claude Code session, run by the Agent SDK's `query()` in this process: its prompt a stream the brief and a person's words
 * are pushed on, its Claude Code spawned in a process group of its own, every message a reader reads appended to its capture as it
 * comes, and its run file rewritten as its facts change (`attached-file.ts`). A new call waits at its `PreToolUse` hook while this
 * process holds back the session's calls (`Held`), and a call that belongs to a call already in flight — one of the session's own
 * calls in flight, or a sub-agent's, which the SDK marks with `agent_id` — is never held, or the call it belongs to could never end;
 * a call that would ask a person is answered here, denied, as no person is there.
 */
import { spawn } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import fs from 'node:fs';
import { query, type CanUseTool, type HookCallbackMatcher, type HookEvent, type SDKMessage } from '@anthropic-ai/claude-agent-sdk';
import { attachedOptions } from './attached-options.ts';
import { alive, childFacts, filesOf, writeRun, type AttachedRun, type AttachedState } from './attached-file.ts';
import { bridgeStateOf, enableBridge } from './attached-bridge.ts';
import { bridgeAsked } from './vocabulary.ts';
import { claudeStreamKept } from '../detached/output.ts';
import type { SpawnRequest } from '../seam.ts';

/** What a session's new calls ask before they start: whether this process holds back a new call of `live` now. */
export type Held = (live: Live) => boolean;

/** A user message on the session's input, as stream-json takes it, under a `uuid` of its own that the result answering it names. */
type UserLine = {
  type: 'user';
  uuid: ReturnType<typeof randomUUID>;
  message: { role: 'user'; content: string };
  parent_tool_use_id: null;
  session_id: string;
};

/** The session's input: lines pushed on it are read in order, and it ends once closed. */
const inputOf = () => {
  const items: UserLine[] = [];
  let wake: (() => void) | undefined;
  let closed = false;
  const ring = () => {
    wake?.();
    wake = undefined;
  };
  return {
    push: (content: string): UserLine['uuid'] => {
      const uuid = randomUUID();
      items.push({ type: 'user', uuid, message: { role: 'user', content }, parent_tool_use_id: null, session_id: '' });
      ring();
      return uuid;
    },
    close: () => {
      closed = true;
      ring();
    },
    get closed() {
      return closed;
    },
    async *[Symbol.asyncIterator](): AsyncGenerator<UserLine> {
      for (;;) {
        while (items.length) yield items.shift()!;
        if (closed) return;
        await new Promise<void>((r) => (wake = r));
      }
    },
  };
};

/**
 * A session at work in this process, as its holder keeps it: what it runs, its calls in flight by id, and how it ends. `open` says the
 * session outlives its turns (a long-lived request): its input stays open and a result that leaves `unanswered` empty writes `idle`.
 * `unanswered` is the words pushed on its input that no result has named yet. `q` is the SDK's query object, kept so the holder can end
 * a turn through it (`interrupt`).
 */
export type Live = {
  run: AttachedRun;
  abort: AbortController;
  input: ReturnType<typeof inputOf>;
  calls: Map<string, { tool: string; since: string }>;
  letGo: boolean;
  waiting: number;
  open: boolean;
  unanswered: Set<string>;
  q?: { interrupt?: () => Promise<void> };
  done: Promise<void>;
};

/**
 * Ends the turn of the session `live` through the SDK's control request, which only a session on streaming input takes: it leaves the
 * session answering under the same id, its turn ending with a result of its own. Answers whether the request was sent at all.
 */
export const interruptTurn = async (live: Live | undefined): Promise<boolean> => {
  const ask = live?.q?.interrupt;
  if (ask === undefined || live === undefined || live.letGo) return false;
  await ask.call(live.q);
  return true;
};

/** How long a call is held at its hook before Claude Code answers for it, in seconds: a day, longer than any drain. */
const HOOK_HOLD_S = 86_400;

/** Waits until `held` lets go of `live`, the call's signal aborts, or the session is let go. */
const waitWhile = async (held: Held, signal: AbortSignal, live: Live): Promise<void> => {
  while (held(live) && !signal.aborted && !live.letGo) await new Promise((r) => setTimeout(r, 250));
};

/**
 * Whether the call a `PreToolUse` hook was given belongs to a call already in flight: the SDK marks a sub-agent's call with
 * `agent_id`, and absent for the main thread (the SDK's hook input), so such a call is answered however the session's calls are held.
 */
const inside = (input: unknown): boolean => typeof (input as { agent_id?: unknown }).agent_id === 'string';

/** What a denied call is told: no person is there to ask, and what the fence allows is all it gets. */
export const DENIED_HERE =
  'No person is here to approve this call, so it is denied. Do what you can with the tools you are allowed, and say in your answer what you were denied.';

/**
 * The session's run file rewritten with `patch`, its earliest call in flight as `calling` and how many wait at their hook as
 * `heldBack`; nothing once the session is let go, its file its holder's last word (`parked`).
 */
const rewrite = (root: string, live: Live, patch: Partial<AttachedRun> = {}): void => {
  if (live.letGo) return;
  const first = [...live.calls.values()].sort((a, b) => a.since.localeCompare(b.since))[0];
  const { calling: _, heldBack: __, ...rest } = live.run;
  live.run = { ...rest, ...patch, ...(first ? { calling: first } : {}), ...(live.waiting ? { heldBack: live.waiting } : {}) };
  writeRun(root, live.run);
};

/** The hooks that keep the call in flight, a new one held while `held` says so. */
const hooksOf = (root: string, live: Live, held: Held): Partial<Record<HookEvent, HookCallbackMatcher[]>> => {
  const ended = async (_input: unknown, id: string | undefined) => {
    if (id && live.calls.delete(id)) rewrite(root, live);
    return {};
  };
  return {
    PreToolUse: [
      {
        timeout: HOOK_HOLD_S,
        hooks: [
          async (input, id, { signal }) => {
            if (!inside(input)) {
              live.waiting++;
              if (held(live)) rewrite(root, live);
              await waitWhile(held, signal, live).finally(() => live.waiting--);
            }
            const tool = (input as { tool_name?: string }).tool_name ?? 'a tool';
            if (id) live.calls.set(id, { tool, since: new Date().toISOString() });
            rewrite(root, live);
            return {};
          },
        ],
      },
    ],
    PostToolUse: [{ hooks: [ended] }],
    PostToolUseFailure: [{ hooks: [ended] }],
  };
};

/** Appends `line` to the session's capture, as a reader of `claude -p`'s stream reads it. */
const capture = (root: string, name: string, line: object): void => {
  const kept = claudeStreamKept(JSON.stringify(line));
  if (kept) fs.appendFileSync(filesOf(root, name).out, `${kept}\n`);
};

/** A call that would ask a person, answered: denied, and written to the capture as a denial as it happens. */
const deniedHere =
  (root: string, name: string): CanUseTool =>
  async (tool, _input, { toolUseID }) => {
    capture(root, name, { type: 'system', subtype: 'permission_denied', tool_name: tool, tool_use_id: toolUseID });
    return { behavior: 'deny', message: DENIED_HERE };
  };

/** The ids of the calls a message says are over: a tool's result, or a denial. */
const callsEndedBy = (m: SDKMessage): string[] => {
  const line = m as { type: string; subtype?: string; tool_use_id?: string; message?: { content?: unknown } };
  if (line.type === 'system' && line.subtype === 'permission_denied') return line.tool_use_id ? [line.tool_use_id] : [];
  if (line.type !== 'user' || !Array.isArray(line.message?.content)) return [];
  return (line.message.content as { type?: string; tool_use_id?: string }[]).flatMap((b) =>
    b.type === 'tool_result' && b.tool_use_id ? [b.tool_use_id] : [],
  );
};

/**
 * One message of the session, taken: captured, its session id and its end written, the calls it ends cleared.
 *
 * A turn's end is not a session's end for a long-lived request (`live.open`): the calls clear, the run file is written `idle` with the
 * session id, and the input stays open so the next words said are heard in the same session. An `is_error` result — an interrupted
 * turn's `error_during_execution` among them — ends the turn and never fails the session.
 *
 * It is `idle` only once every word pushed on its input has been answered (`answered`): words pushed while a turn runs are sometimes
 * worked as a turn of their own and sometimes folded into the one running, so a result is read for the messages it names, never counted.
 */
/**
 * Takes off `live.unanswered` the words the result `m` says it consumed: `user_message_uuids`, which lists the message the turn took and
 * every one folded into it as it ran; the single `user_message_uuid` where a producer lists only that; and all of them where it names
 * none, so a producer that says nothing leaves no session answering for words no result will ever name.
 */
const answered = (live: Live, m: SDKMessage): void => {
  const said = m as { user_message_uuids?: unknown; user_message_uuid?: unknown };
  const named = Array.isArray(said.user_message_uuids)
    ? said.user_message_uuids
    : typeof said.user_message_uuid === 'string'
      ? [said.user_message_uuid]
      : undefined;
  if (named === undefined) {
    live.unanswered.clear();
    return;
  }
  for (const id of named) if (typeof id === 'string') live.unanswered.delete(id);
};

const took = (root: string, live: Live, m: SDKMessage): void => {
  if (m.type !== 'user' && m.type !== 'stream_event') capture(root, live.run.name, m);
  const over = callsEndedBy(m).filter((id) => live.calls.delete(id));
  const bridged = bridgeStateOf(m);
  if (m.type === 'system' && m.subtype === 'init' && m.session_id !== live.run.sessionId) rewrite(root, live, { sessionId: m.session_id });
  else if (bridged !== undefined) rewrite(root, live, { bridge: { ...live.run.bridge, state: bridged } });
  else if (m.type === 'result') {
    live.calls.clear();
    answered(live, m);
    if (live.open) return rewrite(root, live, { state: live.unanswered.size ? 'working' : 'idle', sessionId: m.session_id });
    live.input.close();
    rewrite(root, live, { state: m.is_error ? 'failed' : 'completed', sessionId: m.session_id });
  } else if (over.length) rewrite(root, live);
};

/**
 * Hands the session the words said to it since it last heard (its say file, past `heard`), each a user message on its input, and
 * writes how far it heard. Nothing once its input is closed or it is let go: the next holder hears them.
 *
 * Words pushed on an open session's input begin a turn, so its run file is written `working` with them: a session that heard and stayed
 * `idle` would be read as waiting on a person while it answers, and no turn of it could be ended.
 */
export const hear = (root: string, live: Live): void => {
  if (live.input.closed || live.letGo) return;
  let said: Buffer;
  try {
    said = fs.readFileSync(filesOf(root, live.run.name).say);
  } catch {
    return;
  }
  const from = live.run.heard ?? 0;
  const end = said.lastIndexOf(10) + 1;
  if (end <= from) return;
  for (const line of said.subarray(from, end).toString('utf8').split('\n').filter(Boolean))
    live.unanswered.add(live.input.push((JSON.parse(line) as { text: string }).text));
  rewrite(root, live, { heard: end, ...(live.open ? { state: 'working' as const } : {}) });
};

/** Waits until the process `pid` is gone. */
export const gone = async (pid: number | undefined): Promise<void> => {
  for (;;) {
    if (pid === undefined || !alive(pid)) return;
    await new Promise((r) => setTimeout(r, 50));
  }
};

/** Kills the process group `pid` leads, and whatever is left of it: nothing when it is gone. */
export const killGroup = (pid: number | undefined): void => {
  if (pid === undefined) return;
  try {
    process.kill(-pid, 'SIGKILL');
  } catch {
    return;
  }
};

/**
 * Starts the session `run` and answers it at once: `r` its spawn, `first` the first words on its input, `resume` the Claude Code session
 * it continues. `executable` is the Claude Code it runs, the SDK's own when absent. It ends `completed` or `failed` by its result,
 * `canceled` when aborted, `failed` when its messages end with none; a session let go (`letGo`) is left as its holder wrote it.
 */
export const startSession = (
  root: string,
  r: SpawnRequest,
  run: AttachedRun,
  first: string,
  options: { held: Held; executable?: string; resume?: string },
): Live => {
  const abort = new AbortController();
  const open = r.restartPolicy === 'Always';
  const live: Live = {
    run,
    abort,
    input: inputOf(),
    calls: new Map(),
    letGo: false,
    waiting: 0,
    open,
    unanswered: new Set(),
    done: Promise.resolve(),
  };
  writeRun(root, run);
  live.unanswered.add(live.input.push(first));
  const given = attachedOptions(r, filesOf(root, run.name).mcp);
  const q = query({
    prompt: live.input,
    options: {
      ...given,
      ...(options.resume ? { resume: options.resume } : {}),
      abortController: abort,
      canUseTool: deniedHere(root, run.name),
      hooks: hooksOf(root, live, options.held),
      ...(options.executable ? { pathToClaudeCodeExecutable: options.executable } : {}),
      spawnClaudeCodeProcess: (o) => {
        const child = spawn(o.command, o.args, { cwd: o.cwd, env: o.env, stdio: ['pipe', 'pipe', 'pipe'], detached: true });
        o.signal.addEventListener('abort', () => killGroup(child.pid), { once: true });
        if (child.pid !== undefined) rewrite(root, live, childFacts(child.pid));
        return child;
      },
    },
  });
  live.q = q as Live['q'];
  live.done = (async () => {
    let end: AttachedState = 'failed';
    let turns = 0;
    try {
      for await (const m of q) {
        took(root, live, m);
        if (m.type === 'result' && ++turns === 1 && bridgeAsked(r)) await bridgeOn(root, live, q, run.name);
      }
    } catch {
      end = abort.signal.aborted ? 'canceled' : 'failed';
    }
    killGroup(live.run.childPid);
    if (abort.signal.aborted) end = 'canceled';
    if (!live.letGo && (live.run.state === 'working' || live.run.state === 'idle')) rewrite(root, live, { state: end });
  })();
  return live;
};

/**
 * Opens the session's claude.ai bridge after its first turn, where its request asked for one, and writes what came of it on the run
 * file — the bridge's facts, or why there is none (`attached-bridge.ts`). A resume re-attaches the claude.ai session its run file kept.
 */
const bridgeOn = async (root: string, live: Live, q: unknown, name: string): Promise<void> => {
  if (live.letGo) return;
  const bridge = await enableBridge(q, name, live.run.bridge?.bridgeSessionId);
  rewrite(root, live, { bridge });
};
