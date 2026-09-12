/**
 * The compute seam — the ONLY file that knows what runs an agent.
 *
 * Four verbs, and the engine needs no fifth: spawn one, observe all, stop one, read one's logs.
 * Swap the layer and the same engine drives a different harness; `Runner.test()` drives nothing
 * at all, which is how the engine's tests cost zero dollars.
 *
 * The Claude layer shells out on purpose. `claude --bg` hands the session to the harness, which
 * already owns resume, stop, cross-session messaging and a registry that outlives us — the thing
 * a scheduler on someone's laptop should be leaning on rather than rebuilding.
 */
import { Context, Effect, Layer, Schema } from 'effect';
import { execFile } from 'node:child_process';
import { getSessionMessages } from '@anthropic-ai/claude-agent-sdk';
import type { Observed, Sighting } from './domain.ts';

export class RunnerError extends Schema.TaggedError<RunnerError>()('RunnerError', {
  verb: Schema.String,
  message: Schema.String,
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
};

/**
 * The seam itself, as a plain value.
 *
 * Four verbs. A harness that cannot do one of them is not a harness this engine can drive, and a
 * harness that needs a fifth is asking the engine to learn something about it — which is the line
 * this type exists to hold.
 */
export type RunnerOps = {
  readonly spawn: (r: SpawnRequest) => Effect.Effect<void, RunnerError>;
  /** Every session this runner knows about, BY NAME. One call per pass, never per task. */
  readonly observe: Effect.Effect<Map<string, Sighting>, RunnerError>;
  readonly stop: (sessionId: string) => Effect.Effect<void, RunnerError>;
  readonly logs: (sessionId: string) => Effect.Effect<string, RunnerError>;
};

export class Runner extends Context.Service<Runner, RunnerOps>()('engine/Runner') {
  /** Any implementation becomes a Layer. This is the only way a runner reaches the engine. */
  static layer = (ops: RunnerOps) => Layer.succeed(Runner)(Runner.of(ops));

  static claude = () => Runner.layer(claudeOps());

  static test = (control?: { sessions: Map<string, Sighting> }) => Runner.layer(testOps(control));
}

/** Claude Code, through its CLI: the harness owns the session, so nothing here owns a process. */
export const claudeOps = (): RunnerOps => ({
    spawn: (r) => sh('claude', [
      '--bg',
      '--name', r.name,
      // `auto` rather than `acceptEdits`, and the difference decides whether a fleet works.
      // `acceptEdits` approves edits and `mkdir`/`mv`/`cp` — but NOT `npm test`, so the first
      // session that wants to run its own tests stops and waits for a person who is not there.
      // `auto` approves everything with background safety checks, which the docs recommend for
      // exactly this: long tasks, no prompt fatigue. Overridable per task; never silently.
      '--permission-mode', r.permissionMode ?? 'auto',
      ...(r.model ? ['--model', r.model] : []),
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
      r.brief,
    ], { cwd: r.cwd, verb: 'spawn' }).pipe(Effect.asVoid),

    observe: sh('claude', ['agents', '--all', '--json'], { verb: 'observe' }).pipe(
      Effect.map((out) => {
        const rows = JSON.parse(out) as Array<{ sessionId?: string; name?: string; state?: string; status?: string }>;
        const m = new Map<string, Sighting>();
        for (const row of rows) {
          const state = (row.state ?? row.status) as Observed | undefined;
          // Only sessions WE named are ours. Everything else on the machine is somebody else's.
          // For this harness the session id IS the native id — `--resume` takes exactly it.
          if (row.name?.startsWith('ae/') && row.sessionId && state) m.set(row.name, { sessionId: row.sessionId, state, nativeId: row.sessionId });
        }
        return m;
      }),
    ),

    // `claude stop` takes the short id, which is the uuid's first block.
    stop: (sessionId) => sh('claude', ['stop', short(sessionId)], { verb: 'stop' }).pipe(Effect.asVoid),

    // The one verb where the Agent SDK is simply better than the CLI: `getSessionMessages` reads
    // the stored transcript as TYPED messages, and it works on sessions it never started — the
    // `claude --bg` ones included. Measured, not assumed.
    logs: (sessionId) =>
      Effect.tryPromise({
        try: () => getSessionMessages(sessionId),
        catch: (cause) => new RunnerError({ verb: 'logs', message: String(cause) }),
      }).pipe(Effect.map(renderTranscript)),
});

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
        ? Effect.fail(new RunnerError({ verb: o.verb, message: `${cmd} ${args[0]}: ${stderr || err.message}`.trim() }))
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
