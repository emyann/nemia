/**
 * The engine's `mcpSignIn`, `mcpSignInState` and `mcpSignOut`: a remote MCP server signed in to from a page a person holds open, and
 * signed out of, on Claude Code (`harness/mcp-sign-in.ts`). None of them touches a task, and nothing of them is journalled: the client
 * secret a caller hands rides one `claude mcp add` child's environment and no record.
 *
 * A sign-in is an interactive hold: its session lives in this engine's memory until the server reads `connected` or `SIGN_IN_MS`
 * passes, one per callback port, since the Claude Code child itself listens on that port. Nothing reads the hold on a pass: an engine
 * that restarts while the person is in their browser has forgotten it, and they press Sign in again.
 */
import { mkdirSync } from 'node:fs';
import path from 'node:path';
import { Effect, Schema } from 'effect';
import {
  claudeCli,
  claudeExecutableOf,
  claudeMcpSignIn,
  clearSignIn,
  SIGN_IN_MS,
  storeClientSecret,
  type McpCli,
  type McpSignInAsk,
  type McpSignInSession,
} from '../harness/mcp-sign-in.ts';
import type { RemoteMcpServer } from '../harness/seam.ts';
import { heldHarnessesOf, mcpStateRefusal, type HarnessConfig } from './options.ts';

/**
 * A sign-in or sign-out this engine will not make, and why. `held` says it is refused because a sign-in already waits on the callback
 * port — another's sign-in, or this server's own — which passes once that one settles or expires; every other refusal is the ask's own.
 */
export class McpSignInRefused extends Schema.TaggedError<McpSignInRefused>()('McpSignInRefused', {
  message: Schema.String,
  held: Schema.Boolean,
}) {}

/** What a sign-in answers at once: the address the person opens, and when the sign-in stops waiting for them. */
export type McpSignInStarted = { readonly authUrl: string; readonly until: string };

/** The words of a sign-in's state, as this engine knows it: none asked, one waiting, or how the last one ended. */
export const SIGN_IN_STATES = ['none', 'waiting', 'connected', 'expired', 'failed'] as const;

/** A server's sign-in as this engine holds it: its word, when a waiting one stops waiting, and why a failed one failed. */
export type McpSignInState = {
  readonly state: (typeof SIGN_IN_STATES)[number];
  readonly until?: string;
  readonly why?: string;
};

/** The folder, under the engine's root, a sign-in's `claude mcp add --scope local` files the server in, and its session runs in. */
export const SIGN_IN_FOLDER = 'mcp-sign-in';

type Held = { readonly name: string; readonly session: McpSignInSession; readonly until: string };

/**
 * `held` watched until it settles: `connected` or `failed` as its session says, or `expired` once `withinMs` passes with neither.
 * Whichever comes first is said once; `settle` ignores a hold already let go.
 */
const watched = (held: Held, withinMs: number, settle: (state: McpSignInState) => void): void => {
  const timer = setTimeout(() => settle({ state: 'expired', why: `no sign-in was approved by ${held.until}` }), withinMs);
  timer.unref();
  void held.session.settled.then(
    (s) => {
      clearTimeout(timer);
      settle(s.connected ? { state: 'connected' } : { state: 'failed', why: s.why });
    },
    (e: unknown) => {
      clearTimeout(timer);
      settle({ state: 'failed', why: (e as Error).message });
    },
  );
};

/** The seams a test gives in place of Claude Code: the CLI child, the held session, and the sign-in's bound. */
export type SignInSeams = { readonly cli?: McpCli; readonly ask?: McpSignInAsk; readonly withinMs?: number };

/** The server a sign-in or sign-out may be asked of, or why not: a remote server with an OAuth client and a callback port. */
const signInRefusal = (name: unknown, server: unknown): string | undefined => {
  if (typeof name !== 'string' || !/^[\w-]+$/.test(name)) {
    return `takes a server's name, letters, digits, - and _; it was handed ${JSON.stringify(name)}.`;
  }
  const refused = mcpStateRefusal({ [name]: server });
  if (refused) return refused;
  const oauth = (server as RemoteMcpServer).oauth;
  if (oauth === undefined || typeof oauth.clientId !== 'string' || typeof oauth.callbackPort !== 'number') {
    return `\`${name}\` names no OAuth client with a callback port, and a sign-in is made through one. Give it \`oauth: { "clientId": "…", "callbackPort": 8791 }\`, as its app is registered.`;
  }
  return undefined;
};

/**
 * The three verbs over the harnesses this engine has, the hold of each waiting sign-in kept here by its callback port. Each is refused,
 * with nothing spawned, where the engine runs no Claude Code harness: only Claude Code is measured to sign in (`signsInMcp`), and Codex
 * 0.154 hands GitHub no client secret.
 */
export const mcpSignInVerbsOf = (
  harnesses: Record<string, HarnessConfig>,
  root: string,
  executable: string | undefined,
  seams: SignInSeams = {},
) => {
  const byPort = new Map<number, Held>();
  const states = new Map<string, McpSignInState>();
  const cwd = path.join(root, SIGN_IN_FOLDER);
  const withinMs = seams.withinMs ?? SIGN_IN_MS;
  const refuse = (message: string, held = false) => Effect.fail(new McpSignInRefused({ message, held }));
  const noClaude = () =>
    heldHarnessesOf(harnesses).length
      ? undefined
      : `a sign-in is made inside a Claude Code session, and this engine runs no Claude Code harness. Its harnesses are: ${Object.keys(harnesses).join(', ') || 'none'}.`;
  const cliOf = (): McpCli | string => {
    if (seams.cli) return seams.cli;
    const claude = claudeExecutableOf(executable);
    return claude === undefined
      ? "no Claude Code was found to run `claude mcp` with: the Agent SDK bundles none for this platform. Set the engine's `claudeExecutable`."
      : claudeCli(claude);
  };
  const heldBy = (name: string) => [...byPort.entries()].find(([, h]) => h.name === name);
  const settle = (port: number, held: Held, state: McpSignInState) => {
    if (byPort.get(port) !== held) return;
    byPort.delete(port);
    held.session.end();
    states.set(held.name, state);
  };

  const mcpSignIn = Effect.fnUntraced(function* (name: string, server: RemoteMcpServer, clientSecret?: string) {
    const refused = signInRefusal(name, server) ?? noClaude();
    if (refused) return yield* refuse(refused);
    const port = server.oauth!.callbackPort!;
    const other = byPort.get(port);
    if (other) {
      return yield* refuse(
        `a sign-in to \`${other.name}\` already waits on port ${port} until ${other.until}, and the harness listens there for one at a time. Finish it in the browser, or ask again after then.`,
        true,
      );
    }
    mkdirSync(cwd, { recursive: true });
    if (clientSecret !== undefined) {
      const cli = cliOf();
      if (typeof cli === 'string') return yield* refuse(cli);
      const why = yield* Effect.promise(() => storeClientSecret(cli, name, server, clientSecret, cwd));
      if (why) return yield* refuse(why);
    }
    const ask = seams.ask ?? claudeMcpSignIn;
    const session = yield* Effect.tryPromise({
      try: () => ask(name, server, { cwd, executable, redirectUri: `http://localhost:${port}/callback` }),
      catch: (e) => new McpSignInRefused({ message: `the harness gave no address to sign in at: ${(e as Error).message}`, held: false }),
    });
    const until = new Date(Date.now() + withinMs).toISOString();
    const held: Held = { name, session, until };
    byPort.set(port, held);
    states.set(name, { state: 'waiting', until });
    watched(held, withinMs, (state) => settle(port, held, state));
    return { authUrl: session.authUrl, until } satisfies McpSignInStarted;
  });

  const mcpSignInState = (name: string): Effect.Effect<McpSignInState> => Effect.sync(() => states.get(name) ?? { state: 'none' });

  const mcpSignOut = Effect.fnUntraced(function* (name: string, server: RemoteMcpServer) {
    const refused = signInRefusal(name, server) ?? noClaude();
    if (refused) return yield* refuse(refused);
    const waiting = heldBy(name);
    if (waiting) {
      return yield* refuse(
        `a sign-in to \`${name}\` waits on port ${waiting[0]} until ${waiting[1].until}: there is nothing to sign out of yet. Finish it in the browser, or ask again after then.`,
        true,
      );
    }
    const cli = cliOf();
    if (typeof cli === 'string') return yield* refuse(cli);
    mkdirSync(cwd, { recursive: true });
    const why = yield* Effect.promise(() => clearSignIn(cli, name, cwd));
    if (why) return yield* refuse(why);
    states.delete(name);
    return { signedOut: true as const };
  });

  return { mcpSignIn, mcpSignInState, mcpSignOut };
};
