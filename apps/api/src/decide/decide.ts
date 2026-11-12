/**
 * `GET /api/runs/:runId/decision`, the runs group's `decision` endpoint: a run's decision as the orchestrator's read model gives it
 * (`runDecision`), objects' `RunDecision`. `Missing` for a run the store does not have, `Unjudged` for one whose workflow folder or task
 * journal does not read, in the words the board says it with.
 */
import { Effect } from 'effect';
import { decisionNarrowed, fieldsNamed, Unjudged } from 'objects';
import { Informer, runDecision } from 'agent-orchestrator';
import { answered } from '../objects/refused.ts';

/** The globs `?sensitive=` names, comma-separated, each trimmed and none empty; none asked where it is not given. */
const globsOf = (sensitive: string | undefined): { sensitive?: string[] } => {
  const globs = (sensitive ?? '')
    .split(',')
    .map((glob) => glob.trim())
    .filter((glob) => glob !== '');
  return globs.length ? { sensitive: globs } : {};
};

/**
 * The handler of the runs group's `decision` endpoint, the run `runId`'s decision read over the request's services, its judgement through
 * the app's informer as the run object's is (`informed`, objects/runs.ts), so the two say the run alike; `sensitive`, the query's
 * comma-separated globs, names the files shown in full in place of the defaults; `diffs`, the comma-separated paths whose diffs are
 * answered whole (`*` every one), none where it is not given (`objects`' `decisionNarrowed`, as every read of a decision is).
 */
export const decisionHandler = (runId: string, sensitive?: string, diffs?: string) =>
  Effect.flatMap(
    answered((s) => s.inRequest(Effect.provideService(runDecision(runId, globsOf(sensitive)), Informer, s.informer))),
    (read) =>
      'unjudged' in read
        ? Effect.fail(new Unjudged({ error: read.unjudged }))
        : Effect.succeed(decisionNarrowed(read.decision, diffs === undefined ? undefined : fieldsNamed(diffs))),
  );
