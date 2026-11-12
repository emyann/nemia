/**
 * The Run's group of the `Api` (`RunsGroup`): the run object, listed across namespaces and in one — as a `RunList`, or as a `Table` asked
 * for — read in its namespace and across all by its name, what is read beside it (its lines, what it concludes, its record, `nemia ls`'s
 * listing), and its named actions in its namespace alone, each body a Schema that decodes. Served by the api's
 * runs handlers (`apps/api/src/objects/runs.ts`).
 */
import { Schema } from 'effect';
import { HttpApiEndpoint, HttpApiGroup } from 'effect/http-api';
import { BadRequest, Conflict, Invalid, listQuery, Missing, Unjudged, WriteFailed } from './api-errors.ts';
import { Table } from './table.ts';
import { Concluded, RunLines, RunRecord, RunsListed } from './run-reads.ts';
import { LabelEdit, Labelled } from './labels.ts';
import { Run, RunList } from './run.ts';
import { RunDecision } from './decide.ts';
import {
  RunApprove,
  RunApproved,
  RunAsked,
  RunCancelled,
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

/** What a list of runs answers: the `RunList`, or, asked with `TABLE_ACCEPT`, the `Table` of its page (never on a watch). */
const runListed = Schema.Union([RunList, Table]);

/** A run, by its name. */
const nameParams = { name: Schema.String };

/**
 * The label selectors of `nemia ls`'s listing, one each time it is given, as `-l` is (OR): a list's two spellings of them, the retired one
 * among them, which `nemia ls` sends; the listing is one answer, with no page and no watch.
 */
const { limit: _limit, continue: _continue, watch: _watch, ...listingQuery } = listQuery;

/** A namespace, for a list in it. */
const namespaceParams = { namespace: Schema.String };

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
 * The run object, listed across namespaces (`/api/runs`) and in one, read in one and across all by its name (`/api/runs/:name`), what is
 * read beside it; and its named actions, each in its namespace alone: started, removed — a try alone, a run started
 * from an agent's page, any other being `nemia rm`'s — refreshed, pruned, its labels edited, held and its hold lifted, and a step of it
 * tried again, approved and said words to. A run's namespace is its factory, `default` for one that names none: a run addressed under
 * another is `Missing`. A start is placed on the repository `?repo=` names, else the api's own.
 */
export class RunsGroup extends HttpApiGroup.make('runs').add(
  HttpApiEndpoint.get('listAll', '/api/runs', { query: runListQuery, success: runListed, error: runReadErrors }),
  HttpApiEndpoint.get('list', '/api/namespaces/:namespace/runs', {
    params: namespaceParams,
    query: runListQuery,
    success: runListed,
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
  HttpApiEndpoint.post('cancel', '/api/namespaces/:namespace/runs/:name/cancel', {
    params: runParams,
    success: RunCancelled,
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
  HttpApiEndpoint.get('show', '/api/runs/:name', { params: nameParams, success: Run, error: runReadErrors }),
  HttpApiEndpoint.get('lines', '/api/runs/:name/lines', { params: nameParams, success: RunLines, error: [Missing] }),
  HttpApiEndpoint.get('concluded', '/api/runs/:name/concluded', {
    params: nameParams,
    success: Concluded,
    error: [Missing, Invalid],
  }),
  HttpApiEndpoint.get('record', '/api/runs/:name/record', { params: nameParams, success: RunRecord, error: [Missing, Invalid] }),
  HttpApiEndpoint.get('listing', '/api/listing', { query: listingQuery, success: RunsListed, error: [Missing, Invalid] }),
  HttpApiEndpoint.get('listingOne', '/api/listing/:name', {
    params: nameParams,
    query: listingQuery,
    success: RunsListed,
    error: [Missing, Invalid],
  }),
  HttpApiEndpoint.get('decision', '/api/runs/:runId/decision', {
    params: { runId: Schema.String },
    /** Comma-separated globs whose changed files the decision shows in full (`nemia decide --sensitive`); else the defaults. */
    /**
     * And `diffs`, comma-separated paths whose diffs it answers whole: given (an empty one naming none), every other file's lines are
     * left out, its path and counts kept (`decisionNarrowed`).
     */
    query: { sensitive: Schema.optionalKey(Schema.String), diffs: Schema.optionalKey(Schema.String) },
    success: RunDecision,
    error: [Missing, Unjudged],
  }),
) {}
