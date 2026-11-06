/**
 * The refusal of a caller who may not do what it asks of a proposal or a delegation: a session proposing in another factory, an agent
 * approving what the machinery does not let it (`proposalApproval`'s reason), an agent declining or writing a delegation, which are the
 * person's alone (`person-only`). Its `reason` is the api's 403 (`objects`' `Forbidden`); its words say what to do next. Imported from
 * `effect/Data` alone, as the orchestrator's other refusals are (`src/refusal/refusal.ts`).
 */
import { TaggedError } from 'effect/Data';
import type { ProposalRefusal } from 'objects';

/** A caller refused by who it is, with the reason the api answers it with. */
export class Forbidden extends TaggedError('Forbidden')<{ readonly message: string; readonly reason: ProposalRefusal }> {
  readonly exitCode = 2;
}
