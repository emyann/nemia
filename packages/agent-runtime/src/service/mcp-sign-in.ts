/**
 * The engine's `mcpSignIn`, `mcpSignInState`, `mcpSignInCallback` and `mcpSignOut`: a remote MCP server signed in to from a page a
 * person holds open, and signed out of, on Claude Code (`harness/mcp-sign-in.ts`). None of them touches a task, and nothing of them is
 * journalled: the client secret a caller hands rides one `claude mcp add` child's environment and no record, and the address a person
 * pastes (`mcpSignInCallback`) is handed to the waiting session alone, never put in a refusal or a log.
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
import { verbHarnessOf, type HarnessDeclared } from '../harness/declaration.ts';
import { callbackRefusal, pastedOf, redirectOf, redirectUriOf, type CallbackRefusal } from '../harness/mcp-callback.ts';
import { mcpStateRefusal, type HarnessConfig } from './options.ts';
import { declaredOf } from './verb-harness.ts';

/**
 * Why a pasted callback completes no sign-in: no sign-in waits for the server (`none-waiting`), or the address is refused as
 * `callbackRefusal` says.
 */
export const CALLBACK_REFUSALS = ['none-waiting', 'unreadable', 'elsewhere', 'denied', 'no-code', 'no-state'] as const satisfies readonly (
  | 'none-waiting'
  | CallbackRefusal
)[];

/**
 * A sign-in or sign-out this engine will not make, and why. `held` says it is refused because a sign-in already waits on the callback
 * port — another's sign-in, or this server's own — which passes once that one settles or expires; every other refusal is the ask's own.
 * `callback` says why a pasted callback was refused (`mcpSignInCallback`), and is absent on every other refusal.
 */
export class McpSignInRefused extends Schema.TaggedError<McpSignInRefused>()('McpSignInRefused', {
  message: Schema.String,
  held: Schema.Boolean,
  callback: Schema.optionalKey(Schema.Literals(CALLBACK_REFUSALS)),
}) {}

/** The words of a refused callback for the server `name`, whose sign-in waits on `port`: each names what to paste instead. */
const callbackWords = (name: string, port: number, why: CallbackRefusal): string => {
  const redirect = redirectUriOf(port);
  switch (why) {
    case 'unreadable':
      return `what was pasted for \`${name}\` is no address. Paste the whole address your browser landed on after you approved, starting ${redirect}.`;
    case 'elsewhere':
      return `what was pasted for \`${name}\` is not the address its sign-in sends the browser back to. Paste the address your browser landed on after you approved, starting ${redirect}.`;
    case 'denied':
      return `the address pasted for \`${name}\` says the sign-in was refused at the provider. Sign in again, and approve the app there.`;
    case 'no-code':
      return `the address pasted for \`${name}\` carries no \`code\`. Paste the whole address your browser landed on after you approved, query included.`;
    case 'no-state':
      return `the address pasted for \`${name}\` carries no \`state\`. Paste the whole address your browser landed on after you approved, query included.`;
  }
};

/** The refusal of a callback pasted for `name` where no sign-in to it waits. */
const noneWaiting = (name: string): McpSignInRefused =>
  new McpSignInRefused({
    message: `no sign-in to \`${name}\` waits on this engine, so there is nothing to complete. Sign in again, approve in your browser, then paste the address it lands on.`,
    held: false,
    callback: 'none-waiting',
  });

/**
 * Why the address `url`, pasted for `name`, completes no sign-in, or `undefined` where it is handed on: no sign-in to `name` waits
 * (`port` undefined), or `callbackRefusal` refuses it against the redirect of the one waiting on `port`. The address is in no refusal.
 * The real verb and the stand-in's judge by this one function.
 */
export const callbackRefused = (name: string, port: number | undefined, url: string): McpSignInRefused | undefined => {
  if (port === undefined) return noneWaiting(name);
  const why = callbackRefusal(pastedOf(url), redirectOf(port));
  return why === undefined ? undefined : new McpSignInRefused({ message: callbackWords(name, port, why), held: false, callback: why });
};

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

/**
 * The folder, under the engine's root, a sign-in's `claude mcp add --scope local` files the server in, and its session runs in.
 * Exported only for the tests that import it.
 */
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
type SignInSeams = { readonly cli?: McpCli; readonly ask?: McpSignInAsk; readonly withinMs?: number };

/** The server a sign-in or sign-out may be asked of, or why not: a remote server with an OAuth client and a callback port. */
const signInRefusal = (name: unknown, server: unknown): string | undefined => {
  if (typeof name !== 'string' || !/^[\w-]+$/.test(name)) {
    return `takes a server's name, letters, digits, - and _; it was handed ${JSON.stringify(name)}.`;
  }
  const refused = mcpStateRefusal({ [name]: server });
  if (refused) return refused;
  const oauth = (server as RemoteMcpServer).oauth;
  if (oauth === undefined || typeof oauth.clientId !== 'string' || typeof oauth.callbackPort !== 'number') return noClient(name);
  return undefined;
};

/** Why the server `name` cannot be signed in to: it names no OAuth client with a callback port. */
const noClient = (name: string): string =>
  `\`${name}\` names no OAuth client with a callback port, and a sign-in is made through one. Give it \`oauth: { "clientId": "…", "callbackPort": 8791 }\`, as its app is registered.`;

/**
 * The callback ports this engine's sign-ins hold: a port is claimed by name before a sign-in's first child is spawned, and held by its
 * session once that is open, so two sign-ins asked at once never both listen there. `settle` lets a hold go once, saying how it ended.
 */
const portsHeld = (states: Map<string, McpSignInState>) => {
  const byPort = new Map<number, Held>();
  const claimed = new Map<number, string>();
  const waitsOn = (port: number) => {
    const held = byPort.get(port);
    if (held) return `a sign-in to \`${held.name}\` already waits on port ${port} until ${held.until}`;
    const starting = claimed.get(port);
    return starting === undefined ? undefined : `a sign-in to \`${starting}\` is being started on port ${port}`;
  };
  const portOf = (name: string) =>
    [...byPort.entries()].find(([, h]) => h.name === name)?.[0] ?? [...claimed.entries()].find(([, n]) => n === name)?.[0];
  const settle = (port: number, held: Held, state: McpSignInState) => {
    if (byPort.get(port) !== held) return;
    byPort.delete(port);
    held.session.end();
    states.set(held.name, state);
  };
  return { byPort, claimed, waitsOn, portOf, settle };
};

/** Why a sign-in verb is refused by an engine none of whose harnesses, `declared`, declares `mcp`: the harnesses it has. */
export const noSignInHarness = (declared: readonly HarnessDeclared[]): string =>
  `a sign-in is made inside a Claude Code session, and this engine runs no Claude Code harness. Its harnesses are: ${declared.map((h) => h.name).join(', ') || 'none'}.`;

/**
 * The four verbs over the harnesses this engine has, the hold of each waiting sign-in kept here by its callback port (`portsHeld`).
 * Each is refused, with nothing spawned, where no harness of the engine declares `mcp`: only Claude Code is measured to sign in
 * (`signsInMcp`), and Codex 0.154 hands GitHub no client secret.
 */
export const mcpSignInVerbsOf = (
  harnesses: Record<string, HarnessConfig>,
  root: string,
  executable: string | undefined,
  seams: SignInSeams = {},
) => {
  const states = new Map<string, McpSignInState>();
  const { byPort, claimed, waitsOn, portOf, settle } = portsHeld(states);
  const cwd = path.join(root, SIGN_IN_FOLDER);
  const withinMs = seams.withinMs ?? SIGN_IN_MS;
  const refuse = (message: string, held = false) => Effect.fail(new McpSignInRefused({ message, held }));
  const declared = declaredOf(harnesses);
  const noClaude = () => (verbHarnessOf('mcp', undefined, declared).kind === 'taken' ? undefined : noSignInHarness(declared));
  const cliOf = (): McpCli | string => {
    if (seams.cli) return seams.cli;
    const claude = claudeExecutableOf(executable);
    return claude === undefined
      ? "no Claude Code was found to run `claude mcp` with: the Agent SDK bundles none for this platform. Set the engine's `claudeExecutable`."
      : claudeCli(claude);
  };
  const opened = Effect.fnUntraced(function* (name: string, server: RemoteMcpServer, port: number, clientSecret?: string) {
    mkdirSync(cwd, { recursive: true });
    if (clientSecret !== undefined) {
      const cli = cliOf();
      if (typeof cli === 'string') return yield* refuse(cli);
      const why = yield* Effect.promise(() => storeClientSecret(cli, name, server, clientSecret, cwd));
      if (why) return yield* refuse(why);
    }
    const ask = seams.ask ?? claudeMcpSignIn;
    const session = yield* Effect.tryPromise({
      try: () => ask(name, server, { cwd, executable, redirectUri: redirectUriOf(port) }),
      catch: (e) => new McpSignInRefused({ message: `the harness gave no address to sign in at: ${(e as Error).message}`, held: false }),
    });
    const until = new Date(Date.now() + withinMs).toISOString();
    const held: Held = { name, session, until };
    byPort.set(port, held);
    states.set(name, { state: 'waiting', until });
    watched(held, withinMs, (state) => settle(port, held, state));
    return { authUrl: session.authUrl, until } satisfies McpSignInStarted;
  });

  const mcpSignIn = Effect.fnUntraced(function* (name: string, server: RemoteMcpServer, clientSecret?: string) {
    const refused = signInRefusal(name, server) ?? noClaude();
    const port = server.oauth?.callbackPort;
    if (refused || port === undefined) return yield* refuse(refused ?? noClient(name));
    const waiting = waitsOn(port);
    if (waiting) {
      return yield* refuse(
        `${waiting}, and the harness listens there for one at a time. Finish it in the browser, or ask again after then.`,
        true,
      );
    }
    claimed.set(port, name);
    return yield* opened(name, server, port, clientSecret).pipe(Effect.ensuring(Effect.sync(() => claimed.delete(port))));
  });

  const mcpSignInState = (name: string): Effect.Effect<McpSignInState> => Effect.sync(() => states.get(name) ?? { state: 'none' });

  const mcpSignOut = Effect.fnUntraced(function* (name: string, server: RemoteMcpServer) {
    const refused = signInRefusal(name, server) ?? noClaude();
    if (refused) return yield* refuse(refused);
    const port = portOf(name);
    if (port !== undefined) {
      return yield* refuse(
        `${waitsOn(port)}: there is nothing to sign out of yet. Finish it in the browser, or ask again after then.`,
        true,
      );
    }
    const cli = cliOf();
    if (typeof cli === 'string') return yield* refuse(cli);
    mkdirSync(cwd, { recursive: true });
    const why = yield* Effect.promise(() => clearSignIn(cli, name, server, cwd));
    if (why) return yield* refuse(why);
    states.delete(name);
    return { signedOut: true as const };
  });

  return { mcpSignIn, mcpSignInState, mcpSignInCallback: callbackVerbOf(byPort, states), mcpSignOut };
};

/**
 * The engine's `mcpSignInCallback` over the sign-ins held by port, `byPort`, and their states: the pasted `url` judged against the
 * redirect of the sign-in waiting for `name` (`callbackRefused`), then handed to its session, whose poll settles it as it would have
 * had the browser reached the port.
 */
const callbackVerbOf = (byPort: ReadonlyMap<number, Held>, states: ReadonlyMap<string, McpSignInState>) =>
  Effect.fnUntraced(function* (name: string, url: string) {
    const port = [...byPort.entries()].find(([, h]) => h.name === name)?.[0];
    const held = port === undefined ? undefined : byPort.get(port);
    const refused = callbackRefused(name, port, url);
    if (refused !== undefined || held === undefined) return yield* Effect.fail(refused ?? noneWaiting(name));
    yield* Effect.tryPromise({
      try: () => held.session.submit(url),
      catch: (e) =>
        new McpSignInRefused({
          message: `the harness did not take the address pasted for \`${name}\`: ${withoutUrl((e as Error).message, url)}. Sign in again.`,
          held: false,
        }),
    });
    return states.get(name) ?? ({ state: 'waiting', until: held.until } satisfies McpSignInState);
  });

/** `text` with every appearance of the pasted `url` taken out: its code and state are a sign-in's, and no refusal quotes them. */
const withoutUrl = (text: string, url: string): string => (url ? text.split(url).join('<the pasted address>') : text);
