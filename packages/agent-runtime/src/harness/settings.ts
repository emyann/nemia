/**
 * A harness's own project configuration in a directory, as a session started there gets it: the allow rules it grants
 * (`projectAllows`), for a caller that judges what a session it is about to ask for can call. Beside `trust.ts`, which reads the
 * harness's trust of a folder off its own file the same way, and answers `undefined` for a harness that keeps none.
 */
import fs from 'node:fs';
import path from 'node:path';
import { CLAUDE_CONFIG_FOLDERS } from './claude/vocabulary.ts';

/**
 * Claude Code's shared project settings inside `dir`: the file a job reads (`--setting-sources project`), in the folder it reads as its
 * own configuration. Never `settings.local.json` beside it, which a job does not read.
 */
const claudeProjectFile = (dir: string): string => path.join(dir, CLAUDE_CONFIG_FOLDERS[0], 'settings.json');

/** Whether `harness` reads a project configuration of its own in the directory a session is started in. */
const readsProject = (harness: string): boolean => harness === 'claude' || harness === 'claude-detached';

/** The strings of `value` where it is an array, `[]` for anything else: a file's own JSON, which arrives as it is. */
const stringsOf = (value: unknown): string[] => (Array.isArray(value) ? value.filter((rule) => typeof rule === 'string') : []);

/**
 * The allow rules harness `harness`'s own project configuration in `dir` grants a session started there, as the file writes them: for
 * Claude Code, `permissions.allow` of its project settings file (`claudeProjectFile`), and nothing of the person's own settings or of
 * the local file beside it, which a job does not read.
 *
 * `[]` where there is no such file, where it does not parse, or where it names none: a file nobody can read grants nothing, and is
 * never read as granting everything. `undefined` for a harness that reads no project configuration of its own — Codex, whose sandbox
 * takes no rule, a command, an A2A agent, or a name the runtime does not know.
 *
 * The rules are what the file says, not what a session necessarily gets: a harness that has not been trusted with the directory drops
 * them (`folderTrust`, whose `grants` says so), and a caller that must know asks that too.
 */
export function projectAllows(harness: string, dir: string): readonly string[] | undefined {
  if (!readsProject(harness)) return undefined;
  let parsed: unknown;
  try {
    parsed = JSON.parse(fs.readFileSync(claudeProjectFile(dir), 'utf8'));
  } catch {
    return [];
  }
  const permissions = typeof parsed === 'object' && parsed !== null ? (parsed as { permissions?: unknown }).permissions : undefined;
  if (typeof permissions !== 'object' || permissions === null) return [];
  return stringsOf((permissions as { allow?: unknown }).allow);
}
