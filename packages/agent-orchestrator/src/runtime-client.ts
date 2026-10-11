/**
 * The runtime client: the one file of the package that imports `agent-runtime`, a type included (`test/boundary.test.ts`), as a Go agent
 * SDK reaches its sandbox runtime through one file of its own. It creates the runtime — the harnesses and `engine()` — and names the
 * runtime's types the controllers use (`Engine`, `TaskView`, `TranscriptEvent`, `Usage`, `Denial`, `RefusedMove`, `HarnessQuota`,
 * `QuotaLimit`, `nameFor`, `denialText`, `refusedText` and `lifecycleGraph`), which they import from here and never from the runtime.
 *
 * It builds the runtime's `Engine` service (`agent-runtime`) once, changed in one verb: `file`, so that every task the orchestrator
 * files is `queued` and starts only once the runtime admits it under the ceiling `engine()` gives it. What the controllers do with the
 * runtime — file a task, view one, tick, admit, stop one, read its logs, say something to it, read the feed — are the verbs of that
 * service, each an Effect, which every controller takes as it is and every test hands one of (`engineOf` over a layer of its own). A
 * wrapper would be a second surface to keep in step with the first, and a place for behaviour to grow; this file holds none but that one.
 * A controller is an Effect program that requires the engine as a service (`EngineService`), run by its caller with `runWith`; it reads
 * the engine with `asked`, and lifts every other read with `tried` or `awaited`: a refusal is the program's failure, anything else a
 * defect it dies of.
 */
import fs from 'node:fs';
import path from 'node:path';
import { Cause, Context, Effect, Exit, Layer, References, Scope } from 'effect';
import {
  claudeDetached,
  codex,
  commandHarness,
  remoteConfigRefusal,
  type Credentials,
  type MissingCredential,
  type RemoteAgent,
  Engine as RuntimeEngine,
  refusalWords,
  type EngineShape,
} from 'agent-runtime';
import { envNameOf, readRemoteAgents, remoteAgentsFile } from './harness/a2a.store.ts';
import { HOME } from './record/record.store.ts';
import { maxConcurrent } from './config/config.store.ts';
import { pauseFile } from './pause/pause.store.ts';
import { REMOTE_PREFIX, remoteNameOf } from './harness/harness.ts';
import { Invalid, isRefusal, type Refusal } from './refusal/refusal.ts';
import { sessionTelemetryOf, toolDetailsRefusalOf } from './telemetry/telemetry.ts';

/** The runtime's engine, built: each verb an Effect whose refusal is a tagged error, which a controller reads with `asked`. */
export type Engine = EngineShape;
export type {
  ClaudeFlags,
  CodexArgs,
  Denial,
  HarnessQuota,
  QuotaLimit,
  RefusedMove,
  TaskView,
  TranscriptEvent,
  Usage,
} from 'agent-runtime';
/** What the engine's `forget` removed, or would, and its refusal by task (`engineForgetting`). */
export { ForgetRefused, type ForgetReport } from 'agent-runtime';
/** The name the engine gives a task's session, which is the name `claude agents` lists it under (`harnessWaitLine`). */
export { nameFor } from 'agent-runtime';
/** The task's lifecycle as plain data, which the board draws: what the api serves at `/api/machines`. */
export { lifecycleGraph, type LifecycleGraph } from 'agent-runtime';
/** A denied call as the runtime words it, and as a permission rule is written: `Skill(look)`, `Bash(pytest)` (`deniedOf`). */
export { denialText } from 'agent-runtime';
/** A move the runtime's lifecycle had no edge for, as a person reads it in `nemia up`'s log (`refusalLines`). */
export { refusedText } from 'agent-runtime';
/**
 * Why the runtime would refuse a task's configuration on one of its default harnesses, in its words, or undefined: what `nemia start` and
 * `nemia retry` ask of a step's filed config before anything is written, and word in the step's keys (`filedRefusal`).
 */
export { configRefusal } from 'agent-runtime';
/** Whether a harness trusts a folder to run a background session in: what `nemia level` asks before it lets the keeper file one there. */
export { trustedFolder } from 'agent-runtime';

/**
 * Why one task's journal does not read, in the runtime's words, when `err` is what a read of it rejected with — the runtime's
 * `JournalError`, which names the task — or undefined for any other failure, and for one of the whole store (named `*`), which the caller
 * rethrows.
 */
export const unreadableJournal = (err: unknown): string | undefined => {
  if (!(err instanceof Error)) return undefined;
  const { _tag, taskId } = err as Error & { _tag?: unknown; taskId?: unknown };
  return _tag === 'JournalError' && typeof taskId === 'string' && taskId !== '*' ? err.message : undefined;
};

/**
 * The engine's harnesses, the run's `check` among them: the runtime's command harness, under the name checks have always run under, so
 * the runtime keeps their streams in `runs/check/` and a check filed before it reads the same. It runs a step's `check:` command as the
 * task's `config` gives it (`checkArgv`, `src/check/check.ts`). Passing `harnesses` REPLACES the engine's
 * default map rather than adding to it, so the defaults are named again here — leaving them out would
 * quietly send every step to whichever harness came first.
 *
 * A step runs on the engine's harness of its name as a job, which ends on its own, asks nobody in any mode, and keeps a spend cap; a
 * step that says `background: true` is filed with `config.background` and runs as a background session, which a person can talk to.
 *
 * The detached harness and the job it stands beside are one subscription, so it counts in the job's pool (`pool`), under one ceiling;
 * every other harness, `check` among them, is a pool of its own.
 */
export const HARNESSES = {
  claude: 'claude',
  codex,
  'claude-detached': { ...claudeDetached, pool: 'claude' },
  check: { ...commandHarness, name: 'check' },
} as const;

/**
 * The harnesses the daemon asks for their quota (`up`): each of the engine's that is a subscription of its own, so none that counts in
 * another's pool. One that reports no quota refuses the ask, and is asked again all the same: the refusal costs no process, and no span.
 */
export const quotaHarnesses = (): string[] =>
  Object.entries(HARNESSES)
    .filter(([, h]) => typeof h === 'string' || !('pool' in h))
    .map(([name]) => name);

/**
 * The engine the controllers use. Every filing goes out `queued`, and the runtime admits it per pool under the ceiling handed to it here,
 * `maxConcurrent` from `WF_MAX_CONCURRENT` (`maxConcurrent` in `config.store.ts`), the filed `priority` first. A value the variable
 * refuses gives the engine no ceiling, so nothing is admitted: the tick refuses its pass on the same read (`ceilings`), so the daemon
 * says why, and every other command works on. While the store is paused the engine is `unschedulable`, asked on every pass, so no
 * queued task is admitted, whichever process ticks the store.
 *
 * Its `a2a:<name>` harnesses are what the store's `a2a-agents.json` declares and the runtime takes (`readRemote`). A file refused as it
 * stands gives none, and an entry refused gives no harness of its name: each is said on stderr and left out, so every other command —
 * `nemia ls`, `nemia up`, `nemia rm`, the api — works on. It is `nemia start` that refuses a step naming what was left out, in the file's
 * words. A step already filed on it runs on no other harness: the runtime routes a task whose harness it does not have to none, so one at
 * work on the agent is held, neither there nor gone, and one not yet started is refused its start (`composite` in the runtime).
 *
 * When the process exports its own telemetry (`otlpOf`), the engine is handed the same collector, and each session it starts exports
 * there too, tagged with the labels its task was filed with (`stepLabels`); with its tools' inputs only when `NEMIA_TOOL_DETAILS` is
 * `1` (`sessionTelemetryOf`). Any other value is said on stderr and leaves them off (`toolDetailsRefusalOf`).
 */
export const engine = (): Engine => {
  const read = readRemote();
  const remote = Object.fromEntries([...read.agents].map(([name, agent]) => [`${REMOTE_PREFIX}${name}`, agent]));
  for (const why of refusalsOf(read)) console.error(`nemia: ${why} ${LEFT_OUT}`);
  const harnesses = { ...HARNESSES, ...remote };
  const why = toolDetailsRefusalOf(process.env);
  if (why) console.error(`nemia: ${why}`);
  const telemetry = sessionTelemetryOf(process.env);
  return engineOf(
    RuntimeEngine.layer({
      root: path.join(HOME, 'engine'),
      harnesses,
      credentials,
      missingCredential,
      ...storeAdmission(),
      ...(telemetry ? { telemetry } : {}),
    }),
  );
};

/**
 * The engine the controllers use over `layer`'s `Engine` service, built once at the call and kept for the process, with every filing
 * `queued`: `engine()` over the store's runtime, a test over a layer of its own (`test/engine-board.ts`). Refused — throws an `Error` whose
 * `exitCode` is 2, led by `engine` (`refusalWords`) — when the layer fails with the runtime's `EngineRefused`; any other failure to build
 * it is thrown as it is.
 */
export const engineOf = <E>(layer: Layer.Layer<RuntimeEngine, E>): Engine => {
  const built = Effect.runSyncExit(
    Layer.build(layer).pipe(
      Effect.map((context) => Context.get(context, RuntimeEngine)),
      Effect.provideService(Scope.Scope, Scope.makeUnsafe()),
    ),
  );
  if (Exit.isFailure(built)) throw refusalWords('engine')(Cause.squash(built.cause));
  const e = built.value;
  return { ...e, file: (spec) => e.file({ ...spec, queued: true }) };
};

/**
 * The engine a controller's program requires: the `Engine` `engine()` builds, or a test's (`engineOf`), as a service. `layer(e)` provides
 * the one engine it is given.
 */
export class EngineService extends Context.Service<EngineService, Engine>()('agent-orchestrator/Engine') {
  static readonly layer = (e: Engine): Layer.Layer<EngineService> => Layer.succeed(EngineService)(e);
}

/** What a read threw or rejected with, in a controller's program: a refusal (`isRefusal`) as its failure, anything else as a defect. */
const orRefusal = (err: unknown): Effect.Effect<never, Refusal> => (isRefusal(err) ? Effect.fail(err) : Effect.die(err));

/**
 * A synchronous read of the store or of git, in a controller's program: what `read` returns, or the refusal it threw as the program's
 * failure (`orRefusal`); anything else it threw, the program dies of.
 */
export const tried = <A>(read: () => A): Effect.Effect<A, Refusal> =>
  Effect.try({ try: read, catch: (err) => err }).pipe(Effect.catch(orRefusal));

/**
 * The engine's verb `verb`, `effect`, in a controller's program: what it succeeds with; a refusal of the runtime it dies of in the
 * runtime's words (`refusalWords`: an `Error` led by the verb whose `exitCode` is 2), as anything else it failed with.
 */
export const asked = <A, E>(verb: string, effect: Effect.Effect<A, E>): Effect.Effect<A> =>
  effect.pipe(Effect.mapError(refusalWords(verb)), Effect.orDie);

/**
 * `program` over the engine `e`, run to a Promise: what the CLI, the api and the tests run a controller with. Rejects with the refusal
 * the program failed with, or with whatever else it died of, as it was thrown. It logs at Warn and above unless the program sets its
 * own level: a command run once says what it did in its own lines, so the feed's Info lines a tick writes (`emitFeed`) are said by a
 * process that lives (`nemia up`, the api) alone, and a warning or an error is said wherever it comes from.
 */
export const runWith = <A, E>(e: Engine, program: Effect.Effect<A, E, EngineService>): Promise<A> =>
  Effect.runPromise(program.pipe(Effect.provide(EngineService.layer(e)), Effect.provideService(References.MinimumLogLevel, 'Warn')));

/**
 * `program` over the engine `e` in place of the one in its context: what a pass hands a read the engine it reads through
 * (`reportedEngine`), and a command a read of its own (`viewedOnce`).
 */
export const over =
  (e: Engine) =>
  <A, E, R>(program: Effect.Effect<A, E, R>): Effect.Effect<A, E, Exclude<R, EngineService>> =>
    Effect.provideService(program, EngineService, e);

/**
 * A read that is not the engine's, in a controller's program: what `read` resolves, or the refusal it rejected with as the program's
 * failure (`orRefusal`); anything else it rejected with, the program dies of.
 */
export const awaited = <A>(read: () => Promise<A>): Effect.Effect<A, Refusal> =>
  Effect.tryPromise({ try: read, catch: (err) => err }).pipe(Effect.catch(orRefusal));

/**
 * What the store's engine admits under, as `engine()` hands it to the runtime: its ceiling (`ceilingOf`), and `unschedulable`, asked by
 * the runtime's pass before it admits, true while the store's pause's file is there (`pauseFile`), whatever it holds, as `readPause`
 * reads a file that is there as a pause.
 */
export const storeAdmission = (): { maxConcurrent?: number; unschedulable: () => boolean } => ({
  unschedulable: () => fs.existsSync(pauseFile()),
  ...ceilingOf(),
});

/** The engine's ceiling, `WF_MAX_CONCURRENT`'s sessions per pool, or none when the variable is refused (`maxConcurrent`). */
const ceilingOf = (): { maxConcurrent?: number } => {
  try {
    return { maxConcurrent: maxConcurrent() };
  } catch (err) {
    if (isRefusal(err)) return {};
    throw err;
  }
};

/** What `engine()` says after each refusal of the file or of an entry: that it was left out, and what that means. */
const LEFT_OUT =
  'It is left out until the file is fixed and this process restarts: a step that names it is refused by `nemia start`, one at work on it is held, and one not yet started is refused its start.';

/**
 * The store's `a2a-agents.json`, judged: the agents the runtime takes, by name; each entry it refuses (`remoteConfigRefusal`), by name, in
 * the file's words and naming the file; and, when the file as a whole is refused (`readRemoteAgents`) or cannot be read, why, with no
 * agent. Read afresh on each call; it throws nothing, so a bad file stops only a step that names one of its agents (`undeclaredRefusal` in
 * start.verb.ts).
 */
export type RemoteRead = { agents: ReadonlyMap<string, RemoteAgent>; refused: ReadonlyMap<string, string>; unread?: string };

export function readRemote(): RemoteRead {
  const file = remoteAgentsFile(HOME);
  let entries: ReturnType<typeof readRemoteAgents>;
  try {
    entries = readRemoteAgents(file);
  } catch (err) {
    return { agents: new Map(), refused: new Map(), unread: (err as Error).message };
  }
  const agents = new Map<string, RemoteAgent>();
  const refused = new Map<string, string>();
  for (const [name, agent] of entries) {
    const why = remoteConfigRefusal(`${REMOTE_PREFIX}${name}`, agent);
    if (why) refused.set(name, `${file}: \`${name}\`: ${why}`);
    else agents.set(name, agent as RemoteAgent);
  }
  return { agents, refused };
}

/** Every refusal a read of the file came to: the file's own, or each entry's. */
export const refusalsOf = (read: RemoteRead): string[] => (read.unread ? [read.unread] : [...read.refused.values()]);

/**
 * The remote A2A agents the store's `a2a-agents.json` declares and the runtime takes, by name (`readRemote`): what the api offers a step
 * and reads a run's address off. An entry the runtime refuses is not among them; a file refused as it stands is refused, exit code 2, in
 * its words.
 */
export function remoteAgents(): ReadonlyMap<string, RemoteAgent> {
  const read = readRemote();
  if (read.unread) throw new Invalid({ message: read.unread });
  return read.agents;
}

/**
 * The secret for a scheme a remote agent's card asks for: the environment's `WF_A2A_<NAME>_<SCHEME>` (`envNameOf`), read on every request,
 * so a variable set for a running `nemia up` is not seen until it restarts, and none is ever on disk. An empty one is none. None for a
 * local harness.
 */
export const credentials: Credentials = (scheme, _agentUrl, harness) => {
  const name = remoteNameOf(harness);
  return name === undefined ? undefined : process.env[envNameOf(name, scheme)] || undefined;
};

/** What a spawn refused for a secret not given says to do: set the variable, where the run's processes read it. */
export const missingCredential: MissingCredential = (scheme, _agentUrl, harness) => {
  const name = remoteNameOf(harness) ?? harness;
  return `set ${envNameOf(name, scheme)} to the secret for the scheme \`${scheme}\` ${name}'s card declares, in the environment of the daemon — the api, or \`nemia up\` — and of every api that reads a run through the same engine, and restart it; then \`nemia retry\` the step. The secret is read from there on every request, and never written to disk.`;
};
