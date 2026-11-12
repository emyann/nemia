/**
 * `nemia factory`, each of its forms an entry of the command table, its words `objects`' (`FACTORY_WORDS`), which the client (`apps/cli`)
 * parses, words and prints: the store's factories listed — bare, which the api serves as the Factory's list of `objects`, and `ls` —
 * then filed, which the api serves as the Factory's `create`; given workflows and relieved of them, its revisions policy written and
 * removed, which the api serves as the Factory's `attach`, `detach`, `setRevisions` and `delete`, each typed by its `input`; hired into
 * and fired from, which the api serves as a Hire's writes, `/api/namespaces/:namespace/hires/<workflow>.<step>`; and its instruction's
 * two verbs (instruction.verb.ts), which the api serves. Their handlers answer data, which the api encodes.
 */
import { setting } from '../config/config.store.ts';
import { Effect, Schema } from 'effect';
import {
  FACTORY_ADD_WORDS,
  FACTORY_ATTACH_WORDS,
  FACTORY_DETACH_WORDS,
  FACTORY_FIRE_WORDS,
  FACTORY_HIRE_WORDS,
  FACTORY_LIST_WORDS,
  FACTORY_LS_WORDS,
  FACTORY_REVISIONS_WORDS,
  FACTORY_RM_WORDS,
  HireWrite,
} from 'objects';
/**
 * The long help `nemia factory --help` prints, which the client holds now (`objects`' `FACTORY_MANUAL`): said here under its old name
 * for the tests that still read it, until their verbs move.
 */
export { FACTORY_MANUAL as FACTORY_HELP } from 'objects';
import { tried } from '../runtime-client.ts';
import { Missing } from '../refusal/refusal.ts';
import type { Args } from '../command/command.ts';
import { tableEntry, type Served } from '../command/entry.verb.ts';
import { REVISIONS_POLICIES, unhiredFireRefusal, type Factory, type FactoryListing, type RevisionsPolicy } from './factory.ts';
import { factoriesDirAt, FactoryDoor, factoryRepos, filedFactory, originsOf, refuseName } from './door/factories.store.ts';
import { cloned } from './clones/clones.verb.ts';
import { ownAgentRefusal } from './wiring/own-agent.store.ts';
import { FactoryName } from './factory.model.ts';
import { StoreRoot } from '../config/root.store.ts';
import { wire } from './wiring/wire.verb.ts';
import { removeInstructionFolder } from './instruction.store.ts';
import { FACTORY_INSTRUCT, FACTORY_INSTRUCTION } from './instruction.verb.ts';
import { FACTORY_RULES } from './rules/rules.verb.ts';
import { TEMPLATED_FACTORY_VERBS } from '../adopt/templated.verb.ts';
import { FACTORY_SCHEDULES } from './schedule/schedule.verb.ts';
import { scheduleRun, schedulesListed, type ScheduleRuns } from './schedule/listed.store.ts';
import type { ScheduleListed } from './schedule/schedule.ts';
import { keptRuns } from '../record/files.store.ts';
import type { PlaceTrust, Untrusted } from '../trust/trust.ts';
import { FACTORY_TRUST, trustPlaces, untrustedPlaces } from '../trust/trust.verb.ts';
import { FACTORY_SERVER_VERBS } from './servers/servers.verb.ts';
import { FACTORY_VOLUMES } from './volume/volume.verb.ts';
import { FACTORY_SETTINGS } from '../harness-settings/harness-settings.verb.ts';
import { FACTORY_COST_LINES } from './cost-line/cost-line.verb.ts';

/**
 * A factory's own MCP servers, kept beside it as `factories/<name>/servers.json`, not in its file: one entry per server, with the
 * server's wire facts and the facts of the OAuth client it signs in through, and never a secret. An agent's `mcp:` line resolves a
 * name against that record before the checkout's `.mcp.json`, and the record's servers are handed to a step's session inline, byte
 * for byte as `mcpServerOf` spells them, so the sign-in the harness filed is found. `nemia factory servers` lists them with the state
 * the harness reports; `server add` records a remote one and `server rm` takes one off (`servers/servers.verb.ts`).
 */

/** The text under `key`: what the spec read there. */
const textOf = (args: Args, key: string): string => (typeof args[key] === 'string' ? args[key] : '');

/**
 * The listing every factory shares: those of the store, as the door lists them, their schedules as `schedulesListed` does, and
 * their places a harness does not trust now, as `untrustedPlaces` reads them.
 */
type Listed = { factories: FactoryListing[]; schedules: ScheduleListed[]; untrusted: Untrusted[]; dir: string };

/**
 * The store's factories, their schedules with the runs they started, and their places not trusted, each read now. A schedule reads of a
 * run only which fire started it and when (`scheduleRun`), so the records are read through `memo` where a caller that polls hands one
 * (`keptRuns`): a warm read of the board's factories reads no finished run's record. With none — the command line's — every record is
 * read, and the answer is the same.
 */
const listedNow = Effect.fn('listedNow')(function* (memo?: ScheduleRuns) {
  const home = yield* StoreRoot;
  const factories = [...(yield* (yield* FactoryDoor).factories.listed())];
  const verify = yield* setting('verifyRest');
  const schedules = yield* tried(() => schedulesListed(home, keptRuns(home, memo, scheduleRun, verify)));
  return { factories, schedules, untrusted: yield* untrustedPlaces(factories), dir: factoriesDirAt(yield* StoreRoot) } satisfies Listed;
});

/** `nemia factory`: the default factory, then each in the store. */
export const FACTORY: Served<Listed> = {
  ...FACTORY_LIST_WORDS,
  handler: (_args, kept) => listedNow(kept?.records?.factories),
};

/** `nemia factory ls`: the same listing, by its name. */
const FACTORY_LS: Served<Listed> = {
  ...FACTORY_LS_WORDS,
  handler: (_args, kept) => listedNow(kept?.records?.factories),
};

/**
 * `nemia factory add`: one factory filed, and where; then, unless `--no-trust`, each of its places trusted for the harnesses that keep
 * a trust (`trustPlaces`), and what was done of it.
 */
export const FACTORY_ADD: Served<{ name: string; repos: readonly string[]; file: string; trusts: readonly PlaceTrust[] }> = {
  ...FACTORY_ADD_WORDS,
  handler: (args) =>
    Effect.gen(function* () {
      const name = textOf(args, 'name');
      const given = Array.isArray(args.repos) ? args.repos : [];
      const home = yield* StoreRoot;
      const { repos, origins } = yield* tried(() => {
        refuseName(name, 'add');
        return factoryRepos(home, name, given);
      });
      yield* cloned(origins);
      const factory: Factory = { name, repos, workflows: [], hires: {}, schedules: {}, ...originsOf(origins) };
      const file = yield* Effect.gen(function* () {
        const door = yield* FactoryDoor;
        return yield* door.factories.create(factory);
      });
      const trusts = args.noTrust === true ? [] : yield* trustPlaces(factory.repos);
      return { name: factory.name, repos: factory.repos, file, trusts };
    }),
};

/** What `nemia factory attach` and `detach` take: the factory, and the workflow by its folder's name. */
export const WorkflowWireInput = Schema.Struct({ factory: Schema.String, workflow: Schema.String });
export type WorkflowWireInput = typeof WorkflowWireInput.Type;

/** `nemia factory attach`: one workflow attached to one factory, or said to be attached already. */
export const FACTORY_ATTACH: Served<{ file: string; already: boolean }, WorkflowWireInput> = {
  ...FACTORY_ATTACH_WORDS,
  input: WorkflowWireInput,
  handler: ({ factory, workflow }) =>
    Effect.map(wire(factory, { verb: 'attach', workflow }), ({ was, now, file }) => ({ file, already: now === was })),
};

/** `nemia factory detach`: one workflow taken from one factory. */
export const FACTORY_DETACH: Served<{ file: string }, WorkflowWireInput> = {
  ...FACTORY_DETACH_WORDS,
  input: WorkflowWireInput,
  handler: ({ factory, workflow }) => Effect.map(wire(factory, { verb: 'detach', workflow }), ({ file }) => ({ file })),
};

/** What `nemia factory hire` takes: the factory, the agent (the Hire's write, `objects`' `HireWrite`), and the step it is hired into. */
export const HireInput = Schema.Struct({ ...HireWrite.fields, factory: Schema.String, step: Schema.String });
export type HireInput = typeof HireInput.Type;

/** What `nemia factory fire` takes: the factory, and the step whose hire is taken back. */
export const FireInput = Schema.Struct({ factory: Schema.String, step: Schema.String });
export type FireInput = typeof FireInput.Type;

/** `nemia factory hire`: one agent hired into one step, and the agent it replaced, if any. */
export const FACTORY_HIRE: Served<{ file: string; replaced: string | null }, HireInput> = {
  ...FACTORY_HIRE_WORDS,
  input: HireInput,
  handler: ({ factory: named, agent, step }) =>
    Effect.gen(function* () {
      const root = yield* StoreRoot;
      const { was, file } = yield* wire(named, { verb: 'hire', step, agent }, (factory) => ownAgentRefusal(root, factory, step));
      const replaced = was.hires[step];
      return { file, replaced: replaced !== undefined && replaced !== agent ? replaced : null };
    }),
};

/** `nemia factory fire`: one step's hire taken back. */
export const FACTORY_FIRE: Served<{ file: string; fired: string }, FireInput> = {
  ...FACTORY_FIRE_WORDS,
  input: FireInput,
  handler: ({ factory, step }) =>
    Effect.gen(function* () {
      const { was, file } = yield* wire(factory, { verb: 'fire', step });
      const fired = was.hires[step];
      if (fired === undefined) return yield* Effect.fail(new Missing({ message: unhiredFireRefusal(factory, step, was.hires) }));
      return { file, fired };
    }),
};

/** What `nemia factory rm` takes: the factory, by its name. */
export const FactoryRmInput = Schema.Struct({ factory: Schema.String });
export type FactoryRmInput = typeof FactoryRmInput.Type;

/**
 * `nemia factory rm`: one factory's file removed, then the instruction the store keeps for it, its folder whole (`instruction`, null for
 * none). Refused as `removeFactory` refuses, before the folder is touched.
 */
export const FACTORY_RM: Served<{ file: string; instruction: string | null }, FactoryRmInput> = {
  ...FACTORY_RM_WORDS,
  input: FactoryRmInput,
  handler: ({ factory: name }) =>
    Effect.gen(function* () {
      const home = yield* StoreRoot;
      yield* tried(() => refuseName(name, 'rm'));
      const door = yield* FactoryDoor;
      const file = yield* door.factories.remove(FactoryName.read(name));
      return { file, instruction: yield* tried(() => removeInstructionFolder(home, name)) };
    }),
};

/** What `nemia factory revisions` takes: the factory, and the policy, one of `REVISIONS_POLICIES`. */
export const RevisionsInput = Schema.Struct({ factory: Schema.String, revisions: Schema.Literals(REVISIONS_POLICIES) });
export type RevisionsInput = typeof RevisionsInput.Type;

/**
 * `nemia factory revisions`: whether a factory's runs follow merged revisions, written, with what it said before. A policy that is
 * neither of the two is refused by the command line's `check` and by the api's payload, each before anything is read.
 */
export const FACTORY_REVISIONS: Served<{ file: string; was: RevisionsPolicy | null }, RevisionsInput> = {
  ...FACTORY_REVISIONS_WORDS,
  input: RevisionsInput,
  handler: ({ factory: name, revisions }) =>
    Effect.gen(function* () {
      yield* tried(() => refuseName(name, 'revisions'));
      const door = yield* FactoryDoor;
      const factory = yield* filedFactory(name, 'revisions');
      const file = yield* door.factories.rewrite({ ...factory, revisions });
      return { file, was: factory.revisions ?? null };
    }),
};

/** `nemia factory`'s entries, in the order `nemia`'s help lists them. */
export const FACTORIES: readonly Served[] = [
  tableEntry(FACTORY),
  tableEntry(FACTORY_LS),
  tableEntry(FACTORY_ADD),
  ...TEMPLATED_FACTORY_VERBS,
  tableEntry(FACTORY_ATTACH),
  tableEntry(FACTORY_DETACH),
  tableEntry(FACTORY_HIRE),
  tableEntry(FACTORY_FIRE),
  ...FACTORY_SCHEDULES,
  ...FACTORY_SERVER_VERBS,
  ...FACTORY_VOLUMES,
  ...FACTORY_SETTINGS,
  ...FACTORY_COST_LINES,
  tableEntry(FACTORY_RULES),
  tableEntry(FACTORY_INSTRUCTION),
  tableEntry(FACTORY_INSTRUCT),
  tableEntry(FACTORY_REVISIONS),
  tableEntry(FACTORY_TRUST),
  tableEntry(FACTORY_RM),
];
