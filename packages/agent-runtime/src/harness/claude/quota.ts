/**
 * Claude Code's quota: the `claude` on PATH, sent its `get_usage` control request (`claudeQuota`). No prompt is sent, so no model is
 * called and no token spent; it answers in about half a second with the plan's limits as claude.ai's usage endpoint reports them
 * (measured on Claude Code 2.1.278). Each ask is one process: nothing is kept between asks, and a caller that reads often keeps the answer
 * itself, since the endpoint behind it is reported to refuse an account that asks in bursts.
 */
import { type ChildProcessWithoutNullStreams, spawn } from 'node:child_process';
import os from 'node:os';
import { Effect, Exit } from 'effect';
import type { HarnessQuota, QuotaLimit } from '../seam.ts';

/** How long an ask may take before it is given up on, and its process ended. */
export const QUOTA_TIMEOUT_MS = 15_000;

/**
 * `claude` as the ask starts it: a print session reading stream-json, in which a control request is answered with no prompt. Without the
 * user's settings, which load plugins and their hooks, and sync skills to disk on each start; without MCP servers but any named here
 * (none); and with nothing written as a session, should a version write one for a session that never had a turn. Measured on 2.1.278,
 * without these: no transcript and no child process, but the skills' manifest written again on every ask.
 */
export const USAGE_ARGS = [
  '-p',
  '--input-format',
  'stream-json',
  '--output-format',
  'stream-json',
  '--verbose',
  '--no-session-persistence',
  '--strict-mcp-config',
  '--setting-sources',
  '',
];

/**
 * What a Claude Code session hands its children, as 2.1.278 does (read off a session's own environment): a process started from one would
 * otherwise start the ask as that session's child. Named, not matched by prefix: the rest of `CLAUDE*` is how the asked claude signs in
 * and whom it asks (`CLAUDE_CONFIG_DIR`, `CLAUDE_CODE_OAUTH_TOKEN`…), as it is for the engine's workers.
 */
const SESSION_KEYS = new Set([
  'AI_AGENT',
  'CLAUDECODE',
  'CLAUDE_CODE_CHILD_SESSION',
  'CLAUDE_CODE_ENTRYPOINT',
  'CLAUDE_CODE_EXECPATH',
  'CLAUDE_CODE_MESSAGING_SOCKET',
  'CLAUDE_CODE_MESSAGING_TOKEN',
  'CLAUDE_CODE_SESSION_ATTENDED',
  'CLAUDE_CODE_SESSION_ID',
  'CLAUDE_CODE_SSE_PORT',
  'CLAUDE_EFFORT',
  'CLAUDE_JOB_DIR',
  'CLAUDE_PID',
]);

/** The environment an ask runs in: `env`, without what a Claude Code session hands its children (`SESSION_KEYS`). */
export function usageEnv(env: NodeJS.ProcessEnv = process.env): NodeJS.ProcessEnv {
  return Object.fromEntries(Object.entries(env).filter(([key]) => !SESSION_KEYS.has(key)));
}

const isObject = (x: unknown): x is Record<string, unknown> => typeof x === 'object' && x !== null && !Array.isArray(x);

/** Every limit of Claude Code's `rate_limits` with a finite `utilization` in percent, in its order: null ones and the rest are left out. */
function limitsOf(limits: Record<string, unknown>): QuotaLimit[] {
  return Object.entries(limits).flatMap(([key, w]) => {
    if (!isObject(w) || typeof w.utilization !== 'number' || !Number.isFinite(w.utilization)) return [];
    const at = typeof w.resets_at === 'string' ? Date.parse(w.resets_at) : NaN;
    return [{ key, usedPercentage: w.utilization, resetsAt: Number.isFinite(at) ? new Date(at).toISOString() : null }];
  });
}

const subscriptionOf = (usage: Record<string, unknown>): string | null =>
  typeof usage.subscription_type === 'string' ? usage.subscription_type : null;

/**
 * What Claude Code's control_response to `get_usage` says: the plan's limits and its subscription, no plan, a plan the usage service gave
 * nothing for, or why it cannot be read. Pure. A plan whose `rate_limits` are null is `unanswered`, as the Agent SDK's type for this
 * answer says: "or null when unavailable".
 */
export function quotaOfResponse(response: unknown): HarnessQuota {
  if (!isObject(response)) return { kind: 'unknown', what: 'its response is not an object' };
  if (response.subtype === 'error') {
    return { kind: 'unknown', what: `it refused the request (${typeof response.error === 'string' ? response.error : 'no error given'})` };
  }
  if (response.subtype !== 'success' || !isObject(response.response))
    return { kind: 'unknown', what: 'its response is neither a success nor an error' };
  const usage = response.response;
  if (usage.rate_limits_available === false) return { kind: 'no-plan' };
  if (usage.rate_limits_available !== true) return { kind: 'unknown', what: 'it has no rate_limits_available' };
  if (usage.rate_limits === null) return { kind: 'unanswered', subscription: subscriptionOf(usage) };
  if (!isObject(usage.rate_limits)) return { kind: 'unknown', what: 'its rate_limits are not an object' };
  return { kind: 'windows', limits: limitsOf(usage.rate_limits), subscription: subscriptionOf(usage) };
}

/** How long an asked process has, once its stdin is closed or it is sent SIGTERM, to end before it is killed. */
const END_MS = 2_000;

/**
 * The handler for an error on an asked process's stdin, which it ignores: a process that ends before it reads its request closes the pipe
 * under the write, and how it ended is read off its exit.
 */
const ignoreClosedPipe = (): void => {};

/** Whether `child` has not ended: no exit code and no signal yet. */
const running = (child: ChildProcessWithoutNullStreams): boolean => child.exitCode === null && child.signalCode === null;

/** Waits until `child` has ended, at most `ms`: whether it has. */
const endedWithin = (child: ChildProcessWithoutNullStreams, ms: number): Effect.Effect<boolean> =>
  Effect.callback<boolean>((resume) => {
    if (!running(child)) return resume(Effect.succeed(true));
    const ended = () => resume(Effect.succeed(true));
    child.once('exit', ended);
    return Effect.sync(() => child.off('exit', ended));
  }).pipe(Effect.timeoutOrElse({ duration: ms, orElse: () => Effect.succeed(false) }));

/**
 * Lets an asked process go. Its stdin is closed, on which it ends of its own. An ask that came to an outcome does not wait for that: the
 * process is killed if it has not ended in `END_MS`. One that did not — timed out, or interrupted — sends it SIGTERM and waits for it to
 * end, SIGKILL after `END_MS`, so it is gone by the time the ask is. A process that never started has nothing to end.
 */
const letGo = (child: ChildProcessWithoutNullStreams, cameTo: boolean): Effect.Effect<void> =>
  Effect.gen(function* () {
    child.stdin.end();
    if (child.pid === undefined || !running(child)) return;
    if (cameTo) {
      const kill = setTimeout(() => running(child) && child.kill('SIGKILL'), END_MS);
      kill.unref();
      child.once('exit', () => clearTimeout(kill));
      return;
    }
    child.kill('SIGTERM');
    if (yield* endedWithin(child, END_MS)) return;
    child.kill('SIGKILL');
    yield* endedWithin(child, END_MS);
  });

/** The `response` of a line that is a control_response, or undefined for any other line, JSON or not. */
function controlResponseOf(line: string): Record<string, unknown> | undefined {
  let message: unknown;
  try {
    message = JSON.parse(line);
  } catch {
    return undefined;
  }
  return isObject(message) && message.type === 'control_response' && isObject(message.response) ? message.response : undefined;
}

/**
 * What an asked process comes to: the control_response with `id` on its stdout, read (`quotaOfResponse`), or how it could not start, or
 * how it ended before it answered. It writes the request once it listens for all of them.
 */
const answered = (child: ChildProcessWithoutNullStreams, id: string): Effect.Effect<HarnessQuota> =>
  Effect.callback<HarnessQuota>((resume) => {
    const settle = (asked: HarnessQuota) => resume(Effect.succeed(asked));
    let out = '';
    let err = '';
    child.on('error', (e: NodeJS.ErrnoException) =>
      settle(e.code === 'ENOENT' ? { kind: 'missing' } : { kind: 'failed', code: null, signal: null, said: e.message }),
    );
    child.stdin.on('error', ignoreClosedPipe);
    child.stderr.on('data', (d: Buffer) => {
      err = (err + d.toString()).slice(-4_000);
    });
    child.stdout.on('data', (d: Buffer) => {
      out += d.toString();
      const lines = out.split('\n');
      out = lines.pop()!;
      const response = lines.map(controlResponseOf).find((r) => r?.request_id === id);
      if (response) settle(quotaOfResponse(response));
    });
    child.on('close', (code, signal) => settle({ kind: 'failed', code, signal, said: err.trim().split('\n').pop()?.trim() ?? '' }));
    child.stdin.write(
      `${JSON.stringify({ type: 'control_request', request_id: id, request: { subtype: 'get_usage', skip_behaviors: true } })}\n`,
    );
  });

/**
 * Ask Claude Code for the plan's usage: start `command` (`claude` on PATH, `USAGE_ARGS`) in the system's temporary directory, in this
 * process's environment without a session's keys (`usageEnv`), write one `get_usage` request with an id of its own, and read its stdout
 * for the control_response with that id. The process is taken in the ask's scope and let go as it closes (`letGo`), whatever ends it: an
 * outcome, the timeout (`timeoutMs`, `QUOTA_TIMEOUT_MS` by default), or an interruption. Never fails: every way it can go is a
 * `HarnessQuota`, and no `claude` on PATH is `missing`.
 */
export const claudeQuota = ({
  command = 'claude',
  timeoutMs = QUOTA_TIMEOUT_MS,
}: { command?: string; timeoutMs?: number } = {}): Effect.Effect<HarnessQuota> =>
  Effect.suspend(() => {
    const id = `usage-${process.pid}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    return Effect.acquireRelease(
      Effect.sync(() => spawn(command, USAGE_ARGS, { cwd: os.tmpdir(), env: usageEnv(process.env), stdio: ['pipe', 'pipe', 'pipe'] })),
      (child, exit) => letGo(child, Exit.isSuccess(exit)),
    ).pipe(
      Effect.flatMap((child) => answered(child, id)),
      Effect.scoped,
      Effect.timeoutOrElse({ duration: timeoutMs, orElse: () => Effect.succeed<HarnessQuota>({ kind: 'timeout', ms: timeoutMs }) }),
    );
  });
