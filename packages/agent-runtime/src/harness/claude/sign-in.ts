/**
 * Whether Claude Code is signed in on this machine, asked before a job's spawn (`claudePrepare`, `code.ts`): `<claude> auth status`,
 * which Claude Code documents as printing JSON with `loggedIn` and exiting 0 when logged in, 1 when not (`docs/harness.md`,
 * *`claude auth status`*). Signed out, or with no answer within its bound, the spawn is refused, so the attempt ends `unstartable`
 * before anything runs, in words naming the command that makes the machine's credential.
 *
 * What it cannot see: a credential that is there but no longer works. Measured at 2.1.322, a placeholder `CLAUDE_CODE_OAUTH_TOKEN` reads
 * `loggedIn: true`; a token expired, revoked or mistyped passes the check, and fails at the session's first request, in Claude Code's
 * words, as before.
 *
 * The judgement of one ask is `claudeSignInOf`, proved by `contracts/claude-sign-in.contract.ts`; the ask and its words are the shell
 * around it.
 */
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { Option, Schema } from 'effect';
import type { ClaudeSignInOf } from '../../../contracts/claude-sign-in.contract.ts';
import type { SpawnRequest } from '../seam.ts';
import { withoutTelemetry } from '../telemetry.ts';
import { quote, WORDS_QUOTE } from '../../core/quote.ts';
import { claudeExecutableOf } from '../mcp-sign-in.ts';
import { CLAUDE_SIGN_IN } from './vocabulary.ts';

/** One ask of `claude auth status`, as its child ended. */
export type ClaudeSignInAsk =
  | { readonly kind: 'exited'; readonly code: number; readonly loggedIn: boolean | undefined }
  | { readonly kind: 'timed-out' }
  | { readonly kind: 'not-run' };

/** What the ask says of the machine's sign-in. */
export type ClaudeSignIn = 'signed-in' | 'signed-out' | 'timed-out' | 'unknown';

/** How long `claude auth status` is given to answer before the spawn is refused for want of an answer (`claudeSignedOutRefusal`). */
export const CLAUDE_SIGN_IN_MS = 15_000;

/**
 * What `claude auth status` prints on its stdout, as far as it is read: `loggedIn`, and the `authMethod` the words quote. Other keys are
 * left unread.
 */
const AuthStatusSchema = Schema.Struct({ loggedIn: Schema.Boolean, authMethod: Schema.optional(Schema.String) });

/** What `auth status` printed, as far as it is read. */
export type AuthStatus = typeof AuthStatusSchema.Type;

const decodeStatus = Schema.decodeUnknownOption(AuthStatusSchema);

/** The answer `stdout` carries, or `undefined` where it is not JSON of that shape: unread, never read as signed out. */
export const authStatusOf = (stdout: string): AuthStatus | undefined => {
  let parsed: unknown;
  try {
    parsed = JSON.parse(stdout);
  } catch {
    return undefined;
  }
  return Option.getOrUndefined(decodeStatus(parsed));
};

/** What one ask's end says of the sign-in: the exit and the JSON as Claude Code documents them. */
export const claudeSignInOf: ClaudeSignInOf = (ask) => {
  if (ask.kind === 'timed-out') return 'timed-out';
  if (ask.kind === 'not-run') return 'unknown';
  if (ask.loggedIn === false) return 'signed-out';
  if (ask.code === 0) return 'signed-in';
  if (ask.code === 1 && ask.loggedIn === undefined) return 'signed-out';
  return 'unknown';
};

/**
 * How a Claude Code at `executable` is started: a script under this runtime's node, a binary as it is — the rule the Agent SDK starts
 * `pathToClaudeCodeExecutable` by, so the ask runs the Claude Code the session would.
 */
export const claudeLaunch = (executable: string): { cmd: string; args: string[] } =>
  ['.js', '.mjs', '.ts', '.tsx', '.jsx'].includes(path.extname(executable))
    ? { cmd: process.execPath, args: [executable] }
    : { cmd: executable, args: [] };

/** One ask, as its child ended, with what its stdout said. */
type Asked = { ask: ClaudeSignInAsk; status: AuthStatus | undefined };

/** One ask of `<executable> auth status` in `cwd`, under `env`, bounded by `ms`. */
const askedIn = (executable: string, cwd: string | undefined, env: NodeJS.ProcessEnv, ms: number): Asked => {
  const { cmd, args } = claudeLaunch(executable);
  const ran = spawnSync(cmd, [...args, 'auth', 'status'], { cwd, encoding: 'utf8', timeout: ms, env });
  if (ran.error !== undefined && 'code' in ran.error && ran.error.code === 'ETIMEDOUT')
    return { ask: { kind: 'timed-out' }, status: undefined };
  if (ran.error !== undefined || ran.status === null) return { ask: { kind: 'not-run' }, status: undefined };
  const status = authStatusOf(ran.stdout ?? '');
  return { ask: { kind: 'exited', code: ran.status, loggedIn: status?.loggedIn }, status };
};

/**
 * Asks `<executable> auth status` in the session's working root and environment — the engine's, less its telemetry, under the task's
 * own `config.env`, where a token given to the session is — as the user the engine runs as, bounded by `ms`.
 */
const askClaudeSignIn = (executable: string, r: SpawnRequest, ms: number): Asked =>
  askedIn(executable, r.cwd, { ...withoutTelemetry(process.env), ...r.config?.env }, ms);

/**
 * Whether Claude Code is signed in on this machine under `env` (less its telemetry), by `auth status` as a job's spawn asks it: the
 * Claude Code `AE_CLAUDE_EXECUTABLE` names, else the SDK's bundled one, `unknown` where none is found or it does not start. What a
 * caller that is no session reads, to say whether a session would start; as the spawn's ask, it cannot see a credential that no longer
 * works.
 */
export const claudeSignIn = (env: NodeJS.ProcessEnv, ms: number = CLAUDE_SIGN_IN_MS, cwd?: string): ClaudeSignIn => {
  const claude = claudeExecutableOf(env.AE_CLAUDE_EXECUTABLE ?? process.env.AE_CLAUDE_EXECUTABLE);
  return claude === undefined ? 'unknown' : claudeSignInOf(askedIn(claude, cwd, withoutTelemetry(env), ms).ask);
};

/**
 * Why Claude Code cannot start the session `r` because this machine is not signed in, or `undefined`. The Claude Code asked is the one
 * the session would run: `executable` (the engine's), else `AE_CLAUDE_EXECUTABLE`, else the SDK's bundled one; with none found, or one
 * that does not start or answers neither way, nothing is refused, and the spawn fails in its own words as before. An ask with no
 * answer within `ms` refuses, saying so: the sign-in is unknown, and a Claude Code that hangs would hang the session too.
 */
export const claudeSignedOutRefusal = (
  r: SpawnRequest,
  executable: string | undefined,
  ms: number = CLAUDE_SIGN_IN_MS,
): string | undefined => {
  const claude = claudeExecutableOf(executable ?? process.env.AE_CLAUDE_EXECUTABLE);
  if (claude === undefined) return undefined;
  const { ask, status } = askClaudeSignIn(claude, r, ms);
  const judged = claudeSignInOf(ask);
  const signIn = `Make a token with \`${CLAUDE_SIGN_IN.maker}\` and give it to the engine as \`${CLAUDE_SIGN_IN.variable}\`, which it reads when it starts, or sign in with \`${CLAUDE_SIGN_IN.login}\`, as the user the engine runs as; then try again.`;
  if (judged === 'signed-out') {
    const said =
      status?.authMethod !== undefined
        ? `says \`loggedIn: false\` (\`authMethod: ${quote(status.authMethod, WORDS_QUOTE)}\`)`
        : ask.kind === 'exited'
          ? `exited ${ask.code}`
          : 'says not logged in';
    return `Claude Code is not signed in on this machine: \`claude auth status\` ${said}. ${signIn}`;
  }
  if (judged === 'timed-out') {
    return `Claude Code's sign-in is unknown: \`claude auth status\` did not answer within ${ms} ms. Run it as the user the engine runs as to see why it hangs; if it says not logged in, ${signIn.charAt(0).toLowerCase()}${signIn.slice(1)}`;
  }
  return undefined;
};
