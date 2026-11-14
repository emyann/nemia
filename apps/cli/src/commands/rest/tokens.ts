/**
 * The person's standing tokens: `nemia token add <name> [--agent <agent> [--factory <factory>] [--narrow read|act]]` (`tokens.mint`), a
 * token minted and printed once, with the header a client sends it in; `nemia token ls` (`tokens.list`), the tokens by name and holder,
 * never a token; and `nemia token rm <name>` (`tokens.retire`), one retired. The api takes each from a token the person holds alone.
 */
import { type Args, type Token, TOKEN_ADD_WORDS, TOKEN_LS_WORDS, TOKEN_RM_WORDS } from 'objects';
import { asked } from '../../objects.ts';
import { said, textArg } from '../requests.ts';

/** Who holds `t`, in a few words: `yours`, or the agent's with its factory and narrowing. */
const heldBy = (t: Token): string =>
  t.holder === 'person'
    ? 'yours'
    : `${t.agent ?? 'an agent'}'s, ${t.factory === undefined ? 'store-wide' : `in ${t.factory}`}${t.narrowed === undefined ? '' : `, narrowed to ${t.narrowed}`}`;

/** `nemia token add`'s runner: the token, shown this once, and the header it is sent in. */
export async function tokenAdd(args: Args): Promise<number> {
  const name = textArg(args, 'name') ?? '';
  const agent = textArg(args, 'agent');
  const factory = textArg(args, 'factory');
  const narrowed = textArg(args, 'narrowed');
  const payload = {
    name,
    ...(agent === undefined ? {} : { agent }),
    ...(factory === undefined ? {} : { factory }),
    ...(narrowed === 'read' || narrowed === 'act' ? { narrowed } : {}),
  };
  const minted = await asked(TOKEN_ADD_WORDS.name, (c) => c.tokens.mint({ payload }));
  said([
    `token ${minted.name} minted, ${heldBy(minted)} — shown this once, the store keeps only its digest:`,
    minted.token,
    'send it as the header:',
    `Authorization: Bearer ${minted.token}`,
    `to <api>/mcp, the MCP port, or to the api; nemia token rm ${minted.name} retires it`,
  ]);
  return 0;
}

/** `nemia token ls`' runner: a line a token, or that none is kept. */
export async function tokenLs(): Promise<number> {
  const { tokens } = await asked(TOKEN_LS_WORDS.name, (c) => c.tokens.list());
  said(
    tokens.length
      ? tokens.map((t) => `${t.name}  ${heldBy(t)}  minted ${t.createdAt}`)
      : ['no token is kept: nemia token add <name> mints one'],
  );
  return 0;
}

/** `nemia token rm`'s runner: the token retired. */
export async function tokenRm(args: Args): Promise<number> {
  const name = textArg(args, 'name') ?? '';
  const t = await asked(TOKEN_RM_WORDS.name, (c) => c.tokens.retire({ params: { name } }));
  said([`token ${t.name} retired: a request presenting it is refused from now on`]);
  return 0;
}
