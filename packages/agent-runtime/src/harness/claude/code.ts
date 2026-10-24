/**
 * Claude Code as the engine runs it: every session on the Agent SDK. A task is a job, and a long-lived session
 * (`restartPolicy: 'Always'`) is held attached.
 *
 * A job is one session on the Agent SDK, in a process of its own (`bin/ae-claude-job.ts`), detached by the engine's worker
 * (`harness/detached/detached.ts`), or attached in the process that holds this runtime's sessions while one does (`attached.ts`): it
 * runs its brief to completion and exits, so its end is its exit and its result — no registry to read, no quiet rule, a spend cap it
 * keeps. Nobody is there to ask (`permissionPrompts: 'none'`); a call it may not make is denied and the session carries on, and the
 * result says what was denied. It reads its brief on its stdin, and words a person says while it works after it, until its result.
 *
 * A long-lived session runs attached, in the process that holds the sessions (a daemon), and nowhere else: with no holder its spawn
 * is refused, `unstartable`, in words naming the holder to start (`LONG_LIVED_UNHELD`).
 *
 * Either is bridged to claude.ai where its task asks (`claude.remoteControl`), on its first message (`attached-bridge.ts`): a held
 * session's bridge is on its run file, a job's on the bridge file its own process writes beside its run (`HarnessIO.bridgeFile`),
 * which this runner reads into the job's sighting on every look.
 *
 * A job's own options are the attached road's, fact for fact (`attachedOptions`), built in its process from the spawn request the
 * runner wrote for it: one translation of a task into a Claude Code session, whether a daemon holds it or nothing does. It runs with
 * background tasks off (`CLAUDE_JOB_ENV`, laid on its session's own environment by `attachedOptions`).
 */
import { Effect, Schema } from 'effect';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import type { Sighting } from '../../core/index.ts';
import { claudeQuota } from './quota.ts';
import type { Observation, RunnerOps, SpawnRequest } from '../seam.ts';
import { besideRun, detachedFind, detachedOps, type HarnessIO, type HarnessSpec, type StartEvent } from '../detached/detached.ts';
import { claudeTranscriptEvents, claudeTranscriptFile, claudeTranscriptRecords } from './transcript.ts';
import { CLAUDE_CONTEXT_TOKENS, bridgeAsked, claudeCodeRefuses, claudeRefuses } from './vocabulary.ts';
import { claudePartials, claudeStreamKept, claudeStreamOutput } from '../detached/output.ts';
import { checkoutMcpConfig } from '../mcp.ts';
import { RunnerError } from '../error.ts';
import { BridgeFactsSchema, bridgeOf, type AttachedBridge } from './attached-bridge.ts';
import type { Attached } from './attached.ts';

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
};

export { CLAUDE_JOB_ENV } from './job-env.ts';

/** How a job's stream starts: its first line, `system`/`init`, and its `session_id`. */
export const CLAUDE_INIT_START: StartEvent = { event: { type: 'system', subtype: 'init' }, id: 'session_id' };

/** The end of the file a job's process writes its bridge on, beside its run (`besideRun`). */
const BRIDGE_END = 'bridge';

/**
 * What a job is given of the machine before it runs: the checkout's `.mcp.json`, found on disk here so that `command` stays a function
 * of what it is given — none for a task that says which of its servers it loads (`checkoutMcp`), those being in the task's own config
 * — and, where the task asks for a bridge (`bridgeAsked`), the file its process writes the bridge's facts on (`bridgeFile`), beside its
 * run, a former attempt's under the name cleared first so a look never reads its bridge as this one's.
 */
export const claudePrepare = (r: SpawnRequest, beside?: (end: string) => string): Partial<HarnessIO> => {
  const found = r.config?.checkoutMcp ? undefined : checkoutMcpConfig(r.cwd);
  const io: Partial<HarnessIO> = found ? { checkoutMcpConfig: found } : {};
  if (!bridgeAsked(r) || beside === undefined) return io;
  const bridgeFile = beside(BRIDGE_END);
  fs.rmSync(bridgeFile, { force: true });
  return { ...io, bridgeFile };
};

/** The process one Claude Code job's session runs in, `bin/ae-claude-job.ts`, found from this file's own folder as `WORKER` is. */
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
 * Nobody is there to ask, so the bin runs the session `permissionPrompts: 'none'` (`sdk.d.ts:2054`): a call that would ask is
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
 * - `prepare`: for the bridge file it names where the task asks for one (`claudePrepare`), and for what it throws — the servers ride
 *   `Options.mcpServers`, read by `everyMcpServer` inside the bin, and a job writes no MCP config file: a checkout whose `.mcp.json`
 *   is not JSON refuses the spawn here, before the worker starts, so the attempt ends `unstartable` in those words rather than
 *   failing inside the bin.
 * - `refuses`: what Claude Code cannot be asked for (`claudeRefuses`); a bridge it opens itself.
 */
export const claudeJobSpec = (executable?: string): HarnessSpec => ({
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
  prepare: claudePrepare,
  refuses: claudeRefuses,
  contextTokens: CLAUDE_CONTEXT_TOKENS,
  checkoutMcp: true,
  enabledSkills: true,
  env: true,
  claudeFlags: true,
  mounts: { readOnly: true, writable: true },
  callAdmission: true,
  resumeCostCarried: true,
});

/** A job's spec as the engine runs it with the Claude Code on the PATH: `claudeJobSpec()`, named for the readers that take a spec. */
export const claudeJob: HarnessSpec = claudeJobSpec();

/**
 * Why a long-lived Claude Code spawn is refused where no process holds this runtime's sessions: such a session runs attached, in the
 * holder, and nowhere else. A `RunnerError` with `refused`, so the attempt ends `unstartable` in these words and is not restarted.
 */
export const LONG_LIVED_UNHELD = (name: string): string =>
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
 * Claude Code's runner: each task a job (`claudeJobSpec`), on its own process or, while this process holds the sessions, attached
 * beside them (`withAttached`); a long-lived task attached, refused `unstartable` with no holder (`LONG_LIVED_UNHELD`). Every verb is
 * the jobs' runner's, each look reading a job's bridge file into its sighting (`withBridgeFiles`). `quota` asks Claude Code for the
 * plan's usage through the Agent SDK (`claudeQuota`), and `answer` is the holder's, where this engine holds the sessions.
 */
export const claudeCodeOps = (options: ClaudeOptions, attached?: Attached): RunnerOps => {
  const root = options.root;
  const spec = claudeJobSpec(options.claudeExecutable);
  const plain = withBridgeFiles(detachedOps(spec, root), root);
  const job = attached ? withAttached(plain, attached) : plain;
  const plainFind = detachedFind(spec, root);
  return {
    ...job,
    find: (name) => (attached?.has(name) ? Effect.succeed({ sessionId: name }) : plainFind(name)),
    spawn: (r) =>
      r.restartPolicy === 'Always' && !attachedLongLived(r, attached)
        ? Effect.fail(new RunnerError({ verb: 'spawn', message: LONG_LIVED_UNHELD(r.name), refused: true }))
        : job.spawn(r),
    refuses: claudeCodeRefuses,
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
 * Whether a long-lived request runs attached: one filed `restartPolicy: 'Always'` while this process holds the attached sessions. A
 * session that stays open until it is stopped runs attached whenever a holder is there — durable by resume, its turns' ends seen, its
 * calls caught and its turn stoppable — and is refused `unstartable` when nothing holds it (`LONG_LIVED_UNHELD`). Read off the world,
 * never off a word invented for one kind of task: every long-lived Claude Code task goes attached without knowing it.
 */
export const attachedLongLived = (r: Pick<SpawnRequest, 'restartPolicy'>, attached?: Pick<Attached, 'holding'>): boolean =>
  r.restartPolicy === 'Always' && attached?.holding() === true;

/**
 * The jobs' runner `job`, with the sessions `attached` runs beside them, both named by the engine (`ae/<task>/<n>`): a spawn runs
 * attached while this process holds them, a job otherwise; each verb given a name goes to the one whose run file it has, so a job
 * spawned before goes on being read; a look lists both.
 */
const withAttached = (job: RunnerOps, attached: Attached): RunnerOps => {
  const a = attached.ops;
  const to = (name: string) => (attached.has(name) ? a : job);
  return {
    ...job,
    spawn: (r) => (attached.holding() ? a.spawn(r) : job.spawn(r)),
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
    interrupt: (session) => interruptThrough(to(session.name), session),
    transcript: (name, after) => verbOf(to(name), 'transcript')(name, after),
    say: (session, text) => verbOf(to(session.name), 'say')(session, text),
    follow: (name) => verbOf(to(name), 'follow')(name),
  };
};
