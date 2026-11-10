/**
 * The runs group's handlers (`objects`' `Api`): the runs as a `RunList` (`runList`), across namespaces and in one, or as the `Table` its
 * page prints (`runTable`) where the request asks for one; a run in its namespace (`get`) and across them (`show`), the run object off the
 * app's informer (`runObject`); what is read beside it — its lines (`runLines`), what it concludes (`CONCLUDED`), its record (`SHOW`,
 * raw), `nemia ls`'s listing (`LS`); its four sub-resources, the entries `tries`, `try`, `closeout` and `told`; a run started (`create`,
 * `runStart`); and the run's named actions, each its body decoded by its endpoint (`objects`' `RunRetry`, `RunApprove`, …) and handed with
 * the path's names to the orchestrator's typed entry `nemia` runs (`RETRY`, `APPROVE`, `SAY`, `REFRESH`, `HOLD`, `RM`, `PRUNE`,
 * `LABEL_RUN`).
 *
 * A run's namespace is its factory, `default` for one that names none (`runNamespace`): a run read or acted on under another is
 * `Missing`, a 404, as one the store does not list is, and so is a step the run does not have; one a task of which does not read is
 * `Unjudged`, a 502, in the list's words. An action's refusal is the entry's, answered by its kind (`refusedAs`); a failure that is no
 * refusal is a `WriteFailed`, a 502 in its own words, and asking again may work. Every action takes its run out of the app's informer
 * once it has run (`dropInformed`), whatever it did, so the next read judges it again at once. The removal removes a try alone (`RM`'s
 * `onlyTry`), and the removal and the prune fail with what did nothing (`refuses`), which the command line says as a line.
 */
import { Effect } from 'effect';
import { HttpApiBuilder } from 'effect/http-api';
import {
  APPROVE,
  CONCLUDED,
  dropInformed,
  HOLD,
  Informer,
  informerMemo,
  LABEL_RUN,
  LS,
  PRUNE,
  REFRESH,
  RETRY,
  RM,
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
import { runStart } from '../runs/index.ts';
import { answered, answeredIn, locatedAt, refusedAs, ServedNow } from './refused.ts';
import { wantsTable } from './table.ts';
import { decisionHandler } from '../decide/decide.ts';

/**
 * `program` over the app's informer of each run's judgement (`Informer`, the package's), which the store's daemon's pass fills: what the
 * run object and its sub-resources read a run's judgement through, and keep on a miss.
 */
export const informed = <A, E, R>({ informer }: Served, program: Effect.Effect<A, E, R>): Effect.Effect<A, E, R> =>
  Effect.provideService(program, Informer, informer);

/** How a list of the runs judges each: off the app's informer and its feed's filing times, verified as the env says. */
const howOf = (s: Served): SummaryHow => ({
  home: s.home,
  memo: s.informer ?? informerMemo(),
  filings: s.memo.filings,
  verify: verifiesRest(s.env),
});

/** A selector given once, several times, or not at all. */
type Listed = string | readonly string[] | undefined;

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
 * selector the package refuses is its `Invalid`, a 422. `?fieldSelector=status.state…` asks the board's list by state (`runList`). Asked
 * for a `Table` (`wantsTable`), the page's table (`runTable`), the orchestrator's columns and cells; never on a watch, whose events carry
 * the runs themselves.
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
      const run = findRun(name);
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

/** The run `name` the store has, or `Missing` in the store's words. */
const found = (name: string) => {
  const run = findRun(name);
  if (!run) throw new Missing({ error: noSuchRun(name) });
  return run;
};

/** A run's action's path names: its namespace, the run by the `Api`'s `name`, and its step where it names one. */
type At = { readonly namespace: string; readonly name: string; readonly step?: string };

/**
 * The named action `work` on the run `at` names, in its namespace: the run found (`Missing` where none is, or it is in another namespace,
 * and where it has no step `at.step`), then `work`, the run taken out of the app's informer once it has run (`dropInformed`). A refusal
 * it throws is answered by its kind (`refusedAs`); a failure that is none is a `WriteFailed` in its words.
 */
const acted = <A>(at: At, work: (s: Served) => Promise<A>) =>
  Effect.gen(function* () {
    const s = yield* ServedNow;
    return yield* Effect.tryPromise({
      try: async () => {
        const run = found(at.name);
        await Effect.runPromise(runIn(run, at.namespace));
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
 * `value` as JSON says it, a key the orchestrator left undefined dropped: the record and the listing are the orchestrator's own objects,
 * said by `Schema.Unknown`, which the Api's JSON encoding refuses where a key holds `undefined` (a 500), as `JSON.stringify` never did.
 */
const asJson = <A>(value: A): A => JSON.parse(JSON.stringify(value)) as A;

/**
 * The selectors a listing is asked for, under either spelling, under the key `nemia ls`'s entry reads them (`selector`), or none where
 * none was given.
 */
const selected = ({ labelSelector, selector }: { readonly labelSelector?: Listed; readonly selector?: Listed }) => {
  const selectors = [...listOf(labelSelector), ...listOf(selector)];
  return selectors.length ? { selector: selectors } : {};
};

/** A try removed (`nemia rm`, a try alone, its refusals thrown): what the engine forgot of it. */
const removed = (at: At) =>
  acted(at, async (s) => {
    const { id, removed, engine } = await s.inRequest(RM.handler({ runId: at.name, onlyTry: true, refuses: true }, s.env, s.home));
    return { id, removed, engine };
  });

/** The run brought onto its workflow's newest revision or merged with its base (`nemia refresh`): what it asked, its keys given. */
const refreshed = (at: At, payload: RunRefresh) =>
  acted(at, async (s) => {
    const { drift, step, target, onto, sha, round, file } = await s.inRequest(
      REFRESH.handler({ runId: at.name, ...payload }, s.env, s.home),
    );
    return {
      ...given('drift', drift),
      ...given('step', step),
      ...given('target', target),
      ...given('onto', onto),
      ...given('sha', sha),
      ...given('round', round),
      ...given('file', file),
    };
  });

/** The run pruned (`nemia prune`, asked once, its refusals thrown): what it let go and what it left. */
const pruned = (at: At, payload: RunPrune) =>
  acted(at, async (s) => {
    const done = await s.inRequest(PRUNE.handler({ runId: at.name, ...payload, yes: true, refuses: true }, s.env, s.home));
    const { id, lines, worktrees, artifacts, left } = done;
    return { id, pruned: done.pruned, lines, worktrees, artifacts, left };
  });

/** Another try or round of the step `at.step` asked for (`nemia retry`): the file the ask is written to, and what it asked. */
const retried = (at: At & { readonly step: string }, payload: RunRetry) =>
  acted(at, async (s) => {
    const asked = await s.inRequest(RETRY.handler({ runId: at.name, step: at.step, ...payload }, s.env, s.home));
    return {
      ...given('try', asked.try),
      file: asked.file,
      ...given('stopFirst', asked.stopFirst),
      ...given('step', asked.step),
      ...given('round', asked.round),
      ...given('hint', asked.hint),
    };
  });

/** The step `at.step` approved at its gate (`nemia approve`): the approval written. */
const approved = (at: At & { readonly step: string }, payload: RunApprove) =>
  acted(at, async (s) => {
    const done = await s.inRequest(APPROVE.handler({ runId: at.name, step: at.step, ...payload }, s.env, s.home));
    return { step: done.step, try: done.try, at: done.at, message: done.message, file: done.file };
  });

/** Words said to the step `at.step`'s session (`nemia say`): when, to which attempt, and what follows them. */
const said = (at: At & { readonly step: string }, payload: RunSay) =>
  acted(at, async (s) => {
    const { at: when, attempt, text, after } = await s.inRequest(SAY.handler({ runId: at.name, step: at.step, ...payload }, s.env, s.home));
    return { at: when, attempt, text, after };
  });

export const runsHandlers = HttpApiBuilder.group(Api, 'runs', (handlers) =>
  handlers
    .handle('listAll', ({ query }) => page(undefined, query))
    .handle('list', ({ params: { namespace }, query }) => page(namespace, query))
    .handle('get', ({ params: { namespace, name } }) => one(name, namespace))
    .handle('create', ({ params: { namespace }, payload }) =>
      answeredIn(namespace, (s) => runStart(s, payload)).pipe(Effect.tap(({ id }) => locatedAt(id))),
    )
    .handle('delete', ({ params: { namespace, name } }) => removed({ namespace, name }))
    .handle('refresh', ({ params: { namespace, name }, payload }) => refreshed({ namespace, name }, payload))
    .handle('prune', ({ params: { namespace, name }, payload }) => pruned({ namespace, name }, payload))
    .handle('labels', ({ params: { namespace, name }, payload }) =>
      acted({ namespace, name }, (s) => s.inRequest(LABEL_RUN.handler({ runId: name, ...payload }, s.env, s.home))),
    )
    .handle('hold', ({ params: { namespace, name }, payload }) =>
      acted({ namespace, name }, (s) => s.inRequest(HOLD.handler({ runId: name, ...payload, off: false }, s.env, s.home))),
    )
    .handle('unhold', ({ params: { namespace, name } }) =>
      acted({ namespace, name }, (s) => s.inRequest(HOLD.handler({ runId: name, off: true }, s.env, s.home))),
    )
    .handle('retry', ({ params, payload }) => retried(params, payload))
    .handle('approve', ({ params, payload }) => approved(params, payload))
    .handle('say', ({ params, payload }) => said(params, payload))
    .handle('show', ({ params: { name } }) => one(name))
    .handle('lines', ({ params: { name } }) =>
      answered(async ({ repo, home }) => {
        const run = found(name);
        return { ...runLines(run), workflowPage: workflowPageOf(run, repo, home) };
      }),
    )
    .handle('concluded', ({ params: { name } }) => answered((s) => s.inRequest(CONCLUDED.handler({ runId: name }, s.env, s.home))))
    .handle('record', ({ params: { name } }) =>
      answered(async (s) => {
        found(name);
        return asJson(await s.inRequest(SHOW.handler({ runId: name, raw: true }, s.env, s.home)));
      }),
    )
    .handle('listing', ({ query }) =>
      answered(async (s) => asJson(await s.inRequest(informed(s, LS.handler(selected(query), s.env, s.home))))),
    )
    .handle('listingOne', ({ params: { name }, query }) =>
      answered(async (s) => asJson(await s.inRequest(informed(s, LS.handler({ runId: name, ...selected(query) }, s.env, s.home))))),
    )
    .handle('decision', ({ params: { runId } }) => decisionHandler(runId)),
);
