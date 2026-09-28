/**
 * The compute seam — the ONLY file that knows what runs an agent.
 *
 * Four verbs the engine cannot run without: spawn one, observe all, stop one, read one's logs. A
 * fifth, `release`, is optional — letting go of a session whose end is on the record, for a harness
 * whose registry would otherwise keep it for ever. So is a sixth, `transcript`: the same session's
 * conversation as events, for a person to follow, and nothing the engine acts on. And a seventh, `say`:
 * a person's words handed to a session while it runs, which the engine journals and never acts on. And an
 * eighth, `find`: one session by its name, without observing every other, for a read that needs only which
 * session it is. Swap the layer and the same engine drives a different harness; `Runner.test()` drives
 * nothing at all, which is how the engine's tests cost zero dollars.
 *
 * The Claude layer shells out on purpose. `claude --bg` hands the session to the harness, which
 * already owns resume, stop, cross-session messaging and a registry that outlives us — the thing
 * a scheduler on someone's laptop should be leaning on rather than rebuilding.
 *
 * Claude Code's `--bg` runner (`claudeOps`) stays here, beside the seam: `Runner.claude` needs it as a value, and it
 * builds `RunnerError`, so in a file of its own the two would import each other. What it reads and writes lives beside
 * this file, each in its own: the transcript reader (`harness/transcript.ts`), a Claude session's transcript and usage
 * (`harness/claude/transcript.ts`), Claude Code's vocabulary (`harness/claude/vocabulary.ts`), its inbox
 * (`harness/claude/inbox.ts`), and MCP (`harness/mcp.ts`).
 */
import { Context, Effect, Layer, Schema } from 'effect';
import { execFile } from 'node:child_process';
import os from 'node:os';
import path from 'node:path';
import { getSessionInfo, getSessionMessages } from '@anthropic-ai/claude-agent-sdk';
import type { SessionState } from './core/session.ts';
import type { Sighting, Usage } from './core/domain.ts';
import { claudeInbox, claudeInboxLine, claudeInboxPost, claudeRegistered } from './harness/claude/inbox.ts';
import {
  claudeTranscriptEvents,
  lastStructuredOutput,
  renderTranscript,
  transcriptFile,
  transcriptUsage,
} from './harness/claude/transcript.ts';
import { claudeFlagsOf, worktreeName } from './harness/claude/vocabulary.ts';
import { argsRefusalOf, type HarnessArgs } from './harness/args.ts';
import { checkoutMcpConfig, claudeMcpArgs, writeMcpConfig } from './harness/mcp.ts';
import { readTranscript } from './harness/transcript.ts';
import { countSpawn, readTextAsync } from './core/engine/tally.ts';

export class RunnerError extends Schema.TaggedError<RunnerError>()('RunnerError', {
  verb: Schema.String,
  message: Schema.String,
  /**
   * The harness vouches that nothing started: no session can exist under the name. Set by a spawn,
   * and only when that is certain — the OS would not create the process, or a detached worker was
   * never launched. Absent, a failed spawn may still have left a session running.
   */
  refused: Schema.optionalKey(Schema.Boolean),
}) {}

export type SpawnRequest = {
  /** The join key, ours, chosen before the session exists. */
  name: string;
  brief: string;
  cwd: string;
  /** Which harness should run it. The composite runner dispatches on this; others ignore it. */
  harness?: string;
  /** The harness's arguments, as the task was filed with them: this runner's to read, and nobody else's. Absent: none. */
  config?: HarnessArgs;
  /** A previous session of this harness to continue instead of starting cold. */
  resumeFrom?: string;
  /** A JSON Schema the workload's final answer must satisfy. Passed through; never interpreted. */
  closeoutSchema?: object;
};

/**
 * One MCP server — a process the harness starts beside the session, or an address it connects to —
 * in the shape a `.mcp.json` entry gives it: Claude Code's own, so a task's servers are written for
 * it as they are. Harness vocabulary: carried on the task, read by a runner, never by `decide`. A
 * `url` needs its `type`, because Claude Code loads nothing from one without it.
 */
export type McpServer =
  | { type?: 'stdio'; command: string; args?: string[]; env?: Record<string, string> }
  | { type: 'http' | 'sse'; url: string; headers?: Record<string, string> };

/**
 * One thing that happened in a session's conversation, in the same shape for every harness.
 *
 * `id` is the harness's own, so the same record read again gives the same id. A `tool_result` carries
 * its call's `id`: that is how a result pairs to its call, and why an event is unique by `id` and
 * `kind` together, not by `id` alone. `at` is the time on the harness's own record, never the time it
 * was read — so a resumed Claude session's inherited conversation keeps its parent's times, and the
 * caller decides what to show. A tool result is `user`, as the model receives it.
 */
export type TranscriptEvent = {
  id: string;
  /** ISO 8601, from the harness's record. */
  at: string;
  role: 'assistant' | 'user' | 'system';
  kind: 'text' | 'thinking' | 'tool_use' | 'tool_result' | 'system';
  text?: string;
  tool?: { name: string; input: unknown };
  result?: { text: string; isError: boolean };
};

/**
 * Where a transcript read stopped, to hand back to the next: the byte offset after the last whole line
 * read, and a hash of the bytes just before it. The offset alone cannot tell a file that was replaced
 * and has grown past it from the same file grown longer; the hash can, and so can it a file cut shorter.
 */
export type TranscriptCursor = string;

/** A read of a session's conversation: the events from the cursor asked with, and the cursor to ask again with. */
export type Transcript = { events: TranscriptEvent[]; cursor: TranscriptCursor };

/** A session the journal expects a harness to list: an attempt's name (`ae/<task>/<n>`), and the harness its task was filed on. */
export type ExpectedSession = { name: string; harness?: string };

/**
 * What a look told what to expect saw (`observeFor`): the sessions it listed, by name, and the names expected of it that it could
 * not look for this time — a harness, or one mode of it, whose read failed (`claude agents` timing out, the registry busy). A name
 * in `unread` is neither there nor gone: nobody looked. Kept apart from `seen` because the pass reads an absence as the session
 * gone — it forgets a finished one it was letting go, and ends an attempt past its grace `lost` — and a look that failed is not
 * an absence.
 */
export type Observation = { seen: Map<string, Sighting>; unread: ReadonlySet<string> };

/**
 * The seam itself, as a plain value.
 *
 * Four verbs. A harness that cannot do one of them is not a harness this engine can drive, and a
 * harness that needs another to be driven is asking the engine to learn something about it — which is
 * the line this type exists to hold. `release` does not cross it: optional, told only what the record
 * already says, and answering nothing the engine acts on. Nor does `transcript`: optional, and read
 * for a person, never by `decide`. Nor does `say`: optional, a person's words carried in, and nothing
 * the engine decides on. Nor does `find`: optional, a cheaper way to one session's id than `observe`, and never
 * its state. Nor does `observeFor`: optional, `observe` told what the journal already names, and answering the same.
 */
export type RunnerOps = {
  readonly spawn: (r: SpawnRequest) => Effect.Effect<void, RunnerError>;
  /** Every session this runner knows about, BY NAME. One call per pass, never per task. */
  readonly observe: Effect.Effect<Map<string, Sighting>, RunnerError>;
  /**
   * `observe`, told which sessions the journal expects: at least every one named in `expected` that the harness lists,
   * and whatever else it lists for no more. Optional — for a harness that can leave out a costly registry when nothing
   * expected can be in it (Claude Code: `claude agents`, when every name expected is a job's). A runner without it is
   * observed in full. Told names, never asked for them: the pass reads them off the journal on every pass, so a session
   * started before a restart is expected on the first pass after it. `harness` is the harness the task was filed on, for
   * a runner that routes (`composite`), and read by no other.
   *
   * Answers what it listed and what it could not read (`Observation`): a runner that reads in parts — several harnesses,
   * or Claude Code's jobs and its registry — says which expected names a failed part left unread, and fails as a whole only
   * when it read nothing. `observe` keeps its Map: a full listing is read by views and verbs, where an unread harness is
   * nothing observed, and by no rule that ends or forgets on an absence.
   */
  readonly observeFor?: (expected: readonly ExpectedSession[]) => Effect.Effect<Observation, RunnerError>;
  /**
   * The one session running under `name`, found without observing every other: which session it is, and nothing of
   * its state. Optional — for a harness that can answer by name for less than `observe` costs (Claude Code: the
   * session's registration file, where `observe` runs `claude agents`). Resolves `undefined` when none runs under the
   * name. A read that needs a session's state asks `observe`, and where the two differ, `observe`'s word is taken.
   */
  readonly find?: (name: string) => Effect.Effect<{ sessionId: string } | undefined, RunnerError>;
  readonly stop: (sessionId: string) => Effect.Effect<void, RunnerError>;
  readonly logs: (sessionId: string) => Effect.Effect<string, RunnerError>;
  /**
   * Let go of a session whose attempt's end the engine has written down: stop it if it still runs,
   * and take it out of the harness's registry. Optional — a harness whose registry is the record
   * (a detached runner's run files, which `logs` reads) has nothing to let go of.
   *
   * Asked on every pass that still observes such a session, so it must be idempotent and needs no
   * memory: one that fails is asked again next pass. Given the session as observed, to tell a live one
   * from one that has exited, and the task's `worktree`, since a harness may remove the one it cut.
   *
   * Resolves with what the session consumed, read once this call has stopped it, for a harness that writes part of that
   * only as a session's process exits — after its end was written (Claude Code's cost). The engine records it on the
   * attempt. Nothing when it stopped nothing.
   */
  readonly release?: (session: Sighting, task: { worktree?: string | boolean }) => Effect.Effect<Usage | void, RunnerError>;
  /**
   * The session's conversation as events, from `after` on, and the cursor to ask again with. Optional:
   * a harness that keeps no record of its conversation has `logs`, and that is all. Pull-only and
   * level-triggered — a caller polls with the cursor it was given, nothing is pushed, and nothing is
   * remembered between reads that the cursor does not carry.
   */
  readonly transcript?: (sessionId: string, after?: TranscriptCursor) => Effect.Effect<Transcript, RunnerError>;
  /**
   * Hand `text` to a session that is running, as a person's words: optional, for a harness with a channel
   * into a live session. Given the session as the engine knows it — the name it chose, and the id `observe`
   * listed it under on the pass just made — and resolves once the harness has taken the words; rejects when
   * it did not, and then nothing was said. What the session does with them is its own affair: the engine
   * journals that they were said, and `decide` never reads that.
   */
  readonly say?: (session: { name: string; sessionId: string }, text: string) => Effect.Effect<void, RunnerError>;
  /**
   * Why this runner would not take a task, as a sentence that says what to write instead — or `undefined`. Asked by `file`
   * before anything is journalled, so a task no harness could start is never a promise the loop keeps trying to honour.
   * Optional: every runner made a `Runner` by `Runner.layer` refuses what no harness could use (`argsRefusalOf`) before
   * it is asked, so a runner answers for its own vocabulary alone; `file` asks those checks itself too, for a runner built
   * with `Runner.of` and no layer.
   */
  readonly refuses?: (task: Omit<SpawnRequest, 'name'>) => string | undefined;
};

export class Runner extends Context.Service<Runner, RunnerOps>()('engine/Runner') {
  /**
   * Any implementation becomes a Layer. This is the only way a runner reaches the engine. Its `refuses` asks first what
   * no harness could use (`argsRefusalOf`), then the runner's own: the harness arguments are the adapter's, so they are
   * refused on the adapter's side of the seam, beneath every runner, and so at the Effect door as at `createEngine().file()`.
   */
  static layer = (ops: RunnerOps) =>
    Layer.succeed(Runner)(
      Runner.of({
        ...ops,
        refuses: (task) => argsRefusalOf(task) ?? ops.refuses?.(task),
      }),
    );

  static claude = (options?: ClaudeOptions) => Runner.layer(claudeOps(options));

  static test = (control?: { sessions: Map<string, Sighting>; spawned?: SpawnRequest[] }) => Runner.layer(testOps(control));
}

/**
 * How long a `working` session must write nothing before this harness reports it quiet — stopped, rather than
 * paused (`Sighting.quietMs`). The floor under both quiet rules: on its own for a session the registry lists
 * idle, and beside its own closeout being the last word in the conversation for one the registry lists busy.
 * What quiet means for the attempt is `decide`'s.
 *
 * 90 seconds. Long enough that a pause between self-driven steps resumes first — the docs are
 * explicit that `working` also covers "between steps of work it drives on its own" — and short
 * enough that a fleet is not waiting on a session that has already written its last word.
 */
export const QUIESCENT_AFTER_MS = 90_000;

/**
 * How far a transcript's mtime may trail `Date.now()` for the same instant. The kernel may stamp a
 * file from a coarser clock, so a line written just after a read can carry a time just before it. A
 * read of a finished session is kept only while its transcript is older than the read by more than
 * this: one more read at the end of a session, and never a line missed.
 */
const MTIME_SLOP_MS = 1_000;

const FINAL: ReadonlySet<SessionState> = new Set(['completed', 'failed', 'canceled']);

/**
 * A `waitingFor` that names signing in, in Claude Code's words: `auth`, `authenticate` and its forms, `log in`, `login`,
 * `sign in`, `sign-in` — whole words only, so `author`, `authority` and `oauth-proxy` are not it. `authorize` and
 * `authorization` are left out on purpose: a tool call authorised is a permission, which a person gives with words
 * (`input-required`), not an identity. Written from words, not from a wait Claude Code is known to word so: one worded
 * otherwise reads `input-required` — a wait on a person all the same.
 */
export const AUTH_WAIT = /\b(?:auth|authenticat(?:e|es|ed|ing|ion)|log[ -]?in|sign[ -]?in)\b/i;

/**
 * A `claude agents --json` row's `state`, in A2A's names — translated here, once, as the registry is parsed:
 *
 *   working  → working         at work; `status` says whether it computes (`busy`)
 *   blocked  → auth-required   when what it waits for names signing in (`AUTH_WAIT`), since that is A2A's word for it
 *            → input-required  otherwise: a permission prompt, a question — a person's words
 *   done     → completed       ended on its own
 *   failed   → failed
 *   stopped  → canceled        stopped under it (`claude stop`, or a person at its side)
 *
 * Any other word is `failed`: a state this runner has no reading of is no session it can wait on, and a pass then ends the
 * attempt as the harness's failure, writing the journal's word, never the harness's raw one.
 */
export const claudeStateOf = (word: string, waitingFor?: string): SessionState => {
  switch (word) {
    case 'working':
      return 'working';
    case 'blocked':
      return waitingFor !== undefined && AUTH_WAIT.test(waitingFor) ? 'auth-required' : 'input-required';
    case 'done':
      return 'completed';
    case 'stopped':
      return 'canceled';
    default:
      return 'failed';
  }
};

/**
 * A session's closing statement as this runner reads it: what it said, when it said it, and whether its conversation
 * ends with the statement's own result (`lastWord`). The first two go to the engine, which decides whose statement it
 * is; the third never leaves the runner — it is how a session held by something that is not the work is told from one
 * still doing it.
 */
type Statement = { payload: unknown; at: number; lastWord?: boolean };

export type ClaudeOptions = {
  quiescentAfterMs?: number;
  now?: () => number;
  /** When the session's transcript was last written. Injectable so tests need no harness. */
  transcriptTime?: (sessionId: string) => Promise<number | undefined>;
  /** The session's closing statement, as above. Injectable for the same reason. */
  closeoutFrom?: (sessionId: string) => Promise<Statement | undefined>;
  /** What the session consumed since `since`, its own start. Injectable for the same reason. */
  usageFrom?: (sessionId: string, since: number) => Promise<Usage | undefined>;
  /** Where the runner writes what it hands the CLI by path — a task's MCP config. Default `~/.agent-engine`. */
  root?: string;
  /**
   * Where Claude Code registers each running session, by pid: `find` finds a session there by its name, and `say` its inbox. Default
   * `sessions` under `$CLAUDE_CONFIG_DIR`, or under `~/.claude`, read when the runner is made.
   */
  sessionsDir?: string;
};

/**
 * Claude Code, through its CLI: the harness owns the session, so nothing here owns a process.
 *
 * ## What "done" means for this harness, and why it is decided here
 *
 * `state: done` is not reliable for the work a fleet actually runs: a short single-deliverable task
 * reaches `done`, while a long multi-step one can stop at `working` and stay there, its transcript
 * frozen and its files written, whether or not anyone is attached.
 *
 * `status` is the signal that holds: it turns `idle` at the second the transcript takes its final
 * write. Claude Code's own web UI tracks `status` for its liveness dot rather than `state`.
 *
 * So this harness reports a session that has stopped in one of two ways:
 *
 *     completed  ⟸  state = done
 *     quiet      ⟸  state = working AND not busy AND nothing written for QUIESCENT_AFTER_MS, counted from its
 *                   last write or its own start, whichever is later: `quietMs`, with `working` left as it is
 *     quiet      ⟸  state = working AND busy AND the last word in its conversation is its OWN closeout's tool
 *                   result, nothing written since for QUIESCENT_AFTER_MS — its process is held by something that
 *                   is not the work: a background shell the session left running
 *
 * Telling a quiet session from one between steps lives HERE, in the runner, and not in `decide`: `working`
 * and `idle` are this harness's vocabulary, the engine's is A2A's (`SessionState`), and translating one into
 * the other is the whole job of a runner. What quiet MEANS does not live here: a task that asked for a closing
 * statement and was told none must not settle `succeeded`, and only the journal knows whether one was asked
 * for, so `decide` says. A harness that ends by exiting — `codex exec` — answers the same question by exit
 * code and needs none of this.
 *
 * ## What it keeps between passes
 *
 * - A task's MCP config, under `root`, outside the workspace: a file in a step's worktree travels down its branch.
 * - What `claude agents` last listed of each of our sessions, by session id, rebuilt by every `observe`, which a pass
 *   always makes before it releases anything and `say` is always handed a session from:
 *   - its state (`listed`), which `release` stops on whatever the sighting it is handed says: a session whose end is
 *     on the record — quiet, or idle after its closeout — still runs on Claude Code, and `release` must stop it;
 *   - its process (`pids`), how `say` finds the session's registration and so its inbox; a session listed with no
 *     process — one that has exited — has none;
 *   - its start (`starts`), what `release` reads usage from.
 * - What a finished attempt said and consumed (`Kept`), which only saves reads.
 *
 * No start in the registry, no usage: without one, a resumed session's inherited conversation cannot be told from
 * its own, and a wrong count is worse than none.
 */
export const claudeOps = (options: ClaudeOptions = {}): RunnerOps => {
  const quiescentAfterMs = options.quiescentAfterMs ?? QUIESCENT_AFTER_MS;
  const now = options.now ?? (() => Date.now());
  const root = options.root ?? path.join(os.homedir(), '.agent-engine');
  const sessionsDir = options.sessionsDir ?? path.join(process.env.CLAUDE_CONFIG_DIR ?? path.join(os.homedir(), '.claude'), 'sessions');
  const mcpFile = (name: string) => path.join(root, 'mcp', `${name.replace(/[^a-zA-Z0-9]+/g, '_')}.json`);
  const transcriptTime =
    options.transcriptTime ??
    (async (sessionId: string) => {
      try {
        return (await getSessionInfo(sessionId))?.lastModified;
      } catch {
        return undefined;
      }
    });
  const closeoutFrom =
    options.closeoutFrom ??
    (async (sessionId: string) => {
      const file = transcriptFile(sessionId);
      if (!file) return undefined;
      try {
        return lastStructuredOutput(await readTextAsync(file));
      } catch {
        return undefined;
      }
    });
  const usageFrom =
    options.usageFrom ??
    (async (sessionId: string, since: number) => {
      const file = transcriptFile(sessionId);
      if (!file) return undefined;
      try {
        return transcriptUsage(await readTextAsync(file), since);
      } catch {
        return undefined;
      }
    });

  /**
   * What a finished attempt said and consumed, as read from its transcript — kept for THAT attempt,
   * and only while the transcript has not been written since. A working session is read on every
   * idle pass instead, because that is when it may just have spoken. Losing this only re-reads.
   *
   * `keep` says which reads are worth keeping, and the caller decides: an attempt whose session the registry
   * lists FINAL, and a busy session read over a transcript cold for the quiescence floor, which is reached
   * only while nothing has been written and so answers the same until something is. Without that second
   * one, a session in a tool call longer than the floor — `npm ci`, a build, a test suite — is read in full
   * on every pass for the length of the call, where the mtime that gates the read costs a fraction of it.
   *
   * Both conditions are what reading again would find, so no driver answers differently for having
   * seen the session before. Kept by attempt, never by session id alone: the registry can list a session
   * final to a `view` — which observes without stepping — before it writes its StructuredOutput, and a
   * `--resume` of the same id is another attempt, never handed what was read of the one before. An attempt
   * is the row's name, its session, and the start `claude agents` gave it.
   */
  type Kept<T> = { value: T; readAt: number };
  const keptStatements = new Map<string, Kept<Statement | undefined>>();
  const keptUsage = new Map<string, Kept<Usage | undefined>>();
  const attemptOf = (name: string, s: Sighting, startedAt: number | undefined) => JSON.stringify([name, s.sessionId, startedAt ?? null]);
  const keptRead = async <T>(
    kept: Map<string, Kept<T>>,
    attempt: string,
    keep: boolean,
    writtenAt: () => Promise<number | undefined>,
    read: () => Promise<T>,
  ): Promise<T> => {
    if (!keep) return read();
    const pin = kept.get(attempt);
    if (pin) {
      const written = await writtenAt();
      if (written !== undefined && written < pin.readAt - MTIME_SLOP_MS) return pin.value;
    }
    const readAt = now();
    const value = await read();
    kept.set(attempt, { value, readAt });
    return value;
  };
  const statementOf = (attempt: string, s: Sighting, writtenAt: () => Promise<number | undefined>, keep = FINAL.has(s.state)) =>
    keptRead(keptStatements, attempt, keep, writtenAt, () => closeoutFrom(s.sessionId));
  const usageOf = async (
    attempt: string,
    s: Sighting,
    since: number | undefined,
    writtenAt: () => Promise<number | undefined>,
    keep = FINAL.has(s.state),
  ) => (since === undefined ? undefined : keptRead(keptUsage, attempt, keep, writtenAt, () => usageFrom(s.sessionId, since)));

  const listed = new Map<string, SessionState>();
  const pids = new Map<string, number>();
  const starts = new Map<string, number>();

  return {
    /**
     * `claude --bg` under `r.name`, in the task's `cwd`. The MCP configs are found and written before the CLI runs, so
     * whatever throws there started nothing (`refused`). The flags come in an order that matters: a variadic flag, or one
     * whose value is optional, directly before the prompt takes the prompt as its value.
     *
     * 1. `--tools`, the fence: a tool the session does not have beats one it may not use, and `--allowedTools` only
     *    pre-approves. An empty list is no tools at all.
     * 2. `--disallowedTools`, the other half of the fence: a tool the session has, or a command it may run, that it must
     *    not use — `Bash(npm run build)`, which the checkout's settings allow for another step's sake. A deny beats every
     *    allow. Claude Code splits it on commas and spaces outside a rule's parentheses, so one argument holds them.
     * 3. `--allowedTools`, which is not the fence's opposite: a rule here lets a tool the session HAS be used without
     *    asking a person who is not there. In `dontAsk` a mode that never asks also never allows a write, not even in the
     *    session's own cwd, so a fenced session that must write its own work is given `Edit(**)`, a glob resolved against
     *    its `cwd`: unscoped (`Write`) it would write anywhere, scoped it is denied outside. A deny still beats it.
     * 4. The caller's own flags (`claudeFlagsOf`), Remote Control among them only when the task asks (`remoteControl`):
     *    the session bridged to claude.ai and listed in its agents view, where it can be driven from a browser or a
     *    phone, not only seen. A `--bg` session gets a `bridgeSessionId` only with this flag.
     * 5. `--permission-mode`, always: it ends the variadic lists above, and cannot be taken for the optional name of
     *    `--remote-control [name]`. `auto` unless the task says otherwise, rather than `acceptEdits`, which approves edits
     *    and `mkdir`/`mv`/`cp` but not `npm test`, so the first session that runs its own tests waits for a person who is
     *    not there. `auto` approves everything behind background safety checks, which Claude Code's docs recommend for
     *    long tasks.
     * 6. The MCP flags (`claudeMcpArgs`): without `--strict-mcp-config` a session loads every server the operator has —
     *    user scope, and their claude.ai connectors (mail, calendar, drive). Strict alone drops the checkout's
     *    `.mcp.json` as well, so that file is named when there is one, beside the task's own `mcp`.
     * 7. `--model` and `--effort`.
     * 8. `--autocompact`, the context window: past it, the session compacts its conversation and carries on, under
     *    `--bg` too, and still signs off. The same window on every attempt: a resumed copy keeps only the flags it is
     *    given, so a continuation given none would run on the model's whole window again.
     * 9. `--resume`, which continues that conversation in the background under a name that is still ours and still new,
     *    so a resumed attempt is a row of its own on the board.
     * 10. `--worktree`, ALWAYS with a name (`worktreeName`): its value is optional, so a bare `--worktree` before the
     *    prompt takes the prompt as the worktree's name and the session runs with nothing to do. The harness cuts and
     *    cleans the worktree; the engine only declares that it wants one, as a Pod asks for storage and the kubelet
     *    provisions it.
     * 11. `--json-schema`, the closing statement's shape: Claude Code gives the session a StructuredOutput tool for it,
     *    under `--bg` as under `-p`, though it documents it only for `-p`.
     * 12. `--max-budget-usd`, as asked. Claude Code keeps it only with `--print`, so `file()` refuses a budget on this
     *    harness (`claudeBgRefuses`); a task that reaches the runner with one anyway is not given less than it asked for.
     * 13. The brief, last.
     */
    spawn: (r) =>
      Effect.try({
        try: () => claudeMcpArgs([checkoutMcpConfig(r.cwd), writeMcpConfig(mcpFile(r.name), r.config?.mcp)]),
        catch: (cause) =>
          new RunnerError({
            verb: 'spawn',
            message: `claude --bg: ${cause instanceof Error ? cause.message : String(cause)}`,
            refused: true,
          }),
      })
        .pipe(
          Effect.flatMap((mcpArgs) =>
            sh(
              'claude',
              [
                '--bg',
                '--name',
                r.name,
                ...(r.config?.tools ? ['--tools', r.config?.tools.join(',')] : []),
                ...(r.config?.disallowedTools?.length ? ['--disallowedTools', r.config?.disallowedTools.join(',')] : []),
                ...(r.config?.allowedTools?.length ? ['--allowedTools', r.config?.allowedTools.join(',')] : []),
                ...claudeFlagsOf(r.config?.claude),
                '--permission-mode',
                r.config?.permissionMode ?? 'auto',
                ...mcpArgs,
                ...(r.config?.model ? ['--model', r.config?.model] : []),
                ...(r.config?.effort ? ['--effort', r.config?.effort] : []),
                ...(r.config?.contextTokens !== undefined ? ['--autocompact', String(r.config?.contextTokens)] : []),
                ...(r.resumeFrom ? ['--resume', r.resumeFrom] : []),
                ...(r.config?.worktree ? ['--worktree', worktreeName(r)] : []),
                ...(r.closeoutSchema ? ['--json-schema', JSON.stringify(r.closeoutSchema)] : []),
                ...(r.config?.budgetUsd !== undefined ? ['--max-budget-usd', String(r.config.budgetUsd)] : []),
                r.brief,
              ],
              { cwd: r.cwd, verb: 'spawn' },
            ),
          ),
        )
        .pipe(Effect.asVoid),

    /**
     * Every session of ours that `claude agents --all --json` lists, by name, in two passes.
     *
     * 1. The registry's rows. A row is ours only when we named it (`ae/`) and it has a `state`: `state` is the session's
     *    lifecycle and `status` whether its process is busy this instant, two answers and not a fallback chain, and a row
     *    with no `state` is an interactive session, whose `status` read as a state would record `idle` as a failure. The
     *    state is put in A2A's names (`claudeStateOf`) with `waitingFor`, which tells two waits apart; `waitingFor` is
     *    carried as the harness says it and judged by nothing here (`Sighting.waitingFor`), trimmed, and only when it is
     *    a non-empty string. The session id is the native id — `--resume` takes exactly it — and the row's `startedAt`,
     *    when this session started, is what its usage is counted from. `listed`, `pids` and `starts` are rebuilt here.
     * 2. This harness's own definition of finished, applied to what is still `working`. What was kept for an attempt no
     *    longer listed goes with it, so a released session is not read again. The clock is the transcript's mtime, asked
     *    once a pass at most and only when needed, never a time this process remembers: a driver that ticks once per
     *    process and exits gets the answer a long-lived one does. Quiet is counted from the transcript's last write or the
     *    session's own start, whichever is later — a session resumed over a transcript cold for an hour has been quiet
     *    only since it began — and a session with no transcript is never quiet: the deadline is for sessions nobody reads.
     *    - A busy session reports nothing it said and nothing quiet: a long tool call writes nothing for minutes. Unless the
     *      last word in its conversation is its own closeout, from its own start on, and nothing has followed it for the
     *      floor: then the work is over and something else holds its process — a background shell it left running — and
     *      its closeout, its usage and its `quietMs` are reported. Both halves are needed: a session in a long turn has
     *      said nothing since its last tool call, and one whose closeout is its parent's has said nothing of its own. Both
     *      reads are kept (`Kept`) while the transcript stays as they found it, since this branch is reached only over a
     *      transcript cold for the floor.
     *    - Any other session reports what it said, with when, and what it consumed since its own start, as measured or
     *      not at all. Whether a statement belongs to this attempt is the engine's call: a resumed session carries its
     *      parent's statements too, and only the journal knows when the attempt began. One still `working` and quiet for
     *      the floor reports `quietMs` too, statement or not, because an inherited statement is discarded upstream; what
     *      quiet means is `decide`'s.
     */
    observe: sh('claude', ['agents', '--all', '--json'], { verb: 'observe' }).pipe(
      Effect.map((out) => {
        const rows = JSON.parse(out) as Array<{
          sessionId?: string;
          name?: string;
          state?: string;
          status?: string;
          waitingFor?: unknown;
          startedAt?: unknown;
          pid?: unknown;
        }>;
        const m = new Map<string, { sighting: Sighting; startedAt?: number }>();
        listed.clear();
        pids.clear();
        starts.clear();
        for (const row of rows) {
          const said = typeof row.state === 'string' && row.state ? row.state : undefined;
          const waitingFor = typeof row.waitingFor === 'string' && row.waitingFor.trim() ? row.waitingFor.trim() : undefined;
          if (row.name?.startsWith('ae/') && row.sessionId && said) {
            const state = claudeStateOf(said, waitingFor);
            listed.set(row.sessionId, state);
            if (Number.isInteger(row.pid) && (row.pid as number) > 0) pids.set(row.sessionId, row.pid as number);
            if (typeof row.startedAt === 'number') starts.set(row.sessionId, row.startedAt);
            m.set(row.name, {
              sighting: {
                sessionId: row.sessionId,
                state,
                busy: row.status === 'busy',
                nativeId: row.sessionId,
                ...(waitingFor ? { waitingFor } : {}),
              },
              startedAt: typeof row.startedAt === 'number' ? row.startedAt : undefined,
            });
          }
        }
        return m;
      }),
      Effect.flatMap((m) => {
        const attempts = new Set([...m].map(([name, { sighting, startedAt }]) => attemptOf(name, sighting, startedAt)));
        for (const kept of [keptStatements, keptUsage]) for (const key of kept.keys()) if (!attempts.has(key)) kept.delete(key);
        return Effect.forEach(
          [...m],
          ([name, { sighting, startedAt }]) =>
            Effect.promise(async () => {
              const attempt = attemptOf(name, sighting, startedAt);
              let written: Promise<number | undefined> | undefined;
              const writtenAt = () => (written ??= transcriptTime(sighting.sessionId));
              const quietFor = async () => {
                const lastWrite = await writtenAt();
                return lastWrite === undefined ? undefined : now() - Math.max(lastWrite, startedAt ?? lastWrite);
              };
              if (sighting.busy) {
                const quiet = sighting.state === 'working' ? await quietFor() : undefined;
                if (quiet === undefined || quiet < quiescentAfterMs || startedAt === undefined) return [name, sighting] as const;
                const said = await statementOf(attempt, sighting, writtenAt, true);
                if (!said?.lastWord || said.at < startedAt) return [name, sighting] as const;
                const used = await usageOf(attempt, sighting, startedAt, writtenAt, true);
                return [
                  name,
                  { ...sighting, closeout: { payload: said.payload, at: said.at }, ...(used ? { usage: used } : {}), quietMs: quiet },
                ] as const;
              }
              const said = await statementOf(attempt, sighting, writtenAt);
              const used = await usageOf(attempt, sighting, startedAt, writtenAt);
              const reported: Sighting = {
                ...sighting,
                ...(said ? { closeout: { payload: said.payload, at: said.at } } : {}),
                ...(used ? { usage: used } : {}),
              };
              if (reported.state !== 'working') return [name, reported] as const;
              const quiet = await quietFor();
              return quiet !== undefined && quiet >= quiescentAfterMs
                ? ([name, { ...reported, quietMs: quiet }] as const)
                : ([name, reported] as const);
            }),
          { concurrency: 'unbounded' },
        ).pipe(Effect.map((entries) => new Map(entries)));
      }),
    ),

    /**
     * The session running under `name`, from its registration (`claudeRegistered`) rather than `claude agents`, which
     * costs a process and a read of every row. Which session it is, never its state. A live registration names the same
     * session, under the same name, as `claude agents` lists for its pid.
     */
    find: (name) =>
      Effect.tryPromise({
        try: async () => {
          const found = await claudeRegistered(sessionsDir, name);
          return found && { sessionId: found.sessionId };
        },
        catch: (cause) =>
          new RunnerError({ verb: 'find', message: `claude --bg: ${cause instanceof Error ? cause.message : String(cause)}` }),
      }),

    /** `claude stop`, with the short id it takes (`short`). */
    stop: (sessionId) => sh('claude', ['stop', short(sessionId)], { verb: 'stop' }).pipe(Effect.asVoid),

    /**
     * A session whose end is on the record, let go: `claude stop` if it still runs, then `claude rm`.
     * Without it a session stays in `claude agents` for good — one that gave its closeout sits `working/idle`
     * there. Once removed, `ae logs` still reads the session's transcript and `--resume <id>` still continues
     * it (`test/live.test.ts`).
     *
     * 1. Whether it runs is the registry's word (`listed`), not the sighting's: a session whose end is on the
     *    record — quiet, or idle after its closeout — still runs. A session this runner has not listed, with no
     *    `observe` made here, has only its sighting to go by. A session with a process listed runs whatever its
     *    state says: Claude Code keeps a `done` session's process until it is stopped.
     * 2. `claude stop`, if it runs. A failure means it exited since it was observed, which leaves `rm` as able
     *    to go on, so it is passed over.
     * 3. What the session consumed, read again once it is stopped, before `rm`: Claude Code writes a session's
     *    cost into its transcript only as the process exits, and `claude stop` returns once it has, so the end on
     *    the record was read with no cost in it. Read before `rm`, because an `rm` that fails leaves the session
     *    listed, and the next pass's sighting carries the same read.
     * 4. `claude rm`, only when the task asked for no worktree: `claude rm` deletes "a background session and
     *    its worktree", and the task's work is in that worktree.
     *
     * Resolves with what was read in step 3, or nothing when it stopped nothing.
     */
    release: (session, task) =>
      Effect.gen(function* () {
        const running = listed.get(session.sessionId) ?? session.state;
        const alive = running === 'working' || running === 'input-required' || running === 'auth-required' || pids.has(session.sessionId);
        if (alive) {
          yield* sh('claude', ['stop', short(session.sessionId)], { verb: 'release' }).pipe(
            Effect.catchTag('RunnerError', () => Effect.succeed('')),
          );
        }
        const since = starts.get(session.sessionId);
        const measured =
          alive && since !== undefined
            ? yield* Effect.promise(() => usageFrom(session.sessionId, since).catch(() => undefined))
            : undefined;
        if (!task.worktree) yield* sh('claude', ['rm', short(session.sessionId)], { verb: 'release' });
        return measured;
      }),

    /**
     * The stored transcript as typed messages, through the Agent SDK's `getSessionMessages`, which reads sessions it
     * never started, the `claude --bg` ones included.
     */
    logs: (sessionId) =>
      Effect.tryPromise({
        try: () => getSessionMessages(sessionId),
        catch: (cause) => new RunnerError({ verb: 'logs', message: String(cause) }),
      }).pipe(Effect.map(renderTranscript)),

    /**
     * Read from the raw JSONL (`readTranscript`) rather than through `getSessionMessages`, as the closeout is: the SDK's
     * messages carry no timestamp, and a board needs to know when each thing was said.
     */
    transcript: (sessionId, after) =>
      Effect.tryPromise({
        try: () => readTranscript(transcriptFile(sessionId), after, claudeTranscriptEvents),
        catch: (cause) => new RunnerError({ verb: 'transcript', message: cause instanceof Error ? cause.message : String(cause) }),
      }),

    /**
     * A person's words, posted verbatim to the session's own inbox socket — the one Claude Code documents for a
     * script to post into a session, and the one another session's `SendMessage` reaches. No token: on macOS
     * and Linux the inbox takes a connection without one (it requires one only on native Windows, whose inbox
     * is a named pipe and is refused as not a socket), and the token beside the registration is another
     * session's credential, not this engine's to read. A busy session reads the words between tool calls; an idle
     * one starts a turn with them (`test/live.test.ts`). One blocked on a permission prompt queues them and never
     * reads them.
     *
     * The inbox writes nothing back, so this resolves on the words being taken, not on their being read: a
     * `crossSessionInbound` of `hold` or `refuse` in the operator's settings, a rate limit, or an identical
     * repeat inside Claude Code's window, drops them where nothing here can see.
     */
    say: (session, text) =>
      Effect.tryPromise({
        try: async () => {
          const pid = pids.get(session.sessionId);
          if (pid === undefined) {
            throw new Error(
              `\`claude agents\` lists no process for ${session.name} (${session.sessionId}): it has exited, or this runner has not observed it.`,
            );
          }
          await claudeInboxPost(await claudeInbox(sessionsDir, pid, session.sessionId), claudeInboxLine(session.sessionId, text));
        },
        catch: (cause) =>
          new RunnerError({ verb: 'say', message: `claude --bg: ${cause instanceof Error ? cause.message : String(cause)}` }),
      }),
  };
};

/**
 * A harness that costs nothing: sessions are a map, and a test moves them by hand. Every spawn request is pushed to
 * `spawned`, so a test can assert what the harness was actually asked for.
 */
export const testOps = (control?: { sessions: Map<string, Sighting>; spawned?: SpawnRequest[] }): RunnerOps => {
  const sessions = control?.sessions ?? new Map<string, Sighting>();
  const spawned = control?.spawned ?? [];
  let n = 0;
  return {
    spawn: (r) =>
      Effect.sync(() => {
        const id = `fake-${++n}`;
        sessions.set(r.name, { sessionId: id, state: 'working', nativeId: id });
        spawned.push(r);
      }),
    observe: Effect.sync(() => new Map(sessions)),
    stop: (id) =>
      Effect.sync(() => {
        for (const [name, s] of sessions) if (s.sessionId === id) sessions.set(name, { ...s, state: 'canceled' });
      }),
    logs: () => Effect.succeed('(fake runner: no logs)'),
  };
};

/** A session's short id, as `claude stop` and `claude rm` take it: the uuid's first block. */
const short = (sessionId: string) => sessionId.split('-')[0];

/**
 * `cmd` run with `args`, answering its stdout, or a `RunnerError` for `verb` with its stderr. Refused (`refused`) only
 * when the OS never created the process — no binary, no cwd — so nothing ran and nothing started: any other failure ran
 * the command, and whether it registered a session first is not something its exit code says. Interrupted, it kills
 * the child.
 */
const sh = (cmd: string, args: string[], o: { cwd?: string; verb: string }) =>
  Effect.callback<string, RunnerError>((resume) => {
    countSpawn();
    const child = execFile(cmd, args, { cwd: o.cwd, maxBuffer: 8 * 1024 * 1024 }, (err, stdout, stderr) => {
      resume(
        err
          ? Effect.fail(
              new RunnerError({
                verb: o.verb,
                message: `${cmd} ${args[0]}: ${stderr || err.message}`.trim(),
                ...((err as NodeJS.ErrnoException).syscall?.startsWith('spawn') ? { refused: true } : {}),
              }),
            )
          : Effect.succeed(stdout),
      );
    });
    return Effect.sync(() => child.kill());
  });
