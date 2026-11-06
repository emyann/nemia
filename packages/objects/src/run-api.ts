/**
 * The Run's group of the `Api` (`RunsGroup`): the run object, listed across namespaces and in one, read in its namespace and across all by
 * its id, its four sub-resources, and its named actions in its namespace alone. Served by the api's runs handlers
 * (`apps/api/src/objects/runs.ts`).
 */
import { Schema } from 'effect';
import { HttpApiEndpoint, HttpApiGroup } from 'effect/http-api';
import { BadRequest, Conflict, Invalid, listQuery, Missing, Unjudged, WriteFailed } from './api-errors.ts';
import { LabelEdit, Labelled } from './labels.ts';
import { Run, RunList, StepTold, StepTries, StepTry, TryCloseout } from './run.ts';
import {
  RunApprove,
  RunApproved,
  RunAsked,
  RunHeld,
  RunHold,
  RunPrune,
  RunPruned,
  RunRefresh,
  RunRefreshed,
  RunRemoved,
  RunRetry,
  RunSaid,
  RunSay,
  RunStart,
  RunStarted,
} from './run-actions.ts';

/**
 * The query of a list of runs: a list's (`listQuery`), and `fieldSelector`, the runs in one state, in Kubernetes' spelling:
 * `status.state=<state>` (or `==`), or `status.state!=<state>`, one term, a state of `RUN_STATES`. Kept as its text, so a
 * wrong one is refused in the package's words, a 422. A list asked by it carries the frame's parts (`RunStatus`, `RunListMeta`).
 */
const runListQuery = { ...listQuery, fieldSelector: Schema.optionalKey(Schema.String) };

/** A namespace, for a list in it. */
const namespaceParams = { namespace: Schema.String };

/** A run's step, named in the path. */
const stepParams = { runId: Schema.String, step: Schema.String };

/** A step's try, by its number as the path says it. */
const tryParams = { ...stepParams, try: Schema.String };

/** What a run's reads refuse with: none by that name, a query the package refuses, a run not judged. */
const runReadErrors = [Missing, Invalid, Unjudged];

/**
 * What a run's named actions refuse with: a body or a name read wrong, none there, a state that forbids it, its check, and a failure
 * under it.
 */
const runActionErrors = [BadRequest, Missing, Conflict, Invalid, WriteFailed];

/** A run, by its namespace and its name. */
const runParams = { namespace: Schema.String, name: Schema.String };

/** A step of a run, by the run's namespace and name and the step's. */
const runStepParams = { ...runParams, step: Schema.String };

/** An action's answer, taken and not yet done: a 202. */
const takenLater = <S extends Schema.Top>(answer: S) => answer.pipe(Schema.annotate({ httpApiStatus: 202 }));

/**
 * The run object, listed across namespaces (`/api/runs`) and in one, read in one and across all by its id (`/api/runs/:runId`), and its
 * sub-resources; and its named actions, each in its namespace alone: started, removed, refreshed, pruned, its labels edited, held and its
 * hold lifted, and a step of it tried again, approved and said words to. A run's namespace is its factory, `default` for one that names
 * none: a run addressed under another is `Missing`.
 */
export class RunsGroup extends HttpApiGroup.make('runs').add(
  HttpApiEndpoint.get('listAll', '/api/runs', { query: runListQuery, success: RunList, error: runReadErrors }),
  HttpApiEndpoint.get('list', '/api/namespaces/:namespace/runs', {
    params: namespaceParams,
    query: runListQuery,
    success: RunList,
    error: runReadErrors,
  }),
  HttpApiEndpoint.get('get', '/api/namespaces/:namespace/runs/:name', { params: runParams, success: Run, error: runReadErrors }),
  HttpApiEndpoint.post('create', '/api/namespaces/:namespace/runs', {
    params: namespaceParams,
    query: { repo: Schema.optionalKey(Schema.String) },
    payload: RunStart,
    success: RunStarted.pipe(Schema.annotate({ httpApiStatus: 201 })),
    error: runActionErrors,
  }),
  HttpApiEndpoint.delete('delete', '/api/namespaces/:namespace/runs/:name', {
    params: runParams,
    success: RunRemoved,
    error: runActionErrors,
  }),
  HttpApiEndpoint.post('refresh', '/api/namespaces/:namespace/runs/:name/refresh', {
    params: runParams,
    payload: RunRefresh,
    success: takenLater(RunRefreshed),
    error: runActionErrors,
  }),
  HttpApiEndpoint.post('prune', '/api/namespaces/:namespace/runs/:name/prune', {
    params: runParams,
    payload: RunPrune,
    success: RunPruned,
    error: runActionErrors,
  }),
  HttpApiEndpoint.post('labels', '/api/namespaces/:namespace/runs/:name/labels', {
    params: runParams,
    payload: LabelEdit,
    success: Labelled,
    error: runActionErrors,
  }),
  HttpApiEndpoint.post('hold', '/api/namespaces/:namespace/runs/:name/hold', {
    params: runParams,
    payload: RunHold,
    success: RunHeld,
    error: runActionErrors,
  }),
  HttpApiEndpoint.delete('unhold', '/api/namespaces/:namespace/runs/:name/hold', {
    params: runParams,
    success: RunHeld,
    error: runActionErrors,
  }),
  HttpApiEndpoint.post('retry', '/api/namespaces/:namespace/runs/:name/steps/:step/retry', {
    params: runStepParams,
    payload: RunRetry,
    success: takenLater(RunAsked),
    error: runActionErrors,
  }),
  HttpApiEndpoint.post('approve', '/api/namespaces/:namespace/runs/:name/steps/:step/approve', {
    params: runStepParams,
    payload: RunApprove,
    success: takenLater(RunApproved),
    error: runActionErrors,
  }),
  HttpApiEndpoint.post('say', '/api/namespaces/:namespace/runs/:name/steps/:step/say', {
    params: runStepParams,
    payload: RunSay,
    success: takenLater(RunSaid),
    error: runActionErrors,
  }),
  HttpApiEndpoint.get('show', '/api/runs/:runId', { params: { runId: Schema.String }, success: Run, error: runReadErrors }),
  HttpApiEndpoint.get('tries', '/api/runs/:runId/steps/:step/tries', {
    params: stepParams,
    success: StepTries,
    error: [Missing, Invalid, Unjudged],
  }),
  HttpApiEndpoint.get('try', '/api/runs/:runId/steps/:step/tries/:try', {
    params: tryParams,
    success: StepTry,
    error: [Missing, Invalid, Unjudged],
  }),
  HttpApiEndpoint.get('closeout', '/api/runs/:runId/steps/:step/tries/:try/closeout', {
    params: tryParams,
    success: TryCloseout,
    error: [Missing, Invalid, Unjudged],
  }),
  HttpApiEndpoint.get('told', '/api/runs/:runId/steps/:step/told', {
    params: stepParams,
    success: StepTold,
    error: [Missing, Invalid, Unjudged],
  }),
) {}
