/**
 * Where `nemia factory resolve` proposes a workflow's resolution: a service its handler yields (`ResolutionProposer`), given the factory,
 * the workflow and the spec its conflicts' choices compose (none for a removal), which proposes that Workflow at the version its tree's
 * folder is at now, by the caller the session's token names, and answers the proposal's name. A service rather than an import: the
 * proposals' programs read the Factory object, which reads the command table that holds resolve, so resolve reaching them by an import
 * would close a cycle; the command line gives it where it runs a command (`withResolutionProposer`, `proposed.verb.ts`, in `cli/main.ts`).
 * Its default refuses, naming the command line, for a program composed without it.
 */
import { Context, Effect } from 'effect';
import type { WorkflowSpecRead } from '../../propose/index.ts';
import { Invalid, type Refusal } from '../../refusal/refusal.ts';
import type { EngineService } from '../../runtime-client.ts';
import type { PlaceService } from '../../place/place.store.ts';
import type { StoreRoot } from '../../config/root.store.ts';
import type { StoreConfig } from '../../config/config.store.ts';

/**
 * A workflow's resolution proposed: the Workflow `workflow` of the factory `factory` written as `spec`, or removed where it is none, `why`
 * the proposal's reason; the proposal's name.
 */
export type ResolutionProposed = (
  factory: string,
  workflow: string,
  spec: WorkflowSpecRead | undefined,
  why: string,
) => Effect.Effect<string, Refusal, EngineService | PlaceService | StoreRoot | StoreConfig>;

/** The proposer `nemia factory resolve` hands a workflow's resolution to: refused where the program was composed without one. */
export const ResolutionProposer = Context.Reference<ResolutionProposed>('agent-orchestrator/ResolutionProposer', {
  defaultValue: () => () =>
    Effect.fail(
      new Invalid({
        message:
          "nemia factory resolve proposes a workflow's resolution only from the command line, where a template is a folder on the machine: type nemia factory resolve <name> <conflict> --ours|--theirs|--file <path>.",
      }),
    ),
});
