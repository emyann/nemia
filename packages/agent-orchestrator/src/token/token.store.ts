/**
 * The store of session tokens: a random token minted for each session the store files (`mintToken`), handed to the session in its
 * environment and kept here only as the record its sha-256 digest names, `<home>/tokens/<digest>.json` (`TokenFiled`), so the store
 * never holds a token a reader could present. Read again by the digest of the token a request presents (`readToken`). A record is never
 * taken back: whether its session is still the live one is judged afresh on each request against the run (`caller.verb.ts`), so a token
 * ends with its try and no list of revoked ones is kept.
 *
 * Rooted: every function takes the store's root as `home`, and the door (`TokenDoor`) reads the root the program is given (`StoreRoot`).
 * And the minting of a step's token as its try is filed (`stepToken`), which the tick's filings spread into the config they file.
 */
import { runNamespace } from '../run-list/index.ts';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { Context, Layer, Result, Schema } from 'effect';
import { doorOf, rootedDoor, type DoorOf } from '../door/door.store.ts';
import type { Run } from '../record/record.ts';
import type { Workflow } from '../workflow.ts';
import type { TokenRecord } from './token.ts';

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
 * Mints a session's token: 32 random bytes in base64url, its record written under its digest (`tokenFile`) through a hidden file renamed
 * over it, readable by its owner alone. Answers the token itself, which is written nowhere: the caller hands it to the session. Not through
 * `writeWhole`: the hidden file is made readable by its owner alone as it is created, so the record is never open to another.
 */
export function mintToken(home: string, record: TokenFiled): string {
  const token = crypto.randomBytes(32).toString('base64url');
  const file = tokenFile(home, tokenDigest(token));
  fs.mkdirSync(path.dirname(file), { recursive: true, mode: 0o700 });
  const hidden = `${file}.${process.pid}.tmp`;
  fs.writeFileSync(hidden, `${JSON.stringify(record)}\n`, { mode: 0o600 });
  fs.renameSync(hidden, file);
  return token;
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

/** A layer of the token door: minting a session's token and reading the record of one presented. */
export type TokensLayer = {
  readonly tokens: {
    readonly mint: (record: TokenFiled) => string;
    readonly read: (token: string) => TokenFiled | null;
  };
};

/** The token door's shape: each method of `TokensLayer` answering an Effect. */
export type TokenDoorShape = DoorOf<TokensLayer, string>;

/** The token records of the store `home`. */
const tokenFiles = (home: string): TokensLayer => ({
  tokens: { mint: (record) => mintToken(home, record), read: (token) => readToken(home, token) },
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
  step: Pick<Workflow, 'name' | 'agent'>,
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
