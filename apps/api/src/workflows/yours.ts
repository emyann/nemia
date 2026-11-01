/**
 * Your store, as the api reads it: the folders a person's own workflows, agents and skills are written to under the api's store root
 * (`StoreRoot`), and the lines that file a factory into it and turn Nemia on, built off the orchestrator's table, so the board spells
 * none.
 */
import path from 'node:path';
import { Hono } from 'hono';
import { commandLine } from 'agent-orchestrator';
import { librarySkills } from '../agents/skills.ts';
import { yourAgentsDir } from 'agent-orchestrator';
import { type ApiEnv, served } from '../layer.ts';
import { commandNamed } from '../store.ts';

const FACTORY_ADD = commandNamed('factory add');

const LEVEL = commandNamed('level');

/**
 * Your store's folders, each absolute: `workflows`, where your workflows' folders are; `agents`, your agents' files; `skills`, your
 * library of skills. `fileFactory`: the line that files a factory, `nemia factory add <name> --repo <path>`. `turnOnNemia`: the line
 * that turns Nemia on, `nemia level semi-auto`, the act the board's switch takes.
 */
export type YourStore = { workflows: string; agents: string; skills: string; fileFactory: string; turnOnNemia: string };

/** Your store under the root `home`. */
export const yourStore = (home: string): YourStore => ({
  workflows: path.join(home, 'workflows'),
  agents: yourAgentsDir(home),
  skills: librarySkills(home),
  fileFactory: commandLine(FACTORY_ADD, {}, { repos: '<path>' }),
  turnOnNemia: commandLine(LEVEL, { level: 'semi-auto' }),
});

/**
 * `GET /api/store` — your store's folders, how a factory is filed in it and how Nemia is turned on (`YourStore`), under the request's
 * store root.
 */
export const yours = new Hono<ApiEnv>().get('/api/store', (c) => served(c, ({ home }) => c.json(yourStore(home))));
