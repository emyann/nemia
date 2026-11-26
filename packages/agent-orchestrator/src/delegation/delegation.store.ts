/**
 * The Delegation door: the one way a program reads and writes what the person lets an agent approve in a factory unasked at auto, a record
 * of the keyspace per agent, `/registry/delegations/<factory>/<agent>`, holding its grants (Kubernetes' PolicyRule fields) and when it
 * was written. An Effect service, `DelegationDoor`, its default rooted (`rootedDoor`) as the Proposal door's is; a test gives it
 * `delegationDoorMemory()` (`memory.store.ts`), the same code over a keyspace in memory. Both are built by `delegationDoorOver` over
 * `delegationRecords`, so a write is checked one way on both: the factory's and the agent's names, and the grants as objects'
 * `DelegationSpec` decodes them. The walks of `test/delegation-walks.ts` hold both to one table.
 *
 * A store's delegation files from before the keyspace (`<store>/factories/<factory>/delegations/<agent>.json`) are imported by the kind's
 * import (`DELEGATION_FILES`, `src/keyspace/import.store.ts`) and moved aside under `<store>/imported/`, never deleted.
 *
 * Every function here takes the store's root as a required `home: string`, as `src/factory/servers/` does.
 */
import path from 'node:path';
import { Context, Effect, Option, Result, Schema } from 'effect';
import { DelegationSpec } from 'objects';
import { checked, fromThrow, rootedDoor } from '../door/door.store.ts';
import { factoryNameRefusal } from '../factory/factory.ts';
import { agentNameRefusal } from '../agents/agents.ts';
import { asideOf, entriesIn, kindKeyspace, kindKeyspaceHeld, namesIn, type ImportKind } from '../keyspace/import.store.ts';
import type { Keyspace } from '../keyspace/keyspace.store.ts';
import { firstRefusal } from '../record/record.store.ts';
import { Conflict, Invalid, type Refusal } from '../refusal/refusal.ts';

/** One agent's delegation in one factory, as the store keeps it: its grants, and when it was last written. */
export type DelegationRecord = {
  readonly factory: string;
  readonly agent: string;
  readonly since: string;
  readonly spec: DelegationSpec;
};

/** The record a delegation is kept in, as its file was before the keyspace. */
const FileSchema = Schema.Struct({ since: Schema.String, spec: DelegationSpec });

/** The Delegation door's shape: a factory's delegations, one read, one written whole, one removed (whether one was there). */
export type DelegationDoorShape = {
  readonly delegations: {
    readonly list: (factory: string) => Effect.Effect<readonly DelegationRecord[], Refusal>;
    readonly read: (factory: string, agent: string) => Effect.Effect<DelegationRecord | undefined, Refusal>;
    readonly write: (record: DelegationRecord) => Effect.Effect<DelegationRecord, Refusal>;
    readonly remove: (factory: string, agent: string) => Effect.Effect<boolean, Refusal>;
  };
};

/**
 * The factory's and agent's names, refused (`Invalid`) where either is no name; what both layers check before they touch a record.
 * @param factory The factory's name.
 * @param agent The agent's name.
 */
function delegationNamed(factory: string, agent: string) {
  const bad = factoryNameRefusal(factory) ?? agentNameRefusal(agent);
  if (bad !== undefined) throw new Invalid({ message: bad });
}

/** A delegation's grants written, as objects' `DelegationSpec` decodes them. */
const specChecked = (record: DelegationRecord) =>
  checked(DelegationSpec, () => `the delegation of ${record.agent} in ${record.factory}`)(record.spec);

/**
 * The door over `door`: each write's grants checked before it is written.
 * @param door The delegations as the door's shape, read and written through.
 */
export function delegationDoorOver(door: DelegationDoorShape) {
  return {
    delegations: {
      ...door.delegations,
      write: (record) => Effect.andThen(specChecked(record), door.delegations.write(record)),
    },
  } satisfies DelegationDoorShape;
}

/** The keyspace's prefix of every delegation, and of the factory `factory`'s. */
const PREFIX = '/registry/delegations/';
const factoryPrefix = (factory: string) => `${PREFIX}${factory}/`;

/** The key of `agent`'s delegation in `factory`. */
const keyOf = (factory: string, agent: string) => `${factoryPrefix(factory)}${agent}`;

/**
 * The delegation `text` holds, or why it is none, naming `where` it was read and the fix.
 * @param text The record's or the file's text.
 * @param where The record's key or the file's path, said in the refusal.
 * @param factory The factory's name.
 * @param agent The agent's name.
 */
function delegationIn(text: string, where: string, factory: string, agent: string) {
  const fix = `write it again with a PUT of /api/namespaces/${factory}/delegations/${agent}`;
  const json = Schema.decodeUnknownOption(Schema.fromJsonString(Schema.Unknown))(text);
  if (Option.isNone(json)) return `${where} is not JSON: ${fix}.`;
  const raw = json.value;
  const read = Schema.decodeUnknownResult(FileSchema)(raw);
  if (Result.isFailure(read)) {
    const { path: at, words } = firstRefusal(FileSchema, raw);
    return `${where}: ${at.length ? `its ${at.join('.')} ` : ''}${words}: ${fix}.`;
  }
  return { factory, agent, since: read.success.since, spec: read.success.spec } satisfies DelegationRecord;
}

/** The delegation a record holds; `Invalid`, naming its key, where it does not read. */
function delegationOf(value: string, key: string, factory: string, agent: string) {
  const read = delegationIn(value, `the record ${key}`, factory, agent);
  if (typeof read === 'string') throw new Invalid({ message: read });
  return read;
}

/** A write raced by another between its read and its write, as a refusal. */
const raced = (err: { readonly key: string }) =>
  new Conflict({ message: `${err.key} was written by another while it was written here: run again.` }) satisfies Refusal as Refusal;

/**
 * The delegations of the keyspace `open` opens when a method runs, as the door's shape. A read asks `held`, and answers none where it
 * answers no keyspace, so a store read is not a store made.
 * @param open Opens the keyspace the delegations are held in, refused as opening it is.
 * @param held The keyspace a read reads, or undefined where the store holds none yet; `open` where every read may make it.
 */
export function delegationRecords(open: Effect.Effect<Keyspace, Refusal>, held: Effect.Effect<Keyspace | undefined, Refusal> = open) {
  return {
    delegations: {
      list: (factory) =>
        Effect.gen(function* () {
          yield* fromThrow(() => delegationNamed(factory, 'any'));
          const keyspace = yield* held;
          if (keyspace === undefined) return [];
          const { records } = yield* keyspace.list(factoryPrefix(factory));
          const out: DelegationRecord[] = [];
          for (const record of records) {
            const agent = record.key.slice(factoryPrefix(factory).length);
            out.push(yield* fromThrow(() => delegationOf(record.value, record.key, factory, agent)));
          }
          return out;
        }),
      read: (factory, agent) =>
        Effect.gen(function* () {
          yield* fromThrow(() => delegationNamed(factory, agent));
          const keyspace = yield* held;
          const record = keyspace === undefined ? undefined : yield* keyspace.get(keyOf(factory, agent));
          return record === undefined ? undefined : yield* fromThrow(() => delegationOf(record.value, record.key, factory, agent));
        }),
      write: (record) =>
        Effect.gen(function* () {
          yield* fromThrow(() => delegationNamed(record.factory, record.agent));
          const keyspace = yield* open;
          const key = keyOf(record.factory, record.agent);
          const value = JSON.stringify({ since: record.since, spec: record.spec });
          yield* keyspace
            .within((tx) =>
              Effect.flatMap(tx.get(key), (there) =>
                tx.write(key, { verb: there === undefined ? 'create' : 'update', expected: null, value }),
              ),
            )
            .pipe(Effect.mapError(raced));
          return record;
        }),
      remove: (factory, agent) =>
        Effect.gen(function* () {
          yield* fromThrow(() => delegationNamed(factory, agent));
          const keyspace = yield* held;
          if (keyspace === undefined) return false;
          const key = keyOf(factory, agent);
          return yield* keyspace
            .within((tx) =>
              Effect.flatMap(tx.get(key), (there) =>
                there === undefined ? Effect.succeed(false) : Effect.as(tx.write(key, { verb: 'delete', expected: null, value: '' }), true),
              ),
            )
            .pipe(Effect.mapError(raced));
        }),
    },
  } satisfies DelegationDoorShape;
}

/**
 * The delegation files of a store from before the keyspace, `factories/<factory>/delegations/<agent>.json`: what the kind's import takes
 * up, each at `/registry/delegations/<factory>/<agent>`.
 */
export const DELEGATION_FILES: ImportKind = {
  name: 'delegations',
  folders: (home) => [
    path.join(home, 'factories'),
    ...entriesIn(path.join(home, 'factories'))
      .filter((f) => factoryNameRefusal(f) === undefined)
      .map((f) => path.join(home, 'factories', f, 'delegations')),
  ],
  files: (home) =>
    entriesIn(path.join(home, 'factories'))
      .filter((f) => factoryNameRefusal(f) === undefined)
      .flatMap((factory) =>
        namesIn(path.join(home, 'factories', factory, 'delegations'), '.json')
          .filter((agent) => agentNameRefusal(agent) === undefined)
          .map((agent) => {
            const file = path.join(home, 'factories', factory, 'delegations', `${agent}.json`);
            return {
              file,
              key: keyOf(factory, agent),
              aside: asideOf(home, file),
              read: (text: string) => {
                const read = delegationIn(text, file, factory, agent);
                return typeof read === 'string' ? { unreadable: read } : { value: JSON.stringify({ since: read.since, spec: read.spec }) };
              },
            };
          }),
      ),
};

/** The Delegation door, as the service a program yields: rooted, refused `Invalid` where the program was given no store root. */
export const DelegationDoor = Context.Reference<DelegationDoorShape>('agent-orchestrator/DelegationDoor', {
  defaultValue: () =>
    rootedDoor(
      (root) => delegationDoorOver(delegationRecords(kindKeyspace(root, DELEGATION_FILES), kindKeyspaceHeld(root, DELEGATION_FILES))),
      'Delegation door',
    ),
});
