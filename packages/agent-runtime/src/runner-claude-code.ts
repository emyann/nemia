/**
 * Claude Code as the engine runs it by default: a step is a job, and a session a person means to reach is a background one.
 *
 * A job is `claude -p`, detached by the engine's worker (`runner-detached.ts`): it runs its brief to completion and exits,
 * so its end is its exit and its result — no registry to read, no quiet rule, a spend cap it keeps. Under `-p` no mode
 * waits on a prompt; a call it may not make is denied and the session carries on, and the result says what was denied
 * (2.1.280, open issue 11). A background session (`config.background: true`) is `claude --bg` (`claudeOps`): a person can
 * attach to it, say words to it, and bridge it to claude.ai. One harness, two modes, chosen per task.
 *
 * Every verb given a session id finds its mode by the id's shape, with nothing remembered: a job is known by the name the
 * engine gave it (`ae/<task>/<n>`), and a background session by Claude Code's own id. So a stop or a read asked after a
 * restart, before any observe, reaches the right one. A job resumed from a background session's id is a job: the mode
 * is the new attempt's, and `claude -p --resume` continues a `--bg` session (measured on 2.1.280).
 */
import { Effect } from 'effect';
import os from 'node:os';
import path from 'node:path';
import type { Sighting } from './domain.ts';
import { nameParts } from './a2a-map.ts';
import { claudeOps, RunnerError, type ClaudeOptions, type RunnerOps } from './runner.ts';
import { detachedOps, type HarnessSpec } from './runner-detached.ts';
import { CLAUDE_SESSION_ID_PATTERN, claudePrepare, claudePrintArgs } from './runner-claude-detached.ts';
import { claudeTranscriptEvents, claudeTranscriptFile } from './runner-claude-transcript.ts';
import { CLAUDE_CONTEXT_TOKENS, CLAUDE_POOL, claudeCodeRefuses, claudeRefuses } from './runner-claude-vocabulary.ts';
import { claudeStreamOutput } from './runner-detached-output.ts';

/**
 * A step run as a job: `claude -p`, its output a stream. The stream's first line names the session, so its id is known
 * while it runs and its transcript can be read then; each call it was denied is a line as it happens, so a job killed
 * before its result still says what it was denied (`claudeStreamOutput`). `--verbose` is what `-p` needs to print a
 * stream at all. `--permission-prompts none` says what `-p` does in every mode, measured on 2.1.280: a call that would
 * ask is denied, never waited on — said here so a later default cannot make a job wait on a person who is not there.
 */
export const claudeJob: HarnessSpec = {
  name: 'claude',
  command: (r, io) => ({
    cmd: 'claude',
    args: claudePrintArgs(r, io, ['--output-format', 'stream-json', '--verbose', '--permission-prompts', 'none']),
  }),
  readOutput: claudeStreamOutput,
  nativeIdPattern: CLAUDE_SESSION_ID_PATTERN,
  transcript: { file: claudeTranscriptFile, events: claudeTranscriptEvents },
  noChannel: 'A job (`claude -p`) is given its brief and takes no words while it runs. File the task with `config.background: true` to be able to tell it something, or continue its session with a new task that carries the words (`resumeFrom`).',
  prepare: claudePrepare,
  refuses: claudeRefuses,
  contextTokens: CLAUDE_CONTEXT_TOKENS,
  pool: CLAUDE_POOL,
  // `claude -p --resume` prints its parent's cost and API time on in its own (2.1.280, open issue 4).
  resumeCostCarried: true,
};

/** Whether a session id is a job's: the name the engine gave it, where a background session's is Claude Code's own. */
const isJob = (sessionId: string) => nameParts(sessionId) !== undefined;

export const claudeCodeOps = (options: ClaudeOptions = {}): RunnerOps => {
  const root = options.root ?? path.join(os.homedir(), '.agent-engine');
  const job = detachedOps(claudeJob, root);
  const bg = claudeOps({ ...options, root });
  const of = (sessionId: string) => (isJob(sessionId) ? job : bg);

  // One mode's registry unreadable must not blind the engine to the other's sessions, as for the composite's harnesses.
  const seen = (ops: RunnerOps) => ops.observe.pipe(Effect.catchCause(() => Effect.succeed(new Map<string, Sighting>())));

  return {
    spawn: (r) => (r.config?.background ? bg : job).spawn(r),
    refuses: claudeCodeRefuses,

    observe: Effect.all([seen(job), seen(bg)], { concurrency: 'unbounded' }).pipe(
      Effect.map(([jobs, sessions]) => new Map([...jobs, ...sessions])),
    ),

    // The job's run file first — a directory read — and then Claude Code's registration.
    find: (name) => job.observe.pipe(
      Effect.flatMap((jobs) => (jobs.has(name) ? Effect.succeed({ sessionId: jobs.get(name)!.sessionId }) : bg.find!(name))),
    ),

    stop: (sessionId) => of(sessionId).stop(sessionId),
    logs: (sessionId) => of(sessionId).logs(sessionId),

    // A job's run file is its record, as `logs` reads it: there is nothing to let go of.
    release: (session, task) => (isJob(session.sessionId) ? Effect.succeed(undefined) : bg.release!(session, task)),

    // A job read by its name while it runs; by Claude Code's id — an ended job's, or a background session's — the same
    // transcript file either way, which the background reader finds by that id.
    transcript: (sessionId, after) => of(sessionId).transcript!(sessionId, after),

    say: (session, text) => isJob(session.sessionId)
      ? Effect.fail(new RunnerError({ verb: 'say', message: `claude: ${claudeJob.noChannel}` }))
      : bg.say!(session, text),
  };
};
