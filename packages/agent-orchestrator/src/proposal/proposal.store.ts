/**
 * The Proposal door: the one way a program reads and writes a factory's proposals, a file each,
 * `<store>/factories/<factory>/proposals/<name>.json`, holding the object as objects' `Proposal` says it. An Effect service,
 * `ProposalDoor`, its default rooted (`rootedDoor`) as the Factory door's is; a test gives it `proposalDoorMemory()` (`memory.store.ts`).
 * Both layers are built by `proposalDoorOver`, so a write is checked one way on both: the object as `Proposal` decodes it, its namespace a
 * factory's name and its name a proposal's; its `resourceVersion` is the digest of its spec and status, stamped as it is written. A
 * proposal made at a name taken is `Conflict`, one written back that is not there `Missing`. The walks of `test/proposal-walks.ts` hold
 * both layers to one table.
 *
 * Every function here takes the store's root as a required `home: string`, as `src/servers/` does.
 */
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { Context, Effect, Layer, Result, Schema } from 'effect';
import { Proposal } from 'objects';
import { checked, doorOf, rootedDoor, type DoorOf } from '../door/door.store.ts';
import { factoryNameRefusal } from '../factory/factory.ts';
import { firstRefusal } from '../record/record.store.ts';
import { Conflict, Invalid, Missing } from '../refusal/refusal.ts';

/** A layer of the Proposal door, as plain synchronous methods: a factory's proposals, one read, one made, one written back. */
export type ProposalLayer = {
  readonly proposals: {
    readonly factories: () => readonly string[];
    readonly list: (factory: string) => readonly Proposal[];
    readonly read: (factory: string, name: string) => Proposal | undefined;
    readonly create: (proposal: Proposal) => Proposal;
    readonly write: (proposal: Proposal) => Proposal;
  };
};

/** The Proposal door's shape: each method of `ProposalLayer` answering an Effect. */
export type ProposalDoorShape = DoorOf<ProposalLayer, string>;

/** Why `name` is no proposal's name, or undefined where it is one: lowercase letters, digits and dashes, as the machinery mints them. */
export const proposalNameRefusal = (name: string): string | undefined =>
  /^[a-z0-9][a-z0-9-]*$/.test(name)
    ? undefined
    : `${JSON.stringify(name)} is no proposal's name: a proposal is named <proposer>-<five letters or digits>, as nemia get proposals -n <factory> lists them.`;

/** The factory's and proposal's names, refused (`Invalid`) where either is no name; what both layers check before they touch a record. */
export function proposalNamed(factory: string, name: string): void {
  const bad = factoryNameRefusal(factory) ?? proposalNameRefusal(name);
  if (bad !== undefined) throw new Invalid({ message: bad });
}

/** The factory a proposal is in: its namespace, refused (`Invalid`) where it names none. */
export function factoryOf(proposal: Proposal): string {
  const factory = proposal.metadata.namespace;
  if (factory === undefined) throw new Invalid({ message: `the proposal ${proposal.metadata.name} names no namespace: give it its factory's.` });
  proposalNamed(factory, proposal.metadata.name);
  return factory;
}

/** The `resourceVersion` of a proposal: a digest of its spec and status, so every change of either is a new one. */
export const proposalVersion = (proposal: Pick<Proposal, 'spec' | 'status'>): string =>
  createHash('sha256')
    .update(JSON.stringify({ spec: proposal.spec, status: proposal.status }))
    .digest('hex')
    .slice(0, 16);

/** `proposal` stamped with its `resourceVersion`. */
export const stamped = (proposal: Proposal): Proposal => ({
  ...proposal,
  metadata: { ...proposal.metadata, resourceVersion: proposalVersion(proposal) },
});

/** A proposal written: as objects' `Proposal` decodes it. */
const proposalChecked = checked(Proposal, (proposal: Proposal) => `the proposal ${proposal.metadata.name}`);

/** The door over `layer`: each method as `doorOf` makes it, each write checked and stamped before the layer writes. */
export function proposalDoorOver(layer: ProposalLayer): ProposalDoorShape {
  const door = doorOf<ProposalLayer, string>(layer);
  return {
    proposals: {
      ...door.proposals,
      create: (proposal) => Effect.flatMap(proposalChecked(stamped(proposal)), (p) => door.proposals.create(p)),
      write: (proposal) => Effect.flatMap(proposalChecked(stamped(proposal)), (p) => door.proposals.write(p)),
    },
  };
}

/** The refusal of a proposal made at a name taken. */
export const takenProposal = (factory: string, name: string): Conflict =>
  new Conflict({ message: `${factory} has a proposal ${name} already: propose again, and the machinery names it anew.` });

/** The refusal of a proposal written back that is not there. */
export const noProposal = (factory: string, name: string): Missing =>
  new Missing({ message: `${factory} has no proposal ${name}: list them with nemia get proposals -n ${factory}.` });

/** The folder of the factory `factory`'s proposals, under the store `home`. */
const proposalsDir = (home: string, factory: string): string => path.join(home, 'factories', factory, 'proposals');

/** The file of the proposal `name` of `factory`, under the store `home`. */
function proposalFile(home: string, factory: string, name: string): string {
  proposalNamed(factory, name);
  return path.join(proposalsDir(home, factory), `${name}.json`);
}

/** The proposal `name` of `factory`, or undefined where none is. Refused (`Invalid`), naming the file, where it does not read. */
function readProposal(home: string, factory: string, name: string): Proposal | undefined {
  const file = proposalFile(home, factory, name);
  let text: string;
  try {
    text = fs.readFileSync(file, 'utf8');
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === 'ENOENT') return undefined;
    throw err;
  }
  const fix = 'the machinery writes it alone: move it aside, and propose again';
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    throw new Invalid({ message: `${file} is not JSON: ${fix}.` });
  }
  const read = Schema.decodeUnknownResult(Proposal)(raw);
  if (Result.isFailure(read)) {
    const { path: at, words } = firstRefusal(raw, read.failure);
    throw new Invalid({ message: `${file}: ${at.length ? `its ${at.join('.')} ` : ''}${words}: ${fix}.` });
  }
  return read.success;
}

/** `proposal` written whole at its file, through a hidden file renamed over it. */
function writeWhole(home: string, proposal: Proposal): Proposal {
  const file = proposalFile(home, factoryOf(proposal), proposal.metadata.name);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const hidden = path.join(path.dirname(file), `.${proposal.metadata.name}.json.${process.pid}`);
  fs.writeFileSync(hidden, `${JSON.stringify(proposal, null, 2)}\n`);
  fs.renameSync(hidden, file);
  return proposal;
}

/** The names of the entries of `dir`, none where it is not there. */
const entriesOf = (dir: string): string[] => {
  try {
    return fs.readdirSync(dir);
  } catch {
    return [];
  }
};

/** The proposals of the store `home`, as a layer of the door. */
export function proposalFiles(home: string): ProposalLayer {
  return {
    proposals: {
      factories: () =>
        entriesOf(path.join(home, 'factories'))
          .filter((f) => factoryNameRefusal(f) === undefined && entriesOf(proposalsDir(home, f)).some((n) => n.endsWith('.json')))
          .sort(),
      list: (factory) => {
        const bad = factoryNameRefusal(factory);
        if (bad !== undefined) throw new Invalid({ message: bad });
        return entriesOf(proposalsDir(home, factory))
          .filter((n) => n.endsWith('.json'))
          .map((n) => n.slice(0, -'.json'.length))
          .filter((name) => proposalNameRefusal(name) === undefined)
          .sort()
          .flatMap((name) => readProposal(home, factory, name) ?? []);
      },
      read: (factory, name) => readProposal(home, factory, name),
      create: (proposal) => {
        const factory = factoryOf(proposal);
        if (readProposal(home, factory, proposal.metadata.name) !== undefined) throw takenProposal(factory, proposal.metadata.name);
        return writeWhole(home, proposal);
      },
      write: (proposal) => {
        const factory = factoryOf(proposal);
        if (readProposal(home, factory, proposal.metadata.name) === undefined) throw noProposal(factory, proposal.metadata.name);
        return writeWhole(home, proposal);
      },
    },
  };
}

/** The Proposal door, as the service a program yields: rooted, refused `Invalid` where the program was given no store root. */
export const ProposalDoor = Context.Reference<ProposalDoorShape>('agent-orchestrator/ProposalDoor', {
  defaultValue: () => rootedDoor((root) => proposalDoorOver(proposalFiles(root)), 'Proposal door'),
});

/** The Proposal door over the files of the store `root`, as a layer. */
export const proposalDoorFiles = (root: string): Layer.Layer<never> => Layer.succeed(ProposalDoor)(proposalDoorOver(proposalFiles(root)));
