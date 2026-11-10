/**
 * The runs group's handlers (`objects`' `Api`): the runs as a `RunList` (`runList`), across namespaces and in one; a run in its namespace
 * (`get`) and across them (`show`), the run object off the app's informer (`runObject`); its four sub-resources, the entries `tries`,
 * `try`, `closeout` and `told`; a run started (`create`, `runStart`); and the run's named actions, each the command of the package's
 * table that `nemia` runs, through the api's one pipeline for a command (`commandAnswered`, commands/routes.ts) — its words, its body,
 * its extension, its check and its refusals as a route the table generates has them.
 *
 * A run's namespace is its factory, `default` for one that names none (`runNamespace`): a run read or acted on under another is
 * `Missing`, a 404, as one the store does not list is; one a task of which does not read is `Unjudged`, a 502, in the list's words.
 * An action reads its body itself (`handleRaw`), so the pipeline refuses it in its route's words — a key it does not take, a key another
 * route takes — as it did on Hono's route: the `Api`'s Schema of each body is the document's, held equal to the pipeline's by the parity
 * test (`run-actions.test.ts`).
 */
import { Effect } from 'effect';
import { HttpApiBuilder } from 'effect/http-api';
import type { HttpServerRequest } from 'effect/http';
import {
  type Command,
  Informer,
  informerMemo,
  type Route,
  routeList,
  runIn,
  runList,
  runObject,
  type SummaryHow,
  verifiesRest,
} from 'agent-orchestrator';
import {
  Api,
  BadRequest,
  Conflict,
  Invalid,
  type Labelled,
  Missing,
  type RunAsked,
  type RunApproved,
  type RunHeld,
  type RunPruned,
  type RunRefreshed,
  type RunRemoved,
  type RunSaid,
  Unjudged,
  WriteFailed,
} from 'objects';
import { commandAnswered, type Params } from '../commands/routes.ts';
import { type Named, runPath } from '../commands/words.ts';
import type { Served } from '../layer.ts';
import { commandNamed, findRun, noSuchRun, runPlaced } from '../store.ts';
import { runStart } from '../workflows/workflows.ts';
import { answered, answeredIn, declaredAs, locatedAt, orFailed } from './refused.ts';

/**
 * `program` over the app's informer of each run's judgement (`Informer`, the package's), which the store's daemon's pass fills: what the
 * run object and its sub-resources read a run's judgement through, and keep on a miss.
 */
export const informed = <A, E, R>({ informer }: Served, program: Effect.Effect<A, E, R>): Effect.Effect<A, E, R> =>
  Effect.provideService(program, Informer, informer);

/** The run object's sub-resources, each a read of the package's table. */
const TRIES = commandNamed('tries');
const TRY = commandNamed('try');
const CLOSEOUT = commandNamed('closeout');
const TOLD = commandNamed('told');

/** What a sub-resource's entry answers for the path's parameters, bound to the argument keys of the same names, as the CLI's flags. */
const subResource = <A>(command: Command, params: Record<string, string>) =>
  answered(async (s) => (await runPlaced(s, s.e, informed(s, command.handler(params, s.env, s.home)))) as A);

/** How a list of the runs judges each: off the app's informer and its feed's filing times, verified as the env says. */
const howOf = (s: Served): SummaryHow => ({
  home: s.home,
  memo: s.informer ?? informerMemo(),
  filings: s.memo.filings,
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
};

/**
 * A page of the runs of `namespace` (every run for none) the query asks for, `?selector=` read as `?labelSelector=`: a limit, a token or a
 * selector the package refuses is its `Invalid`, a 422. `?fieldSelector=status.state…` asks the board's list by state (`runList`).
 */
const page = (namespace: string | undefined, query: ListQuery) =>
  answered((s) =>
    runPlaced(
      s,
      s.e,
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

/** The run `name`, judged into its object, where it is in `namespace` (none for every namespace): `Missing`, else, or `Unjudged`. */
const one = (name: string, namespace?: string) =>
  Effect.flatMap(
    answered(async (s) => {
      const run = findRun(name);
      if (!run) return null;
      if (namespace !== undefined) await Effect.runPromise(runIn(run, namespace));
      return runPlaced(s, s.e, informed(s, runObject(run, s)));
    }),
    (object) =>
      object === null
        ? Effect.fail(new Missing({ error: noSuchRun(name) }))
        : 'unjudged' in object
          ? Effect.fail(new Unjudged({ error: object.unjudged }))
          : Effect.succeed(object),
  );

/** The run's path in the table, its run spelled `:runId` as the table spells it (the `Api` spells it `:name`). */
const RUN = '/api/namespaces/:namespace/runs/:runId';

/** The route of `command` an endpoint serves: its method on its path in the run's namespace, as the package's table has it. */
const routeOf = (command: Command, method: Route['method'], path: string): Route => {
  const found = routeList(command).find((r) => r.method === method && r.path === path);
  if (found === undefined)
    throw new Error(
      `The command '${command.name}' has no route ${method} ${path} in the package's table: give it that route, or serve the endpoint from the route it has.`,
    );
  return found;
};

/** What a run's named action refuses with, as its endpoints declare it (`objects`' `runActionErrors`). */
const ACTION_ERRORS = [BadRequest, Missing, Conflict, Invalid, WriteFailed] as const;

/** A named action: its command, and the route of it the endpoint serves. */
type Action = { readonly command: Command; readonly route: Route };

const action = (name: string, method: Route['method'], path: string): Action => {
  const command = commandNamed(name);
  return { command, route: routeOf(command, method, path) };
};

/** The run's named actions, by the `Api`'s endpoint, each its command's route in the table. */
const ACTIONS = {
  delete: action('rm', 'DELETE', RUN),
  refresh: action('refresh', 'POST', `${RUN}/refresh`),
  prune: action('prune', 'POST', `${RUN}/prune`),
  labels: action('label run', 'POST', `${RUN}/labels`),
  hold: action('hold', 'POST', `${RUN}/hold`),
  unhold: action('hold', 'DELETE', `${RUN}/hold`),
  retry: action('retry', 'POST', `${RUN}/steps/:step/retry`),
  approve: action('approve', 'POST', `${RUN}/steps/:step/approve`),
  say: action('say', 'POST', `${RUN}/steps/:step/say`),
} as const;

/**
 * `data` as JSON says it: a key whose value is undefined left out, as Hono's route answered it — a command's answer names each key the api
 * answers (`answerOf`), and a key of the `Api`'s answer that may be left out is refused present and undefined.
 */
const asJson = (data: Readonly<Record<string, unknown>>): Readonly<Record<string, unknown>> =>
  Object.fromEntries(Object.entries(data).filter(([, value]) => value !== undefined));

/** A run's action's path names: its namespace, the run by the `Api`'s `name`, and its step where it names one. */
type At = { readonly namespace: string; readonly name: string; readonly step?: string };

/** Whether a body's read failed for its size: effect's server error, its reason a parse error of `BodyTooLarge`. */
const tooLarge = (err: unknown): boolean => {
  const reason: unknown = typeof err === 'object' && err !== null && 'reason' in err ? err.reason : undefined;
  return typeof reason === 'object' && reason !== null && 'reason' in reason && reason.reason === 'BodyTooLarge';
};

/**
 * The text `request` sent as its body, or none where it did not read: the pipeline answers that as a body that is no JSON. A body over
 * the objects' limit (`OBJECT_BODY_LIMIT`, serve.ts) is effect's own failure, left to answer its 413, as every object's write is.
 */
const sentBy = (request: HttpServerRequest.HttpServerRequest): Effect.Effect<string | undefined> =>
  Effect.catch(request.text, (err) => (tooLarge(err) ? Effect.die(err) : Effect.succeed(undefined)));

/**
 * The named action `act` on the run `at` names, in its namespace: the run found (`Missing` where none is, or it is in another namespace),
 * then the command's pipeline (`commandAnswered`) over the path's names by the table's route and the body `text`; its answer with its
 * `hint`, or its refusal as the `Api`'s error its endpoint declares of its status (`declaredAs`). A refusal of the package's it throws is
 * answered by its kind.
 */
const acted = <A>({ command, route }: Action, at: At, method: string, text: string | undefined) =>
  answered(async (s): Promise<A> => {
    const run = findRun(at.name);
    if (!run) throw new Missing({ error: noSuchRun(at.name) });
    await Effect.runPromise(runIn(run, at.namespace));
    const params: Params = { namespace: at.namespace, runId: at.name, ...(at.step === undefined ? {} : { step: at.step }) };
    const named: Named = {
      runId: at.name,
      step: at.step ?? '',
      name: '',
      factory: '',
      namespace: at.namespace,
      method,
      path: `${runPath({ namespace: at.namespace, runId: at.name })}${route.path.slice(RUN.length).replace(':step', at.step ?? '')}`,
    };
    const answer = await commandAnswered(command, route, named, params, async () => text ?? Promise.reject(new Error('no body')), s);
    if ('status' in answer) throw declaredAs(ACTION_ERRORS, answer);
    return asJson(answer.hint === undefined ? answer.data : { ...answer.data, hint: answer.hint }) as A;
  });

/** An action with a body: its text read off the request, then `acted`. */
const withBody =
  <A>(act: Action) =>
  ({ params, request }: { readonly params: At; readonly request: HttpServerRequest.HttpServerRequest }) =>
    Effect.flatMap(sentBy(request), (text) => acted<A>(act, params, request.method, text));

export const runsHandlers = HttpApiBuilder.group(Api, 'runs', (handlers) =>
  handlers
    .handle('listAll', ({ query }) => page(undefined, query))
    .handle('list', ({ params: { namespace }, query }) => page(namespace, query))
    .handle('get', ({ params: { namespace, name } }) => one(name, namespace))
    .handleRaw('create', ({ params: { namespace }, request }) =>
      Effect.flatMap(sentBy(request), (text) =>
        answeredIn(
          namespace,
          orFailed(async (s) => {
            const started = await runStart(s, namespace, text);
            if ('status' in started) throw declaredAs(ACTION_ERRORS, started);
            return started;
          }),
        ).pipe(Effect.tap((started) => ('id' in started && typeof started.id === 'string' ? locatedAt(started.id) : Effect.void))),
      ),
    )
    .handle('delete', ({ params, request }) => acted<RunRemoved>(ACTIONS.delete, params, request.method, undefined))
    .handle('unhold', ({ params, request }) => acted<RunHeld>(ACTIONS.unhold, params, request.method, undefined))
    .handleRaw('refresh', withBody<RunRefreshed>(ACTIONS.refresh))
    .handleRaw('prune', withBody<RunPruned>(ACTIONS.prune))
    .handleRaw('labels', withBody<Labelled>(ACTIONS.labels))
    .handleRaw('hold', withBody<RunHeld>(ACTIONS.hold))
    .handleRaw('retry', withBody<RunAsked>(ACTIONS.retry))
    .handleRaw('approve', withBody<RunApproved>(ACTIONS.approve))
    .handleRaw('say', withBody<RunSaid>(ACTIONS.say))
    .handle('show', ({ params: { runId } }) => one(runId))
    .handle('tries', ({ params }) => subResource(TRIES, params))
    .handle('try', ({ params }) => subResource(TRY, params))
    .handle('closeout', ({ params }) => subResource(CLOSEOUT, params))
    .handle('told', ({ params }) => subResource(TOLD, params)),
);
