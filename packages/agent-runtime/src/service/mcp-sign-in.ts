/**
 * The engine's `mcpSignIn`, `mcpSignInState`, `mcpSignInCallback` and `mcpSignOut`: a remote MCP server signed in to from a page a
 * person holds open, and signed out of. None of them touches a task, and nothing of them is journalled.
 *
 * A server signs in by one of two roads, chosen from what its provider advertises (`routeOf`): by a **code** the person types at the
 * provider (`device`, RFC 8628), which this engine polls for and then holds the token of (`mcp-token.ts`), handing it to each session
 * in the server's `Authorization` header; or by the **browser** (`browser`), Claude Code's own sign-in, whose redirect the person
 * pastes back when their browser runs elsewhere (`mcpSignInCallback`) and which Claude Code files in its own store
 * (`harness/mcp-sign-in.ts`). The token, the device code and a pasted address are in no refusal, no log and no journal.
 *
 * A sign-in is an interactive hold, in this engine's memory until the server reads `connected`, the person cancels it
 * (`mcpSignOut`) or its time passes: a device sign-in one per server name, a browser one per callback port, since the Claude Code
 * child itself listens on that port. Nothing reads the hold on a pass: an engine that restarts while the person is at the provider has
 * forgotten it, its state reads `none`, and they press Sign in again.
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
  type McpCli,
  type McpSignInAsk,
  type McpSignInSession,
} from '../harness/mcp-sign-in.ts';
import { deviceCodeOf, pollOnce, routeOf, type DeviceCode, type SignInRoute } from '../harness/mcp-device.ts';
import { dropToken, holdToken } from '../harness/mcp-token.ts';
import type { RemoteMcpServer } from '../harness/seam.ts';
import { verbHarnessOf, type HarnessDeclared } from '../harness/declaration.ts';
import { callbackRefusal, pastedOf, redirectOf, redirectUriOf, type CallbackRefusal } from '../harness/mcp-callback.ts';
import { mcpStateRefusal, type HarnessConfig } from './options.ts';
import { declaredOf } from './verb-harness.ts';

/**
 * Why a pasted callback completes no sign-in: no sign-in waits for the server (`none-waiting`), or the address is refused as
 * `callbackRefusal` says.
 */
const CALLBACK_REFUSALS = ['none-waiting', 'unreadable', 'elsewhere', 'denied', 'no-code', 'no-state'] as const satisfies readonly (
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
const callbackWords = (name: string, port: number, why: CallbackRefusal) => {
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
const noneWaiting = (name: string) =>
  new McpSignInRefused({
    message: `no sign-in to \`${name}\` waits on this engine, so there is nothing to complete. Sign in again, approve in your browser, then paste the address it lands on.`,
    held: false,
    callback: 'none-waiting',
  });

/**
 * Why the address `url`, pasted for `name`, completes no sign-in, or `undefined` where it is handed on: no sign-in to `name` waits
 * (`port` undefined), or `callbackRefusal` refuses it against the redirect of the one waiting on `port`. The address is in no refusal.
 * The real verb and the stand-in's judge by this one function.
 * @param name The name of the server the address was pasted for.
 * @param port The callback port of the sign-in waiting for `name`, or undefined where none waits.
 * @param url The address pasted.
 */
export const callbackRefused = (name: string, port: number | undefined, url: string) => {
  if (port === undefined) return noneWaiting(name);
  const why = callbackRefusal(pastedOf(url), redirectOf(port));
  return why === undefined ? undefined : new McpSignInRefused({ message: callbackWords(name, port, why), held: false, callback: why });
};

/**
 * What a sign-in answers at once, and what its state keeps while it waits: by a code, the code to type, the provider's page to type it
 * at, and when it stops being good (`device`); or by the browser, the address to open and when the sign-in stops waiting (`browser`).
 */
export type McpSignInStarted =
  | { readonly route: 'device'; readonly userCode: string; readonly verificationUri: string; readonly until: string }
  | { readonly route: 'browser'; readonly authUrl: string; readonly until: string };

/** The words of a sign-in's state, as this engine knows it: none asked, one waiting, or how the last one ended. */
export const SIGN_IN_STATES = ['none', 'waiting', 'connected', 'expired', 'failed'] as const;

/**
 * A server's sign-in as this engine holds it: its word, when a waiting one stops waiting, why a failed one failed, and, while one
 * waits, what it answered when it started (`started`), so a page opened later draws it again.
 */
export type McpSignInState = {
  readonly state: (typeof SIGN_IN_STATES)[number];
  readonly until?: string;
  readonly why?: string;
  readonly started?: McpSignInStarted;
};

/** How a sign-out ended: a waiting sign-in was `cancelled`, or what was held of a finished one was removed (`signed-out`). */
export type McpSignedOut = { readonly ended: 'cancelled' | 'signed-out' };

/**
 * The folder, under the engine's root, a sign-in's `claude mcp add --scope local` files the server in, and its session runs in.
 * Exported only for the tests that import it.
 */
export const SIGN_IN_FOLDER = 'mcp-sign-in';

type Held = { readonly name: string; readonly session: McpSignInSession; readonly until: string; readonly started: McpSignInStarted };

/** A sign-in by a code, waiting: ended by `abort`, which a cancel and a settle both fire. */
type DeviceHold = { readonly abort: AbortController; readonly started: McpSignInStarted };

/**
 * `held` watched until it settles: `connected` or `failed` as its session says, or `expired` once `withinMs` passes with neither.
 * Whichever comes first is said once; `settle` ignores a hold already let go.
 */
const watched = (held: Held, withinMs: number, settle: (state: McpSignInState) => void) => {
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

/**
 * The seams a test gives: in place of Claude Code, the CLI child and the held session; the sign-in's bound; in place of reading the
 * provider's metadata, the road; and `pace`, which scales every wait of a code's poll (1 by default), so a test waits a few
 * milliseconds for what the provider asks seconds for.
 */
type SignInSeams = {
  readonly cli?: McpCli;
  readonly ask?: McpSignInAsk;
  readonly withinMs?: number;
  readonly route?: (server: RemoteMcpServer) => Promise<SignInRoute>;
  readonly pace?: number;
};

/** The server a sign-in or sign-out may be asked of, or why not: a remote server with an OAuth client. */
const signInRefusal = (name: unknown, server: unknown) => {
  if (typeof name !== 'string' || !/^[\w-]+$/.test(name)) {
    return `takes a server's name, letters, digits, - and _; it was handed ${JSON.stringify(name)}.`;
  }
  const refused = mcpStateRefusal({ [name]: server });
  if (refused) return refused;
  const oauth = (server as RemoteMcpServer).oauth;
  if (oauth === undefined || typeof oauth.clientId !== 'string') return noClient(name);
  return undefined;
};

/** Why the server `name` cannot be signed in to: it names no OAuth client. */
const noClient = (name: string) =>
  `\`${name}\` names no OAuth client, and a sign-in is made through one. Give it \`oauth: { "clientId": "…" }\`, as its app is registered.`;

/** Why the server `name` cannot be signed in to by the browser: its provider offers no code, and it names no callback port. */
const noCallbackPort = (name: string) =>
  `\`${name}\` signs in by the browser, which needs a callback port, and it names none. Give it \`oauth: { "clientId": "…", "callbackPort": 8791 }\`, as its app is registered.`;

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
  const cancel = (port: number) => {
    const held = byPort.get(port);
    if (held === undefined) return;
    byPort.delete(port);
    held.session.end();
    states.delete(held.name);
  };
  return { byPort, claimed, waitsOn, portOf, settle, cancel };
};

/**
 * Why a sign-in verb is refused by an engine none of whose harnesses, `declared`, declares `mcp`: the harnesses it has.
 * @param declared The engine's harnesses, each with what it declares.
 */
export const noSignInHarness = (declared: readonly HarnessDeclared[]) =>
  `a sign-in is made inside a Claude Code session, and this engine runs no Claude Code harness. Its harnesses are: ${declared.map((h) => h.name).join(', ') || 'none'}.`;

/**
 * The four verbs over the harnesses this engine has, the hold of each waiting browser sign-in kept here by its callback port
 * (`portsHeld`) and of each waiting sign-in by a code by its server's name. Each is refused, with nothing spawned, where no harness of
 * the engine declares `mcp`: only Claude Code is measured to sign in (`signsInMcp`). The Claude Code each browser sign-in runs is found
 * at each ask (`claudeExecutableOf`): `executable`, else the one in `harnessBin`, else the SDK's bundled one, else the one on PATH.
 * @param harnesses The engine's harnesses, each by its name.
 * @param root The engine's store root, under which a sign-in's folder and the held tokens are.
 * @param executable The harness program a browser sign-in runs, or undefined to look for one.
 * @param seams What a test gives in place of the real program and the provider's metadata; none by default.
 * @param harnessBin The folder the harness's program is looked for in first, or undefined for none.
 */
export const mcpSignInVerbsOf = (
  harnesses: Record<string, HarnessConfig>,
  root: string,
  executable: string | undefined,
  seams: SignInSeams = {},
  harnessBin?: string,
) => {
  const states = new Map<string, McpSignInState>();
  const devices = new Map<string, DeviceHold>();
  const { byPort, claimed, waitsOn, portOf, settle, cancel } = portsHeld(states);
  const cwd = path.join(root, SIGN_IN_FOLDER);
  const withinMs = seams.withinMs ?? SIGN_IN_MS;
  const refuse = (message: string, held = false) => Effect.fail(new McpSignInRefused({ message, held }));
  const declared = declaredOf(harnesses);
  const noClaude = () => (verbHarnessOf('mcp', undefined, declared).kind === 'taken' ? undefined : noSignInHarness(declared));
  const cliOf = () => {
    if (seams.cli) return seams.cli satisfies McpCli | string;
    const claude = claudeExecutableOf(executable, harnessBin);
    return (
      claude === undefined
        ? "no Claude Code was found to run `claude mcp` with: none in the engine's `harnessBin`, none bundled by the Agent SDK for this platform and none on PATH. Put one at `<harnessBin>/claude`, or set the engine's `claudeExecutable`."
        : claudeCli(claude)
    ) satisfies McpCli | string;
  };
  const browser = Effect.fnUntraced(function* (name: string, server: RemoteMcpServer) {
    const port = server.oauth?.callbackPort;
    if (port === undefined) return yield* refuse(noCallbackPort(name));
    const waiting = waitsOn(port);
    if (waiting) {
      return yield* refuse(
        `${waiting}, and the harness listens there for one at a time. Finish it in the browser, cancel it, or ask again after then.`,
        true,
      );
    }
    claimed.set(port, name);
    return yield* Effect.gen(function* () {
      mkdirSync(cwd, { recursive: true });
      const ask = seams.ask ?? claudeMcpSignIn;
      const session = yield* Effect.tryPromise({
        try: () => ask(name, server, { cwd, executable: claudeExecutableOf(executable, harnessBin), redirectUri: redirectUriOf(port) }),
        catch: (e) => new McpSignInRefused({ message: `the harness gave no address to sign in at: ${(e as Error).message}`, held: false }),
      });
      const until = new Date(Date.now() + withinMs).toISOString();
      const started = { route: 'browser', authUrl: session.authUrl, until } satisfies McpSignInStarted;
      const held: Held = { name, session, until, started };
      byPort.set(port, held);
      states.set(name, { state: 'waiting', until, started });
      watched(held, withinMs, (state) => settle(port, held, state));
      return started;
    }).pipe(Effect.ensuring(Effect.sync(() => claimed.delete(port))));
  });

  const device = Effect.fnUntraced(function* (name: string, server: RemoteMcpServer, route: DeviceRoute, clientId: string) {
    const code = yield* Effect.tryPromise({
      try: () => deviceCodeOf(route.deviceAuthorizationEndpoint, clientId),
      catch: (e) => new McpSignInRefused({ message: `no code was given to sign in to \`${name}\` with: ${(e as Error).message}`, held: false }),
    });
    const until = new Date(Date.now() + code.expiresInSeconds * 1000).toISOString();
    const started = { route: 'device', userCode: code.userCode, verificationUri: code.verificationUri, until } satisfies McpSignInStarted;
    const hold: DeviceHold = { abort: new AbortController(), started };
    devices.set(name, hold);
    states.set(name, { state: 'waiting', until, started });
    const settleDevice = (state: McpSignInState) => {
      if (devices.get(name) !== hold) return;
      devices.delete(name);
      states.set(name, state);
    };
    void pollDevice({ ...code, ...route, clientId, server, root, name, signal: hold.abort.signal, pace: seams.pace ?? 1 }).then(
      (ended) => (ended === 'cancelled' ? undefined : settleDevice(ended)),
      (e: unknown) => settleDevice({ state: 'failed', why: (e as Error).message }),
    );
    return started;
  });

  const mcpSignIn = Effect.fnUntraced(function* (name: string, server: RemoteMcpServer) {
    const refused = signInRefusal(name, server) ?? noClaude();
    const clientId = server.oauth?.clientId;
    if (refused || clientId === undefined) return yield* refuse(refused ?? noClient(name));
    if (devices.has(name)) {
      return yield* refuse(`a sign-in to \`${name}\` already waits. Type its code at the provider, or cancel it and sign in again.`, true);
    }
    const route = yield* Effect.tryPromise({
      try: () => (seams.route ?? routeOf)(server),
      catch: (e) => new McpSignInRefused({ message: `the provider of \`${name}\` could not be asked how to sign in: ${(e as Error).message}`, held: false }),
    });
    return route.route === 'device' ? yield* device(name, server, route, clientId) : yield* browser(name, server);
  });

  const mcpSignInState = (name: string) => Effect.sync(() => states.get(name) ?? { state: 'none' }) satisfies Effect.Effect<McpSignInState>;

  const mcpSignOut = Effect.fnUntraced(function* (name: string, server: RemoteMcpServer) {
    const refused = signInRefusal(name, server) ?? noClaude();
    if (refused) return yield* refuse(refused);
    const hold = devices.get(name);
    if (hold !== undefined) {
      devices.delete(name);
      hold.abort.abort();
      states.delete(name);
      return { ended: 'cancelled' as const } satisfies McpSignedOut;
    }
    const port = portOf(name);
    if (port !== undefined) {
      if (byPort.has(port)) {
        cancel(port);
        return { ended: 'cancelled' as const } satisfies McpSignedOut;
      }
      return yield* refuse(`${waitsOn(port)}: it is being started. Ask again in a moment.`, true);
    }
    states.delete(name);
    if (dropToken(root, name, server)) return { ended: 'signed-out' as const } satisfies McpSignedOut;
    const cli = cliOf();
    if (typeof cli === 'string') return yield* refuse(cli);
    mkdirSync(cwd, { recursive: true });
    const why = yield* Effect.promise(() => clearSignIn(cli, name, server, cwd));
    if (why) return yield* refuse(why);
    return { ended: 'signed-out' as const } satisfies McpSignedOut;
  });

  return { mcpSignIn, mcpSignInState, mcpSignInCallback: callbackVerbOf(byPort, states), mcpSignOut };
};

/** The device road a provider advertised: the endpoint a code is asked at and the one it is polled at. */
type DeviceRoute = Extract<SignInRoute, { readonly route: 'device' }>;

/**
 * A sign-in by a code, polled until it ends: the token endpoint asked every `intervalSeconds` (5 s more after each `slow_down`), the
 * token held under `root` once the provider gives one (`holdToken`), and the sign-in ended `expired` at `expiresInSeconds`. Answers the
 * state it ended in, or `cancelled` where `signal` fired; a poll the network failed is asked again at the next interval. The wait is
 * `pace` times its length, 1 outside a test. No state it answers quotes a code or a token.
 */
const pollDevice = async (
  p: DeviceCode & DeviceRoute & { clientId: string; server: RemoteMcpServer; root: string; name: string; signal: AbortSignal; pace: number },
): Promise<McpSignInState | 'cancelled'> => {
  let waitMs = p.intervalSeconds * 1000 * p.pace;
  const endsAt = Date.now() + p.expiresInSeconds * 1000 * p.pace;
  while (!p.signal.aborted) {
    await new Promise<void>((resolve) => {
      const timer = setTimeout(resolve, waitMs);
      p.signal.addEventListener('abort', () => (clearTimeout(timer), resolve()), { once: true });
    });
    if (p.signal.aborted) return 'cancelled';
    if (Date.now() >= endsAt) return { state: 'expired', why: 'the code expired before it was typed. Sign in again for a new code.' };
    const polled = await pollOnce(p.tokenEndpoint, p.clientId, p.deviceCode).catch(() => undefined);
    if (p.signal.aborted) return 'cancelled';
    if (polled === undefined) continue;
    switch (polled.outcome) {
      case 'token':
        if (polled.grant === undefined) return { state: 'failed', why: 'the provider gave no token. Sign in again.' };
        holdToken(p.root, p.name, p.server, polled.grant, { tokenEndpoint: p.tokenEndpoint, clientId: p.clientId });
        return { state: 'connected' };
      case 'slow-down':
        waitMs += 5000 * p.pace;
        break;
      case 'expired':
        return { state: 'expired', why: 'the code expired before it was typed. Sign in again for a new code.' };
      case 'denied':
        return { state: 'failed', why: 'the sign-in was refused at the provider. Sign in again, and approve the app there.' };
      case 'failed':
        return { state: 'failed', why: 'the provider ended the sign-in. Sign in again.' };
      case 'wait':
        break;
    }
  }
  return 'cancelled';
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
const withoutUrl = (text: string, url: string) => (url ? text.split(url).join('<the pasted address>') : text);
