/**
 * Claude Code as the engine runs it: every session on the Agent SDK. A task is a job, and a long-lived session
 * (`restartPolicy: 'Always'`) is held attached.
 *
 * A job is one session on the Agent SDK, in a process of its own (`bin/ae-claude-job.ts`), detached by the engine's worker
 * (`harness/detached/detached.ts`), whether or not a process holds this runtime's sessions: it runs its brief to completion and exits,
 * so its end is its exit and its result — no registry to read, no quiet rule, a spend cap it keeps — and it lives through a restart of
 * the engine, on the release it started on. Only a long-lived session runs attached (`attachedLongLived`). Nobody is there to ask
 * (`permissionPrompts: 'none'`); a call it may not make is denied and the session carries on, and the result says what was denied. It
 * reads its brief on its stdin, and words a person says while it works after it, until its result.
 *
 * A long-lived session runs attached, in the process that holds the sessions (a daemon), and nowhere else: with no holder its spawn
 * is refused, `unstartable`, in words naming the holder to start (`LONG_LIVED_UNHELD`).
 *
 * Either is bridged to claude.ai where its task asks (`claude.remoteControl`), on its first message (`session-bridge.ts`): a held
 * session's bridge is on its run file, a job's on the bridge file its own process writes beside its run (`HarnessIO.bridgeFile`),
 * which this runner reads into the job's sighting on every look.
 *
 * A job is held by the store's sessions' drain (`job-hold.ts`): its own process holds its next main-thread call at its hook while the drain
 * stands, and parks past the drain's grace or its bound, saying so on the hold file it writes beside its run (`HarnessIO.holdFile`),
 * which this runner reads into the job's sighting on every look (`withHoldFiles`): the call it is in, the call it holds back, and its
 * end under the drain (`parked`), which the engine continues as a new attempt once the drain is lifted.
 *
 * A job's own options are the attached road's, fact for fact (`attachedOptions`), built in its process from the spawn request the
 * runner wrote for it: one translation of a task into a Claude Code session, whether a daemon holds it or nothing does. It runs with
 * background tasks off (`CLAUDE_JOB_ENV`, laid on its session's own environment by `attachedOptions`).
 */
import { Effect, Schema } from 'effect';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import type { Parked, Sighting } from '../../core/index.ts';
import { claudeQuota } from './quota.ts';
import type { Observation, RunnerOps, SpawnRequest } from '../seam.ts';
import {
  besideRun,
  detachedFind,
  detachedOps,
  leaseGone,
  type HarnessIO,
  type HarnessSpec,
  type StartEvent,
} from '../detached/detached.ts';
import { readJobHold, type JobHold } from './job-hold.ts';
import { sessionDrainFile, sessionDrainOf } from '../../core/engine/drain.ts';
import { claudeTranscriptEvents, claudeTranscriptFile, claudeTranscriptRecords } from './transcript.ts';
import { CLAUDE_CONTEXT_TOKENS, CLAUDE_DECLARATION, bridgeAsked, claudeRefuses } from './vocabulary.ts';
import { claudePartials, claudeStreamKept, claudeStreamOutput } from '../detached/output.ts';
import { projectMcpConfig } from '../mcp.ts';
import { RunnerError } from '../error.ts';
import { BridgeFactsSchema, bridgeOf, type AttachedBridge } from './session-bridge.ts';
import type { Attached } from './attached.ts';
import { claudeSignedOutRefusal } from './sign-in.ts';

/** What Claude Code's runner is built from (`claudeCodeOps`). */
export type ClaudeOptions = {
  /**
   * Where the runner keeps its jobs' run files and what their processes write beside them. Required, and with no default: a runner
   * made with no root writes into the person's own `~/.agent-engine`.
   */
  root: string;
  /**
   * The Claude Code a job's session runs (`EngineOptions.claudeExecutable`, `pathToClaudeCodeExecutable`), handed to the job's
   * process as `AE_CLAUDE_EXECUTABLE` (`claudeJobSpec`). Absent: the SDK's own.
   */
  claudeExecutable?: string;
  /** How long a job is held under the sessions' drain before it parks, in milliseconds: a test's shortening. Absent: `JOB_HOLD_MS`. */
  holdMs?: number;
  /** How often a job's own process reads the sessions' drain, in milliseconds: a test's shortening. Absent: `JOB_HOLD_POLL_MS`. */
  holdPollMs?: number;
  /** How long `claude auth status` is given before a job's spawn, in milliseconds: a test's shortening. Absent: `CLAUDE_SIGN_IN_MS`. */
  signInMs?: number;
  /** The slice a job under a memory limit has its scope made in (`EngineOptions.cgroupParent`). Absent: the user manager's own. */
  cgroupParent?: string;
};

/** What a job's process is handed to be held by the sessions' drain: the store whose drain it reads, and the bounds a test shortens. */
type JobHoldOptions = { root: string; holdMs?: number; holdPollMs?: number };

export { CLAUDE_JOB_ENV } from './job-env.ts';

/**
 * How a job's stream starts: its first line, `system`/`init`, and its `session_id`.
 * Exported only for the tests that import it.
 */
export const CLAUDE_INIT_START: StartEvent = { event: { type: 'system', subtype: 'init' }, id: 'session_id' };

/** The end of the file a job's process writes its bridge on, beside its run (`besideRun`). */
const BRIDGE_END = 'bridge';

/** The end of the file a job's process writes its hold on, beside its run (`besideRun`). */
const HOLD_END = 'hold';

/**
 * What a job is given of the machine before it runs: the checkout's `.mcp.json`, found on disk here so that `command` stays a function
 * of what it is given — none for a task that says which of its servers it loads (`projectMcp`), those being in the task's own config
 * — and, where the task asks for a bridge (`bridgeAsked`), the file its process writes the bridge's facts on (`bridgeFile`), beside its
 * run, a former attempt's under the name cleared first so a look never reads its bridge as this one's. Where it is handed the store a
 * job is held by (`hold`), the job's hold file beside its run (`holdFile`), cleared the same way, the store's sessions' drain
 * (`drainFile`), and the bounds a test shortened (`holdMs`, `holdPollMs`), each only where given.
 *
 * Before any of it, the Claude Code the session would run (`executable`) is asked whether this machine is signed in, within `signInMs`
 * (`claudeSignedOutRefusal`): signed out, or with no answer, the spawn is refused, before anything runs.
 */
const claudePrepare = (
  r: SpawnRequest,
  beside?: (end: string) => string,
  hold?: JobHoldOptions,
  executable?: string,
  signInMs?: number,
): Partial<HarnessIO> => {
  const signedOut = claudeSignedOutRefusal(r, executable, signInMs);
  if (signedOut) throw new Error(signedOut);
  const found = r.config?.projectMcp ? undefined : projectMcpConfig(r.cwd);
  const io: Partial<HarnessIO> = { ...(found ? { projectMcpConfig: found } : {}), ...(beside ? holdIo(beside, hold) : {}) };
  if (!bridgeAsked(r) || beside === undefined) return io;
  const bridgeFile = beside(BRIDGE_END);
  fs.rmSync(bridgeFile, { force: true });
  return { ...io, bridgeFile };
};

/** The hold a job's process is handed (`claudePrepare`): none without a store, its hold file cleared of a former attempt's. */
const holdIo = (beside: (end: string) => string, hold?: JobHoldOptions): Partial<HarnessIO> => {
  if (hold === undefined) return {};
  const holdFile = beside(HOLD_END);
  fs.rmSync(holdFile, { force: true });
  return {
    holdFile,
    drainFile: sessionDrainFile(hold.root),
    ...(hold.holdMs !== undefined ? { holdMs: hold.holdMs } : {}),
    ...(hold.holdPollMs !== undefined ? { holdPollMs: hold.holdPollMs } : {}),
  };
};

/**
 * The process one Claude Code job's session runs in, `bin/ae-claude-job.ts`, found from this file's own folder as `WORKER` is.
 * Exported only for the tests that import it.
 */
export const CLAUDE_JOB_BIN = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', '..', '..', 'bin', 'ae-claude-job.ts');

/**
 * A task run as a job: one session on the Agent SDK, run by a process of ours (`CLAUDE_JOB_BIN`) that the worker detaches as it
 * detaches any harness. The bin reads the spawn request the runner wrote for it (`needsRequest`), builds the session's options
 * with `attachedOptions` — the same translation a held session is given, fact for fact — and prints each of the SDK's messages as
 * one JSON line, the stream every reader of a job reads, and every run already stored. Nothing on this road builds a Claude Code
 * command line.
 *
 * The stream's first line names the session, so its id is known while it runs and its transcript can be read then; each call it
 * was denied is a line as it happens, so a job killed before its result still says what it was denied (`claudeStreamOutput`).
 * Nobody is there to ask, so the bin runs the session `permissionPrompts: 'none'` (`sdk.d.ts:2103`): a call that would ask is
 * denied at once, never waited on, and no decision of the bin's can be left in flight when it dies.
 *
 * Its input is a stream too: the brief is the first user message on its stdin, and each word said to it while it works is
 * another, which it takes into the turn it is working. The bin reads its stdin until it ends, so the worker ends it at the job's
 * first result, and the session ends with it.
 *
 * - `command`: this runtime's node running the bin, the request file its one argument. `AE_CLAUDE_EXECUTABLE` where the engine
 *   names a Claude Code (`claudeJobSpec`'s `executable`), and nothing else: the session's own environment —
 *   the task's `env`, `CLAUDE_JOB_ENV` and its telemetry — is laid by `attachedOptions` on `Options.env` inside the bin, and
 *   leaving it here would stamp the engine's own child with the session's telemetry.
 * - `needsRequest`: the bin is handed the spawn request whole, which no argv could carry.
 * - `input.line`: a user message; the session is the job's own, so it names none.
 * - `input.closesOn`: its result, the line after which the bin reads nothing more; a producer prints its `type` far
 *   down the line, so it is parsed, never matched at the line's start.
 * - `resumeCostCarried`: a resumed Claude Code prints its parent's cost and API time on in its own.
 * - `streams` and `partials`: the bin prints the SDK's `stream_event` messages — each text block in pieces as it is written
 *   (`includePartialMessages`) — read from the stdout the worker keeps whole, so the job is followed live (`follow`,
 *   `claudePartials`).
 * - `keepOutput`: once the job has ended, its capture keeps only what the readers read (`claudeStreamKept`); the conversation is
 *   Claude Code's own transcript's (`transcript`).
 * - `prepare`: first, whether this machine's Claude Code is signed in (`claude auth status`, bounded by `signInMs`, `CLAUDE_SIGN_IN_MS`
 *   unless a test shortens it): signed out, or with no answer in time, the spawn is refused and the attempt ends `unstartable`, in words
 *   naming how to sign in. It sees a credential's presence, never its validity: an expired or revoked token passes, and fails at the
 *   session's first request. Then, for the bridge file it names where the task asks for one, and the hold file and the sessions' drain where it is handed a
 *   store to be held by (`hold`, `claudePrepare`), and for what it throws — the servers ride
 *   `Options.mcpServers`, read by `everyMcpServer` inside the bin, and a job writes no MCP config file: a checkout whose `.mcp.json`
 *   is not JSON refuses the spawn here, before the worker starts, so the attempt ends `unstartable` in those words rather than
 *   failing inside the bin.
 * - `refuses`: what Claude Code cannot be asked for (`claudeRefuses`); a bridge it opens itself.
 * Exported only for the tests that import it.
 */
export const claudeJobSpec = (executable?: string, hold?: JobHoldOptions, signInMs?: number): HarnessSpec => ({
  name: 'claude',
  command: (_r, io) => {
    const requestFile = io?.requestFile;
    if (requestFile === undefined)
      throw new Error('a Claude Code job starts on its spawn request file, and none was given: its runner writes one for `needsRequest`');
    return {
      cmd: process.execPath,
      args: [CLAUDE_JOB_BIN, requestFile],
      ...(executable ? { env: { AE_CLAUDE_EXECUTABLE: executable } } : {}),
    };
  },
  needsRequest: true,
  input: {
    line: (text) => JSON.stringify({ type: 'user', message: { role: 'user', content: text } }),
    closesOn: { key: 'type', value: 'result' },
  },
  readOutput: claudeStreamOutput,
  keepOutput: claudeStreamKept,
  start: CLAUDE_INIT_START,
  transcript: { file: claudeTranscriptFile, events: claudeTranscriptEvents, records: claudeTranscriptRecords },
  streams: true,
  partials: claudePartials,
  prepare: (r, beside) => claudePrepare(r, beside, hold, executable, signInMs),
  refuses: claudeRefuses,
  bridgeAsked,
  can: CLAUDE_DECLARATION.can,
  contextTokens: CLAUDE_CONTEXT_TOKENS,
  resumeCostCarried: true,
});

/**
 * A job's spec as the engine runs it with the Claude Code on the PATH: `claudeJobSpec()`, named for the readers that take a spec.
 * Exported only for the tests that import it.
 */
export const claudeJob: HarnessSpec = claudeJobSpec();

/**
 * Why a long-lived Claude Code spawn is refused where no process holds this runtime's sessions: such a session runs attached, in the
 * holder, and nowhere else. A `RunnerError` with `refused`, so the attempt ends `unstartable` in these words and is not restarted.
 */
const LONG_LIVED_UNHELD = (name: string): string =>
  `\`${name}\` is a long-lived Claude Code session (\`restartPolicy: 'Always'\`), which runs attached in the process that holds this runtime's sessions, and no process holds them now: start the daemon that holds them, then file the task again — or leave \`restartPolicy\` off to run it as a job.`;

/**
 * The bridge a job's process wrote beside its run under `name` (`HarnessIO.bridgeFile`), decoded (`BridgeFactsSchema`): nothing where
 * there is no file, and why where one is there that does not read — never read as no bridge.
 */
const bridgeFileOf = (root: string, name: string): AttachedBridge | undefined => {
  const file = besideRun(claudeJob, root, name, BRIDGE_END);
  let text: string;
  try {
    text = fs.readFileSync(file, 'utf8');
  } catch {
    return undefined;
  }
  try {
    return Schema.decodeUnknownSync(BridgeFactsSchema)(JSON.parse(text));
  } catch (e) {
    return {
      why: `the bridge file ${file} is not one this runtime reads (${e instanceof Error ? e.message : String(e)}): run the job under a runtime that wrote it, or file it again.`,
    };
  }
};

/** A job's sightings, each with the bridge its process wrote beside its run, where it wrote one (`bridgeFileOf`). */
const bridgedJobs = (root: string, seen: ReadonlyMap<string, Sighting>): Map<string, Sighting> =>
  new Map([...seen].map(([name, s]) => [name, { ...s, ...bridgeOf(bridgeFileOf(root, name)) }]));

/** The jobs' runner `job`, its looks reading each job's bridge file into its sighting (`bridgedJobs`). */
const withBridgeFiles = (job: RunnerOps, root: string): RunnerOps => ({
  ...job,
  observe: job.observe.pipe(Effect.map((seen) => bridgedJobs(root, seen))),
  observeFor: (expected) =>
    verbOf(job, 'observeFor')(expected).pipe(Effect.map((o): Observation => ({ ...o, seen: bridgedJobs(root, o.seen) }))),
});

/**
 * A job's sighting `s` with what its process wrote on its hold file (`hold`), as the job's own word on what it was doing:
 *
 * - while it works, the call it is in (`calling`) and the call it holds back at its hook (`heldBack`);
 * - once it ended parked, `parked` with the call it cut, read `failed`, so a parked end the engine does not continue settles failed;
 * - once its worker is gone with no end written (`lost`, a stale lease) and its session is known (`nativeId`), `parked` with the call
 *   it was last in, only where it was held or draining — its hold file says `heldBack`, `draining` or `parked`, or a sessions' drain stands
 *   at this look (`drained`) — and read failed as before otherwise, for the layer above to judge: an ordinary crash is not continued.
 *
 * A job stopped by a person (`canceled`) is read as its worker wrote it.
 */
const heldSighting = (s: Sighting, hold: JobHold | null, lost: () => boolean, drained: () => boolean): Sighting => {
  if (s.state === 'working') return workingWith(s, hold);
  if (hold?.parked && s.state !== 'canceled') return { ...s, state: 'failed', parked: callOf(hold.parked.calling) };
  const held = () => hold?.heldBack !== undefined || hold?.draining !== undefined || drained();
  return s.state === 'failed' && s.nativeId && lost() && held() ? { ...s, parked: callOf(hold?.calling) } : s;
};

/** A working job's sighting `s` with the call its hold file says it is in, and the call it holds back. */
const workingWith = (s: Sighting, hold: JobHold | null): Sighting => ({
  ...s,
  ...(hold?.calling && !s.calling ? { calling: hold.calling } : {}),
  ...(hold?.heldBack ? { heldBack: hold.heldBack } : {}),
});

/** A park's facts with the call it cut, where there was one. */
const callOf = (calling: JobHold['calling']): Parked => (calling ? { calling: { tool: calling.tool, since: calling.since } } : {});

/**
 * A job's sightings, each with what its process wrote on its hold file beside its run (`heldSighting`): the sessions' drain read once per
 * look, and only where a job's lease is gone.
 */
const heldJobs = (spec: HarnessSpec, root: string, seen: ReadonlyMap<string, Sighting>): Map<string, Sighting> => {
  let drain: boolean | undefined;
  const drained = () => (drain ??= sessionDrainOf(sessionDrainFile(root)) !== null);
  return new Map(
    [...seen].map(([name, s]) => [
      name,
      heldSighting(s, readJobHold(besideRun(spec, root, name, HOLD_END)), () => leaseGone(spec, root, name), drained),
    ]),
  );
};

/** The jobs' runner `job`, its looks reading each job's hold file into its sighting (`heldJobs`). */
const withHoldFiles = (job: RunnerOps, spec: HarnessSpec, root: string): RunnerOps => ({
  ...job,
  observe: job.observe.pipe(Effect.map((seen) => heldJobs(spec, root, seen))),
  observeFor: (expected) =>
    verbOf(job, 'observeFor')(expected).pipe(Effect.map((o): Observation => ({ ...o, seen: heldJobs(spec, root, o.seen) }))),
});

/**
 * The verb `verb` of `ops`, one of the runners this module composes, each of which gives it: a runner without it was composed
 * wrong, and is thrown naming the verb rather than called as absent.
 */
const verbOf = <K extends keyof RunnerOps>(ops: RunnerOps, verb: K): NonNullable<RunnerOps[K]> => {
  const given = ops[verb];
  if (given === undefined || given === null)
    throw new Error(`Claude Code's runner was composed of one with no \`${String(verb)}\`: compose it of runners that give it`);
  return given;
};

/**
 * Claude Code's runner: each task a job (`claudeJobSpec`), on its own process, held by the store's sessions' drain, whether or not this
 * process holds the attached sessions; a long-lived task attached beside them (`withAttached`), refused `unstartable` with no holder
 * (`LONG_LIVED_UNHELD`). Every verb is the jobs' runner's, each look reading a job's bridge file and hold file into its sighting
 * (`withBridgeFiles`, `withHoldFiles`). `quota` asks Claude Code for the
 * plan's usage through the Agent SDK (`claudeQuota`), and `answer` is the holder's, where this engine holds the sessions.
 */
export const claudeCodeOps = (options: ClaudeOptions, attached?: Attached): RunnerOps => {
  const root = options.root;
  const { holdMs, holdPollMs } = options;
  const spec = claudeJobSpec(
    options.claudeExecutable,
    {
      root,
      ...(holdMs !== undefined ? { holdMs } : {}),
      ...(holdPollMs !== undefined ? { holdPollMs } : {}),
    },
    options.signInMs,
  );
  const scoped = options.cgroupParent ? { cgroupParent: options.cgroupParent } : {};
  const plain = withHoldFiles(withBridgeFiles(detachedOps(spec, root, scoped), root), spec, root);
  const job = attached ? withAttached(plain, attached) : plain;
  const plainFind = detachedFind(spec, root);
  return {
    ...job,
    find: (name) => (attached?.has(name) ? Effect.succeed({ sessionId: name }) : plainFind(name)),
    spawn: (r) =>
      r.restartPolicy === 'Always' && !attachedLongLived(r, attached)
        ? Effect.fail(new RunnerError({ verb: 'spawn', message: LONG_LIVED_UNHELD(r.name), refused: true }))
        : job.spawn(r),
    refuses: claudeRefuses,
    bridgeAsked,
    interrupt: (session) => interruptThrough(job, session),
    ...answerOf(attached),
    quota: claudeQuota(),
  };
};

/**
 * The turn of `session` ended through `ops`, or refused in words where that runner cannot end one: a job on its own process, which runs
 * its brief to its end.
 */
const interruptThrough = (ops: RunnerOps, session: { name: string; sessionId: string }): Effect.Effect<void, RunnerError> =>
  ops.interrupt
    ? ops.interrupt(session)
    : Effect.fail(
        new RunnerError({
          verb: 'interrupt',
          message: `\`${session.name}\` does not run attached on the Agent SDK, and its turn cannot be ended without ending its session: stop the task to end it.`,
          refused: true,
        }),
      );

/**
 * The verb that answers a call one of the attached sessions holds open, where this engine holds them: a call is caught at a hook only
 * in a session this process drives on the Agent SDK, so an engine with no holder offers no verb at all, and a question of a job's on
 * its own process is refused where it is read rather than routed to a runner with no call waiting.
 */
const answerOf = (attached?: Attached): Pick<RunnerOps, 'answer'> => (attached ? { answer: attached.ops.answer } : {});

/**
 * Whether a request runs attached: one filed `restartPolicy: 'Always'` while this process holds the attached sessions, and no other.
 * A session that stays open until it is stopped runs attached whenever a holder is there — durable by resume, its turns' ends seen,
 * its calls caught and its turn stoppable — and is refused `unstartable` when nothing holds it (`LONG_LIVED_UNHELD`). A job runs on
 * its own process holder or not, so a restart of the holder neither ends it nor moves it to the new release. Read off the world,
 * never off a word invented for one kind of task: every long-lived Claude Code task goes attached without knowing it.
 * Exported only for the tests that import it.
 */
export const attachedLongLived = (r: Pick<SpawnRequest, 'restartPolicy'>, attached?: Pick<Attached, 'holding'>): boolean =>
  r.restartPolicy === 'Always' && attached?.holding() === true;

/**
 * The jobs' runner `job`, with the sessions `attached` runs beside them, both named by the engine (`ae/<task>/<n>`): a long-lived
 * spawn runs attached while this process holds them (`attachedLongLived`), a job on its own process always; each verb given a name
 * goes to the one whose run file it has, so a job spawned before goes on being read; a look lists both. `release` is the jobs' alone:
 * a holder kills its session's child group itself, before a resume.
 */
const withAttached = (job: RunnerOps, attached: Attached): RunnerOps => {
  const a = attached.ops;
  const to = (name: string) => (attached.has(name) ? a : job);
  return {
    ...job,
    spawn: (r) => (attachedLongLived(r, attached) ? a.spawn(r) : job.spawn(r)),
    observe: Effect.all([job.observe, a.observe]).pipe(Effect.map(([jobs, ours]) => new Map([...jobs, ...ours]))),
    observeFor: (expected) => {
      const ours = expected.filter((e) => attached.has(e.name));
      const theirs = expected.filter((e) => !attached.has(e.name));
      return Effect.all([
        theirs.length ? verbOf(job, 'observeFor')(theirs) : Effect.succeed(undefined),
        verbOf(a, 'observeFor')(ours),
      ]).pipe(
        Effect.map(([jobs, mine]): Observation => ({
          ...jobs,
          seen: new Map([...(jobs?.seen ?? []), ...mine.seen]),
          unread: jobs?.unread ?? new Set(),
        })),
      );
    },
    stop: (name) => to(name).stop(name),
    logs: (name) => to(name).logs(name),
    release: (session, task) => (attached.has(session.sessionId) || !job.release ? Effect.succeed(undefined) : job.release(session, task)),
    interrupt: (session) => interruptThrough(to(session.name), session),
    transcript: (name, after) => verbOf(to(name), 'transcript')(name, after),
    say: (session, text) => verbOf(to(session.name), 'say')(session, text),
    follow: (name) => verbOf(to(name), 'follow')(name),
  };
};
