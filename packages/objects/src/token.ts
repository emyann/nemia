/**
 * Standing tokens and who acts: a token the person mints through the api (`TokensGroup`, `GET` and `POST /api/tokens`, `DELETE
 * /api/tokens/:name`), which says its holder — the person, under the name of the device it is for (`laptop`, `board`), or an agent under
 * its own name, bound to one factory or store-wide and maybe narrowed (`FLOOR_NARROWINGS`); and the actor a write records (`Actor`), the
 * caller it was made by, which the board shows beside it (`actorWords`). Plain Schemas of JSON. Pure.
 */
import { Schema } from 'effect';
import { HttpApiEndpoint, HttpApiGroup, OpenApi } from 'effect/http-api';
import { BadRequest, Conflict, Failed, Forbidden, Invalid, Missing } from './api-errors.ts';
import { CALLER_KINDS, FLOOR_NARROWINGS, TOKEN_HOLDERS } from './words.ts';

/**
 * Who made a write, as the record keeps it: the person, under the name of the token they presented (`token`, absent for a program run
 * in-process, which presents none); or an agent, under its own name, by a standing token the person minted for it (`token`) or by its
 * session (`run` and `step`, absent for a session no run filed). Every key but `kind` optional, so a record written before actors were
 * said reads with none.
 */
export const Actor = Schema.Struct({
  kind: Schema.Literals(CALLER_KINDS).annotate({ description: 'Who made it: the person, or an agent.' }),
  agent: Schema.optionalKey(Schema.String.annotate({ description: "The agent's name, for a write an agent made; absent for the person." })),
  token: Schema.optionalKey(
    Schema.String.annotate({
      description:
        'The name of the token presented: the device it is for, or the standing token minted for the agent. Absent where none was.',
    }),
  ),
  run: Schema.optionalKey(
    Schema.String.annotate({ description: 'The run whose session made it; absent for a write no session of a run made.' }),
  ),
  step: Schema.optionalKey(
    Schema.String.annotate({ description: 'The step of that run whose session made it; absent where no session of a step did.' }),
  ),
}).annotate({
  identifier: 'Actor',
  description:
    'Who made a write: the person, under the name of the token they presented, or an agent, by its standing token or by the session of the run and step it works in.',
});
export type Actor = typeof Actor.Type;

/**
 * An actor in the words a person reads: `the person, on laptop`; `the person`; `operator, by its token ops`; `reviewer, of <run>/<step>`;
 * or the agent's name alone.
 * @param actor Who did it, a person or an agent, with the token or the run and step it acted by.
 */
export function actorWords(actor: Actor) {
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
  name: Schema.String.annotate({ description: "The token's name: for the person's, the device it is for (laptop, board)." }),
  holder: Schema.Literals(TOKEN_HOLDERS).annotate({ description: 'Who holds it: the person, or an agent.' }),
  agent: Schema.optionalKey(Schema.String.annotate({ description: 'The agent that holds it; absent for a token of the person.' })),
  factory: Schema.optionalKey(Schema.String.annotate({ description: 'The factory it is bound to; absent for a store-wide token.' })),
  narrowed: Schema.optionalKey(
    Schema.Literals(FLOOR_NARROWINGS).annotate({
      description: "How an agent's token is narrowed below its floor; absent where it is not.",
    }),
  ),
  createdAt: Schema.String.annotate({ description: 'When it was minted (nemia token add), as an ISO 8601 time.' }),
}).annotate({ identifier: 'Token', description: 'A standing token as the store lists it, never the token itself nor its digest.' });
export type Token = typeof Token.Type;

/** `GET /api/tokens`: the standing tokens the store keeps, by name. */
export const TokenList = Schema.Struct({
  tokens: Schema.Array(Token).annotate({ description: 'The standing tokens the store keeps, by name.' }),
}).annotate({ identifier: 'TokenList' });
export type TokenList = typeof TokenList.Type;

/**
 * `POST /api/tokens`' body: the token's name, and for an agent's token the agent that holds it (`agent`), the factory it is bound to
 * (`factory`, left out: store-wide) and its narrowing (`narrowed`, left out: none). With no `agent` the token is the person's, and a
 * `factory` or a `narrowed` beside it is refused.
 */
export const TokenMint = Schema.Struct({
  name: Schema.String.annotate({ description: "The new token's name: for the person's, the device it is for." }),
  agent: Schema.optionalKey(
    Schema.String.annotate({
      description: "The agent that holds it; left out, the token is the person's, and factory and narrowed are refused.",
    }),
  ),
  factory: Schema.optionalKey(
    Schema.String.annotate({ description: "The factory an agent's token is bound to; left out, it is store-wide." }),
  ),
  narrowed: Schema.optionalKey(
    Schema.Literals(FLOOR_NARROWINGS).annotate({ description: "How an agent's token is narrowed below its floor; left out, it is not." }),
  ),
}).annotate({ identifier: 'TokenMint' });
export type TokenMint = typeof TokenMint.Type;

/** What `POST /api/tokens` answers, once: the token as listed, and the token itself, which the store keeps only the digest of. */
export const TokenMinted = Schema.Struct({
  ...Token.fields,
  token: Schema.String.annotate({ description: 'The token itself, answered this once: the store keeps only its digest.' }),
}).annotate({ identifier: 'TokenMinted' });
export type TokenMinted = typeof TokenMinted.Type;

/**
 * The person's tokens, minted, listed and retired by the person alone: a token held by an agent or a session's is refused (403), as is
 * one that presents none.
 */
export class TokensGroup extends HttpApiGroup.make('tokens').add(
  HttpApiEndpoint.get('list', '/api/tokens', { success: TokenList, error: [Forbidden, Failed] }).annotate(
    OpenApi.Description,
    'Lists the standing tokens the store keeps by name, each with who holds it, the factory it is bound to and its narrowing; never the token. Answers TokenList.',
  ),
  HttpApiEndpoint.post('mint', '/api/tokens', {
    payload: TokenMint,
    success: TokenMinted.pipe(Schema.annotate({ httpApiStatus: 201 })),
    error: [BadRequest, Invalid, Conflict, Forbidden, Failed],
  }).annotate(
    OpenApi.Description,
    "Mints a standing token for the person under a device's name, or for an agent, bound to a factory or store-wide and maybe narrowed. Answers TokenMinted with a 201, the token itself once, which the store keeps only the digest of.",
  ),
  HttpApiEndpoint.delete('retire', '/api/tokens/:name', {
    params: { name: Schema.String.annotate({ description: 'The name of the token to retire.' }) },
    success: Token,
    error: [Missing, Forbidden, Failed],
  }).annotate(OpenApi.Description, 'Retires a standing token by its name, so it is refused from then on. Answers the Token retired.'),
) {}
