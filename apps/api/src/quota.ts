/**
 * The subscription's quota, asked of Claude Code itself: the `claude` on the api's PATH, sent its `get_usage` control request (`askUsage`).
 * No prompt is sent, so no model is called and no token spent; it answers in about half a second with the plan's windows as claude.ai's
 * usage endpoint reports them (measured on Claude Code 2.1.278, packages/agent-workflows/docs/features.md, *the quota on the board*).
 *
 * Nothing asks unless a board asks. `readQuota` answers from the last ask while it is younger than `QUOTA_KEEP_MS`, starts one ask
 * otherwise — a request that comes while one is in flight joins it — and waits for it at most `QUOTA_WAIT_MS` before it says `asking`.
 * What it holds is in this process's memory and nowhere else, judged against the time of each request: a restart costs one ask.
 */
import { spawn } from 'node:child_process';
import os from 'node:os';

/**
 * How long an ask's outcome is kept, a failure's as much as an answer's: three minutes. The usage endpoint behind `get_usage` is reported
 * to refuse a token that asks in bursts, for hours, and every board open on this api shares one ask. `HKB_QUOTA_KEEP_MS` sets it (the
 * e2e's 0 asks on every read).
 */
export const QUOTA_KEEP_MS = 3 * 60 * 1000;

/** How long a request waits for an ask before it answers `asking`: the Factory's loader never waits on a slow harness. */
export const QUOTA_WAIT_MS = 2_000;

/** How long an ask may take before it is given up on, and its process ended. */
export const QUOTA_TIMEOUT_MS = 15_000;

/** A window used this much or more, in percent, is marked. */
export const QUOTA_MARK_PERCENT = 80;

/**
 * `claude` as the ask starts it: a print session reading stream-json, in which a control request is answered with no prompt. Without the
 * user's settings, which load plugins and their hooks, and sync skills to disk on each start; without MCP servers but any named here
 * (none); and with nothing written as a session, should a version write one for a session that never had a turn. Measured on 2.1.278,
 * without these: no transcript and no child process, but the skills' manifest written again on every ask.
 */
export const USAGE_ARGS = [
  '-p', '--input-format', 'stream-json', '--output-format', 'stream-json', '--verbose',
  '--no-session-persistence', '--strict-mcp-config', '--setting-sources', '',
];

/**
 * One limit, as Claude Code reported it. `key` is Claude Code's (`five_hour`, `seven_day`, …) and `label` the board's word for it.
 * `resetsAt` is ISO, null when none was given. `reset` is whether that time has passed since the reading: the window has begun again, and
 * its number is about the one before. `marked` is whether it is `QUOTA_MARK_PERCENT` used or more.
 */
export type QuotaWindow = { key: string; label: string; usedPercentage: number; resetsAt: string | null; reset: boolean; marked: boolean };

/**
 * What one ask came to:
 *
 *   answer     Claude Code's control_response for the ask — `subtype` success with its `response`, or error with its `error`
 *   no-claude  no `claude` on the api's PATH
 *   timeout    no answer within the timeout
 *   failed     the process ended, or could not start, before it answered: its exit code or signal, and its stderr's last line
 */
export type Asked =
  | { kind: 'answer'; response: unknown }
  | { kind: 'no-claude' }
  | { kind: 'timeout'; ms: number }
  | { kind: 'failed'; code: number | null; signal: string | null; said: string };

/**
 * The quota as the board is given it:
 *
 *   fresh      the plan's windows, from an answer younger than `keepMs`: `windows` are to show
 *   asking     no answer held, and one asked for: said so, and read again soon
 *   no-plan    Claude Code here has no plan limits: it is not signed in to a Claude subscription
 *   no-claude  there is no `claude` on the api's PATH
 *   timeout    Claude Code did not answer in time
 *   failed     Claude Code ended before it answered
 *   unknown    it answered in a shape this code does not read: an error for the request, or no window it can read
 *
 * `said` is the plain sentence for every case but `fresh`, with what to do. `askedAt` and `ageMs` are the held ask's, null while none is.
 * `last` is the last answer that had windows, when the state is not `fresh`: for the hover, with its time, and never shown as now.
 */
export type Quota = {
  state: 'fresh' | 'asking' | 'no-plan' | 'no-claude' | 'timeout' | 'failed' | 'unknown';
  askedAt: string | null;
  ageMs: number | null;
  subscription: string | null;
  windows: QuotaWindow[];
  last: { askedAt: string; windows: QuotaWindow[] } | null;
  keepMs: number;
  markAt: number;
  said: string | null;
};

const LABELS: Record<string, string> = { five_hour: '5-hour', seven_day: 'week', seven_day_sonnet: 'week, Sonnet', seven_day_opus: 'week, Opus' };
/**
 * The windows the board shows, in this order: the plan's own. Claude Code's answer holds many more keys, most null and some named for no one
 * (`nimbus_quill`, at 0% and no reset, on the owner's plan), so a key it does not know is not shown.
 */
const ORDER = Object.keys(LABELS);

const SEE = 'get_usage is experimental: see README.md, The quota on the board';

/** `15 s`, `4 min`, `3 h`, `2 d`: how long, in the largest unit — a part of a second is a second. */
export function ageWord(ms: number): string {
  const sec = Math.ceil(Math.max(0, ms) / 1000);
  if (sec < 60) return `${sec} s`;
  const min = Math.floor(sec / 60);
  if (min < 60) return `${min} min`;
  const h = Math.floor(min / 60);
  return h < 48 ? `${h} h` : `${Math.floor(h / 24)} d`;
}

const isObject = (x: unknown): x is Record<string, unknown> => typeof x === 'object' && x !== null && !Array.isArray(x);

/** The windows the board shows, of Claude Code's `rate_limits`, at `now`: each with a finite `utilization` in percent. */
function windowsOf(limits: Record<string, unknown>, now: number): QuotaWindow[] {
  return ORDER.flatMap((key) => {
    const w = limits[key];
    if (!isObject(w) || typeof w.utilization !== 'number' || !Number.isFinite(w.utilization)) return [];
    const at = typeof w.resets_at === 'string' ? Date.parse(w.resets_at) : NaN;
    const resetsAt = Number.isFinite(at) ? new Date(at).toISOString() : null;
    return [{
      key,
      label: LABELS[key]!,
      usedPercentage: w.utilization,
      resetsAt,
      reset: resetsAt !== null && at <= now,
      marked: w.utilization >= QUOTA_MARK_PERCENT,
    }];
  });
}

/**
 * What an answer says: the plan's windows and its subscription, no plan, or why it cannot be read. Pure, and judged at `now` for the
 * windows' resets.
 */
export function answerOf(response: unknown, now: number):
  | { kind: 'windows'; windows: QuotaWindow[]; subscription: string | null }
  | { kind: 'no-plan' }
  | { kind: 'unknown'; what: string } {
  if (!isObject(response)) return { kind: 'unknown', what: 'its response is not an object' };
  if (response.subtype === 'error') {
    return { kind: 'unknown', what: `it refused the request (${typeof response.error === 'string' ? response.error : 'no error given'})` };
  }
  if (response.subtype !== 'success' || !isObject(response.response)) return { kind: 'unknown', what: 'its response is neither a success nor an error' };
  const usage = response.response;
  if (usage.rate_limits_available === false) return { kind: 'no-plan' };
  if (usage.rate_limits_available !== true) return { kind: 'unknown', what: 'it has no rate_limits_available' };
  if (!isObject(usage.rate_limits)) return { kind: 'unknown', what: 'its rate_limits are not an object' };
  const windows = windowsOf(usage.rate_limits, now);
  if (!windows.length) return { kind: 'unknown', what: `none of its rate_limits (${ORDER.join(', ')}) has a numeric utilization` };
  return { kind: 'windows', windows, subscription: typeof usage.subscription_type === 'string' ? usage.subscription_type : null };
}

/** An ask's outcome, and when it came: the ms since the epoch. */
export type Held = { asked: Asked; at: number };

/**
 * The quota, judged at `now` from the ask held — null while none is, and one is being asked — and the last answer that had windows. Pure:
 * `readQuota` holds both and hands them here.
 */
export function quotaOf(held: Held | null, last: Held | null, now: number, keepMs: number = QUOTA_KEEP_MS): Quota {
  const lastWindows = last?.asked.kind === 'answer' ? answerOf(last.asked.response, now) : null;
  const base = {
    askedAt: held && new Date(held.at).toISOString(),
    ageMs: held && Math.max(0, now - held.at),
    subscription: null,
    windows: [],
    last: lastWindows?.kind === 'windows' ? { askedAt: new Date(last!.at).toISOString(), windows: lastWindows.windows } : null,
    keepMs,
    markAt: QUOTA_MARK_PERCENT,
  };
  if (!held) return { ...base, state: 'asking', said: 'Asking Claude Code for the quota…' };
  const left = held.at + keepMs - now;
  const again = left >= 60_000 ? `Asked again in ${ageWord(left)}.` : 'Asked again on the next read.';
  const { asked } = held;
  switch (asked.kind) {
    case 'no-claude':
      return {
        ...base,
        state: 'no-claude',
        said: `The quota cannot be asked for: there is no claude on the api's PATH. Install Claude Code, or start the api from a shell where claude runs. ${again}`,
      };
    case 'timeout':
      return {
        ...base,
        state: 'timeout',
        said: `Claude Code did not answer the usage request within ${ageWord(asked.ms)}: run claude -p in a shell where the api runs to see why. ${again}`,
      };
    case 'failed': {
      const how = asked.code !== null ? `exit ${asked.code}` : asked.signal ? `killed by ${asked.signal}` : 'it did not start';
      return {
        ...base,
        state: 'failed',
        said: `Claude Code stopped before it answered the usage request (${how}${asked.said ? `: ${asked.said}` : ''}). Run claude -p in a shell where the api runs to see why. ${again}`,
      };
    }
    case 'answer': {
      const read = answerOf(asked.response, now);
      if (read.kind === 'no-plan') {
        return {
          ...base,
          state: 'no-plan',
          said: `No plan limits to show: the Claude Code the api runs is not signed in to a Claude subscription (an API key, or another provider). Run claude, then /login with the subscription's account, under the api's CLAUDE_CONFIG_DIR. ${again}`,
        };
      }
      if (read.kind === 'unknown') {
        return { ...base, state: 'unknown', said: `Claude Code answered the usage request in a shape this board does not read: ${read.what}. ${SEE}. ${again}` };
      }
      return { ...base, last: null, subscription: read.subscription, windows: read.windows, state: 'fresh', said: null };
    }
  }
}

/** The environment an ask runs in: the api's, without what a Claude Code session hands its children, but for where it keeps its sign-in. */
export function usageEnv(env: NodeJS.ProcessEnv = process.env): NodeJS.ProcessEnv {
  return Object.fromEntries(Object.entries(env).filter(([key]) => !key.startsWith('CLAUDE') || key === 'CLAUDE_CONFIG_DIR'));
}

/** How long an asked process has, once its stdin is closed, to end of its own before it is killed. */
const END_MS = 2_000;

/**
 * Ask Claude Code for the plan's usage: start `claude` (USAGE_ARGS) in the system's temporary directory, write one `get_usage` request with
 * an id of its own, and read its stdout for the control_response with that id. Then close its stdin, on which it ends of its own; killed
 * if it has not in `END_MS`. Never rejects: every way it can go is an `Asked`.
 */
export function askUsage({ command = 'claude', timeoutMs = QUOTA_TIMEOUT_MS, env = process.env }: { command?: string; timeoutMs?: number; env?: NodeJS.ProcessEnv } = {}): Promise<Asked> {
  const id = `usage-${process.pid}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  return new Promise((resolve) => {
    let done = false;
    let out = '';
    let err = '';
    const child = spawn(command, USAGE_ARGS, { cwd: os.tmpdir(), env: usageEnv(env), stdio: ['pipe', 'pipe', 'pipe'] });
    const end = (signal: NodeJS.Signals | null) => {
      child.stdin.end();
      if (signal && child.exitCode === null) child.kill(signal);
      const kill = setTimeout(() => child.exitCode === null && child.signalCode === null && child.kill('SIGKILL'), END_MS);
      kill.unref();
      child.once('exit', () => clearTimeout(kill));
    };
    const settle = (asked: Asked, signal: NodeJS.Signals | null = null) => {
      if (done) return;
      done = true;
      clearTimeout(timer);
      end(signal);
      resolve(asked);
    };
    const timer = setTimeout(() => settle({ kind: 'timeout', ms: timeoutMs }, 'SIGTERM'), timeoutMs);
    child.on('error', (e: NodeJS.ErrnoException) =>
      settle(e.code === 'ENOENT' ? { kind: 'no-claude' } : { kind: 'failed', code: null, signal: null, said: e.message }));
    // A process that ends before it reads its request closes the pipe under the write.
    child.stdin.on('error', () => {});
    child.stderr.on('data', (d: Buffer) => { err = (err + d.toString()).slice(-4_000); });
    child.stdout.on('data', (d: Buffer) => {
      out += d.toString();
      const lines = out.split('\n');
      out = lines.pop()!;
      for (const line of lines) {
        let message: unknown;
        try {
          message = JSON.parse(line);
        } catch {
          continue;
        }
        if (isObject(message) && message.type === 'control_response' && isObject(message.response) && message.response.request_id === id) {
          settle({ kind: 'answer', response: message.response });
          return;
        }
      }
    });
    child.on('close', (code, signal) => {
      const said = err.trim().split('\n').pop()?.trim() ?? '';
      settle({ kind: 'failed', code, signal, said });
    });
    child.stdin.write(`${JSON.stringify({ type: 'control_request', request_id: id, request: { subtype: 'get_usage', skip_behaviors: true } })}\n`);
  });
}

/** What the api holds: the last ask's outcome, the last with windows, and the ask in flight. This process's, and nobody's file. */
let held: Held | null = null;
let good: Held | null = null;
let inFlight: Promise<void> | null = null;

/** Forget what is held, as a restart would: for tests. An ask in flight still lands. */
export function forgetQuota(): void {
  held = null;
  good = null;
}

const keepOf = (env: NodeJS.ProcessEnv): number => {
  const ms = Number(env.HKB_QUOTA_KEEP_MS);
  return env.HKB_QUOTA_KEEP_MS !== undefined && env.HKB_QUOTA_KEEP_MS !== '' && Number.isFinite(ms) && ms >= 0 ? ms : QUOTA_KEEP_MS;
};

/**
 * The quota as this request should say it: from what is held while it is younger than the keep; otherwise from an ask — the one in flight,
 * or one started now — waited for at most `waitMs`, and `asking` past that.
 */
export async function readQuota({ waitMs = QUOTA_WAIT_MS, timeoutMs = QUOTA_TIMEOUT_MS, env = process.env, now = () => Date.now() }: {
  waitMs?: number; timeoutMs?: number; env?: NodeJS.ProcessEnv; now?: () => number;
} = {}): Promise<Quota> {
  const keepMs = keepOf(env);
  const current = () => held !== null && now() - held.at < keepMs;
  if (!current()) {
    const started = now();
    inFlight ??= askUsage({ timeoutMs, env }).then((asked) => {
      const at = Math.max(started, now());
      held = { asked, at };
      if (asked.kind === 'answer' && answerOf(asked.response, at).kind === 'windows') good = held;
    }).finally(() => { inFlight = null; });
    let wait: NodeJS.Timeout | undefined;
    await Promise.race([inFlight, new Promise((r) => { wait = setTimeout(r, waitMs); })]);
    clearTimeout(wait);
    // An answer that came in the wait is this request's, however short the keep.
    if (inFlight !== null || held === null || held.at < started) return quotaOf(null, good, now(), keepMs);
  }
  return quotaOf(held, good, now(), keepMs);
}
