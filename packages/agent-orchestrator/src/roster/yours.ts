/**
 * Where the library's writers write: yours alone, in the store, never a checkout. An agent, a workflow or a skill is written into
 * `<home>/workflows/{agents,<name>,skills}`, and one named in the repository (`repo`) is refused with the copy a person makes by hand,
 * where git shows it as a change to commit. Pure: the folders and the words, which the command line and the api both say, each
 * prefixing who refused (`who`: the route, or the command).
 */
import path from 'node:path';
import { AGENTS_FOLDER, SKILLS_FOLDER } from '../step/step.ts';
import { Invalid } from '../refusal/refusal.ts';
import { skillCopyCommand } from './try.ts';

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

/**
 * Why `who` does not write the `kind` of the place `from`, or null for yours: the repository's (`repoWriteRefusal`), or a place that is
 * neither, which names the two.
 */
export function yoursOnlyRefusal(
  who: string,
  kind: YoursKind,
  from: string,
  name: string | null,
  repo: string,
  home: string,
): string | null {
  if (from === 'yours') return null;
  if (from === 'repo') return repoWriteRefusal(who, kind, name, repo, home);
  return `${who}: ${kind} are read from \`repo\` or \`yours\`, and written to yours alone, in ${yoursOf(kind, home)}. This named ${JSON.stringify(from)}: name \`yours\`.`;
}

/** The folder `who` writes the `kind` of the place `from` into (`yoursOf`), or refused (`Invalid`) as `yoursOnlyRefusal` says. */
export function yoursOrRefused(who: string, kind: YoursKind, from: string, name: string | null, repo: string, home: string): string {
  const refused = yoursOnlyRefusal(who, kind, from, name, repo, home);
  if (refused) throw new Invalid({ message: refused });
  return yoursOf(kind, home);
}
