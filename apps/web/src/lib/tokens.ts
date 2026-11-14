/**
 * A standing token in the board's words, as the Tokens page lists it (`TokenTable`): who holds it and where it reaches. Pure.
 */
import type { Token } from 'objects';

/** Who holds a token, in the board's words: `yours` for the person's, the agent's name for an agent's. */
export const holderWord = (token: Pick<Token, 'holder' | 'agent'>): string =>
  token.holder === 'person' ? 'yours' : (token.agent ?? 'an agent');

/** Where a token reaches: the factory it is bound to, or `store-wide` where it names none. */
export const reachWord = (token: Pick<Token, 'factory'>): string => token.factory ?? 'store-wide';
