/**
 * Claude Code's `--bg` runner (`claudeOps`), and `sh`, the one way it shells out.
 *
 * The layer shells out on purpose. `claude --bg` hands the session to the harness, which already owns resume, stop,
 * cross-session messaging and a registry that outlives us — the thing a scheduler on someone's laptop should be leaning on
 * rather than rebuilding.
 *
 * What it reads and writes lives beside it, each in its own file: the transcript reader (`harness/transcript.ts`), a
 * Claude session's transcript and usage (`harness/claude/transcript.ts`), Claude Code's vocabulary
 * (`harness/claude/vocabulary.ts`), its inbox (`harness/claude/inbox.ts`), its registry's rows (`harness/claude/registry.ts`), a
 * resumed session's parent's last call (`harness/claude/parent.ts`), when a transcript was first seen at its mtime
 * (`harness/claude/quiet.ts`), and MCP (`harness/mcp.ts`).
 */
import { Effect } from 'effect';
import { execFile } from 'node:child_process';
import os from 'node:os';
import path from 'node:path';
import { getSessionMessages } from '@anthropic-ai/claude-agent-sdk';
import type { Bridge, SessionState, Sighting, Usage } from '../../core/index.ts';
import { claudeInbox, claudeInboxLine, claudeInboxPost, claudeRegistered } from './inbox.ts';
import { claudeBridge } from './bridge.ts';
import {
  claudeTranscriptEvents,
  lastStructuredOutput,
  readSessionTranscript,
  renderTranscript,
  transcriptFile,
  TranscriptUnread,
  transcriptUsage,
  transcriptWrittenAt,
} from './transcript.ts';
import { CLAUDE_DEFAULT_MODE, claudeAllowArgs, claudeDenyArgs, claudeFlagsOf, claudeMountArgs, worktreeName } from './vocabulary.ts';
import { admittedFlags } from './admission.ts';
import { telemeteredFlags } from './telemetry.ts';
import { withoutTelemetry } from '../telemetry.ts';
import { checkoutMcpConfig, claudeMcpArgs, sessionMcp, writeMcpConfig } from '../mcp.ts';
import { readTranscript } from '../transcript.ts';
import { countSpawn } from '../../core/engine/tally.ts';
import type { Monotonic } from '../../core/clock.ts';
import { monoNow } from '../../core/engine/now.ts';
import { RunnerError, refusedOsError } from '../error.ts';
import { forgetFiles } from '../forget.ts';
import { bgFollowOf, sharedListing } from './bg-follow.ts';
import { claudeStateOf, registryOf, type RegistryRow } from './registry.ts';
import { type ParentCall, parentFileOf, parentOf, recordParent, whoseCall } from './parent.ts';
import { clearSighting, quietFileOf, sightingOf } from './quiet.ts';
import { claudeQuota } from './quota.ts';
import type { ExpectedSession, Observation, RunnerOps, SpawnRequest } from '../seam.ts';

/**
 * How long a `working` session must write nothing before this harness reports it quiet — stopped, rather than
 * paused (`Sighting.quietMs`). The floor under both quiet rules: on its own for a session the registry lists
 * idle, and beside its own closeout being the last word in the conversation for one the registry lists busy.
 * What quiet means for the attempt is `decide`'s.
 *
 * Counted on both clocks, and the shorter wins: the wall clock from the transcript's mtime, and the monotonic clock from
 * when the runner first saw that mtime (`quiet.ts`), so a wall clock stepped forward cannot report a working session quiet,
 * one stepped back only delays it, and a mtime first seen waits the floor from then.
 *
 * 90 seconds. Long enough that a pause between self-driven steps resumes first — the docs are
 * explicit that `working` also covers "between steps of work it drives on its own" — and short
 * enough that a fleet is not waiting on a session that has already written its last word.
 */
export const QUIESCENT_AFTER_MS = 90_000;

/**
 * How far a transcript's mtime may trail `Date.now()` for the same instant. The kernel may stamp a
 * file from a coarser clock, so a line written just after a read can carry the mtime asked just before
 * it. A read is kept only while the transcript's mtime is still the one asked before it (`Kept.mtime`),
 * and that one older than the read by more than this: one more read at the end of a session, and never
 * a line missed. A write changes the mtime whichever way the wall clock stepped, so it is read again; a
 * clock moved forward costs at most one more read.
 */
const MTIME_SLOP_MS = 1_000;

const FINAL: ReadonlySet<SessionState> = new Set(['completed', 'failed', 'canceled']);

/**
 * A session's closing statement as this runner reads it: what it said, when it said it, its call's id when it has one, and
 * whether its conversation ends with the statement's own result (`lastWord`). The id tells whose statement it is, against the
 * parent's last call recorded at spawn (`whoseCall`): an inherited one goes nowhere, the session's own goes to the engine with
 * what it said alone, and one the id cannot tell goes with its time too, for the engine to judge. `lastWord` never leaves the
 * runner — it is how a session held by something that is not the work is told from one still doing it.
 */
export type Statement = { payload: unknown; at: number; id?: string; lastWord?: boolean };

export type ClaudeOptions = {
  quiescentAfterMs?: number;
  now?: () => number;
  /** The monotonic clock, under its boot's id (`monoNow`), or `undefined` where the machine does not say its boot. */
  mono?: () => Monotonic | undefined;
  /** When the session's transcript was last written. Injectable so tests need no harness. */
  transcriptTime?: (sessionId: string) => Promise<number | undefined>;
  /** The session's closing statement, as above. Injectable for the same reason. */
  closeoutFrom?: (sessionId: string) => Promise<Statement | undefined>;
  /** What the session consumed since `since`, its own start. Injectable for the same reason. */
  usageFrom?: (sessionId: string, since: number) => Promise<Usage | undefined>;
  /**
   * The last StructuredOutput call the session `sessionId` made, asked of a resumed session's parent at spawn: `undefined` where it
   * cannot tell. Injectable for the same reason.
   */
  parentCallFrom?: (sessionId: string) => Promise<ParentCall | undefined>;
  /** The bridge of the session `sessionId` its process `pid` holds (`claudeBridge`, by default). Injectable for the same reason. */
  bridgeOf?: (pid: number, sessionId: string) => Promise<Bridge>;
  /**
   * Where the runner writes what it hands the CLI by path — a task's MCP config — what it records at spawn — a resumed session's
   * parent's last call — and what it records as it looks — when it first saw a working session's transcript as it stands
   * (`quiet.ts`). Default `~/.agent-engine`.
   */
  root?: string;
  /**
   * Where Claude Code registers each running session, by pid: `find` finds a session there by its name, `say` its inbox, and
   * `observe` the bridge of each session it holds a process for (`claudeBridge`). Default
   * `sessions` under `$CLAUDE_CONFIG_DIR`, or under `~/.claude`, read when the runner is made.
   */
  sessionsDir?: string;
};

/**
 * What `claude agents` last listed of each of our sessions, by session id, rebuilt by every look: its state (`listed`), its
 * process (`pids`) and its start (`starts`); and, for a session a look was told began earlier — a long-lived attempt, across the
 * processes Claude Code respawned it in — when to count its usage from (`countsFrom`): set by a look told it, kept by every look
 * told nothing of it while the session is listed, and dropped with its row. Every start told comes from the journal, so no look
 * can erase another's, and nothing rests on what survives in memory: level-triggered, after a restart the registry is empty and
 * the pass's own look, told the start, sets it again before the pass releases anything.
 */
type Registry = {
  listed: Map<string, SessionState>;
  pids: Map<string, number>;
  starts: Map<string, number>;
  countsFrom: Map<string, number>;
};

/**
 * What an attempt said and consumed, as read from its transcript — kept for THAT attempt, in any state the registry lists it in,
 * and only while the transcript has not been written since: while its mtime equals the one asked just before the read (`mtime`),
 * which was older than the read (`readAt`) by `MTIME_SLOP_MS`. Equality, not order, so a write stamped before the read by a wall
 * clock stepped back is read. A session that takes a turn writes its transcript, so what it said in that turn is read on the next
 * look, and a session that takes none — idle, blocked, a long-lived one between turns, a busy one in a long tool call — is read
 * once. Losing this only re-reads.
 *
 * Both conditions are what reading again would find, so no driver answers differently for having
 * seen the session before. Kept by attempt, never by session id alone: the registry can list a session
 * final to a `view` — which observes without stepping — before it writes its StructuredOutput, and a
 * `--resume` of the same id is another attempt, never handed what was read of the one before. An attempt
 * is the row's name, its session, and the start `claude agents` gave it.
 */
type Kept<T> = { read: { value: T } | { refused: unknown }; readAt: number; mtime: number | undefined };

/** A read begun: when it began (`readAt`), and what it answers. */
type Begun<T> = { readAt: number; value: Promise<T> };

/**
 * An attempt's key in what is kept (`Kept`): the row's name, its session, the start `claude agents` gave it, and when its usage is
 * counted from where that is another time (`countsFrom`), so a read counted from one is never handed to a look counting from the other.
 */
const attemptOf = (name: string, s: Sighting, startedAt: number | undefined, countFrom = startedAt) =>
  JSON.stringify([name, s.sessionId, startedAt ?? null, ...(countFrom !== startedAt ? [countFrom] : [])]);

/**
 * How a look reads a session's closeout (`statement`) and its usage since `since` (`usage`): off the look's one read of its
 * transcript (`Look.transcript`), so a look that asks both reads the file once; or through `closeoutFrom` and `usageFrom` where they
 * are given, each a read of its own.
 */
type Readers = {
  statement: (l: Look) => Begun<Statement | undefined>;
  usage: (l: Look, since: number) => Begun<Usage | undefined>;
};

/** `read` begun now, on `now`'s clock. */
const begunNow = <T>(now: () => number, read: () => Promise<T>): Begun<T> => ({ readAt: now(), value: read() });

/** What `of` finds in the look's one read of its transcript (`Look.transcript`), or `undefined` with no transcript. */
const offTranscript = <T>(l: Look, of: (read: { file: string; text: string }) => T): Begun<T | undefined> => {
  const begun = l.transcript();
  return { readAt: begun.readAt, value: begun.value.then((read) => read && of(read)) };
};

/** The readers (`Readers`) over `options`' `closeoutFrom` and `usageFrom`, each off the look's transcript where it is not given. */
const readersOf = (now: () => number, options: ClaudeOptions): Readers => {
  const { closeoutFrom, usageFrom } = options;
  return {
    statement: (l) =>
      closeoutFrom
        ? begunNow(now, () => closeoutFrom(l.sighting.sessionId))
        : offTranscript(l, (read) => lastStructuredOutput(read.text, read.file)),
    usage: (l, since) =>
      usageFrom
        ? begunNow(now, () => usageFrom(l.sighting.sessionId, since))
        : offTranscript(l, (read) => transcriptUsage(read.text, since, read.file)),
  };
};

/**
 * A runner's kept reads (`Kept`), over its clock and its readers: `statementOf` and `usageOf` read a look's closeout and usage
 * through them, in any state, and `prune` lets go of every attempt not in the set it is given. A read that throws — a transcript
 * refused (`lines.ts`) — is kept as a value is, and thrown again while the transcript is unchanged, not read again; a transcript
 * found and not read (`TranscriptUnread`) is thrown and never kept, and lets go of what was kept for the attempt, so the next look
 * reads it again.
 */
const keptReads = (readers: Readers) => {
  const keptStatements = new Map<string, Kept<Statement | undefined>>();
  const keptUsage = new Map<string, Kept<Usage | undefined>>();
  const keptRead = async <T>(kept: Map<string, Kept<T>>, l: Look, read: () => Begun<T>): Promise<T> => {
    const pin = kept.get(l.attempt);
    const written = await l.writtenAt();
    let got = pin && written !== undefined && written === pin.mtime && pin.mtime < pin.readAt - MTIME_SLOP_MS ? pin.read : undefined;
    if (!got) {
      const begun = read();
      got = await begun.value.then(
        (value) => ({ value }),
        (refused: unknown) => ({ refused }),
      );
      if ('refused' in got && got.refused instanceof TranscriptUnread) {
        kept.delete(l.attempt);
        throw got.refused;
      }
      kept.set(l.attempt, { read: got, readAt: begun.readAt, mtime: written });
    }
    if ('refused' in got) throw got.refused;
    return got.value;
  };
  return {
    statementOf: (l: Look) => keptRead(keptStatements, l, () => readers.statement(l)),
    usageOf: async (l: Look) => {
      const since = l.countFrom;
      return since === undefined ? undefined : keptRead(keptUsage, l, () => readers.usage(l, since));
    },
    prune: (attempts: ReadonlySet<string>) => {
      for (const kept of [keptStatements, keptUsage]) for (const key of kept.keys()) if (!attempts.has(key)) kept.delete(key);
    },
  };
};

/**
 * What `observe` reads a sighting with: the quiescence floor, the two clocks, the transcript's mtime, the kept reads, and `root`,
 * where each session's parent's last call and its transcript's sighting are recorded.
 */
type Reading = {
  root: string;
  quiescentAfterMs: number;
  now: () => number;
  mono: () => Monotonic | undefined;
  transcriptTime: (sessionId: string) => Promise<number | undefined>;
  kept: ReturnType<typeof keptReads>;
  bridgeOf: (pid: number, sessionId: string) => Promise<Bridge>;
};

/**
 * One sighting in one pass: its row's name and start, when its usage is counted from, its attempt, its transcript's mtime asked once
 * at most, its transcript read once at most (`transcript`), and its quiet so far.
 */
type Look = {
  name: string;
  sighting: Sighting;
  startedAt: number | undefined;
  countFrom: number | undefined;
  attempt: string;
  writtenAt: () => Promise<number | undefined>;
  transcript: () => Begun<{ file: string; text: string } | undefined>;
  quietFor: () => Promise<number | undefined>;
};

/**
 * The last StructuredOutput call a session made, read off its transcript (`lastStructuredOutput`): `null` for none, and `undefined`
 * with no transcript or a call with no id. Throws the refusal of a transcript whose lines do not decode, and a `TranscriptUnread`
 * when one found cannot be read.
 */
const transcriptLastCall = async (sessionId: string): Promise<ParentCall | undefined> => {
  const read = await readSessionTranscript(sessionId);
  if (!read) return undefined;
  const said = lastStructuredOutput(read.text, read.file);
  if (!said) return { lastCall: null };
  return said.id === undefined ? undefined : { lastCall: said.id };
};

/**
 * What a session consumed since `since`, read off its transcript (`transcriptUsage`), or `undefined` with no transcript. Throws the
 * refusal of a transcript whose lines do not decode, and a `TranscriptUnread` when one found cannot be read.
 */
const transcriptUsageSince = async (sessionId: string, since: number) => {
  const read = await readSessionTranscript(sessionId);
  return read && transcriptUsage(read.text, since, read.file);
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
 * - A resumed session's parent's last StructuredOutput call, by the attempt's name under `root` (`parent.ts`), written at spawn and
 *   read on every look: what tells the session's own statement from the one it inherited.
 * - When a working session's transcript was first seen at its mtime, on the monotonic clock, by the attempt's name under `root`
 *   (`quiet.ts`): cleared at spawn, rewritten by a look only when the mtime or the boot differs, read fresh on every look.
 * - What `claude agents` last listed of each of our sessions, by session id, rebuilt by every look, which a pass
 *   always makes before it releases anything and `say` is always handed a session from:
 *   - its state (`listed`), which `release` stops on whatever the sighting it is handed says: a session whose end is
 *     on the record — quiet, or idle after its closeout — still runs on Claude Code, and `release` must stop it;
 *   - its process (`pids`), how `say` finds the session's registration and so its inbox; a session listed with no
 *     process — one that has exited — has none;
 *   - its start (`starts`), what `release` reads usage from — or, for a long-lived attempt a look was told the start of, that
 *     start (`countsFrom`), so its spend is counted across every process Claude Code respawned it in; kept by every look
 *     told nothing of the session, so a view's look between the pass's and its release leaves it as the pass set it.
 * - What an attempt said and consumed (`Kept`), which only saves reads.
 * - What `claude agents` listed for its followers (`follow`), read at most once a second however many follow (`sharedListing`).
 *
 * No start in the registry, no usage: without one, a resumed session's inherited conversation cannot be told from
 * its own, and a wrong count is worse than none.
 */
export const claudeOps = (options: ClaudeOptions = {}): RunnerOps => {
  const now = options.now ?? (() => Date.now());
  const root = options.root ?? path.join(os.homedir(), '.agent-engine');
  const sessionsDir = options.sessionsDir ?? path.join(process.env.CLAUDE_CONFIG_DIR ?? path.join(os.homedir(), '.claude'), 'sessions');
  const reading: Reading = {
    root,
    quiescentAfterMs: options.quiescentAfterMs ?? QUIESCENT_AFTER_MS,
    now,
    mono: options.mono ?? monoNow,
    transcriptTime: options.transcriptTime ?? transcriptWrittenAt,
    kept: keptReads(readersOf(now, options)),
    bridgeOf: options.bridgeOf ?? ((pid, sessionId) => claudeBridge(sessionsDir, pid, sessionId)),
  };
  const registry: Registry = { listed: new Map(), pids: new Map(), starts: new Map(), countsFrom: new Map() };
  return {
    spawn: spawnUnder(root, options.parentCallFrom ?? transcriptLastCall),
    observe: observeInto(reading, registry, new Map()).pipe(Effect.map((o) => o.seen)),
    observeFor: (expected) => observeInto(reading, registry, countsFromOf(expected)),
    find: findIn(sessionsDir),
    stop: stopSession,
    release: releaseFrom(registry, options.usageFrom ?? transcriptUsageSince),
    logs: sessionLogs,
    transcript: sessionTranscript,
    follow: bgFollowOf(sharedListing(sh('claude', ['agents', '--all', '--json'], { verb: 'follow' }))),
    say: sayThrough(sessionsDir, registry.pids),
    quota: claudeQuota(),
    forget: forgetUnder(root),
  };
};

/**
 * A background session's `forget`: the files this runner wrote of it under `root` — its MCP config, its transcript's sighting
 * and its parent's last call — and its transcript, Claude Code's, left and named.
 */
const forgetUnder =
  (root: string): NonNullable<RunnerOps['forget']> =>
  (session, { dry }) =>
    forgetFiles(
      'claude --bg',
      [mcpFileOf(root, session.name), quietFileOf(root, session.name), parentFileOf(root, session.name)],
      () => {
        const file = session.nativeId ? transcriptFile(session.nativeId) : undefined;
        return file ? [file] : [];
      },
      dry,
    );

/**
 * `claude --bg` under `r.name`, in the task's `cwd`, with its MCP configs written under `root`, and its parent's last call recorded
 * there (`recordParent`, asked of `parentCallFrom`), and a former attempt's sighting under the name cleared (`clearSighting`).
 * All are written before the CLI runs, so whatever throws there started nothing, and no look finds the session before its
 * record: refused (`refused`) unless it failed for a short-lived reason (`refusedOsError`), which the grace window judges.
 * The flags are `claudeArgv`'s.
 */
const spawnUnder =
  (root: string, parentCallFrom: (sessionId: string) => Promise<ParentCall | undefined>): RunnerOps['spawn'] =>
  (r) =>
    Effect.tryPromise({
      try: async () => {
        const mcpArgs = claudeMcpArgs([
          r.config?.checkoutMcp ? undefined : checkoutMcpConfig(r.cwd),
          writeMcpConfig(mcpFileOf(root, r.name), sessionMcp(r.cwd, r.config)),
        ]);
        await recordParent(parentFileOf(root, r.name), r.resumeFrom, parentCallFrom);
        clearSighting(quietFileOf(root, r.name));
        return mcpArgs;
      },
      catch: (cause) =>
        new RunnerError({
          verb: 'spawn',
          message: `claude --bg: ${cause instanceof Error ? cause.message : String(cause)}`,
          ...(refusedOsError(cause) ? { refused: true } : {}),
        }),
    }).pipe(
      Effect.flatMap((mcpArgs) => sh('claude', claudeArgv(r, mcpArgs), { cwd: r.cwd, verb: 'spawn' })),
      Effect.asVoid,
    );

/** Where a task's MCP config is written under `root`, by its name. */
const mcpFileOf = (root: string, name: string) => path.join(root, 'mcp', `${name.replace(/[^a-zA-Z0-9]+/g, '_')}.json`);

/**
 * The argv `claude --bg` is given for `r`, with `mcpArgs` the MCP flags. The flags come in an order that matters: a variadic
 * flag, or one whose value is optional, directly before the prompt takes the prompt as its value.
 *
 * 1. `--tools`, the fence: a tool the session does not have beats one it may not use, and `--allowedTools` only
 *    pre-approves. An empty list is no tools at all.
 * 2. `--disallowedTools`, the other half of the fence: a tool the session has, or a command it may run, that it must
 *    not use — `Bash(npm run build)`, which the checkout's settings allow for another step's sake. A deny beats every
 *    allow. Claude Code splits it on commas and spaces outside a rule's parentheses, so one argument holds them.
 *    An edit under each read-only mount is denied here too (`claudeDenies`).
 * 3. `--allowedTools`, which is not the fence's opposite: a rule here lets a tool the session HAS be used without
 *    asking a person who is not there. In `dontAsk` a mode that never asks also never allows a write, not even in the
 *    session's own cwd, so a fenced session that must write its own work is given `Edit(**)`, a glob resolved against
 *    its `cwd`: unscoped (`Write`) it would write anywhere, scoped it is denied outside. A deny still beats it. An edit
 *    under each writable mount is allowed here too (`claudeAllows`). Then `--add-dir` and each mount's path
 *    (`claudeMountArgs`), variadic, ended by the flag after it.
 * 4. The caller's own flags (`claudeFlagsOf`), Remote Control among them only when the task asks (`remoteControl`), and the
 *    task's admission merged into `--settings` as a hook (`admittedFlags`):
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
export const claudeArgv = (r: SpawnRequest, mcpArgs: string[]): string[] => [
  '--bg',
  '--name',
  r.name,
  ...fenceFlags(r.config),
  ...claudeFlagsOf(telemeteredFlags(admittedFlags(r.config), r)),
  '--permission-mode',
  r.config?.permissionMode ?? CLAUDE_DEFAULT_MODE,
  ...mcpArgs,
  ...sessionFlags(r),
  r.brief,
];

/**
 * The fence's flags, 1 to 3 of `claudeArgv`: `--tools` for any list, even an empty one, and each rule list only when it has a rule;
 * then the mounts (`claudeMountArgs`), each read-only one an edit denied in the deny list (`claudeDenies`), each writable one an
 * edit allowed in the allow list (`claudeAllows`).
 */
const fenceFlags = (c: SpawnRequest['config']): string[] => [
  ...(c?.tools ? ['--tools', c.tools.join(',')] : []),
  ...claudeDenyArgs(c),
  ...claudeAllowArgs(c),
  ...claudeMountArgs(c),
];

/** The session's flags, 7 to 12 of `claudeArgv`, each only when the task sets it. */
const sessionFlags = (r: SpawnRequest): string[] => {
  const c = r.config;
  return [
    ...(c?.model ? ['--model', c.model] : []),
    ...(c?.effort ? ['--effort', c.effort] : []),
    ...(c?.contextTokens !== undefined ? ['--autocompact', String(c.contextTokens)] : []),
    ...(r.resumeFrom ? ['--resume', r.resumeFrom] : []),
    ...(c?.worktree ? ['--worktree', worktreeName(r)] : []),
    ...(r.closeoutSchema ? ['--json-schema', JSON.stringify(r.closeoutSchema)] : []),
    ...(c?.budgetUsd !== undefined ? ['--max-budget-usd', String(c.budgetUsd)] : []),
  ];
};

/**
 * When each expected session's usage is counted from, by name: the start the journal gave a long-lived attempt (`since`), a number
 * that is one. A name given none is not in it, and is counted from its own start.
 */
const countsFromOf = (expected: readonly ExpectedSession[]): Map<string, number> =>
  new Map(expected.flatMap((e) => (typeof e.since === 'number' && Number.isFinite(e.since) ? [[e.name, e.since] as const] : [])));

/**
 * Every session of ours that `claude agents --all --json` lists, by name, in two passes, `registry` rebuilt by the first. Each
 * session told when to count its usage from (`countsFrom`, by name) is counted from then; each told nothing, from what a look
 * last told of it while it stayed listed, else from its own start, as its row gives it.
 *
 * 1. The registry's rows (`listedIn`).
 * 2. This harness's own definition of finished, applied to what is still `working` (`reportOf`). What was kept for an
 *    attempt no longer listed goes with it, so a released session is not read again.
 *
 * Seen, each session read; unread, each whose transcript cannot be read while it runs (`reportedOf`), why said as a warning on
 * every look and answered by name (`unreadWhy`) off this look's reports alone. Fails only when the listing itself cannot be read: it
 * is every session's.
 */
const observeInto = (x: Reading, registry: Registry, countsFrom: ReadonlyMap<string, number>): Effect.Effect<Observation, RunnerError> =>
  sh('claude', ['agents', '--all', '--json'], { verb: 'observe' }).pipe(
    Effect.flatMap((out) => {
      const read = registryOf(out);
      return 'wrong' in read
        ? Effect.fail(new RunnerError({ verb: 'observe', message: read.wrong }))
        : Effect.succeed(listedIn(read.rows, registry, countsFrom));
    }),
    Effect.flatMap((m) => {
      x.kept.prune(new Set([...m].map(([name, l]) => attemptOf(name, l.sighting, l.startedAt, l.countFrom))));
      return Effect.forEach([...m], ([name, l]) => reportedOf(x, name, l), { concurrency: 'unbounded' });
    }),
    Effect.tap((reports) => Effect.forEach(reports, (r) => (r.warning ? Effect.logWarning(r.warning) : Effect.void), { discard: true })),
    Effect.map((reports): Observation => {
      const unreadWhy = new Map(reports.flatMap((r) => (!r.sighting && r.warning ? [[r.name, r.warning] as const] : [])));
      return {
        seen: new Map(reports.flatMap((r) => (r.sighting ? [[r.name, r.sighting] as const] : []))),
        unread: new Set(reports.flatMap((r) => (r.sighting ? [] : [r.name]))),
        ...(unreadWhy.size ? { unreadWhy } : {}),
      };
    }),
  );

/**
 * Our decoded rows (`registryOf`) as sessions by name, each with its start and when its usage is counted from, and `registry`
 * cleared and rebuilt from them in row order: each session's state (`listed`), its process (`pids`) and its start (`starts`).
 * Its `countsFrom` is rebuilt too: a session's start told by name in `countsFrom`, else the one the registry kept for it, so a
 * look told nothing of a session never erases what another look was told. Called only on a listing that decoded, so a refused one
 * leaves the registry as the last one read.
 */
const listedIn = (rows: RegistryRow[], registry: Registry, countsFrom: ReadonlyMap<string, number>) => {
  const m = new Map<string, Listed>();
  const kept = new Map(registry.countsFrom);
  for (const map of [registry.listed, registry.pids, registry.starts, registry.countsFrom]) map.clear();
  for (const row of rows) {
    const ours = ourRow(row);
    const { sessionId, state } = ours.sighting;
    const countFrom = countsFrom.get(row.name) ?? kept.get(sessionId) ?? ours.startedAt;
    registry.listed.set(sessionId, state);
    if (ours.pid !== undefined) registry.pids.set(sessionId, ours.pid);
    if (ours.startedAt !== undefined) registry.starts.set(sessionId, ours.startedAt);
    if (countFrom !== undefined && countFrom !== ours.startedAt) registry.countsFrom.set(sessionId, countFrom);
    m.set(row.name, { sighting: ours.sighting, startedAt: ours.startedAt, countFrom });
  }
  return m;
};

/**
 * A row of ours as a sighting, with its start and its process when it lists them. `state` is the session's lifecycle and `status`
 * whether its process is busy this instant, two answers and not a fallback chain. The state is put in A2A's names
 * (`claudeStateOf`) with `waitingFor`, which tells two waits apart; `waitingFor` is carried as the harness says it and judged by
 * nothing here (`Sighting.waitingFor`), trimmed, and a blank one is none. The session id is the native id — `--resume` takes
 * exactly it — and the row's `startedAt`, when this session started, is what its usage is counted from. `held` is whether the
 * row lists a pid: `done` and an idle `blocked` are a turn's end, and the process outlives it until `claude stop` takes it. The
 * pid is on the sighting too, which a long-lived task journals as it changes (`sightingFacts`).
 */
const ourRow = (row: RegistryRow): { sighting: Sighting; startedAt?: number; pid?: number } => {
  const waitingFor = row.waitingFor?.trim() || undefined;
  return {
    sighting: {
      sessionId: row.sessionId,
      state: claudeStateOf(row.state, waitingFor),
      busy: row.status === 'busy',
      held: row.pid !== undefined && row.pid !== null,
      nativeId: row.sessionId,
      ...(waitingFor ? { waitingFor } : {}),
      ...(row.pid !== undefined && row.pid !== null ? { pid: row.pid } : {}),
    },
    startedAt: row.startedAt ?? undefined,
    pid: row.pid ?? undefined,
  };
};

/** A session as the registry lists it: its sighting, its start, and when its usage is counted from. */
type Listed = { sighting: Sighting; startedAt?: number; countFrom?: number };

/** One listed session as a look reads it: its sighting, or none when it is unread, and why it was read so (`warning`). */
type Reported = { name: string; sighting?: Sighting; warning?: string };

/**
 * `reportOf`, the session's own when a read of its transcript throws — its lines do not decode (`lines.ts`), or it was found and
 * not read (`TranscriptUnread`): a statement or usage the transcript holds and the runtime cannot read is no absence, so the session
 * is unread while it runs and read as failed once it has ended (`unreadableOf`), and every other session is read. A session listed
 * with a process carries its bridge too (`claudeBridge`), a link or why there is none, which fails nothing.
 */
const reportedOf = (x: Reading, name: string, l: Listed): Effect.Effect<Reported, RunnerError> =>
  Effect.tryPromise({
    try: async (): Promise<Reported> => {
      const look = lookOf(x, name, l);
      const { pid, sessionId } = l.sighting;
      const [read, bridge] = await Promise.all([
        reportOf(x, look).then(
          (sighting): Reported => ({ name, sighting }),
          (cause: unknown) => unreadableOf(x, look, cause),
        ),
        pid === undefined ? undefined : x.bridgeOf(pid, sessionId),
      ]);
      return read.sighting && bridge ? { ...read, sighting: { ...read.sighting, bridge } } : read;
    },
    catch: (cause) =>
      new RunnerError({
        verb: 'observe',
        message: `claude --bg: \`${name}\` cannot be read: ${cause instanceof Error ? cause.message : String(cause)}`,
      }),
  });

/**
 * A session whose transcript cannot be read, for `cause`: once it has ended (`endedOf`), its row's sighting read as `failed`, its
 * process and bridge kept for `release` and nothing it said, consumed or was quiet for; before, unread. Either way with why, said
 * in words naming the session, the cause — which names the transcript — and how it is read.
 */
const unreadableOf = async (x: Reading, l: Look, cause: unknown): Promise<Reported> => {
  const ended = await endedOf(x, l);
  const why = cause instanceof Error ? cause.message : String(cause);
  const warning =
    `claude --bg: \`${l.name}\`'s transcript cannot be read: ${why.replace(/\.?\s*$/, '.')} ` +
    (ended
      ? 'It has ended, so it reads as failed'
      : 'It is unread until it has ended — listed finished, or working and idle, its transcript unwritten for the quiet floor —' +
        ' and reads as failed then') +
    `; the other background sessions are read. Once its task has settled, \`ae forget\` lets this session go.`;
  return ended ? { name: l.name, sighting: { ...l.sighting, state: 'failed' }, warning } : { name: l.name, warning };
};

/**
 * Whether a listed session has ended, by this harness's own definition of finished: listed final (`FINAL`), or `working` and not
 * busy, with its transcript unwritten for the floor (`quietFor`) — or, listed final, with no transcript time at all. A busy or
 * blocked session has not.
 */
const endedOf = async (x: Reading, l: Look): Promise<boolean> => {
  const { state, busy } = l.sighting;
  const final = FINAL.has(state);
  if (!final && !(state === 'working' && !busy)) return false;
  const quiet = await l.quietFor();
  return quiet === undefined ? final : quiet >= x.quiescentAfterMs;
};

/**
 * One listed session's look (`Look`): its attempt, and its transcript's mtime and quiet asked of the world once a pass at most and
 * only when needed. Quiet is counted from the transcript's last write or the session's own start, whichever is later, and bounded by
 * the monotonic time since that write was first seen (`quiet.ts`); a session with no transcript time has none.
 */
const lookOf = (x: Reading, name: string, l: Listed): Look => {
  const { sighting, startedAt } = l;
  const countFrom = l.countFrom ?? startedAt;
  let written: Promise<number | undefined> | undefined;
  const writtenAt = () => (written ??= x.transcriptTime(sighting.sessionId));
  let read: Begun<{ file: string; text: string } | undefined> | undefined;
  const transcript = () => (read ??= begunNow(x.now, () => readSessionTranscript(sighting.sessionId)));
  const quietFor = async () => {
    const lastWrite = await writtenAt();
    if (lastWrite === undefined) return undefined;
    const aged = x.now() - Math.max(lastWrite, startedAt ?? lastWrite);
    const mono = x.mono();
    const sighted = sightingOf(quietFileOf(x.root, name), lastWrite, mono);
    return sighted && mono ? Math.min(aged, mono.ms - sighted.ms) : aged;
  };
  const attempt = attemptOf(name, sighting, startedAt, countFrom);
  return { name, sighting, startedAt, countFrom, attempt, writtenAt, transcript, quietFor };
};

/**
 * One listed session as `observe` reports it, by this harness's own definition of finished. The clock is the transcript's
 * mtime, asked once a pass at most and only when needed, and the sighting of it on disk (`quiet.ts`), never a time this process
 * remembers: a driver that ticks once per process and exits gets the answer a long-lived one does. Quiet is counted from the
 * transcript's last write or the session's own start, whichever is later — a session resumed over a transcript cold for an hour
 * has been quiet only since it began — and bounded by the monotonic time since that write was first seen (`QUIESCENT_AFTER_MS`);
 * a session with no transcript is never quiet: the deadline is for sessions nobody reads.
 *
 * A busy session is `busyReportOf`'s. Any other session reports what it said (`toldOf`), and what it consumed since `countFrom` —
 * its own start, or a long-lived attempt's as the journal gave it — as measured or not at all. A resumed session carries its
 * parent's statements too: whose a statement is, is this runner's call by its id where the spawn recorded the parent's last
 * call, and the engine's by its time where it did not, since only the journal knows when the attempt began. One still
 * `working` and quiet for the floor reports `quietMs` too, statement or not, because an inherited statement the runner could
 * not tell is discarded upstream; what quiet means is `decide`'s.
 */
const reportOf = async (x: Reading, l: Look): Promise<Sighting> => {
  const { sighting } = l;
  if (sighting.busy) return busyReportOf(x, l);
  const told = toldOf(x, l.name, await x.kept.statementOf(l));
  const used = await x.kept.usageOf(l);
  const reported: Sighting = {
    ...sighting,
    ...(told ? { closeout: told } : {}),
    ...(used ? { usage: used } : {}),
  };
  if (reported.state !== 'working') return reported;
  const quiet = await l.quietFor();
  return quiet !== undefined && quiet >= x.quiescentAfterMs ? { ...reported, quietMs: quiet } : reported;
};

/**
 * What `observe` reports of the statement `said` by the session under `name`, by whose it is (`whoseCall`, against the record its
 * spawn left): nothing when it is its parent's, what it said alone when it is its own, and what it said with when when its id
 * cannot tell, for the engine to judge by the attempt's start.
 */
const toldOf = (x: Reading, name: string, said: Statement | undefined): { payload: unknown; at?: number } | undefined => {
  if (!said) return undefined;
  const whose = whoseCall(said.id, parentOf(parentFileOf(x.root, name)));
  if (whose === 'inherited') return undefined;
  return whose === 'own' ? { payload: said.payload } : { payload: said.payload, at: said.at };
};

/**
 * A busy session reports nothing it said and nothing quiet: a long tool call writes nothing for minutes. Unless the last word in
 * its conversation is its own closeout, and nothing has followed it for the floor: then the work is over and something else holds
 * its process — a background shell it left running — and its closeout, its usage and its `quietMs` are reported. Both halves are
 * needed: a session in a long turn has said nothing since its last tool call, and one whose closeout is its parent's has said
 * nothing of its own. Its own is the one `toldOf` tells by its id, whatever its time, and else one made from its own start on.
 * Both reads are kept (`Kept`) while the transcript stays as they found it, as every look's are.
 */
const busyReportOf = async (x: Reading, l: Look): Promise<Sighting> => {
  const { name, sighting, startedAt } = l;
  const quiet = sighting.state === 'working' ? await l.quietFor() : undefined;
  if (quiet === undefined || quiet < x.quiescentAfterMs || startedAt === undefined) return sighting;
  const said = await x.kept.statementOf(l);
  const told = said?.lastWord ? toldOf(x, name, said) : undefined;
  if (!told || (told.at !== undefined && told.at < startedAt)) return sighting;
  const used = await x.kept.usageOf(l);
  return { ...sighting, closeout: told, ...(used ? { usage: used } : {}), quietMs: quiet };
};

/**
 * The session running under a name, from its registration under `sessionsDir` (`claudeRegistered`) rather than `claude agents`,
 * which costs a process and a read of every row. Which session it is, never its state. A live registration names the same
 * session, under the same name, as `claude agents` lists for its pid.
 */
const findIn =
  (sessionsDir: string): NonNullable<RunnerOps['find']> =>
  (name) =>
    Effect.tryPromise({
      try: async () => {
        const found = await claudeRegistered(sessionsDir, name);
        return found && { sessionId: found.sessionId };
      },
      catch: (cause) =>
        new RunnerError({ verb: 'find', message: `claude --bg: ${cause instanceof Error ? cause.message : String(cause)}` }),
    });

/** `claude stop`, with the short id it takes (`short`). */
const stopSession: RunnerOps['stop'] = (sessionId) => sh('claude', ['stop', short(sessionId)], { verb: 'stop' }).pipe(Effect.asVoid);

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
 * 3. What the session consumed (`usageFrom`), read again once it is stopped, before `rm`: Claude Code writes a session's
 *    cost into its transcript only as the process exits, and `claude stop` returns once it has, so the end on
 *    the record was read with no cost in it. Read before `rm`, because an `rm` that fails leaves the session
 *    listed, and the next pass's sighting carries the same read.
 * 4. `claude rm`, only when the task asked for no worktree: `claude rm` deletes "a background session and
 *    its worktree", and the task's work is in that worktree.
 *
 * Resolves with what was read in step 3, or nothing when it stopped nothing.
 */
const releaseFrom =
  (
    { listed, pids, starts, countsFrom }: Registry,
    usageFrom: (sessionId: string, since: number) => Promise<Usage | undefined>,
  ): NonNullable<RunnerOps['release']> =>
  (session, task) =>
    Effect.gen(function* () {
      const running = listed.get(session.sessionId) ?? session.state;
      const alive = running === 'working' || running === 'input-required' || running === 'auth-required' || pids.has(session.sessionId);
      if (alive) {
        yield* sh('claude', ['stop', short(session.sessionId)], { verb: 'release' }).pipe(
          Effect.catchTag('RunnerError', () => Effect.succeed('')),
        );
      }
      const since = countsFrom.get(session.sessionId) ?? starts.get(session.sessionId);
      const measured =
        alive && since !== undefined ? yield* Effect.promise(() => usageFrom(session.sessionId, since).catch(() => undefined)) : undefined;
      if (!task.worktree) yield* sh('claude', ['rm', short(session.sessionId)], { verb: 'release' });
      return measured;
    });

/**
 * The stored transcript as typed messages, through the Agent SDK's `getSessionMessages`, which reads sessions it
 * never started, the `claude --bg` ones included.
 */
const sessionLogs: RunnerOps['logs'] = (sessionId) =>
  Effect.tryPromise({
    try: () => getSessionMessages(sessionId),
    catch: (cause) => new RunnerError({ verb: 'logs', message: String(cause) }),
  }).pipe(Effect.map(renderTranscript));

/**
 * Read from the raw JSONL (`readTranscript`) rather than through `getSessionMessages`, as the closeout is: the SDK's
 * messages carry no timestamp, and a board needs to know when each thing was said.
 */
const sessionTranscript: NonNullable<RunnerOps['transcript']> = (sessionId, after) =>
  Effect.tryPromise({
    try: () => readTranscript(transcriptFile(sessionId), after, claudeTranscriptEvents),
    catch: (cause) => new RunnerError({ verb: 'transcript', message: cause instanceof Error ? cause.message : String(cause) }),
  });

/**
 * A person's words, posted verbatim to the session's own inbox socket — the one Claude Code documents for a
 * script to post into a session, and the one another session's `SendMessage` reaches. The inbox is found by the session's
 * process (`pids`) under `sessionsDir`. No token: on macOS
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
const sayThrough =
  (sessionsDir: string, pids: Registry['pids']): NonNullable<RunnerOps['say']> =>
  (session, text) =>
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
      catch: (cause) => new RunnerError({ verb: 'say', message: `claude --bg: ${cause instanceof Error ? cause.message : String(cause)}` }),
    });

/** A session's short id, as `claude stop` and `claude rm` take it: the uuid's first block. */
const short = (sessionId: string) => sessionId.split('-')[0];

/** Whether `err`, what `execFile` failed with, is the OS refusing to create the process for a reason that stays. */
const refusedSpawn = (err: Error) => (err as NodeJS.ErrnoException).syscall?.startsWith('spawn') === true && refusedOsError(err);

/**
 * `cmd` run with `args`, answering its stdout, or a `RunnerError` for `verb` with its stderr. Refused (`refused`) only
 * when the OS never created the process for a reason that stays — no binary, no cwd (`refusedOsError`) — so nothing ran,
 * nothing started and nothing will by waiting: one it could not create for a short-lived reason is left to the grace window,
 * and any other failure ran the command, and whether it registered a session first is not something its exit code says.
 * Interrupted, it kills the child.
 */
const sh = (cmd: string, args: string[], o: { cwd?: string; verb: string }) =>
  Effect.callback<string, RunnerError>((resume) => {
    countSpawn();
    const child = execFile(
      cmd,
      args,
      { cwd: o.cwd, env: withoutTelemetry(process.env), maxBuffer: 8 * 1024 * 1024 },
      (err, stdout, stderr) => {
        resume(
          err
            ? Effect.fail(
                new RunnerError({
                  verb: o.verb,
                  message: `${cmd} ${args[0]}: ${stderr || err.message}`.trim(),
                  ...(refusedSpawn(err) ? { refused: true } : {}),
                }),
              )
            : Effect.succeed(stdout),
        );
      },
    );
    return Effect.sync(() => child.kill());
  });
