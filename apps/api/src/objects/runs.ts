/**
 * The runs group's handlers (`objects`' `Api`): the run object and its four sub-resources, each the package program Hono's route ran
 * before it (`runObject` off the app's informer, and the entries `tries`, `try`, `closeout` and `told`), over the request's services.
 * A run the store does not list is `Missing`, a 404; one a task of which does not read is `Unjudged`, a 502, in the list's words.
 */
import { Effect } from 'effect';
import { HttpApiBuilder } from 'effect/http-api';
import { type Command, Informer, runObject } from 'agent-orchestrator';
import { Api, Missing, Unjudged } from 'objects';
import type { Served } from '../layer.ts';
import { commandNamed, findRun, noSuchRun, runPlaced } from '../store.ts';
import { answered } from './refused.ts';

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

export const runsHandlers = HttpApiBuilder.group(Api, 'runs', (handlers) =>
  handlers
    .handle('show', ({ params: { runId } }) =>
      Effect.flatMap(
        answered(async (s) => {
          const run = findRun(runId);
          return run ? runPlaced(s, s.e, informed(s, runObject(run, s))) : null;
        }),
        (object) =>
          object === null
            ? Effect.fail(new Missing({ error: noSuchRun(runId) }))
            : 'unjudged' in object
              ? Effect.fail(new Unjudged({ error: object.unjudged }))
              : Effect.succeed(object),
      ),
    )
    .handle('tries', ({ params }) => subResource(TRIES, params))
    .handle('try', ({ params }) => subResource(TRY, params))
    .handle('closeout', ({ params }) => subResource(CLOSEOUT, params))
    .handle('told', ({ params }) => subResource(TOLD, params)),
);
