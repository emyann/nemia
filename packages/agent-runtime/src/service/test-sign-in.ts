/** The stand-in's sign-in verbs (`testEngine`), in a file of their own: `test-engine.ts` is at its length. */
import { Effect } from 'effect';
import type { RemoteMcpServer } from '../harness/seam.ts';
import type { EngineShape } from './engine.ts';
import { callbackRefused, McpSignInRefused, type McpSignInStarted, type McpSignInState } from './mcp-sign-in.ts';
import { mcpStateRefusal } from './options.ts';

/**
 * The four sign-in verbs over a stand-in's memory, and the road each takes: by the browser where the server names a callback port,
 * by a code where it does not. Refused where the server has no OAuth client, or (`held`) where a sign-in to it still waits, or another
 * waits on its port, as the real verbs are. A sign-in answers a code or an address built from the client id and waits, its state
 * carrying what it answered (`started`), until a test settles it (`settleSignIn`) or a sign-out cancels it. A pasted callback is judged
 * as the real verb judges it (`callbackRefused`), and one handed on is recorded (`callbacks`) and leaves the sign-in waiting until a
 * test settles it, as the real one waits for its poll. It spawns nothing and stores nothing, so it refuses no engine for having no
 * Claude Code harness: that difference is declared on `APART`.
 */
export const signInHeld = () => {
  const states = new Map<string, McpSignInState>();
  const byPort = new Map<number, string>();
  const signIns: Array<{ readonly name: string; readonly route: McpSignInStarted['route'] }> = [];
  const signOuts: string[] = [];
  const callbacks: Array<{ readonly name: string; readonly url: string }> = [];
  const refuse = (message: string, held = false) => Effect.fail(new McpSignInRefused({ message, held }));
  const noClient = (name: string, server: RemoteMcpServer) => {
    const refused = mcpStateRefusal({ [name]: server });
    if (refused) return refused;
    return server.oauth === undefined ? `\`${name}\` names no OAuth client, and a sign-in is made through one.` : undefined;
  };
  const waiting = (name: string) => states.get(name)?.state === 'waiting';
  const verbs: Pick<EngineShape, 'mcpSignIn' | 'mcpSignInState' | 'mcpSignInCallback' | 'mcpSignOut'> = {
    mcpSignIn: (name, server) => {
      const refused = noClient(name, server);
      const oauth = server.oauth;
      if (refused || oauth === undefined) return refuse(refused ?? `\`${name}\` names no OAuth client.`);
      if (waiting(name)) return refuse(`a sign-in to \`${name}\` already waits.`, true);
      const port = oauth.callbackPort;
      const other = port === undefined ? undefined : byPort.get(port);
      if (port !== undefined && other !== undefined) return refuse(`a sign-in to \`${other}\` already waits on port ${port}.`, true);
      const until = new Date(Date.UTC(2026, 9, 22, 12, 5)).toISOString();
      const started: McpSignInStarted =
        port === undefined
          ? { route: 'device', userCode: 'WDJB-MJHT', verificationUri: 'https://github.com/login/device', until }
          : { route: 'browser', authUrl: `https://github.com/login/oauth/authorize?client_id=${oauth.clientId}&state=stand-in`, until };
      signIns.push({ name, route: started.route });
      if (port !== undefined) byPort.set(port, name);
      states.set(name, { state: 'waiting', until, started });
      return Effect.succeed(started);
    },
    mcpSignInState: (name) => Effect.sync(() => states.get(name) ?? { state: 'none' as const }),
    mcpSignInCallback: (name, url) => {
      const port = [...byPort.entries()].find(([, held]) => held === name)?.[0];
      const refused = callbackRefused(name, port, url);
      if (refused !== undefined) return Effect.fail(refused);
      callbacks.push({ name, url });
      return Effect.sync(() => states.get(name) ?? { state: 'none' as const });
    },
    mcpSignOut: (name, server) => {
      const refused = noClient(name, server);
      if (refused) return refuse(refused);
      signOuts.push(name);
      const cancelled = waiting(name);
      for (const [port, held] of byPort) if (held === name) byPort.delete(port);
      states.delete(name);
      return Effect.succeed({ ended: cancelled ? ('cancelled' as const) : ('signed-out' as const) });
    },
  };
  const settleSignIn = (name: string, state: McpSignInState) => {
    for (const [port, held] of byPort) if (held === name) byPort.delete(port);
    states.set(name, state);
  };
  return { verbs, read: { signIns, signOuts, callbacks, settleSignIn } };
};
