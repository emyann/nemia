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

import {
  addFactoryAt,
  attachWorkflowAt,
  clearScheduleAt,
  factoriesDirAt,
  factoryNamesAt,
  fireAgentAt,
  hireAgentAt,
  readFactoriesAt,
  readFactoryAt,
  removeFactoryAt,
  setInstructionAt,
  setScheduleAt,
} from './src/factory/factory.store.ts';
import { wfRoot } from './src/config/config.store.ts';
import { Effect } from 'effect';
import { StoreRoot } from './src/config/root.store.ts';
import { keyspaceAt, keyspaceFile } from './src/keyspace/keyspace.store.ts';
import { runsImported } from './src/runs/records.store.ts';
import { RunDoor, type RunDoorShape, type RunsLayer } from './src/runs/runs.store.ts';

/**
 * A function of the factories' store taking the store's root first, as a test plants a factory by hand: at the root its process's
 * `WF_ROOT` names when it is called, read then and never as the module loads. No file of the package's `src` but the Factory door's
 * reads the store (`src/factory/door/factories.store.test.ts`), so these spellings, which name no root, are the tests' alone.
 */
const atRoot =
  <A extends unknown[], R>(at: (home: string, ...args: A) => R) =>
  (...args: A) =>
    at(wfRoot(process.env), ...args);

/** `factoriesDirAt` at the test's root. */
export const factoriesDir = atRoot(factoriesDirAt);
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
export const runFilesImported = (root: string) =>
  Effect.runPromise(Effect.flatMap(keyspaceAt(keyspaceFile(root)), (keyspace) => runsImported(root, keyspace)));

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
  const imported = Effect.flatMap(keyspaceAt(keyspaceFile(root)), (keyspace) => runsImported(root, keyspace));
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
