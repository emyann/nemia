/**
 * The Run's group of the `Api` (`RunsGroup`): the run object, listed across namespaces and in one — as a `RunList`, or as a `Table` asked
 * for — read in its namespace and across all by its name, what is read beside it (its lines, what it concludes, its record), and its
 * named actions in its namespace alone, each body a Schema that decodes. Served by the api's runs handlers
 * (`apps/api/src/objects/runs.ts`).
 */
import { Schema } from 'effect';
import { HttpApiEndpoint, HttpApiGroup, OpenApi } from 'effect/http-api';
import { BadRequest, Conflict, Forbidden, Invalid, listQuery, Missing, Unjudged, WriteFailed } from './api-errors.ts';
import { Table } from './table.ts';
import { Concluded, RunLines, RunRecord } from './run-reads.ts';
import { LabelEdit, Labelled } from './labels.ts';
import { Run, RunList } from './run.ts';
import { RunDecision } from './decide.ts';
import {
  RunApprove,
  RunApproved,
  RunAsked,
  RunCancelled,
  RunConditionWrite,
  RunConditionWritten,
  RunAssign,
  RunAssigned,
  RunHeld,
  RunHold,
  RunPrune,
  RunPruned,
  RunRefresh,
  RunRefreshed,
  RunRemoved,
  RunRetry,
  RunRoute,
  RunRouted,
  RunSaid,
  RunSay,
  RunStart,
  RunStarted,
} from './run-actions.ts';

/**
 * The query of a list of runs: a list's (`listQuery`), and `fieldSelector`, the runs in one state, in Kubernetes' spelling:
 * `status.state=<state>` (or `==`), or `status.state!=<state>`, a state of `RUN_STATES`; or the finished runs of one outcome,
 * `status.outcome=<outcome>` (or `==`), or every other run, `status.outcome!=<outcome>`, an outcome of `RUN_OUTCOMES`; one term. Kept
 * as its text, so a
 * wrong one is refused in the package's words, a 422. A list asked by it carries the frame's parts (`RunStatus`, `RunListMeta`).
 */
const runListQuery = {
  ...listQuery,
  fieldSelector: Schema.optionalKey(
    Schema.String.annotate({
      description:
        'The runs in one state or outcome, as one term: status.state=<state> or status.state!=<state>, status.outcome=<outcome> or status.outcome!=<outcome>.',
    }),
  ),
};

/** What a list of runs answers: the `RunList`, or, asked with `TABLE_ACCEPT`, the `Table` of its page (never on a watch). */
const runListed = Schema.Union([RunList, Table]);

/** A run, by its name. */
const nameParams = {
  name: Schema.String.annotate({ description: "The run's name, found among the runs the store lists in any namespace." }),
};

/** A namespace, for a list in it. */
const namespaceParams = {
  namespace: Schema.String.annotate({ description: "The namespace, a run's factory (default for one that names none)." }),
};

/** What a run's reads refuse with: none by that name, a query the package refuses, a run not judged. */
const runReadErrors = [Missing, Invalid, Unjudged];

/**
 * What a run's named actions refuse with: a body or a name read wrong, none there, a state that forbids it, its check, and a failure
 * under it.
 */
const runActionErrors = [BadRequest, Missing, Conflict, Invalid, WriteFailed];

/**
 * The query of a run's removal, each asked where it is `true`, as a decision's `diffs` is: `whole`, a run of a workflow removed as `nemia
 * rm` removes it — its worktrees removed through git, what one held uncommitted committed first, its branches kept — where left out a try
 * alone is removed (a run started from an agent's page, any other refused); `deleteBranches`, its branches merged into its base deleted
 * too; `forceUnmerged` beside it, the others too, with their work.
 */
const removeQuery = {
  whole: Schema.optionalKey(
    Schema.String.annotate({
      description:
        'true to remove a run of a workflow as nemia rm does, its worktrees removed through git and its branches kept; left out, only a try is removed.',
    }),
  ),
  deleteBranches: Schema.optionalKey(Schema.String.annotate({ description: 'true to delete its branches merged into its base too.' })),
  forceUnmerged: Schema.optionalKey(
    Schema.String.annotate({ description: 'true, beside deleteBranches, to delete the unmerged ones too, with their work.' }),
  ),
};

/** A run, by its namespace and its name. */
const runParams = { ...namespaceParams, name: Schema.String.annotate({ description: "The run's name." }) };

/** A step of a run, by the run's namespace and name and the step's. */
const runStepParams = { ...runParams, step: Schema.String.annotate({ description: "The step's name." }) };

/** A condition of a step, by its name. */
const runConditionParams = {
  ...runStepParams,
  condition: Schema.String.annotate({ description: "The condition's name, one a check of the step waits on in its condition:." }),
};

/** An action's answer, taken and not yet done: a 202. */
const takenLater = <S extends Schema.Top>(answer: S) => answer.pipe(Schema.annotate({ httpApiStatus: 202 }));

/**
 * The run object, listed across namespaces (`/api/runs`) and in one, read in one and across all by its name (`/api/runs/:name`), what is
 * read beside it; and its named actions, each in its namespace alone: started, removed — a try alone, a run started
 * from an agent's page, any other being `nemia rm`'s — refreshed, pruned, its labels edited, held and its hold lifted, and a step of it
 * tried again, approved, routed — a condition's route given by hand — and said words to. A run's namespace is its factory, `default`
 * for one that names none: a run addressed under another is `Missing`. A start in `default` is placed in the factory whose repository
 * holds the folder `?repo=` names; with none it is refused, naming `?factory=`.
 */
export class RunsGroup extends HttpApiGroup.make('runs').add(
  HttpApiEndpoint.get('listAll', '/api/runs', { query: runListQuery, success: runListed, error: runReadErrors }).annotate(
    OpenApi.Description,
    'Lists the runs of every namespace, a page at a time, each judged into its run object; ?labelSelector= and ?fieldSelector= keep those that match. Answers a RunList, or the same page as a Table where the request asks for one.',
  ),
  HttpApiEndpoint.get('list', '/api/namespaces/:namespace/runs', {
    params: namespaceParams,
    query: runListQuery,
    success: runListed,
    error: runReadErrors,
  }).annotate(
    OpenApi.Description,
    'Lists the runs of one namespace (a factory, default for runs that name none), a page at a time, each judged into its run object; ?labelSelector= and ?fieldSelector= keep those that match. Answers a RunList, or the same page as a Table where the request asks for one.',
  ),
  HttpApiEndpoint.get('get', '/api/namespaces/:namespace/runs/:name', { params: runParams, success: Run, error: runReadErrors }).annotate(
    OpenApi.Description,
    'Reads one run by its name in its namespace, judged into the run object. Answers the Run; a run in another namespace is Missing, and one whose tasks do not all read is Unjudged.',
  ),
  HttpApiEndpoint.post('create', '/api/namespaces/:namespace/runs', {
    params: namespaceParams,
    query: {
      repo: Schema.optionalKey(
        Schema.String.annotate({
          description: 'The folder whose repository holds the factory that places the run, for a start in default.',
        }),
      ),
    },
    payload: RunStart,
    success: RunStarted.pipe(Schema.annotate({ httpApiStatus: 201 })),
    error: runActionErrors,
  }).annotate(
    OpenApi.Description,
    "Starts a run of a workflow in the namespace's factory, from the RunStart body; in default, the factory whose repository holds the folder ?repo= names places it. Answers RunStarted with a 201, the new run's address in Location.",
  ),
  HttpApiEndpoint.delete('delete', '/api/namespaces/:namespace/runs/:name', {
    params: runParams,
    query: removeQuery,
    success: RunRemoved,
    error: runActionErrors,
  }).annotate(
    OpenApi.Description,
    "Removes a try, a run started from an agent's page; with whole=true, any run as a whole: its worktrees removed through git, its branches kept unless deleteBranches asks. Answers RunRemoved: what the engine forgot of it and what became of its worktrees, branches and files.",
  ),
  HttpApiEndpoint.post('refresh', '/api/namespaces/:namespace/runs/:name/refresh', {
    params: runParams,
    payload: RunRefresh,
    success: takenLater(RunRefreshed),
    error: runActionErrors,
  }).annotate(
    OpenApi.Description,
    "Brings the run onto its workflow's newest revision, or merges its base into its branch, as the RunRefresh body asks. Answers RunRefreshed with a 202: the drift it found, or the merge it asked of the looping step.",
  ),
  HttpApiEndpoint.post('prune', '/api/namespaces/:namespace/runs/:name/prune', {
    params: runParams,
    payload: RunPrune,
    success: RunPruned,
    error: runActionErrors,
  }).annotate(
    OpenApi.Description,
    'Lets go of what a run no longer needs: its lines, its worktrees and its files, keeping what cannot go yet with why; with preview, lists what it would free and removes nothing. Answers RunPruned.',
  ),
  HttpApiEndpoint.post('labels', '/api/namespaces/:namespace/runs/:name/labels', {
    params: runParams,
    payload: LabelEdit,
    success: Labelled,
    error: runActionErrors,
  }).annotate(
    OpenApi.Description,
    "Edits the run's labels: sets and removes the keys the LabelEdit body names. Answers Labelled, the labels the run holds after it.",
  ),
  HttpApiEndpoint.post('hold', '/api/namespaces/:namespace/runs/:name/hold', {
    params: runParams,
    payload: RunHold,
    success: RunHeld,
    error: runActionErrors,
  }).annotate(
    OpenApi.Description,
    'Puts a hold on the run, until the runs the body names land or, naming none, until a person lifts it, recording who put it. Answers RunHeld.',
  ),
  HttpApiEndpoint.delete('unhold', '/api/namespaces/:namespace/runs/:name/hold', {
    params: runParams,
    success: RunHeld,
    error: runActionErrors,
  }).annotate(OpenApi.Description, "Lifts the run's hold now, recording who lifted it. Answers RunHeld, lifted."),
  HttpApiEndpoint.post('assign', '/api/namespaces/:namespace/runs/:name/assignee', {
    params: runParams,
    payload: RunAssign,
    success: RunAssigned,
    error: runActionErrors,
  }).annotate(
    OpenApi.Description,
    'Puts the run in the hand the body names, or the caller’s: what it asks of a person is theirs to answer until given back, the run is over, or an ask waits past their time. Answers RunAssigned.',
  ),
  HttpApiEndpoint.delete('unassign', '/api/namespaces/:namespace/runs/:name/assignee', {
    params: runParams,
    success: RunAssigned,
    error: runActionErrors,
  }).annotate(OpenApi.Description, 'Gives the run back now, recording who gave it back. Answers RunAssigned, ended.'),
  HttpApiEndpoint.post('cancel', '/api/namespaces/:namespace/runs/:name/cancel', {
    params: runParams,
    success: RunCancelled,
    error: runActionErrors,
  }).annotate(
    OpenApi.Description,
    'Calls the run off: asks every task it has in flight to stop, and files nothing more of it. Answers RunCancelled, the plan it followed, a run already over included.',
  ),
  HttpApiEndpoint.post('retry', '/api/namespaces/:namespace/runs/:name/steps/:step/retry', {
    params: runStepParams,
    payload: RunRetry,
    success: takenLater(RunAsked),
    error: runActionErrors,
  }).annotate(
    OpenApi.Description,
    "Asks for another try or round of the step, written as a file the next pass acts on. Answers RunAsked with a 202: the ask's file and what it asked for.",
  ),
  HttpApiEndpoint.post('approve', '/api/namespaces/:namespace/runs/:name/steps/:step/approve', {
    params: runStepParams,
    payload: RunApprove,
    success: takenLater(RunApproved),
    error: runActionErrors,
  }).annotate(
    OpenApi.Description,
    'Approves the step at its gate, recording who gave the approval; with off, takes the approval back. Answers RunApproved with a 202: the approval written, its file and what follows it.',
  ),
  HttpApiEndpoint.post('route', '/api/namespaces/:namespace/runs/:name/steps/:step/route', {
    params: runStepParams,
    payload: RunRoute,
    success: RunRouted,
    error: runActionErrors,
  }).annotate(
    OpenApi.Description,
    "Gives a condition step's route by hand, for its try that stands. Answers RunRouted: the condition, its try, the route and its file; the next pass files the steps whose when: names the route.",
  ),
  HttpApiEndpoint.put('condition', '/api/namespaces/:namespace/runs/:name/steps/:step/conditions/:condition', {
    params: runConditionParams,
    payload: RunConditionWrite,
    success: RunConditionWritten,
    error: [...runActionErrors, Forbidden],
  }).annotate(
    OpenApi.Description,
    "Writes a condition a check of the step waits on, for the try the step is on: True lets the step go on, False refuses it as a failed check is, Unknown leaves it waiting. Refused to the step's own session (403), for a condition the step does not wait on (422) and for another try (409). Answers RunConditionWritten: the condition as it stands.",
  ),
  HttpApiEndpoint.post('say', '/api/namespaces/:namespace/runs/:name/steps/:step/say', {
    params: runStepParams,
    payload: RunSay,
    success: takenLater(RunSaid),
    error: runActionErrors,
  }).annotate(
    OpenApi.Description,
    "Says words to the step's session, from the caller and who the body says they are from; words for a step not filed yet are kept for it. Answers RunSaid with a 202: when they were taken, by which attempt, and what follows them.",
  ),
  HttpApiEndpoint.get('show', '/api/runs/:name', { params: nameParams, success: Run, error: runReadErrors }).annotate(
    OpenApi.Description,
    'Reads one run by its name in any namespace, judged into the run object. Answers the Run; one whose tasks do not all read is Unjudged.',
  ),
  HttpApiEndpoint.get('lines', '/api/runs/:name/lines', { params: nameParams, success: RunLines, error: [Missing] }).annotate(
    OpenApi.Description,
    "Reads the lines kept beside the run object: its decide and refresh lines, each step's, the card it came from and its workflow's page address. Answers RunLines, constant for a run.",
  ),
  HttpApiEndpoint.get('concluded', '/api/runs/:name/concluded', {
    params: nameParams,
    success: Concluded,
    error: [Missing, Invalid],
  }).annotate(
    OpenApi.Description,
    'Reads what a run started now with this run as context would be handed: whether it has landed, and its ## From run section. Answers Concluded.',
  ),
  HttpApiEndpoint.get('record', '/api/runs/:name/record', { params: nameParams, success: RunRecord, error: [Missing, Invalid] }).annotate(
    OpenApi.Description,
    "Reads the run's record as the store keeps it, its brief and each frozen step's body cut short. Answers RunRecord.",
  ),
  HttpApiEndpoint.get('decision', '/api/runs/:runId/decision', {
    params: { runId: Schema.String.annotate({ description: "The run's id." }) },
    query: {
      sensitive: Schema.optionalKey(
        Schema.String.annotate({
          description:
            'Comma-separated globs whose changed files the decision shows in full (nemia decide --sensitive); else the `radius.checkAffecting` of its factory, none where it sets none.',
        }),
      ),
      diffs: Schema.optionalKey(
        Schema.String.annotate({
          description:
            "Comma-separated paths whose diffs it answers whole, * for every one; every other file's lines are left out, its path and counts kept. Not given, no diff is answered whole.",
        }),
      ),
    },
    success: RunDecision,
    error: [Missing, Unjudged],
  }).annotate(
    OpenApi.Description,
    'Reads what there is to decide of the run: what it changed, its checks, its reviews, its cost and the questions waiting on you, or why there is nothing yet (waiting, holding, running). Answers RunDecision, the files ?sensitive= names shown in full and the diffs ?diffs= names whole.',
  ),
) {}
