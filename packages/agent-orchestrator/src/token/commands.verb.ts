/**
 * `nemia token add`, `nemia token ls` and `nemia token rm`, entries of the command table: the standing tokens, minted by the person under a
 * name for a holder — the person, or an agent bound to one factory or store-wide and maybe narrowed — printed once, listed by name and
 * retired by name, a request presenting one refused as unknown from then on. Served by the api's `tokens` group, whose handlers take the
 * person's token alone (`personOnly`) before they call these; out of an agent's reach (class `none`) but for the list, a read of names.
 * The in-process CLI serves none of them: a token is minted through the api, where the caller is judged.
 */
import { Effect } from 'effect';
import { TOKEN_ADD_WORDS, TOKEN_LS_WORDS, TOKEN_RM_WORDS, type Token, type TokenList, type TokenMinted } from 'objects';
import type { Args } from '../command/command.ts';
import type { Served } from '../command/entry.verb.ts';
import { Invalid } from '../refusal/refusal.ts';
import type { TokenHolder } from './token.ts';
import { TokenDoor, holderOf, type PersonTokenFiled } from './token.store.ts';

/** A text argument, or undefined where it was not given. */
const textOf = (args: Args, key: string): string | undefined => (typeof args[key] === 'string' ? args[key] : undefined);

/** The token `record` is, as the api lists it: its name, its holder and when it was minted; never the token, nor its digest. */
export function tokenOf(record: PersonTokenFiled): Token {
  const holder = holderOf(record);
  if (holder.kind === 'person') return { name: record.name, holder: 'person', createdAt: record.createdAt };
  return {
    name: record.name,
    holder: 'agent',
    agent: holder.agent,
    ...(holder.factory === null ? {} : { factory: holder.factory }),
    ...(holder.narrowed === null ? {} : { narrowed: holder.narrowed }),
    createdAt: record.createdAt,
  };
}

/**
 * The holder `args` say: an agent's where `--agent` names one, bound to `--factory` (store-wide where left out) and narrowed by
 * `--narrow`; else the person's. Refused `Invalid`: a factory or a narrowing with no agent, and a narrowing that is neither `read` nor
 * `act` — a token is never widened, so none is above the agent's own floor.
 */
export function holderAsked(args: Args): TokenHolder {
  const agent = textOf(args, 'agent');
  const factory = textOf(args, 'factory');
  const narrowed = textOf(args, 'narrowed');
  if (narrowed !== undefined && narrowed !== 'read' && narrowed !== 'act')
    throw new Invalid({ message: `--narrow takes read or act, not ${narrowed}: nemia token add <name> --agent <agent> --narrow read.` });
  if (agent === undefined) {
    if (factory !== undefined || narrowed !== undefined)
      throw new Invalid({
        message: `a factory or a narrowing says an agent's token, and this one names no agent: nemia token add <name> --agent <agent> [--factory <factory>] [--narrow read|act].`,
      });
    return { kind: 'person' };
  }
  return { kind: 'agent', agent, factory: factory ?? null, narrowed: narrowed ?? null };
}

/** `nemia token add <name> [--agent <agent> [--factory <factory>] [--narrow read|act]]`: a standing token minted, answered once. */
export const TOKEN_ADD: Served<TokenMinted> = {
  ...TOKEN_ADD_WORDS,
  handler: (args: Args) =>
    Effect.gen(function* () {
      const name = String(args.name ?? '');
      const holder = yield* Effect.try({ try: () => holderAsked(args), catch: (err) => err as Invalid });
      const door = yield* TokenDoor;
      const token = yield* door.persons.mint(name, holder);
      const kept = (yield* door.persons.list()).find((t) => t.name === name);
      return { ...tokenOf(kept ?? { name, createdAt: new Date().toISOString(), holder }), token };
    }),
};

/** `nemia token ls`: the standing tokens the store keeps, each its name, holder and when it was minted, never a token or its digest. */
export const TOKEN_LS: Served<TokenList> = {
  ...TOKEN_LS_WORDS,
  handler: () => Effect.flatMap(TokenDoor, (door) => door.persons.list()).pipe(Effect.map((kept) => ({ tokens: kept.map(tokenOf) }))),
};

/** `nemia token rm <name>`: the token named retired, a request presenting it refused as unknown from then on. */
export const TOKEN_RM: Served<Token> = {
  ...TOKEN_RM_WORDS,
  handler: (args: Args) => Effect.flatMap(TokenDoor, (door) => door.persons.revoke(String(args.name ?? ''))).pipe(Effect.map(tokenOf)),
};

/** The token commands, in the order `nemia`'s help lists them. */
export const TOKEN_COMMANDS: readonly Served[] = [TOKEN_ADD, TOKEN_LS, TOKEN_RM] as readonly Served[];
