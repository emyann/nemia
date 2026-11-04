/**
 * The Feed door's memory stand-in, held to the door's walks (`test/feed-walks.ts`), each on a stand-in of its own: what the files say
 * (`feed.store.test.ts` runs the same walks on them), the stand-in says.
 */
import { test } from 'node:test';
import { MEMORY_ROOT, feedDoorMemory } from './memory.store.ts';
import { FeedDoor } from './feed.store.ts';
import { doorFrom, walksOn } from '../../test/door-walks.ts';
import { FEED_WALKS } from '../../test/feed-walks.ts';

for (const [name, body] of walksOn(FEED_WALKS, () => ({ door: doorFrom(FeedDoor, feedDoorMemory()), root: MEMORY_ROOT, layer: 'memory' })))
  test(name, body);
