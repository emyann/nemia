/**
 * What `nemia` exits with, apart from the command line itself: each bin imports this file before the package, so a refusal thrown as the
 * package loads, such as a `WF_ROOT` that is not an absolute path, exits with its code too.
 */

/** What `nemia` exits with on what `main` threw: its `exitCode` when that is a whole number from 1 to 255, and 1 otherwise. */
export const exitCodeOf = (thrown: unknown): number => {
  const code = (thrown as { exitCode?: unknown } | null | undefined)?.exitCode;
  return typeof code === 'number' && Number.isInteger(code) && code > 0 && code <= 255 ? code : 1;
};
