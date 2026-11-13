/**
 * The words of the person's standing tokens: `nemia token add`, `nemia token ls` and `nemia token rm`, each served by the `tokens` group
 * of the api (`GET` and `POST /api/tokens`, `DELETE /api/tokens/:name`), whose handlers take the person's token alone. A token is minted
 * for the person, under the name of the device it is for, or for an agent (`--agent`), bound to one factory (`--factory`) or store-wide,
 * and maybe narrowed (`--narrow read|act`). The writes are out of an agent's reach (class `none`): a token minted is a credential. Pure.
 */
import type { Args, CommandWords } from './command.ts';
import { FLOOR_NARROWINGS } from './words.ts';

/** Why a token command is the command line's, beside the endpoint the api serves it on. */
const CLI_ALONE = {
  side: 'cli',
  why: "the api serves its endpoint with a handler of its own, which takes a token the person holds alone; a token minted is a credential, never a tool's",
} as const;

/** How `nemia token add` is typed, as its refusals end on it. */
const ADD_SHAPE = 'nemia token add <name> [--agent <agent> [--factory <factory>] [--narrow read|act]], as nemia token add laptop';

/** The narrowing `narrow` is, or a refusal naming the two. */
const narrowRefusal = (narrow: Args[string]): string | null =>
  narrow === undefined || (FLOOR_NARROWINGS as readonly unknown[]).includes(narrow)
    ? null
    : `--narrow takes read or act, not ${typeof narrow === 'string' ? narrow : JSON.stringify(narrow)}: ${ADD_SHAPE}.`;

/** `nemia token add <name>`: a standing token minted, printed this once. */
export const TOKEN_ADD_WORDS = {
  name: 'token add',
  usage: '<name> [--agent <agent> [--factory <factory>] [--narrow read|act]]',
  help: [
    'mint a token under a name, printed this once: the store keeps only its',
    'digest. With no --agent it is yours, named for the device it is for: a',
    'request presenting it, as Authorization: Bearer <token>, is you. With',
    '--agent <agent> it is that agent: it reaches what an agent may at the',
    "factories' levels, in one factory with --factory, and no higher than",
    '--narrow read (reads alone) or act (no answers). nemia token rm frees it',
  ],
  spec: {
    positionals: [{ key: 'name', takes: 'required', kind: 'name' }],
    flags: [
      { flag: '--agent', kind: 'name', key: 'agent', takes: `--agent takes the agent that holds the token: ${ADD_SHAPE}.` },
      { flag: '--factory', kind: 'name', key: 'factory', takes: `--factory takes the factory the token is bound to: ${ADD_SHAPE}.` },
      { flag: '--narrow', kind: 'name', key: 'narrowed', takes: `--narrow takes read or act: ${ADD_SHAPE}.` },
    ],
    unknown: (arg) => `nemia token add takes the token's name and its holder's flags, not ${arg}: ${ADD_SHAPE}.`,
    missing: `nemia token add takes the token's name: ${ADD_SHAPE}.`,
  },
  check: (args) =>
    narrowRefusal(args.narrowed) ??
    (args.agent === undefined && (args.factory !== undefined || args.narrowed !== undefined)
      ? `--factory and --narrow say an agent's token, and this one names no --agent: ${ADD_SHAPE}.`
      : null),
  writes: true,
  class: 'none',
  only: CLI_ALONE,
  served: [{ endpoint: 'tokens.mint' }],
} as const satisfies CommandWords;

/** `nemia token ls`: the standing tokens the store keeps, never a token itself. */
export const TOKEN_LS_WORDS = {
  name: 'token ls',
  usage: '',
  help: [
    'the tokens you minted, by name: who holds each, the factory and the',
    'narrowing of an agent’s, and when it was minted. Never a token itself',
  ],
  spec: { positionals: [], flags: [], unknown: (arg) => `nemia token ls takes nothing, not ${arg}: nemia token ls.` },
  writes: false,
  class: 'read',
  only: CLI_ALONE,
  served: [{ endpoint: 'tokens.list' }],
} as const satisfies CommandWords;

/** `nemia token rm <name>`: the token named retired, a request presenting it refused from then on. */
export const TOKEN_RM_WORDS = {
  name: 'token rm',
  usage: '<name>',
  help: ['retire the token named <name>: a request presenting it is refused', 'from then on'],
  spec: {
    positionals: [{ key: 'name', takes: 'required', kind: 'name' }],
    flags: [],
    unknown: (arg) => `nemia token rm takes the token's name alone, not ${arg}: nemia token rm <name>, as nemia token rm laptop.`,
    missing: `nemia token rm takes the token's name: nemia token rm <name>, as nemia token rm laptop.`,
  },
  writes: true,
  class: 'none',
  only: CLI_ALONE,
  served: [{ endpoint: 'tokens.retire' }],
} as const satisfies CommandWords;

/** The token words, in the order the help lists them. */
export const REST_TOKEN_WORDS = [TOKEN_ADD_WORDS, TOKEN_LS_WORDS, TOKEN_RM_WORDS] as const satisfies readonly CommandWords[];
