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

/**
 * A function of the factories' store taking the store's root first, as a test plants a factory by hand: at the root its process's
 * `WF_ROOT` names when it is called, read then and never as the module loads. No file of the package's `src` but the Factory door's
 * reads the store (`src/factory/door/factories.store.test.ts`), so these spellings, which name no root, are the tests' alone.
 */
const atRoot =
  <A extends unknown[], R>(at: (home: string, ...args: A) => R) =>
  (...args: A): R =>
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
