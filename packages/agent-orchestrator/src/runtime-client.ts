/**
 * The runtime client: the one file of the package that imports `agent-runtime`, a type included (`test/boundary.test.ts`), as a Go agent
 * SDK reaches its sandbox runtime through one file of its own. It creates the runtime — the harnesses and `engine()` — and names the
 * runtime's types the controllers use (`Engine`, `TaskView`, `Usage`, `Denial`, `RefusedMove`, `HarnessQuota`, `QuotaLimit`, `nameFor`,
 * `denialText`, `refusedText` and `lifecycleGraph`), which they import from here and never from the runtime.
 *
 * It uses the runtime's `Engine` service (`agent-runtime/effect`) and provides it as a layer, changed in one verb: `file`, so that every
 * task the orchestrator files is `queued` and starts only once the tick admits it (`cap.ts`). The controllers take the engine in Promises,
 * each verb of that service run as one (`promiseEngine`): what they do with the runtime — file a task, view one, tick, admit, stop one,
 * read its logs, say something to it, read the feed — are the methods of the runtime's Promise `Engine`, which every controller takes as it
 * is and every test hands one of (`engineOf` over a layer of its own). A wrapper would be a second surface to keep in step with the first,
 * and a place for behaviour to grow; this file holds none but that one. A controller written as an Effect program requires that same
 * Promise engine as a service (`EngineService`), which its plain face provides from the engine it is handed, and lifts each read with
 * `tried` or `awaited`: a refusal is the program's failure, anything else a defect it dies of.
 */
import path from 'node:path';
import { Context, Effect, Layer } from 'effect';
import { Engine as RuntimeEngine, promiseEngine } from 'agent-runtime/effect';
import {
  claudeDetached,
  codex,
  commandHarness,
  remoteConfigRefusal,
  type Credentials,
  type Engine,
  type MissingCredential,
  type RemoteAgent,
} from 'agent-runtime';
import { envNameOf, readRemoteAgents, remoteAgentsFile } from './harness/a2a.store.ts';
import { HOME } from './record/record.store.ts';
import { REMOTE_PREFIX, remoteNameOf } from './harness/harness.ts';
import { Invalid, isRefusal, type Refusal } from './refusal/refusal.ts';

export type { ClaudeFlags, CodexArgs, Denial, Engine, HarnessQuota, QuotaLimit, RefusedMove, TaskView, Usage } from 'agent-runtime';
/** The name the engine gives a task's session, which is the name `claude agents` lists it under (`harnessWaitLine`). */
export { nameFor } from 'agent-runtime';
/** The task's lifecycle as plain data, which the board draws: what the api serves at `/api/machines`. */
export { lifecycleGraph, type LifecycleGraph } from 'agent-runtime';
/** A denied call as the runtime words it, and as a permission rule is written: `Skill(look)`, `Bash(pytest)` (`deniedOf`). */
export { denialText } from 'agent-runtime';
/** A move the runtime's lifecycle had no edge for, as a person reads it in `wf up`'s log (`refusalLines`). */
export { refusedText } from 'agent-runtime';
/**
 * Why the runtime would refuse a task's configuration on one of its default harnesses, in its words, or undefined: what `wf start` and
 * `wf retry` ask of a step's filed config before anything is written, and word in the step's keys (`filedRefusal`).
 */
export { configRefusal } from 'agent-runtime';

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
 * quietly send every `claude` step to whichever harness came first.
 *
 * A `claude` step runs on the engine's `claude`: a job (`claude -p`), which ends on its own, asks nobody in any mode, and keeps a spend
 * cap; a step that says `background: true` is filed with `config.background` and runs as a background session (`claude --bg`), which
 * a person can talk to and bridge to claude.ai.
 */
export const HARNESSES = {
  claude: 'claude',
  codex,
  'claude-detached': claudeDetached,
  check: { ...commandHarness, name: 'check' },
} as const;

/**
 * The engine the controllers use. How many sessions run at once is the orchestrator's to say (`toAdmit`, under `ceilings().sessions`, which
 * reads `WF_MAX_CONCURRENT`): every filing goes out `queued`, so the runtime starts nothing the tick has not admitted. The runtime keeps no
 * ceiling of its own, and refuses a `maxConcurrent` handed to it.
 *
 * Its `a2a:<name>` harnesses are what the store's `a2a-agents.json` declares and the runtime takes (`readRemote`). A file refused as it
 * stands gives none, and an entry refused gives no harness of its name: each is said on stderr and left out, so every other command —
 * `wf ls`, `wf up`, `wf rm`, the api — works on. It is `wf start` that refuses a step naming what was left out, in the file's words.
 * A step already filed on it runs on no other harness: the runtime routes a task whose harness it does not have to none, so one at work
 * on the agent is held, neither there nor gone, and one not yet started is refused its start (`composite` in the runtime).
 */
export const engine = (): Engine => {
  const read = readRemote();
  const remote = Object.fromEntries([...read.agents].map(([name, agent]) => [`${REMOTE_PREFIX}${name}`, agent]));
  for (const why of refusalsOf(read)) console.error(`wf: ${why} ${LEFT_OUT}`);
  return engineOf(
    RuntimeEngine.layer({ root: path.join(HOME, 'engine'), harnesses: { ...HARNESSES, ...remote }, credentials, missingCredential }),
  );
};

/**
 * The engine the controllers use over `layer`'s `Engine` service, in Promises (`promiseEngine`), with every filing `queued`: `engine()`
 * over the store's runtime, a test over a layer of its own (`test/engine-board.ts`). Builds the layer at the call, and throws what the
 * runtime throws for a layer that does not build.
 */
export const engineOf = <E>(layer: Layer.Layer<RuntimeEngine, E>): Engine =>
  promiseEngine(
    Layer.effect(
      RuntimeEngine,
      Effect.gen(function* () {
        const e = yield* RuntimeEngine;
        return RuntimeEngine.of({ ...e, file: (spec) => e.file({ ...spec, queued: true }) });
      }),
    ).pipe(Layer.provide(layer)),
  );

/**
 * The engine a controller's program requires: the Promise `Engine` every controller takes, `engine()`'s or a test's (`engineOf`), as a
 * service. `layer(e)` provides the one engine it is given.
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
 * A read of the engine, in a controller's program: what `read` resolves, or the refusal it rejected with as the program's failure
 * (`orRefusal`); anything else it rejected with, the program dies of.
 */
export const awaited = <A>(read: () => Promise<A>): Effect.Effect<A, Refusal> =>
  Effect.tryPromise({ try: read, catch: (err) => err }).pipe(Effect.catch(orRefusal));

/** What `engine()` says after each refusal of the file or of an entry: that it was left out, and what that means. */
const LEFT_OUT =
  'It is left out until the file is fixed and this process restarts: a step that names it is refused by `wf start`, one at work on it is held, and one not yet started is refused its start.';

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
 * so a variable set for a running `wf up` is not seen until it restarts, and none is ever on disk. An empty one is none. None for a local
 * harness.
 */
export const credentials: Credentials = (scheme, _agentUrl, harness) => {
  const name = remoteNameOf(harness);
  return name === undefined ? undefined : process.env[envNameOf(name, scheme)] || undefined;
};

/** What a spawn refused for a secret not given says to do: set the variable, where the run's processes read it. */
export const missingCredential: MissingCredential = (scheme, _agentUrl, harness) => {
  const name = remoteNameOf(harness) ?? harness;
  return `set ${envNameOf(name, scheme)} to the secret for the scheme \`${scheme}\` ${name}'s card declares, in the environment of \`wf up\` (and of the api, which reads a run through the same engine), and restart it; then \`wf retry\` the step. The secret is read from there on every request, and never written to disk.`;
};
