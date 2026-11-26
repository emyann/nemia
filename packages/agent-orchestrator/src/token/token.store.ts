/**
 * The store of session tokens: a random token minted for each session the store files (`tokens.mint`), handed to the session in its
 * environment and kept here only as the record its sha-256 digest names, `/registry/tokens/<digest>` in the keyspace (`TokenFiled`), so
 * the store never holds a token a reader could present. Read again by the digest of the token a request presents (`tokens.read`). A
 * record is never taken back: whether its session is still the live one is judged afresh on each request against the run
 * (`caller.verb.ts`), so a token ends with its try and no list of revoked ones is kept.
 *
 * And the standing tokens, the person's to mint: named, minted through the api (`persons.mint`, `POST /api/tokens`), answered once and
 * kept as the record its digest names, `/registry/persontokens/<digest>` (`PersonTokenFiled`: its name, when it was minted, and who
 * holds it — the person, or an agent bound to a factory or store-wide and maybe narrowed; a record that names no holder, minted before
 * holders were said, is the person's); listed by name (`persons.list`) and removed by name (`persons.revoke`), after which it is refused
 * as unknown. A name is checked free and taken in one transaction, so two mints of one name at once make one token and one `Conflict`.
 *
 * The keyspace's folder and file are its owner's alone (`src/keyspace/keyspace.store.ts`), as the token files were. A store's token files
 * of before the keyspace (`<home>/tokens/<digest>.json`, `<home>/person-tokens/<digest>.json`) are imported once by the kind's import
 * (`TOKEN_FILES`) and moved aside under `<home>/imported/`.
 *
 * Rooted: the door (`TokenDoor`) reads the root the program is given (`StoreRoot`). The minting of a step's token as its try is filed
 * (`stepToken`), which the tick's filings spread into the config they file; and the store's credential, the person's own token for this
 * machine, kept in the file `<home>/credential` (`credentialKept`). The synchronous spellings (`mintToken`, `readToken`,
 * `mintPersonToken`, …) are the door at the root `home` they are handed, run at once, a test's; no file of `src` calls them
 * (`src/token/token.store.test.ts`).
 */
import { runNamespace } from '../run-list/index.ts';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { Context, Effect, Layer, Option, Result, Schema } from 'effect';
import { fromThrow, rootedDoor } from '../door/door.store.ts';
import { isRemoteHarness } from '../harness/harness.ts';
import { asideOf, kindKeyspace, kindKeyspaceHeld, namesIn, type ImportKind } from '../keyspace/import.store.ts';
import type { KeyRefused, Keyspace } from '../keyspace/keyspace.store.ts';
import type { Run } from '../record/record.ts';
import type { StepSpec } from '../workflow.ts';
import { Conflict, Invalid, Missing, type Refusal } from '../refusal/refusal.ts';
import type { TokenHolder, TokenRecord } from './token.ts';

/**
 * What the store keeps of a token it minted: the contract's record (`TokenRecord`), and the engine's task the session runs in (`task`),
 * by which its liveness is judged: a try's task while it is its step's current one, Nemia's while it is hers and unsettled.
 */
export type TokenFiled = TokenRecord & { readonly task: string };

const TokenFiledSchema = Schema.Struct({
  agent: Schema.String,
  factory: Schema.NullOr(Schema.String),
  run: Schema.NullOr(Schema.String),
  step: Schema.NullOr(Schema.String),
  attempt: Schema.Number,
  task: Schema.String,
});

/**
 * The digest a token is kept and found by: its sha-256, in hex.
 * @param token The token itself, as a session or a request presents it.
 */
export const tokenDigest = (token: string) => crypto.createHash('sha256').update(token).digest('hex');

/** The holder of an agent's token as its record keeps it. */
const AgentHolderSchema = Schema.Struct({
  kind: Schema.Literal('agent'),
  agent: Schema.String,
  factory: Schema.NullOr(Schema.String),
  narrowed: Schema.NullOr(Schema.Literals(['read', 'act'])),
});

/**
 * What the store keeps of a standing token, found by its digest: the name the person gave it, when it was minted (an ISO date), and who
 * holds it (`holder`: absent, minted before holders were said, is the person).
 */
const PersonTokenFiledSchema = Schema.Struct({
  name: Schema.String,
  createdAt: Schema.String,
  holder: Schema.optionalKey(Schema.Union([Schema.Struct({ kind: Schema.Literal('person') }), AgentHolderSchema])),
});
export type PersonTokenFiled = typeof PersonTokenFiledSchema.Type;

/** The person, as a token's holder. */
const PERSON_HOLDER: TokenHolder = { kind: 'person' };

/**
 * Who holds the token `record` is of: its holder, or the person where it names none.
 * @param record The standing token's record.
 */
export const holderOf = (record: PersonTokenFiled) => record.holder ?? PERSON_HOLDER;

/**
 * The standing record `record` is, as `callerOf` reads it: its name and its holder.
 * @param record The standing token's record.
 */
export const standingOf = (record: PersonTokenFiled) => ({ name: record.name, holder: holderOf(record) });

/** A name a person's token takes: a letter or a digit, then letters, digits, `.`, `_` or `-`, 63 at most. */
const PERSON_TOKEN_NAME = /^[A-Za-z0-9][A-Za-z0-9._-]{0,62}$/;

/** The record a file of a person's token holds, or null where it does not read as one, which vouches for no one. */
function personRecordOf(text: string) {
  const read = Schema.decodeUnknownResult(Schema.fromJsonString(PersonTokenFiledSchema))(text);
  return Result.isSuccess(read) ? read.success : null;
}

/** The keyspace's prefix of every session token's record, and of every standing token's. */
const TOKENS = '/registry/tokens/';
const PERSONS = '/registry/persontokens/';

/** A new token, 32 random bytes in base64url: written nowhere but where the caller hands it. */
const freshToken = () => crypto.randomBytes(32).toString('base64url');

/** The refusals of a standing token's name or its holder's, or none. */
function personRefusal(name: string, holder: TokenHolder) {
  if (!PERSON_TOKEN_NAME.test(name))
    return new Invalid({
      message: `nemia token add takes a name of letters, digits, \`.\`, \`_\` or \`-\`, starting with a letter or a digit, 63 at most, and \`${name}\` is not one: name it for where it is used, as nemia token add laptop.`,
    });
  if (holder.kind === 'agent' && !PERSON_TOKEN_NAME.test(holder.agent))
    return new Invalid({
      message: `nemia token add --agent takes the agent's name, of letters, digits, \`.\`, \`_\` or \`-\`, and \`${holder.agent}\` is not one: nemia token add <name> --agent <agent>, as nemia token add ops --agent operator.`,
    });
  return undefined;
}

/** The refusal of a standing token minted under a name taken. */
const nameTaken = (name: string) =>
  new Conflict({
    message: `a token named ${name} is already kept: name this one otherwise, or nemia token rm ${name} first, which refuses the old one from then on.`,
  });

/** A write raced by another, as a refusal. */
const raced = (err: KeyRefused) =>
  new Conflict({ message: `${err.key} was written by another while it was written here: run again.` }) satisfies Refusal as Refusal;

/** The standing tokens' records `records` holds, each with its key, those that do not read left out. */
const personsIn = (records: readonly { readonly key: string; readonly value: string }[]) =>
  records.flatMap((r) => {
    const record = personRecordOf(r.value);
    return record === null ? [] : [{ key: r.key, record }];
  });

/** The token door's shape: session tokens minted and read; standing tokens minted by name, read by digest, listed and removed by name. */
export type TokenDoorShape = {
  readonly tokens: {
    readonly mint: (record: TokenFiled) => Effect.Effect<string, Refusal>;
    readonly read: (token: string) => Effect.Effect<TokenFiled | null, Refusal>;
  };
  readonly persons: {
    readonly mint: (name: string, holder?: TokenHolder, now?: Date) => Effect.Effect<string, Refusal>;
    readonly mintFree: (name: string, now?: Date) => Effect.Effect<{ readonly token: string; readonly name: string }, Refusal>;
    readonly read: (digest: string) => Effect.Effect<PersonTokenFiled | null, Refusal>;
    readonly list: () => Effect.Effect<PersonTokenFiled[], Refusal>;
    readonly revoke: (name: string) => Effect.Effect<PersonTokenFiled, Refusal>;
  };
};

/** In the keyspace `open` opens, a standing token minted under the first name `names` gives that none is kept under, in one transaction. */
const mintedUnder = (
  open: Effect.Effect<Keyspace, Refusal>,
  names: (taken: ReadonlySet<string>) => string | undefined,
  holder: TokenHolder,
  now: Date,
) =>
  Effect.gen(function* () {
    const keyspace = yield* open;
    return yield* keyspace
      .within((tx) =>
        Effect.gen(function* () {
          const taken = new Set(personsIn(yield* tx.list(PERSONS)).map((p) => p.record.name));
          const name = names(taken);
          if (name === undefined) return { taken: true as const };
          const record: PersonTokenFiled =
            holder.kind === 'person' ? { name, createdAt: now.toISOString() } : { name, createdAt: now.toISOString(), holder };
          const token = freshToken();
          yield* tx.write(`${PERSONS}${tokenDigest(token)}`, { verb: 'create', expected: null, value: JSON.stringify(record) });
          return { token, name };
        }),
      )
      .pipe(Effect.mapError(raced));
  });

/** The session tokens of the keyspace `open` opens, as the door's `tokens`, a read asking `held`. */
const sessionTokens = (open: Effect.Effect<Keyspace, Refusal>, held: Effect.Effect<Keyspace | undefined, Refusal>) =>
  ({
    mint: (record) =>
      Effect.gen(function* () {
        const keyspace = yield* open;
        const token = freshToken();
        yield* keyspace
          .write(`${TOKENS}${tokenDigest(token)}`, { verb: 'create', expected: null, value: JSON.stringify(record) })
          .pipe(Effect.mapError(raced));
        return token;
      }),
    read: (token) =>
      Effect.gen(function* () {
        const keyspace = yield* held;
        const record = keyspace === undefined ? undefined : yield* keyspace.get(`${TOKENS}${tokenDigest(token)}`);
        return record === undefined
          ? null
          : Option.getOrNull(Schema.decodeUnknownOption(Schema.fromJsonString(TokenFiledSchema))(record.value));
      }),
  }) satisfies TokenDoorShape['tokens'];

/**
 * The tokens of the keyspace `open` opens when a method runs, as the door's shape. A read asks `held`, and answers none where it answers
 * no keyspace, so a store read is not a store made.
 * @param open Opens the keyspace the tokens are held in, refused as opening it is.
 * @param held The keyspace a read reads, or undefined where the store holds none yet; `open` where every read may make it.
 */
export function tokenRecords(open: Effect.Effect<Keyspace, Refusal>, held: Effect.Effect<Keyspace | undefined, Refusal> = open) {
  return {
    tokens: sessionTokens(open, held),
    persons: {
      mint: (name, holder = PERSON_HOLDER, now = new Date()) =>
        Effect.gen(function* () {
          const bad = personRefusal(name, holder);
          if (bad !== undefined) return yield* bad;
          const minted = yield* mintedUnder(open, (taken) => (taken.has(name) ? undefined : name), holder, now);
          if ('taken' in minted) return yield* nameTaken(name);
          return minted.token;
        }),
      mintFree: (name, now = new Date()) =>
        Effect.gen(function* () {
          const bad = personRefusal(name, PERSON_HOLDER);
          if (bad !== undefined) return yield* bad;
          const minted = yield* mintedUnder(
            open,
            (taken) => {
              for (let n = 1; ; n++) {
                const free = n === 1 ? name : `${name}-${n}`;
                if (!taken.has(free)) return free;
              }
            },
            PERSON_HOLDER,
            now,
          );
          if ('taken' in minted) return yield* nameTaken(name);
          return minted;
        }),
      read: (digest) =>
        Effect.gen(function* () {
          const keyspace = yield* held;
          const record = keyspace === undefined ? undefined : yield* keyspace.get(`${PERSONS}${digest}`);
          return record === undefined ? null : personRecordOf(record.value);
        }),
      list: () =>
        Effect.gen(function* () {
          const keyspace = yield* held;
          if (keyspace === undefined) return [];
          return personsIn((yield* keyspace.list(PERSONS)).records)
            .map((p) => p.record)
            .sort((a, b) => a.name.localeCompare(b.name));
        }),
      revoke: (name) =>
        Effect.gen(function* () {
          const missing = new Missing({ message: `no token named ${name} is kept: nemia token ls lists the names of those that are.` });
          const keyspace = yield* held;
          if (keyspace === undefined) return yield* missing;
          const found = yield* keyspace
            .within((tx) =>
              Effect.gen(function* () {
                const one = personsIn(yield* tx.list(PERSONS)).find((p) => p.record.name === name);
                if (one !== undefined) yield* tx.write(one.key, { verb: 'delete', expected: null, value: '' });
                return one;
              }),
            )
            .pipe(Effect.mapError(raced));
          if (found === undefined) return yield* missing;
          return found.record;
        }),
    },
  } satisfies TokenDoorShape;
}

/**
 * The token files of a store from before the keyspace, `tokens/<digest>.json` and `person-tokens/<digest>.json`: what the kind's import
 * takes up, as they were, at `/registry/tokens/<digest>` and `/registry/persontokens/<digest>`. A file that does not read as its record
 * stays where it is.
 */
export const TOKEN_FILES: ImportKind = {
  name: 'tokens',
  folders: (home) => [path.join(home, 'tokens'), path.join(home, 'person-tokens')],
  files: (home) =>
    (
      [
        ['tokens', TOKENS, (text: string) => Option.isSome(Schema.decodeUnknownOption(Schema.fromJsonString(TokenFiledSchema))(text))],
        ['person-tokens', PERSONS, (text: string) => personRecordOf(text) !== null],
      ] as const
    ).flatMap(([folder, prefix, reads]) =>
      namesIn(path.join(home, folder), '.json')
        .filter((digest) => /^[0-9a-f]{64}$/.test(digest))
        .map((digest) => {
          const file = path.join(home, folder, `${digest}.json`);
          return {
            file,
            key: `${prefix}${digest}`,
            aside: asideOf(home, file),
            read: (text: string) => (reads(text) ? { value: text.trim() } : { unreadable: 'it is no token’s record' }),
          };
        }),
    ),
};

/** The token door over the keyspace at the store `root`. */
const tokensAt = (root: string) => tokenRecords(kindKeyspace(root, TOKEN_FILES), kindKeyspaceHeld(root, TOKEN_FILES));

/**
 * The token door, as the service a program yields: a reference whose default is rooted (`rootedDoor`), the records at the store's root
 * the program is given, refused `Invalid` where it was given none.
 */
export const TokenDoor = Context.Reference<TokenDoorShape>('agent-orchestrator/TokenDoor', {
  defaultValue: () => rootedDoor(tokensAt, 'token door'),
});

/**
 * The token door over the records of the store `root`, as a layer: for a program that names its root by the door.
 * @param root The store's root folder, whose token records the door reads and writes.
 */
export const tokenDoorAt = (root: string) => Layer.succeed(TokenDoor)(tokensAt(root));

/** An act of the door at the root `home`, run at once: a refusal is thrown as it is. A test's, never a program's. */
const atRoot = <A>(home: string, act: (door: TokenDoorShape) => Effect.Effect<A, Refusal>) => Effect.runSync(act(tokensAt(home)));

/**
 * Mints a session's token at the root `home` (`tokens.mint`), at once. Answers the token itself.
 * @param home The store's root folder.
 * @param record What the token vouches for: the session's agent, factory, run, step, attempt and task.
 */
export const mintToken = (home: string, record: TokenFiled) => atRoot(home, (door) => door.tokens.mint(record));

/**
 * The record the store keeps of `token` at the root `home` (`tokens.read`), at once, or null where it minted none.
 * @param home The store's root folder.
 * @param token The token presented.
 */
export const readToken = (home: string, token: string) => atRoot(home, (door) => door.tokens.read(token));

/**
 * Mints a standing token under `name` at the root `home` (`persons.mint`), at once; refused as the door refuses.
 * @param home The store's root folder.
 * @param name The name the token is kept and removed under.
 * @param now When it is minted, written as its `createdAt`.
 * @param holder Who holds it: the person, or an agent and what bounds it.
 */
export const mintPersonToken = (home: string, name: string, now: Date = new Date(), holder: TokenHolder = PERSON_HOLDER) =>
  atRoot(home, (door) => door.persons.mint(name, holder, now));

/**
 * Mints a person's token under `name`, or the first free `name-2`, `name-3`… at the root `home` (`persons.mintFree`), at once.
 * @param home The store's root folder.
 * @param name The name to mint under, or to count on from where it is taken.
 * @param now When it is minted, written as its `createdAt`.
 */
export const mintPersonTokenFree = (home: string, name: string, now: Date = new Date()) =>
  atRoot(home, (door) => door.persons.mintFree(name, now));

/**
 * The record of the person's token whose digest is `digest` at the root `home` (`persons.read`), at once, or null.
 * @param home The store's root folder.
 * @param digest The token's digest (`tokenDigest`).
 */
export const personTokenOf = (home: string, digest: string) => atRoot(home, (door) => door.persons.read(digest));

/**
 * The person's tokens the store keeps at the root `home`, by name (`persons.list`), at once.
 * @param home The store's root folder.
 */
export const personTokens = (home: string) => atRoot(home, (door) => door.persons.list());

/**
 * Removes the person's token named `name` at the root `home` (`persons.revoke`), at once; `Missing` where none is kept under it.
 * @param home The store's root folder.
 * @param name The name the token is kept under.
 */
export const revokePersonToken = (home: string, name: string) => atRoot(home, (door) => door.persons.revoke(name));

/**
 * A step's session token, minted as its try `attempt` is filed as the engine's task `task`, through the token door: its agent (the step's
 * name where it has none), the run's factory (the default one where it names none: null is Nemia's alone) and the run and step.
 * Answered as the field `filedConfig` takes; none for a step on a remote harness, which reads no config of this machine's.
 * @param run The run the try is of: its id and its factory.
 * @param step The step the try is of: its name, its agent and its harness.
 * @param task The id of the engine's task the try is filed as.
 * @param attempt The try's number, written on the record.
 */
export const stepToken = Effect.fnUntraced(function* (
  run: Pick<Run, 'id' | 'factory'>,
  step: Pick<StepSpec, 'name' | 'agent' | 'harness'>,
  task: string,
  attempt: number,
) {
  if (isRemoteHarness(step.harness)) return {};
  return { sessionToken: yield* sessionTokenFor(run, step, task, attempt) };
});

/**
 * A session token minted through the token door for the try `attempt` of `step` of `run`, filed as the task `task`, whatever its harness:
 * what a check or a command carries in its environment (`SESSION_TOKEN`).
 * @param run The run the try is of: its id and its factory.
 * @param step The step the try is of: its name and its agent.
 * @param task The id of the engine's task the try is filed as.
 * @param attempt The try's number, written on the record.
 */
export const sessionTokenFor = (run: Pick<Run, 'id' | 'factory'>, step: Pick<StepSpec, 'name' | 'agent'>, task: string, attempt: number) =>
  Effect.flatMap(TokenDoor, (door) =>
    door.tokens.mint({
      agent: step.agent?.name ?? step.name,
      factory: runNamespace(run.factory),
      run: run.id,
      step: step.name,
      attempt,
      task,
    }),
  );

/**
 * The store's credential: the person's own standing token for this machine, kept in `<home>/credential` (mode 0600) so the person's
 * `nemia` on the store's machine presents it with nothing to type. The daemon puts it in place at its start (`credentialKept`, called by
 * `up`): level-triggered, it leaves a file whose token the store still keeps as the person's, and otherwise mints a person-held token
 * named `local` (or the first free `local-2`, `local-3`…) and writes it there, so a token retired with `nemia token rm local`, or a file
 * that holds no kept token, is replaced at the next start. The client reads the file; nothing else of the store holds the token in the
 * clear.
 */
/** The file under the store that holds the person's credential, as the client reads it. */
export const CREDENTIAL_FILE = 'credential';

/** The name the store's credential is minted under, or the first free one after it. */
export const CREDENTIAL_NAME = 'local';

/**
 * The credential's file under the store `home`.
 * @param home The store's root folder.
 */
export const credentialFile = (home: string) => path.join(home, CREDENTIAL_FILE);

/** The token `<home>/credential` holds, trimmed, or none: no file, or an empty one. */
function heldCredential(home: string) {
  let text: string;
  try {
    text = fs.readFileSync(credentialFile(home), 'utf8');
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === 'ENOENT') return undefined;
    throw err;
  }
  const token = text.trim();
  return token === '' ? undefined : token;
}

/**
 * Puts the person's credential in place under the store `home`: where `<home>/credential` holds a token the store keeps as a standing
 * token held by the person, leaves it and answers `kept`; else mints a person-held token named `local`, or the first free name after it,
 * and writes it to the file with mode 0600 through a hidden file renamed over it, answering `minted` and the name.
 * @param home The store's root folder.
 * @param now When a token it mints is minted.
 */
export const credentialKept = Effect.fnUntraced(function* (home: string, now: Date = new Date()) {
  const door = yield* TokenDoor;
  const held = yield* fromThrow(() => heldCredential(home));
  const record = held === undefined ? null : yield* door.persons.read(tokenDigest(held));
  if (record !== null && holderOf(record).kind === 'person')
    return { kind: 'kept' } satisfies { readonly kind: 'kept' } | { readonly kind: 'minted'; readonly name: string };
  const { token, name } = yield* door.persons.mintFree(CREDENTIAL_NAME, now);
  yield* fromThrow(() => {
    fs.mkdirSync(home, { recursive: true });
    const hidden = path.join(home, `.${CREDENTIAL_FILE}.${process.pid}.tmp`);
    fs.writeFileSync(hidden, `${token}\n`, { mode: 0o600 });
    fs.chmodSync(hidden, 0o600);
    fs.renameSync(hidden, credentialFile(home));
  });
  return { kind: 'minted', name } satisfies { readonly kind: 'kept' } | { readonly kind: 'minted'; readonly name: string };
});

/**
 * Puts the person's credential in place under the store `home` (`credentialKept`), at once: a test's, as a daemon's start puts it.
 * @param home The store's root folder.
 * @param now When a token it mints is minted.
 */
export const credentialKeptNow = (home: string, now: Date = new Date()) =>
  Effect.runSync(Effect.provide(credentialKept(home, now), tokenDoorAt(home)));
