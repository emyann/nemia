/**
 * Whether the api has asked this browser for a token, as a component reads it: the board draws the token page in place of every page
 * once any read or write is answered with one of the two refusals a pasted token answers (`tokenAskOf`, `lib/api/read.ts`).
 */
import { useSyncExternalStore } from 'react';
import { onTokenAsked, tokenAsked, type TokenAsked } from './api/read.ts';

/** The token the api last asked this page for, or null while it asked for none: drawn again when it asks. */
export const useTokenAsked = (): TokenAsked | null => useSyncExternalStore(onTokenAsked, tokenAsked);
