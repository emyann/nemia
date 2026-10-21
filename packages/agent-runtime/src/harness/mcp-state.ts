/**
 * What a harness says of the MCP servers it was handed: the other half of `mcp.ts`, which is about the config handed in.
 *
 * `mcpServerStatus()` is a method on the Agent SDK's `query()` object (`sdk.d.ts:2775`), so a state can be read only from inside a
 * session. The read opens one short-lived Claude Code session with **every** server of a record inline (`mcpServerOf`, the one
 * producer, so the bytes judged here are the bytes a task's own session will run), asks it once, and ends it. Its input is a stream
 * nothing is ever pushed on, so no turn begins and the read costs no token — a CLI spawn of seconds, and nothing else.
 *
 * One session for a whole record, never one per server: a record of six servers is one spawn. And a read that failed is **not** an
 * absence (`observeFor`, `UNREAD`): it answers that the look failed and why, never an empty list, which a caller would read as "this
 * record holds no server" and a reader would draw as nothing at all.
 */
import { query, type McpServerStatus, type Options } from '@anthropic-ai/claude-agent-sdk';
import { mcpServerOf } from './mcp.ts';
import type { RemoteMcpServer } from './seam.ts';
import { withoutTelemetry } from './telemetry.ts';

/** The five words a harness has for a server's state, as the SDK reports them (`sdk.d.ts:1127-1166`), carried and never re-worded. */
export const MCP_STATES = ['connected', 'needs-auth', 'failed', 'pending', 'disabled'] as const;

/** One server's state, as the harness says it: its words, how many tools it offers while connected, and its error while failed. */
export type McpServerState = {
  readonly name: string;
  readonly status: (typeof MCP_STATES)[number];
  readonly tools?: number;
  readonly error?: string;
};

/**
 * What a read of a record's states answers: the state of each server the harness reported, or that the look failed and why. Never an
 * empty list for a record that holds servers — an absence read off a failed look is not an absence.
 */
export type McpServersRead =
  | { readonly read: true; readonly servers: readonly McpServerState[] }
  | { readonly read: false; readonly why: string };

/** How long a whole read may take before the look is called failed and the session ended: six servers at the SDK's 5 s connect each. */
export const MCP_STATE_MS = 45_000;

/**
 * The one ask of a harness this file makes, as a seam: a session opened with `servers` inline, its MCP states, its end. A test gives
 * its own and counts the sessions opened; `claudeMcpStatus` is the real one.
 */
export type McpStatusAsk = (
  servers: Record<string, RemoteMcpServer>,
  cwd: string,
  executable?: string,
) => Promise<readonly McpServerStatus[]>;

/**
 * The real ask: one `query()` in this process, the servers on `Options.mcpServers` and nothing else loaded
 * (`Options.strictMcpConfig`), no setting source, so neither the owner's own servers nor the checkout's `.mcp.json` join the answer
 * and what comes back is the record's servers alone. The session runs with the owner's default Claude Code configuration — which is
 * what makes a sign-in made here the sign-in a task's own session finds — and its telemetry is taken out, as every child the runtime
 * starts has it taken out.
 *
 * Its prompt is a stream that yields nothing and is closed only after the states are read: a turn begins when a word is pushed, and
 * none ever is.
 */
export const claudeMcpStatus: McpStatusAsk = async (servers, cwd, executable) => {
  const abort = new AbortController();
  let close = () => {};
  const held = (async function* () {
    await new Promise<void>((resolve) => {
      close = resolve;
    });
  })();
  const options: Options = {
    cwd,
    abortController: abort,
    settingSources: [],
    strictMcpConfig: true,
    mcpServers: servers as NonNullable<Options['mcpServers']>,
    env: withoutTelemetry(process.env) as NodeJS.ProcessEnv,
    ...(executable === undefined ? {} : { pathToClaudeCodeExecutable: executable }),
  };
  const q = query({ prompt: held, options });
  try {
    return await q.mcpServerStatus();
  } finally {
    close();
    abort.abort();
  }
};

/** Why a record is no record of remote servers to read the state of, as a sentence that says what to do, or `undefined`. */
export const mcpStateRefusal = (servers: unknown): string | undefined => {
  if (typeof servers !== 'object' || servers === null || Array.isArray(servers)) {
    return `takes a map of remote MCP servers by name, as a record holds them; it was handed ${JSON.stringify(servers)}. Give { "<name>": { "type": "http", "url": "https://..." } }.`;
  }
  const names = Object.keys(servers);
  if (!names.length) {
    return 'takes at least one server, and was handed none: a state is read of the servers a record holds. Ask it of a record that holds one, or do not ask.';
  }
  for (const name of names) {
    const server = (servers as Record<string, unknown>)[name];
    if (typeof server !== 'object' || server === null || !('url' in server)) {
      return `\`${name}\` is not a remote server, and a state is read of one alone: a server the harness starts has no connection to report. Give it a \`url\`, or take it off the ask.`;
    }
  }
  return undefined;
};

/** `tools` and `error` as a state carries them: each left out where the harness said none, never filled with a 0 that reads as a fact. */
const saidOf = (s: McpServerStatus): Omit<McpServerState, 'name' | 'status'> => ({
  ...(s.tools === undefined ? {} : { tools: s.tools.length }),
  ...(s.error === undefined || s.error === '' ? {} : { error: s.error }),
});

/**
 * The state of each server of `servers`, read in one session (`how.ask`, the real one by default, `how.withinMs` its bound): every server of the record named once,
 * in the record's own order, with what the harness said of it — and a server the harness named not at all left `pending`, since it
 * was handed and has reported nothing.
 *
 * A look that failed answers `{ read: false, why }`, naming what to type: a task whose server's state could not be read is filed, not refused.
 * A state word the harness does not have — an SDK that grew a sixth — is carried as a failed look rather than re-worded, so no caller
 * reads an unknown word as `connected`.
 */
export const mcpServersRead = async (
  servers: Record<string, RemoteMcpServer>,
  cwd: string,
  how: { ask?: McpStatusAsk; executable?: string; withinMs?: number } = {},
): Promise<McpServersRead> => {
  const { ask = claudeMcpStatus, executable, withinMs = MCP_STATE_MS } = how;
  const handed = Object.fromEntries(Object.entries(servers).map(([name, s]) => [name, mcpServerOf(s)]));
  let said: readonly McpServerStatus[];
  try {
    said = await Promise.race([
      ask(handed, cwd, executable),
      new Promise<never>((_, reject) =>
        setTimeout(
          () =>
            reject(
              new Error(
                `the session read no state within ${withinMs / 1000}s (the harness takes up to 5s to connect each server). Read it again; a server that is unreachable makes every read slow.`,
              ),
            ),
          withinMs,
        ).unref(),
      ),
    ]);
  } catch (e) {
    return { read: false, why: `the state of ${Object.keys(servers).length} server(s) could not be read: ${(e as Error).message}` };
  }
  const by = new Map(said.map((s) => [s.name, s]));
  const odd = said.find((s) => !(MCP_STATES as readonly string[]).includes(s.status));
  if (odd) {
    return {
      read: false,
      why: `the harness said \`${odd.name}\` is "${odd.status}", which is no state this runtime knows (${MCP_STATES.join(', ')}): a newer Claude Code grew one. Read ${'`sdk.d.ts`'} and add it to MCP_STATES in src/harness/mcp-state.ts.`,
    };
  }
  return {
    read: true,
    servers: Object.keys(servers).map((name) => {
      const s = by.get(name);
      return s ? { name, status: s.status as McpServerState['status'], ...saidOf(s) } : { name, status: 'pending' as const };
    }),
  };
};
