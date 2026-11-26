/**
 * The testing entry (`agent-orchestrator/testing`): the test place, `testPlace` (`place/memory`), which makes a place that answers from
 * memory with no process, and the types of what it answers; and the stand-ins of the Agent and Skill doors, `agentDoorMemory` and
 * `skillDoorMemory`, which hold agents and skills in maps (`MEMORY_AGENTS` the folder of yours there); and the folder of builtin
 * templates (`BuiltinTemplates`), which a test gives a scratch folder of its own, never the builtin templates Nemia carries. A file of
 * its own, since a place's code imports nothing of `src` but what a place is (`test/boundary.test.ts`). A test names it where it gives
 * its programs a place or a door; no file of the program the package exports imports it (`test/contract.test.ts`).
 */
export { testPlace, type TestPlace, type Tree, type World } from './place/memory/index.ts';
export { agentDoorMemory, MEMORY_AGENTS } from './src/agents/agent-memory.store.ts';
export { skillDoorMemory } from './src/skills/skill-memory.store.ts';
export { BuiltinTemplates } from './src/template/door/templates.store.ts';

import { knownIn } from './src/folder/known.store.ts';
import { DEFAULT_NAMESPACE } from 'objects';
import { Cause, Effect, Exit } from 'effect';
import { FactoryName, isDefaultFactory } from './src/factory/factory.model.ts';
import {
  FactoryDoor,
  type FactoryDoorShape,
  scheduleOf,
  scheduleRefused,
  refuseName,
  volumesGiven,
} from './src/factory/door/factories.store.ts';
import { workedOnNone } from './src/factory/factory.store.ts';
import { factoriesDirAt } from './src/factory/factory.store.ts';
import { wire } from './src/factory/wiring/wire.verb.ts';
import { ownAgentRefusal } from './src/factory/wiring/own-agent.store.ts';
import { instructionPlaced } from './src/factory/instruction.verb.ts';
import { treeDir } from './src/factory/applied/applied.store.ts';
import { Invalid, Missing } from './src/refusal/refusal.ts';
import { unhiredFireRefusal, unscheduledRefusal, type Factory, type FactoryTemplate, type InstructionAt } from './src/factory/factory.ts';
import type { FactoryLevelFile } from './src/level/level.ts';
import type { FactoryServers } from './src/factory/servers/index.ts';
import type { Status } from './src/factory/applied/applied.store.ts';
import {
  APPLIED_PREFIX,
  FACTORIES_PREFIX,
  LEVELS_PREFIX,
  SERVERS_PREFIX,
  appliedKey,
  factoryKey,
  levelKey,
  serversKey,
} from './src/factory/door/index.ts';
import { FACTORY_FILES } from './src/factory/door/records.store.ts';
import fs from 'node:fs';
import path from 'node:path';
import { wfRoot } from './src/config/config.store.ts';
import { StoreRoot } from './src/config/root.store.ts';
import { keyspaceAt, keyspaceFile } from './src/keyspace/keyspace.store.ts';
import { runFilesOf, runsImported } from './src/runs/records.store.ts';
import { askKey, askKeyOf, asksPrefix, runKey } from './src/runs/run-keys.ts';
import { cancelledIn, recordValue } from './src/record/record.store.ts';
import type { Run } from './src/record/record.ts';
import { RunDoor, type RunDoorShape, type RunsLayer } from './src/runs/runs.store.ts';
import type { Actor } from 'objects';
import { FORGETTING_PREFIX, RUNMARKS_PREFIX, runMarkKey, runMarksPrefix, type RunMarker } from './src/runs/run-keys.ts';
import { RUN_MARK_FILES } from './src/runs/marks.store.ts';
import { CARD_FILES, CardDoor, cardDoorAt, cardKey, cardTryKey } from './src/cards/cards.store.ts';
import { DELEGATION_FILES } from './src/delegation/delegation.store.ts';
import { kindKeyspaceHeld } from './src/keyspace/import.store.ts';
import { LEDGER_FILES } from './src/revisions/revisions.store.ts';
import { SUBSCRIPTION_FILES } from './src/subscription/subscription.store.ts';
import { TOKEN_FILES } from './src/token/token.store.ts';
export { credentialKeptNow } from './src/token/token.store.ts';
import { CardName } from './src/inbox/inbox.model.ts';

/**
 * A program over the Factory door run at once at the store `home` (`StoreRoot`), a refusal thrown as itself: how a test reads and writes
 * the factories the door holds. A test's alone: no program of the package reads a factory but through the Effect it yields.
 * @param home The store's root folder.
 * @param program The program run.
 */
export const factoriesNow = <A, E>(home: string, program: Effect.Effect<A, E, StoreRoot>) => {
  const exit = Effect.runSyncExit(Effect.provideService(program, StoreRoot, home));
  if (Exit.isFailure(exit)) throw Cause.squash(exit.cause);
  return exit.value;
};

/**
 * What the store `home` knows of where workflows, agents and skills are kept besides its own folders: its factories' repositories.
 * @param home The store's root folder.
 */
export const knownAt = (home: string) => factoriesNow(home, knownIn(home));

/** The program `use` of the Factory door. */
const throughDoor = <A, E>(use: (door: FactoryDoorShape) => Effect.Effect<A, E>) => Effect.flatMap(FactoryDoor, use);

/** `factoriesDirAt` at the test's root. */
export const factoriesDir = () => factoriesDirAt(wfRoot(process.env));

/**
 * The names of the factories the store `home` holds a record of, in the door's order: the default factory, which is no record, is not one.
 * @param home The store's root folder.
 */
export const factoryNamesAt = (home: string) =>
  factoriesNow(
    home,
    throughDoor((door) => door.factories.list()),
  ).filter((name) => name !== DEFAULT_NAMESPACE);

/**
 * Every factory the store `home` lists, each read or with why it does not read.
 * @param home The store's root folder.
 */
export const readFactoriesAt = (home: string) =>
  factoriesNow(
    home,
    throughDoor((door) => door.factories.listed()),
  );

/**
 * The factory `name` of the store `home` as a run started in it reads it.
 * @param home The store's root folder.
 * @param name The factory's name.
 * @param notDone What the caller did not do, said at the end of a refusal.
 */
export const readFactoryAt = (home: string, name: string, notDone = 'Nothing was started.') =>
  factoriesNow(
    home,
    Effect.gen(function* () {
      const record = yield* Effect.flatMap(FactoryDoor, (door) =>
        door.factories
          .read(FactoryName.read(name))
          .pipe(
            Effect.catchTag('Missing', (miss) =>
              Effect.fail(new Missing({ message: miss.message.replace(/Nothing was read\.$/, notDone) })),
            ),
          ),
      );
      if (isDefaultFactory(record))
        return yield* Effect.fail(new Invalid({ message: `${name} is the default factory, which is no record to read.` }));
      return record;
    }),
  );

/**
 * A factory filed in the store `home` as `nemia factory add` files one: its name and volumes refused as the verb refuses them, the record
 * written by the door. Answers the factory and the key of its record (`file`).
 * @param home The store's root folder.
 * @param opts The factory's name, each `--volume` as typed, the folder a relative one is resolved from, and the template it is made from.
 */
export const addFactoryAt = (
  home: string,
  opts: { name: string; volumes: readonly string[]; cwd?: string; template?: FactoryTemplate },
) => {
  refuseName(opts.name, 'add');
  const volumes = volumesGiven(home, opts.name, opts.volumes, opts.cwd ?? process.cwd());
  const template = opts.template;
  const made = template === undefined ? {} : { template, tree: treeDir(home, opts.name) };
  const stored = template === undefined && workedOnNone(volumes) ? { instruction: { store: true as const } } : {};
  const factory: Factory = { name: opts.name, volumes, workflows: [], hires: {}, schedules: {}, ...made, ...stored };
  return {
    factory,
    file: factoriesNow(
      home,
      throughDoor((door) => door.factories.create(factory)),
    ),
  };
};

/**
 * A factory filed in the store `home` as it is, its record written by the door: answers the record's key.
 * @param home The store's root folder.
 * @param factory The factory filed.
 */
export const createFactoryAt = (home: string, factory: Factory) =>
  factoriesNow(
    home,
    throughDoor((door) => door.factories.create(factory)),
  );

/**
 * A factory's record written over at the store `home`, as it is: answers the record's key.
 * @param home The store's root folder.
 * @param factory The factory written.
 */
export const rewriteFactoryAt = (home: string, factory: Factory) =>
  factoriesNow(
    home,
    throughDoor((door) => door.factories.rewrite(factory)),
  );

/**
 * A factory's record planted at the store `home` as the text given, unchecked: created where none is there, written over where one is.
 * What a test plants to see how the door reads a record that is no factory, or one of an earlier shape.
 * @param home The store's root folder.
 * @param name The factory's name.
 * @param text The record's text.
 */
export const plantFactory = (home: string, name: string, text: string) => {
  factoriesTakenUp(home);
  plantKey(home, factoryKey(name), text);
};

/** The files of the store `home` from before the keyspace, which a test planted, taken up as the door takes them up when it opens. */
const factoriesTakenUp = (home: string) => void Effect.runSync(kindKeyspaceHeld(home, FACTORY_FILES));

/**
 * A record planted at `key` in the store `home` as the text given, unchecked: created where none is there, written over where one is.
 * @param home The store's root folder.
 * @param key The record's key.
 * @param text The record's text.
 */
export const plantKey = (home: string, key: string, text: string) => {
  const keyspace = keyspaceNow(home);
  const held = Effect.runSync(keyspace.get(key));
  void Effect.runSync(
    keyspace.write(
      key,
      held === undefined ? { verb: 'create', expected: null, value: text } : { verb: 'update', expected: held.revision, value: text },
    ),
  );
};

/**
 * The text a factory's record holds at the store `home`, raw: undefined where none is there.
 * @param home The store's root folder.
 * @param name The factory's name.
 */
export const factoryText = (home: string, name: string) => {
  factoriesTakenUp(home);
  return recordText(home, factoryKey(name));
};

/**
 * The factory `name` taken away from the store `home` wherever it is held: its records, and the file it was planted as where it was not
 * taken up yet; one that is not there is passed over. What a test does to take back a factory it planted.
 * @param home The store's root folder.
 * @param name The factory's name.
 */
export const dropFactory = (home: string, name: string) => {
  for (const key of [factoryKey, levelKey, serversKey, appliedKey]) dropRecord(home, key(name));
  fs.rmSync(path.join(factoriesDirAt(home), `${name}.json`), { force: true });
};

/**
 * Every factory of the store `home` taken away: its records (the factory, its level, its servers and its status) and its folder, the
 * default factory's servers among them. What a test does to start from a store with no factory.
 * @param home The store's root folder.
 */
export const clearFactories = (home: string) => {
  for (const prefix of [FACTORIES_PREFIX, LEVELS_PREFIX, SERVERS_PREFIX, APPLIED_PREFIX])
    for (const key of keysUnder(home, prefix)) dropRecord(home, key);
  fs.rmSync(factoriesDirAt(home), { recursive: true, force: true });
};

/**
 * The records of an earlier release's volumes moved once to one list at the store `home`, answering each moved and each left with why.
 * @param home The store's root folder.
 */
export const volumesMovedAt = (home: string) =>
  factoriesNow(
    home,
    throughDoor((door) => door.factories.moveVolumes()),
  );

/**
 * The level of the factory `name` at the store `home`, as its record holds it: undefined where it has none.
 * @param home The store's root folder.
 * @param name The factory's name.
 */
export const readFactoryLevel = (home: string, name: string) =>
  factoriesNow(
    home,
    throughDoor((door) => door.level.read(FactoryName.read(name))),
  );

/**
 * The level of the factory `name` written at the store `home`.
 * @param home The store's root folder.
 * @param name The factory's name.
 * @param level The level written.
 */
export const writeFactoryLevel = (home: string, name: string, level: FactoryLevelFile) =>
  factoriesNow(
    home,
    throughDoor((door) => door.level.write(FactoryName.read(name), level)),
  );

/**
 * The servers of the factory `name` at the store `home`, as its record holds them: none where it has none.
 * @param home The store's root folder.
 * @param name The factory's name.
 */
export const readFactoryServers = (home: string, name: string) =>
  factoriesNow(
    home,
    throughDoor((door) => door.servers.read(FactoryName.read(name))),
  );

/**
 * The servers of the factory `name` written at the store `home`.
 * @param home The store's root folder.
 * @param name The factory's name.
 * @param servers The servers written.
 */
export const writeFactoryServers = (home: string, name: string, servers: FactoryServers) =>
  factoriesNow(
    home,
    throughDoor((door) => door.servers.write(FactoryName.read(name), servers)),
  );

/**
 * What the controller last observed of the factory `name` at the store `home`: undefined where it observed none.
 * @param home The store's root folder.
 * @param name The factory's name.
 */
export const readStatus = (home: string, name: string) =>
  factoriesNow(
    home,
    throughDoor((door) => door.status.read(FactoryName.read(name))),
  );

/**
 * What the controller observed of the factory `name` written at the store `home`.
 * @param home The store's root folder.
 * @param name The factory's name.
 * @param status The status written.
 */
export const writeStatus = (home: string, name: string, status: Status) =>
  factoriesNow(
    home,
    throughDoor((door) => door.status.write(FactoryName.read(name), status)),
  );

/**
 * The factory `name` removed from the store `home` with its level, servers and status, one that does not read included.
 * @param home The store's root folder.
 * @param name The factory's name.
 */
export const removeFactoryAt = (home: string, name: string) => {
  refuseName(name, 'rm');
  return {
    file: factoriesNow(
      home,
      throughDoor((door) => door.factories.remove(FactoryName.read(name))),
    ),
  };
};

/**
 * `nemia factory hire` at the store `home`: the agent `opts.agent` hired into the step `opts.step`; answers the record's key and the agent
 * it replaced.
 * @param home The store's root folder.
 * @param opts The factory's name, the agent, the step as `<workflow>/<step>`, and the store whose `workflows/` is looked in, `home` absent.
 */
export const hireAgentAt = (home: string, opts: { factory: string; agent: string; step: string; home?: string }) => {
  const { was, file } = factoriesNow(
    home,
    wire(opts.factory, { verb: 'hire', step: opts.step, agent: opts.agent }, (factory) =>
      ownAgentRefusal(opts.home ?? home, factory, opts.step),
    ),
  );
  const replaced = was.hires[opts.step];
  return { file, ...(replaced !== undefined && replaced !== opts.agent ? { replaced } : {}) };
};

/**
 * `nemia factory fire` at the store `home`: the hire into `opts.step` taken back; answers the record's key and the agent fired.
 * @param home The store's root folder.
 * @param opts The factory's name and the step as `<workflow>/<step>`.
 */
export const fireAgentAt = (home: string, opts: { factory: string; step: string }) => {
  const { was, file } = factoriesNow(home, wire(opts.factory, { verb: 'fire', step: opts.step }));
  const fired = was.hires[opts.step];
  if (fired === undefined) throw new Missing({ message: unhiredFireRefusal(opts.factory, opts.step, was.hires) });
  return { file, fired };
};

/**
 * `nemia factory attach` at the store `home`: the workflow `opts.workflow` attached, on the repository `opts.repo` where one is named.
 * @param home The store's root folder.
 * @param opts The factory's name, the workflow's folder name, and the folder name of the repository its runs work on, where one is named.
 */
export const attachWorkflowAt = (home: string, opts: { factory: string; workflow: string; repo?: string }) => {
  const change = { verb: 'attach', workflow: opts.workflow, ...(opts.repo === undefined ? {} : { repo: opts.repo }) } as const;
  const { was, now, file } = factoriesNow(home, wire(opts.factory, change));
  return (now === was ? { file, already: true } : { file }) satisfies { file: string; already?: true };
};

/**
 * `nemia factory instruction` at the store `home`: where the instruction is kept.
 * @param home The store's root folder.
 * @param opts The factory's name, and where its instruction is kept, or undefined to remove the key.
 */
export const setInstructionAt = (home: string, opts: { factory: string; at: InstructionAt | undefined }) => ({
  file: factoriesNow(home, instructionPlaced(opts.factory, opts.at)),
});

/**
 * `nemia factory schedule` at the store `home`: the schedule of `opts.workflow` written, one already there replaced.
 * @param home The store's root folder.
 * @param opts The factory's name, the workflow's folder name, the cron, the brief, the retired repository and the time zone, where given.
 */
export const setScheduleAt = (
  home: string,
  opts: { factory: string; workflow: string; cron: string; brief: string; repo?: string; tz?: string },
) => {
  const schedule = scheduleOf(opts);
  const { was, file } = factoriesNow(
    home,
    wire(opts.factory, { verb: 'schedule', workflow: opts.workflow, schedule }, (factory) => scheduleRefused(factory, opts)),
  );
  const replaced = was.schedules[opts.workflow];
  return { file, schedule, ...(replaced ? { replaced } : {}) };
};

/**
 * `nemia factory unschedule` at the store `home`: the schedule of `opts.workflow` taken off.
 * @param home The store's root folder.
 * @param opts The factory's name and the workflow's folder name.
 */
export const clearScheduleAt = (home: string, opts: { factory: string; workflow: string }) => {
  const { was, file } = factoriesNow(home, wire(opts.factory, { verb: 'unschedule', workflow: opts.workflow }));
  const cleared = was.schedules[opts.workflow];
  if (cleared === undefined) throw new Missing({ message: unscheduledRefusal(opts.factory, opts.workflow, Object.keys(was.schedules)) });
  return { file, cleared };
};

/** Each of the above at the test's root, `WF_ROOT` as the process names it when it is called, read then and never as the module loads. */
const atRoot =
  <A extends unknown[], R>(at: (home: string, ...args: A) => R) =>
  (...args: A) =>
    at(wfRoot(process.env), ...args);

/** `factoryNamesAt` at the test's root. */
export const factoryNames = atRoot(factoryNamesAt);
/** `readFactoriesAt` at the test's root. */
export const readFactories = atRoot(readFactoriesAt);
/** `addFactoryAt` at the test's root. */
export const addFactory = atRoot(addFactoryAt);
/** `removeFactoryAt` at the test's root. */
export const removeFactory = atRoot(removeFactoryAt);
/** `readFactoryAt` at the test's root. */
export const readFactory = atRoot(readFactoryAt);
/** `hireAgentAt` at the test's root. */
export const hireAgent = atRoot(hireAgentAt);
/** `fireAgentAt` at the test's root. */
export const fireAgent = atRoot(fireAgentAt);
/** `attachWorkflowAt` at the test's root. */
export const attachWorkflow = atRoot(attachWorkflowAt);
/** `setInstructionAt` at the test's root. */
export const setInstruction = atRoot(setInstructionAt);
/** `setScheduleAt` at the test's root. */
export const setSchedule = atRoot(setScheduleAt);
/** `clearScheduleAt` at the test's root. */
export const clearSchedule = atRoot(clearScheduleAt);

/**
 * Import the run files a test planted under the store `root` into its keyspace (`runsImported`): what a test runs after it wrote a run's
 * record, ask or claim as a file once its process had opened the store, which imports only the first time. Answers how many records it
 * made.
 * @param root The store's root folder.
 */
export const runFilesImported = (root: string) => Effect.runPromise(importedAt(root));

/** The run files planted under the store `root` imported into its keyspace: none to import opens no keyspace, so makes no file. */
const importedAt = (root: string) =>
  Effect.suspend(() => {
    const { runs, claims } = runFilesOf(root);
    return runs.length === 0 && claims.length === 0
      ? Effect.succeed(0)
      : Effect.flatMap(keyspaceAt(keyspaceFile(root)), (keyspace) => runsImported(root, keyspace));
  });

/**
 * `program` run at the store `root` (`StoreRoot`), the run files planted there imported first: a test's way to run a program that yields
 * the Run door.
 * @param root The store's root folder.
 * @param program The program run.
 */
export const atStore = <A, E>(root: string, program: Effect.Effect<A, E, StoreRoot>) =>
  runFilesImported(root).then(() => Effect.runPromise(Effect.provideService(program, StoreRoot, root)));

/**
 * The Run door over the keyspace of the store `root`, handed to `use`, the run files planted there imported first.
 * @param root The store's root folder.
 * @param use What the test reads and writes through the door.
 */
export const runDoorAt = <A, E>(root: string, use: (door: RunDoorShape) => Effect.Effect<A, E>) =>
  atStore(root, Effect.flatMap(RunDoor, use));

/**
 * The Run door over the keyspace of the store `root`, each method run at once: a test's synchronous reading and writing of what a program
 * reads through the door, the run files planted there imported before each call. A test's alone: no program of the package reads a run
 * but through the Effect it yields.
 * @param root The store's root folder.
 */
export const runsNow = (root: string) => {
  const door = Effect.runSync(Effect.provideService(RunDoor, StoreRoot, root));
  const imported = importedAt(root);
  return Object.fromEntries(
    Object.entries(door as Record<string, Record<string, (...args: never[]) => Effect.Effect<unknown, unknown, StoreRoot>>>).map(
      ([group, methods]) => [
        group,
        Object.fromEntries(
          Object.entries(methods).map(([name, method]) => [
            name,
            (...args: never[]) => Effect.runSync(Effect.provideService(Effect.andThen(imported, method(...args)), StoreRoot, root)),
          ]),
        ),
      ],
    ),
  ) as RunsLayer;
};

/** The keyspace of the store `root`, opened at once, its planted run files imported first: what a test's raw writes write through. */
const keyspaceNow = (root: string) =>
  Effect.runSync(Effect.tap(keyspaceAt(keyspaceFile(root)), (keyspace) => runsImported(root, keyspace)));

/** The keyspace of the store `root` a read reads, its planted files imported: undefined where it has no keyspace and none planted. */
const keyspaceRead = (root: string) => {
  const { runs, claims } = runFilesOf(root);
  return !fs.existsSync(keyspaceFile(root)) && runs.length === 0 && claims.length === 0 ? undefined : keyspaceNow(root);
};

/**
 * A run as the Run door reads it at the store `root`, at once: what a test reads a run's record by.
 * @param root The store's root folder.
 * @param id The run's id.
 */
export const runRecord = (root: string, id: string) => runsNow(root).runs.read(id);

/**
 * Every run as the Run door lists it at the store `root`, at once.
 * @param root The store's root folder.
 * @param said Where a record that does not read is said.
 * @param kept The run a memo keeps for an id, listed as given and its record not read.
 */
export const listRuns = (root: string, said?: (line: string) => void, kept?: (id: string) => Run | undefined) =>
  runsNow(root).runs.list(said, kept);

/**
 * A run's record planted at the store `root` as it is, unchecked, and its claim not made: a test's run, made as no verb would make it.
 * Refused where a record is at its id.
 * @param root The store's root folder.
 * @param run The record planted.
 */
export const writeRun = (root: string, run: Run) =>
  void Effect.runSync(keyspaceNow(root).write(runKey(run.id), { verb: 'create', expected: null, value: recordValue(run) }));

/**
 * A run's record written over at the store `root` as it is, unchecked: false where none is there.
 * @param root The store's root folder.
 * @param run The record written.
 */
export const rewriteRun = (root: string, run: Run) =>
  Effect.runSync(
    keyspaceNow(root)
      .write(runKey(run.id), { verb: 'update', expected: null, value: recordValue(run) })
      .pipe(
        Effect.as(true),
        Effect.catchTag('KeyRefused', () => Effect.succeed(false)),
      ),
  );

/**
 * The text a record or an ask holds at its key in the store `root`, raw: undefined where none is there.
 * @param root The store's root folder.
 * @param key The record's key (`runKey`, `askKey`, `claimKey`).
 */
export const recordText = (root: string, key: string) => {
  const keyspace = keyspaceRead(root);
  return keyspace === undefined ? undefined : Effect.runSync(keyspace.get(key))?.value;
};

/**
 * The names under the store `home`'s `runs/` folder, none where the folder is not there: a run's own folders, which a store with no run
 * started has none of.
 * @param home The store's root folder.
 */
export const runFolderNames = (home: string) => {
  const dir = path.join(home, 'runs');
  return fs.existsSync(dir) ? fs.readdirSync(dir) : [];
};

/**
 * The revision a record holds at its key in the store `root`: undefined where none is there. Two reads that answer the same prove no
 * write came between.
 * @param root The store's root folder.
 * @param key The record's key.
 */
export const recordRevision = (root: string, key: string) => {
  const keyspace = keyspaceRead(root);
  return keyspace === undefined ? undefined : Effect.runSync(keyspace.get(key))?.revision;
};

/**
 * The keys under `prefix` in the store `root`: what a test reads a run's asks by.
 * @param root The store's root folder.
 * @param prefix The keys' prefix (`asksPrefix`).
 */
export const keysUnder = (root: string, prefix: string) => {
  const keyspace = keyspaceRead(root);
  return keyspace === undefined ? [] : Effect.runSync(keyspace.keys(prefix));
};

/**
 * Text planted at a key of the store `root`, over what is there: a test's raw ask or record, written as no verb would write it.
 * @param root The store's root folder.
 * @param key The key (`askKey`, `runKey`).
 * @param text What it holds.
 */
export const plantRecord = (root: string, key: string, text: string) =>
  void Effect.runSync(
    Effect.flatMap(Effect.succeed(keyspaceNow(root)), (keyspace) =>
      keyspace.within((tx) =>
        Effect.flatMap(tx.get(key), (there) =>
          tx.write(key, { verb: there === undefined ? 'create' : 'update', expected: null, value: text }),
        ),
      ),
    ),
  );

/**
 * Every run's record, claim, ask and marker of the store `root` deleted: what a test that empties its store between stories runs beside
 * removing
 * `runs/`, since the keyspace keeps them.
 * @param root The store's root folder.
 */
export const emptyRuns = (root: string) => {
  const keyspace = keyspaceRead(root);
  if (keyspace === undefined) return;
  for (const prefix of ['/registry/runs/', '/registry/claims/', '/registry/asks/', RUNMARKS_PREFIX, FORGETTING_PREFIX])
    for (const key of Effect.runSync(keyspace.keys(prefix))) dropRecord(root, key);
};

/**
 * The keyspace of the store `root` compacted as the daemon's sweep does at `now`, keeping the last `windowMs`: the revision it
 * compacted up to. A test that sweeps twice, a window apart, sees what a watch from a revision older than the first is refused.
 * @param root The store's root folder.
 * @param windowMs How long a revision is kept at least, in milliseconds.
 * @param now The time of the sweep, in milliseconds.
 */
export const compactedAt = (root: string, windowMs: number, now: number) => Effect.runSync(keyspaceNow(root).compact(windowMs, now));

/**
 * A key of the store `root` deleted, there or not.
 * @param root The store's root folder.
 * @param key The key.
 */
export const dropRecord = (root: string, key: string) =>
  void Effect.runSync(
    keyspaceNow(root)
      .write(key, { verb: 'delete', expected: null, value: '' })
      .pipe(Effect.catchTag('KeyRefused', () => Effect.void)),
  );

export {
  askDoneKey,
  askKey,
  askKeyOf,
  asksPrefix,
  claimKey,
  forgettingKey,
  runKey,
  runMarkKey,
  runMarksPrefix,
  saidKey,
} from './src/runs/run-keys.ts';

/**
 * Text planted as one of the run's markers at the store `root`, over what is there: a test's marker, written as no verb would write it. A
 * word said to a step is `said/<n>`.
 * @param root The store's root folder.
 * @param id The run's id.
 * @param marker The marker's name under the run's marks: `cancelled`, `pruned`, `hold`, `unheld`, `labels`, `refresh`, or `said/<n>`.
 * @param text What it holds.
 */
export const plantMarker = (root: string, id: string, marker: RunMarker | `said/${number}`, text: string) =>
  plantRecord(root, `${runMarksPrefix(id)}${marker}`, text);

/**
 * Mark the run cancelled at the store `root`, as `nemia cancel` does where none stands: the first cancellation is kept, its actor with it.
 * Answers the time that stands.
 * @param root The store's root folder.
 * @param id The run's id.
 * @param actor Who calls the run off, where known.
 */
export const markCancelled = (root: string, id: string, actor?: Actor) => {
  const there = recordText(root, runMarkKey(id, 'cancelled'));
  if (there !== undefined) return cancelledIn(there).at;
  const at = new Date().toISOString();
  plantMarker(root, id, 'cancelled', actor ? JSON.stringify({ at, actor }) : at);
  return at;
};

/**
 * The text of one of the run's markers at the store `root`, or undefined where it has none.
 * @param root The store's root folder.
 * @param id The run's id.
 * @param marker The marker's name under the run's marks (`plantMarker`).
 */
export const markerText = (root: string, id: string, marker: RunMarker | `said/${number}`) =>
  recordText(root, `${runMarksPrefix(id)}${marker}`);

/**
 * The names of the markers the run has at the store `root`, sorted: `cancelled`, `hold`, `said/1`, …
 * @param root The store's root folder.
 * @param id The run's id.
 */
export const markerKeys = (root: string, id: string) =>
  keysUnder(root, runMarksPrefix(id)).map((key) => key.slice(runMarksPrefix(id).length));

/**
 * One of the run's markers at the store `root` taken away, there or not.
 * @param root The store's root folder.
 * @param id The run's id.
 * @param marker The marker's name under the run's marks (`plantMarker`).
 */
export const dropMarker = (root: string, id: string, marker: RunMarker | `said/${number}`) =>
  dropRecord(root, `${runMarksPrefix(id)}${marker}`);

/**
 * The key a retry ask of the step's try `n` is written at, as `nemia retry` answers it.
 * @param id The run's id.
 * @param step The step's name.
 * @param n The try asked for.
 */
export const retryAskKey = (id: string, step: string, n: number) => askKey(id, { of: 'try', step, n });

/**
 * The key a round ask of the loop `step`'s round `n` is written at, as `nemia round` answers it.
 * @param id The run's id.
 * @param step The loop's step.
 * @param n The round asked for.
 */
export const roundAskKey = (id: string, step: string, n: number) => askKey(id, { of: 'round', step, n });

/**
 * The key an approval of the gate at the step's try `n` is written at, as `nemia approve` answers it.
 * @param id The run's id.
 * @param step The gated step.
 * @param n The try approved.
 */
export const approvalKey = (id: string, step: string, n: number) => askKey(id, { of: 'gate', step, n });

/**
 * The key an acceptance of the loop `step`'s try `n` is written at, as `nemia approve` of a loop out of rounds answers it.
 * @param id The run's id.
 * @param step The loop's step.
 * @param n The try accepted.
 */
export const acceptKey = (id: string, step: string, n: number) => askKey(id, { of: 'loop', step, n });

/**
 * The names of the run's asks at the store `root`, waiting (`retry-implement-2`) and, under `done/`, spent: what a test reads a run's
 * asks by, as it once listed `runs/<id>.asks/`.
 * @param root The store's root folder.
 * @param id The run's id.
 */
export const askNames = (root: string, id: string) => keysUnder(root, asksPrefix(id)).map((key) => key.slice(asksPrefix(id).length));

/**
 * The text of the run's ask `name` at the store `root` (`retry-implement-2`, `done/approve-ship-1`), or undefined where none is.
 * @param root The store's root folder.
 * @param id The run's id.
 * @param name The ask's name under the run's asks.
 */
export const askText = (root: string, id: string, name: string) => recordText(root, askKeyOf(id, name));

/**
 * Text planted as the run's ask `name` at the store `root`, over what is there: a test's ask, written as no verb would write it.
 * @param root The store's root folder.
 * @param id The run's id.
 * @param name The ask's name under the run's asks.
 * @param text What it holds.
 */
export const plantAsk = (root: string, id: string, name: string, text: string) => plantRecord(root, askKeyOf(id, name), text);

/**
 * The run's ask `name` at the store `root` taken away, there or not.
 * @param root The store's root folder.
 * @param id The run's id.
 * @param name The ask's name under the run's asks.
 */
export const dropAsk = (root: string, id: string, name: string) => dropRecord(root, askKeyOf(id, name));

/**
 * The run's asks waiting at the store `root`, as a pass reads them (`asks.read`).
 * @param root The store's root folder.
 * @param id The run's id.
 */
export const readAsks = (root: string, id: string) => runsNow(root).asks.read(id);

/**
 * Every retry ask of the run at the store `root` that carried a message, waiting or spent (`asks.answers`).
 * @param root The store's root folder.
 * @param id The run's id.
 */
export const readAnswers = (root: string, id: string) => runsNow(root).asks.answers(id);
export { RECORD_CEILING } from './src/keyspace/keyspace.store.ts';
export { deliveryKey, subscriptionKey } from './src/subscription/subscription.store.ts';
export { cardKey, cardTryKey };

/**
 * The text of the card `name` the store `root` holds, as the Card door reads it (a card file dropped into its inbox taken up first), or
 * null where it holds none: what a test reads a card filed or written back by.
 * @param root The store's root folder.
 * @param name The card's name.
 */
export const cardText = (root: string, name: string) =>
  Effect.runSync(Effect.flatMap(CardDoor, (door) => door.cards.read(CardName.read(name))).pipe(Effect.provide(cardDoorAt(root))));

/**
 * The names of the cards the store `root` holds, sorted, as the Card door lists them (a card file dropped into its inbox taken up first).
 * @param root The store's root folder.
 */
export const cardNames = (root: string) =>
  Effect.runSync(Effect.flatMap(CardDoor, (door) => door.cards.entries()).pipe(Effect.provide(cardDoorAt(root)))).map((e) =>
    e.file.slice(0, -'.md'.length),
  );

/**
 * The card `name` planted in the store `root` with `text`, over what is there: a card filed, or written over by hand, as no verb would.
 * @param root The store's root folder.
 * @param name The card's name.
 * @param text The card's text.
 * @param filedAt When it was filed, as an ISO time.
 */
export const plantCard = (root: string, name: string, text: string, filedAt = new Date().toISOString()) =>
  plantRecord(root, cardKey(name), JSON.stringify({ text, filedAt }));

/**
 * Every card and every try of one of the store `root` deleted: what a test that empties its store between stories runs beside removing
 * `inbox/` and `queue/`, since the keyspace keeps them.
 * @param root The store's root folder.
 */
export const emptyCards = (root: string) => {
  for (const key of [...keysUnder(root, '/registry/cards/'), ...keysUnder(root, '/registry/cardtries/')]) dropRecord(root, key);
};

/**
 * Every kind's files of before the keyspace the store `root` holds taken up into its records and moved aside — delegations,
 * subscriptions, the revision ledger, tokens, cards and tries — as each door's first read takes them up: what a test that prints a store
 * before its first read runs first, so the store it prints is the one its reads leave.
 * @param root The store's root folder.
 */
export const kindsTakenUp = (root: string) => {
  for (const kind of [DELEGATION_FILES, SUBSCRIPTION_FILES, LEDGER_FILES, TOKEN_FILES, CARD_FILES, RUN_MARK_FILES, FACTORY_FILES])
    void Effect.runSync(kindKeyspaceHeld(root, kind));
};
