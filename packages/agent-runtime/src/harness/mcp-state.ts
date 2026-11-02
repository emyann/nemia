/**
 * What a harness says of the MCP servers it was handed: the other half of `mcp.ts`, which is about the config handed in.
 *
 * `mcpServerStatus()` is a method on the Agent SDK's `query()` object (`sdk.d.ts:3117`), so a state can be read only from inside a
 * session. A session's first answer can be `pending`, since MCP startup is not blocking (measured 0.3.308), and this read makes
 * exactly one ask: it carries whatever that answer said. A settled word is a second read's — the page presses Check again for one —
 * and `MCP_STATE_MS` gives a server no time to settle: it is a deadline that ends the session, as its own refusal says by naming the
 * read again as the fix.
 *
 * The read opens one short-lived Claude Code session with **every** server of a record inline (`mcpServerOf`, the one
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

/**
 * The five words a harness has for a server's state, as the SDK reports them (`sdk.d.ts:1280-1334`), carried and never re-worded.
 * Re-read on SDK 0.3.308 and unchanged; `McpServerStatus` carries `config`, `scope` and `source` beside them, which nobody here reads
 * (`docs/harness.md`, *The MCP sign-in affordances*).
 */
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
 *
 * `stop` is how the caller's bound ends it: an ask that is still waiting when the read's time is up is aborted on that signal, and
 * ends its session there and then. An ask that ignores it leaves a session behind, which is what the bound exists to prevent.
 */
export type McpStatusAsk = (
  servers: Record<string, RemoteMcpServer>,
  cwd: string,
  executable: string | undefined,
  stop: AbortSignal,
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
 *
 * `end` is the session's end — the held prompt released and the SDK's own controller aborted, so the child goes — and it is safe to
 * call twice: it runs on the caller's `stop` and again when the ask returns, whichever comes first.
 */
export const claudeMcpStatus: McpStatusAsk = async (servers, cwd, executable, stop) => {
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
    mcpServers: servers,
    env: withoutTelemetry(process.env),
    ...(executable === undefined ? {} : { pathToClaudeCodeExecutable: executable }),
  };
  const end = () => {
    close();
    abort.abort();
  };
  stop.addEventListener('abort', end, { once: true });
  const q = query({ prompt: held, options });
  try {
    return await q.mcpServerStatus();
  } finally {
    stop.removeEventListener('abort', end);
    end();
  }
};

/**
 * Whether the harness `harness` files a sign-in for a remote MCP server — so a server of its task that reports `needs-auth` is a
 * session that will reach no tool of it — read off the harness's name, as its trust of a folder is (`folderTrust`). `undefined` is
 * the default harness, which is one.
 *
 * True for the one that runs Claude Code (`claude`), which files a sign-in under `name|sha256({type,url,headers})[:16]` in its own store
 * and finds it again from any session handed the same bytes. False for every other: nothing of Codex's sign-in has been measured — not
 * whether it has one, not where it would file it — and a remote A2A agent loads the servers its own operator configured. A caller that
 * stops a task on `needs-auth` stops it for the harnesses this answers true for and no other.
 */
export const signsInMcp = (harness: string | undefined): boolean => harness === undefined || harness === 'claude';

/** `tools` and `error` as a state carries them: each left out where the harness said none, never filled with a 0 that reads as a fact. */
const saidOf = (s: McpServerStatus): Omit<McpServerState, 'name' | 'status'> => ({
  ...(s.tools === undefined ? {} : { tools: s.tools.length }),
  ...(s.error === undefined || s.error === '' ? {} : { error: s.error }),
});

/**
 * The state of each server of `servers`, read in one session (`how.ask`, the real one by default, `how.withinMs` its bound): every
 * server of the record named once, in the record's own order, with what the harness said of it — and a server the harness named not at
 * all left `pending`, since it was handed and has reported nothing.
 *
 * A look that failed answers `{ read: false, why }`, naming what to type: a task whose server's state could not be read is filed, not
 * refused.
 * A state word the harness does not have — an SDK that grew a sixth — is carried as a failed look rather than re-worded, so no caller
 * reads an unknown word as `connected`.
 *
 * The bound ends the ask as well as the wait: losing a `Promise.race` does not stop what lost it, so the ask is handed an
 * `AbortSignal` the bound fires. Without it the session a hanging server made slow would be left running — one more child per tick
 * pass and per page read — which is the thing the bound exists to prevent.
 */
export const mcpServersRead = async (
  servers: Record<string, RemoteMcpServer>,
  cwd: string,
  how: { ask?: McpStatusAsk; executable?: string; withinMs?: number } = {},
): Promise<McpServersRead> => {
  const { ask = claudeMcpStatus, executable, withinMs = MCP_STATE_MS } = how;
  const handed = Object.fromEntries(Object.entries(servers).map(([name, s]) => [name, mcpServerOf(s)]));
  const stop = new AbortController();
  let timer: ReturnType<typeof setTimeout> | undefined;
  let said: readonly McpServerStatus[];
  try {
    said = await Promise.race([
      ask(handed, cwd, executable, stop.signal),
      new Promise<never>((_, reject) => {
        timer = setTimeout(
          () =>
            reject(
              new Error(
                `the session read no state within ${withinMs / 1000}s (the harness takes up to 5s to connect each server). Read it again; a server that is unreachable makes every read slow.`,
              ),
            ),
          withinMs,
        );
        timer.unref();
      }),
    ]);
  } catch (e) {
    stop.abort();
    return { read: false, why: `the state of ${Object.keys(servers).length} server(s) could not be read: ${(e as Error).message}` };
  } finally {
    if (timer !== undefined) clearTimeout(timer);
  }
  const by = new Map(said.map((s) => [s.name, s]));
  const odd = said.find((s) => !(MCP_STATES as readonly string[]).includes(s.status));
  if (odd) {
    return {
      read: false,
      why: `the harness said \`${odd.name}\` is "${odd.status}", which is no state this runtime knows (${MCP_STATES.join(', ')}): a newer harness grew one. Read \`sdk.d.ts\` and add it to MCP_STATES in src/harness/mcp-state.ts.`,
    };
  }
  return {
    read: true,
    servers: Object.keys(servers).map((name) => {
      const s = by.get(name);
      return s ? { name, status: s.status, ...saidOf(s) } : { name, status: 'pending' as const };
    }),
  };
};
