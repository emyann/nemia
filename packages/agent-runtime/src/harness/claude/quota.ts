/**
 * Claude Code's quota: the Agent SDK asked its usage question (`claudeQuota`). No prompt is sent, so no model is called and no token
 * spent; it answers in about a second with the plan's limits as claude.ai's usage endpoint reports them. Each ask opens a query of its
 * own and closes it: nothing is kept between asks, and a caller that reads often keeps the answer itself, since the endpoint behind it
 * is reported to refuse an account that asks in bursts.
 *
 * The SDK's method for it says in its name that it may change, so it has one call site, `sdkUsageAsk` here, and `UsageAsk` is the seam
 * a test stands in for.
 */
import os from 'node:os';
import { query, type Options, type SDKUserMessage } from '@anthropic-ai/claude-agent-sdk';
import { Effect } from 'effect';
import type { HarnessQuota, QuotaLimit } from '../seam.ts';
import { withoutTelemetry } from '../telemetry.ts';

/** How long an ask may take before it is given up on, and its query closed. */
export const QUOTA_TIMEOUT_MS = 15_000;

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

/**
 * Which Claude Code an ask drives when none is named: `claude` from PATH, the one the harness spawns its sessions with
 * (`src/harness/claude/code.ts`). A bare name, so the SDK's spawn resolves it on PATH and its absence arrives as
 * `executable_not_found`, which `quotaOfRefusal` reads as `missing`. Were the option left off, the SDK would drive its own bundled
 * native CLI instead, and the quota would report on a Claude Code the sessions never run.
 */
export const QUOTA_COMMAND = 'claude';

/**
 * The SDK options an ask opens its query with. No prompt is sent, so what is asked for is what a usage question needs and nothing a
 * session needs: the system's temporary directory to run in; this process's environment without a session's keys (`usageEnv`) or its
 * telemetry (`withoutTelemetry`), given whole since `env` replaces the child's environment rather than adding to it; no session written,
 * should a version write one for a session that never had a turn; no MCP server but one named here (none); and none of the user's
 * settings, which load plugins and their hooks and sync skills to disk on each start. `command` is the Claude Code to ask,
 * `QUOTA_COMMAND` when it is not given — never the SDK's own bundled CLI.
 */
export const usageOptions = (command: string = QUOTA_COMMAND): Options => ({
  cwd: os.tmpdir(),
  env: withoutTelemetry(usageEnv(process.env)),
  persistSession: false,
  strictMcpConfig: true,
  settingSources: [],
  pathToClaudeCodeExecutable: command,
});

/**
 * One ask of Claude Code's usage, as `claudeQuota` puts it: `usage` answers the question once, asked as the SDK's method is, and
 * `close` lets the query go, whatever came of it. A test stands in for it.
 */
export type UsageAsk = {
  readonly usage: (opts: { skipBehaviors: boolean }) => Promise<unknown>;
  readonly close: () => Promise<void>;
};

/** How an ask is opened: over the Claude Code named, `QUOTA_COMMAND` when none is. */
export type OpenUsage = (command?: string) => UsageAsk;

/**
 * The input of an ask's query: it yields no message, and ends only once the ask is done with it. A query whose input has ended closes
 * the child's stdin, on which Claude Code exits — so the question would race the exit were the input to end at once.
 */
const heldInput = (): { prompt: AsyncIterable<SDKUserMessage>; release: () => void } => {
  let release = (): void => {};
  const held = new Promise<void>((resolve) => {
    release = resolve;
  });
  const next = async (): Promise<IteratorResult<SDKUserMessage, undefined>> => {
    await held;
    return { done: true, value: undefined };
  };
  return { prompt: { [Symbol.asyncIterator]: () => ({ next }) }, release };
};

/**
 * The ask as the Agent SDK takes it (the one call site of its usage method): a query opened for the question alone (`usageOptions`),
 * asked what it is handed, and closed with its input. `claudeQuota` asks `skipBehaviors: true`: the plan's limits need none of the scan
 * of local transcripts the answer's behaviours section would cost.
 */
export const sdkUsageAsk: OpenUsage = (command) => {
  const input = heldInput();
  const q = query({ prompt: input.prompt, options: usageOptions(command) });
  return {
    usage: (opts) => q.usage_EXPERIMENTAL_MAY_CHANGE_DO_NOT_RELY_ON_THIS_API_YET(opts),
    close: async () => {
      input.release();
      await q.return(undefined);
    },
  };
};

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
 * What the SDK's usage answer says: the plan's limits and its subscription, no plan, a plan the usage service gave nothing for, or why it
 * cannot be read. Pure. The SDK resolves the control response's `response` — the usage itself — so this reads that and not the control
 * response around it, which only the SDK sees. A plan whose `rate_limits` are null is `unanswered`, as the SDK's type for this answer
 * says: "or null when unavailable".
 */
export function quotaOfUsage(usage: unknown): HarnessQuota {
  if (!isObject(usage)) return { kind: 'unknown', what: 'its response is not an object' };
  if (usage.rate_limits_available === false) return { kind: 'no-plan' };
  if (usage.rate_limits_available !== true) return { kind: 'unknown', what: 'it has no rate_limits_available' };
  if (usage.rate_limits === null) return { kind: 'unanswered', subscription: subscriptionOf(usage) };
  if (!isObject(usage.rate_limits)) return { kind: 'unknown', what: 'its rate_limits are not an object' };
  return { kind: 'windows', limits: limitsOf(usage.rate_limits), subscription: subscriptionOf(usage) };
}

/**
 * What an error the SDK throws carries of how it went: the class it names it, and a child's exit code or the signal that killed it,
 * each where there was one.
 */
type SdkError = { errorClass?: unknown; exitCode?: unknown; signal?: unknown; message?: unknown };

/** How the SDK joins a child's stderr to the message of a process that exited badly or was killed (read off 0.3.316, unchanged). */
const STDERR_TAIL = '. stderr: ';

/**
 * What Claude Code itself said, read off an SDK message: the last line of the stderr tail the SDK appends (`STDERR_TAIL`), or of the
 * message where it appended none — a control request Claude Code refused says its own words there, with no child to have failed.
 */
const saidIn = (message: string): string => {
  const at = message.indexOf(STDERR_TAIL);
  const tail = at < 0 ? message : message.slice(at + STDERR_TAIL.length);
  return tail.trim().split('\n').pop()?.trim() ?? '';
};

/**
 * Why an ask that threw has no answer. Claude Code refusing the question — a version whose control request this is not — is `unknown`,
 * in its own words; no Claude Code to ask is `missing`; anything else is `failed`, with the exit code or the signal the SDK read where
 * it read one, and what the child said on its stderr (`saidIn`).
 */
export function quotaOfRefusal(error: unknown): HarnessQuota {
  const { errorClass, exitCode, signal, message } = (isObject(error) ? error : {}) as SdkError;
  const said = saidIn(typeof message === 'string' ? message : String(error));
  if (errorClass === 'executable_not_found') return { kind: 'missing' };
  if (errorClass === 'control_request_failed') return { kind: 'unknown', what: `it refused the request (${said || 'no error given'})` };
  return {
    kind: 'failed',
    code: typeof exitCode === 'number' ? exitCode : null,
    signal: typeof signal === 'string' ? signal : null,
    said,
  };
}

/**
 * Ask Claude Code for the plan's usage: open a query for the question (`sdkUsageAsk`, or the `ask` given), put it, and read what it
 * answers (`quotaOfUsage`) or how it refused (`quotaOfRefusal`). The query is taken in the ask's scope and closed as it closes, whatever
 * ends it: an outcome, the timeout (`timeoutMs`, `QUOTA_TIMEOUT_MS` by default), or an interruption. Never fails: every way it can go is
 * a `HarnessQuota`, and no Claude Code to ask is `missing`.
 */
export const claudeQuota = ({
  command,
  timeoutMs = QUOTA_TIMEOUT_MS,
  ask = sdkUsageAsk,
}: { command?: string; timeoutMs?: number; ask?: OpenUsage } = {}): Effect.Effect<HarnessQuota> =>
  Effect.suspend(() =>
    Effect.acquireRelease(
      Effect.sync(() => ask(command)),
      (open) => Effect.promise(() => open.close().catch(() => undefined)),
    ).pipe(
      Effect.flatMap((open) =>
        Effect.tryPromise({ try: () => open.usage({ skipBehaviors: true }), catch: (cause) => cause }).pipe(
          Effect.match({ onSuccess: quotaOfUsage, onFailure: quotaOfRefusal }),
        ),
      ),
      Effect.scoped,
      Effect.timeoutOrElse({ duration: timeoutMs, orElse: () => Effect.succeed<HarnessQuota>({ kind: 'timeout', ms: timeoutMs }) }),
    ),
  );
