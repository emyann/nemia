/**
 * The factories, for the board: the default factory and every factory in the store, each with the repositories it works on, the workflows
 * it offers, the agents it hires, its schedules and its places a harness does not trust. Read from the store on each request, by `nemia
 * factory`'s entry (`FACTORY`), never
 * written: `nemia factory` is the one writer of a factory's file.
 */
import { Hono } from 'hono';
import {
  COMMANDS,
  commandLine,
  DEFAULT_FACTORY,
  FACTORY,
  type FactoryCondition,
  type FactoryListing,
  type Hires,
  type ScheduleListed,
  type Untrusted,
} from 'agent-orchestrator';
import { repoOf } from '../capabilities/capabilities.ts';
import { type ApiEnv, served } from '../layer.ts';
import { runPlaced } from '../store.ts';

/**
 * The lines a person types for a factory, built off the table: a workflow attached to it, its file removed and filed again, a workflow
 * scheduled, and its places trusted again.
 */
export type FactoryCommands = { attach: string; rm: string; add: string; schedule: string; trust: string };

const entry = (name: string) => COMMANDS.find((c) => c.name === name)!;
const ATTACH = entry('factory attach');
const RM = entry('factory rm');
const ADD = entry('factory add');
const SCHEDULE = entry('factory schedule');
const UNSCHEDULE = entry('factory unschedule');
const TRUST = entry('factory trust');

/**
 * A factory's lines: `nemia factory attach <name> <workflow>`, `nemia factory rm <name>`, `nemia factory add <name> --repo <path>`,
 * `nemia factory schedule <name> <workflow> --cron <expr> --brief <text>` and `nemia factory trust <name>`.
 */
const commandsOf = (name: string): FactoryCommands => ({
  attach: commandLine(ATTACH, { factory: name }),
  rm: commandLine(RM, { factory: name }),
  add: commandLine(ADD, { name }, { repos: '<path>' }),
  schedule: commandLine(SCHEDULE, { factory: name }, { cron: '<expr>', brief: '<text>' }),
  trust: commandLine(TRUST, { factory: name }),
});

/**
 * The template a factory was made from, as the board reads it: its folder (`source`), its version and the parameters given at
 * `nemia factory apply`; the version its base holds (`applied`), null until the daemon renders it; and the conditions the daemon last
 * wrote, `Applied` and `ConflictsPending`, none until then.
 */
export type FactoryTemplateAnswer = {
  source: string;
  version: string;
  params: Record<string, string | number | boolean>;
  applied: string | null;
  conditions: FactoryCondition[];
};

/**
 * A factory's schedule as the board reads it: the package's listing of it (`schedulesListed`) — its cron and time zone, its brief and
 * repository, its next fire, its last scheduled run and a kept refusal of its latest fire — and the line that takes it back.
 */
export type ScheduleAnswer = Omit<ScheduleListed, 'factory'> & { commands: { unschedule: string } };

/** The schedules of the factory `name` among those `listed`, each with its line (`ScheduleAnswer`). */
const schedulesOf = (listed: readonly ScheduleListed[], name: string): ScheduleAnswer[] =>
  listed
    .filter((s) => s.factory === name)
    .map(({ factory, ...s }) => ({ ...s, commands: { unschedule: commandLine(UNSCHEDULE, { factory, workflow: s.workflow }) } }));

/**
 * A place of a factory that a harness does not trust now, each word the package's: the place, the harness by the name a person reads,
 * what is withheld from the place's own settings meanwhile, and why no trust can be kept for it (`never`, else null).
 */
export type UntrustedAnswer = { place: string; harness: string; withheld: string; never: string | null };

/** The places of the factory `name` among those `untrusted`, as the board reads them. */
const untrustedOf = (untrusted: readonly Untrusted[], name: string): UntrustedAnswer[] =>
  untrusted.filter((u) => u.factory === name).map(({ place, harness, withheld, never }) => ({ place, harness, withheld, never }));

/**
 * A factory as the board reads it: its name, whether it is the default factory, its repositories, the workflows it offers — null for the
 * default factory, which offers every workflow found — its hires, `<workflow>/<step>` to an agent's name, and its schedules, none for
 * the default factory. A factory whose file does not read has none of them, and `error` says why, in the package's words; null for every
 * other. `template`: the template it was made from (`FactoryTemplateAnswer`), null for one filed by hand. `untrusted`: its places a
 * harness does not trust now (`UntrustedAnswer`), none for the default factory and for one that does not read. `commands`: its lines
 * (`commandsOf`).
 */
export type FactoryAnswer = {
  name: string;
  default: boolean;
  repos: string[];
  workflows: string[] | null;
  hires: Hires;
  error: string | null;
  schedules: ScheduleAnswer[];
  template: FactoryTemplateAnswer | null;
  untrusted: UntrustedAnswer[];
  commands: FactoryCommands;
};

/** The template of a factory that reads, as the board reads it, or null for one filed by hand. */
const templateOf = (listing: Exclude<FactoryListing, { error: string }>): FactoryTemplateAnswer | null =>
  listing.template === undefined
    ? null
    : {
        source: listing.template.source,
        version: listing.template.version,
        params: { ...listing.template.params },
        applied: listing.status?.applied ?? null,
        conditions: (listing.status?.conditions ?? []).map((c) => ({ ...c })),
      };

/**
 * One factory of the store as the board reads it, its schedules among those `listed` and its places among those `untrusted`, or one
 * whose file does not read, with why.
 */
const answerOf = (listing: FactoryListing, listed: readonly ScheduleListed[], untrusted: readonly Untrusted[]): FactoryAnswer =>
  'error' in listing
    ? {
        name: listing.name,
        default: false,
        repos: [],
        workflows: [],
        hires: {},
        error: `${listing.file} ${listing.error}`,
        schedules: [],
        template: null,
        untrusted: [],
        commands: commandsOf(listing.name),
      }
    : {
        name: listing.name,
        default: false,
        repos: [...listing.repos],
        workflows: [...listing.workflows],
        hires: { ...listing.hires },
        error: null,
        schedules: schedulesOf(listed, listing.name),
        template: templateOf(listing),
        untrusted: untrustedOf(untrusted, listing.name),
        commands: commandsOf(listing.name),
      };

/**
 * The factories' route.
 *
 * - `GET /api/factories` — the default factory first, on the api's own repository (`repoOf`), offering every workflow and hiring no one;
 *   then each factory in the store, by name (`FactoryAnswer`), a file that does not read listed with why, so it hides no other. A request
 *   is answered in one of them, on one of their repositories, by naming it: `?factory=<name>` and `?repo=<path>` on any route
 *   (factories/place.ts). Each factory's schedules are the package's listing of them (`schedulesListed`), read off the runs the store
 *   has, and its places not trusted are read now off the place and the harness's own file, in the entry's one answer. Served by hand,
 *   through the entry's handler (`FACTORY`), since the default factory is the api's to add.
 */
export const factories = new Hono<ApiEnv>().get('/api/factories', (c) =>
  served(c, async ({ e, placeService, env, running }) => {
    const listed = await runPlaced(placeService, e, FACTORY.handler({}));
    return c.json([
      {
        name: DEFAULT_FACTORY,
        default: true,
        repos: [repoOf(env, running)],
        workflows: null,
        hires: {},
        error: null,
        schedules: [],
        template: null,
        untrusted: [],
        commands: commandsOf(DEFAULT_FACTORY),
      },
      ...listed.factories.map((listing) => answerOf(listing, listed.schedules, listed.untrusted)),
    ] satisfies FactoryAnswer[]);
  }),
);
