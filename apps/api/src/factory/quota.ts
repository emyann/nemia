/**
 * The subscription's quota, asked of Claude Code itself: the `claude` on the api's PATH, sent its `get_usage` control request (`askUsage`).
 * No prompt is sent, so no model is called and no token spent; it answers in about half a second with the plan's windows as claude.ai's
 * usage endpoint reports them (measured on Claude Code 2.1.278, packages/agent-orchestrator/docs/features.md, *the quota on the board*).
 *
 * Nothing asks unless a board asks. A read (`makeQuota`) answers from the last ask while it is younger than `QUOTA_KEEP_MS`, starts one ask
 * otherwise — a request that comes while one is in flight joins it — and waits for it at most `QUOTA_WAIT_MS` before it says `asking`.
 * An answer in which Anthropic's usage service gave Claude Code nothing (`unanswered`) is kept longer, and longer again each time in a row
 * (`backoffOf`), until a good reading. What it holds is in the asker's memory (`QuotaAsker`, one for an app) and nowhere else, judged
 * against the time of each request: a restart costs one ask.
 */
import { type ChildProcessWithoutNullStreams, spawn } from 'node:child_process';
import os from 'node:os';
import { Context, Effect, Exit, Layer } from 'effect';

/**
 * How long an ask's outcome is kept, a failure's as much as a good reading's: ten minutes, six asks an hour while a board is open. The windows
 * are five hours and a week long, and a number read ten minutes ago says as much about them as one read three minutes ago; the usage endpoint
 * behind `get_usage` is reported to refuse an account that asks in bursts, for hours, and every board open on this api shares one ask.
 * `HKB_QUOTA_KEEP_MS` sets it (the e2e's 0 asks on every read).
 */
export const QUOTA_KEEP_MS = 10 * 60 * 1000;

/**
 * How long an `unanswered` outcome is kept the first time in a row: twenty minutes, twice the keep, so that a service limiting how often it
 * is asked is asked half as often at once; each such answer in a row doubles the wait, to `QUOTA_BACKOFF_CEILING_MS`, and a good reading
 * begins it again (`backoffOf`). `HKB_QUOTA_BACKOFF_MS` sets it (the e2e's 0 asks on every read).
 */
export const QUOTA_BACKOFF_MS = 20 * 60 * 1000;

/**
 * The longest an `unanswered` outcome is kept: four hours — 20, 40, 80 and 160 minutes, then four hours for as long as it lasts, five asks in
 * the first five hours and six a day after. Longer, and a service that answers again is not read for most of a five-hour window.
 */
export const QUOTA_BACKOFF_CEILING_MS = 4 * 60 * 60 * 1000;

/**
 * How long the last good reading is shown, dimmed, beside a state that has no windows of its own: six hours. Past that its five-hour window
 * is certainly one that has begun again, and the week's number is more than a day of steady use behind; it goes.
 */
export const QUOTA_LAST_MS = 6 * 60 * 60 * 1000;

/** How long a request waits for an ask before it answers `asking`: the Factory's loader waits on a slow harness this long, no longer. */
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
 *   unanswered Claude Code is signed in to a subscription, and Anthropic's usage service gave it nothing: `rate_limits_available` true and
 *              `rate_limits` null. Claude Code 2.1.278 answers so when the service's body is an error ("Usage fetch returned a fieldless or
 *              non-object body (in-band error)" in its --debug log), which may be the service limiting how often it is asked: kept by
 *              `backoffOf`, not the keep
 *   no-claude  there is no `claude` on the api's PATH
 *   timeout    Claude Code did not answer in time
 *   failed     Claude Code ended before it answered
 *   unknown    it answered in a shape this code does not read: an error for the request, or no window it can read
 *
 * `said` is the plain sentence for every case but `fresh`, with what to do. `askedAt` and `ageMs` are the held ask's, null while none is;
 * `againAt` is when a read will next ask, null while none is held. `last` is the last answer that had windows, when the state is not
 * `fresh` and it is younger than `QUOTA_LAST_MS`: shown dimmed, with its time, and never as now.
 */
export type Quota = {
  state: 'fresh' | 'asking' | 'no-plan' | 'unanswered' | 'no-claude' | 'timeout' | 'failed' | 'unknown';
  askedAt: string | null;
  ageMs: number | null;
  againAt: string | null;
  subscription: string | null;
  windows: QuotaWindow[];
  last: { askedAt: string; windows: QuotaWindow[] } | null;
  keepMs: number;
  markAt: number;
  said: string | null;
};

const LABELS: Record<string, string> = {
  five_hour: '5-hour',
  seven_day: 'week',
  seven_day_sonnet: 'week, Sonnet',
  seven_day_opus: 'week, Opus',
};
/**
 * The windows the board shows, in this order: the plan's own. Claude Code's answer holds many more keys, most null and some named for no one
 * (`nimbus_quill`, at 0% with no reset), so a key it does not know is not shown.
 */
const ORDER = Object.keys(LABELS);

const SEE = 'get_usage is experimental: see README.md, The quota on the board';

/** `15 s`, `4 min`, `3 h`, `1 h 20 min`, `2 d`: how long — a part of a second is a second, and minutes beside hours under two days. */
export function ageWord(ms: number): string {
  const sec = Math.ceil(Math.max(0, ms) / 1000);
  if (sec < 60) return `${sec} s`;
  const min = Math.floor(sec / 60);
  if (min < 60) return `${min} min`;
  const h = Math.floor(min / 60);
  if (h >= 48) return `${Math.floor(h / 24)} d`;
  return min % 60 ? `${h} h ${min % 60} min` : `${h} h`;
}

const isObject = (x: unknown): x is Record<string, unknown> => typeof x === 'object' && x !== null && !Array.isArray(x);

/** The windows the board shows, of Claude Code's `rate_limits`, at `now`: each with a finite `utilization` in percent. */
function windowsOf(limits: Record<string, unknown>, now: number): QuotaWindow[] {
  return ORDER.flatMap((key) => {
    const w = limits[key];
    if (!isObject(w) || typeof w.utilization !== 'number' || !Number.isFinite(w.utilization)) return [];
    const at = typeof w.resets_at === 'string' ? Date.parse(w.resets_at) : NaN;
    const resetsAt = Number.isFinite(at) ? new Date(at).toISOString() : null;
    return [
      {
        key,
        label: LABELS[key],
        usedPercentage: w.utilization,
        resetsAt,
        reset: resetsAt !== null && at <= now,
        marked: w.utilization >= QUOTA_MARK_PERCENT,
      },
    ];
  });
}

const subscriptionOf = (usage: Record<string, unknown>): string | null =>
  typeof usage.subscription_type === 'string' ? usage.subscription_type : null;

/**
 * What an answer says: the plan's windows and its subscription, no plan, a plan the usage service gave nothing for, or why it cannot be read.
 * Pure, and judged at `now` for the windows' resets. A plan whose `rate_limits` are null is `unanswered`, as the Agent SDK's type for this
 * answer says: "or null when unavailable".
 */
export function answerOf(
  response: unknown,
  now: number,
):
  | { kind: 'windows'; windows: QuotaWindow[]; subscription: string | null }
  | { kind: 'no-plan' }
  | { kind: 'unanswered'; subscription: string | null }
  | { kind: 'unknown'; what: string } {
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
  const windows = windowsOf(usage.rate_limits, now);
  if (!windows.length) return { kind: 'unknown', what: `none of its rate_limits (${ORDER.join(', ')}) has a numeric utilization` };
  return { kind: 'windows', windows, subscription: subscriptionOf(usage) };
}

/**
 * An ask's outcome, and when it came: the ms since the epoch. `keptMs` is how long it is kept when that is not the keep: an `unanswered`
 * outcome's wait (`backoffOf`).
 */
export type Held = { asked: Asked; at: number; keptMs?: number };

/**
 * How long the `streak`th `unanswered` outcome in a row is kept: `firstMs`, doubled for each one before it in the row, never past
 * `QUOTA_BACKOFF_CEILING_MS` — nor under `firstMs`, should it be set higher than the ceiling.
 */
export function backoffOf(streak: number, firstMs: number = QUOTA_BACKOFF_MS): number {
  return Math.min(firstMs * 2 ** Math.max(0, streak - 1), Math.max(firstMs, QUOTA_BACKOFF_CEILING_MS));
}

/**
 * The quota, judged at `now` from the ask held — null while none is, and one is being asked — and the last answer that had windows, shown
 * while younger than `QUOTA_LAST_MS`. Pure: a quota asker (`makeQuota`) holds both and hands them here.
 */
export function quotaOf(held: Held | null, last: Held | null, now: number, keepMs: number = QUOTA_KEEP_MS): Quota {
  const lastWindows = last?.asked.kind === 'answer' && now - last.at <= QUOTA_LAST_MS ? answerOf(last.asked.response, now) : null;
  const keptMs = held?.keptMs ?? keepMs;
  const base = {
    askedAt: held && new Date(held.at).toISOString(),
    ageMs: held && Math.max(0, now - held.at),
    againAt: held && new Date(held.at + keptMs).toISOString(),
    subscription: null,
    windows: [],
    last: lastWindows?.kind === 'windows' ? { askedAt: new Date(last!.at).toISOString(), windows: lastWindows.windows } : null,
    keepMs,
    markAt: QUOTA_MARK_PERCENT,
  };
  if (!held) return { ...base, state: 'asking', said: 'Asking Claude Code for the quota…' };
  const left = held.at + keptMs - now;
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
      if (read.kind === 'unanswered') {
        return {
          ...base,
          state: 'unanswered',
          subscription: read.subscription,
          said: `Claude Code is signed in to a subscription${read.subscription ? ` (${read.subscription})` : ''}, but Anthropic's usage service gave it nothing this time. The service may be limiting how often it is asked, so the board waits longer before each ask until it answers. ${again}`,
        };
      }
      if (read.kind === 'unknown') {
        return {
          ...base,
          state: 'unknown',
          said: `Claude Code answered the usage request in a shape this board does not read: ${read.what}. ${SEE}. ${again}`,
        };
      }
      return { ...base, last: null, subscription: read.subscription, windows: read.windows, state: 'fresh', said: null };
    }
  }
}

/**
 * What a Claude Code session hands its children, as 2.1.278 does (read off a session's own environment): an api started from one would
 * otherwise start the ask as that session's child. Named, not matched by prefix: the rest of `CLAUDE*` is how the api's claude signs in
 * and whom it asks (`CLAUDE_CONFIG_DIR`, `CLAUDE_CODE_OAUTH_TOKEN`, `CLAUDE_CODE_USE_BEDROCK`…), as it is for the engine's workers.
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

/** The environment an ask runs in: the api's, without what a Claude Code session hands its children (`SESSION_KEYS`). */
export function usageEnv(env: NodeJS.ProcessEnv = process.env): NodeJS.ProcessEnv {
  return Object.fromEntries(Object.entries(env).filter(([key]) => !SESSION_KEYS.has(key)));
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

/**
 * What an asked process comes to: the control_response with `id` on its stdout, or how it could not start, or how it ended before it
 * answered. It writes the request once it listens for all of them.
 */
const answered = (child: ChildProcessWithoutNullStreams, id: string): Effect.Effect<Asked> =>
  Effect.callback<Asked>((resume) => {
    const settle = (asked: Asked) => resume(Effect.succeed(asked));
    let out = '';
    let err = '';
    child.on('error', (e: NodeJS.ErrnoException) =>
      settle(e.code === 'ENOENT' ? { kind: 'no-claude' } : { kind: 'failed', code: null, signal: null, said: e.message }),
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
      if (response) settle({ kind: 'answer', response });
    });
    child.on('close', (code, signal) => settle({ kind: 'failed', code, signal, said: err.trim().split('\n').pop()?.trim() ?? '' }));
    child.stdin.write(
      `${JSON.stringify({ type: 'control_request', request_id: id, request: { subtype: 'get_usage', skip_behaviors: true } })}\n`,
    );
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
 * Ask Claude Code for the plan's usage: start `claude` (USAGE_ARGS) in the system's temporary directory, write one `get_usage` request with
 * an id of its own, and read its stdout for the control_response with that id. The process is taken in the ask's scope and let go as it
 * closes (`letGo`), whatever ends it: an outcome, the timeout, or an interruption. Never fails: every way it can go is an `Asked`.
 */
export const usageAsk = ({
  command = 'claude',
  timeoutMs = QUOTA_TIMEOUT_MS,
  env = process.env,
}: { command?: string; timeoutMs?: number; env?: NodeJS.ProcessEnv } = {}): Effect.Effect<Asked> => {
  const id = `usage-${process.pid}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  return Effect.acquireRelease(
    Effect.sync(() => spawn(command, USAGE_ARGS, { cwd: os.tmpdir(), env: usageEnv(env), stdio: ['pipe', 'pipe', 'pipe'] })),
    (child, exit) => letGo(child, Exit.isSuccess(exit)),
  ).pipe(
    Effect.flatMap((child) => answered(child, id)),
    Effect.scoped,
    Effect.timeoutOrElse({ duration: timeoutMs, orElse: () => Effect.succeed<Asked>({ kind: 'timeout', ms: timeoutMs }) }),
  );
};

/** `usageAsk` as a Promise, for `makeQuota`: never rejects. */
export const askUsage = (opts: Parameters<typeof usageAsk>[0] = {}): Promise<Asked> => Effect.runPromise(usageAsk(opts));

/** A length of time from `env[name]`, in ms: a number 0 or more, or `fallback` for anything else. */
const msOf = (env: NodeJS.ProcessEnv, name: string, fallback: number): number => {
  const value = env[name];
  const ms = Number(value);
  return value !== undefined && value !== '' && Number.isFinite(ms) && ms >= 0 ? ms : fallback;
};

/**
 * A read of the quota, with what it is judged against: how long it waits for an ask (`waitMs`), how long an ask is given (`timeoutMs`), the
 * environment its keeps and the `claude` it asks are read from (`env`, `HKB_QUOTA_KEEP_MS` and `HKB_QUOTA_BACKOFF_MS` on each read), and
 * the time (`now`).
 */
export type ReadQuota = (opts?: { waitMs?: number; timeoutMs?: number; env?: NodeJS.ProcessEnv; now?: () => number }) => Promise<Quota>;

/**
 * A quota asker with nothing held, as a fresh api has: what it holds is the last ask's outcome, the last with windows, how many `unanswered`
 * outcomes in a row since it, and the ask in flight, in its own memory and nobody's file.
 *
 * Its read says the quota as the request should: from what is held while it is younger than its keep — the keep, or an `unanswered`
 * outcome's wait; otherwise from an ask — the one in flight, or one started now — waited for at most `waitMs`, and `asking` past that. An
 * answer that came in the wait is this request's, however short the keep. A reading with windows begins the backoff again; each
 * `unanswered` one in a row lengthens it (`backoffOf`); another failure between two `unanswered` answers neither ends it nor adds to it.
 */
export function makeQuota(): ReadQuota {
  let held: Held | null = null;
  let good: Held | null = null;
  let unanswered = 0;
  let inFlight: Promise<void> | null = null;
  return async ({ waitMs = QUOTA_WAIT_MS, timeoutMs = QUOTA_TIMEOUT_MS, env = process.env, now = () => Date.now() } = {}) => {
    const keepMs = msOf(env, 'HKB_QUOTA_KEEP_MS', QUOTA_KEEP_MS);
    const backoffMs = msOf(env, 'HKB_QUOTA_BACKOFF_MS', QUOTA_BACKOFF_MS);
    const current = () => held !== null && now() - held.at < (held.keptMs ?? keepMs);
    if (!current()) {
      const started = now();
      inFlight ??= askUsage({ timeoutMs, env })
        .then((asked) => {
          const at = Math.max(started, now());
          const read = asked.kind === 'answer' ? answerOf(asked.response, at).kind : null;
          if (read === 'windows') unanswered = 0;
          if (read === 'unanswered') unanswered += 1;
          held = read === 'unanswered' ? { asked, at, keptMs: backoffOf(unanswered, backoffMs) } : { asked, at };
          if (read === 'windows') good = held;
        })
        .finally(() => {
          inFlight = null;
        });
      let wait: NodeJS.Timeout | undefined;
      await Promise.race([
        inFlight,
        new Promise((r) => {
          wait = setTimeout(r, waitMs);
        }),
      ]);
      clearTimeout(wait);
      if (inFlight !== null || held === null || held.at < started) return quotaOf(null, good, now(), keepMs);
    }
    return quotaOf(held, good, now(), keepMs);
  };
}

/** The quota asker every board's read shares, one for an app (`live`, a fresh `makeQuota`): a test gives its own with `layer`. */
export class QuotaAsker extends Context.Service<QuotaAsker, ReadQuota>()('api/QuotaAsker') {
  static readonly live: Layer.Layer<QuotaAsker> = Layer.sync(QuotaAsker)(makeQuota);
  static readonly layer = (read: ReadQuota): Layer.Layer<QuotaAsker> => Layer.succeed(QuotaAsker)(read);
}
