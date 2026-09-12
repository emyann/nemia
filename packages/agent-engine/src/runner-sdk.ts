/**
 * The Agent SDK as a Runner — the same four verbs, different guarantees.
 *
 * ## What the SDK can and cannot do here, measured rather than assumed
 *
 * The SDK is a typed wrapper around the same CLI, but the wrapping is over **stdio stream-json**:
 * `query()` owns a child process and streams from it for the life of the iterator. So:
 *
 *   - `query()` runs the session IN THIS PROCESS. Kill the engine, kill the session.
 *   - `extraArgs: { bg: null }` does not escape that: the flag detaches the child, the SDK waits
 *     for messages that never come, and nothing is created. (Tried it. It hangs.)
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
 *   `Runner.sdk()`     rich. This process owns the session; cost, turns and tool calls arrive
 *                      live, and a gate can refuse a tool call. NOT durable.
 *
 * The engine does not change between them — only what is true after a crash does. That is the
 * whole reason this is a seam and not an import.
 */
import { Effect, Layer } from 'effect';
import { query, getSessionMessages } from '@anthropic-ai/claude-agent-sdk';
import type { Observed, Sighting } from './domain.ts';
import { renderTranscript, Runner, RunnerError } from './runner.ts';

/** What the in-process runner knows about one session it is running. */
type Live = { sessionId: string; state: Observed; abort: AbortController; costUsd: number; turns: number };

export const sdkRunner = () => {
  const live = new Map<string, Live>();

  const pump = (name: string, r: { brief: string; cwd: string; model?: string; permissionMode?: string }, abort: AbortController) =>
    Effect.promise(async () => {
      const q = query({
        prompt: r.brief,
        options: {
          cwd: r.cwd,
          abortController: abort,
          ...(r.model ? { model: r.model } : {}),
          ...(r.permissionMode ? { permissionMode: r.permissionMode as never } : {}),
        },
      });
      const set = (patch: Partial<Live>) => {
        const cur = live.get(name);
        if (cur) live.set(name, { ...cur, ...patch });
      };
      try {
        for await (const m of q) {
          if (m.type === 'system' && m.subtype === 'init') set({ sessionId: m.session_id });
          else if (m.type === 'result') {
            set({
              sessionId: m.session_id,
              state: m.is_error ? 'failed' : 'done',
              costUsd: m.total_cost_usd ?? 0,
              turns: m.num_turns ?? 0,
            });
          }
        }
        // The iterator can end without a result message (an abort, a crashed child). Never leave
        // a session `working` — the engine would wait on it until its grace window expired.
        if (live.get(name)?.state === 'working') set({ state: abort.signal.aborted ? 'stopped' : 'failed' });
      } catch {
        set({ state: abort.signal.aborted ? 'stopped' : 'failed' });
      }
    });

  return Layer.succeed(Runner)(Runner.of({
    spawn: (r) =>
      Effect.gen(function* () {
        const abort = new AbortController();
        live.set(r.name, { sessionId: `(starting ${r.name})`, state: 'working', abort, costUsd: 0, turns: 0 });
        // Detached: `spawn` returns at once, the same as handing the work to the harness would.
        // The difference is only that this fiber dies with the process, and the harness's does not.
        yield* Effect.forkDetach(pump(r.name, r, abort));
      }),

    observe: Effect.sync(() => {
      const m = new Map<string, Sighting>();
      // Cost and turns ride the same seam: the CLI runner simply leaves them undefined.
      for (const [name, s] of live) m.set(name, { sessionId: s.sessionId, state: s.state, costUsd: s.costUsd, turns: s.turns });
      return m;
    }),

    stop: (sessionId) =>
      Effect.sync(() => {
        for (const s of live.values()) if (s.sessionId === sessionId) s.abort.abort();
      }),

    // Typed, and it works on sessions this process never started — including ones `claude --bg`
    // created. This is the SDK call worth having whichever runner is in use.
    logs: (sessionId) =>
      Effect.tryPromise({
        try: () => getSessionMessages(sessionId),
        catch: (cause) => new RunnerError({ verb: 'logs', message: String(cause) }),
      }).pipe(Effect.map(renderTranscript)),
  }));
};
