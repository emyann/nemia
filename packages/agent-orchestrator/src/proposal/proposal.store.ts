/**
 * The Proposal door: the one way a program reads and writes a factory's proposals, each a record of the keyspace
 * (`src/keyspace/keyspace.store.ts`, `<store>/db/state.db`) under Kubernetes' registry layout, `/registry/proposals/<factory>/<name>`,
 * holding the object as objects' `Proposal` says it, its `metadata.resourceVersion` the revision of its record. An Effect service,
 * `ProposalDoor`, its default rooted (`rootedDoor`) as the Factory door's is; a test gives it `proposalDoorMemory()` (`memory.store.ts`),
 * the same code over an in-memory keyspace. Both are built by `proposalDoorOver`, so a write is checked one way on both: the object as
 * `Proposal` decodes it, its namespace a factory's name and its name a proposal's. A proposal made at a name taken is `Conflict`, one
 * written back that is not there `Missing`, one written back from a revision it is no longer at `Conflict` (its `resourceVersion` is the
 * revision the writer read; an empty one overwrites), one over the keyspace's ceiling `Invalid`. The walks of `test/proposal-walks.ts`
 * hold both to one table.
 *
 * A store's proposal files from before the keyspace (`<store>/factories/<factory>/proposals/<name>.json`) are imported the first time a
 * process opens the store's keyspace through this door, then moved aside to `<store>/imported/proposals/<factory>/<name>.json`, never
 * deleted; a file whose key the keyspace holds already is moved aside too, a file that does not read stays where it is, said in the log,
 * and a file over the ceiling stops the import before anything moves.
 *
 * Every function here takes the store's root as a required `home: string`, as `src/factory/servers/` does.
 */
import fs from 'node:fs';
import path from 'node:path';
import { Context, Effect, Option, Result, Schema, Semaphore } from 'effect';
import { Proposal } from 'objects';
import { checked, fromThrow, rootedDoor } from '../door/door.store.ts';
import { factoryNameRefusal } from '../factory/factory.ts';
import { firstPiece } from '../piece/piece.ts';
import { firstRefusal } from '../record/record.store.ts';
import { Conflict, Invalid, Missing, type Refusal } from '../refusal/refusal.ts';
import { keyspaceAt, keyspaceFile, RECORD_CEILING, type KeyRecord, type KeyRefused, type Keyspace } from '../keyspace/keyspace.store.ts';

/** The Proposal door's shape: a factory's proposals listed (with the revision they were read at), one read, one made, one written back. */
export type ProposalDoorShape = {
  readonly proposals: {
    readonly factories: () => Effect.Effect<readonly string[], Refusal>;
    readonly list: (factory: string) => Effect.Effect<readonly Proposal[], Refusal>;
    readonly listed: (factory: string) => Effect.Effect<{ readonly items: readonly Proposal[]; readonly revision: number }, Refusal>;
    readonly read: (factory: string, name: string) => Effect.Effect<Proposal | undefined, Refusal>;
    readonly create: (proposal: Proposal) => Effect.Effect<Proposal, Refusal>;
    readonly write: (proposal: Proposal) => Effect.Effect<Proposal, Refusal>;
  };
};

/**
 * Why `name` is no proposal's name, or undefined where it is one: lowercase letters, digits and dashes, as the machinery mints them.
 * @param name The name judged.
 */
export const proposalNameRefusal = (name: string) =>
  /^[a-z0-9][a-z0-9-]*$/.test(name)
    ? undefined
    : `${JSON.stringify(name)} is no proposal's name: a proposal is named <proposer>-<five letters or digits>, as nemia get proposals -n <factory> lists them.`;

/**
 * The factory's and proposal's names, refused (`Invalid`) where either is no name; what the door checks before it touches a record.
 * @param factory The factory's name.
 * @param name The proposal's name.
 */
export function proposalNamed(factory: string, name: string) {
  const bad = factoryNameRefusal(factory) ?? proposalNameRefusal(name);
  if (bad !== undefined) throw new Invalid({ message: bad });
}

/**
 * The factory a proposal is in: its namespace, refused (`Invalid`) where it names none.
 * @param proposal The proposal, whose `metadata.namespace` names its factory.
 */
export function factoryOf(proposal: Proposal) {
  const factory = proposal.metadata.namespace;
  if (factory === undefined)
    throw new Invalid({ message: `the proposal ${proposal.metadata.name} names no namespace: give it its factory's.` });
  proposalNamed(factory, proposal.metadata.name);
  return factory;
}

/**
 * The refusal of a proposal made at a name taken.
 * @param factory The factory the proposal was made in.
 * @param name The name already taken there.
 */
export const takenProposal = (factory: string, name: string) =>
  new Conflict({ message: `${factory} has a proposal ${name} already: propose again, and the machinery names it anew.` });

/**
 * The refusal of a proposal written back that is not there.
 * @param factory The factory the proposal was written back in.
 * @param name The name of the proposal it does not have.
 */
export const noProposal = (factory: string, name: string) =>
  new Missing({ message: `${factory} has no proposal ${name}: list them with nemia get proposals -n ${factory}.` });

/** The keyspace's prefix of every proposal, and of the factory `factory`'s. */
const PREFIX = '/registry/proposals/';
const factoryPrefix = (factory: string) => `${PREFIX}${factory}/`;

/** The key of the proposal `name` of `factory`. */
const keyOf = (factory: string, name: string) => `${factoryPrefix(factory)}${name}`;

/** A proposal written: as objects' `Proposal` decodes it. */
const proposalChecked = checked(Proposal, (proposal: Proposal) => `the proposal ${proposal.metadata.name}`);

/** What a record holds of `proposal`: its JSON, but its `resourceVersion`, which the record's revision says. */
function valueOf(proposal: Proposal) {
  const { resourceVersion: _revision, ...metadata } = proposal.metadata;
  return JSON.stringify({ ...proposal, metadata });
}

/** Why `raw` is no proposal, naming `where` it was read and the fix, or the proposal it decodes to. */
function decoded(raw: unknown, where: string, fix: string) {
  const read = Schema.decodeUnknownResult(Proposal)(raw);
  if (Result.isSuccess(read)) return read.success;
  const { path: at, words } = firstRefusal(Proposal, raw);
  throw new Invalid({ message: `${where}: ${at.length ? `its ${at.join('.')} ` : ''}${words}: ${fix}.` });
}

/** JSON's value of `text`, or `Invalid` naming `where` it was read and the fix. */
function parsed(text: string, where: string, fix: string) {
  const json = Schema.decodeUnknownOption(Schema.fromJsonString(Schema.Unknown))(text);
  if (Option.isNone(json)) throw new Invalid({ message: `${where} is not JSON: ${fix}.` });
  return json.value;
}

/** The proposal a record holds, its `resourceVersion` the record's revision; `Invalid`, naming the key, where it does not read. */
function proposalOf(record: KeyRecord) {
  const fix = 'the machinery writes it alone: say so to whoever keeps this nemia';
  const raw = parsed(record.value, `the record ${record.key}`, fix);
  const withRevision =
    typeof raw === 'object' && raw !== null && 'metadata' in raw && typeof raw.metadata === 'object' && raw.metadata !== null
      ? { ...raw, metadata: { ...raw.metadata, resourceVersion: String(record.revision) } }
      : raw;
  return decoded(withRevision, `the record ${record.key}`, fix);
}

/**
 * The revision a write back of `proposal` names: its `resourceVersion` where it is a revision, none where it is empty (the write
 * overwrites), and `Conflict` where it is a version of before the keyspace, which no record is at.
 */
function expectedOf(proposal: Proposal) {
  const version = proposal.metadata.resourceVersion;
  if (version === '') return null;
  if (/^[0-9]+$/.test(version)) return Number(version);
  throw new Conflict({
    message: `the proposal ${proposal.metadata.name} carries the version ${version}, which no record of it is at: read it again (nemia get proposals ${proposal.metadata.name} -n ${proposal.metadata.namespace ?? '<factory>'}) and write from what you read.`,
  });
}

/** The refusal a proposal's write is answered with, by why the keyspace refused it. */
function refusedAs(err: KeyRefused, proposal: Proposal, factory: string) {
  const name = proposal.metadata.name;
  if (err.refusal === 'exists') return takenProposal(factory, name);
  if (err.refusal === 'missing') return noProposal(factory, name);
  if (err.refusal === 'too-large')
    return new Invalid({
      message: `the proposal ${name} is larger than a record holds (${RECORD_CEILING} bytes): propose fewer objects at once.`,
    });
  return new Conflict({
    message: `the proposal ${name} of ${factory} changed since it was read (it is at ${err.at ?? 'none'}, not ${proposal.metadata.resourceVersion}): read it again and write from what you read.`,
  });
}

/**
 * The proposals of the keyspace `open` opens when a method runs, as the door's shape: each read decoded, each write the record of the
 * proposal at its key, made (`create`) or changed from the revision its `resourceVersion` names (`update`).
 * @param open Opens the keyspace the proposals are held in, refused as opening it is.
 */
export function proposalRecords(open: Effect.Effect<Keyspace, Refusal>) {
  const listed = (factory: string) =>
    Effect.gen(function* () {
      yield* fromThrow(() => {
        const bad = factoryNameRefusal(factory);
        if (bad !== undefined) throw new Invalid({ message: bad });
      });
      const { records, revision } = yield* (yield* open).list(factoryPrefix(factory));
      const items: Proposal[] = [];
      for (const record of records) items.push(yield* fromThrow(() => proposalOf(record)));
      return { items, revision };
    });
  const written = (proposal: Proposal, verb: 'create' | 'update') =>
    Effect.gen(function* () {
      const factory = yield* fromThrow(() => factoryOf(proposal));
      const expected = verb === 'create' ? null : yield* fromThrow(() => expectedOf(proposal));
      const keyspace = yield* open;
      const record = yield* keyspace
        .write(keyOf(factory, proposal.metadata.name), { verb, expected, value: valueOf(proposal) })
        .pipe(Effect.mapError((err) => refusedAs(err, proposal, factory)));
      return { ...proposal, metadata: { ...proposal.metadata, resourceVersion: String(record.revision) } } satisfies Proposal;
    });
  return {
    proposals: {
      factories: () =>
        Effect.gen(function* () {
          const { records } = yield* (yield* open).list(PREFIX);
          return [...new Set(records.map((r) => firstPiece(r.key.slice(PREFIX.length), '/')))].sort();
        }),
      list: (factory) => Effect.map(listed(factory), (l) => l.items),
      listed,
      read: (factory, name) =>
        Effect.gen(function* () {
          yield* fromThrow(() => proposalNamed(factory, name));
          const record = yield* (yield* open).get(keyOf(factory, name));
          return record === undefined ? undefined : yield* fromThrow(() => proposalOf(record));
        }),
      create: (proposal) => written(proposal, 'create'),
      write: (proposal) => written(proposal, 'update'),
    },
  } satisfies ProposalDoorShape;
}

/**
 * The door over `door`: each write checked by objects' `Proposal` before it is written.
 * @param door The proposals as the door's shape, read and written through.
 */
export function proposalDoorOver(door: ProposalDoorShape) {
  return {
    proposals: {
      ...door.proposals,
      create: (proposal) => Effect.flatMap(proposalChecked(proposal), (p) => door.proposals.create(p)),
      write: (proposal) => Effect.flatMap(proposalChecked(proposal), (p) => door.proposals.write(p)),
    },
  } satisfies ProposalDoorShape;
}

/** The folder of the factory `factory`'s proposal files, under the store `home`: what the keyspace imports. */
const proposalsDir = (home: string, factory: string) => path.join(home, 'factories', factory, 'proposals');

/** The names of the entries of `dir`, none where it is not there. */
const entriesOf = (dir: string) => {
  try {
    return fs.readdirSync(dir);
  } catch {
    return [];
  }
};

/** Each proposal file of the store `home`, by its factory and its name: every one the import reads. */
const proposalFilesOf = (home: string) =>
  entriesOf(path.join(home, 'factories'))
    .filter((f) => factoryNameRefusal(f) === undefined)
    .sort()
    .flatMap((factory) =>
      entriesOf(proposalsDir(home, factory))
        .filter((n) => n.endsWith('.json'))
        .map((n) => n.slice(0, -'.json'.length))
        .filter((name) => proposalNameRefusal(name) === undefined)
        .sort()
        .map((name) => ({ factory, name, file: path.join(proposalsDir(home, factory), `${name}.json`) })),
    );

/**
 * The proposal a file of before the keyspace holds, or undefined where none is. Refused (`Invalid`), naming the file, where it does not
 * read.
 * @param file The proposal's file.
 */
export function readProposal(file: string) {
  let text: string;
  try {
    text = fs.readFileSync(file, 'utf8');
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === 'ENOENT') return undefined;
    throw err;
  }
  const fix = 'the machinery writes it alone: move it aside, and propose again';
  return decoded(parsed(text, file, fix), file, fix);
}

/** Where the import moves the file of the proposal `name` of `factory`, under the store `home`. */
const importedFile = (home: string, factory: string, name: string) => path.join(home, 'imported', 'proposals', factory, `${name}.json`);

/**
 * The store `home`'s proposal files imported into `keyspace`: each factory's whose key it does not hold made in one transaction, then
 * every file read moved aside under `imported/proposals/`; one that does not read stays, said in the log. Refused `Invalid` before
 * anything moves where a file is over the keyspace's ceiling. Safe to run again: what was moved is not read again, and a key held is
 * not written.
 * @param home The store's root folder.
 * @param keyspace The store's keyspace.
 */
export const proposalsImported = Effect.fnUntraced(function* (home: string, keyspace: Keyspace) {
  const files = proposalFilesOf(home);
  if (files.length === 0) return 0;
  const over = files.find((f) => (fs.statSync(f.file, { throwIfNoEntry: false })?.size ?? 0) > RECORD_CEILING);
  if (over !== undefined)
    return yield* Effect.fail(
      new Invalid({
        message: `${over.file} is larger than a record of the keyspace holds (${RECORD_CEILING} bytes): nothing was imported or moved; move it aside and run again.`,
      }),
    );
  let made = 0;
  for (const factory of new Set(files.map((f) => f.factory))) {
    const read: { name: string; file: string; proposal: Proposal }[] = [];
    for (const f of files.filter((one) => one.factory === factory)) {
      const proposal = yield* Effect.result(fromThrow(() => readProposal(f.file)));
      if (proposal._tag === 'Failure') yield* Effect.logWarning(`${f.file} was not imported: ${proposal.failure.message}`);
      else if (proposal.success !== undefined) read.push({ name: f.name, file: f.file, proposal: proposal.success });
    }
    const absent: typeof read = [];
    for (const one of read) if ((yield* keyspace.get(keyOf(factory, one.name))) === undefined) absent.push(one);
    yield* keyspace
      .txn(absent.map((one) => [keyOf(factory, one.name), { verb: 'create', expected: null, value: valueOf(one.proposal) }] as const))
      .pipe(Effect.mapError((err) => new Conflict({ message: `${err.key} was written while it was imported: run again.` })));
    made += absent.length;
    yield* fromThrow(() => {
      for (const one of read) {
        const to = importedFile(home, factory, one.name);
        fs.mkdirSync(path.dirname(to), { recursive: true });
        fs.renameSync(one.file, to);
      }
    });
  }
  return made;
});

/** The stores whose proposal files this process has imported, by root. */
const IMPORTED = new Set<string>();

/** One import at a time, so two fibers opening one store import it once. */
const IMPORTING = Semaphore.makeUnsafe(1);

/**
 * The keyspace of the store `home`, its proposal files imported the first time this process opens it (`proposalsImported`); a failed
 * import is not kept, so the next open imports again.
 * @param home The store's root folder.
 */
export const proposalKeyspace = (home: string) =>
  Effect.flatMap(keyspaceAt(keyspaceFile(home)), (keyspace) =>
    IMPORTED.has(home)
      ? Effect.succeed(keyspace)
      : IMPORTING.withPermits(1)(
          Effect.suspend(() =>
            IMPORTED.has(home)
              ? Effect.succeed(keyspace)
              : Effect.map(proposalsImported(home, keyspace), () => {
                  IMPORTED.add(home);
                  return keyspace;
                }),
          ),
        ),
  );

/** The Proposal door, as the service a program yields: rooted, refused `Invalid` where the program was given no store root. */
export const ProposalDoor = Context.Reference<ProposalDoorShape>('agent-orchestrator/ProposalDoor', {
  defaultValue: () => rootedDoor((root) => proposalDoorOver(proposalRecords(proposalKeyspace(root))), 'Proposal door'),
});
