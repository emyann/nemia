/**
 * Claude Code as the engine runs it by default: a step is a job, and a session a person means to reach is a background one.
 *
 * A job is one session on the Agent SDK, in a process of its own (`bin/ae-claude-job.ts`), detached by the engine's worker
 * (`harness/detached/detached.ts`): it runs its brief to completion and exits, so its end is its exit and its result — no registry
 * to read, no quiet rule, a spend cap it keeps. Nobody is there to ask (`permissionPrompts: 'none'`); a call it may not make is
 * denied and the session carries on, and the result says what was denied.
 * It reads its brief on its stdin, and words a person says while it works after it, until its result. A background session
 * (`config.background: true`) is `claude --bg` (`claudeOps`): a person can attach to it, say words to it, and bridge it to
 * claude.ai. One harness, two modes, chosen per task.
 *
 * Every verb given a session id finds its mode by the id's shape, with nothing remembered: a job is known by the name the
 * engine gave it (`ae/<task>/<n>`), and a background session by Claude Code's own id. So a stop or a read asked after a
 * restart, before any observe, reaches the right one. A job resumed from a background session's id is a job: the mode
 * is the new attempt's, and `claude -p --resume` continues a `--bg` session.
 *
 * A job's own options are the attached road's, fact for fact (`attachedOptions`), built in its process from the spawn request the
 * runner wrote for it: one translation of a task into a Claude Code session, whether a daemon holds it or nothing does. What is
 * still built here as a `claude -p` argv is `claude-detached` alone (`claudeDetached`, `claudePrintArgs`): Claude Code run as
 * `claude -p`, detached by the engine's worker rather than by the harness, whose output is one JSON object at its exit.
 * Both run with background tasks off (`CLAUDE_JOB_ENV`, a job's laid on its session's own environment by `attachedOptions`); a
 * background session's environment is its own.
 */
import { Effect, Stream } from 'effect';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
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
import { memorylessFlags } from './memory.ts';
import { claudeTelemetryEnv } from './telemetry.ts';
import { CLAUDE_JOB_ENV } from './job-env.ts';
import { claudePartials, claudeResultOutput, claudeStreamKept, claudeStreamOutput } from '../detached/output.ts';
import { checkoutMcpConfig, claudeMcpArgs } from '../mcp.ts';
import { RunnerError } from '../error.ts';
import type { Attached } from './attached.ts';

/**
 * The arguments `claude -p` is given — `claude-detached`'s, the one spec that still runs it — given how its output is to be
 * printed: the format goes first, where the brief's `-p` has already taken its value and the variadic lists after it cannot take
 * one.
 */
export const claudePrintArgs = (r: SpawnRequest, io: HarnessIO | undefined, output: string[]): string[] => [
  '-p',
  r.brief,
  ...output,
  ...claudePrintFlags(r, io),
];

/**
 * What `claude -p` is given beside its brief and its formats (`claude-detached`'s flags; a job's same facts are
 * `attachedOptions`, held to this argv fact for fact by `attached-options.test.ts`). In order:
 *
 * 1. `--tools`, `--disallowedTools` and `--allowedTools`, each joined by commas: variadic, and ended by the flag after
 *    each, as for `claude --bg`. The allow list is not the fence's opposite: a rule there says a tool the session has may
 *    be used without asking a person who is not there. In `dontAsk` a mode that never asks also never allows a write, even
 *    in the session's own cwd, so a fenced session that must write its own work is given `Edit(**)`, a glob resolved
 *    against its `cwd`: unscoped (`Write`) it would write anywhere, scoped it is denied outside. A deny still beats it.
 *    The deny list also holds each read-only mount: an edit under it is denied (`claudeDenies`); the allow list each writable
 *    one: an edit under it is allowed (`claudeAllows`).
 * 2. `--add-dir` and each mount's path (`claudeMountArgs`): variadic, and ended by the flag after it.
 * 3. The caller's own flags (`config.claude`), the task's admission merged into `--settings` as a hook (`admittedFlags`) and its
 *    auto-memory turned off in the same settings (`memorylessFlags`), never a second `--settings`: after the
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
  ...claudeFlagsOf(memorylessFlags(admittedFlags(r.config))),
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
 * - `resumeCostCarried`: a resumed `claude -p` prints its parent's cost, API time and `modelUsage` on in its own, so the runner
 *   takes the parent run's off, as it does a job's.
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
  resumeCostCarried: true,
};

/** The process one Claude Code job's session runs in, `bin/ae-claude-job.ts`, found from this file's own folder as `WORKER` is. */
export const CLAUDE_JOB_BIN = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', '..', '..', 'bin', 'ae-claude-job.ts');

/**
 * A step run as a job: one session on the Agent SDK, run by a process of ours (`CLAUDE_JOB_BIN`) that the worker detaches as it
 * detaches any harness. The bin reads the spawn request the runner wrote for it (`needsRequest`), builds the session's options
 * with `attachedOptions` — the same translation a held session is given, fact for fact — and prints each of the SDK's messages as
 * one JSON line, which is the stream `claude -p --output-format stream-json --verbose --include-partial-messages` printed: so
 * every reader of a job, and every `-p` run already stored, reads the same thing. Nothing on this road builds a `claude -p` argv.
 *
 * The stream's first line names the session, so its id is known while it runs and its transcript can be read then; each call it
 * was denied is a line as it happens, so a job killed before its result still says what it was denied (`claudeStreamOutput`).
 * Nobody is there to ask, so the bin runs the session `permissionPrompts: 'none'` (`sdk.d.ts:2054`): a call that would ask is
 * denied at once, never waited on, and no decision of the bin's can be left in flight when it dies.
 *
 * Its input is a stream too: the brief is the first user message on its stdin, and each word said to it while it works is
 * another, which it takes into the turn it is working. The bin reads its stdin until it ends, so the worker ends it at the job's
 * first result, and the session ends with it. Its closeout, its spend cap and what it is denied are as they were under `-p`.
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
 * - `prepare`: not for what it puts in `io` — the servers ride `Options.mcpServers`, read by `everyMcpServer` inside the bin, and
 *   a job writes no MCP config file — but for what it throws: a checkout whose `.mcp.json` is not JSON refuses the spawn here,
 *   before the worker starts, so the attempt ends `unstartable` in those words rather than failing inside the bin.
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
  refuses: claudePrintRefuses,
  contextTokens: CLAUDE_CONTEXT_TOKENS,
  checkoutMcp: true,
  env: true,
  claudeFlags: true,
  mounts: { readOnly: true, writable: true },
  callAdmission: true,
  resumeCostCarried: true,
});

/** A job's spec as the engine runs it with the Claude Code on the PATH: `claudeJobSpec()`, named for the readers that take a spec. */
export const claudeJob: HarnessSpec = claudeJobSpec();

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
 * - `quota` asks Claude Code for the plan's usage through the Agent SDK (`claudeQuota`), whichever mode the sessions run in.
 * - `forget` removes what either mode keeps under the session's name, since a name the engine gave does not say which mode
 *   ran it, and names the transcript once.
 * - `kept` names what either mode keeps under each session's name, joined the same way, a path named once.
 * - `compact` rewrites the jobs' ended captures to what their readers read (`claudeStreamKept`); a background session keeps none.
 */
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

export const claudeCodeOps = (options: ClaudeOptions, attached?: Attached): RunnerOps => {
  const root = options.root;
  const spec = claudeJobSpec(options.claudeExecutable);
  const plain = detachedOps(spec, root);
  const job = attached ? withAttached(plain, attached) : plain;
  const plainFind = detachedFind(spec, root);
  const findJob = (name: string) => (attached?.has(name) ? Effect.succeed({ sessionId: name }) : plainFind(name));
  const bg = claudeOps({ ...options, root });
  const of = (sessionId: string) => (isClaudeJob(sessionId) ? job : bg);

  const read = <A, E>(look: Effect.Effect<A, E>) =>
    look.pipe(
      Effect.map((value): Read<A> => ({ value })),
      Effect.catchCause((cause) => Effect.succeed<Read<A>>({ why: causeWords(cause) })),
    );
  const seen = (look: RunnerOps['observe']) => read(look).pipe(Effect.map((m) => m.value ?? new Map<string, Sighting>()));

  return {
    spawn: (r) => (r.config?.background && !attachedLongLived(r, attached) ? bg : job).spawn(r),
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
      read(verbOf(job, 'observeFor')(expected)).pipe(
        Effect.flatMap((jobs) =>
          !jobs.value || expected.some((e) => !jobs.value.seen.has(e.name))
            ? read(verbOf(bg, 'observeFor')(expected)).pipe(Effect.map((sessions) => ({ jobs, sessions })))
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

    find: (name) => findJob(name).pipe(Effect.flatMap((found) => (found ? Effect.succeed(found) : verbOf(bg, 'find')(name)))),

    stop: (sessionId) => of(sessionId).stop(sessionId),
    logs: (sessionId) => of(sessionId).logs(sessionId),
    interrupt: (session) => interruptThrough(of(session.sessionId), session),

    release: (session, task) => (isClaudeJob(session.sessionId) ? Effect.succeed(undefined) : verbOf(bg, 'release')(session, task)),

    transcript: (sessionId, after) => verbOf(of(sessionId), 'transcript')(sessionId, after),
    follow: (sessionId) =>
      isClaudeJob(sessionId)
        ? Stream.unwrap(
            findJob(sessionId).pipe(
              Effect.map((found) => (found ? verbOf(job, 'follow')(sessionId) : verbOf(bg, 'follow')(sessionId))),
              Effect.catchCause(() => Effect.succeed(verbOf(job, 'follow')(sessionId))),
            ),
          )
        : verbOf(bg, 'follow')(sessionId),

    say: (session, text) => verbOf(of(session.sessionId), 'say')(session, text),

    ...answerOf(attached),

    quota: claudeQuota(),

    forget: (session, options) =>
      Effect.all([verbOf(job, 'forget')(session, options), verbOf(bg, 'forget')(session, options)]).pipe(
        Effect.map(([jobs, sessions]) => ({
          files: [...jobs.files, ...sessions.files],
          left: [...new Set([...jobs.left, ...sessions.left])],
        })),
      ),

    ...(job.compact ? { compact: job.compact } : {}),

    kept: (sessions) =>
      Effect.all([verbOf(job, 'kept')(sessions), verbOf(bg, 'kept')(sessions)]).pipe(
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

/**
 * The turn of `session` ended through `ops`, or refused in words where that runner cannot end one: a `--bg` session, whose words go to
 * Claude Code's inbox and whose turn nothing of ours can cut, and a job, which runs its brief to its end.
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
 * in a session this process drives on the Agent SDK, so an engine with no holder offers the verb at all, and a question of a job's or
 * of a `--bg` session's is refused where it is read rather than routed to a runner with no call waiting.
 */
const answerOf = (attached?: Attached): Pick<RunnerOps, 'answer'> => (attached ? { answer: attached.ops.answer } : {});

/**
 * Whether a long-lived request runs attached: one filed `restartPolicy: 'Always'` while this process holds the attached sessions. A
 * session that stays open until it is stopped runs attached whenever a holder is there — durable by resume, its turns' ends seen, its
 * calls caught and its turn stoppable — and on `--bg` only when nothing holds it. Read off the world, never off a word invented for one
 * kind of task: every long-lived Claude Code task goes attached without knowing it.
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
