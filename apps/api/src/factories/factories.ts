/**
 * The factories, for the board: the default factory and every factory in the store, each with the repositories it works on, the workflows
 * it offers and the agents it hires. Read from the store on each request, by `nemia factory`'s entry (`FACTORY`), never written: `nemia
 * factory` is the one writer of a factory's file.
 */
import { Hono } from 'hono';
import { COMMANDS, commandLine, DEFAULT_FACTORY, FACTORY, type FactoryListing, type Hires, runWith } from 'agent-orchestrator';
import { repoOf } from '../capabilities/capabilities.ts';
import { type ApiEnv, served } from '../layer.ts';

/** The lines a person types for a factory, built off the table: a workflow attached to it, and its file removed and filed again. */
export type FactoryCommands = { attach: string; rm: string; add: string };

const entry = (name: string) => COMMANDS.find((c) => c.name === name)!;
const ATTACH = entry('factory attach');
const RM = entry('factory rm');
const ADD = entry('factory add');

/** A factory's lines: `nemia factory attach <name> <workflow>`, `nemia factory rm <name>`, `nemia factory add <name> --repo <path>`. */
const commandsOf = (name: string): FactoryCommands => ({
  attach: commandLine(ATTACH, { factory: name }),
  rm: commandLine(RM, { name }),
  add: commandLine(ADD, { name }, { repos: '<path>' }),
});

/**
 * A factory as the board reads it: its name, whether it is the default factory, its repositories, the workflows it offers — null for the
 * default factory, which offers every workflow found — and its hires, `<workflow>/<step>` to an agent's name. A factory whose file does
 * not read has none of them, and `error` says why, in the package's words; null for every other. `commands`: its lines (`commandsOf`).
 */
export type FactoryAnswer = {
  name: string;
  default: boolean;
  repos: string[];
  workflows: string[] | null;
  hires: Hires;
  error: string | null;
  commands: FactoryCommands;
};

/** One factory of the store as the board reads it, or one whose file does not read, with why. */
const answerOf = (listing: FactoryListing): FactoryAnswer =>
  'error' in listing
    ? {
        name: listing.name,
        default: false,
        repos: [],
        workflows: [],
        hires: {},
        error: `${listing.file} ${listing.error}`,
        commands: commandsOf(listing.name),
      }
    : {
        name: listing.name,
        default: false,
        repos: [...listing.repos],
        workflows: [...listing.workflows],
        hires: { ...listing.hires },
        error: null,
        commands: commandsOf(listing.name),
      };

/**
 * The factories' route.
 *
 * - `GET /api/factories` — the default factory first, on the api's own repository (`repoOf`), offering every workflow and hiring no one;
 *   then each factory in the store, by name (`FactoryAnswer`), a file that does not read listed with why, so it hides no other. A request
 *   is answered in one of them, on one of their repositories, by naming it: `?factory=<name>` and `?repo=<path>` on any route
 *   (factories/place.ts). Served by hand, through the entry's handler (`FACTORY`), since the default factory is the api's to add.
 */
export const factories = new Hono<ApiEnv>().get('/api/factories', (c) =>
  served(c, async ({ e, env }) => {
    const listed = await runWith(e, FACTORY.handler({}));
    return c.json([
      {
        name: DEFAULT_FACTORY,
        default: true,
        repos: [repoOf(env)],
        workflows: null,
        hires: {},
        error: null,
        commands: commandsOf(DEFAULT_FACTORY),
      },
      ...listed.factories.map(answerOf),
    ] satisfies FactoryAnswer[]);
  }),
);
