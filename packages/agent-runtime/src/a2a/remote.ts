/**
 * A remote A2A agent as a harness: the runtime's session verbs as A2A calls to an agent another party runs, over HTTP,
 * by the SDK's client. The in-process seam (`a2a/client.ts`) speaks to a handler the
 * runtime built over its own driver; here nothing of the runtime stands on the other side, so the only words exchanged are
 * A2A's own — SendMessage, GetTask, CancelTask — and the runtime extension's methods are never asked.
 *
 * **The registry** is the driver's, and the record of what it sent: `<root>/remote/<session name>.json`, one file per
 * session, written whole to a temporary file and renamed. The intent — the name, the harness, the message's id, when, and
 * the process sending it with the time it gives up (`sending`) — is on disk before the message is sent, and the Task's id
 * and context are written as the answer comes back. So a spawn asked again for a name that has a file never sends twice:
 * with a Task recorded, it adopts it; with a send still under way in a process that lives, it leaves it to that process;
 * otherwise whether a Task started is not known, and the spawn fails in words that are no refusal, which the engine's grace
 * window reads `lost`. A crash between the agent's answer and that write leaves a Task nothing owns. A
 * session let go of (`release`) moves to `remote/done/`, where `find` and `logs` still read it and `observe` does not.
 *
 * **The send leaves the pass.** A spawn runs inside the runtime's pass, which runs task by task, so a send awaited
 * there would hold every other task's pass as long. What can refuse — the card, the auth — is still read in
 * the pass, and a spawn waits for the answer `SPAWN_WAIT_MS` at most, so an agent that answers at once is recorded before
 * the spawn returns and its refusal is still a spawn refused. An agent that has not answered by then is left to answer
 * within `SEND_MS`, in this process: until it does, a pass reads its entry, in any process, as a Task `submitted` while the
 * sending process lives, and the answer's writes are those of an answer in the pass — its Task, or its reply ended. A refusal that comes
 * after the spawn has returned is written as a session ended `rejected`, its words in the entry and on `logs`; a send that
 * fails on the way, or is not answered within `SEND_MS`, or whose process died, is in doubt, as above, and never sent twice.
 *
 * **A pass** is one GetTask per open entry — not ListTasks, which on an agent others use lists theirs too. A Task that has
 * ended is written into its entry and read from there, with no call, until the engine lets it go. A GetTask that fails
 * reads the entry as it was last seen, since an agent unreachable for a moment is not a session gone, and a deadline
 * bounds one gone for good; a Task the agent says it does not have is not listed, and the engine reads that as it reads a
 * session no harness lists.
 *
 * **Auth** is what the card declares: its requirements, the first one whose every scheme can be met, each secret asked of
 * the caller's `credentials` on every request and sent as a header. Nothing a secret is written to — the task's filing, the
 * journal, the registry, the feed — ever holds one. A card whose every requirement asks what this runtime cannot send, or
 * a secret `credentials` does not give, refuses the spawn before anything is sent. A request goes only where the harness
 * says: to an agent given by its URL, only on an interface of that URL's origin, whatever the card it serves names; and
 * a redirect is never followed, since a header that carries a key is not dropped on the way to another origin.
 *
 * **Every request is bounded** (`REQUEST_MS`), since a pass waits on every harness's observe and an agent that holds a
 * request would hold the runtime: a GetTask not answered in time reads the session as last seen, and a card not read is a
 * spawn refused. The send alone is bounded by `SEND_MS`, since it holds no pass.
 *
 * What the client learns of the card and the binding it chose is kept in memory, a view dropped at the first failure and
 * read again: the registry is the record.
 */
import { Effect } from 'effect';
import { AgentCard, type AgentInterface, type Message, type SecurityScheme, type Task } from '@a2a-js/sdk';
import {
  Client,
  ClientFactory,
  createAuthenticatingFetchWithRetry,
  JsonRpcTransportFactory,
  RestTransportFactory,
} from '@a2a-js/sdk/client';
import {
  ContentTypeNotSupportedError,
  ExtensionSupportRequiredError,
  RequestMalformedError,
  TaskNotCancelableError,
  TaskNotFoundError,
  UnsupportedOperationError,
  VersionNotSupportedError,
} from '@a2a-js/sdk/errors';
import { randomUUID } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { formerStateOf, isSessionState, type SessionState, type Sighting } from '../core/index.ts';
import { RunnerError, type RunnerOps, type SpawnRequest } from '../harness/index.ts';
import { logsOfTask, remoteFollowUpOf, remoteMessageOf, sightingOfTask } from './map.ts';

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
 * somewhere of its own says to do, say which variable to set. Absent, the refusal says to give `createEngine` a
 * `credentials` that answers for the scheme.
 */
export type MissingCredential = (scheme: string, agentUrl: string, harness: string) => string;

/** How long a request to a remote agent is waited on, the card's included, before it is read as not answered. */
export const REQUEST_MS = 10_000;

/** How long a send is waited on, off the pass, before it is read as not answered: a Task in doubt, never sent twice. */
export const SEND_MS = 15 * 60_000;

/** How long a spawn waits, in the pass, for its send's answer before it leaves the send to go on without it. */
export const SPAWN_WAIT_MS = 1_000;

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

/**
 * Why a remote agent's configuration cannot be taken, or `undefined`. Asked by `createEngine`, so an address that could
 * never be reached — or one that carries a secret in it, which the configuration is no place for — is refused before any
 * task is filed on it.
 */
export const remoteConfigRefusal = (harness: string, agent: Record<string, unknown>): string | undefined => {
  const keys = Object.keys(agent);
  const extra = keys.filter((k) => k !== 'url' && k !== 'card');
  if (extra.length) {
    return `the \`${harness}\` harness is a remote A2A agent, which takes \`url\` or \`card\` and nothing else, and was given ${extra.map((k) => `\`${k}\``).join(', ')}. Take ${extra.length > 1 ? 'them' : 'it'} off: a secret goes in \`credentials\`, and what a task runs with is the agent's to decide.`;
  }
  if (keys.length !== 1) {
    return `the \`${harness}\` harness is a remote A2A agent, which takes one of \`url\` (its base URL, where its card is served) or \`card\` (the card itself), and was given ${keys.length ? 'both' : 'neither'}.`;
  }
  if ('url' in agent) {
    const url = typeof agent.url === 'string' && URL.canParse(agent.url) ? new URL(agent.url) : undefined;
    if (!url || (url.protocol !== 'http:' && url.protocol !== 'https:')) {
      return `the \`${harness}\` harness's \`url\` is ${typeof agent.url === 'string' ? `\`${url ? `${url.protocol}…` : agent.url}\`` : `a ${typeof agent.url}`}, and a remote A2A agent is reached over HTTP: give its \`http://\` or \`https://\` address.`;
    }
    if (url.username || url.password) {
      return `the \`${harness}\` harness's \`url\` carries a user name or password, which would be written wherever the address is: take it out of the URL, and give the secret through \`credentials\`, for the scheme the agent's card declares.`;
    }
    return undefined;
  }
  const card = agent.card;
  if (typeof card !== 'object' || card === null || Array.isArray(card)) {
    return `the \`${harness}\` harness's \`card\` is not an agent card: give the JSON object the agent serves at \`/.well-known/agent-card.json\`, or its \`url\`.`;
  }
  const interfaces = (card as { supportedInterfaces?: unknown }).supportedInterfaces;
  if (
    !Array.isArray(interfaces) ||
    !interfaces.length ||
    interfaces.some((i) => typeof i?.url !== 'string' || typeof i?.protocolBinding !== 'string')
  ) {
    return `the \`${harness}\` harness's \`card\` lists no interface to reach the agent by: its \`supportedInterfaces\` must give each a \`url\` and a \`protocolBinding\`.`;
  }
  return undefined;
};

/** Why a task cannot be filed on a remote agent, or `undefined`: a remote agent takes no harness arguments. */
export const remoteRefuses =
  (harness: string) =>
  (task: Omit<SpawnRequest, 'name'>): string | undefined => {
    const keys = Object.keys(task.config ?? {});
    return keys.length
      ? `the \`${harness}\` harness is a remote A2A agent, which runs as its operator configured it, and takes no harness arguments: take ${keys.map((k) => `\`${k}\``).join(', ')} out of \`config\`.`
      : undefined;
  };

/**
 * A card as JSON, read into the SDK's objects. A card that follows the specification is proto JSON (`AgentCard.toJSON`),
 * and is parsed. A card served by an agent built on this SDK's own card handler is its objects stringified, whose security
 * schemes are `{ scheme: { $case, value } }`: parsed as proto JSON, every scheme reads empty — the SDK's own resolver
 * drops them so — and a card that asks for a token would name a scheme with nothing in it. So those are kept as they are.
 */
export const cardOfJson = (json: Record<string, unknown>): AgentCard => {
  const parsed = AgentCard.fromJSON(json);
  const schemes = json.securitySchemes as Record<string, unknown> | undefined;
  const sdkForm = schemes && Object.values(schemes).some((s) => typeof (s as { scheme?: { $case?: unknown } })?.scheme?.$case === 'string');
  return sdkForm ? { ...parsed, securitySchemes: schemes as Record<string, SecurityScheme> } : parsed;
};

/** The card's interfaces that this runtime speaks, in the card's order. */
const spokenOf = (card: AgentCard): AgentInterface[] =>
  card.supportedInterfaces.filter((i) => SPOKEN.includes(i.protocolBinding.toUpperCase()) && !i.protocolVersion.startsWith('0.'));

const originOf = (url: string): string | undefined => (URL.canParse(url) ? new URL(url).origin : undefined);

/** The headers a card's requirements ask for, as the caller's secrets meet them — or why none can be met. */
type Auth = { headers: Record<string, string> } | { refusal: string };

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
  const s = scheme?.scheme;
  if (!s) return `\`${name}\` is not a scheme the card declares`;
  const needed = (header: string, value: (secret: string) => string): [string, string] | string => {
    const given = secret();
    return given === undefined || given === ''
      ? `\`${name}\` needs a secret, and \`credentials\` gave none: ${missing() ?? `give \`createEngine\` a \`credentials\` that answers for \`${name}\``}`
      : [header, value(given)];
  };
  switch (s.$case) {
    case 'httpAuthSecurityScheme': {
      const kind = s.value.scheme.toLowerCase();
      if (kind === 'bearer') return needed('authorization', (t) => `Bearer ${t}`);
      if (kind === 'basic') return needed('authorization', (t) => `Basic ${Buffer.from(t).toString('base64')}`);
      return `\`${name}\` is HTTP \`${s.value.scheme}\` authentication, and this runtime sends only \`Bearer\` and \`Basic\``;
    }
    case 'oauth2SecurityScheme':
    case 'openIdConnectSecurityScheme':
      return needed('authorization', (t) => `Bearer ${t}`);
    case 'apiKeySecurityScheme':
      return s.value.location.toLowerCase() === 'header'
        ? needed(s.value.name.toLowerCase(), (t) => t)
        : `\`${name}\` is an API key in a ${s.value.location || 'place the card does not name'}, and this runtime sends a key only in a header, where no log of the address holds it`;
    case 'mtlsSecurityScheme':
      return `\`${name}\` is mutual TLS, and this runtime holds no client certificate`;
  }
};

/** What the card's requirements ask of each request: the first requirement the secrets meet whole, else why none is met. */
const authOf = (
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
    why.push(unmet.join(', and '));
  }
  return { refusal: `the agent at ${agentUrl} asks for authentication this runtime cannot give: ${why.join('; or ')}. Nothing was sent.` };
};

/** The agent answered a request without taking it: nothing it was asked was done. */
class Untaken extends Error {}

/** The agent refused a request's authentication (HTTP 401 or 403). */
class AuthRefused extends Untaken {}

/** The agent answered with a redirect, which is not followed. */
class Redirected extends Untaken {}

/** A spawn that nothing started, in words: the attempt ends `unstartable`. */
class Refusal extends Error {}

/** A request the agent did not answer within its bound: whether it was taken is not known. */
class Late extends Error {}

/** An A2A error an agent answers before it has done anything with a message: the send was refused, not lost. */
const REFUSALS = [
  ContentTypeNotSupportedError,
  ExtensionSupportRequiredError,
  RequestMalformedError,
  UnsupportedOperationError,
  VersionNotSupportedError,
  TaskNotFoundError,
];

const untaken = (e: unknown): boolean => e instanceof Untaken || (e instanceof Error && e.cause instanceof Untaken);
const late = (e: unknown): boolean => e instanceof Late || (e instanceof Error && e.cause instanceof Late);
const sendRefused = (e: unknown): boolean => untaken(e) || REFUSALS.some((E) => e instanceof E);

const messageOf = (e: unknown): string => (e instanceof Error ? e.message : String(e));

/** One session's entry in the registry. */
type Entry = {
  name: string;
  /** The harness it was sent through: the engine's name for the agent, never its address. */
  agent: string;
  messageId: string;
  contextId?: string;
  sentAt: string;
  /** The Task the agent made of the message, once its answer is back. */
  taskId?: string;
  /** How it was last seen: read when the agent cannot be asked. */
  seen?: Sighting;
  /** The Task has ended, and `seen` is how: read from here, with no call to the agent. */
  ended?: true;
  /** The agent answered with a Message, not a Task: the whole of the session, in its words. */
  reply?: string;
  /**
   * The send is under way in the process `pid`, which gives it up at `until`: while that process lives and the time has not
   * come, the entry is a Task `submitted`. Gone once the answer, or its failure, is written.
   */
  sending?: { pid: number; until: string };
  /** The agent refused the message after the spawn had returned: its words, the session ended `rejected`. */
  refused?: string;
  /** The send failed on the way, or was not answered in time: its words, the Task in doubt. */
  doubt?: string;
};

/** What a send came to: the agent's answer, its refusal, a failure on the way, or a stop that cut it. */
type Answer = { task: Task } | { message: Message } | { refused: string } | { failed: unknown } | { canceled: true };

/** Whether a process lives: one this user cannot signal lives too. */
const alive = (pid: number): boolean => {
  try {
    process.kill(pid, 0);
    return true;
  } catch (e) {
    return (e as NodeJS.ErrnoException).code === 'EPERM';
  }
};

const TERMINAL: ReadonlySet<SessionState> = new Set(['completed', 'failed', 'canceled', 'rejected']);

/**
 * An entry as this code reads it. An entry an older runtime wrote may say how it was last seen in the runtime's former
 * words — `done`, `blocked`, `stopped` — and is read in A2A's, as the Task it was seen in said them (`blocked` waiting for
 * `authentication` is `AUTH_REQUIRED`, `WAITS`). The file keeps its words until it is next written. A word neither
 * vocabulary has is `failed`, as the other drivers read one: no session the runtime can wait on.
 */
const upgraded = (e: Entry): Entry => {
  const seen = e.seen as (Omit<Sighting, 'state'> & { state: string }) | undefined;
  if (!seen || isSessionState(seen.state)) return e;
  const state =
    seen.state === 'blocked' && seen.waitingFor === 'authentication' ? 'auth-required' : (formerStateOf(seen.state) ?? 'failed');
  return { ...e, seen: { ...seen, state } };
};

/** The bounds of a send, and the words for a secret not given: each has its shipped default. */
export type RemoteOptions = { sendMs?: number; spawnWaitMs?: number; missingCredential?: MissingCredential };

/**
 * A remote A2A agent's `RunnerOps`, under `harness`, its registry beneath `root`. `credentials` answers for the card's
 * schemes; absent, only an agent that asks for no authentication is reached. `requestMs` bounds each request but the send,
 * which `sendMs` bounds; `spawnWaitMs` is how long a spawn waits in the pass for its answer.
 *
 * What the client knows of the agent — its card, the interface chosen and the SDK's client (`seam`) — is a view: `ask`
 * drops it at any failure, and the next call reads the card again. The card carries no secret, so a redirect to it is
 * followed, and what it names is held to the address's origin. The headers are asked of `credentials` on every request,
 * so a secret that changes is sent as it is at the time; a refusal there was said before the send. The factory is handed
 * the card already read, with only the interface chosen.
 *
 * The verbs:
 * - `spawn`, in order: a name whose entry has a Task adopts it, and nothing is sent again; one being sent by a process
 *   that lives (`sendingLive`, with `inFlight` the sends of this one) is read `submitted` until it answers; any other
 *   entry is a send in doubt, never sent twice. Then the card's auth is met or the spawn refused, the intent is written,
 *   and the send (`sendOf`) raced against `spawnWaitMs`. Answered in time, `record` writes it in the pass; else the pass
 *   goes on and the answer is recorded when it comes, and a root removed meanwhile has no entry to write, which nothing
 *   reads.
 * - `record` writes what a send came to, in this order: an entry let go of while it was sent (its attempt ended on its
 *   deadline, or stopped) goes to `remote/done/`, where `observe` does not read it, and a Task it made is cancelled, since
 *   nothing waits on it; a Task is written; a Message is the whole session, ended `completed`, since the agent made no
 *   Task; a refusal while the spawn waits removes the intent and is thrown, nothing started under the name, and after it
 *   is written as the session ended `rejected`; a send stopped on its way is ended `canceled`, and a Task the agent made
 *   before the cut is not known here; a failure is written as the doubt, and thrown while the spawn waits.
 * - `observe` reads each open entry (`open`: at the top of the registry, sent through this harness) — one ended from the
 *   registry, else by a GetTask; one not reached this time as it was last seen, which a deadline bounds; one the agent
 *   does not have is not listed — and a send under way as a Task `submitted`.
 * - `stop` cancels the Task; a reply or a refusal is no Task and nothing runs; a send still under way is cut if this
 *   process makes it, and one another process makes is its to answer, a Task it brings back cancelled on the next stop.
 *   A Task that has ended, or that the agent does not have, has nothing to stop.
 * - `logs` reads the Task's history, or the entry's words when there is no Task.
 * - `stop` and `logs` read an entry open or let go of (`bySession`): by the Task's id, the message's id, or
 *   its context — the id a settled task's attempt records for a remote agent, what a later turn continues — read as the
 *   latest Task sent in it. A registry folder not yet made is read as empty.
 * - `release` runs once the engine has written the attempt's end: a send under way is cut and whatever answers is let
 *   go of; a Task still running is cancelled, since an attempt ends so only on its deadline or a stop; and the entry leaves
 *   the open registry, so no later pass asks the agent about it.
 * - `say` sends words to a Task that waits on its caller, as A2A's follow-up on it; the facade refuses them to a Task at
 *   work.
 */
export const remoteOps = (
  harness: string,
  agent: RemoteAgent,
  root: string,
  credentials?: Credentials,
  requestMs = REQUEST_MS,
  o: RemoteOptions = {},
): RunnerOps => {
  const sendMs = o.sendMs ?? SEND_MS;
  const spawnWaitMs = o.spawnWaitMs ?? SPAWN_WAIT_MS;
  const inFlight = new Map<string, AbortController>();
  const sendingLive = (e: Entry): boolean =>
    e.sending !== undefined &&
    e.taskId === undefined &&
    Date.parse(e.sending.until) > Date.now() &&
    (inFlight.has(e.name) || (e.sending.pid !== process.pid && alive(e.sending.pid)));
  const dir = path.join(root, 'remote');
  const done = path.join(dir, 'done');
  const fileOf = (name: string, under = dir) => path.join(under, `${encodeURIComponent(name)}.json`);

  const readEntry = (file: string): Entry | undefined => {
    try {
      return upgraded(JSON.parse(fs.readFileSync(file, 'utf8')) as Entry);
    } catch (e) {
      if ((e as NodeJS.ErrnoException).code === 'ENOENT') return undefined;
      throw e;
    }
  };
  const write = (e: Entry, under = dir) => {
    fs.mkdirSync(under, { recursive: true });
    const tmp = `${fileOf(e.name, under)}.${process.pid}.${randomUUID()}.tmp`;
    fs.writeFileSync(tmp, `${JSON.stringify(e)}\n`);
    fs.renameSync(tmp, fileOf(e.name, under));
  };
  const open = (): Entry[] => {
    let names: string[];
    try {
      names = fs.readdirSync(dir);
    } catch (e) {
      if ((e as NodeJS.ErrnoException).code === 'ENOENT') return [];
      throw e;
    }
    return names
      .filter((f) => f.endsWith('.json'))
      .flatMap((f) => {
        const e = readEntry(path.join(dir, f));
        return e && e.agent === harness ? [e] : [];
      });
  };
  const bySession = (sessionId: string): Entry | undefined => {
    const all: Entry[] = [];
    for (const under of [dir, done]) {
      let names: string[] = [];
      try {
        names = fs.readdirSync(under);
      } catch {}
      for (const f of names.filter((n) => n.endsWith('.json'))) {
        const e = readEntry(path.join(under, f));
        if (e?.agent === harness) all.push(e);
      }
    }
    return (
      all.find((e) => e.taskId === sessionId || e.seen?.sessionId === sessionId || e.messageId === sessionId) ??
      all
        .filter((e) => e.contextId === sessionId && e.taskId)
        .sort((a, b) => a.sentAt.localeCompare(b.sentAt))
        .at(-1)
    );
  };

  const address = 'url' in agent ? agent.url : undefined;
  let seam: Promise<{ card: AgentCard; agentUrl: string; client: Client }> | undefined;

  const sends = new WeakSet<AbortSignal>();
  const bounded = async (input: string | URL | Request, init: RequestInit = {}): Promise<Response> => {
    const ms = init.signal && sends.has(init.signal) ? sendMs : requestMs;
    const bound = AbortSignal.timeout(ms);
    try {
      return await fetch(input, { ...init, signal: init.signal ? AbortSignal.any([init.signal, bound]) : bound });
    } catch (e) {
      if (bound.aborted) throw new Late(`${shownUrl(input)} did not answer within ${ms / 1000} s`);
      throw e;
    }
  };

  const readCard = async (): Promise<AgentCard> => {
    if (!address) return cardOfJson((agent as { card: Record<string, unknown> }).card);
    const at = cardUrlOf(address);
    let response: Response;
    try {
      response = await bounded(at, { headers: { accept: 'application/json' } });
    } catch (e) {
      throw new Refusal(
        `the agent's card could not be read at ${shownUrl(at)} (${messageOf((e as Error).cause ?? e)}): the agent is not reachable, and nothing was sent.`,
      );
    }
    if (!response.ok)
      throw new Refusal(
        `the agent's card could not be read at ${shownUrl(at)}: it answered ${response.status} ${response.statusText}, and nothing was sent.`,
      );
    const json = await response.json().catch(() => undefined);
    if (typeof json !== 'object' || json === null)
      throw new Refusal(`what ${shownUrl(at)} serves is not an agent card, and nothing was sent.`);
    return cardOfJson(json as Record<string, unknown>);
  };

  const connect = async () => {
    const card = await readCard();
    const spoken = spokenOf(card);
    const chosen = address ? spoken.find((i) => originOf(i.url) === new URL(address).origin) : spoken[0];
    if (!chosen && spoken.length) {
      throw new Refusal(
        `the agent's card names ${spoken.map((i) => i.url).join(', ')}, and none is on ${new URL(address!).origin}, the origin the harness was given: a request, and any secret it carries, goes only there. Give the harness the agent's own address, or its card as \`card\`. Nothing was sent.`,
      );
    }
    if (!chosen) {
      const offered = card.supportedInterfaces.map((i) => `${i.protocolBinding}${i.protocolVersion ? ` ${i.protocolVersion}` : ''}`);
      throw new Refusal(
        `the agent's card offers ${offered.length ? offered.join(', ') : 'no interface'}, and this runtime speaks ${SPOKEN_WORDS}; gRPC is not spoken yet. Serve one of those on the agent. Nothing was sent.`,
      );
    }
    const agentUrl = address ?? chosen.url;
    const fetchImpl = createAuthenticatingFetchWithRetry(
      async (input, init) => {
        const response = await bounded(input, { ...init, redirect: 'manual' });
        if (response.status >= 300 && response.status < 400) {
          throw new Redirected(
            `the agent answered ${response.status} to ${response.headers.get('location') ?? 'nowhere it named'}, and a redirect is not followed, since the secret a request carries would go with it: give the harness the address it names. Nothing it was asked was done.`,
          );
        }
        if (response.status === 401 || response.status === 403) {
          throw new AuthRefused(
            `the agent refused the request's authentication (${response.status} ${response.statusText}): check what \`credentials\` gives for the schemes its card declares.`,
          );
        }
        return response;
      },
      {
        headers: async () => {
          const a = authOf(card, agentUrl, harness, credentials);
          return 'headers' in a ? a.headers : {};
        },
        shouldRetryWithHeaders: async () => undefined,
      },
    );
    const only: AgentCard = { ...card, supportedInterfaces: [chosen] };
    const factory = new ClientFactory({
      transports: [new JsonRpcTransportFactory({ fetchImpl }), new RestTransportFactory({ fetchImpl })],
      cardResolver: { resolve: async () => only, normalizeAgentCard: (c: AgentCard) => c },
    });
    return { card, agentUrl, client: await factory.createFromAgentCard(only) };
  };

  const client = async () => {
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

  const failure =
    (verb: string) =>
    (cause: unknown): RunnerError =>
      cause instanceof RunnerError
        ? cause
        : cause instanceof Refusal
          ? new RunnerError({ verb, message: `the \`${harness}\` harness: ${cause.message}`, refused: true })
          : new RunnerError({ verb, message: `the \`${harness}\` harness: ${messageOf(cause)}` });

  const sendOf = async (r: SpawnRequest, intent: Entry, stop: AbortSignal): Promise<Answer> => {
    const signal = AbortSignal.any([stop]);
    sends.add(signal);
    try {
      const answer = await ask((c) =>
        c.sendMessage(
          {
            tenant: '',
            message: remoteMessageOf(r, intent.messageId),
            metadata: undefined,
            configuration: { acceptedOutputModes: [], taskPushNotificationConfig: undefined, returnImmediately: true },
          },
          { signal },
        ),
      );
      return 'status' in answer ? { task: answer } : { message: answer };
    } catch (e) {
      if (stop.aborted) return { canceled: true };
      if (sendRefused(e)) return { refused: `${messageOf(e)}${untaken(e) ? '' : ' Nothing was started.'}` };
      return { failed: e };
    }
  };

  const doubtOf = (name: string, e: unknown): string =>
    late(e)
      ? `the agent did not answer the send of \`${name}\` within ${sendMs / 1000} s`
      : `the send of \`${name}\` failed on the way (${messageOf(e)})`;
  const NOT_TWICE = 'whether the agent made a Task of it is not known, and it is not sent twice.';

  const record = (intent: Entry, answer: Answer, inPass: boolean): void => {
    const { sending: _, ...sent } = intent;
    const released = !inPass && !fs.existsSync(fileOf(intent.name));
    if (released) {
      const task = 'task' in answer ? answer.task : undefined;
      if (task) void cancel(task.id).catch(() => undefined);
      write({ ...sent, ...(task ? { taskId: task.id, contextId: task.contextId } : {}), ended: true }, done);
      return;
    }
    if ('task' in answer) {
      write({ ...sent, taskId: answer.task.id, contextId: answer.task.contextId });
      return;
    }
    if ('message' in answer) {
      const m = answer.message;
      const text = m.parts
        .map((p) => (p.content?.$case === 'text' ? p.content.value : p.content?.$case === 'data' ? JSON.stringify(p.content.value) : ''))
        .join('\n');
      const data = m.parts.find((p) => p.content?.$case === 'data');
      write({
        ...sent,
        taskId: m.messageId,
        contextId: m.contextId,
        reply: text,
        ended: true,
        seen: {
          sessionId: m.messageId,
          state: 'completed',
          ...(m.contextId ? { nativeId: m.contextId } : {}),
          ...(data?.content?.$case === 'data' ? { closeout: { payload: data.content.value, at: Date.now() } } : {}),
        },
      });
      return;
    }
    if ('refused' in answer) {
      if (inPass) {
        fs.rmSync(fileOf(intent.name), { force: true });
        throw new Refusal(answer.refused);
      }
      write({
        ...sent,
        taskId: intent.messageId,
        ended: true,
        refused: answer.refused,
        seen: { sessionId: intent.messageId, state: 'rejected' },
      });
      return;
    }
    if ('canceled' in answer) {
      write({ ...sent, taskId: intent.messageId, ended: true, seen: { sessionId: intent.messageId, state: 'canceled' } });
      return;
    }
    const doubt = doubtOf(intent.name, answer.failed);
    write({ ...sent, doubt });
    if (inPass) throw new Error(`${doubt}: ${NOT_TWICE}`, { cause: answer.failed });
  };

  const spawn = (r: SpawnRequest): Effect.Effect<void, RunnerError> =>
    Effect.tryPromise({
      catch: failure('spawn'),
      try: async () => {
        const recorded = readEntry(fileOf(r.name));
        if (recorded?.taskId) return;
        if (recorded && sendingLive(recorded)) return;
        if (recorded) {
          throw new Error(
            `\`${r.name}\` was sent at ${recorded.sentAt} and its answer was never recorded, since ${recorded.doubt ?? 'the process sending it stopped first'}: ${NOT_TWICE}`,
          );
        }
        const { card, agentUrl } = await client();
        const auth = authOf(card, agentUrl, harness, credentials, o.missingCredential);
        if ('refusal' in auth) throw new Refusal(auth.refusal);
        const sentAt = new Date();
        const intent: Entry = {
          name: r.name,
          agent: harness,
          messageId: randomUUID(),
          ...(r.resumeFrom ? { contextId: r.resumeFrom } : {}),
          sentAt: sentAt.toISOString(),
          sending: { pid: process.pid, until: new Date(sentAt.getTime() + sendMs).toISOString() },
        };
        write(intent);
        const stop = new AbortController();
        inFlight.set(r.name, stop);
        const answered = sendOf(r, intent, stop.signal);
        let timer: NodeJS.Timeout | undefined;
        const waited = new Promise<'waited'>((resolve) => {
          timer = setTimeout(() => resolve('waited'), spawnWaitMs);
        });
        const first = await Promise.race([answered, waited]);
        clearTimeout(timer);
        if (first === 'waited') {
          void answered.then((a) => {
            try {
              record(intent, a, false);
            } catch {
            } finally {
              inFlight.delete(r.name);
            }
          });
          return;
        }
        try {
          record(intent, first, true);
        } finally {
          inFlight.delete(r.name);
        }
      },
    });

  const sightingOf = async (e: Entry & { taskId: string }): Promise<Sighting | undefined> => {
    if (e.ended && e.seen) return e.seen;
    let task: Task;
    try {
      task = await ask((c) => c.getTask({ tenant: '', id: e.taskId, historyLength: 0 }));
    } catch (err) {
      if (err instanceof TaskNotFoundError) return undefined;
      return e.seen ?? { sessionId: e.taskId, state: 'working', ...(e.contextId ? { nativeId: e.contextId } : {}) };
    }
    const s = sightingOfTask(task, Date.now());
    if (TERMINAL.has(s.state)) write({ ...e, seen: s, ended: true });
    else if (s.state !== e.seen?.state || s.waitingFor !== e.seen?.waitingFor || s.nativeId !== e.seen?.nativeId) write({ ...e, seen: s });
    return s;
  };

  const submittedOf = (e: Entry): Sighting => ({
    sessionId: e.messageId,
    state: 'submitted',
    ...(e.contextId ? { nativeId: e.contextId } : {}),
  });

  const observe: Effect.Effect<Map<string, Sighting>, RunnerError> = Effect.tryPromise({
    catch: failure('observe'),
    try: async () => {
      const all = open();
      const entries = all.filter((e): e is Entry & { taskId: string } => e.taskId !== undefined);
      const seen = await Promise.all(entries.map(async (e) => [e.name, await sightingOf(e)] as const));
      const sending = all.filter(sendingLive).map((e) => [e.name, submittedOf(e)] as const);
      return new Map([...seen, ...sending].filter((pair): pair is readonly [string, Sighting] => pair[1] !== undefined));
    },
  });

  const cancel = (taskId: string) =>
    ask((c) => c.cancelTask({ tenant: '', id: taskId, metadata: undefined })).then(
      () => undefined,
      (e) => {
        if (e instanceof TaskNotCancelableError || e instanceof TaskNotFoundError) return undefined;
        throw e;
      },
    );

  const stop = (sessionId: string): Effect.Effect<void, RunnerError> =>
    Effect.tryPromise({
      catch: failure('stop'),
      try: async () => {
        const e = bySession(sessionId);
        if (e?.reply !== undefined || e?.refused !== undefined) return;
        if (e && e.taskId === undefined) {
          inFlight.get(e.name)?.abort();
          return;
        }
        await cancel(e?.taskId ?? sessionId);
      },
    });

  const logs = (sessionId: string): Effect.Effect<string, RunnerError> =>
    Effect.tryPromise({
      catch: failure('logs'),
      try: async () => {
        const e = bySession(sessionId);
        if (e?.reply !== undefined) return `agent: ${e.reply}`;
        if (e?.refused !== undefined) return `REJECTED — ${e.refused}`;
        if (e && e.seen?.state === 'canceled' && e.taskId === e.messageId)
          return `CANCELED — stopped while it was being sent, before the agent answered`;
        if (e && e.taskId === undefined) {
          return sendingLive(e)
            ? `SUBMITTED — sent at ${e.sentAt}; the agent has not answered yet`
            : `sent at ${e.sentAt}, and its answer was never recorded${e.doubt ? `: ${e.doubt}` : ''}`;
        }
        const taskId = e?.taskId ?? sessionId;
        try {
          return logsOfTask(await ask((c) => c.getTask({ tenant: '', id: taskId, historyLength: undefined })));
        } catch (err) {
          if (err instanceof TaskNotFoundError) return `(the agent no longer has the Task \`${taskId}\`)`;
          throw err;
        }
      },
    });

  const find = (name: string): Effect.Effect<{ sessionId: string } | undefined, RunnerError> =>
    Effect.try({
      catch: failure('find'),
      try: () => {
        const e = readEntry(fileOf(name)) ?? readEntry(fileOf(name, done));
        return e?.agent === harness && e.taskId ? { sessionId: e.taskId } : undefined;
      },
    });

  const release = (session: Sighting): Effect.Effect<void, RunnerError> =>
    Effect.tryPromise({
      catch: failure('release'),
      try: async () => {
        const e = open().find((o) => o.taskId === session.sessionId || (o.taskId === undefined && o.messageId === session.sessionId));
        if (!e) return;
        if (e.taskId === undefined) inFlight.get(e.name)?.abort();
        else if (!e.ended && e.reply === undefined && e.refused === undefined) await cancel(session.sessionId);
        fs.mkdirSync(done, { recursive: true });
        fs.renameSync(fileOf(e.name), fileOf(e.name, done));
      },
    });

  const say = (session: { name: string; sessionId: string }, text: string): Effect.Effect<void, RunnerError> =>
    Effect.tryPromise({
      catch: failure('say'),
      try: async () => {
        const e = readEntry(fileOf(session.name));
        await ask((c) =>
          c.sendMessage({
            tenant: '',
            message: remoteFollowUpOf(session.sessionId, e?.contextId ?? '', text, randomUUID()),
            metadata: undefined,
            configuration: { acceptedOutputModes: [], taskPushNotificationConfig: undefined, returnImmediately: true },
          }),
        );
      },
    });

  return { spawn, observe, find, stop, logs, release, say, refuses: remoteRefuses(harness) };
};
