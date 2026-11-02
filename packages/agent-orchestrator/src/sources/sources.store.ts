/**
 * The agent files the store knows of, read through the Agent door (`agentSources`): each repository's a factory names, in its two places
 * for agents (`repositoryRoots`), then the person's library, then the folder they name. Nothing is written.
 */
import fs from 'node:fs';
import path from 'node:path';
import { Missing } from '../refusal/refusal.ts';
import { knownReposAt } from '../folder/write.store.ts';
import { Effect, Result } from 'effect';
import { repositoryRoots, sourceSkills } from '../agents/read.store.ts';
import { AgentDoor } from '../agents/agent-door.store.ts';
import type { AgentName } from '../agents/agents.model.ts';
import { AGENTS_FOLDER } from '../step/step.ts';
import { yoursOf } from '../yours/yours.ts';
import type { AgentSource, AgentSourcePlace } from './sources.ts';

/**
 * The agents of the folder `dir`, each as a source found in `place`, read through the Agent door: the names it lists, sorted, each read
 * (its refusal's words where it does not read, as for a name the door refuses) and its version there; none for a folder not there.
 */
const sourcesIn = Effect.fnUntraced(function* (place: AgentSourcePlace, repo: string | null, dir: string, home: string) {
  const { agents } = yield* AgentDoor;
  const sources: AgentSource[] = [];
  for (const name of [...(yield* agents.list(dir))].sort((a, b) => a.localeCompare(b))) {
    const file = path.join(dir, `${name}.md`);
    const agent = name as AgentName;
    const read = yield* Effect.result(agents.read(agent, { dir }));
    const there = yield* Effect.result(agents.there(agent, { dir, skills: sourceSkills(file, home) }));
    sources.push({
      place,
      repo,
      dir,
      file,
      name,
      description: Result.isSuccess(read) ? (read.success.description ?? null) : null,
      version: Result.isSuccess(there) && there.success.kind === 'held' ? there.success.version : null,
      error: Result.isSuccess(read) ? null : read.failure.message,
    });
  }
  return sources;
});

/**
 * Every agent file the store knows of, read through the Agent door: each repository's a factory names, sorted, in its two places for
 * agents in the order a start looks (`repositoryRoots`); then the library of the store `home`; then the folder `at`, when named. A
 * folder named that is not there is refused as `Missing`.
 */
export const agentSources = Effect.fn('agentSources')(function* ({ at, home }: { at?: string; home: string }) {
  const named = at === undefined ? undefined : path.resolve(at);
  if (named !== undefined && !fs.statSync(named, { throwIfNoEntry: false })?.isDirectory())
    return yield* Effect.fail(
      new Missing({ message: `${named} is not a folder: name the folder that holds the agent files, <folder>/<name>.md.` }),
    );
  const sources: AgentSource[] = [];
  for (const repo of [...knownReposAt(home)].sort())
    for (const root of repositoryRoots(repo)) sources.push(...(yield* sourcesIn('repository', repo, path.join(root, AGENTS_FOLDER), home)));
  sources.push(...(yield* sourcesIn('library', null, yoursOf('agents', home), home)));
  if (named !== undefined) sources.push(...(yield* sourcesIn('path', null, named, home)));
  return { sources };
});
