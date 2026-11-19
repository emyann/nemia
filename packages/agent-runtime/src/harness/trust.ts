/**
 * A harness's trust of a folder: whether it trusts one (`trustedFolder`, for a caller that refuses to file a background session where
 * its spawn would be refused), what that trust is in a person's words (`folderTrust`), the act of giving it (`trustFolder`), and the
 * act of taking it back from a folder Nemia made and is removing, with every folder inside it (`untrustFolder`). Each answers
 * `undefined` for a harness that keeps no trust of a folder, which is given nothing.
 */
import os from 'node:os';
import path from 'node:path';
import {
  claudeConfigFile,
  claudeKeyUnder,
  claudeNeverKeeps,
  claudeTrust,
  claudeTrustKey,
  claudeTrusts,
  claudeUntrust,
} from './claude/trust.ts';

/**
 * A harness's trust of one folder, in words a person reads: the harness's name, the folder it keeps the trust under, the file it keeps
 * it in, what the trust lets the folder's own settings grant, how to take it back, whether it is given now, and why it can never be
 * kept for this folder (`never`, else null).
 */
export type FolderTrust = {
  readonly harness: string;
  readonly folder: string;
  readonly file: string;
  readonly grants: string;
  readonly back: string;
  readonly trusted: boolean;
  readonly never: string | null;
};

/** A trust asked for: the trust as it reads afterwards, whether this call wrote it, and why it could not where it is still not given. */
export type FolderTrusted = FolderTrust & { readonly wrote: boolean; readonly refused: string | null };

/** Whether `harness` is one that keeps Claude Code's trust of a folder. */
const keepsTrust = (harness: string): boolean => harness === 'claude';

/**
 * What harness `harness` says of its trust of the folder `dir`, read off the harness's own file (`file`, its default when absent):
 * kept under the root of the repository's main checkout where `repository` names it, else under the folder itself. `undefined` for a
 * harness that keeps no trust of a folder.
 * @param harness The harness's name.
 * @param dir The folder whose trust is read.
 * @param file The harness's own file its trust is kept in, or undefined for its default.
 * @param repository The root of the repository's main checkout, where the trust is kept; undefined to keep it under `dir`.
 */
export function folderTrust(harness: string, dir: string, file?: string, repository?: string): FolderTrust | undefined {
  if (!keepsTrust(harness)) return undefined;
  const folder = claudeTrustKey(dir, repository);
  const at = file ?? claudeConfigFile();
  return {
    harness: 'Claude Code',
    folder,
    file: at,
    grants: `the allow rules of ${folder}/.claude/settings.json, for a session started there or in a worktree of it, and the start of a background session there`,
    back: `set projects["${folder}"].hasTrustDialogAccepted to false in ${at}`,
    trusted: claudeTrusts(folder, at),
    never: claudeNeverKeeps(folder)
      ? `Claude Code keeps no trust of a home directory past one session: name a folder inside ${folder} instead`
      : null,
  };
}

/**
 * Gives harness `harness` its trust of the folder `dir`, by the harness's own key in its own file (`file`, `repository` as
 * `folderTrust` takes them): a folder already trusted is left alone, and one the harness can never keep a trust for is given nothing.
 * Answers the trust as it reads afterwards, with whether this call wrote it and, where it is still not given, why and what to do.
 * `undefined`, and nothing written, for a harness that keeps no trust of a folder.
 * @param harness The harness's name.
 * @param dir The folder to trust.
 * @param file The harness's own file its trust is kept in, or undefined for its default.
 * @param repository The root of the repository's main checkout, where the trust is kept; undefined to keep it under `dir`.
 */
export function trustFolder(harness: string, dir: string, file?: string, repository?: string): FolderTrusted | undefined {
  const before = folderTrust(harness, dir, file, repository);
  if (!before) return undefined;
  if (before.never) return { ...before, wrote: false, refused: before.trusted ? null : before.never };
  const { wrote, refused } = claudeTrust(before.folder, before.file);
  return { ...before, trusted: wrote || refused === null, wrote, refused };
}

/**
 * Whether harness `harness` trusts the folder `dir`, read off the harness's own file (`file`, its default when absent), as the
 * harness keeps it: under `repository`, the root of the repository's main checkout, where the caller names it. `undefined` for a
 * harness that keeps no trust of a folder.
 * @param harness The harness's name.
 * @param dir The folder whose trust is read.
 * @param file The harness's own file its trust is kept in, or undefined for its default.
 * @param repository The root of the repository's main checkout, where the trust is kept; undefined to keep it under `dir`.
 */
export const trustedFolder = (harness: string, dir: string, file?: string, repository?: string): boolean | undefined =>
  folderTrust(harness, dir, file, repository)?.trusted;

/**
 * A taking back asked for: the harness's name, the file it keeps its trust in, the keys removed, and why it could not where it removed
 * none.
 */
export type FolderUntrusted = {
  readonly harness: string;
  readonly file: string;
  readonly took: readonly string[];
  readonly refused: string | null;
};

/**
 * Takes back harness `harness`'s trust of the folder `dir` and of every folder inside it, by removing their records from the harness's
 * own file (`file`, its default when absent): for a folder Nemia made and is removing, such as a run's home, so the file does not grow
 * with every run. Refused, nothing written, where `dir` is the home directory or a folder holding it, whose records are a person's.
 * `undefined`, and nothing written, for a harness that keeps no trust of a folder.
 * @param harness The harness's name.
 * @param dir The folder whose records, and those of every folder inside it, are removed.
 * @param file The harness's own file its trust is kept in, or undefined for its default.
 */
export function untrustFolder(harness: string, dir: string, file?: string): FolderUntrusted | undefined {
  if (!keepsTrust(harness)) return undefined;
  const folder = path.resolve(dir);
  const at = file ?? claudeConfigFile();
  if (claudeKeyUnder(path.resolve(os.homedir()), folder))
    return {
      harness: 'Claude Code',
      file: at,
      took: [],
      refused: `${folder} holds the home directory, whose records in ${at} are a person's: name the folder Nemia made, inside it`,
    };
  return { harness: 'Claude Code', file: at, ...claudeUntrust(folder, at) };
}
