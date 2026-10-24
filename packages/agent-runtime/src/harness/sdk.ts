/**
 * The Agent SDK as a Runner — the same four verbs, different guarantees.
 *
 * ## What the SDK can and cannot do here
 *
 * The SDK is a typed wrapper around the same CLI, but the wrapping is over **stdio stream-json**:
 * `query()` owns a child process and streams from it for the life of the iterator. So:
 *
 *   - `query()` runs the session IN THIS PROCESS. Kill the engine, kill the session.
 *   - `extraArgs: { bg: null }` does not escape that: the flag detaches the child, the SDK waits
 *     for messages that never come, and the query hangs with nothing created.
 *   - There is no SDK call for the background-session registry — the `working`/`blocked`/`done`
 *     states behind `claude agents --json` are a CLI-level concept.
 *
 * What it gives instead is everything that happens INSIDE a session: typed messages, turn counts,
 * `total_cost_usd`, `canUseTool` as an admission gate, hooks, MCP servers.
 *
 * ## So which runner should you use
 *
 *   `Runner.claude()`  durable. The harness owns the session; the engine may die at any point.
 *                      Telemetry is coarse: a state, and the transcript after the fact.
 *   `sdkRunner()`      rich. This process owns the session; cost, responses and tool calls arrive
 *                      live, and a gate can refuse a tool call. NOT durable.
 *
 * The engine does not change between them — only what is true after a crash does. That is the
 * whole reason this is a seam and not an import.
 */
import { Effect } from 'effect';
import { query, getSessionMessages } from '@anthropic-ai/claude-agent-sdk';
import type { SessionState, Sighting, Usage } from '../core/index.ts';
import { Runner, RunnerError } from './seam.ts';
import { renderTranscript } from './claude/transcript.ts';
import type { HarnessArgs } from './args.ts';
import { sessionTokensOf } from './detached/output.ts';

/** A result's `usage`: the main thread's tokens alone. */
type MainThread = { input_tokens?: number; output_tokens?: number; cache_creation_input_tokens?: number; cache_read_input_tokens?: number };

/** What the in-process runner knows about one session it is running. */
type Live = { sessionId: string; state: SessionState; abort: AbortController; toolCalls: number; usage?: Usage };

/**
 * The Agent SDK runner, as a `Runner` layer made by `Runner.layer`, so it refuses what every harness refuses of a task's
 * `config` (`argsRefusalOf`), as every runner does.
 *
 * - `spawn` returns at once, as handing the work to a harness does: the session runs on a detached fiber, which dies
 *   with this process where a harness's session does not.
 * - `observe` lists every session this process runs, with its `usage` once the SDK's `result` message has given it
 *   and none before. The usage is what the SDK reports and nothing more: a cost or a token count it leaves out stays
 *   out rather than becoming a 0 that reads as free, and the input's classes are given only when the SDK gave all three.
 *   Its tokens are every model's of the session, subagents included (`sessionTokensOf`), else the main thread's (`usage`).
 * - A session whose messages end without a `result` — an abort, a crashed child — is `canceled` when it was aborted
 *   and `failed` otherwise, never left `working` for the engine to wait on until its grace window expires.
 * - `logs` reads the stored transcript as typed messages (`getSessionMessages`), and works on sessions this process
 *   never started, the ones `claude --bg` created included.
 */
export const sdkRunner = () => {
  const live = new Map<string, Live>();

  const pump = (
    name: string,
    r: { brief: string; cwd: string; config?: Pick<HarnessArgs, 'model' | 'permissionMode'> },
    abort: AbortController,
  ) =>
    Effect.promise(async () => {
      const q = query({
        prompt: r.brief,
        options: {
          cwd: r.cwd,
          abortController: abort,
          ...(r.config?.model ? { model: r.config.model } : {}),
          ...(r.config?.permissionMode ? { permissionMode: r.config.permissionMode as never } : {}),
        },
      });
      const set = (patch: Partial<Live>) => {
        const cur = live.get(name);
        if (cur) live.set(name, { ...cur, ...patch });
      };
      try {
        for await (const m of q) {
          if (m.type === 'system' && m.subtype === 'init') set({ sessionId: m.session_id });
          else if (m.type === 'assistant') {
            const calls = (m.message.content as Array<{ type?: string }>).filter((b) => b.type === 'tool_use').length;
            set({ toolCalls: (live.get(name)?.toolCalls ?? 0) + calls });
          } else if (m.type === 'result') {
            const u = m.usage as MainThread | undefined;
            set({
              sessionId: m.session_id,
              state: m.is_error ? 'failed' : 'completed',
              usage: {
                responses: m.num_turns,
                toolCalls: live.get(name)?.toolCalls ?? 0,
                ...(typeof u?.input_tokens === 'number' && typeof u.output_tokens === 'number'
                  ? {
                      inputTokens: u.input_tokens + (u.cache_creation_input_tokens ?? 0) + (u.cache_read_input_tokens ?? 0),
                      outputTokens: u.output_tokens,
                    }
                  : {}),
                ...(typeof u?.input_tokens === 'number' &&
                typeof u.cache_creation_input_tokens === 'number' &&
                typeof u.cache_read_input_tokens === 'number'
                  ? {
                      uncachedTokens: u.input_tokens,
                      cacheWriteTokens: u.cache_creation_input_tokens,
                      cacheReadTokens: u.cache_read_input_tokens,
                    }
                  : {}),
                ...sessionTokensOf(m.modelUsage),
                ...(typeof m.total_cost_usd === 'number' ? { costUsd: m.total_cost_usd } : {}),
              },
            });
          }
        }
        if (live.get(name)?.state === 'working') set({ state: abort.signal.aborted ? 'canceled' : 'failed' });
      } catch {
        set({ state: abort.signal.aborted ? 'canceled' : 'failed' });
      }
    });

  return Runner.layer({
    spawn: (r) =>
      Effect.gen(function* () {
        const abort = new AbortController();
        live.set(r.name, { sessionId: `(starting ${r.name})`, state: 'working', abort, toolCalls: 0 });
        yield* Effect.forkDetach(pump(r.name, r, abort));
      }),

    observe: Effect.sync(() => {
      const m = new Map<string, Sighting>();
      for (const [name, s] of live) m.set(name, { sessionId: s.sessionId, state: s.state, ...(s.usage ? { usage: s.usage } : {}) });
      return m;
    }),

    stop: (sessionId) =>
      Effect.sync(() => {
        for (const s of live.values()) if (s.sessionId === sessionId) s.abort.abort();
      }),

    logs: (sessionId) =>
      Effect.tryPromise({
        try: () => getSessionMessages(sessionId),
        catch: (cause) => new RunnerError({ verb: 'logs', message: String(cause) }),
      }).pipe(Effect.map(renderTranscript)),
  });
};
