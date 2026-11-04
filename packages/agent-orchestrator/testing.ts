/**
 * The testing entry (`agent-orchestrator/testing`): the test place, `testPlace` (`place/memory`), which makes a place that answers from
 * memory with no process, and the types of what it answers; and the stand-ins of the Agent and Skill doors, `agentDoorMemory` and
 * `skillDoorMemory`, which hold agents and skills in maps (`MEMORY_AGENTS` the folder of yours there). A file of its own, since a place's
 * code imports nothing of `src` but what a place is (`test/boundary.test.ts`). A test names it where it gives its programs a place or a
 * door; no file of the program the package exports imports it (`test/contract.test.ts`).
 */
export { testPlace, type TestPlace, type Tree, type World } from './place/memory/index.ts';
export { agentDoorMemory, MEMORY_AGENTS } from './src/agents/agent-memory.store.ts';
export { skillDoorMemory } from './src/skills/skill-memory.store.ts';
