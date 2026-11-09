import { useMedia } from './useMedia.ts';

const QUERY = '(prefers-reduced-motion: reduce)';

/**
 * Whether nothing may move: the person asked their system for reduced motion — or there is no browser to ask, as when a server renders,
 * where nothing is known and so nothing is set moving. Read again when the person changes the setting, with the page open.
 */
export const useReducedMotion = (): boolean => useMedia(QUERY, true);
