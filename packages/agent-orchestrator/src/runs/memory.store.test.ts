/**
 * The Run door's memory stand-in, held to the door's walks (`test/run-walks.ts`), each on a stand-in of its own: what the files say
 * (`test/run-store.test.ts` runs the same walks on them), the stand-in says.
 */
import { test } from 'node:test';
import { MEMORY_ROOT, runDoorMemory } from './memory.store.ts';
import { RunDoor } from './runs.store.ts';
import { doorFrom, walksOn } from '../../test/door-walks.ts';
import { RUN_WALKS } from '../../test/run-walks.ts';

for (const [name, body] of walksOn(RUN_WALKS, () => ({ door: doorFrom(RunDoor, runDoorMemory()), root: MEMORY_ROOT, layer: 'memory' })))
  test(name, body);
