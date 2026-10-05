/**
 * The folders a harness reads as its own configuration inside a folder it is given to read (`CONFIG_FOLDERS`), and the first of them a
 * path passes through (`configFolderIn`): for a caller that puts files into a mounted folder, where a session would read such a file as its
 * own. Pure, reading the harnesses' vocabularies alone.
 */
import { CLAUDE_CONFIG_FOLDERS } from './claude/vocabulary.ts';

/** Every folder name a harness reads as its own configuration inside a mounted folder, each harness's list once. */
export const CONFIG_FOLDERS: readonly string[] = [...new Set(CLAUDE_CONFIG_FOLDERS)];

/**
 * The first segment of `path`, split on either separator, that is one of `CONFIG_FOLDERS`; `undefined` when none is. A segment is matched
 * whole and in its case: `.claude-notes` and `claude` are not `.claude`.
 */
export const configFolderIn = (path: string): string | undefined => path.split(/[\\/]/).find((part) => CONFIG_FOLDERS.includes(part));
