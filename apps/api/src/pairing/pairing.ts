/**
 * The pairings and links groups' handlers (`objects`' `PairingsGroup`, `LinksGroup`): a pairing asked, claimed, listed and approved, and
 * a first-visit link minted and claimed, each over the orchestrator's tickets (`pairingAsked`, `pairingClaimed`, `pairingsListed`,
 * `pairingApproved`, `linkMinted`, `linkClaimed`), at the store's root, at the time the clock reads once for the request (`nowMs`), each
 * refusal answered by the one map (`answeredWrite`, objects/refused.ts). No answer carries a token but a pairing's claim, once.
 *
 * Three routes a client with no token yet reaches, exposed or not, each named by its method and path (`openRoute` and `needOf`,
 * caller/caller.ts, over the paths of caller/paths.ts): each judges the secret it is sent, and none answers with the store's data.
 * - `POST /api/pairings` — a pairing asked for the client it names: its id, the short code the person approves, the secret its claim
 *   sends and when it lapses. 422 (`Invalid`) for a client's name out of its form.
 * - `POST /api/pairings/:id/claim` — the pairing claimed with its secret: `{ phase: 'waiting' }` while no person approved it, the client
 *   asking again; once approved, a person token minted now under the client's name and answered once. 404 (`Missing`) for an unknown id
 *   or a wrong secret, 409 (`Conflict`) for one claimed already or lapsed.
 * - `POST /api/links/claim` — a first-visit link claimed with its secret: a person token minted now and set as the board's HttpOnly
 *   cookie, as `POST /api/session` sets it (`cookieSent`, server/session.ts), answered `{ cookie: 'set', name }`, never the token. 404
 *   for an unknown secret, 409 for one claimed already or lapsed.
 *
 * The person's side, which needs a token on every store, loopback included, as every other route does:
 * - `GET /api/pairings` — the pairings the store keeps, newest first, never a code or a secret.
 * - `POST /api/pairings/approve` — the pairing the short code in its body names approved, the code read in either case, with or without
 *   its dash. 403 (`Forbidden`) unless the caller is the person (a token they hold, by the bearer or the board's cookie): a
 *   session's token never lets another client in. 404 for no pairing under the code, 409 for one lapsed or claimed.
 * - `POST /api/links` — a first-visit link minted under `base`, else the board's own address (`boardBase`: the address the api ticking
 *   the store leased, else the one it listens on). 403 unless the caller is the person; 422 (`Invalid`) for a base that is no http(s) url.
 */
import { Clock, Effect } from 'effect';
import { readsBounded } from '../objects/answer-bound.ts';
import {
  boardBase,
  daemonStanding,
  linkClaimed,
  linkMinted,
  pairingApproved,
  pairingAsked,
  pairingClaimed,
  pairingsListed,
} from 'agent-orchestrator';
import { Api } from 'objects';
import type { Served } from '../layer.ts';
import { personOnly } from '../caller/index.ts';
import { answeredWrite } from '../objects/refused.ts';
import { cookieSent, overHttps } from '../server/session.ts';

/** `work` over the request's services at the time the clock reads now, read once for the request; a refusal answered by the one map. */
const ticketed = <A>(work: (s: Served, nowMs: number) => A | Promise<A>) =>
  Effect.flatMap(Clock.currentTimeMillis, (nowMs) => answeredWrite(async (s) => work(s, nowMs)));

/** The url the api ticking the store `home` serves at, as its lease says; none where no api ticks it. */
const leasedUrl = (home: string) => {
  const standing = daemonStanding(home);
  return standing.kind === 'ticking' && standing.file.by === 'api' ? standing.file.url : undefined;
};

export const pairingsHandlers = readsBounded(Api, 'pairings', (handlers) =>
  handlers
    .handle('ask', ({ payload }) => ticketed((s, nowMs) => pairingAsked(s.home, payload.client, nowMs)))
    .handle('claim', ({ params, payload }) => ticketed((s, nowMs) => s.inRequest(pairingClaimed(s.home, params.id, payload.secret, nowMs))))
    .handle('list', () => ticketed((s, nowMs) => pairingsListed(s.home, nowMs)))
    .handle('approve', ({ payload }) =>
      ticketed((s, nowMs) => {
        personOnly(s, 'POST /api/pairings/approve', `\`nemia pairings approve ${payload.code}\``);
        return pairingApproved(s.home, payload.code, nowMs);
      }),
    ),
);

export const linksHandlers = readsBounded(Api, 'links', (handlers) =>
  handlers
    .handle('mint', ({ payload }) =>
      ticketed((s, nowMs) => {
        personOnly(s, 'POST /api/links', '`nemia board link`');
        return linkMinted(s.home, payload.base ?? boardBase(leasedUrl(s.home), s.env), nowMs);
      }),
    )
    .handle('claim', ({ payload, request }) =>
      Effect.gen(function* () {
        const { token, name } = yield* ticketed((s, nowMs) => s.inRequest(linkClaimed(s.home, payload.secret, nowMs)));
        yield* cookieSent(token, overHttps(request));
        return { cookie: 'set', name } as const;
      }),
    ),
);
