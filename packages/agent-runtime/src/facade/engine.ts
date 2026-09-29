/**
 * `createEngine`: the engine without Effect, the `Engine` service (`service/engine.ts`) with each verb run as a Promise
 * (`promiseEngine`).
 */
import { Cause, Context, Effect, Exit, Layer, Scope } from 'effect';
import { Engine as EngineService, listRefusalOf, type EngineShape } from '../service/index.ts';
import type { Engine, EngineOptions } from './consumer.ts';

/** The tags of the verbs' refusals: each rejects at this door as an `Error` whose `exitCode` is 2, its message led by the verb. */
const REFUSALS = new Set([
  'FileRefused',
  'TickRefused',
  'AdmitRefused',
  'InputRefused',
  'ListRefused',
  'TranscriptRefused',
  'SayRefused',
  'EngineRefused',
]);

/** What `verb` rejects with at this door for `e`, what its Effect failed with: a refusal or `SayUnsent` in words, anything else as it is. */
const plainOf =
  (verb: string) =>
  (e: unknown): unknown => {
    const { _tag, message, cause } = (e ?? {}) as { _tag?: unknown; message?: unknown; cause?: unknown };
    if (typeof _tag !== 'string' || typeof message !== 'string') return e;
    if (REFUSALS.has(_tag)) return Object.assign(new Error(`${verb}: ${message}`), { exitCode: 2 });
    if (_tag === 'SayUnsent') return new Error(`${verb}: ${message}`, cause === undefined ? undefined : { cause });
    return e;
  };

/**
 * The engine `layer` gives, in Promises: the layer built once, here and at once, and each verb of its `Engine` run as a Promise — a
 * refusal rejected as an `Error` whose `exitCode` is 2 and whose message is led by the verb, `SayUnsent` as an `Error` with its `cause`
 * and no `exitCode`, and a `JournalError` or a `RunnerError` as it failed. `list` handed something other than task ids throws at the
 * call, as it always has. Refused — throws an `Error` whose `exitCode` is 2, led by `createEngine` — when the layer fails with
 * `EngineRefused`; any other failure to build it is thrown as it is.
 */
export function promiseEngine<E>(layer: Layer.Layer<EngineService, E>): Engine {
  const built = Effect.runSyncExit(
    Layer.build(layer).pipe(
      Effect.map((context) => Context.get(context, EngineService)),
      Effect.provideService(Scope.Scope, Scope.makeUnsafe()),
    ),
  );
  if (Exit.isFailure(built)) throw plainOf('createEngine')(Cause.squash(built.cause));
  const service: EngineShape = built.value;
  const run = <A, F>(verb: string, e: Effect.Effect<A, F>): Promise<A> => Effect.runPromise(e.pipe(Effect.mapError(plainOf(verb))));

  return {
    file: (spec) => run('file', service.file(spec)),
    tick: (...args: unknown[]) => run('tick', Reflect.apply(service.tick, service, args) as ReturnType<EngineShape['tick']>),
    admit: (taskIds) => run('admit', service.admit(taskIds)),
    view: (taskId) => run('view', service.view(taskId)),
    list: (...args: unknown[]) => {
      const refused = listRefusalOf(args);
      if (refused) throw Object.assign(new Error(`list: ${refused}`), { exitCode: 2 });
      return run('list', service.list(args[0] as readonly string[] | undefined));
    },
    stop: (taskId) => run('stop', service.stop(taskId)),
    logs: (taskId) => run('logs', service.logs(taskId)),
    transcript: (taskId, after) => run('transcript', service.transcript(taskId, after)),
    say: (taskId, text) => run('say', service.say(taskId, text)),
    answer: (taskId, text, options) => run('answer', service.answer(taskId, text, options)),
    close: (taskId) => run('close', service.close(taskId)),
    feed: (after) => run('feed', service.feed(after)),
    watch: (options) => Effect.runSync(service.watch(options)),
    io: () => Effect.runSync(service.io()),
    start: (options) => Effect.runSync(service.start(options)),
  };
}

/**
 * An engine over `options`, as `Engine.layer` builds it (`service/engine.ts`, where what it is made of is described), in Promises. The
 * default harness, `defaultHarness` or else the first, takes a task that names none, and answers `logs`, `transcript` and `say` for a
 * task whose harness this engine does not have, whose `view` asks no harness. Refused — throws an `Error` whose `exitCode` is 2 — for
 * what `optionsRefusalOf` refuses.
 */
export function createEngine(options: EngineOptions = {}): Engine {
  return promiseEngine(EngineService.layer(options));
}
