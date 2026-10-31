/**
 * The library's writers' ground — `nemia agents write`, `agents rm`, `agents run`, `skills write`, `workflows write` and `workflows
 * remove`. Where they write: yours, in the store, never a checkout; and, for a writer that takes `--factory`, the tree of a factory made
 * from a template (`factory`). An agent, a workflow or a skill is written into `<home>/workflows/{agents,<name>,skills}`, or the same
 * under the factory's tree, and one named in the repository (`repo`) is refused with the copy a person makes by hand,
 * where git shows it as a change to commit, in words the command line and the api both say, each prefixing who refused (`who`: the
 * route, or the command). What their specs share on both sides: a text read off their arguments, the flag of the version a write or a
 * removal is checked against, a flag the command line alone takes (the file or folder its runner reads) and one the api alone takes
 * (what the runner reads it into), and the spec that refuses the rest in the command's words. Pure.
 */
import path from 'node:path';
import { AGENTS_FOLDER, SKILLS_FOLDER } from '../step/step.ts';
import { Invalid } from '../refusal/refusal.ts';
import { skillCopyCommand } from '../try/try.ts';
import { CLI, type Args, type Flag, type Positional, type Spec } from '../command/command.ts';

/** What a writer writes: an agent, a workflow, or a skill. */
export type YoursKind = 'agents' | 'workflows' | 'skills';

/** Your workflows, in the store `home`: where a workflow of yours is a folder. */
export const yourWorkflowsDir = (home: string): string => path.join(home, 'workflows');

/** Your library of skills, in the store `home`: where a skill of yours is a folder. */
export const yourSkillsDir = (home: string): string => path.join(home, 'workflows', SKILLS_FOLDER);

/** The folder a writer of `kind` writes into, in the store `home`. */
export const yoursOf = (kind: YoursKind, home: string): string =>
  kind === 'agents' ? path.join(home, 'workflows', AGENTS_FOLDER) : kind === 'skills' ? yourSkillsDir(home) : yourWorkflowsDir(home);

/** The repository's folder of `kind`, in `repo`, or as a placeholder where none is known. */
const theirsOf = (kind: YoursKind, repo: string): string => {
  const at = repo || '<repo>';
  return kind === 'agents'
    ? path.join(at, 'workflows', AGENTS_FOLDER)
    : kind === 'skills'
      ? path.join(at, '.claude', SKILLS_FOLDER)
      : path.join(at, 'workflows');
};

/** What a person does to put the `kind` named `name` into the repository: make it in yours, then copy it there by hand. */
function copyWords(kind: YoursKind, name: string | null, yours: string, theirs: string): string {
  if (kind === 'skills') {
    const copy = skillCopyCommand(path.join(yours, name ?? '<name>'), theirs);
    return `Write the skill in your library, then copy its folder into the repository by hand — \`${copy}\` — where git shows it as a change to commit.`;
  }
  if (kind === 'agents') {
    const start = name ? ` — \`cp ${path.join(theirs, `${name}.md`)} ${yours}/\` starts from this one —` : '';
    return `Make the agent in yours${start} then copy the file into ${theirs} by hand, where git shows it as a change to commit.`;
  }
  const start = name ? ` — \`cp -r ${path.join(theirs, name)} ${yours}/\` starts from this one —` : '';
  return `Build the workflow in yours${start} then copy the folder into ${theirs} by hand, where git shows it as a change to commit.`;
}

/**
 * Why `who` does not write the repository's `kind` (`name`, where one is named): only yours is written, in the store `home`, and nothing
 * into a checkout. Says the copy a person makes by hand, from yours into `repo`'s, the placeholder `<repo>` where none is known.
 */
export function repoWriteRefusal(who: string, kind: YoursKind, name: string | null, repo: string, home: string): string {
  const yours = yoursOf(kind, home);
  const theirs = theirsOf(kind, repo);
  const noun = kind === 'skills' ? 'your library' : 'yours';
  return `${who} refuses to write the repository's ${kind} (${theirs}): only ${noun} is written, in ${yours}, and nothing into a checkout. ${copyWords(kind, name, yours, theirs)}`;
}

/** A writer that takes `--factory`: the factory it names, if any, and the tree of a factory made from a template, refused where none. */
export type FactoryTarget = { factory: string | undefined; treeOf: (factory: string) => string };

/**
 * Why `who` does not write the `kind` of the place `from`, or null for yours, and for `factory` with a factory named where the writer
 * takes one (`target`): the repository's (`repoWriteRefusal`); `factory` with no `--factory`; `--factory` beside `yours`, which writes
 * the store's; and a place that is none of them, which names those the writer takes.
 */
export function yoursOnlyRefusal(
  who: string,
  kind: YoursKind,
  from: string,
  name: string | null,
  repo: string,
  home: string,
  target?: Pick<FactoryTarget, 'factory'>,
): string | null {
  if (from === 'yours' && target?.factory !== undefined)
    return `${who}: yours is the store's, and --factory names a factory's tree: write \`${who} factory … --factory ${target.factory}\` for its tree, or leave out --factory for yours.`;
  if (from === 'yours') return null;
  if (from === 'repo') return repoWriteRefusal(who, kind, name, repo, home);
  if (from === 'factory' && target !== undefined)
    return target.factory === undefined
      ? `${who}: \`factory\` writes the tree of a factory made from a template, and none was named: \`${who} factory … --factory <name>\`.`
      : null;
  const places = target === undefined ? '' : `, or to a factory's tree, \`factory\` with --factory <name>`;
  return `${who}: ${kind} are read from \`repo\` or \`yours\`, and written to yours, in ${yoursOf(kind, home)}${places}. This named ${JSON.stringify(from)}: name \`yours\`.`;
}

/**
 * The folder `who` writes the `kind` of the place `from` into: yours (`yoursOf`), or the same under the tree of the factory `target` names
 * (`target.treeOf`, which refuses a factory that has none). Refused (`Invalid`) as `yoursOnlyRefusal` says.
 */
export function yoursOrRefused(
  who: string,
  kind: YoursKind,
  from: string,
  name: string | null,
  repo: string,
  home: string,
  target?: FactoryTarget,
): string {
  const refused = yoursOnlyRefusal(who, kind, from, name, repo, home, target);
  if (refused) throw new Invalid({ message: refused });
  return from === 'factory' && target?.factory !== undefined ? yoursOf(kind, target.treeOf(target.factory)) : yoursOf(kind, home);
}

/** `--factory`, the factory made from a template whose tree a writer named on `factory` writes into: taken on both sides, once. */
export const factoryFlag = (command: string): Flag => ({
  flag: '--factory',
  kind: 'text',
  key: 'factory',
  takes: `--factory takes the name of a factory made from a template, whose tree is written: ${CLI} ${command} factory … --factory <name>`,
  twice: `${CLI} ${command} takes --factory once: one tree is written.`,
});

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
