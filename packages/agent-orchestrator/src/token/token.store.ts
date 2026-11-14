/**
 * The store of session tokens: a random token minted for each session the store files (`mintToken`), handed to the session in its
 * environment and kept here only as the record its sha-256 digest names, `<home>/tokens/<digest>.json` (`TokenFiled`), so the store
 * never holds a token a reader could present. Read again by the digest of the token a request presents (`readToken`). A record is never
 * taken back: whether its session is still the live one is judged afresh on each request against the run (`caller.verb.ts`), so a token
 * ends with its try and no list of revoked ones is kept.
 *
 * And the standing tokens, the person's to mint: named, minted through the api (`mintPersonToken`, `POST /api/tokens`), answered once and
 * kept as the record its digest names, `<home>/person-tokens/<digest>.json` (`PersonTokenFiled`: its name, when it was minted, and who
 * holds it — the person, or an agent bound to a factory or store-wide and maybe narrowed; a record that names no holder, minted before
 * holders were said, is the person's); listed by name (`personTokens`) and removed by name (`revokePersonToken`), after which it is refused
 * as unknown. The folder keeps its name, `person-tokens`, so no record minted before is orphaned.
 *
 * Rooted: every function takes the store's root as `home`, and the door (`TokenDoor`) reads the root the program is given (`StoreRoot`).
 * And the minting of a step's token as its try is filed (`stepToken`), which the tick's filings spread into the config they file; and
 * the store's credential, the person's own token for this machine, kept in `<home>/credential` (`credentialKept`).
 */
import { runNamespace } from '../run-list/index.ts';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { Context, Layer, Result, Schema } from 'effect';
import { doorOf, rootedDoor, type DoorOf } from '../door/door.store.ts';
import type { Run } from '../record/record.ts';
import type { StepSpec } from '../workflow.ts';
import { Conflict, Invalid, Missing } from '../refusal/refusal.ts';
import type { StandingRecord, TokenHolder, TokenRecord } from './token.ts';

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

/** The folder the store keeps its token records in, under the store `home`. */
export const tokensDir = (home: string): string => path.join(home, 'tokens');

/** The digest a token is kept and found by: its sha-256, in hex. */
export const tokenDigest = (token: string): string => crypto.createHash('sha256').update(token).digest('hex');

/** The file of the token whose digest is `digest`, under the store `home`. */
const tokenFile = (home: string, digest: string): string => path.join(tokensDir(home), `${digest}.json`);

/**
 * A new token, 32 random bytes in base64url, its record written under its digest in the folder `dir` through a hidden file renamed over
 * it, readable by its owner alone in a folder its owner alone opens. Answers the token itself, which is written nowhere. Not through
 * `writeWhole`: the hidden file is made readable by its owner alone as it is created, so the record is never open to another.
 */
function minted(dir: string, record: object): string {
  const token = crypto.randomBytes(32).toString('base64url');
  const file = path.join(dir, `${tokenDigest(token)}.json`);
  fs.mkdirSync(dir, { recursive: true, mode: 0o700 });
  const hidden = path.join(dir, `.${tokenDigest(token)}.${process.pid}.tmp`);
  fs.writeFileSync(hidden, `${JSON.stringify(record)}\n`, { mode: 0o600 });
  fs.renameSync(hidden, file);
  return token;
}

/**
 * Mints a session's token, its record written under its digest (`tokenFile`), readable by its owner alone (`minted`). Answers the token
 * itself, which is written nowhere: the caller hands it to the session.
 */
export function mintToken(home: string, record: TokenFiled): string {
  return minted(tokensDir(home), record);
}

/**
 * The record the store keeps of `token`, or null where it minted none: no file under its digest, or one that does not read as a record,
 * which vouches for no session.
 */
export function readToken(home: string, token: string): TokenFiled | null {
  let text: string;
  try {
    text = fs.readFileSync(tokenFile(home, tokenDigest(token)), 'utf8');
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === 'ENOENT') return null;
    throw err;
  }
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    return null;
  }
  const read = Schema.decodeUnknownResult(TokenFiledSchema)(raw);
  return Result.isSuccess(read) ? read.success : null;
}

/**
 * What the store keeps of a standing token, found by its digest: the name the person gave it, when it was minted (an ISO date), and who
 * holds it (`holder`: absent, minted before holders were said, is the person).
 */
export type PersonTokenFiled = { readonly name: string; readonly createdAt: string; readonly holder?: TokenHolder };

/** The holder of an agent's token as its record keeps it. */
const AgentHolderSchema = Schema.Struct({
  kind: Schema.Literal('agent'),
  agent: Schema.String,
  factory: Schema.NullOr(Schema.String),
  narrowed: Schema.NullOr(Schema.Literals(['read', 'act'])),
});

const PersonTokenFiledSchema = Schema.Struct({
  name: Schema.String,
  createdAt: Schema.String,
  holder: Schema.optionalKey(Schema.Union([Schema.Struct({ kind: Schema.Literal('person') }), AgentHolderSchema])),
});

/** The person, as a token's holder. */
const PERSON_HOLDER: TokenHolder = { kind: 'person' };

/** Who holds the token `record` is of: its holder, or the person where it names none. */
export const holderOf = (record: PersonTokenFiled): TokenHolder => record.holder ?? PERSON_HOLDER;

/** The standing record `record` is, as `callerOf` reads it: its name and its holder. */
export const standingOf = (record: PersonTokenFiled): StandingRecord => ({ name: record.name, holder: holderOf(record) });

/** The folder the store keeps a person's token records in, under the store `home`. */
export const personTokensDir = (home: string): string => path.join(home, 'person-tokens');

/** A name a person's token takes: a letter or a digit, then letters, digits, `.`, `_` or `-`, 63 at most. */
const PERSON_TOKEN_NAME = /^[A-Za-z0-9][A-Za-z0-9._-]{0,62}$/;

/** The record a file of a person's token holds, or null where it does not read as one, which vouches for no one. */
function personRecordOf(text: string): PersonTokenFiled | null {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    return null;
  }
  const read = Schema.decodeUnknownResult(PersonTokenFiledSchema)(raw);
  if (!Result.isSuccess(read)) return null;
  const { name, createdAt, holder } = read.success;
  return holder === undefined ? { name, createdAt } : { name, createdAt, holder };
}

/** Every record of a person's token under the store `home`, with the file it is kept in; none where the folder is not there. */
function personFiles(home: string): Array<{ file: string; record: PersonTokenFiled }> {
  const dir = personTokensDir(home);
  if (!fs.existsSync(dir)) return [];
  return fs
    .readdirSync(dir)
    .filter((name) => name.endsWith('.json') && !name.startsWith('.'))
    .flatMap((name) => {
      const file = path.join(dir, name);
      const record = personRecordOf(fs.readFileSync(file, 'utf8'));
      return record === null ? [] : [{ file, record }];
    });
}

/**
 * Mints a standing token under `name`, held by `holder` (the person where not said), its record (`PersonTokenFiled`) written under its
 * digest, readable by its owner alone (`minted`). Answers the token itself, once: the store keeps only its digest. Refused, writing
 * nothing: a name that is no name (`Invalid`), an agent's name that is none (`Invalid`), and a name a token is already kept under
 * (`Conflict`, naming the removal that frees it).
 */
export function mintPersonToken(home: string, name: string, now: Date = new Date(), holder: TokenHolder = PERSON_HOLDER): string {
  if (!PERSON_TOKEN_NAME.test(name))
    throw new Invalid({
      message: `nemia token add takes a name of letters, digits, \`.\`, \`_\` or \`-\`, starting with a letter or a digit, 63 at most, and \`${name}\` is not one: name it for where it is used, as nemia token add laptop.`,
    });
  if (holder.kind === 'agent' && !PERSON_TOKEN_NAME.test(holder.agent))
    throw new Invalid({
      message: `nemia token add --agent takes the agent's name, of letters, digits, \`.\`, \`_\` or \`-\`, and \`${holder.agent}\` is not one: nemia token add <name> --agent <agent>, as nemia token add ops --agent operator.`,
    });
  if (personFiles(home).some((f) => f.record.name === name))
    throw new Conflict({
      message: `a token named ${name} is already kept: name this one otherwise, or nemia token rm ${name} first, which refuses the old one from then on.`,
    });
  const record: PersonTokenFiled =
    holder.kind === 'person' ? { name, createdAt: now.toISOString() } : { name, createdAt: now.toISOString(), holder };
  return minted(personTokensDir(home), record);
}

/**
 * Mints a person's token under `name`, or under the first of `name-2`, `name-3`… no token of the person's is kept under, for a token
 * whose name the person did not type: a pairing's, after its client, and a first-visit link's. Answers the token, once, and the name it
 * was minted under. Refused as `mintPersonToken` refuses: a name that is no name (`Invalid`); a name taken between the read and the write
 * is tried again under the next.
 */
export function mintPersonTokenFree(home: string, name: string, now: Date = new Date()): { token: string; name: string } {
  const taken = new Set(personFiles(home).map((f) => f.record.name));
  for (let n = 1; ; n++) {
    const free = n === 1 ? name : `${name}-${n}`;
    if (taken.has(free)) continue;
    try {
      return { token: mintPersonToken(home, free, now), name: free };
    } catch (err) {
      if (!(err instanceof Conflict)) throw err;
      taken.add(free);
    }
  }
}

/** The record of the person's token whose digest is `digest`, or null where the store keeps none: it was never minted, or was removed. */
export function personTokenOf(home: string, digest: string): PersonTokenFiled | null {
  let text: string;
  try {
    text = fs.readFileSync(path.join(personTokensDir(home), `${digest}.json`), 'utf8');
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === 'ENOENT') return null;
    throw err;
  }
  return personRecordOf(text);
}

/** The person's tokens the store keeps, by name: each its name and when it was minted, never its digest. */
export function personTokens(home: string): PersonTokenFiled[] {
  return personFiles(home)
    .map((f) => f.record)
    .sort((a, b) => a.name.localeCompare(b.name));
}

/**
 * Removes the person's token named `name`: a request presenting it is refused as unknown from then on. Answers its record. Refused
 * (`Missing`) where the store keeps no token under that name, naming the list.
 */
export function revokePersonToken(home: string, name: string): PersonTokenFiled {
  const found = personFiles(home).find((f) => f.record.name === name);
  if (found === undefined)
    throw new Missing({ message: `no token named ${name} is kept: nemia token ls lists the names of those that are.` });
  fs.rmSync(found.file);
  return found.record;
}

/**
 * A layer of the token door: minting a session's token and reading the record of one presented; and the standing tokens minted by name
 * for a holder, read by digest, listed and removed by name.
 */
export type TokensLayer = {
  readonly tokens: {
    readonly mint: (record: TokenFiled) => string;
    readonly read: (token: string) => TokenFiled | null;
  };
  readonly persons: {
    readonly mint: (name: string, holder?: TokenHolder) => string;
    readonly read: (digest: string) => PersonTokenFiled | null;
    readonly list: () => PersonTokenFiled[];
    readonly revoke: (name: string) => PersonTokenFiled;
  };
};

/** The token door's shape: each method of `TokensLayer` answering an Effect. */
export type TokenDoorShape = DoorOf<TokensLayer, string>;

/** The token records of the store `home`. */
const tokenFiles = (home: string): TokensLayer => ({
  tokens: { mint: (record) => mintToken(home, record), read: (token) => readToken(home, token) },
  persons: {
    mint: (name, holder) => mintPersonToken(home, name, new Date(), holder),
    read: (digest) => personTokenOf(home, digest),
    list: () => personTokens(home),
    revoke: (name) => revokePersonToken(home, name),
  },
});

/**
 * The token door, as the service a program yields: a reference whose default is rooted (`rootedDoor`), the records at the store's root
 * the program is given, refused `Invalid` where it was given none.
 */
export const TokenDoor = Context.Reference<TokenDoorShape>('agent-orchestrator/TokenDoor', {
  defaultValue: () => rootedDoor((root) => doorOf<TokensLayer, string>(tokenFiles(root)), 'token door'),
});

/** The token door over the records of the store `root`, as a layer: for a program that names its root by the door. */
export const tokenDoorFiles = (root: string): Layer.Layer<never> => Layer.succeed(TokenDoor)(doorOf<TokensLayer, string>(tokenFiles(root)));

/**
 * A step's session token, minted under the store `home` as its try `attempt` is filed as the engine's task `task`: its agent (the step's
 * name where it has none), the run's factory (the default one where it names none: null is Nemia's alone) and the run and step.
 * Answered as the field `filedConfig` takes.
 */
export const stepToken = (
  home: string,
  run: Pick<Run, 'id' | 'factory'>,
  step: Pick<StepSpec, 'name' | 'agent'>,
  task: string,
  attempt: number,
): { sessionToken: string } => ({
  sessionToken: mintToken(home, {
    agent: step.agent?.name ?? step.name,
    factory: runNamespace(run.factory),
    run: run.id,
    step: step.name,
    attempt,
    task,
  }),
});

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

/** The credential's file under the store `home`. */
export const credentialFile = (home: string): string => path.join(home, CREDENTIAL_FILE);

/** The token `<home>/credential` holds, trimmed, or none: no file, or an empty one. */
function heldCredential(home: string): string | undefined {
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
 */
export function credentialKept(
  home: string,
  now: Date = new Date(),
): { readonly kind: 'kept' } | { readonly kind: 'minted'; readonly name: string } {
  const held = heldCredential(home);
  const record = held === undefined ? null : personTokenOf(home, tokenDigest(held));
  if (record !== null && holderOf(record).kind === 'person') return { kind: 'kept' };
  const { token, name } = mintPersonTokenFree(home, CREDENTIAL_NAME, now);
  fs.mkdirSync(home, { recursive: true });
  const hidden = path.join(home, `.${CREDENTIAL_FILE}.${process.pid}.tmp`);
  fs.writeFileSync(hidden, `${token}\n`, { mode: 0o600 });
  fs.chmodSync(hidden, 0o600);
  fs.renameSync(hidden, credentialFile(home));
  return { kind: 'minted', name };
}
