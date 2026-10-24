/** The stand-in's sign-in verbs (`testEngine`), in a file of their own: `test-engine.ts` is at its length. */
import { Effect } from 'effect';
import type { RemoteMcpServer } from '../harness/seam.ts';
import type { EngineShape } from './engine.ts';
import { McpSignInRefused, type McpSignInState } from './mcp-sign-in.ts';
import { mcpStateRefusal } from './options.ts';

/**
 * The three sign-in verbs over a stand-in's memory: refused where the server has no OAuth client with a callback port, or (`held`)
 * where a sign-in still waits on the port, as the real verbs are; a sign-in answers an address built from the client id and waits until
 * a test settles it (`settleSignIn`). It spawns nothing and stores nothing, so it refuses no engine for having no Claude Code harness:
 * that difference is declared on `APART`.
 */
export const signInHeld = () => {
  const states = new Map<string, McpSignInState>();
  const byPort = new Map<number, string>();
  const signIns: Array<{ readonly name: string; readonly secret: boolean }> = [];
  const signOuts: string[] = [];
  const refuse = (message: string, held = false) => Effect.fail(new McpSignInRefused({ message, held }));
  const noPort = (name: string) => `\`${name}\` names no OAuth client with a callback port, and a sign-in is made through one.`;
  const noClient = (name: string, server: RemoteMcpServer) => {
    const refused = mcpStateRefusal({ [name]: server });
    if (refused) return refused;
    return server.oauth?.callbackPort === undefined ? noPort(name) : undefined;
  };
  const verbs: Pick<EngineShape, 'mcpSignIn' | 'mcpSignInState' | 'mcpSignOut'> = {
    mcpSignIn: (name, server, clientSecret) => {
      const refused = noClient(name, server);
      const oauth = server.oauth;
      const port = oauth?.callbackPort;
      if (refused || oauth === undefined || port === undefined) return refuse(refused ?? noPort(name));
      const other = byPort.get(port);
      if (other !== undefined) return refuse(`a sign-in to \`${other}\` already waits on port ${port}.`, true);
      signIns.push({ name, secret: clientSecret !== undefined });
      byPort.set(port, name);
      const until = new Date(Date.UTC(2026, 9, 22, 12, 5)).toISOString();
      states.set(name, { state: 'waiting', until });
      return Effect.succeed({
        authUrl: `https://github.com/login/oauth/authorize?client_id=${oauth.clientId}&state=stand-in`,
        until,
      });
    },
    mcpSignInState: (name) => Effect.sync(() => states.get(name) ?? { state: 'none' as const }),
    mcpSignOut: (name, server) => {
      const refused = noClient(name, server);
      if (refused) return refuse(refused);
      if ([...byPort.values()].includes(name)) return refuse(`a sign-in to \`${name}\` waits: there is nothing to sign out of yet.`, true);
      signOuts.push(name);
      states.delete(name);
      return Effect.succeed({ signedOut: true as const });
    },
  };
  const settleSignIn = (name: string, state: McpSignInState) => {
    for (const [port, held] of byPort) if (held === name) byPort.delete(port);
    states.set(name, state);
  };
  return { verbs, read: { signIns, signOuts, settleSignIn } };
};
