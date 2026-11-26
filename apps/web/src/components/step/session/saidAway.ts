import { createContext } from 'react';

/**
 * What shows the step's part, and its Said, where the talk stands in the part's place: given by what draws the talk there (the step's
 * bar); null where the part stands above the talk (the session's page).
 */
export const SaidAway = createContext<(() => void) | null>(null);
