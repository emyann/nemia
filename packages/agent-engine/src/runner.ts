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
import fs from 'node:fs';
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
  /** How hard the harness should think, in its own words. */
  effort?: string;
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

  static claude = (options?: ClaudeOptions) => Runner.layer(claudeOps(options));

  static test = (control?: { sessions: Map<string, Sighting>; spawned?: SpawnRequest[] }) => Runner.layer(testOps(control));
}

/**
 * How long `working` + not busy must hold before this harness calls a session finished.
 *
 * 90 seconds. Long enough that a pause between self-driven steps resumes first — the docs are
 * explicit that `working` also covers "between steps of work it drives on its own" — and short
 * enough that a fleet is not waiting on a session that has already written its last word.
 */
export const QUIESCENT_AFTER_MS = 90_000;

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
 * The LAST StructuredOutput call in a transcript, and when it was made.
 *
 * Read from the raw JSONL rather than through `getSessionMessages`, because the SDK's messages
 * carry no timestamp, and the timestamp is the only thing that tells this session's statement from
 * one it inherited: a resumed transcript holds its parent's whole conversation, parent's calls
 * included, under the child's own session id.
 */
export const lastStructuredOutput = (jsonl: string): { payload: unknown; at: number } | undefined => {
  let found: { payload: unknown; at: number } | undefined;
  for (const line of jsonl.split('\n')) {
    // Most lines are not it, and the tool's own definition mentions the name too.
    if (!line.includes('StructuredOutput')) continue;
    let entry: { type?: string; timestamp?: string; message?: { content?: unknown } };
    try { entry = JSON.parse(line); } catch { continue; }
    const content = entry.message?.content;
    if (entry.type !== 'assistant' || !Array.isArray(content)) continue;
    for (const block of content as Array<{ type?: string; name?: string; input?: unknown }>) {
      if (block?.type !== 'tool_use' || block.name !== 'StructuredOutput') continue;
      const at = Date.parse(entry.timestamp ?? '');
      if (Number.isFinite(at)) found = { payload: block.input, at };
    }
  }
  return found;
};

/**
 * What a session consumed, read from its transcript: the responses made at or after `since`.
 *
 * `since` is the session's own start, from the harness's registry. A resumed transcript holds its
 * parent's whole conversation under the child's id, with the parent's timestamps, so counted whole
 * a continuation would report its parent's work as its own. A response is written as one line per
 * content block, each repeating its `message.id` and `usage` (measured: 160 lines, 85 responses),
 * so responses are counted once, by id. Tokens are given only when every counted response carried
 * them. A transcript holds no cost, so `costUsd` is absent — never 0.
 */
export const transcriptUsage = (jsonl: string, since: number): Usage => {
  const responses = new Map<string, { input: number; output: number } | null>();
  const toolCalls = new Set<string>();
  for (const line of jsonl.split('\n')) {
    if (!line.includes('"assistant"')) continue;
    let entry: { type?: string; timestamp?: string; message?: { id?: string; usage?: Record<string, unknown>; content?: unknown } };
    try { entry = JSON.parse(line); } catch { continue; }
    const message = entry.message;
    if (entry.type !== 'assistant' || !message?.id || !(Date.parse(entry.timestamp ?? '') >= since)) continue;
    const u = message.usage;
    const n = (key: string) => (typeof u?.[key] === 'number' ? (u[key] as number) : 0);
    responses.set(message.id, typeof u?.input_tokens === 'number' && typeof u?.output_tokens === 'number'
      ? { input: n('input_tokens') + n('cache_creation_input_tokens') + n('cache_read_input_tokens'), output: n('output_tokens') }
      : null);
    if (Array.isArray(message.content)) {
      for (const block of message.content as Array<{ type?: string; id?: string }>) {
        if (block?.type === 'tool_use' && block.id) toolCalls.add(block.id);
      }
    }
  }
  const counted = [...responses.values()];
  const measured = counted.filter((c) => c !== null);
  return {
    turns: responses.size,
    toolCalls: toolCalls.size,
    ...(measured.length === counted.length
      ? { inputTokens: measured.reduce((t, c) => t + c.input, 0), outputTokens: measured.reduce((t, c) => t + c.output, 0) }
      : {}),
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

export type ClaudeOptions = {
  quiescentAfterMs?: number;
  now?: () => number;
  /** When the session's transcript was last written. Injectable so tests need no harness. */
  transcriptTime?: (sessionId: string) => Promise<number | undefined>;
  /** The session's closing statement and when it was made. Injectable for the same reason. */
  closeoutFrom?: (sessionId: string) => Promise<{ payload: unknown; at: number } | undefined>;
  /** What the session consumed since `since`, its own start. Injectable for the same reason. */
  usageFrom?: (sessionId: string, since: number) => Promise<Usage | undefined>;
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
 * So this harness's definition of finished is:
 *
 *     done  ⟸  state = done
 *           ⟸  state = working AND not busy AND transcript quiet, for QUIESCENT_AFTER_MS
 *
 * It lives HERE, in the runner, and not in `decide`. `working` and `idle` are this harness's
 * vocabulary; the engine's is `working | blocked | done | failed | stopped`, and translating one
 * into the other is the whole job of a runner. A harness that ends by exiting — `codex exec` —
 * answers the same question by exit code and needs none of this.
 */
export const claudeOps = (options: ClaudeOptions = {}): RunnerOps => {
  const quiescentAfterMs = options.quiescentAfterMs ?? QUIESCENT_AFTER_MS;
  const now = options.now ?? (() => Date.now());
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
   * A finished session's statement cannot change, so it is read once. A working one is read each
   * time it is idle, because that is when it may just have made one. Losing this only re-reads.
   */
  const finalStatements = new Map<string, { payload: unknown; at: number } | undefined>();
  const statementOf = async (s: Sighting) => {
    if (finalStatements.has(s.sessionId)) return finalStatements.get(s.sessionId);
    const said = await closeoutFrom(s.sessionId);
    if (s.state === 'done' || s.state === 'failed' || s.state === 'stopped') finalStatements.set(s.sessionId, said);
    return said;
  };

  /**
   * What it consumed, by the same rule: read once when finished, each idle pass while not. No start
   * in the registry, no usage — without one, a resumed session's inherited conversation cannot be
   * told from its own, and a wrong count is worse than none.
   */
  const finalUsage = new Map<string, Usage | undefined>();
  const usageOf = async (s: Sighting, since: number | undefined) => {
    if (since === undefined) return undefined;
    if (finalUsage.has(s.sessionId)) return finalUsage.get(s.sessionId);
    const used = await usageFrom(s.sessionId, since);
    if (s.state === 'done' || s.state === 'failed' || s.state === 'stopped') finalUsage.set(s.sessionId, used);
    return used;
  };

  return ({
    spawn: (r) => sh('claude', [
      '--bg',
      '--name', r.name,
      // The fence. `--tools`, not `--allowedTools`: a tool the session does not have beats one it
      // may not use, and `--allowedTools` only pre-approves. VARIADIC — directly before the prompt
      // it would take the prompt as a tool name, the `--worktree` trap — so it goes here, and the
      // `--permission-mode` that always comes next ends the list. An empty list is no tools at all.
      ...(r.tools ? ['--tools', r.tools.join(',')] : []),
      // `auto` rather than `acceptEdits`, and the difference decides whether a fleet works.
      // `acceptEdits` approves edits and `mkdir`/`mv`/`cp` — but NOT `npm test`, so the first
      // session that wants to run its own tests stops and waits for a person who is not there.
      // `auto` approves everything with background safety checks, which the docs recommend for
      // exactly this: long tasks, no prompt fatigue. Overridable per task; never silently.
      '--permission-mode', r.permissionMode ?? 'auto',
      ...(r.model ? ['--model', r.model] : []),
      ...(r.effort ? ['--effort', r.effort] : []),
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
      r.brief,
    ], { cwd: r.cwd, verb: 'spawn' }).pipe(Effect.asVoid),

    observe: sh('claude', ['agents', '--all', '--json'], { verb: 'observe' }).pipe(
      Effect.map((out) => {
        const rows = JSON.parse(out) as Array<{ sessionId?: string; name?: string; state?: string; status?: string; startedAt?: unknown }>;
        const m = new Map<string, { sighting: Sighting; startedAt?: number }>();
        for (const row of rows) {
          // `state` and `status` answer different questions and are NOT a fallback chain. `state`
          // is the session's lifecycle; `status` is whether its process is busy this instant. A
          // row with no `state` is an interactive session — never one of ours — and reading its
          // `status` as a state is how `idle` once became a recorded failure.
          const state = row.state as Observed | undefined;
          // Only sessions WE named are ours. Everything else on the machine is somebody else's.
          // For this harness the session id IS the native id — `--resume` takes exactly it.
          if (row.name?.startsWith('ae/') && row.sessionId && state) {
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
      // `working`. Only quiescent candidates cost a transcript read, so a busy fleet pays nothing.
      //
      // The clock is the TRANSCRIPT'S, not ours. An earlier version remembered when each session
      // was first seen idle, which made the verdict depend on the observer surviving long enough
      // to reach it — true of `wf up`, false of anything that ticks once per process and exits.
      // Measured, with a one-second window and a month-cold transcript: one long-lived process
      // said `done`; three consecutive one-shot processes each said `working`, forever. The
      // transcript's mtime already answers "how long has this been quiet", so nothing needs
      // remembering and every driver gets the same answer.
      Effect.flatMap((m) => Effect.forEach(
        [...m],
        ([name, { sighting, startedAt }]) =>
          // Busy right now: nothing it has said is final and nothing about it is quiet. A long tool
          // call writes nothing for minutes, and `busy` is what keeps that from reading as silence.
          sighting.busy
            ? Effect.succeed([name, sighting] as const)
            : Effect.promise(async () => {
                // What the workload SAID, if it said anything — reported with when it was said.
                // Whether it belongs to this attempt is the engine's call, not ours: a resumed
                // session carries its parent's statements too, and only the journal knows when
                // the attempt began.
                const said = await statementOf(sighting);
                // And what it has consumed since its own start — reported as measured, or not at all.
                const used = await usageOf(sighting, startedAt);
                const reported: Sighting = { ...sighting, ...(said ? { closeout: said } : {}), ...(used ? { usage: used } : {}) };
                if (reported.state !== 'working') return [name, reported] as const;
                // The floor underneath, statement or not. Kept even when there IS one, because an
                // inherited statement is discarded upstream and must not leave a session with no
                // way to end. No transcript, no verdict: the deadline is for sessions nobody reads.
                const writtenAt = await transcriptTime(sighting.sessionId);
                return writtenAt !== undefined && now() - writtenAt >= quiescentAfterMs
                  ? [name, { ...reported, state: 'done' as const }] as const
                  : [name, reported] as const;
              }),
        { concurrency: 'unbounded' },
      ).pipe(Effect.map((entries) => new Map(entries)))),
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
