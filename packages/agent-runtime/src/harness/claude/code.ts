/**
 * Claude Code as the engine runs it by default: a step is a job, and a session a person means to reach is a background one.
 *
 * A job is `claude -p`, detached by the engine's worker (`harness/detached/detached.ts`): it runs its brief to completion and exits,
 * so its end is its exit and its result — no registry to read, no quiet rule, a spend cap it keeps. Under `-p` no mode
 * waits on a prompt; a call it may not make is denied and the session carries on, and the result says what was denied.
 * It reads its brief on its stdin, and words a person says while it works after it, until its result. A background session
 * (`config.background: true`) is `claude --bg` (`claudeOps`): a person can attach to it, say words to it, and bridge it to
 * claude.ai. One harness, two modes, chosen per task.
 *
 * Every verb given a session id finds its mode by the id's shape, with nothing remembered: a job is known by the name the
 * engine gave it (`ae/<task>/<n>`), and a background session by Claude Code's own id. So a stop or a read asked after a
 * restart, before any observe, reaches the right one. A job resumed from a background session's id is a job: the mode
 * is the new attempt's, and `claude -p --resume` continues a `--bg` session.
 */
import { Effect } from 'effect';
import os from 'node:os';
import path from 'node:path';
import type { Sighting } from '../../core/domain.ts';
import { nameParts } from '../../core/domain.ts';
import { claudeOps, type ClaudeOptions, type Observation, type RunnerOps } from '../../runner.ts';
import { detachedFind, detachedOps, type HarnessSpec } from '../detached/detached.ts';
import { CLAUDE_SESSION_ID_PATTERN, claudePrepare, claudePrintFlags } from '../../runner-claude-detached.ts';
import { claudeTranscriptEvents, claudeTranscriptFile } from './transcript.ts';
import { CLAUDE_CONTEXT_TOKENS, claudeCodeRefuses, claudePrintRefuses } from './vocabulary.ts';
import { claudeStreamOutput } from '../detached/output.ts';

/**
 * A step run as a job: `claude -p`, its output a stream. The stream's first line names the session, so its id is known
 * while it runs and its transcript can be read then; each call it was denied is a line as it happens, so a job killed
 * before its result still says what it was denied (`claudeStreamOutput`). `--verbose` is what `-p` needs to print a
 * stream at all. `--permission-prompts none` says what `-p` does in every mode: a call that would ask is denied, never
 * waited on — said on the command line, so no default of Claude Code's can make a job wait on a person who is not there.
 *
 * Its input is a stream too (`--input-format stream-json`): the brief is the first user message on its stdin, and each
 * word said to it while it works is another, which it takes into the turn it is working. It reads its stdin until
 * it ends, so the worker ends it at the job's first result, and the job exits. Its closeout, its spend cap and what it is
 * denied are as they are under a prompt.
 *
 * - `input.line`: a user message; the session is the job's own, so it names none.
 * - `input.closesOn`: its result, the line after which a `-p` session reads nothing more; Claude Code prints its `type` far
 *   down the line, so it is parsed, never matched at the line's start.
 * - `resumeCostCarried`: `claude -p --resume` prints its parent's cost and API time on in its own.
 */
export const claudeJob: HarnessSpec = {
  name: 'claude',
  command: (r, io) => ({
    cmd: 'claude',
    args: [
      '-p',
      '--input-format',
      'stream-json',
      '--output-format',
      'stream-json',
      '--verbose',
      '--permission-prompts',
      'none',
      ...claudePrintFlags(r, io),
    ],
  }),
  input: {
    line: (text) => JSON.stringify({ type: 'user', message: { role: 'user', content: text } }),
    closesOn: { key: 'type', value: 'result' },
  },
  readOutput: claudeStreamOutput,
  nativeIdPattern: CLAUDE_SESSION_ID_PATTERN,
  transcript: { file: claudeTranscriptFile, events: claudeTranscriptEvents },
  prepare: claudePrepare,
  refuses: claudePrintRefuses,
  contextTokens: CLAUDE_CONTEXT_TOKENS,
  claudeFlags: true,
  resumeCostCarried: true,
};

/** Whether a session id is a job's: the name the engine gave it, where a background session's is Claude Code's own. */
export const isClaudeJob = (sessionId: string) => nameParts(sessionId) !== undefined;

/**
 * Claude Code's runner: a job (`claudeJob`) or a background session (`claudeOps`) per task, each verb given a session id
 * sent to the mode its id's shape names (`isClaudeJob`).
 *
 * - `observe` lists both modes; one mode's registry unreadable does not blind the engine to the other's sessions, as for
 *   the composite's harnesses: a read that failed lists nothing.
 * - `find` reads the job's own run file first — one file, never the jobs' output, which a transcript in flight would
 *   re-read on every poll — and then Claude Code's registration.
 * - `release` lets a background session go; a job's run file is its record, as `logs` reads it, so a job has nothing to
 *   let go of.
 * - `transcript` reads a job by its name while it runs, and by Claude Code's id — an ended job's, or a background
 *   session's — the same transcript file either way, which the background reader finds by that id.
 * - `say` sends a job's words to its inbox, which its worker writes on to its stdin, and a background session's to Claude
 *   Code's inbox.
 */
export const claudeCodeOps = (options: ClaudeOptions = {}): RunnerOps => {
  const root = options.root ?? path.join(os.homedir(), '.agent-engine');
  const job = detachedOps(claudeJob, root);
  const findJob = detachedFind(claudeJob, root);
  const bg = claudeOps({ ...options, root });
  const of = (sessionId: string) => (isClaudeJob(sessionId) ? job : bg);

  const read = (ops: RunnerOps) =>
    ops.observe.pipe(
      Effect.map((m): Map<string, Sighting> | undefined => m),
      Effect.catchCause(() => Effect.succeed(undefined)),
    );
  const seen = (ops: RunnerOps) => read(ops).pipe(Effect.map((m) => m ?? new Map<string, Sighting>()));

  return {
    spawn: (r) => (r.config?.background ? bg : job).spawn(r),
    refuses: claudeCodeRefuses,

    observe: Effect.all([seen(job), seen(bg)], { concurrency: 'unbounded' }).pipe(
      Effect.map(([jobs, sessions]) => new Map([...jobs, ...sessions])),
    ),

    /**
     * The jobs, off their run files, and Claude Code's registry only when a session expected is not among them: it asks
     * `claude agents` only for a session it expects that is no job, so a pass with only jobs in flight spawns none. Read
     * off the world, never off a task's config: a task filed on this harness may run `--bg` without its config saying so,
     * and a job whose run file is not there is looked for in the registry too — once its grace is past, the pass reads it
     * lost either way. A job listing that cannot be read this time asks the registry, as `observe` would.
     *
     * An expected name that neither listing has is `unread` when a read that could have listed it failed: the job listing, or
     * the registry once asked. A job's name the registry was asked for and does not list, with the jobs read, is absent.
     */
    observeFor: (expected) =>
      read(job).pipe(
        Effect.flatMap((jobs) =>
          !jobs || expected.some((e) => !jobs.has(e.name))
            ? read(bg).pipe(Effect.map((sessions) => ({ jobs, sessions })))
            : Effect.succeed({ jobs, sessions: new Map<string, Sighting>() }),
        ),
        Effect.map(({ jobs, sessions }): Observation => {
          const seen = new Map([...(jobs ?? []), ...(sessions ?? [])]);
          const failed = !jobs || !sessions;
          return { seen, unread: new Set(failed ? expected.map((e) => e.name).filter((name) => !seen.has(name)) : []) };
        }),
      ),

    find: (name) => findJob(name).pipe(Effect.flatMap((found) => (found ? Effect.succeed(found) : bg.find!(name)))),

    stop: (sessionId) => of(sessionId).stop(sessionId),
    logs: (sessionId) => of(sessionId).logs(sessionId),

    release: (session, task) => (isClaudeJob(session.sessionId) ? Effect.succeed(undefined) : bg.release!(session, task)),

    transcript: (sessionId, after) => of(sessionId).transcript!(sessionId, after),

    say: (session, text) => of(session.sessionId).say!(session, text),
  };
};
