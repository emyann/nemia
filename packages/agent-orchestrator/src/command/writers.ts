/**
 * What the library's writers share, served on both sides — `nemia agents write`, `agents remove`, `agents try`, `skills write`, `workflows
 * write` and `workflows remove`: a text read off their arguments, the flag of the version a write or a removal is checked against, a flag
 * the command line alone takes (the file or folder its runner reads) and one the api alone takes (what the runner reads it into), and the
 * spec that refuses the rest in the command's words. Pure.
 */
import { CLI, type Args, type Flag, type Positional, type Spec } from './command.ts';

/** The text under `key`, or undefined where none was given. */
export const writerText = (args: Args, key: string): string | undefined => {
  const value = args[key];
  return typeof value === 'string' ? value : undefined;
};

/** The place a writer is named on (`<from>`), required: `yours`, the one it writes. */
export const FROM: Positional = { key: 'from', takes: 'required', kind: 'name' };

/** `--version`, the version `what` was read at, which a refusal of a write without it names: taken on both sides, once. */
export const versionFlag = (command: string, what: string): Flag => ({
  flag: '--version',
  kind: 'text',
  key: 'version',
  takes: `--version takes the version ${what} was read at, which a write without it names: ${CLI} ${command} … --version <version>`,
  twice: `${CLI} ${command} takes --version once: one write is checked against one version.`,
});

/** A text flag the command line alone takes, under `key`, once: a path its runner reads, never sent to the api. */
export const cliPath = (command: string, key: string, takes: string, why: string): Flag => ({
  flag: `--${key}`,
  kind: 'text',
  key,
  takes: `--${key} takes ${takes}: ${CLI} ${command} … --${key} <path>`,
  twice: `${CLI} ${command} takes --${key} once.`,
  only: { side: 'cli', why },
});

/** A key the api alone hands, as its body gives it, and why the command line has no flag of it. */
export const apiKey = (key: string, why: string): Flag => ({ flag: `--${key}`, kind: 'text', key, only: { side: 'api', why } });

/** The spec of a writer named `command`, used as `usage` says: its positionals and flags; any other argument refused in its words. */
export const writerSpec = (command: string, usage: string, positionals: readonly Positional[], flags: readonly Flag[]): Spec => ({
  positionals,
  flags,
  unknown: (arg) => `${CLI} ${command} takes no ${arg}: ${CLI} ${command} ${usage}`,
});
