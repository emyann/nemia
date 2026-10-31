/**
 * The test place's one face: `testPlace`, which makes a place that answers from memory with no process, and the types of what it
 * answers. A test names it where it gives its programs a place; no file of the shipped program imports it.
 */
export { testPlace, type TestPlace } from './place.ts';
export type { Tree, World } from './world.ts';

/** The Run door's memory stand-in (`src/runs/memory.store.ts`): a fresh layer of `RunDoor` per call, given to a test's program. */
export { runDoorMemory, MEMORY_ROOT } from '../../src/runs/memory.store.ts';
export { RunDoor, type RunDoorShape } from '../../src/runs/runs.store.ts';
