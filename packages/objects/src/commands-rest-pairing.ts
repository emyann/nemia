/**
 * The words of pairing and first-visit links: `nemia pairings ls`, `nemia pairings approve` and `nemia board link`. The api serves each
 * endpoint with a handler of its own, which judges the caller a person before it approves or mints; the writes are out of an agent's
 * reach (class `none`), since a pairing approved or a link minted ends in a person's token. Pure.
 */
import type { CommandWords } from './command.ts';

/** Why a pairing command is the command line's, beside the endpoint the api serves it on. */
const CLI_ALONE = {
  side: 'cli',
  why: "the api serves its endpoint with a handler of its own, which takes a person's token alone; at the server's shell the person is the caller",
} as const;

/** `nemia pairings ls`: the pairings the store keeps, newest first. */
export const PAIRINGS_LS_WORDS = {
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
} as const satisfies CommandWords;

/** How `nemia pairings approve` is typed, as its refusals end on it. */
const APPROVE_SHAPE = 'nemia pairings approve <code>, the code the client shows, as nemia pairings approve K7QM-3XRP';

/** `nemia pairings approve <code>`: the pairing whose code a client shows, approved. */
export const PAIRINGS_APPROVE_WORDS = {
  name: 'pairings approve',
  usage: '<code>',
  help: [
    'approve the pairing whose code a client shows (XXXX-XXXX, in either',
    "case, the dash left out or not): the client's next ask claims a token",
    'of yours minted then, named after it; nemia token rm <name> revokes it',
  ],
  spec: {
    positionals: [{ key: 'code', takes: 'required', kind: 'text' }],
    flags: [],
    unknown: (arg) => `nemia pairings approve takes one code, not ${arg} besides: ${APPROVE_SHAPE}.`,
    missing: `nemia pairings approve takes the code the client shows: ${APPROVE_SHAPE}.`,
  },
  writes: true,
  class: 'none',
  only: CLI_ALONE,
  served: [{ endpoint: 'pairings.approve' }],
} as const satisfies CommandWords;

/** How `nemia board link` is typed, as its refusals end on it. */
const LINK_SHAPE = 'nemia board link [--base <url>]';

/** `nemia board link [--base <url>]`: a first-visit link to the board, opened once. */
export const BOARD_LINK_WORDS = {
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
} as const satisfies CommandWords;

/** The pairing commands' words, in the order the help lists them. */
export const REST_PAIRING_WORDS = [PAIRINGS_LS_WORDS, PAIRINGS_APPROVE_WORDS, BOARD_LINK_WORDS] as const satisfies readonly CommandWords[];
