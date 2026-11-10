/**
 * Which of the board's files its guards read: those `.gitattributes` does not mark another project's (the design system kit, vendored
 * unchanged) or a tool's output (the route tree, the theme). Git says it (`ours` of `test-kit/repo`), so no guard over the board's
 * source keeps a folder of its own to skip, and a vendored folder the board takes in is one line of `.gitattributes`.
 */
import path from 'node:path';
import { ours as oursInRepo, REPO } from 'test-kit/repo';

/** The board's folder, from the repository's root. */
const BOARD = path
  .relative(REPO, path.join(import.meta.dirname, '..'))
  .split(path.sep)
  .join('/');

/**
 * Whether `file`, a path from a board's root — this board's, or a copy a test plants under a scratch root — is ours: judged as git would
 * judge it at the same place in this board, so a planted kit file is left out as the real one is.
 */
export const ours = (file: string): boolean => oursInRepo(`${BOARD}/${file}`);
