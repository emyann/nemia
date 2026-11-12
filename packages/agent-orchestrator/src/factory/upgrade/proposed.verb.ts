/**
 * The proposer of an owner's resolution as the command line gives it (`ResolutionProposer`, `proposer.verb.ts`): the object proposed with
 * `proposeProgram` at the version it is at now (`currentOf`) — an update, a creation where nothing is at its name, a removal where it is
 * given no spec; the Factory and a Hire always an update, a Hire whose spec hires no one its step fired — by the caller the session's token
 * in `WF_SESSION_TOKEN` names (`sessionCaller`): the person from a shell, the session's agent from a session, held to its own factory. A
 * token refused is refused `Conflict`; the rest as `proposeProgram` refuses it, another factory's session among them (`Forbidden`).
 */
import path from 'node:path';
import { Effect } from 'effect';
import type { ProposedObject } from 'objects';
import { setting } from '../../config/config.store.ts';
import { StoreRoot } from '../../config/root.store.ts';
import { Conflict } from '../../refusal/refusal.ts';
import { sessionCaller } from '../../token/caller.verb.ts';
import { proposeProgram } from '../../propose/propose.verb.ts';
import { currentOf, type ProposalPlace } from '../../propose/current.verb.ts';
import { ResolutionProposer, type ResolutionProposed } from './proposer.verb.ts';

/** The object of `kind` named `name` of `factory` proposed as `spec`, or its removal, by the session's caller: the proposal's name. */
export const resolutionProposed: ResolutionProposed = (factory, kind, name, spec, why) =>
  Effect.gen(function* () {
    const place: ProposalPlace = { home: yield* StoreRoot, repo: path.resolve('.') };
    const now = yield* currentOf(place, factory, kind, name);
    const verb = spec === undefined ? 'delete' : now.version === null && kind !== 'Factory' ? 'create' : 'update';
    const object: ProposedObject = {
      kind,
      metadata: { name, ...(now.version !== null && { resourceVersion: now.version }) },
      verb,
      ...(spec === undefined ? {} : { spec }),
    };
    const caller = yield* sessionCaller(yield* setting('sessionToken'));
    if (caller.kind === 'refused')
      return yield* Effect.fail(
        new Conflict({
          message: `nemia factory resolve: the session token in WF_SESSION_TOKEN is refused (${caller.reason}): run it from the session its run filed, or from your own shell, where none is set. Nothing was proposed; your choice is kept.`,
        }),
      );
    const proposal = yield* proposeProgram(caller, factory, { objects: [object], why }, place);
    return proposal.metadata.name;
  });

/** `program` given the command line's proposer of an owner's resolution. */
export const withResolutionProposer = <A, E, R>(program: Effect.Effect<A, E, R>): Effect.Effect<A, E, R> =>
  Effect.provideService(program, ResolutionProposer, resolutionProposed);
