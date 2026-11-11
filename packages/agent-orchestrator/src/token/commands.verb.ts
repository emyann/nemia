/**
 * `nemia token add`, `nemia token ls` and `nemia token rm`, entries of the command table: a person's named tokens, each of them the
 * person, minted at the store's machine and printed there once (`TokenDoor`'s `persons`), listed by name, and removed by name, a request
 * presenting one refused as unknown from then on. Served on the CLI alone, since a caller of the port holding one token mints and revokes
 * no other, and out of an agent's reach (class `none`) but for the list, a read of names alone.
 */
import { Effect } from 'effect';
import type { Args, Spec } from '../command/command.ts';
import type { Command } from '../command/entry.verb.ts';
import { TokenDoor, type PersonTokenFiled } from './token.store.ts';

/** Why the token commands are served on the CLI alone. */
const CLI_ONLY = {
  side: 'cli',
  why: 'a token is minted where the store is and printed once to the person there; a caller of the port holding one token mints and revokes no other',
} as const;

/** The spec of a token command that takes a token's name, refusing anything else in words that end on how it is typed. */
const namedSpec = (command: string): Spec => ({
  positionals: [{ key: 'name', takes: 'required', kind: 'name' }],
  flags: [],
  unknown: (arg) => `${command} takes the token's name alone, not ${arg}: ${command} <name>, as ${command} laptop.`,
  missing: `${command} takes the token's name: ${command} <name>, as ${command} laptop.`,
});

/** The name a token command was given. */
const nameOf = (args: Args): string => String(args.name ?? '');

/** What `nemia token add` did: the name and the token, shown this once. */
export type TokenAdded = { readonly name: string; readonly token: string };

/** `nemia token add <name>`: a person's token minted under a name and printed once, with the header a client sends it in. */
export const TOKEN_ADD: Command<TokenAdded> = {
  name: 'token add',
  usage: '<name>',
  help: [
    'mint a token of yours under a name, printed this once: the store keeps',
    'only its digest. A request presenting it, as Authorization: Bearer',
    "<token>, is you, on the api and on the MCP port (claude mcp add's",
    '--header). Refused of a name already used: nemia token rm frees it',
  ],
  spec: namedSpec('nemia token add'),
  writes: true,
  class: 'none',
  only: CLI_ONLY,
  handler: (args) =>
    Effect.flatMap(TokenDoor, (door) => door.persons.mint(nameOf(args))).pipe(Effect.map((token) => ({ name: nameOf(args), token }))),
  print: ({ name, token }) => [
    `token ${name} minted — shown this once, the store keeps only its digest:`,
    token,
    'send it as the header:',
    `Authorization: Bearer ${token}`,
    `as claude mcp add --transport http nemia <api>/mcp --header "Authorization: Bearer ${token}"; nemia token rm ${name} revokes it`,
  ],
};

/** `nemia token ls`: the person's tokens the store keeps, each its name and when it was minted, never a token or its digest. */
export const TOKEN_LS: Command<{ readonly tokens: readonly PersonTokenFiled[] }> = {
  name: 'token ls',
  usage: '',
  help: ['your tokens, by name, with when each was minted: never a token itself'],
  spec: { positionals: [], flags: [], unknown: (arg) => `nemia token ls takes nothing, not ${arg}: nemia token ls.` },
  writes: false,
  class: 'read',
  only: CLI_ONLY,
  handler: () => Effect.flatMap(TokenDoor, (door) => door.persons.list()).pipe(Effect.map((tokens) => ({ tokens }))),
  print: ({ tokens }) =>
    tokens.length ? tokens.map((t) => `${t.name}  minted ${t.createdAt}`) : ['no token of yours is kept: nemia token add <name> mints one'],
};

/** `nemia token rm <name>`: the person's token named removed, a request presenting it refused as unknown from then on. */
export const TOKEN_RM: Command<PersonTokenFiled> = {
  name: 'token rm',
  usage: '<name>',
  help: ['remove your token named <name>: a request presenting it is refused', 'from then on'],
  spec: namedSpec('nemia token rm'),
  writes: true,
  class: 'none',
  only: CLI_ONLY,
  handler: (args) => Effect.flatMap(TokenDoor, (door) => door.persons.revoke(nameOf(args))),
  print: ({ name }) => [`token ${name} removed: a request presenting it is refused from now on`],
};

/** The token commands, in the order `nemia`'s help lists them. */
export const TOKEN_COMMANDS: readonly Command[] = [TOKEN_ADD, TOKEN_LS, TOKEN_RM] as readonly Command[];
