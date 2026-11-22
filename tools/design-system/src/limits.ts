/**
 * The producer's limits, shared by its decisions (`decide.ts`) and the contract that proves them (`contracts/produce.contract.ts`),
 * which imports them from here so the code never loads the verifier.
 */

/** The least height, in pixels, of a cell that drew something: a frame around an empty box measures under it. */
export const LEAST_DRAWN = 4;

/** The largest share of a card's frame a fixed layer may cover before the story is taken for one that opens over the whole window. */
export const MOST_COVERED = 0.3;

/** The script's cap, in bytes: 6 MB. */
export const SCRIPT_CAP = 6 * 1024 * 1024;

/** The stylesheet's cap, in bytes: 2 MB. */
export const STYLESHEET_CAP = 2 * 1024 * 1024;

/** The most files a build may hold. */
export const FILES_CAP = 1024;
