/**
 * The agent files the store knows of, read (`agentSources`): each repository's a factory names, in its two places for agents
 * (`repositoryRoots`), then the person's library, then the folder they name. Nothing is written.
 */
import fs from 'node:fs';
import path from 'node:path';
import { Missing } from '../refusal/refusal.ts';
import { knownReposAt } from '../folder/write.store.ts';
import { agentVersion, loadAgents, repositoryRoots, sourceSkills } from '../agents/read.store.ts';
import { AGENTS_FOLDER } from '../step/step.ts';
import { yoursOf } from '../yours/yours.ts';
import type { AgentSource, AgentSourcePlace } from './sources.ts';

/** The agents of the folder `dir`, each as a source found in `place`; none for a folder that is not there. */
function sourcesIn(place: AgentSourcePlace, repo: string | null, dir: string, home: string): AgentSource[] {
  return [...loadAgents(dir)]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([name, agent]) => {
      const file = path.join(dir, `${name}.md`);
      const read = !(agent instanceof Error);
      return {
        place,
        repo,
        dir,
        file,
        name,
        description: read ? (agent.description ?? null) : null,
        version: agentVersion(dir, name, sourceSkills(file, home)),
        error: read ? null : agent.message,
      };
    });
}

/**
 * Every agent file the store knows of: each repository's a factory names, sorted, in its two places for agents in the order a start
 * looks (`repositoryRoots`); then the library of the store `home`; then the folder `at`, when named. A folder named that is not there is
 * refused as `Missing`.
 */
export function agentSources({ at, home }: { at?: string; home: string }): { sources: AgentSource[] } {
  const named = at === undefined ? undefined : path.resolve(at);
  if (named !== undefined && !fs.statSync(named, { throwIfNoEntry: false })?.isDirectory())
    throw new Missing({ message: `${named} is not a folder: name the folder that holds the agent files, <folder>/<name>.md.` });
  const repos = [...knownReposAt(home)].sort();
  return {
    sources: [
      ...repos.flatMap((repo) =>
        repositoryRoots(repo).flatMap((root) => sourcesIn('repository', repo, path.join(root, AGENTS_FOLDER), home)),
      ),
      ...sourcesIn('library', null, yoursOf('agents', home), home),
      ...(named === undefined ? [] : sourcesIn('path', null, named, home)),
    ],
  };
}
