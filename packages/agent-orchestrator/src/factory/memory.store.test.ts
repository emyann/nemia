/**
 * The Factory door's memory stand-in, held to the door's walks (`test/factory-walks.ts`), each on a stand-in of its own: what the files
 * say (`factories.store.test.ts` runs the same walks on them), the stand-in says.
 */
import { test } from 'node:test';
import { MEMORY_ROOT, factoryDoorMemory } from './memory.store.ts';
import { FactoryDoor } from './factories.store.ts';
import { doorFrom, walksOn } from '../../test/door-walks.ts';
import { FACTORY_WALKS } from '../../test/factory-walks.ts';

for (const [name, body] of walksOn(FACTORY_WALKS, () => ({
  door: doorFrom(FactoryDoor, factoryDoorMemory()),
  root: MEMORY_ROOT,
  layer: 'memory',
})))
  test(name, body);
