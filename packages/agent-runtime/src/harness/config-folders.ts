/**
 * The folders a harness reads as its own configuration inside a folder it is given to read (`CONFIG_FOLDERS`), and the first of them a
 * path passes through (`configFolderIn`): for a caller that puts files into a mounted folder, where a session would read such a file as its
 * own. Pure, reading the harnesses' vocabularies alone.
 */
import { CLAUDE_ADDED_FOLDER_READS, CLAUDE_CONFIG_FOLDERS } from './claude/vocabulary.ts';
import { own } from '../core/own.ts';

/** Every folder name a harness reads as its own configuration inside a mounted folder, each harness's list once. */
export const CONFIG_FOLDERS: readonly string[] = [...new Set(CLAUDE_CONFIG_FOLDERS)];

/**
 * The first segment of `path`, split on either separator, that is one of `CONFIG_FOLDERS`; `undefined` when none is. A segment is matched
 * whole and in its case: `.claude-notes` and `claude` are not `.claude`.
 * @param path The path to look in, relative or absolute, with either separator.
 */
export const configFolderIn = (path: string): string | undefined => path.split(/[\\/]/).find((part) => CONFIG_FOLDERS.includes(part));

/**
 * What a harness reads of a folder added beside a session's own: the path of its skills folder inside it, by its segments (`skills`), the
 * variable that loads its memory files (`memoryEnv`, set to `1`), and the setting whose globs skip some of them (`memoryExcludes`).
 */
export type AddedFolderReads = { readonly skills: readonly string[]; readonly memoryEnv: string; readonly memoryExcludes: string };

/** Each harness that adds a folder beside a session's own, and what it reads of one, by the harness's name. */
export const ADDED_FOLDER_READS: Readonly<Record<string, AddedFolderReads>> = { claude: CLAUDE_ADDED_FOLDER_READS };

/**
 * What the harness `harness` reads of a folder added beside a session's own (`ADDED_FOLDER_READS`); `undefined` for one that adds none.
 * @param harness The harness's name.
 */
export const addedFolderReadsOf = (harness: string): AddedFolderReads | undefined => own(ADDED_FOLDER_READS, harness);
