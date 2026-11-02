/**
 * The Card door's memory stand-in, held to the door's walks (`test/card-walks.ts`), each on a stand-in of its own: what the files say
 * (`cards.store.test.ts` runs the same walks on them), the stand-in says.
 */
import { test } from 'node:test';
import { MEMORY_ROOT, cardDoorMemory } from './memory.store.ts';
import { CardDoor } from './cards.store.ts';
import { doorFrom, walksOn } from '../../test/door-walks.ts';
import { CARD_WALKS } from '../../test/card-walks.ts';

for (const [name, body] of walksOn(CARD_WALKS, () => ({ door: doorFrom(CardDoor, cardDoorMemory()), root: MEMORY_ROOT, layer: 'memory' })))
  test(name, body);
