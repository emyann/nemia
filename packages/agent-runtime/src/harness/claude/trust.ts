/**
 * Claude Code's trust of a folder: the trust a person gives by running Claude Code there once and accepting the prompt, kept per path in
 * its `.claude.json` as `projects["<path>"].hasTrustDialogAccepted`. Read by `claudeTrusts`, and written by `claudeTrust`, which sets
 * that one key, and `claudeUntrust`, which removes the entries of a folder its caller made and is removing, each leaving every other key as
 * it was and replacing the file only while it holds what was read: the file is Claude Code's, rewritten by every session on the machine.
 */
import type { ClaudeKeyUnder } from '../../../contracts/trust-taken-back.contract.ts';
import { Option, Schema } from 'effect';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { replaceFile } from '../../core/replace.ts';

/** Claude Code's config folder when `CLAUDE_CONFIG_DIR` moves it nowhere: `.claude` in the home, read at call time. */
export const claudeHome = () => path.join(os.homedir(), '.claude');

/** Claude Code's own `.claude.json`: in `CLAUDE_CONFIG_DIR` when it is set, else beside `~/.claude`, read at call time. */
export const claudeConfigFile = () =>
  process.env.CLAUDE_CONFIG_DIR ? path.join(process.env.CLAUDE_CONFIG_DIR, '.claude.json') : path.join(os.homedir(), '.claude.json');

/**
 * The path Claude Code keeps its trust of the folder `dir` under: the root of the repository's main checkout where `repository` names
 * it, which a subfolder and a linked worktree are trusted by, else the folder itself, each resolved.
 * @param dir The folder a session runs in.
 * @param repository The root of the repository's main checkout; absent where the folder is in no repository.
 */
export const claudeTrustKey = (dir: string, repository?: string) => path.resolve(repository ?? dir);

/**
 * Whether `key` is the home directory, whose trust Claude Code holds for one session and never keeps in its file.
 * @param key The path a trust is kept under (`claudeTrustKey`).
 */
export const claudeNeverKeeps = (key: string) => key === path.resolve(os.homedir());

/** `value` as an object with keys, or undefined for anything else, an array included. */
const record = (value: unknown) =>
  typeof value === 'object' && value !== null && !Array.isArray(value) ? (value as Record<string, unknown>) : undefined;

/** A `.claude.json`'s projects, as `claudeTrusts` reads them: each entry by the folder's path, whatever it holds. */
const projectsIn = Schema.decodeUnknownOption(
  Schema.fromJsonString(Schema.Struct({ projects: Schema.optional(Schema.Record(Schema.String, Schema.Unknown)) })),
);

/** Whether a `projects` entry says its folder's trust dialog was accepted. */
const accepted = Schema.is(Schema.Struct({ hasTrustDialogAccepted: Schema.Literal(true) }));

/**
 * Whether `file` (Claude Code's `.claude.json` by default) says the folder `dir` was trusted: its `projects` entry for the folder's
 * resolved path with `hasTrustDialogAccepted: true`. False for a file that is not there or does not read as such an object.
 * @param dir The folder asked about.
 * @param file The `.claude.json` to read; Claude Code's own (`claudeConfigFile`) unless given.
 */
export const claudeTrusts = (dir: string, file: string = claudeConfigFile()) => {
  let text: string;
  try {
    text = fs.readFileSync(file, 'utf8');
  } catch {
    return false;
  }
  const projects = Option.getOrUndefined(projectsIn(text))?.projects;
  const key = path.resolve(dir);
  return projects !== undefined && Object.hasOwn(projects, key) && accepted(projects[key]);
};

/** What `claudeTrustText` answers: the key is already set, the text that sets it, or why the text given cannot be rewritten. */
type TrustText = { readonly trusted: true } | { readonly text: string } | { readonly unread: string };

/**
 * The text of a `.claude.json` with `projects[key].hasTrustDialogAccepted` set to true and nothing else changed in what it holds:
 * `projects` and the entry made where absent, the entry's other keys kept, written with two spaces and the last line break the text
 * had. Answers `trusted` where the key is already true, and `unread` for a text that is no JSON object, or whose `projects` or entry
 * for `key` is no object. Pure.
 * Exported only for the tests that import it.
 * @param text The `.claude.json`'s text, as read.
 * @param key The path the trust is kept under (`claudeTrustKey`).
 */
export function claudeTrustText(text: string, key: string) {
  const json = Schema.decodeUnknownOption(Schema.fromJsonString(Schema.Unknown))(text);
  if (Option.isNone(json)) return { unread: 'it is not JSON' } satisfies TrustText as TrustText;
  const parsed = json.value;
  const config = record(parsed);
  if (!config) return { unread: 'it holds no JSON object' } satisfies TrustText as TrustText;
  const projects = config.projects === undefined ? {} : record(config.projects);
  if (!projects) return { unread: 'its `projects` is no object' } satisfies TrustText as TrustText;
  const entry = Object.hasOwn(projects, key) ? record(projects[key]) : {};
  if (!entry) return { unread: `its \`projects\` entry for ${key} is no object` } satisfies TrustText as TrustText;
  if (entry.hasTrustDialogAccepted === true) return { trusted: true } satisfies TrustText as TrustText;
  const next = { ...config, projects: { ...projects, [key]: { ...entry, hasTrustDialogAccepted: true } } };
  return { text: `${JSON.stringify(next, null, 2)}${text.endsWith('\n') ? '\n' : ''}` } satisfies TrustText as TrustText;
}

/** The bytes of `file`, or null where there is none. */
const bytesOf = (file: string) => {
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
function created(file: string, key: string) {
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
function replaced(file: string, was: Buffer, text: string, read: (file: string) => Buffer | null) {
  return replaceFile(file, text, {
    mode: fs.statSync(file).mode,
    still: () => {
      const now = read(file);
      return now !== null && now.equals(was);
    },
  });
}

/**
 * Sets `projects[key].hasTrustDialogAccepted` in `file` (Claude Code's `.claude.json` by default), the one writer of that file here. A
 * key already true leaves the file untouched; a file that is not there is made holding the key alone; a link is followed, never
 * replaced. A session may rewrite the file at any moment, so the new text replaces the file only while it still holds the bytes read
 * (`read`, the file's bytes by default), and the write starts again where it does not, five times at most. Refuses, writing nothing, a
 * file that does not read (`claudeTrustText`) and one that changed every time, each in words that name what to do.
 * @param key The path the trust is kept under (`claudeTrustKey`).
 * @param file The `.claude.json` to read and write; Claude Code's own (`claudeConfigFile`) unless given.
 * @param read What reads the file's bytes, null where it is not there; the file's own bytes unless a test hands its own.
 */
export function claudeTrust(key: string, file: string = claudeConfigFile(), read: (file: string) => Buffer | null = bytesOf) {
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

/**
 * Whether the `projects` key `key` is the folder `folder` itself or a folder inside it: the folder, then a separator and more. Proved by
 * `contracts/trust-taken-back.contract.ts`.
 * @param key A key of a `.claude.json`'s `projects`, as written.
 * @param folder The folder taken back, resolved.
 * @public
 */
export const claudeKeyUnder: ClaudeKeyUnder = (key, folder) => key === folder || key.startsWith(folder + '/');

/**
 * Whether the folder `folder` is the home directory or holds it: whose records in Claude Code's file are a person's, never taken back.
 * @param folder The folder taken back, resolved.
 */
export const claudeHoldsHome = (folder: string) => claudeKeyUnder(path.resolve(os.homedir()), folder);

/** What `claudeUntrustText` answers: no record under the folder, the text without them and the keys it took, or why it cannot be read. */
type UntrustText = { readonly none: true } | { readonly text: string; readonly took: readonly string[] } | { readonly unread: string };

/**
 * The text of a `.claude.json` with every `projects` entry at or under `folder` (`claudeKeyUnder`) removed and nothing else changed,
 * written with two spaces and the last line break the text had. Answers `none` where no entry is under it, and `unread` for a text
 * that is no JSON object, or whose `projects` is no object. Pure.
 * Exported only for the tests that import it.
 * @param text The `.claude.json`'s text, as read.
 * @param folder The folder whose records are taken back, resolved.
 */
export function claudeUntrustText(text: string, folder: string) {
  const json = Schema.decodeUnknownOption(Schema.fromJsonString(Schema.Unknown))(text);
  if (Option.isNone(json)) return { unread: 'it is not JSON' } satisfies UntrustText;
  const config = record(json.value);
  if (!config) return { unread: 'it holds no JSON object' } satisfies UntrustText;
  if (config.projects === undefined) return { none: true } satisfies UntrustText;
  const projects = record(config.projects);
  if (!projects) return { unread: 'its `projects` is no object' } satisfies UntrustText;
  const took = Object.keys(projects).filter((key) => claudeKeyUnder(key, folder));
  if (took.length === 0) return { none: true } satisfies UntrustText;
  const kept = Object.fromEntries(Object.entries(projects).filter(([key]) => !claudeKeyUnder(key, folder)));
  return {
    text: `${JSON.stringify({ ...config, projects: kept }, null, 2)}${text.endsWith('\n') ? '\n' : ''}`,
    took,
  } satisfies UntrustText;
}

/**
 * Removes every `projects` entry at or under `folder` from `file` (Claude Code's `.claude.json` by default), as `claudeTrust` writes
 * it: a file that is not there is left so, a link is followed, and the new text replaces the file only while it still holds the bytes
 * read (`read`), starting again where it does not, five times at most. Refuses, writing nothing, a file that does not read and one
 * that changed every time, each in words that name the file and what to do.
 * @param folder The folder whose records are taken back, resolved.
 * @param file The `.claude.json` to read and write; Claude Code's own (`claudeConfigFile`) unless given.
 * @param read What reads the file's bytes, null where it is not there; the file's own bytes unless a test hands its own.
 */
export function claudeUntrust(folder: string, file: string = claudeConfigFile(), read: (file: string) => Buffer | null = bytesOf) {
  const byHand = `remove each key of its \`projects\` at or under ${folder} by hand, or make the file read as a JSON object and ask again`;
  for (let attempt = 0; attempt < WRITES; attempt += 1) {
    const target = fs.existsSync(file) ? fs.realpathSync(file) : file;
    const was = read(target);
    if (was === null) return { took: [], refused: null };
    const next = claudeUntrustText(was.toString('utf8'), folder);
    if ('none' in next) return { took: [], refused: null };
    if ('unread' in next) return { took: [], refused: `${target} was left as it is, since ${next.unread}: ${byHand}` };
    if (replaced(target, was, next.text, read)) return { took: next.took, refused: null };
  }
  return { took: [], refused: `${file} changed under each of ${WRITES} writes and was left as it is: ask again, or ${byHand}` };
}
