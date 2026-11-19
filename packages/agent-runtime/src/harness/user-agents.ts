/**
 * Where each harness keeps its user's own agent files on this machine, a harness fact the layers above list without naming it: Claude
 * Code's `agents` folder in its config folder (`CLAUDE_CONFIG_DIR`, else `~/.claude`), read at call time.
 */
import path from 'node:path';
import { claudeHome } from './claude/trust.ts';

/** One harness's folder of its user's own agent files: the harness, by its name, and the folder, which may not be there. */
export type UserAgentFolder = { readonly harness: string; readonly folder: string };

/**
 * Each harness's folder of its user's own agent files, in the order the harnesses are named, whether or not it is there.
 * @param env The environment the harness would run under, which may move its config folder.
 */
export const userAgentFolders = (env: NodeJS.ProcessEnv = process.env) => [
  { harness: 'claude', folder: path.join(env.CLAUDE_CONFIG_DIR || claudeHome(), 'agents') },
];
