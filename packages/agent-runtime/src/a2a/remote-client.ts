/**
 * The connection to a remote A2A agent: its card read and held to the address's origin, the interface chosen, the auth its
 * requirements ask of each request, and the SDK's client over a `fetch` that bounds every request and follows no redirect.
 * `remote.ts` speaks the session verbs over it.
 */
import type { AgentCard, AgentInterface, SecurityScheme } from '@a2a-js/sdk';
import {
  type Client,
  ClientFactory,
  createAuthenticatingFetchWithRetry,
  JsonRpcTransportFactory,
  RestTransportFactory,
} from '@a2a-js/sdk/client';
import { firstOf, quote, WORDS_QUOTE } from '../core/index.ts';
import { cardOfJson, SCHEME_KINDS } from './card.ts';
import { AuthRefused, Late, messageOf, Redirected, Refusal } from './said.ts';

/**
 * A remote A2A agent, as a harness is configured: the agent's base URL, whose card is read from
 * `.well-known/agent-card.json` beneath its path (`https://a.example/reviewer` reads
 * `https://a.example/reviewer/.well-known/agent-card.json`), or at the URL itself when it names a `.json` file; or the
 * card itself, as the JSON the agent would serve. Its secrets are not here: the engine's `credentials` gives each when a
 * request needs it.
 */
export type RemoteAgent = { url: string } | { card: Record<string, unknown> };

/**
 * The secret for one of a card's security schemes, by its name on the card, for the agent at `agentUrl` — the URL the
 * harness was given, on whose origin every request goes, or for an agent given by its card the interface's URL;
 * `undefined` when there is none.
 */
export type Credentials = (scheme: string, agentUrl: string, harness: string) => string | undefined;

/**
 * The words a spawn is refused in when `credentials` gives no secret for `scheme`: what a caller that keeps its secrets
 * somewhere of its own says to do, say which variable to set. Absent, the refusal says to give `Engine.layer` a
 * `credentials` that answers for the scheme.
 */
export type MissingCredential = (scheme: string, agentUrl: string, harness: string) => string;

/** Where the card of an agent given by `address` is read: the address itself when it names a `.json` file, else beneath its path. */
export const cardUrlOf = (address: string): URL => {
  const url = new URL(address);
  if (url.pathname.endsWith('.json')) return url;
  if (!url.pathname.endsWith('/')) url.pathname = `${url.pathname}/`;
  return new URL('.well-known/agent-card.json', url);
};

/** An address as its words show it: origin and path, never the query, which can carry a key (as the api's `remoteOf` shows one). */
const shownUrl = (u: string | URL | Request): string => {
  const url = new URL(u instanceof Request ? u.url : u);
  return `${url.origin}${url.pathname}`;
};

/** The bindings this runtime speaks, as a card names them: gRPC is not one. */
const SPOKEN = ['JSONRPC', 'HTTP+JSON'];
const SPOKEN_WORDS = 'JSON-RPC (`JSONRPC`) and REST (`HTTP+JSON`), at A2A 1.0';

/** The card's interfaces that this runtime speaks, in the card's order. */
const spokenOf = (card: AgentCard): AgentInterface[] =>
  card.supportedInterfaces.filter((i) => SPOKEN.includes(i.protocolBinding.toUpperCase()) && !i.protocolVersion.startsWith('0.'));

const originOf = (url: string): string | undefined => (URL.canParse(url) ? new URL(url).origin : undefined);

/** The headers a card's requirements ask for, as the caller's secrets meet them — or why none can be met. */
export type Auth = { headers: Record<string, string> } | { refusal: string };

/**
 * One scheme's header, or why it cannot be sent. An OAuth 2 or OpenID Connect scheme is sent as a bearer token that
 * `credentials` gives: the runtime runs no OAuth flow.
 */
const headerOf = (
  name: string,
  scheme: SecurityScheme | undefined,
  secret: () => string | undefined,
  missing: () => string | undefined,
): [string, string] | string => {
  name = quote(name);
  if (!scheme) return `\`${name}\` is not a scheme the card declares`;
  const s = scheme.scheme;
  if (!s || !SCHEME_KINDS.includes(s.$case)) return `\`${name}\` is a kind of scheme this runtime does not know, and cannot send`;
  const needed = (header: string, value: (secret: string) => string): [string, string] | string => {
    const given = secret();
    return given === undefined || given === ''
      ? `\`${name}\` needs a secret, and \`credentials\` gave none: ${missing() ?? `give \`Engine.layer\` a \`credentials\` that answers for \`${name}\``}`
      : [header, value(given)];
  };
  switch (s.$case) {
    case 'httpAuthSecurityScheme': {
      const kind = s.value.scheme.toLowerCase();
      if (kind === 'bearer') return needed('authorization', (t) => `Bearer ${t}`);
      if (kind === 'basic') return needed('authorization', (t) => `Basic ${Buffer.from(t).toString('base64')}`);
      return `\`${name}\` is HTTP \`${quote(s.value.scheme)}\` authentication, and this runtime sends only \`Bearer\` and \`Basic\``;
    }
    case 'oauth2SecurityScheme':
    case 'openIdConnectSecurityScheme':
      return needed('authorization', (t) => `Bearer ${t}`);
    case 'apiKeySecurityScheme':
      return s.value.location.toLowerCase() === 'header'
        ? needed(s.value.name.toLowerCase(), (t) => t)
        : `\`${name}\` is an API key in a ${quote(s.value.location) || 'place the card does not name'}, and this runtime sends a key only in a header, where no log of the address holds it`;
    case 'mtlsSecurityScheme':
      return `\`${name}\` is mutual TLS, and this runtime holds no client certificate`;
  }
};

/** What the card's requirements ask of each request: the first requirement the secrets meet whole, else why none is met. */
export const authOf = (
  card: AgentCard,
  agentUrl: string,
  harness: string,
  credentials: Credentials | undefined,
  missing?: MissingCredential,
): Auth => {
  if (!card.securityRequirements.length) return { headers: {} };
  const why: string[] = [];
  for (const requirement of card.securityRequirements) {
    const headers: Record<string, string> = {};
    const unmet: string[] = [];
    for (const name of Object.keys(requirement.schemes)) {
      const h = headerOf(
        name,
        card.securitySchemes[name],
        () => credentials?.(name, agentUrl, harness),
        () => missing?.(name, agentUrl, harness),
      );
      if (typeof h === 'string') unmet.push(h);
      else headers[h[0]] = h[1];
    }
    if (!unmet.length) return { headers };
    why.push(firstOf(unmet, ', and '));
  }
  return {
    refusal: `the agent at ${agentUrl} asks for authentication this runtime cannot give: ${firstOf(why, '; or ')}. Nothing was sent.`,
  };
};

/**
 * The card `read` gave, or a refusal in words: `what` names the card, its first wrong field follows, then `then`, and that nothing
 * was sent.
 */
const taken = (read: { card: AgentCard } | { wrong: string }, what: string, then = ''): AgentCard => {
  if ('wrong' in read) throw new Refusal(`${what}: ${read.wrong}. ${then ? `${then} nothing` : 'Nothing'} was sent.`);
  return read.card;
};

/** The card an agent answered for at `at`, or a refusal that names it by its origin and path: nothing is sent past one. */
const servedCard = async (at: URL, response: Response): Promise<AgentCard> => {
  if (!response.ok)
    throw new Refusal(
      `the agent's card could not be read at ${shownUrl(at)}: it answered ${response.status} ${quote(response.statusText, WORDS_QUOTE)}, and nothing was sent.`,
    );
  const json: unknown = await response.json().catch(() => undefined);
  if (typeof json !== 'object' || json === null)
    throw new Refusal(`what ${shownUrl(at)} serves is not an agent card, and nothing was sent.`);
  return taken(
    cardOfJson(json),
    `what ${shownUrl(at)} serves is not an A2A 1.0 agent card this runtime reads`,
    "The agent's operator serves the card;",
  );
};

/** A `fetch` whose every request has its bound. */
type Bounded = (input: string | URL | Request, init?: RequestInit) => Promise<Response>;

/** The signals a connection's calls carry: a send's (`sends`), and a subscription's (`follows`). */
type Signals = { sends: WeakSet<AbortSignal>; follows: WeakSet<AbortSignal> };

/**
 * `fetch(input, init)` with its headers bounded by `ms` and its body by nothing: a subscription's stream lasts as long as the Task it
 * follows.
 */
const headersBounded = async (input: string | URL | Request, init: RequestInit & { signal: AbortSignal }, ms: number) => {
  const bound = new AbortController();
  const timer = setTimeout(() => bound.abort(), ms);
  try {
    return await fetch(input, { ...init, signal: AbortSignal.any([init.signal, bound.signal]) });
  } catch (e) {
    if (bound.signal.aborted) throw new Late(`${shownUrl(input)} did not answer within ${ms / 1000} s`);
    throw e;
  } finally {
    clearTimeout(timer);
  }
};

/**
 * A `fetch` that bounds each request by `requestMs`, a send's (a signal in `sends`) by `sendMs`, a subscription's (a signal in
 * `follows`) only until its headers come, by `requestMs`, and fails one not answered in time as `Late`, naming its origin and path.
 */
const boundedOf =
  (requestMs: number, sendMs: number, { sends, follows }: Signals): Bounded =>
  async (input, init = {}) => {
    if (init.signal && follows.has(init.signal)) return headersBounded(input, { ...init, signal: init.signal }, requestMs);
    const ms = init.signal && sends.has(init.signal) ? sendMs : requestMs;
    const bound = AbortSignal.timeout(ms);
    try {
      return await fetch(input, { ...init, signal: init.signal ? AbortSignal.any([init.signal, bound]) : bound });
    } catch (e) {
      if (bound.aborted) throw new Late(`${shownUrl(input)} did not answer within ${ms / 1000} s`);
      throw e;
    }
  };

/** The agent's card: the one it was given, or the one its address serves, read through `bounded`; a refusal where it cannot be read. */
const readCard = async (agent: RemoteAgent, bounded: Bounded): Promise<AgentCard> => {
  if (!('url' in agent)) return taken(cardOfJson(agent.card), 'its `card` is not an A2A 1.0 agent card this runtime reads');
  const at = cardUrlOf(agent.url);
  let response: Response;
  try {
    response = await bounded(at, { headers: { accept: 'application/json' } });
  } catch (e) {
    throw new Refusal(
      `the agent's card could not be read at ${shownUrl(at)} (${quote(messageOf((e as Error).cause ?? e), WORDS_QUOTE)}): the agent is not reachable, and nothing was sent.`,
    );
  }
  return servedCard(at, response);
};

/**
 * The interface the client speaks: for an agent given by `address`, the first spoken one on its origin, else the card's first
 * spoken one; a refusal where none is.
 */
const chosenOf = (card: AgentCard, address: string | undefined): AgentInterface => {
  const spoken = spokenOf(card);
  const chosen = address ? spoken.find((i) => originOf(i.url) === new URL(address).origin) : spoken[0];
  if (chosen) return chosen;
  if (address && spoken.length) {
    throw new Refusal(
      `the agent's card names ${quote(spoken.map((i) => i.url).join(', '), WORDS_QUOTE)}, and none is on ${new URL(address).origin}, the origin the harness was given: a request, and any secret it carries, goes only there. Give the harness the agent's own address, or its card as \`card\`. Nothing was sent.`,
    );
  }
  const offered = card.supportedInterfaces.map((i) => `${i.protocolBinding}${i.protocolVersion ? ` ${i.protocolVersion}` : ''}`);
  throw new Refusal(
    `the agent's card offers ${offered.length ? quote(offered.join(', '), WORDS_QUOTE) : 'no interface'}, and this runtime speaks ${SPOKEN_WORDS}; gRPC is not spoken yet. Serve one of those on the agent. Nothing was sent.`,
  );
};

/** The `fetch` the SDK's client is given: `bounded`, no redirect followed, an auth refused said as one, the headers `auth` asks. */
const clientFetchOf = (bounded: Bounded, auth: () => Auth) =>
  createAuthenticatingFetchWithRetry(
    async (input, init) => {
      const response = await bounded(input, { ...init, redirect: 'manual' });
      if (response.status >= 300 && response.status < 400) {
        throw new Redirected(
          `the agent answered ${response.status} to ${quote(response.headers.get('location') ?? 'nowhere it named', WORDS_QUOTE)}, and a redirect is not followed, since the secret a request carries would go with it: give the harness the address it names. Nothing it was asked was done.`,
        );
      }
      if (response.status === 401 || response.status === 403) {
        throw new AuthRefused(
          `the agent refused the request's authentication (${response.status} ${quote(response.statusText, WORDS_QUOTE)}): check what \`credentials\` gives for the schemes its card declares.`,
        );
      }
      return response;
    },
    {
      headers: async () => {
        const a = auth();
        return 'headers' in a ? a.headers : {};
      },
      shouldRetryWithHeaders: async () => undefined,
    },
  );

/** What the client knows of the agent: its card, the URL its secrets are asked for, and the SDK's client. */
export type Seam = { card: AgentCard; agentUrl: string; client: Client };

/**
 * A connection: `client` the view of the agent, made at the first call and dropped at the first failure; `ask` a call on the
 * client, which drops the view when it fails; `sends` the signals of the sends, bounded by `sendMs` and not `requestMs`;
 * `follows` those of the subscriptions, whose headers alone are bounded.
 */
export type Connection = {
  client: () => Promise<Seam>;
  ask: <A>(f: (c: Client) => Promise<A>) => Promise<A>;
  sends: WeakSet<AbortSignal>;
  follows: WeakSet<AbortSignal>;
};

/**
 * The connection to `agent`, under `harness`, its requests bounded by `requestMs` and its sends by `sendMs`. The card carries no
 * secret, so a redirect to it is followed, and what it names is held to the address's origin. The headers are asked of
 * `credentials` on every request, so a secret that changes is sent as it is at the time. The SDK is handed the card already
 * read, with only the interface chosen.
 */
export const connectionOf = (
  harness: string,
  agent: RemoteAgent,
  credentials: Credentials | undefined,
  requestMs: number,
  sendMs: number,
): Connection => {
  const address = 'url' in agent ? agent.url : undefined;
  const sends = new WeakSet<AbortSignal>();
  const follows = new WeakSet<AbortSignal>();
  const bounded = boundedOf(requestMs, sendMs, { sends, follows });
  let seam: Promise<Seam> | undefined;

  const connect = async (): Promise<Seam> => {
    const card = await readCard(agent, bounded);
    const chosen = chosenOf(card, address);
    const agentUrl = address ?? chosen.url;
    const fetchImpl = clientFetchOf(bounded, () => authOf(card, agentUrl, harness, credentials));
    const only: AgentCard = { ...card, supportedInterfaces: [chosen] };
    const made = new ClientFactory({
      transports: [new JsonRpcTransportFactory({ fetchImpl }), new RestTransportFactory({ fetchImpl })],
      cardResolver: { resolve: async () => only, normalizeAgentCard: (c: AgentCard) => c },
    });
    return { card, agentUrl, client: await made.createFromAgentCard(only) };
  };

  const client = async (): Promise<Seam> => {
    seam ??= connect();
    try {
      return await seam;
    } catch (e) {
      seam = undefined;
      throw e;
    }
  };
  const ask = async <A>(f: (c: Client) => Promise<A>): Promise<A> => {
    const { client: c } = await client();
    try {
      return await f(c);
    } catch (e) {
      seam = undefined;
      throw e;
    }
  };
  return { client, ask, sends, follows };
};
