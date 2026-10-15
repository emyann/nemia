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
 *
 * A job's argv is built here too (`claudePrintArgs`), and so is `claude-detached` (`claudeDetached`): Claude Code run as
 * `claude -p`, detached by the engine's worker rather than by the harness, whose output is one JSON object at its exit.
 * Both run with background tasks off (`CLAUDE_JOB_ENV`); a background session's environment is its own.
 */
import { Effect, Stream } from 'effect';
import os from 'node:os';
import path from 'node:path';
import { nameParts, type Sighting } from '../../core/index.ts';
import { claudeOps, type ClaudeOptions } from './bg.ts';
import { claudeQuota } from './quota.ts';
import type { Observation, RunnerOps, SpawnRequest } from '../seam.ts';
import { causeWords } from '../error.ts';
import { detachedFind, detachedOps, type HarnessIO, type HarnessSpec, type StartEvent } from '../detached/detached.ts';
import { claudeTranscriptEvents, claudeTranscriptFile, claudeTranscriptRecords } from './transcript.ts';
import {
  CLAUDE_CONTEXT_TOKENS,
  CLAUDE_DEFAULT_MODE,
  claudeCodeRefuses,
  claudeAllowArgs,
  claudeDenyArgs,
  claudeFlagsOf,
  claudeMountArgs,
  claudePrintRefuses,
  worktreeName,
} from './vocabulary.ts';
import { admittedFlags } from './admission.ts';
import { claudeTelemetryEnv } from './telemetry.ts';
import { CLAUDE_JOB_ENV } from './job-env.ts';
import { claudePartials, claudeResultOutput, claudeStreamKept, claudeStreamOutput } from '../detached/output.ts';
import { checkoutMcpConfig, claudeMcpArgs } from '../mcp.ts';
import { RunnerError } from '../error.ts';
import type { Attached } from './attached.ts';

/**
 * The arguments `claude -p` is given, whichever of the engine's specs runs it, given how its output is to be printed: the
 * format goes first, where the brief's `-p` has already taken its value and the variadic lists after it cannot take one.
 */
export const claudePrintArgs = (r: SpawnRequest, io: HarnessIO | undefined, output: string[]): string[] => [
  '-p',
  r.brief,
  ...output,
  ...claudePrintFlags(r, io),
];

/**
 * What `claude -p` is given beside its brief and its formats: the same whether the brief is `-p`'s value or the first line
 * on its stdin (`claudeJob`). In order:
 *
 * 1. `--tools`, `--disallowedTools` and `--allowedTools`, each joined by commas: variadic, and ended by the flag after
 *    each, as for `claude --bg`. The allow list is not the fence's opposite: a rule there says a tool the session has may
 *    be used without asking a person who is not there. In `dontAsk` a mode that never asks also never allows a write, even
 *    in the session's own cwd, so a fenced session that must write its own work is given `Edit(**)`, a glob resolved
 *    against its `cwd`: unscoped (`Write`) it would write anywhere, scoped it is denied outside. A deny still beats it.
 *    The deny list also holds each read-only mount: an edit under it is denied (`claudeDenies`); the allow list each writable
 *    one: an edit under it is allowed (`claudeAllows`).
 * 2. `--add-dir` and each mount's path (`claudeMountArgs`): variadic, and ended by the flag after it.
 * 3. The caller's own flags (`config.claude`), the task's admission merged into `--settings` as a hook (`admittedFlags`): after the
 *    variadic lists, which any flag ends, and before the mode.
 * 4. `--permission-mode`, `auto` unless the task names one.
 * 5. The MCP configurations, strict on every spawn as for `claude --bg`: the checkout's `.mcp.json` and the task's own.
 * 6. `--setting-sources project`, one value: a job reads its cwd's `.claude/settings.json`, and neither that cwd's
 *    `settings.local.json`, where a person's "don't ask again" writes allow rules, nor anything of `~/.claude/` — the
 *    user's mode, allow rules, plugins, skills, hooks, model and effort — so it does the same on any machine and in any
 *    checkout, and an agent's own skills do not share the listing's budget with a person's. `--settings`, `--plugin-dir`
 *    and `--mcp-config` still reach it.
 * 7. `--model` and `--effort`, where the task names them.
 * 8. `--autocompact`, the context window, as for `claude --bg`: `claude -p` compacts past it and still gives its
 *    `structured_output`.
 * 9. `--json-schema`, the closing statement's shape, as for `claude --bg`: the answer comes back as the result's
 *    `structured_output`.
 * 10. `--resume` and `--worktree`, where the task continues a session or asks for a worktree.
 * 11. `--max-budget-usd`, the spend cap: `claude -p` ends the session once a response takes it past, and says so in its
 *     result.
 */
export const claudePrintFlags = (r: SpawnRequest, io: HarnessIO | undefined): string[] => [
  ...(r.config?.tools ? ['--tools', r.config?.tools.join(',')] : []),
  ...claudeDenyArgs(r.config),
  ...claudeAllowArgs(r.config),
  ...claudeMountArgs(r.config),
  ...claudeFlagsOf(admittedFlags(r.config)),
  '--permission-mode',
  r.config?.permissionMode ?? CLAUDE_DEFAULT_MODE,
  ...claudeMcpArgs([io?.checkoutMcpConfig, io?.mcpConfigFile]),
  '--setting-sources',
  'project',
  ...(r.config?.model ? ['--model', r.config?.model] : []),
  ...(r.config?.effort ? ['--effort', r.config?.effort] : []),
  ...(r.config?.contextTokens !== undefined ? ['--autocompact', String(r.config?.contextTokens)] : []),
  ...(r.closeoutSchema ? ['--json-schema', JSON.stringify(r.closeoutSchema)] : []),
  ...(r.resumeFrom ? ['--resume', r.resumeFrom] : []),
  ...(r.config?.worktree ? ['--worktree', worktreeName(r)] : []),
  ...(r.config?.budgetUsd !== undefined ? ['--max-budget-usd', String(r.config.budgetUsd)] : []),
];

export { CLAUDE_JOB_ENV } from './job-env.ts';

/** How `claude -p --output-format stream-json`'s start decodes: its first line, `system`/`init`, and its `session_id`. */
export const CLAUDE_INIT_START: StartEvent = { event: { type: 'system', subtype: 'init' }, id: 'session_id' };

/** How `claude -p --output-format json`'s start decodes: the one object it prints, as it exits, a `result`, and its `session_id`. */
export const CLAUDE_RESULT_START: StartEvent = { event: { type: 'result' }, id: 'session_id' };

/**
 * The checkout's `.mcp.json`, found on disk here so that `command` stays a function of what it is given. None for a task that
 * says which of its servers it loads (`checkoutMcp`): those are in the task's own config file, and the checkout's is left out.
 */
export const claudePrepare = (r: SpawnRequest): Partial<HarnessIO> => {
  if (r.config?.checkoutMcp) return {};
  const found = checkoutMcpConfig(r.cwd);
  return found ? { checkoutMcpConfig: found } : {};
};

/**
 * Claude Code run as `claude -p`, detached by the engine's worker rather than by the harness, its output one JSON object.
 *
 * - `command` asks for `--output-format json`: one object when it exits, which `readOutput` reads the final answer from —
 *   text output prints only the answer's prose — and which carries the session id, its `start` (`CLAUDE_RESULT_START`).
 * - `transcript` is the one `claude --bg` writes, read the same way, but only once the session has exited: its id is in
 *   the one object `--output-format json` prints, and that is printed last.
 */
export const claudeDetached: HarnessSpec = {
  name: 'claude-detached',
  command: (r, io) => ({
    cmd: 'claude',
    args: claudePrintArgs(r, io, ['--output-format', 'json']),
    env: { ...r.config?.env, ...CLAUDE_JOB_ENV, ...claudeTelemetryEnv(r) },
  }),
  readOutput: claudeResultOutput,
  start: CLAUDE_RESULT_START,
  transcript: { file: claudeTranscriptFile, events: claudeTranscriptEvents, records: claudeTranscriptRecords },
  noChannel:
    "`claude -p` listens for messages, but this harness learns its session's id only from what it prints as it exits, so nothing can be addressed to one while it runs. File the task on `claude`, whose jobs take words on their stdin, to be able to tell it something, or continue its session with a new task that carries the words (`resumeFrom`).",
  prepare: claudePrepare,
  refuses: claudePrintRefuses,
  contextTokens: CLAUDE_CONTEXT_TOKENS,
  checkoutMcp: true,
  env: true,
  claudeFlags: true,
  mounts: { readOnly: true, writable: true },
  callAdmission: true,
};

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
 * - `streams` and `partials`: `--include-partial-messages` prints each text block in pieces as it is written, read from the stdout
 *   the worker keeps whole, so the job is followed live (`follow`, `claudePartials`).
 * - `keepOutput`: once the job has ended, its capture keeps only what the readers read (`claudeStreamKept`); the conversation is
 *   Claude Code's own transcript's (`transcript`).
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
      '--include-partial-messages',
      '--permission-prompts',
      'none',
      ...claudePrintFlags(r, io),
    ],
    env: { ...r.config?.env, ...CLAUDE_JOB_ENV, ...claudeTelemetryEnv(r) },
  }),
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
  refuses: claudePrintRefuses,
  contextTokens: CLAUDE_CONTEXT_TOKENS,
  checkoutMcp: true,
  env: true,
  claudeFlags: true,
  mounts: { readOnly: true, writable: true },
  callAdmission: true,
  resumeCostCarried: true,
};

/** A part of a look, read: what it answered, or what its failure said (`causeWords`). */
type Read<A> = { value: A; why?: undefined } | { value?: undefined; why: string };

/** The registry's part of a look that never asked it: nothing listed, nothing unread, nothing failed. */
const NOTHING_ASKED: Read<Observation> = { value: { seen: new Map<string, Sighting>(), unread: new Set<string>() } };

/** Why each of `names` was unread, as the reads that answered said it (`Observation.unreadWhy`), the registry's words last. */
const unreadWhyIn = (names: ReadonlySet<string>, ...reads: (Observation | undefined)[]): Map<string, string> =>
  new Map(reads.flatMap((o) => [...(o?.unreadWhy ?? [])].filter(([name]) => names.has(name))));

/** Whether a session id is a job's: the name the engine gave it, where a background session's is Claude Code's own. */
export const isClaudeJob = (sessionId: string) => nameParts(sessionId) !== undefined;

/**
 * Claude Code's runner: a job (`claudeJob`) or a background session (`claudeOps`) per task, each verb given a session id
 * sent to the mode its id's shape names (`isClaudeJob`).
 *
 * - `observe` lists both modes; one mode's registry unreadable does not blind the engine to the other's sessions, as for
 *   the composite's harnesses: a read that failed lists nothing.
 * - `observeFor` reads the jobs it is told of by name, each one's run file and output and no other job's, and the registry
 *   only for a name no job answers.
 * - `find` reads the job's own run file first — one file, never the jobs' output, which a transcript in flight would
 *   re-read on every poll — and then Claude Code's registration.
 * - `release` lets a background session go; a job's run file is its record, as `logs` reads it, so a job has nothing to
 *   let go of.
 * - `transcript` reads a job by its name while it runs, and by Claude Code's id — an ended job's, or a background
 *   session's — the same transcript file either way, which the background reader finds by that id.
 * - `follow` follows a job live (`claudePartials`), and a background session, a name no job's run file answers as `find` reads it,
 *   from its transcript and `claude agents`, at message level (`bgFollowOf`).
 * - `say` sends a job's words to its inbox, which its worker writes on to its stdin, and a background session's to Claude
 *   Code's inbox.
 * - `quota` asks the `claude` on PATH for the plan's usage (`claudeQuota`), whichever mode the sessions run in.
 * - `forget` removes what either mode keeps under the session's name, since a name the engine gave does not say which mode
 *   ran it, and names the transcript once.
 * - `kept` names what either mode keeps under each session's name, joined the same way, a path named once.
 * - `compact` rewrites the jobs' ended captures to what their readers read (`claudeStreamKept`); a background session keeps none.
 */
export const claudeCodeOps = (options: ClaudeOptions = {}, attached?: Attached): RunnerOps => {
  const root = options.root ?? path.join(os.homedir(), '.agent-engine');
  const plain = detachedOps(claudeJob, root);
  const job = attached ? withAttached(plain, attached) : plain;
  const findJob = detachedFind(claudeJob, root);
  const bg = claudeOps({ ...options, root });
  const of = (sessionId: string) => (isClaudeJob(sessionId) ? job : bg);

  const read = <A, E>(look: Effect.Effect<A, E>) =>
    look.pipe(
      Effect.map((value): Read<A> => ({ value })),
      Effect.catchCause((cause) => Effect.succeed<Read<A>>({ why: causeWords(cause) })),
    );
  const seen = (look: RunnerOps['observe']) => read(look).pipe(Effect.map((m) => m.value ?? new Map<string, Sighting>()));

  return {
    spawn: (r) => (r.config?.background ? bg : job).spawn(r),
    refuses: claudeCodeRefuses,

    observe: Effect.all([seen(job.observe), seen(bg.observe)], { concurrency: 'unbounded' }).pipe(
      Effect.map(([jobs, sessions]) => new Map([...jobs, ...sessions])),
    ),

    /**
     * The jobs expected, each off its own run file and no other, and Claude Code's registry only when a session expected is
     * not among them: it asks `claude agents` only for a session it expects that is no job, so a pass with only jobs in
     * flight spawns none. Read off the world, never off a task's config: a task filed on this harness may run `--bg` without
     * its config saying so, and a job whose run file is not there is looked for in the registry too — once its grace is
     * past, the pass reads it lost either way. A job read that failed, or left a name unread, asks the registry.
     *
     * An expected name that neither listing has is `unread` when a read that could have listed it failed: the job read, its run file
     * there and unreadable, or the registry once asked, or it left the name unread: listed, its transcript unreadable. A job's name the
     * registry was asked for and does not list, with its run file not there, is absent. The registry is told what it is told
     * (`observeFor`), so a long-lived attempt's usage is counted from when the journal says it began. What a failed read said is
     * kept (`why`): a registry row of ours that does not decode, in the words that name the row, its field and the fix; and why
     * each session alone was unread (`unreadWhy`), as the job read or the registry's said it, for a name still unread.
     */
    observeFor: (expected) =>
      read(job.observeFor!(expected)).pipe(
        Effect.flatMap((jobs) =>
          !jobs.value || expected.some((e) => !jobs.value.seen.has(e.name))
            ? read(bg.observeFor!(expected)).pipe(Effect.map((sessions) => ({ jobs, sessions })))
            : Effect.succeed({ jobs, sessions: NOTHING_ASKED }),
        ),
        Effect.map(({ jobs: { value: jobs, ...j }, sessions: { value: sessions, ...s } }): Observation => {
          const seen = new Map([...(jobs?.seen ?? []), ...(sessions?.seen ?? [])]);
          const unread = (name: string) => !seen.has(name) && (!jobs || !sessions || jobs.unread.has(name) || sessions.unread.has(name));
          const why = [j.why, ...(jobs?.why ?? []), s.why, ...(sessions?.why ?? [])].filter((w) => w !== undefined);
          const names = new Set(expected.map((e) => e.name).filter(unread));
          const unreadWhy = unreadWhyIn(names, jobs, sessions);
          return { seen, unread: names, ...(why.length ? { why } : {}), ...(unreadWhy.size ? { unreadWhy } : {}) };
        }),
      ),

    find: (name) =>
      attached?.has(name)
        ? Effect.succeed({ sessionId: name })
        : findJob(name).pipe(Effect.flatMap((found) => (found ? Effect.succeed(found) : bg.find!(name)))),

    stop: (sessionId) => of(sessionId).stop(sessionId),
    logs: (sessionId) => of(sessionId).logs(sessionId),

    release: (session, task) => (isClaudeJob(session.sessionId) ? Effect.succeed(undefined) : bg.release!(session, task)),

    transcript: (sessionId, after) => of(sessionId).transcript!(sessionId, after),
    follow: (sessionId) =>
      isClaudeJob(sessionId)
        ? attached?.has(sessionId)
          ? Stream.fail(attachedUnfollowed(sessionId))
          : Stream.unwrap(
              findJob(sessionId).pipe(
                Effect.map((found) => (found ? job.follow!(sessionId) : bg.follow!(sessionId))),
                Effect.catchCause(() => Effect.succeed(job.follow!(sessionId))),
              ),
            )
        : bg.follow!(sessionId),

    say: (session, text) => of(session.sessionId).say!(session, text),

    quota: claudeQuota(),

    forget: (session, options) =>
      Effect.all([job.forget!(session, options), bg.forget!(session, options)]).pipe(
        Effect.map(([jobs, sessions]) => ({
          files: [...jobs.files, ...sessions.files],
          left: [...new Set([...jobs.left, ...sessions.left])],
        })),
      ),

    compact: job.compact!,

    kept: (sessions) =>
      Effect.all([job.kept!(sessions), bg.kept!(sessions)]).pipe(
        Effect.map(([jobs, held]) =>
          Object.fromEntries(
            [...new Set([...Object.keys(jobs), ...Object.keys(held)])].map((name) => [
              name,
              {
                files: [...new Set([...(jobs[name]?.files ?? []), ...(held[name]?.files ?? [])])],
                records: [...new Set([...(jobs[name]?.records ?? []), ...(held[name]?.records ?? [])])],
                output: [...new Set([...(jobs[name]?.output ?? []), ...(held[name]?.output ?? [])])],
              },
            ]),
          ),
        ),
      ),
  };
};

/** Why an attached session is not followed live: its conversation is read again through `transcript`. */
const attachedUnfollowed = (name: string) =>
  new RunnerError({
    verb: 'follow',
    message: `\`${name}\` runs attached, and is not followed live: read its conversation with \`transcript\`, again from its cursor.`,
    refused: true,
  });

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
      return Effect.all([theirs.length ? job.observeFor!(theirs) : Effect.succeed(undefined), a.observeFor!(ours)]).pipe(
        Effect.map(([jobs, mine]): Observation => ({
          ...jobs,
          seen: new Map([...(jobs?.seen ?? []), ...mine.seen]),
          unread: jobs?.unread ?? new Set(),
        })),
      );
    },
    stop: (name) => to(name).stop(name),
    logs: (name) => to(name).logs(name),
    transcript: (name, after) => to(name).transcript!(name, after),
    say: (session, text) => to(session.name).say!(session, text),
  };
};
