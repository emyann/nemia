/**
 * The port a holder serves its own sessions on: a `node:http` server bound ephemerally on `127.0.0.1`, speaking JSON-RPC over
 * the reading surface (`served.ts`), behind one bearer token kept in the runtime's store (`holder-token.ts`).
 *
 * **One token, checked first.** Every request, the card's read included, is refused with HTTP 401 and `WWW-Authenticate:
 * Bearer` when it carries no token or a wrong one, before anything else is read. An HTTP refusal rather than a JSON-RPC error
 * inside a 200 on purpose: a client reads the kind off the status (`clientFetchOf` turns 401 and 403 into `AuthRefused`),
 * where a refusal inside a 200 would reach a viewer as an unsupported operation and name the wrong fix.
 *
 * **Two paths per harness.** `POST /<harness>` is the JSON-RPC road, and `GET /<harness>/.well-known/agent-card.json` the
 * card the interface's URL resolves to (`cardUrlOf`). Any other path is 404, any other method 405, and a body past
 * `MOST_BYTES` is 413.
 *
 * **The stream is framed here.** The SDK's own SSE framing lives in `@a2a-js/sdk/server/express`, and express is an optional
 * peer this repository does not install, so a subscription is written by hand: `text/event-stream`, each answer `data:
 * <json>\n\n`, the headers flushed before the first answer (`flushHeaders`) and `X-Accel-Buffering: no`, so a follower is
 * handed each moment as it comes rather than a buffer at the end. A subscription that throws before its first answer — a
 * Task that is gone, a session that has ended — is answered as a JSON-RPC error in a 200, never as an empty stream a
 * follower would wait on for ever.
 *
 * **The scope owns the socket.** The port lives inside the hold's scope: as it closes, the server stops listening, every open
 * socket is destroyed — so a subscription cannot hold the hold open — and the token file is forgotten.
 */
import http from 'node:http';
import type { Socket } from 'node:net';
import { Effect, type Scope } from 'effect';
import { JsonRpcTransportHandler, ServerCallContext, STATE_HEADERS_KEY } from '@a2a-js/sdk/server';
import type { Event } from '../core/index.ts';
import type { RunnerOps } from '../harness/index.ts';
import { HarnessHandler } from './handler.ts';
import { bearerOf, forgetToken, tokenHolds, tokenOf, writeToken } from './holder-token.ts';
import { cardJsonOf, servedCardOf, ServedHandler } from './served.ts';

/** The address a holder binds: loopback, and a port the machine chooses. */
const HOST = '127.0.0.1';

/** The most a request body may hold: a JSON-RPC call of this surface is a few hundred bytes. */
export const MOST_BYTES = 64 * 1024;

/** Where a harness's card is served beneath its own path. */
const CARD_PATH = '/.well-known/agent-card.json';

/**
 * What a holder serves, as `hold()` answers it: the base address of its port, the bearer token every request must carry, and
 * the card of each harness it serves, by that harness's name, as the JSON a viewer configures an agent with (`{ card }`).
 */
export type Served = {
  url: string;
  token: string;
  cards: Record<string, Record<string, unknown>>;
};

/** What one harness is served as: the transport over its reading surface, and the card that surface declares. */
type Port = { transport: JsonRpcTransportHandler; card: Record<string, unknown> };

/** A JSON answer, whatever its status. */
const answerJson = (res: http.ServerResponse, status: number, body: unknown): void => {
  const text = JSON.stringify(body);
  res.writeHead(status, { 'content-type': 'application/json', 'content-length': Buffer.byteLength(text) });
  res.end(text);
};

/** The refusal of a request whose token is absent or wrong: no JSON-RPC body, since the kind is read off the status. */
const answerUnauthorized = (res: http.ServerResponse): void => {
  res.writeHead(401, { 'www-authenticate': 'Bearer', 'content-length': 0 });
  res.end();
};

/** A plain refusal in words, as text: a path, a method or a body this port does not take. */
const answerPlain = (res: http.ServerResponse, status: number, why: string): void => {
  res.writeHead(status, { 'content-type': 'text/plain; charset=utf-8', 'content-length': Buffer.byteLength(why) });
  res.end(why);
};

/** The request's body, or `undefined` once it is past `MOST_BYTES`, which is answered 413. */
const bodyOf = async (req: http.IncomingMessage): Promise<string | undefined> => {
  let text = '';
  let bytes = 0;
  for await (const chunk of req) {
    bytes += (chunk as Buffer).length;
    if (bytes > MOST_BYTES) return undefined;
    text += (chunk as Buffer).toString('utf8');
  }
  return text;
};

/** The `id` of a JSON-RPC request body, for the error answered before a stream has said anything; `null` where there is none. */
const idOf = (body: string): string | number | null => {
  try {
    const parsed = JSON.parse(body) as { id?: unknown };
    return typeof parsed.id === 'string' || typeof parsed.id === 'number' ? parsed.id : null;
  } catch {
    return null;
  }
};

/**
 * `answers` written as an event stream: the first answer is awaited before any header, so a subscription that fails at once is
 * answered as a JSON-RPC error in a 200 and not as a stream that says nothing. The generator is returned once the answers run
 * out or the follower goes away.
 */
const answerStream = async (
  res: http.ServerResponse,
  id: string | number | null,
  answers: AsyncGenerator<unknown, void, undefined>,
): Promise<void> => {
  const it = answers[Symbol.asyncIterator]();
  let first: IteratorResult<unknown, void>;
  try {
    first = await it.next();
  } catch (cause) {
    return answerJson(res, 200, { jsonrpc: '2.0', id, error: JsonRpcTransportHandler.mapToJSONRPCError(cause) });
  }
  res.writeHead(200, {
    'content-type': 'text/event-stream',
    'cache-control': 'no-cache',
    connection: 'keep-alive',
    'x-accel-buffering': 'no',
  });
  res.flushHeaders();
  res.on('close', () => void it.return?.(undefined));
  for (let frame = first; !frame.done && !res.closed; frame = await it.next()) {
    res.write(`data: ${JSON.stringify(frame.value)}\n\n`);
  }
  if (!res.closed) res.end();
};

/** The harness a request's path names, and whether it asks for that harness's card; `undefined` for a path this port has none for. */
const routeOf = (url: string | undefined, ports: Map<string, Port>): { harness: string; card: boolean } | undefined => {
  const at = decodeURIComponent((url ?? '/').split('?')[0]);
  for (const harness of ports.keys()) {
    if (at === `/${harness}`) return { harness, card: false };
    if (at === `/${harness}${CARD_PATH}`) return { harness, card: true };
  }
  return undefined;
};

/** One request answered, its token already checked: the card, the JSON-RPC road, or a refusal naming what this port has. */
const answerOf = async (req: http.IncomingMessage, res: http.ServerResponse, ports: Map<string, Port>): Promise<void> => {
  const route = routeOf(req.url, ports);
  if (!route) {
    return answerPlain(res, 404, `this port serves ${[...ports.keys()].map((h) => `/${h}`).join(', ')} and nothing else.\n`);
  }
  const port = ports.get(route.harness)!;
  if (route.card) {
    if (req.method !== 'GET') return answerPlain(res, 405, 'a card is read with GET.\n');
    return answerJson(res, 200, port.card);
  }
  if (req.method !== 'POST') return answerPlain(res, 405, 'a JSON-RPC call is sent with POST.\n');
  const body = await bodyOf(req);
  if (body === undefined) return answerPlain(res, 413, `a request of this port holds at most ${MOST_BYTES} bytes.\n`);
  const context = new ServerCallContext({ state: new Map<string, unknown>([[STATE_HEADERS_KEY, req.headers]]) });
  const answer = await port.transport.handle(body, context);
  if (Symbol.asyncIterator in answer) return answerStream(res, idOf(body), answer);
  return answerJson(res, 200, answer);
};

/** The server's listener: the token first, then the request answered; a defect inside is a 500 that says nothing of itself. */
const listenerOf = (token: string, ports: Map<string, Port>) => (req: http.IncomingMessage, res: http.ServerResponse) => {
  if (!tokenHolds(token, bearerOf(req.headers.authorization))) return answerUnauthorized(res);
  void answerOf(req, res, ports).catch(() => {
    if (!res.headersSent) answerPlain(res, 500, 'this port could not answer, and says nothing more.\n');
    res.end();
  });
};

/** The server listening on an ephemeral loopback port, its address answered; a bind that cannot happen dies. */
const listening = (server: http.Server): Promise<number> =>
  new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, HOST, () => {
      const address = server.address();
      if (address === null || typeof address === 'string') return reject(new Error(`the holder's port bound to ${String(address)}`));
      resolve(address.port);
    });
  });

/** The server closed, every open socket destroyed, so a subscription still being read does not hold the hold open. */
const closed = (server: http.Server, sockets: Set<Socket>): Promise<void> =>
  new Promise((resolve) => {
    server.close(() => resolve());
    for (const socket of sockets) socket.destroy();
  });

/**
 * The port of a holder, for the scope it is taken in: one `ops` per harness served, each behind its own reading surface over a
 * `HarnessHandler` of the same journal (`events`), a fresh token written under `root`, and the address they are reached at.
 * As the scope closes the server stops, every socket is destroyed and the token is forgotten.
 */
export const servedOf = (served: {
  root: string;
  ops: Record<string, RunnerOps>;
  events: (taskId: string) => Promise<readonly Event[]>;
}): Effect.Effect<Served, never, Scope.Scope> =>
  Effect.acquireRelease(
    Effect.promise(async (): Promise<{ answer: Served; server: http.Server; sockets: Set<Socket> }> => {
      const ports = new Map<string, Port>();
      const sockets = new Set<Socket>();
      const token = tokenOf();
      const server = http.createServer(listenerOf(token, ports));
      server.on('connection', (socket) => {
        sockets.add(socket);
        socket.on('close', () => sockets.delete(socket));
      });
      const port = await listening(server);
      const url = `http://${HOST}:${port}`;
      const cards: Record<string, Record<string, unknown>> = {};
      for (const [harness, ops] of Object.entries(served.ops)) {
        const card = servedCardOf(harness, ops, `${url}/${harness}`);
        const json = cardJsonOf(card);
        cards[harness] = json;
        ports.set(harness, {
          transport: new JsonRpcTransportHandler(new ServedHandler(new HarnessHandler(harness, ops, served.events), card)),
          card: json,
        });
      }
      writeToken(served.root, token);
      return { answer: { url, token, cards }, server, sockets };
    }),
    ({ server, sockets }) =>
      Effect.promise(async () => {
        await closed(server, sockets);
        forgetToken(served.root);
      }),
  ).pipe(Effect.map(({ answer }) => answer));
