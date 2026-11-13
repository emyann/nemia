/**
 * The agent files the store knows of, to copy into a person's library (`nemia agents sources`): each with where it was found, its name
 * and description, its version, or why it does not read. The client prints them.
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
