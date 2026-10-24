/**
 * Claude Code's trust of a folder: the trust a person gives by running Claude Code there once and accepting the prompt, kept per path in
 * its `.claude.json` as `projects["<path>"].hasTrustDialogAccepted`. Read by `claudeTrusts`, and written by `claudeTrust` alone, which
 * sets that one key and leaves every other as it was: the file is Claude Code's, rewritten by every session on the machine.
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

/** Claude Code's own `.claude.json`: in `CLAUDE_CONFIG_DIR` when it is set, else beside `~/.claude`, read at call time. */
export const claudeConfigFile = (): string =>
  process.env.CLAUDE_CONFIG_DIR ? path.join(process.env.CLAUDE_CONFIG_DIR, '.claude.json') : path.join(os.homedir(), '.claude.json');

/**
 * The path Claude Code keeps its trust of the folder `dir` under: the root of the repository's main checkout where `repository` names
 * it, which a subfolder and a linked worktree are trusted by, else the folder itself, each resolved.
 */
export const claudeTrustKey = (dir: string, repository?: string): string => path.resolve(repository ?? dir);

/** Whether `key` is the home directory, whose trust Claude Code holds for one session and never keeps in its file. */
export const claudeNeverKeeps = (key: string): boolean => key === path.resolve(os.homedir());

/** `value` as an object with keys, or undefined for anything else, an array included. */
const record = (value: unknown): Record<string, unknown> | undefined =>
  typeof value === 'object' && value !== null && !Array.isArray(value) ? (value as Record<string, unknown>) : undefined;

/**
 * Whether `file` (Claude Code's `.claude.json` by default) says the folder `dir` was trusted: its `projects` entry for the folder's
 * resolved path with `hasTrustDialogAccepted: true`. False for a file that is not there or does not read as such an object.
 */
export const claudeTrusts = (dir: string, file: string = claudeConfigFile()): boolean => {
  let parsed: unknown;
  try {
    parsed = JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch {
    return false;
  }
  const projects = typeof parsed === 'object' && parsed !== null ? (parsed as { projects?: unknown }).projects : undefined;
  if (typeof projects !== 'object' || projects === null) return false;
  const entry = (projects as Record<string, unknown>)[path.resolve(dir)];
  return typeof entry === 'object' && entry !== null && (entry as { hasTrustDialogAccepted?: unknown }).hasTrustDialogAccepted === true;
};

/** What `claudeTrustText` answers: the key is already set, the text that sets it, or why the text given cannot be rewritten. */
export type TrustText = { readonly trusted: true } | { readonly text: string } | { readonly unread: string };

/**
 * The text of a `.claude.json` with `projects[key].hasTrustDialogAccepted` set to true and nothing else changed in what it holds:
 * `projects` and the entry made where absent, the entry's other keys kept, written with two spaces and the last line break the text
 * had. Answers `trusted` where the key is already true, and `unread` for a text that is no JSON object, or whose `projects` or entry
 * for `key` is no object. Pure.
 */
export function claudeTrustText(text: string, key: string): TrustText {
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    return { unread: 'it is not JSON' };
  }
  const config = record(parsed);
  if (!config) return { unread: 'it holds no JSON object' };
  const projects = config.projects === undefined ? {} : record(config.projects);
  if (!projects) return { unread: 'its `projects` is no object' };
  const entry = Object.hasOwn(projects, key) ? record(projects[key]) : {};
  if (!entry) return { unread: `its \`projects\` entry for ${key} is no object` };
  if (entry.hasTrustDialogAccepted === true) return { trusted: true };
  const next = { ...config, projects: { ...projects, [key]: { ...entry, hasTrustDialogAccepted: true } } };
  return { text: `${JSON.stringify(next, null, 2)}${text.endsWith('\n') ? '\n' : ''}` };
}

/** What `claudeTrust` answers: whether it wrote the key, and why it could not where it neither wrote it nor found it set. */
export type TrustWritten = { readonly wrote: boolean; readonly refused: string | null };

/** The bytes of `file`, or null where there is none. */
const bytesOf = (file: string): Buffer | null => {
  try {
    return fs.readFileSync(file);
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === 'ENOENT') return null;
    throw err;
  }
};

/** How many times `claudeTrust` starts again on a file that changed under it before it gives up. */
const WRITES = 5;

/** `file` made holding the one key for `key`, only where there is still none: false where one appeared meanwhile. */
function created(file: string, key: string): boolean {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  try {
    fs.writeFileSync(file, `${JSON.stringify({ projects: { [key]: { hasTrustDialogAccepted: true } } }, null, 2)}\n`, {
      flag: 'wx',
      mode: 0o600,
    });
    return true;
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === 'EEXIST') return false;
    throw err;
  }
}

/**
 * `text` put in place of `file`, only while `file` still holds `was`: written beside it under the file's own mode, the file read again
 * through `read`, and renamed over it where nothing changed. False, and nothing left beside it, where another writer got there first.
 */
function replaced(file: string, was: Buffer, text: string, read: (file: string) => Buffer | null): boolean {
  const beside = path.join(path.dirname(file), `.${path.basename(file)}.${process.pid}.trust`);
  fs.writeFileSync(beside, text, { mode: fs.statSync(file).mode });
  const now = read(file);
  if (now === null || !now.equals(was)) {
    fs.rmSync(beside, { force: true });
    return false;
  }
  fs.renameSync(beside, file);
  return true;
}

/**
 * Sets `projects[key].hasTrustDialogAccepted` in `file` (Claude Code's `.claude.json` by default), the one writer of that file here. A
 * key already true leaves the file untouched; a file that is not there is made holding the key alone; a link is followed, never
 * replaced. A session may rewrite the file at any moment, so the new text replaces the file only while it still holds the bytes read
 * (`read`, the file's bytes by default), and the write starts again where it does not, five times at most. Refuses, writing nothing, a
 * file that does not read (`claudeTrustText`) and one that changed every time, each in words that name what to do.
 */
export function claudeTrust(key: string, file: string = claudeConfigFile(), read: (file: string) => Buffer | null = bytesOf): TrustWritten {
  const byHand = `run Claude Code in ${key} once and accept its prompt`;
  for (let attempt = 0; attempt < WRITES; attempt += 1) {
    const target = fs.existsSync(file) ? fs.realpathSync(file) : file;
    const was = read(target);
    if (was === null) {
      if (created(target, key)) return { wrote: true, refused: null };
      continue;
    }
    const next = claudeTrustText(was.toString('utf8'), key);
    if ('trusted' in next) return { wrote: false, refused: null };
    if ('unread' in next) return { wrote: false, refused: `${target} was left as it is, since ${next.unread}: ${byHand}` };
    if (replaced(target, was, next.text, read)) return { wrote: true, refused: null };
  }
  return { wrote: false, refused: `${file} changed under each of ${WRITES} writes and was left as it is: ask again, or ${byHand}` };
}
