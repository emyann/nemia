/**
 * Your store, as the api reads it: the folders a person's own workflows, agents and skills are written to under the api's store root
 * (`StoreRoot`), and the lines that file a factory into it and turn Nemia on, built off the orchestrator's entries (`FACTORY_ADD`,
 * `LEVEL`), so the board spells none. Answered on `GET /api/store` (the server group, server/server.ts).
 */
import path from 'node:path';
import { commandLine, FACTORY_ADD, LEVEL, yourAgentsDir } from 'agent-orchestrator';
import type { YourStore } from 'objects';
import { librarySkills } from '../skills/skills.ts';

export type { YourStore };

/**
 * Your store under the root `home` (objects' `YourStore`), each folder absolute: `workflows`, where your workflows' folders are;
 * `agents`, your agents' files; `skills`, your library of skills. `fileFactory`: the line that files a factory, `nemia factory add <name>
 * --repo <path>`. `turnOnNemia`: the line that turns Nemia on, `nemia level semi-auto`, the act the board's switch takes.
 */
export const yourStore = (home: string): YourStore => ({
  workflows: path.join(home, 'workflows'),
  agents: yourAgentsDir(home),
  skills: librarySkills(home),
  fileFactory: commandLine(FACTORY_ADD, {}, { repos: '<path>' }),
  turnOnNemia: commandLine(LEVEL, { level: 'semi-auto' }),
});
