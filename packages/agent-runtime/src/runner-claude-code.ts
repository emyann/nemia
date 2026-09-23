/**
 * Claude Code as the engine runs it by default: a step is a job, and a session a person means to reach is a background one.
 *
 * A job is `claude -p`, detached by the engine's worker (`runner-detached.ts`): it runs its brief to completion and exits,
 * so its end is its exit and its result — no registry to read, no quiet rule, a spend cap it keeps. Under `-p` no mode
 * waits on a prompt; a call it may not make is denied and the session carries on, and the result says what was denied
 * (2.1.280, open issue 11). It reads its brief on its stdin, and words a person says while it works after it, until its
 * result. A background session (`config.background: true`) is `claude --bg` (`claudeOps`): a person can attach to it,
 * say words to it, and bridge it to claude.ai. One harness, two modes, chosen per task.
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
import { claudeOps, type ClaudeOptions, type RunnerOps } from './runner.ts';
import { detachedFind, detachedOps, type HarnessSpec } from './runner-detached.ts';
import { CLAUDE_SESSION_ID_PATTERN, claudePrepare, claudePrintFlags } from './runner-claude-detached.ts';
import { claudeTranscriptEvents, claudeTranscriptFile } from './runner-claude-transcript.ts';
import { CLAUDE_CONTEXT_TOKENS, CLAUDE_POOL, claudeCodeRefuses, claudeRefuses } from './runner-claude-vocabulary.ts';
import { claudeStreamOutput } from './runner-detached-output.ts';

/**
 * A step run as a job: `claude -p`, its output a stream. The stream's first line names the session, so its id is known
 * while it runs and its transcript can be read then; each call it was denied is a line as it happens, so a job killed
 * before its result still says what it was denied (`claudeStreamOutput`). `--verbose` is what `-p` needs to print a
 * stream at all. `--permission-prompts none` says what `-p` does in every mode, measured on 2.1.280: a call that would
 * ask is denied, never waited on — said here so a later default cannot make a job wait on a person who is not there.
 *
 * Its input is a stream too (`--input-format stream-json`): the brief is the first user message on its stdin, and each
 * word said to it while it works is another, which it takes into the turn it is working (M6). It reads its stdin until
 * it ends, so the worker ends it at the job's first result, and the job exits. Its closeout, its spend cap and what it is
 * denied are as they are under a prompt (M8–M10, 2.1.280).
 */
export const claudeJob: HarnessSpec = {
  name: 'claude',
  command: (r, io) => ({
    cmd: 'claude',
    args: ['-p', '--input-format', 'stream-json', '--output-format', 'stream-json', '--verbose', '--permission-prompts', 'none', ...claudePrintFlags(r, io)],
  }),
  // A user message, as M6 wrote them; the session is the job's own, so it names none.
  input: {
    line: (text) => JSON.stringify({ type: 'user', message: { role: 'user', content: text } }),
    // Its result: the line after which a `-p` session reads nothing more, and whose `type` it prints far down the line (2.1.280).
    closesOn: { key: 'type', value: 'result' },
  },
  readOutput: claudeStreamOutput,
  nativeIdPattern: CLAUDE_SESSION_ID_PATTERN,
  transcript: { file: claudeTranscriptFile, events: claudeTranscriptEvents },
  prepare: claudePrepare,
  refuses: claudeRefuses,
  contextTokens: CLAUDE_CONTEXT_TOKENS,
  pool: CLAUDE_POOL,
  // `claude -p --resume` prints its parent's cost and API time on in its own (2.1.280, open issue 4).
  resumeCostCarried: true,
};

/** Whether a session id is a job's: the name the engine gave it, where a background session's is Claude Code's own. */
export const isClaudeJob = (sessionId: string) => nameParts(sessionId) !== undefined;

export const claudeCodeOps = (options: ClaudeOptions = {}): RunnerOps => {
  const root = options.root ?? path.join(os.homedir(), '.agent-engine');
  const job = detachedOps(claudeJob, root);
  const findJob = detachedFind(claudeJob, root);
  const bg = claudeOps({ ...options, root });
  const of = (sessionId: string) => (isClaudeJob(sessionId) ? job : bg);

  // One mode's registry unreadable must not blind the engine to the other's sessions, as for the composite's harnesses.
  const seen = (ops: RunnerOps) => ops.observe.pipe(Effect.catchCause(() => Effect.succeed(new Map<string, Sighting>())));

  return {
    spawn: (r) => (r.config?.background ? bg : job).spawn(r),
    refuses: claudeCodeRefuses,

    observe: Effect.all([seen(job), seen(bg)], { concurrency: 'unbounded' }).pipe(
      Effect.map(([jobs, sessions]) => new Map([...jobs, ...sessions])),
    ),

    // The job's own run file first — one file, never the jobs' output, which a transcript in flight would re-read on
    // every poll — and then Claude Code's registration.
    find: (name) => findJob(name).pipe(Effect.flatMap((found) => (found ? Effect.succeed(found) : bg.find!(name)))),

    stop: (sessionId) => of(sessionId).stop(sessionId),
    logs: (sessionId) => of(sessionId).logs(sessionId),

    // A job's run file is its record, as `logs` reads it: there is nothing to let go of.
    release: (session, task) => (isClaudeJob(session.sessionId) ? Effect.succeed(undefined) : bg.release!(session, task)),

    // A job read by its name while it runs; by Claude Code's id — an ended job's, or a background session's — the same
    // transcript file either way, which the background reader finds by that id.
    transcript: (sessionId, after) => of(sessionId).transcript!(sessionId, after),

    // A job's words go to its inbox, which its worker writes on to its stdin; a background session's to Claude Code's inbox.
    say: (session, text) => of(session.sessionId).say!(session, text),
  };
};
