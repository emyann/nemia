/**
 * The person's standing tokens (`GET /api/tokens`, `DELETE /api/tokens/{name}`, the package's `token ls` and `token rm`), read and retired
 * through the objects' client as `objects` says them (`TokenList`, `Token`). Minting is the command line's alone (`TOKEN_ADD_WORDS`):
 * its answer is the token itself, which the board would have to show once and nowhere keep.
 */
import { queryOptions } from '@tanstack/react-query';
import { Token, TokenList } from 'objects';
import { call, read, write } from './objects.ts';

export type { Token, TokenList } from 'objects';

/**
 * The store's standing tokens, by name: read on each visit of the Tokens page and never polled, since a token is minted or retired by a
 * person, here or at the command line. A token that is no person's is refused it (403), which the page says.
 */
export const tokensQuery = queryOptions({
  queryKey: ['tokens'],
  queryFn: () => call((c) => c.tokens.list(), read(TokenList)),
  retry: false,
});

/**
 * Retires the token `name`, as the package's `token rm` does: from then on it is refused as unknown, wherever it is kept. Answers the
 * token as it was listed; rejects with the api's refusal in full — a token retired elsewhere first (404), or a caller that is no person
 * (403).
 */
export const retireToken = (name: string): Promise<Token> =>
  call(
    (c) => c.tokens.retire({ params: { name } }),
    write(Token, 'The token may be retired: read the list again before retiring it again.'),
  );
