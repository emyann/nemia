/**
 * Who a request is from: the token it presents (`Authorization: Bearer <token>`, else the board's cookie, `TOKEN_COOKIE`) and what its
 * route needs of one (`needOf`, proved by `apps/api/contracts/token-need.contract.ts`), asked of the
 * package (`sessionCaller`). Resolved once per request, before any router is reached (`callerGate`, app.ts), and put on the request for
 * `served` to hand every handler as `caller` (layer.ts): a proposal's and a delegation's handlers read it there.
 *
 * What a route needs: the MCP port (`/mcp`) always one of the person's tokens; a route the api answers (`API_PATHS`), where the store is
 * marked exposed (`WF_EXPOSED=1`, `StoreConfig.exposed`), a token, any live one; and otherwise none, a request that presents none being
 * the person. A page of the board (board/board.ts) needs none, exposed or not: it carries no data of the store.
 *
 * Every request that presents a token is judged, whatever its route, not only the proposals' and delegations': a session's client sends
 * its token on every request (apps/cli), so a token refused on a read is the same forged or ended token a write would carry, and a
 * session that learns so on its first request learns it before it acts. A header that is not `Bearer <token>`, no token where the route
 * needs one, a session's where it needs the person's, and a token the store never minted or whose try is no longer the live one, are
 * refused 401 (`Unauthorized`, with its reason), answered by `answerError` (app.ts); on the MCP port with `WWW-Authenticate: Bearer`.
 */
import { Effect } from 'effect';
import { TaggedError } from 'effect/Data';
import type { MiddlewareHandler } from 'hono';
import { deleteCookie } from 'hono/cookie';
import { PERSON, PlaceService, sessionCaller, type ProposalCaller, type TokenNeed } from 'agent-orchestrator';
import { TOKEN_COOKIE, type TokenRefusal } from 'objects';
import type { NeedOf } from '../../contracts/token-need.contract.ts';
import { bearerOf, cookieTokenOf } from '../guard.ts';
import { type ApiEnv, traceOf } from '../layer.ts';
import { Engine, runPlaced, StoreConfig, StoreRoot } from '../store.ts';

/** A request whose token the api refuses, with the reason where it presented one: the api's 401 (`objects`' `Unauthorized`). */
export class Unauthorized extends TaggedError('Unauthorized')<{ readonly message: string; readonly reason?: TokenRefusal }> {
  readonly exitCode = 2;
}

/** The MCP port's path: it and every path under it need one of the person's tokens. */
export const MCP_PATH = '/mcp';

/** The paths the api answers on, each with every path under it: the objects' routes and the OpenAPI document and its page. */
export const API_PATHS = ['/api', '/openapi'] as const;

/**
 * Whether `path` is `root` or a path under it: joined with `+`, which the verifier reads, where it reads a template string as an unknown
 * string (`apps/api/contracts/token-need.contract.ts` joins it the same way).
 */
const under = (path: string, root: string): boolean => path === root || path.startsWith(root + '/');

/** Whether `path` is the MCP port's, or under it. */
export const onPort = (path: string): boolean => under(path, MCP_PATH);

/** Whether `path` is one the api answers on (`API_PATHS`): any other but the port's is a page of the board (board/board.ts). */
export const answered = (path: string): boolean => API_PATHS.some((root) => under(path, root));

/**
 * What a request to `path` needs of a token: the person's on the MCP port; a token, any live one, on a route the api answers where the
 * store is `exposed`; and none on a page of the board, which carries no data of the store, so that a browser reaching an exposed store
 * loads the page that asks for a token.
 */
export const needOf: NeedOf = (path, exposed) => (onPort(path) ? 'person' : exposed && answered(path) ? 'token' : 'none');

/** How a client sends a token, and where the person mints one. */
const SEND = "send one as `Authorization: Bearer <token>`: `nemia token add <name>`, at the store's machine, mints one of yours";

/** Why a token is refused for `reason`, and what the person who sent it does next. */
const REFUSED_WORDS: Readonly<Record<TokenRefusal, string>> = {
  'unknown-token': `no token the store keeps is this one, a session's or yours (a token of yours removed with nemia token rm is refused): ${SEND}`,
  'session-ended':
    "the try this session's token was minted for is no longer its step's live one, and a session's token ends with its try: run the command from the session its run filed, which carries WF_SESSION_TOKEN",
  'token-required': `this store is marked exposed (WF_EXPOSED=1), or the route is the MCP port, so a request with no token is refused: ${SEND}`,
  'person-token-required': `the MCP port takes a token of yours, never a session's: ${SEND}`,
};

/**
 * The caller `token` is (`undefined`: none presented), asked of the package over the app's engine and store for a route that needs `need`;
 * refused, `Unauthorized`.
 */
export async function callerBy(
  c: Parameters<MiddlewareHandler<ApiEnv>>[0],
  token: string | undefined,
  need: TokenNeed,
): Promise<ProposalCaller> {
  if (token === undefined && need === 'none') return PERSON;
  const { e, placed } = await c.var.runtime.runPromise(
    Effect.gen(function* () {
      const placed = { placeService: yield* PlaceService, home: yield* StoreRoot, config: yield* StoreConfig, trace: yield* traceOf(c) };
      return { e: yield* Engine, placed };
    }),
  );
  const caller = await runPlaced(placed, e, sessionCaller(token, need));
  if (caller.kind !== 'refused') return caller;
  throw new Unauthorized({
    reason: caller.reason,
    message: `${c.req.method} ${c.req.path} refuses its request (${caller.reason}): ${REFUSED_WORDS[caller.reason]}.`,
  });
}

/** Whether the store the app serves is marked exposed (`WF_EXPOSED=1`), read afresh from its settings. */
const exposedOf = (c: Parameters<MiddlewareHandler<ApiEnv>>[0]): Promise<boolean> =>
  c.var.runtime.runPromise(Effect.map(StoreConfig, (config) => config.exposed));

/**
 * The middleware that puts the request's caller on it (`c.var.caller`), or refuses it 401 before any router is reached: the need its
 * route has of a token (`needOf`) judged with the token it presents. A refusal on the MCP port says `WWW-Authenticate: Bearer`, as a
 * client of the port reads it; a refusal of a token presented by the board's cookie alone clears the cookie, so a browser holding one
 * gone stale (its token removed with `nemia token rm`) sends none after, and the board's token page asks for another.
 */
export const callerGate: MiddlewareHandler<ApiEnv> = async (c, next) => {
  let caller: ProposalCaller;
  try {
    caller = await callerOfRequest(c);
  } catch (err) {
    if (err instanceof Unauthorized && onPort(c.req.path)) c.header('WWW-Authenticate', 'Bearer');
    if (err instanceof Unauthorized && bearerOf(c.req.header('authorization')) === undefined && cookieTokenOf(c) !== undefined)
      deleteCookie(c, TOKEN_COOKIE, { path: '/', httpOnly: true, sameSite: 'Strict' });
    throw err;
  }
  c.set('caller', caller);
  await next();
};

/**
 * The caller a request is, by the token it presents and what its route needs of one; refused, `Unauthorized`. The token is the bearer
 * (`Authorization: Bearer <token>`), else the board's cookie (`TOKEN_COOKIE`, which `POST /api/session` sets) on a path the api answers
 * or the port's: a page of the board carries no data and reads no cookie, so one gone stale still loads the page that asks for a token.
 */
async function callerOfRequest(c: Parameters<MiddlewareHandler<ApiEnv>>[0]): Promise<ProposalCaller> {
  const path = c.req.path;
  const bearer = bearerOf(c.req.header('authorization'));
  if (bearer === null)
    throw new Unauthorized({
      message: `${c.req.method} ${path} reads its Authorization header as \`Bearer <token>\`, and this one is not: send a token as \`Authorization: Bearer <token>\` — a session's is in $WF_SESSION_TOKEN, and \`nemia token add <name>\` mints one of yours.`,
    });
  const token = bearer ?? (onPort(path) || answered(path) ? cookieTokenOf(c) : undefined);
  return callerBy(c, token, needOf(path, await exposedOf(c)));
}
