/**
 * The commands of pairing and first-visit links, entries of the command table: `nemia pairings ls`, `nemia pairings approve`, `nemia board
 * link` and `nemia open`. Run at the server's shell, the person's own seat, each reads the store's tickets (`pairing.store.ts`); the api
 * serves the same endpoints with handlers of its own, which judge the caller a person before they approve or mint, so each entry is the
 * command line's and links the endpoint the api serves it on. The writes are out of an agent's reach (class `none`): a pairing approved or
 * a link minted ends in a person's token. No command prints a token: a token is minted at a ticket's claim and handed to the client that
 * claims it: by the claims the api serves alone (`pairingClaimed`, `linkClaimed`), which mint it through the token store once the store's
 * tickets have marked the claim.
 */
import { Effect } from 'effect';
import { BOARD_LINK_WORDS, OPEN_WORDS, PAIRINGS_APPROVE_WORDS, PAIRINGS_LS_WORDS } from 'objects';
import type { LinkMinted, Pairing, PairingClaimed, PairingList } from 'objects';
import type { Args } from '../command/command.ts';
import type { Served } from '../command/entry.verb.ts';
import { StoreRoot } from '../config/root.store.ts';
import type { Env } from '../config/config.store.ts';
import { daemonStanding } from '../daemon/daemon.store.ts';
import { tried } from '../runtime-client.ts';
import { mintPersonTokenFree } from '../token/token.store.ts';
import { linkMarked, linkMinted, pairingApproved, pairingMarked, pairingsListed, type Marked } from './pairing.store.ts';

/** A person's token minted at `nowMs` for the claim `marked`, under its name or the first free after it; the mark taken back if refused. */
function mintedFor(home: string, marked: Marked, nowMs: number) {
  try {
    return mintPersonTokenFree(home, marked.name, new Date(nowMs));
  } catch (err) {
    marked.unmarked();
    throw err;
  }
}

/**
 * The pairing `id` claimed with `secret` at `nowMs`: a pairing that waits for its approval answers its phase alone, and the client asks
 * again; an approved one is marked claimed and a person's token minted for it, named after its client (`-2`, `-3`… where the name is
 * taken), answered this once with its name. Refused: a pairing the store does not keep or a secret not its own (`Missing`), and one
 * claimed already or past its time (`Conflict`). The api's `POST /api/pairings/:id/claim`.
 * @param home The store's root.
 * @param id The pairing's id.
 * @param secret The secret the client presents, which must be the pairing's own.
 * @param nowMs The time of the claim, in ms since the epoch.
 */
export function pairingClaimed(home: string, id: string, secret: string, nowMs: number) {
  const marked = pairingMarked(home, id, secret, nowMs);
  if ('phase' in marked) return marked satisfies PairingClaimed as PairingClaimed;
  return { phase: 'claimed', ...mintedFor(home, marked, nowMs) } satisfies PairingClaimed as PairingClaimed;
}

/**
 * The first-visit link whose secret is `secret` claimed at `nowMs`: marked claimed and a person's token minted for the browser that
 * opened it, named `board-<day>` (`-2`, `-3`… where taken), answered this once with its name, for the board's cookie. Refused: a link the
 * store does not keep (`Missing`), and one claimed already or past its time (`Conflict`). The api's `POST /api/links/claim`.
 * @param home The store's root.
 * @param secret The link's secret, as the browser presents it.
 * @param nowMs The time of the claim, in ms since the epoch.
 */
export function linkClaimed(home: string, secret: string, nowMs: number) {
  return mintedFor(home, linkMarked(home, secret, nowMs), nowMs);
}

/** The port the api listens on where nothing says another: the daemon's. */
const API_PORT = 8787;

/** An address as a URL's host takes it: a wildcard as the loopback, an IPv6 one between brackets. */
const hostShown = (address: string) => {
  if (address === '0.0.0.0') return '127.0.0.1';
  if (address === '::') return '[::1]';
  return address.includes(':') ? `[${address}]` : address;
};

/** A url's loopback host, `127.0.0.1` or `[::1]`, at its scheme's end. */
const LOOPBACK_URL_HOST = /^(https?:\/\/)(?:127\.0\.0\.1|\[::1\])(?=[:/]|$)/i;

/**
 * The board's address a first-visit link is printed under where `--base` gives none: where the api ticking the store says it serves (its
 * lease's url: the bound address, or the loopback for every interface), else `http://<NEMIA_BIND or the loopback>:<PORT or 8787>` of
 * `env`. The loopback is named `localhost`, the name a person types on their own machine: the board's cookie is kept per host name, so
 * every link printed on this machine names it alike, and the api takes it (`loopback`, apps/api).
 * @param leaseUrl The url the api ticking the store serves at, off its lease, or undefined where none ticks it.
 * @param env The environment, whose `NEMIA_BIND` and `PORT` are read where no lease says the url.
 */
export const boardBase = (leaseUrl: string | undefined, env: Env) =>
  (leaseUrl ?? `http://${hostShown(env.NEMIA_BIND?.trim() || '127.0.0.1')}:${env.PORT?.trim() || API_PORT}`).replace(
    LOOPBACK_URL_HOST,
    '$1localhost',
  );

/** The url the api ticking the store `home` serves at, off its lease, or undefined where none ticks it. */
const leaseUrl = (home: string) => {
  const standing = daemonStanding(home);
  return standing.kind === 'ticking' && standing.file.by === 'api' ? standing.file.url : undefined;
};

/** `nemia pairings ls`. */
export const PAIRINGS_LS: Served<PairingList> = {
  ...PAIRINGS_LS_WORDS,
  handler: () => Effect.flatMap(StoreRoot, (home) => tried(() => pairingsListed(home, Date.now()))),
};

/** `nemia pairings approve <code>`. */
export const PAIRINGS_APPROVE: Served<Pairing> = {
  ...PAIRINGS_APPROVE_WORDS,
  handler: (args: Args) => Effect.flatMap(StoreRoot, (home) => tried(() => pairingApproved(home, String(args.code ?? ''), Date.now()))),
};

/**
 * A first-visit link minted for the store, under `--base` where given, else the board's own address (`boardBase`).
 * @param args The words typed after the command's name, whose `base` is read.
 */
const linkHandler = (args: Args) =>
  Effect.flatMap(StoreRoot, (home) =>
    tried(() => linkMinted(home, typeof args.base === 'string' ? args.base : boardBase(leaseUrl(home), process.env), Date.now())),
  );

/** `nemia board link [--base <url>]`. */
export const BOARD_LINK: Served<LinkMinted> = { ...BOARD_LINK_WORDS, handler: linkHandler };

/** `nemia open [--base <url>]`: the same link, which the client opens in this machine's browser. */
export const OPEN: Served<LinkMinted> = { ...OPEN_WORDS, handler: linkHandler };

/** The pairing commands, in the order `nemia`'s help lists them. */
export const PAIRING_COMMANDS: readonly Served[] = [PAIRINGS_LS, PAIRINGS_APPROVE, BOARD_LINK, OPEN] as readonly Served[];
