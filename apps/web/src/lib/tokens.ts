/**
 * A standing token in the board's words, as the Tokens page lists it (`TokenTable`): who holds it and where it reaches. Pure.
 */
import type { Token } from 'objects';

/**
 * Who holds a token, in the board's words: `yours` for the person's, the agent's name for an agent's.
 * @param token The token: its holder and, for an agent's, the agent's name.
 */
export const holderWord = (token: Pick<Token, 'holder' | 'agent'>) => (token.holder === 'person' ? 'yours' : (token.agent ?? 'an agent'));

/**
 * Where a token reaches: the factory it is bound to, or `store-wide` where it names none.
 * @param token The token: the factory it is bound to, if any.
 */
export const reachWord = (token: Pick<Token, 'factory'>) => token.factory ?? 'store-wide';
