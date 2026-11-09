/**
 * The Delegation door: the one way a program reads and writes what the person lets an agent approve in a factory unasked at auto, a file
 * per agent, `<store>/factories/<factory>/delegations/<agent>.json`, holding its grants (Kubernetes' PolicyRule fields) and when it was
 * written. An Effect service, `DelegationDoor`, its default rooted (`rootedDoor`) as the Factory door's is; a test gives it
 * `delegationDoorMemory()` (`memory.store.ts`). Both layers are built by `delegationDoorOver`, so a write is checked one way on both: the
 * factory's and the agent's names, and the grants as objects' `DelegationSpec` decodes them. The walks of `test/delegation-walks.ts` hold
 * both layers to one table.
 *
 * Every function here takes the store's root as a required `home: string`, as `src/factory/servers/` does.
 */
import fs from 'node:fs';
import path from 'node:path';
import { Context, Effect, Layer, Result, Schema } from 'effect';
import { DelegationSpec } from 'objects';
import { checked, doorOf, rootedDoor, type DoorOf } from '../door/door.store.ts';
import { factoryNameRefusal } from '../factory/factory.ts';
import { agentNameRefusal } from '../agents/agents.ts';
import { firstRefusal } from '../record/record.store.ts';
import { Invalid } from '../refusal/refusal.ts';
import { writeWhole } from '../whole-file/whole-file.store.ts';

/** One agent's delegation in one factory, as the store keeps it: its grants, and when it was last written. */
export type DelegationRecord = {
  readonly factory: string;
  readonly agent: string;
  readonly since: string;
  readonly spec: DelegationSpec;
};

/** The file a delegation is kept in. */
const FileSchema = Schema.Struct({ since: Schema.String, spec: DelegationSpec });

/** A layer of the Delegation door, as plain synchronous methods: a factory's delegations, one read, one written whole, one removed. */
export type DelegationLayer = {
  readonly delegations: {
    readonly list: (factory: string) => readonly DelegationRecord[];
    readonly read: (factory: string, agent: string) => DelegationRecord | undefined;
    readonly write: (record: DelegationRecord) => DelegationRecord;
    readonly remove: (factory: string, agent: string) => boolean;
  };
};

/** The Delegation door's shape: each method of `DelegationLayer` answering an Effect. */
export type DelegationDoorShape = DoorOf<DelegationLayer, string>;

/** The factory's and agent's names, refused (`Invalid`) where either is no name; what both layers check before they touch a record. */
export function delegationNamed(factory: string, agent: string): void {
  const bad = factoryNameRefusal(factory) ?? agentNameRefusal(agent);
  if (bad !== undefined) throw new Invalid({ message: bad });
}

/** A delegation's grants written, as objects' `DelegationSpec` decodes them. */
const specChecked = (record: DelegationRecord) =>
  checked(DelegationSpec, () => `the delegation of ${record.agent} in ${record.factory}`)(record.spec);

/** The door over `layer`: each method as `doorOf` makes it, each write's grants checked before the layer writes. */
export function delegationDoorOver(layer: DelegationLayer): DelegationDoorShape {
  const door = doorOf<DelegationLayer, string>(layer);
  return {
    delegations: {
      ...door.delegations,
      write: (record) => Effect.andThen(specChecked(record), door.delegations.write(record)),
    },
  };
}

/** The folder of the factory `factory`'s delegations, under the store `home`. */
export const delegationsDir = (home: string, factory: string): string => path.join(home, 'factories', factory, 'delegations');

/** The file of `agent`'s delegation in `factory`, under the store `home`. Refused (`Invalid`): a name that is no factory's or agent's. */
export function delegationFile(home: string, factory: string, agent: string): string {
  delegationNamed(factory, agent);
  return path.join(delegationsDir(home, factory), `${agent}.json`);
}

/**
 * `agent`'s delegation in `factory`, or undefined where none is written. Refused (`Invalid`), naming the file and its fix, where it does
 * not read.
 */
export function readDelegation(home: string, factory: string, agent: string): DelegationRecord | undefined {
  const file = delegationFile(home, factory, agent);
  let text: string;
  try {
    text = fs.readFileSync(file, 'utf8');
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === 'ENOENT') return undefined;
    throw err;
  }
  const fix = `write it again with a PUT of /api/namespaces/${factory}/delegations/${agent}, or remove the file`;
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    throw new Invalid({ message: `${file} is not JSON: ${fix}.` });
  }
  const read = Schema.decodeUnknownResult(FileSchema)(raw);
  if (Result.isFailure(read)) {
    const { path: at, words } = firstRefusal(raw, read.failure);
    throw new Invalid({ message: `${file}: ${at.length ? `its ${at.join('.')} ` : ''}${words}: ${fix}.` });
  }
  return { factory, agent, since: read.success.since, spec: read.success.spec };
}

/** The delegations of the store `home`, as a layer of the door. */
export function delegationFiles(home: string): DelegationLayer {
  return {
    delegations: {
      list: (factory) => {
        const bad = factoryNameRefusal(factory);
        if (bad !== undefined) throw new Invalid({ message: bad });
        let names: string[];
        try {
          names = fs.readdirSync(delegationsDir(home, factory));
        } catch {
          return [];
        }
        return names
          .filter((n) => n.endsWith('.json'))
          .map((n) => n.slice(0, -'.json'.length))
          .filter((agent) => agentNameRefusal(agent) === undefined)
          .sort()
          .flatMap((agent) => readDelegation(home, factory, agent) ?? []);
      },
      read: (factory, agent) => readDelegation(home, factory, agent),
      write: (record) => {
        const file = delegationFile(home, record.factory, record.agent);
        fs.mkdirSync(path.dirname(file), { recursive: true });
        writeWhole(file, `${JSON.stringify({ since: record.since, spec: record.spec }, null, 2)}\n`);
        return record;
      },
      remove: (factory, agent) => {
        const file = delegationFile(home, factory, agent);
        const there = fs.existsSync(file);
        fs.rmSync(file, { force: true });
        return there;
      },
    },
  };
}

/** The Delegation door, as the service a program yields: rooted, refused `Invalid` where the program was given no store root. */
export const DelegationDoor = Context.Reference<DelegationDoorShape>('agent-orchestrator/DelegationDoor', {
  defaultValue: () => rootedDoor((root) => delegationDoorOver(delegationFiles(root)), 'Delegation door'),
});

/** The Delegation door over the files of the store `root`, as a layer. */
export const delegationDoorFiles = (root: string): Layer.Layer<never> =>
  Layer.succeed(DelegationDoor)(delegationDoorOver(delegationFiles(root)));
