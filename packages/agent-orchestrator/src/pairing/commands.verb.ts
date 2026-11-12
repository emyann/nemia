/**
 * The commands of pairing and first-visit links, entries of the command table: `nemia pairings ls`, `nemia pairings approve` and
 * `nemia board link`. Run at the server's shell, the person's own seat, each reads the store's tickets (`pairing.store.ts`); the api
 * serves the same endpoints with handlers of its own, which judge the caller a person before they approve or mint, so each entry is the
 * command line's and links the endpoint the api serves it on. The writes are out of an agent's reach (class `none`): a pairing approved
 * or a link minted ends in a person's token. No command prints a token: a token is minted at a ticket's claim and handed to the client
 * that claims it: by the claims the api serves alone (`pairingClaimed`, `linkClaimed`), which mint it through the token store once the
 * store's tickets have marked the claim.
 */
import { Effect } from 'effect';
import type { LinkMinted, Pairing, PairingClaimed, PairingList } from 'objects';
import type { Args, Spec } from '../command/command.ts';
import type { Command } from '../command/entry.verb.ts';
import { StoreRoot } from '../config/root.store.ts';
import type { Env } from '../config/config.store.ts';
import { daemonStanding } from '../daemon/daemon.store.ts';
import { tried } from '../runtime-client.ts';
import { mintPersonTokenFree } from '../token/token.store.ts';
import { linkMarked, linkMinted, pairingApproved, pairingMarked, pairingsListed, type Marked } from './pairing.store.ts';

/** A person's token minted at `nowMs` for the claim `marked`, under its name or the first free after it; the mark taken back if refused. */
function mintedFor(home: string, marked: Marked, nowMs: number): { token: string; name: string } {
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
 * claimed already or past its time (`Conflict`). The api's `POST /api/pair/:id/claim`.
 */
export function pairingClaimed(home: string, id: string, secret: string, nowMs: number): PairingClaimed {
  const marked = pairingMarked(home, id, secret, nowMs);
  if ('phase' in marked) return marked;
  return { phase: 'claimed', ...mintedFor(home, marked, nowMs) };
}

/**
 * The first-visit link whose secret is `secret` claimed at `nowMs`: marked claimed and a person's token minted for the browser that
 * opened it, named `board-<day>` (`-2`, `-3`… where taken), answered this once with its name, for the board's cookie. Refused: a link the
 * store does not keep (`Missing`), and one claimed already or past its time (`Conflict`). The api's `POST /api/pair/link`.
 */
export function linkClaimed(home: string, secret: string, nowMs: number): { token: string; name: string } {
  return mintedFor(home, linkMarked(home, secret, nowMs), nowMs);
}

/** Why a pairing command is the command line's, beside the endpoint the api serves it on. */
const CLI_ALONE = {
  side: 'cli',
  why: "the api serves its endpoint with a handler of its own, which takes a person's token alone; at the server's shell the person is the caller",
} as const;

/** The port the api listens on where nothing says another: the daemon's. */
const API_PORT = 8787;

/** An address as a URL's host takes it: a wildcard as the loopback, an IPv6 one between brackets. */
const hostShown = (address: string): string => {
  if (address === '0.0.0.0') return '127.0.0.1';
  if (address === '::') return '[::1]';
  return address.includes(':') ? `[${address}]` : address;
};

/**
 * The board's address a first-visit link is printed under where `--base` gives none: where the api ticking the store says it serves (its
 * lease's url: the bound address, or the loopback for every interface), else `http://<NEMIA_BIND or 127.0.0.1>:<PORT or 8787>` of `env`.
 */
export const boardBase = (leaseUrl: string | undefined, env: Env): string =>
  leaseUrl ?? `http://${hostShown(env.NEMIA_BIND?.trim() || '127.0.0.1')}:${env.PORT?.trim() || API_PORT}`;

/** The url the api ticking the store `home` serves at, off its lease, or undefined where none ticks it. */
const leaseUrl = (home: string): string | undefined => {
  const standing = daemonStanding(home);
  return standing.kind === 'ticking' && standing.file.by === 'api' ? standing.file.url : undefined;
};

/** `nemia pairings ls`. */
export const PAIRINGS_LS: Command<PairingList> = {
  name: 'pairings ls',
  usage: '',
  help: [
    'the pairings the store keeps, newest first: the client that asked, and',
    'whether it waits for your approval, is approved, was claimed or lapsed.',
    'Never a code: approve the one the client shows with nemia pairings approve',
  ],
  spec: { positionals: [], flags: [], unknown: (arg) => `nemia pairings ls takes nothing, not ${arg}: nemia pairings ls.` },
  writes: false,
  class: 'read',
  only: CLI_ALONE,
  served: [{ endpoint: 'pairings.list' }],
  handler: () => Effect.flatMap(StoreRoot, (home) => tried(() => pairingsListed(home, Date.now()))),
  print: ({ pairings }) =>
    pairings.length
      ? pairings.map((p) => `${p.id}  ${p.client}  ${p.phase}  expires ${p.expiresAt}`)
      : ['no pairing is kept: a client asks for one with nemia pair <url>'],
};

/** How `nemia pairings approve` is typed, as its refusals end on it. */
const APPROVE_SHAPE = 'nemia pairings approve <code>, the code the client shows, as nemia pairings approve K7QM-3XRP';

/** The spec of `nemia pairings approve`: the code alone. */
const approveSpec: Spec = {
  positionals: [{ key: 'code', takes: 'required', kind: 'text' }],
  flags: [],
  unknown: (arg) => `nemia pairings approve takes one code, not ${arg} besides: ${APPROVE_SHAPE}.`,
  missing: `nemia pairings approve takes the code the client shows: ${APPROVE_SHAPE}.`,
};

/** `nemia pairings approve <code>`. */
export const PAIRINGS_APPROVE: Command<Pairing> = {
  name: 'pairings approve',
  usage: '<code>',
  help: [
    'approve the pairing whose code a client shows (XXXX-XXXX, in either',
    "case, the dash left out or not): the client's next ask claims a token",
    'of yours minted then, named after it; nemia token rm <name> revokes it',
  ],
  spec: approveSpec,
  writes: true,
  class: 'none',
  only: CLI_ALONE,
  served: [{ endpoint: 'pairings.approve' }],
  handler: (args: Args) => Effect.flatMap(StoreRoot, (home) => tried(() => pairingApproved(home, String(args.code ?? ''), Date.now()))),
  print: (p) => [
    `approved ${p.client}'s pairing: it claims its token on its next ask, until ${p.expiresAt}`,
    'the token is named after it: nemia token ls lists it once claimed, nemia token rm revokes it',
  ],
};

/** How `nemia board link` is typed, as its refusals end on it. */
const LINK_SHAPE = 'nemia board link [--base <url>]';

/** `nemia board link [--base <url>]`. */
export const BOARD_LINK: Command<LinkMinted> = {
  name: 'board link',
  usage: '[--base <url>]',
  help: [
    'a first-visit link to the board, opened once within ten minutes: the',
    'browser that opens it is signed in with a token of yours minted then,',
    'named board-<day>. Printed under where the api serves (its bound',
    'address, or 127.0.0.1); --base <url> prints it under another, the name',
    'you reach the board by (a browser keeps one cookie per host name)',
  ],
  spec: {
    positionals: [],
    flags: [
      { flag: '--base', kind: 'text', key: 'base', takes: `--base takes the board's address, like --base http://box:8787: ${LINK_SHAPE}.` },
    ],
    unknown: (arg) => `nemia board link does not take ${arg}: ${LINK_SHAPE}.`,
  },
  writes: true,
  class: 'none',
  only: CLI_ALONE,
  served: [{ endpoint: 'pairings.link' }],
  handler: (args: Args) =>
    Effect.flatMap(StoreRoot, (home) =>
      tried(() => linkMinted(home, typeof args.base === 'string' ? args.base : boardBase(leaseUrl(home), process.env), Date.now())),
    ),
  print: ({ url, expiresAt }) => [url, `open it once, until ${expiresAt}: it signs that browser in, and no other`],
};

/** The pairing commands, in the order `nemia`'s help lists them. */
export const PAIRING_COMMANDS: readonly Command[] = [PAIRINGS_LS, PAIRINGS_APPROVE, BOARD_LINK] as readonly Command[];
