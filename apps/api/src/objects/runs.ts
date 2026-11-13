/**
 * The runs group's handlers (`objects`' `Api`): the runs as a `RunList` (`runList`), across namespaces and in one, or as the `Table` its
 * page prints (`runTable`) where the request asks for one; a run in its namespace (`get`) and across them (`show`), the run object off the
 * app's informer (`runObject`); what is read beside it — its lines (`runLines`), what it concludes (`CONCLUDED`), its record (`SHOW`,
 * raw); its four sub-resources, the entries `tries`, `try`, `closeout` and `told`; a run started (`create`,
 * `runStart`); and the run's named actions, each its body decoded by its endpoint (`objects`' `RunRetry`, `RunApprove`, …) and handed with
 * the path's names to the orchestrator's typed entry `nemia` runs (`RETRY`, `APPROVE`, `ROUTE`, `SAY`, `REFRESH`, `HOLD`, `CANCEL`,
 * `RM`, `PRUNE`, `LABEL_RUN`).
 *
 * A run's namespace is its factory, `default` for one that names none (`runNamespace`): a run read or acted on under another is
 * `Missing`, a 404, as one the store does not list is, and so is a step the run does not have; one a task of which does not read is
 * `Unjudged`, a 502, in the list's words. An action's refusal is the entry's, answered by its kind (`refusedAs`); a failure that is no
 * refusal is a `WriteFailed`, a 502 in its own words, and asking again may work. Every action takes its run out of the app's informer
 * once it has run (`dropInformed`), whatever it did, so the next read judges it again at once. The removal removes a try alone (`RM`'s
 * `onlyTry`), and the removal and the prune fail with what did nothing (`refuses`), which the command line says as a line.
 */
import { Effect } from 'effect';
import {
  APPROVE,
  CANCEL,
  CONCLUDED,
  dropInformed,
  HOLD,
  Informer,
  informerMemo,
  LABEL_RUN,
  PRUNE,
  pruningBytes,
  REFRESH,
  RETRY,
  RM,
  ROUTE,
  runIn,
  runLines,
  runList,
  runObject,
  runTable,
  SAY,
  SHOW,
  type SummaryHow,
  verifiesRest,
} from 'agent-orchestrator';
import { Api, Missing, type RunApprove, type RunPrune, type RunRefresh, type RunRetry, type RunSay, Unjudged, WriteFailed } from 'objects';
import type { Served } from '../layer.ts';
import { workflowPageOf } from '../step/step.ts';
import { findRun, noSuchRun, taskOfStep } from '../store.ts';
import { forgottenOf } from './forgotten.ts';
import { runStart } from '../runs/start.ts';
import { answered, answeredIn, locatedAt, refusedAs, ServedNow } from './refused.ts';
import { wantsTable } from './table.ts';
import { decisionHandler } from '../decide/decide.ts';
import { readsBounded } from './answer-bound.ts';

/**
 * `program` over the app's informer of each run's judgement (`Informer`, the package's), which the store's daemon's pass fills: what the
 * run object and its sub-resources read a run's judgement through, and keep on a miss.
 */
export const informed = <A, E, R>({ informer }: Served, program: Effect.Effect<A, E, R>): Effect.Effect<A, E, R> =>
  Effect.provideService(program, Informer, informer);

/** How a list of the runs judges each: off the app's informer, verified as the env says. */
const howOf = (s: Served): SummaryHow => ({
  home: s.home,
  memo: s.informer ?? informerMemo(),
  verify: verifiesRest(s.env),
});

/** One selector, several, or none, as a list. */
const listOf = (given: string | readonly string[] | undefined): string[] =>
  given === undefined ? [] : typeof given === 'string' ? [given] : [...given];

type ListQuery = {
  readonly limit?: string;
  readonly continue?: string;
  readonly labelSelector?: string | readonly string[];
  readonly selector?: string | readonly string[];
  readonly fieldSelector?: string;
  readonly watch?: string;
};

/**
 * A page of the runs of `namespace` (every run for none) the query asks for, `?selector=` read as `?labelSelector=`: a limit, a token or a
 * selector the package refuses is its `Invalid`, a 422. `?fieldSelector=status.state…` or `status.outcome…` asks the board's list by a
 * field (`runList`). Asked for a `Table` (`wantsTable`), the page's table (`runTable`), the orchestrator's columns and cells; never on a
 * watch, whose events carry the runs themselves.
 */
const page = (namespace: string | undefined, query: ListQuery) =>
  Effect.gen(function* () {
    const listed = yield* answered((s) =>
      s.inRequest(
        informed(
          s,
          runList(s.e, howOf(s), s, {
            namespace,
            limit: query.limit === undefined ? null : Number(query.limit),
            continue: query.continue,
            labelSelector: [...listOf(query.labelSelector), ...listOf(query.selector)],
            fieldSelector: query.fieldSelector,
          }),
        ),
      ),
    );
    return query.watch !== 'true' && (yield* wantsTable) ? runTable(listed) : listed;
  });

/** The run `name`, judged into its object, where it is in `namespace` (none for every namespace): `Missing`, else, or `Unjudged`. */
const one = (name: string, namespace?: string) =>
  Effect.flatMap(
    answered(async (s) => {
      const run = findRun(s.home, name);
      if (!run) return null;
      if (namespace !== undefined) await Effect.runPromise(runIn(run, namespace));
      return s.inRequest(informed(s, runObject(run, s)));
    }),
    (object) =>
      object === null
        ? Effect.fail(new Missing({ error: noSuchRun(name) }))
        : 'unjudged' in object
          ? Effect.fail(new Unjudged({ error: object.unjudged }))
          : Effect.succeed(object),
  );

/** The run `name` the store at `home` has, or `Missing` in the store's words. */
const found = (home: string, name: string) => {
  const run = findRun(home, name);
  if (!run) throw new Missing({ error: noSuchRun(name) });
  return run;
};

/** A run's action's path names: its namespace, the run by the `Api`'s `name`, and its step where it names one. */
type At = { readonly namespace: string; readonly name: string; readonly step?: string };

/**
 * The named action `work` on the run `at` names, in its namespace: the run found (`Missing` where none is, or it is in another namespace,
 * and where it has no step `at.step`), then `work`, the run taken out of the app's informer once it has run (`dropInformed`). A refusal
 * it throws is answered by its kind (`refusedAs`); a failure that is none is a `WriteFailed` in its words. With `unrecorded`, a run the
 * store has no record of is no refusal here: `work` runs all the same, and says what it found (a whole removal, which forgets what was
 * left under the run's id).
 */
const acted = <A>(at: At, work: (s: Served) => Promise<A>, unrecorded = false) =>
  Effect.gen(function* () {
    const s = yield* ServedNow;
    return yield* Effect.tryPromise({
      try: async () => {
        const run = unrecorded ? findRun(s.home, at.name) : found(s.home, at.name);
        if (run) await Effect.runPromise(runIn(run, at.namespace));
        if (at.step !== undefined) {
          const step = taskOfStep(at.name, at.step, s.home);
          if ('error' in step) throw new Missing({ error: step.error });
        }
        try {
          return await work(s);
        } finally {
          if (s.informer) dropInformed(s.informer, at.name);
        }
      },
      catch: (err) => err,
    }).pipe(
      Effect.catch((err) => {
        const refused = refusedAs(err);
        if (refused) return Effect.fail(refused);
        return err instanceof Error ? Effect.fail(new WriteFailed({ error: err.message })) : Effect.die(err);
      }),
    );
  });

/** `value` under `key`, or nothing where it is undefined: a key an answer may leave out is never sent present and undefined. */
const given = <K extends string, V>(key: K, value: V | undefined): Partial<Record<K, V>> =>
  value === undefined ? {} : ({ [key]: value } as Record<K, V>);

/**
 * `value` as JSON says it, a key the orchestrator left undefined dropped: the record is the orchestrator's own object, said by
 * `Schema.Unknown`, which the Api's JSON encoding refuses where a key holds `undefined` (a 500), as `JSON.stringify` never did.
 */
const asJson = <A>(value: A): A => JSON.parse(JSON.stringify(value)) as A;

/** The query of a removal: `whole`, `deleteBranches` and `forceUnmerged`, each asked where it is `true`. */
type RemoveQuery = { readonly whole?: string; readonly deleteBranches?: string; readonly forceUnmerged?: string };

/**
 * A try removed (`nemia rm`, a try alone, its refusals thrown), or with `whole` any run as `nemia rm` removes it, its branches deleted as
 * `deleteBranches` and `forceUnmerged` ask: what the engine forgot of it, and what was done with its worktrees, branches and files
 * (`forgottenOf`), what `nemia rm` prints. A whole removal of a run with no record still forgets what was left under its id, and answers
 * `Missing` in words that say what it removed (`RM`'s `forgetRefusal`).
 */
const removed = (at: At, query: RemoveQuery) =>
  acted(
    at,
    async (s) => {
      const branches = {
        ...(query.deleteBranches === 'true' ? { deleteBranches: true } : {}),
        ...(query.forceUnmerged === 'true' ? { forceUnmerged: true } : {}),
      };
      const asked = { runId: at.name, ...branches, ...(query.whole === 'true' ? {} : { onlyTry: true }), refuses: true };
      const { id, removed, engine, forgot } = await s.inRequest(RM.handler(asked));
      return { id, removed, engine, ...forgottenOf(forgot) };
    },
    query.whole === 'true',
  );

/** The run brought onto its workflow's newest revision or merged with its base (`nemia refresh`): what it asked, its keys given. */
const refreshed = (at: At, payload: RunRefresh) =>
  acted(at, async (s) => {
    const { drift, step, target, onto, sha, round, file, said } = await s.inRequest(REFRESH.handler({ runId: at.name, ...payload }));
    return {
      ...given('drift', drift),
      ...given('step', step),
      ...given('target', target),
      ...given('onto', onto),
      ...given('sha', sha),
      ...given('round', round),
      ...given('file', file),
      ...given('said', said),
    };
  });

/**
 * The run pruned (`nemia prune`, asked once, its refusals thrown): what it let go and what it left; with `preview`, judged and listed with
 * the bytes it would free, nothing removed.
 */
const pruned = (at: At, { preview, ...payload }: RunPrune) =>
  acted(at, async (s) => {
    const done = await s.inRequest(PRUNE.handler({ runId: at.name, ...payload, yes: preview !== true, refuses: true }));
    const { id, lines, worktrees, artifacts, left } = done;
    return { id, pruned: done.pruned, lines, worktrees, artifacts, left, bytes: pruningBytes(done.pruning) };
  });

/** Another try or round of the step `at.step` asked for (`nemia retry`): the file the ask is written to, and what it asked. */
const retried = (at: At & { readonly step: string }, payload: RunRetry) =>
  acted(at, async (s) => {
    const asked = await s.inRequest(RETRY.handler({ runId: at.name, step: at.step, ...payload }));
    return {
      ...given('try', asked.try),
      file: asked.file,
      ...given('stopFirst', asked.stopFirst),
      ...given('step', asked.step),
      ...given('round', asked.round),
      ...given('budget', asked.budget),
      ...given('hint', asked.hint),
    };
  });

/** The step `at.step` approved at its gate (`nemia approve`): the approval written. */
const approved = (at: At & { readonly step: string }, payload: RunApprove) =>
  acted(at, async (s) => {
    const done = await s.inRequest(APPROVE.handler({ runId: at.name, step: at.step, ...payload }));
    const { step, try: tried, at: when, message, file, loop, next, caps } = done;
    return { step, try: tried, at: when, message, file, loop, next, caps };
  });

/**
 * Words said to the step `at.step`'s session (`nemia say`), from the caller the request is (`Served.caller`, by its session token) and
 * who the body says they are from, which the package's program judges: when, to which attempt, what follows them, whether they were
 * kept for a step not filed yet rather than delivered (`kept`), and, where an agent wrote them, which and its words without the frame
 * they were said in.
 */
const said = (at: At & { readonly step: string }, payload: RunSay) =>
  acted(at, async (s) => {
    const done = await s.inRequest(SAY.handler({ runId: at.name, step: at.step, caller: s.caller, ...payload }));
    const { at: when, attempt, text, after } = done;
    const said = { at: when, attempt, text, after, try: done.try, taskId: done.taskId, ...(done.kept ? { kept: done.kept } : {}) };
    return done.from === undefined ? said : { ...said, from: done.from, words: done.words };
  });

export const runsHandlers = readsBounded(Api, 'runs', (handlers) =>
  handlers
    .handle('listAll', ({ query }) => page(undefined, query))
    .handle('list', ({ params: { namespace }, query }) => page(namespace, query))
    .handle('get', ({ params: { namespace, name } }) => one(name, namespace))
    .handle('create', ({ params: { namespace }, payload }) =>
      answeredIn(namespace, (s) => runStart(s, payload)).pipe(Effect.tap(({ id }) => locatedAt(id))),
    )
    .handle('delete', ({ params: { namespace, name }, query }) => removed({ namespace, name }, query))
    .handle('refresh', ({ params: { namespace, name }, payload }) => refreshed({ namespace, name }, payload))
    .handle('prune', ({ params: { namespace, name }, payload }) => pruned({ namespace, name }, payload))
    .handle('labels', ({ params: { namespace, name }, payload }) =>
      acted({ namespace, name }, (s) => s.inRequest(LABEL_RUN.handler({ runId: name, ...payload }))),
    )
    .handle('hold', ({ params: { namespace, name }, payload }) =>
      acted({ namespace, name }, (s) => s.inRequest(HOLD.handler({ runId: name, ...payload, off: false }))),
    )
    .handle('unhold', ({ params: { namespace, name } }) =>
      acted({ namespace, name }, (s) => s.inRequest(HOLD.handler({ runId: name, off: true }))),
    )
    .handle('cancel', ({ params: { namespace, name } }) => acted({ namespace, name }, (s) => s.inRequest(CANCEL.handler({ runId: name }))))
    .handle('retry', ({ params, payload }) => retried(params, payload))
    .handle('approve', ({ params, payload }) => approved(params, payload))
    .handle('route', ({ params, payload: { route } }) =>
      acted(params, (s) => s.inRequest(ROUTE.handler({ runId: params.name, step: params.step, route }))),
    )
    .handle('say', ({ params, payload }) => said(params, payload))
    .handle('show', ({ params: { name } }) => one(name))
    .handle('lines', ({ params: { name } }) =>
      answered(async ({ repo, home }) => {
        const run = found(home, name);
        return { ...runLines(run), workflowPage: workflowPageOf(run, repo, home) };
      }),
    )
    .handle('concluded', ({ params: { name } }) => answered((s) => s.inRequest(CONCLUDED.handler({ runId: name }))))
    .handle('record', ({ params: { name } }) =>
      answered(async (s) => {
        found(s.home, name);
        return asJson(await s.inRequest(SHOW.handler({ runId: name, raw: true })));
      }),
    )
    .handle('decision', ({ params: { runId }, query }) => decisionHandler(runId, query.sensitive, query.diffs)),
);
