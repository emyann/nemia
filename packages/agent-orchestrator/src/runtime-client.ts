/**
 * The runtime client: the one file of the package that imports `agent-runtime`, a type included (`test/boundary.test.ts`), as a Go agent
 * SDK reaches its sandbox runtime through one file of its own. It creates the runtime — the harnesses and `engine()` — and names the
 * runtime's types the controllers use (`Engine`, `TaskView`, `TranscriptEvent`, `Usage`, `Denial`, `RefusedMove`, `HarnessQuota`,
 * `HeardQuota`, `QuotaLimit`, `nameFor`, `denialText`, `refusedText` and `lifecycleGraph`), which they import from here and never from
 * the runtime.
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
  BEARER,
  commandHarness,
  DEFAULT_HARNESSES,
  heldHarnessesOf,
  holderTokenOf,
  remoteConfigRefusal,
  type Credentials,
  type HarnessConfig,
  type MissingCredential,
  type RemoteAgent,
  type EndReason,
  type SessionState,
  type TaskPhase,
  type TaskView,
  type TranscriptEvent,
  Engine as RuntimeEngine,
  refusalWords,
  type EngineShape,
} from 'agent-runtime';
import { envNameOf, readRemoteAgents, remoteAgentsFile } from './harness/a2a.store.ts';
import { type Env, type Settings, settingsOf, wfRoot } from './config/config.store.ts';
import { toolsBinDir } from './config/root.store.ts';
import { pauseFile } from './pause/pause.store.ts';
import { servesOnStore } from './daemon/daemon.store.ts';
import { declarationOf, HARNESSES as STEP_HARNESSES, REMOTE_PREFIX, remoteNameOf } from './harness/harness.ts';
import { Invalid, isRefusal, type Refusal } from './refusal/refusal.ts';
import { exportIntervalRefusalOf, sessionTelemetryOf, toolDetailsRefusalOf } from './telemetry/telemetry.ts';
import type { AttemptMemory, EnginePhase } from './views/views-words.ts';
import { fromThrow } from './door/door.store.ts';
import type { SaidAfterKind } from './say/say.ts';
import type { StepSessionState } from './following/following.ts';
import type { AttemptReason } from './timeline/index.ts';

/**
 * Whether two unions hold the same words: `true` only when each is assignable to the other, `false` otherwise, so a `true` annotation
 * fails the typecheck the moment they part.
 */
type Same<A, B> = [A] extends [B] ? ([B] extends [A] ? true : false) : false;

/**
 * The orchestrator's copy of the runtime's phases (`EnginePhase`, written out in a pure file that imports no runtime) held equal to the
 * runtime's `TaskPhase`: a word added to or dropped from either fails the typecheck here, never a reader at run time.
 */
export const enginePhaseHeld: Same<EnginePhase, TaskPhase> = true;

/**
 * The orchestrator's copy of the kinds a said message may follow (`SaidAfterKind`), held equal to the runtime's `TranscriptEvent['kind']`.
 */
export const saidAfterKindHeld: Same<SaidAfterKind, TranscriptEvent['kind']> = true;

/** The orchestrator's copy of A2A's session states (`StepSessionState`), held equal to the runtime's `SessionState`. */
export const stepSessionStateHeld: Same<StepSessionState, SessionState> = true;

/** The orchestrator's copy of why an attempt ended (`AttemptReason`), held equal to the runtime's `EndReason`. */
export const attemptReasonHeld: Same<AttemptReason, EndReason> = true;

/** The orchestrator's copy of an attempt's memory record (`AttemptMemory`), held equal to the runtime's `MemoryUse`. */
export const attemptMemoryHeld: Same<AttemptMemory, NonNullable<TaskView['state']['attempts'][number]['memory']>> = true;

/** The runtime's engine, built: each verb an Effect whose refusal is a tagged error, which a controller reads with `asked`. */
export type Engine = EngineShape;
export type {
  ClaudeFlags,
  CodexArgs,
  Denial,
  HarnessQuota,
  HeardQuota,
  QuotaLimit,
  RefusedMove,
  TaskView,
  TranscriptEvent,
  Usage,
} from 'agent-runtime';
/** What the engine's `forget` removed, or would, and its refusal by task (`engineForgetting`). */
export { ForgetRefused, type ForgetReport, type KeptReport } from 'agent-runtime';
export { codexSignIn, CODEX_SIGN_IN_COMMAND, CODEX_SIGN_IN_MS, type CodexSignIn } from 'agent-runtime';
export { claudeSignIn, CLAUDE_SIGN_IN_MS, type ClaudeSignIn } from 'agent-runtime';
/** The name the engine gives a task's session, which is the name `claude agents` lists it under (`harnessWaitLine`). */
export { nameFor } from 'agent-runtime';

/** Why this host cannot hold a task's memory limit, a scope of systemd's user manager in a slice where given, or `undefined`. */
export { scopeRefusal } from 'agent-runtime';
/** The task's lifecycle as plain data, which the board draws: what the api carries on a step's path (`StepPath`'s `lifecycle`). */
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
/** Whether a harness trusts a folder to run a long-lived session in: what `nemia level` asks before it lets the keeper file one there. */
export { trustedFolder } from 'agent-runtime';
/**
 * A harness's trust of a folder a factory names, in the runtime's words: read as it is now (`folderTrust`), and given (`trustFolder`),
 * under the repository the place answered for the folder; each `undefined` for a harness that keeps no trust.
 */
export { folderTrust, trustFolder, type FolderTrust, type FolderTrusted } from 'agent-runtime';
/**
 * One MCP server a factory records and a harness is handed (`RemoteMcpServer`), and the one producer of its bytes (`mcpServerOf`): the
 * record carries the server's wire facts, and the runtime spells them in the one key order a sign-in is filed under.
 */
export { mcpServerOf, type LocalMcpServer, type RemoteMcpServer } from 'agent-runtime';
/**
 * An MCP server's transport in the Agent SDK's words (`MCP_TRANSPORTS`, `McpTransport`), and a written `type` read as one, or as
 * `unknown` for any other word (`transportOf`).
 */
export { MCP_TRANSPORTS, transportOf, type McpTransport } from 'agent-runtime';
/**
 * What a harness says of the servers it was handed, carried here whole and never worded again: the five state words it has
 * (`MCP_STATES`), one server's state as it says it, and what a whole read answers — the states, or that the look failed and why,
 * never an empty list. Asked of the engine's `mcpState`, and refused by `McpStateRefused`.
 */
export { MCP_STATES, McpStateRefused, type McpServerState, type McpServersRead } from 'agent-runtime';
/**
 * A server's sign-in as the engine holds it: what a sign-in answers at once (`McpSignInStarted`), the words of its state
 * (`SIGN_IN_STATES`, `McpSignInState`), and what the four verbs are refused with (`McpSignInRefused`, `held` where a sign-in waits,
 * `callback` why a pasted callback was refused).
 */
export { McpSignInRefused, SIGN_IN_STATES, type McpSignInStarted, type McpSignInState } from 'agent-runtime';
/**
 * Whether a harness files a sign-in for a remote MCP server, read off its name: the runtime's judgement, carried, for the pass that
 * will not start a step whose server needs one. A harness it answers false for is shown its servers and never refused them.
 */
export { signsInMcp } from 'agent-runtime';

/**
 * The allow rules the repository's own harness configuration grants a session started in it, as the harness reads them
 * (`projectAllows`): what a step's session gets beyond its own rules, for the judgement that a tool it is given can be called
 * (`unallowedRefusal`). `undefined` for a harness that reads no such configuration.
 */
export { projectAllows } from 'agent-runtime';

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
 * The engine's harnesses: each a step runs on (`STEP_HARNESSES`, the runtime's that run a brief), as the runtime configures it by default
 * (`DEFAULT_HARNESSES`), then the run's `check`: the runtime's command harness, under the name checks have always run under, so the
 * runtime keeps their streams in `runs/check/` and a check filed before it reads the same. It runs a step's `check:` command as the
 * task's `config` gives it (`checkArgv`, `src/check/check.ts`). Passing `harnesses` REPLACES the engine's
 * default map rather than adding to it, so the step harnesses are named again here — leaving them out would
 * quietly send every step to whichever harness came first.
 *
 * A step runs on the engine's harness of its name as a job, which ends on its own, asks nobody in any mode, and keeps a spend cap. Each
 * harness, `check` among them, is a pool of its own.
 */
export const HARNESSES: Readonly<Record<string, HarnessConfig>> & { readonly check: typeof commandHarness & { readonly name: string } } = {
  ...Object.fromEntries(
    STEP_HARNESSES.flatMap((name) => {
      const config = Object.hasOwn(DEFAULT_HARNESSES, name) ? DEFAULT_HARNESSES[name] : undefined;
      return config === undefined ? [] : [[name, config]];
    }),
  ),
  check: { ...commandHarness, name: 'check' },
};

/**
 * The harnesses the daemon asks for their quota (`up`): each of the engine's that declares it reports one (`quota`), every one a
 * subscription of its own.
 */
export const quotaHarnesses = (): string[] => Object.keys(HARNESSES).filter((name) => declarationOf(name)?.can.includes('quota') === true);

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
 * Each task it files without a memory limit of its own is filed under `WF_MEMORY_LIMIT`'s (`defaultLimits`), its scope made in
 * `WF_CGROUP_PARENT`'s slice where one is set (`cgroupParent`): a value either variable refuses gives the engine neither, and the tick
 * refuses its pass on the same read (`ceilings`), so nothing is filed without the limit it was set to hold.
 *
 * Each harness's program is looked for first in the store's tools folder's `bin/` (`harnessBin`, `toolsBinDir`), where `nemia doctor
 * fix` activates one, read by the runtime at every spawn.
 *
 * When the process exports its own telemetry (`otlpOf`), the engine is handed the same collector, and each session it starts exports
 * there too, tagged with the labels its task was filed with (`stepLabels`); with its tools' inputs only when `NEMIA_TOOL_DETAILS` is
 * `1` (`sessionTelemetryOf`). Any other value is said on stderr and leaves them off (`toolDetailsRefusalOf`), as an export interval that
 * is no number is (`exportIntervalRefusalOf`).
 */
export const engine = (env: Env): Engine => {
  const root = wfRoot(env);
  const config = settingsOf(env);
  const read = readRemote(root);
  const remote = Object.fromEntries([...read.agents].map(([name, agent]) => [`${REMOTE_PREFIX}${name}`, agent]));
  for (const why of refusalsOf(read)) console.error(`nemia: ${why} ${LEFT_OUT}`);
  const harnesses = { ...HARNESSES, ...remote };
  for (const why of [toolDetailsRefusalOf(env), exportIntervalRefusalOf(env)]) if (why) console.error(`nemia: ${why}`);
  const telemetry = sessionTelemetryOf(env);
  return engineOf(
    RuntimeEngine.layer({
      root: engineRoot(root),
      harnesses,
      harnessBin: toolsBinDir(root),
      holder: holderOption(root),
      credentials: credentialsAt(root),
      missingCredential,
      ...storeAdmission(root, config),
      ...storeLimits(config),
      ...(telemetry ? { telemetry } : {}),
    }),
  );
};

/** Where the runtime keeps its own store, under this store's `WF_ROOT`: the one root every process on this store shares. */
const engineRoot = (root: string): string => path.join(root, 'engine');

/**
 * The engines holding the sessions this one only reads, as the runtime takes them: one entry per harness a holder can hold
 * (`heldHarnessesOf`), each a function the runtime asks at every follow of that harness's sessions, answering the card the process
 * that holds this store's lease serves for it (`servesOnStore`) or `undefined`.
 *
 * A function, and read afresh in it, because a holder's port is ephemeral while this process builds its engine once: the api serves
 * for days across any number of restarts of the daemon, so the holder is read at the follow and never captured here. A viewer whose
 * store nobody holds, or whose holder is this process, is handed `undefined` and reads the session off the files, as it always did.
 *
 * The names are the runtime's rule and not a literal of ours: filtering `HARNESSES` here would teach this file an eighth harness
 * word, where the count only shrinks (`test/words.test.ts`).
 */
const holderOption = (root: string): Record<string, () => { card: Record<string, unknown> } | undefined> =>
  Object.fromEntries(heldHarnessesOf(HARNESSES).map((name) => [name, () => cardOnStore(root, name)]));

/** The card the holder of this store serves for `harness`, as the runtime configures an agent with it, or `undefined`. */
const cardOnStore = (root: string, harness: string): { card: Record<string, unknown> } | undefined => {
  const card = servesOnStore(root)?.[harness];
  return card === undefined ? undefined : { card };
};

/**
 * The engine the controllers use over `layer`'s `Engine` service, built once at the call and kept for the process, with every filing
 * `queued`: `engine()` over the store's runtime, a test over the runtime's stand-in (`testEngine`, from `agent-runtime/testing`).
 * Refused — throws an `Error` whose `exitCode` is 2, led by `engine` (`refusalWords`) — when the layer fails with the runtime's
 * `EngineRefused`; any other failure to build it is thrown as it is.
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
export const tried: <A>(read: () => A) => Effect.Effect<A, Refusal> = fromThrow;

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
export const storeAdmission = (root: string, config: Settings): { maxConcurrent?: number; unschedulable: () => boolean } => ({
  unschedulable: () => fs.existsSync(pauseFile(root)),
  ...ceilingOf(config),
});

/** The engine's ceiling, `WF_MAX_CONCURRENT`'s sessions per pool, or none when the variable is refused (`maxConcurrent`). */
const ceilingOf = (config: Settings): { maxConcurrent?: number } => {
  try {
    return { maxConcurrent: config.maxConcurrent };
  } catch (err) {
    if (isRefusal(err)) return {};
    throw err;
  }
};

/**
 * What the store's engine limits its tasks by, as `engine()` hands it to the runtime: `WF_MEMORY_LIMIT` as the default limit
 * (`defaultLimits`), and `WF_CGROUP_PARENT` as the slice each limited task's scope is made in (`cgroupParent`); neither when unset, and
 * neither when either is refused, as `ceilingOf` gives no ceiling.
 */
export const storeLimits = (config: Settings): { defaultLimits?: { memory: string }; cgroupParent?: string } => {
  try {
    const memory = config.memoryLimit;
    const parent = config.cgroupParent;
    return { ...(memory === undefined ? {} : { defaultLimits: { memory } }), ...(parent === undefined ? {} : { cgroupParent: parent }) };
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

export function readRemote(root: string): RemoteRead {
  const file = remoteAgentsFile(root);
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
export function remoteAgents(root: string): ReadonlyMap<string, RemoteAgent> {
  const read = readRemote(root);
  if (read.unread) throw new Invalid({ message: read.unread });
  return read.agents;
}

/**
 * The secret a card asks for, by its scheme, asked on every request the runtime makes:
 *
 * - the holder's bearer token (`BEARER`), for a harness the process holding this store's lease serves (`servesOnStore`): read at
 *   each ask off the one 0600 file the holder's own engine minted it into (`holderTokenOf`), under the engine root both processes
 *   share. It is never on the lease, in a log line, in an answer of the api or on the board, and nothing but this branch reads it;
 * - a remote agent's: the environment's `WF_A2A_<NAME>_<SCHEME>` (`envNameOf`), read on every request, so a variable set for a
 *   running `nemia up` is not seen until it restarts, and none is ever on disk. An empty one is none.
 *
 * None for a local harness no one holds. It answers by harness and scheme and not by the url it is asked with, so it hands the token
 * to whatever agent the engine was configured with for that harness — which is the card off the lease, written by the process that
 * holds it. A later slice that lets a card come from elsewhere makes this branch read the url.
 */
export const credentialsAt =
  (root: string): Credentials =>
  (scheme, _agentUrl, harness) => {
    if (scheme === BEARER && servesOnStore(root)?.[harness] !== undefined) return holderTokenOf(engineRoot(root));
    const name = remoteNameOf(harness);
    return name === undefined ? undefined : process.env[envNameOf(name, scheme)] || undefined;
  };

/** What a spawn refused for a secret not given says to do: set the variable, where the run's processes read it. */
export const missingCredential: MissingCredential = (scheme, _agentUrl, harness) => {
  const name = remoteNameOf(harness) ?? harness;
  return `set ${envNameOf(name, scheme)} to the secret for the scheme \`${scheme}\` ${name}'s card declares, in the environment of the daemon — the api, or \`nemia up\` — and of every api that reads a run through the same engine, and restart it; then \`nemia retry\` the step. The secret is read from there on every request, and never written to disk.`;
};

/**
 * Holds back the new tool calls of the attached sessions the daemon of pid `holder` holds, each at its hook, or with null lets them go:
 * the runtime's `drain`, through the engine the program is given. A call in flight runs on.
 */
export const drained = (holder: number | null): Effect.Effect<void, never, EngineService> =>
  Effect.flatMap(EngineService, (e) => asked('drain', e.drain(holder)));

/**
 * Holds every session, job or attached, at its tool call's end under the store's pause, and cuts a call still in flight once `graceMs`
 * has passed since the drain was put; with null lifts it, each session parked going on as the same try. The runtime's `drainSessions`,
 * through the engine the program is given: a put with the grace that stands keeps its start, and another grace starts it again.
 */
export const sessionsDrained = (given: { graceMs: number } | null): Effect.Effect<void, never, EngineService> =>
  Effect.flatMap(EngineService, (e) => asked('drainSessions', e.drainSessions(given)));
