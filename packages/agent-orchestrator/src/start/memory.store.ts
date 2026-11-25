/**
 * The File door's memory stand-in: a fresh layer of `FileDoor` per call, its Files' records held in a keyspace of its own in memory
 * (`:memory:`), opened when a method first runs and kept, or in the keyspace a test hands it, and their bytes under the root it is given;
 * built by `fileRecords` as the rooted door is, so the walks hold one code. A test's alone: no file of `src` imports it
 * (`test/boundary.test.ts`, `STAND_INS`).
 */
import { Effect, Layer } from 'effect';
import { keyspaceAt, type Keyspace } from '../keyspace/keyspace.store.ts';
import { FileDoor, fileRecords } from './files.store.ts';

/**
 * A fresh File door over a keyspace in memory: no File kept.
 * @param home The root its Files' bytes are kept under (`files/`), and whose `inbox/` holds the cards that keep them.
 * @param keyspace The keyspace its records are held in, where a test points a record of its own at a File; a fresh one in memory where
 *   none is given.
 */
export function fileDoorMemory(home: string, keyspace?: Keyspace) {
  let held = keyspace;
  const open = Effect.suspend(() =>
    held === undefined
      ? Effect.map(keyspaceAt(':memory:'), (opened) => {
          held ??= opened;
          return held;
        })
      : Effect.succeed(held),
  );
  return Layer.succeed(FileDoor)(fileRecords(open, open, home));
}
