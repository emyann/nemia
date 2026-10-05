/**
 * Whether Claude Code trusts a folder: the trust a person gave it by running Claude Code there once and accepting the prompt, kept per
 * path in its `.claude.json`. Read, never written: the file is Claude Code's, rewritten by every session on the machine.
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

/** Claude Code's own `.claude.json`: in `CLAUDE_CONFIG_DIR` when it is set, else beside `~/.claude`, read at call time. */
export const claudeConfigFile = (): string =>
  process.env.CLAUDE_CONFIG_DIR ? path.join(process.env.CLAUDE_CONFIG_DIR, '.claude.json') : path.join(os.homedir(), '.claude.json');

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
