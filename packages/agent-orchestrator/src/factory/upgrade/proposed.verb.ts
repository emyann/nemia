/**
 * The proposer of a workflow's resolution as the command line gives it (`ResolutionProposer`, `proposer.verb.ts`): the Workflow proposed
 * with `proposeProgram` at the version its tree's folder is at now (`currentOf`) — an update, a creation where the tree has no such folder,
 * a removal where it is given no spec — by the caller the session's token in `WF_SESSION_TOKEN` names (`sessionCaller`): the person from
 * a shell, the session's agent from a session, held to its own factory. A token refused is refused `Conflict`; the rest as
 * `proposeProgram` refuses it, another factory's session among them (`Forbidden`).
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

/** The Workflow `workflow` of `factory` proposed as `spec`, or its removal, by the session's caller: the proposal's name. */
export const resolutionProposed: ResolutionProposed = (factory, workflow, spec, why) =>
  Effect.gen(function* () {
    const place: ProposalPlace = { home: yield* StoreRoot, repo: path.resolve('.') };
    const now = yield* currentOf(place, factory, 'Workflow', workflow);
    const verb = spec === undefined ? 'delete' : now.version === null ? 'create' : 'update';
    const object: ProposedObject = {
      kind: 'Workflow',
      metadata: { name: workflow, ...(now.version !== null && { resourceVersion: now.version }) },
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

/** `program` given the command line's proposer of a workflow's resolution. */
export const withResolutionProposer = <A, E, R>(program: Effect.Effect<A, E, R>): Effect.Effect<A, E, R> =>
  Effect.provideService(program, ResolutionProposer, resolutionProposed);
