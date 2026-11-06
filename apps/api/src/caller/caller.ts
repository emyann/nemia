/**
 * Who a request is from: the session token it presents (`Authorization: Bearer <token>`), asked of the package (`sessionCaller`), none
 * being the person. Resolved once per request, before any router is reached (`callerGate`, app.ts), and put on the request for `served`
 * to hand every handler as `caller` (layer.ts): a proposal's and a delegation's handlers read it there.
 *
 * Every request that presents a token is judged, whatever its route, not only the proposals' and delegations': a session's client sends
 * its token on every request (apps/cli), so a token refused on a read is the same forged or ended token a write would carry, and a
 * session that learns so on its first request learns it before it acts. A header that is not `Bearer <token>`, and a token the store never
 * minted or whose try is no longer the live one, are refused 401 (`Unauthorized`, with its reason), answered by `answerError` (app.ts).
 */
import { Effect } from 'effect';
import { TaggedError } from 'effect/Data';
import type { MiddlewareHandler } from 'hono';
import { PERSON, PlaceService, sessionCaller, type ProposalCaller } from 'agent-orchestrator';
import type { TokenRefusal } from 'objects';
import type { ApiEnv } from '../layer.ts';
import { Engine, runPlaced, StoreRoot } from '../store.ts';

/** A request whose token the api refuses, with the reason where it presented one: the api's 401 (`objects`' `Unauthorized`). */
export class Unauthorized extends TaggedError('Unauthorized')<{ readonly message: string; readonly reason?: TokenRefusal }> {
  readonly exitCode = 2;
}

/** What a request's `Authorization` header presents: no header (`undefined`), a bearer token, or a header of another shape (`null`). */
export function bearerOf(header: string | undefined): string | undefined | null {
  if (header === undefined) return undefined;
  const match = /^Bearer +(\S+)\s*$/i.exec(header.trim());
  return match?.[1] ?? null;
}

/** What the person who runs a session's command is told to do of a token refused for `reason`. */
const REFUSED_WORDS: Readonly<Record<TokenRefusal, string>> = {
  'unknown-token': 'no session the store filed was given this token',
  'session-ended': "the try this token was minted for is no longer its step's live one",
};

/** The caller `token` is (`undefined`: none presented), asked of the package over the app's engine and store; refused, `Unauthorized`. */
export async function callerBy(c: Parameters<MiddlewareHandler<ApiEnv>>[0], token: string | undefined): Promise<ProposalCaller> {
  if (token === undefined) return PERSON;
  const { e, placeService, home } = await c.var.runtime.runPromise(
    Effect.gen(function* () {
      return { e: yield* Engine, placeService: yield* PlaceService, home: yield* StoreRoot };
    }),
  );
  const caller = await runPlaced({ placeService, home }, e, sessionCaller(token));
  if (caller.kind !== 'refused') return caller;
  throw new Unauthorized({
    reason: caller.reason,
    message: `${c.req.method} ${c.req.path} refuses its session token (${caller.reason}): ${REFUSED_WORDS[caller.reason]}. A session's token ends with its try: run the command from the session its run filed, which carries WF_SESSION_TOKEN.`,
  });
}

/** The middleware that puts the request's caller on it (`c.var.caller`), or refuses its token 401 before any router is reached. */
export const callerGate: MiddlewareHandler<ApiEnv> = async (c, next) => {
  const token = bearerOf(c.req.header('authorization'));
  if (token === null)
    throw new Unauthorized({
      message: `${c.req.method} ${c.req.path} reads its Authorization header as \`Bearer <token>\`, and this one is not: send a session's token as \`Authorization: Bearer $WF_SESSION_TOKEN\`.`,
    });
  c.set('caller', await callerBy(c, token));
  await next();
};
