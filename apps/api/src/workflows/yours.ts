/**
 * Your store, as the api reads it: the folders a person's own workflows, agents and skills are written to under the api's store root
 * (`StoreRoot`), and the line that files a factory into it, built off the orchestrator's table, so the board spells neither.
 */
import path from 'node:path';
import { Hono } from 'hono';
import { COMMANDS, commandLine } from 'agent-orchestrator';
import { librarySkills } from '../agents/skills.ts';
import { yourAgentsDir } from 'agent-orchestrator';
import { type ApiEnv, served } from '../layer.ts';

const FACTORY_ADD = COMMANDS.find((c) => c.name === 'factory add')!;

/**
 * Your store's folders, each absolute: `workflows`, where your workflows' folders are; `agents`, your agents' files; `skills`, your
 * library of skills. `fileFactory`: the line that files a factory, `nemia factory add <name> --repo <path>`.
 */
export type YourStore = { workflows: string; agents: string; skills: string; fileFactory: string };

/** Your store under the root `home`. */
export const yourStore = (home: string): YourStore => ({
  workflows: path.join(home, 'workflows'),
  agents: yourAgentsDir(home),
  skills: librarySkills(home),
  fileFactory: commandLine(FACTORY_ADD, {}, { repos: '<path>' }),
});

/** `GET /api/store` — your store's folders and how a factory is filed in it (`YourStore`), under the request's store root. */
export const yours = new Hono<ApiEnv>().get('/api/store', (c) => served(c, ({ home }) => c.json(yourStore(home))));
