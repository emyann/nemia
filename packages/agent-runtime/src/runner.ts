/**
 * The compute seam — the ONLY file that knows what runs an agent.
 *
 * Four verbs the engine cannot run without: spawn one, observe all, stop one, read one's logs. A
 * fifth, `release`, is optional — letting go of a session whose end is on the record, for a harness
 * whose registry would otherwise keep it for ever. So is a sixth, `transcript`: the same session's
 * conversation as events, for a person to follow, and nothing the engine acts on. And a seventh, `say`:
 * a person's words handed to a session while it runs, which the engine journals and never acts on. And an eighth,
 * `find`: one session by its name, without observing every other, for a read that needs only which session it is. Swap the layer and the same engine drives a
 * different harness; `Runner.test()` drives nothing at all, which is how the engine's tests cost zero
 * dollars.
 *
 * The Claude layer shells out on purpose. `claude --bg` hands the session to the harness, which
 * already owns resume, stop, cross-session messaging and a registry that outlives us — the thing
 * a scheduler on someone's laptop should be leaning on rather than rebuilding.
 *
 * Claude Code's `--bg` runner (`claudeOps`) stays here, beside the seam: `Runner.claude` needs it as a value, and it
 * builds `RunnerError`, so in a file of its own the two would import each other. What it reads and writes lives beside
 * this file, each in its own: the transcript reader (`runner-transcript.ts`), a Claude session's transcript and usage
 * (`runner-claude-transcript.ts`), Claude Code's vocabulary (`runner-claude-vocabulary.ts`), its inbox
 * (`runner-claude-inbox.ts`), and MCP (`runner-mcp.ts`).
 */
import { Context, Effect, Layer, Schema } from 'effect';
import { execFile } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { getSessionInfo, getSessionMessages } from '@anthropic-ai/claude-agent-sdk';
import type { SessionState, Sighting, Usage } from './domain.ts';
import { claudeInbox, claudeInboxLine, claudeInboxPost, claudeRegistered } from './runner-claude-inbox.ts';
import { claudeTranscriptEvents, lastStructuredOutput, renderTranscript, transcriptFile, transcriptUsage } from './runner-claude-transcript.ts';
import { claudeFlagsOf, worktreeName } from './runner-claude-vocabulary.ts';
import { argsRefusalOf, type HarnessArgs } from './harness-args.ts';
import { checkoutMcpConfig, claudeMcpArgs, writeMcpConfig } from './runner-mcp.ts';
import { readTranscript } from './runner-transcript.ts';
import { countSpawn, readTextAsync } from './io-tally.ts';

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
 * an absence (2026-09-25).
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
  /** Any implementation becomes a Layer. This is the only way a runner reaches the engine. */
  static layer = (ops: RunnerOps) => Layer.succeed(Runner)(Runner.of({
    ...ops,
    // The harness arguments are the adapter's, so what no adapter could use is refused on the adapter's side of the seam:
    // here, beneath every runner, and so at the Effect door as at `createEngine().file()`.
    refuses: (task) => argsRefusalOf(task) ?? ops.refuses?.(task),
  }));

  static claude = (options?: ClaudeOptions) => Runner.layer(claudeOps(options));

  static test = (control?: { sessions: Map<string, Sighting>; spawned?: SpawnRequest[] }) => Runner.layer(testOps(control));
}

/**
 * How long a `working` session must write nothing before this harness reports it quiet — stopped, rather than
 * paused (`Sighting.quietMs`). The floor under both quiet rules: on its own for a session the registry lists
 * idle, and beside its own closeout being the last word in the conversation for one the registry lists busy
 * (issue 24). What quiet means for the attempt is `decide`'s.
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
 * (`input-required`), not an identity. Written from words, not from a measured wait: Claude Code has not been seen
 * waiting to authenticate, and one worded otherwise reads `input-required` — a wait on a person all the same.
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
 * attempt as the harness's failure, which is what it did before — but writes the journal's word, never the harness's raw one.
 */
export const claudeStateOf = (word: string, waitingFor?: string): SessionState => {
  switch (word) {
    case 'working': return 'working';
    case 'blocked': return waitingFor !== undefined && AUTH_WAIT.test(waitingFor) ? 'auth-required' : 'input-required';
    case 'done': return 'completed';
    case 'stopped': return 'canceled';
    default: return 'failed';
  }
};

/**
 * A session's closing statement as this runner reads it: what it said, when it said it, and whether its conversation
 * ends with the statement's own result (`lastWord`). The first two go to the engine, which decides whose statement it
 * is; the third never leaves the runner — it is how a session held by something that is not the work is told from one
 * still doing it (issue 24).
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
 * `state: done` is not reliable for the work a fleet actually runs. Measured, three times: a short
 * single-deliverable task reached `done` in 67 seconds, while every long multi-step task stopped
 * at `working` and stayed there — 14 minutes in one case, with its transcript frozen and its files
 * written. Whether anyone was attached made no difference (a controlled pair says so).
 *
 * `status` is the signal that does hold. It flipped to `idle` at the exact second the transcript
 * took its final write, in every probe. Claude Code's own web UI tracks `status` for its liveness
 * dot rather than `state`, which is the same conclusion arrived at independently.
 *
 * So this harness reports a session that has stopped in one of two ways:
 *
 *     done   ⟸  state = done
 *     quiet  ⟸  state = working AND not busy AND nothing written for QUIESCENT_AFTER_MS, counted from its
 *               last write or its own start, whichever is later: `quietMs`, with `working` left as it is
 *     quiet  ⟸  state = working AND busy AND the last word in its conversation is its OWN closeout's tool
 *               result, nothing written since for QUIESCENT_AFTER_MS — its process is held by something that
 *               is not the work: a background shell the session left running (issue 24)
 *
 * Telling a quiet session from one between steps lives HERE, in the runner, and not in `decide`: `working`
 * and `idle` are this harness's vocabulary; the engine's is `working | blocked | done | failed | stopped`,
 * and translating one into the other is the whole job of a runner. What quiet MEANS does not live here. It
 * was `done`, and a task that had asked for a closing statement and was told none settled `succeeded` (bug 1,
 * `docs/open-issues.md`); only the journal knows whether one was asked for, so `decide` says. A harness that
 * ends by exiting — `codex exec` — answers the same question by exit code and needs none of this.
 */
export const claudeOps = (options: ClaudeOptions = {}): RunnerOps => {
  const quiescentAfterMs = options.quiescentAfterMs ?? QUIESCENT_AFTER_MS;
  const now = options.now ?? (() => Date.now());
  const root = options.root ?? path.join(os.homedir(), '.agent-engine');
  const sessionsDir = options.sessionsDir ?? path.join(process.env.CLAUDE_CONFIG_DIR ?? path.join(os.homedir(), '.claude'), 'sessions');
  /** A task's MCP config, kept outside the workspace: a file in a step's worktree travels down its branch. */
  const mcpFile = (name: string) => path.join(root, 'mcp', `${name.replace(/[^a-zA-Z0-9]+/g, '_')}.json`);
  const transcriptTime = options.transcriptTime ?? (async (sessionId: string) => {
    try { return (await getSessionInfo(sessionId))?.lastModified; } catch { return undefined; }
  });
  const closeoutFrom = options.closeoutFrom ?? (async (sessionId: string) => {
    const file = transcriptFile(sessionId);
    if (!file) return undefined;
    try { return lastStructuredOutput(await readTextAsync(file)); } catch { return undefined; }
  });
  const usageFrom = options.usageFrom ?? (async (sessionId: string, since: number) => {
    const file = transcriptFile(sessionId);
    if (!file) return undefined;
    try { return transcriptUsage(await readTextAsync(file), since); } catch { return undefined; }
  });

  /**
   * What a finished attempt said and consumed, as read from its transcript — kept for THAT attempt,
   * and only while the transcript has not been written since. A working session is read on every
   * idle pass instead, because that is when it may just have spoken. Losing this only re-reads.
   *
   * `keep` says which reads are worth keeping, and the caller decides: an attempt whose session the registry
   * lists FINAL, and a busy session read over a transcript cold for the quiescence floor (issue 24), which is
   * reached only while nothing has been written and so answers the same until something is. Without that
   * second one, a session in any tool call longer than ninety seconds — `npm ci`, a build, this repository's
   * own suite — was read in full on every pass of `wf up`, for the length of the call: measured on a 39.5 MB
   * transcript, 174–282 ms a read against 17–60 ms for the mtime that gates it (found in review).
   *
   * Both conditions are what reading again would find, so no driver answers differently for having
   * seen the session before. Kept by session id, for good, it failed twice on one step
   * (`let-a-step-say-which-tools-i-v27t-implement`, 2026-09-13). The registry listed the session
   * final to a `view` — which observes without stepping — at least ten seconds before it gave its (the reading the evidence allows, not a measurement)
   * StructuredOutput, so "nothing said" was kept, and the end the tick later wrote had no closeout and
   * that earlier moment's usage. Then the nudged retry `--resume`d the same id and was handed both, to
   * the byte. An attempt is the row's name, its session, and the start `claude agents` gave it.
   */
  type Kept<T> = { value: T; readAt: number };
  const keptStatements = new Map<string, Kept<Statement | undefined>>();
  const keptUsage = new Map<string, Kept<Usage | undefined>>();
  const attemptOf = (name: string, s: Sighting, startedAt: number | undefined) => JSON.stringify([name, s.sessionId, startedAt ?? null]);
  const keptRead = async <T>(
    kept: Map<string, Kept<T>>, attempt: string, keep: boolean,
    writtenAt: () => Promise<number | undefined>, read: () => Promise<T>,
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
  /**
   * No start in the registry, no usage — without one, a resumed session's inherited conversation
   * cannot be told from its own, and a wrong count is worse than none.
   */
  const usageOf = async (attempt: string, s: Sighting, since: number | undefined, writtenAt: () => Promise<number | undefined>, keep = FINAL.has(s.state)) =>
    since === undefined ? undefined : keptRead(keptUsage, attempt, keep, writtenAt, () => usageFrom(s.sessionId, since));

  /**
   * Each of our sessions' state as `claude agents` itself last listed it: what `release` stops on, whatever
   * the sighting it is handed says. A session whose end is on the record — quiet, or idle after its closeout —
   * is still running on Claude Code, and `release` must stop that one. Rebuilt by every `observe`, which a
   * pass always makes before it releases anything.
   */
  const listed = new Map<string, SessionState>();
  /**
   * The process `claude agents` last listed for each of our sessions, by session id: how `say` finds the
   * session's registration, and so its inbox. Rebuilt by every `observe`, which `say` is always handed a
   * session from; a session listed with no process — one that has exited — has none.
   */
  const pids = new Map<string, number>();
  /** When `claude agents` last listed each of our sessions as started, by session id: what `release` reads usage from. */
  const starts = new Map<string, number>();

  return ({
    spawn: (r) => Effect.try({
      // Found and written before the CLI runs, so whatever throws here started nothing.
      try: () => claudeMcpArgs([checkoutMcpConfig(r.cwd), writeMcpConfig(mcpFile(r.name), r.config?.mcp)]),
      catch: (cause) => new RunnerError({ verb: 'spawn', message: `claude --bg: ${cause instanceof Error ? cause.message : String(cause)}`, refused: true }),
    }).pipe(Effect.flatMap((mcpArgs) => sh('claude', [
      '--bg',
      '--name', r.name,
      // The fence. `--tools`, not `--allowedTools`: a tool the session does not have beats one it
      // may not use, and `--allowedTools` only pre-approves. VARIADIC — directly before the prompt
      // it would take the prompt as a tool name, the `--worktree` trap — so it goes here, and the
      // `--permission-mode` that always comes next ends the list. An empty list is no tools at all.
      ...(r.config?.tools ? ['--tools', r.config?.tools.join(',')] : []),
      // The deny list, the other half of the fence: a tool the session has, or a command it may run, that it
      // must not use — `Bash(npm run build)`, which the checkout's settings allow for another step's sake. A deny
      // beats every allow. Variadic as `--tools` is, and ended the same way. Claude Code splits it on commas and
      // spaces outside a rule's parentheses (its help's own example is "Bash(git *) Edit"), so one argument holds them.
      ...(r.config?.disallowedTools?.length ? ['--disallowedTools', r.config?.disallowedTools.join(',')] : []),
      // The allow list, which is not the fence's opposite: a rule here says a tool the session HAS may be used
      // without asking a person who is not there. In `dontAsk` a mode that never asks also never allows a write —
      // measured on 2.1.278, in a fresh directory with no settings file, Write was denied in the session's own cwd —
      // so a fenced session that must write its own work is given `Edit(**)`, a glob resolved against its `cwd`.
      // Unscoped (`Write`) it would write anywhere; scoped it is denied outside. Variadic, joined and ended as the two
      // lists above are, and a deny still beats it.
      ...(r.config?.allowedTools?.length ? ['--allowedTools', r.config?.allowedTools.join(',')] : []),
      // Remote Control, only when the task asks: the session bridged to claude.ai and listed in its agents view, where it
      // can be driven from a browser or a phone, not only seen. A `--bg` session gets a `bridgeSessionId` only with this
      // flag (measured on 2.1.273). `--remote-control [name]` takes an OPTIONAL value — the `--worktree` trap, the prompt
      // taken as its name — so it goes here, where the `--permission-mode` that always follows cannot be taken for one.
      ...(r.config?.remoteControl ? ['--remote-control'] : []),
      // The caller's own flags (`config.claude`), as a job is given them: after the variadic lists, before the mode.
      ...claudeFlagsOf(r.config?.claude),
      // `auto` rather than `acceptEdits`, and the difference decides whether a fleet works.
      // `acceptEdits` approves edits and `mkdir`/`mv`/`cp` — but NOT `npm test`, so the first
      // session that wants to run its own tests stops and waits for a person who is not there.
      // `auto` approves everything with background safety checks, which the docs recommend for
      // exactly this: long tasks, no prompt fatigue. Overridable per task; never silently.
      '--permission-mode', r.config?.permissionMode ?? 'auto',
      // MCP servers: the ones named here and no others. Without `--strict-mcp-config` a session loads
      // every server the operator has — user scope, and their claude.ai connectors (mail, calendar,
      // drive), measured on 2.1.270 — so it is on every spawn. Strict alone drops the checkout's
      // `.mcp.json` as well, so that file is named when there is one, beside the task's own `mcp`.
      // Claude in Chrome is not in any config and survives strict, so `--no-chrome` goes with it.
      ...mcpArgs,
      ...(r.config?.model ? ['--model', r.config?.model] : []),
      ...(r.config?.effort ? ['--effort', r.config?.effort] : []),
      // The context window: past about it, the session compacts its conversation and carries on — on `--bg` too, and it still
      // signs off (measured on 2.1.278, open issue 26). Takes a required value, so it can neither swallow the prompt nor be taken
      // for a `--tools` entry, which the `--permission-mode` above has ended. The same window on every attempt: a resumed
      // copy keeps only the flags it is given, so a continuation given none would run on the model's whole window again.
      ...(r.config?.contextTokens !== undefined ? ['--autocompact', String(r.config?.contextTokens)] : []),
      // `--resume` continues that conversation in the background. The NAME is still ours and
      // still new, so a resumed attempt is a distinct row on the board from the one it continues.
      ...(r.resumeFrom ? ['--resume', r.resumeFrom] : []),
      // The harness cuts and cleans the worktree; the engine only declares that it wants one.
      // This is the Pod/volume split: a workload asks for storage, the kubelet provisions it.
      //
      // ALWAYS with a name, even when the task did not choose one. `--worktree [name]` takes an
      // OPTIONAL value, so a bare `--worktree` immediately before the prompt eats the prompt as
      // the worktree's name and the session runs with nothing to do. Measured, not theorised.
      ...(r.config?.worktree ? ['--worktree', worktreeName(r)] : []),
      // The closing statement's shape. Claude Code gives the session a StructuredOutput tool for
      // it, which works under `--bg` as well as `-p` — verified on 2.1.270, though documented only
      // for `-p`. Takes a required value, so unlike `--worktree` it cannot swallow the prompt.
      ...(r.closeoutSchema ? ['--json-schema', JSON.stringify(r.closeoutSchema)] : []),
      // The spend cap, as asked. Claude Code keeps it only with `--print`, so `file()` refuses a budget on this harness
      // (`claudeBgRefuses`); a task that reaches the runner with one anyway is not given less than it asked for.
      ...(r.config?.budgetUsd !== undefined ? ['--max-budget-usd', String(r.config.budgetUsd)] : []),
      r.brief,
    ], { cwd: r.cwd, verb: 'spawn' }))).pipe(Effect.asVoid),

    observe: sh('claude', ['agents', '--all', '--json'], { verb: 'observe' }).pipe(
      Effect.map((out) => {
        const rows = JSON.parse(out) as Array<{ sessionId?: string; name?: string; state?: string; status?: string; waitingFor?: unknown; startedAt?: unknown; pid?: unknown }>;
        const m = new Map<string, { sighting: Sighting; startedAt?: number }>();
        listed.clear();
        pids.clear();
        starts.clear();
        for (const row of rows) {
          // `state` and `status` answer different questions and are NOT a fallback chain. `state`
          // is the session's lifecycle; `status` is whether its process is busy this instant. A
          // row with no `state` is an interactive session — never one of ours — and reading its
          // `status` as a state is how `idle` once became a recorded failure.
          // In A2A's names from here on (`claudeStateOf`); read after `waitingFor`, which tells two waits apart.
          const said = typeof row.state === 'string' && row.state ? row.state : undefined;
          // Only sessions WE named are ours. Everything else on the machine is somebody else's.
          // For this harness the session id IS the native id — `--resume` takes exactly it.
          // What the harness says the session waits for, as it says it: carried onto the sighting and judged by nothing
          // here (`Sighting.waitingFor`). Trimmed, and only when it is a non-empty string — a harness that says nothing,
          // or says it in some shape we have no reading of, leaves it unset rather than putting `undefined` in front of
          // a person.
          const waitingFor = typeof row.waitingFor === 'string' && row.waitingFor.trim() ? row.waitingFor.trim() : undefined;
          if (row.name?.startsWith('ae/') && row.sessionId && said) {
            const state = claudeStateOf(said, waitingFor);
            listed.set(row.sessionId, state);
            if (Number.isInteger(row.pid) && (row.pid as number) > 0) pids.set(row.sessionId, row.pid as number);
            if (typeof row.startedAt === 'number') starts.set(row.sessionId, row.startedAt);
            m.set(row.name, {
              sighting: { sessionId: row.sessionId, state, busy: row.status === 'busy', nativeId: row.sessionId, ...(waitingFor ? { waitingFor } : {}) },
              // When THIS session started, as the harness recorded it: what usage is counted from.
              startedAt: typeof row.startedAt === 'number' ? row.startedAt : undefined,
            });
          }
        }
        return m;
      }),
      // Second pass: apply this harness's own definition of finished to whatever is still
      // `working`. Only quiescent candidates cost a transcript READ — a session whose process is busy costs
      // its transcript's mtime and nothing more until that has been cold for the floor, and one read then,
      // kept for as long as it stays cold.
      //
      // The clock is the TRANSCRIPT'S, not ours. An earlier version remembered when each session
      // was first seen idle, which made the verdict depend on the observer surviving long enough
      // to reach it — true of `wf up`, false of anything that ticks once per process and exits.
      // Measured, with a one-second window and a month-cold transcript: one long-lived process
      // said `done`; three consecutive one-shot processes each said `working`, forever. The
      // transcript's mtime already answers "how long has this been quiet", so nothing needs
      // remembering and every driver gets the same answer.
      Effect.flatMap((m) => {
        // What was kept for an attempt no longer listed goes with it: a released session is not read again.
        const attempts = new Set([...m].map(([name, { sighting, startedAt }]) => attemptOf(name, sighting, startedAt)));
        for (const kept of [keptStatements, keptUsage]) for (const key of kept.keys()) if (!attempts.has(key)) kept.delete(key);
        return Effect.forEach(
          [...m],
          ([name, { sighting, startedAt }]) =>
            Effect.promise(async () => {
              const attempt = attemptOf(name, sighting, startedAt);
              // When the transcript was last written: asked once a pass at most, and only if needed.
              let written: Promise<number | undefined> | undefined;
              const writtenAt = () => (written ??= transcriptTime(sighting.sessionId));
              /**
               * How long it has been quiet: from its last write or its own start, whichever is later — a
               * session resumed over a transcript cold for an hour has been quiet only since it began, and
               * measured by the transcript alone it would end the moment the registry listed it idle. No
               * transcript, no measure: the deadline is for sessions nobody reads.
               */
              const quietFor = async () => {
                const lastWrite = await writtenAt();
                return lastWrite === undefined ? undefined : now() - Math.max(lastWrite, startedAt ?? lastWrite);
              };
              // Busy right now: nothing it has said is final and nothing about it is quiet. A long tool
              // call writes nothing for minutes, and `busy` is what keeps that from reading as silence.
              //
              // Unless the last word in its conversation is its own closeout and nothing has followed it for
              // the floor. Then the work is over and something else is holding the process: a background shell
              // the session left running held one for seventy-seven minutes, its closeout unread, and only a
              // person ending the shell let it go (issue 24). Both halves are needed — a session in a long turn
              // has said nothing since its last tool call, and one whose closeout is its parent's has said
              // nothing of its own at all.
              //
              // Both reads here are KEPT while the transcript stays as they found it (`keep`), because this branch
              // is reached only over a transcript nothing has written for the floor: a tool call that runs for
              // minutes would otherwise be a full read of a multi-megabyte file on every pass, always answering the
              // same (found in review).
              if (sighting.busy) {
                const quiet = sighting.state === 'working' ? await quietFor() : undefined;
                if (quiet === undefined || quiet < quiescentAfterMs || startedAt === undefined) return [name, sighting] as const;
                const said = await statementOf(attempt, sighting, writtenAt, true);
                if (!said?.lastWord || said.at < startedAt) return [name, sighting] as const;
                // Over, so what it consumed is final too — read here as it is for any session that has stopped.
                const used = await usageOf(attempt, sighting, startedAt, writtenAt, true);
                return [name, { ...sighting, closeout: { payload: said.payload, at: said.at }, ...(used ? { usage: used } : {}), quietMs: quiet }] as const;
              }
              // What the workload SAID, if it said anything — reported with when it was said.
              // Whether it belongs to this attempt is the engine's call, not ours: a resumed
              // session carries its parent's statements too, and only the journal knows when
              // the attempt began.
              const said = await statementOf(attempt, sighting, writtenAt);
              // And what it has consumed since its own start — reported as measured, or not at all.
              const used = await usageOf(attempt, sighting, startedAt, writtenAt);
              const reported: Sighting = { ...sighting, ...(said ? { closeout: { payload: said.payload, at: said.at } } : {}), ...(used ? { usage: used } : {}) };
              if (reported.state !== 'working') return [name, reported] as const;
              // The floor underneath, statement or not: how long it has been quiet, once that is long
              // enough to be stopped rather than paused — reported, not concluded (`decide` says what it
              // means). Kept even when there IS a statement, because an inherited one is discarded
              // upstream.
              const quiet = await quietFor();
              return quiet !== undefined && quiet >= quiescentAfterMs
                ? [name, { ...reported, quietMs: quiet }] as const
                : [name, reported] as const;
            }),
          { concurrency: 'unbounded' },
        ).pipe(Effect.map((entries) => new Map(entries)));
      }),
    ),

    /**
     * The session running under `name`, from its registration (`claudeRegistered`) rather than `claude agents`: about
     * 2 ms here, where the CLI took about 330 ms (2.1.271, 231 rows). Which session it is, never its state. Every live
     * registration on the machine this was measured on named the same session, under the same name, as `claude agents`
     * listed for its pid.
     */
    find: (name) => Effect.tryPromise({
      try: async () => {
        const found = await claudeRegistered(sessionsDir, name);
        return found && { sessionId: found.sessionId };
      },
      catch: (cause) => new RunnerError({ verb: 'find', message: `claude --bg: ${cause instanceof Error ? cause.message : String(cause)}` }),
    }),

    // `claude stop` takes the short id, which is the uuid's first block.
    stop: (sessionId) => sh('claude', ['stop', short(sessionId)], { verb: 'stop' }).pipe(Effect.asVoid),

    /**
     * A session whose end is on the record, let go: `claude stop` if it still runs, then `claude rm`.
     * Without this it stayed in `claude agents` for good — one that gave its closeout sat `working/idle`
     * there — and every run's sessions were cleared by hand. Measured before relying on it
     * (`test/live.test.ts`, 2.1.270): once removed, `ae logs` still reads the session's transcript and
     * `--resume <id>` still continues it.
     *
     * Only stopped when the task asked for a worktree: `claude rm` deletes "a background session and its
     * worktree", and the task's work is in that worktree.
     *
     * And what the session consumed, read again once it is stopped: Claude Code writes a session's cost into its
     * transcript only as the process exits, and `claude stop` returns once it has (measured on 2.1.272: 0.6 s, both
     * `cost-state` lines there as it returned). The end on the record was read before that, with no cost in it.
     */
    release: (session, task) => Effect.gen(function* () {
      // The registry's word, not the sighting's: a session whose end is on the record — quiet, or idle
      // after its closeout — is still running (found in review, when quiet was reported `done`). A session
      // this runner has not listed — no `observe` made here — has only its sighting to go by. A process listed
      // for it runs whatever its state says: a session `done` keeps its process until it is stopped (2.1.272).
      const running = listed.get(session.sessionId) ?? session.state;
      const alive = running === 'working' || running === 'input-required' || running === 'auth-required' || pids.has(session.sessionId);
      if (alive) {
        // Failing only if it exited since it was observed — which leaves `rm` exactly as able to go on.
        yield* sh('claude', ['stop', short(session.sessionId)], { verb: 'release' }).pipe(
          Effect.catchTag('RunnerError', () => Effect.succeed('')),
        );
      }
      // Read before `rm`: one that fails leaves the session listed, and the next pass's sighting carries the same read.
      const since = starts.get(session.sessionId);
      const measured = alive && since !== undefined
        ? yield* Effect.promise(() => usageFrom(session.sessionId, since).catch(() => undefined))
        : undefined;
      if (!task.worktree) yield* sh('claude', ['rm', short(session.sessionId)], { verb: 'release' });
      return measured;
    }),

    // The one verb where the Agent SDK is simply better than the CLI: `getSessionMessages` reads
    // the stored transcript as TYPED messages, and it works on sessions it never started — the
    // `claude --bg` ones included. Measured, not assumed.
    logs: (sessionId) =>
      Effect.tryPromise({
        try: () => getSessionMessages(sessionId),
        catch: (cause) => new RunnerError({ verb: 'logs', message: String(cause) }),
      }).pipe(Effect.map(renderTranscript)),

    // Read from the raw JSONL rather than through `getSessionMessages`, as the closeout is: the SDK's
    // messages carry no timestamp, and a board needs to know when each thing was said.
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
     * session's credential, not this engine's to read. Measured on 2.1.270, by hand on a busy session and an idle
     * one, and end to end by `test/live.test.ts` (`docs/open-issues.md`, verified live): a busy session reads the
     * words between tool calls; an idle one starts a turn with them. One blocked on a permission prompt queues them
     * and never reads them (open issue 16).
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
            throw new Error(`\`claude agents\` lists no process for ${session.name} (${session.sessionId}): it has exited, or this runner has not observed it.`);
          }
          await claudeInboxPost(await claudeInbox(sessionsDir, pid, session.sessionId), claudeInboxLine(session.sessionId, text));
        },
        catch: (cause) => new RunnerError({ verb: 'say', message: `claude --bg: ${cause instanceof Error ? cause.message : String(cause)}` }),
      }),
  });
};

/** A harness that costs nothing: sessions are a map, and a test moves them by hand. */
export const testOps = (control?: { sessions: Map<string, Sighting>; spawned?: SpawnRequest[] }): RunnerOps => {
  const sessions = control?.sessions ?? new Map<string, Sighting>();
  /** Every spawn request, so a test can assert what the harness was actually asked for. */
  const spawned = control?.spawned ?? [];
  let n = 0;
  return {
      spawn: (r) => Effect.sync(() => {
        const id = `fake-${++n}`;
        sessions.set(r.name, { sessionId: id, state: 'working', nativeId: id });
        spawned.push(r);
      }),
      observe: Effect.sync(() => new Map(sessions)),
      stop: (id) => Effect.sync(() => {
        for (const [name, s] of sessions) if (s.sessionId === id) sessions.set(name, { ...s, state: 'canceled' });
      }),
    logs: () => Effect.succeed('(fake runner: no logs)'),
  };
};

const short = (sessionId: string) => sessionId.split('-')[0]!;

const sh = (cmd: string, args: string[], o: { cwd?: string; verb: string }) =>
  Effect.callback<string, RunnerError>((resume) => {
    countSpawn();
    const child = execFile(cmd, args, { cwd: o.cwd, maxBuffer: 8 * 1024 * 1024 }, (err, stdout, stderr) => {
      resume(err
        ? Effect.fail(new RunnerError({
            verb: o.verb, message: `${cmd} ${args[0]}: ${stderr || err.message}`.trim(),
            // The OS never created the process — no binary, no cwd — so nothing ran and nothing
            // started. Any other failure ran the command, and whether it registered a session first
            // is not something its exit code says.
            ...((err as NodeJS.ErrnoException).syscall?.startsWith('spawn') ? { refused: true } : {}),
          }))
        : Effect.succeed(stdout));
    });
    return Effect.sync(() => child.kill());
  });
