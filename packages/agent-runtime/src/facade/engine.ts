/**
 * `promiseEngine`: the engine without Effect, the `Engine` service (`service/engine.ts`) of a layer with each verb run as a Promise.
 */
import { Cause, Context, Effect, Exit, Layer, Scope } from 'effect';
import { Engine as EngineService, listRefusalOf, type EngineShape } from '../service/index.ts';
import type { Engine } from './consumer.ts';
import { refusalWords } from '../service/refusal.ts';

/**
 * The engine `layer` gives, in Promises: `promiseEngine(Engine.layer(options))` is the engine over `options` that a consumer uses
 * without writing Effect. The layer is built once, here and at once, and each verb of its `Engine` run as a Promise — a refusal
 * rejected as an `Error` whose `exitCode` is 2 and whose message is led by the verb, `SayUnsent` as an `Error` with its `cause` and no
 * `exitCode`, and a `JournalError` or a `RunnerError` as it failed. `list` handed something other than task ids throws at the call, as
 * it always has. Refused — throws an `Error` whose `exitCode` is 2, led by `promiseEngine` — when the layer fails with
 * `EngineRefused`; any other failure to build it is thrown as it is.
 */
export function promiseEngine<E>(layer: Layer.Layer<EngineService, E>): Engine {
  const built = Effect.runSyncExit(
    Layer.build(layer).pipe(
      Effect.map((context) => Context.get(context, EngineService)),
      Effect.provideService(Scope.Scope, Scope.makeUnsafe()),
    ),
  );
  if (Exit.isFailure(built)) throw refusalWords('promiseEngine')(Cause.squash(built.cause));
  const service: EngineShape = built.value;
  const run = <A, F>(verb: string, e: Effect.Effect<A, F>): Promise<A> => Effect.runPromise(e.pipe(Effect.mapError(refusalWords(verb))));

  return {
    file: (spec) => run('file', service.file(spec)),
    tick: (...args: unknown[]) => run('tick', Reflect.apply(service.tick, service, args) as ReturnType<EngineShape['tick']>),
    admit: (taskIds) => run('admit', service.admit(taskIds)),
    view: (taskId) => run('view', service.view(taskId)),
    path: (taskId) => run('path', service.path(taskId)),
    list: (...args: unknown[]) => {
      const refused = listRefusalOf(args);
      if (refused) throw Object.assign(new Error(`list: ${refused}`), { exitCode: 2 });
      return run('list', service.list(args[0] as readonly string[] | undefined));
    },
    stop: (taskId) => run('stop', service.stop(taskId)),
    logs: (taskId) => run('logs', service.logs(taskId)),
    transcript: (taskId, after) => run('transcript', service.transcript(taskId, after)),
    output: (taskId, stream, lastBytes) => run('output', service.output(taskId, stream, lastBytes)),
    say: (taskId, text) => run('say', service.say(taskId, text)),
    quota: (...args: unknown[]) => run('quota', Reflect.apply(service.quota, service, args) as ReturnType<EngineShape['quota']>),
    answer: (taskId, text, options) => run('answer', service.answer(taskId, text, options)),
    close: (taskId) => run('close', service.close(taskId)),
    feed: (after) => run('feed', service.feed(after)),
    watch: (options) => Effect.runSync(service.watch(options)),
    io: () => Effect.runSync(service.io()),
    start: (options) => Effect.runSync(service.start(options)),
  };
}
