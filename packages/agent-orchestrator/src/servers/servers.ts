/**
 * A factory's MCP servers, as its record holds them: the shape of one, the refusals that keep a secret out of the store and a local
 * server out of a factory, and the split that gives a factory's server precedence over the checkout's `.mcp.json`.
 *
 * One entry per server, fenced per agent: a read-only or toolset variant of a server is a different wire identity and so a different
 * sign-in, so a factory keeps one entry and an agent's `allowedTools:`/`disallowedTools:` over `mcp__<server>__<tool>` names the tools
 * it may call. Pure; the file is `servers.store.ts`'s and the verbs `servers.verb.ts`'s.
 */
import { SERVER_NAME } from '../keys/index.ts';

/** The header a factory refuses to record by name: a person types no secret, and a server signs in instead. */
export const REFUSED_HEADER = 'authorization';

/**
 * One server a factory records: its wire facts — `type`, `url`, `headers` — and the facts of the OAuth client it signs in through,
 * never a secret. The wire facts are the server's identity to the harness, which files a sign-in under
 * `name|sha256({type,url,headers})[:16]`: changing any of them asks for a new sign-in, and `oauth`, which sits outside that hash, does
 * not.
 */
export type FactoryServer = {
  readonly type: 'http' | 'sse';
  readonly url: string;
  readonly headers?: Readonly<Record<string, string>>;
  readonly oauth?: { readonly clientId: string; readonly callbackPort?: number };
};

/** One server Nemia ships, as the board offers it for an add: its name, and the facts a factory would record of it. */
export type ShippedServer = FactoryServer & { readonly name: string };

/**
 * A factory's server record, as read and written (`servers.store.ts` decodes and writes the file): its servers by name, and every
 * other key the file held — one a newer tick wrote, which this one does not name and must not take away.
 */
export type FactoryServersFile = { readonly servers: FactoryServers; readonly [key: string]: unknown };

/** The record's servers by name, the shape a harness takes them in. */
export type FactoryServers = Readonly<Record<string, FactoryServer>>;

/**
 * Why `name` is no name for a factory's server, or `undefined`: the same name a `.mcp.json` keys one by (`SERVER_NAME`), since an
 * agent's `mcp:` line resolves a name against the record and the checkout's file alike, and one a session's tool names are built from
 * (`mcp__<name>__<tool>`).
 */
export const serverNameRefusal = (name: string): string | undefined => {
  if (!name) return "A server is named, and this name is empty. Give the name an agent's `mcp:` line will ask for.";
  if (SERVER_NAME.test(name)) return undefined;
  return `\`${name}\` is not a server's name: letters, digits, - and _ — github or local_docs, say.`;
};

/**
 * Why `server` cannot be recorded for a factory, as a sentence that says what to do, or `undefined`:
 *
 * - a local server, which a factory does not keep: a factory's servers are handed to every step's session of every run it starts, on
 *   this machine and on another, and a program to start belongs to the checkout that has it;
 * - an `Authorization` header, refused **by name**: it is the one header that is a credential, the record is a plain file read by
 *   anything that reads the store, and a server's own sign-in is the road for one. Every other header is free — the hosted GitHub
 *   server's toolsets are headers — and a header changed after a sign-in makes a new sign-in key, which the form says beside the
 *   field;
 * - a `url` that is no address, and a transport the harness does not load from one.
 *
 * The runtime refuses the rest of a server's shape where it is handed one (`mcpRefuses`): this is what a *factory's* record refuses
 * beyond that.
 */
export const factoryServerRefusal = (server: unknown): string | undefined => {
  if (typeof server !== 'object' || server === null || Array.isArray(server)) {
    return `A server is { "type": "http", "url": "https://…" }, with optional \`headers\` and \`oauth\`; this is ${JSON.stringify(server)}.`;
  }
  const s = server as Record<string, unknown>;
  if ('command' in s) {
    return "A factory records a remote server alone, and this one has a `command`: a factory's servers reach every step of every run it starts, on this machine and on another, and a program to start belongs to the checkout that has it. Declare it in the checkout's `.mcp.json` and name it on the agent's `mcp:` line, or give this one a `url`.";
  }
  if (typeof s.url !== 'string' || !/^https?:\/\/\S+$/.test(s.url)) {
    return `A server's \`url\` is the address it is reached at, like https://api.githubcopilot.com/mcp/; this is ${JSON.stringify(s.url)}.`;
  }
  if (s.type !== 'http' && s.type !== 'sse') {
    return `A server's transport is "http" or "sse", and the harness loads no server from a url without one; this is ${JSON.stringify(s.type)}. Give "type": "http".`;
  }
  const headers = s.headers;
  if (headers !== undefined) {
    if (
      typeof headers !== 'object' ||
      headers === null ||
      Array.isArray(headers) ||
      Object.values(headers).some((v) => typeof v !== 'string')
    ) {
      return `A server's \`headers\` are strings by name, like { "X-MCP-Toolsets": "actions,repos" }; this is ${JSON.stringify(headers)}.`;
    }
    const credential = Object.keys(headers).find((h) => h.toLowerCase() === REFUSED_HEADER);
    if (credential) {
      return `\`${credential}\` is a credential, and a factory's record is a plain file: nothing a person types enters it. A factory's server signs in instead — the sign-in writes the token into the harness's own store, where no run reads it — so take the header off and sign the server in. Every other header is kept, the toolset headers included.`;
    }
  }
  return undefined;
};

/** Why a whole record cannot be written, or `undefined`: the first name or server it refuses, in the record's order. */
export const factoryServersRefusal = (servers: Readonly<Record<string, unknown>>): string | undefined => {
  for (const [name, server] of Object.entries(servers)) {
    const bad = serverNameRefusal(name) ?? factoryServerRefusal(server);
    if (bad) return name ? `\`${name}\`: ${bad}` : bad;
  }
  return undefined;
};

/**
 * An agent's `mcp:` names split against the factory's record: those the **factory** supplies, as servers to hand the session, and
 * those left to the checkout's `.mcp.json`, as names.
 *
 * The factory comes first: a name it records is taken out of `projectMcp` altogether, which both gives the factory precedence and
 * keeps the runtime's existing "one would hide the other" refusal (`projectMcpRefusalOf`) untripped — a name on both lists would
 * otherwise refuse the step rather than resolve. A name the factory does not record resolves against the checkout exactly as it did,
 * and is still refused there when the file does not declare it.
 *
 * It hands a server on as the record holds it; the one producer of the bytes a harness sees (`mcpServerOf`) is applied once, by the
 * one reader of the record (`recordedServers`, `tick/told.verb.ts`), so a session is handed the same spelling a state read was: the
 * harness files a sign-in under those bytes, and two spellings are two servers to it. Pure.
 */
export const splitServers = (
  named: readonly string[] | undefined,
  record: FactoryServers | undefined,
): { mcp?: Record<string, FactoryServer>; checkout: string[] } => {
  if (!named?.length) return { checkout: [] };
  const mine = named.filter((name) => record !== undefined && Object.hasOwn(record, name));
  const checkout = named.filter((name) => !mine.includes(name));
  return { ...(mine.length ? { mcp: Object.fromEntries(mine.map((name) => [name, record![name]])) } : {}), checkout };
};
