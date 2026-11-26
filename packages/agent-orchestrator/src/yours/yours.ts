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
import type { Args } from '../command/command.ts';

/** What a writer writes: an agent, a workflow, or a skill. */
export type YoursKind = 'agents' | 'workflows' | 'skills';

/**
 * Your workflows, in the store `home`: where a workflow of yours is a folder.
 * @param home The store's root folder.
 */
const yourWorkflowsDir = (home: string) => path.join(home, 'workflows');

/**
 * Your library of skills, in the store `home`: where a skill of yours is a folder.
 * @param home The store's root folder.
 */
export const yourSkillsDir = (home: string) => path.join(home, 'workflows', SKILLS_FOLDER);

/**
 * The folder a writer of `kind` writes into, in the store `home`.
 * @param kind What is written: agents, skills or workflows.
 * @param home The store's root folder.
 */
export const yoursOf = (kind: YoursKind, home: string) =>
  kind === 'agents' ? path.join(home, 'workflows', AGENTS_FOLDER) : kind === 'skills' ? yourSkillsDir(home) : yourWorkflowsDir(home);

/** The repository's folder of `kind`, in `repo`, or as a placeholder where none is known. */
const theirsOf = (kind: YoursKind, repo: string) => {
  const at = repo || '<repo>';
  return kind === 'agents'
    ? path.join(at, 'workflows', AGENTS_FOLDER)
    : kind === 'skills'
      ? path.join(at, '.claude', SKILLS_FOLDER)
      : path.join(at, 'workflows');
};

/** What a person does to put the `kind` named `name` into the repository: make it in yours, then copy it there by hand. */
function copyWords(kind: YoursKind, name: string | null, yours: string, theirs: string) {
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
 * @param who The command that writes, said in the refusal.
 * @param kind What is written: agents, skills or workflows.
 * @param name The name of what is written; null where none is named.
 * @param repo The repository's folder; empty where none is known, said as the placeholder `<repo>`.
 * @param home The store's root folder.
 */
function repoWriteRefusal(who: string, kind: YoursKind, name: string | null, repo: string, home: string) {
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
 * @param who The command that writes, said in the refusal.
 * @param kind What is written: agents, skills or workflows.
 * @param from The place asked for: `user`, `repo`, `factory` or a word that is none of them.
 * @param name The name of what is written; null where none is named.
 * @param repo The repository's folder; empty where none is known, said as the placeholder `<repo>`.
 * @param home The store's root folder.
 * @param target The factory the writer is pointed at by `--factory`; undefined for a writer that takes none.
 */
export function yoursOnlyRefusal(
  who: string,
  kind: YoursKind,
  from: string,
  name: string | null,
  repo: string,
  home: string,
  target?: Pick<FactoryTarget, 'factory'>,
) {
  if (from === 'user' && target?.factory !== undefined)
    return `${who}: user is the store's library, and --factory names a factory's tree: write \`${who} factory … --factory ${target.factory}\` for its tree, or leave out --factory for the library.`;
  if (from === 'user') return null;
  if (from === 'repo') return repoWriteRefusal(who, kind, name, repo, home);
  if (from === 'factory' && target !== undefined)
    return target.factory === undefined
      ? `${who}: \`factory\` writes the tree of a factory made from a template, and none was named: \`${who} factory … --factory <name>\`.`
      : null;
  const places = target === undefined ? '' : `, or to a factory's tree, \`factory\` with --factory <name>`;
  return `${who}: ${kind} are read from \`repo\` or \`user\`, and written to the store's library, in ${yoursOf(kind, home)}${places}. This named ${JSON.stringify(from)}: name \`user\`.`;
}

/**
 * The folder `who` writes the `kind` of the place `from` into: yours (`yoursOf`), or the same under the tree of the factory `target` names
 * (`target.treeOf`, which refuses a factory that has none). Refused (`Invalid`) as `yoursOnlyRefusal` says.
 * @param who The command that writes, said in the refusal.
 * @param kind What is written: agents, skills or workflows.
 * @param from The place asked for: `user`, `repo`, `factory` or a word that is none of them.
 * @param name The name of what is written; null where none is named.
 * @param repo The repository's folder; empty where none is known, said as the placeholder `<repo>`.
 * @param home The store's root folder.
 * @param target The factory `--factory` names and how its tree is found; undefined for a writer that takes none.
 */
export function yoursOrRefused(
  who: string,
  kind: YoursKind,
  from: string,
  name: string | null,
  repo: string,
  home: string,
  target?: FactoryTarget,
) {
  const refused = yoursOnlyRefusal(who, kind, from, name, repo, home, target);
  if (refused) throw new Invalid({ message: refused });
  return from === 'factory' && target?.factory !== undefined ? yoursOf(kind, target.treeOf(target.factory)) : yoursOf(kind, home);
}

/**
 * The text under `key`, or undefined where none was given.
 * @param args The command's parsed arguments.
 * @param key The argument's name.
 */
export const writerText = (args: Args, key: string) => {
  const value = args[key];
  return typeof value === 'string' ? value : undefined;
};
