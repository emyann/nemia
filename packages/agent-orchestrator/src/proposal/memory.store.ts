/**
 * The Proposal door's memory stand-in: a fresh layer of `ProposalDoor` per call, its proposals held in a keyspace of its own in memory
 * (`:memory:`), opened when a method first runs and kept, and built by `proposalDoorOver` over `proposalRecords` as the rooted door is,
 * so the walks hold one code. A test's alone: no file of `src` imports it (`test/boundary.test.ts`, `STAND_INS`).
 */
import { Effect, Layer } from 'effect';
import { keyspaceAt, type Keyspace } from '../keyspace/keyspace.store.ts';
import { proposalDoorOver, ProposalDoor, proposalRecords } from './proposal.store.ts';

/** A fresh Proposal door over a keyspace in memory: no proposal made. */
export function proposalDoorMemory() {
  let held: Keyspace | undefined;
  const open = Effect.suspend(() =>
    held === undefined
      ? Effect.map(keyspaceAt(':memory:'), (keyspace) => {
          held ??= keyspace;
          return held;
        })
      : Effect.succeed(held),
  );
  return Layer.succeed(ProposalDoor)(proposalDoorOver(proposalRecords(open)));
}
