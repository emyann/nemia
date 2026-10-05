/**
 * The factories, for the board: the default factory and every factory in the store, each with the repositories it works on, the workflows
 * it offers and the agents it hires. Read from the store on each request, by `nemia factory`'s entry (`FACTORY`), never written: `nemia
 * factory` is the one writer of a factory's file.
 */
import { Hono } from 'hono';
import { DEFAULT_FACTORY, FACTORY, type FactoryListing, type Hires } from 'agent-orchestrator';
import { repoOf } from '../capabilities/capabilities.ts';
import { type ApiEnv, served } from '../layer.ts';

/**
 * A factory as the board reads it: its name, whether it is the default factory, its repositories, the workflows it offers — null for the
 * default factory, which offers every workflow found — and its hires, `<workflow>/<step>` to an agent's name. A factory whose file does
 * not read has none of them, and `error` says why, in the package's words; null for every other.
 */
export type FactoryAnswer = {
  name: string;
  default: boolean;
  repos: string[];
  workflows: string[] | null;
  hires: Hires;
  error: string | null;
};

/** One factory of the store as the board reads it, or one whose file does not read, with why. */
const answerOf = (listing: FactoryListing): FactoryAnswer =>
  'error' in listing
    ? { name: listing.name, default: false, repos: [], workflows: [], hires: {}, error: `${listing.file} ${listing.error}` }
    : {
        name: listing.name,
        default: false,
        repos: [...listing.repos],
        workflows: [...listing.workflows],
        hires: { ...listing.hires },
        error: null,
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
    const listed = await FACTORY.handler(e, {});
    return c.json([
      { name: DEFAULT_FACTORY, default: true, repos: [repoOf(env)], workflows: null, hires: {}, error: null },
      ...listed.factories.map(answerOf),
    ] satisfies FactoryAnswer[]);
  }),
);
