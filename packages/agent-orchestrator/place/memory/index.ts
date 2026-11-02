/**
 * The test entry's one face: the test place, `testPlace`, which makes a place that answers from memory with no process, and the types of
 * what it answers; and the stand-ins of the Agent and Skill doors, `agentDoorMemory` and `skillDoorMemory`, which hold agents and skills
 * in maps (`MEMORY_AGENTS` the folder of yours there). A test names it where it gives its programs a place or a door; no file of the
 * program the package exports imports it.
 */
export { testPlace, type TestPlace } from './place.ts';
export type { Tree, World } from './world.ts';
export { agentDoorMemory, MEMORY_AGENTS } from '../../src/agents/agent-memory.store.ts';
export { skillDoorMemory } from '../../src/skills/skill-memory.store.ts';
