/**
 * A harness's trust of a folder: whether it trusts one (`trustedFolder`, for a caller that refuses to file a background session where
 * its spawn would be refused), what that trust is in a person's words (`folderTrust`), and the act of giving it (`trustFolder`). Each
 * answers `undefined` for a harness that keeps no trust of a folder, which is given nothing.
 */
import { claudeConfigFile, claudeNeverKeeps, claudeTrust, claudeTrustKey, claudeTrusts } from './claude/trust.ts';

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
const keepsTrust = (harness: string): boolean => harness === 'claude' || harness === 'claude-detached';

/**
 * What harness `harness` says of its trust of the folder `dir`, read off the harness's own file (`file`, its default when absent):
 * kept under the root of the repository's main checkout where `repository` names it, else under the folder itself. `undefined` for a
 * harness that keeps no trust of a folder.
 */
export function folderTrust(harness: string, dir: string, file?: string, repository?: string): FolderTrust | undefined {
  if (!keepsTrust(harness)) return undefined;
  const folder = claudeTrustKey(dir, repository);
  const at = file ?? claudeConfigFile();
  return {
    harness: 'Claude Code',
    folder,
    file: at,
    grants: `the allow rules of ${folder}/.claude/settings.json now apply to a session started there or in a worktree of it, and a background session may start there`,
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
 */
export function trustFolder(harness: string, dir: string, file?: string, repository?: string): FolderTrusted | undefined {
  const before = folderTrust(harness, dir, file, repository);
  if (!before) return undefined;
  if (before.trusted) return { ...before, wrote: false, refused: null };
  if (before.never) return { ...before, wrote: false, refused: before.never };
  const { wrote, refused } = claudeTrust(before.folder, before.file);
  return { ...before, trusted: wrote || refused === null, wrote, refused };
}

/**
 * Whether harness `harness` trusts the folder `dir`, read off the harness's own file (`file`, its default when absent), as the
 * harness keeps it: under `repository`, the root of the repository's main checkout, where the caller names it. `undefined` for a
 * harness that keeps no trust of a folder.
 */
export const trustedFolder = (harness: string, dir: string, file?: string, repository?: string): boolean | undefined =>
  folderTrust(harness, dir, file, repository)?.trusted;
