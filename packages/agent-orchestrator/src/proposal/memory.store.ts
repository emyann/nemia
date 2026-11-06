/**
 * The Proposal door's memory stand-in: a fresh layer of `ProposalDoor` per call, its proposals held in a map, built by `proposalDoorOver`
 * as the files layer is. A test's alone: no file of `src` imports it (`test/boundary.test.ts`, `STAND_INS`).
 */
import { Layer } from 'effect';
import type { Proposal } from 'objects';
import { factoryNameRefusal } from '../factory/factory.ts';
import { Invalid } from '../refusal/refusal.ts';
import { factoryOf, noProposal, proposalDoorOver, ProposalDoor, proposalNamed, takenProposal } from './proposal.store.ts';

/** A fresh Proposal door over a map: no proposal made. */
export function proposalDoorMemory(): Layer.Layer<never> {
  const held = new Map<string, Proposal>();
  const key = (factory: string, name: string): string => {
    proposalNamed(factory, name);
    return `${factory}/${name}`;
  };
  const inFactory = (factory: string): Proposal[] =>
    [...held.values()]
      .filter((p) => p.metadata.namespace === factory)
      .sort((a, b) => (a.metadata.name < b.metadata.name ? -1 : a.metadata.name > b.metadata.name ? 1 : 0));
  return Layer.succeed(ProposalDoor)(
    proposalDoorOver({
      proposals: {
        factories: () => [...new Set([...held.values()].map((p) => p.metadata.namespace ?? ''))].filter(Boolean).sort(),
        list: (factory) => {
          const bad = factoryNameRefusal(factory);
          if (bad !== undefined) throw new Invalid({ message: bad });
          return inFactory(factory);
        },
        read: (factory, name) => held.get(key(factory, name)),
        create: (proposal) => {
          const factory = factoryOf(proposal);
          const at = key(factory, proposal.metadata.name);
          if (held.has(at)) throw takenProposal(factory, proposal.metadata.name);
          held.set(at, proposal);
          return proposal;
        },
        write: (proposal) => {
          const factory = factoryOf(proposal);
          const at = key(factory, proposal.metadata.name);
          if (!held.has(at)) throw noProposal(factory, proposal.metadata.name);
          held.set(at, proposal);
          return proposal;
        },
      },
    }),
  );
}
