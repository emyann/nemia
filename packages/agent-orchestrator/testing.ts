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
import fs from 'node:fs';
import { wfRoot } from './src/config/config.store.ts';
import { Effect } from 'effect';
import { StoreRoot } from './src/config/root.store.ts';
import { keyspaceAt, keyspaceFile } from './src/keyspace/keyspace.store.ts';
import { runFilesOf, runsImported } from './src/runs/records.store.ts';
import { askKey, askKeyOf, asksPrefix, runKey } from './src/runs/run-keys.ts';
import { recordValue } from './src/record/record.store.ts';
import type { Run } from './src/record/record.ts';
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
 * Every run's record, claim and ask of the store `root` deleted: what a test that empties its store between stories runs beside removing
 * `runs/`, since the keyspace keeps them.
 * @param root The store's root folder.
 */
export const emptyRuns = (root: string) => {
  const keyspace = keyspaceRead(root);
  if (keyspace === undefined) return;
  for (const prefix of ['/registry/runs/', '/registry/claims/', '/registry/asks/'])
    for (const key of Effect.runSync(keyspace.keys(prefix))) dropRecord(root, key);
};

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

export { askDoneKey, askKey, askKeyOf, asksPrefix, claimKey, runKey } from './src/runs/run-keys.ts';

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
