/**
 * A remote MCP server signed in to, and signed out of, on Claude Code: the harness half of a sign-in a person makes from a page.
 *
 * Measured on Claude Code 2.1.308 and the Agent SDK 0.3.308 (`docs/harness.md`, *The MCP sign-in affordances*):
 *
 * - Claude Code reads an OAuth app's client secret from its own store alone, filed under `name|sha256({type,url,headers})[:16]`, and
 *   only `claude mcp add … --client-secret` writes it there, reading the value from `MCP_CLIENT_SECRET`. `--scope local` files it
 *   under the same key an inline session computes, and adds the server to the one folder the child ran in, so the owner's own
 *   sessions in their own checkouts do not gain it.
 * - `claude mcp remove --scope local <name>` deletes both the stored secret and the stored token under that key: a later session handed
 *   the same bytes finds no sign-in, which is what a sign-out is. It finds the key only through a server added under the name: a remove
 *   of one never added exits 1 and leaves the token, so a sign-out adds the server first, with no secret.
 * - `query().mcpAuthenticate(name, redirectUri)` answers an authorize URL, and the Claude Code child itself listens on the callback
 *   port until the browser's redirect arrives or the session ends; `mcpServerStatus()` then reads `connected`.
 *
 * The secret rides the child's environment alone: never its argv, never a task's config (which is journalled), and a refusal quoting
 * the child's output has it taken out first.
 */
import { spawn } from 'node:child_process';
import { createRequire } from 'node:module';
import path from 'node:path';
import { query, type Options } from '@anthropic-ai/claude-agent-sdk';
import { mcpServerOf } from './mcp.ts';
import type { RemoteMcpServer } from './seam.ts';
import { withoutTelemetry } from './telemetry.ts';

/** How long a sign-in waits for the person to approve in their browser before its session is ended and the sign-in is `expired`. */
export const SIGN_IN_MS = 300_000;

/** How often a held sign-in reads its server's state while it waits for `connected`. */
export const SIGN_IN_POLL_MS = 1_000;

/** What a `claude mcp` child said: its exit code, and its output and error output together. */
export type CliRun = { readonly code: number | null; readonly out: string };

/**
 * The one CLI ask of this file, as a seam: `claude <args>` run in `cwd` with `env`. A test gives its own and reads the argv and the
 * environment it was handed; `claudeCli` is the real one.
 */
export type McpCli = (args: readonly string[], how: { readonly cwd: string; readonly env: NodeJS.ProcessEnv }) => Promise<CliRun>;

/** How long one `claude mcp` child may take before it is killed and its ask failed. */
const CLI_MS = 60_000;

/** The real CLI: `executable` spawned with no shell, its output gathered, killed at `CLI_MS`. */
export const claudeCli =
  (executable: string): McpCli =>
  (args, { cwd, env }) =>
    new Promise((resolve) => {
      const child = spawn(executable, [...args], { cwd, env, stdio: ['ignore', 'pipe', 'pipe'], timeout: CLI_MS });
      let out = '';
      child.stdout.on('data', (b: Buffer) => (out += b.toString()));
      child.stderr.on('data', (b: Buffer) => (out += b.toString()));
      child.on('error', (e) => resolve({ code: null, out: `${out}${e.message}` }));
      child.on('close', (code) => resolve({ code, out }));
    });

/**
 * The Claude Code a `claude mcp` child runs: the engine's own (`EngineOptions.claudeExecutable`), else the one the Agent SDK bundles
 * for this platform, `@anthropic-ai/claude-agent-sdk-<platform>-<arch>/claude`, resolved as the SDK resolves it — the same Claude
 * Code a held session runs, so the key it files a secret under is the key that session computes. `undefined` where neither is there.
 */
export const claudeExecutableOf = (executable: string | undefined): string | undefined => {
  if (executable !== undefined) return executable;
  try {
    const sdk = createRequire(import.meta.url).resolve('@anthropic-ai/claude-agent-sdk');
    const bundled = createRequire(sdk).resolve(`@anthropic-ai/claude-agent-sdk-${process.platform}-${process.arch}/package.json`);
    return path.join(path.dirname(bundled), process.platform === 'win32' ? 'claude.exe' : 'claude');
  } catch {
    return undefined;
  }
};

/** `text` with every appearance of `secret` taken out, so no refusal quotes it. */
const withoutSecret = (text: string, secret: string): string => (secret ? text.split(secret).join('<secret>') : text);

/**
 * The argv of `claude mcp add` for `server` under `name`, as `mcpServerOf` hands its bytes — the headers in its order, which is the
 * order the key is computed over — with `--client-secret` given no value: the CLI reads it from `MCP_CLIENT_SECRET`. The headers come
 * before the other options, never last: `--header` takes many values, and would read the name as one more header (measured). With
 * `secret` false, `--client-secret` is left out: the add a sign-out makes stores no secret.
 */
export const mcpAddArgs = (name: string, server: RemoteMcpServer, secret = true): string[] => {
  const s = mcpServerOf(server);
  return [
    'mcp',
    'add',
    '--scope',
    'local',
    '--transport',
    s.type,
    ...Object.entries(s.headers ?? {}).flatMap(([k, v]) => ['--header', `${k}: ${v}`]),
    ...(s.oauth === undefined ? [] : ['--client-id', s.oauth.clientId, ...(secret ? ['--client-secret'] : [])]),
    ...(s.oauth?.callbackPort === undefined ? [] : ['--callback-port', String(s.oauth.callbackPort)]),
    name,
    s.url,
  ];
};

/**
 * The client secret of `server`'s OAuth app stored in Claude Code's own store, under the key a session handed the same bytes finds:
 * `claude mcp remove --scope local` first (an earlier add under the name is refused by the CLI, and its exit is no failure), then
 * `claude mcp add --scope local … --client-secret` with the secret in `MCP_CLIENT_SECRET` alone. Answers why it failed, with the
 * secret taken out of the CLI's words, or `undefined`.
 */
export const storeClientSecret = async (
  cli: McpCli,
  name: string,
  server: RemoteMcpServer,
  secret: string,
  cwd: string,
): Promise<string | undefined> => {
  const env = withoutTelemetry(process.env);
  await cli(['mcp', 'remove', '--scope', 'local', name], { cwd, env });
  const added = await cli(mcpAddArgs(name, server), { cwd, env: { ...env, MCP_CLIENT_SECRET: secret } });
  if (added.code === 0) return undefined;
  return `\`claude mcp add\` did not store the client secret of \`${name}\` (exit ${added.code}): ${withoutSecret(added.out.trim(), secret)}`;
};

/**
 * `name`'s sign-in cleared from Claude Code's store, in the folder a sign-in adds it in: `claude mcp add --scope local` with no secret,
 * then `claude mcp remove --scope local <name>`, which deletes the token and any secret under its key (measured). The add comes first
 * because a remove finds the key only through a server added under the name, and a sign-in handed no secret added none; where one is
 * already added the CLI refuses the second add, which is no failure. Answers why the remove failed, or `undefined`.
 */
export const clearSignIn = async (cli: McpCli, name: string, server: RemoteMcpServer, cwd: string): Promise<string | undefined> => {
  const env = withoutTelemetry(process.env);
  await cli(mcpAddArgs(name, server, false), { cwd, env });
  const removed = await cli(['mcp', 'remove', '--scope', 'local', name], { cwd, env });
  if (removed.code === 0) return undefined;
  return `\`claude mcp remove\` did not clear the sign-in of \`${name}\` (exit ${removed.code}): ${removed.out.trim()}. Read its words, then sign out again.`;
};

/** How a held sign-in ended: the server read `connected`, or `failed` with why. */
export type SignInSettled = { readonly connected: true } | { readonly connected: false; readonly why: string };

/** A sign-in's session, held: the address the person opens, what it settles on, and its end, safe to call twice. */
export type McpSignInSession = {
  readonly authUrl: string;
  readonly settled: Promise<SignInSettled>;
  readonly end: () => void;
};

/**
 * The session ask of a sign-in, as a seam: a session opened with `name`'s server inline, asked to authenticate it against
 * `redirectUri`, and held until it settles or is ended. A test gives its own; `claudeMcpSignIn` is the real one.
 */
export type McpSignInAsk = (
  name: string,
  server: RemoteMcpServer,
  how: { readonly cwd: string; readonly executable: string | undefined; readonly redirectUri: string },
) => Promise<McpSignInSession>;

/**
 * The SDK's authenticate method, which `sdk.mjs` 0.3.308 defines on `query()`'s object (`mcpAuthenticate(e,t)`, a control request of the
 * subtype mcp_authenticate) and `sdk.d.ts` does not declare: called through this one type, so an SDK that renames it fails here, by name.
 */
type Authenticating = {
  mcpAuthenticate?: (name: string, redirectUri: string) => Promise<{ authUrl?: string }>;
};

/**
 * The real ask: one `query()` configured as a state read's (`claudeMcpStatus`: the server inline and nothing else, no setting source,
 * no turn ever begun), `mcpAuthenticate` asked for the address, then `mcpServerStatus()` (`sdk.d.ts`) read every `SIGN_IN_POLL_MS`
 * until the server reads `connected` or `failed`, or the session is ended. The Claude Code child listens on the callback port itself.
 */
export const claudeMcpSignIn: McpSignInAsk = async (name, server, { cwd, executable, redirectUri }) => {
  const abort = new AbortController();
  let close = () => {};
  const held: AsyncIterable<never> = {
    [Symbol.asyncIterator]: () => ({
      next: async () => {
        await new Promise<void>((resolve) => {
          close = resolve;
        });
        return { done: true as const, value: undefined as never };
      },
    }),
  };
  const options: Options = {
    cwd,
    abortController: abort,
    settingSources: [],
    strictMcpConfig: true,
    mcpServers: { [name]: mcpServerOf(server) },
    env: withoutTelemetry(process.env),
    ...(executable === undefined ? {} : { pathToClaudeCodeExecutable: executable }),
  };
  const end = () => {
    close();
    abort.abort();
  };
  const q = query({ prompt: held, options });
  const authenticate = (q as unknown as Authenticating).mcpAuthenticate;
  if (typeof authenticate !== 'function') {
    end();
    throw new Error(
      'this Agent SDK has no `mcpAuthenticate` on its query object, which 0.3.308 had. Read its sdk.mjs and change harness/mcp-sign-in.ts.',
    );
  }
  let authUrl: string | undefined;
  try {
    authUrl = (await authenticate.call(q, name, redirectUri)).authUrl;
  } catch (e) {
    end();
    throw e;
  }
  if (typeof authUrl !== 'string' || !authUrl) {
    end();
    throw new Error(`the harness answered no address to sign in to \`${name}\` at: it may be signed in already. Check its state again.`);
  }
  const settled = (async (): Promise<SignInSettled> => {
    while (!abort.signal.aborted) {
      await new Promise((r) => setTimeout(r, SIGN_IN_POLL_MS).unref());
      if (abort.signal.aborted) break;
      const states = await q.mcpServerStatus().catch(() => []);
      const s = states.find((x) => x.name === name);
      if (s?.status === 'connected') return { connected: true };
      if (s?.status === 'failed') return { connected: false, why: s.error ?? 'the harness said the server failed' };
    }
    return { connected: false, why: 'the sign-in was ended before the server read connected' };
  })();
  return { authUrl, settled, end };
};
