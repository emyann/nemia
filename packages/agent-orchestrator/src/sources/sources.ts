/**
 * The agent files the store knows of, to copy into a person's library (`nemia agents sources`): each with where it was found, its name
 * and description, its version, or why it does not read; and the lines that list them, ending in the command that copies one.
 */

/** Where an agent file was found: a repository the store knows, the person's library, or the folder they named. */
export type AgentSourcePlace = 'repository' | 'library' | 'path';

/**
 * One agent file the store knows of: where it was found (`place`, and `repo` for a repository's), its folder and file, its name, what it
 * says it is for, its version (`agentVersion`, what `nemia agents copy` records), and, for one that does not read, why.
 */
export type AgentSource = {
  place: AgentSourcePlace;
  repo: string | null;
  dir: string;
  file: string;
  name: string;
  description: string | null;
  version: string | null;
  error: string | null;
};

/** The heading of the agents of one folder: the repository's, the library's, or the one named. */
const headingOf = ({ place, repo, dir }: AgentSource): string =>
  place === 'repository' ? `${dir}  (the repository ${repo})` : place === 'library' ? `${dir}  (your library)` : dir;

/** `nemia agents sources`' lines: the agents of each folder under its heading, then how to copy one; or that there is none. */
export function sourcesLines({ sources }: { sources: readonly AgentSource[] }): string[] {
  if (!sources.length)
    return ['no agent file found in the repositories the store knows, nor in your library: name a folder of them with --path <folder>.'];
  const lines: string[] = [];
  let heading = '';
  for (const source of sources) {
    const now = headingOf(source);
    if (now !== heading) lines.push(...(heading ? [''] : []), now);
    heading = now;
    lines.push(
      source.error === null
        ? `  ${source.name}  ${source.description ?? 'no description'}  ${source.file}`
        : `  ${source.name}  does not read: ${source.error.split('\n')[0]}  ${source.file}`,
    );
  }
  return [...lines, '', 'copy one into your library: nemia agents copy <file> [--as <name>]'];
}
