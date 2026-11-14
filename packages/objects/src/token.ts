/**
 * Standing tokens and who acts: a token the person mints through the api (`TokensGroup`, `GET` and `POST /api/tokens`, `DELETE
 * /api/tokens/:name`), which says its holder — the person, under the name of the device it is for (`laptop`, `board`), or an agent under
 * its own name, bound to one factory or store-wide and maybe narrowed (`FLOOR_NARROWINGS`); and the actor a write records (`Actor`), the
 * caller it was made by, which the board shows beside it (`actorWords`). Plain Schemas of JSON. Pure.
 */
import { Schema } from 'effect';
import { HttpApiEndpoint, HttpApiGroup } from 'effect/http-api';
import { BadRequest, Conflict, Failed, Forbidden, Invalid, Missing } from './api-errors.ts';
import { CALLER_KINDS, FLOOR_NARROWINGS, TOKEN_HOLDERS } from './words.ts';

/**
 * Who made a write, as the record keeps it: the person, under the name of the token they presented (`token`, absent for a program run
 * in-process, which presents none); or an agent, under its own name, by a standing token the person minted for it (`token`) or by its
 * session (`run` and `step`, absent for a session no run filed). Every key but `kind` optional, so a record written before actors were
 * said reads with none.
 */
export const Actor = Schema.Struct({
  kind: Schema.Literals(CALLER_KINDS),
  agent: Schema.optionalKey(Schema.String),
  token: Schema.optionalKey(Schema.String),
  run: Schema.optionalKey(Schema.String),
  step: Schema.optionalKey(Schema.String),
}).annotate({ identifier: 'Actor' });
export type Actor = typeof Actor.Type;

/**
 * An actor in the words a person reads: `the person, on laptop`; `the person`; `operator, by its token ops`; `reviewer, of <run>/<step>`;
 * or the agent's name alone.
 */
export function actorWords(actor: Actor): string {
  if (actor.kind === 'person') return actor.token === undefined ? 'the person' : `the person, on ${actor.token}`;
  const agent = actor.agent ?? 'an agent';
  if (actor.token !== undefined) return `${agent}, by its token ${actor.token}`;
  if (actor.run !== undefined) return `${agent}, of ${actor.run}${actor.step === undefined ? '' : `/${actor.step}`}`;
  return agent;
}

/**
 * A standing token as `GET /api/tokens` lists it: its name, who holds it (`holder`), the agent that holds it, the factory it is bound to
 * (absent: store-wide) and its narrowing (absent: none), and when it was minted. Never the token, nor its digest.
 */
export const Token = Schema.Struct({
  name: Schema.String,
  holder: Schema.Literals(TOKEN_HOLDERS),
  agent: Schema.optionalKey(Schema.String),
  factory: Schema.optionalKey(Schema.String),
  narrowed: Schema.optionalKey(Schema.Literals(FLOOR_NARROWINGS)),
  createdAt: Schema.String,
}).annotate({ identifier: 'Token' });
export type Token = typeof Token.Type;

/** `GET /api/tokens`: the standing tokens the store keeps, by name. */
export const TokenList = Schema.Struct({ tokens: Schema.Array(Token) }).annotate({ identifier: 'TokenList' });
export type TokenList = typeof TokenList.Type;

/**
 * `POST /api/tokens`' body: the token's name, and for an agent's token the agent that holds it (`agent`), the factory it is bound to
 * (`factory`, left out: store-wide) and its narrowing (`narrowed`, left out: none). With no `agent` the token is the person's, and a
 * `factory` or a `narrowed` beside it is refused.
 */
export const TokenMint = Schema.Struct({
  name: Schema.String,
  agent: Schema.optionalKey(Schema.String),
  factory: Schema.optionalKey(Schema.String),
  narrowed: Schema.optionalKey(Schema.Literals(FLOOR_NARROWINGS)),
}).annotate({ identifier: 'TokenMint' });
export type TokenMint = typeof TokenMint.Type;

/** What `POST /api/tokens` answers, once: the token as listed, and the token itself, which the store keeps only the digest of. */
export const TokenMinted = Schema.Struct({ ...Token.fields, token: Schema.String }).annotate({ identifier: 'TokenMinted' });
export type TokenMinted = typeof TokenMinted.Type;

/**
 * The person's tokens, minted, listed and retired by the person alone: a token held by an agent or a session's is refused (403), as is
 * one that presents none.
 */
export class TokensGroup extends HttpApiGroup.make('tokens').add(
  HttpApiEndpoint.get('list', '/api/tokens', { success: TokenList, error: [Forbidden, Failed] }),
  HttpApiEndpoint.post('mint', '/api/tokens', {
    payload: TokenMint,
    success: TokenMinted.pipe(Schema.annotate({ httpApiStatus: 201 })),
    error: [BadRequest, Invalid, Conflict, Forbidden, Failed],
  }),
  HttpApiEndpoint.delete('retire', '/api/tokens/:name', {
    params: { name: Schema.String },
    success: Token,
    error: [Missing, Forbidden, Failed],
  }),
) {}
