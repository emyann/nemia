/**
 * `GET /api/runs/:runId/decision`, the runs group's `decision` endpoint: a run's decision as the orchestrator's read model gives it
 * (`runDecision`), objects' `RunDecision`. `Missing` for a run the store does not have, `Unjudged` for one whose workflow folder or task
 * journal does not read, in the words the board says it with.
 */
import { Effect } from 'effect';
import { Unjudged } from 'objects';
import { runDecision } from 'agent-orchestrator';
import { answered } from '../objects/refused.ts';

/** The handler of the runs group's `decision` endpoint, the run `runId`'s decision read over the request's services. */
export const decisionHandler = (runId: string) =>
  Effect.flatMap(
    answered((s) => s.inRequest(runDecision(runId, s.env))),
    (read) => ('unjudged' in read ? Effect.fail(new Unjudged({ error: read.unjudged })) : Effect.succeed(read.decision)),
  );
